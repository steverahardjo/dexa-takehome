import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import type { JwtPayload } from '../../../auth/services/jwt.service.js';
import {
  ATTENDANCE_PATTERNS,
  type AttendanceSummary,
  type AttendanceView,
  type MarkAbsentResult,
  type ProofUpload,
  type TodayReport,
} from '../../../../shared/contracts/attendance.contracts.js';
import type { MeView } from '../../../../shared/contracts/gateway.contracts.js';
import { Role } from '../../../../shared/enums/roles.enum.js';
import { sendRpc } from '../../../../shared/rpc/rpc-call.js';
import { assertSelfOrAdmin, requireEmployeeId } from '../auth/claims.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ATTENDANCE_CLIENT } from '../clients/tokens.js';
import {
  CheckInDto,
  DayQueryDto,
  EmployeeYearQueryDto,
  ProofUrlDto,
} from '../dto/attendance.dto.js';
import { MeService } from '../services/me.service.js';

/**
 * Attendance API.
 *
 * Check-in and the proof upload URL take the employee from the token, never
 * from the body: one person cannot record another person's day. Reading a day
 * that is not yours, and the company-wide report, need an admin role.
 */
@Controller('attendance')
@UseGuards(AuthGuard, RolesGuard)
export class AttendanceController {
  constructor(
    @Inject(ATTENDANCE_CLIENT) private readonly attendance: ClientProxy,
    private readonly me: MeService,
  ) {}

  /** Reserves the proof key and the presigned URL the phone uploads to. */
  @Post('proof-url')
  @HttpCode(HttpStatus.CREATED)
  proofUrl(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ProofUrlDto,
  ): Promise<ProofUpload> {
    // Fail before reserving anything when the account has no employee.
    requireEmployeeId(user);

    return sendRpc<ProofUpload>(
      this.attendance,
      ATTENDANCE_PATTERNS.proofUrl,
      dto,
      'Could not reserve a proof upload',
    );
  }

  /** Records today's check-in and returns the refreshed employee view. */
  @Post('check-in')
  @HttpCode(HttpStatus.CREATED)
  async checkIn(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CheckInDto,
  ): Promise<MeView> {
    const employeeId = requireEmployeeId(user);

    await sendRpc<AttendanceView>(
      this.attendance,
      ATTENDANCE_PATTERNS.checkIn,
      { proofKey: dto.proofKey, location: dto.location, employeeId },
      'Could not save the check-in',
    );

    return this.me.view(employeeId);
  }

  /** On-time / late / absent breakdown for a day. Admin-only. */
  @Get('today')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  today(@Query() query: DayQueryDto): Promise<TodayReport> {
    return sendRpc<TodayReport>(
      this.attendance,
      ATTENDANCE_PATTERNS.today,
      query,
      'Could not load the attendance report',
    );
  }

  /** Yearly counters of one employee: yourself, or anyone as an admin. */
  @Get('summary')
  summary(
    @CurrentUser() user: JwtPayload,
    @Query() query: EmployeeYearQueryDto,
  ): Promise<AttendanceSummary> {
    assertSelfOrAdmin(user, query.employeeId);

    return sendRpc<AttendanceSummary>(
      this.attendance,
      ATTENDANCE_PATTERNS.summary,
      { employeeId: query.employeeId, year: query.year },
      'Could not load the attendance summary',
    );
  }

  /** Manual backfill of the absent sweep. Master admin only. */
  @Post('mark-absent')
  @Roles(Role.MASTER_ADMIN)
  @HttpCode(HttpStatus.OK)
  markAbsent(@Query() query: DayQueryDto): Promise<MarkAbsentResult> {
    return sendRpc<MarkAbsentResult>(
      this.attendance,
      ATTENDANCE_PATTERNS.markAbsent,
      query,
      'Could not run the absent sweep',
    );
  }
}
