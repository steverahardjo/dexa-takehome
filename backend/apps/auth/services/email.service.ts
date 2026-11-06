
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { Resend } from 'resend';

import { RPC_ERRORS } from '../../../shared/rpc/errors.js';

export type EmailProvider = 'log' | 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: EmailProvider;
  private readonly resend?: Resend;
  private readonly emailFrom: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    this.provider = config.get<EmailProvider>('EMAIL_PROVIDER', 'log');

    this.isProduction =
      config.get<string>('NODE_ENV') === 'production';

    this.emailFrom = config.get<string>(
      'EMAIL_FROM',
      'onboarding@resend.dev',
    );

    if (this.provider === 'resend') {
      const apiKey = config.get<string>('RESEND_API_KEY');

      if (!apiKey) {
        throw new Error('RESEND_API_KEY is required');
      }

      this.resend = new Resend(apiKey);
    } else if (this.provider !== 'log') {
      throw new Error(
        `Unsupported EMAIL_PROVIDER "${this.provider}"`,
      );
    }

    if (this.isProduction && this.provider === 'log') {
      throw new Error(
        'Production requires a real email provider',
      );
    }
  }

  async sendOtp(
    to: string,
    code: string,
    expiresInSeconds: number,
  ): Promise<void> {
    if (this.provider === 'log') {
      this.logger.log(
        `OTP for ${to}: ${code} (valid for ${expiresInSeconds}s)`,
      );
      return;
    }

    if (!this.resend) {
      throw this.undeliverable('Resend is not initialized');
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.emailFrom,
        to,
        subject: 'Your verification code',
        html: this.buildOtpTemplate(code, expiresInSeconds),
        text: `Your verification code is ${code}. It expires in ${Math.ceil(expiresInSeconds / 60)} minutes.`,
      });

      if (error) {
        this.logger.error(
          `Resend delivery failed: ${error.message}`,
        );

        throw this.undeliverable(
          'Failed to deliver verification email',
        );
      }

      this.logger.log(
        `OTP email sent to ${to}. ID: ${data?.id}`,
      );
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      this.logger.error(
        'Email delivery failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw this.undeliverable(
        'Failed to deliver verification email',
      );
    }
  }

  private buildOtpTemplate(
    code: string,
    expiresInSeconds: number,
  ): string {
    const expirationMinutes = Math.ceil(
      expiresInSeconds / 60,
    );

    return `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Absences Email Verification</h2>

          <p>Use the following code to verify your email address:</p>

          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            padding: 16px 0;
          ">
            ${code}
          </div>

          <p>This code expires in ${expirationMinutes} minutes.</p>

          <p>If you did not request this code, you can ignore this email.</p>
        </body>
      </html>
    `;
  }

  private undeliverable(message: string): RpcException {
    return new RpcException({
      code: RPC_ERRORS.unavailable,
      message,
    });
  }
}

