import '../config/load-env.js';
import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { configuration } from '../config/configuration.js';
import { AttendanceCorrection } from '../attendance/entities/attendance-correction.entity.js';
import { AttendanceRecord } from '../attendance/entities/attendance-record.entity.js';
import { Identity } from '../auth/entities/identity.entity.js';
import { OtpVerification } from '../auth/entities/otp-verification.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { Division } from '../employee/entities/division.entity.js';
import { EmployeeStatusHistory } from '../employee/entities/employee-status-history.entity.js';
import { Employee } from '../employee/entities/employee.entity.js';
import { LeaveRequest } from '../employee/entities/leave-request.entity.js';
import { WorkSchedule } from '../employee/entities/work-schedule.entity.js';
import { DailyEmployeeAttendance } from '../reporting/entities/daily-employee-attendance.entity.js';
import { EmployeeAttendanceSummary } from '../reporting/entities/employee-attendance-summary.entity.js';
import { ReportingEmployee } from '../reporting/entities/reporting-employee.entity.js';
import { InitialSchema1720000000000 } from './migrations/1720000000000-InitialSchema.js';

export const entities = [
  Identity,
  OtpVerification,
  RefreshToken,
  Employee,
  Division,
  EmployeeStatusHistory,
  WorkSchedule,
  LeaveRequest,
  AttendanceRecord,
  AttendanceCorrection,
  ReportingEmployee,
  DailyEmployeeAttendance,
  EmployeeAttendanceSummary,
];

export const migrations = [InitialSchema1720000000000];

/**
 * Builds TypeORM options from the same configuration the Nest app uses, so a
 * CLI/seed process and the running API always agree on the schema.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const config = configuration();

  return {
    type: 'postgres',
    host: config.db.host,
    port: config.db.port,
    username: config.db.username,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    entities,
    migrations,
    migrationsTableName: 'migrations',
    migrationsRun: config.db.migrationsRun,
    synchronize: config.db.synchronize,
    logging: config.db.logging ? ['error', 'warn', 'migration'] : ['error'],
    // Keeps migration/seed processes from scanning dist for globs.
    migrationsTransactionMode: 'each',
    extra: {
      max: 10,
      applicationName: 'absences-api',
    },
    subscribers: [],
  };
}

let dataSource: DataSource | undefined;

export function getDataSource(): DataSource {
  if (!dataSource) {
    dataSource = new DataSource(buildDataSourceOptions());
  }
  return dataSource;
}

/** Used by the standalone seed script. */
export const AppDataSource = new DataSource(buildDataSourceOptions());

export const migrationsDirectory = join(import.meta.dirname, 'migrations');
