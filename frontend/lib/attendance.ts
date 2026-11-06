import { formatIsoClock } from "@/lib/time";

/**
 * Attendance statuses as the API spells them. Mirrors
 * `backend/shared/enums/roles.enum.ts` (`AttendanceStatus`).
 *
 * `NOT_CHECKED_IN` is what the server returns for someone who is expected to
 * check in but has no row yet; the sweep turns those into `ABSENT` after the
 * cut-off.
 */
export const ATTENDANCE_STATUSES = [
  "ON_TIME",
  "LATE",
  "ABSENT",
  "NOT_CHECKED_IN",
  "ON_LEAVE",
  "NOT_WORKING",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** One employee, one day. Mirrors `AttendanceView` in the shared contracts. */
export type Attendance = {
  id: string;
  employeeId: string;
  /** `YYYY-MM-DD` in the company timezone. */
  attendanceDate: string;
  /** ISO timestamp of the check-in, or null. */
  checkInTime: string | null;
  status: AttendanceStatus;
  late: boolean;
  lateMinutes: number;
  /** Free-form position the browser reported, e.g. `-6.20000, 106.81667`. */
  location: string | null;
  proofKey: string | null;
  /** Temporary presigned URL of the proof photo. */
  proofUrl: string | null;
  requiredCheckIn: string | null;
  timezone: string | null;
};

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

const GREEN: AttendanceTone = {
  badge:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  card: "border-emerald-500/25 bg-emerald-500/5",
  icon: "text-emerald-600 dark:text-emerald-400",
  value: "text-emerald-700 dark:text-emerald-400",
  header: "bg-emerald-600 text-white",
  headerMuted: "text-white/80",
  headerAccent: "border-white/30 bg-white/10 text-white",
};

const RED: AttendanceTone = {
  badge: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  card: "border-rose-500/25 bg-rose-500/5",
  icon: "text-rose-600 dark:text-rose-400",
  value: "text-rose-700 dark:text-rose-400",
  header: "bg-rose-600 text-white",
  headerMuted: "text-white/80",
  headerAccent: "border-white/30 bg-white/10 text-white",
};

const NEUTRAL: AttendanceTone = {
  badge: "border-border bg-background text-foreground",
  card: "bg-background",
  icon: "text-muted-foreground",
  value: "text-foreground",
  header: "bg-neutral-900 text-white",
  headerMuted: "text-white/70",
  headerAccent: "border-white/25 bg-white/10 text-white",
};

const AMBER: AttendanceTone = {
  badge:
    "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  card: "border-amber-500/25 bg-amber-500/5",
  icon: "text-amber-600 dark:text-amber-400",
  value: "text-amber-700 dark:text-amber-400",
  header: "bg-amber-600 text-white",
  headerMuted: "text-white/80",
  headerAccent: "border-white/30 bg-white/10 text-white",
};

/**
 * On time is green; late and absent are red — the spec's "automatic red".
 * Leave is amber, and the two "nothing was expected" states stay neutral.
 */
export const attendanceTone: Record<AttendanceStatus, AttendanceTone> = {
  ON_TIME: GREEN,
  LATE: RED,
  ABSENT: RED,
  NOT_CHECKED_IN: NEUTRAL,
  ON_LEAVE: AMBER,
  NOT_WORKING: NEUTRAL,
};

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  ON_TIME: "Sudah absen",
  LATE: "Terlambat",
  ABSENT: "Tidak hadir",
  NOT_CHECKED_IN: "Belum absen",
  ON_LEAVE: "Cuti",
  NOT_WORKING: "Bukan hari kerja",
};

export type AttendanceSummary = {
  status: AttendanceStatus;
  /** Badge text, e.g. `Checked in` or `Late`. */
  label: string;
  /** Short explanation, e.g. `Checked in at 9:14 AM · 14 min late`. */
  detail: string;
};

/**
 * Everything `getAttendance` needs. `AttendanceView` and a `TodayItem` both
 * fit, which keeps the card and the phone screen on one set of labels.
 */
export type AttendanceLike = {
  status: AttendanceStatus;
  checkInTime: string | null;
  lateMinutes?: number;
  timezone?: string | null;
};

function lateSuffix(lateMinutes: number): string {
  if (lateMinutes <= 0) return "";

  return lateMinutes === 1
    ? " · terlambat 1 menit"
    : ` · terlambat ${lateMinutes} menit`;
}

/**
 * Turns a day (or the absence of one) into what the screens render.
 *
 * A `null` record means "no row for this day yet", which is what the phone
 * screen shows before the first check-in. The status itself always comes from
 * the server: the browser never decides that someone was late.
 */
export function getAttendance(
  attendance: AttendanceLike | null | undefined,
): AttendanceSummary {
  if (!attendance) {
    return {
      status: "NOT_CHECKED_IN",
      label: ATTENDANCE_LABELS.NOT_CHECKED_IN,
      detail: "Belum absen hari ini",
    };
  }

  const status = attendance.status;

  let detail: string;

  if (attendance.checkInTime) {
    const time = formatIsoClock(
      attendance.checkInTime,
      attendance.timezone ?? undefined,
    );

    detail = `Absen pada ${time}${lateSuffix(attendance.lateMinutes ?? 0)}`;
  } else {
    switch (status) {
      case "ABSENT":
        detail = "Tidak ada catatan absen untuk hari ini";
        break;
      case "ON_LEAVE":
        detail = "Tercatat sedang cuti";
        break;
      case "NOT_WORKING":
        detail = "Akhir pekan atau hari libur nasional";
        break;
      case "NOT_CHECKED_IN":
        detail = "Belum absen hari ini";
        break;
      default:
        detail = "Waktu absen tidak tercatat";
    }
  }

  return {
    status,
    label: ATTENDANCE_LABELS[status] ?? status,
    detail,
  };
}
