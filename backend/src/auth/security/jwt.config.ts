import { env } from '../../config/env.js';

/**
 * Lifetime of an access token. The spec asks for 8 hours, which is long enough
 * for a working day and short enough that a leaked token ages out.
 */
export const ACCESS_TOKEN_TTL_SECONDS = env.int(
  'ACCESS_TOKEN_TTL_SECONDS',
  8 * 60 * 60,
);

/**
 * How long the admin/employee choice may stay open after a verified code. Short:
 * it only bridges one screen, and the OTP itself is already spent.
 */
export const CHOICE_TTL_SECONDS = env.int('CHOICE_TTL_SECONDS', 5 * 60);

/** The signing secret, refused when it is missing where it matters. */
export function jwtSecret(): string {
  const secret = env.optionalString('JWT_SECRET');

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return 'development-only-secret';
}
