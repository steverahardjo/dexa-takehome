import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IdentityStatus } from '../../../shared/enums/roles.enum.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { RequestOtpDto } from '../dto/request-otp.dto.js';
import { VerifyOtpDto } from '../dto/verify-otp.dto.js';
import { Identity } from '../entity/identity.entity.js';
import { AuthGuard } from '../guards/jwt.guard.js';
import { JwtLocalService } from '../services/jwt.service.js';
import type {
  AccessTokenResponse,
  JwtPayload,
} from '../services/jwt.service.js';
import { OtpService } from '../services/otp.service.js';

const OTP_SENT_MESSAGE =
  'If the email belongs to an active account, a one-time code has been sent.';

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AuthController {
  constructor(
    @InjectRepository(Identity)
    private readonly identities: Repository<Identity>,
    private readonly otpService: OtpService,
    private readonly jwtLocalService: JwtLocalService,
  ) {}

  /**
   * Always answers 202 with the same body: whether an address is registered is
   * not something an unauthenticated caller gets to learn.
   */
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ message: string }> {
    const identity = await this.identities.findOne({
      where: { email: dto.email },
    });

    if (identity && identity.status === IdentityStatus.ACTIVE) {
      await this.otpService.generate(identity.id, identity.email);
    }

    return { message: OTP_SENT_MESSAGE };
  }

  /** Exchanges a valid one-time code for a short-lived access token. */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<AccessTokenResponse> {
    const identity = await this.identities.findOne({
      where: { email: dto.email },
    });

    if (!identity || identity.status !== IdentityStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or code');
    }

    await this.otpService.verify(identity.id, dto.code);

    const accessToken = await this.jwtLocalService.generateAccessToken({
      sub: identity.id,
      employeeId: identity.employeeId ?? null,
      email: identity.email,
      role: identity.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtLocalService.accessTokenTtlSeconds,
    };
  }

  /** Echoes the verified claims of the caller's access token. */
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
