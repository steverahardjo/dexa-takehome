import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsNull, Repository } from 'typeorm';
import { resolveScheduleFromList, type ResolvedSchedule } from './schedule-resolution.js';
import { isValidTimeZone, normalizeTime } from '../../common/time/time.util.js';
import type { CreateScheduleDto, ScheduleQueryDto, UpdateScheduleDto } from '../dto/schedule.dto.js';
import { Division } from '../entities/division.entity.js';
import { Employee } from '../entities/employee.entity.js';
import { WorkSchedule } from '../entities/work-schedule.entity.js';

export { resolveScheduleFromList, type ResolvedSchedule } from './schedule-resolution.js';

@Injectable()
export class ScheduleService {
  static readonly resolveFromList = resolveScheduleFromList;
  private readonly companyDefaults: {
    checkIn: string;
    checkOut: string;
    workingDays: number[];
    timezone: string;
  };

  constructor(
    @InjectRepository(WorkSchedule)
    private readonly scheduleRepository: Repository<WorkSchedule>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.companyDefaults = {
      checkIn: config.get<string>('company.requiredCheckIn', '09:00:00'),
      checkOut: config.get<string>('company.requiredCheckOut', '18:00:00'),
      workingDays: config.get<number[]>('company.workingDays', [1, 2, 3, 4, 5]),
      timezone: config.get<string>('company.timezone', 'UTC'),
    };
  }

  async list(query: ScheduleQueryDto = {}): Promise<WorkSchedule[]> {
    const builder = this.scheduleRepository.createQueryBuilder('schedule');

    if (query.employeeId) {
      builder.andWhere('schedule.employee_id = :employeeId', { employeeId: query.employeeId });
    }
    if (query.divisionId) {
      builder.andWhere('schedule.division_id = :divisionId', { divisionId: query.divisionId });
    }
    if (query.activeOn) {
      builder
        .andWhere('schedule.effective_from <= :date', { date: query.activeOn })
        .andWhere('(schedule.effective_until IS NULL OR schedule.effective_until >= :date)', {
          date: query.activeOn,
        });
    }

    return builder
      .orderBy('schedule.effective_from', 'DESC')
      .addOrderBy('schedule.created_at', 'DESC')
      .getMany();
  }

  async listAll(): Promise<WorkSchedule[]> {
    return this.scheduleRepository.find({ order: { effectiveFrom: 'DESC' } });
  }

  async create(dto: CreateScheduleDto): Promise<WorkSchedule> {
    await this.assertScope(dto);
    this.assertWindow(dto.effectiveFrom, dto.effectiveUntil ?? null);

    const timezone = dto.timezone ?? this.companyDefaults.timezone;
    if (!isValidTimeZone(timezone)) {
      throw new BadRequestException(`Unknown IANA timezone: ${timezone}`);
    }

    const requiredCheckIn = normalizeTime(dto.requiredCheckIn ?? this.companyDefaults.checkIn);
    const requiredCheckOut = normalizeTime(dto.requiredCheckOut ?? this.companyDefaults.checkOut);
    if (requiredCheckIn >= requiredCheckOut) {
      throw new BadRequestException('requiredCheckIn must be before requiredCheckOut');
    }

    await this.assertNoOverlap({
      employeeId: dto.employeeId ?? null,
      divisionId: dto.divisionId ?? null,
      effectiveFrom: dto.effectiveFrom,
      effectiveUntil: dto.effectiveUntil ?? null,
    });

    const schedule = await this.scheduleRepository.save(
      this.scheduleRepository.create({
        employeeId: dto.employeeId ?? null,
        divisionId: dto.divisionId ?? null,
        effectiveFrom: dto.effectiveFrom,
        effectiveUntil: dto.effectiveUntil ?? null,
        workingDays: dto.workingDays ?? this.companyDefaults.workingDays,
        requiredCheckIn,
        requiredCheckOut,
        timezone,
      }),
    );

    this.events.emit('employee.schedule.updated', {
      employeeId: schedule.employeeId,
      divisionId: schedule.divisionId,
      scheduleId: schedule.id,
    });

    return schedule;
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<WorkSchedule> {
    const schedule = await this.getOrThrow(id);
    const effectiveFrom = dto.effectiveFrom ?? schedule.effectiveFrom;
    const effectiveUntil =
      dto.effectiveUntil === undefined ? schedule.effectiveUntil : dto.effectiveUntil;

    this.assertWindow(effectiveFrom, effectiveUntil);

    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone)) {
      throw new BadRequestException(`Unknown IANA timezone: ${dto.timezone}`);
    }

    const requiredCheckIn = normalizeTime(dto.requiredCheckIn ?? schedule.requiredCheckIn);
    const requiredCheckOut = normalizeTime(dto.requiredCheckOut ?? schedule.requiredCheckOut);
    if (requiredCheckIn >= requiredCheckOut) {
      throw new BadRequestException('requiredCheckIn must be before requiredCheckOut');
    }

    await this.assertNoOverlap(
      {
        employeeId: schedule.employeeId,
        divisionId: schedule.divisionId,
        effectiveFrom,
        effectiveUntil,
      },
      id,
    );

    Object.assign(schedule, {
      effectiveFrom,
      effectiveUntil,
      workingDays: dto.workingDays ?? schedule.workingDays,
      requiredCheckIn,
      requiredCheckOut,
      timezone: dto.timezone ?? schedule.timezone,
    });

    const saved = await this.scheduleRepository.save(schedule);
    this.events.emit('employee.schedule.updated', {
      employeeId: saved.employeeId,
      divisionId: saved.divisionId,
      scheduleId: saved.id,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const schedule = await this.getOrThrow(id);
    await this.scheduleRepository.remove(schedule);
    this.events.emit('employee.schedule.updated', {
      employeeId: schedule.employeeId,
      divisionId: schedule.divisionId,
      scheduleId: schedule.id,
    });
  }

  async resolveForEmployee(employeeId: string, date: string): Promise<ResolvedSchedule | null> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: { divisions: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.resolveForEmployees([employee], date).then(
      (resolved) => resolved.get(employeeId) ?? null,
    );
  }

  /** Bulk resolution used by the dashboard and yearly projections. */
  async resolveForEmployees(
    employees: Employee[],
    date: string,
  ): Promise<Map<string, ResolvedSchedule | null>> {
    const schedules = await this.listAll();
    const resolved = new Map<string, ResolvedSchedule | null>();

    for (const employee of employees) {
      const divisionIds = (employee.divisions ?? []).map((division) => division.id);
      resolved.set(
        employee.id,
        resolveScheduleFromList(schedules, employee.id, divisionIds, date),
      );
    }

    return resolved;
  }

  async getOrThrow(id: string): Promise<WorkSchedule> {
    const schedule = await this.scheduleRepository.findOne({ where: { id } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  private async assertScope(dto: CreateScheduleDto): Promise<void> {
    if (dto.employeeId && dto.divisionId) {
      throw new BadRequestException(
        'A schedule belongs to either an employee or a division, not both',
      );
    }
    if (dto.employeeId) {
      const exists = await this.employeeRepository.exists({ where: { id: dto.employeeId } });
      if (!exists) throw new NotFoundException('Employee not found');
    }
    if (dto.divisionId) {
      const exists = await this.divisionRepository.exists({ where: { id: dto.divisionId } });
      if (!exists) throw new NotFoundException('Division not found');
    }
  }

  private assertWindow(effectiveFrom: string, effectiveUntil: string | null): void {
    if (effectiveUntil && effectiveUntil < effectiveFrom) {
      throw new BadRequestException('effectiveUntil must not be before effectiveFrom');
    }
  }

  private async assertNoOverlap(
    input: {
      employeeId: string | null;
      divisionId: string | null;
      effectiveFrom: string;
      effectiveUntil: string | null;
    },
    excludeId?: string,
  ): Promise<void> {
    const builder = this.scheduleRepository
      .createQueryBuilder('schedule')
      .where('schedule.effective_from <= :until', {
        until: input.effectiveUntil ?? '9999-12-31',
      })
      .andWhere('(schedule.effective_until IS NULL OR schedule.effective_until >= :from)', {
        from: input.effectiveFrom,
      });

    if (input.employeeId) {
      builder.andWhere('schedule.employee_id = :employeeId', { employeeId: input.employeeId });
    } else {
      builder.andWhere('schedule.employee_id IS NULL');
      if (input.divisionId) {
        builder.andWhere('schedule.division_id = :divisionId', {
          divisionId: input.divisionId,
        });
      } else {
        builder.andWhere('schedule.division_id IS NULL');
      }
    }

    if (excludeId) {
      builder.andWhere('schedule.id <> :excludeId', { excludeId });
    }

    const overlapping = await builder.getCount();
    if (overlapping > 0) {
      throw new ConflictException(
        'Another schedule already covers this scope and date range',
      );
    }
  }

  async findCompanyDefault(): Promise<WorkSchedule | null> {
    return this.scheduleRepository.findOne({
      where: { employeeId: IsNull(), divisionId: IsNull() },
      order: { effectiveFrom: 'DESC' },
    });
  }
}
