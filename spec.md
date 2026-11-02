# Spec — Aplikasi Absensi WFH Karyawan (Fullstack Skill Test)

> **Status:** Living specification. This document is the single source of truth for
> the build. It maps the take-home test requirements to concrete deliverables.

---

## 1. Context & Objective

Build a web application for **employee work-from-home (WFH) attendance** with two
kinds of users:

1. **Employee** — logs in, checks in (clock-in), and submits proof that they are
   working from home (captured date/time + photo).
2. **Admin (HRD)** — manages the employee master data (create, update) and
   monitors attendance that employees have submitted (view only).

The deliverable must demonstrate fullstack capability:

| Layer | Requirement (from test) |
|-------|-------------------------|
| Backend | TypeScript, **NestJS**, microservices concept |
| Database | MySQL, Oracle, MongoDB, SQL Server, PostgreSQL — **prefer Oracle/MySQL** |
| Frontend | **React** |
| API | CRUD via REST, connectable to any listed database |
| Use cases | WFH attendance (login + check-in + photo) and employee monitoring (master data + view-only attendance) |

---

## 2. Scope

### 2.1 In scope
- Employee authentication via email OTP.
- Employee check-in that captures **date & time** (server-authoritative) and a
  **photo** as evidence, plus optional geolocation.
- Admin employee **master data** management (create, read, update, delete).
- Admin **view-only** attendance monitoring.
- REST API backend with a clean, microservice-style module boundary.

### 2.2 Out of scope (documented, not blocked)
- Real email/SMS OTP delivery (a dev-returned OTP is used; provider hook is stubbed).
- Payroll, leave approval, shift scheduling, reporting exports.
- Multi-tenancy and production SSO.

---

## 3. Architecture

A **modular monolith** that is structured so each domain can be extracted into its
own service later (microservices-ready). Each backend module owns its controller,
service, entity, and DTOs and communicates only through explicit service interfaces.

```
┌──────────────────────────┐        ┌──────────────────────────────────────────┐
│  Frontend (React / Next) │  HTTP  │  Backend (NestJS)                         │
│  - Employee check-in     │ ─────► │  ┌─────────┐ ┌──────────┐ ┌────────────┐  │
│  - Admin dashboard       │  JSON  │  │  auth   │ │employees │ │ attendance │  │
│  - OTP login             │ ◄───── │  └────┬────┘ └────┬─────┘ └─────┬──────┘  │
└──────────────────────────┘        │       └───────────┴─────────────┘         │
                                    │              TypeORM (any DB)             │
                                    │    MySQL · Oracle · Postgres · SQL Server │
                                    └───────────────────────────────────────────┘
```

### 3.1 Microservices concept
- Each domain is a **self-contained NestJS module** with its own entity, DTO,
  service, and controller.
- Cross-domain access goes through exported service methods (or a message/event
  interface), not direct table access.
- The database is abstracted behind **TypeORM**, so swapping MySQL → Oracle →
  PostgreSQL → SQL Server (or Mongo via `mongodb` driver) is a config change, not a
  rewrite — satisfying the "connect to any database" objective.

---

## 4. Tech Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Backend framework | **NestJS** (TypeScript) | required |
| ORM | **TypeORM** | supports MySQL, Oracle, PostgreSQL, SQL Server, Mongo |
| Primary database | **MySQL 8** | default; Oracle is the documented alternative |
| Auth | OTP + signed token | email OTP, JWT/session token |
| Validation | `class-validator` / `class-transformer` | DTO contracts |
| Frontend | **React 19** (existing Next.js 16 app) | required |
| Container | Docker Compose (MySQL) | local dev |
| Package manager | npm (backend) / bun (frontend root) | |

---

## 5. Database Schema

> TypeORM entities; `camelCase` in app, mapped to `snake_case` columns.

### 5.1 `employees`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID / bigint | PK |
| name | varchar(120) | required |
| email | varchar(190) | unique, required (login identity) |
| phone | varchar(32) | |
| role | enum(`Employee`,`Manager`,`HR Admin`) | default `Employee` |
| division | varchar(120) | |
| address | text | |
| contract_expiry | date | |
| leave_balance | int | default 0 |
| work_start | time | default `09:00` |
| work_end | time | default `18:00` |
| avatar | text | optional URL |
| created_at / updated_at | timestamp | audit |

### 5.2 `attendances`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| employee_id | FK → employees.id | indexed |
| clock_in_at | timestamp | **server-captured** date & time |
| evidence | longtext | photo (data URL) |
| latitude / longitude | decimal(10,7) | nullable |
| accuracy | int | metres, nullable |
| created_at | timestamp | audit |

### 5.3 `otp_codes`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| email | varchar(190) | indexed |
| code_hash | varchar(255) | hashed OTP |
| expires_at | timestamp | TTL |
| consumed_at | timestamp | nullable |

### 5.4 `capture_sessions` (QR hand-off)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| employee_id | FK | |
| employee_name | varchar | denormalized for the QR |
| status | enum(`pending`,`submitted`) | |
| expires_at | timestamp | TTL 10 min |
| created_at | timestamp | |

> Capture submissions (photo payload) are held in the session row until the desktop
> confirms the check-in; the confirmed check-in is written to `attendances`.

---

## 6. API Contract

Base path: `/api`. All request/response bodies are JSON. Auth is a bearer token.

### 6.1 Auth (`auth` module)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/otp/request` | none | `{ email }` → creates OTP, returns `{ devCode? }` |
| POST | `/auth/otp/verify` | none | `{ email, code }` → `{ token, employee }` |

### 6.2 Employees (`employees` module) — admin only
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/employees` | admin | list employees |
| GET | `/employees/:id` | admin | get one |
| POST | `/employees` | admin | create |
| PATCH | `/employees/:id` | admin | update (partial) |
| DELETE | `/employees/:id` | admin | delete |

### 6.3 Attendance (`attendance` module)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/attendance/sessions` | employee | create a QR capture session → `{ session, lanHosts }` |
| GET | `/attendance/sessions/:id` | none* | poll session status |
| POST | `/attendance/sessions/:id` | none* | phone submits photo/timestamp/position |
| DELETE | `/attendance/sessions/:id` | employee | release session |
| POST | `/attendance/check-in` | employee | confirm check-in `{ employeeId, image, capturedAt, position }` |
| GET | `/attendance` | admin | view-only list (optionally `?date=YYYY-MM-DD`) |
| GET | `/attendance/today` | admin | today's on-time / late / not-started summary |

> `*` the QR session endpoints are intentionally reachable by the phone without a
> bearer token; the unguessable session id is the capability. Employee state-changing
> endpoints still require auth.

---

## 7. Auth Flow (OTP)

```
Employee                       Backend
   │  POST /auth/otp/request        │
   │  {email} ─────────────────────►│ create OTP, store hash, return devCode
   │  POST /auth/otp/verify         │
   │  {email, code} ───────────────►│ verify hash + TTL, return JWT + employee
   │  (subsequent calls)            │
   │  Authorization: Bearer <token> │
```

- OTP: 6 digits, hashed at rest, 5-minute TTL, single use.
- Token: signed, 8-hour expiry, carries `employeeId` + `role`.

---

## 8. Check-in Flow (Employee)

```
Desktop (React)                    Backend                    Phone
   │ POST /attendance/sessions         │                        │
   │ ────────────────────────────────► │  creates session (QR)  │
   │ render QR code ◄───────────────── │                        │
   │                                   │  phone scans QR         │
   │ (poll) GET /sessions/:id          │ ◄── POST /sessions/:id ─┤ photo + GPS
   │ detect submitted ◄─────────────── │                        │
   │ POST /attendance/check-in         │                        │
   │ ────────────────────────────────► │ writes attendance       │
   │ DELETE /sessions/:id ───────────► │ cleanup                 │
```

- **Date & time** are captured server-side at `POST /attendance/check-in` (the
  phone also sends `capturedAt` as evidence, but the authoritative value is the
  server clock).
- **Photo** is a JPEG/PNG/WebP data URL (≤ 4 MB) validated by the backend.
- Position is optional and validated (|lat| ≤ 90, |lng| ≤ 180).

---

## 9. Admin Monitoring (HRD)

- **Master data:** create / read / update / delete employees via the `employees`
  endpoints and the admin UI.
- **Attendance control (view only):** list all check-ins, filter by date, and see a
  per-employee on-time/late/not-started summary. No mutation endpoints exist for the
  admin on attendance.

---

## 10. Current State → Target State (Gap)

| Concern | Current (main) | Target |
|---------|----------------|--------|
| Backend | empty `backend/` placeholder | NestJS app with modules |
| Persistence | localStorage + in-memory `globalThis` | MySQL via TypeORM |
| Auth | localStorage email only | OTP + signed token |
| Employee CRUD | client-side store | `/api/employees` REST |
| Attendance | in-memory capture sessions | DB-backed sessions + check-in |
| Database | none | MySQL (docker-compose) |

The existing React/Next.js UI is reused as the frontend; its data layer is swapped
from localStorage to the backend API.

---

## 11. Implementation Plan

1. **Backend scaffold** — NestJS + TypeORM + config module (env-driven DB).
2. **Auth module** — OTP request/verify + JWT guard.
3. **Employees module** — entity + CRUD + validation.
4. **Attendance module** — capture session + check-in + admin read.
5. **Database** — MySQL via docker-compose + migrations/seed.
6. **Frontend integration** — API client replaces localStorage; OTP login wired.
7. **Acceptance** — end-to-end happy paths (employee + admin).

---

## 12. Acceptance Criteria

- [ ] Employee can request + verify OTP and receive a token.
- [ ] Employee check-in persists **date/time + photo** to the database.
- [ ] Admin can **create, read, update, delete** employees via the API.
- [ ] Admin can **view only** attendance (no admin mutation of attendance).
- [ ] The backend runs against **MySQL** out of the box, and is configurable to
      Oracle/PostgreSQL/SQL Server via TypeORM.
- [ ] Frontend calls the backend API (no localStorage as source of truth).
