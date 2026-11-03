import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { TokenUser } from '../guards/jwt-auth.guard.js';

/** The signed-in user `JwtAuthGuard` attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TokenUser =>
    context.switchToHttp().getRequest<{ user: TokenUser }>().user,
);
