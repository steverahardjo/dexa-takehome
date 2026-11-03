import {
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { TokenUser } from '../../auth/guards/jwt-auth.guard.js';
import { AttendanceQueryDto } from '../dto/attendance.dto.js';
import { Attendance } from '../entities/attendance.entity.js';
import { Employee } from '../entities/employee.entity.js';
import { EmployeePresenter, type EmployeeView } from '../presenter/employee.presenter.js';
import { AttendanceService } from '../services/attendance.service.js';

/** The signed-in employee's own data. */
@Controller('employee')
export class EmployeeController {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly attendance: AttendanceService,
    private readonly presenter: EmployeePresenter,
  ) {}

  /** Who the token belongs to, as the employee page renders them. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: TokenUser): Promise<EmployeeView> {
    return this.presenter.one(await this.signedIn(user.id));
  }

  /** The signed-in employee's check-ins, newest first. */
  @Get('me/attendance')
  @UseGuards(JwtAuthGuard)
  history(
    @CurrentUser() user: TokenUser,
    @Query() query: AttendanceQueryDto,
  ): Promise<Attendance[]> {
    return this.attendance.history(user.id, query.date);
  }

  private async signedIn(id: string): Promise<Employee> {
    const employee = await this.employees.findOne({ where: { id } });

    if (!employee) {
      throw new NotFoundException('No employee for this account');
    }

    return employee;
  }
}
