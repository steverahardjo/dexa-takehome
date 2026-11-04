import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, Repository } from 'typeorm';
import { AttendanceStatus } from '../../common/enums/roles.enum.js';
import {
  eachDate,
  localDate,
  weekdayOf,
  yearBounds,
} from '../../common/time/time.util.js';
import { AttendanceService } from '../../attendance/services/attendance.service.js';
import type { AttendanceRecord } from '../../attendance/entities/attendance-record.entity.js';
import { EmployeeService } from '../../employee/services/employee.service.js';
import type { Employee } from '../../employee/entities/employee.entity.js';
import type { LeaveRequest } from '../../employee/entities/leave-request.entity.js';
import { LeaveService } from '../../employee/services/leave.service.js';
import {
  resolveScheduleFromList,
  ScheduleService,
  type ResolvedSchedule,
} from '../../employee/services/schedule.service.js';
import { DailyEmployeeAttendance } from '../entities/daily-employee-attendance.entity.js';
import { EmployeeAttendanceSummary } from '../entities/employee-attendance-summary.entity.js';
import { ReportingEmployee } from '../entities/reporting-employee.entity.js';
import { deriveAttendanceStatus } from './reporting-status.js';

type DailyRow = Omit<DailyEmployeeAttendance, 'id' | 'updatedAt'>;

const CHUNK_SIZE = 500;

/**
 * Owns the denormalised reporting projections.
 *
 * Source modules stay authoritative; every row here can be rebuilt from
 * employees, schedules, attendance and approved leave. Writes are serialised
 * per process so event-driven updates and reconciliation cannot interleave
 * delete/insert pairs.
 */
@Injectable()
export class ReportingProjectionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportingProjectionService.name);
  private readonly companyTimezone: string;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private bootstrapping = false;

  constructor(
    @InjectRepository(ReportingEmployee)
    private readonly reportingEmployeeRepository: Repository<ReportingEmployee>,
    @InjectRepository(DailyEmployeeAttendance)
    private readonly dailyRepository: Repository<DailyEmployeeAttendance>,
    @InjectRepository(EmployeeAttendanceSummary)
    private readonly summaryRepository: Repository<EmployeeAttendanceSummary>,
    private readonly dataSource: DataSource,
    private readonly employeeService: EmployeeService,
    private readonly scheduleService: ScheduleService,
    private readonly attendanceService: AttendanceService,
    private readonly leaveService: LeaveService,
    config: ConfigService,
  ) {
    this.companyTimezone = config.get<string>('company.timezone', 'Asia/Jakarta');
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.bootstrapping) return;
    this.bootstrapping = true;

    try {
      const existing = await this.reportingEmployeeRepository.count();
      if (existing > 0) return;

      this.logger.log('Reporting projections are empty; rebuilding the current year');
      // Fire-and-forget: boot must not block on a full-year rebuild.
      void this.reconcile().catch((error: unknown) => {
        this.logger.error(
          'Initial reporting reconciliation failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    } catch (error) {
      this.logger.error(
        'Could not check reporting projections',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async syncEmployee(employeeId: string): Promise<void> {
    try {
      const employee = await this.employeeService.getById(employeeId);
      await this.reportingEmployeeRepository.upsert(this.toReportingEmployee(employee), [
        'employeeId',
      ]);
    } catch (error) {
      if (error instanceof NotFoundException) return;
      throw error;
    }
  }

  async syncEmployees(): Promise<number> {
    const employees = await this.employeeService.getAllWithDivisions();
    if (!employees.length) return 0;

    const rows = employees.map((employee) => this.toReportingEmployee(employee));
    for (const chunk of this.chunk(rows, CHUNK_SIZE)) {
      await this.reportingEmployeeRepository.upsert(chunk, ['employeeId']);
    }
    return rows.length;
  }

  /** Rebuilds every active employee's row for one calendar date. */
  async refreshDay(date: string): Promise<void> {
    await this.enqueue(async () => {
      const now = new Date();
      const today = localDate(now, this.companyTimezone);
      const employees = await this.employeeService.getActiveEmployeesWithDivisions();
      if (!employees.length) return;

      const schedules = await this.scheduleService.listAll();
      const attendance = await this.attendanceService.findForDate(date);
      const attendanceByEmployee = new Map(
        attendance.map((record) => [record.employeeId, record]),
      );
      const leaveEmployeeIds = await this.leaveService
        .getForRange(
          employees.map((employee) => employee.id),
          date,
          date,
        )
        .then((leaves) => new Set(leaves.map((leave) => leave.employeeId)));

      const rows = employees.map((employee) =>
        this.buildRow({
          employee,
          date,
          today,
          now,
          schedules,
          attendance: attendanceByEmployee.get(employee.id) ?? null,
          onLeave: leaveEmployeeIds.has(employee.id),
        }),
      );

      for (const chunk of this.chunk(rows, CHUNK_SIZE)) {
        await this.dailyRepository.upsert(chunk, ['employeeId', 'attendanceDate']);
      }
    });
  }

  /**
   * Rebuilds one employee's daily rows and yearly summary for `year`.
   * Only elapsed days are projected; future days are never marked absent.
   */
  async refreshEmployeeYear(employeeId: string, year: number): Promise<void> {
    await this.enqueue(() => this.rebuildEmployeeYear(employeeId, year));
  }

  private async rebuildEmployeeYear(employeeId: string, year: number): Promise<void> {
    const now = new Date();
    const today = localDate(now, this.companyTimezone);
    const bounds = yearBounds(year);
    const from = bounds.from;
    const to = bounds.to < today ? bounds.to : today;
    const employee = await this.employeeService.getById(employeeId);

    const joinedAt = employee.joinedAt.slice(0, 10);
    if (to < from || to < joinedAt) {
      // Nothing to project yet; make sure stale rows do not survive.
      await this.replaceYear(employeeId, year, bounds, []);
      return;
    }

    const rangeFrom = joinedAt > from ? joinedAt : from;
    const terminationLimit = employee.terminatedAt?.slice(0, 10) ?? to;
    const rangeTo = terminationLimit < to ? terminationLimit : to;

    if (rangeTo < rangeFrom) {
      await this.replaceYear(employeeId, year, bounds, []);
      return;
    }

    const schedules = await this.scheduleService.listAll();
    const attendance = await this.attendanceService.findForRange(employeeId, rangeFrom, rangeTo);
    const attendanceByDate = new Map(attendance.map((record) => [record.attendanceDate, record]));
    const leaves = await this.leaveService.getForEmployeeYear(employeeId, year);
    const leaveDates = this.expandLeaveDates(leaves, rangeFrom, rangeTo);

    const rows: DailyRow[] = eachDate(rangeFrom, rangeTo).map((date) =>
      this.buildRow({
        employee,
        date,
        today,
        now,
        schedules,
        attendance: attendanceByDate.get(date) ?? null,
        onLeave: leaveDates.has(date),
      }),
    );

    await this.replaceYear(employeeId, year, bounds, rows);
  }

  /** Rebuilds reporting_employees and the requested year for every employee. */
  async reconcile(year = Number(localDate(new Date(), this.companyTimezone).slice(0, 4))): Promise<{
    year: number;
    employees: number;
  }> {
    const employees = await this.syncEmployees();
    const all = await this.employeeService.getAllWithDivisions();

    for (const employee of all) {
      await this.refreshEmployeeYear(employee.id, year);
    }

    await this.refreshDay(localDate(new Date(), this.companyTimezone));
    this.logger.log(`Reconciled ${all.length} employees for ${year}`);
    return { year, employees };
  }

  private buildRow(input: {
    employee: Employee;
    date: string;
    today: string;
    now: Date;
    schedules: Awaited<ReturnType<ScheduleService['listAll']>>;
    attendance: AttendanceRecord | null;
    onLeave: boolean;
  }): DailyRow {
    const { employee, date, today, now, schedules, attendance, onLeave } = input;
    const divisionIds = (employee.divisions ?? []).map((division) => division.id);
    const schedule: ResolvedSchedule | null = resolveScheduleFromList(
      schedules,
      employee.id,
      divisionIds,
      date,
    );
    const scheduled = Boolean(schedule && schedule.workingDays.includes(weekdayOf(date)));

    const { status, lateMinutes } = deriveAttendanceStatus({
      date,
      today,
      now,
      scheduled,
      requiredCheckIn: schedule?.requiredCheckIn ?? null,
      requiredCheckOut: schedule?.requiredCheckOut ?? null,
      timezone: schedule?.timezone ?? null,
      onLeave,
      attendance: attendance
        ? {
            checkInTime: attendance.checkInTime,
            checkOutTime: attendance.checkOutTime,
            late: attendance.late,
            lateMinutes: attendance.lateMinutes,
          }
        : null,
    });

    return {
      employeeId: employee.id,
      attendanceDate: date,
      employeeName: employee.fullName,
      divisionNames: (employee.divisions ?? []).map((division) => division.name).join(', '),
      requiredCheckIn: scheduled ? (schedule?.requiredCheckIn ?? null) : null,
      actualCheckIn: attendance?.checkInTime ?? null,
      requiredCheckOut: scheduled ? (schedule?.requiredCheckOut ?? null) : null,
      actualCheckOut: attendance?.checkOutTime ?? null,
      timezone: schedule?.timezone ?? null,
      status,
      lateMinutes,
      pictureUrl: attendance?.pictureUrl ?? null,
    };
  }

  private async replaceYear(
    employeeId: string,
    year: number,
    bounds: { from: string; to: string },
    rows: DailyRow[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(DailyEmployeeAttendance)
        .where('employee_id = :employeeId', { employeeId })
        .andWhere('attendance_date BETWEEN :from AND :to', {
          from: bounds.from,
          to: bounds.to,
        })
        .execute();

      for (const chunk of this.chunk(rows, CHUNK_SIZE)) {
        await manager.getRepository(DailyEmployeeAttendance).insert(chunk);
      }

      await this.upsertSummary(manager, employeeId, year, rows);
    });
  }

  private async upsertSummary(
    manager: EntityManager,
    employeeId: string,
    year: number,
    rows: DailyRow[],
  ): Promise<void> {
    const scheduled = rows.filter((row) => row.status !== AttendanceStatus.NOT_WORKING);

    const summary = {
      employeeId,
      year,
      workingDays: scheduled.length,
      presentDays: scheduled.filter((row) => row.actualCheckIn !== null).length,
      onTimeDays: scheduled.filter((row) => row.status === AttendanceStatus.ON_TIME).length,
      lateDays: scheduled.filter((row) => row.status === AttendanceStatus.LATE).length,
      absentDays: scheduled.filter((row) => row.status === AttendanceStatus.ABSENT).length,
      leaveDays: scheduled.filter((row) => row.status === AttendanceStatus.ON_LEAVE).length,
    };

    await manager.getRepository(EmployeeAttendanceSummary).upsert(summary, [
      'employeeId',
      'year',
    ]);
  }

  private expandLeaveDates(
    leaves: LeaveRequest[],
    from: string,
    to: string,
  ): Set<string> {
    const dates = new Set<string>();
    for (const leave of leaves) {
      const start = leave.startDate.slice(0, 10);
      const end = leave.endDate.slice(0, 10);
      const clampedFrom = start < from ? from : start;
      const clampedTo = end > to ? to : end;
      if (clampedFrom > clampedTo) continue;
      for (const date of eachDate(clampedFrom, clampedTo)) dates.add(date);
    }
    return dates;
  }

  private toReportingEmployee(employee: Employee): Partial<ReportingEmployee> {
    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.fullName,
      email: employee.email,
      employmentStatus: employee.employmentStatus,
      divisionNames: (employee.divisions ?? []).map((division) => division.name).join(', '),
    };
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  /** Read helpers kept here so the projection stays encapsulated. */
  async findDailyRows(
    employeeId: string,
    from: string,
    to: string,
  ): Promise<DailyEmployeeAttendance[]> {
    return this.dailyRepository.find({
      where: { employeeId, attendanceDate: Between(from, to) },
      order: { attendanceDate: 'ASC' },
    });
  }

  async findDailyRowsForDate(date: string): Promise<DailyEmployeeAttendance[]> {
    return this.dailyRepository.find({ where: { attendanceDate: date } });
  }

  queryDailyRows() {
    return this.dailyRepository.createQueryBuilder('row');
  }
}
