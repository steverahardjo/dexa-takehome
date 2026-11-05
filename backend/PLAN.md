# Attendance API surface + root gateway — implementation plan

Derived from `apps/attendance/spec.txt` and the current (uncommitted) microservice refactor.

## Confirmed decisions

1. The root API module is the **existing `apps/backend` Nest project** (`sourceRoot: apps/backend/src`,
   currently has only `tsconfig.app.json`). It becomes the gateway on **HTTP :3003**.
2. The gateway is the **only public HTTP** entry. `auth`, `employee`, `attendance`, `storage` become
   internal TCP services; their HTTP controllers move to the gateway.
3. `POST /attendance/check-in` takes the employee from the **JWT `employeeId` claim**; a body
   `employeeId` is ignored, and the call is rejected when the identity has no linked employee.
4. Late dates stay **request/response** (`attendance.late-dates`). No emitter, no attendance data in
   the employee database.
5. No `*.spec.ts` for the attendance app (per spec). Existing specs stay green.

## Target topology

| Service   | Transport              | Port        | Owns                                   |
| --------- | ---------------------- | ----------- | -------------------------------------- |
| gateway   | HTTP (public)          | 3003        | auth guard, roles, route composition   |
| auth      | TCP only               | 4002        | identities, OTP, JWT signing           |
| employee  | TCP only               | 4003        | employees, divisions, avatars          |
| attendance| TCP only               | 4004        | attendance rows, holiday calendar, cron|
| storage   | TCP only               | 4001        | MinIO presigned URLs                   |
| MySQL 8.4 | —                      | 3306        | one `absences` schema                  |
| MinIO     | —                      | 9000        | `absences` bucket (`avatars/`, `proofs/`) |

## Gap analysis (what is actually missing today)

- **No HTTP surface for attendance.** The frontend cannot request a proof upload URL, check in, or
  read today's report. This is the blocker the spec calls out.
- **Storage cannot issue proof keys.** `STORAGE_NAMESPACES` only has `avatars`, and `STORAGE_KEY`
  rejects everything else. `AttendanceService.requestProofUpload` therefore gets an `avatars/…` key
  and never passes `fileName`, so the extension/type agreement check never runs.
- **No HTTP-auth primitives outside `apps/auth`.** The gateway needs `JwtLocalService`, `AuthGuard`
  and a role guard, but importing `AuthModule` would open a second auth data source.
- **RPC errors become HTTP 500.** `RpcException` payloads (`CONFLICT`, `FORBIDDEN`, …) need an
  HTTP-side filter mapping them to 4xx/503.
- **No "my attendance today" read.** Attendance can list a whole day (`today`) but not one employee's
  row, which `/employee/me` needs.
- **Frontend contract drift.** `next.config.ts` still rewrites to the old three-service layout, and
  `lib/employees.ts` expects `{ data: Employee[] }`, base64 `evidence`, and
  `/admin/employees/:id/late-days`.
- **`docker-compose.yml` is stale** (old `dist/services/*` paths, `seed`, `admin`, no attendance,
  `MINIO_BUCKET: avatars`).

---

## Phase 0 — shared groundwork

No behaviour change; everything else builds on it.

1. **Keep the JWT pieces where they are** (decided during implementation: they are not moved)
   - `apps/auth/services/jwt.service.ts`, `apps/auth/guards/jwt.guard.ts` and
     `apps/auth/decorators/current-user.decorator.ts` stay in the auth app. They are pure code with
     no data source, so the gateway imports them directly and registers its own `JwtModule` with
     `JWT_ACCESS_SECRET` (`apps/backend/src/auth/gateway-auth.module.ts`). `apps/backend/tsconfig.app.json`
     lists exactly those auth files so the composite project can see them.
   - Role checking is new and gateway-only: `apps/backend/src/auth/roles.decorator.ts` + `roles.guard.ts`.
   - `apps/auth/jwt.spec.ts` is unchanged and still passes.

2. **Role guard**: `shared/auth/roles.decorator.ts` (`@Roles(Role.ADMIN, Role.MASTER_ADMIN)`) and
   `shared/auth/roles.guard.ts` (`Reflector` + `request.user.role`).

3. **RPC → HTTP error filter**: `shared/http/rpc-http.filter.ts`
   `INVALID_ARGUMENT→400`, `FORBIDDEN→403`, `NOT_FOUND→404`, `CONFLICT→409`,
   `PAYLOAD_TOO_LARGE→413`, `UNAVAILABLE|STORAGE_UNAVAILABLE→503`, anything else → 500 with a generic
   message. Registered globally in the gateway's `main.ts`.

4. **Root MySQL config (spec: "more root and general")**
   `shared/database/database-options.ts` is already the single factory every module uses — keep it,
   and delete the dead `nest g library` scaffolding that competes with it: `libs/database`
   (`DatabaseService` is an empty stub) and the unimplemented `libs/shared` project. Remove their
   entries from `nest-cli.json`, `tsconfig.json` references, and the `@app/*` paths.
   Optional, only if you want zero dead code in this pass; skipping it changes nothing functional.

## Phase 1 — storage: proof namespace

1. `shared/contracts/storage.contracts.ts`
   - `STORAGE_NAMESPACES = { avatar: 'avatars', proof: 'proofs' }`
   - `STORAGE_KEY = /^(avatars|proofs)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|pdf)$/`
   - `GetUploadUrl` payload gains `namespace: StorageNamespace`.
2. `apps/storage/dto/get-upload-url.dto.ts`: `namespace` `@IsIn(Object.values(STORAGE_NAMESPACES))`.
3. `apps/storage/services/storage.service.ts`:
   `getUploadUrl(contentType, fileName, namespace)` builds `${namespace}/YYYY/MM/<uuid><ext>`.
4. `apps/storage/storage.controller.ts` passes the namespace through.
5. `apps/employee/services/employee.service.ts` sends `namespace: 'avatars'`.
6. Compose: `MINIO_BUCKET: absences` (one bucket, two namespaces).

## Phase 2 — attendance: close the contract gaps

1. `shared/contracts/attendance.contracts.ts`
   - add `dayOf: 'attendance.day'` — one employee, one date (`YYYY-MM-DD`, default today),
     returns `AttendanceView | null`.
   - the existing `today`, `lateDates`, `summary`, `markAbsent`, `proofUrl`, `checkIn` stay as-is.
2. `apps/attendance/dto/attendance.dto.ts`: add `DayQueryDto { employeeId: uuid; date?: YYYY-MM-DD }`.
3. `apps/attendance/service/attendance.service.ts`
   - `dayOf(employeeId, date?)` → `findOne` + `toView` (presigned `proofUrl`), `null` when absent.
   - `requestProofUpload`: pass `namespace: 'proofs'` and `dto.fileName` to storage, keep the
     weekend/holiday guard and `attendanceDate` echo, keep the `UNKNOWN` calendar → 503 behaviour.
4. `apps/attendance/controller/attendance.controller.ts`: `@MessagePattern(ATTENDANCE_PATTERNS.dayOf)`.
5. Nothing else changes in attendance: cron at `ATTENDANCE_ABSENT_CRON` (default `0 15 * * *`,
   `COMPANY_TIMEZONE`) already inserts `ABSENT` rows for active employees with no record, skips
   weekends/holidays/unknown calendar, and is already idempotent (`uq_attendance_employee_date`).
   No attendance spec files.

## Phase 3 — auth + employee: become TCP-only

1. **auth** — move the OTP flow out of `AuthController` into `AuthFlowService` (identity lookup,
   `ACTIVE` check, generic 202 message, `OtpService.verify`, `JwtLocalService.generateAccessToken`).
   - `shared/contracts/auth.contracts.ts`: `requestOtp`, `verifyOtp`, `me` patterns with request/response
     payload types (`OtpRequested`, `AccessTokenResponse`, `JwtPayload`).
   - `apps/auth/controller/auth-flow.controller.ts` (`@MessagePattern`) replaces
     `apps/auth/controller/auth.controller.ts`.
   - `apps/auth/main.ts` drops `NestFactory.create` + `listen`; it is `createMicroservice` + `listen`
     like storage/attendance. `AUTH_HTTP_PORT` disappears from `.env.example`.
   - Keep `identity.controller.ts` (event-based identity sync) untouched.
2. **employee** — delete `employee.http.controller.ts`; expose its two extra operations over TCP:
   - `EMPLOYEE_PATTERNS.avatarUploadUrl` → existing `EmployeeService.requestAvatarUpload`.
   - `EMPLOYEE_PATTERNS.me` → `get` by claim employee id (thin alias, optional; the gateway can call
     `employee.get`).
   - `apps/employee/main.ts` drops HTTP/CORS/listen; `createMicroservice` + `listen` like attendance.
     `EMPLOYEE_HTTP_PORT` disappears.
3. Update the module doc-comments that still describe "hybrid HTTP + TCP".

## Phase 4 — gateway (`apps/backend`)

Files: `apps/backend/src/main.ts`, `src/app.module.ts`, `src/modules/*`, `src/clients/*`.

1. `main.ts`: `NestFactory.create(AppModule)`, global `ValidationPipe`
   (`whitelist`, `forbidNonWhitelisted`, `transform`), global `RpcHttpExceptionFilter`, CORS from
   `FRONTEND_ORIGIN` (comma list, `*` → reflect), listen `GATEWAY_HTTP_PORT ?? 3003`.
2. `app.module.ts`: `ConfigModule.forRoot({ isGlobal: true })`, `ClientsModule.registerAsync` for
   `AUTH_CLIENT`, `EMPLOYEE_CLIENT`, `ATTENDANCE_CLIENT`, `STORAGE_CLIENT` (TCP host/port env pairs),
   `GatewayAuthModule`, and the four route modules.
3. Route modules → patterns (paths keep the frontend's current prefixes, so `next.config.ts` only
   needs its targets changed):

   | Route | Guard | Pattern(s) |
   | --- | --- | --- |
   | `POST /auth/otp/request` | public | `auth.otp.request` |
   | `POST /auth/otp/verify` | public | `auth.otp.verify` |
   | `GET /auth/me` | authenticated | token claims / `auth.me` |
   | `GET /admin/employees` | ADMIN, MASTER_ADMIN | `employee.list` |
   | `POST /admin/employees` | ADMIN, MASTER_ADMIN | `employee.create` |
   | `GET /admin/employees/:id` | ADMIN, MASTER_ADMIN | `employee.get` |
   | `PATCH /admin/employees/:id` | ADMIN, MASTER_ADMIN | `employee.update` |
   | `DELETE /admin/employees/:id` | MASTER_ADMIN | `employee.delete` |
   | `POST /admin/employees/avatar/upload-url` | ADMIN, MASTER_ADMIN | `employee.avatar-upload-url` |
   | `GET /admin/employees/:id/late-days?year` | ADMIN, MASTER_ADMIN | `attendance.late-dates` |
   | `GET /employee/me` | authenticated | `employee.get` + `attendance.day` (composed) |
   | `POST /attendance/proof-url` | authenticated | `attendance.proof-url` |
   | `POST /attendance/check-in` | authenticated | `attendance.check-in` (id from claim) |
   | `GET /attendance/today?date` | ADMIN, MASTER_ADMIN | `attendance.today` |
   | `GET /attendance/summary?employeeId&year` | self or ADMIN+ | `attendance.summary` |
   | `POST /attendance/mark-absent?date` | MASTER_ADMIN | `attendance.mark-absent` |

   - "self or ADMIN+" = `employeeId === claims.employeeId` unless the role is ADMIN/MASTER_ADMIN;
     otherwise 403. `employeeId` in a query but not in a token is a 403, never an implicit self.
   - `POST /attendance/check-in` returns the composed `/employee/me` view (employee + today's
     attendance) so the phone screen can render the result in one round trip.

4. `src/clients/*`: small typed wrappers around `ClientProxy.send` using `shared/rpc/rpc-call.ts`
   (`RPC_CALL_TIMEOUT_MS`, `toRpcException`) — no second copy of timeout/error logic.
5. `tsconfig.app.json` for `apps/backend` already exists and is referenced; add
   `package.json` scripts `start:gateway` / `start:gateway:dev` (and keep `start:prod` pointing at
   `dist/apps/backend/main`).

## Phase 5 — wiring: env, compose, frontend

1. `backend/.env.example`
   - drop `AUTH_HTTP_PORT`, `EMPLOYEE_HTTP_PORT`
   - add `GATEWAY_HTTP_PORT=3003`, `ATTENDANCE_TCP_HOST/PORT`, `STORAGE_TCP_HOST/PORT`,
     `FRONTEND_ORIGIN`, `MINIO_BUCKET=absences`, `MINIO_MAX_UPLOAD_BYTES` sized for phone photos.
2. `docker-compose.yml`: containers `db`, `aistor`, `storage`, `auth`, `employee`, `attendance`,
   `gateway`; correct `node dist/apps/<app>/main.js` commands; **only** `gateway: 3003` published;
   drop the stale `seed`/`admin` services; `MINIO_BUCKET: absences`; remove the obsolete
   `S3_*` env blocks; keep `depends_on: db healthy`.
3. `frontend/next.config.ts`: all four rewrites → `GATEWAY_URL` (default `http://localhost:3003`),
   `/api/admin|employee|attendance|auth/:path*` unchanged from the browser's point of view.
4. `frontend/lib/employees.ts`: align with the backend contracts — `EmployeeView` fields
   (`fullName`, `employeeNumber`, `divisionIds`, `employmentStatus`, avatar `avatarUrl`),
   `EmployeeListResult.items`, and `clockIn` posting `{ proofKey, location }` after the presigned PUT.
5. `frontend/lib/attendance.ts` / `components/attendance/checkin-panel.tsx`:
   - `POST /attendance/proof-url` → `fetch(uploadUrl, { method: 'PUT', body: file })` → `proofKey`
   - then `POST /attendance/check-in { proofKey, location }`
   - map `ABSENT` and `LATE` to the red tone (spec's "automatic red"), `ON_TIME` to green,
     `NOT_CHECKED_IN` to neutral.
6. `frontend/components/employees/employee-calendar.tsx`: point at
   `GET /admin/employees/:id/late-days?year=` returning `{ employeeId, year, lateCount, lateDates }`
   (drop the `LateDay[]` shape) — or keep the gateway returning `LateDay[]`; pick one and document it
   in `shared/contracts/attendance.contracts.ts`.

## Verification

1. `npm run build` (all nest projects) and `npx tsc -p apps/backend/tsconfig.app.json --noEmit`.
2. `npm test` — existing `auth/jwt.spec.ts`, `auth/identity.service.spec.ts`,
   `employee/employee.service.spec.ts`, `storage/storage.service.spec.ts`, `libs` spec (if kept) pass.
   `npm run test:e2e` for `employee.e2e-spec.ts` — update it if it still drives HTTP routes.
3. `docker compose up -d db aistor` → run each service → `docker compose up` full stack.
4. Manual flow:
   - `POST /auth/otp/request` → `POST /auth/otp/verify` → token
   - `POST /attendance/proof-url` on a weekday → PUT bytes to MinIO → `POST /attendance/check-in`
   - `GET /employee/me` shows the record; `GET /attendance/today` as ADMIN lists everyone
   - weekend: proof URL and check-in both 403; second check-in same day 409
   - `POST /attendance/mark-absent` as MASTER_ADMIN creates `ABSENT` rows; rerun → `created: 0`
   - `GET /admin/employees/:id/late-days?year=2026` matches `attendance_records.late = 1`

## Risks / notes

- Moving HTTP out of auth and employee is a breaking change for any other client; the frontend is the
  only one, and Phase 5 covers it.
- The gateway now signs nothing but verifies tokens: `JWT_ACCESS_SECRET` must match between auth and
  gateway; document it in `.env.example`.
- Holiday API failure on a weekday yields `UNKNOWN` → 503 on check-in/upload and a skipped cron sweep
  (deliberate: a wrong red is worse than a missing one).
- No rate limiting or refresh tokens today; out of scope for this pass.

---

## Status — implemented and verified

All phases done for the backend; the frontend is only rewired, not data-aligned (see below).

- Shared: `tcpClients()` / `tcpServer()` (`shared/rpc/tcp-clients.ts`), `sendRpc()`
  (`shared/rpc/rpc-call.ts`), `serviceDatabase()` (`shared/database/database-options.ts`),
  `RpcHttpFilter` (`shared/http/rpc-http.filter.ts`), `RPC_ERRORS.unauthorized|rateLimited`.
  Every `module.ts` is now ~35 lines: one `serviceDatabase(...)` and one `tcpClients(...)` call.
- Storage: `avatars` + `proofs` namespaces, namespace on `GetUploadUrl`.
- Attendance: `attendance.day` pattern, proof uploads go to `proofs/`.
- Auth: TCP-only (OTP request/verify patterns), identity sync is request/response
  (`@EventPattern` → `@MessagePattern`; employee already awaited the reply, so the old event handlers
  made every employee create/update time out).
- Employee: TCP-only, avatar upload URL is a pattern.
- Gateway: `apps/backend/src` on :3003 — health, auth, admin employees, `/employee/me`, attendance.
- Wiring: `.env.example`, `docker-compose.yml` (7 containers, gateway is the only published port),
  `next.config.ts` (single `/api/:path*` → gateway rewrite), `frontend/lib/employees.ts` check-in is a
  presigned PUT followed by `{ proofKey, location }`.
- `libs/database` and `libs/shared` scaffolding removed; `nest-cli.json` and `tsconfig.json` cleaned.
- `npm start` / `start:dev` now target the gateway; `start:gateway` is explicit.
- OpenAPI: the gateway serves Swagger UI on `/docs` and the raw documents on `/docs-json`
  and `/docs-yaml` (`apps/backend/src/docs/`). Response shapes come from models that
  `implements` their `shared/contracts` counterpart, so a contract change breaks the build
  instead of silently documenting a lie; request bodies reuse the real DTOs. `OPENAPI_ENABLED=false`
  turns it off. Documented that way there is one source of truth per shape, and 22 schemas are
  generated for 14 paths.

Verified locally: five projects typecheck, `nest build` for all five, `vitest` 63/63, e2e 6/6, `oxlint` clean,
`docker compose config` valid, and a live run of gateway + auth + employee + attendance against MySQL
with a fake storage service — OTP login, avatar upload URL, employee create (identity synced),
proof URL in `proofs/`, check-in, `/employee/me`, `409` on double check-in, `403` role/self checks,
absent sweep (`created: 1`) and the today report.

### Bugs fixed on the way

- `identity.service.ts` imported a non-existent `./events/identity.events.js` — the auth app did not
  compile.
- `@EventPattern` identity handlers vs. employee's awaited `send` — every employee write timed out.
- `Employee.employeeNumber` and `Division.name` declared `unique: true` on the column *and* a unique
  `@Index`, so `synchronize` failed on a fresh database with `Duplicate key name`.
- `toRpcException` forwarded *any* `{ code, message }`, leaking `ECONNREFUSED host:port` to clients.
  It now only passes known contract codes through.
- `employee.e2e-spec.ts` still spoke Postgres (`$1` placeholders, `const { rows } =`) against a
  mysql2 connection; the suite is now 6/6 green.

### Known follow-ups

- `frontend/lib/employees.ts` still models the pre-refactor employee (`name`, `role`, `division`,
  `contractExpiry`, `/admin/employees/:id/late-days` returning `LateDay[]`). The backend returns
  `EmployeeView` (`fullName`, `employeeNumber`, `divisionIds`) and `LateDatesResult`. The dashboard,
  employee cards and calendar need a pass against the current contracts.
- Reading another employee's day (`assertSelfOrAdmin`) has no route; admins use `today` and
  `late-days`. `GET /attendance/me` was dropped because Nest serializes a `null` result as an empty
  body — `/employee/me` returns the day inside `MeView` instead.
- No rate limiting, no refresh tokens, no seed/bootstrap for the very first admin identity.
