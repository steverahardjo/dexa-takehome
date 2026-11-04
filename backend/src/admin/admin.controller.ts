import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import {
  CreateEmployeeDto,
  ListEmployeesDto,
  UpdateEmployeeDto,
} from '../employee/dto/employee.dto.js';
import {
  AttendanceQueryDto,
  LateDaysQueryDto,
} from '../employee/dto/attendance.dto.js';
import type { EmployeeView } from '../employee/presenter/employee.presenter.js';
import {
  AdminService,
  type AttendanceStats,
  type AttendanceView,
  type EmployeePage,
  type LateDay,
} from './admin.service.js';

/**
 * HRD's view: employee master data and the read-only attendance summary.
 * Attendance has no mutation endpoint here.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('HR Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('employees')
  list(@Query() query: ListEmployeesDto): Promise<EmployeePage> {
    return this.admin.list(query);
  }

  @Get('employees/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeView> {
    return this.admin.findOne(id);
  }

  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeView> {
    return this.admin.create(dto);
  }

  @Patch('employees/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeView> {
    return this.admin.update(id, dto);
  }

  @Delete('employees/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.remove(id);
  }

  /** One employee's late days of a year, as a plain list. */
  @Get('employees/:id/late-days')
  employeeLateDays(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LateDaysQueryDto,
  ): Promise<LateDay[]> {
    return this.admin.lateDays(query.year, id);
  }

  /** The late days of a year, for the calendar overlay. */
  @Get('attendance/late-days')
  lateDays(@Query() query: LateDaysQueryDto): Promise<LateDay[]> {
    return this.admin.lateDays(query.year);
  }

  @Get('attendance')
  attendance(@Query() query: AttendanceQueryDto): Promise<AttendanceView[]> {
    return this.admin.attendanceFor(query.date);
  }

  @Get('attendance/today')
  today(): Promise<AttendanceStats> {
    return this.admin.todayStats();
  }
}
