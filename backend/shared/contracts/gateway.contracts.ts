import type { AttendanceView } from './attendance.contracts.js';
import type { EmployeeView } from './employee.contracts.js';

/**
 * `GET /employee/me` — the signed-in person plus their attendance for the day.
 * Composed by the gateway from the employee and attendance services: the two
 * own separate databases, so no service can return both on its own.
 */
export interface MeView extends EmployeeView {
  attendance: AttendanceView | null;
}
