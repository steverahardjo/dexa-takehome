import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';

import type {
  DeletedIdentity,
  IdentitySummary,
} from '../../../shared/contracts/auth.contracts.js';

import { IdentityStatus, Role } from '../../../shared/enums/roles.enum.js';

import { AUTH_DATA_SOURCE } from '../../../shared/database/data-sources.js';
import { RPC_ERRORS } from '../../../shared/rpc/errors.js';

import type {
  CreateIdentityDto,
  UpdateIdentityDto,
} from '../dto/identity.dto.js';

import { Identity } from '../entity/identity.entity.js';

const toSummary = (identity: Identity): IdentitySummary => ({
  identityId: identity.id,
  employeeId: identity.employeeId,
  email: identity.email,
  role: identity.role,
  status: identity.status,
});

const isUniqueViolation = (error: unknown): boolean => {
  const dbError = error as {
    code?: string;
    errno?: number;
    driverError?: { code?: string; errno?: number };
  };
  const code = dbError.code ?? dbError.driverError?.code;
  const errno = dbError.errno ?? dbError.driverError?.errno;

  // 23505 = Postgres, ER_DUP_ENTRY/1062 = MySQL.
  return code === '23505' || code === 'ER_DUP_ENTRY' || errno === 1062;
};

@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(Identity, AUTH_DATA_SOURCE)
    private readonly identities: Repository<Identity>,
  ) {}

  /** Creates the identity of an employee. */
  async create(dto: CreateIdentityDto): Promise<IdentitySummary> {
    const existing = await this.identities.findOne({
      where: [{ employeeId: dto.employeeId }, { email: dto.email }],
    });

    if (existing) {
      throw new RpcException({
        code: RPC_ERRORS.conflict,
        message:
          existing.employeeId === dto.employeeId
            ? 'Employee already has an identity'
            : 'Email is already registered',
      });
    }

    const identity = this.identities.create({
      employeeId: dto.employeeId,
      email: dto.email,
      role: dto.role ?? Role.EMPLOYEE,
      status: IdentityStatus.ACTIVE,
    });

    try {
      return toSummary(await this.identities.save(identity));
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /** Updates the email and/or role of an existing identity. */
  async update(dto: UpdateIdentityDto): Promise<IdentitySummary> {
    const identity = await this.identities.findOne({
      where: { employeeId: dto.employeeId },
    });

    if (!identity) {
      throw new RpcException({
        code: RPC_ERRORS.notFound,
        message: 'Identity does not exist',
      });
    }

    if (dto.email !== undefined && dto.email !== identity.email) {
      const taken = await this.identities.findOne({
        where: { email: dto.email },
      });

      if (taken && taken.id !== identity.id) {
        throw new RpcException({
          code: RPC_ERRORS.conflict,
          message: 'Email is already registered',
        });
      }

      identity.email = dto.email;
    }

    if (dto.role !== undefined) {
      identity.role = dto.role;
    }

    try {
      return toSummary(await this.identities.save(identity));
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /** Idempotent deletion. */
  async remove(employeeId: string): Promise<DeletedIdentity> {
    const result = await this.identities.delete({ employeeId });

    return { employeeId, deleted: (result.affected ?? 0) > 0 };
  }

  private mapWriteError(error: unknown): RpcException | unknown {
    if (isUniqueViolation(error)) {
      return new RpcException({
        code: RPC_ERRORS.conflict,
        message: 'Identity already exists',
      });
    }

    return error;
  }
}
