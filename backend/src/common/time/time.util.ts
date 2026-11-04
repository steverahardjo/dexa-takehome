/**
 * Timezone-aware date/time helpers.
 *
 * Instants are stored as UTC (`timestamptz`); every business decision
 * (attendance date, lateness, working day) is made in the schedule timezone.
 */

const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = timeFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    timeFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (`YYYY-MM-DD`) of an instant in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = dateFormatter(timeZone).formatToParts(instant);
  const value = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Local wall-clock time (`HH:mm:ss`) of an instant in `timeZone`. */
export function localTime(instant: Date, timeZone: string): string {
  const parts = timeFormatter(timeZone).formatToParts(instant);
  const value = (type: 'hour' | 'minute' | 'second') =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return `${value('hour')}:${value('minute')}:${value('second')}`;
}

/** Minutes elapsed since midnight for `HH:mm[:ss]`. */
export function timeToMinutes(time: string): number {
  const [hours = '0', minutes = '0', seconds = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes) + Number(seconds) / 60;
}

/** Normalises `H:mm`, `HH:mm` or `HH:mm:ss` to `HH:mm:ss`. */
export function normalizeTime(time: string): string {
  const [hours = '00', minutes = '00', seconds = '00'] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
}

/** Lexicographic comparison is valid for zero-padded `HH:mm:ss` values. */
export function compareTimes(a: string, b: string): number {
  return normalizeTime(a).localeCompare(normalizeTime(b));
}

/** Whole minutes between two `HH:mm[:ss]` values, rounded up (never negative). */
export function minutesBetween(later: string, earlier: string): number {
  const diff = timeToMinutes(normalizeTime(later)) - timeToMinutes(normalizeTime(earlier));
  return diff > 0 ? Math.ceil(diff) : 0;
}

export interface LatenessResult {
  late: boolean;
  lateMinutes: number;
  checkInLocalTime: string;
}

/**
 * Lateness rule: a check-in after the schedule's required check-in is late.
 * A missing check-in is never lateness — it becomes absence only once the
 * schedule's check-out cutoff has passed (see `hasCutoffPassed`).
 */
export function evaluateLateness(
  checkIn: Date,
  requiredCheckIn: string,
  timeZone: string,
): LatenessResult {
  const checkInLocalTime = localTime(checkIn, timeZone);
  const late = compareTimes(checkInLocalTime, requiredCheckIn) > 0;

  return {
    late,
    lateMinutes: late ? minutesBetween(checkInLocalTime, requiredCheckIn) : 0,
    checkInLocalTime,
  };
}

/** True once the working day's cutoff has passed in the schedule timezone. */
export function hasCutoffPassed(instant: Date, requiredCheckOut: string, timeZone: string): boolean {
  return compareTimes(localTime(instant, timeZone), requiredCheckOut) >= 0;
}

/** ISO weekday (1 = Monday … 7 = Sunday) for a `YYYY-MM-DD` value. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let current = from; current <= to; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

export function yearBounds(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function isDateInRange(date: string, from: string | null, to: string | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** Clamps a date range so reports never project into the future. */
export function clampToToday(date: string, today: string): string {
  return date > today ? today : date;
}
