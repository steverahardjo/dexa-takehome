import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/roles.enum.js';
import {
  HistoryQueryDto,
  ReconcileDto,
  TodayDashboardQueryDto,
  YearQueryDto,
} from '../dto/reporting.dto.js';
import { ReportingService } from '../services/reporting.service.js';

@Controller('reports')
@Roles(Role.ADMIN, Role.MASTER_ADMIN)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('attendance/today')
  today(@Query() query: TodayDashboardQueryDto) {
    return this.reportingService.today(query);
  }

  @Get('employees/:id/yearly')
  yearly(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: YearQueryDto,
  ) {
    return this.reportingService.yearly(id, query.year);
  }

  @Get('employees/:id/monthly')
  monthly(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: YearQueryDto,
  ) {
    return this.reportingService.monthly(id, query.year);
  }

  @Get('employees/:id/history')
  history(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.reportingService.history(id, query);
  }

  @Post('reconcile')
  @Roles(Role.MASTER_ADMIN)
  reconcile(@Body() dto: ReconcileDto) {
    return this.reportingService.reconcile(dto.year);
  }
}
