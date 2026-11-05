import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import { JwtLocalService } from '../../../auth/services/jwt.service.js';
import { RolesGuard } from './roles.guard.js';

/**
 * Token verification for the gateway.
 *
 * It reuses the auth service's guard and JWT service (they are pure code, no
 * database), but registers its own `JwtModule`: the gateway must not open the
 * auth data source, and it only ever verifies tokens — auth is the sole signer,
 * so both sides share `JWT_ACCESS_SECRET` and nothing else.
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [JwtLocalService, AuthGuard, RolesGuard],
  exports: [JwtLocalService, AuthGuard, RolesGuard],
})
export class GatewayAuthModule {}
