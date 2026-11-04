import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceStatus, EmploymentStatus } from '../../common/enums/roles.enum.js';
import { paginate } from '../../common/interfaces/pagination.interface.js';
import { localDate, localTime } from '../../common/time/time.util.js';
import { EmployeeService } from '../../employee/services/employee.service.js';
import type { DailyEmployeeAttendance } from '../entities/daily-employee-attendance.entity.js';
import { ReportingEmployee } from '../entities/reporting-employee.entity.js';
import type {
  HistoryQueryDto,
  TodayDashboardQueryDto,
} from '../dto/reporting.dto.js';
import { ReportingProjectionService } from './reporting-projection.service.js';

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface AttendanceSummaryView {
  workingDays: number;
  presentDays: number;
  onTimeDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  notCheckedInDays: number;
}

@Injectable()
export class ReportingService {
  private readonly companyTimezone: string;

  constructor(
    @InjectRepository(ReportingEmployee)
    private readonly employeesRepository: Repository<ReportingEmployee>,
    private readonly projection: ReportingProjectionService,
    private readonly employeeService: EmployeeService,
    config: ConfigService,
  ) {
    this.companyTimezone = config.get<string>('company.timezone', 'Asia/Jakarta');
  }

  async today(query: TodayDashboardQueryDto) {
    const now = new Date();
    const date = localDate(now, this.companyTimezone);

    await this.projection.refreshDay(date);

    const employees = await this.employeesRepository.find({
      where: { employmentStatus: EmploymentStatus.ACTIVE },
      order: { employeeNumber: 'ASC' },
    });
    const rows = await this.projection.findDailyRowsForDate(date);
    const rowByEmployee = new Map(rows.map((row) => [row.employeeId, row]));

    const all = employees.map((employee) => {
      const row = rowByEmployee.get(employee.employeeId);
      // The dashboard has no ABSENT bucket: after the cutoff a missing check-in
      // is still "not checked in" here, while yearly reports record it as absent.
      const status =
        row?.status === AttendanceStatus.ABSENT
          ? AttendanceStatus.NOT_CHECKED_IN
          : (row?.status ?? AttendanceStatus.NOT_CHECKED_IN);
      const timezone = row?.timezone ?? this.companyTimezone;

      return {
        employeeId: employee.employeeId,
        employeeNumber: employee.employeeNumber,
        employeeName: employee.employeeName,
        division: employee.divisionNames || null,
        status,
        checkInTime: row?.actualCheckIn ? localTime(row.actualCheckIn, timezone) : null,
        checkOutTime: row?.actualCheckOut ? localTime(row.actualCheckOut, timezone) : null,
        scheduledCheckIn: row?.requiredCheckIn?.slice(0, 8) ?? null,
        scheduledCheckOut: row?.requiredCheckOut?.slice(0, 8) ?? null,
        lateMinutes: row?.lateMinutes ?? 0,
        photoUrl: row?.pictureUrl ?? null,
      };
    });

    const summary = {
      totalEmployees: all.filter((item) => item.status !== AttendanceStatus.NOT_WORKING)
        .length,
      checkedIn: all.filter(
        (item) => item.status === AttendanceStatus.ON_TIME || item.status === AttendanceStatus.LATE,
      ).length,
      onTime: all.filter((item) => item.status === AttendanceStatus.ON_TIME).length,
      late: all.filter((item) => item.status === AttendanceStatus.LATE).length,
      notCheckedIn: all.filter((item) => item.status === AttendanceStatus.NOT_CHECKED_IN)
        .length,
      onLeave: all.filter((item) => item.status === AttendanceStatus.ON_LEAVE).length,
      notWorking: all.filter((item) => item.status === AttendanceStatus.NOT_WORKING).length,
    };

    const search = query.search?.trim().toLowerCase();
    const employeesView = all.filter((item) => {
      if (query.status && item.status !== query.status) return false;
      if (query.division) {
        const division = query.division.trim().toLowerCase();
        if (!(item.division ?? '').toLowerCase().includes(division)) return false;
      }
      if (search) {
        const haystack = `${item.employeeName} ${item.employeeNumber}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    return { date, summary, employees: employeesView };
  }

  async yearly(employeeId: string, requestedYear?: number) {
    const year = this.resolveYear(requestedYear);
    const employee = await this.employeeService.getById(employeeId);
    await this.projection.refreshEmployeeYear(employeeId, year);

    const rows = await this.projection.findDailyRows(
      employeeId,
      `${year}-01-01`,
      `${year}-12-31`,
    );
    const scheduled = this.scheduledRows(rows);
    const summary = this.summarize(scheduled);

    return {
      employee: this.employeeView(employee),
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.fullName,
      division: (employee.divisions ?? []).map((division) => division.name).join(', ') || null,
      employmentStatus: employee.employmentStatus,
      year,
      summary,
      punctualityRate: this.punctualityRate(summary),
    };
  }

  async monthly(employeeId: string, requestedYear?: number) {
    const year = this.resolveYear(requestedYear);
    const employee = await this.employeeService.getById(employeeId);
    await this.projection.refreshEmployeeYear(employeeId, year);

    const rows = this.scheduledRows(
      await this.projection.findDailyRows(employeeId, `${year}-01-01`, `${year}-12-31`),
    );

    const months = MONTH_LABELS.map((label, index) => {
      const month = index + 1;
      const monthRows = rows.filter(
        (row) => Number(row.attendanceDate.slice(5, 7)) === month,
      );
      return {
        month,
        label,
        ...this.summarize(monthRows),
      };
    });

    return {
      employee: this.employeeView(employee),
      employeeId: employee.id,
      year,
      months,
    };
  }

  async history(employeeId: string, query: HistoryQueryDto) {
    const year = this.resolveYear(query.year);
    const employee = await this.employeeService.getById(employeeId);
    await this.projection.refreshEmployeeYear(employeeId, year);

    const builder = this.projection
      .queryDailyRows()
      .where('row.employee_id = :employeeId', { employeeId })
      .andWhere('row.attendance_date BETWEEN :from AND :to', {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      })
      .andWhere('row.status <> :notWorking', { notWorking: AttendanceStatus.NOT_WORKING })
      .orderBy('row.attendance_date', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await builder.getManyAndCount();

    const data = rows.map((row) => {
      const timezone = row.timezone ?? this.companyTimezone;
      return {
        date: row.attendanceDate,
        status: row.status,
        scheduledCheckIn: row.requiredCheckIn?.slice(0, 8) ?? null,
        scheduledCheckOut: row.requiredCheckOut?.slice(0, 8) ?? null,
        actualCheckIn: row.actualCheckIn?.toISOString() ?? null,
        actualCheckOut: row.actualCheckOut?.toISOString() ?? null,
        actualCheckInLocal: row.actualCheckIn
          ? localTime(row.actualCheckIn, timezone)
          : null,
        actualCheckOutLocal: row.actualCheckOut
          ? localTime(row.actualCheckOut, timezone)
          : null,
        lateMinutes: row.lateMinutes,
        photoUrl: row.pictureUrl,
      };
    });

    return {
      ...paginate(data, total, query.page, query.limit),
      employee: this.employeeView(employee),
      year,
    };
  }

  async reconcile(year?: number) {
    const target = this.resolveYear(year);
    return this.projection.reconcile(target);
  }

  async refreshForEmployee(employeeId: string, year: number): Promise<void> {
    await this.projection.refreshEmployeeYear(employeeId, year);
  }

  private resolveYear(requested?: number): number {
    const current = Number(localDate(new Date(), this.companyTimezone).slice(0, 4));
    const year = requested ?? current;
    if (year > current) {
      throw new BadRequestException('Reports cannot be requested for a future year');
    }
    return year;
  }

  private scheduledRows(rows: DailyEmployeeAttendance[]): DailyEmployeeAttendance[] {
    return rows.filter((row) => row.status !== AttendanceStatus.NOT_WORKING);
  }

  private summarize(rows: Array<Pick<DailyEmployeeAttendance, 'status' | 'actualCheckIn'>>): AttendanceSummaryView {
    const presentDays = rows.filter((row) => row.actualCheckIn !== null).length;
    const lateDays = rows.filter((row) => row.status === AttendanceStatus.LATE).length;

    return {
      workingDays: rows.length,
      presentDays,
      onTimeDays: rows.filter((row) => row.status === AttendanceStatus.ON_TIME).length,
      lateDays,
      absentDays: rows.filter((row) => row.status === AttendanceStatus.ABSENT).length,
      leaveDays: rows.filter((row) => row.status === AttendanceStatus.ON_LEAVE).length,
      notCheckedInDays: rows.filter(
        (row) => row.status === AttendanceStatus.NOT_CHECKED_IN,
      ).length,
    };
  }

  private punctualityRate(summary: AttendanceSummaryView): number {
    if (summary.presentDays === 0) return 0;
    return Math.round((summary.onTimeDays / summary.presentDays) * 10_000) / 100;
  }

  private employeeView(employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    email: string;
    employmentStatus: EmploymentStatus;
    joinedAt: string;
    divisions?: Array<{ name: string }>;
  }) {
    return {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      fullName: employee.fullName,
      email: employee.email,
      employmentStatus: employee.employmentStatus,
      joinedAt: employee.joinedAt,
      division:
        (employee.divisions ?? []).map((division) => division.name).join(', ') || null,
    };
  }
}
