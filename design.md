# Design notes

Why the system looks the way it does. `spec.md` is the brief; this document is
the reasoning behind the implementation that satisfies it, including the parts
that were deliberately traded away and the gaps that remain.

- [1. Scope and constraints](#1-scope-and-constraints)
- [2. Architecture](#2-architecture)
- [3. Contracts and documentation](#3-contracts-and-documentation)
- [4. Data model](#4-data-model)
- [5. Authentication](#5-authentication)
- [6. Authorization and roles](#6-authorization-and-roles)
- [7. Attendance semantics](#7-attendance-semantics)
- [8. Time and timezones](#8-time-and-timezones)
- [9. File uploads](#9-file-uploads)
- [10. Location capture](#10-location-capture)
- [11. Error handling and validation](#11-error-handling-and-validation)
- [12. Frontend design](#12-frontend-design)
- [13. Infrastructure](#13-infrastructure)
- [14. Trade-offs and known gaps](#14-trade-offs-and-known-gaps)
- [15. Testing](#15-testing)

---

## 1. Scope and constraints

The brief is small and fixed:

| Requirement | Where it lands |
| --- | --- |
| TypeScript everywhere | both packages, no JavaScript-only files |
| MySQL | `mysql:8.4`, one `absences` schema |
| Next.js + React | `frontend/`, App Router, React 19 |
| Email-OTP-only login | `auth` service, no passwords, no OAuth |
| Employee: date/time input, QR scan, photo upload | check-in panel (see [§14](#14-trade-offs-and-known-gaps) for the QR gap) |
| Admin: add employee, dashboard of who checked in, edit employee | `/admin/dashboard/**` |
| Two roles: employee and admin | `EMPLOYEE`, `ADMIN`, `MASTER_ADMIN` |

Design assumptions that the brief does not state but the system needs:

- The company works in **one timezone** (default `Asia/Jakarta`), with a fixed
  check-in cutoff (default `09:00`) and a fixed sweep time (default `15:00`).
- "Absent" is a decision made **by the server**, not by the browser: the UI may
  render what the API reports, never invent a status.
- Sign-in and check-in are **phone-first**; the admin dashboard is a
  **laptop screen**.
- Evidence (photo, position) is **optional for the employee but auditable for
  HR**: a missing photo must not block a check-in, and a rejected photo must
  never be accepted silently.

---

## 2. Architecture

### 2.1 One public port, four internal services

```
browser ──HTTP──> Next.js (3000) ──rewrite /api/*──> gateway (3003)
                                                        │ TCP
                        ┌───────────────┬───────────────┼───────────────┐
                     auth(4002)   employee(4003)  attendance(4004)  storage(4001)
                        │               │               │               │
                        └──────────── MySQL ────────────┴──────── RustFS (S3)
```

- **The gateway** (`backend/apps/backend`) is the only process that speaks HTTP
  to the outside world. It owns the auth guard, the role guard, request
  validation, error translation, CORS and the OpenAPI document.
- **auth / employee / attendance / storage** are `createMicroservice` TCP
  servers. They keep their domain logic, entities and DTOs; their HTTP
  controllers were moved to the gateway. A service never trusts its transport:
  it validates its own payloads again.
- **Why a gateway instead of direct service ports?** The brief wants one app.
  Publishing four ports means four CORS configurations, four failure modes and
  four places to forget an auth guard. A single public surface makes "is this
  authenticated and allowed?" one code path, and lets a route compose several
  services (e.g. `/employee/me` = `employee.get` + `attendance.day`).
- **Why TCP and not HTTP between services?** Nest's transport keeps payload and
  exception semantics (`RpcException` with a contract code) without inventing an
  internal REST dialect. It also makes the boundary explicit: nothing internal
  is reachable from a browser.
- **Why not Next.js route handlers as the backend?** The brief asks for MySQL,
  roles and a sweep job; a single long-lived Nest process with TypeORM entities
  and `@nestjs/schedule` fits that better than per-request handlers, and the
  frontend stays a pure client.
- **No CORS for the API in practice.** The browser only talks to its own origin;
  `next.config.ts` rewrites `/api/:path*` to `GATEWAY_URL`. The gateway still
  configures CORS from `FRONTEND_ORIGIN` so a direct client (Swagger, curl, a
  future mobile app) works. Rewrites are kept in array form so a real
  `app/api/**` route handler would still win if one is added later.

### 2.2 Request flow, check-in

1. `POST /api/attendance/proof-url` → gateway → `attendance.proof-url` →
   attendance asks storage for a presigned PUT under `proofs/YYYY/MM/<uuid>`.
2. Browser `PUT`s the JPEG straight to RustFS. The bytes never touch the API.
3. `POST /api/attendance/check-in { proofKey, location }` → gateway (employee
   id taken from the JWT claim, **never** from the body) → attendance validates
   the day, writes the row and signs a download URL for the response.
4. The gateway returns the composed `MeView` so the phone renders the result in
   one round trip.

---

## 3. Contracts and documentation

- `backend/shared/contracts/*.ts` is the source of truth for every RPC pattern
  and payload shape. Both sides import those types, so a changed field breaks
  the build on the side that forgot it.
- `shared/rpc/tcp-clients.ts` and `shared/rpc/rpc-call.ts` are the only places
  that know about transport: one helper to build a client, one to send with a
  timeout (`RPC_CALL_TIMEOUT_MS`) and map errors. Every module file is short
  because of it.
- **OpenAPI is generated from the same types**: gateway response models
  `implements` their contract counterpart (`EmployeeView`,
  `TodayReport`, …), and request bodies reuse the real DTOs. A change to a
  contract therefore cannot silently document a lie — it fails compilation.
  `/docs`, `/docs-json`, `/docs-yaml`; `OPENAPI_ENABLED=false` disables them.
- The public API keeps the `/auth`, `/admin`, `/employee`, `/attendance` prefixes
  from the original frontend, so routing churn stayed on the server side.

---

## 4. Data model

Four tables, each owned by one service:

| Table | Owner | Notes |
| --- | --- | --- |
| `employees` | employee | `employee_number`, `full_name`, `email`, `phone`, `joined_at`, `terminated_at`, `employment_status`, `avatar_key`, `division_id` (many-to-many via `employee_divisions`) |
| `divisions` | employee | `name` (unique), `description` |
| `identities` | auth | `employee_id`, `email` (unique), `role`, `status` |
| `otp_verifications` | auth | `identity_id`, `otp_hash`, `attempts`, `expires_at`, `consumed_at` |
| `attendance_records` | attendance | `employee_id`, `attendance_date`, `check_in_time`, `status`, `late`, `late_minutes`, `location`, `proof_key`, `required_check_in`, `timezone` |

Decisions worth calling out:

- **Identity is separate from employee.** The employee record is HR data; the
  identity is "who can sign in and with what role". Keeping them apart means an
  employee can be terminated without deleting history, and a role change never
  rewrites HR data. It also lets `auth` own the OTP table without the employee
  service ever seeing a credential.
- **`email` lives in both tables.** It is the login key (identity) and a
  contact field (employee). They are kept in sync by an identity RPC on
  employee create/update, which is why that call is request/response, not an
  event (an event-based sync made every employee write time out).
- **Uniqueness lives on the database, not only in DTOs**: unique indexes on
  `employees.employee_number`, `divisions.name`, `identities.email` and
  `identities.employee_id` (one login per person), and — the important one —
  `uq_attendance_employee_date` on `(employee_id, attendance_date)`. That single
  constraint makes the double check-in a 409 and makes the absent sweep safely
  re-runnable. (Column `unique: true` **and** a unique `@Index` must not be
  declared together: `synchronize` fails with `Duplicate key name`.)
- **One row per employee per day**, not an event log. The day report, the late
  calendar and the sweep all read the same row; there is nothing to aggregate.
- **Date vs instant.** `attendance_date` is a `DATE` in company-local terms;
  `check_in_time` is a `DATETIME(6)` instant (UTC). Mixing the two is what
  produces "checked in yesterday at 23:30" bugs; see [§8](#8-time-and-timezones).
- **Audit columns.** `required_check_in` and `timezone` are copied onto the row
  when it is evaluated. Changing `REQUIRED_CHECK_IN=09:00` to `08:30` tomorrow
  must not retroactively turn last month's on-time arrivals red.
- **Indexes** on `(employee_id, attendance_date)` and `(attendance_date)` cover
  the two read patterns: "this person's year" and "everyone today".
- `DB_SYNCHRONIZE=true` creates the schema on boot. Correct for a take-home,
  wrong for production — migrations are listed in [§14](#14-trade-offs-and-known-gaps).

---

## 5. Authentication

Passwordless by requirement, so the entire security budget goes into the OTP.

- **6-digit code, `randomInt`** (CSPRNG), valid **5 minutes**
  (`OTP_EXPIRY_SECONDS`), single identity per code.
- **Stored as an HMAC**, not plaintext and not a plain hash:
  `HMAC-SHA256(OTP_HASH_SECRET, identityId + code)`. Binding the identity into
  the digest means a leaked row cannot be replayed against another account, and
  a fast deterministic hash over a 6-digit space is useless without the secret.
- **Comparison is `timingSafeEqual`**, and the success path is a conditional
  `UPDATE … WHERE consumed_at IS NULL AND expires_at > now AND attempts < 5`.
  The row is consumed atomically, so two simultaneous verifies cannot both win
  and a code cannot be redeemed twice.
- **5 attempts per code**, counted server-side (`attempts` incremented on each
  mismatch). Brute-forcing 10⁶ codes with a 5-try cap is not viable.
- **No account enumeration.** `POST /auth/otp/request` always answers `202` with
  a generic message; an unknown or inactive address is ignored. The trade-off is
  honest: a wrong seed email looks exactly like "the mail never arrived", which
  is documented in the README troubleshooting section instead of being leaked in
  the response.
- **No codes in logs in production.** `EMAIL_PROVIDER=log` exists for local work
  but the auth service refuses to boot with it while `NODE_ENV=production`,
  because container logs are shipped and readable.
- **JWT access token, 15 minutes** (`JWT_ACCESS_TTL_SECONDS=900`), signed by
  `auth` and verified by the gateway with the same `JWT_ACCESS_SECRET`. The
  gateway holds no private key material beyond that shared secret and signs
  nothing itself. Claims: `sub` (identity), `employeeId`, `email`, `role`,
  `exp`.
- **No refresh token, no server-side session.** A stolen token is valid for at
  most 15 minutes, which is the whole mitigation; there is no revocation list.
  This is a deliberate scope cut, recorded in [§14](#14-trade-offs-and-known-gaps).
- **Client storage**: `localStorage` key `absences:signed-in:v3`. The key is
  versioned because the stored role strings changed with the gateway refactor —
  bumping the key drops an incompatible session instead of parsing an unknown
  role. Expiry is checked on read (`expiresAt`), and the token is dropped when
  it lapses. `⚠` `localStorage` is XSS-readable; with no server-side session and
  no cookie there is no CSRF surface either, which is the trade-off taken.

---

## 6. Authorization and roles

Three roles, two of them administrative:

| Capability | EMPLOYEE | ADMIN | MASTER_ADMIN |
| --- | --- | --- | --- |
| Check in, read own day/summary | ✅ | ✅ | ✅ |
| Read today's report, list/search employees, edit details, upload avatar | ❌ | ✅ | ✅ |
| Create an employee, assign a role | ❌ | ✅ (a `role` field is dropped, not rejected) | ✅ |
| Delete an employee, run the absent sweep | ❌ | ❌ | ✅ |

- **The role comes from the JWT**, never from a request body or a header. The
  frontend mirrors the same three strings (`lib/roles.ts`) so a stored role is
  only trusted when the API would accept it; anything else is downgraded to
  `EMPLOYEE` on read.
- **"Self or admin"** is enforced by the gateway: an `employeeId` query that is
  not the caller's claim is a `403` unless the role is `ADMIN`/`MASTER_ADMIN`.
  A missing `employeeId` never means "implicitly me" for admin routes.
- **Check-in identity comes from the claim.** `POST /attendance/check-in`
  ignores `employeeId` in the body; a token without a linked employee is
  rejected. Otherwise an employee could check in a colleague.
- **Role assignment is master-only**, and only on create. Editing a role through
  `PATCH /admin/employees/:id` is not honoured for a non-master caller.
- **Destructive operations are master-only** (`DELETE`, `mark-absent`), so a
  regular HR admin cannot end a person's record or rewrite a day's statuses.
- **Defence in depth**: the role guard runs in the gateway *and* the services
  take the caller's role/employee id from the payload they receive, so a
  compromised internal caller still cannot escalate by omission.
- **UI gating is not authorization.** `/admin/**` redirects non-admins on the
  client, but every admin route re-checks the role server-side. The mobile block
  (`proxy.ts`) is convenience, not security.

---

## 7. Attendance semantics

- **A day is a working day when it is neither a weekend nor an Indonesian
  national holiday.** Weekends are computed locally (no network); holidays come
  from the Kemendesa calendar, cached because the upstream has no SLA.
- **Statuses**: `ON_TIME`, `LATE`, `ABSENT`, `ON_LEAVE`, `NOT_CHECKED_IN`,
  `NOT_WORKING`. The vocabulary is deliberately bigger than the brief's
  "checked in / not": the UI needs to distinguish "you have not clocked in yet"
  from "the day closed without you" and "this is a weekend".
- **Late** = `check_in_time` after `REQUIRED_CHECK_IN` in company time;
  `late_minutes` is stored, not recomputed, so the number a report shows is the
  number that was decided.
- **Red for what is bad.** `LATE` and `ABSENT` map to the red tone, `ON_TIME` to
  green, `NOT_CHECKED_IN`/`ON_LEAVE`/`NOT_WORKING` to neutral. The mapping lives
  in `frontend/lib/attendance.ts` next to the status union, so adding a status
  forces a decision about its colour.
- **The sweep** (`ATTENDANCE_ABSENT_CRON`, default `0 15 * * *` company time)
  inserts `ABSENT` rows for active employees with no row for the day. It skips
  weekends, holidays and an **unknown** calendar, and it is idempotent thanks to
  `uq_attendance_employee_date` (`created: 0` on a rerun).
- **An unknown calendar is a 503, not a guess.** If the holiday API fails on a
  weekday, check-in and proof upload refuse and the sweep skips the day. A
  wrong red mark on a person's record is worse than a missing one.
- **Double check-in is a 409**, from the unique constraint rather than a
  read-then-write race.
- **Two writes per day, not two check-ins.** The row is created on check-in and
  only mutated by the sweep (to `ABSENT`) or by an admin correction; the API has
  no "check out", because the brief does not ask for one.

---

## 8. Time and timezones

- **Instants are stored in UTC; everything users see is evaluated in
  `COMPANY_TIMEZONE`** (and the containers run with `TZ` set to the same zone so
  MySQL, the seed and the cron agree).
- `shared/time/local-time.ts` converts an instant into `{ date: 'YYYY-MM-DD',
  minutesOfDay }` using `Intl.DateTimeFormat` with an explicit `timeZone`, and
  caches the formatter. Two details are handled there on purpose:
  - some ICU versions render local midnight as `24:00`, so the hour is `% 24`;
  - the local date is derived from the *instant*, not from
    `date.toISOString().slice(0, 10)`, which is a UTC date and drifts for
    `Asia/Jakarta` around midnight.
- **Day boundary = local midnight, cutoff = `REQUIRED_CHECK_IN`.** Both are
  company-wide constants for this system; per-division or per-employee schedules
  are out of scope.
- **Hydration safety on the client.** Anything that depends on "now" or the
  user's locale is behind `useSyncExternalStore` with a `null` server snapshot
  (`lib/clock.ts`), so prerendered markup and the first client render match and
  React does not warn or loop. The clock ticks whole seconds, which also keeps
  the snapshot stable between ticks.
- **The browser never decides a status.** It may show a countdown to the cutoff,
  but `ON_TIME`/`LATE` always come from the server, computed in company time.

---

## 9. File uploads

Two upload kinds share one mechanism: **avatars** (admin) and **proofs**
(employee check-in).

- **Direct-to-storage presigned PUT.** The API answers with
  `{ key, uploadUrl, expiresInSeconds, attendanceDate }`; the browser PUTs the
  bytes to RustFS. The API never proxies binary data, so a slow phone upload
  cannot occupy a request slot or hit a body limit.
- **Namespace-first keys**: `avatars/YYYY/MM/<uuid><ext>` and
  `proofs/YYYY/MM/<uuid><ext>`, validated by a single `STORAGE_KEY` regex. The
  extension is derived from the content type, not from the client's filename, so
  a `.html` uploaded as `image/jpeg` still lands as `.jpg`.
- **Allowlist**: `image/jpeg`, `image/png`, `image/webp`. SVG and PDF are
  excluded on purpose — they are executable/embeddable content served back from
  a storage origin.
- **Two TTLs**: upload 10 minutes, download 15 minutes
  (`MINIO_UPLOAD_URL_TTL`, `MINIO_DOWNLOAD_URL_TTL`). Short enough to be
  disposable, long enough for a phone on mobile data.
- **The signed host must be the host the browser fetches.** Compose uses
  `MINIO_ENDPOINT=rustfs` internally, but signs for `MINIO_PUBLIC_ENDPOINT`
  (`localhost:9000`); an unreachable service name inside a signature is a
  guaranteed 403 in the browser.
- **Browser-side downscaling** (`lib/photo.ts`): long edge 1080 px, JPEG quality
  0.82. A 12 MP phone photo becomes a few hundred KB before it leaves the
  device, which matters more than any server-side size check.
- **A server-side cap still exists** (`MINIO_MAX_UPLOAD_BYTES`, 10 MB) as the
  backstop for non-browser clients.
- **Ordering and orphans**: the key is reserved, then the bytes are uploaded,
  then check-in references the key. A browser that dies between steps 2 and 3
  leaves an unreferenced object. Accepted: objects are cheap, and the alternative
  (server-side upload + clean-up) is worse for the mobile case. A production
  system would add a lifecycle rule and verify the object exists on check-in.
- **Reads are presigned too**, generated when a view is serialized
  (`proofUrl`, `avatarUrl`), never stored. The key stays the durable truth; the
  URL is a short-lived projection.

---

## 10. Location capture

- **Best effort, never blocking.** `lib/geolocation.ts` resolves `null` on
  decline, timeout (8 s) or an unsupported browser; the check-in proceeds
  without it. Refusing location must not cost an employee their attendance
  record.
- **Integers, not floats.** The browser rounds to **micro-degrees**
  (degrees × 10⁶), and accuracy to metres. Six decimals is ~11 cm, far beyond
  what a phone GPS provides, and it avoids float formatting differences between
  the browser and MySQL.
- **Stored as a free-form string** (`location`, 255 chars) rather than a spatial
  column: the value may be a `lat,lng` pair or an address, and this app never
  queries by geometry.
- **The map link is a link, not an embed.** `lib/maps.ts` builds a Google Maps
  search URL. No API key, no third-party script on the page, and the reviewer can
  click through without the app leaking location data to an iframe.
- **Privacy**: position is visible to the employee and to admins, and it is part
  of the audit trail. It is not used to police boundaries (no geofencing), which
  is a product decision recorded here rather than an oversight.

---

## 11. Error handling and validation

- **Validation at both edges.** The gateway runs a global `ValidationPipe`
  (`whitelist`, `forbidNonWhitelisted`, `transform`); each service validates its
  own DTOs again. Cost: a duplicated DTO per hop. Benefit: an internal caller
  cannot bypass validation, and a `whitelist` on the public edge stops unknown
  fields from reaching the database.
- **`RpcException` → HTTP** through one filter (`shared/http/rpc-http.filter.ts`):

  | Contract code | HTTP |
  | --- | --- |
  | `INVALID_ARGUMENT` | 400 |
  | `FORBIDDEN` | 403 |
  | `NOT_FOUND` | 404 |
  | `CONFLICT` | 409 |
  | `PAYLOAD_TOO_LARGE` | 413 |
  | `UNAVAILABLE`, `STORAGE_UNAVAILABLE` | 503 |
  | anything else | 500, generic message |

- **Internal detail is not forwarded.** `toRpcException` only passes *known*
  contract codes; earlier it forwarded any `{ code, message }` and leaked
  `ECONNREFUSED host:port` to clients. A misconfigured internal host now reads
  as a 503.
- **RPC calls have a timeout** (`RPC_CALL_TIMEOUT_MS`) so a dead service fails
  fast instead of hanging a gateway request until the client gives up.
- **The frontend keeps the status.** `ApiError` carries `status`, and error
  messages are flattened from Nest's `string | string[]` shape, so a validation
  failure renders as one readable sentence instead of `[object Object]`.
- **Failures that are expected are not errors**: an unknown login address is a
  202, a repeated check-in is a 409 the UI explains, a declined location is a
  `null` field.

---

## 12. Frontend design

- **Two experiences, one app.**
  - `/employee` is the phone experience: today's status, a large check-in
    button, photo and position, the recorded result.
  - `/admin/dashboard/**` is the laptop experience: counters, searchable list,
    employee detail, late-date calendar, create form.
  - `/choose` is a real page, not a one-shot redirect hidden in the OTP
    screen. Signing in routes by role: an admin lands on it and must pick a
    workspace (dashboard or check-in), an employee never sees it and goes
    straight to `/employee`. `/choose` also self-defends — a non-admin that
    reaches it is replaced to `/employee`, so the rule holds in both
    directions. `/desktop-only` explains the mobile block.
  - The dashboard's attendance filter offers only the three states that call
    for action — `ON_TIME`, `LATE`, `NOT_CHECKED_IN`. `ABSENT`, `ON_LEAVE` and
    `NOT_WORKING` still exist in the shared enum and still render as statuses;
    they are simply not filter targets, because nobody triages “on leave”.
- **The admin block is server-side** (`proxy.ts`, matched on `/admin/**`):
  hand-held user agents are redirected to a notice page instead of rendering a
  table they cannot use. Detection uses `Sec-CH-UA-Mobile` /
  `Sec-CH-UA-Platform` first (they survive user-agent reduction) and falls back
  to a user-agent regex. `iPad` is included because iPadOS claims to be a Mac.
- **One breakpoint, `1024px`** (`DESKTOP_BREAKPOINT`), shared by the JS gate
  (`useIsDesktop`) and the Tailwind `lg:` classes, so CSS and behaviour cannot
  disagree. Until hydration the server assumes desktop for the admin gate
  (phones were already redirected) and mobile for the chooser (the safer
  default) — an explicit `assumeDesktopOnServer` argument rather than a
  different breakpoint per page.
- **`useSyncExternalStore` for every external source of truth**: session
  (localStorage), clock, breakpoint, divisions cache. One subscription per
  store, `null` on the server, no `useEffect`-then-`setState` flicker.
- **A tiny data layer** (`lib/*.ts`) with no state library: `api()` wraps fetch,
  attaches the bearer token from the session store and normalizes errors;
  domain modules (`employees.ts`, `attendance.ts`, `divisions.ts`) map server
  views to what a component needs. Server shapes are modelled once, at the
  boundary, instead of being re-typed inside components.
- **`MeView` composition**: the employee screen needs the person *and* today's
  record, so the gateway composes them and the UI has one loading state instead
  of two racing ones.
- **Design system**: Tailwind 4 with a small `components/ui` set (shadcn-style,
  local copies), grouped by domain elsewhere (`auth`, `attendance`, `employees`,
  `layout`). No component library import at runtime, no theme provider.
- **Accessibility and mobile basics**: buttons are real buttons, forms have
  labels, colour is never the only signal (status text accompanies the tone),
  touch targets sit on the phone-first layout, and the check-in button is
  reachable without zooming.

---

## 13. Infrastructure

- **`docker-compose.yml` is the whole stack**: `db`, `rustfs`, `rustfs_perms`
  (one-shot bucket/permission setup), `storage`, `auth`, `employee`,
  `attendance`, `gateway`, `frontend`.
- **Only what a human needs is published**: `3000` (frontend), `3003`
  (gateway), `3306` (MySQL, for inspection), `9000`/`9001` (RustFS S3 +
  console). The four domain services are internal-only, which is the network
  expression of [§2](#2-architecture).
- **`.env` is the single switchboard.** `.env.example` documents every variable
  with the reason it exists, and the compose defaults match it, so
  `cp .env.example .env` boots the stack. The one value that cannot have a
  useful default is `RESEND_API_KEY`.
- **RustFS instead of MinIO.** The client is still `minio-js` and the variables
  keep the `MINIO_` prefix, because RustFS speaks the S3 API. `MINIO_REGION`
  must match `RUSTFS_REGION` (`us-east-1`): the region is part of the SigV4
  scope, and a mismatch is a signature error, not a helpful message.
- **Healthchecks + `depends_on: service_healthy`** so services do not start
  against a MySQL that is still initializing; `restart: unless-stopped` keeps a
  crashed container from silently disappearing during a demo.
- **Named volumes** for MySQL, RustFS and the frontend's `node_modules`/`.next`,
  so a rebuild does not re-download the world and `docker compose down -v` is
  the documented reset.
- **Seeding is an upsert**, not an insert: keyed by employee number, email and
  division name, it converges on rerun and prints `+`, `~`, `=` per row. The
  first admin exists only because `seed.json` creates them — there is no
  bootstrap endpoint, because a public "create the first admin" route is a
  permanently open door. The optional `history` block additionally backfills
  deterministic weekday attendance for the current year through today (today
  included, never absent, never a future check-in) and only inserts days without
  a row, so re-seeding cannot erase real check-ins.
- **Frontend in compose runs `bun run dev`** for a fast demo loop; the
  `Dockerfile` builds a production image for anything real.

---

## 14. Trade-offs and known gaps

Decisions taken knowingly, and what a production pass would add.

| Area | Today | Why / what next |
| --- | --- | --- |
| **QR code** | The brief asks to "scan a QR code"; the app accepts a photo and a position instead. `react-qr-code` is a dependency, so a QR is only *renderable*, not scannable. | A QR needs a decided payload and a trusted issuer (a per-day code at the office? a rotating token?). Guessing that contract would have been worse than documenting the gap. Next: a `qr_token` on the day row + `BarcodeDetector`/`jsQR` scanning in the check-in panel. |
| **Scale of auth** | 15-minute JWT, no refresh, no revocation, no rate limiting on `/auth/otp/request`. | Fine for a small company; an internet-facing deployment needs rate limiting, refresh tokens and an audit trail of sign-ins. |
| **Schema** | `DB_SYNCHRONIZE=true`. | Take-home convenience. Production: TypeORM migrations, and one schema per service (or at least a documented ownership rule) instead of five services sharing `absences`. |
| **Division management** | Divisions are listed (`GET /admin/divisions`) but not created or deleted; the picker is empty on a fresh database. | The brief only asks to add employees; divisions come from the seed. Next: division CRUD + a master-only guard. |
| **Leave / absences proper** | `LeaveStatus` and `ON_LEAVE` exist, but there is no request/approve flow. | The brief calls the app an absence system while describing check-ins; the enum leaves the door open. Next: a `leave_requests` table and a status transition that feeds the day report. |
| **Attendance corrections** | No admin edit of a day; the sweep only inserts `ABSENT`. | Every correction is currently a database change. Next: `PATCH /attendance/:id` for `ADMIN`, always audited. |
| **Holiday source** | A public Kemendesa endpoint with an in-memory cache; outage → `UNKNOWN` → 503. | Right failure mode (no wrong red), but a fragile dependency. Next: a local holiday table seeded yearly, with the API as a convenience refresh. |
| **Single timezone / single schedule** | One `COMPANY_TIMEZONE`, one `REQUIRED_CHECK_IN`. | Matches the brief. Per-division or per-person schedules would need the cutoff resolved per employee at check-in time. |
| **Storage** | Orphaned proof objects are not garbage-collected; uploads are not re-verified on check-in. | Next: an S3 lifecycle rule and an existence check in `checkIn`. |
| **Sessions** | `localStorage`, so an XSS could exfiltrate a token. | A cookie-based session (httpOnly, SameSite) with CSRF protection is the usual answer; it also needs a server to keep the session, which is out of scope here. |
| **Observability** | Nest's `Logger`, no request ids, no metrics, no structured logs. | Next: request id propagation gateway → TCP, pino JSON logs, a `/metrics` endpoint. |
| **Rate limiting** | None, at any layer. | Next: `@nestjs/throttler` on the OTP endpoints first, then on check-in. |
| **Pagination** | Employees page (`page`/`limit`), divisions unpaginated, late dates return a whole year. | Fine at this size; divisions and late dates are the ones that grow. |
| **Tests** | Unit tests for the services (auth, employee, storage, jwt), e2e for employee; no test for the gateway's guard/filter combination or for the frontend. | The riskiest untested code is the composition (`/employee/me`, self-or-admin) — a gateway e2e with a stubbed TCP client would cover it. |

---

## 15. Testing

- **Unit (vitest)**: OTP hashing/attempt caps and JWT claims in `auth`,
  employee lookup/update rules, storage key construction, shared helpers.
  Attendance deliberately has no spec files, per its own `spec.txt`.
- **E2E**: the employee suite runs against a real MySQL (mysql2, no Postgres
  placeholders). It was the test that caught the Postgres-to-MySQL drift.
- **Typecheck as a test**: five Nest projects compile (`nest build`), the
  gateway project typechecks against the auth files it imports, and the
  frontend is `tsc --noEmit` + `eslint` + `next build`. The OpenAPI models
  `implements` the contracts, so a contract change is a compile error.
- **Manual flow** (documented in the README, worth repeating here): OTP login →
  `/auth/me` → `/choose` for an admin (`/employee` for everyone else) →
  dashboard counters → create an employee with an avatar → check in
  with a photo → the card shows time, location and photo → the calendar shows
  late dates → a weekend check-in is a 403 → a second check-in is a 409 →
  `mark-absent` twice yields `created: 0` the second time.
