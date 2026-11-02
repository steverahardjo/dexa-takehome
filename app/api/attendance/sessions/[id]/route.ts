import { connection } from "next/server";

import { parseCaptureSubmission } from "@/lib/attendance-capture";
import {
  deleteCaptureSession,
  readCaptureSession,
  submitCapture,
} from "@/lib/attendance-store";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "cache-control": "no-store" } as const;

const NOT_FOUND = Response.json(
  { error: "This QR code has expired. Start again on the desktop." },
  { status: 404, headers: NO_STORE }
);

/** The desktop polls this while the QR code is on screen. */
export async function GET(_request: Request, { params }: RouteContext) {
  await connection();

  const { id } = await params;
  const session = readCaptureSession(id);

  if (!session) return NOT_FOUND.clone();

  return Response.json({ session }, { headers: NO_STORE });
}

/** The phone posts the photo, its timestamp, and where it was taken. */
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  if (!readCaptureSession(id)) return NOT_FOUND.clone();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected a JSON body." },
      { status: 400, headers: NO_STORE }
    );
  }

  const parsed = parseCaptureSubmission(body);

  if ("error" in parsed) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE }
    );
  }

  const session = submitCapture(id, parsed.submission);

  if (!session) return NOT_FOUND.clone();

  return Response.json({ session }, { headers: NO_STORE });
}

/** The desktop releases the session once the check-in is stored. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  deleteCaptureSession(id);

  return new Response(null, { status: 204, headers: NO_STORE });
}
