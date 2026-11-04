import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** JPEG, PNG or WebP, base64 encoded: what the phone hands over. */
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Matches `MAX_EVIDENCE_LENGTH` in the frontend's capture contract. */
const MAX_IMAGE_CHARS = 4_000_000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * A position, as integers: micro-degrees (degrees × 1e6) and whole metres.
 * `geo.ts` is the one place that converts to the decimal columns.
 */
export interface CapturePosition {
  /** Degrees × 1e6. */
  latitude: number;
  /** Degrees × 1e6. */
  longitude: number;
  /** Metres, when the device reports it. */
  accuracy: number | null;
}

/** `position` in the phone payload. */
export class CapturePositionDto implements CapturePosition {
  // No latitude/longitude range check: the device reports what it reports, and
  // the integers are stored as they arrive.
  @Type(() => Number)
  @IsInt()
  latitude: number;

  @Type(() => Number)
  @IsInt()
  longitude: number;

  /** Metres, when the device reports it. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  accuracy: number | null;
}

/** `POST /attendance/sessions`: the desktop asks for a QR session. */
export class CreateCaptureSessionDto {
  @IsUUID()
  employeeId: string;

  /** Sent by the frontend; the name is looked up from the database. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  employeeName?: string;
}

/** `POST /attendance/sessions/:id`: what the phone sends back. */
export class SubmitCaptureDto {
  @IsString()
  @Matches(IMAGE_DATA_URL, {
    message: 'image must be a jpeg, png or webp data URL',
  })
  @MaxLength(MAX_IMAGE_CHARS)
  image: string;

  @IsISO8601()
  capturedAt: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CapturePositionDto)
  position?: CapturePositionDto | null;
}

/** `POST /attendance/check-in`: the dashboard's direct clock-in button. */
export class CheckInDto {
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value : undefined))
  @IsString()
  @MaxLength(MAX_IMAGE_CHARS)
  evidence?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CapturePositionDto)
  position?: CapturePositionDto | null;

  /** The phone's clock, kept as evidence only. */
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}

/** `GET /admin/attendance?date=YYYY-MM-DD`. */
export class AttendanceQueryDto {
  @IsOptional()
  @IsISO8601()
  date?: string;
}

/** `GET /admin/attendance/late-days?year=YYYY`: the red days of a calendar year. */
export class LateDaysQueryDto {
  /** Defaults to the current year. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
