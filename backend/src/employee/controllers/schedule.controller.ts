import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/roles.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { localDate } from '../../common/time/time.util.js';
import {
  CreateScheduleDto,
  ResolveScheduleQueryDto,
  ScheduleQueryDto,
  UpdateScheduleDto,
} from '../dto/schedule.dto.js';
import { ScheduleService } from '../services/schedule.service.js';

@Controller('schedules')
export class ScheduleController {
  private readonly companyTimezone: string;

  constructor(
    private readonly scheduleService: ScheduleService,
    config: ConfigService,
  ) {
    this.companyTimezone = config.get<string>('company.timezone', 'Asia/Jakarta');
  }

  @Get('me')
  async mySchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ResolveScheduleQueryDto,
  ) {
    const date = query.date ?? localDate(new Date(), this.companyTimezone);
    const schedule = await this.scheduleService.resolveForEmployee(user.employeeId, date);
    return { date, schedule };
  }

  @Get()
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  list(@Query() query: ScheduleQueryDto) {
    return this.scheduleService.list(query);
  }

  @Get('resolve')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  resolve(@Query() query: ResolveScheduleQueryDto) {
    if (!query.employeeId) {
      throw new BadRequestException('employeeId is required');
    }
    const date = query.date ?? localDate(new Date(), this.companyTimezone);
    return this.scheduleService
      .resolveForEmployee(query.employeeId, date)
      .then((schedule) => ({ date, schedule }));
  }

  @Post()
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  create(@Body() dto: CreateScheduleDto) {
    return this.scheduleService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.scheduleService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.scheduleService.remove(id);
  }
}
