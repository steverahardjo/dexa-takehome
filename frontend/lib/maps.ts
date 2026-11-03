import type { CapturePosition } from "@/lib/attendance-capture";

/** Google Maps search page for a free-text address or a `lat,lng` pair. */
export function googleMapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;
}

/** `"5.12345, 0.12345"` — the query form Google Maps understands. */
export function formatCoordinates(position: CapturePosition) {
  return `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
}
