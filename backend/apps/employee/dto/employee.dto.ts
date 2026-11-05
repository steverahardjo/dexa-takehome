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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentStatus, Role } from '../../../shared/enums/roles.enum.js';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEmployeeDto {
  @ApiPropertyOptional({
    example: 'EMP-78D3E9BA',
    description: 'Generated when omitted.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 32)
  employeeNumber?: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  fullName: string;

  @ApiProperty({
    format: 'email',
    example: 'ada@example.com',
    description: 'Also becomes the login identity of the employee.',
  })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+62 812 3456 7890' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 32)
  phone?: string;

  @ApiProperty({
    format: 'date',
    example: '2026-02-01',
    description: 'First day of employment, in the company timezone.',
  })
  @Matches(DATE, { message: 'joinedAt must be a YYYY-MM-DD date' })
  joinedAt: string;

  /**
   * Object key returned by the storage service after uploading through a
   * presigned URL. The employee service verifies it before storing it.
   */
  @ApiProperty({
    description:
      'Key returned by an avatar upload request. The object must exist in storage.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  avatarKey: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    example: [],
    description: 'Divisions the employee belongs to.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  divisionIds?: string[];

  @ApiPropertyOptional({
    enum: Role,
    description: 'Honoured only when the caller is MASTER_ADMIN.',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Ada King' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  fullName?: string;

  @ApiPropertyOptional({
    format: 'email',
    description: 'Changing it also changes the login identity.',
  })
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    type: String,
    example: '+62 812 3456 7890',
    nullable: true,
    description: 'Send an empty string or null to clear it.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === '' ? null : String(value).trim(),
  )
  @IsString()
  @Length(3, 32)
  phone?: string | null;

  @ApiPropertyOptional({ format: 'date', example: '2026-02-01' })
  @IsOptional()
  @Matches(DATE, { message: 'joinedAt must be a YYYY-MM-DD date' })
  joinedAt?: string;

  @ApiPropertyOptional({
    description: 'Replaces the avatar; must reference an uploaded object.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  avatarKey?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Replaces the full set of divisions when present.',
  })
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
