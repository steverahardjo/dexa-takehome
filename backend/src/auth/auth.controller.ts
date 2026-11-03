import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { TokenUser } from './guards/jwt-auth.guard.js';
import { ChooseViewDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto.js';
import {
  AuthService,
  type OtpRequested,
  type OtpVerified,
  type RoleChoice,
  type SignedInUser,
} from './services/auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Checks the address and mails it a code. */
  @Post('otp')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto): Promise<OtpRequested> {
    return this.authService.requestOtp(dto.email);
  }

  /**
   * Checks the code. Returns the access token, or — for an account that can be an
   * admin — `needsChoice` with a choice token and the two options to show.
   */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<OtpVerified | RoleChoice> {
    return this.authService.verifyOtp(dto.email, dto.code);
  }

  /** The intermediate step: spend the choice token for the picked view. */
  @Post('choice')
  @HttpCode(HttpStatus.OK)
  choose(
    @Body() dto: ChooseViewDto,
    @Headers('authorization') authorization?: string,
  ): Promise<OtpVerified> {
    return this.authService.choose(authorization, dto.view);
  }

  /** Who the bearer token belongs to. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: TokenUser): Promise<SignedInUser> {
    return this.authService.me(user);
  }
}
