import { Logger } from '@nestjs/common';
import { EmailService, type OtpEmailInput } from './email.service.js';

/**
 * Used when no mail provider is configured. It intentionally does not print the
 * code — enable `OTP_DEV_RETURN=true` locally to receive it in the API response.
 */
export class ConsoleEmailService extends EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  async sendOtp({ to, expiresInMinutes }: OtpEmailInput): Promise<void> {
    this.logger.warn(
      `RESEND_API_KEY is not set; suppressed a sign-in email to ${this.mask(to)}. ` +
        `Codes expire in ${expiresInMinutes} minutes. Set OTP_DEV_RETURN=true for local testing.`,
    );
  }

  private mask(email: string): string {
    const [local = '', domain = ''] = email.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
}
