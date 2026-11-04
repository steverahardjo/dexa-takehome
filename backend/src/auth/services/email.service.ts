import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../../config/env.js';

export interface OtpMail {
  to: string;
  name: string;
  code: string;
  ttlMinutes: number;
}

/** Everything one message needs, whichever channel ends up carrying it. */
interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_MAIL_FROM = 'Absence Management <absences@example.com>';

/** `message (HTTP 401)`, so a rejected key is obvious in the log line. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const status = (error as { statusCode?: unknown }).statusCode;

  return typeof status === 'number'
    ? `${error.message} (HTTP ${status})`
    : error.message;
}

/**
 * Sends the sign-in code over the first channel that is configured: Resend
 * when `RESEND_API_KEY` is set, SMTP when `SMTP_HOST` is, and otherwise a
 * transport that keeps the message in memory and logs it, so a local run needs
 * no mail server. `MAIL_FROM` is the sender for both real channels. The code is
 * also returned by the API in dev.
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
      await this.deliver({ to, subject: 'Your sign-in code', text, html });
    } catch (error) {
      this.logger.error(
        `Could not send the sign-in code to ${to}: ${describeError(error)}`,
      );

      if (process.env.NODE_ENV === 'production') {
        throw error;
      }

      this.logger.warn(`Dev fallback: the code for ${to} is ${code}`);
    }
  }

  /** Resend deliver app */
  private async deliver(mail: Mail): Promise<void> {
    const apiKey = env.optionalString('RESEND_API_KEY');

    if (apiKey) {
      await new Resend(apiKey).emails.send({
        from: this.from(),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });

      return;
    }

    await this.getTransport().sendMail({
      from: this.from(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }

  private from(): string {
    return env.string('MAIL_FROM', DEFAULT_MAIL_FROM);
  }

  private getTransport(): Transporter {
    if (this.transport) return this.transport;

    const host = env.optionalString('SMTP_HOST');

    if (!host) {
      this.logger.warn(
        'Neither RESEND_API_KEY nor SMTP_HOST is set: codes are logged instead of mailed',
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
