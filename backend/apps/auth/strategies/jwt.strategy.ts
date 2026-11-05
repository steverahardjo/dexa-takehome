import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ACCESS_TOKEN_TYPE, JwtPayload } from '../services/jwt.service.js';

/**
 * Passport strategy for `@UseGuards(AuthGuard('jwt'))`.
 *
 * AuthGuard in ./jwt.guard.ts is the guard used by this service's controllers;
 * both verify the same tokens against JWT_ACCESS_SECRET.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload?.sub || payload.type !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid access token');
    }

    return payload;
  }
}
