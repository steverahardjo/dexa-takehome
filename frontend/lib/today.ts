"use client";

import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import type { AttendanceStatus } from "@/lib/attendance";
import { isAdminRole } from "@/lib/roles";
import { getSession } from "@/lib/session";

/** One row of `GET /attendance/today`. Mirrors `TodayItem`. */
export type TodayItem = {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  lateMinutes: number;
  location: string | null;
  proofUrl: string | null;
};

/** Mirrors `TodayReport`: the server's own counters for the day. */
export type TodayReport = {
  date: string;
  /** WORKING_DAY | WEEKEND | HOLIDAY | UNKNOWN. */
  dayType: string;
  holidayName: string | null;
  totalEmployees: number;
  onTime: number;
  late: number;
  absent: number;
  notCheckedIn: number;
  items: TodayItem[];
};

type Status = "idle" | "loading" | "ready" | "error";

export type TodayReportState = {
  report: TodayReport | null;
  status: Status;
  error: string | null;
};

const EMPTY: TodayReportState = {
  report: null,
  status: "idle",
  error: null,
};

let state: TodayReportState = EMPTY;
let inFlight: Promise<void> | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Partial<TodayReportState>) {
  state = { ...state, ...next };
  emit();
}

/**
 * The company-wide report for today.
 *
 * The counters come from the attendance service, not from counting the employee
 * list in the browser: "not checked in" also covers people who are expected to
 * check in but have no row yet, and only the server knows that.
 */
export function refreshTodayReport(): Promise<void> {
  if (inFlight) return inFlight;

  if (!isAdminRole(getSession()?.role)) {
    setState({ report: null, status: "ready", error: null });
    return Promise.resolve();
  }

  setState({ status: "loading", error: null });

  inFlight = api<TodayReport>("/attendance/today")
    .then((report) => {
      setState({ report, status: "ready", error: null });
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

  if (state.status === "idle") void refreshTodayReport();

  return () => {
    listeners.delete(listener);
  };
}

export function useTodayReport(): TodayReportState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** The report row of one employee, or undefined when they are not listed. */
export function todayItemOf(
  report: TodayReport | null,
  employeeId: string,
): TodayItem | undefined {
  return report?.items.find((item) => item.employeeId === employeeId);
}
