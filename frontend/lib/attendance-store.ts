import {
  CAPTURE_SESSION_TTL_MS,
  type CaptureSession,
  type CaptureSubmission,
} from "@/lib/attendance-capture";

/**
 * Pending QR codes live in memory: the desktop creates one, the phone fills it
 * in, the desktop reads it back. The map is parked on `globalThis` so a dev
 * server reload does not drop a scan that is already in flight.
 */
const globalStore = globalThis as typeof globalThis & {
  __attendanceSessions?: Map<string, CaptureSession>;
};

function sessions() {
  globalStore.__attendanceSessions ??= new Map<string, CaptureSession>();

  return globalStore.__attendanceSessions;
}

function prune() {
  const now = Date.now();
  const store = sessions();

  for (const [id, session] of store) {
    if (Date.parse(session.expiresAt) <= now) store.delete(id);
  }
}

export function createCaptureSession(input: {
  employeeId: string;
  employeeName: string;
}): CaptureSession {
  prune();

  const now = Date.now();
  const session: CaptureSession = {
    id: crypto.randomUUID(),
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CAPTURE_SESSION_TTL_MS).toISOString(),
    status: "pending",
    submission: null,
  };

  sessions().set(session.id, session);

  return session;
}

export function readCaptureSession(id: string): CaptureSession | null {
  prune();

  return sessions().get(id) ?? null;
}

export function submitCapture(
  id: string,
  submission: CaptureSubmission
): CaptureSession | null {
  prune();

  const session = sessions().get(id);
  if (!session) return null;

  const next: CaptureSession = {
    ...session,
    status: "submitted",
    submission,
  };

  sessions().set(id, next);

  return next;
}

export function deleteCaptureSession(id: string) {
  sessions().delete(id);
}
