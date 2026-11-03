/**
 * Server-side helpers for the two route handlers the QR flow needs. They proxy
 * to the employee container so the phone only ever reaches this origin.
 */

const employeeServiceUrl =
  process.env.EMPLOYEE_SERVICE_URL ?? "http://localhost:3002";

export const NO_STORE = { "cache-control": "no-store" } as const;

export async function callEmployee(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(`${employeeServiceUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

/** The bearer token of the incoming request, when it has one. */
export function authorizationOf(request: Request): Record<string, string> {
  const authorization = request.headers.get("authorization");

  return authorization ? { authorization } : {};
}

/** Nest's error bodies are `{ statusCode, message: string | string[] }`. */
export function messageOf(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;

  const message = (payload as { message?: unknown }).message;

  if (Array.isArray(message)) {
    return message.filter((part) => typeof part === "string").join(", ");
  }

  return typeof message === "string" && message.trim() ? message : fallback;
}

/** The upstream could not be reached at all. */
export function unreachable(): Response {
  return Response.json(
    { error: "The attendance service is not reachable. Is it running?" },
    { status: 502, headers: NO_STORE }
  );
}
