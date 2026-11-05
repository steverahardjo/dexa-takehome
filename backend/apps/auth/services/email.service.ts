import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';

import { RPC_ERRORS } from '../../../shared/rpc/errors.js';

export type EmailProvider = 'log';

/**
 * Delivery port for transactional email.
 *
 * The only provider today is `log`, which refuses to run in production: wire a
 * real provider (SMTP, SES, ...) behind `EMAIL_PROVIDER` before deploying.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: EmailProvider;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    this.provider = config.get<string>(
      'EMAIL_PROVIDER',
      'log',
    ) as EmailProvider;
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  async sendOtp(
    to: string,
    code: string,
    expiresInSeconds: number,
  ): Promise<void> {
    if (this.provider !== 'log') {
      throw this.undeliverable(
        `Unsupported EMAIL_PROVIDER "${this.provider}"`,
      );
    }

    if (this.isProduction) {
      throw this.undeliverable(
        'Email delivery is not configured for production',
      );
    }

    this.logger.log(`OTP for ${to}: ${code} (valid for ${expiresInSeconds}s)`);
  }

  private undeliverable(message: string): RpcException {
    return new RpcException({ code: RPC_ERRORS.unavailable, message });
  }
}
