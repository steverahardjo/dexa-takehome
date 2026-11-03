import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { Role } from '../../employee/entities/employee.entity.js';

/** What the token carries and what guards hand to controllers. */
export interface TokenUser {
  id: string;
  email: string;
  role: Role;
}

interface Claims {
  sub: string;
  email?: string;
  role?: Role;
  /** `access` for a session, `choose` for the admin/employee step, `capture` for a QR. */
  scope?: string;
}

/**
 * Requires `Authorization: Bearer <token>` and checks it against the shared
 * secret. The verified claims are attached as `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: TokenUser;
    }>();

    const token = /^Bearer\s+(.+)$/i.exec(
      request.headers.authorization ?? '',
    )?.[1];

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.jwtService
      .verifyAsync<Claims>(token)
      .catch(() => null);

    if (!claims?.sub) {
      throw new UnauthorizedException('This token is invalid or has expired');
    }

    // Tokens minted for the choose step (or a QR capture) are not sessions.
    if (claims.scope && claims.scope !== 'access') {
      throw new UnauthorizedException(
        'This token cannot be used as a session, sign in again',
      );
    }

    request.user = {
      id: claims.sub,
      email: claims.email ?? '',
      role: claims.role ?? 'Employee',
    };

    return true;
  }
}
