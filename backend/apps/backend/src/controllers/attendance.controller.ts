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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

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
import { OPENAPI_SECURITY } from '../docs/openapi.js';
import {
  AttendanceSummaryModel,
  MarkAbsentResultModel,
  MeViewModel,
  ProofUploadModel,
  TodayReportModel,
} from '../docs/models.js';
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
@ApiTags('Attendance')
@ApiBearerAuth(OPENAPI_SECURITY)
@ApiUnauthorizedResponse({ description: 'Missing, expired or malformed token' })
@ApiForbiddenResponse({
  description:
    'The token has no linked employee (`employeeId` is null), or the caller lacks the role',
})
@ApiBadRequestResponse({ description: 'Body or query did not validate' })
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
  @ApiOperation({
    summary: 'Reserve a check-in proof upload URL',
    description:
      'Step 1 of the check-in: reserve a key, PUT the photo to `uploadUrl`, then send `key` as `proofKey` to `POST /attendance/check-in`. Refused on weekends and national holidays, before anything is reserved.',
  })
  @ApiCreatedResponse({
    type: ProofUploadModel,
    description: 'Presigned upload URL and the key to send back',
  })
  @ApiResponse({
    status: 403,
    description: 'The day is a weekend or a national holiday',
  })
  @ApiResponse({
    status: 503,
    description: 'The holiday calendar is unavailable, so the day is unknown',
  })
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
  @ApiOperation({
    summary: 'Check in for today',
    description:
      "Step 2: `proofKey` must reference an object that was actually uploaded. The time is the server's, in the company timezone; the employee is taken from the token, so a body `employeeId` is rejected as an unknown field.",
  })
  @ApiCreatedResponse({
    type: MeViewModel,
    description: 'The employee and the recorded day',
  })
  @ApiConflictResponse({
    description: 'The caller already checked in today',
  })
  @ApiResponse({
    status: 403,
    description: 'Weekend or holiday, or the token has no linked employee',
  })
  @ApiResponse({
    status: 503,
    description: 'Storage or the holiday calendar is unavailable',
  })
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
  @ApiOperation({
    summary: 'Attendance report for a day',
    description:
      '`NOT_CHECKED_IN` counts people who were expected but have no row yet; the 15:00 sweep turns them into `ABSENT`.',
  })
  @ApiOkResponse({
    type: TodayReportModel,
    description: 'Breakdown for the day',
  })
  @ApiForbiddenResponse({ description: 'The caller is not an admin' })
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
  @ApiOperation({
    summary: 'Yearly counters of one employee',
    description:
      'An employee may only ask for their own `employeeId`; anything else is a 403.',
  })
  @ApiOkResponse({
    type: AttendanceSummaryModel,
    description: 'Yearly counters',
  })
  @ApiForbiddenResponse({
    description: "An employee asked for someone else's summary",
  })
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
  @ApiOperation({
    summary: 'Run the absent sweep now',
    description:
      'The same work the cron does at 15:00 company time. Idempotent: running it twice inserts nothing the second time. Skipped on weekends, holidays and when the calendar is unknown.',
  })
  @ApiOkResponse({
    type: MarkAbsentResultModel,
    description: 'How many rows the sweep inserted',
  })
  @ApiForbiddenResponse({ description: 'The caller is not a master admin' })
  markAbsent(@Query() query: DayQueryDto): Promise<MarkAbsentResult> {
    return sendRpc<MarkAbsentResult>(
      this.attendance,
      ATTENDANCE_PATTERNS.markAbsent,
      query,
      'Could not run the absent sweep',
    );
  }
}
