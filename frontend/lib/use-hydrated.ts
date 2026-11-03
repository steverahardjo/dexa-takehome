"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** `false` during SSR and hydration, `true` once the client owns the tree. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
