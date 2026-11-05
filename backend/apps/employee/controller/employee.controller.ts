import { Controller, UsePipes } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  EMPLOYEE_PATTERNS,
  type ActiveEmployee,
  type DeletedEmployee,
  type EmployeeListResult,
  type EmployeeView,
} from '../../../shared/contracts/employee.contracts.js';
import { rpcValidationPipe } from '../../../shared/rpc/rpc-validation.pipe.js';
import {
  RequestAvatarUploadDto,
  type AvatarUploadUrl,
} from '../dto/avatar.dto.js';
import { IdDto } from '../dto/id.dto.js';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeePayloadDto,
} from '../dto/employee.dto.js';
import { EmployeeService } from '../services/employee.service.js';

/**
 * Internal TCP API of the employee service. The gateway is the only caller that
 * exposes it over HTTP; the transport itself has no authentication.
 */
@Controller()
@UsePipes(rpcValidationPipe)
export class EmployeeController {
  constructor(private readonly employees: EmployeeService) {}

  @MessagePattern(EMPLOYEE_PATTERNS.create)
  create(@Payload() dto: CreateEmployeeDto): Promise<EmployeeView> {
    return this.employees.create(dto);
  }

  @MessagePattern(EMPLOYEE_PATTERNS.update)
  update(@Payload() payload: UpdateEmployeePayloadDto): Promise<EmployeeView> {
    const { id, ...dto } = payload;

    return this.employees.update(id, dto);
  }

  @MessagePattern(EMPLOYEE_PATTERNS.delete)
  async remove(@Payload() dto: IdDto): Promise<DeletedEmployee> {
    return this.employees.remove(dto.id);
  }

  @MessagePattern(EMPLOYEE_PATTERNS.get)
  get(@Payload() dto: IdDto): Promise<EmployeeView> {
    return this.employees.findOne(dto.id);
  }

  @MessagePattern(EMPLOYEE_PATTERNS.list)
  list(@Payload() query: EmployeeQueryDto): Promise<EmployeeListResult> {
    return this.employees.list(query);
  }

  @MessagePattern(EMPLOYEE_PATTERNS.listActive)
  listActive(): Promise<ActiveEmployee[]> {
    return this.employees.listActive();
  }

  /** Reserves a key + presigned PUT URL; the browser uploads straight to MinIO. */
  @MessagePattern(EMPLOYEE_PATTERNS.avatarUploadUrl)
  avatarUploadUrl(
    @Payload() dto: RequestAvatarUploadDto,
  ): Promise<AvatarUploadUrl> {
    return this.employees.requestAvatarUpload(dto);
  }
}
