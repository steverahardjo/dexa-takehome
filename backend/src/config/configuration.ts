const asList = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const asInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const asWorkingDays = (value: string | undefined): number[] => {
  const days = asList(value, ['1', '2', '3', '4', '5']).map(Number);
  const valid = days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return valid.length ? valid : [1, 2, 3, 4, 5];
};

/**
 * Single source of truth for every environment-backed setting.
 *
 * Values are grouped by concern so call sites read `db.host` instead of
 * scattering `process.env` reads through the domain modules.
 */
export const configuration = () => ({
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: asInt(process.env.PORT, 3000),
  corsOrigins: asList(process.env.CORS_ORIGINS, ['http://localhost:3000']),
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${asInt(process.env.PORT, 3000)}`,

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: asInt(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME ?? 'absences',
    password: process.env.DB_PASSWORD ?? 'absences',
    database: process.env.DB_DATABASE ?? 'absences',
    ssl: asBool(process.env.DB_SSL, false),
    logging: asBool(process.env.DB_LOGGING, false),
    synchronize: asBool(process.env.DB_SYNCHRONIZE, false),
    migrationsRun: asBool(process.env.DB_MIGRATIONS_RUN, true),
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
    accessTtlSeconds: asInt(process.env.JWT_ACCESS_TTL_SECONDS, 900),
    refreshTtlDays: asInt(process.env.JWT_REFRESH_TTL_DAYS, 30),
  },

  otp: {
    /** Used to HMAC one-time codes so a database leak cannot reveal them. */
    secret: process.env.OTP_SECRET ?? process.env.JWT_SECRET ?? 'dev-only-otp-secret',
    ttlMinutes: asInt(process.env.OTP_TTL_MINUTES, 5),
    maxAttempts: asInt(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: asInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
    maxRequestsPerWindow: asInt(process.env.OTP_MAX_REQUESTS, 5),
    requestWindowSeconds: asInt(process.env.OTP_REQUEST_WINDOW_SECONDS, 900),
    length: 6,
    /** Only ever honoured outside production; useful for local/demo testing. */
    devReturn: asBool(process.env.OTP_DEV_RETURN, false),
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? 'Absences <onboarding@resend.dev>',
  },

  storage: {
    provider: (process.env.STORAGE_PROVIDER ?? 'memory').toLowerCase(),
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.AWS_S3_BUCKET ?? '',
    endpoint: process.env.AWS_ENDPOINT ?? '',
    forcePathStyle: asBool(process.env.AWS_S3_FORCE_PATH_STYLE, true),
  },

  company: {
    timezone: process.env.COMPANY_TIMEZONE ?? 'Asia/Jakarta',
    requiredCheckIn: process.env.COMPANY_CHECK_IN ?? '09:00:00',
    requiredCheckOut: process.env.COMPANY_CHECK_OUT ?? '18:00:00',
    workingDays: asWorkingDays(process.env.COMPANY_WORKING_DAYS),
  },

  seed: {
    masterAdminEmail: process.env.MASTER_ADMIN_EMAIL ?? '',
    masterAdminName: process.env.MASTER_ADMIN_NAME ?? 'Master Admin',
    demo: asBool(process.env.SEED_DEMO, false),
  },
});

export type AppConfiguration = ReturnType<typeof configuration>;
