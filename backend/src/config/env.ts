/**
 * Environment reads with a fallback, so a missing variable has one obvious
 * meaning across the three services.
 */
function readString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();

  return value ? value : fallback;
}

function readOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

function readInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);

  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;

  return fallback;
}

export const env = {
  string: readString,
  optionalString: readOptionalString,
  int: readInt,
  bool: readBool,
};

/** `HH:mm` after which a check-in counts as late. */
export const WORK_START = readString('WORK_START', '09:00');

/** The timezone every container must share for dates to line up. */
export const APP_TIMEZONE = readString('TZ', 'Asia/Jakarta');

/** Port the current service listens on when `PORT` is not set. */
export function servicePort(fallback: number): number {
  return readInt('PORT', fallback);
}
