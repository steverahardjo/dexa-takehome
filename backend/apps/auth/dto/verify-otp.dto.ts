import { Matches } from 'class-validator';

import { RequestOtpDto } from './request-otp.dto.js';

export class VerifyOtpDto extends RequestOtpDto {
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
