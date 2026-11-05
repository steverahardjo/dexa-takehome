import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';

import type { OtpRequestResult } from '../../../shared/contracts/auth.contracts.js';
import { AUTH_DATA_SOURCE } from '../../../shared/database/data-sources.js';
import { IdentityStatus } from '../../../shared/enums/roles.enum.js';
import { RPC_ERRORS } from '../../../shared/rpc/errors.js';
import { Identity } from '../entity/identity.entity.js';
import { JwtLocalService } from './jwt.service.js';
import type { AccessTokenResponse } from './jwt.service.js';
import { OtpService } from './otp.service.js';

/** Identical for a known and an unknown address. */
const OTP_SENT_MESSAGE =
  'If the email belongs to an active account, a one-time code has been sent.';

/**
 * The public OTP login, behind the gateway.
 *
 * The service never tells an unauthenticated caller whether an address is
 * registered: requesting a code always answers the same message, and a failed
 * verification always reports the same error.
 */
@Injectable()
export class AuthFlowService {
  constructor(
    @InjectRepository(Identity, AUTH_DATA_SOURCE)
    private readonly identities: Repository<Identity>,
    private readonly otp: OtpService,
    private readonly jwt: JwtLocalService,
  ) {}

  async requestOtp(email: string): Promise<OtpRequestResult> {
    const identity = await this.identities.findOne({ where: { email } });

    if (identity && identity.status === IdentityStatus.ACTIVE) {
      await this.otp.generate(identity.id, identity.email);
    }

    return { message: OTP_SENT_MESSAGE };
  }

  async verifyOtp(email: string, code: string): Promise<AccessTokenResponse> {
    const identity = await this.identities.findOne({ where: { email } });

    if (!identity || identity.status !== IdentityStatus.ACTIVE) {
      throw new RpcException({
        code: RPC_ERRORS.unauthorized,
        message: 'Invalid email or code',
      });
    }

    await this.otp.verify(identity.id, code);

    const accessToken = await this.jwt.generateAccessToken({
      sub: identity.id,
      employeeId: identity.employeeId ?? null,
      email: identity.email,
      role: identity.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwt.accessTokenTtlSeconds,
    };
  }
}
