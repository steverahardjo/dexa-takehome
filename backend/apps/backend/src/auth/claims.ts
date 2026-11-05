import { ForbiddenException } from '@nestjs/common';

import { Role } from '../../../../shared/enums/roles.enum.js';
import type { JwtPayload } from '../../../auth/services/jwt.service.js';

/** True for the roles that may read and change other people's records. */
export const isAdmin = (user: JwtPayload): boolean =>
  user.role === Role.ADMIN || user.role === Role.MASTER_ADMIN;

/**
 * The employee a token belongs to. An identity without a linked employee can
 * log in but cannot check in or read attendance.
 */
export function requireEmployeeId(user: JwtPayload): string {
  if (!user.employeeId) {
    throw new ForbiddenException('This account is not linked to an employee');
  }

  return user.employeeId;
}

/** Reading someone else's attendance needs an admin role; reading your own does not. */
export function assertSelfOrAdmin(
  user: JwtPayload,
  employeeId: string,
): void {
  if (user.employeeId === employeeId || isAdmin(user)) return;

  throw new ForbiddenException('You can only read your own attendance');
}
