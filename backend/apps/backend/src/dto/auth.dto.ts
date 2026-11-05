import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * The gateway only checks the shape of the login payload. Which addresses
 * exist, whether a code is right and how many attempts are left stay with the
 * auth service, which answers every failure the same way.
 */
export class RequestOtpDto {
  @ApiProperty({
    format: 'email',
    example: 'ada@example.com',
    description: 'Address the code is mailed to. Normalised to lower case.',
  })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({
    example: '123456',
    description: 'The 6-digit code from the email.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
