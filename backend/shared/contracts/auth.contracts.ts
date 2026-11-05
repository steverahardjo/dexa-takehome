import type { IdentityStatus, Role } from '../enums/roles.enum.js';

/**
 * Internal TCP API of the auth service: the public OTP login the gateway
 * forwards, and the identity operations the employee service calls.
 *
 * These calls are request/response: `employee` awaits the answer so a failed
 * identity write can roll the employee write back.
 */
export const AUTH_PATTERNS = {
  /** Issues a one-time code. Always answers the same generic message. */
  requestOtp: 'auth.otp.request',
  /** Exchanges a valid code for a short-lived access token. */
  verifyOtp: 'auth.otp.verify',
  /** Creates the identity of a new employee. */
  createIdentity: 'auth.identity.create',
  /** Updates the email and/or role of an existing identity. */
  updateIdentity: 'auth.identity.update',
  /** Removes an identity by employee id (idempotent). */
  deleteIdentity: 'auth.identity.delete',
} as const;

export interface OtpRequestResult {
  /** Identical for a known and an unknown address. */
  message: string;
}

export interface IdentitySummary {
  identityId: string;
  employeeId: string;
  email: string;
  role: Role;
  status: IdentityStatus;
}

export interface DeletedIdentity {
  employeeId: string;
  deleted: boolean;
}
