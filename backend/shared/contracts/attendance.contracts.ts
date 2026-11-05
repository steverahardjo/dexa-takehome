import type { AttendanceStatus } from '../enums/roles.enum.js';

/** What the browser may upload as a check-in proof, and what MinIO will sign. */
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ProofContentType = (typeof PROOF_TYPES)[number];

/**
 * Internal TCP API of the attendance service.
 *
 * There is no work-schedule entity: a day is a working day when it is not a
 * weekend and not an Indonesian national holiday (see HolidayService).
 */
export const ATTENDANCE_PATTERNS = {
  /** Reserves a key + temporary URL for the check-in proof photo. */
  proofUrl: 'attendance.proof-url',
  /** Records a check-in; `proofKey` must reference an uploaded proof. */
  checkIn: 'attendance.check-in',
  /** Today's (or a given day's) on-time / late / absent breakdown. */
  today: 'attendance.today',
  /** Dates of a year on which the employee was late. */
  lateDates: 'attendance.late-dates',
  /** Yearly counters for one employee. */
  summary: 'attendance.summary',
  /** Creates ABSENT rows for everyone who did not check in. */
  markAbsent: 'attendance.mark-absent',
  /** One employee, one local day; null when there is no record. */
  dayOf: 'attendance.day',
} as const;

export interface AttendanceView {
  id: string;
  employeeId: string;
  attendanceDate: string;
  checkInTime: string | null;
  status: AttendanceStatus;
  late: boolean;
  lateMinutes: number;
  location: string | null;
  proofKey: string | null;
  /** Temporary presigned URL of the proof photo, or null. */
  proofUrl: string | null;
  requiredCheckIn: string | null;
  timezone: string | null;
}

export interface ProofUpload {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
  /** `YYYY-MM-DD` the proof was requested for. */
  attendanceDate: string;
}

export interface TodayItem {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  lateMinutes: number;
  /** Free-form position the employee's browser reported, or null. */
  location: string | null;
  /** Temporary presigned URL of the proof photo, or null. */
  proofUrl: string | null;
}

export interface TodayReport {
  date: string;
  /** WORKING_DAY | WEEKEND | HOLIDAY | UNKNOWN. */
  dayType: string;
  holidayName: string | null;
  totalEmployees: number;
  onTime: number;
  late: number;
  absent: number;
  notCheckedIn: number;
  items: TodayItem[];
}

export interface LateDatesResult {
  employeeId: string;
  year: number;
  lateCount: number;
  lateDates: string[];
}

export interface AttendanceSummary {
  employeeId: string;
  year: number;
  recorded: number;
  onTime: number;
  late: number;
  absent: number;
  leave: number;
  lateDates: string[];
}

export interface MarkAbsentResult {
  date: string;
  created: number;
  skipped: boolean;
  reason?: string;
}

export interface DayQuery {
  employeeId: string;
  /** `YYYY-MM-DD`; defaults to today in the company timezone. */
  date?: string;
}
