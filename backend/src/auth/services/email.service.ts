import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../../config/env.js';

export interface OtpMail {
  to: string;
  name: string;
  code: string;
  ttlMinutes: number;
}

/**
 * Sends the sign-in code. With `SMTP_HOST` set the mail goes out over SMTP;
 * without it the transport keeps the message in memory and logs it, so a local
 * run needs no mail server. The code is also returned by the API in dev.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transport: Transporter | null = null;

  async sendOtp({ to, name, code, ttlMinutes }: OtpMail): Promise<void> {
    const text = [
      `Hi ${name},`,
      '',
      `Your sign-in code is ${code}. It expires in ${ttlMinutes} minutes.`,
      '',
      'If you did not ask for it, ignore this message.',
    ].join('\n');

    const html = `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your sign-in code is <strong style="font-size: 20px; letter-spacing: 4px">${escapeHtml(code)}</strong>.</p>
      <p>It expires in ${ttlMinutes} minutes. If you did not ask for it, ignore this message.</p>
    `;

    try {
      await this.getTransport().sendMail({
        from: env.string(
          'MAIL_FROM',
          'Absence Management <absences@example.com>',
        ),
        to,
        subject: 'Your sign-in code',
        text,
        html,
      });
    } catch (error) {
      this.logger.error(
        `Could not send the sign-in code to ${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (process.env.NODE_ENV === 'production') {
        throw error;
      }

      this.logger.warn(`Dev fallback: the code for ${to} is ${code}`);
    }
  }

  private getTransport(): Transporter {
    if (this.transport) return this.transport;

    const host = env.optionalString('SMTP_HOST');

    if (!host) {
      this.logger.warn(
        'SMTP_HOST is not set: codes are logged instead of mailed',
      );
      this.transport = nodemailer.createTransport({ jsonTransport: true });

      return this.transport;
    }

    const user = env.optionalString('SMTP_USER');
    const pass = env.optionalString('SMTP_PASSWORD');

    this.transport = nodemailer.createTransport({
      host,
      port: env.int('SMTP_PORT', 587),
      secure: env.bool('SMTP_SECURE', false),
      ...(user && { auth: { user, pass: pass ?? '' } }),
    });

    return this.transport;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
