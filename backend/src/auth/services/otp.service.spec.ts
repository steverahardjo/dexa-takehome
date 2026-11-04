import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { OtpVerification } from '../entities/otp-verification.entity.js';
import { OtpService } from './otp.service.js';

/**
 * Minimal in-memory stand-in for the TypeORM repository. It implements exactly
 * the calls OtpService makes, which keeps the security logic under test without
 * needing a database.
 */
class FakeOtpRepository {
  rows: OtpVerification[] = [];
  private sequence = 0;

  create(input: Partial<OtpVerification>): OtpVerification {
    return { attempts: 0, consumedAt: null, ...input } as OtpVerification;
  }

  async save(record: OtpVerification): Promise<OtpVerification> {
    if (!record.id) {
      record.id = `otp-${++this.sequence}`;
      record.createdAt = new Date(Date.now() + this.sequence);
      this.rows.push(record);
      return record;
    }

    const index = this.rows.findIndex((row) => row.id === record.id);
    this.rows[index] = record;
    return record;
  }

  async update(
    criteria: { id: string; consumedAt?: unknown },
    partial: Partial<OtpVerification>,
  ): Promise<{ affected: number }> {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === criteria.id &&
        (criteria.consumedAt === undefined ? true : candidate.consumedAt === null),
    );
    if (!row) return { affected: 0 };
    Object.assign(row, partial);
    return { affected: 1 };
  }

  async findOne(options: {
    where: { identityId: string; consumedAt?: unknown };
    order?: { createdAt?: 'ASC' | 'DESC' };
  }): Promise<OtpVerification | null> {
    const onlyOutstanding = options.where.consumedAt !== undefined;
    const matches = this.rows
      .filter((row) => row.identityId === options.where.identityId)
      .filter((row) => (onlyOutstanding ? row.consumedAt === null : true))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return matches[0] ?? null;
  }

  createQueryBuilder() {
    const state: { identityId?: string; update?: Partial<OtpVerification> } = {};
    const builder = {
      update: () => builder,
      set: (values: Partial<OtpVerification>) => {
        state.update = values;
        return builder;
      },
      where: (_sql: string, parameters: { identityId: string }) => {
        state.identityId = parameters.identityId;
        return builder;
      },
      andWhere: () => builder,
      execute: async () => {
        const consumedAt = new Date();
        this.rows.forEach((row) => {
          if (row.identityId === state.identityId && row.consumedAt === null) {
            row.consumedAt = consumedAt;
          }
        });
        return { affected: 1 };
      },
    };
    return builder;
  }

  asRepository(): Repository<OtpVerification> {
    return this as unknown as Repository<OtpVerification>;
  }
}

function configService(maxAttempts = 3): ConfigService {
  const values: Record<string, unknown> = {
    'otp.secret': 'unit-test-secret',
    'otp.ttlMinutes': 5,
    'otp.maxAttempts': maxAttempts,
    'otp.length': 6,
  };

  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

function service(maxAttempts = 3): { service: OtpService; repository: FakeOtpRepository } {
  const repository = new FakeOtpRepository();
  return {
    service: new OtpService(repository.asRepository(), configService(maxAttempts)),
    repository,
  };
}

describe('OtpService', () => {
  it('issues a six-digit code and stores only its hash', async () => {
    const { service: otp, repository } = service();
    const issued = await otp.issue('identity-1');

    expect(issued.code).toMatch(/^\d{6}$/);
    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0].otpHash).not.toContain(issued.code);
    expect(repository.rows[0].otpHash).toHaveLength(64);
  });

  it('accepts the correct code exactly once', async () => {
    const { service: otp, repository } = service();
    const { code } = await otp.issue('identity-1');

    await expect(otp.verify('identity-1', code)).resolves.toEqual({ outcome: 'VALID' });
    expect(repository.rows[0].consumedAt).toBeInstanceOf(Date);

    await expect(otp.verify('identity-1', code)).resolves.toEqual({ outcome: 'NOT_FOUND' });
  });

  it('locks the code after too many wrong attempts', async () => {
    const { service: otp } = service(3);
    const { code } = await otp.issue('identity-1');

    await expect(otp.verify('identity-1', '111111')).resolves.toEqual({
      outcome: 'INVALID',
      attemptsRemaining: 2,
    });
    await expect(otp.verify('identity-1', '222222')).resolves.toEqual({
      outcome: 'INVALID',
      attemptsRemaining: 1,
    });
    await expect(otp.verify('identity-1', '333333')).resolves.toEqual({
      outcome: 'LOCKED',
    });

    // Even the correct code is unusable after locking.
    await expect(otp.verify('identity-1', code)).resolves.toEqual({ outcome: 'NOT_FOUND' });
  });

  it('invalidates outstanding codes when a new one is issued', async () => {
    const { service: otp, repository } = service();
    const first = await otp.issue('identity-1');
    const second = await otp.issue('identity-1');

    expect(repository.rows).toHaveLength(2);
    // The old code no longer matches the only outstanding code.
    await expect(otp.verify('identity-1', first.code)).resolves.toEqual({
      outcome: 'INVALID',
      attemptsRemaining: 2,
    });
    await expect(otp.verify('identity-1', second.code)).resolves.toEqual({ outcome: 'VALID' });
  });

  it('reports expiry through the last-issued timestamp and verification', async () => {
    const { service: otp, repository } = service();
    const { code } = await otp.issue('identity-1');
    repository.rows[0].expiresAt = new Date(Date.now() - 1000);

    await expect(otp.verify('identity-1', code)).resolves.toEqual({ outcome: 'EXPIRED' });
    await expect(otp.lastIssuedAt('identity-1')).resolves.toBeInstanceOf(Date);
  });

  it('returns NOT_FOUND when no code was ever issued', async () => {
    const { service: otp } = service();
    await expect(otp.verify('identity-1', '123456')).resolves.toEqual({
      outcome: 'NOT_FOUND',
    });
  });
});
