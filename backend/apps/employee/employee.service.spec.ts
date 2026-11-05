import { RpcException } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import type { Repository } from 'typeorm';

import { AUTH_PATTERNS } from '../../shared/contracts/auth.contracts.js';
import {
  STORAGE_NAMESPACES,
  STORAGE_PATTERNS,
} from '../../shared/contracts/storage.contracts.js';
import { EmploymentStatus, Role } from '../../shared/enums/roles.enum.js';
import { RPC_ERRORS } from '../../shared/rpc/errors.js';
import { Division } from './entity/division.entity.js';
import { Employee } from './entity/employee.entity.js';
import { EmployeeService } from './services/employee.service.js';

const EMPLOYEE_ID = '0f1b4b9a-6d78-4c1d-9d3f-2a1b3c4d5e6f';
const DIVISION_ID = '1a2b3c4d-1111-4222-8333-444455556666';
const AVATAR_KEY = `avatars/${new Date().getUTCFullYear()}/11/0f1b4b9a-6d78-4c1d-9d3f-2a1b3c4d5e6f.png`;
const SECOND_AVATAR_KEY = `avatars/${new Date().getUTCFullYear()}/11/1a2b3c4d-5555-4666-8777-888899990000.png`;
const SIGNED_URL = 'https://minio.test/absences/avatar.png?X-Amz-Signature=abc';

const persistedEmployee = (): Employee =>
  ({
    id: EMPLOYEE_ID,
    employeeNumber: 'EMP-1234ABCD',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: null,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinedAt: '2026-01-05',
    terminatedAt: null,
    avatarKey: AVATAR_KEY,
    divisions: [],
    createdAt: new Date('2026-01-05T00:00:00.000Z'),
    updatedAt: new Date('2026-01-05T00:00:00.000Z'),
  }) as Employee;

interface Fakes {
  employees: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  divisions: { find: ReturnType<typeof vi.fn> };
  auth: { send: ReturnType<typeof vi.fn> };
  storage: { send: ReturnType<typeof vi.fn> };
}

const createFakes = (): Fakes => ({
  employees: {
    create: vi.fn((input: Partial<Employee>) => ({ ...input })),
    save: vi.fn(async (employee: Employee) => ({
      ...persistedEmployee(),
      ...employee,
    })),
    findOne: vi.fn().mockResolvedValue(persistedEmployee()),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: vi.fn(),
  },
  divisions: {
    find: vi.fn().mockResolvedValue([{ id: DIVISION_ID, name: 'Engineering' }]),
  },
  auth: { send: vi.fn(() => of({ identityId: 'identity-1' })) },
  storage: {
    send: vi.fn((pattern: string, payload: { key?: string } = {}) => {
      if (pattern === STORAGE_PATTERNS.confirmUpload) {
        return of({
          key: payload.key ?? AVATAR_KEY,
          size: 12,
          contentType: 'image/png',
        });
      }
      if (pattern === STORAGE_PATTERNS.getDownloadUrl) {
        return of({
          key: AVATAR_KEY,
          downloadUrl: SIGNED_URL,
          expiresInSeconds: 900,
          contentType: 'image/png',
          size: 12,
        });
      }
      return of({ key: AVATAR_KEY, deleted: true });
    }),
  },
});

const createService = (
  fakes: Fakes = createFakes(),
): { service: EmployeeService; fakes: Fakes } => ({
  service: new EmployeeService(
    fakes.employees as unknown as Repository<Employee>,
    fakes.divisions as unknown as Repository<Division>,
    fakes.auth as unknown as ClientProxy,
    fakes.storage as unknown as ClientProxy,
  ),
  fakes,
});

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  await expect(promise).rejects.toBeInstanceOf(RpcException);

  return promise.catch((error: RpcException) => {
    const payload = error.getError() as { code: string };
    return payload.code;
  });
};

const createPayload = () => ({
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  joinedAt: '2026-01-05',
  avatarKey: AVATAR_KEY,
});

describe('EmployeeService.requestAvatarUpload', () => {
  it('reserves a key and a presigned URL through storage', async () => {
    const fakes = createFakes();
    fakes.storage.send.mockImplementation((pattern: string) => {
      if (pattern === STORAGE_PATTERNS.getUploadUrl) {
        return of({
          key: AVATAR_KEY,
          uploadUrl: 'https://minio/avatars/key?X-Amz-Signature=put',
          expiresInSeconds: 600,
        });
      }

      return of({});
    });
    const { service } = createService(fakes);

    const result = await service.requestAvatarUpload({
      fileName: 'me.png',
      contentType: 'image/png',
    });

    expect(fakes.storage.send).toHaveBeenCalledWith(
      STORAGE_PATTERNS.getUploadUrl,
      {
        contentType: 'image/png',
        fileName: 'me.png',
        namespace: STORAGE_NAMESPACES.avatar,
      },
    );
    expect(result).toEqual({
      key: AVATAR_KEY,
      uploadUrl: 'https://minio/avatars/key?X-Amz-Signature=put',
      expiresIn: 600,
    });
  });
});

describe('EmployeeService.create', () => {
  it('verifies the avatar, stores the employee and creates the identity', async () => {
    const { service, fakes } = createService();

    const view = await service.create(createPayload());

    expect(fakes.storage.send).toHaveBeenCalledWith(
      STORAGE_PATTERNS.confirmUpload,
      { key: AVATAR_KEY },
    );
    expect(fakes.employees.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        avatarKey: AVATAR_KEY,
        employmentStatus: EmploymentStatus.ACTIVE,
      }),
    );
    expect(fakes.auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.createIdentity, {
      employeeId: EMPLOYEE_ID,
      email: 'ada@example.com',
      role: Role.EMPLOYEE,
    });
    expect(view).toMatchObject({
      id: EMPLOYEE_ID,
      avatarKey: AVATAR_KEY,
      avatarUrl: SIGNED_URL,
      divisionIds: [],
    });
  });

  it('requires an uploaded avatar before touching the database', async () => {
    const { service, fakes } = createService();

    expect(
      await codeOf(service.create({ ...createPayload(), avatarKey: '' })),
    ).toBe(RPC_ERRORS.invalidArgument);
    expect(fakes.storage.send).not.toHaveBeenCalled();
    expect(fakes.employees.save).not.toHaveBeenCalled();
  });

  it('rejects an avatar the storage service does not know', async () => {
    const fakes = createFakes();
    fakes.storage.send.mockImplementation(() =>
      throwError(() => ({
        code: RPC_ERRORS.invalidArgument,
        message: 'Invalid storage key',
      })),
    );
    const { service } = createService(fakes);

    expect(await codeOf(service.create(createPayload()))).toBe(
      RPC_ERRORS.invalidArgument,
    );
    expect(fakes.employees.save).not.toHaveBeenCalled();
    expect(fakes.auth.send).not.toHaveBeenCalled();
  });

  it('rejects unknown divisions', async () => {
    const fakes = createFakes();
    fakes.divisions.find.mockResolvedValue([]);
    const { service } = createService(fakes);

    expect(
      await codeOf(
        service.create({ ...createPayload(), divisionIds: [DIVISION_ID] }),
      ),
    ).toBe(RPC_ERRORS.notFound);
    expect(fakes.employees.save).not.toHaveBeenCalled();
  });

  it('links the requested divisions', async () => {
    const { service, fakes } = createService();

    const view = await service.create({
      ...createPayload(),
      divisionIds: [DIVISION_ID],
    });

    expect(fakes.employees.save).toHaveBeenCalledWith(
      expect.objectContaining({
        divisions: [expect.objectContaining({ id: DIVISION_ID })],
      }),
    );
    expect(view.divisionIds).toEqual([DIVISION_ID]);
  });
});

describe('EmployeeService.update', () => {
  it('updates the employee and keeps the identity email in sync', async () => {
    const { service, fakes } = createService();

    const view = await service.update(EMPLOYEE_ID, {
      fullName: 'Ada King',
      email: 'ada.king@example.com',
    });

    expect(fakes.employees.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Ada King',
        email: 'ada.king@example.com',
      }),
    );
    expect(fakes.auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.updateIdentity, {
      employeeId: EMPLOYEE_ID,
      email: 'ada.king@example.com',
    });
    expect(view.avatarUrl).toBe(SIGNED_URL);
  });

  it('does not touch auth when the email is unchanged', async () => {
    const { service, fakes } = createService();

    await service.update(EMPLOYEE_ID, { fullName: 'Ada King' });

    expect(fakes.auth.send).not.toHaveBeenCalled();
  });

  it('verifies a replacement avatar', async () => {
    const { service, fakes } = createService();

    await service.update(EMPLOYEE_ID, { avatarKey: AVATAR_KEY });

    expect(fakes.storage.send).toHaveBeenCalledWith(
      STORAGE_PATTERNS.confirmUpload,
      { key: AVATAR_KEY },
    );
  });

  it('deletes the previous avatar only after the new one is stored', async () => {
    const { service, fakes } = createService();

    await service.update(EMPLOYEE_ID, { avatarKey: SECOND_AVATAR_KEY });

    expect(fakes.storage.send).toHaveBeenCalledWith(
      STORAGE_PATTERNS.deleteObject,
      { key: AVATAR_KEY },
    );
    expect(fakes.storage.send.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      fakes.employees.save.mock.invocationCallOrder[0],
    );
  });

  it('keeps the old avatar when the update fails', async () => {
    const fakes = createFakes();
    fakes.employees.save.mockRejectedValue(
      Object.assign(new Error('boom'), { code: '23505' }),
    );
    const { service } = createService(fakes);

    expect(
      await codeOf(
        service.update(EMPLOYEE_ID, { avatarKey: SECOND_AVATAR_KEY }),
      ),
    ).toBe(RPC_ERRORS.conflict);
    expect(fakes.storage.send).not.toHaveBeenCalledWith(
      STORAGE_PATTERNS.deleteObject,
      { key: AVATAR_KEY },
    );
  });

  it('fails for an unknown employee', async () => {
    const fakes = createFakes();
    fakes.employees.findOne.mockResolvedValue(null);
    const { service } = createService(fakes);

    expect(await codeOf(service.update(EMPLOYEE_ID, { fullName: 'X' }))).toBe(
      RPC_ERRORS.notFound,
    );
  });
});

describe('EmployeeService.remove', () => {
  it('deletes the identity first, then the employee, then the avatar', async () => {
    const { service, fakes } = createService();

    await expect(service.remove(EMPLOYEE_ID)).resolves.toEqual({
      id: EMPLOYEE_ID,
      deleted: true,
    });

    expect(fakes.auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.deleteIdentity, {
      employeeId: EMPLOYEE_ID,
    });
    expect(fakes.employees.delete).toHaveBeenCalledWith(EMPLOYEE_ID);
    expect(fakes.storage.send).toHaveBeenCalledWith(
      STORAGE_PATTERNS.deleteObject,
      { key: AVATAR_KEY },
    );
    expect(fakes.auth.send.mock.invocationCallOrder[0]).toBeLessThan(
      fakes.employees.delete.mock.invocationCallOrder[0],
    );
  });

  it('does not delete anything for an unknown employee', async () => {
    const fakes = createFakes();
    fakes.employees.findOne.mockResolvedValue(null);
    const { service } = createService(fakes);

    expect(await codeOf(service.remove(EMPLOYEE_ID))).toBe(RPC_ERRORS.notFound);
    expect(fakes.auth.send).not.toHaveBeenCalled();
    expect(fakes.employees.delete).not.toHaveBeenCalled();
  });
});
