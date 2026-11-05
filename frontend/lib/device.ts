"use client";

import { useSyncExternalStore } from "react";

/**
 * The single width at which this app switches between the phone experience
 * (employee check-in) and the laptop experience (admin dashboard). Keeping one
 * number means a device can never be locked out of both.
 */
export const DESKTOP_BREAKPOINT = 1024;

/** Tailwind's `lg` — used by the CSS gates so they match `useIsDesktop`. */
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_BREAKPOINT}px)`;

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);

  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;

const serverFalse = () => false;
const serverTrue = () => true;

/**
 * True on a laptop-sized viewport (>= 1024px).
 *
 * The server cannot know the viewport, so callers choose what to assume until
 * hydration: the admin gate assumes a laptop (phones are already redirected by
 * `proxy.ts`), while the workspace chooser assumes a phone (the safer default).
 */
export function useIsDesktop(assumeDesktopOnServer = false): boolean {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    assumeDesktopOnServer ? serverTrue : serverFalse
  );
}
