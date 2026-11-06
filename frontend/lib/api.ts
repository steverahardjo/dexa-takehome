"use client";

import { getSession } from "@/lib/session";

/** A failed request, carrying the status so callers can branch on it. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Attach the bearer token. On by default; the auth calls turn it off. */
  auth?: boolean;
  /** Token to send instead of the stored session's, e.g. the choice token. */
  token?: string;
  signal?: AbortSignal;
};

/** Nest's error bodies are `{ statusCode, message: string | string[] }`. */
function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;

  const message = (payload as { message?: unknown }).message;

  if (Array.isArray(message)) {
    return message.filter((part) => typeof part === "string").join(", ");
  }

  return typeof message === "string" && message.trim() ? message : fallback;
}

/**
 * Calls the backend through the `/api` rewrites in `next.config.ts`, so the
 * browser only ever talks to this origin.
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true, token, signal } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) headers["content-type"] = "application/json";

  const bearer = token ?? (auth ? getSession()?.token : undefined);

  if (bearer) headers.authorization = `Bearer ${bearer}`;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);

    throw new ApiError(
      errorMessage(payload, response.statusText || "Permintaan gagal."),
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

