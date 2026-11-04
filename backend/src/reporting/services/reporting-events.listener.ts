import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { localDate } from '../../common/time/time.util.js';
import { EmployeeService } from '../../employee/services/employee.service.js';
import { ReportingProjectionService } from './reporting-projection.service.js';

interface EmployeeEvent {
  employeeId: string;
}

interface ScheduleEvent {
  employeeId: string | null;
  divisionId: string | null;
}

interface AttendanceEvent {
  employeeId: string;
  attendanceDate: string;
}

interface LeaveEvent {
  employeeId: string;
  startDate: string;
  endDate: string;
}

/**
 * Keeps the read model close to real time. Events are in-process notifications:
 * reconciliation (`POST /reports/reconcile`) is the durable fallback and every
 * handler is idempotent.
 */
@Injectable()
export class ReportingEventsListener {
  private readonly logger = new Logger(ReportingEventsListener.name);
  private readonly companyTimezone: string;

  constructor(
    private readonly projection: ReportingProjectionService,
    private readonly employeeService: EmployeeService,
    config: ConfigService,
  ) {
    this.companyTimezone = config.get<string>('company.timezone', 'Asia/Jakarta');
  }

  @OnEvent('employee.created', { async: true })
  async onEmployeeCreated(payload: EmployeeEvent): Promise<void> {
    await this.safely(`employee.created ${payload.employeeId}`, async () => {
      await this.projection.syncEmployee(payload.employeeId);
      await this.projection.refreshEmployeeYear(payload.employeeId, this.currentYear());
    });
  }

  @OnEvent('employee.updated', { async: true })
  async onEmployeeUpdated(payload: EmployeeEvent): Promise<void> {
    await this.safely(`employee.updated ${payload.employeeId}`, async () => {
      await this.projection.syncEmployee(payload.employeeId);
      await this.projection.refreshEmployeeYear(payload.employeeId, this.currentYear());
    });
  }

  @OnEvent('employee.terminated', { async: true })
  async onEmployeeTerminated(payload: EmployeeEvent): Promise<void> {
    await this.safely(`employee.terminated ${payload.employeeId}`, async () => {
      await this.projection.syncEmployee(payload.employeeId);
      await this.projection.refreshEmployeeYear(payload.employeeId, this.currentYear());
    });
  }

  @OnEvent('employee.schedule.updated', { async: true })
  async onScheduleUpdated(payload: ScheduleEvent): Promise<void> {
    await this.safely('employee.schedule.updated', async () => {
      if (payload.employeeId) {
        await this.projection.refreshEmployeeYear(payload.employeeId, this.currentYear());
        return;
      }

      if (payload.divisionId) {
        const employees = await this.employeeService.getByDivisionId(payload.divisionId);
        for (const employee of employees) {
          await this.projection.refreshEmployeeYear(employee.id, this.currentYear());
        }
      }
    });
  }

  @OnEvent('attendance.checked-in', { async: true })
  async onCheckedIn(payload: AttendanceEvent): Promise<void> {
    await this.refreshAttendance(payload);
  }

  @OnEvent('attendance.checked-out', { async: true })
  async onCheckedOut(payload: AttendanceEvent): Promise<void> {
    await this.refreshAttendance(payload);
  }

  @OnEvent('attendance.corrected', { async: true })
  async onCorrected(payload: AttendanceEvent): Promise<void> {
    await this.refreshAttendance(payload);
  }

  @OnEvent('leave.updated', { async: true })
  async onLeaveUpdated(payload: LeaveEvent): Promise<void> {
    await this.safely(`leave.updated ${payload.employeeId}`, async () => {
      const startYear = Number(payload.startDate.slice(0, 4));
      const endYear = Number(payload.endDate.slice(0, 4));
      const currentYear = this.currentYear();

      for (let year = startYear; year <= endYear && year <= currentYear; year += 1) {
        await this.projection.refreshEmployeeYear(payload.employeeId, year);
      }
    });
  }

  private async refreshAttendance(payload: AttendanceEvent): Promise<void> {
    await this.safely(`attendance ${payload.employeeId} ${payload.attendanceDate}`, async () => {
      await this.projection.refreshDay(payload.attendanceDate);
      await this.projection.refreshEmployeeYear(
        payload.employeeId,
        Number(payload.attendanceDate.slice(0, 4)),
      );
    });
  }

  private currentYear(): number {
    return Number(localDate(new Date(), this.companyTimezone).slice(0, 4));
  }

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Reporting update failed for ${label}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
