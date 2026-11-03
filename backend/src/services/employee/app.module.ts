import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { SeedModule } from '../../database/seed.module.js';
import { EmployeeServiceModule } from '../../employee/employee.module.js';
import { HealthModule } from '../../health/health.module.js';

/** The employee container: self service, check-ins and the QR capture flow. */
@Module({
  imports: [
    DatabaseModule,
    SeedModule,
    HealthModule,
    EmployeeServiceModule,
  ],
})
export class EmployeeServiceAppModule {}
