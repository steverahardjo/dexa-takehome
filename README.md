# Absences

Employee work-absence system for WFH days: sign in with an emailed one-time code,
check in from the browser with an optional photo, and let HR Admin manage
employees and watch today's attendance.

```
absences/
├── frontend/            Next.js 16 app (App Router, React 19, Tailwind 4)
│   ├── app/             pages and layouts
│   ├── components/      UI, grouped by domain (auth, attendance, employees, layout)
│   ├── hooks/           client hooks
│   └── lib/             API client, session, clock and attendance helpers
├── backend/             NestJS API (TypeScript, TypeORM, MySQL)
│   └── src/
│       ├── auth/        OTP sign-in, JWT issuing, guards
│       ├── employee/    the signed-in employee, check-ins, QR capture sessions
│       ├── admin/       employee master data and the attendance summary
│       └── services/    one entrypoint per container: auth, employee, admin
├── docker-compose.yml   MySQL plus the three API containers
└── spec.md              the original take-home brief
```

## Run it

The backend is three containers behind one MySQL: `auth` (sign-in), `employee`
(self service and check-ins) and `admin` (HRD). The browser only ever talks to
the Next.js origin — `next.config.ts` rewrites `/api/*` to the right container, so
there is no CORS setup.

```bash
# 1. API + database
cp .env.example .env            # or keep the defaults in docker-compose.yml
docker compose up -d --build

# 2. Frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev                     # http://localhost:3000
```

Check the services are up:

```bash
curl localhost:3001/health      # auth
curl localhost:3002/health      # employee
curl localhost:3003/health      # admin
```

### Demo data and sign-in

With `SEED_DEMO=true` the first boot inserts three people. Any of the seeded
addresses can sign in — the code is emailed when SMTP is configured, and
returned in the response as `devCode` when it is not (`OTP_DEV_RETURN=true`):

| Email               | Role      |
| ------------------- | --------- |
| `steve.jevon.r@gmail.com`  | HR Admin  |
| `jane@company.com`  | Employee  |
| `michael@company.com` | Manager |

`frontend/.env.local` prefills the first one on the sign-in form
(`NEXT_PUBLIC_DEMO_EMAIL`).

### Working on the backend without Docker

One process serves all three domains on port 4000:

```bash
cd backend
cp .env.example .env            # points at 127.0.0.1:3306
npm install
docker compose up -d db         # just the database
npm run start:dev
```

Point the frontend at it by setting `AUTH_SERVICE_URL`, `EMPLOYEE_SERVICE_URL`
and `ADMIN_SERVICE_URL` to `http://localhost:4000` in `frontend/.env.local`.
The per-container scripts (`npm run dev:auth`, `dev:employee`, `dev:admin`) run a
single domain on its own port instead.

## API

Sign-in (`auth`, 3001):

| Method | Path                | Notes                                   |
| ------ | ------------------- | --------------------------------------- |
| `POST` | `/auth/otp`         | Mail a code; rate limited per address   |
| `POST` | `/auth/otp/verify`  | Code in, bearer token out               |
| `GET`  | `/auth/me`          | Who the token belongs to                |

Self service (`employee`, 3002):

| Method   | Path                          | Notes                                    |
| -------- | ----------------------------- | ---------------------------------------- |
| `GET`    | `/employee/me`                | The signed-in employee, as the page renders them |
| `GET`    | `/employee/me/attendance`     | Own check-ins, newest first              |
| `POST`   | `/attendance/check-in`        | Clock in; photo and position optional    |
| `POST`   | `/attendance/sessions`        | Start a QR session (desktop)             |
| `GET`    | `/attendance/sessions/:id`    | Session status (desktop polls, phone reads) |
| `POST`   | `/attendance/sessions/:id`    | Phone submits photo, time and position   |
| `POST`   | `/attendance/sessions/:id/confirm` | Desktop confirms; this writes the check-in |
| `DELETE` | `/attendance/sessions/:id`    | Release a finished session               |

HRD (`admin`, 3003) — every route needs an `HR Admin` token:

| Method   | Path                        | Notes                              |
| -------- | --------------------------- | ---------------------------------- |
| `GET`    | `/admin/employees`          | Paged and searchable               |
| `POST`   | `/admin/employees`          | Add an employee                    |
| `GET`    | `/admin/employees/:id`      | One employee                       |
| `PATCH`  | `/admin/employees/:id`      | Change their details               |
| `DELETE` | `/admin/employees/:id`      | Remove them                        |
| `GET`    | `/admin/attendance?date=`   | Who checked in on a day            |
| `GET`    | `/admin/attendance/today`   | Counts for the dashboard           |

The phone's two calls (`GET`/`POST /attendance/sessions/:id`) need no token: the
session id is the secret, it expires after `CAPTURE_TTL_SECONDS`, and a session
can be submitted once.

## Checks

```bash
cd backend  && npm run lint && npm test        # oxlint + vitest
cd frontend && npx eslint . && npm run build   # eslint + next build
```

## Notes

- Dates and times use one timezone everywhere — `TZ`, default `Asia/Jakarta` —
  for the containers, MySQL and the seed.
- `DB_SYNCHRONIZE=true` creates the tables on boot, which is fine for this
  take-home. A real deployment would use migrations. Because division is an
  enum column, run `backend/scripts/normalize-divisions.sql` once against an
  older database before the first boot (see `backend/README.md`).
- `spec.md` is the brief this was built against.
