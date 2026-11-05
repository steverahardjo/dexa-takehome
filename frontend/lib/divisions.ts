"use client";

import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import { getSession } from "@/lib/session";

/** Mirrors `DivisionView` in `backend/shared/contracts/employee.contracts.ts`. */
export type Division = {
  id: string;
  name: string;
  description: string | null;
};

type Status = "idle" | "loading" | "ready" | "error";

export type DivisionsState = {
  divisions: Division[];
  status: Status;
  error: string | null;
};

const EMPTY: DivisionsState = {
  divisions: [],
  status: "idle",
  error: null,
};

let state: DivisionsState = EMPTY;
let inFlight: Promise<void> | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Partial<DivisionsState>) {
  state = { ...state, ...next };
  emit();
}

/**
 * Reads every division once. The list is tiny and changes rarely, so it is
 * cached for the tab and shared by the dashboard and the employee form.
 */
export function refreshDivisions(): Promise<void> {
  if (inFlight) return inFlight;

  if (!getSession()) {
    setState({ divisions: [], status: "ready", error: null });
    return Promise.resolve();
  }

  setState({ status: "loading", error: null });

  inFlight = api<Division[]>("/admin/divisions")
    .then((divisions) => {
      setState({ divisions, status: "ready", error: null });
    })
    .catch((cause: unknown) => {
      setState({
        status: "error",
        error:
          cause instanceof Error ? cause.message : "The request failed.",
      });
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (state.status === "idle") void refreshDivisions();

  return () => {
    listeners.delete(listener);
  };
}

export function useDivisionsState(): DivisionsState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** Names of the divisions an employee belongs to, in list order. */
export function divisionNames(
  divisions: Division[],
  divisionIds: string[],
): string[] {
  return divisions
    .filter((division) => divisionIds.includes(division.id))
    .map((division) => division.name);
}
