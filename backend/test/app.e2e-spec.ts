import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';

/**
 * End-to-end integration test against a real PostgreSQL database.
 *
 * It only runs when TEST_DATABASE_URL is set, e.g.
 *   TEST_DATABASE_URL=postgres://absences:absences@localhost:5432/absences_test npm run test:e2e
 * The target database is wiped and recreated from the migrations.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('Absences API (e2e)', () => {
  let app: INestApplication | undefined;
  let dataSource: DataSource | undefined;
  let server: Parameters<typeof request>[0];
  let masterId: string;
  let employeeId: string;
  let masterToken: string;
  let employeeToken: string;
  let masterRefreshToken: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    const database = url.pathname.replace(/^\//, '');
    if (!/^[a-zA-Z0-9_]+$/.test(database)) {
      throw new Error('TEST_DATABASE_URL must use a simple database name');
    }

    await ensureDatabase(url, database);

    Object.assign(process.env, {
      NODE_ENV: 'test',
      DB_HOST: url.hostname,
      DB_PORT: url.port || '5432',
      DB_USERNAME: decodeURIComponent(url.username),
      DB_PASSWORD: decodeURIComponent(url.password),
      DB_DATABASE: database,
      DB_SSL: 'false',
      DB_MIGRATIONS_RUN: 'true',
      DB_SYNCHRONIZE: 'false',
      JWT_SECRET: 'integration-test-secret-32-characters',
      JWT_ACCESS_TTL_SECONDS: '900',
      OTP_SECRET: 'integration-test-otp-secret',
      OTP_DEV_RETURN: 'true',
      OTP_MAX_REQUESTS: '100',
      RESEND_API_KEY: '',
      STORAGE_PROVIDER: 'memory',
      PUBLIC_API_URL: 'http://localhost:3000',
      COMPANY_TIMEZONE: 'Asia/Jakarta',
      COMPANY_CHECK_IN: '09:00:00',
      COMPANY_CHECK_OUT: '18:00:00',
      COMPANY_WORKING_DAYS: '1,2,3,4,5,6,7',
      SEED_DEMO: 'false',
      MASTER_ADMIN_EMAIL: '',
    });

    const { buildDataSourceOptions } = await import('../src/database/data-source.js');
    dataSource = new DataSource(buildDataSourceOptions());
    await resetSchema(url, database);
    await dataSource.initialize();

    await seedFixtures();

    const { AppModule } = await import('../src/app.module.js');
    const { AllExceptionsFilter } = await import(
      '../src/common/filters/all-exceptions.filter.js'
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    const masterLogin = await login('master@integration.test');
    masterToken = masterLogin.accessToken;
    masterRefreshToken = masterLogin.refreshToken;
    employeeToken = (await login('employee@integration.test')).accessToken;
  });

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function seedFixtures(): Promise<void> {
    const { Division } = await import('../src/employee/entities/division.entity.js');
    const { Employee } = await import('../src/employee/entities/employee.entity.js');
    const { WorkSchedule } = await import('../src/employee/entities/work-schedule.entity.js');
    const { Identity } = await import('../src/auth/entities/identity.entity.js');
    const { ReportingEmployee } = await import(
      '../src/reporting/entities/reporting-employee.entity.js'
    );
    const { EmploymentStatus, IdentityStatus, Role } = await import(
      '../src/common/enums/roles.enum.js'
    );

    const year = new Date().toISOString().slice(0, 4);
    const division = await dataSource.getRepository(Division).save({
      name: 'Engineering',
      description: 'Integration test division',
    });

    await dataSource!.getRepository(WorkSchedule).save({
      employeeId: null,
      divisionId: null,
      effectiveFrom: '2000-01-01',
      effectiveUntil: null,
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      requiredCheckIn: '09:00:00',
      requiredCheckOut: '18:00:00',
      timezone: 'Asia/Jakarta',
    });

    const employeeRepository = dataSource!.getRepository(Employee);
    const master = await employeeRepository.save(
      employeeRepository.create({
        employeeNumber: 'EMP0001',
        fullName: 'Integration Master',
        email: 'master@integration.test',
        phone: null,
        employmentStatus: EmploymentStatus.ACTIVE,
        joinedAt: `${year}-01-01`,
        terminatedAt: null,
        divisions: [division],
      }),
    );
    const employee = await employeeRepository.save(
      employeeRepository.create({
        employeeNumber: 'EMP0002',
        fullName: 'Integration Employee',
        email: 'employee@integration.test',
        phone: null,
        employmentStatus: EmploymentStatus.ACTIVE,
        joinedAt: `${year}-01-01`,
        terminatedAt: null,
        divisions: [division],
      }),
    );
    masterId = master.id;
    employeeId = employee.id;

    const identityRepository = dataSource!.getRepository(Identity);
    await identityRepository.save([
      identityRepository.create({
        employeeId: masterId,
        email: 'master@integration.test',
        role: Role.MASTER_ADMIN,
        status: IdentityStatus.ACTIVE,
      }),
      identityRepository.create({
        employeeId: employeeId,
        email: 'employee@integration.test',
        role: Role.EMPLOYEE,
        status: IdentityStatus.ACTIVE,
      }),
    ]);

    await dataSource!.getRepository(ReportingEmployee).upsert(
      [master, employee].map((record) => ({
        employeeId: record.id,
        employeeNumber: record.employeeNumber,
        employeeName: record.fullName,
        email: record.email,
        employmentStatus: record.employmentStatus,
        divisionNames: 'Engineering',
      })),
      ['employeeId'],
    );
  }

  async function login(email: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const otpResponse = await request(server)
      .post('/auth/request-otp')
      .send({ email })
      .expect(200);

    expect(otpResponse.body.devCode).toMatch(/^\d{6}$/);

    const verifyResponse = await request(server)
      .post('/auth/verify-otp')
      .send({ email, otp: otpResponse.body.devCode })
      .expect(200);

    return verifyResponse.body.tokens;
  }

  it('signs a user in with a one-time email code', async () => {
    const response = await request(server)
      .post('/auth/verify-otp')
      .send({ email: 'master@integration.test', otp: '000000' })
      .expect(401);

    expect(response.body.statusCode).toBe(401);
    expect(masterToken).toBeTruthy();
    expect(employeeToken).toBeTruthy();
  });

  it('returns today’s dashboard with every expected employee', async () => {
    const response = await request(server)
      .get('/reports/attendance/today')
      .set('authorization', `Bearer ${masterToken}`)
      .expect(200);

    expect(response.body.date).toBe(localIsoDate());
    expect(response.body.summary.totalEmployees).toBe(2);
    expect(response.body.summary.notCheckedIn).toBe(2);
    expect(response.body.employees).toHaveLength(2);
    expect(
      response.body.employees.every((entry: { status: string }) =>
        ['NOT_CHECKED_IN', 'NOT_WORKING'].includes(entry.status),
      ),
    ).toBe(true);
  });

  it('checks in with photo evidence, rejects duplicates and checks out', async () => {
    const checkIn = await request(server)
      .post('/attendance/check-in')
      .set('authorization', `Bearer ${employeeToken}`)
      .field('location', 'HQ Office')
      .attach('picture', TINY_PNG, { filename: 'evidence.png', contentType: 'image/png' })
      .expect(201);

    expect(checkIn.body.attendanceDate).toBe(localIsoDate());
    expect(checkIn.body.checkInTime).toBeTruthy();
    expect(checkIn.body.location).toBe('HQ Office');

    const expectedLate = localTimeOf(new Date(checkIn.body.checkInTime)) > '09:00:00';
    expect(checkIn.body.late).toBe(expectedLate);

    const photoPath = new URL(checkIn.body.pictureUrl).pathname;
    const photo = await request(server).get(photoPath).expect(200);
    expect(photo.headers['content-type']).toContain('image/png');

    await request(server)
      .post('/attendance/check-in')
      .set('authorization', `Bearer ${employeeToken}`)
      .send({})
      .expect(409);

    const dashboard = await request(server)
      .get('/reports/attendance/today')
      .set('authorization', `Bearer ${masterToken}`)
      .expect(200);

    const entry = dashboard.body.employees.find(
      (candidate: { employeeId: string }) => candidate.employeeId === employeeId,
    );
    expect(entry.status).toBe(checkIn.body.late ? 'LATE' : 'ON_TIME');
    expect(entry.checkInTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    const checkOut = await request(server)
      .post('/attendance/check-out')
      .set('authorization', `Bearer ${employeeToken}`)
      .send({})
      .expect(201);
    expect(checkOut.body.checkOutTime).toBeTruthy();
    expect(new Date(checkOut.body.checkOutTime).getTime()).toBeGreaterThanOrEqual(
      new Date(checkOut.body.checkInTime).getTime(),
    );

    await request(server)
      .post('/attendance/check-out')
      .set('authorization', `Bearer ${employeeToken}`)
      .send({})
      .expect(409);

    const date = localIsoDate();
    const corrected = await request(server)
      .patch(`/attendance/${checkOut.body.id}`)
      .set('authorization', `Bearer ${masterToken}`)
      .send({
        checkInTime: `${date}T09:30:00+07:00`,
        checkOutTime: `${date}T18:05:00+07:00`,
        reason: 'Badge reader was offline',
      })
      .expect(200);

    expect(corrected.body.late).toBe(true);
    expect(corrected.body.lateMinutes).toBe(30);

    const audit: Array<{ count: number }> = await dataSource!.query(
      'SELECT COUNT(*)::int AS count FROM attendance_corrections',
    );
    expect(audit[0].count).toBe(1);
  });

  it('keeps employees inside their own attendance data', async () => {
    await request(server)
      .get('/reports/attendance/today')
      .set('authorization', `Bearer ${employeeToken}`)
      .expect(403);

    await request(server)
      .get('/employees')
      .set('authorization', `Bearer ${employeeToken}`)
      .expect(403);

    await request(server)
      .get(`/attendance/employee/${masterId}`)
      .set('authorization', `Bearer ${employeeToken}`)
      .expect(403);

    const own = await request(server)
      .get('/attendance/me')
      .set('authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(own.body.meta.total).toBe(1);
  });

  it('produces yearly, monthly and paginated history reports', async () => {
    const year = Number(localIsoDate().slice(0, 4));

    const yearly = await request(server)
      .get(`/reports/employees/${employeeId}/yearly?year=${year}`)
      .set('authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(yearly.body.year).toBe(year);
    expect(yearly.body.summary.presentDays).toBe(1);
    expect(yearly.body.summary.workingDays).toBeGreaterThanOrEqual(1);
    expect(yearly.body.punctualityRate).toBeGreaterThanOrEqual(0);

    const monthly = await request(server)
      .get(`/reports/employees/${employeeId}/monthly?year=${year}`)
      .set('authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(monthly.body.months).toHaveLength(12);

    const history = await request(server)
      .get(`/reports/employees/${employeeId}/history?year=${year}&limit=5`)
      .set('authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(history.body.data[0].date).toBe(localIsoDate());
    expect(history.body.data[0].status).toBe(
      yearly.body.summary.lateDays === 1 ? 'LATE' : 'ON_TIME',
    );
  });

  it('disables the login identity on termination without erasing attendance', async () => {
    await request(server)
      .post(`/employees/${employeeId}/terminate`)
      .set('authorization', `Bearer ${masterToken}`)
      .send({ reason: 'Integration test termination' })
      .expect(201)
      .expect((response) => {
        expect(response.body.employmentStatus).toBe('TERMINATED');
      });

    await request(server)
      .get('/auth/me')
      .set('authorization', `Bearer ${employeeToken}`)
      .expect(401);

    const otp = await request(server)
      .post('/auth/request-otp')
      .send({ email: 'employee@integration.test' })
      .expect(200);
    expect(otp.body.devCode).toBeUndefined();

    const history = await request(server)
      .get(`/attendance/employee/${employeeId}`)
      .set('authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(history.body.meta.total).toBe(1);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const rotated = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: masterRefreshToken })
      .expect(200);
    expect(rotated.body.tokens.accessToken).toBeTruthy();

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: masterRefreshToken })
      .expect(401);
  });

  it('validates request payloads', async () => {
    await request(server)
      .post('/auth/request-otp')
      .send({ email: 'not-an-email' })
      .expect(400);

    await request(server)
      .post('/attendance/check-in')
      .set('authorization', `Bearer ${masterToken}`)
      .send({ unexpected: true })
      .expect(400);
  });

  function localIsoDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function localTimeOf(instant: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
  }
});

async function ensureDatabase(url: URL, database: string): Promise<void> {
  const client = new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: 'postgres',
  });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await client.end();
  }
}

async function resetSchema(url: URL, database: string): Promise<void> {
  const client = new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}
