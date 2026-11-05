import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { AUTH_DATA_SOURCE } from '../../../shared/database/data-sources.js';
import { RPC_ERRORS } from '../../../shared/rpc/errors.js';
import { EmailService } from './email.service.js';
import { OtpVerification } from '../entity/otp.entity.js';

const MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;
const DEFAULT_EXPIRY_SECONDS = 300;

@Injectable()
export class OtpService {
  private readonly expirySeconds: number;
  private readonly secret: string;

  constructor(
    @InjectRepository(OtpVerification, AUTH_DATA_SOURCE)
    private readonly otpRepository: Repository<OtpVerification>,
    private readonly emailService: EmailService,
    config: ConfigService,
  ) {
    this.expirySeconds = Number(
      config.get('OTP_EXPIRY_SECONDS', DEFAULT_EXPIRY_SECONDS),
    );

    if (!Number.isInteger(this.expirySeconds) || this.expirySeconds <= 0) {
      throw new Error('OTP_EXPIRY_SECONDS must be a positive integer');
    }

    // Codes are stored as HMACs, so a leaked table cannot be replayed.
    this.secret = config.getOrThrow<string>('OTP_HASH_SECRET');
  }

  /** Issues a new code and delivers it, invalidating every previous one. */
  async generate(identityId: string, email: string): Promise<void> {
    await this.otpRepository.update(
      { identityId, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const code = randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH).toString();

    const otp = this.otpRepository.create({
      identityId,
      otpHash: this.hashOtp(identityId, code),
      expiresAt: new Date(Date.now() + this.expirySeconds * 1000),
      attempts: 0,
      consumedAt: null,
    });

    const saved = await this.otpRepository.save(otp);

    try {
      await this.emailService.sendOtp(email, code, this.expirySeconds);
    } catch (error) {
      // Never leave behind a code the user did not receive.
      await this.otpRepository.delete(saved.id);
      throw error;
    }
  }

  /**
   * Consumes a code. Throws on any failure, so a caller that returns normally
   * knows the code was valid exactly once.
   */
  async verify(identityId: string, code: string): Promise<void> {
    const otp = await this.otpRepository.findOne({
      where: {
        identityId,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      throw this.rejected('OTP is invalid or expired');
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new RpcException({
        code: RPC_ERRORS.rateLimited,
        message: 'Too many incorrect OTP attempts',
      });
    }

    if (!this.matches(otp.otpHash, this.hashOtp(identityId, code))) {
      await this.otpRepository.increment({ id: otp.id }, 'attempts', 1);
      throw this.rejected('Incorrect OTP');
    }

    // Atomically consume the code so two concurrent requests cannot both win.
    const result = await this.otpRepository
      .createQueryBuilder()
      .update(OtpVerification)
      .set({ consumedAt: new Date() })
      .where('id = :id', { id: otp.id })
      .andWhere('consumed_at IS NULL')
      .andWhere('expires_at > :now', { now: new Date() })
      .andWhere('attempts < :maxAttempts', { maxAttempts: MAX_ATTEMPTS })
      .execute();

    if (result.affected !== 1) {
      throw this.rejected('OTP is invalid or expired');
    }
  }

  /**
   * Codes are rejected with the same code and message for every failure, so a
   * caller cannot tell "expired" from "wrong" from "already used".
   */
  private rejected(message: string): RpcException {
    return new RpcException({
      code: RPC_ERRORS.invalidArgument,
      message,
    });
  }

  private hashOtp(identityId: string, code: string): string {
    return createHmac('sha256', this.secret)
      .update(`${identityId}:${code}`)
      .digest('hex');
  }

  /** Constant-time comparison of two hex encoded HMACs. */
  private matches(storedHash: string, submittedHash: string): boolean {
    const stored = Buffer.from(storedHash, 'hex');
    const submitted = Buffer.from(submittedHash, 'hex');

    return (
      stored.length === submitted.length && timingSafeEqual(stored, submitted)
    );
  }
}
