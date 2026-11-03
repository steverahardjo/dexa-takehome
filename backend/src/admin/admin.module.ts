import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { SecurityModule } from '../auth/security/security.module.js';
import { Attendance } from '../employee/entities/attendance.entity.js';
import { Employee } from '../employee/entities/employee.entity.js';
import { EmployeePresenter } from '../employee/presenter/employee.presenter.js';

/** Everything the admin-facing container serves. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Attendance]),
    SecurityModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, EmployeePresenter],
  exports: [AdminService],
})
export class AdminServiceModule {}
