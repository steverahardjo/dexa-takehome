import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: auth, employee, attendance and reporting projections.
 *
 * All instants are `timestamptz` (stored UTC); attendance dates and schedule
 * times are evaluated in the schedule's business timezone by the application.
 */
export class InitialSchema1720000000000 implements MigrationInterface {
  name = 'InitialSchema1720000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE role_enum AS ENUM ('EMPLOYEE', 'ADMIN', 'MASTER_ADMIN')`);
    await queryRunner.query(`CREATE TYPE identity_status_enum AS ENUM ('ACTIVE', 'DISABLED')`);
    await queryRunner.query(
      `CREATE TYPE employment_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED')`,
    );
    await queryRunner.query(
      `CREATE TYPE attendance_status_enum AS ENUM ('ON_TIME', 'LATE', 'NOT_CHECKED_IN', 'ON_LEAVE', 'NOT_WORKING', 'ABSENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE leave_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')`,
    );

    await queryRunner.query(`CREATE SEQUENCE employee_number_seq START WITH 1 INCREMENT BY 1`);

    await queryRunner.query(`
      CREATE TABLE employees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_number varchar(32) NOT NULL,
        full_name varchar(255) NOT NULL,
        email varchar(255) NOT NULL,
        phone varchar(32),
        employment_status employment_status_enum NOT NULL DEFAULT 'ACTIVE',
        joined_at date NOT NULL,
        terminated_at date,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_employees_number UNIQUE (employee_number)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_employees_email ON employees (email)`);
    await queryRunner.query(
      `CREATE INDEX idx_employees_status ON employees (employment_status)`,
    );

    await queryRunner.query(`
      CREATE TABLE divisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(128) NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_divisions_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE employee_divisions (
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        division_id uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
        PRIMARY KEY (employee_id, division_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_employee_divisions_division ON employee_divisions (division_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE employee_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        previous_status employment_status_enum NOT NULL,
        new_status employment_status_enum NOT NULL,
        effective_date date NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_status_history_employee_date ON employee_status_history (employee_id, effective_date)`,
    );

    await queryRunner.query(`
      CREATE TABLE work_schedules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
        division_id uuid REFERENCES divisions(id) ON DELETE CASCADE,
        effective_from date NOT NULL,
        effective_until date,
        working_days int[] NOT NULL DEFAULT '{1,2,3,4,5}',
        required_check_in time NOT NULL DEFAULT '09:00',
        required_check_out time NOT NULL DEFAULT '18:00',
        timezone varchar(64) NOT NULL DEFAULT 'UTC',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_schedule_window CHECK (effective_until IS NULL OR effective_until >= effective_from),
        CONSTRAINT chk_schedule_scope CHECK (employee_id IS NULL OR division_id IS NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_schedules_employee_from ON work_schedules (employee_id, effective_from)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_schedules_division_from ON work_schedules (division_id, effective_from)`,
    );

    await queryRunner.query(`
      CREATE TABLE leave_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        start_date date NOT NULL,
        end_date date NOT NULL,
        status leave_status_enum NOT NULL DEFAULT 'PENDING',
        reason text,
        decided_by varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_leave_window CHECK (end_date >= start_date)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_leave_employee_range ON leave_requests (employee_id, start_date, end_date)`,
    );
    await queryRunner.query(`CREATE INDEX idx_leave_status ON leave_requests (status)`);

    await queryRunner.query(`
      CREATE TABLE identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        email varchar(255) NOT NULL,
        role role_enum NOT NULL DEFAULT 'EMPLOYEE',
        status identity_status_enum NOT NULL DEFAULT 'ACTIVE',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_identities_email UNIQUE (email)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_identities_employee ON identities (employee_id)`);

    await queryRunner.query(`
      CREATE TABLE otp_verifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        identity_id uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
        otp_hash varchar(128) NOT NULL,
        expires_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_otp_identity_created ON otp_verifications (identity_id, created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        identity_id uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
        token_hash varchar(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_refresh_identity ON refresh_tokens (identity_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE attendance_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        attendance_date date NOT NULL,
        check_in_time timestamptz,
        check_out_time timestamptz,
        late boolean NOT NULL DEFAULT false,
        location varchar(255),
        picture_url text,
        required_check_in time,
        required_check_out time,
        late_minutes integer NOT NULL DEFAULT 0,
        timezone varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_attendance_employee_date UNIQUE (employee_id, attendance_date)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_attendance_employee_date ON attendance_records (employee_id, attendance_date)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_attendance_date ON attendance_records (attendance_date)`,
    );

    await queryRunner.query(`
      CREATE TABLE attendance_corrections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        attendance_id uuid NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
        corrected_by uuid NOT NULL,
        reason text NOT NULL,
        previous_values jsonb NOT NULL,
        new_values jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_corrections_attendance_created ON attendance_corrections (attendance_id, created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE reporting_employees (
        employee_id uuid PRIMARY KEY,
        employee_number varchar(32) NOT NULL,
        employee_name varchar(255) NOT NULL,
        email varchar(255) NOT NULL,
        employment_status employment_status_enum NOT NULL,
        division_names varchar(512) NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_reporting_employee_number UNIQUE (employee_number)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE daily_employee_attendance (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL,
        attendance_date date NOT NULL,
        employee_name varchar(255) NOT NULL,
        division_names varchar(512) NOT NULL DEFAULT '',
        required_check_in time,
        actual_check_in timestamptz,
        required_check_out time,
        actual_check_out timestamptz,
        timezone varchar(64),
        status attendance_status_enum NOT NULL,
        late_minutes integer NOT NULL DEFAULT 0,
        picture_url text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_daily_employee_date UNIQUE (employee_id, attendance_date)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_daily_date_status ON daily_employee_attendance (attendance_date, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_daily_employee_date ON daily_employee_attendance (employee_id, attendance_date)`,
    );

    await queryRunner.query(`
      CREATE TABLE employee_attendance_summary (
        employee_id uuid NOT NULL,
        year integer NOT NULL,
        working_days integer NOT NULL DEFAULT 0,
        present_days integer NOT NULL DEFAULT 0,
        on_time_days integer NOT NULL DEFAULT 0,
        late_days integer NOT NULL DEFAULT 0,
        absent_days integer NOT NULL DEFAULT 0,
        leave_days integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (employee_id, year)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS employee_attendance_summary`);
    await queryRunner.query(`DROP TABLE IF EXISTS daily_employee_attendance`);
    await queryRunner.query(`DROP TABLE IF EXISTS reporting_employees`);
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_corrections`);
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_records`);
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS otp_verifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS identities`);
    await queryRunner.query(`DROP TABLE IF EXISTS leave_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_schedules`);
    await queryRunner.query(`DROP TABLE IF EXISTS employee_status_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS employee_divisions`);
    await queryRunner.query(`DROP TABLE IF EXISTS divisions`);
    await queryRunner.query(`DROP TABLE IF EXISTS employees`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS employee_number_seq`);

    await queryRunner.query(`DROP TYPE IF EXISTS leave_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS attendance_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS employment_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS identity_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS role_enum`);
  }
}
