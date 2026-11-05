/**
 * Local-time helpers. Instants are stored in UTC; everything users see is
 * evaluated in the company timezone (`COMPANY_TIMEZONE`, default Asia/Jakarta).
 */

const SATURDAY = 6;
const SUNDAY = 0;

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    formatters.set(timeZone, formatter);
  }

  return formatter;
};

interface ZonedParts {
  /** `YYYY-MM-DD` in the given zone. */
  date: string;
  /** Minutes since local midnight. */
  minutesOfDay: number;
}

const zonedParts = (instant: Date, timeZone: string): ZonedParts => {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  // Some ICU versions render midnight as 24:00.
  const hour = Number(read('hour')) % 24;
  const minute = Number(read('minute'));

  return {
    date: `${read('year')}-${read('month')}-${read('day')}`,
    minutesOfDay: hour * 60 + minute,
  };
};

/** `YYYY-MM-DD` of the local day an instant belongs to. */
export const localDate = (instant: Date, timeZone: string): string =>
  zonedParts(instant, timeZone).date;

/** Minutes since local midnight of an instant. */
export const localMinutes = (instant: Date, timeZone: string): number =>
  zonedParts(instant, timeZone).minutesOfDay;

export const isWeekendDate = (date: string): boolean => {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();

  return day === SATURDAY || day === SUNDAY;
};

/** `HH:mm` -> minutes since midnight. Throws on anything else. */
export function parseClock(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid clock value "${value}", expected HH:mm`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid clock value "${value}", expected HH:mm`);
  }

  return hours * 60 + minutes;
}
