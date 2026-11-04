import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateScheduleDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @Matches(DATE, { message: 'effectiveFrom must be a YYYY-MM-DD date' })
  effectiveFrom: string;

  @IsOptional()
  @Matches(DATE, { message: 'effectiveUntil must be a YYYY-MM-DD date' })
  effectiveUntil?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays?: number[];

  @IsOptional()
  @Matches(TIME, { message: 'requiredCheckIn must be HH:mm or HH:mm:ss' })
  requiredCheckIn?: string;

  @IsOptional()
  @Matches(TIME, { message: 'requiredCheckOut must be HH:mm or HH:mm:ss' })
  requiredCheckOut?: string;

  @IsOptional()
  @IsString()
  @Length(3, 64)
  timezone?: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @Matches(DATE, { message: 'effectiveFrom must be a YYYY-MM-DD date' })
  effectiveFrom?: string;

  @IsOptional()
  @Matches(DATE, { message: 'effectiveUntil must be a YYYY-MM-DD date' })
  effectiveUntil?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays?: number[];

  @IsOptional()
  @Matches(TIME, { message: 'requiredCheckIn must be HH:mm or HH:mm:ss' })
  requiredCheckIn?: string;

  @IsOptional()
  @Matches(TIME, { message: 'requiredCheckOut must be HH:mm or HH:mm:ss' })
  requiredCheckOut?: string;

  @IsOptional()
  @IsString()
  @Length(3, 64)
  timezone?: string;
}

export class ScheduleQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @Matches(DATE)
  activeOn?: string;
}

export class ResolveScheduleQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Matches(DATE)
  date?: string;
}
