import { Module } from '@nestjs/common';

import { AdminServiceModule } from './admin/admin.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { SeedModule } from './database/seed.module.js';
import { EmployeeServiceModule } from './employee/employee.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * The all-in-one app for local development (`npm run start:dev`). Production
 * runs one container per domain, each importing only its own module.
 */
@Module({
  imports: [
    DatabaseModule,
    SeedModule,
    HealthModule,
    AuthModule,
    EmployeeServiceModule,
    AdminServiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
