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
 * division `name`), so re-running converges instead of duplicating.
 */
import 'reflect-metadata';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DataSource, type DataSourceOptions, type EntityManager } from 'typeorm';

import { Identity } from '../apps/auth/entity/identity.entity.js';
import { Division } from '../apps/employee/entity/division.entity.js';
import { Employee } from '../apps/employee/entity/employee.entity.js';
import {
  EmploymentStatus,
  IdentityStatus,
  Role,
} from '../shared/enums/roles.enum.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

interface Seed {
  divisions: SeedDivision[];
  employees: SeedEmployee[];
}

interface Options {
  file: string;
  dryRun: boolean;
}

interface Stats {
  divisionsCreated: number;
  divisionsUpdated: number;
  employeesCreated: number;
  employeesUpdated: number;
  identitiesCreated: number;
  identitiesUpdated: number;
  unchanged: number;
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
  --help          Show this message

Connection settings come from the same DB_* variables the services use:
  DB_HOST (127.0.0.1), DB_PORT (3306), DB_DATABASE (absences),
  DB_USERNAME (attendance), DB_PASSWORD (attend1234), DB_LOGGING (false).`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = { file: 'seed.json', dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
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
  const at = (path: string, message: string) => problems.push(`${path}: ${message}`);

  if (typeof raw !== 'object' || raw === null) throw new Error(`${file} must contain a JSON object`);

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
  for (const [index, entry] of (Array.isArray(rawDivisions) ? rawDivisions : []).entries()) {
    const path = `divisions[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      at(path, 'must be an object');
      continue;
    }
    const item = entry as Record<string, unknown>;
    const name = nonEmpty(`${path}.name`, item.name);
    if (name && divisionNames.has(name)) at(`${path}.name`, `duplicate division "${name}"`);
    if (name) divisionNames.add(name);
    if (item.description !== undefined && typeof item.description !== 'string') {
      at(`${path}.description`, 'must be a string');
    }
    divisions.push({
      name,
      description: typeof item.description === 'string' ? item.description : undefined,
    });
  }

  const rawEmployees = source.employees ?? [];
  if (!Array.isArray(rawEmployees)) at('employees', 'must be an array');

  const employeeNumbers = new Set<string>();
  const emails = new Set<string>();
  for (const [index, entry] of (Array.isArray(rawEmployees) ? rawEmployees : []).entries()) {
    const path = `employees[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      at(path, 'must be an object');
      continue;
    }
    const item = entry as Record<string, unknown>;

    const employeeNumber = nonEmpty(`${path}.employeeNumber`, item.employeeNumber);
    const employeeEmail = nonEmpty(`${path}.email`, item.email).toLowerCase();
    if (employeeEmail && !EMAIL.test(employeeEmail)) at(`${path}.email`, 'is not a valid email');
    if (employeeNumber && employeeNumbers.has(employeeNumber)) {
      at(`${path}.employeeNumber`, `duplicate employee number "${employeeNumber}"`);
    }
    if (employeeEmail && emails.has(employeeEmail)) {
      at(`${path}.email`, `duplicate email "${employeeEmail}"`);
    }
    if (employeeNumber) employeeNumbers.add(employeeNumber);
    if (employeeEmail) emails.add(employeeEmail);

    const joinedAt = nonEmpty(`${path}.joinedAt`, item.joinedAt);
    if (joinedAt && (!DATE.test(joinedAt) || Number.isNaN(Date.parse(joinedAt)))) {
      at(`${path}.joinedAt`, 'must be a YYYY-MM-DD date');
    }
    const terminatedAt = item.terminatedAt === undefined
      ? undefined
      : nonEmpty(`${path}.terminatedAt`, item.terminatedAt);
    if (terminatedAt && (!DATE.test(terminatedAt) || Number.isNaN(Date.parse(terminatedAt)))) {
      at(`${path}.terminatedAt`, 'must be a YYYY-MM-DD date');
    }

    const employmentStatus = item.employmentStatus ?? EmploymentStatus.ACTIVE;
    if (typeof employmentStatus !== 'string' || !EMPLOYMENT_VALUES.has(employmentStatus)) {
      at(`${path}.employmentStatus`, `must be one of ${[...EMPLOYMENT_VALUES].join(', ')}`);
    }

    const divisionsOfEmployee: string[] = [];
    if (item.divisions !== undefined) {
      if (!Array.isArray(item.divisions)) {
        at(`${path}.divisions`, 'must be an array of division names');
      } else {
        for (const [divisionIndex, name] of item.divisions.entries()) {
          if (typeof name !== 'string' || !divisionNames.has(name)) {
            at(`${path}.divisions[${divisionIndex}]`, `unknown division "${String(name)}" (declare it in "divisions")`);
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
          at(`${path}.identity.role`, `must be one of ${[...ROLE_VALUES].join(', ')}`);
        }
        if (typeof status !== 'string' || !STATUS_VALUES.has(status)) {
          at(`${path}.identity.status`, `must be one of ${[...STATUS_VALUES].join(', ')}`);
        }
        identity = { role: role as Role, status: status as IdentityStatus };
      }
    }

    employees.push({
      employeeNumber,
      fullName: nonEmpty(`${path}.fullName`, item.fullName),
      email: employeeEmail,
      phone: item.phone === undefined ? undefined : nonEmpty(`${path}.phone`, item.phone),
      joinedAt,
      terminatedAt,
      employmentStatus: employmentStatus as EmploymentStatus,
      divisions: divisionsOfEmployee,
      identity,
    });
  }

  if (problems.length > 0) {
    throw new Error(`${file} is not a valid seed file:\n  - ${problems.join('\n  - ')}`);
  }

  return { divisions, employees };
}

async function loadSeed(file: string): Promise<Seed> {
  const path = resolve(process.cwd(), file);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Cannot read ${path} — run from backend/ or pass --file <path>`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }

  return validate(parsed, path);
}

function describePlan(seed: Seed): void {
  log(`Plan: ${seed.divisions.length} division(s), ${seed.employees.length} employee(s)`);
  for (const division of seed.divisions) {
    log(`  division  ${division.name}`);
  }
  for (const employee of seed.employees) {
    const role = employee.identity?.role ?? Role.EMPLOYEE;
    const divisions = employee.divisions?.length ? employee.divisions.join(', ') : '—';
    log(`  employee  ${employee.employeeNumber}  ${employee.email}  ${role}  [${divisions}]`);
  }
}

/**
 * Writes the seed inside one transaction, so a failure leaves the database as
 * it was instead of half-seeded.
 */
async function ingest(manager: EntityManager, seed: Seed, stats: Stats): Promise<void> {
  const divisionRepo = manager.getRepository(Division);
  const employeeRepo = manager.getRepository(Employee);
  const identityRepo = manager.getRepository(Identity);

  const divisionsByName = new Map<string, Division>();
  for (const division of seed.divisions) {
    const description = division.description ?? null;
    const existing = await divisionRepo.findOne({ where: { name: division.name } });

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
    const employmentStatus = seedEmployee.employmentStatus ?? EmploymentStatus.ACTIVE;
    const terminatedAt = seedEmployee.terminatedAt
      ?? (employmentStatus === EmploymentStatus.TERMINATED ? seedEmployee.joinedAt : null);
    const phone = seedEmployee.phone ?? null;
    const wantedDivisions = (seedEmployee.divisions ?? [])
      .map((name) => divisionsByName.get(name))
      .filter((division): division is Division => division !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
    const currentDivisions = [...(existing?.divisions ?? [])].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    const divisionsMatch =
      currentDivisions.length === wantedDivisions.length &&
      currentDivisions.every((division, index) => division.id === wantedDivisions[index].id);

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
        log(`= employee  ${seedEmployee.employeeNumber}  ${seedEmployee.email}`);
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
        log(`~ employee  ${seedEmployee.employeeNumber}  ${seedEmployee.email}`);
      }
    }

    const role = seedEmployee.identity?.role ?? Role.EMPLOYEE;
    const status = seedEmployee.identity?.status ?? IdentityStatus.ACTIVE;
    const identityByEmployee = await identityRepo.findOne({ where: { employeeId: employee.id } });
    const identityByEmail = await identityRepo.findOne({ where: { email: employee.email } });

    if (identityByEmployee && identityByEmail && identityByEmployee.id !== identityByEmail.id) {
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
    entities: [Employee, Division, Identity],
    // The services own the schema; the seeder only writes rows into it.
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const seed = await loadSeed(options.file);

  log(`Seed file: ${resolve(process.cwd(), options.file)}`);
  if (options.dryRun) {
    describePlan(seed);
    log('Dry run: nothing was written.');
    return;
  }

  const env = readDbEnv();
  const dataSource = new DataSource(connectionOptions(env));
  await dataSource.initialize();
  log(`Connected to mysql://${env.username}@${env.host}:${env.port}/${env.database}`);

  const stats: Stats = {
    divisionsCreated: 0,
    divisionsUpdated: 0,
    employeesCreated: 0,
    employeesUpdated: 0,
    identitiesCreated: 0,
    identitiesUpdated: 0,
    unchanged: 0,
  };

  try {
    await dataSource.transaction((manager) => ingest(manager, seed, stats));
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
  await dataSource.destroy();

  log(
    `Done: divisions +${stats.divisionsCreated}/~${stats.divisionsUpdated}, ` +
      `employees +${stats.employeesCreated}/~${stats.employeesUpdated}, ` +
      `identities +${stats.identitiesCreated}/~${stats.identitiesUpdated}, ` +
      `unchanged ${stats.unchanged}`,
  );

  const admins = seed.employees.filter(
    (employee) => (employee.identity?.role ?? Role.EMPLOYEE) !== Role.EMPLOYEE,
  );
  if (admins.length > 0) {
    log(`Admin identities: ${admins.map((a) => `${a.email} (${a.identity?.role ?? Role.EMPLOYEE})`).join(', ')}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
