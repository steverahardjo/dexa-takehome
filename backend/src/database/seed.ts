import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { dayString } from '../config/clock.js';
import { env } from '../config/env.js';
import { Attendance } from '../employee/entities/attendance.entity.js';
import {
  Employee,
  ROLES,
  type Role,
} from '../employee/entities/employee.entity.js';

/** One employee as written in `seed-data.json`. */
interface SeedEmployee {
  name: string;
  email: string;
  phone?: string;
  role?: Role;
  division?: string;
  address?: string;
  /** `YYYY-MM-DD`. */
  contractExpiry?: string;
  avatar?: string;
}

/**
 * One check-in as written in `seed-data.json` or `attendance.json`. A day is
 * given as an absolute `date` (`YYYY-MM-DD`, from the generator) or, for the
 * older hand-written rows, as `daysAgo` relative to today.
 */
interface SeedAttendance {
  /** The employee's login address; `employeeEmail` is the older spelling. */
  email?: string;
  employeeEmail?: string;
  /** `YYYY-MM-DD`. When absent, `daysAgo` decides the day. */
  date?: string;
  /** 0 is today, 1 yesterday, ... */
  daysAgo?: number;
  /** Local `HH:mm` the check-in happened at. */
  clockIn: string;
  source?: 'manual' | 'capture';
  /** The phone's clock, `HH:mm` on the same day. */
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  /** Evidence link; `evidence` is the older spelling. */
  proof?: string;
  evidence?: string;
}

interface SeedFile {
  employees: SeedEmployee[];
  attendances: SeedAttendance[];
  /** One photo every seeded check-in shares, instead of repeating it per row. */
  evidence?: string;
}

const logger = new Logger('Seed');

const SEED_FILE = env.string(
  'SEED_FILE',
  fileURLToPath(new URL('./seed-data.json', import.meta.url)),
);

/** The same connection `DatabaseModule` registers, for a script outside Nest. */
function createDataSource(): DataSource {
  return new DataSource({
    type: 'mysql',
    host: env.string('DB_HOST', 'localhost'),
    port: env.int('DB_PORT', 3306),
    username: env.string('DB_USERNAME', 'attendance'),
    password: env.string('DB_PASSWORD', 'attend1234'),
    database: env.string('DB_DATABASE', 'absences'),
    charset: 'utf8mb4',
    entities: [Employee, Attendance],
    synchronize: env.bool(
      'DB_SYNCHRONIZE',
      process.env.NODE_ENV !== 'production',
    ),
    logging: env.bool('DB_LOGGING', false),
  });
}

/** Local day `daysAgo` days before today. */
/** `"2026-02-11"` as a local date — never `new Date(string)`, that is UTC. */
function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Expected a YYYY-MM-DD date, got "${value}"`);
  }

  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day);
}

/** The day a row belongs to: its `date`, else `daysAgo` before today. */
function dayOf(entry: SeedAttendance): Date {
  if (entry.date) {
    return parseDay(entry.date);
  }

  return offsetDay(entry.daysAgo ?? 0);
}

function offsetDay(daysAgo: number): Date {
  const date = new Date();

  date.setDate(date.getDate() - daysAgo);

  return date;
}

/** `HH:mm` on `day`, in the local timezone every container shares. */
function atTime(day: Date, time: string): Date {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Expected an HH:mm time, got "${time}"`);
  }

  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date(day);

  at.setHours(hours, minutes, 0, 0);

  return at;
}

function decimal(value: number | undefined): string | null {
  return value === undefined ? null : String(value);
}

/** Seeds employees and their check-ins; safe to run more than once. */
async function seedEmployees(
  dataSource: DataSource,
  seed: SeedFile,
): Promise<Map<string, Employee>> {
  const employees = dataSource.getRepository(Employee);
  const stored = new Map<string, Employee>();

  for (const entry of seed.employees) {
    const role = (entry.role ?? '').trim();
    const known = ROLES.find((candidate) => candidate === role);

    if (role && !known) {
      logger.warn(
        `${entry.email}: unknown role "${role}", seeding as Employee`,
      );
    }

    const assigned: Role = known ?? 'Employee';

    const existing = await employees.findOne({
      where: { email: entry.email },
    });

    if (existing) {
      stored.set(existing.email, existing);
      continue;
    }

    const saved = await employees.save(
      employees.create({
        name: entry.name,
        email: entry.email,
        phone: entry.phone ?? null,
        role: assigned,
        division: entry.division ?? null,
        address: entry.address ?? null,
        contractExpiry: entry.contractExpiry ?? null,
        avatar: entry.avatar ?? null,
      }),
    );

    stored.set(saved.email, saved);
  }

  return stored;
}

async function seedAttendance(
  dataSource: DataSource,
  seed: SeedFile,
  employees: Map<string, Employee>,
): Promise<{ inserted: number; skipped: number; missing: number }> {
  const attendance = dataSource.getRepository(Attendance);
  const result = { inserted: 0, skipped: 0, missing: 0 };

  for (const entry of seed.attendances) {
    const email = (entry.email ?? entry.employeeEmail ?? '')
      .trim()
      .toLowerCase();
    const employee = employees.get(email);

    if (!employee) {
      logger.warn(`Skipping check-in for unknown employee ${email}`);
      result.missing += 1;
      continue;
    }

    const day = dayOf(entry);
    const workDate = dayString(day);
    const existing = await attendance.findOne({
      where: { empId: employee.id, workDate },
    });

    if (existing) {
      result.skipped += 1;
      continue;
    }

    await attendance.insert({
      empId: employee.id,
      workDate,
      clockInAt: atTime(day, entry.clockIn),
      evidence:
        entry.proof ??
        entry.evidence ??
        seed.evidence ??
        `https://picsum.photos/seed/wfh-${employee.id}/900/1200`,
      latitude: decimal(entry.latitude),
      longitude: decimal(entry.longitude),
      accuracy: entry.accuracy ?? null,
      capturedAt: entry.capturedAt ? atTime(day, entry.capturedAt) : null,
      source: entry.source ?? 'manual',
    });

    result.inserted += 1;
  }

  return result;
}

try {
  const seed: SeedFile = JSON.parse(await readFile(SEED_FILE, 'utf8'));
  const dataSource = createDataSource();

  await dataSource.initialize();

  try {
    const employees = await seedEmployees(dataSource, seed);
    const attendance = await seedAttendance(dataSource, seed, employees);

    logger.log(
      `Read ${SEED_FILE}: ${seed.employees.length} employee(s), ` +
        `${seed.attendances.length} attendance record(s)`,
    );
    logger.log(
      `Employees stored: ${employees.size}. ` +
        `Check-ins inserted: ${attendance.inserted}, ` +
        `already present: ${attendance.skipped}, ` +
        `skipped (no employee): ${attendance.missing}`,
    );
  } finally {
    await dataSource.destroy();
  }
} catch (error) {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
