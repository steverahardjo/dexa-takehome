import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard.js';

function contextWith(authorization?: string): ExecutionContext {
  const request: { headers: Record<string, string | undefined>; user?: unknown } =
    { headers: authorization ? { authorization } : {} };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const guard = new JwtAuthGuard(jwt);

  it('refuses a request without a bearer token', async () => {
    await expect(guard.canActivate(contextWith())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an invalid token', async () => {
    await expect(
      guard.canActivate(contextWith('Bearer not-a-token')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the claims of a valid token', async () => {
    const token = jwt.sign({
      sub: 'employee-1',
      email: 'jane@company.com',
      role: 'HR Admin',
    });

    const context = contextWith(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest<{ user: unknown }>();

    expect(request.user).toEqual({
      id: 'employee-1',
      email: 'jane@company.com',
      role: 'HR Admin',
    });
  });
});
