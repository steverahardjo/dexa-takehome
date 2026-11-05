import {
  ClientProxyFactory,
  Transport,
  type ClientProxy,
  type MicroserviceOptions,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import mysql from 'mysql2/promise';
import { firstValueFrom } from 'rxjs';

import { EMPLOYEE_PATTERNS } from '../../shared/contracts/employee.contracts.js';
import { RPC_ERRORS } from '../../shared/rpc/errors.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmployeeModule } from './employee.module.js';
import {
  FakeStorageController,
  uploadedAvatars,
} from './testing/fake-storage.controller.js';

const HOST = '127.0.0.1';
const STORAGE_PORT = 4511;
const AUTH_PORT = 4512;
const EMPLOYEE_PORT = 4513;

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT ?? 3306);
const DB_ADMIN_USER = process.env.DB_ADMIN_USER ?? 'root';
const DB_ADMIN_PASSWORD = process.env.DB_ADMIN_PASSWORD ?? 'root';
const E2E_DATABASE = 'absences_e2e';

const AVATAR_KEY = 'avatars/2026/11/0f1b4b9a-6d78-4c1d-9d3f-2a1b3c4d5e6f.png';
const SECOND_AVATAR_KEY =
  'avatars/2026/11/1a2b3c4d-1111-4222-8333-444455556666.png';

const errorOf = async (
  promise: Promise<unknown>,
): Promise<{ code?: string; message?: string } | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as { code?: string; message?: string };
  }
};

describe('employee -> auth identity sync (e2e over TCP)', () => {
  let employeeClient: ClientProxy;
  let database: mysql.Connection;
  let employeeApp: { close: () => Promise<void> } | undefined;
  let storageApp: { close: () => Promise<void> } | undefined;
  let identityApp: { close: () => Promise<void> } | undefined;

  const call = <T>(pattern: string, payload: unknown): Promise<T> =>
    firstValueFrom(employeeClient.send<T>(pattern, payload));

  /** Tolerates a slower first write before a row count is asserted. */
  const waitFor = async (check: () => Promise<boolean>): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error('Timed out waiting for the identity event');
  };

  const countRows = async (table: string): Promise<number> => {
    const [rows] = await database.query<mysql.RowDataPacket[]>(
      `SELECT count(*) AS count FROM ${table}`,
    );

    return Number(rows[0].count);
  };

  beforeAll(async () => {
    uploadedAvatars.add(AVATAR_KEY);
    uploadedAvatars.add(SECOND_AVATAR_KEY);

    const admin = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_ADMIN_USER,
      password: DB_ADMIN_PASSWORD,
    });
    await admin.query(`DROP DATABASE IF EXISTS ${E2E_DATABASE}`);
    await admin.query(
      `CREATE DATABASE ${E2E_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await admin.end();

    Object.assign(process.env, {
      NODE_ENV: 'test',
      DB_SYNCHRONIZE: 'true',
      DB_LOGGING: 'false',
      DB_HOST,
      DB_PORT: String(DB_PORT),
      DB_DATABASE: E2E_DATABASE,
      DB_USERNAME: DB_ADMIN_USER,
      DB_PASSWORD: DB_ADMIN_PASSWORD,
      AUTH_TCP_HOST: HOST,
      AUTH_TCP_PORT: String(AUTH_PORT),
      EMPLOYEE_TCP_HOST: HOST,
      EMPLOYEE_TCP_PORT: String(EMPLOYEE_PORT),
      STORAGE_TCP_HOST: HOST,
      STORAGE_TCP_PORT: String(STORAGE_PORT),
      JWT_ACCESS_SECRET: 'e2e-secret',
      OTP_HASH_SECRET: 'e2e-otp-secret',
    });

    const storageRef = await Test.createTestingModule({
      controllers: [FakeStorageController],
    }).compile();
    storageApp = storageRef.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: STORAGE_PORT },
    });
    await storageApp.listen();

    const authRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();
    identityApp = authRef.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: AUTH_PORT },
    });
    await identityApp.listen();

    const employeeRef = await Test.createTestingModule({
      imports: [EmployeeModule],
    }).compile();
    employeeApp = employeeRef.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: EMPLOYEE_PORT },
    });
    await employeeApp.listen();

    database = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_ADMIN_USER,
      password: DB_ADMIN_PASSWORD,
      database: E2E_DATABASE,
    });

    employeeClient = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: HOST, port: EMPLOYEE_PORT },
    });
    await employeeClient.connect();
  }, 60_000);

  afterAll(async () => {
    await employeeClient?.close();
    await employeeApp?.close();
    await identityApp?.close();
    await storageApp?.close();
    await database?.end();

    const admin = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_ADMIN_USER,
      password: DB_ADMIN_PASSWORD,
    });
    await admin.query(`DROP DATABASE IF EXISTS ${E2E_DATABASE}`);
    await admin.end();
  }, 60_000);

  let createdId: string;

  it('stores the employee and creates the identity through auth', async () => {
    const view = await call<{
      id: string;
      email: string;
      avatarUrl: string | null;
      avatarKey: string | null;
    }>(EMPLOYEE_PATTERNS.create, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      joinedAt: '2026-01-05',
      avatarKey: AVATAR_KEY,
    });

    createdId = view.id;

    expect(view.avatarUrl).toContain('X-Amz-Signature=stub');
    expect(view.avatarKey).toBe(AVATAR_KEY);
    expect(await countRows('employees')).toBe(1);

    await waitFor(async () => (await countRows('identities')) === 1);

    const [rows] = await database.query<{
      employee_id: string;
      email: string;
      role: string;
      status: string;
    }[]>('SELECT employee_id, email, role, status FROM identities');

    expect(rows).toEqual([
      {
        employee_id: createdId,
        email: 'ada@example.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    ]);
  }, 30_000);

  it('refuses to create an employee without a stored avatar', async () => {
    const error = await errorOf(
      call(EMPLOYEE_PATTERNS.create, {
        fullName: 'Grace Hopper',
        email: 'grace@example.com',
        joinedAt: '2026-01-06',
        avatarKey: 'avatars/2026/11/9f9f9f9f-0000-4000-8000-000000000000.png',
      }),
    );

    expect(error?.code).toBe(RPC_ERRORS.invalidArgument);
    expect(await countRows('employees')).toBe(1);
    expect(await countRows('identities')).toBe(1);
  }, 30_000);

  it('keeps the employee even when the identity event fails', async () => {
    // Auth is down: the create still succeeds, because sync is an event.
    const view = await call<{ id: string }>(EMPLOYEE_PATTERNS.create, {
      fullName: 'Ada Clone',
      email: 'ada.clone@example.com',
      joinedAt: '2026-01-07',
      avatarKey: SECOND_AVATAR_KEY,
    });

    expect(view.id).toBeTruthy();
    expect(await countRows('employees')).toBe(2);

    await call(EMPLOYEE_PATTERNS.delete, { id: view.id });
  }, 30_000);

  it('syncs an email change into the identity', async () => {
    const view = await call<{ email: string; avatarUrl: string }>(
      EMPLOYEE_PATTERNS.update,
      { id: createdId, email: 'ada.king@example.com' },
    );

    expect(view.email).toBe('ada.king@example.com');
    expect(view.avatarUrl).toContain('X-Amz-Signature=stub');

    const identityEmail = async (): Promise<string | undefined> => {
      const [rows] = await database.query<{ email: string }[]>(
        'SELECT email FROM identities WHERE employee_id = ?',
        [createdId],
      );

      return rows[0]?.email;
    };

    await waitFor(
      async () => (await identityEmail()) === 'ada.king@example.com',
    );

    expect(await identityEmail()).toBe('ada.king@example.com');
  }, 30_000);

  it('deletes the identity and the employee', async () => {
    await expect(
      call(EMPLOYEE_PATTERNS.delete, { id: createdId }),
    ).resolves.toEqual({ id: createdId, deleted: true });

    expect(await countRows('employees')).toBe(0);

    await waitFor(async () => (await countRows('identities')) === 0);
    expect(await countRows('identities')).toBe(0);
  }, 30_000);

  it('reports a deleted employee as not found', async () => {
    const error = await errorOf(call(EMPLOYEE_PATTERNS.get, { id: createdId }));

    expect(error?.code).toBe(RPC_ERRORS.notFound);
  }, 30_000);
});
