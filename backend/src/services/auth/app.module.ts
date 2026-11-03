import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { SeedModule } from '../../database/seed.module.js';
import { HealthModule } from '../../health/health.module.js';

/** The auth container: OTP sign-in and token issuing. */
@Module({
  imports: [DatabaseModule, SeedModule, HealthModule, AuthModule],
})
export class AuthServiceAppModule {}
