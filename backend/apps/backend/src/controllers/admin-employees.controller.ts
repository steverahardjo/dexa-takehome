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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import type { JwtPayload } from '../../../auth/services/jwt.service.js';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
} from '../../../employee/dto/employee.dto.js';
import { ATTENDANCE_PATTERNS } from '../../../../shared/contracts/attendance.contracts.js';
import type { LateDatesResult } from '../../../../shared/contracts/attendance.contracts.js';
import {
  EMPLOYEE_PATTERNS,
  type DeletedEmployee,
  type EmployeeListResult,
  type EmployeeView,
} from '../../../../shared/contracts/employee.contracts.js';
import type { UploadUrlResult } from '../../../../shared/contracts/storage.contracts.js';
import { Role } from '../../../../shared/enums/roles.enum.js';
import { sendRpc } from '../../../../shared/rpc/rpc-call.js';
import { withoutRoleAssignment } from '../auth/claims.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ATTENDANCE_CLIENT, EMPLOYEE_CLIENT } from '../clients/tokens.js';
import { OPENAPI_SECURITY } from '../docs/openapi.js';
import {
  EmployeeListModel,
  EmployeeViewModel,
  LateDatesModel,
  UploadUrlModel,
} from '../docs/models.js';
import { EmployeeQueryDto } from '../dto/employee-query.dto.js';
import { AvatarUploadDto } from '../dto/employee.dto.js';
import { YearQueryDto } from '../dto/attendance.dto.js';

const ADMINS = [Role.ADMIN, Role.MASTER_ADMIN];

const ID_PARAM = {
  name: 'id',
  format: 'uuid',
  description: 'Employee id',
} as const;

/**
 * HR surface: the employee directory and per-employee attendance.
 *
 * `admin/employees` keeps the paths the dashboard already calls. Request bodies
 * are forwarded untouched — the employee service owns what a valid employee is
 * and rejects anything else with a 400.
 */
@ApiTags('Admin: employees')
@ApiBearerAuth(OPENAPI_SECURITY)
@ApiUnauthorizedResponse({ description: 'Missing, expired or malformed token' })
@ApiForbiddenResponse({ description: 'The caller is not an admin' })
@ApiBadRequestResponse({ description: 'Body or query did not validate' })
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
  @ApiOperation({
    summary: 'Reserve an avatar upload URL',
    description:
      'Returns a key and a presigned PUT URL. Upload the image straight to storage, then send the key as `avatarKey` when creating or updating the employee.',
  })
  @ApiCreatedResponse({
    type: UploadUrlModel,
    description: 'Where to PUT the image, and the key to store',
  })
  avatarUploadUrl(@Body() dto: AvatarUploadDto): Promise<UploadUrlResult> {
    return sendRpc<UploadUrlResult>(
      this.employees,
      EMPLOYEE_PATTERNS.avatarUploadUrl,
      dto,
      'Could not reserve an avatar upload',
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List employees',
    description:
      'Paginated, newest first. `avatarUrl` is a presigned URL that expires, so it should not be cached.',
  })
  @ApiOkResponse({
    type: EmployeeListModel,
    description: 'One page of employees',
  })
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
  @ApiOperation({
    summary: 'Create an employee',
    description:
      'Creates the employee and, in the same request, its login identity with the given email. A failed identity write rolls the employee back, so the two are never out of sync. A `role` is only honoured for a master admin: for anyone else the field is dropped, not rejected.',
  })
  @ApiBody({ type: CreateEmployeeDto })
  @ApiCreatedResponse({
    type: EmployeeViewModel,
    description: 'The employee, and its login identity',
  })
  @ApiForbiddenResponse({ description: 'The caller is not an admin' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, unknown>,
  ): Promise<EmployeeView> {
    return sendRpc<EmployeeView>(
      this.employees,
      EMPLOYEE_PATTERNS.create,
      withoutRoleAssignment(user, body),
      'Could not create the employee',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one employee' })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: EmployeeViewModel, description: 'The employee' })
  @ApiNotFoundResponse({ description: 'No employee with that id' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeView> {
    return sendRpc<EmployeeView>(
      this.employees,
      EMPLOYEE_PATTERNS.get,
      { id },
      'Could not load the employee',
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an employee',
    description:
      'Every field is optional; only what is sent changes. An email change is propagated to the login identity. `divisionIds` replaces the whole set.',
  })
  @ApiParam(ID_PARAM)
  @ApiBody({ type: UpdateEmployeeDto })
  @ApiOkResponse({ type: EmployeeViewModel, description: 'The employee' })
  @ApiNotFoundResponse({ description: 'No employee with that id' })
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
  @ApiOperation({
    summary: 'Delete an employee',
    description:
      'Master admin only. Removes the login identity first, so a retry after a failure is safe.',
  })
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({ description: 'The caller is not a master admin' })
  @ApiNotFoundResponse({ description: 'No employee with that id' })
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
  @ApiOperation({
    summary: 'Late days of one employee in a year',
    description: 'Dates only: the calendar marks them red, it needs no rows.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({
    type: LateDatesModel,
    description: 'Late dates of the year',
  })
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
