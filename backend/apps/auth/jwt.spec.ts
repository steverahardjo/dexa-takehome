import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { Role } from '../../shared/enums/roles.enum.js';
import { AuthGuard } from './guards/jwt.guard.js';
import { ACCESS_TOKEN_TYPE, JwtLocalService } from './services/jwt.service.js';

const SECRET = 'test-secret';

const claims = {
  sub: '0f1b4b9a-6d78-4c1d-9d3f-2a1b3c4d5e6f',
  employeeId: null,
  email: 'ada@example.com',
  role: Role.EMPLOYEE,
};

const createJwtService = (secret = SECRET) =>
  new JwtService({ secret, signOptions: { algorithm: 'HS256' } });

const createService = (ttlSeconds = 900): JwtLocalService =>
  new JwtLocalService(
    createJwtService(),
    new ConfigService({ JWT_ACCESS_TTL_SECONDS: ttlSeconds }),
  );

const createContext = (
  authorization?: string,
): {
  context: ExecutionContext;
  request: { headers: { authorization?: string }; user?: unknown };
} => {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: { authorization },
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
};

describe('JwtLocalService', () => {
  it('round-trips the claims of a freshly issued access token', async () => {
    const service = createService();

    const token = await service.generateAccessToken(claims);
    const payload = await service.verifyAccessToken(token);

    expect(payload).toMatchObject({
      ...claims,
      type: ACCESS_TOKEN_TYPE,
    });
    expect(payload.exp! - payload.iat!).toBe(900);
  });

  it('honours the configured lifetime', async () => {
    const service = createService(60);

    const payload = await service.verifyAccessToken(
      await service.generateAccessToken(claims),
    );

    expect(service.accessTokenTtlSeconds).toBe(60);
    expect(payload.exp! - payload.iat!).toBe(60);
  });

  it('rejects an expired token', async () => {
    const service = createService();
    const expired = await createJwtService().signAsync(
      { ...claims, type: ACCESS_TOKEN_TYPE },
      { expiresIn: -1 },
    );

    await expect(service.verifyAccessToken(expired)).rejects.toThrow(
      new UnauthorizedException('Access token expired'),
    );
  });

  it('rejects a token signed with a different secret', async () => {
    const service = createService();
    const forged = await createJwtService('another-secret').signAsync({
      ...claims,
      type: ACCESS_TOKEN_TYPE,
    });

    await expect(service.verifyAccessToken(forged)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token that is not an access token', async () => {
    const service = createService();
    const wrongType = await createJwtService().signAsync({
      ...claims,
      type: 'refresh',
    });

    await expect(service.verifyAccessToken(wrongType)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token whose claims do not match the payload shape', async () => {
    const service = createService();
    const incomplete = await createJwtService().signAsync({
      sub: claims.sub,
      type: ACCESS_TOKEN_TYPE,
    });

    await expect(service.verifyAccessToken(incomplete)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects garbage instead of leaking the underlying error', async () => {
    const service = createService();

    await expect(service.verifyAccessToken('not-a-jwt')).rejects.toThrow(
      new UnauthorizedException('Invalid access token'),
    );
  });
});

describe('AuthGuard', () => {
  const guard = new AuthGuard(createService());

  it('accepts a valid bearer token and exposes its claims on the request', async () => {
    const token = await createService().generateAccessToken(claims);
    const { context, request } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      sub: claims.sub,
      email: claims.email,
    });
  });

  it('tolerates extra whitespace around the scheme and token', async () => {
    const token = await createService().generateAccessToken(claims);
    const { context } = createContext(`  bearer   ${token}  `);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a missing header', async () => {
    const { context } = createContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing bearer token'),
    );
  });

  it('rejects a non-bearer scheme', async () => {
    const token = await createService().generateAccessToken(claims);
    const { context } = createContext(`Basic ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an empty bearer token', async () => {
    const { context } = createContext('Bearer   ');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a header with trailing segments', async () => {
    const token = await createService().generateAccessToken(claims);
    const { context } = createContext(`Bearer ${token} extra`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const expired = await createJwtService().signAsync(
      { ...claims, type: ACCESS_TOKEN_TYPE },
      { expiresIn: -1 },
    );
    const { context } = createContext(`Bearer ${expired}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Access token expired'),
    );
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await createJwtService('another-secret').signAsync({
      ...claims,
      type: ACCESS_TOKEN_TYPE,
    });
    const { context } = createContext(`Bearer ${forged}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
