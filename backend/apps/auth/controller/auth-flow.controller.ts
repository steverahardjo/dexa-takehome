import { Controller, UsePipes } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  AUTH_PATTERNS,
  type OtpRequestResult,
} from '../../../shared/contracts/auth.contracts.js';
import { rpcValidationPipe } from '../../../shared/rpc/rpc-validation.pipe.js';
import { RequestOtpDto } from '../dto/request-otp.dto.js';
import { VerifyOtpDto } from '../dto/verify-otp.dto.js';
import { AuthFlowService } from '../services/auth-flow.service.js';
import type { AccessTokenResponse } from '../services/jwt.service.js';

/**
 * The public login, reachable only through the gateway.
 *
 * Everything that identifies the caller (which address is registered, whether a
 * code is correct) is answered the same way for every input, so this transport
 * leaks nothing an attacker could use to enumerate accounts.
 */
@Controller()
@UsePipes(rpcValidationPipe)
export class AuthFlowController {
  constructor(private readonly flow: AuthFlowService) {}

  @MessagePattern(AUTH_PATTERNS.requestOtp)
  requestOtp(@Payload() dto: RequestOtpDto): Promise<OtpRequestResult> {
    return this.flow.requestOtp(dto.email);
  }

  @MessagePattern(AUTH_PATTERNS.verifyOtp)
  verifyOtp(@Payload() dto: VerifyOtpDto): Promise<AccessTokenResponse> {
    return this.flow.verifyOtp(dto.email, dto.code);
  }
}
