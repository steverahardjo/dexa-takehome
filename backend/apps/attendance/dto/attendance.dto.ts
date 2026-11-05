import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRIM = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CheckInDto {
  @IsUUID('4')
  employeeId: string;

  /** Object key returned by `attendance.proof-url` after the upload. */
  @IsString()
  @Length(1, 1024)
  @MaxLength(1024)
  proofKey: string;

  @IsOptional()
  @Transform(TRIM)
  @IsString()
  @Length(0, 255)
  location?: string;
}

export class DayQueryDto {
  @IsUUID('4')
  employeeId: string;

  @IsOptional()
  @Matches(DATE, { message: 'date must be a YYYY-MM-DD date' })
  date?: string;
}

export class TodayQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'date must be a YYYY-MM-DD date' })
  date?: string;
}

export class YearQueryDto {
  @IsUUID('4')
  employeeId: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;
}

export class MarkAbsentDto {
  @IsOptional()
  @Matches(DATE, { message: 'date must be a YYYY-MM-DD date' })
  date?: string;
}
