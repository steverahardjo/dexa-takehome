export interface OtpEmailInput {
  to: string;
  code: string;
  expiresInMinutes: number;
}

/**
 * Delivery abstraction for authentication emails.
 *
 * OTP generation/verification never depends on Resend directly; a different
 * transport only has to implement this class.
 */
export abstract class EmailService {
  abstract sendOtp(input: OtpEmailInput): Promise<void>;
}
