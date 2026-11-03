import { Transform } from 'class-transformer';
import { IsEmail, IsIn, Length, Matches, MaxLength } from 'class-validator';

import { OTP_LENGTH } from '../services/otp.service.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** `POST /auth/otp`: the address a code is requested for. */
export class RequestOtpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(190)
  email: string;
}

/** `POST /auth/otp/verify`: the address and the code from the mail. */
export class VerifyOtpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(190)
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(OTP_LENGTH, OTP_LENGTH)
  @Matches(/^\d+$/, { message: 'code must be numeric' })
  code: string;
}

/**
 * `POST /auth/choice`: the view an admin picked after the code was verified.
 * `admin` keeps the admin role, `employee` signs in with the narrower one.
 */
export class ChooseViewDto {
  @IsIn(['admin', 'employee'])
  view: 'admin' | 'employee';
}
