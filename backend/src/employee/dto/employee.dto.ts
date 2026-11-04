import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
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
import { EmploymentStatus, Role } from '../../common/enums/roles.enum.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEmployeeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 32)
  employeeNumber?: string;

  @Transform(trim)
  @IsString()
  @Length(2, 255)
  fullName: string;

  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 32)
  phone?: string;

  @Matches(DATE, { message: 'joinedAt must be a YYYY-MM-DD date' })
  joinedAt: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  divisionIds?: string[];

  /** Honoured only when the caller is MASTER_ADMIN. */
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  fullName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === '' ? null : String(value).trim()))
  @IsString()
  @Length(3, 32)
  phone?: string | null;

  @IsOptional()
  @Matches(DATE, { message: 'joinedAt must be a YYYY-MM-DD date' })
  joinedAt?: string;
}

export class AssignDivisionsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  divisionIds: string[];
}

export class ChangeEmploymentStatusDto {
  @IsOptional()
  @Matches(DATE, { message: 'effectiveDate must be a YYYY-MM-DD date' })
  effectiveDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class TerminateEmployeeDto {
  @IsOptional()
  @Matches(DATE, { message: 'terminatedAt must be a YYYY-MM-DD date' })
  terminatedAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class SetEmployeeRoleDto {
  @IsEnum(Role)
  role: Role;
}

export class EmployeeQueryDto {
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
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  search?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;
}
