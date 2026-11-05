import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { Role } from '../../../shared/enums/roles.enum.js';

/** Marks a token as an access token so other token kinds can never be replayed here. */
export const ACCESS_TOKEN_TYPE = 'access' as const;

/** Claim set carried by every short-lived access token. */
export interface JwtPayload {
  /** Identity id (`identities.id`). */
  sub: string;
  employeeId: string | null;
  email: string;
  role: Role;
  type: typeof ACCESS_TOKEN_TYPE;
  /** Issued-at, added by the signer. */
  iat?: number;
  /** Expiry (seconds), added by the signer and enforced on verify. */
  exp?: number;
}

/** Claims the caller has to provide; the token type is added when signing. */
export type JwtClaims = Omit<JwtPayload, 'type'>;

export interface AccessTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const ALGORITHM = 'HS256';
const DEFAULT_TTL_SECONDS = 900;

@Injectable()
export class JwtLocalService {
  private readonly expiresInSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    // The signing secret itself is configured on JwtModule (JWT_ACCESS_SECRET);
    // only the lifetime is part of this service's contract.
    this.expiresInSeconds = Number(
      config.get('JWT_ACCESS_TTL_SECONDS', DEFAULT_TTL_SECONDS),
    );

    if (
      !Number.isInteger(this.expiresInSeconds) ||
      this.expiresInSeconds <= 0
    ) {
      throw new Error('JWT_ACCESS_TTL_SECONDS must be a positive integer');
    }
  }

  /** Token lifetime in seconds, so clients know when to re-authenticate. */
  get accessTokenTtlSeconds(): number {
    return this.expiresInSeconds;
  }

  async generateAccessToken(claims: JwtClaims): Promise<string> {
    return this.jwtService.signAsync(
      { ...claims, type: ACCESS_TOKEN_TYPE },
      {
        algorithm: ALGORITHM,
        expiresIn: this.expiresInSeconds,
      },
    );
  }

  /**
   * Verifies signature, expiry and claim shape. Every failure is reported as
   * 401 so expired, tampered and malformed tokens are indistinguishable.
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: [ALGORITHM],
      });
    } catch (error) {
      const expired =
        error instanceof Error && error.name === 'TokenExpiredError';

      throw new UnauthorizedException(
        expired ? 'Access token expired' : 'Invalid access token',
      );
    }

    return this.assertAccessTokenPayload(payload);
  }

  private assertAccessTokenPayload(
    payload: JwtPayload | undefined,
  ): JwtPayload {
    const valid =
      typeof payload?.sub === 'string' &&
      payload.sub.length > 0 &&
      typeof payload.email === 'string' &&
      (payload.employeeId === null || typeof payload.employeeId === 'string') &&
      Object.values(Role).includes(payload.role) &&
      payload.type === ACCESS_TOKEN_TYPE;

    if (!valid) {
      throw new UnauthorizedException('Invalid access token');
    }

    return payload;
  }
}
