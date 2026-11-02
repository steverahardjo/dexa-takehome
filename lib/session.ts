"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "absences:signed-in:v1";

let snapshot: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): string | null {
  if (!loaded) {
    snapshot = read();
    loaded = true;
  }

  return snapshot;
}

function getServerSnapshot(): string | null {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function write(email: string | null) {
  snapshot = email;
  loaded = true;

  if (typeof window !== "undefined") {
    try {
      if (email) window.localStorage.setItem(STORAGE_KEY, email);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable; the in-memory value still works.
    }
  }

  emit();
}

/** Email of the employee signed in on this browser, or `null`. */
export function useSignedInEmail(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function signIn(email: string) {
  write(email.trim().toLowerCase());
}

export function signOut() {
  write(null);
}
