import { configuration } from './configuration.js';
import { isValidTimeZone } from '../common/time/time.util.js';

/**
 * Fails fast on configurations that would boot but misbehave at runtime.
 * Secrets keep development-safe defaults; only combinations that cannot work
 * (or would silently weaken production security) are rejected.
 */
export function validateEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  void raw;
  const config = configuration();
  const errors: string[] = [];
  const isProduction = config.isProduction;

  if (isProduction && /dev-only|change-me/i.test(config.jwt.secret)) {
    errors.push('JWT_SECRET must be set to a strong value in production');
  }
  if (config.jwt.secret.length < 16) {
    errors.push('JWT_SECRET must be at least 16 characters long');
  }

  if (isProduction && config.otp.devReturn) {
    errors.push('OTP_DEV_RETURN must be disabled in production');
  }

  if (config.storage.provider === 's3') {
    if (!config.storage.bucket) errors.push('AWS_S3_BUCKET is required when STORAGE_PROVIDER=s3');
    if (!config.storage.accessKeyId || !config.storage.secretAccessKey) {
      errors.push('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=s3');
    }
  } else if (config.storage.provider !== 'memory') {
    errors.push(
      `STORAGE_PROVIDER must be "s3" or "memory" (received "${config.storage.provider}")`,
    );
  }

  if (isProduction && !config.resend.apiKey) {
    errors.push('RESEND_API_KEY is required in production: passwordless login needs email delivery');
  }

  if (config.otp.length !== 6) {
    errors.push('OTP length is fixed at 6 digits');
  }

  if (!isValidTimeZone(config.company.timezone)) {
    errors.push(`COMPANY_TIMEZONE is not a valid IANA timezone: ${config.company.timezone}`);
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return raw;
}
