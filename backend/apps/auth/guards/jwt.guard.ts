import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtLocalService, JwtPayload } from '../services/jwt.service.js';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Validates the access token sent by the client and exposes its claims on the
 * request as `request.user`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtLocalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    // verifyAccessToken throws UnauthorizedException for every failure mode,
    // so nothing else has to be caught or leaked here.
    request.user = await this.jwtService.verifyAccessToken(token);

    return true;
  }

  /**
   * Accepts exactly `Bearer <token>`. A missing header, another scheme or
   * extra segments are rejected instead of being silently stripped.
   */
  private extractBearerToken(header: string | string[] | undefined): string {
    const value = Array.isArray(header) ? header[0] : header;

    if (!value || value.trim() === '') {
      throw new UnauthorizedException('Missing bearer token');
    }

    const [scheme, token, ...rest] = value.trim().split(/\s+/);

    if (scheme.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
      throw new UnauthorizedException(
        'Malformed authorization header, expected "Bearer <token>"',
      );
    }

    return token;
  }
}
