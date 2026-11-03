/**
 * Local-day helpers. Every container runs with the same `TZ`, so "today" and
 * "09:00" mean the same thing in the API, the database and the browser.
 */

/** `YYYY-MM-DD` of a local date. */
export function dayString(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

/** `HH:mm` of a local time, e.g. the check-in shown on the dashboard. */
export function clockString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}
