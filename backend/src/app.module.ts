import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EmployeeModule } from './employee/employee.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [EmployeeModule, AuthModule, AdminModule, DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
