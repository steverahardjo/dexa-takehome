# Absences — One-Shot Reference

Architecture walkthrough of the current codebase. Verified against the working tree,
not against the (stale) root `README.md`.

> **Doc drift warning:** root `README.md`, root `docker-compose.yml` and root
> `.env.example` are obsolete — they describe an old 3-container MySQL design booted
> from `dist/services/*/main.js` on ports 3001–3003. Those files do not exist.
> The real stack is `backend/docker-compose.yml` (one `api` + Postgres 16 + `seed`),
> `backend/Dockerfile` (`node dist/main.js`, port 3000) and `backend/README.md`.
> `run.sh` runs compose from `backend/` (`-f backend/docker-compose.yml`), so the
> root compose file is unused.

---

## 1. Backend structure — one Nest app, four domain modules

```
backend/src/
├── main.ts            bootstrap: CORS, ValidationPipe, exception filter, listen
├── app.module.ts      composition root
├── config/            env → typed config object + fail-fast validation
├── database/          TypeORM DataSource, migrations, seed
├── auth/              identity, OTP, JWT, refresh tokens, guards
├── employee/          employees, divisions, schedules, leave, status history
├── attendance/        check-in/out, photos, audited corrections
├── reporting/         read-model projections + dashboard/report endpoints
├── storage/           StorageProvider (memory | S3)
└── common/            guard metadata, decorators, filter, timezone utils
```

It is a **modular monolith**, not microservices: one process, one Postgres, one
HTTP server.

### Module dependency graph (`imports:` in each `*.module.ts`)

```
AuthModule ──────────────┐
EmployeeModule ──────────┼──> AttendanceModule ──> ReportingModule
   └─ imports AuthModule │        └─ imports EmployeeModule + StorageModule
                         └──> ReportingModule also imports EmployeeModule + AttendanceModule
```

- `AuthModule` exports `AuthService`, `JwtAuthGuard`, `RolesGuard`.
- `EmployeeModule` exports its services **and** `TypeOrmModule`, so importers get the
  employee repositories.
- `DatabaseModule` registers `TypeOrmModule.forRootAsync`; each domain module adds
  `TypeOrmModule.forFeature([...])` for its own entities.

### Request lifecycle

```
HTTP → ThrottlerGuard (120/min global, overridden per route)
     → JwtAuthGuard (APP_GUARD, global; skipped by @Public())
     → RolesGuard   (APP_GUARD, global; reads @Roles(...))
     → route-level interceptors (e.g. multer for photo upload)
     → ValidationPipe (whitelist + forbidNonWhitelisted, DTO classes)
     → Controller → Service → Repository / DataSource
     → AllExceptionsFilter (uniform {statusCode,message,error,path,timestamp})
```

Conventions:

- **Controllers are thin.** All business rules live in services; DTO classes own input
  validation; no `any`-shaped payloads.
- Pagination is normalised by `common/interfaces/pagination.interface.ts`
  (`paginate()` → `{ data, total, page, limit }`).
- Global config (`config/configuration.ts`) is one typed object grouped by concern:
  `db.*`, `jwt.*`, `otp.*`, `resend.*`, `storage.*`, `company.*`, `seed.*`.
  Validated at boot by `config/env.validation.ts`, which throws when production has a
  dev JWT secret, `OTP_DEV_RETURN=true`, S3 selected without bucket/keys, no
  `RESEND_API_KEY`, an invalid IANA timezone, or an OTP length other than 6.
- Services read `ConfigService.get('group.key')` — never `process.env` directly.

---

## 2. Database — PostgreSQL + TypeORM, migration-driven, with projections

`src/database/data-source.ts` is the single source of options. It:

- imports `../config/load-env.js` (dotenv: `.env`, then `../.env`);
- builds a **`postgres`** DataSource from the same config the Nest app uses;
- registers all 13 entities + 1 migration **explicitly** (no globs, so CLI/seed
  processes never scan `dist`).

### Schema (`migrations/1720000000000-InitialSchema.ts`)

Five enum types, fourteen tables:

| Area | Tables |
|---|---|
| Identity/auth | `identities` (email unique, role, ACTIVE/DISABLED), `otp_verifications`, `refresh_tokens` (unique `token_hash`) |
| Employee | `employees`, `divisions`, `employee_divisions` (M2M join), `employee_status_history`, `work_schedules`, `leave_requests` |
| Attendance | `attendance_records`, `attendance_corrections` (append-only audit, `jsonb` before/after) |
| Reporting (derived) | `reporting_employees`, `daily_employee_attendance`, `employee_attendance_summary` |

### Design points

- **`identities` is separate from `employees`.** An employee row is HR data; an
  identity row is login data (`email`, `role`, `status`). `identities.employee_id`
  FKs to `employees.id`. That is why terminating an employee keeps attendance but
  disables login.
- **Invariants live in the DB, not only in code:**
  - `UNIQUE (employee_id, attendance_date)` on `attendance_records`
  - unique `employee_number`, unique `identities.email`
  - a `CHECK` that a schedule is employee-XOR-division scoped
  - `CHECK (end_date >= start_date)` on leave
- **All instants are `timestamptz` (UTC)**; `attendance_date` is a plain `date`
  computed in the *schedule's* timezone. Business decisions go through
  `common/time/time.util.ts` (`localDate`, `localTime`, `evaluateLateness`,
  `hasCutoffPassed`, `weekdayOf`) using cached `Intl.DateTimeFormat` — never the
  process `TZ`.
- `employee_number_seq` is a Postgres sequence. `EmployeeService.nextEmployeeNumber`
  runs `SELECT nextval(...)` inside the create transaction; the seed resets it with
  `setval`.
- **Concurrency uses real transactions:**
  - check-in relies on the unique constraint; Postgres code `23505` → 409
  - check-out / correction take `pessimistic_write` row locks
  - OTP consume is a conditional `UPDATE ... WHERE consumed_at IS NULL` (one winner)
  - refresh rotation uses the same claim trick on `token_hash`
- Migrations run on boot (`DB_MIGRATIONS_RUN=true` default) or standalone via
  `npm run db:migrate`. `npm run db:seed` runs the idempotent seed: divisions, company
  schedule, master admin, optional demo staff with 90 days of deterministic history.
- `DB_SYNCHRONIZE` exists but defaults to off and should stay off — the schema is
  migration-owned.
- **Reporting tables are a read model.** `ReportingProjectionService` rebuilds them
  from `employees` + `work_schedules` + `attendance_records` + approved
  `leave_requests`; nothing in them is authoritative. `POST /reports/reconcile`
  (MASTER_ADMIN) rebuilds everything; boot auto-reconciles if the projection tables
  are empty.

---

## 3. Internal communication — two different mechanisms

### (a) Between modules: in-process events (`@nestjs/event-emitter`), not HTTP

Producers emit after the DB write succeeds:

| Event | Emitted from |
|---|---|
| `employee.created`, `employee.updated`, `employee.terminated` | `employee/services/employee.service.ts` |
| `employee.schedule.updated` (`{employeeId, divisionId, scheduleId}`) | `employee/services/schedule.service.ts` (create/update/remove) |
| `leave.updated` (`{employeeId, startDate, endDate, status}`) | `employee/services/leave.service.ts` |
| `attendance.checked-in`, `attendance.checked-out`, `attendance.corrected` | `attendance/services/attendance.service.ts` |

One consumer: `reporting/services/reporting-events.listener.ts`:

```
employee.created/updated/terminated → syncEmployee + refreshEmployeeYear(currentYear)
employee.schedule.updated           → refreshEmployeeYear for the employee,
                                      or for every employee in the division
attendance.*                        → refreshDay(date) + refreshEmployeeYear(year)
leave.updated                       → refreshEmployeeYear for each spanned year
```

Why this is safe:

- Handlers are `{ async: true }` — the HTTP response is not blocked, and a slow
  projection cannot fail the check-in.
- Every handler is wrapped in `safely()`: failures are logged, never propagated
  (fire-and-forget must not crash the process).
- All handlers are **idempotent upserts** (`delete range → insert`,
  `upsert(..., ['employeeId','attendanceDate'])`), so replays are harmless and
  `reconcile` is a durable fallback.
- `ReportingProjectionService.enqueue()` serialises all projection writes through a
  promise queue, so an event-driven refresh and a reconcile cannot interleave
  delete/insert pairs.

The other internal mechanism is **synchronous DI**: `EmployeeService` calls
`AuthService.provisionIdentity/setStatus/setRole` directly (create employee → create
identity; terminate → disable identity + revoke tokens), and `AttendanceService` calls
`EmployeeService` and `ScheduleService`. Dependency direction:
`attendance → employee → auth`, `reporting → attendance + employee`, with events
flowing back the other way.

### (b) Browser ⇄ backend: same-origin proxy, no CORS in practice

`frontend/app/api/[...path]/route.ts` is a runtime catch-all proxy:

- the browser calls `/api/attendance/check-in` on the Next origin;
- the route handler forwards to `API_URL` (default `http://127.0.0.1:3000`) plus the
  remaining path;
- hop-by-hop headers are stripped and the response body is streamed back;
- `API_URL` is read per request, not at build time, which is why `next.config.ts`
  deliberately has no rewrites.

`lib/api.ts` attaches the bearer token and, on `401`, performs a single shared refresh
(`refreshInFlight`) then retries once.

**Storage** is pluggable rather than a network hop: `StorageModule` binds the
`STORAGE_PROVIDER` token via a factory to either `MemoryStorageService` (default, bytes
in process memory) or `S3StorageService`. Uploads persist an opaque URL
`PUBLIC_API_URL/storage/objects/<base64url(key)>`; `StorageController` (`@Public()`)
streams memory objects or 302-redirects to a 15-minute presigned S3 URL, so the bucket
stays private.

---

## 4. Auth — passwordless OTP → JWT access + rotating refresh

No passwords anywhere. The subject of auth is an **Identity**, and the guards re-read
it from Postgres on every request.

```
POST /auth/request-otp {email}
  ├─ per-email + per-IP in-memory window (5 / 15 min) → 429
  ├─ route throttle: 5/min
  ├─ identity exists && ACTIVE? else generic 200 (no account enumeration)
  ├─ resend cooldown 60s since last issue, else generic 200
  ├─ OtpService.issue: invalidate outstanding, randomInt 6 digits,
  │    store HMAC-SHA256(OTP_SECRET, `${identityId}:${code}`), ttl 5 min
  ├─ EmailService.sendOtp (Resend if RESEND_API_KEY, else ConsoleEmailService)
  │    └─ send failure → invalidate the code → 503
  └─ 200 {message, expiresInSeconds, resendAfterSeconds, devCode?}
       devCode only when NODE_ENV≠production and OTP_DEV_RETURN=true

POST /auth/verify-otp {email, otp}
  ├─ identity ACTIVE? else 401 (same message for unknown email)
  ├─ latest unconsumed OTP: not found/expired/attempts≥5 → 401 or 429
  ├─ timingSafeEqual(HMAC); wrong → attempts++ (lock at 5)
  ├─ atomic claim UPDATE ... WHERE consumed_at IS NULL (single use)
  └─ 200 {user:{identityId, employeeId, email, role}, tokens:{...}}

POST /auth/refresh {refreshToken}   → rotate; reuse of a revoked token revokes the family
POST /auth/logout {refreshToken}    → revoke
GET  /auth/me                       → resolved principal
```

### Token model (`auth/services/token.service.ts`)

- **Access token**: HS256 JWT, 15 min (`JWT_ACCESS_TTL_SECONDS`), payload
  `{sub: identityId, employeeId, email, role}`.
- **Refresh token**: 48 random bytes → base64url, 30 days. Only its **SHA-256 hash**
  is stored in `refresh_tokens`; the plaintext exists in the client only.
- Rotation is claim-based:
  `UPDATE refresh_tokens SET revoked_at=now() WHERE id=? AND revoked_at IS NULL`.
  If `affected === 0` the token was already used → **revoke every token for that
  identity** (stolen-token blast-radius limit).

### Guards (`auth/guards/`)

Registered as `APP_GUARD` in `AuthModule`, so they are global and order matters
(`ThrottlerModule` is imported before `AuthModule`).

1. `JwtAuthGuard` — reads `Authorization: Bearer`, verifies the JWT, then calls
   `AuthService.resolvePrincipal(payload)`, which **hits the database**. Deliberate:
   disabling an identity or changing its role takes effect on the next request instead
   of waiting for the access token to expire. Routes opt out with `@Public()`
   (`request-otp`, `verify-otp`, `refresh`, `logout`, `/health`,
   `/storage/objects/:token`).
2. `RolesGuard` — reads `@Roles(...)` metadata (`getAllAndOverride` on handler then
   class) and compares with `request.user.role`; no metadata → allow. Roles:
   `EMPLOYEE`, `ADMIN`, `MASTER_ADMIN` (`common/enums/roles.enum.ts`). Class-level
   `@Roles(Role.ADMIN, Role.MASTER_ADMIN)` is used by `ReportingController`,
   `DivisionController` and `LeaveController`.
3. `@CurrentUser()` injects the principal `JwtAuthGuard` placed on `request.user`;
   services receive `user.employeeId` / `user.identityId` and never trust a
   body-supplied id.

### Session hygiene in `AuthService`

- Changing an identity's email or role, and disabling it, calls
  `revokeAllForIdentity` + `invalidateOutstanding` (a demoted admin cannot ride an old
  token).
- `provisionIdentity` is the only path that creates identities, and only
  `EmployeeService` calls it — there is **no public registration endpoint**. The
  `MASTER_ADMIN` identity exists only via `database/seed.ts` (`MASTER_ADMIN_EMAIL`),
  which is why "no public endpoint can grant a role" holds.
- Email is normalised (`trim().toLowerCase()`) in both the DTO `@Transform` and the
  service.

---

## 5. Known rough edges

1. Root `README.md`, root `docker-compose.yml`, root `.env.example` describe the old
   3-container MySQL layout. Ignore them; use `backend/`'s versions.
2. `frontend/.env.example` still says "next.config.ts rewrites it" — the proxy is
   `app/api/[...path]/route.ts` (correctly noted in `next.config.ts`).
3. `AppService.getHello()` still returns `"Hello World!"` on `GET /` — leftover
   scaffolding next to the real `/health`.
4. Auth rate limiting has two in-memory layers (`ThrottlerGuard` per process and
   `AuthService.requestLog`, a lazily pruned `Map` capped at 10k keys). Both reset on
   restart and are not shared across replicas — fine for one process, but a
   multi-instance deployment needs Redis.
5. Several controllers return entities directly (e.g. `GET /employees/me`) instead of
   response DTOs, coupling the API shape to entity columns.
6. `backend/.git` is a nested git directory inside the root repo — easy to confuse
   when staging/committing.

---

## 6. Layout cheat sheet

```
absences/
├── backend/                 NestJS API (TypeScript, TypeORM, PostgreSQL)
│   ├── src/                the eight folders described above
│   ├── test/app.e2e-spec.ts runs only when TEST_DATABASE_URL is set
│   ├── docker-compose.yml  db (postgres:16) + seed + api
│   └── README.md           the accurate backend documentation
├── frontend/                Next.js App Router app
│   ├── app/api/[...path]/   runtime proxy to the API
│   ├── lib/api.ts           fetch wrapper + refresh-on-401
│   └── lib/session.ts       localStorage session (token, refreshToken, role, expiry)
├── run.sh                   builds and runs db + API + web locally
└── one_shot_reference.md    this file
```
