import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RequestOtpDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;
}

export class VerifyOtpDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'The code must be exactly 6 digits' })
  otp: string;
}

export class RefreshTokenDto {
  @IsString()
  @Length(20, 200)
  refreshToken: string;
}
