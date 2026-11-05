import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { JwtPayload } from '../../../auth/services/jwt.service.js';
import type { AuthenticatedRequest } from '../../../auth/guards/jwt.guard.js';
import { Role } from '../../../../shared/enums/roles.enum.js';
import { ROLES_KEY } from './roles.decorator.js';

/** Enforces `@Roles(...)`; runs after AuthGuard put the claims on the request. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: JwtPayload | undefined = request.user;

    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException('This action needs a different role');
    }

    return true;
  }
}
