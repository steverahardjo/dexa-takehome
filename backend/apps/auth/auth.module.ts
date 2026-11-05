import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { serviceDatabase } from '../../shared/database/database-options.js';
import { AUTH_DATA_SOURCE } from '../../shared/database/data-sources.js';
import { AuthFlowController } from './controller/auth-flow.controller.js';
import { IdentityController } from './controller/identity.controller.js';
import { Identity } from './entity/identity.entity.js';
import { OtpVerification } from './entity/otp.entity.js';
import { AuthFlowService } from './services/auth-flow.service.js';
import { EmailService } from './services/email.service.js';
import { IdentityService } from './services/identity.service.js';
import { JwtLocalService } from './services/jwt.service.js';
import { OtpService } from './services/otp.service.js';

/**
 * Auth microservice (TCP only). Owns identities, one-time codes and token
 * signing; the gateway is the only thing that speaks HTTP to it.
 *
 * Environment:
 *   AUTH_DATABASE_URL       MySQL name for this service (see DB_* in shared/)
 *   AUTH_TCP_HOST/PORT      internal transport, default 127.0.0.1:4002
 *   JWT_ACCESS_SECRET       signing secret (required)
 *   JWT_ACCESS_TTL_SECONDS  access token lifetime, default 900
 *   OTP_HASH_SECRET         HMAC key for stored codes (required)
 *   OTP_EXPIRY_SECONDS      code lifetime, default 300
 *   EMAIL_PROVIDER          email delivery provider, default "log"
 *   DB_SYNCHRONIZE          "false" to disable schema sync, default true
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync(
      serviceDatabase(AUTH_DATA_SOURCE, [Identity, OtpVerification]),
    ),
    TypeOrmModule.forFeature([Identity, OtpVerification], AUTH_DATA_SOURCE),
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
  controllers: [AuthFlowController, IdentityController],
  providers: [
    JwtLocalService,
    OtpService,
    EmailService,
    IdentityService,
    AuthFlowService,
  ],
  exports: [JwtLocalService],
})
export class AuthModule {}
