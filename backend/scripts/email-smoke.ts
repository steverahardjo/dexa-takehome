/**
 * Smoke test for the real email delivery path.
 *
 * Builds the production `EmailService` from environment variables and sends a
 * verification email through it, so the provider config, the Resend key, the
 * sender address and the template are all exercised end to end.
 *
 * Run it from `backend/` (the script loads `../.env` itself):
 *
 *   npm run email:smoke                       # sends to the default address
 *   npm run email:smoke -- you@example.com    # another recipient
 *   npm run email:smoke -- you@example.com 123456
 *
 * Requires EMAIL_PROVIDER=resend, RESEND_API_KEY and EMAIL_FROM. The sender
 * domain must be verified in Resend; without a verified domain Resend only
 * delivers to the account owner's own address.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ConfigService } from '@nestjs/config';

import { EmailService } from '../apps/auth/services/email.service.js';

const DEFAULT_TO = 'steve.jevon.r@gmail.com';

/** Minimal dotenv reader: `KEY=value`, `#` comments, optional quotes. */
function loadEnvFile(path: string): boolean {
  let raw: string;

  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // A real environment variable always wins over the file.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

/** ConfigService stand-in backed by process.env. */
const envConfig = {
  get(key: string, fallback?: unknown) {
    return process.env[key] ?? fallback;
  },
  getOrThrow(key: string) {
    const value = process.env[key];

    if (value === undefined) {
      throw new Error(`${key} is not set`);
    }

    return value;
  },
} as unknown as ConfigService;

async function main(): Promise<void> {
  // `backend/.env` when present, otherwise the repo-root `.env` that compose
  // and the frontend share.
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
  ];

  const loaded = candidates.find((path) => loadEnvFile(path));

  if (!loaded) {
    console.warn(
      `! no .env found (looked in ${candidates.join(', ')}), using the current environment`,
    );
  }

  const to = process.argv[2] ?? DEFAULT_TO;
  const code = process.argv[3] ?? '123456';

  console.log('Email smoke test');
  console.log(`  provider : ${process.env.EMAIL_PROVIDER ?? 'log (default)'}`);
  console.log(`  from     : ${process.env.EMAIL_FROM ?? 'onboarding@resend.dev (default)'}`);
  console.log(
    `  key      : ${process.env.RESEND_API_KEY ? `set (${process.env.RESEND_API_KEY.length} chars)` : 'missing'}`,
  );
  console.log(`  to       : ${to}`);
  console.log('');

  if (process.env.EMAIL_PROVIDER !== 'resend') {
    console.error(
      'FAIL: EMAIL_PROVIDER must be "resend" — otherwise the service only logs the code.',
    );
    process.exitCode = 1;
    return;
  }

  const service = new EmailService(envConfig);

  const startedAt = Date.now();

  try {
    await service.sendOtp(to, code, 300);
  } catch (error) {
    console.error('FAIL: delivery raised an error');
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
    return;
  }

  console.log(`OK: handed to Resend in ${Date.now() - startedAt}ms`);
  console.log('Check the inbox (and spam) for a code of "123456".');
}

await main();
