# Absences API

NestJS + TypeORM + MySQL. One image, three entrypoints — each container imports
only the domain it serves, so a missing module fails in one container instead of
everywhere.

| Container  | Port | Entrypoint                     | Domain                                    |
| ---------- | ---- | ------------------------------ | ----------------------------------------- |
| `auth`     | 3001 | `dist/services/auth/main.js`    | OTP sign-in, token issuing, `/auth/me`    |
| `employee` | 3002 | `dist/services/employee/main.js`| Own profile, check-ins, QR capture flow   |
| `admin`    | 3003 | `dist/services/admin/main.js`   | Employee master data, attendance summary  |

`src/main.ts` boots every domain in one process on port 4000 for local
development; `src/bootstrap.ts` holds the shared validation, CORS and shutdown
setup all four entrypoints use.

```
src/
├── auth/         OTP (entity, service, rate limits), JWT guards, mailer
├── employee/     employee + attendance + capture-session entities, DTOs, services
├── admin/        HRD-facing service on top of the same entities
├── database/     TypeORM module and the demo seed
├── health/       /health for the compose healthchecks
├── config/       env reads and the shared clock helpers
└── services/     one AppModule + main per container
```

## Run

```bash
npm install
cp .env.example .env      # MySQL on 127.0.0.1:3306
npm run start:dev         # all domains on :4000
```

Or per domain, which is what the containers do:

```bash
npm run dev:auth          # :3001
npm run dev:employee      # :3002
npm run dev:admin         # :3003
```

## Seed

`src/database/seed-data.json` holds the demo employees and their check-ins.
Attendance days are stored as `daysAgo`, so the file keeps producing check-ins
on "today" instead of going stale:

```bash
npm run seed                            # src/database/seed-data.json
SEED_FILE=./other.json npm run seed     # any file with the same shape
```

Seeding matches employees by email and check-ins by `(employee, work date)`, so
re-running it only inserts what is missing. `SeedService` separately seeds three
demo people when the app boots; `SEED_DEMO=false` turns that off.

## Checks

```bash
npm run lint              # oxlint, type aware
npm test                  # vitest
npm run build             # nest build → dist/
```

## Conventions

- Every response goes through a presenter or a `*View` type, so entities never
  leak out of the domain that owns them.
- Validation is global (`whitelist` + `forbidNonWhitelisted`), so an unexpected
  field is a 400 rather than a silently ignored value.
- Access is decided by guards: `JwtAuthGuard` for a token, `RolesGuard` +
  `@Roles('HR Admin')` for HRD-only routes.
- Everything date-related uses the `TZ` the containers share; `src/config/clock.ts`
  is the only place that builds day strings or compares against work hours.
