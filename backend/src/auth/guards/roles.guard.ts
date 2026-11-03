import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '../../employee/entities/employee.entity.js';
import type { TokenUser } from './jwt-auth.guard.js';

export const ROLES_KEY = 'roles';

/** Marks a handler as reachable only by the listed roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Applies `@Roles(...)` to the user `JwtAuthGuard` attached. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: TokenUser }>().user;

    if (!user) {
      throw new UnauthorizedException('Missing bearer token');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `This action needs one of: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
