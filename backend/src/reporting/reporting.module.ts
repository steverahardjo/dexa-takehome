import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { EmployeeModule } from '../employee/employee.module.js';
import { ReportingController } from './controllers/reporting.controller.js';
import { DailyEmployeeAttendance } from './entities/daily-employee-attendance.entity.js';
import { EmployeeAttendanceSummary } from './entities/employee-attendance-summary.entity.js';
import { ReportingEmployee } from './entities/reporting-employee.entity.js';
import { ReportingEventsListener } from './services/reporting-events.listener.js';
import { ReportingProjectionService } from './services/reporting-projection.service.js';
import { ReportingService } from './services/reporting.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportingEmployee,
      DailyEmployeeAttendance,
      EmployeeAttendanceSummary,
    ]),
    EmployeeModule,
    AttendanceModule,
  ],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingProjectionService, ReportingEventsListener],
  exports: [ReportingService, ReportingProjectionService],
})
export class ReportingModule {}
