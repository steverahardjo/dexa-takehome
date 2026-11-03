import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { TokenUser } from '../../auth/guards/jwt-auth.guard.js';
import {
  CheckInDto,
  CreateCaptureSessionDto,
  SubmitCaptureDto,
} from '../dto/attendance.dto.js';
import { Employee } from '../entities/employee.entity.js';
import {
  EmployeePresenter,
  type EmployeeView,
} from '../presenter/employee.presenter.js';
import { AttendanceService } from '../services/attendance.service.js';
import {
  CaptureService,
  type CaptureSessionView,
} from '../services/capture.service.js';

/**
 * The QR hand-off. Creating, confirming and direct clock-ins need a token;
 * the phone's two calls only need the unguessable session id.
 */
@Controller('attendance')
export class AttendanceController {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly captures: CaptureService,
    private readonly attendance: AttendanceService,
    private readonly presenter: EmployeePresenter,
  ) {}

  /** The desktop asks for a QR session for the signed-in employee. */
  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Body() dto: CreateCaptureSessionDto,
    @CurrentUser() user: TokenUser,
  ): Promise<CaptureSessionView> {
    this.assertOwnEmployee(dto.employeeId, user);

    return this.captures.create(dto.employeeId);
  }

  /** The desktop polls this while the QR is on screen; the phone reads it too. */
  @Get('sessions/:id')
  status(@Param('id', ParseUUIDPipe) id: string): Promise<CaptureSessionView> {
    return this.captures.status(id);
  }

  /** The phone submits the photo, its timestamp and, when allowed, its position. */
  @Post('sessions/:id')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitCaptureDto,
  ): Promise<CaptureSessionView> {
    return this.captures.submit(id, dto);
  }

  /** The desktop releases the session once it is done with it. */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.captures.remove(id);
  }

  /** The desktop confirms the photo; this is what writes the check-in. */
  @Post('sessions/:id/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: TokenUser,
  ): Promise<EmployeeView> {
    return this.captures.confirm(id, user);
  }

  /** The dashboard's direct clock-in button, without a photo. */
  @Post('check-in')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async checkIn(
    @Body() dto: CheckInDto,
    @CurrentUser() user: TokenUser,
  ): Promise<EmployeeView> {
    this.assertOwnEmployee(dto.employeeId, user);

    const employee = await this.employees.findOne({
      where: { id: dto.employeeId },
    });

    if (!employee) {
      throw new NotFoundException(`No employee with id ${dto.employeeId}`);
    }

    await this.attendance.record(employee, {
      evidence: dto.evidence ?? null,
      position: dto.position ?? null,
      capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
      source: 'manual',
    });

    return this.presenter.one(employee);
  }

  /** An employee may only act for themselves; HR Admin may act for anyone. */
  private assertOwnEmployee(employeeId: string, user: TokenUser): void {
    if (user.role !== 'HR Admin' && user.id !== employeeId) {
      throw new ForbiddenException('This action is for another employee');
    }
  }
}
