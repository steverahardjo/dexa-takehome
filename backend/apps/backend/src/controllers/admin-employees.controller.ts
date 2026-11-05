import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import { ATTENDANCE_PATTERNS } from '../../../../shared/contracts/attendance.contracts.js';
import type { LateDatesResult } from '../../../../shared/contracts/attendance.contracts.js';
import {
  EMPLOYEE_PATTERNS,
  type DeletedEmployee,
  type EmployeeListResult,
  type EmployeeView,
} from '../../../../shared/contracts/employee.contracts.js';
import { Role } from '../../../../shared/enums/roles.enum.js';
import { sendRpc } from '../../../../shared/rpc/rpc-call.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ATTENDANCE_CLIENT, EMPLOYEE_CLIENT } from '../clients/tokens.js';
import { EmployeeQueryDto } from '../dto/employee-query.dto.js';
import { AvatarUploadDto } from '../dto/employee.dto.js';
import { YearQueryDto } from '../dto/attendance.dto.js';

const ADMINS = [Role.ADMIN, Role.MASTER_ADMIN];

/**
 * HR surface: the employee directory and per-employee attendance.
 *
 * `admin/employees` keeps the paths the dashboard already calls. Request bodies
 * are forwarded untouched — the employee service owns what a valid employee is
 * and rejects anything else with a 400.
 */
@Controller('admin/employees')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ADMINS)
export class AdminEmployeesController {
  constructor(
    @Inject(EMPLOYEE_CLIENT) private readonly employees: ClientProxy,
    @Inject(ATTENDANCE_CLIENT) private readonly attendance: ClientProxy,
  ) {}

  /** Reserves a key + presigned PUT URL; the browser uploads to MinIO directly. */
  @Post('avatar/upload-url')
  @HttpCode(HttpStatus.CREATED)
  avatarUploadUrl(@Body() dto: AvatarUploadDto): Promise<unknown> {
    return sendRpc(
      this.employees,
      EMPLOYEE_PATTERNS.avatarUploadUrl,
      dto,
      'Could not reserve an avatar upload',
    );
  }

  @Get()
  list(@Query() query: EmployeeQueryDto): Promise<EmployeeListResult> {
    return sendRpc<EmployeeListResult>(
      this.employees,
      EMPLOYEE_PATTERNS.list,
      query,
      'Could not list employees',
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: Record<string, unknown>): Promise<EmployeeView> {
    return sendRpc<EmployeeView>(
      this.employees,
      EMPLOYEE_PATTERNS.create,
      body,
      'Could not create the employee',
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeView> {
    return sendRpc<EmployeeView>(
      this.employees,
      EMPLOYEE_PATTERNS.get,
      { id },
      'Could not load the employee',
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<EmployeeView> {
    return sendRpc<EmployeeView>(
      this.employees,
      EMPLOYEE_PATTERNS.update,
      { ...body, id },
      'Could not update the employee',
    );
  }

  @Delete(':id')
  @Roles(Role.MASTER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await sendRpc<DeletedEmployee>(
      this.employees,
      EMPLOYEE_PATTERNS.delete,
      { id },
      'Could not delete the employee',
    );
  }

  /** Late days of one employee in a year, for the calendar dialog. */
  @Get(':id/late-days')
  lateDays(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: YearQueryDto,
  ): Promise<LateDatesResult> {
    return sendRpc<LateDatesResult>(
      this.attendance,
      ATTENDANCE_PATTERNS.lateDates,
      { employeeId: id, year: query.year },
      'Could not load the late days',
    );
  }
}
