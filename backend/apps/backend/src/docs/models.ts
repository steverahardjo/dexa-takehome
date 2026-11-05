import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ACCESS_TOKEN_TYPE } from '../../../auth/services/jwt.service.js';
import type {
  AccessTokenResponse,
  JwtPayload,
} from '../../../auth/services/jwt.service.js';
import type { OtpRequestResult } from '../../../../shared/contracts/auth.contracts.js';
import type {
  AttendanceSummary,
  AttendanceView,
  LateDatesResult,
  MarkAbsentResult,
  ProofUpload,
  TodayItem,
  TodayReport,
} from '../../../../shared/contracts/attendance.contracts.js';
import type {
  DivisionView,
  EmployeeListResult,
  EmployeeView,
} from '../../../../shared/contracts/employee.contracts.js';
import type { MeView } from '../../../../shared/contracts/gateway.contracts.js';
import type { UploadUrlResult } from '../../../../shared/contracts/storage.contracts.js';
import {
  AttendanceStatus,
  EmploymentStatus,
  IdentityStatus,
  Role,
} from '../../../../shared/enums/roles.enum.js';

/**
 * Response models for the OpenAPI document.
 *
 * The services answer with plain objects typed by `shared/contracts`, which
 * carry no runtime metadata, so Swagger cannot see them. These classes exist
 * only to describe those shapes: each one `implements` its contract, so a
 * contract change fails the build here instead of silently documenting a lie.
 *
 * They are never used as a decorated parameter type — request validation stays
 * with the service that owns the data.
 */

export class OtpRequestResultModel implements OtpRequestResult {
  @ApiProperty({
    example: 'If the address is registered, a code has been sent',
    description:
      'Identical for a known and an unknown address: the endpoint never reveals whether an account exists.',
  })
  message: string;
}

export class AccessTokenResponseModel implements AccessTokenResponse {
  @ApiProperty({
    description: 'Signed JWT. Send it as `Authorization: Bearer <token>`.',
  })
  accessToken: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 900, description: 'Lifetime in seconds.' })
  expiresIn: number;
}

export class JwtClaimsModel implements JwtPayload {
  @ApiProperty({
    format: 'uuid',
    description: 'Identity id (`identities.id`), not the employee id.',
  })
  sub: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Employee the identity is linked to. `null` until HR links an account, and such a token cannot check in.',
  })
  employeeId: string | null;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({
    enum: [ACCESS_TOKEN_TYPE],
    description: 'Guards against replaying another kind of token.',
  })
  type: typeof ACCESS_TOKEN_TYPE;

  @ApiPropertyOptional({ description: 'Issued at, added by the signer.' })
  iat?: number;

  @ApiPropertyOptional({ description: 'Expiry, added by the signer.' })
  exp?: number;
}

export class UploadUrlModel implements UploadUrlResult {
  @ApiProperty({
    example: 'avatars/2026/02/6f1d4c2e-1f8f-4c4e-9a0e-2f5f7a9c1b3d.jpg',
    description: 'Object key. Send it back when you create or update.',
  })
  key: string;

  @ApiProperty({
    format: 'uri',
    description: 'Presigned PUT URL. Send the file bytes here, then confirm.',
  })
  uploadUrl: string;

  @ApiProperty({ example: 600 })
  expiresInSeconds: number;
}

export class EmployeeViewModel implements EmployeeView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'EMP-78D3E9BA' })
  employeeNumber: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName: string;

  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: '+62 812 3456 7890' })
  phone: string | null;

  @ApiProperty({ enum: EmploymentStatus })
  employmentStatus: EmploymentStatus;

  @ApiProperty({ format: 'date', example: '2026-02-01' })
  joinedAt: string;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: null })
  terminatedAt: string | null;

  @ApiProperty({
    type: [String],
    example: ['3f1b0d1c-9c9f-4c39-9f5b-0d6d3c1e2a11'],
  })
  divisionIds: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Storage key of the avatar, not a URL.',
  })
  avatarKey: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description: 'Temporary presigned URL: re-read the employee to refresh it.',
  })
  avatarUrl: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class DivisionModel implements DivisionView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Engineering' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  description: string | null;
}

export class EmployeeListModel implements EmployeeListResult {
  @ApiProperty({ type: () => EmployeeViewModel, isArray: true })
  items: EmployeeViewModel[];

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

export class AttendanceViewModel implements AttendanceView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ format: 'date', example: '2026-02-16' })
  attendanceDate: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Server time of the check-in. Never taken from the client clock.',
  })
  checkInTime: string | null;

  @ApiProperty({ enum: AttendanceStatus })
  status: AttendanceStatus;

  @ApiProperty({
    description: 'True when the check-in was after REQUIRED_CHECK_IN.',
  })
  late: boolean;

  @ApiProperty({ example: 0 })
  lateMinutes: number;

  @ApiProperty({ type: String, nullable: true, example: '-6.20000, 106.81667' })
  location: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Storage key of the proof photo.',
  })
  proofKey: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description: 'Temporary presigned URL of the proof photo.',
  })
  proofUrl: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '09:00',
    description: 'Cut-off that was in force that day, for auditing.',
  })
  requiredCheckIn: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Asia/Jakarta' })
  timezone: string | null;
}

export class ProofUploadModel implements ProofUpload {
  @ApiProperty({
    example: 'proofs/2026/02/6f1d4c2e-1f8f-4c4e-9a0e-2f5f7a9c1b3d.jpg',
  })
  key: string;

  @ApiProperty({
    format: 'uri',
    description:
      'Presigned PUT URL. Upload the photo here, then send `key` as `proofKey` to `POST /attendance/check-in`.',
  })
  uploadUrl: string;

  @ApiProperty({ example: 600 })
  expiresInSeconds: number;

  @ApiProperty({ format: 'date', example: '2026-02-16' })
  attendanceDate: string;
}

export class MeViewModel extends EmployeeViewModel implements MeView {
  @ApiProperty({
    type: () => AttendanceViewModel,
    nullable: true,
    description: 'The day asked for, or `null` when there is no record yet.',
  })
  attendance: AttendanceViewModel | null;
}

export class TodayItemModel implements TodayItem {
  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 'EMP-78D3E9BA' })
  employeeNumber: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName: string;

  @ApiProperty({ enum: AttendanceStatus })
  status: AttendanceStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  checkInTime: string | null;

  @ApiProperty({ example: 0 })
  lateMinutes: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '-6.20000, 106.81667',
    description: 'Position the employee\'s browser reported, unverified.',
  })
  location: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description: 'Temporary presigned URL of the proof photo, or `null`.',
  })
  proofUrl: string | null;
}

export class TodayReportModel implements TodayReport {
  @ApiProperty({ format: 'date', example: '2026-02-16' })
  date: string;

  @ApiProperty({ enum: ['WORKING_DAY', 'WEEKEND', 'HOLIDAY', 'UNKNOWN'] })
  dayType: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  holidayName: string | null;

  @ApiProperty({ example: 1 })
  totalEmployees: number;

  @ApiProperty({ example: 1 })
  onTime: number;

  @ApiProperty({ example: 0 })
  late: number;

  @ApiProperty({ example: 0 })
  absent: number;

  @ApiProperty({
    example: 0,
    description:
      'Employed and expected to check in, but not recorded yet. The sweep turns these into `ABSENT`.',
  })
  notCheckedIn: number;

  @ApiProperty({ type: () => TodayItemModel, isArray: true })
  items: TodayItemModel[];
}

export class LateDatesModel implements LateDatesResult {
  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 1 })
  lateCount: number;

  @ApiProperty({ type: [String], example: ['2026-02-03'] })
  lateDates: string[];
}

export class AttendanceSummaryModel implements AttendanceSummary {
  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 12, description: 'Rows of any status in that year.' })
  recorded: number;

  @ApiProperty({ example: 10 })
  onTime: number;

  @ApiProperty({ example: 2 })
  late: number;

  @ApiProperty({ example: 0 })
  absent: number;

  @ApiProperty({ example: 0 })
  leave: number;

  @ApiProperty({ type: [String], example: ['2026-02-03'] })
  lateDates: string[];
}

export class MarkAbsentResultModel implements MarkAbsentResult {
  @ApiProperty({ format: 'date', example: '2026-02-16' })
  date: string;

  @ApiProperty({ example: 1, description: 'ABSENT rows inserted.' })
  created: number;

  @ApiProperty({
    example: false,
    description:
      'True when the day needed no sweep (weekend, holiday, unknown calendar).',
  })
  skipped: boolean;

  @ApiPropertyOptional({ example: 'weekend' })
  reason?: string;
}

export class IdentitySummaryModel {
  @ApiProperty({ format: 'uuid' })
  identityId: string;

  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ enum: IdentityStatus })
  status: IdentityStatus;
}

export class HealthModel {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status: string;
}
