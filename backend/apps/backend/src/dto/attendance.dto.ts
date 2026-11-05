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
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  @Matches(/\.(jpe?g|png|webp)$/i, {
    message: 'fileName must be a .jpg, .jpeg, .png or .webp file',
  })
  fileName: string;

  @IsIn(PROOF_TYPES, { message: 'contentType must be a jpeg, png or webp' })
  contentType: ProofContentType;
}

/**
 * `POST /attendance/check-in`: the key the browser got from `proof-url` after
 * uploading. The employee comes from the token — a body `employeeId` is
 * rejected outright, so nobody can check in for someone else.
 */
export class CheckInDto {
  @IsString()
  @Length(1, 1024)
  proofKey: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 255)
  location?: string;
}

/** `?date=YYYY-MM-DD`; omitted means today in the company timezone. */
export class DayQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'date must be a YYYY-MM-DD date' })
  date?: string;
}

export class YearQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;
}

export class EmployeeYearQueryDto extends YearQueryDto {
  @IsUUID('4')
  employeeId: string;
}
