import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../auth/services/jwt.service.js';
import { AUTH_PATTERNS } from '../../../../shared/contracts/auth.contracts.js';
import type { OtpRequestResult } from '../../../../shared/contracts/auth.contracts.js';
import type { AccessTokenResponse } from '../../../auth/services/jwt.service.js';
import { sendRpc } from '../../../../shared/rpc/rpc-call.js';
import { AUTH_CLIENT } from '../clients/tokens.js';
import { RequestOtpDto, VerifyOtpDto } from '../dto/auth.dto.js';

/** Public login. Nothing here reveals whether an address is registered. */
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_CLIENT) private readonly auth: ClientProxy) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(@Body() dto: RequestOtpDto): Promise<OtpRequestResult> {
    return sendRpc<OtpRequestResult>(
      this.auth,
      AUTH_PATTERNS.requestOtp,
      dto,
      'Could not send a one-time code',
    );
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AccessTokenResponse> {
    return sendRpc<AccessTokenResponse>(
      this.auth,
      AUTH_PATTERNS.verifyOtp,
      dto,
      'Could not verify the code',
    );
  }

  /** Echoes the verified claims of the caller's access token. */
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
