import { connection } from "next/server";

import {
  authorizationOf,
  callEmployee,
  messageOf,
  NO_STORE,
  unreachable,
} from "@/lib/proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** The desktop polls this while the QR code is on screen. */
export async function GET(_request: Request, { params }: RouteContext) {
  await connection();

  const { id } = await params;

  let upstream: Response;

  try {
    upstream = await callEmployee(`/attendance/sessions/${id}`);
  } catch {
    return unreachable();
  }

  const payload: unknown = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return Response.json(
      { error: messageOf(payload, "This QR code has expired.") },
      { status: upstream.status, headers: NO_STORE }
    );
  }

  return Response.json({ session: payload }, { headers: NO_STORE });
}

/** The phone posts the photo, its timestamp, and where it was taken. */
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected a JSON body." },
      { status: 400, headers: NO_STORE }
    );
  }

  let upstream: Response;

  try {
    upstream = await callEmployee(`/attendance/sessions/${id}`, {
      method: "POST",
      headers: authorizationOf(request),
      body: JSON.stringify(body),
    });
  } catch {
    return unreachable();
  }

  const payload: unknown = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return Response.json(
      { error: messageOf(payload, "The photo could not be sent.") },
      { status: upstream.status, headers: NO_STORE }
    );
  }

  return Response.json({ session: payload }, { headers: NO_STORE });
}

/** The desktop releases the session once the check-in is stored. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  try {
    await callEmployee(`/attendance/sessions/${id}`, { method: "DELETE" });
  } catch {
    return unreachable();
  }

  return new Response(null, { status: 204, headers: NO_STORE });
}
