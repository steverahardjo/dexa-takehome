import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuthService } from '../../auth/services/auth.service.js';
import { EmploymentStatus, IdentityStatus, Role } from '../../common/enums/roles.enum.js';
import {
  paginate,
  type Paginated,
} from '../../common/interfaces/pagination.interface.js';
import { localDate } from '../../common/time/time.util.js';
import type {
  AssignDivisionsDto,
  ChangeEmploymentStatusDto,
  CreateEmployeeDto,
  EmployeeQueryDto,
  TerminateEmployeeDto,
  UpdateEmployeeDto,
} from '../dto/employee.dto.js';
import { Division } from '../entities/division.entity.js';
import { EmployeeStatusHistory } from '../entities/employee-status-history.entity.js';
import { Employee } from '../entities/employee.entity.js';

@Injectable()
export class EmployeeService {
  private readonly companyTimezone: string;

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectRepository(EmployeeStatusHistory)
    private readonly historyRepository: Repository<EmployeeStatusHistory>,
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.companyTimezone = config.get<string>('company.timezone', 'Asia/Jakarta');
  }

  async create(dto: CreateEmployeeDto, actorRole: Role): Promise<Employee> {
    const email = dto.email.trim().toLowerCase();
    const divisions = await this.resolveDivisions(dto.divisionIds ?? []);
    await this.assertEmailAvailable(email);

    const employee = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Employee);
      const employeeNumber = dto.employeeNumber ?? (await this.nextEmployeeNumber(manager));

      const alreadyUsed = await repository.findOne({ where: { employeeNumber } });
      if (alreadyUsed) {
        throw new ConflictException(`Employee number ${employeeNumber} is already in use`);
      }

      const created = repository.create({
        employeeNumber,
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone ?? null,
        employmentStatus: EmploymentStatus.ACTIVE,
        joinedAt: dto.joinedAt,
        terminatedAt: null,
        divisions,
      });

      const saved = await repository.save(created);

      await manager.getRepository(EmployeeStatusHistory).save({
        employeeId: saved.id,
        previousStatus: EmploymentStatus.ACTIVE,
        newStatus: EmploymentStatus.ACTIVE,
        effectiveDate: saved.joinedAt,
        reason: 'Employee created',
      });

      return saved;
    });

    const role = actorRole === Role.MASTER_ADMIN ? (dto.role ?? Role.EMPLOYEE) : Role.EMPLOYEE;
    await this.authService.provisionIdentity({ employeeId: employee.id, email, role });

    this.events.emit('employee.created', { employeeId: employee.id });
    return this.getOrThrow(employee.id);
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.getOrThrow(id);
    const previousEmail = employee.email;

    if (dto.fullName !== undefined) employee.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) employee.phone = dto.phone;
    if (dto.joinedAt !== undefined) employee.joinedAt = dto.joinedAt;
    if (dto.email !== undefined) employee.email = dto.email.trim().toLowerCase();

    const saved = await this.employeeRepository.save(employee);

    if (dto.email !== undefined && saved.email !== previousEmail) {
      await this.authService.provisionIdentity({
        employeeId: saved.id,
        email: saved.email,
      });
    }

    this.events.emit('employee.updated', { employeeId: saved.id });
    return this.getOrThrow(saved.id);
  }

  async assignDivisions(id: string, dto: AssignDivisionsDto): Promise<Employee> {
    const employee = await this.getOrThrow(id);
    employee.divisions = await this.resolveDivisions(dto.divisionIds);
    const saved = await this.employeeRepository.save(employee);

    this.events.emit('employee.updated', { employeeId: saved.id });
    return this.getOrThrow(saved.id);
  }

  async changeStatus(
    id: string,
    dto: ChangeEmploymentStatusDto,
    targetStatus: EmploymentStatus.ACTIVE | EmploymentStatus.INACTIVE,
    actorEmail: string,
  ): Promise<Employee> {
    const employee = await this.getOrThrow(id);

    if (employee.employmentStatus === targetStatus) return employee;
    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new BadRequestException(
        'A terminated employee cannot be reactivated; create a new employee record instead',
      );
    }

    const previousStatus = employee.employmentStatus;
    employee.employmentStatus = targetStatus;
    employee.terminatedAt = null;
    const saved = await this.employeeRepository.save(employee);

    await this.recordHistory({
      employeeId: saved.id,
      previousStatus,
      newStatus: targetStatus,
      effectiveDate: dto.effectiveDate ?? this.today(),
      reason: dto.reason ?? `Status changed by ${actorEmail}`,
    });

    await this.authService.setStatus(
      saved.id,
      targetStatus === EmploymentStatus.ACTIVE
        ? IdentityStatus.ACTIVE
        : IdentityStatus.DISABLED,
    );

    this.events.emit('employee.updated', { employeeId: saved.id });
    return this.getOrThrow(saved.id);
  }

  async terminate(
    id: string,
    dto: TerminateEmployeeDto,
    actorEmail: string,
  ): Promise<Employee> {
    const employee = await this.getOrThrow(id);

    if (employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new ConflictException('This employee is already terminated');
    }

    const previousStatus = employee.employmentStatus;
    employee.employmentStatus = EmploymentStatus.TERMINATED;
    employee.terminatedAt = dto.terminatedAt ?? this.today();
    const saved = await this.employeeRepository.save(employee);

    await this.recordHistory({
      employeeId: saved.id,
      previousStatus,
      newStatus: EmploymentStatus.TERMINATED,
      effectiveDate: saved.terminatedAt ?? this.today(),
      reason: dto.reason ?? `Terminated by ${actorEmail}`,
    });

    // Attendance history is preserved; only the login identity is disabled.
    await this.authService.setStatus(saved.id, IdentityStatus.DISABLED);

    this.events.emit('employee.terminated', { employeeId: saved.id });
    return this.getOrThrow(saved.id);
  }

  async setRole(id: string, role: Role): Promise<Employee> {
    const employee = await this.getOrThrow(id);
    await this.authService.setRole(employee.id, role);
    this.events.emit('employee.updated', { employeeId: employee.id });
    return employee;
  }

  async list(query: EmployeeQueryDto): Promise<Paginated<Employee>> {
    const builder = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.divisions', 'division')
      .orderBy('employee.employee_number', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.search) {
      builder.andWhere(
        '(employee.full_name ILIKE :search OR employee.employee_number ILIKE :search OR employee.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.divisionId) {
      builder.andWhere('division.id = :divisionId', { divisionId: query.divisionId });
    }
    if (query.status) {
      builder.andWhere('employee.employment_status = :status', { status: query.status });
    }

    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async getById(id: string): Promise<Employee> {
    return this.getOrThrow(id);
  }

  async getByIds(ids: string[]): Promise<Employee[]> {
    if (!ids.length) return [];
    return this.employeeRepository.find({
      where: { id: In(ids) },
      relations: { divisions: true },
    });
  }

  async getActiveEmployeesWithDivisions(): Promise<Employee[]> {
    return this.employeeRepository.find({
      where: { employmentStatus: EmploymentStatus.ACTIVE },
      relations: { divisions: true },
      order: { employeeNumber: 'ASC' },
    });
  }

  async getByDivisionId(divisionId: string): Promise<Employee[]> {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.divisions', 'filtered', 'filtered.id = :divisionId', { divisionId })
      .leftJoinAndSelect('employee.divisions', 'division')
      .getMany();
  }

  async getAllWithDivisions(): Promise<Employee[]> {
    return this.employeeRepository.find({
      relations: { divisions: true },
      order: { employeeNumber: 'ASC' },
    });
  }

  async getStatusHistory(id: string): Promise<EmployeeStatusHistory[]> {
    await this.getOrThrow(id);
    return this.historyRepository.find({
      where: { employeeId: id },
      order: { effectiveDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async getOrThrow(id: string): Promise<Employee> {
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: { divisions: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  static divisionNames(employee: Pick<Employee, 'divisions'>): string[] {
    return (employee.divisions ?? []).map((division) => division.name);
  }

  private async resolveDivisions(ids: string[]): Promise<Division[]> {
    if (!ids.length) return [];
    const unique = [...new Set(ids)];
    const divisions = await this.divisionRepository.find({ where: { id: In(unique) } });

    if (divisions.length !== unique.length) {
      throw new BadRequestException('One or more divisions do not exist');
    }
    return divisions;
  }

  private async recordHistory(input: {
    employeeId: string;
    previousStatus: EmploymentStatus;
    newStatus: EmploymentStatus;
    effectiveDate: string;
    reason: string;
  }): Promise<void> {
    await this.historyRepository.save(this.historyRepository.create(input));
  }

  private async nextEmployeeNumber(manager: EntityManager): Promise<string> {
    const rows: Array<{ value: string | number }> = await manager.query(
      "SELECT nextval('employee_number_seq') AS value",
    );
    const value = Number(rows[0]?.value ?? 0);
    return `EMP${String(value).padStart(4, '0')}`;
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.employeeRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('An employee with that email address already exists');
    }
  }

  private today(): string {
    return localDate(new Date(), this.companyTimezone);
  }
}
