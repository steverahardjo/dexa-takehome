import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CheckInDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 255)
  location?: string;
}

export class CheckOutDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 255)
  location?: string;
}

export class AttendanceQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'from must be a YYYY-MM-DD date' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to must be a YYYY-MM-DD date' })
  to?: string;

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
  limit = 31;
}

export class CorrectAttendanceDto {
  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 255)
  location?: string;

  @Transform(trim)
  @IsString()
  @Length(5, 500)
  reason: string;
}

export class AttendanceRangeDto {
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;
}

export class AttendanceIdParamDto {
  @IsUUID()
  id: string;
}
