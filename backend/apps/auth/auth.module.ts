import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './controller/auth.controller.js';
import { EmailService } from './services/email.service.js';
import { Identity } from './entity/identity.entity.js';
import { AuthGuard } from './guards/jwt.guard.js';
import { JwtLocalService } from './services/jwt.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { OtpVerification } from './entity/otp.entity.js';
import { OtpService } from './services/otp.service.js';

/**
 * Authentication of the auth service.
 *
 * Requires a TypeORM root connection for the Identity/OtpVerification
 * repositories and these environment variables:
 *   JWT_ACCESS_SECRET       signing secret (required)
 *   JWT_ACCESS_TTL_SECONDS  access token lifetime, default 900
 *   OTP_HASH_SECRET         HMAC key for stored codes (required)
 *   OTP_EXPIRY_SECONDS      code lifetime, default 300
 *   EMAIL_PROVIDER          email delivery provider, default "log"
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([Identity, OtpVerification]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtLocalService,
    OtpService,
    EmailService,
    JwtStrategy,
    AuthGuard,
  ],
  exports: [JwtLocalService, AuthGuard, JwtModule],
})
export class AuthModule {}
