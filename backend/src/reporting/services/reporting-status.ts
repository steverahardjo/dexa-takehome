import { AttendanceStatus } from '../../common/enums/roles.enum.js';
import {
  hasCutoffPassed,
  localTime,
  minutesBetween,
} from '../../common/time/time.util.js';

export interface AttendanceFacts {
  checkInTime: Date | null;
  checkOutTime: Date | null;
  late: boolean;
  lateMinutes: number;
}

export interface DayStatusInput {
  date: string;
  /** Today in the company timezone. */
  today: string;
  now: Date;
  scheduled: boolean;
  requiredCheckIn: string | null;
  requiredCheckOut: string | null;
  timezone: string | null;
  onLeave: boolean;
  attendance: AttendanceFacts | null;
}

export interface DayStatusResult {
  status: AttendanceStatus;
  lateMinutes: number;
}

/**
 * Single source of truth for the dashboard/report status of one employee-day.
 *
 * - A check-in always wins: ON_TIME or LATE (computed from the schedule).
 * - Approved leave only applies on scheduled working days.
 * - Unscheduled days are NOT_WORKING, never absent.
 * - A missing check-in becomes ABSENT only once the cutoff has passed;
 *   before the cutoff it is NOT_CHECKED_IN (never "absent early").
 */
export function deriveAttendanceStatus(input: DayStatusInput): DayStatusResult {
  const { attendance } = input;

  if (attendance?.checkInTime) {
    if (!attendance.late) {
      return { status: AttendanceStatus.ON_TIME, lateMinutes: 0 };
    }

    const lateMinutes =
      attendance.lateMinutes > 0
        ? attendance.lateMinutes
        : input.requiredCheckIn && input.timezone
          ? minutesBetween(
              localTime(attendance.checkInTime, input.timezone),
              input.requiredCheckIn,
            )
          : 0;

    return { status: AttendanceStatus.LATE, lateMinutes };
  }

  if (!input.scheduled) {
    return { status: AttendanceStatus.NOT_WORKING, lateMinutes: 0 };
  }

  if (input.onLeave) {
    return { status: AttendanceStatus.ON_LEAVE, lateMinutes: 0 };
  }

  if (input.date < input.today) {
    return { status: AttendanceStatus.ABSENT, lateMinutes: 0 };
  }

  if (input.date === input.today) {
    const cutoffPassed =
      input.requiredCheckOut && input.timezone
        ? hasCutoffPassed(input.now, input.requiredCheckOut, input.timezone)
        : false;

    return {
      status: cutoffPassed ? AttendanceStatus.ABSENT : AttendanceStatus.NOT_CHECKED_IN,
      lateMinutes: 0,
    };
  }

  return { status: AttendanceStatus.NOT_CHECKED_IN, lateMinutes: 0 };
}
