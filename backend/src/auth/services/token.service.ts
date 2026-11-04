import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import type { JwtPayload } from '../../common/interfaces/authenticated-user.interface.js';
import { Identity } from '../entities/identity.entity.js';
import { RefreshToken } from '../entities/refresh-token.entity.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
}

/** SHA-256 is enough for 64-byte random refresh tokens (no brute-force risk). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TokenService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepository: Repository<RefreshToken>,
    config: ConfigService,
  ) {
    this.accessTtlSeconds = config.get<number>('jwt.accessTtlSeconds', 900);
    this.refreshTtlDays = config.get<number>('jwt.refreshTtlDays', 30);
  }

  async issuePair(identity: Identity): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: identity.id,
      employeeId: identity.employeeId,
      email: identity.email,
      role: identity.role,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.accessTtlSeconds,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresIn = this.refreshTtlDays * 24 * 60 * 60;

    await this.refreshRepository.save(
      this.refreshRepository.create({
        identityId: identity.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
        revokedAt: null,
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
      refreshExpiresIn,
    };
  }

  /**
   * Rotates a refresh token. Reuse of an already-revoked token revokes the whole
   * family, which limits the blast radius of a stolen token.
   */
  async rotate(refreshToken: string): Promise<{ identity: Identity; pair: TokenPair }> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.refreshRepository.findOne({ where: { tokenHash } });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      await this.revokeAllForIdentity(stored.identityId);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const claimed = await this.refreshRepository.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    if (!claimed.affected) {
      await this.revokeAllForIdentity(stored.identityId);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    const identity = await this.refreshRepository.manager.findOne(Identity, {
      where: { id: stored.identityId },
    });

    if (!identity) {
      throw new UnauthorizedException('Identity no longer exists');
    }

    return { identity, pair: await this.issuePair(identity) };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.refreshRepository.update(
      { tokenHash: hashToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForIdentity(identityId: string): Promise<void> {
    await this.refreshRepository.update(
      { identityId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
