/**
 * Seed the database from `seed.json`.
 *
 * Run it from `backend/` (or the runtime image's `/app`) so the services are
 * already up and have created the schema — this runner never synchronizes, it
 * only writes rows through the same entities the services own.
 *
 *   npm run seed                       # build + ingest ./seed.json
 *   npm run seed -- --dry-run          # validate and print the plan, no writes
 *   npm run seed -- --file other.json  # ingest another file
 *   npm run seed:docker                # same, inside the compose network
 *
 * Every write is an upsert keyed by natural keys (`employee_number`, `email`,
 * division `name`), so re-running converges instead of duplicating. Attendance
 * history is an additive backfill: it fills the current year up to and
 * including today, and only where no row exists yet, so real check-ins and
 * absent sweeps are never overwritten.
 */
import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { Client } from 'minio';
import {
  Between,
  DataSource,
  type DataSourceOptions,
  type EntityManager,
  type Repository,
} from 'typeorm';

import { Identity } from '../apps/auth/entity/identity.entity.js';
import { AttendanceRecord } from '../apps/attendance/entity/attendance.entity.js';
import { Division } from '../apps/employee/entity/division.entity.js';
import { Employee } from '../apps/employee/entity/employee.entity.js';
import {
  AttendanceStatus,
  EmploymentStatus,
  IdentityStatus,
  Role,
} from '../shared/enums/roles.enum.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^\d{2}-\d{2}$/;
const CLOCK = /^\d{1,2}:\d{2}$/;
const DAY_MS = 86_400_000;

interface SeedDivision {
  name: string;
  description?: string;
}

interface SeedEmployee {
  employeeNumber: string;
  fullName: string;
  email: string;
  phone?: string;
  joinedAt: string;
  terminatedAt?: string;
  employmentStatus?: EmploymentStatus;
  divisions?: string[];
  identity?: { role?: Role; status?: IdentityStatus };
}

/**
 * Optional attendance backfill, generated only on working days (Mon–Fri,
 * outside `holidays`). The window is January 1st of the run's year through
 * today, inclusive; `days` narrows it to a sliding window of that many calendar
 * days ending today. Today is never written as absent and never gets a
 * check-in later than the current wall clock. `holidays` accepts `MM-DD`
 * (every year) or `YYYY-MM-DD` (one year).
 */
interface SeedHistory {
  /** Sliding window ending today; omit for "this year so far". */
  days?: number;
  seed?: number;
  absentRate?: number;
  lateRate?: number;
  locations?: string[];
  holidays?: string[];
}

/**
 * Optional sample avatars. The bytes are generated locally (initials on a
 * coloured square) and uploaded to object storage, so a demo roster has
 * profile pictures without anyone uploading them by hand.
 */
interface SeedAvatars {
  enabled?: boolean;
  /** Square edge in pixels; the generated PNG is `size` x `size`. */
  size?: number;
  /** Replace avatars that already exist, instead of only filling empty ones. */
  overwrite?: boolean;
}

interface Seed {
  divisions: SeedDivision[];
  employees: SeedEmployee[];
  history?: SeedHistory;
  avatars?: SeedAvatars;
}

interface Options {
  file: string;
  dryRun: boolean;
  /** `undefined` = use the seed file's `avatars.enabled`. */
  avatars?: boolean;
  avatarOverwrite?: boolean;
}

interface Stats {
  divisionsCreated: number;
  divisionsUpdated: number;
  employeesCreated: number;
  employeesUpdated: number;
  identitiesCreated: number;
  identitiesUpdated: number;
  unchanged: number;
  attendanceInserted: number;
  attendanceSkipped: number;
  avatarsUploaded: number;
}

interface ResolvedHistory {
  /** `null` = January 1st of the run's year through today. */
  days: number | null;
  seed: number;
  absentRate: number;
  lateRate: number;
  locations: string[];
  holidays: string[];
}

interface ResolvedAvatars {
  enabled: boolean;
  size: number;
  overwrite: boolean;
}

const DEFAULT_AVATARS: ResolvedAvatars = {
  enabled: true,
  size: 512,
  overwrite: false,
};

const DEFAULT_HISTORY: ResolvedHistory = {
  days: null,
  seed: 42,
  absentRate: 0.05,
  lateRate: 0.22,
  locations: ['HQ Office', 'Remote'],
  holidays: ['01-01', '08-17', '12-25'],
};

function resolveHistory(history: SeedHistory | undefined): ResolvedHistory {
  return {
    days: history?.days ?? DEFAULT_HISTORY.days,
    seed: history?.seed ?? DEFAULT_HISTORY.seed,
    absentRate: history?.absentRate ?? DEFAULT_HISTORY.absentRate,
    lateRate: history?.lateRate ?? DEFAULT_HISTORY.lateRate,
    locations: history?.locations?.length
      ? history.locations
      : DEFAULT_HISTORY.locations,
    holidays: history?.holidays ?? DEFAULT_HISTORY.holidays,
  };
}

function resolveAvatars(seed: Seed, options: Options): ResolvedAvatars {
  return {
    enabled:
      options.avatars ?? seed.avatars?.enabled ?? DEFAULT_AVATARS.enabled,
    size: seed.avatars?.size ?? DEFAULT_AVATARS.size,
    overwrite:
      options.avatarOverwrite ??
      seed.avatars?.overwrite ??
      DEFAULT_AVATARS.overwrite,
  };
}

const ROLE_VALUES = new Set<string>(Object.values(Role));
const STATUS_VALUES = new Set<string>(Object.values(IdentityStatus));
const EMPLOYMENT_VALUES = new Set<string>(Object.values(EmploymentStatus));

function log(message: string): void {
  console.log(message);
}

function usage(): void {
  log(`Usage: node dist/seed/scripts/seed.js [options]

  --file <path>   Seed file to ingest (default: ./seed.json)
  --dry-run       Validate the file and print the plan without writing
  --no-avatars    Skip the generated sample avatars
  --force-avatars Regenerate every avatar, replacing existing ones
  --help          Show this message

Connection settings come from the same DB_* variables the services use:
  DB_HOST (127.0.0.1), DB_PORT (3306), DB_DATABASE (absences),
  DB_USERNAME (attendance), DB_PASSWORD (attend1234), DB_LOGGING (false).

Avatars are written straight to object storage, so the seeder also needs the
storage service's MINIO_* variables (MINIO_ACCESS_KEY and MINIO_SECRET_KEY are
required; the rest default to 127.0.0.1:9000/absences/us-east-1). In compose,
run the seeder through the storage container:
  docker compose run --rm storage node dist/seed/scripts/seed.js

Attendance history uses the company clock the attendance service uses:
  COMPANY_TIMEZONE (TZ fallback, default Asia/Jakarta), REQUIRED_CHECK_IN (09:00).`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = { file: 'seed.json', dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-avatars') {
      options.avatars = false;
      continue;
    }
    if (arg === '--avatars') {
      options.avatars = true;
      continue;
    }
    if (arg === '--force-avatars') {
      options.avatarOverwrite = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--file') {
      const value = argv[index + 1];
      if (!value) throw new Error('--file expects a path');
      options.file = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
      continue;
    }
    throw new Error(`Unknown argument "${arg}" (try --help)`);
  }

  return options;
}

/** Rejects a bad seed file with every problem it can find, not just the first. */
function validate(raw: unknown, file: string): Seed {
  const problems: string[] = [];
  const at = (path: string, message: string) =>
    problems.push(`${path}: ${message}`);

  if (typeof raw !== 'object' || raw === null)
    throw new Error(`${file} must contain a JSON object`);

  const source = raw as Record<string, unknown>;
  const divisions: SeedDivision[] = [];
  const employees: SeedEmployee[] = [];

  const nonEmpty = (path: string, value: unknown): string => {
    if (typeof value !== 'string' || value.trim() === '') {
      at(path, 'must be a non-empty string');
      return '';
    }
    return value.trim();
  };

  const rawDivisions = source.divisions ?? [];
  if (!Array.isArray(rawDivisions)) at('divisions', 'must be an array');

  const divisionNames = new Set<string>();
  for (const [index, entry] of (Array.isArray(rawDivisions)
    ? rawDivisions
    : []
  ).entries()) {
    const path = `divisions[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      at(path, 'must be an object');
      continue;
    }
    const item = entry as Record<string, unknown>;
    const name = nonEmpty(`${path}.name`, item.name);
    if (name && divisionNames.has(name))
      at(`${path}.name`, `duplicate division "${name}"`);
    if (name) divisionNames.add(name);
    if (
      item.description !== undefined &&
      typeof item.description !== 'string'
    ) {
      at(`${path}.description`, 'must be a string');
    }
    divisions.push({
      name,
      description:
        typeof item.description === 'string' ? item.description : undefined,
    });
  }

  const rawEmployees = source.employees ?? [];
  if (!Array.isArray(rawEmployees)) at('employees', 'must be an array');

  const employeeNumbers = new Set<string>();
  const emails = new Set<string>();
  for (const [index, entry] of (Array.isArray(rawEmployees)
    ? rawEmployees
    : []
  ).entries()) {
    const path = `employees[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      at(path, 'must be an object');
      continue;
    }
    const item = entry as Record<string, unknown>;

    const employeeNumber = nonEmpty(
      `${path}.employeeNumber`,
      item.employeeNumber,
    );
    const employeeEmail = nonEmpty(`${path}.email`, item.email).toLowerCase();
    if (employeeEmail && !EMAIL.test(employeeEmail))
      at(`${path}.email`, 'is not a valid email');
    if (employeeNumber && employeeNumbers.has(employeeNumber)) {
      at(
        `${path}.employeeNumber`,
        `duplicate employee number "${employeeNumber}"`,
      );
    }
    if (employeeEmail && emails.has(employeeEmail)) {
      at(`${path}.email`, `duplicate email "${employeeEmail}"`);
    }
    if (employeeNumber) employeeNumbers.add(employeeNumber);
    if (employeeEmail) emails.add(employeeEmail);

    const joinedAt = nonEmpty(`${path}.joinedAt`, item.joinedAt);
    if (
      joinedAt &&
      (!DATE.test(joinedAt) || Number.isNaN(Date.parse(joinedAt)))
    ) {
      at(`${path}.joinedAt`, 'must be a YYYY-MM-DD date');
    }
    const terminatedAt =
      item.terminatedAt === undefined
        ? undefined
        : nonEmpty(`${path}.terminatedAt`, item.terminatedAt);
    if (
      terminatedAt &&
      (!DATE.test(terminatedAt) || Number.isNaN(Date.parse(terminatedAt)))
    ) {
      at(`${path}.terminatedAt`, 'must be a YYYY-MM-DD date');
    }

    const employmentStatus = item.employmentStatus ?? EmploymentStatus.ACTIVE;
    if (
      typeof employmentStatus !== 'string' ||
      !EMPLOYMENT_VALUES.has(employmentStatus)
    ) {
      at(
        `${path}.employmentStatus`,
        `must be one of ${[...EMPLOYMENT_VALUES].join(', ')}`,
      );
    }

    const divisionsOfEmployee: string[] = [];
    if (item.divisions !== undefined) {
      if (!Array.isArray(item.divisions)) {
        at(`${path}.divisions`, 'must be an array of division names');
      } else {
        for (const [divisionIndex, name] of item.divisions.entries()) {
          if (typeof name !== 'string' || !divisionNames.has(name)) {
            at(
              `${path}.divisions[${divisionIndex}]`,
              `unknown division "${String(name)}" (declare it in "divisions")`,
            );
            continue;
          }
          divisionsOfEmployee.push(name);
        }
      }
    }

    let identity: SeedEmployee['identity'];
    if (item.identity !== undefined) {
      if (typeof item.identity !== 'object' || item.identity === null) {
        at(`${path}.identity`, 'must be an object');
      } else {
        const identitySource = item.identity as Record<string, unknown>;
        const role = identitySource.role ?? Role.EMPLOYEE;
        const status = identitySource.status ?? IdentityStatus.ACTIVE;
        if (typeof role !== 'string' || !ROLE_VALUES.has(role)) {
          at(
            `${path}.identity.role`,
            `must be one of ${[...ROLE_VALUES].join(', ')}`,
          );
        }
        if (typeof status !== 'string' || !STATUS_VALUES.has(status)) {
          at(
            `${path}.identity.status`,
            `must be one of ${[...STATUS_VALUES].join(', ')}`,
          );
        }
        identity = { role: role as Role, status: status as IdentityStatus };
      }
    }

    employees.push({
      employeeNumber,
      fullName: nonEmpty(`${path}.fullName`, item.fullName),
      email: employeeEmail,
      phone:
        item.phone === undefined
          ? undefined
          : nonEmpty(`${path}.phone`, item.phone),
      joinedAt,
      terminatedAt,
      employmentStatus: employmentStatus as EmploymentStatus,
      divisions: divisionsOfEmployee,
      identity,
    });
  }

  let history: SeedHistory | undefined;
  if (source.history !== undefined) {
    if (
      typeof source.history !== 'object' ||
      source.history === null ||
      Array.isArray(source.history)
    ) {
      at('history', 'must be an object');
    } else {
      const item = source.history as Record<string, unknown>;
      const integer = (
        path: string,
        value: unknown,
        min: number,
        max: number,
      ): number | undefined => {
        if (value === undefined) return undefined;
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < min ||
          value > max
        ) {
          at(path, `must be an integer between ${min} and ${max}`);
          return undefined;
        }
        return value;
      };
      const rate = (path: string, value: unknown): number | undefined => {
        if (value === undefined) return undefined;
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1
        ) {
          at(path, 'must be a number between 0 and 1');
          return undefined;
        }
        return value;
      };

      const days = integer('history.days', item.days, 1, 3650);
      const seedValue = integer('history.seed', item.seed, 1, 2 ** 31 - 1);
      const absentRate = rate('history.absentRate', item.absentRate);
      const lateRate = rate('history.lateRate', item.lateRate);

      let locations: string[] | undefined;
      if (item.locations !== undefined) {
        if (!Array.isArray(item.locations)) {
          at('history.locations', 'must be an array of non-empty strings');
        } else {
          const cleaned = item.locations.map((location, index) =>
            nonEmpty(`history.locations[${index}]`, location),
          );
          if (cleaned.every((location) => location !== '')) locations = cleaned;
        }
      }

      let holidays: string[] | undefined;
      if (item.holidays !== undefined) {
        if (!Array.isArray(item.holidays)) {
          at(
            'history.holidays',
            'must be an array of YYYY-MM-DD or MM-DD dates',
          );
        } else {
          holidays = [];
          for (const [index, holiday] of item.holidays.entries()) {
            const value = nonEmpty(`history.holidays[${index}]`, holiday);
            if (!value) continue;
            if (
              !MONTH_DAY.test(value) &&
              (!DATE.test(value) || Number.isNaN(Date.parse(value)))
            ) {
              at(
                `history.holidays[${index}]`,
                'must be a YYYY-MM-DD or MM-DD date',
              );
              continue;
            }
            holidays.push(value);
          }
        }
      }

      history = {
        days,
        seed: seedValue,
        absentRate,
        lateRate,
        locations,
        holidays,
      };
    }
  }

  let avatars: SeedAvatars | undefined;
  if (source.avatars !== undefined) {
    if (
      typeof source.avatars !== 'object' ||
      source.avatars === null ||
      Array.isArray(source.avatars)
    ) {
      at('avatars', 'must be an object');
    } else {
      const item = source.avatars as Record<string, unknown>;
      const enabled = item.enabled;
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        at('avatars.enabled', 'must be a boolean');
      }
      const overwrite = item.overwrite;
      if (overwrite !== undefined && typeof overwrite !== 'boolean') {
        at('avatars.overwrite', 'must be a boolean');
      }
      const size = item.size;
      if (
        size !== undefined &&
        (typeof size !== 'number' ||
          !Number.isInteger(size) ||
          size < 64 ||
          size > 1024)
      ) {
        at('avatars.size', 'must be an integer between 64 and 1024');
      }
      avatars = {
        enabled: typeof enabled === 'boolean' ? enabled : undefined,
        overwrite: typeof overwrite === 'boolean' ? overwrite : undefined,
        size: typeof size === 'number' ? size : undefined,
      };
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `${file} is not a valid seed file:\n  - ${problems.join('\n  - ')}`,
    );
  }

  return { divisions, employees, history, avatars };
}

async function loadSeed(file: string): Promise<Seed> {
  const path = resolve(process.cwd(), file);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(
      `Cannot read ${path} — run from backend/ or pass --file <path>`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }

  return validate(parsed, path);
}

/** Deterministic PRNG: the same seed always produces the same history. */
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

/** FNV-1a: mixes an employee number into the history seed. */
function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** `YYYY-MM-DD` of the local day an instant belongs to. */
function localDate(instant: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Offset of `zone` from UTC, in minutes, at the given instant. */
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
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
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

/** A local wall-clock time on `date` as the UTC instant the services store. */
function zonedToUtc(date: string, minutesOfDay: number, zone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutesOfDay / 60),
    minutesOfDay % 60,
  );
  const offset = zoneOffsetMinutes(new Date(guess), zone);

  return new Date(guess - offset * 60_000);
}

function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);

  return hours * 60 + minutes;
}

function isWorkingDay(date: string, holidays: Set<string>): boolean {
  const weekday = weekdayOf(date);

  if (weekday === 0 || weekday === 6) return false;

  return !holidays.has(date) && !holidays.has(date.slice(5));
}

/**
 * Sample avatars: initials drawn on a coloured square, encoded as a PNG and
 * uploaded under `avatars/<year>/<month>/<uuid>.png` — the same key shape the
 * storage service hands out, so `confirmUpload`/`getDownloadUrl` accept it.
 */

/** Backgrounds are picked from this palette by a hash of the full name. */
const AVATAR_PALETTE = [
  '#4F46E5',
  '#0EA5E9',
  '#0D9488',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#DB2777',
  '#7C3AED',
  '#2563EB',
  '#059669',
  '#9333EA',
];

/** 5x7 uppercase glyphs, one row per 5-bit number (bit 4 = leftmost column). */
const AVATAR_FONT: Record<string, readonly number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '?': [0x0e, 0x11, 0x02, 0x04, 0x04, 0x00, 0x04],
};

/** Up to two uppercase initials; diacritics are dropped, unknown letters → `?`. */
function initialsOf(fullName: string): string {
  const words = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const source =
    words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '');
  const initials = source.slice(0, 2);

  return initials.length > 0 ? initials : '?';
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);

  return Buffer.concat([length, typeBytes, data, checksum]);
}

/** Minimal truecolour PNG encoder: what a generated avatar needs, nothing more. */
function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0; // filter type: none
    rgb.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fillBlock(
  pixels: Buffer,
  size: number,
  left: number,
  top: number,
  block: number,
  colour: readonly [number, number, number],
): void {
  for (let y = Math.max(0, top); y < Math.min(size, top + block); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(size, left + block); x += 1) {
      const offset = (y * size + x) * 3;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
    }
  }
}

/** A square PNG: `initialsOf(fullName)` centred on a colour from the palette. */
function renderAvatarPng(fullName: string, size: number): Buffer {
  const background = hexToRgb(
    AVATAR_PALETTE[hashString(fullName) % AVATAR_PALETTE.length]!,
  );
  const pixels = Buffer.alloc(size * size * 3);

  for (let offset = 0; offset < pixels.length; offset += 3) {
    pixels[offset] = background[0];
    pixels[offset + 1] = background[1];
    pixels[offset + 2] = background[2];
  }

  const initials = initialsOf(fullName);
  const glyphWidth = 5;
  const glyphHeight = 7;
  const gap = 1;
  const columns = glyphWidth * initials.length + gap * (initials.length - 1);
  const block = Math.max(1, Math.floor((size * 0.44) / columns));
  const textWidth = block * columns;
  const textHeight = block * glyphHeight;
  const originX = Math.floor((size - textWidth) / 2);
  const originY = Math.floor((size - textHeight) / 2);

  for (let index = 0; index < initials.length; index += 1) {
    const glyph = AVATAR_FONT[initials[index]!] ?? AVATAR_FONT['?']!;
    const glyphLeft = originX + index * (glyphWidth + gap) * block;

    for (let row = 0; row < glyphHeight; row += 1) {
      for (let column = 0; column < glyphWidth; column += 1) {
        const on = ((glyph[row]! >> (glyphWidth - 1 - column)) & 1) === 1;
        if (!on) continue;
        fillBlock(
          pixels,
          size,
          glyphLeft + column * block,
          originY + row * block,
          block,
          [255, 255, 255],
        );
      }
    }
  }

  return encodePng(size, size, pixels);
}

/** `avatars/<year>/<month>/<uuid>.png`, matching the storage service's keys. */
function avatarKeyFor(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  return `avatars/${year}/${month}/${randomUUID()}.png`;
}

interface AvatarStorage {
  client: Client;
  bucket: string;
  endpoint: string;
  port: number;
}

/** Same `MINIO_*` contract the storage service reads. */
function openAvatarStorage(): AvatarStorage {
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error(
      'MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required to upload avatars ' +
        '(use --no-avatars to seed without pictures)',
    );
  }

  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const endpoint = process.env.MINIO_ENDPOINT ?? '127.0.0.1';
  const port = Number(process.env.MINIO_PORT ?? (useSSL ? 443 : 9000));

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('MINIO_PORT must be a positive integer');
  }

  const bucket = process.env.MINIO_BUCKET ?? 'absences';
  const client = new Client({
    endPoint: endpoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    region: process.env.MINIO_REGION ?? 'us-east-1',
  });

  return { client, bucket, endpoint, port };
}

/** Creates the bucket if a fresh RustFS has not served the storage service yet. */
async function ensureAvatarBucket(storage: AvatarStorage): Promise<void> {
  try {
    const exists = await storage.client.bucketExists(storage.bucket);
    if (!exists) {
      await storage.client.makeBucket(storage.bucket);
      log(`+ bucket    ${storage.bucket}`);
    }
    log(
      `Object storage: s3://${storage.bucket} at ${storage.endpoint}:${storage.port}`,
    );
  } catch (error) {
    throw new Error(
      `Cannot reach object storage at ${storage.endpoint}:${storage.port} ` +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        'start rustfs or pass --no-avatars',
    );
  }
}

interface AvatarJob {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  /** Existing object removed after the replacement is stored, if any. */
  previousKey: string | null;
}

interface HistoryWindow {
  /** First date to consider, inclusive. */
  start: string;
  /** Last date to consider, inclusive — always the run's today. */
  end: string;
}

/** January 1st of the run's year (or a sliding window) through today. */
function historyWindow(
  history: ResolvedHistory,
  today: string,
): HistoryWindow {
  const start =
    history.days === null
      ? `${today.slice(0, 4)}-01-01`
      : addDays(today, 1 - history.days);

  return { start: start < today ? start : today, end: today };
}

function plannedAttendanceDays(
  seed: Seed,
  history: ResolvedHistory,
  today: string,
): number {
  const window = historyWindow(history, today);
  const holidays = new Set(history.holidays);
  let total = 0;

  for (const employee of seed.employees) {
    if (employee.employmentStatus === EmploymentStatus.INACTIVE) continue;

    const from =
      employee.joinedAt > window.start ? employee.joinedAt : window.start;
    const until =
      employee.terminatedAt && employee.terminatedAt < window.end
        ? employee.terminatedAt
        : window.end;

    for (let date = from; date <= until; date = addDays(date, 1)) {
      if (isWorkingDay(date, holidays)) total += 1;
    }
  }

  return total;
}

function describePlan(
  seed: Seed,
  today: string,
  avatars: ResolvedAvatars,
): void {
  log(
    `Plan: ${seed.divisions.length} division(s), ${seed.employees.length} employee(s)`,
  );
  for (const division of seed.divisions) {
    log(`  division  ${division.name}`);
  }

  const history = resolveHistory(seed.history);
  const window = historyWindow(history, today);
  log(
    `  history   ${window.start} → ${window.end} ` +
      `(${history.days === null ? 'this year, today included' : `last ${history.days} day(s)`}): ` +
      `${Math.round(history.lateRate * 100)}% late, ` +
      `${Math.round(history.absentRate * 100)}% absent, ` +
      `~${plannedAttendanceDays(seed, history, today)} row(s)`,
  );
  log(
    `  holidays  ${history.holidays.length > 0 ? history.holidays.join(', ') : '—'}`,
  );
  log(
    `  avatars   ${
      avatars.enabled
        ? `${avatars.size}px initials PNGs for every employee ` +
          (avatars.overwrite
            ? 'with an existing picture replaced'
            : 'without a picture')
        : 'disabled (--no-avatars)'
    }`,
  );

  for (const employee of seed.employees) {
    const role = employee.identity?.role ?? Role.EMPLOYEE;
    const divisions = employee.divisions?.length
      ? employee.divisions.join(', ')
      : '—';
    const status = employee.employmentStatus ?? EmploymentStatus.ACTIVE;
    const statusLabel = status === EmploymentStatus.ACTIVE ? '' : ` ${status}`;
    log(
      `  employee  ${employee.employeeNumber}  ${employee.email}  ${role}${statusLabel}  [${divisions}]`,
    );
  }
}

/**
 * Writes the seed inside one transaction, so a failure leaves the database as
 * it was instead of half-seeded.
 */
async function ingest(
  manager: EntityManager,
  seed: Seed,
  stats: Stats,
  clock: AttendanceContext,
  avatars: ResolvedAvatars,
  avatarJobs: AvatarJob[],
): Promise<void> {
  const divisionRepo = manager.getRepository(Division);
  const employeeRepo = manager.getRepository(Employee);
  const identityRepo = manager.getRepository(Identity);
  const employeesByNumber = new Map<string, Employee>();

  const divisionsByName = new Map<string, Division>();
  for (const division of seed.divisions) {
    const description = division.description ?? null;
    const existing = await divisionRepo.findOne({
      where: { name: division.name },
    });

    if (!existing) {
      const created = await divisionRepo.save(
        divisionRepo.create({ name: division.name, description }),
      );
      divisionsByName.set(division.name, created);
      stats.divisionsCreated += 1;
      log(`+ division  ${division.name}`);
      continue;
    }

    divisionsByName.set(division.name, existing);
    if ((existing.description ?? null) !== description) {
      existing.description = description;
      await divisionRepo.save(existing);
      stats.divisionsUpdated += 1;
      log(`~ division  ${division.name}`);
    }
  }

  for (const seedEmployee of seed.employees) {
    const byNumber = await employeeRepo.findOne({
      where: { employeeNumber: seedEmployee.employeeNumber },
      relations: { divisions: true },
    });
    const byEmail = await employeeRepo.findOne({
      where: { email: seedEmployee.email },
      relations: { divisions: true },
    });

    if (byNumber && byEmail && byNumber.id !== byEmail.id) {
      throw new Error(
        `employees: "${seedEmployee.employeeNumber}" and "${seedEmployee.email}" belong to two different employees ` +
          `(${byNumber.email} / ${byEmail.employeeNumber}); fix the seed file or the database first`,
      );
    }

    const existing = byNumber ?? byEmail;
    const employmentStatus =
      seedEmployee.employmentStatus ?? EmploymentStatus.ACTIVE;
    const terminatedAt =
      seedEmployee.terminatedAt ??
      (employmentStatus === EmploymentStatus.TERMINATED
        ? seedEmployee.joinedAt
        : null);
    const phone = seedEmployee.phone ?? null;
    const wantedDivisions = (seedEmployee.divisions ?? [])
      .map((name) => divisionsByName.get(name))
      .filter((division): division is Division => division !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
    const currentDivisions = [...(existing?.divisions ?? [])].sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    const divisionsMatch =
      currentDivisions.length === wantedDivisions.length &&
      currentDivisions.every(
        (division, index) => division.id === wantedDivisions[index].id,
      );

    let employee: Employee;
    if (!existing) {
      employee = await employeeRepo.save(
        employeeRepo.create({
          employeeNumber: seedEmployee.employeeNumber,
          fullName: seedEmployee.fullName,
          email: seedEmployee.email,
          phone,
          joinedAt: seedEmployee.joinedAt,
          terminatedAt,
          employmentStatus,
          divisions: wantedDivisions,
        }),
      );
      stats.employeesCreated += 1;
      log(`+ employee  ${seedEmployee.employeeNumber}  ${seedEmployee.email}`);
    } else {
      employee = existing;
      const changed =
        employee.employeeNumber !== seedEmployee.employeeNumber ||
        employee.fullName !== seedEmployee.fullName ||
        employee.email !== seedEmployee.email ||
        (employee.phone ?? null) !== phone ||
        employee.joinedAt !== seedEmployee.joinedAt ||
        (employee.terminatedAt ?? null) !== terminatedAt ||
        employee.employmentStatus !== employmentStatus ||
        !divisionsMatch;

      if (!changed) {
        stats.unchanged += 1;
        log(
          `= employee  ${seedEmployee.employeeNumber}  ${seedEmployee.email}`,
        );
      } else {
        employee.employeeNumber = seedEmployee.employeeNumber;
        employee.fullName = seedEmployee.fullName;
        employee.email = seedEmployee.email;
        employee.phone = phone;
        employee.joinedAt = seedEmployee.joinedAt;
        employee.terminatedAt = terminatedAt;
        employee.employmentStatus = employmentStatus;
        employee.divisions = wantedDivisions;
        employee = await employeeRepo.save(employee);
        stats.employeesUpdated += 1;
        log(
          `~ employee  ${seedEmployee.employeeNumber}  ${seedEmployee.email}`,
        );
      }
    }

    employeesByNumber.set(employee.employeeNumber, employee);

    if (avatars.enabled && (avatars.overwrite || !employee.avatarKey)) {
      avatarJobs.push({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        fullName: employee.fullName,
        previousKey: avatars.overwrite ? employee.avatarKey : null,
      });
    }

    const role = seedEmployee.identity?.role ?? Role.EMPLOYEE;
    const status = seedEmployee.identity?.status ?? IdentityStatus.ACTIVE;
    const identityByEmployee = await identityRepo.findOne({
      where: { employeeId: employee.id },
    });
    const identityByEmail = await identityRepo.findOne({
      where: { email: employee.email },
    });

    if (
      identityByEmployee &&
      identityByEmail &&
      identityByEmployee.id !== identityByEmail.id
    ) {
      throw new Error(
        `identities: employee ${employee.id} has ${identityByEmployee.email} while ${identityByEmail.email} ` +
          `points at employee ${identityByEmail.employeeId}; fix the database first`,
      );
    }

    const existingIdentity = identityByEmployee ?? identityByEmail;
    if (!existingIdentity) {
      await identityRepo.save(
        identityRepo.create({
          employeeId: employee.id,
          email: employee.email,
          role,
          status,
        }),
      );
      stats.identitiesCreated += 1;
      log(`+ identity  ${employee.email}  ${role}/${status}`);
      continue;
    }

    if (
      existingIdentity.employeeId !== employee.id ||
      existingIdentity.email !== employee.email ||
      existingIdentity.role !== role ||
      existingIdentity.status !== status
    ) {
      existingIdentity.employeeId = employee.id;
      existingIdentity.email = employee.email;
      existingIdentity.role = role;
      existingIdentity.status = status;
      await identityRepo.save(existingIdentity);
      stats.identitiesUpdated += 1;
      log(`~ identity  ${employee.email}  ${role}/${status}`);
    }
  }

  await seedAttendance(manager, seed, employeesByNumber, stats, clock);
}

interface AttendanceContext {
  /** The company's current day (`YYYY-MM-DD`), written as history too. */
  today: string;
  timezone: string;
  requiredCheckIn: string;
  /** Wall clock of the run, in the company timezone, in minutes of the day. */
  nowMinutes: number;
}

/**
 * Backfills attendance for active staff (and terminated staff up to their last
 * day) from a deterministic per-employee PRNG. The window is this year through
 * today, so the admin dashboard has a populated "today" report; existing days
 * are left alone, so re-running the seed never overwrites a real check-in or
 * absent sweep.
 */
async function seedAttendance(
  manager: EntityManager,
  seed: Seed,
  employeesByNumber: Map<string, Employee>,
  stats: Stats,
  context: AttendanceContext,
): Promise<void> {
  const history = resolveHistory(seed.history);
  const records = manager.getRepository(AttendanceRecord);
  const holidays = new Set(history.holidays);
  const requiredMinutes = clockToMinutes(context.requiredCheckIn);
  const window = historyWindow(history, context.today);
  const pending: AttendanceRecord[] = [];

  for (const seedEmployee of seed.employees) {
    if (seedEmployee.employmentStatus === EmploymentStatus.INACTIVE) continue;

    const employee = employeesByNumber.get(seedEmployee.employeeNumber);
    if (!employee) continue;

    const from =
      seedEmployee.joinedAt > window.start ? seedEmployee.joinedAt : window.start;
    const until =
      seedEmployee.terminatedAt && seedEmployee.terminatedAt < window.end
        ? seedEmployee.terminatedAt
        : window.end;
    if (from > until) continue;

    const existingRows = await records.find({
      where: { employeeId: employee.id, attendanceDate: Between(from, until) },
      select: { attendanceDate: true },
    });
    const recorded = new Set(existingRows.map((row) => row.attendanceDate));

    // Individual tempo: some people are reliably early, others cut it close.
    const random = mulberry32(
      (history.seed ^ hashString(seedEmployee.employeeNumber)) >>> 0,
    );
    const tempo = random();
    const lateRate = history.lateRate * (0.3 + tempo * 1.7);
    const absentRate = history.absentRate * (0.4 + tempo * 1.6);

    for (let date = from; date <= until; date = addDays(date, 1)) {
      if (!isWorkingDay(date, holidays)) continue;

      if (recorded.has(date)) {
        stats.attendanceSkipped += 1;
        continue;
      }

      // Today is still in progress: an absent sweep has not run yet, and a
      // check-in cannot be later than the moment this seed ran.
      const isToday = date === context.today;
      const absent = random() < absentRate;

      if (absent && !isToday) {
        pending.push(
          records.create({
            employeeId: employee.id,
            attendanceDate: date,
            checkInTime: null,
            status: AttendanceStatus.ABSENT,
            late: false,
            lateMinutes: 0,
            location: null,
            proofKey: null,
            requiredCheckIn: context.requiredCheckIn,
            timezone: context.timezone,
          }),
        );
        continue;
      }

      const late = random() < lateRate;
      const offset = late
        ? 1 + Math.floor(random() * 40)
        : -(5 + Math.floor(random() * 50));
      const minutes = Math.max(
        0,
        Math.min(
          23 * 60 + 59,
          requiredMinutes + offset,
          isToday ? context.nowMinutes : 23 * 60 + 59,
        ),
      );
      const lateMinutes = Math.max(0, minutes - requiredMinutes);

      pending.push(
        records.create({
          employeeId: employee.id,
          attendanceDate: date,
          checkInTime: zonedToUtc(date, minutes, context.timezone),
          status:
            lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
          late: lateMinutes > 0,
          lateMinutes,
          location:
            history.locations[
              Math.floor(random() * history.locations.length)
            ] ?? null,
          proofKey: null,
          requiredCheckIn: context.requiredCheckIn,
          timezone: context.timezone,
        }),
      );
    }
  }

  // Batched so a 50-person, 120-day backfill is a handful of round trips.
  for (let index = 0; index < pending.length; index += 250) {
    const chunk = pending.slice(index, index + 250);
    await records.insert(chunk);
    stats.attendanceInserted += chunk.length;
  }
}

/**
 * Uploads the generated pictures and points `avatar_key` at them. This runs
 * after the database transaction commits: object storage is not transactional,
 * so a failed upload must not roll back the employees that are already valid.
 * A rerun only picks up employees still missing a picture, which also makes a
 * partially failed upload resumable.
 */
async function uploadAvatars(
  employees: Repository<Employee>,
  storage: AvatarStorage,
  avatars: ResolvedAvatars,
  jobs: AvatarJob[],
  stats: Stats,
): Promise<void> {
  if (jobs.length === 0) {
    log('= avatars     every employee already has a picture');
    return;
  }

  for (const job of jobs) {
    const png = renderAvatarPng(job.fullName, avatars.size);
    const key = avatarKeyFor(new Date());

    await storage.client.putObject(storage.bucket, key, png, png.length, {
      'Content-Type': 'image/png',
    });
    await employees.update(job.employeeId, { avatarKey: key });

    if (job.previousKey) {
      try {
        await storage.client.removeObject(storage.bucket, job.previousKey);
      } catch (error) {
        log(
          `! avatar    ${job.employeeNumber}  kept orphan ${job.previousKey}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    stats.avatarsUploaded += 1;
    log(`+ avatar    ${job.employeeNumber}  ${key}`);
  }
}

/** Same `DB_*` defaults as `shared/database/database-options.ts`. */
interface DbEnv {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

function readDbEnv(): DbEnv {
  return {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    username: process.env.DB_USERNAME ?? 'attendance',
    password: process.env.DB_PASSWORD ?? 'attend1234',
    database: process.env.DB_DATABASE ?? 'absences',
  };
}

function connectionOptions(env: DbEnv): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.host,
    port: env.port,
    username: env.username,
    password: env.password,
    database: env.database,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: ['DATE'],
    entities: [Employee, Division, Identity, AttendanceRecord],
    // The services own the schema; the seeder only writes rows into it.
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}

/** `HH:mm` of the local wall clock an instant reads as in `zone`. */
function localMinutesOfDay(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return value('hour') * 60 + value('minute');
}

function localClock(): AttendanceContext {
  const timezone =
    process.env.COMPANY_TIMEZONE ?? process.env.TZ ?? 'Asia/Jakarta';
  const requiredCheckIn = process.env.REQUIRED_CHECK_IN ?? '09:00';

  if (!CLOCK.test(requiredCheckIn)) {
    throw new Error(`REQUIRED_CHECK_IN "${requiredCheckIn}" is not HH:mm`);
  }

  const now = new Date();

  return {
    today: localDate(now, timezone),
    timezone,
    requiredCheckIn,
    nowMinutes: localMinutesOfDay(now, timezone),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const seed = await loadSeed(options.file);
  const clock = localClock();
  const avatars = resolveAvatars(seed, options);

  log(`Seed file: ${resolve(process.cwd(), options.file)}`);
  if (options.dryRun) {
    describePlan(seed, clock.today, avatars);
    log('Dry run: nothing was written.');
    return;
  }

  // Fail on a missing/invalid storage configuration before the first write.
  const storage = avatars.enabled ? openAvatarStorage() : null;

  const env = readDbEnv();
  const dataSource = new DataSource(connectionOptions(env));
  await dataSource.initialize();
  log(
    `Connected to mysql://${env.username}@${env.host}:${env.port}/${env.database}`,
  );

  const stats: Stats = {
    divisionsCreated: 0,
    divisionsUpdated: 0,
    employeesCreated: 0,
    employeesUpdated: 0,
    identitiesCreated: 0,
    identitiesUpdated: 0,
    unchanged: 0,
    attendanceInserted: 0,
    attendanceSkipped: 0,
    avatarsUploaded: 0,
  };

  const avatarJobs: AvatarJob[] = [];

  try {
    if (storage) await ensureAvatarBucket(storage);
    await dataSource.transaction((manager) =>
      ingest(manager, seed, stats, clock, avatars, avatarJobs),
    );
    if (storage) {
      await uploadAvatars(
        dataSource.getRepository(Employee),
        storage,
        avatars,
        avatarJobs,
        stats,
      );
    }
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
  await dataSource.destroy();

  log(
    `Done: divisions +${stats.divisionsCreated}/~${stats.divisionsUpdated}, ` +
      `employees +${stats.employeesCreated}/~${stats.employeesUpdated}, ` +
      `identities +${stats.identitiesCreated}/~${stats.identitiesUpdated}, ` +
      `avatars +${stats.avatarsUploaded}, ` +
      `attendance +${stats.attendanceInserted} (${stats.attendanceSkipped} day(s) already present), ` +
      `unchanged ${stats.unchanged}`,
  );

  const admins = seed.employees.filter(
    (employee) => (employee.identity?.role ?? Role.EMPLOYEE) !== Role.EMPLOYEE,
  );
  if (admins.length > 0) {
    log(
      `Admin identities: ${admins.map((a) => `${a.email} (${a.identity?.role ?? Role.EMPLOYEE})`).join(', ')}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
