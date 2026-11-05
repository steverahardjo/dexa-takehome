import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmploymentStatus, Role } from '../../../shared/enums/roles.enum.js';
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

  /**
   * Object key returned by the storage service after uploading through a
   * presigned URL. The employee service verifies it before storing it.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  avatarKey: string;

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
  @Transform(({ value }) =>
    value === null || value === '' ? null : String(value).trim(),
  )
  @IsString()
  @Length(3, 32)
  phone?: string | null;

  @IsOptional()
  @Matches(DATE, { message: 'joinedAt must be a YYYY-MM-DD date' })
  joinedAt?: string;

  /** Replaces the avatar; must reference an uploaded object. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  avatarKey?: string;

  /** Replaces the full set of divisions when present. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  divisionIds?: string[];
}

export class UpdateEmployeePayloadDto extends UpdateEmployeeDto {
  @IsUUID('4')
  id: string;
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
  @Max(200)
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
