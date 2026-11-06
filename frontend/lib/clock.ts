"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const interval = setInterval(onTick, 1000);

  return () => clearInterval(interval);
}

// Whole seconds keep the snapshot stable between ticks so React does not
// re-render in a loop, while still updating once per second.
function getSnapshot() {
  return Math.floor(Date.now() / 1000);
}

// `null` on the server keeps prerendered markup and the first client render
// identical; the ticking value arrives right after hydration.
function getServerSnapshot(): number | null {
  return null;
}

/** Unix timestamp in seconds, ticking every second. `null` before hydration. */
export function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const noopSubscribe = () => () => {};

function formatToday() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/** Today's date in local time. `null` before hydration. */
export function useTodayLabel(): string | null {
  return useSyncExternalStore(noopSubscribe, formatToday, () => null);
}
