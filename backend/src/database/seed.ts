/**
 * Idempotent seed:
 *   - divisions and the company default schedule (09:00–18:00)
 *   - one MASTER_ADMIN identity (never created through a public endpoint)
 *   - optional demo staff with attendance history and approved leave
 *
 * Run with `npm run seed` (compiled) or `docker compose run --rm seed`.
 * Reporting projections are rebuilt by the API on boot (`reconcile`).
 */
import { IsNull } from 'typeorm';
import { AppDataSource } from './data-source.js';
import { configuration } from '../config/configuration.js';
import { EmploymentStatus, IdentityStatus, LeaveStatus, Role } from '../common/enums/roles.enum.js';
import {
  addDays,
  localDate,
  minutesBetween,
  weekdayOf,
} from '../common/time/time.util.js';
import { Division } from '../employee/entities/division.entity.js';
import { Employee } from '../employee/entities/employee.entity.js';
import { WorkSchedule } from '../employee/entities/work-schedule.entity.js';
import { LeaveRequest } from '../employee/entities/leave-request.entity.js';
import { Identity } from '../auth/entities/identity.entity.js';
import { AttendanceRecord } from '../attendance/entities/attendance-record.entity.js';

const config = configuration();
const timezone = config.company.timezone;

interface DemoEmployee {
  fullName: string;
  email: string;
  division: string;
  employmentStatus: EmploymentStatus;
  terminatedAt?: string;
  onLeave?: boolean;
}

const DEMO_EMPLOYEES: DemoEmployee[] = [
  { fullName: 'Aisha Rahman', email: 'aisha.rahman@example.com', division: 'Engineering', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Budi Santoso', email: 'budi.santoso@example.com', division: 'Engineering', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Chen Wei', email: 'chen.wei@example.com', division: 'Engineering', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Dewi Lestari', email: 'dewi.lestari@example.com', division: 'Finance', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Eko Prasetyo', email: 'eko.prasetyo@example.com', division: 'Finance', employmentStatus: EmploymentStatus.ACTIVE, onLeave: true },
  { fullName: 'Farah Idris', email: 'farah.idris@example.com', division: 'Operations', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Gilang Ramadhan', email: 'gilang.ramadhan@example.com', division: 'Operations', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Hana Kusuma', email: 'hana.kusuma@example.com', division: 'Operations', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Indra Wijaya', email: 'indra.wijaya@example.com', division: 'People', employmentStatus: EmploymentStatus.ACTIVE },
  { fullName: 'Jordan Lee', email: 'jordan.lee@example.com', division: 'People', employmentStatus: EmploymentStatus.TERMINATED },
];

const DIVISIONS = [
  { name: 'Engineering', description: 'Product and platform engineering' },
  { name: 'Finance', description: 'Accounting, payroll and reporting' },
  { name: 'Operations', description: 'Day-to-day company operations' },
  { name: 'People', description: 'Human resources and administration' },
];

/** Deterministic PRNG so repeated local seeds produce the same demo history. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function zoneOffsetMinutes(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );

  return (asUtc - instant.getTime()) / 60_000;
}

function zonedToUtc(date: string, time: string, zone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = zoneOffsetMinutes(new Date(guess), zone);
  return new Date(guess - offset * 60_000);
}

function timeAfter(base: string, extraMinutes: number): string {
  const [hours, minutes] = base.split(':').map(Number);
  const total = hours * 60 + minutes + extraMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  const now = new Date();
  const today = localDate(now, timezone);
  const currentYear = Number(today.slice(0, 4));
  const yearStart = `${currentYear}-01-02`;

  const divisionRepository = AppDataSource.getRepository(Division);
  const employeeRepository = AppDataSource.getRepository(Employee);
  const scheduleRepository = AppDataSource.getRepository(WorkSchedule);
  const identityRepository = AppDataSource.getRepository(Identity);
  const attendanceRepository = AppDataSource.getRepository(AttendanceRecord);
  const leaveRepository = AppDataSource.getRepository(LeaveRequest);

  // ---- divisions -----------------------------------------------------------
  const divisions = new Map<string, Division>();
  for (const input of DIVISIONS) {
    const existing = await divisionRepository.findOne({ where: { name: input.name } });
    divisions.set(
      input.name,
      existing ?? (await divisionRepository.save(divisionRepository.create(input))),
    );
  }

  // ---- company default schedule -------------------------------------------
  const existingDefault = await scheduleRepository.findOne({
    where: { employeeId: IsNull(), divisionId: IsNull() },
  });
  if (!existingDefault) {
    await scheduleRepository.save(
      scheduleRepository.create({
        employeeId: null,
        divisionId: null,
        effectiveFrom: '2000-01-01',
        effectiveUntil: null,
        workingDays: config.company.workingDays,
        requiredCheckIn: config.company.requiredCheckIn,
        requiredCheckOut: config.company.requiredCheckOut,
        timezone,
      }),
    );
  }

  // ---- master admin --------------------------------------------------------
  const masterEmail = (
    config.seed.masterAdminEmail ||
    process.env.NEXT_PUBLIC_DEMO_EMAIL ||
    'master@absences.local'
  )
    .trim()
    .toLowerCase();

  const existingIdentity = await identityRepository.findOne({ where: { email: masterEmail } });
  if (existingIdentity) {
    console.log(`Seed already applied: identity ${masterEmail} exists.`);
    await resetEmployeeNumberSequence();
    await AppDataSource.destroy();
    return;
  }

  const masterAdmin = await employeeRepository.save(
    employeeRepository.create({
      employeeNumber: 'EMP0001',
      fullName: config.seed.masterAdminName,
      email: masterEmail,
      phone: null,
      employmentStatus: EmploymentStatus.ACTIVE,
      joinedAt: yearStart,
      terminatedAt: null,
      divisions: [divisions.get('People')!],
    }),
  );

  await identityRepository.save(
    identityRepository.create({
      employeeId: masterAdmin.id,
      email: masterEmail,
      role: Role.MASTER_ADMIN,
      status: IdentityStatus.ACTIVE,
    }),
  );
  console.log(`Master admin: ${masterEmail}`);

  // ---- demo staff ----------------------------------------------------------
  if (!config.seed.demo) {
    console.log('SEED_DEMO is off: only divisions, schedule and master admin were seeded.');
    await resetEmployeeNumberSequence();
    await AppDataSource.destroy();
    return;
  }

  const random = mulberry32(42);
  let employeeNumber = 2;
  let attendanceCount = 0;
  let leaveCount = 0;

  for (const demo of DEMO_EMPLOYEES) {
    const email = demo.email.toLowerCase();
    const employee = await employeeRepository.save(
      employeeRepository.create({
        employeeNumber: `EMP${String(employeeNumber).padStart(4, '0')}`,
        fullName: demo.fullName,
        email,
        phone: null,
        employmentStatus: demo.employmentStatus,
        joinedAt: yearStart,
        terminatedAt:
          demo.employmentStatus === EmploymentStatus.TERMINATED
            ? addDays(today, -30)
            : null,
        divisions: [divisions.get(demo.division)!],
      }),
    );
    employeeNumber += 1;

    await identityRepository.save(
      identityRepository.create({
        employeeId: employee.id,
        email,
        role: Role.EMPLOYEE,
        status:
          demo.employmentStatus === EmploymentStatus.TERMINATED
            ? IdentityStatus.DISABLED
            : IdentityStatus.ACTIVE,
      }),
    );

    if (demo.onLeave) {
      await leaveRepository.save(
        leaveRepository.create({
          employeeId: employee.id,
          startDate: today,
          endDate: addDays(today, 2),
          status: LeaveStatus.APPROVED,
          reason: 'Approved annual leave',
          decidedBy: masterEmail,
        }),
      );
      leaveCount += 1;
      continue;
    }

    // 90 days of weekday history. Terminated staff keep everything up to their
    // last day, which proves termination never erases attendance.
    const historyEnd = demo.terminatedAt ?? addDays(today, -1);
    const records: AttendanceRecord[] = [];
    for (let offset = 90; offset >= 1; offset -= 1) {
      const date = addDays(today, -offset);
      if (date > historyEnd) continue;
      if (weekdayOf(date) > 5) continue;
      if (date < yearStart) continue;

      const roll = random();
      if (roll < 0.07) continue; // absent day
      const late = roll < 0.32;
      const base = late ? '09:01:00' : '08:30:00';
      const checkInTime = timeAfter(base, Math.floor(random() * (late ? 45 : 29)));
      const checkOutTime = timeAfter('17:05:00', Math.floor(random() * 70));

      const lateMinutes = late
        ? minutesBetween(checkInTime, config.company.requiredCheckIn)
        : 0;

      records.push(
        attendanceRepository.create({
          employeeId: employee.id,
          attendanceDate: date,
          checkInTime: zonedToUtc(date, checkInTime, timezone),
          checkOutTime: zonedToUtc(date, checkOutTime, timezone),
          late,
          lateMinutes,
          location: random() < 0.5 ? 'HQ Office' : 'Remote',
          pictureUrl: null,
          requiredCheckIn: config.company.requiredCheckIn,
          requiredCheckOut: config.company.requiredCheckOut,
          timezone,
        }),
      );
    }

    for (let index = 0; index < records.length; index += 200) {
      await attendanceRepository.save(records.slice(index, index + 200));
      attendanceCount += Math.min(200, records.length - index);
    }
  }

  await resetEmployeeNumberSequence();

  console.log(
    `Seed complete: ${DEMO_EMPLOYEES.length} demo employees, ${attendanceCount} attendance records, ${leaveCount} approved leave.`,
  );

  async function resetEmployeeNumberSequence(): Promise<void> {
    await AppDataSource.query(
      `SELECT setval('employee_number_seq', (SELECT COUNT(*) + 1 FROM employees), false)`,
    );
  }

  await AppDataSource.destroy();
}

seed().catch(async (error: unknown) => {
  console.error('Seed failed', error);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exitCode = 1;
});
