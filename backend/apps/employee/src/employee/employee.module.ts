import { Module } from '@nestjs/common';
import { EmployeeController } from './controllers/employee/employee.controller.js';
import { EmployeeService } from './services/employee/employee.service.js';
import { AttendanceController } from './controllers/attendance/attendance.controller.js';
import { AttendanceService } from './services/attendance/attendance.service.js';

@Module({
  controllers: [EmployeeController, AttendanceController],
  providers: [EmployeeService, AttendanceService]
})
export class EmployeeModule {}
