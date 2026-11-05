import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { Role } from '../../../shared/enums/roles.enum.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateIdentityDto {
  @IsUUID('4')
  employeeId: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateIdentityDto {
  @IsUUID('4')
  employeeId: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class DeleteIdentityDto {
  @IsUUID('4')
  employeeId: string;
}
