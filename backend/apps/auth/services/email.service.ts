import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
      throw new ServiceUnavailableException(
        `Unsupported EMAIL_PROVIDER "${this.provider}"`,
      );
    }

    if (this.isProduction) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured for production',
      );
    }

    this.logger.log(`OTP for ${to}: ${code} (valid for ${expiresInSeconds}s)`);
  }
}
