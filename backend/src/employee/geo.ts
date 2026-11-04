/**
 * Positions travel as integers. The phone measures hundredths of a metre and
 * the wire says so: latitude/longitude are micro-degrees (degrees × 1e6), the
 * same scale Google and Mapbox use, and accuracy is whole metres.
 *
 * The database keeps decimal degrees (`decimal(10,7)`), so this is the only
 * place that converts — the services just call `degrees()` going in and
 * `microDegrees()` coming out.
 */

export const MICRO_DEGREES = 1_000_000;

/** A position as the API takes and returns it: integers. */
export interface MicroPosition {
  /** Degrees × 1e6. */
  latitude: number;
  /** Degrees × 1e6. */
  longitude: number;
  /** Metres, when the device reports it. */
  accuracy: number | null;
}

/** Micro-degrees to the `decimal` column's string form, 6 places (~11 cm). */
export function degrees(micro: number): string {
  return (micro / MICRO_DEGREES).toFixed(6);
}

/** The reverse: a stored decimal degree back to integer micro-degrees. */
export function microDegrees(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const degreesValue = Number(value);

  return Number.isFinite(degreesValue)
    ? Math.round(degreesValue * MICRO_DEGREES)
    : null;
}
