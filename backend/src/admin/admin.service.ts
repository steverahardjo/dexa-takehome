import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { dayString } from '../config/clock.js';
import { WORK_START } from '../config/env.js';
import { Attendance } from '../employee/entities/attendance.entity.js';
import { Employee } from '../employee/entities/employee.entity.js';
import {
  CreateEmployeeDto,
  ListEmployeesDto,
  UpdateEmployeeDto,
} from '../employee/dto/employee.dto.js';
import {
  EmployeePresenter,
  positionOf,
  type EmployeeView,
} from '../employee/presenter/employee.presenter.js';
import type { CapturePosition } from '../employee/dto/attendance.dto.js';

/** Rows per page when the admin list is not asked for another size. */
export const PAGE_SIZE = 10;

/** One page of employees, with what a pager needs to render. */
export interface EmployeePage {
  data: EmployeeView[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export interface AttendanceStats {
  /** The local day the numbers describe, `YYYY-MM-DD`. */
  date: string;
  totalEmployees: number;
  attending: number;
  notAttending: number;
}

/** One late day of the year, for the whole company. */
export interface LateDay {
  /** Local day, `YYYY-MM-DD`. */
  date: string;
  /** Employees who checked in late that day. */
  late: number;
}

/**
 * One check-in as the read-only attendance list shows it. A check-in has two
 * addresses: the one on file (where the employee is registered) and the one the
 * photo came from (the absence coordinates).
 */
export interface AttendanceView {
  id: string;
  employeeId: string;
  employeeName: string;
  /** Registered address: the address stored on the employee record. */
  registeredAddress: string | null;
  workDate: string;
  clockInAt: string;
  /** Absence coordinates, `"latitude,longitude"`, ready for a maps link. */
  location: string | null;
  /** The same absence coordinates, structured. */
  position: CapturePosition | null;
  hasEvidence: boolean;
}

/** Escapes the LIKE wildcards of a user supplied term. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/** MySQL's duplicate-key error, whichever layer surfaces it. */
function isDuplicate(error: unknown): boolean {
  const code =
    (error as { code?: string }).code ??
    (error as { driverError?: { code?: string } }).driverError?.code;

  return code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * HRD's side of the data: employee master data and the read-only attendance
 * summary. Attendance is never mutated from here.
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Attendance)
    private readonly attendance: Repository<Attendance>,
    private readonly presenter: EmployeePresenter,
  ) {}

  async list(query: ListEmployeesDto): Promise<EmployeePage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? PAGE_SIZE;

    const builder = this.employees.createQueryBuilder('employee');

    const term = query.q?.trim();

    if (term) {
      builder.andWhere(
        `(employee.name LIKE :term
          OR employee.email LIKE :term
          OR employee.division LIKE :term)`,
        { term: likePattern(term) },
      );
    }

    if (query.role) {
      builder.andWhere('employee.role = :role', { role: query.role });
    }

    builder
      .orderBy('employee.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      data: await this.presenter.many(rows),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string): Promise<EmployeeView> {
    return this.presenter.one(await this.findEntity(id));
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeView> {
    try {
      const saved = await this.employees.save(
        this.employees.create(this.values(dto)),
      );

      return this.presenter.one(saved);
    } catch (error) {
      if (isDuplicate(error)) {
        throw new ConflictException(
          `An employee with email ${dto.email} already exists`,
        );
      }

      throw error;
    }
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    const employee = await this.findEntity(id);

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const holder = await this.employees.findOne({ where: { email } });

      if (holder && holder.id !== id) {
        throw new ConflictException(
          `An employee with email ${email} already exists`,
        );
      }
    }

    try {
      return this.presenter.one(
        await this.employees.save(Object.assign(employee, this.values(dto))),
      );
    } catch (error) {
      if (isDuplicate(error)) {
        throw new ConflictException(
          `An employee with email ${dto.email} already exists`,
        );
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.employees.delete({ id });

    if (!result.affected) {
      throw new NotFoundException(`No employee with id ${id}`);
    }
  }

  /** Today's checked-in / not-yet numbers, counted by employee. */
  async todayStats(): Promise<AttendanceStats> {
    const date = dayString();

    const [totalEmployees, rows] = await Promise.all([
      this.employees.count(),
      this.attendance.find({
        where: { workDate: date },
        select: { empId: true },
      }),
    ]);

    const attending = new Set(rows.map(({ empId }) => empId)).size;

    return {
      date,
      totalEmployees,
      attending,
      notAttending: Math.max(0, totalEmployees - attending),
    };
  }

  /** Check-ins of one day (today by default), newest first. */
  async attendanceFor(date?: string): Promise<AttendanceView[]> {
    const rows = await this.attendance.find({
      where: { workDate: date ?? dayString() },
      relations: { employee: true },
      order: { clockInAt: 'DESC' },
    });

    return rows.map((row) => {
      const position = positionOf(row);

      return {
        id: row.id,
        employeeId: row.empId,
        employeeName: row.employee.name,
        registeredAddress: row.employee.address,
        workDate: row.workDate,
        clockInAt: row.clockInAt.toISOString(),
        location: position
          ? `${position.latitude},${position.longitude}`
          : null,
        position,
        hasEvidence: Boolean(row.evidence),
      };
    });
  }

  /**
   * The days of `year` with at least one late check-in, counted per day. Only the
   * late ones: a day that is not in the list is a day nobody was late. Pass
   * `employeeId` for one person's calendar (the value is then always 1).
   */
  async lateDays(
    year: number = Number(dayString().slice(0, 4)),
    employeeId?: string,
  ): Promise<LateDay[]> {
    const builder = this.attendance
      .createQueryBuilder('attendance')
      .select('attendance.workDate', 'date')
      .addSelect('COUNT(*)', 'late')
      .where('attendance.workDate >= :from', { from: `${year}-01-01` })
      .andWhere('attendance.workDate < :to', { to: `${year + 1}-01-01` })
      // No stored flag: late is the clock-in time, after `WORK_START`.
      .andWhere('TIME(attendance.clockInAt) > :workStart', {
        workStart: `${WORK_START}:00`,
      });

    if (employeeId) {
      builder.andWhere('attendance.empId = :employeeId', { employeeId });
    }

    const rows = await builder
      .groupBy('attendance.workDate')
      .orderBy('attendance.workDate', 'ASC')
      // A `date` column arrives as a Date at local midnight on MySQL.
      .getRawMany<{ date: string | Date; late: string }>();

    return rows.map((row) => ({
      // `date` columns come back as a Date at local midnight; the API speaks days.
      date:
        row.date instanceof Date
          ? dayString(row.date)
          : String(row.date).slice(0, 10),
      late: Number(row.late),
    }));
  }

  private async findEntity(id: string): Promise<Employee> {
    const employee = await this.employees.findOne({ where: { id } });

    if (!employee) {
      throw new NotFoundException(`No employee with id ${id}`);
    }

    return employee;
  }

  /** Only the fields the request actually carried, with a normalized email. */
  private values(dto: Partial<CreateEmployeeDto>): Partial<Employee> {
    const { email, ...rest } = dto;

    const values = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Partial<Employee>;

    if (email !== undefined) {
      values.email = email.trim().toLowerCase();
    }

    return values;
  }
}
