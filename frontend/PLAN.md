# Frontend → gateway alignment plan

The frontend tree was missing from the working copy and had to be restored
(`git restore frontend/`). It was committed mid-refactor: `next.config.ts` and
`clockIn` already speak to the gateway, but the models, the login flow and the
admin screens still describe the pre-refactor three-service API. This plan
finishes that pass.

Source of truth for every shape: `backend/shared/contracts/*.ts` and the running
gateway's OpenAPI document (`/docs`).

## What is actually wrong today

| Area | Frontend today | Gateway today |
| --- | --- | --- |
| Login | `POST /auth/otp`, `POST /auth/choice`, `{ user, choiceToken }` | `POST /auth/otp/request`, `POST /auth/otp/verify` → `{ accessToken, tokenType, expiresIn }`; claims from `GET /auth/me` |
| Roles | `"Employee" \| "Manager" \| "HR Admin"`, `lib/roles.ts` missing | `EMPLOYEE \| ADMIN \| MASTER_ADMIN` (JWT claim) |
| Employee | `name`, `role`, `division`, `address`, `contractExpiry`, `clockInAt`, `evidence` | `EmployeeView`: `fullName`, `employeeNumber`, `employmentStatus`, `joinedAt`, `divisionIds[]`, `avatarKey`, `avatarUrl` |
| Employee list | `{ data: Employee[] }` | `EmployeeListResult { items, total, page, limit }` |
| Attendance | `{ status: "checked-in" \| "late" \| "not-checked-in", clockInAt, checkInPosition }` | `AttendanceView`: `status ON_TIME/LATE/ABSENT/ON_LEAVE/NOT_WORKING/NOT_CHECKED_IN`, `checkInTime` (ISO), `location`, `proofUrl` |
| Admin day view | derived from the employee list | `GET /attendance/today` → `TodayReport` (server counts) |
| Late days | `LateDay[]` | `LateDatesResult { employeeId, year, lateCount, lateDates }` |
| Tests | `lib/roles.ts` missing, dead `camera-capture.tsx` + `terminate-employee-dialog.tsx`, `LayoutProps` global not generated | — |

## Backend gaps to close first

1. **Divisions are unreachable.** `CreateEmployeeDto.divisionIds` wants UUIDs,
   and nothing lists them.
   → `DivisionView { id, name, description }`, `EMPLOYEE_PATTERNS.divisions`,
   `GET /admin/divisions` (ADMIN + MASTER_ADMIN), OpenAPI model.
2. **The admin day view cannot show what the card shows.** `TodayItem` has no
   `location` / `proofUrl`, so the dashboard would lose the check-in location
   and the proof photo.
   → add both to `TodayItem` and sign the proof URL in `AttendanceService.today`.

Out of scope, recorded as follow-ups: creating divisions and seeding a first
admin identity (the division picker is simply empty on a fresh database).

## Frontend work, in order

1. **Auth + session.** `lib/roles.ts` (`Role`, `ROLES`, `roleLabel`,
   `isAdminRole`); `Session` carries `role: Role` and `employeeId`; the login
   page does request → verify → `GET /auth/me` → store, then routes admins to
   `/admin/dashboard` and everyone else to `/employee`. No `choiceToken` exists.
2. **Data layer.** `lib/employees.ts` models `EmployeeView` / `MeView`, reads
   `items`, posts the real `CreateEmployeeDto` fields, uploads avatars through
   `POST /admin/employees/avatar/upload-url` + presigned PUT, and checks in with
   `{ proofKey, location }`. `lib/attendance.ts` maps the six server statuses to
   tones (LATE/ABSENT red, ON_TIME green, NOT_CHECKED_IN neutral).
   `lib/divisions.ts` is a small cached store for the picker.
3. **Admin screens.** Dashboard reads `TodayReport` for the counters and status
   filter, joins `TodayItem` into the cards, filters by division; the card shows
   employee number, division names, check-in time, location and proof photo; the
   calendar reads `LateDatesResult`; the form edits the real fields (avatar
   upload instead of an image URL, division checkboxes, `joinedAt`, role only on
   create and only honoured for a master admin).
4. **Employee screen.** `CheckInPanel` takes `MeView`, shows `proofUrl` and the
   recorded location, and keeps the presigned proof upload before check-in.
5. **Clean up.** Delete `camera-capture.tsx` and `terminate-employee-dialog.tsx`
   (dead code; the backend has no termination endpoint), fix `app/layout.tsx`
   after `next typegen`, and re-run `tsc`, `eslint`, `npm run dev`.

## Verification

- `npx tsc --noEmit` and `npm run lint` in `frontend/`; `npm run dev` boots and
  the login page renders.
- `npm run build:all`, `npx tsc -p apps/backend/tsconfig.app.json --noEmit`,
  `npm test` in `backend/`.
- With the stack up: OTP login → `/auth/me` → dashboard counters → create an
  employee with an avatar → check in with a photo → card shows time, location
  and photo → calendar shows late dates.
