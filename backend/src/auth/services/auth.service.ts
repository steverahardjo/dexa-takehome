import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { env } from '../../config/env.js';
import type { Role } from '../../employee/entities/employee.entity.js';
import { Employee } from '../../employee/entities/employee.entity.js';
import { EmailService } from './email.service.js';
import { OtpService, OTP_TTL_MINUTES } from './otp.service.js';
import { TokenService, type AccessToken } from './token.service.js';
import type { TokenUser } from '../guards/jwt-auth.guard.js';

/**
 * Said whether or not the address has an account, so the endpoint can't be used
 * to find out who does.
 */
const OTP_SENT_MESSAGE =
  'If the address belongs to an account, a verification code is on its way.';

/** In non-production the code is also returned, so the demo needs no mail. */
const RETURN_DEV_CODE = env.bool(
  'OTP_DEV_RETURN',
  process.env.NODE_ENV !== 'production',
);

export interface OtpRequested {
  message: string;
  /** Seconds the code stays valid. */
  expiresIn: number;
  /** Present only when `OTP_DEV_RETURN` is on. */
  devCode?: string;
}

export interface SignedInUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface OtpVerified extends AccessToken {
  /** False when the code was enough: no view to pick. */
  needsChoice?: false;
  user: SignedInUser;
}

/** One of the two things an admin may continue as. */
export interface ViewOption {
  view: 'admin' | 'employee';
  label: string;
  role: Role;
}

/**
 * What a verified code returns when the account can be an admin: no session
 * token yet, only the short-lived choice token the two buttons use.
 */
export interface RoleChoice {
  needsChoice: true;
  choiceToken: string;
  expiresIn: number;
  user: SignedInUser;
  options: ViewOption[];
}

/** The role an admin account may act as, and the stricter of the two. */
const ADMIN_ROLE: Role = 'HR Admin';
const EMPLOYEE_ROLE: Role = 'Employee';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Checks the address, creates a code for it and sends it. Unknown addresses
   * get the same answer as a known one, without a code being issued.
   */
  async requestOtp(email: string): Promise<OtpRequested> {
    const employee = await this.findActiveUser(email);

    if (!employee) {
      return { message: OTP_SENT_MESSAGE, expiresIn: OTP_TTL_MINUTES * 60 };
    }

    const cooldown = await this.otpService.cooldownRemaining(employee.id);

    if (cooldown > 0) {
      throw new HttpException(
        `A code was sent moments ago, try again in ${cooldown} second(s)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { code, ttlMinutes } = await this.otpService.create(employee.id);

    await this.emailService.sendOtp({
      to: employee.email,
      name: employee.name,
      code,
      ttlMinutes,
    });

    return {
      message: OTP_SENT_MESSAGE,
      expiresIn: ttlMinutes * 60,
      ...(RETURN_DEV_CODE && { devCode: code }),
    };
  }

  /**
   * Checks the code. A plain employee gets the access token right away; an admin
   * account gets the two options instead, and picks one at `choose()`.
   */
  async verifyOtp(
    email: string,
    code: string,
  ): Promise<OtpVerified | RoleChoice> {
    const employee = await this.findActiveUser(email);

    // Same error for an unknown address and a wrong code: neither confirms the account.
    if (!employee) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    await this.otpService.verify(employee.id, code);

    const user = {
      id: employee.id,
      email: employee.email,
      name: employee.name,
      role: employee.role,
    };

    if (employee.role !== ADMIN_ROLE) {
      return { ...(await this.tokenService.issue(employee)), user };
    }

    return {
      needsChoice: true,
      ...(await this.tokenService.issueChoice(employee)),
      user,
      options: [
        { view: 'admin', label: 'Continue as admin', role: ADMIN_ROLE },
        {
          view: 'employee',
          label: 'Continue as employee',
          role: EMPLOYEE_ROLE,
        },
      ],
    };
  }

  /**
   * The intermediate step: spends the choice token for the view the person picked
   * and returns the session token that view carries.
   */
  async choose(
    authorization: string | undefined,
    view: ViewOption['view'],
  ): Promise<OtpVerified> {
    const employee = await this.choiceEmployee(authorization);

    if (view === 'admin' && employee.role !== ADMIN_ROLE) {
      throw new ForbiddenException('This account cannot act as an admin');
    }

    const role = view === 'admin' ? ADMIN_ROLE : EMPLOYEE_ROLE;

    return {
      ...(await this.tokenService.issue(employee, role)),
      user: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        role,
      },
    };
  }

  /**
   * Who the token belongs to. The role is the one the token carries, so an admin
   * who chose the employee view is reported as an employee here.
   */
  async me(current: TokenUser): Promise<SignedInUser> {
    const employee = await this.employees.findOne({
      where: { id: current.id },
    });

    if (!employee) {
      throw new NotFoundException('No employee for this account');
    }

    return {
      id: employee.id,
      email: employee.email,
      name: employee.name,
      role: current.role,
    };
  }

  /** The account behind a choice token, refusing every other kind of token. */
  private async choiceEmployee(
    authorization: string | undefined,
  ): Promise<Employee> {
    const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];

    if (!token) {
      throw new UnauthorizedException('Missing choice token');
    }

    const claims = await this.jwtService
      .verifyAsync<{ sub?: string; scope?: string }>(token)
      .catch(() => null);

    if (!claims?.sub || claims.scope !== 'choose') {
      throw new UnauthorizedException(
        'This choice token is not valid or has expired',
      );
    }

    const employee = await this.employees.findOne({
      where: { id: claims.sub },
    });

    if (!employee) {
      throw new NotFoundException('No employee for this account');
    }

    return employee;
  }

  /**
   * The employee behind `email`, else null. The address is normalized here as
   * well as in the DTO, so a direct call can't miss a stored one.
   */
  private async findActiveUser(email: string): Promise<Employee | null> {
    return this.employees.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }
}
