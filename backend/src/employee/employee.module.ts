import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { DivisionController } from './controllers/division.controller.js';
import { EmployeeController } from './controllers/employee.controller.js';
import { LeaveController } from './controllers/leave.controller.js';
import { ScheduleController } from './controllers/schedule.controller.js';
import { Division } from './entities/division.entity.js';
import { EmployeeStatusHistory } from './entities/employee-status-history.entity.js';
import { Employee } from './entities/employee.entity.js';
import { LeaveRequest } from './entities/leave-request.entity.js';
import { WorkSchedule } from './entities/work-schedule.entity.js';
import { DivisionService } from './services/division.service.js';
import { EmployeeService } from './services/employee.service.js';
import { LeaveService } from './services/leave.service.js';
import { ScheduleService } from './services/schedule.service.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Employee,
      Division,
      EmployeeStatusHistory,
      WorkSchedule,
      LeaveRequest,
    ]),
  ],
  controllers: [EmployeeController, LeaveController, DivisionController, ScheduleController],
  providers: [EmployeeService, DivisionService, ScheduleService, LeaveService],
  exports: [EmployeeService, DivisionService, ScheduleService, LeaveService, TypeOrmModule],
})
export class EmployeeModule {}
