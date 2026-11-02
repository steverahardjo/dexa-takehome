/** How long a scanned QR code stays valid. */
export const CAPTURE_SESSION_TTL_MS = 10 * 60 * 1000;

/** Largest photo accepted from the phone, measured on the data URL. */
export const MAX_EVIDENCE_LENGTH = 4_000_000;

/** Where the phone was when the check-in was sent. */
export type CapturePosition = {
  latitude: number;
  longitude: number;
  /** Metres, when the device reports it. */
  accuracy: number | null;
};

/** What the phone sends back after the photo is confirmed. */
export type CaptureSubmission = {
  /** Photo taken on the phone, as a JPEG data URL. */
  image: string;
  /** ISO timestamp from the phone. */
  capturedAt: string;
  position: CapturePosition | null;
};

export type CaptureStatus = "pending" | "submitted";

/** One QR code handed from the desktop to a phone. */
export type CaptureSession = {
  id: string;
  employeeId: string;
  employeeName: string;
  createdAt: string;
  expiresAt: string;
  status: CaptureStatus;
  submission: CaptureSubmission | null;
};

const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function parsePosition(value: unknown): CapturePosition | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Record<string, unknown>;
  const latitude = candidate.latitude;
  const longitude = candidate.longitude;

  if (typeof latitude !== "number" || !Number.isFinite(latitude)) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const accuracy =
    typeof candidate.accuracy === "number" && Number.isFinite(candidate.accuracy)
      ? candidate.accuracy
      : null;

  return { latitude, longitude, accuracy };
}

export type ParsedSubmission =
  | { submission: CaptureSubmission }
  | { error: string };

/** Validates the phone's payload before it is stored for the desktop. */
export function parseCaptureSubmission(value: unknown): ParsedSubmission {
  if (typeof value !== "object" || value === null) {
    return { error: "Expected a JSON body." };
  }

  const candidate = value as Record<string, unknown>;
  const image = typeof candidate.image === "string" ? candidate.image.trim() : "";

  if (!IMAGE_DATA_URL.test(image)) {
    return { error: "The photo must be an image data URL." };
  }

  if (image.length > MAX_EVIDENCE_LENGTH) {
    return { error: "That photo is too large. Take a smaller one." };
  }

  const capturedAt =
    typeof candidate.capturedAt === "string" ? candidate.capturedAt : "";

  if (Number.isNaN(Date.parse(capturedAt))) {
    return { error: "capturedAt must be an ISO timestamp." };
  }

  return {
    submission: {
      image,
      capturedAt: new Date(capturedAt).toISOString(),
      position: parsePosition(candidate.position),
    },
  };
}
