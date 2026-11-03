import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Employee } from '../employee/entities/employee.entity.js';
import { AuthController } from './auth.controller.js';
import { OtpVerification } from './entities/otp-verification.entity.js';
import { SecurityModule } from './security/security.module.js';
import { AuthService } from './services/auth.service.js';
import { EmailService } from './services/email.service.js';
import { OtpService } from './services/otp.service.js';
import { TokenService } from './services/token.service.js';

/** Everything the auth-facing container serves. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, OtpVerification]),
    SecurityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, OtpService, TokenService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
