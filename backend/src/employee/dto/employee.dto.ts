import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ROLES, type Role } from '../entities/employee.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Empty strings from the form mean "not set". */
const optionalText =
  (max: number) =>
  ({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;

    const text = value.trim();

    return text.length > 0 ? text.slice(0, max) : undefined;
  };

/** `GET /admin/employees?q=&page=&limit=&role=`. */
export class ListEmployeesDto {
  /** Matched against name, email and division. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Transform(trim)
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/** What the admin form posts; mirrors the frontend `Employee` fields. */
export class CreateEmployeeDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(190)
  email: string;

  @IsOptional()
  @Transform(optionalText(32))
  @IsString()
  @MaxLength(32)
  phone?: string;

  @Transform(trim)
  @IsIn(ROLES)
  role: Role;

  @IsOptional()
  @Transform(optionalText(120))
  @IsString()
  @MaxLength(120)
  division?: string;

  @IsOptional()
  @Transform(optionalText(2000))
  @IsString()
  @MaxLength(2000)
  address?: string;

  /** `YYYY-MM-DD`. */
  @IsISO8601()
  contractExpiry: string;

  @IsOptional()
  @Transform(optionalText(2048))
  @IsString()
  @MaxLength(2048)
  avatar?: string;
}

/** `PATCH /admin/employees/:id`: any subset of the form fields. */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
