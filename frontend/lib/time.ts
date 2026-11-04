export const COMPANY_TIMEZONE =
  process.env.NEXT_PUBLIC_COMPANY_TIMEZONE ?? "Asia/Jakarta";

/** Parses `HH:mm` and `HH:mm:ss` into minutes since midnight. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** `"09:00"` / `"09:00:00"` -> `"9:00 AM"`; invalid input is returned untouched. */
export function formatClockTime(value: string): string {
  const totalMinutes = timeToMinutes(value);

  if (totalMinutes === null) return value;

  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** Formats an ISO instant as wall-clock time in the business timezone. */
export function formatInstantClock(
  instant: string | null | undefined,
  timeZone: string = COMPANY_TIMEZONE
): string {
  if (!instant) return "";

  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Today's calendar date in the business timezone (`YYYY-MM-DD`). */
export function todayInCompanyZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `"2026-11-05"` -> `"5 Nov 2026"`. */
export function formatDateLabel(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** `5432` -> `"1h 30m"` */
export function formatDurationShort(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;

  return "under a minute";
}
