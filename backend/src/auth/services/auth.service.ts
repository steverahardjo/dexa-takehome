import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/interfaces/authenticated-user.interface.js';
import { IdentityStatus, Role } from '../../common/enums/roles.enum.js';
import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception.js';
import { Identity } from '../entities/identity.entity.js';
import { EmailService } from './email.service.js';
import { OtpService } from './otp.service.js';
import { TokenService, type TokenPair } from './token.service.js';

export interface OtpRequestResult {
  message: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** Only present in non-production when `OTP_DEV_RETURN=true`. */
  devCode?: string;
}

export interface AuthResult {
  user: {
    identityId: string;
    employeeId: string;
    email: string;
    role: Role;
  };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly requestLog = new Map<string, number[]>();
  private readonly cooldownSeconds: number;
  private readonly maxRequests: number;
  private readonly requestWindowSeconds: number;
  private readonly ttlMinutes: number;
  private readonly devReturn: boolean;
  private readonly isProduction: boolean;

  constructor(
    @InjectRepository(Identity)
    private readonly identityRepository: Repository<Identity>,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    config: ConfigService,
  ) {
    this.cooldownSeconds = config.get<number>('otp.resendCooldownSeconds', 60);
    this.maxRequests = config.get<number>('otp.maxRequestsPerWindow', 5);
    this.requestWindowSeconds = config.get<number>('otp.requestWindowSeconds', 900);
    this.ttlMinutes = config.get<number>('otp.ttlMinutes', 5);
    this.devReturn = config.get<boolean>('otp.devReturn', false);
    this.isProduction = config.get<boolean>('isProduction', false);
  }

  /** Always returns the same shape so callers cannot probe registered emails. */
  private genericResult(devCode?: string): OtpRequestResult {
    return {
      message: 'If that email belongs to an active account, a sign-in code is on its way.',
      expiresInSeconds: this.ttlMinutes * 60,
      resendAfterSeconds: this.cooldownSeconds,
      ...(devCode && !this.isProduction ? { devCode } : {}),
    };
  }

  async requestOtp(email: string, ip?: string): Promise<OtpRequestResult> {
    const normalized = email.trim().toLowerCase();
    this.assertEmailRateLimit(normalized, ip);

    const identity = await this.identityRepository.findOne({ where: { email: normalized } });
    if (!identity || identity.status !== IdentityStatus.ACTIVE) {
      return this.genericResult();
    }

    const lastIssuedAt = await this.otpService.lastIssuedAt(identity.id);
    if (lastIssuedAt && Date.now() - lastIssuedAt.getTime() < this.cooldownSeconds * 1000) {
      return this.genericResult();
    }

    const issued = await this.otpService.issue(identity.id);

    try {
      await this.emailService.sendOtp({
        to: identity.email,
        code: issued.code,
        expiresInMinutes: this.ttlMinutes,
      });
    } catch {
      // A code that never arrived must not remain usable.
      await this.otpService.invalidateOutstanding(identity.id);
      throw new ServiceUnavailableException(
        'The sign-in email could not be sent. Please try again shortly.',
      );
    }

    return this.genericResult(issued.code);
  }

  async verifyOtp(email: string, code: string): Promise<AuthResult> {
    const normalized = email.trim().toLowerCase();
    const identity = await this.identityRepository.findOne({ where: { email: normalized } });

    if (!identity || identity.status !== IdentityStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or code');
    }

    const result = await this.otpService.verify(identity.id, code);

    switch (result.outcome) {
      case 'VALID':
        return this.buildAuthResult(identity);
      case 'INVALID':
        throw new UnauthorizedException(
          `Incorrect code. ${result.attemptsRemaining} attempt(s) remaining.`,
        );
      case 'LOCKED':
        throw new TooManyRequestsException(
          'Too many incorrect attempts. Request a new code.',
        );
      case 'EXPIRED':
      case 'NOT_FOUND':
        throw new UnauthorizedException('That code is invalid or has expired. Request a new one.');
      default: {
        const exhaustive: never = result;
        throw new UnauthorizedException(String(exhaustive));
      }
    }
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { identity, pair } = await this.tokenService.rotate(refreshToken);

    if (identity.status !== IdentityStatus.ACTIVE) {
      await this.tokenService.revokeAllForIdentity(identity.id);
      throw new UnauthorizedException('This account is disabled');
    }

    return {
      user: {
        identityId: identity.id,
        employeeId: identity.employeeId,
        email: identity.email,
        role: identity.role,
      },
      tokens: pair,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revoke(refreshToken);
  }

  /** Resolves the bearer subject against the current database state. */
  async resolvePrincipal(payload: JwtPayload): Promise<AuthenticatedUser> {
    const identity = await this.identityRepository.findOne({ where: { id: payload.sub } });

    if (!identity) {
      throw new UnauthorizedException('Invalid session');
    }
    if (identity.status !== IdentityStatus.ACTIVE) {
      throw new UnauthorizedException('This account is disabled');
    }

    return {
      identityId: identity.id,
      employeeId: identity.employeeId,
      email: identity.email,
      role: identity.role,
    };
  }

  async provisionIdentity(input: {
    employeeId: string;
    email: string;
    role?: Role;
  }): Promise<Identity> {
    const email = input.email.trim().toLowerCase();
    const byEmployee = await this.identityRepository.findOne({
      where: { employeeId: input.employeeId },
    });

    if (byEmployee) {
      if (byEmployee.email !== email) {
        await this.assertEmailAvailable(email, byEmployee.id);
        byEmployee.email = email;
        await this.otpService.invalidateOutstanding(byEmployee.id);
        await this.tokenService.revokeAllForIdentity(byEmployee.id);
        return this.identityRepository.save(byEmployee);
      }
      return byEmployee;
    }

    await this.assertEmailAvailable(email);

    return this.identityRepository.save(
      this.identityRepository.create({
        employeeId: input.employeeId,
        email,
        role: input.role ?? Role.EMPLOYEE,
        status: IdentityStatus.ACTIVE,
      }),
    );
  }

  async setStatus(employeeId: string, status: IdentityStatus): Promise<void> {
    const identity = await this.identityRepository.findOne({ where: { employeeId } });
    if (!identity) return;

    identity.status = status;
    await this.identityRepository.save(identity);

    if (status === IdentityStatus.DISABLED) {
      await this.otpService.invalidateOutstanding(identity.id);
      await this.tokenService.revokeAllForIdentity(identity.id);
    }
  }

  async setRole(employeeId: string, role: Role): Promise<Identity> {
    const identity = await this.identityRepository.findOne({ where: { employeeId } });
    if (!identity) {
      throw new ConflictException('This employee has no login identity');
    }

    identity.role = role;
    await this.identityRepository.save(identity);
    // Force re-authentication so a demoted role cannot ride an old access token.
    await this.tokenService.revokeAllForIdentity(identity.id);
    return identity;
  }

  async getProfile(identityId: string): Promise<Identity> {
    const identity = await this.identityRepository.findOne({ where: { id: identityId } });
    if (!identity) throw new UnauthorizedException('Invalid session');
    return identity;
  }

  private async buildAuthResult(identity: Identity): Promise<AuthResult> {
    const tokens = await this.tokenService.issuePair(identity);
    return {
      user: {
        identityId: identity.id,
        employeeId: identity.employeeId,
        email: identity.email,
        role: identity.role,
      },
      tokens,
    };
  }

  private async assertEmailAvailable(email: string, exceptIdentityId?: string): Promise<void> {
    const existing = await this.identityRepository.findOne({ where: { email } });
    if (existing && existing.id !== exceptIdentityId) {
      throw new ConflictException('An account already exists for that email address');
    }
  }

  /**
   * In-memory per-email guard on top of the IP-based HTTP throttler. Survives
   * only for the process lifetime, which is sufficient for OTP abuse limits.
   */
  private assertEmailRateLimit(email: string, ip?: string): void {
    const keys = [`email:${email}`];
    if (ip) keys.push(`ip:${ip}`);

    const now = Date.now();
    const windowMs = this.requestWindowSeconds * 1000;

    for (const key of keys) {
      const timestamps = (this.requestLog.get(key) ?? []).filter((at) => now - at < windowMs);
      if (timestamps.length >= this.maxRequests) {
        throw new TooManyRequestsException(
          'Too many sign-in code requests. Please wait before trying again.',
        );
      }
      timestamps.push(now);
      this.requestLog.set(key, timestamps);
    }

    if (this.requestLog.size > 10_000) {
      for (const [key, timestamps] of this.requestLog) {
        if (timestamps.every((at) => now - at >= windowMs)) this.requestLog.delete(key);
      }
    }
  }
}
