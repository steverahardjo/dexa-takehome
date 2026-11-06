import { Controller, UsePipes } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  ATTENDANCE_PATTERNS,
  type AttendanceSummary,
  type AttendanceView,
  type DeletedAttendance,
  type LateDatesResult,
  type MarkAbsentResult,
  type ProofUpload,
  type TodayReport,
} from '../../../shared/contracts/attendance.contracts.js';
import { rpcValidationPipe } from '../../../shared/rpc/rpc-validation.pipe.js';
import {
  CheckInDto,
  DayQueryDto,
  EmployeeIdDto,
  MarkAbsentDto,
  TodayQueryDto,
  YearQueryDto,
} from '../dto/attendance.dto.js';
import { RequestProofUploadDto } from '../dto/proof.dto.js';
import { AttendanceService } from '../service/attendance.service.js';

/**
 * Internal TCP API of the attendance service. Authorization (who may read
 * someone else's attendance) belongs to the HTTP gateway; this transport is
 * only reachable on the private network.
 */
@Controller()
@UsePipes(rpcValidationPipe)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @MessagePattern(ATTENDANCE_PATTERNS.proofUrl)
  proofUrl(@Payload() dto: RequestProofUploadDto): Promise<ProofUpload> {
    return this.attendance.requestProofUpload(dto);
  }

  @MessagePattern(ATTENDANCE_PATTERNS.checkIn)
  checkIn(@Payload() dto: CheckInDto): Promise<AttendanceView> {
    const { employeeId, ...rest } = dto;

    return this.attendance.checkIn(employeeId, rest);
  }

  @MessagePattern(ATTENDANCE_PATTERNS.today)
  today(@Payload() dto: TodayQueryDto): Promise<TodayReport> {
    return this.attendance.today(dto);
  }

  @MessagePattern(ATTENDANCE_PATTERNS.dayOf)
  day(@Payload() dto: DayQueryDto): Promise<AttendanceView | null> {
    return this.attendance.dayOf(dto);
  }

  @MessagePattern(ATTENDANCE_PATTERNS.lateDates)
  lateDates(@Payload() dto: YearQueryDto): Promise<LateDatesResult> {
    return this.attendance.lateDates(dto);
  }

  @MessagePattern(ATTENDANCE_PATTERNS.summary)
  summary(@Payload() dto: YearQueryDto): Promise<AttendanceSummary> {
    return this.attendance.summary(dto);
  }

  /** Manual run of the sweep (the cron calls the service directly). */
  @MessagePattern(ATTENDANCE_PATTERNS.markAbsent)
  markAbsent(@Payload() dto: MarkAbsentDto): Promise<MarkAbsentResult> {
    return this.attendance.markAbsent(dto);
  }

  /** Purges one employee's history; used by the employee service's delete. */
  @MessagePattern(ATTENDANCE_PATTERNS.deleteByEmployee)
  deleteByEmployee(@Payload() dto: EmployeeIdDto): Promise<DeletedAttendance> {
    return this.attendance.deleteByEmployee(dto.employeeId);
  }
}
