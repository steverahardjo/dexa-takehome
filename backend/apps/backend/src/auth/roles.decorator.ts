import { SetMetadata } from '@nestjs/common';

import { Role } from '../../../../shared/enums/roles.enum.js';

export const ROLES_KEY = 'roles';

/**
 * Roles allowed to reach a handler. Without it a route only needs a valid
 * token. Enforced by RolesGuard, which must run after AuthGuard.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
