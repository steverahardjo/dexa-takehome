import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';

import { AUTH_PATTERNS } from '../../../shared/contracts/auth.contracts.js';
import type {
  DeletedIdentity,
  IdentitySummary,
} from '../../../shared/contracts/auth.contracts.js';
import { EMPLOYEE_DATA_SOURCE } from '../../../shared/database/data-sources.js';
import type {
  ActiveEmployee,
  DeletedEmployee,
  DivisionView,
  EmployeeListResult,
  EmployeeView,
} from '../../../shared/contracts/employee.contracts.js';
import {
  STORAGE_NAMESPACES,
  STORAGE_PATTERNS,
  type ConfirmedUpload,
  type DownloadUrlResult,
  type UploadUrlResult,
} from '../../../shared/contracts/storage.contracts.js';
import { EmploymentStatus, Role } from '../../../shared/enums/roles.enum.js';
import { RPC_ERRORS } from '../../../shared/rpc/errors.js';
import { sendRpc } from '../../../shared/rpc/rpc-call.js';
import {
  AUTH_CLIENT,
  STORAGE_CLIENT,
} from '../clients/microservice-clients.js';
import type {
  AvatarUploadUrl,
  RequestAvatarUploadDto,
} from '../dto/avatar.dto.js';
import type {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
} from '../dto/employee.dto.js';
import { Division } from '../entity/division.entity.js';
import { Employee } from '../entity/employee.entity.js';

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

/**
 * Owns the employee database. Two writes per lifecycle change, one local and
 * one in auth:
 *
 *   create -> employee row, then `auth.identity.create`
 *   update -> employee row, then `auth.identity.update` (email changes only)
 *   delete -> `auth.identity.delete`, then the employee row
 *
 * Avatar keys come from the storage service: they must point at an object the
 * client already uploaded through a presigned URL, and every returned view
 * carries a freshly signed, temporary download URL.
 */
@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @InjectRepository(Employee, EMPLOYEE_DATA_SOURCE)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Division, EMPLOYEE_DATA_SOURCE)
    private readonly divisions: Repository<Division>,
    @Inject(AUTH_CLIENT) private readonly auth: ClientProxy,
    @Inject(STORAGE_CLIENT) private readonly storage: ClientProxy,
  ) {}

  /**
   * Reserves an object for a direct browser upload. The storage service owns the
   * key and the URL; the browser PUTs the bytes to MinIO itself.
   */
  async requestAvatarUpload(
    dto: RequestAvatarUploadDto,
  ): Promise<AvatarUploadUrl> {
    const reserved = await sendRpc<UploadUrlResult>(
      this.storage,
      STORAGE_PATTERNS.getUploadUrl,
      {
        contentType: dto.contentType,
        fileName: dto.fileName,
        namespace: STORAGE_NAMESPACES.avatar,
      },
      'Could not reserve an avatar upload',
    );

    return {
      key: reserved.key,
      uploadUrl: reserved.uploadUrl,
      expiresIn: reserved.expiresInSeconds,
    };
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeView> {
    const avatarKey = await this.requireUploadedAvatar(dto.avatarKey);
    const divisions = await this.resolveDivisions(dto.divisionIds);

    const employee = this.employees.create({
      employeeNumber: dto.employeeNumber ?? this.generateEmployeeNumber(),
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone ?? null,
      joinedAt: dto.joinedAt,
      employmentStatus: EmploymentStatus.ACTIVE,
      terminatedAt: null,
      avatarKey,
      divisions,
    });

    const saved = await this.persist(employee);

    try {
      await sendRpc<IdentitySummary>(
        this.auth,
        AUTH_PATTERNS.createIdentity,
        {
          employeeId: saved.id,
          email: saved.email,
          role: dto.role ?? Role.EMPLOYEE,
        },
        'Could not create the employee identity',
      );
    } catch (error) {
      // Without an identity the employee could never log in: do not keep it.
      await this.employees.delete(saved.id);
      await this.deleteAvatar(avatarKey);
      throw error;
    }

    return this.toView(saved);
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    const employee = await this.findEntity(id);

    const previousAvatar = employee.avatarKey;

    if (dto.fullName !== undefined) employee.fullName = dto.fullName;
    if (dto.phone !== undefined) employee.phone = dto.phone;
    if (dto.joinedAt !== undefined) employee.joinedAt = dto.joinedAt;
    if (dto.avatarKey !== undefined) {
      employee.avatarKey = await this.requireUploadedAvatar(dto.avatarKey);
    }
    if (dto.divisionIds !== undefined) {
      employee.divisions = await this.resolveDivisions(dto.divisionIds);
    }

    const previousEmail = employee.email;
    const emailChanged = dto.email !== undefined && dto.email !== previousEmail;

    if (emailChanged) {
      employee.email = dto.email!;
    }

    const saved = await this.persist(employee);

    if (emailChanged) {
      try {
        await sendRpc<IdentitySummary>(
          this.auth,
          AUTH_PATTERNS.updateIdentity,
          { employeeId: saved.id, email: saved.email },
          'Could not update the employee identity',
        );
      } catch (error) {
        // Keep the login identity and the employee record in agreement.
        saved.email = previousEmail;
        await this.persist(saved);
        throw error;
      }
    }

    // Only after the row is saved: a failed update must keep the old picture.
    if (
      dto.avatarKey !== undefined &&
      previousAvatar &&
      previousAvatar !== saved.avatarKey
    ) {
      await this.deleteAvatar(previousAvatar);
    }

    return this.toView(saved);
  }

  async remove(id: string): Promise<DeletedEmployee> {
    const employee = await this.findEntity(id);

    // Identity first, and awaited: an employee without an identity is a
    // visible bug; an identity without an employee is an account that can
    // still log in.
    await sendRpc<DeletedIdentity>(
      this.auth,
      AUTH_PATTERNS.deleteIdentity,
      { employeeId: id },
      'Could not delete the employee identity',
    );

    await this.employees.delete(id);

    if (employee.avatarKey) {
      await this.deleteAvatar(employee.avatarKey);
    }

    return { id, deleted: true };
  }

  async findOne(id: string): Promise<EmployeeView> {
    return this.toView(await this.findEntity(id));
  }

  /**
   * A page of the directory, ACTIVE employees only unless another status is
   * asked for.
   *
   * Defaulting to ACTIVE keeps the list and the attendance report in agreement:
   * only active people are expected to check in, so an INACTIVE or TERMINATED
   * person in a dashboard grid would look like someone who forgot to check in.
   * Their record is still reachable through `GET /admin/employees/:id`, and
   * `?status=` reaches the others on purpose (e.g. for rehiring).
   */
  async list(query: EmployeeQueryDto): Promise<EmployeeListResult> {
    const status = query.status ?? EmploymentStatus.ACTIVE;

    const builder = this.employees
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.divisions', 'division')
      .andWhere('employee.employmentStatus = :status', { status });

    if (query.search) {
      builder.andWhere(
        '(employee.fullName LIKE :search OR employee.email LIKE :search OR employee.employeeNumber LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.divisionId) {
      builder.andWhere('division.id = :divisionId', {
        divisionId: query.divisionId,
      });
    }

    const [rows, total] = await builder
      .orderBy('employee.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      items: await Promise.all(rows.map((row) => this.toView(row))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Minimal projection of every ACTIVE employee (attendance cron/report). */
  async listActive(): Promise<ActiveEmployee[]> {
    const rows = await this.employees.find({
      where: { employmentStatus: EmploymentStatus.ACTIVE },
      relations: { divisions: true },
      order: { employeeNumber: 'ASC' },
    });

    return rows.map((row) => ({
      id: row.id,
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
      email: row.email,
      divisionIds: (row.divisions ?? []).map((division) => division.id),
    }));
  }

  /** Every division, alphabetical: the source of the `divisionIds` picker. */
  async listDivisions(): Promise<DivisionView[]> {
    const rows = await this.divisions.find({ order: { name: 'ASC' } });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
    }));
  }

  private async findEntity(id: string): Promise<Employee> {
    const employee = await this.employees.findOne({
      where: { id },
      relations: { divisions: true },
    });

    if (!employee) {
      throw new RpcException({
        code: RPC_ERRORS.notFound,
        message: 'Employee does not exist',
      });
    }

    return employee;
  }

  private async persist(employee: Employee): Promise<Employee> {
    try {
      return await this.employees.save(employee);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RpcException({
          code: RPC_ERRORS.conflict,
          message: 'Employee number or email is already in use',
        });
      }

      throw error;
    }
  }

  private async resolveDivisions(ids?: string[]): Promise<Division[]> {
    if (!ids || ids.length === 0) return [];

    const unique = [...new Set(ids)];
    const found = await this.divisions.find({ where: { id: In(unique) } });

    if (found.length !== unique.length) {
      const missing = unique.filter(
        (id) => !found.some((division) => division.id === id),
      );

      throw new RpcException({
        code: RPC_ERRORS.notFound,
        message: `Unknown division(s): ${missing.join(', ')}`,
      });
    }

    return found;
  }

  /** The avatar must be an object the storage service handed out. */
  private async requireUploadedAvatar(key: string): Promise<string> {
    if (!key) {
      throw new RpcException({
        code: RPC_ERRORS.invalidArgument,
        message: 'avatarKey is required',
      });
    }

    const upload = await sendRpc<ConfirmedUpload>(
      this.storage,
      STORAGE_PATTERNS.confirmUpload,
      { key },
      'Could not verify the avatar',
    );

    return upload.key;
  }

  private async deleteAvatar(key: string): Promise<void> {
    try {
      await sendRpc(
        this.storage,
        STORAGE_PATTERNS.deleteObject,
        { key },
        'Could not delete the avatar',
      );
    } catch (error) {
      // The employee is already gone; a leftover object is only garbage.
      this.logger.warn(
        `Could not delete avatar "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async toView(employee: Employee): Promise<EmployeeView> {
    return {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone ?? null,
      employmentStatus: employee.employmentStatus,
      joinedAt: employee.joinedAt,
      terminatedAt: employee.terminatedAt ?? null,
      divisionIds: (employee.divisions ?? []).map((division) => division.id),
      avatarKey: employee.avatarKey ?? null,
      avatarUrl: employee.avatarKey
        ? await this.signedAvatarUrl(employee.avatarKey)
        : null,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
    };
  }

  private async signedAvatarUrl(key: string): Promise<string> {
    const signed = await sendRpc<DownloadUrlResult>(
      this.storage,
      STORAGE_PATTERNS.getDownloadUrl,
      { key },
      'Could not sign the avatar URL',
    );

    return signed.downloadUrl;
  }

  private generateEmployeeNumber(): string {
    return `EMP-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
