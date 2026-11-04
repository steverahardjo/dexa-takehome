import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveStatus } from '../../common/enums/roles.enum.js';
import {
  paginate,
  type Paginated,
} from '../../common/interfaces/pagination.interface.js';
import type {
  CreateLeaveDto,
  LeaveQueryDto,
  UpdateLeaveStatusDto,
} from '../dto/leave.dto.js';
import { Employee } from '../entities/employee.entity.js';
import { LeaveRequest } from '../entities/leave-request.entity.js';

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    employeeId: string,
    dto: CreateLeaveDto,
    actorEmail: string,
  ): Promise<LeaveRequest> {
    const employeeExists = await this.employeeRepository.exists({ where: { id: employeeId } });
    if (!employeeExists) throw new NotFoundException('Employee not found');
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate must not be before startDate');
    }

    const leave = await this.leaveRepository.save(
      this.leaveRepository.create({
        employeeId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: dto.status ?? LeaveStatus.APPROVED,
        reason: dto.reason ?? null,
        decidedBy: dto.status && dto.status !== LeaveStatus.PENDING ? actorEmail : null,
      }),
    );

    this.emitChanged(leave);
    return leave;
  }

  async updateStatus(
    id: string,
    dto: UpdateLeaveStatusDto,
    actorEmail: string,
  ): Promise<LeaveRequest> {
    const leave = await this.getOrThrow(id);
    leave.status = dto.status;
    leave.decidedBy = actorEmail;
    if (dto.reason !== undefined) leave.reason = dto.reason;

    const saved = await this.leaveRepository.save(leave);
    this.emitChanged(saved);
    return saved;
  }

  async list(query: LeaveQueryDto): Promise<Paginated<LeaveRequest>> {
    const builder = this.leaveRepository
      .createQueryBuilder('leave')
      .orderBy('leave.start_date', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.employeeId) {
      builder.andWhere('leave.employee_id = :employeeId', { employeeId: query.employeeId });
    }
    if (query.status) {
      builder.andWhere('leave.status = :status', { status: query.status });
    }

    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async getForRange(
    employeeIds: string[] | null,
    from: string,
    to: string,
  ): Promise<LeaveRequest[]> {
    const builder = this.leaveRepository
      .createQueryBuilder('leave')
      .where('leave.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere('leave.start_date <= :to', { to })
      .andWhere('leave.end_date >= :from', { from });

    if (employeeIds) {
      if (!employeeIds.length) return [];
      builder.andWhere('leave.employee_id IN (:...employeeIds)', { employeeIds });
    }

    return builder.getMany();
  }

  async getForEmployeeYear(employeeId: string, year: number): Promise<LeaveRequest[]> {
    return this.getForRange([employeeId], `${year}-01-01`, `${year}-12-31`);
  }

  async getOrThrow(id: string): Promise<LeaveRequest> {
    const leave = await this.leaveRepository.findOne({ where: { id } });
    if (!leave) throw new NotFoundException('Leave request not found');
    return leave;
  }

  private emitChanged(leave: LeaveRequest): void {
    this.events.emit('leave.updated', {
      employeeId: leave.employeeId,
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
    });
  }
}
