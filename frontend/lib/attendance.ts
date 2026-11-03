import { formatClockTime } from "@/lib/time";

type AttendanceStatus = "checked-in" | "not-checked-in";

type Attendance = {
  status: AttendanceStatus;
  /** Badge text, e.g. `Checked in`. */
  label: string;
  /** Short explanation, e.g. `Checked in at 10:14`. */
  detail: string;
};

const attendanceLabels: Record<AttendanceStatus, string> = {
  "checked-in": "Checked in",
  "not-checked-in": "Not yet",
};

type AttendanceTone = {
  badge: string;
  card: string;
  icon: string;
  value: string;
  /** Full-bleed card header band: green once checked in, dark before. */
  header: string;
  /** Secondary text inside the header band. */
  headerMuted: string;
  /** Role badge / action styling inside the header band. */
  headerAccent: string;
};

/** Subtle green once checked in, neutral while there is no check-in yet. */
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
};

/**
 * Attendance for today.
 *
 * - A check-in today: `checked-in`, with the server clock time in the detail.
 * - No check-in yet: `not-checked-in`.
 */
export function getAttendance(employee: AttendanceInput): Attendance {
  if (employee.clockInAt !== null) {
    return {
      status: "checked-in",
      label: attendanceLabels["checked-in"],
      detail: `Checked in at ${formatClockTime(employee.clockInAt)}`,
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
    "not-checked-in": 0,
  };

  for (const employee of employees) {
    summary[getAttendance(employee).status] += 1;
  }

  return summary;
}
