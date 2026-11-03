import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecurityModule } from '../auth/security/security.module.js';
import { AttendanceController } from './controller/attendance.controller.js';
import { EmployeeController } from './controller/employee.controller.js';
import { Attendance } from './entities/attendance.entity.js';
import { CaptureSession } from './entities/capture-session.entity.js';
import { Employee } from './entities/employee.entity.js';
import { EmployeePresenter } from './presenter/employee.presenter.js';
import { AttendanceService } from './services/attendance.service.js';
import { CaptureService } from './services/capture.service.js';

/** Everything the employee-facing container serves. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Attendance, CaptureSession]),
    SecurityModule,
  ],
  controllers: [EmployeeController, AttendanceController],
  providers: [AttendanceService, CaptureService, EmployeePresenter],
  exports: [AttendanceService, EmployeePresenter],
})
export class EmployeeServiceModule {}
