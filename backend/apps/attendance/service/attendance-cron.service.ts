import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { AttendanceService } from './attendance.service.js';

/**
 * Runs the absent sweep after the check-in cut-off (15:00 by default).
 *
 * The expression and timezone are read from the environment at load time
 * because decorators cannot inject ConfigService:
 *   ATTENDANCE_ABSENT_CRON  default "0 15 * * *"
 *   COMPANY_TIMEZONE        default "Asia/Jakarta"
 */
@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);

  constructor(private readonly attendance: AttendanceService) {}

  @Cron(process.env.ATTENDANCE_ABSENT_CRON ?? '0 15 * * *', {
    name: 'attendance-absent-sweep',
    timeZone: process.env.COMPANY_TIMEZONE ?? 'Asia/Jakarta',
  })
  async markAbsent(): Promise<void> {
    try {
      const result = await this.attendance.markAbsent();

      if (!result.skipped) {
        this.logger.log(
          `Absent sweep ${result.date}: ${result.created} record(s)`,
        );
      }
    } catch (error) {
      // A failed sweep must never take the service down.
      this.logger.error(
        `Absent sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
