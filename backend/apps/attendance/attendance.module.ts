import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { serviceDatabase } from '../../shared/database/database-options.js';
import { ATTENDANCE_DATA_SOURCE } from '../../shared/database/data-sources.js';
import { tcpClients } from '../../shared/rpc/tcp-clients.js';
import {
  EMPLOYEE_CLIENT,
  STORAGE_CLIENT,
} from './clients/microservice-clients.js';
import { AttendanceController } from './controller/attendance.controller.js';
import { AttendanceRecord } from './entity/attendance.entity.js';
import { AttendanceCronService } from './service/attendance-cron.service.js';
import { AttendanceService } from './service/attendance.service.js';
import { HolidayService } from './service/holiday.service.js';

/**
 * Attendance microservice (TCP only). Owns the attendance database and calls the
 * employee service for people and the storage service for proof photos; the
 * gateway exposes it over HTTP.
 *
 * Environment:
 *   ATTENDANCE_TCP_HOST/PORT  internal transport, default 127.0.0.1:4004
 *   EMPLOYEE_TCP_HOST/PORT    employee service, default 127.0.0.1:4003
 *   STORAGE_TCP_HOST/PORT     storage service, default 127.0.0.1:4001
 *   COMPANY_TIMEZONE          default Asia/Jakarta
 *   REQUIRED_CHECK_IN         default 09:00
 *   ATTENDANCE_ABSENT_CRON    default "0 15 * * *"
 *   HOLIDAY_API_URL           Kemendesa holiday calendar
 *   HOLIDAY_CACHE_TTL_SECONDS default 21600
 *   DB_SYNCHRONIZE            "false" to disable schema sync, default true
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync(
      serviceDatabase(ATTENDANCE_DATA_SOURCE, [AttendanceRecord]),
    ),
    TypeOrmModule.forFeature([AttendanceRecord], ATTENDANCE_DATA_SOURCE),
    ClientsModule.registerAsync(
      tcpClients(
        { name: EMPLOYEE_CLIENT, envPrefix: 'EMPLOYEE', defaultPort: 4003 },
        { name: STORAGE_CLIENT, envPrefix: 'STORAGE', defaultPort: 4001 },
      ),
    ),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, HolidayService, AttendanceCronService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
