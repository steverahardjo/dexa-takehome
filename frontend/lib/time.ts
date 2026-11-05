export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** `"09:00"` -> `"9:00 AM"`; invalid input is returned untouched. */
export function formatClockTime(value: string): string {
  const totalMinutes = timeToMinutes(value);

  if (totalMinutes === null) return value;

  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * An ISO timestamp -> `"9:05 AM"` in the company timezone.
 *
 * Check-in times come back as `date-time` strings, not `HH:mm`, and they are
 * recorded in `COMPANY_TIMEZONE`, so the browser's own zone is only a fallback
 * for records that predate the `timezone` column.
 */
export function formatIsoClock(
  value: string,
  timeZone?: string | null,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  const format = (zone?: string) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(zone ? { timeZone: zone } : {}),
    }).format(date);

  if (!timeZone) return format();

  try {
    return format(timeZone);
  } catch {
    // An unknown IANA zone (or an older runtime) must not break the screen.
    return format();
  }
}

/** `"2026-02-16"` -> `"16 Feb 2026"`; invalid input is returned untouched. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));

  if (!match) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])));
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
