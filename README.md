# Absences

Employee work-absence system for WFH days: sign in with an emailed one-time
code, check in from the browser with an optional photo, and let HR admin manage
employees and watch today's attendance.

```
absences/
├── frontend/                 Next.js 16 app (App Router, React 19, Tailwind 4)
│   ├── app/                  pages and layouts
│   ├── components/           UI, grouped by domain (auth, attendance, employees, layout)
│   ├── hooks/                client hooks
│   └── lib/                  API client, session, clock and attendance helpers
├── backend/                  NestJS monorepo (TypeScript, TypeORM, MySQL)
│   ├── apps/
│   │   ├── backend/          the gateway: the only public HTTP port, owns auth
│   │   ├── auth/             OTP sign-in, JWT issuing
│   │   ├── employee/         employees, divisions, avatars
│   │   ├── attendance/       check-ins, day report, absent sweep
│   │   └── storage/          presigned upload/download URLs (RustFS / S3)
│   ├── shared/               enums, DTOs and RPC patterns shared by the apps
│   ├── scripts/seed.ts       database seeder (reads ./seed.json)
│   └── seed.json             the divisions and people the stack starts with
├── docker-compose.yml        MySQL, RustFS, the four services, gateway, frontend
├── .env.example              every variable the stack reads
└── spec.md                   the original take-home brief
```

The browser only ever talks to the Next.js origin — `next.config.ts` rewrites
`/api/*` to the gateway, and the gateway talks to the other services over TCP.
There is no CORS setup for the API.

| Service      | Where it is reachable        | What it does                                  |
| ------------ | ---------------------------- | --------------------------------------------- |
| `frontend`   | <http://localhost:3000>      | the app                                       |
| `gateway`    | <http://localhost:3003>      | `/api/*`, auth, OpenAPI at `/docs`, `/health` |
| `auth`       | internal TCP only            | OTP request/verify, JWT                       |
| `employee`   | internal TCP only            | employees, divisions, avatars                 |
| `attendance` | internal TCP only            | check-ins, reports, absent cron               |
| `storage`    | internal TCP only            | presigned URLs for RustFS                     |
| `mysql`      | `localhost:3306`             | the database                                  |
| `rustfs`     | `localhost:9000` / `:9001`   | S3 API (browser photo uploads) and console    |

Sign-in is passwordless, so **the stack needs an inbox you can read and a Resend
API key before it is usable**. Nothing else has to be configured.

---

## 1. Configure `.env`

```bash
cp .env.example .env
```

The defaults in `.env.example` match `docker-compose.yml`, so this file is the
one place you edit. Three values matter:

### 1.1 A Resend API key (required)

1. Sign up at <https://resend.com> (free tier is enough).
2. **API Keys → Create API key**, permission **Sending access**, copy the
   `re_...` value.
3. Put it in `.env`:

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_key_here
EMAIL_FROM="Absence Management <onboarding@resend.dev>"
```

Notes:

- Keep `EMAIL_PROVIDER=resend`. The containers run with `NODE_ENV=production`,
  and the auth service deliberately refuses to boot with the `log` provider
  there, because it would print codes into a container log.
- Keep the sender as `onboarding@resend.dev` **unless you verified your own
  domain in Resend** (Domains → Add domain → add the DNS records). A sender on
  an unverified domain is rejected by the API.
- With `onboarding@resend.dev`, Resend only delivers to the address that owns
  the API key. That is why the next step points the seed at your own inbox.

### 1.2 Your email in the seed

The first admin only exists because `backend/seed.json` creates them. Open it
and replace the first employee's address — and, if you like, the name:

```json
{
  "employeeNumber": "EMP-0001",
  "fullName": "Your Name",
  "email": "you@example.com",
  "phone": "+62 812 1000 0001",
  "joinedAt": "2024-01-02",
  "employmentStatus": "ACTIVE",
  "divisions": ["Engineering"],
  "identity": { "role": "MASTER_ADMIN", "status": "ACTIVE" }
}
```

Only the `email` (and optionally `fullName`) needs to change — keep the
`identity` as `MASTER_ADMIN`, or you will sign in without access to the admin
dashboard.

Use **the same address you signed up to Resend with**, otherwise the OTP email
is refused. Unknown addresses are ignored on purpose (no account enumeration),
so a wrong seed email looks exactly like "the mail never arrived".

The other 49 seeded people (`maya.kusuma@company.com`, `yoga.pratama@company.com`, …)
are ordinary employees across 12 divisions; you can leave them, change them, or
delete them. They also give the demo its attendance history: the seeder
backfills this year's check-ins, late arrivals and absences for active staff,
from January 1st through today.

### 1.3 Prefill the sign-in form (optional but handy)

```dotenv
NEXT_PUBLIC_DEMO_EMAIL=you@example.com
```

This is only the address prefilled on the sign-in form; it does not create
anything. Set it to the same address as step 1.2.

---

## 2. Run it

```bash
docker compose up -d --build
```

First run builds the frontend image and the backend image, so give it a few
minutes. Wait until the gateway answers:

```bash
curl localhost:3003/health
```

Then load the UI: <http://localhost:3000>.

`backend/seed.json` is baked into the backend image. If you edit it **after**
building, copy the new file into the running container and re-seed:

```bash
docker compose cp backend/seed.json storage:/app/seed.json
docker compose exec storage node dist/seed/scripts/seed.js
```

## 3. Seed the database

The schema is created by the services on boot (`DB_SYNCHRONIZE=true`), but the
rows come from the seeder — run it once, after the stack is healthy:

```bash
docker compose exec storage node dist/seed/scripts/seed.js
```

From `backend/` the equivalent is `npm run seed:docker`. The seeder needs both
the database and object storage, so it runs in the storage container, which is
the one compose service holding both sets of credentials.

The seed is an upsert
keyed by employee number, email and division name, so re-running it converges
instead of duplicating; it also prints what it created (`+`), updated (`~`) or
left alone (`=`). The same run backfills weekday attendance history for the
demo roster, from January 1st through today, uploads a generated sample avatar
for every employee without one, and downloads a handful of open-source photos
to use as check-in proofs; all three parts are additive, so real check-ins,
absent sweeps and uploaded pictures survive a re-seed (`backend/README.md`
documents the `avatars`, `history` and `proofs` blocks). The proof pictures are
fetched over the network at seed time, one sample per listed URL. A later
`node dist/seed/scripts/seed.js --backfill-proofs` also gives a picture to
check-ins that were written before this option existed.

You should see:

```
Plan: 12 division(s), 50 employee(s)
  history   2026-01-01 → 2026-11-06 (this year, today included): 22% late, 5% absent, ~10459 row(s)
  holidays  01-01, 08-17, 12-25
  avatars   512px initials PNGs for every employee without a picture
  proofs    15 sample photo(s) rotated over new check-ins, downloaded at seed time
+ division  Engineering
...
+ employee  EMP-0001  you@example.com  MASTER_ADMIN  [Engineering]
```

## 4. Sign in

1. Open <http://localhost:3000> — the sign-in form is prefilled with
   `NEXT_PUBLIC_DEMO_EMAIL`.
2. Press **Continue**. The auth service calls Resend and emails a 6-digit code
   that stays valid for 5 minutes.
3. Paste the code. An admin lands on `/choose` and picks a workspace (admin
   dashboard or employee check-in); an employee skips the picker and goes
   straight to `/employee`.

What to try as the admin (`/admin/dashboard`):

- today's counters (checked in / late / absent / not yet) from
  `GET /attendance/today`,
- the employee list, searchable and filterable by status,
- **Add employee** (`/admin/dashboard/employees/new`) — avatar upload goes
  straight to RustFS through a presigned URL,
- an employee detail page with their late days and yearly summary.

What to try as an employee (`/employee`, or add your own address as a second
employee and sign in with it):

- **Check in** with an optional photo and location,
- the check-in writes a row for the day; the report shows it immediately,
- the 15:00 company-time cron marks everyone still missing as `ABSENT`.

### If the email does not arrive

```bash
docker compose logs --tail=50 auth
```

- `RESEND_API_KEY is required` → the variable is empty or `.env` was not
  re-read; run `docker compose up -d` again after editing `.env`.
- `Resend delivery failed: ...` → read the message. The common ones are an
  invalid key, a `from` address on an unverified domain, and Resend's testing
  restriction: *"You can only send testing emails to your own email address"* —
  which means the seed email is not the Resend account owner's address.
- Nothing logged at all → the address is not in the database (unknown emails are
  silently ignored). Check with:

```bash
docker compose exec db mysql -uattendance -pattend1234 absences -e \
  "select e.email, i.role from employees e join identities i on i.employee_id = e.id order by e.employee_number;"
```

## 5. Reset

```bash
docker compose down -v      # stops everything and drops the MySQL and RustFS volumes
docker compose up -d --build
docker compose exec storage node dist/seed/scripts/seed.js
```

---

## API

The gateway (`:3003`) is the only backend port. It serves the routes below plus
Swagger at `/docs` and the raw document at `/docs-json` (`OPENAPI_ENABLED=true`).

Auth:

| Method | Path                | Notes                                        |
| ------ | ------------------- | -------------------------------------------- |
| `POST` | `/auth/otp/request` | Mail a code; always 202, unknown addresses are ignored |
| `POST` | `/auth/otp/verify`  | Code in, bearer token out                    |
| `GET`  | `/auth/me`          | Who the token belongs to                     |

Self service (any signed-in employee):

| Method | Path               | Notes                                        |
| ------ | ------------------ | -------------------------------------------- |
| `GET`  | `/employee/me`     | The signed-in employee as the page renders them |
| `POST` | `/attendance/proof-url` | Presigned upload for the check-in photo |
| `POST` | `/attendance/check-in`  | Clock in; photo and location optional    |
| `GET`  | `/attendance/summary`   | Yearly counters; yourself, or anyone as an admin |

Admin (`ADMIN` or `MASTER_ADMIN` token):

| Method   | Path                              | Notes                          |
| -------- | --------------------------------- | ------------------------------ |
| `GET`    | `/admin/divisions`                | Unpaginated list of divisions  |
| `GET`    | `/admin/employees`                | Paged and searchable; active employees only (`?status=` for the others) |
| `POST`   | `/admin/employees`                | Add an employee (and their identity) |
| `POST`   | `/admin/employees/avatar/upload-url` | Presigned avatar upload     |
| `GET`    | `/admin/employees/:id`            | One employee                   |
| `PATCH`  | `/admin/employees/:id`            | Change their details           |
| `DELETE` | `/admin/employees/:id`            | Remove them                    |
| `GET`    | `/admin/employees/:id/late-days`  | Their late days                |
| `GET`    | `/attendance/today`               | Today's counters, one row per person |
| `POST`   | `/attendance/mark-absent`         | Run the absent sweep now (`MASTER_ADMIN`) |

## Working on the code without Docker

Backend — one process serves the gateway plus all four domains on port 3003,
talking to the compose database:

```bash
docker compose up -d db
cd backend
cp .env.example .env            # DB_* defaults to 127.0.0.1:3306
npm install
npm run start:dev               # http://localhost:3003
```

The per-domain scripts (`npm run start:auth:dev`, `start:employee:dev`,
`start:attendance:dev`, `start:storage:dev`) run a single service on its own
port instead, and `npm run build:all` compiles every `dist/apps/<app>/main.js`.

Frontend:

```bash
cd frontend
cp .env.example .env.local      # GATEWAY_URL=http://localhost:3003
npm install
npm run dev                     # http://localhost:3000
```

## Checks

```bash
cd backend  && npm run lint && npm test        # oxlint + vitest
cd frontend && npx eslint . && npm run build   # eslint + next build
```

## Notes

- Dates and times use one timezone everywhere — `TZ`, default `Asia/Jakarta` —
  for the containers, MySQL, the seed and the attendance rules
  (`REQUIRED_CHECK_IN=09:00`, `ATTENDANCE_ABSENT_CRON=0 15 * * *`).
- `DB_SYNCHRONIZE=true` creates the tables on boot, which is fine for this
  take-home. A real deployment would use migrations.
- The RustFS credentials in `.env.example` are dev defaults that already match
  `docker-compose.yml`; rotate them before exposing the stack. Presigned URLs
  are signed for `MINIO_PUBLIC_ENDPOINT:MINIO_PUBLIC_PORT`, so point those at
  the address the browser can actually reach.
- Port 3306 and 9000/9001 are published; stop a local MySQL first if it is
  already bound to 3306.
- `spec.md` is the brief this was built against.
