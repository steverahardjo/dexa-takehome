import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './controllers/auth.controller.js';
import { Identity } from './entities/identity.entity.js';
import { OtpVerification } from './entities/otp-verification.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AuthService } from './services/auth.service.js';
import { ConsoleEmailService } from './services/console-email.service.js';
import { EmailService } from './services/email.service.js';
import { OtpService } from './services/otp.service.js';
import { ResendEmailService } from './services/resend-email.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Identity, OtpVerification, RefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<number>('jwt.accessTtlSeconds', 900),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    {
      provide: EmailService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailService => {
        const apiKey = config.get<string>('resend.apiKey', '');
        const from = config.get<string>('resend.fromEmail', 'Absences <onboarding@resend.dev>');
        return apiKey ? new ResendEmailService(apiKey, from) : new ConsoleEmailService();
      },
    },
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
