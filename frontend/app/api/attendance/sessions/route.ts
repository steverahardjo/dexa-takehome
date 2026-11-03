import { createCaptureSession } from "@/lib/attendance-store";
import { lanAddresses } from "@/lib/network";

/** Creates the QR payload the phone fills in. */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const employeeId =
    typeof input.employeeId === "string" ? input.employeeId.trim() : "";
  const employeeName =
    typeof input.employeeName === "string" ? input.employeeName.trim() : "";

  if (!employeeId) {
    return Response.json({ error: "employeeId is required." }, { status: 400 });
  }

  const session = createCaptureSession({
    employeeId,
    employeeName: employeeName || "Employee",
  });

  return Response.json(
    // `lanHosts` lets the desktop build a QR the phone can actually reach when
    // the page itself was opened through localhost.
    { session, lanHosts: lanAddresses() },
    { status: 201, headers: { "cache-control": "no-store" } }
  );
}
