import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  PROOF_TYPES,
  type ProofContentType,
} from '../../../../shared/contracts/attendance.contracts.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * `POST /attendance/proof-url`. Nothing is uploaded here: the request reserves a
 * key and returns the URL the browser PUTs the photo to.
 *
 * There is no `employeeId`: the caller is whoever the token says.
 */
export class ProofUrlDto {
  @ApiProperty({
    example: 'IMG_20260216_0815.jpg',
    description:
      'Original file name, used only for its extension. The stored key is generated.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  @Matches(/\.(jpe?g|png|webp)$/i, {
    message: 'fileName must be a .jpg, .jpeg, .png or .webp file',
  })
  fileName: string;

  @ApiProperty({
    enum: PROOF_TYPES,
    example: 'image/jpeg',
    description: 'Must match the bytes you PUT to the returned URL.',
  })
  @IsIn(PROOF_TYPES, { message: 'contentType must be a jpeg, png or webp' })
  contentType: ProofContentType;
}

/**
 * `POST /attendance/check-in`: the key the browser got from `proof-url` after
 * uploading. The employee comes from the token — a body `employeeId` is
 * rejected outright, so nobody can check in for someone else.
 */
export class CheckInDto {
  @ApiProperty({
    example: 'proofs/2026/02/6f1d4c2e-1f8f-4c4e-9a0e-2f5f7a9c1b3d.jpg',
    description: 'The `key` returned by `POST /attendance/proof-url`.',
  })
  @IsString()
  @Length(1, 1024)
  proofKey: string;

  @ApiPropertyOptional({
    example: '-6.20000, 106.81667',
    description:
      'Free-form position the client reported. Recorded for the audit trail, not verified.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 255)
  location?: string;
}

/** `?date=YYYY-MM-DD`; omitted means today in the company timezone. */
export class DayQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    example: '2026-02-16',
    description: 'Day in the company timezone. Defaults to today.',
  })
  @IsOptional()
  @Matches(DATE, { message: 'date must be a YYYY-MM-DD date' })
  date?: string;
}

export class YearQueryDto {
  @ApiProperty({ example: 2026, minimum: 2000, maximum: 2100 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;
}

export class EmployeeYearQueryDto extends YearQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Employee to summarise' })
  @IsUUID('4')
  employeeId: string;
}
