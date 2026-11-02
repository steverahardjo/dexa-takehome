import { formatClockTime, formatDurationShort, timeToMinutes } from "@/lib/time";

export type AttendanceStatus = "on-time" | "late" | "not-started";

export type Attendance = {
  status: AttendanceStatus;
  /** Badge text, e.g. `Late`. */
  label: string;
  /** Short explanation, e.g. `Checked in 10:14 · 14 min late`. */
  detail: string;
  /** Minutes late, or `null` when not late. */
  minutesLate: number | null;
};

export const attendanceLabels: Record<AttendanceStatus, string> = {
  "on-time": "On time",
  late: "Late",
  "not-started": "Not started",
};

export type AttendanceTone = {
  badge: string;
  card: string;
  icon: string;
  value: string;
  /** Full-bleed card header band: green, red, or black. */
  header: string;
  /** Secondary text inside the header band. */
  headerMuted: string;
  /** Role badge / action styling inside the header band. */
  headerAccent: string;
};

/** Subtle green for on time / early, subtle red for late, white for not yet. */
export const attendanceTone: Record<AttendanceStatus, AttendanceTone> = {
  "on-time": {
    badge:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    card: "border-emerald-500/25 bg-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
    header: "bg-emerald-600 text-white",
    headerMuted: "text-white/80",
    headerAccent: "border-white/30 bg-white/10 text-white",
  },
  late: {
    badge: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400",
    card: "border-red-500/25 bg-red-500/5",
    icon: "text-red-600 dark:text-red-400",
    value: "text-red-700 dark:text-red-400",
    header: "bg-red-600 text-white",
    headerMuted: "text-white/80",
    headerAccent: "border-white/30 bg-white/10 text-white",
  },
  "not-started": {
    badge: "border-border bg-background text-foreground",
    card: "bg-background",
    icon: "text-muted-foreground",
    value: "text-foreground",
    header: "bg-neutral-900 text-white",
    headerMuted: "text-white/70",
    headerAccent: "border-white/25 bg-white/10 text-white",
  },
};

type AttendanceInput = {
  workStart: string;
  workEnd: string;
  clockInAt: string | null;
};

/**
 * Attendance for today.
 *
 * - Checked in at or before the work start: `on-time`.
 * - Checked in after the work start: `late`.
 * - No check-in yet: `not-started` (white), with the start time in the detail.
 */
export function getAttendance(
  now: Date,
  employee: AttendanceInput
): Attendance {
  const startMinutes = timeToMinutes(employee.workStart);
  const clockInMinutes =
    employee.clockInAt === null ? null : timeToMinutes(employee.clockInAt);

  if (startMinutes === null) {
    return {
      status: "not-started",
      label: attendanceLabels["not-started"],
      detail: "Work start not set",
      minutesLate: null,
    };
  }

  if (clockInMinutes !== null) {
    const minutesLate = clockInMinutes - startMinutes;

    if (minutesLate > 0) {
      return {
        status: "late",
        label: attendanceLabels.late,
        detail: `${minutesLate} min late`,
        minutesLate,
      };
    }

    return {
      status: "on-time",
      label: attendanceLabels["on-time"],
      detail:
        minutesLate === 0
          ? "Right on time"
          : `${Math.abs(minutesLate)} min early`,
      minutesLate: null,
    };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return {
    status: "not-started",
    label: attendanceLabels["not-started"],
    detail:
      nowMinutes < startMinutes
        ? `Starts in ${formatDurationShort(
            (startMinutes - nowMinutes) * 60
          )} · ${formatClockTime(employee.workStart)}`
        : `No check-in yet · was due ${formatClockTime(employee.workStart)}`,
    minutesLate: null,
  };
}

export type AttendanceSummary = Record<AttendanceStatus, number>;

export function summarizeAttendance(
  employees: AttendanceInput[],
  now: Date
): AttendanceSummary {
  const summary: AttendanceSummary = {
    "on-time": 0,
    late: 0,
    "not-started": 0,
  };

  for (const employee of employees) {
    summary[getAttendance(now, employee).status] += 1;
  }

  return summary;
}
