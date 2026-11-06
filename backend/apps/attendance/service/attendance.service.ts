import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { Between, Repository } from 'typeorm';

import type {
  AttendanceSummary,
  AttendanceView,
  DeletedAttendance,
  LateDatesResult,
  MarkAbsentResult,
  ProofUpload,
  TodayItem,
  TodayReport,
} from '../../../shared/contracts/attendance.contracts.js';
import {
  EMPLOYEE_PATTERNS,
  type ActiveEmployee,
} from '../../../shared/contracts/employee.contracts.js';
import {
  STORAGE_NAMESPACES,
  STORAGE_PATTERNS,
  type ConfirmedUpload,
  type DownloadUrlResult,
  type UploadUrlResult,
} from '../../../shared/contracts/storage.contracts.js';
import { ATTENDANCE_DATA_SOURCE } from '../../../shared/database/data-sources.js';
import { AttendanceStatus } from '../../../shared/enums/roles.enum.js';
import { RPC_ERRORS } from '../../../shared/rpc/errors.js';
import { sendRpc } from '../../../shared/rpc/rpc-call.js';
import {
  localDate,
  localMinutes,
  parseClock,
} from '../../../shared/time/local-time.js';
import {
  EMPLOYEE_CLIENT,
  STORAGE_CLIENT,
} from '../clients/microservice-clients.js';
import type {
  CheckInDto,
  DayQueryDto,
  MarkAbsentDto,
  TodayQueryDto,
  YearQueryDto,
} from '../dto/attendance.dto.js';
import type { RequestProofUploadDto } from '../dto/proof.dto.js';
import { AttendanceRecord } from '../entity/attendance.entity.js';
import { HolidayService, type DayType } from './holiday.service.js';

const isUniqueViolation = (error: unknown): boolean => {
  const dbError = error as {
    code?: string;
    errno?: number;
    driverError?: { code?: string; errno?: number };
  };
  const code = dbError.code ?? dbError.driverError?.code;
  const errno = dbError.errno ?? dbError.driverError?.errno;

  // 23505 = Postgres, ER_DUP_ENTRY/1062 = MySQL.
  return code === '23505' || code === 'ER_DUP_ENTRY' || errno === 1062;
};

const DEFAULT_TIMEZONE = 'Asia/Jakarta';
const DEFAULT_REQUIRED_CHECK_IN = '09:00';

/**
 * Attendance domain: one row per employee per local day, a proof photo hosted
 * by the storage service, and an absent sweep that runs after the cut-off.
 *
 * There is no work-schedule table. A day is a working day when it is not a
 * weekend and not an Indonesian national holiday (HolidayService); the company
 * check-in time comes from `REQUIRED_CHECK_IN`.
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly timeZone: string;
  private readonly requiredCheckIn: string;

  constructor(
    @InjectRepository(AttendanceRecord, ATTENDANCE_DATA_SOURCE)
    private readonly records: Repository<AttendanceRecord>,
    @Inject(EMPLOYEE_CLIENT) private readonly employees: ClientProxy,
    @Inject(STORAGE_CLIENT) private readonly storage: ClientProxy,
    private readonly holidays: HolidayService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('COMPANY_TIMEZONE', DEFAULT_TIMEZONE);
    this.requiredCheckIn = config.get<string>(
      'REQUIRED_CHECK_IN',
      DEFAULT_REQUIRED_CHECK_IN,
    );

    // Fail at boot rather than on the first check-in.
    parseClock(this.requiredCheckIn);
  }

  /** Reserves a key and a temporary URL for the proof photo. */
  async requestProofUpload(dto: RequestProofUploadDto): Promise<ProofUpload> {
    const now = new Date();
    const { date, dayType, holidayName } = await this.resolveDay(
      localDate(now, this.timeZone),
    );

    this.assertWorkingDay(
      dayType,
      holidayName,
      'Proof uploads are not allowed',
    );

    const upload = await sendRpc<UploadUrlResult>(
      this.storage,
      STORAGE_PATTERNS.getUploadUrl,
      {
        contentType: dto.contentType,
        fileName: dto.fileName,
        namespace: STORAGE_NAMESPACES.proof,
      },
      'Could not reserve a proof upload',
    );

    return {
      key: upload.key,
      uploadUrl: upload.uploadUrl,
      expiresInSeconds: upload.expiresInSeconds,
      attendanceDate: date,
    };
  }

  async checkIn(
    employeeId: string,
    dto: Omit<CheckInDto, 'employeeId'>,
  ): Promise<AttendanceView> {
    const now = new Date();
    const { date, dayType, holidayName } = await this.resolveDay(
      localDate(now, this.timeZone),
    );

    this.assertWorkingDay(dayType, holidayName, 'You cannot check in');

    await sendRpc<ActiveEmployee>(
      this.employees,
      EMPLOYEE_PATTERNS.get,
      { id: employeeId },
      'Could not load the employee',
    );

    const proof = await sendRpc<ConfirmedUpload>(
      this.storage,
      STORAGE_PATTERNS.confirmUpload,
      { key: dto.proofKey },
      'Could not verify the check-in proof',
    );

    const existing = await this.records.findOne({
      where: { employeeId, attendanceDate: date },
    });

    if (existing) {
      throw new RpcException({
        code: RPC_ERRORS.conflict,
        message: 'You have already checked in today',
      });
    }

    const lateMinutes = Math.max(
      0,
      localMinutes(now, this.timeZone) - parseClock(this.requiredCheckIn),
    );

    const record = this.records.create({
      employeeId,
      attendanceDate: date,
      checkInTime: now,
      status:
        lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
      late: lateMinutes > 0,
      lateMinutes,
      location: dto.location?.trim() || null,
      proofKey: proof.key,
      requiredCheckIn: this.requiredCheckIn,
      timezone: this.timeZone,
    });

    let saved: AttendanceRecord;

    try {
      saved = await this.records.save(record);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RpcException({
          code: RPC_ERRORS.conflict,
          message: 'You have already checked in today',
        });
      }

      throw error;
    }

    this.logger.log(
      `check-in employee=${employeeId} date=${date} status=${saved.status} lateMinutes=${saved.lateMinutes}`,
    );

    return this.toView(saved);
  }

  /** On-time / late / absent breakdown for a day (today by default). */
  async today(query: TodayQueryDto = {}): Promise<TodayReport> {
    const date = query.date ?? localDate(new Date(), this.timeZone);
    const { type, name } = await this.holidays.dayType(date);
    const workingDay = type === 'WORKING_DAY';

    const [employees, records] = await Promise.all([
      sendRpc<ActiveEmployee[]>(
        this.employees,
        EMPLOYEE_PATTERNS.listActive,
        {},
        'Could not list employees',
      ),
      this.records.find({ where: { attendanceDate: date } }),
    ]);

    const byEmployee = new Map(
      records.map((record) => [record.employeeId, record]),
    );

    const items: TodayItem[] = await Promise.all(
      employees.map(async (employee) => {
        const record = byEmployee.get(employee.id);

        return {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          fullName: employee.fullName,
          status:
            record?.status ??
            (workingDay
              ? AttendanceStatus.NOT_CHECKED_IN
              : AttendanceStatus.NOT_WORKING),
          checkInTime: record?.checkInTime?.toISOString() ?? null,
          lateMinutes: record?.lateMinutes ?? 0,
          location: record?.location ?? null,
          // The dashboard shows the photo, so the row carries a fresh URL.
          proofUrl: record?.proofKey
            ? await this.signedProofUrl(record.proofKey)
            : null,
        };
      }),
    );

    const count = (status: AttendanceStatus): number =>
      items.filter((item) => item.status === status).length;

    return {
      date,
      dayType: type,
      holidayName: name,
      totalEmployees: items.length,
      onTime: count(AttendanceStatus.ON_TIME),
      late: count(AttendanceStatus.LATE),
      absent: count(AttendanceStatus.ABSENT),
      notCheckedIn: count(AttendanceStatus.NOT_CHECKED_IN),
      items,
    };
  }

  /** One employee, one local day (today by default); null without a record. */
  async dayOf(query: DayQueryDto): Promise<AttendanceView | null> {
    const date = query.date ?? localDate(new Date(), this.timeZone);

    const record = await this.records.findOne({
      where: { employeeId: query.employeeId, attendanceDate: date },
    });

    return record ? this.toView(record) : null;
  }

  /**
   * Removes one employee's whole history, called by the employee service when
   * that employee is deleted. `employee_id` is a cross-service reference with
   * no foreign key, so nothing else would ever cascade this.
   *
   * Idempotent by design: the delete is unconditional, so a retry after a
   * failure further down the chain removes 0 rows and succeeds.
   */
  async deleteByEmployee(employeeId: string): Promise<DeletedAttendance> {
    // Proof keys are read first: after the rows are gone there is no way to
    // find the objects they point at.
    const rows = await this.records.find({
      where: { employeeId },
      select: { proofKey: true },
    });

    const result = await this.records.delete({ employeeId });
    const deleted = result.affected ?? 0;

    if (deleted > 0) {
      this.logger.log(
        `Purged ${deleted} attendance row(s) for employee ${employeeId}`,
      );
    }

    await Promise.all(
      rows
        .map((row) => row.proofKey)
        .filter((key): key is string => Boolean(key))
        .map((key) => this.deleteProof(key)),
    );

    return { employeeId, deleted };
  }

  private async deleteProof(key: string): Promise<void> {
    try {
      await sendRpc(
        this.storage,
        STORAGE_PATTERNS.deleteObject,
        { key },
        'Could not delete the proof photo',
      );
    } catch (error) {
      // The rows are already gone; a leftover object is only garbage.
      this.logger.warn(
        `Could not delete proof photo "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Dates of a year on which the employee was late. */
  async lateDates(query: YearQueryDto): Promise<LateDatesResult> {
    this.assertYear(query.year);

    const rows = await this.records.find({
      where: {
        employeeId: query.employeeId,
        late: true,
        attendanceDate: Between(`${query.year}-01-01`, `${query.year}-12-31`),
      },
      select: { attendanceDate: true },
      order: { attendanceDate: 'ASC' },
    });

    const lateDates = rows.map((row) => row.attendanceDate);

    return {
      employeeId: query.employeeId,
      year: query.year,
      lateCount: lateDates.length,
      lateDates,
    };
  }

  async summary(query: YearQueryDto): Promise<AttendanceSummary> {
    this.assertYear(query.year);

    const rows = await this.records.find({
      where: {
        employeeId: query.employeeId,
        attendanceDate: Between(`${query.year}-01-01`, `${query.year}-12-31`),
      },
      order: { attendanceDate: 'ASC' },
    });

    const count = (status: AttendanceStatus): number =>
      rows.filter((row) => row.status === status).length;

    return {
      employeeId: query.employeeId,
      year: query.year,
      recorded: rows.length,
      onTime: count(AttendanceStatus.ON_TIME),
      late: count(AttendanceStatus.LATE),
      absent: count(AttendanceStatus.ABSENT),
      leave: count(AttendanceStatus.ON_LEAVE),
      lateDates: rows
        .filter((row) => row.late)
        .map((row) => row.attendanceDate),
    };
  }

  /**
   * Creates an ABSENT row for every active employee without a record on the
   * given day (today by default). Runs after the cut-off via cron, and can be
   * triggered manually for a backfill.
   *
   * Skips weekends, holidays and unknown calendars: a wrong "red" is worse
   * than a missing one.
   */
  async markAbsent(dto: MarkAbsentDto = {}): Promise<MarkAbsentResult> {
    const date = dto.date ?? localDate(new Date(), this.timeZone);
    const { type, name } = await this.holidays.dayType(date);

    if (type !== 'WORKING_DAY') {
      const reason =
        type === 'HOLIDAY'
          ? `National holiday: ${name}`
          : type === 'UNKNOWN'
            ? 'Holiday calendar unavailable'
            : 'Weekend';

      this.logger.log(`Absent sweep skipped for ${date} (${reason})`);

      return { date, created: 0, skipped: true, reason };
    }

    const [employees, existing] = await Promise.all([
      sendRpc<ActiveEmployee[]>(
        this.employees,
        EMPLOYEE_PATTERNS.listActive,
        {},
        'Could not list employees',
      ),
      this.records.find({
        where: { attendanceDate: date },
        select: { employeeId: true },
      }),
    ]);

    const recorded = new Set(existing.map((row) => row.employeeId));
    let created = 0;

    for (const employee of employees) {
      if (recorded.has(employee.id)) continue;

      try {
        await this.records.insert({
          employeeId: employee.id,
          attendanceDate: date,
          checkInTime: null,
          status: AttendanceStatus.ABSENT,
          late: false,
          lateMinutes: 0,
          location: null,
          proofKey: null,
          requiredCheckIn: this.requiredCheckIn,
          timezone: this.timeZone,
        });
        created += 1;
      } catch (error) {
        // Another replica won the race for this employee: fine.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    this.logger.log(`Absent sweep ${date}: ${created} record(s) created`);

    return { date, created, skipped: false };
  }

  private async resolveDay(
    date: string,
  ): Promise<{ date: string; dayType: DayType; holidayName: string | null }> {
    const { type, name } = await this.holidays.dayType(date);

    return { date, dayType: type, holidayName: name };
  }

  private assertWorkingDay(
    dayType: DayType,
    holidayName: string | null,
    prefix: string,
  ): void {
    if (dayType === 'WORKING_DAY') return;

    const detail =
      dayType === 'WEEKEND'
        ? 'on weekends'
        : dayType === 'HOLIDAY'
          ? `on a national holiday${holidayName ? ` (${holidayName})` : ''}`
          : 'while the holiday calendar is unavailable';

    throw new RpcException({
      code:
        dayType === 'UNKNOWN' ? RPC_ERRORS.unavailable : RPC_ERRORS.forbidden,
      message: `${prefix} ${detail}`,
    });
  }

  private assertYear(year: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new RpcException({
        code: RPC_ERRORS.invalidArgument,
        message: 'year must be between 2000 and 2100',
      });
    }
  }

  private async toView(record: AttendanceRecord): Promise<AttendanceView> {
    return {
      id: record.id,
      employeeId: record.employeeId,
      attendanceDate: record.attendanceDate,
      checkInTime: record.checkInTime?.toISOString() ?? null,
      status: record.status,
      late: record.late,
      lateMinutes: record.lateMinutes,
      location: record.location,
      proofKey: record.proofKey,
      proofUrl: record.proofKey
        ? await this.signedProofUrl(record.proofKey)
        : null,
      requiredCheckIn: record.requiredCheckIn,
      timezone: record.timezone,
    };
  }

  /**
   * The record is already written at this point in check-in, so a signing
   * failure must not fail the request: the proof key is returned regardless.
   */
  private async signedProofUrl(key: string): Promise<string | null> {
    try {
      const signed = await sendRpc<DownloadUrlResult>(
        this.storage,
        STORAGE_PATTERNS.getDownloadUrl,
        { key },
        'Could not sign the proof URL',
      );

      return signed.downloadUrl;
    } catch (error) {
      this.logger.warn(
        `Could not sign proof "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

}
