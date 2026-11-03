import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { dayString } from '../config/clock.js';
import { env } from '../config/env.js';
import { Attendance } from '../employee/entities/attendance.entity.js';
import { Employee, type Role } from '../employee/entities/employee.entity.js';

interface DemoEmployee {
  name: string;
  email: string;
  phone: string;
  role: Role;
  division: string;
  address: string;
  contractExpiry: string;
  avatar: string;
  /** Local `HH:mm` the demo check-in happened at. */
  clockIn: string;
}

/**
 * The same three people the frontend used to seed in localStorage, so a fresh
 * database renders the same dashboard. Inserted only when missing.
 */
const DEMO_EMPLOYEES: DemoEmployee[] = [
  {
    name: 'John Doe',
    email: 'john@company.com',
    phone: '+62 812 3456 7890',
    role: 'HR Admin',
    division: 'People Operations',
    address: 'Jl. Sudirman 12, Jakarta',
    contractExpiry: '2026-12-31',
    avatar: 'https://i.pravatar.cc/160?img=12',
    clockIn: '07:52',
  },
  {
    name: 'Steve jevon Rahardjo',
    email: 'steve.jevon.r@gmail.com',
    phone: '+62 812 3456 7890',
    role: 'HR Admin',
    division: 'People Operations',
    address: 'Jl. Sudirman 12, Jakarta',
    contractExpiry: '2026-12-31',
    avatar: 'https://i.pravatar.cc/160?img=12',
    clockIn: '07:52',
  },
  {
    name: 'Jane Smith',
    email: 'jane@company.com',
    phone: '+62 812 4567 8901',
    role: 'Employee',
    division: 'Engineering',
    address: 'Jl. Kemang 4, Jakarta',
    contractExpiry: '2026-11-15',
    avatar: 'https://i.pravatar.cc/160?img=45',
    clockIn: '08:55',
  },
  {
    name: 'Michael Tan',
    email: 'michael@company.com',
    phone: '+62 812 5678 9012',
    role: 'Manager',
    division: 'Engineering',
    address: 'Jl. Senopati 8, Jakarta',
    contractExpiry: '2027-03-20',
    avatar: 'https://i.pravatar.cc/160?img=33',
    clockIn: '10:14',
  },
];

/** `HH:mm` today in the container's timezone. */
function todayAt(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date();

  at.setHours(hours, minutes, 0, 0);

  return at;
}

/**
 * Idempotent demo data. Each container runs it on boot; the unique indexes keep
 * a race between them from inserting twice.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Attendance)
    private readonly attendance: Repository<Attendance>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!env.bool('SEED_DEMO', true)) return;

    let seeded = 0;

    for (const demo of DEMO_EMPLOYEES) {
      const existing = await this.employees.findOne({
        where: { email: demo.email },
      });

      const employee = existing ?? (await this.insert(demo));

      if (!existing && employee) seeded += 1;
      if (!employee) continue;

      await this.seedCheckIn(employee, demo);
    }

    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} demo employee(s)`);
    }
  }

  private async insert(demo: DemoEmployee): Promise<Employee | null> {
    try {
      return await this.employees.save(
        this.employees.create({
          name: demo.name,
          email: demo.email,
          phone: demo.phone,
          role: demo.role,
          division: demo.division,
          address: demo.address,
          contractExpiry: demo.contractExpiry,
          avatar: demo.avatar,
        }),
      );
    } catch {
      // Another container inserted it first: use whatever is stored.
      return this.employees.findOne({ where: { email: demo.email } });
    }
  }

  /** Today's check-in for the demo, only when the row is still missing. */
  private async seedCheckIn(
    employee: Employee,
    demo: DemoEmployee,
  ): Promise<void> {
    const workDate = dayString();
    const existing = await this.attendance.findOne({
      where: { empId: employee.id, workDate },
    });

    if (existing) return;

    const clockInAt = todayAt(demo.clockIn);

    try {
      await this.attendance.insert({
        empId: employee.id,
        workDate,
        clockInAt,
        evidence: `https://picsum.photos/seed/wfh-${employee.id}/900/1200`,
        latitude: null,
        longitude: null,
        accuracy: null,
        capturedAt: null,
        source: 'manual',
      });
    } catch {
      // The unique (emp_id, work_date) index means another container won.
    }
  }
}
