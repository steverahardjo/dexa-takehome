import { lanAddresses } from "@/lib/network";
import {
  authorizationOf,
  callEmployee,
  messageOf,
  NO_STORE,
  unreachable,
} from "@/lib/proxy";

/** Creates the QR payload the phone fills in, and hands back this machine's LAN IPs. */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected a JSON body." },
      { status: 400, headers: NO_STORE }
    );
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const employeeId =
    typeof input.employeeId === "string" ? input.employeeId.trim() : "";
  const employeeName =
    typeof input.employeeName === "string" ? input.employeeName.trim() : "";

  if (!employeeId) {
    return Response.json(
      { error: "employeeId is required." },
      { status: 400, headers: NO_STORE }
    );
  }

  let upstream: Response;

  try {
    upstream = await callEmployee("/attendance/sessions", {
      method: "POST",
      headers: authorizationOf(request),
      body: JSON.stringify({ employeeId, employeeName }),
    });
  } catch {
    return unreachable();
  }

  const payload: unknown = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return Response.json(
      { error: messageOf(payload, "Could not create the QR code.") },
      { status: upstream.status, headers: NO_STORE }
    );
  }

  return Response.json(
    // `lanHosts` lets the desktop build a QR the phone can actually reach when
    // the page itself was opened through localhost.
    { session: payload, lanHosts: lanAddresses() },
    { status: 201, headers: NO_STORE }
  );
}
