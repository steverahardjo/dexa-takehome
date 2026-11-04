import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { clockString, dayString } from '../../config/clock.js';
import { WORK_START } from '../../config/env.js';
import { Attendance } from '../entities/attendance.entity.js';
import type { Division, Employee, Role } from '../entities/employee.entity.js';
import type { CapturePosition } from '../dto/attendance.dto.js';
import { microDegrees } from '../geo.js';

/** Exactly the `Employee` shape the frontend renders. */
export interface EmployeeView {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  division: Division;
  /** Registered address: where the employee is on file. */
  address: string;
  /** `YYYY-MM-DD`. */
  contractExpiry: string;
  /** `HH:mm` local time of today's check-in, or null. */
  clockInAt: string | null;
  /** Today's check-in landed after `WORK_START`: the card paints itself red. */
  late: boolean;
  avatar?: string;
  /** Today's photo evidence, when there is a check-in. */
  evidence?: string;
  /** Absence coordinates: where the phone was when today's photo was sent. */
  checkInPosition?: CapturePosition | null;
}

/** A position read back from the two `decimal` columns. */
export function positionOf(
  row: Pick<Attendance, 'latitude' | 'longitude' | 'accuracy'>,
): CapturePosition | null {
  const latitude = microDegrees(row.latitude);
  const longitude = microDegrees(row.longitude);

  if (latitude === null || longitude === null) return null;

  return {
    latitude,
    longitude,
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
  };
}

/** Today's first check-in per employee, for the list and the single view. */
@Injectable()
export class EmployeePresenter {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendance: Repository<Attendance>,
  ) {}

  async one(employee: Employee): Promise<EmployeeView> {
    const [view] = await this.many([employee]);

    return view;
  }

  async many(employees: Employee[]): Promise<EmployeeView[]> {
    if (employees.length === 0) return [];

    const rows = await this.attendance.find({
      where: {
        empId: In(employees.map(({ id }) => id)),
        workDate: dayString(),
      },
      order: { clockInAt: 'ASC' },
    });

    const firstToday = new Map<string, Attendance>();

    for (const row of rows) {
      if (!firstToday.has(row.empId)) firstToday.set(row.empId, row);
    }

    return employees.map((employee) =>
      this.view(employee, firstToday.get(employee.id) ?? null),
    );
  }

  private view(employee: Employee, today: Attendance | null): EmployeeView {
    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? '',
      role: employee.role,
      division: employee.division,
      address: employee.address ?? '',
      contractExpiry: employee.contractExpiry ?? '',
      clockInAt: today ? clockString(today.clockInAt) : null,
      late: today ? clockString(today.clockInAt) > WORK_START : false,
      avatar: employee.avatar ?? undefined,
      evidence: today?.evidence ?? undefined,
      checkInPosition: today ? positionOf(today) : null,
    };
  }
}
