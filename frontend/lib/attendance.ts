
import { formatClockTime } from "@/lib/time";

/** Where the browser was when the check-in was sent. */
/**
 * A position on the wire, always integers: `latitude`/`longitude` are degrees
 * × 1e6 (micro-degrees), `accuracy` is whole metres.
 */
export type CheckInPosition = {
  /** Degrees × 1e6, e.g. `-6200000` for -6.2°. */
  latitude: number;
  /** Degrees × 1e6, e.g. `106816667` for 106.816667°. */
  longitude: number;
  /** Metres, when the device reports it. */
  accuracy: number | null;
};

export type AttendanceStatus =
  | "checked-in"
  | "late"
  | "not-checked-in";

type Attendance = {
  status: AttendanceStatus;
  /** Badge text, e.g. `Checked in` or `Late`. */
  label: string;
  /** Short explanation, e.g. `Checked in at 10:14`. */
  detail: string;
};

const attendanceLabels: Record<AttendanceStatus, string> = {
  "checked-in": "Checked in",
  late: "Late",
  "not-checked-in": "Not yet",
};

type AttendanceTone = {
  badge: string;
  card: string;
  icon: string;
  value: string;
  /** Full-bleed card header band. */
  header: string;
  /** Secondary text inside the header band. */
  headerMuted: string;
  /** Role badge / action styling inside the header band. */
  headerAccent: string;
};

export const attendanceTone: Record<AttendanceStatus, AttendanceTone> = {
  "checked-in": {
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
    badge:
      "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    card: "border-rose-500/25 bg-rose-500/5",
    icon: "text-rose-600 dark:text-rose-400",
    value: "text-rose-700 dark:text-rose-400",
    header: "bg-rose-600 text-white",
    headerMuted: "text-white/80",
    headerAccent: "border-white/30 bg-white/10 text-white",
  },

  "not-checked-in": {
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
  clockInAt: string | null;
  late?: boolean;
};

/**
 * Attendance for today.
 *
 * - A late check-in: `late`.
 * - An on-time check-in: `checked-in`.
 * - No check-in yet: `not-checked-in`.
 *
 * The `late` property should come from the backend attendance record.
 */
export function getAttendance(employee: AttendanceInput): Attendance {
  if (employee.clockInAt !== null) {
    const status: AttendanceStatus = employee.late
      ? "late"
      : "checked-in";

    return {
      status,
      label: attendanceLabels[status],
      detail: employee.late
        ? `Checked in late at ${formatClockTime(employee.clockInAt)}`
        : `Checked in at ${formatClockTime(employee.clockInAt)}`,
    };
  }

  return {
    status: "not-checked-in",
    label: attendanceLabels["not-checked-in"],
    detail: "No check-in yet today",
  };
}

type AttendanceSummary = Record<AttendanceStatus, number>;

export function summarizeAttendance(
  employees: AttendanceInput[]
): AttendanceSummary {
  const summary: AttendanceSummary = {
    "checked-in": 0,
    late: 0,
    "not-checked-in": 0,
  };

  for (const employee of employees) {
    summary[getAttendance(employee).status] += 1;
  }

  return summary;
}
