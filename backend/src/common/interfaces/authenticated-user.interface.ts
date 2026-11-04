import type { Role } from '../enums/roles.enum.js';

/** The authenticated principal attached to every guarded request. */
export interface AuthenticatedUser {
  identityId: string;
  employeeId: string;
  email: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  employeeId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
