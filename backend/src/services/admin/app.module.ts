import { Module } from '@nestjs/common';

import { AdminServiceModule } from '../../admin/admin.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { SeedModule } from '../../database/seed.module.js';
import { HealthModule } from '../../health/health.module.js';

/** The admin container: employee master data and attendance monitoring. */
@Module({
  imports: [DatabaseModule, SeedModule, HealthModule, AdminServiceModule],
})
export class AdminServiceAppModule {}
