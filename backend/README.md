# Absences API

Passwordless attendance management backend. One NestJS application, four domain
modules, PostgreSQL + TypeORM, Resend email OTP, JWT sessions and S3-compatible
photo storage with an in-memory development provider.

```
src/
├── auth/        OTP request/verify, JWT access tokens, rotating refresh tokens
├── employee/    employees, divisions, schedules, employment status, leave
├── attendance/  check-in/check-out, photo evidence, audited corrections
├── reporting/   daily dashboard, yearly/monthly reports, history, projections
├── storage/     StorageProvider + S3 and in-memory implementations
├── common/      guards, decorators, filters, timezone utilities
└── database/    TypeORM data source, migrations, seed
```

Reporting owns denormalised read tables (`reporting_employees`,
`daily_employee_attendance`, `employee_attendance_summary`). They are rebuilt
from the source modules by domain events and by an explicit reconciliation pass.

## Quick start (Docker)

```bash
cp .env.example .env          # optional: tweak secrets / Resend
docker compose up --build
```

This starts PostgreSQL, applies migrations, seeds the master admin (and demo
staff unless `SEED_DEMO=false`), then serves the API on
<http://localhost:3000>. The in-memory storage provider is the default.

If host port 5432 is already taken, publish the database elsewhere:

```bash
DB_HOST_PORT=55432 docker compose up --build
```

`docker compose run --rm seed` re-runs the seed; it is idempotent and skips when
the master admin identity already exists.

### Local without Docker

```bash
cp .env.example .env
npm install
npm run db:migrate            # builds, then applies migrations
npm run db:seed               # builds, then seeds
npm run start:dev
```

`npm run start:dev` listens on `PORT` (3000 by default). Health check:
`GET /health`.

## Environment

Everything is listed in `.env.example`; the API reads `.env` and then falls back
to the repository-root `.env` for local convenience. Important groups:

| Group | Variables |
|---|---|
| Database | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL` |
| Sessions | `JWT_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_DAYS` |
| OTP | `OTP_SECRET`, `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_DEV_RETURN` |
| Email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Storage | `STORAGE_PROVIDER` (`memory`/`s3`), `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_ENDPOINT` |
| Company | `COMPANY_TIMEZONE`, `COMPANY_CHECK_IN`, `COMPANY_CHECK_OUT`, `COMPANY_WORKING_DAYS` |
| Bootstrap | `MASTER_ADMIN_EMAIL`, `MASTER_ADMIN_NAME`, `SEED_DEMO` |

`OTP_DEV_RETURN=true` includes the code in the request-OTP response **outside
production only**; it is rejected at boot when `NODE_ENV=production`. OTP values
are never logged, and only an HMAC of the code is stored.

If `MASTER_ADMIN_EMAIL` is empty the seed falls back to the repo-root
`NEXT_PUBLIC_DEMO_EMAIL`, then to `master@absences.local`.

## Authentication

1. `POST /auth/request-otp { email }` — issues a 6-digit code valid for five
   minutes to an active identity. Responses are identical for unknown emails so
   the endpoint cannot enumerate accounts. 60-second resend cooldown, 5 requests
   per 15 minutes per email, plus IP throttling.
2. `POST /auth/verify-otp { email, otp }` — single-use; locks after 5 wrong
   attempts. Returns a 15-minute access JWT and a 30-day opaque refresh token
   (only its SHA-256 hash is stored).
3. `POST /auth/refresh { refreshToken }` — rotates the token. Reusing a revoked
   token revokes the whole token family.
4. `POST /auth/logout`, `GET /auth/me`.

All routes are authenticated by a global guard unless marked `@Public()` (OTP,
health, storage proxy). Authorisation is enforced with `@Roles(...)`:
`EMPLOYEE` (own data), `ADMIN` (management/reporting), `MASTER_ADMIN` (company
overview, role assignment, reconciliation).

The master admin is created only by the seed from `MASTER_ADMIN_EMAIL`; there is
no public endpoint that can grant a role.

## Business rules

- **Schedule 09:00 → 18:00 (Asia/Jakarta by default).** Resolution order is
  employee schedule › division schedule › company default; the newest effective
  schedule wins and effective windows are respected.
- **Late**: check-in after the schedule's `requiredCheckIn` (09:00) is `LATE`;
  `lateMinutes` is the rounded-up difference. A check-in exactly at 09:00 is on
  time.
- **Absence cutoff**: a missing check-in is `NOT_CHECKED_IN` until the schedule's
  `requiredCheckOut` (18:00) passes. Before the cutoff nobody is absent. After it,
  historical/report rows become `ABSENT`. The dashboard keeps showing
  `NOT_CHECKED_IN` because its status set has no separate absent bucket.
- **One record per employee per day** is enforced by a unique constraint
  (`employee_id`, `attendance_date`); concurrent check-ins return `409`.
- **Check-out** requires an existing check-in and cannot precede it.
- **Only active employees** can check in. Termination disables the login identity
  but never deletes attendance; manual corrections are append-only audited in
  `attendance_corrections`.
- **Leave** is stored per employee (`APPROVED` leaves). On a scheduled working day
  an approved leave yields `ON_LEAVE` and is excluded from absence/punctuality.
- **Punctuality** = `onTimeDays / presentDays × 100`.
- Yearly `workingDays` counts elapsed scheduled days; `presentDays` counts
  check-ins; `leaveDays` excludes days the employee actually worked;
  `absentDays` only counts scheduled days after the cutoff with no check-in.

Instants are stored as UTC `timestamptz`. Attendance dates and lateness are
calculated in the schedule timezone.

## API

| Method | Endpoint | Access |
|---|---|---|
| POST | `/auth/request-otp`, `/auth/verify-otp`, `/auth/refresh`, `/auth/logout` | public |
| GET | `/auth/me` | authenticated |
| GET/POST | `/employees` | ADMIN, MASTER_ADMIN |
| GET | `/employees/me` | authenticated |
| GET | `/employees/:id` | own profile or admin |
| PATCH | `/employees/:id` | ADMIN, MASTER_ADMIN |
| PUT | `/employees/:id/divisions` | ADMIN, MASTER_ADMIN |
| POST | `/employees/:id/activate`, `/deactivate`, `/terminate` | ADMIN, MASTER_ADMIN |
| PATCH | `/employees/:id/role` | MASTER_ADMIN |
| GET | `/employees/:id/history` | ADMIN, MASTER_ADMIN |
| GET/POST/PATCH/DELETE | `/divisions`, `/divisions/:id` | ADMIN, MASTER_ADMIN |
| GET/POST/PATCH/DELETE | `/schedules`, `/schedules/:id` | ADMIN, MASTER_ADMIN |
| GET | `/schedules/me`, `/schedules/resolve` | authenticated / admin |
| GET/POST/PATCH | `/employees/:employeeId/leaves`, `/:leaveId` | ADMIN, MASTER_ADMIN |
| POST | `/attendance/check-in` (multipart `picture`, optional `location`) | authenticated |
| POST | `/attendance/check-out` | authenticated |
| GET | `/attendance/me`, `/attendance/me/:date` | own data |
| GET | `/attendance/employee/:id` | ADMIN, MASTER_ADMIN |
| PATCH | `/attendance/:id` (correction with `reason`) | ADMIN, MASTER_ADMIN |
| GET | `/reports/attendance/today` | ADMIN, MASTER_ADMIN |
| GET | `/reports/employees/:id/yearly?year=YYYY` | ADMIN, MASTER_ADMIN |
| GET | `/reports/employees/:id/monthly?year=YYYY` | ADMIN, MASTER_ADMIN |
| GET | `/reports/employees/:id/history?year=YYYY&page&limit` | ADMIN, MASTER_ADMIN |
| POST | `/reports/reconcile` | MASTER_ADMIN |
| GET | `/storage/objects/:token` | public opaque URL |

`GET /reports/attendance/today` accepts `status`, `division` and `search`
filters for the employee list; the summary always describes the whole company.

## Photo storage

`StorageProvider` has `upload`, `getUrl`, `delete`. Select it with
`STORAGE_PROVIDER`:

- `memory` — buffers live in process memory and are served from
  `/storage/objects/:token`; they vanish on restart. Development/test only.
- `s3` — private objects in an S3-compatible bucket (AWS, MinIO, R2). Uploads
  are validated as JPEG/PNG/WebP up to 5 MB; reads redirect to a short-lived
  signed URL.

The database stores a stable proxy URL, never the expiring S3 signature.

## Tests

```bash
npm test          # unit: time/lateness, schedule resolution, status rules, OTP
npm run test:e2e  # integration: needs a disposable PostgreSQL database
```

Integration tests create/reset the database named in `TEST_DATABASE_URL`:

```bash
TEST_DATABASE_URL=postgres://absences:absences@localhost:5432/absences_test \
  npm run test:e2e
```

They cover OTP login, check-in with photo, duplicate guards, check-out, role
authorisation, yearly/monthly/history reports, termination semantics and refresh
token rotation.

## Migrations

The initial schema is a real migration (`src/database/migrations`) and runs
automatically on boot (`DB_MIGRATIONS_RUN=true`, default). Use
`npm run db:migrate` to apply without serving traffic. `DB_SYNCHRONIZE` must stay
`false`.

## Production notes

- Set `NODE_ENV=production`, a strong `JWT_SECRET`/`OTP_SECRET`, a verified
  `RESEND_FROM_EMAIL` and a real `RESEND_API_KEY`; leave `OTP_DEV_RETURN=false`.
- Use `STORAGE_PROVIDER=s3` with private buckets.
- Put the API behind TLS; refresh tokens are held by the client (the current
  frontend expects them in its session store).
- `POST /reports/reconcile` (or the automatic boot rebuild when projections are
  empty) repairs the read model after restores or missed in-process events.

Telemetry: the app can send traces/errors/metrics to
[NestJS Observe](https://observe.nestjs.com); run `npx @nestjs/observe link` and
keep `OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET` in the environment.
