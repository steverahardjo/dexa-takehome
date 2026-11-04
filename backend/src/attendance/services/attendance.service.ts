import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { EmploymentStatus } from '../../common/enums/roles.enum.js';
import {
  paginate,
  type Paginated,
} from '../../common/interfaces/pagination.interface.js';
import {
  evaluateLateness,
  localDate,
  weekdayOf,
} from '../../common/time/time.util.js';
import { EmployeeService } from '../../employee/services/employee.service.js';
import {
  ScheduleService,
  type ResolvedSchedule,
} from '../../employee/services/schedule.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../storage/storage.interface.js';
import type {
  AttendanceQueryDto,
  CheckInDto,
  CheckOutDto,
  CorrectAttendanceDto,
} from '../dto/attendance.dto.js';
import { AttendanceCorrection } from '../entities/attendance-correction.entity.js';
import { AttendanceRecord } from '../entities/attendance-record.entity.js';

interface TodaySchedule {
  date: string;
  schedule: ResolvedSchedule | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

@Injectable()
export class AttendanceService {
  private readonly companyTimezone: string;

  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
    @InjectRepository(AttendanceCorrection)
    private readonly correctionRepository: Repository<AttendanceCorrection>,
    private readonly dataSource: DataSource,
    private readonly employeeService: EmployeeService,
    private readonly scheduleService: ScheduleService,
    private readonly events: EventEmitter2,
    config: ConfigService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {
    this.companyTimezone = config.get<string>('company.timezone', 'Asia/Jakarta');
  }

  async checkIn(
    employeeId: string,
    dto: CheckInDto,
    file?: Express.Multer.File,
  ): Promise<AttendanceRecord> {
    const employee = await this.employeeService.getById(employeeId);
    if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
      throw new ForbiddenException('Only active employees can check in');
    }

    const now = new Date();
    const { date, schedule } = await this.resolveTodaySchedule(employeeId, now);

    if (!schedule) {
      throw new ForbiddenException('No work schedule applies to you today');
    }
    if (!schedule.workingDays.includes(weekdayOf(date))) {
      throw new ForbiddenException('You are not scheduled to work today');
    }

    const existing = await this.attendanceRepository.findOne({
      where: { employeeId, attendanceDate: date },
    });
    if (existing) {
      throw new ConflictException('You have already checked in today');
    }

    const lateness = evaluateLateness(now, schedule.requiredCheckIn, schedule.timezone);

    let uploaded: { key: string; url: string } | undefined;
    if (file) {
      const extension = this.extensionFor(file.mimetype);
      uploaded = await this.storage.upload(
        file,
        `attendance/${employeeId}/${date}/${randomUUID()}.${extension}`,
      );
    }

    const record = this.attendanceRepository.create({
      employeeId,
      attendanceDate: date,
      checkInTime: now,
      checkOutTime: null,
      late: lateness.late,
      lateMinutes: lateness.lateMinutes,
      location: dto.location?.trim() || null,
      pictureUrl: uploaded?.url ?? null,
      requiredCheckIn: schedule.requiredCheckIn,
      requiredCheckOut: schedule.requiredCheckOut,
      timezone: schedule.timezone,
    });

    let saved: AttendanceRecord;
    try {
      saved = await this.dataSource.transaction((manager) =>
        manager.getRepository(AttendanceRecord).save(record),
      );
    } catch (error) {
      if (uploaded) await this.storage.delete(uploaded.key);
      if (isUniqueViolation(error)) {
        throw new ConflictException('You have already checked in today');
      }
      throw error;
    }

    this.events.emit('attendance.checked-in', {
      attendanceId: saved.id,
      employeeId,
      attendanceDate: date,
    });

    return saved;
  }

  async checkOut(employeeId: string, dto: CheckOutDto): Promise<AttendanceRecord> {
    const now = new Date();
    const { date } = await this.resolveTodaySchedule(employeeId, now);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AttendanceRecord);
      const record = await repository.findOne({
        where: { employeeId, attendanceDate: date },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        throw new NotFoundException('No check-in was recorded for today');
      }
      if (!record.checkInTime) {
        throw new BadRequestException('Check-out requires an existing check-in');
      }
      if (record.checkOutTime) {
        throw new ConflictException('You have already checked out today');
      }
      if (record.checkInTime.getTime() > now.getTime()) {
        throw new BadRequestException('Check-out cannot precede check-in');
      }

      record.checkOutTime = now;
      if (dto.location !== undefined) {
        record.location = dto.location.trim() || record.location;
      }

      return repository.save(record);
    });

    this.events.emit('attendance.checked-out', {
      attendanceId: saved.id,
      employeeId,
      attendanceDate: saved.attendanceDate,
    });

    return saved;
  }

  async correct(
    id: string,
    dto: CorrectAttendanceDto,
    correctedBy: string,
  ): Promise<AttendanceRecord> {
    if (dto.checkInTime !== undefined) this.parseInstant(dto.checkInTime, 'checkInTime');
    if (dto.checkOutTime !== undefined) this.parseInstant(dto.checkOutTime, 'checkOutTime');

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AttendanceRecord);
      const record = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) throw new NotFoundException('Attendance record not found');

      const previousValues = this.auditSnapshot(record);

      if (dto.checkInTime !== undefined) {
        record.checkInTime = this.parseInstant(dto.checkInTime, 'checkInTime');
      }
      if (dto.checkOutTime !== undefined) {
        record.checkOutTime = this.parseInstant(dto.checkOutTime, 'checkOutTime');
      }
      if (dto.location !== undefined) {
        record.location = dto.location.trim() || null;
      }

      if (
        record.checkInTime &&
        record.checkOutTime &&
        record.checkOutTime.getTime() < record.checkInTime.getTime()
      ) {
        throw new BadRequestException('checkOutTime cannot precede checkInTime');
      }

      if (record.checkInTime && record.requiredCheckIn && record.timezone) {
        const lateness = evaluateLateness(
          record.checkInTime,
          record.requiredCheckIn,
          record.timezone,
        );
        record.late = lateness.late;
        record.lateMinutes = lateness.lateMinutes;
      }

      const newValues = this.auditSnapshot(record);
      const updated = await repository.save(record);

      await manager.getRepository(AttendanceCorrection).save({
        attendanceId: updated.id,
        correctedBy,
        reason: dto.reason,
        previousValues,
        newValues,
      });

      return updated;
    });

    this.events.emit('attendance.corrected', {
      attendanceId: saved.id,
      employeeId: saved.employeeId,
      attendanceDate: saved.attendanceDate,
    });

    return saved;
  }

  async findForEmployee(
    employeeId: string,
    query: AttendanceQueryDto,
  ): Promise<Paginated<AttendanceRecord>> {
    await this.employeeService.getById(employeeId);

    const builder = this.attendanceRepository
      .createQueryBuilder('record')
      .where('record.employee_id = :employeeId', { employeeId })
      .orderBy('record.attendance_date', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.from) {
      builder.andWhere('record.attendance_date >= :from', { from: query.from });
    }
    if (query.to) {
      builder.andWhere('record.attendance_date <= :to', { to: query.to });
    }

    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findForEmployeeDate(employeeId: string, date: string): Promise<AttendanceRecord> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be a YYYY-MM-DD value');
    }

    const record = await this.attendanceRepository.findOne({
      where: { employeeId, attendanceDate: date },
    });
    if (!record) throw new NotFoundException('No attendance recorded for that date');
    return record;
  }

  async findForDate(date: string): Promise<AttendanceRecord[]> {
    return this.attendanceRepository.find({ where: { attendanceDate: date } });
  }

  async findForRange(
    employeeId: string,
    from: string,
    to: string,
  ): Promise<AttendanceRecord[]> {
    return this.attendanceRepository
      .createQueryBuilder('record')
      .where('record.employee_id = :employeeId', { employeeId })
      .andWhere('record.attendance_date BETWEEN :from AND :to', { from, to })
      .orderBy('record.attendance_date', 'ASC')
      .getMany();
  }

  async getOrThrow(id: string): Promise<AttendanceRecord> {
    const record = await this.attendanceRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Attendance record not found');
    return record;
  }

  /** Today's date and schedule, resolved in the schedule's own timezone. */
  async resolveTodaySchedule(employeeId: string, now = new Date()): Promise<TodaySchedule> {
    const companyDate = localDate(now, this.companyTimezone);
    const schedule = await this.scheduleService.resolveForEmployee(employeeId, companyDate);

    if (!schedule) {
      return { date: companyDate, schedule: null };
    }

    const scheduleDate = localDate(now, schedule.timezone);
    if (scheduleDate !== companyDate) {
      const corrected = await this.scheduleService.resolveForEmployee(employeeId, scheduleDate);
      if (corrected) return { date: scheduleDate, schedule: corrected };
    }

    return { date: scheduleDate, schedule };
  }

  private auditSnapshot(record: AttendanceRecord): Record<string, unknown> {
    return {
      attendanceDate: record.attendanceDate,
      checkInTime: record.checkInTime?.toISOString() ?? null,
      checkOutTime: record.checkOutTime?.toISOString() ?? null,
      late: record.late,
      lateMinutes: record.lateMinutes,
      location: record.location,
      pictureUrl: record.pictureUrl,
    };
  }

  private parseInstant(value: string, field: string): Date | null {
    if (value === null || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO-8601 timestamp`);
    }
    return parsed;
  }

  private extensionFor(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }
}
