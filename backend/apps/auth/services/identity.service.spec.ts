import { RpcException } from '@nestjs/microservices';
import type { Repository } from 'typeorm';

import { IdentityService } from './identity.service.js';
import { Identity } from '../entity/identity.entity.js';
import { IdentityStatus, Role } from '../../../shared/enums/roles.enum.js';
import { RPC_ERRORS } from '../../../shared/rpc/errors.js';

interface FakeRepository {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const createRepository = (): FakeRepository => ({
  findOne: vi.fn().mockResolvedValue(null),
  create: vi.fn((input: Partial<Identity>) => ({ ...input })),
  save: vi.fn(async (identity: Identity) => ({
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    status: IdentityStatus.ACTIVE,
    ...identity,
  })),
  delete: vi.fn().mockResolvedValue({ affected: 1 }),
});

const createService = (
  repository = createRepository(),
): { service: IdentityService; repository: FakeRepository } => ({
  service: new IdentityService(repository as unknown as Repository<Identity>),
  repository,
});

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  await expect(promise).rejects.toBeInstanceOf(RpcException);

  return promise.catch((error: RpcException) => {
    const payload = error.getError() as { code: string };
    return payload.code;
  });
};

const employeeId = '0f1b4b9a-6d78-4c1d-9d3f-2a1b3c4d5e6f';

describe('IdentityService.create', () => {
  it('creates an active identity with the given role', async () => {
    const { service, repository } = createService();

    const summary = await service.create({
      employeeId,
      email: 'ada@example.com',
      role: Role.ADMIN,
    });

    expect(repository.create).toHaveBeenCalledWith({
      employeeId,
      email: 'ada@example.com',
      role: Role.ADMIN,
      status: IdentityStatus.ACTIVE,
    });
    expect(summary).toEqual({
      identityId: 'a1b2c3d4-0000-4000-8000-000000000001',
      employeeId,
      email: 'ada@example.com',
      role: Role.ADMIN,
      status: IdentityStatus.ACTIVE,
    });
  });

  it('defaults the role to EMPLOYEE', async () => {
    const { service, repository } = createService();

    await service.create({ employeeId, email: 'ada@example.com' });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.EMPLOYEE }),
    );
  });

  it('rejects an employee that already has an identity', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue({
      employeeId,
      email: 'x@example.com',
    });
    const { service } = createService(repository);

    expect(
      await codeOf(service.create({ employeeId, email: 'ada@example.com' })),
    ).toBe(RPC_ERRORS.conflict);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects an email that is already registered', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue({
      employeeId: '99999999-9999-4999-8999-999999999999',
      email: 'ada@example.com',
    });
    const { service } = createService(repository);

    expect(
      await codeOf(service.create({ employeeId, email: 'ada@example.com' })),
    ).toBe(RPC_ERRORS.conflict);
  });

  it('maps a database unique violation to CONFLICT', async () => {
    const repository = createRepository();
    repository.save.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );
    const { service } = createService(repository);

    expect(
      await codeOf(service.create({ employeeId, email: 'ada@example.com' })),
    ).toBe(RPC_ERRORS.conflict);
  });
});

describe('IdentityService.update', () => {
  it('changes the email and the role', async () => {
    const repository = createRepository();
    const identity = {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      employeeId,
      email: 'old@example.com',
      role: Role.EMPLOYEE,
      status: IdentityStatus.ACTIVE,
    };
    repository.findOne.mockResolvedValue(identity);
    repository.save.mockImplementation(async (value: Identity) => value);
    const { service } = createService(repository);

    const summary = await service.update({
      employeeId,
      email: 'new@example.com',
      role: Role.ADMIN,
    });

    expect(summary).toMatchObject({
      email: 'new@example.com',
      role: Role.ADMIN,
    });
  });

  it('fails when the identity does not exist', async () => {
    const { service } = createService();

    expect(
      await codeOf(service.update({ employeeId, email: 'new@example.com' })),
    ).toBe(RPC_ERRORS.notFound);
  });

  it('rejects an email owned by another identity', async () => {
    const repository = createRepository();
    repository.findOne
      .mockResolvedValueOnce({
        id: 'a1b2c3d4-0000-4000-8000-000000000001',
        employeeId,
        email: 'old@example.com',
        role: Role.EMPLOYEE,
        status: IdentityStatus.ACTIVE,
      })
      .mockResolvedValueOnce({
        id: 'b2c3d4e5-0000-4000-8000-000000000002',
        employeeId: 'another-employee',
        email: 'taken@example.com',
      });
    const { service } = createService(repository);

    expect(
      await codeOf(service.update({ employeeId, email: 'taken@example.com' })),
    ).toBe(RPC_ERRORS.conflict);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('IdentityService.remove', () => {
  it('deletes the identity of an employee', async () => {
    const { service, repository } = createService();

    await expect(service.remove(employeeId)).resolves.toEqual({
      employeeId,
      deleted: true,
    });
    expect(repository.delete).toHaveBeenCalledWith({ employeeId });
  });

  it('is idempotent when the identity is already gone', async () => {
    const repository = createRepository();
    repository.delete.mockResolvedValue({ affected: 0 });
    const { service } = createService(repository);

    await expect(service.remove(employeeId)).resolves.toEqual({
      employeeId,
      deleted: false,
    });
  });
});
