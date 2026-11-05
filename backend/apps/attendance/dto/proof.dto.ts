import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, Matches } from 'class-validator';

import {
  PROOF_TYPES,
  type ProofContentType,
} from '../../../shared/contracts/attendance.contracts.js';

const TRIM = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * `attendance.proof-url`: nothing is uploaded here — the service only reserves
 * a key and returns a temporary URL the browser PUTs the bytes to.
 *
 * Rejected on weekends and national holidays.
 */
export class RequestProofUploadDto {
  @Transform(TRIM)
  @IsString()
  @Length(1, 255)
  @Matches(/\.(jpe?g|png|webp)$/i, {
    message: 'fileName must be a .jpg, .jpeg, .png or .webp file',
  })
  fileName: string;

  @IsIn(PROOF_TYPES, { message: 'contentType must be a jpeg, png or webp' })
  contentType: ProofContentType;
}
