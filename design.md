# Design

What this system is, and why it is shaped the way it is. This document is the
reasoning layer between the brief and the code: the goals first, then each
decision and the trade-off it accepts. It deliberately names the gaps that are
still open instead of pretending they do not exist.

- [1. The problem](#1-the-problem)
- [2. Design principles](#2-design-principles)
- [3. System at a glance](#3-system-at-a-glance)
- [4. The stack, and why](#4-the-stack-and-why)
- [5. Authentication](#5-authentication)
- [6. Authorization and roles](#6-authorization-and-roles)
- [7. Data model](#7-data-model)
- [8. Attendance and time](#8-attendance-and-time)
- [9. Photos, files and location](#9-photos-files-and-location)
- [10. The frontend experience](#10-the-frontend-experience)
- [11. Contracts, validation and errors](#11-contracts-validation-and-errors)
- [12. Infrastructure and operations](#12-infrastructure-and-operations)
- [13. Known gaps and next steps](#13-known-gaps-and-next-steps)
- [14. Testing](#14-testing)

---

## 1. The problem

An **employee work-absence system for WFH days**:

- an **employee** signs in, records that they are present (a "roll call"), and
  attaches proof — a photo and their location;
- an **admin** sees a master view of employees and today's attendance, and can
  add or edit people.

The brief fixes the shape of the solution:

| Requirement | Where it lands |
| --- | --- |
| TypeScript everywhere | one frontend + one backend repo, no JavaScript-only files |
| SQL-engine-agnostic ORM, MySQL preferred | TypeORM over `mysql:8.4` |
| Passwordless login | one-time password (OTP), no passwords, no OAuth |
| Two authorization levels | `EMPLOYEE` and `ADMIN` (split into `ADMIN` / `MASTER_ADMIN`, see [§6](#6-authorization-and-roles)) |
| Master view of employees + attendance | the admin dashboard |
| Employee can log in, check in, send proof | the check-in panel |
| Deployed with one command | `docker compose up -d --build` |

Assumptions the brief leaves open, which the system has to decide:

- **One company timezone** (default `Asia/Jakarta`), one check-in cutoff
  (default `09:00`), one absent sweep time (default `15:00`).
- **"Absent" is a server decision.** The client never invents a status; it
  renders what the API reports.
- **Two form factors.** Check-in and sign-in are phone-first; the admin
  dashboard is a laptop screen. The two experiences are one app, routed by role
  and by device.
- **Proof is optional to submit, but auditable to HR.** A missing photo or
  location must never block a check-in; a rejected photo must never be silently
  accepted.

---

## 2. Design principles

A handful of rules explain most of the decisions in this document. Everything
else is a consequence of one of these:

1. **One trusted public surface.** Only the gateway speaks HTTP to the outside.
   Auth, validation, CORS and error translation happen in exactly one place, so
   "is this request allowed?" has one answer instead of four.

2. **Each service owns its domain.** A service owns its entities, its logic and
   its slice of the schema. Nothing reaches into another service's tables, and
   no service trusts its transport — it validates its own payloads again.

3. **Shared contracts are the single source of truth.** Every RPC pattern and
   payload shape lives in `shared/contracts`; both caller and callee import the
   same types, so a changed field breaks the build on whichever side forgot it.

4. **Facts are decided server-side.** Statuses, roles, "today", "late",
   "absent" — the server computes them; the browser only projects them. This is
   why time, roles and attendance are all enforced in the backend.

5. **Phone-first check-in, desktop-first admin.** Touch targets, a single
   big button and a short flow on the employee side; density, tables and search
   on the admin side.

6. **Demo-safe by default.** `cp .env.example .env && docker compose up` boots
   a working stack with no mail provider and no external account. Convenience is
   explicit, and the places where that convenience trades away security are
   named rather than hidden.

---

## 3. System at a glance

```
browser ──HTTP──> Next.js (3000) ──rewrite /api/*──> gateway (3003)
                                                        │ TCP
                    ┌───────────────┬──────────────────┼───────────────┐
                 auth(4002)   employee(4003)    attendance(4004)   storage(4001)
                    │               │                  │               │
                    └───────────────┴────── MySQL ──────┴──────── RustFS (S3)
```

| Service | Reachable | Owns |
| --- | --- | --- |
| `frontend` | `localhost:3000` | Next.js app; rewrites `/api/*` to the gateway |
| `gateway` | `localhost:3003` | the only public HTTP port; auth/role guards, validation, OpenAPI, `/health` |
| `auth` | internal TCP | OTP request/verify, identity, JWT issuing |
| `employee` | internal TCP | employees, divisions, avatars |
| `attendance` | internal TCP | check-ins, today's report, the absent sweep |
| `storage` | internal TCP | presigned upload/download URLs for RustFS |
| `mysql` | `localhost:3306` | the database |
| `rustfs` | `localhost:9000` / `:9001` | S3-compatible object storage + console |

**Why a gateway instead of four public ports?** The brief wants one app.
Publishing four ports means four CORS configs, four failure modes and four
places to forget an auth guard. A single surface makes authentication and
authorization one code path, and lets one route compose several services — for
example `/employee/me` is `employee.get` plus `attendance.day`, returned as one
`MeView` so the phone renders its first screen with a single loading state.

**Why TCP between services rather than HTTP?** Nest's `createMicroservice`
transport carries payloads and exceptions (`RpcException` with a contract code)
without inventing an internal REST dialect. It also makes the boundary explicit:
nothing internal is reachable from a browser.

**Why not Next.js route handlers as the backend?** The brief needs MySQL, roles
and a scheduled sweep. A long-lived Nest process with TypeORM entities and
`@nestjs/schedule` fits that better than per-request handlers, and it keeps the
frontend a pure client.

**Why no CORS in practice?** The browser only talks to its own origin;
`next.config.ts` rewrites `/api/:path*` to `GATEWAY_URL`. The gateway still
configures CORS from `FRONTEND_ORIGIN` so a direct client (Swagger, curl, a
future mobile app) works, but the normal browser path never crosses an origin.

### A check-in, end to end

1. `POST /api/attendance/proof-url` → gateway → `attendance.proof-url` →
   attendance asks storage for a presigned PUT under `proofs/YYYY/MM/<uuid>`.
2. The browser PUTs the JPEG straight to RustFS. The bytes never pass through
   the API.
3. `POST /api/attendance/check-in { proofKey, location }` → gateway (employee
   id read from the JWT claim, **never** from the body) → attendance validates
   the day, writes the row and signs a download URL for the response.
4. The gateway returns the composed `MeView`, so the phone renders the result
   in one round trip.

The same direct-to-storage shape is reused for admin avatar uploads.

---

## 4. The stack, and why

| Concern | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript, everywhere | a single type system across the API boundary |
| Backend | NestJS monorepo (`apps/*`) | modules, DI and `@nestjs/schedule` fit the domain; one repo keeps shared contracts honest |
| ORM / DB | TypeORM + MySQL 8.4 | brief requires a portable ORM with MySQL preferred; entities are plain classes, no raw SQL in the services |
| Frontend | Next.js 16 (App Router, React 19) | server components for the shell, client components for the interactive panels |
| Styling / UI | Tailwind 4 + shadcn-style local components | a consistent design language without a runtime component library |
| Object storage | RustFS (S3-compatible) | MinIO's licence moved away from Apache-2.0; RustFS speaks the S3 API, so the client stays `minio-js` |
| Runtime | Docker Compose | the whole stack — MySQL, RustFS, four services, gateway, frontend — from one command |

The backend is deliberately a **modular monorepo**, not five repositories: a
single repo lets `shared/` hold the contracts, DTOs and enums that every app
imports, which is what makes the "contracts are the source of truth" principle
enforceable at compile time.

---

## 5. Authentication

Login is passwordless by requirement, so the entire security budget goes into
the one-time code.

### 5.1 The OTP, and why it is not emailed

The original plan used Resend to email the code. The current implementation
**does not send email**: `POST /auth/otp/request` issues the code and returns it
as `code` in the response, and the sign-in screen displays it with an autofill
button. This is a product decision, not a "debug mode" — there is no provider
flag that selects it.

- `EmailService` and `npm run email:smoke` remain in the repo, but nothing
  injects the service, and no running container reads `EMAIL_PROVIDER` /
  `RESEND_API_KEY` / `EMAIL_FROM`. They are kept as the path back to real
  delivery.
- **The cost is explicit and accepted for a demo.** The response carries an
  issued code only when the address belongs to an active identity, so the
  endpoint now reveals whether an account exists; and anyone who can reach the
  gateway can read their own code. Re-enable email delivery before exposing the
  stack anywhere real.

### 5.2 Code mechanics

- **6 digits, CSPRNG** (`randomInt`), valid **5 minutes**
  (`OTP_EXPIRY_SECONDS`), one code per identity at a time.
- **Stored as an HMAC, not plaintext**: `HMAC-SHA256(OTP_HASH_SECRET,
  identityId + code)`. Binding the identity into the digest means a leaked row
  cannot be replayed against another account, and a fast deterministic hash over
  a 6-digit space is useless without the secret.
- **Comparison is `timingSafeEqual`**, and the success path is a conditional
  `UPDATE … WHERE consumed_at IS NULL AND expires_at > now AND attempts < 5`.
  The row is consumed atomically, so two simultaneous verifies cannot both win
  and a code cannot be redeemed twice.
- **5 attempts per code**, counted server-side. Brute-forcing 10⁶ codes with a
  5-try cap is not viable.
- **Requesting a new code invalidates the previous one**, so a stolen-but-unused
  code stops working the moment a fresh one is issued.

### 5.3 The token

- **JWT access token, 15 minutes** (`JWT_ACCESS_TTL_SECONDS=900`), signed by
  `auth` and verified by the gateway with the same `JWT_ACCESS_SECRET`. Claims:
  `sub` (identity), `employeeId`, `email`, `role`, `exp`.
- **No refresh token, no server-side session.** A stolen token is valid for at
  most 15 minutes, which is the whole mitigation; there is no revocation list.
  This is a deliberate scope cut (see [§13](#13-known-gaps-and-next-steps)).
- **Client storage**: `localStorage` key `absences:signed-in:v3`, versioned so
  an incompatible stored role string is dropped instead of misread. Expiry is
  checked on read. `localStorage` is XSS-readable, but with no cookie and no
  server session there is no CSRF surface either — the trade-off taken.

---

## 6. Authorization and roles

The brief says two levels. The implementation splits the admin level in two so
that destructive actions are auditable separately:

| Capability | EMPLOYEE | ADMIN | MASTER_ADMIN |
| --- | --- | --- | --- |
| Check in, read own day/summary | ✅ | ✅ | ✅ |
| Read today's report, list/search employees, edit details, upload avatar | ❌ | ✅ | ✅ |
| Create an employee, assign a role | ❌ | ✅ | ✅ |
| Delete an employee, run the absent sweep | ❌ | ❌ | ✅ |

- **The role comes from the JWT**, never from a request body or header. The
  frontend mirrors the same strings (`lib/roles.ts`), and a stored role is only
  trusted when the API would accept it; anything else is downgraded to
  `EMPLOYEE` on read.
- **"Self or admin"** is enforced by the gateway: an `employeeId` that is not
  the caller's claim is a `403` unless the role is `ADMIN`/`MASTER_ADMIN`.
- **Check-in identity comes from the claim.** `POST /attendance/check-in`
  ignores `employeeId` in the body; a token without a linked employee is
  rejected, otherwise an employee could check in a colleague.
- **Defence in depth**: the role guard runs in the gateway, and each service
  also takes the caller's role/employee id from the payload it receives, so a
  compromised internal caller cannot escalate by omission.
- **UI gating is not authorization.** `/admin/**` redirects non-admins on the
  client, but every admin route re-checks the role server-side.

---

## 7. Data model

Each service owns its slice of one schema:

| Table | Owner | Notes |
| --- | --- | --- |
| `employees` | employee | `employee_number`, `full_name`, `email`, `phone`, `joined_at`, `terminated_at`, `employment_status`, `avatar_key`, division (many-to-many) |
| `divisions` | employee | `name` (unique), `description` |
| `identities` | auth | `employee_id`, `email` (unique), `role`, `status` |
| `otp_verifications` | auth | `identity_id`, `otp_hash`, `attempts`, `expires_at`, `consumed_at` |
| `attendance_records` | attendance | `employee_id`, `attendance_date`, `check_in_time`, `status`, `late`, `late_minutes`, `location`, `proof_key`, `required_check_in`, `timezone` |

The decisions worth calling out:

- **Identity is separate from employee.** The employee row is HR data; the
  identity is "who can sign in, with what role". Separating them means a person
  can be terminated without deleting history, a role change never rewrites HR
  data, and `auth` owns the OTP table without the employee service ever seeing a
  credential.
- **`email` lives in both tables** — it is the login key (identity) and a
  contact field (employee). They are kept in sync by an identity RPC on employee
  create/update, which is request/response rather than an event because an
  event-based sync made every employee write time out.
- **Uniqueness lives in the database**, not only in DTOs: unique indexes on
  `employees.employee_number`, `divisions.name`, `identities.email` and
  `identities.employee_id` (one login per person), and the load-bearing one —
  `uq_attendance_employee_date` on `(employee_id, attendance_date)`. That single
  constraint makes a double check-in a 409 and makes the absent sweep safely
  re-runnable.
- **One row per employee per day**, not an event log. The day report, the late
  calendar and the sweep all read the same row; there is nothing to aggregate.
- **Date vs instant.** `attendance_date` is a `DATE` in company-local terms;
  `check_in_time` is a `DATETIME(6)` instant (UTC). Mixing the two is what
  produces "checked in yesterday at 23:30" bugs — see [§8](#8-attendance-and-time).
- **Audit columns.** `required_check_in` and `timezone` are copied onto the row
  when it is evaluated, so changing the cutoff tomorrow does not retroactively
  recolour last month's arrivals.
- **Indexes** on `(employee_id, attendance_date)` and `(attendance_date)` cover
  the two read patterns: "this person's year" and "everyone today".
- `DB_SYNCHRONIZE=true` creates the schema on boot — correct for a take-home,
  wrong for production (migrations are in [§13](#13-known-gaps-and-next-steps)).

---

## 8. Attendance and time

- **A day is a working day when it is neither a weekend nor an Indonesian
  national holiday.** Weekends are computed locally; holidays come from the
  Kemendesa calendar, cached because the upstream has no SLA.
- **Statuses**: `ON_TIME`, `LATE`, `ABSENT`, `ON_LEAVE`, `NOT_CHECKED_IN`,
  `NOT_WORKING`. The vocabulary is deliberately wider than the brief's three
  ("on time / late / haven't"), because the UI must distinguish "you have not
  clocked in yet" from "the day closed without you" and "this is a weekend".
  The dashboard's *filter* offers only the three actionable states —
  `ON_TIME`, `LATE`, `NOT_CHECKED_IN` — because nobody triages "on leave".
- **Late** = `check_in_time` after `REQUIRED_CHECK_IN` in company time;
  `late_minutes` is stored, not recomputed, so a report always shows the number
  that was decided at check-in.
- **Colour carries meaning, but never alone.** `LATE`/`ABSENT` are red,
  `ON_TIME` is green, `NOT_CHECKED_IN`/`ON_LEAVE`/`NOT_WORKING` are neutral. The
  mapping lives next to the status union (`frontend/lib/attendance.ts`), so
  adding a status forces a decision about its colour, and every status is also
  rendered as text.
- **The absent sweep** (`ATTENDANCE_ABSENT_CRON`, default `0 15 * * *` company
  time) inserts `ABSENT` rows for active employees who have no row for the day.
  It skips weekends, holidays and an unknown calendar, and it is idempotent
  thanks to the unique constraint (`created: 0` on a rerun).
- **An unknown holiday calendar is a 503, not a guess.** If the holiday API
  fails on a weekday, check-in and proof upload refuse and the sweep skips the
  day. A wrong red mark on a person's record is worse than a missing one.
- **Double check-in is a 409**, from the unique constraint rather than a
  read-then-write race.
- **One write per day, not a clock in/out pair.** The row is created on check-in
  and only mutated by the sweep or an admin correction; there is no "check out"
  because the brief does not ask for one.

### Time and timezones

- **Instants are stored in UTC; everything users see is evaluated in
  `COMPANY_TIMEZONE`.** Containers run with `TZ` set to the same zone so MySQL,
  the seed and the cron agree.
- `shared/time/local-time.ts` converts an instant into `{ date, minutesOfDay }`
  with an explicit `Intl` `timeZone`, handling two subtleties on purpose: some
  ICU versions render local midnight as `24:00` (so the hour is `% 24`), and the
  local date is derived from the instant, not from `toISOString().slice(0,10)`,
  which is a UTC date and drifts around midnight.
- **Day boundary = local midnight, cutoff = `REQUIRED_CHECK_IN`.** Both are
  company-wide constants; per-division or per-person schedules are out of scope.
- **Hydration safety on the client**: anything depending on "now" or the user's
  locale is behind `useSyncExternalStore` with a `null` server snapshot, so
  prerendered markup and the first client render match.
- **The browser never decides a status.** It may show a countdown to the cutoff,
  but `ON_TIME`/`LATE` always come from the server.

---

## 9. Photos, files and location

Two upload kinds — **avatars** (admin) and **proofs** (check-in) — share one
mechanism.

- **Direct-to-storage presigned PUT.** The API answers with
  `{ key, uploadUrl, expiresInSeconds, attendanceDate }`; the browser PUTs the
  bytes to RustFS. The API never proxies binary data, so a slow phone upload
  cannot occupy a request slot or hit a body limit.
- **Namespace-first keys**: `avatars/YYYY/MM/<uuid><ext>` and
  `proofs/YYYY/MM/<uuid><ext>`, validated by one `STORAGE_KEY` regex. The
  extension comes from the content type, not the client's filename, so a `.html`
  uploaded as `image/jpeg` still lands as `.jpg`.
- **Allowlist**: `image/jpeg`, `image/png`, `image/webp`. SVG and PDF are
  excluded — they are executable/embeddable content served back from a storage
  origin.
- **Two TTLs**: upload 10 minutes, download 15 minutes. Short enough to be
  disposable, long enough for a phone on mobile data.
- **The signed host must be the host the browser fetches.** Compose talks to
  `MINIO_ENDPOINT=rustfs` internally but signs for `MINIO_PUBLIC_ENDPOINT`
  (`localhost:9000`); an unreachable service name inside a signature is a
  guaranteed 403 in the browser.
- **Browser-side downscaling** (`lib/photo.ts`): long edge 1080 px, JPEG 0.82. A
  12 MP photo becomes a few hundred KB before it leaves the device, which matters
  more than any server-side size check. A 10 MB server cap remains as the
  backstop for non-browser clients.
- **Orphans are accepted.** The key is reserved, then bytes uploaded, then
  check-in references it. A browser that dies between steps leaves an
  unreferenced object. Objects are cheap; the alternative (server-side upload +
  cleanup) is worse for mobile. A production system would add a lifecycle rule.
- **Reads are presigned too**, generated when a view is serialized (`proofUrl`,
  `avatarUrl`), never stored. The key is the durable truth; the URL is a
  short-lived projection.

### Location

- **Best effort, never blocking.** `lib/geolocation.ts` resolves `null` on
  decline, timeout (8 s) or an unsupported browser; check-in proceeds regardless.
  Refusing location must not cost an employee their attendance record.
- **Integers, not floats.** The browser rounds to micro-degrees (degrees × 10⁶)
  and accuracy to metres, avoiding float formatting differences.
- **Stored as a free-form string**, not a spatial column: the value may be a
  `lat,lng` pair or an address, and the app never queries by geometry.
- **The map link is a link, not an embed** — a Google Maps search URL with no
  API key, no third-party script, and the reviewer clicks through without the
  app leaking location to an iframe.
- **Privacy**: position is visible to the employee and to admins as part of the
  audit trail. It is not used to police boundaries (no geofencing) — a product
  decision, not an oversight.

---

## 10. The frontend experience

One app, two experiences, shaped by role and device.

- **`/employee` is the phone experience**: today's status, one large check-in
  button, photo and position, the recorded result.
- **`/admin/dashboard/**` is the laptop experience**: counters, a searchable
  employee list, employee detail, a late-date calendar, the create form.
- **`/choose` is a real page, not a hidden redirect.** Signing in routes by
  role: an admin lands on `/choose` and picks a workspace (dashboard or
  check-in); an employee never sees it and goes straight to `/employee`.
  `/choose` self-defends in both directions — a non-admin who reaches it is
  replaced to `/employee`.
- **The admin block is server-side** (`proxy.ts`, matched on `/admin/**`):
  hand-held user agents are redirected to a notice page instead of rendering a
  table they cannot use. Detection prefers `Sec-CH-UA-Mobile` /
  `Sec-CH-UA-Platform` (they survive user-agent reduction) and falls back to a
  user-agent regex; `iPad` is included because iPadOS claims to be a Mac.
- **One breakpoint, `1024px`**, shared by the JS gate (`useIsDesktop`) and the
  Tailwind `lg:` classes, so CSS and behaviour cannot disagree.
- **`useSyncExternalStore` for every external source of truth**: session
  (localStorage), clock, breakpoint, divisions cache. One subscription per
  store, `null` on the server, no `useEffect`-then-`setState` flicker.
- **A tiny data layer, no state library.** `lib/api.ts` wraps fetch, attaches
  the bearer token and normalizes errors; domain modules (`employees.ts`,
  `attendance.ts`, `divisions.ts`) map server views to what a component needs.
  Server shapes are modelled once, at the boundary.
- **`MeView` composition**: the employee screen needs the person *and* today's
  record, so the gateway composes them and the UI has one loading state instead
  of two racing ones.
- **Design system**: Tailwind 4 with a small `components/ui` set (shadcn-style,
  local copies), grouped by domain elsewhere. Colour coding separates the
  attendance states; buttons and actions live inside cards so the phone UI stays
  packed but each action stays isolated. No component library import at runtime,
  no theme provider.
- **Accessibility and mobile basics**: real buttons, labelled forms, colour is
  never the only signal, touch targets sit on the phone-first layout, and the
  check-in button is reachable without zooming.

---

## 11. Contracts, validation and errors

- **`backend/shared/contracts/*.ts` is the source of truth** for every RPC
  pattern and payload shape. Both sides import those types, so a changed field
  breaks the build on the side that forgot it.
- **`shared/rpc/` is the only place that knows about transport** — one helper to
  build a client, one to send with a timeout (`RPC_CALL_TIMEOUT_MS`) and map
  errors.
- **OpenAPI is generated from the same types**: gateway response models
  `implements` their contract counterpart, and request bodies reuse the real
  DTOs. A contract change that would document a lie fails compilation. Served at
  `/docs`, `/docs-json`, `/docs-yaml`; `OPENAPI_ENABLED=false` disables them.
- **Validation at both edges.** The gateway runs a global `ValidationPipe`
  (`whitelist`, `forbidNonWhitelisted`, `transform`); each service validates its
  own DTOs again. Cost: a duplicated DTO per hop. Benefit: an internal caller
  cannot bypass validation, and `whitelist` stops unknown fields at the public
  edge.
- **`RpcException` → HTTP** through one filter:

  | Contract code | HTTP |
  | --- | --- |
  | `INVALID_ARGUMENT` | 400 |
  | `FORBIDDEN` | 403 |
  | `NOT_FOUND` | 404 |
  | `CONFLICT` | 409 |
  | `PAYLOAD_TOO_LARGE` | 413 |
  | `UNAVAILABLE`, `STORAGE_UNAVAILABLE` | 503 |
  | anything else | 500, generic message |

- **Internal detail is not forwarded.** Only known contract codes pass through;
  a misconfigured internal host reads as a 503, never as
  `ECONNREFUSED host:port`.
- **RPC calls time out**, so a dead service fails fast instead of hanging a
  gateway request until the client gives up.
- **The frontend keeps the status.** `ApiError` carries `status`, and error
  messages are flattened from Nest's `string | string[]` shape, so a validation
  failure renders as one readable sentence.
- **Expected failures are not errors**: an unknown login address is a 202, a
  repeated check-in is a 409 the UI explains, a declined location is a `null`
  field.

---

## 12. Infrastructure and operations

`docker-compose.yml` is the whole stack: `db`, `rustfs`, a one-shot
`rustfs_perms`, then `storage`, `auth`, `employee`, `attendance`, `gateway`,
`frontend`.

- **Only what a human needs is published**: `3000` (frontend), `3003` (gateway),
  `3306` (MySQL, for inspection), `9000`/`9001` (RustFS S3 + console). The four
  domain services are internal-only — the network expression of the gateway
  principle.
- **`.env` is the single switchboard.** `.env.example` documents every variable
  with the reason it exists, grouped by concern:

  - **Database** — `DB_*`, `MYSQL_ROOT_PASSWORD`.
  - **Secrets** — `JWT_ACCESS_SECRET` (auth signs, gateway verifies),
    `OTP_HASH_SECRET` (HMACs the codes).
  - **Attendance rules** — `COMPANY_TIMEZONE`, `REQUIRED_CHECK_IN`,
    `ATTENDANCE_ABSENT_CRON`.
  - **Object storage** — `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` (shared by
    the server and the storage service), `RUSTFS_BUCKET`,
    `MINIO_PUBLIC_ENDPOINT` / `MINIO_PUBLIC_PORT` (what presigned URLs are
    signed over).
  - **Frontend** — `FRONTEND_ORIGIN` (CORS + RustFS upload origin),
    `GATEWAY_URL` (rewrite target), `NEXT_PUBLIC_DEMO_EMAIL`.
  - **Mail** — `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM`, present but
    **not read by any running service**; kept for `npm run email:smoke` and for
    re-enabling delivery later.

  Compose defaults match `.env.example`, so `cp .env.example .env` boots the
  stack with nothing else to configure.

- **RustFS instead of MinIO.** The client stays `minio-js` and the variables
  keep the `MINIO_` prefix because RustFS speaks the S3 API. `MINIO_REGION` must
  match `RUSTFS_REGION` (`us-east-1`): the region is part of the SigV4 scope, and
  a mismatch is a signature error, not a helpful message.
- **Healthchecks + `depends_on: service_healthy`** so services do not start
  against a MySQL still initializing; `restart: unless-stopped` keeps a crashed
  container from silently disappearing during a demo.
- **Named volumes** for MySQL, RustFS and the frontend's
  `node_modules`/`.next`, so a rebuild does not re-download the world and
  `docker compose down -v` is the documented reset.
- **Seeding is an upsert, not an insert**: keyed by employee number, email and
  division name, it converges on rerun. The first admin exists only because
  `seed.json` creates them — there is no bootstrap endpoint, because a public
  "create the first admin" route is a permanently open door. The optional
  `history` block backfills deterministic weekday attendance for the current
  year (today included, never absent, never a future check-in), and only inserts
  days without a row, so re-seeding cannot erase real check-ins.
- **Frontend in compose runs `next dev`** for a fast demo loop; the
  `Dockerfile` builds a production image for anything real.

---

## 13. Known gaps and next steps

Decisions taken knowingly, and what a production pass would add.

| Area | Today | Why / what next |
| --- | --- | --- |
| **OTP delivery** | Code returned in the response; no email; the endpoint reveals account existence | Deliberate for a demo. Re-enable Resend delivery and restore the "generic message" property before exposing it |
| **QR code** | The brief asks to "scan a QR code"; the app accepts a photo and position instead; `react-qr-code` can only render | A QR needs a decided payload and a trusted issuer. Next: a per-day `qr_token` + `BarcodeDetector`/`jsQR` in the check-in panel |
| **Auth scale** | 15-minute JWT, no refresh, no revocation, no rate limiting on OTP request | Next: rate limiting, refresh tokens, an audit trail of sign-ins |
| **Schema** | `DB_SYNCHRONIZE=true`; five services share one `absences` schema | Next: TypeORM migrations, one schema per service (or a documented ownership rule) |
| **Division management** | Divisions are listed but not created/deleted; the picker is empty on a fresh DB | Next: division CRUD + a master-only guard |
| **Leave / absences proper** | `ON_LEAVE` exists but there is no request/approve flow | The brief calls it an absence system while describing check-ins. Next: a `leave_requests` table feeding the day report |
| **Attendance corrections** | No admin edit of a day; the sweep only inserts `ABSENT` | Next: `PATCH /attendance/:id` for admins, always audited |
| **Holiday source** | Public Kemendesa endpoint, in-memory cache, outage → 503 | Right failure mode, fragile dependency. Next: a local holiday table seeded yearly |
| **Single schedule** | One `COMPANY_TIMEZONE`, one `REQUIRED_CHECK_IN` | Matches the brief; per-division/per-person schedules would resolve the cutoff per employee at check-in |
| **Storage** | Orphaned proof objects are not garbage-collected; uploads not re-verified on check-in | Next: an S3 lifecycle rule and an existence check |
| **Sessions** | `localStorage`, so XSS could exfiltrate a token | Next: httpOnly SameSite cookie session + CSRF protection (needs a server to keep the session) |
| **Observability** | Nest `Logger`, no request ids, no metrics, no structured logs | Next: request id propagation, pino JSON logs, a `/metrics` endpoint |
| **Rate limiting** | None, at any layer | Next: `@nestjs/throttler` on the OTP endpoints first, then check-in |
| **Pagination** | Employees paged; divisions and late dates unpaginated | Fine at this size; those two grow first |
| **Tests** | Service unit tests + employee e2e; no gateway guard/filter or frontend tests | Next: a gateway e2e with a stubbed TCP client covering `/employee/me` and self-or-admin |

---

## 14. Testing

- **Unit (vitest)**: OTP hashing/attempt caps and JWT claims in `auth`, employee
  lookup/update rules, storage key construction, shared helpers.
- **E2E**: the employee suite runs against a real MySQL (mysql2, no Postgres
  placeholders) — the test that caught the Postgres-to-MySQL drift.
- **Typecheck as a test**: five Nest projects compile, the gateway typechecks
  against the auth files it imports, the frontend is `tsc --noEmit` + `eslint` +
  `next build`, and the OpenAPI models `implements` the contracts — so a
  contract change is a compile error.
- **Manual flow** (also in the README): OTP login → `/auth/me` → `/choose` for
  an admin (`/employee` for everyone else) → dashboard counters → create an
  employee with an avatar → check in with a photo → the card shows time,
  location and photo → the calendar shows late dates → a weekend check-in is a
  403 → a second check-in is a 409 → `mark-absent` twice yields `created: 0` the
  second time.
