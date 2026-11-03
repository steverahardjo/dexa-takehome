import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailService } from './email/email.service.js';
import { TokenService } from './token/token.service.js';
import { PasswordService } from './password/password.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, EmailService, TokenService, PasswordService]
})
export class AuthModule {}
