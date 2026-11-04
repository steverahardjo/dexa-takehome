import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { EmploymentStatus, Role } from '../../common/enums/roles.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import {
  AssignDivisionsDto,
  ChangeEmploymentStatusDto,
  CreateEmployeeDto,
  EmployeeQueryDto,
  SetEmployeeRoleDto,
  TerminateEmployeeDto,
  UpdateEmployeeDto,
} from '../dto/employee.dto.js';
import { EmployeeService } from '../services/employee.service.js';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.employeeService.create(dto, user.role);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  list(@Query() query: EmployeeQueryDto) {
    return this.employeeService.list(query);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.employeeService.getById(user.employeeId);
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === Role.EMPLOYEE && user.employeeId !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.employeeService.getById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.update(id, dto);
  }

  @Put(':id/divisions')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  assignDivisions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignDivisionsDto,
  ) {
    return this.employeeService.assignDivisions(id, dto);
  }

  @Post(':id/activate')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeEmploymentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeeService.changeStatus(
      id,
      dto,
      EmploymentStatus.ACTIVE,
      user.email,
    );
  }

  @Post(':id/deactivate')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeEmploymentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeeService.changeStatus(
      id,
      dto,
      EmploymentStatus.INACTIVE,
      user.email,
    );
  }

  @Post(':id/terminate')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  terminate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TerminateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeeService.terminate(id, dto, user.email);
  }

  @Patch(':id/role')
  @Roles(Role.MASTER_ADMIN)
  setRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetEmployeeRoleDto,
  ) {
    return this.employeeService.setRole(id, dto.role);
  }

  @Get(':id/history')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  history(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.employeeService.getStatusHistory(id);
  }
}
