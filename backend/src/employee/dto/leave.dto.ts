import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { LeaveStatus } from '../../common/enums/roles.enum.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLeaveDto {
  @Matches(DATE, { message: 'startDate must be a YYYY-MM-DD date' })
  startDate: string;

  @Matches(DATE, { message: 'endDate must be a YYYY-MM-DD date' })
  endDate: string;

  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 1000)
  reason?: string;
}

export class UpdateLeaveStatusDto {
  @IsEnum(LeaveStatus)
  status: LeaveStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 1000)
  reason?: string;
}

export class LeaveQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
