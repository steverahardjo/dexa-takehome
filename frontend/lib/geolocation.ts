import type { CheckInPosition } from "@/lib/attendance";

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
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: Number.isFinite(result.coords.accuracy)
            ? result.coords.accuracy
            : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}
