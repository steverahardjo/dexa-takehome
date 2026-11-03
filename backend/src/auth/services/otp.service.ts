import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'node:crypto';

import { env } from '../../config/env.js';
import { OtpVerification } from '../entities/otp-verification.entity.js';

/** Digits in a generated code. */
export const OTP_LENGTH = 6;

/** How long a code stays usable. */
export const OTP_TTL_MINUTES = env.int('OTP_TTL_MINUTES', 10);

/** Wrong codes a single OTP accepts before it is burned. */
export const OTP_MAX_ATTEMPTS = env.int('OTP_MAX_ATTEMPTS', 5);

/** Seconds a user must wait between two codes. */
export const OTP_RESEND_COOLDOWN_SECONDS = env.int(
  'OTP_RESEND_COOLDOWN_SECONDS',
  60,
);

const OTP_SALT_ROUNDS = 10;

export interface IssuedOtp {
  /** The plain code, only ever present in memory and in the outgoing mail. */
  code: string;
  expiresAt: Date;
  ttlMinutes: number;
}

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OtpVerification)
    private readonly otpRepository: Repository<OtpVerification>,
  ) {}

  /**
   * Creates a fresh code for `employeeId` and expires every code still pending
   * for it, so only the newest one is ever accepted.
   */
  async create(employeeId: string): Promise<IssuedOtp> {
    await this.invalidatePending(employeeId);

    const ttlMinutes = OTP_TTL_MINUTES;
    const code = this.generate();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.otpRepository.insert({
      employeeId,
      otpHash: await hash(code, OTP_SALT_ROUNDS),
      expiresAt,
      attempts: 0,
      verifiedAt: null,
    });

    return { code, expiresAt, ttlMinutes };
  }

  /** Seconds left before `employeeId` may request another code; 0 when it may. */
  async cooldownRemaining(employeeId: string): Promise<number> {
    const last = await this.otpRepository.findOne({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });

    if (!last) return 0;

    const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;

    return Math.max(0, Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed));
  }

  /**
   * Checks `code` against the newest pending code of `employeeId`, burns an
   * attempt on a mismatch and marks the code used on a match.
   */
  async verify(employeeId: string, code: string): Promise<void> {
    const otp = await this.otpRepository.findOne({
      where: { employeeId, verifiedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (!otp || otp.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw this.tooManyAttempts();
    }

    if (!(await compare(code, otp.otpHash))) {
      await this.otpRepository.increment({ id: otp.id }, 'attempts', 1);

      const remaining = OTP_MAX_ATTEMPTS - otp.attempts - 1;

      if (remaining <= 0) {
        throw this.tooManyAttempts();
      }

      throw new UnauthorizedException(
        `Invalid verification code, ${remaining} attempt(s) left`,
      );
    }

    await this.otpRepository.update({ id: otp.id }, { verifiedAt: new Date() });
  }

  /** Expires the pending codes of `employeeId` by moving their expiry backwards. */
  private async invalidatePending(employeeId: string): Promise<void> {
    await this.otpRepository.update(
      { employeeId, verifiedAt: IsNull() },
      { expiresAt: new Date(0) },
    );
  }

  /** A uniformly random numeric code, zero padded to `OTP_LENGTH`. */
  private generate(): string {
    const code = randomInt(0, 10 ** OTP_LENGTH).toString();

    return code.padStart(OTP_LENGTH, '0');
  }

  private tooManyAttempts(): HttpException {
    return new HttpException(
      'Too many verification attempts, request a new code',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
