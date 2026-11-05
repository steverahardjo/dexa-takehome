"use client";

import { useSyncExternalStore } from "react";

import { parseRole, type Role } from "@/lib/roles";

export type Session = {
  email: string;
  /** Bearer token the API expects. */
  token: string;
  /** Role from the token's claims, used to gate the admin screens. */
  role: Role;
  /** Employee the identity is linked to, or null for an unlinked account. */
  employeeId: string | null;
  /** Unix seconds at which the token stops working. */
  expiresAt: number;
};

// Bumped because the stored role strings changed with the gateway refactor:
// an old session is dropped instead of being read as an unknown role.
const STORAGE_KEY = "absences:signed-in:v3";

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
      role: parseRole(parsed.role),
      employeeId:
        typeof parsed.employeeId === "string" ? parsed.employeeId : null,
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

export function useSignedInRole(): Role | null {
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
