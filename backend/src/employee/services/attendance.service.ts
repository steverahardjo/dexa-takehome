import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { dayString } from '../../config/clock.js';
import type { CapturePosition } from '../dto/attendance.dto.js';
import { Attendance } from '../entities/attendance.entity.js';
import type { Employee } from '../entities/employee.entity.js';

export interface RecordCheckIn {
  evidence?: string | null;
  position?: CapturePosition | null;
  /** The phone's clock, kept as evidence only. */
  capturedAt?: Date | null;
  source: 'capture' | 'manual';
  /** Replace today's existing check-in instead of leaving it alone. */
  replace?: boolean;
}

/** Writes and reads check-ins. The time always comes from the server clock. */
@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendance: Repository<Attendance>,
  ) {}

  /**
   * Today's check-in for `employee`. A second call keeps the first one unless
   * `replace` is set, so two tabs can't overwrite each other silently.
   */
  async record(employee: Employee, input: RecordCheckIn): Promise<Attendance> {
    const now = new Date();
    const workDate = dayString(now);
    const position = input.position ?? null;

    const values = {
      clockInAt: now,
      evidence: input.evidence ?? null,
      latitude: position ? String(position.latitude) : null,
      longitude: position ? String(position.longitude) : null,
      accuracy: position?.accuracy ?? null,
      capturedAt: input.capturedAt ?? null,
      source: input.source,
    };

    const existing = await this.findOne(employee.id, workDate);

    if (existing) {
      if (!input.replace) return existing;

      return this.attendance.save(Object.assign(existing, values));
    }

    try {
      return await this.attendance.save(
        this.attendance.create({ empId: employee.id, workDate, ...values }),
      );
    } catch (error) {
      // Two requests raced on the unique (emp_id, work_date) index: the winner
      // is the check-in, the loser returns it instead of failing.
      const winner = await this.findOne(employee.id, workDate);

      if (winner) return winner;

      throw error;
    }
  }

  /** The check-ins of one employee, newest first. */
  history(employeeId: string, date?: string): Promise<Attendance[]> {
    return this.attendance.find({
      where: date ? { empId: employeeId, workDate: date } : { empId: employeeId },
      order: { clockInAt: 'DESC' },
      take: 100,
    });
  }

  findOne(employeeId: string, workDate: string): Promise<Attendance | null> {
    return this.attendance.findOne({
      where: { empId: employeeId, workDate },
    });
  }
}
