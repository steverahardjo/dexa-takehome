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
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../auth/services/jwt.service.js';
import { AUTH_PATTERNS } from '../../../../shared/contracts/auth.contracts.js';
import type { OtpRequestResult } from '../../../../shared/contracts/auth.contracts.js';
import type { AccessTokenResponse } from '../../../auth/services/jwt.service.js';
import { sendRpc } from '../../../../shared/rpc/rpc-call.js';
import { AUTH_CLIENT } from '../clients/tokens.js';
import { RequestOtpDto, VerifyOtpDto } from '../dto/auth.dto.js';
import { OPENAPI_SECURITY } from '../docs/openapi.js';
import {
  AccessTokenResponseModel,
  JwtClaimsModel,
  OtpRequestResultModel,
} from '../docs/models.js';

/** Public login. Nothing here reveals whether an address is registered. */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_CLIENT) private readonly auth: ClientProxy) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Mail a one-time code',
    description:
      'Always answers the same message, whether or not the address is registered. In development the code is written to the auth service log.',
  })
  @ApiAcceptedResponse({
    type: OtpRequestResultModel,
    description: 'The request was accepted. Check the mailbox.',
  })
  @ApiBadRequestResponse({ description: 'The address is not a valid email' })
  @ApiResponse({
    status: 429,
    description: 'Too many codes were requested for this address',
  })
  @ApiResponse({
    status: 503,
    description: 'The mail service could not be reached',
  })
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
  @ApiOperation({
    summary: 'Exchange a one-time code for an access token',
    description:
      'A wrong, expired, reused or unknown code is always the same 401 — the endpoint does not say which of those it was.',
  })
  @ApiOkResponse({
    type: AccessTokenResponseModel,
    description: 'A short-lived access token',
  })
  @ApiBadRequestResponse({ description: 'The code is not 6 digits' })
  @ApiUnauthorizedResponse({ description: 'The code is wrong or has expired' })
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
  @ApiBearerAuth(OPENAPI_SECURITY)
  @ApiOperation({
    summary: "The caller's own claims",
    description:
      'Useful for a client that only stored the token and wants the role and employee id without decoding it. `employeeId` is `null` until HR links the account to an employee.',
  })
  @ApiOkResponse({
    type: JwtClaimsModel,
    description: "The caller's verified claims",
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired or malformed token',
  })
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
