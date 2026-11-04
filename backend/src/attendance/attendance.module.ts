import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeModule } from '../employee/employee.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AttendanceController } from './controllers/attendance.controller.js';
import { AttendanceCorrection } from './entities/attendance-correction.entity.js';
import { AttendanceRecord } from './entities/attendance-record.entity.js';
import { AttendanceService } from './services/attendance.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceRecord, AttendanceCorrection]),
    EmployeeModule,
    StorageModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
