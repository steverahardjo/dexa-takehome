import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OtpVerification } from '../entities/otp-verification.entity.js';
import { randomInt, createHmac, timingSafeEqual } from 'node:crypto';

export type OtpVerificationResult =
  | { outcome: 'VALID' }
  | { outcome: 'INVALID'; attemptsRemaining: number }
  | { outcome: 'LOCKED' }
  | { outcome: 'EXPIRED' }
  | { outcome: 'NOT_FOUND' };

/**
 * Issues and validates one-time codes.
 *
 * Only an HMAC of the code is persisted (keyed with `OTP_SECRET`). Codes are
 * single-use, expire after `OTP_TTL_MINUTES`, and are locked after
 * `OTP_MAX_ATTEMPTS` wrong submissions. The plaintext code never touches a log.
 */
@Injectable()
export class OtpService {
  private readonly secret: string;
  private readonly ttlMinutes: number;
  private readonly maxAttempts: number;
  private readonly length: number;

  constructor(
    @InjectRepository(OtpVerification)
    private readonly otpRepository: Repository<OtpVerification>,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('otp.secret', 'dev-only-otp-secret');
    this.ttlMinutes = config.get<number>('otp.ttlMinutes', 5);
    this.maxAttempts = config.get<number>('otp.maxAttempts', 5);
    this.length = config.get<number>('otp.length', 6);
  }

  generateCode(): string {
    const ceiling = 10 ** this.length;
    return randomInt(0, ceiling).toString().padStart(this.length, '0');
  }

  hashCode(identityId: string, code: string): string {
    return createHmac('sha256', this.secret)
      .update(`${identityId}:${code}`)
      .digest('hex');
  }

  async invalidateOutstanding(identityId: string): Promise<void> {
    await this.otpRepository
      .createQueryBuilder()
      .update(OtpVerification)
      .set({ consumedAt: () => 'now()' })
      .where('identity_id = :identityId', { identityId })
      .andWhere('consumed_at IS NULL')
      .execute();
  }

  /** Creates a fresh code and returns the plaintext exactly once. */
  async issue(
    identityId: string,
  ): Promise<{ code: string; expiresAt: Date; expiresInSeconds: number }> {
    await this.invalidateOutstanding(identityId);

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);

    await this.otpRepository.save(
      this.otpRepository.create({
        identityId,
        otpHash: this.hashCode(identityId, code),
        expiresAt,
        attempts: 0,
        consumedAt: null,
      }),
    );

    return { code, expiresAt, expiresInSeconds: this.ttlMinutes * 60 };
  }

  async lastIssuedAt(identityId: string): Promise<Date | null> {
    const latest = await this.otpRepository.findOne({
      where: { identityId },
      order: { createdAt: 'DESC' },
    });
    return latest?.createdAt ?? null;
  }

  async latestOutstanding(identityId: string): Promise<OtpVerification | null> {
    return this.otpRepository.findOne({
      where: { identityId, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async verify(identityId: string, code: string): Promise<OtpVerificationResult> {
    const record = await this.latestOutstanding(identityId);

    if (!record) return { outcome: 'NOT_FOUND' };
    if (record.consumedAt) return { outcome: 'LOCKED' };
    if (record.expiresAt.getTime() <= Date.now()) return { outcome: 'EXPIRED' };
    if (record.attempts >= this.maxAttempts) {
      await this.consume(record);
      return { outcome: 'LOCKED' };
    }

    const expected = Buffer.from(record.otpHash, 'hex');
    const received = Buffer.from(this.hashCode(identityId, code), 'hex');
    const matches =
      expected.length === received.length && timingSafeEqual(expected, received);

    if (!matches) {
      record.attempts += 1;
      if (record.attempts >= this.maxAttempts) {
        record.consumedAt = new Date();
        await this.otpRepository.save(record);
        return { outcome: 'LOCKED' };
      }
      await this.otpRepository.save(record);
      return { outcome: 'INVALID', attemptsRemaining: this.maxAttempts - record.attempts };
    }

    const claimed = await this.consume(record);
    return claimed ? { outcome: 'VALID' } : { outcome: 'LOCKED' };
  }

  /**
   * Atomic single-use claim: only the request that flips `consumed_at` from
   * NULL may proceed. Concurrent verifications therefore cannot both succeed.
   */
  private async consume(record: OtpVerification): Promise<boolean> {
    const result = await this.otpRepository.update(
      { id: record.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }
}
