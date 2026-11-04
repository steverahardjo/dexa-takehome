"use client";

import { expiresAtIn, getSession, signIn, signOut } from "@/lib/session";

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
  formData?: FormData;
  /** Attach the bearer token. On by default; the auth calls turn it off. */
  auth?: boolean;
  /** Token to send instead of the stored session's. */
  token?: string;
  signal?: AbortSignal;
};

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

/** Nest's error bodies are `{ message: string | string[] }`. */
function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;

  const message = (payload as { message?: unknown }).message;

  if (Array.isArray(message)) {
    return message.filter((part) => typeof part === "string").join(", ");
  }

  return typeof message === "string" && message.trim() ? message : fallback;
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);

    throw new ApiError(
      errorMessage(payload, response.statusText || "The request failed."),
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function perform(
  path: string,
  options: RequestOptions,
  bearer: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};

  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  return fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.formData ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
    signal: options.signal,
    cache: "no-store",
  });
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the rotating refresh token for a new access token. A single
 * in-flight refresh is shared by concurrent 401s so token rotation cannot
 * race itself.
 */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const session = getSession();
    if (!session?.refreshToken) return false;

    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        cache: "no-store",
      });

      if (!response.ok) {
        signOut();
        return false;
      }

      const payload = (await response.json()) as { tokens: TokenPair };

      signIn({
        ...session,
        token: payload.tokens.accessToken,
        refreshToken: payload.tokens.refreshToken,
        expiresAt: expiresAtIn(payload.tokens.expiresIn),
      });

      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Calls the backend through the `/api` rewrite in `next.config.ts`, so the
 * browser only ever talks to this origin. An expired access token is refreshed
 * once and the request retried.
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { auth = true, token } = options;
  const explicit = token !== undefined;
  const session = getSession();
  const bearer = explicit ? token : auth ? session?.token : undefined;

  let response = await perform(path, options, bearer);

  if (
    response.status === 401 &&
    auth &&
    !explicit &&
    session?.refreshToken &&
    (await refreshAccessToken())
  ) {
    response = await perform(path, options, getSession()?.token);
  }

  return parse<T>(response);
}

/** Multipart variant used by attendance check-in (photo + location). */
export async function apiForm<T>(
  path: string,
  formData: FormData,
  options: Omit<RequestOptions, "body" | "formData"> = {},
): Promise<T> {
  return api<T>(path, { ...options, formData });
}

/** Revokes the refresh token server-side. Best effort: local state always clears. */
export async function endSession(): Promise<void> {
  const session = getSession();

  try {
    if (session?.refreshToken) {
      await api<void>("/auth/logout", {
        method: "POST",
        body: { refreshToken: session.refreshToken },
        auth: false,
      });
    }
  } catch {
    // The token may already be expired or revoked; signing out locally is enough.
  }
}
