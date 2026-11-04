export const ATTENDANCE_STATUSES = [
  "ON_TIME",
  "LATE",
  "NOT_CHECKED_IN",
  "ON_LEAVE",
  "NOT_WORKING",
  "ABSENT",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendanceLabels: Record<AttendanceStatus, string> = {
  ON_TIME: "On time",
  LATE: "Late",
  NOT_CHECKED_IN: "Not checked in",
  ON_LEAVE: "On leave",
  NOT_WORKING: "Not working",
  ABSENT: "Absent",
};

export function statusLabel(status: AttendanceStatus): string {
  return attendanceLabels[status] ?? status;
}

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
  ON_TIME: {
    badge:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    card: "border-emerald-500/25 bg-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
    header: "bg-emerald-600 text-white",
    headerMuted: "text-white/80",
    headerAccent: "border-white/30 bg-white/10 text-white",
  },
  LATE: {
    badge: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    card: "border-rose-500/25 bg-rose-500/5",
    icon: "text-rose-600 dark:text-rose-400",
    value: "text-rose-700 dark:text-rose-400",
    header: "bg-rose-600 text-white",
    headerMuted: "text-white/80",
    headerAccent: "border-white/30 bg-white/10 text-white",
  },
  NOT_CHECKED_IN: {
    badge: "border-border bg-background text-foreground",
    card: "bg-background",
    icon: "text-muted-foreground",
    value: "text-foreground",
    header: "bg-neutral-900 text-white",
    headerMuted: "text-white/70",
    headerAccent: "border-white/25 bg-white/10 text-white",
  },
  ON_LEAVE: {
    badge:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    card: "border-amber-500/25 bg-amber-500/5",
    icon: "text-amber-600 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-400",
    header: "bg-amber-600 text-white",
    headerMuted: "text-white/80",
    headerAccent: "border-white/30 bg-white/10 text-white",
  },
  NOT_WORKING: {
    badge: "border-border bg-muted text-muted-foreground",
    card: "bg-muted/30",
    icon: "text-muted-foreground",
    value: "text-muted-foreground",
    header: "bg-neutral-700 text-white",
    headerMuted: "text-white/70",
    headerAccent: "border-white/25 bg-white/10 text-white",
  },
  ABSENT: {
    badge: "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    card: "border-slate-500/20 bg-slate-500/5",
    icon: "text-slate-600 dark:text-slate-300",
    value: "text-slate-700 dark:text-slate-300",
    header: "bg-slate-700 text-white",
    headerMuted: "text-white/75",
    headerAccent: "border-white/25 bg-white/10 text-white",
  },
};

export type AttendanceSummary = Record<AttendanceStatus, number>;

export function emptyAttendanceSummary(): AttendanceSummary {
  return {
    ON_TIME: 0,
    LATE: 0,
    NOT_CHECKED_IN: 0,
    ON_LEAVE: 0,
    NOT_WORKING: 0,
    ABSENT: 0,
  };
}

export function summarizeAttendance(
  employees: Array<{ status: AttendanceStatus }>
): AttendanceSummary {
  const summary = emptyAttendanceSummary();

  for (const employee of employees) {
    summary[employee.status] += 1;
  }

  return summary;
}

/** A check-in wins over every other status. */
export function isPresent(status: AttendanceStatus): boolean {
  return status === "ON_TIME" || status === "LATE";
}
