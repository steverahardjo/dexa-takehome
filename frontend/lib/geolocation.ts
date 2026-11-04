import type { CheckInPosition } from "@/lib/attendance";

/** Degrees × 1e6: the integer scale the API and the backend expect. */
const MICRO_DEGREES = 1_000_000;

/**
 * Best-effort position for the check-in. A decline, an unsupported browser or a
 * timeout simply means "unknown": the check-in still goes through without it.
 */
export function currentPosition(timeoutMs = 8000): Promise<CheckInPosition | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (result) =>
        resolve({
          // Integers only: micro-degrees for the position, metres for accuracy.
          latitude: Math.round(result.coords.latitude * MICRO_DEGREES),
          longitude: Math.round(result.coords.longitude * MICRO_DEGREES),
          accuracy: Number.isFinite(result.coords.accuracy)
            ? Math.round(result.coords.accuracy)
            : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}
