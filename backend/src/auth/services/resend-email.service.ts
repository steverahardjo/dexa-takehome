import { Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { EmailService, type OtpEmailInput } from './email.service.js';

export class ResendEmailService extends EmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly fromEmail: string,
  ) {
    super();
    this.client = new Resend(apiKey);
  }

  async sendOtp({ to, code, expiresInMinutes }: OtpEmailInput): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to,
      subject: 'Your sign-in code',
      text: [
        `Your one-time sign-in code is ${code}.`,
        '',
        `It expires in ${expiresInMinutes} minutes and can only be used once.`,
        'If you did not request this code, you can ignore this email.',
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
          <h2 style="margin:0 0 12px">Your sign-in code</h2>
          <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:0 0 12px">${code}</p>
          <p>This code expires in ${expiresInMinutes} minutes and can only be used once.</p>
          <p style="color:#555">If you did not request this code, you can ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      // The code itself is never logged.
      this.logger.error(`Resend rejected an OTP email: ${error.name} - ${error.message}`);
      throw new Error('The sign-in email could not be delivered');
    }
  }
}
