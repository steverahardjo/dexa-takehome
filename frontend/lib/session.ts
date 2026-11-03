"use client";

import { useSyncExternalStore } from "react";

export const SESSION_ROLES = ["Employee", "Manager", "HR Admin"] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];

export type Session = {
  email: string;
  /** Bearer token the API expects. */
  token: string;
  role: SessionRole;
  /** Unix seconds at which the token stops working. */
  expiresAt: number;
};

const STORAGE_KEY = "absences:signed-in:v2";

let snapshot: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function isExpired(session: Session): boolean {
  return session.expiresAt > 0 && session.expiresAt <= Date.now() / 1000;
}

function read(): Session | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Session>;

    if (typeof parsed.email !== "string" || typeof parsed.token !== "string") {
      return null;
    }

    const session: Session = {
      email: parsed.email,
      token: parsed.token,
      role: (parsed.role as SessionRole) ?? "Employee",
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0,
    };

    if (isExpired(session)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function getSnapshot(): Session | null {
  if (!loaded) {
    snapshot = read();
    loaded = true;
  }

  return snapshot && !isExpired(snapshot) ? snapshot : null;
}

function getServerSnapshot(): Session | null {
  return null;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);
  };
}

function handleStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;

  snapshot = read();
  emit();
}

/** Notifies non-React modules (the data stores) about a sign-in or sign-out. */
export function subscribeSession(listener: () => void): () => void {
  return subscribe(listener);
}

/** The signed-in session, or null. Safe to call outside React. */
export function getSession(): Session | null {
  return getSnapshot();
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Email of the employee signed in on this browser, or `null`. */
export function useSignedInEmail(): string | null {
  return useSession()?.email ?? null;
}

export function useSignedInRole(): SessionRole | null {
  return useSession()?.role ?? null;
}

/** Unix seconds at which a token issued now stops working. */
export function expiresAtIn(seconds: number) {
  return Math.floor(Date.now() / 1000) + seconds
}

export function signIn(session: Session) {
  snapshot = {
    ...session,
    email: session.email.trim().toLowerCase(),
  };
  loaded = true;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage can be unavailable; the in-memory value still works.
    }
  }

  emit();
}

export function signOut() {
  snapshot = null;
  loaded = true;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore: the in-memory value is already cleared.
    }
  }

  emit();
}
