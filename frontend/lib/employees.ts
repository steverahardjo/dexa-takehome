"use client";

import { useSyncExternalStore } from "react";

import { api, apiForm } from "@/lib/api";
import type { AttendanceStatus } from "@/lib/attendance";
import { isAdminRole, type Role } from "@/lib/roles";
import { getSession, subscribeSession } from "@/lib/session";
import { todayInCompanyZone } from "@/lib/time";

export type EmploymentStatus = "ACTIVE" | "INACTIVE" | "TERMINATED";

export type Division = {
  id: string;
  name: string;
  description: string | null;
  employeeCount?: number;
};

export type Employee = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  employmentStatus: EmploymentStatus;
  joinedAt: string;
  terminatedAt: string | null;
  divisions: Division[];
};

/** What the create/edit form posts. */
export type NewEmployee = {
  fullName: string;
  email: string;
  phone?: string;
  joinedAt: string;
  divisionIds: string[];
  /** Honoured by the API only for MASTER_ADMIN callers. */
  role?: Role;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  late: boolean;
  lateMinutes: number;
  location: string | null;
  pictureUrl: string | null;
  requiredCheckIn: string | null;
  requiredCheckOut: string | null;
  timezone: string | null;
};

export type DashboardEmployee = {
  id: string;
  employeeNumber: string;
  name: string;
  division: string | null;
  status: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  lateMinutes: number;
  photoUrl: string | null;
};

export type DashboardSummary = {
  totalEmployees: number;
  checkedIn: number;
  onTime: number;
  late: number;
  notCheckedIn: number;
  onLeave: number;
  notWorking: number;
};

type Status = "idle" | "loading" | "ready" | "error";

export type DashboardState = {
  date: string | null;
  summary: DashboardSummary | null;
  employees: DashboardEmployee[];
  status: Status;
  error: string | null;
};

export type SignedInState = {
  employee: Employee | null;
  attendance: AttendanceRecord | null;
  status: Status;
  error: string | null;
};

type RawEmployee = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  employmentStatus: EmploymentStatus;
  joinedAt: string;
  terminatedAt: string | null;
  divisions?: Division[];
};

type RawDashboardEmployee = {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  division: string | null;
  status: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  lateMinutes: number;
  photoUrl: string | null;
};

type RawToday = {
  date: string;
  summary: DashboardSummary;
  employees: RawDashboardEmployee[];
};

type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const EMPTY_DASHBOARD: DashboardState = {
  date: null,
  summary: null,
  employees: [],
  status: "idle",
  error: null,
};

const EMPTY_SIGNED_IN: SignedInState = {
  employee: null,
  attendance: null,
  status: "idle",
  error: null,
};

let dashboardState: DashboardState = EMPTY_DASHBOARD;
let signedInState: SignedInState = EMPTY_SIGNED_IN;
let divisionsCache: Division[] | null = null;
let sessionBound = false;

const dashboardListeners = new Set<() => void>();
const signedInListeners = new Set<() => void>();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

function emit(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

function setDashboard(next: Partial<DashboardState>) {
  dashboardState = { ...dashboardState, ...next };
  emit(dashboardListeners);
}

function setSignedIn(next: SignedInState) {
  signedInState = next;
  emit(signedInListeners);
}

export function toEmployee(raw: RawEmployee): Employee {
  return {
    id: raw.id,
    employeeNumber: raw.employeeNumber,
    fullName: raw.fullName,
    email: raw.email,
    phone: raw.phone,
    employmentStatus: raw.employmentStatus,
    joinedAt: raw.joinedAt,
    terminatedAt: raw.terminatedAt,
    divisions: raw.divisions ?? [],
  };
}

function toDashboardEmployee(raw: RawDashboardEmployee): DashboardEmployee {
  return {
    id: raw.employeeId,
    employeeNumber: raw.employeeNumber,
    name: raw.employeeName,
    division: raw.division,
    status: raw.status,
    checkInTime: raw.checkInTime,
    checkOutTime: raw.checkOutTime,
    scheduledCheckIn: raw.scheduledCheckIn,
    scheduledCheckOut: raw.scheduledCheckOut,
    lateMinutes: raw.lateMinutes,
    photoUrl: raw.photoUrl,
  };
}

async function loadDashboard(): Promise<void> {
  const session = getSession();

  if (!session || !isAdminRole(session.role)) {
    setDashboard({ ...EMPTY_DASHBOARD, status: "ready" });
    return;
  }

  setDashboard({ status: "loading", error: null });

  try {
    const today = await api<RawToday>("/reports/attendance/today");

    setDashboard({
      date: today.date,
      summary: today.summary,
      employees: today.employees.map(toDashboardEmployee),
      status: "ready",
      error: null,
    });
  } catch (error) {
    setDashboard({ status: "error", error: messageOf(error) });
  }
}

async function fetchTodayAttendance(): Promise<AttendanceRecord | null> {
  const date = todayInCompanyZone();
  const page = await api<Paginated<AttendanceRecord>>(
    `/attendance/me?from=${date}&to=${date}&limit=1`
  );

  return page.data[0] ?? null;
}

async function loadSignedIn(): Promise<void> {
  const session = getSession();

  if (!session) {
    setSignedIn({ ...EMPTY_SIGNED_IN, status: "ready" });
    return;
  }

  setSignedIn({
    employee: signedInState.employee,
    attendance: signedInState.attendance,
    status: signedInState.employee ? signedInState.status : "loading",
    error: null,
  });

  try {
    const [employee, attendance] = await Promise.all([
      api<RawEmployee>("/employees/me"),
      fetchTodayAttendance(),
    ]);

    setSignedIn({
      employee: toEmployee(employee),
      attendance,
      status: "ready",
      error: null,
    });
  } catch (error) {
    setSignedIn({
      employee: null,
      attendance: null,
      status: "error",
      error: messageOf(error),
    });
  }
}

function refreshAll() {
  void loadDashboard();
  void loadSignedIn();
}

function bindSession() {
  if (sessionBound) return;

  sessionBound = true;
  subscribeSession(refreshAll);
}

function subscribeDashboard(listener: () => void) {
  dashboardListeners.add(listener);
  bindSession();

  if (dashboardState.status === "idle") void loadDashboard();

  return () => {
    dashboardListeners.delete(listener);
  };
}

function subscribeSignedIn(listener: () => void) {
  signedInListeners.add(listener);
  bindSession();

  if (signedInState.status === "idle") void loadSignedIn();

  return () => {
    signedInListeners.delete(listener);
  };
}

/** Today's company-wide attendance, shared by the admin screens. */
export function useDashboardState(): DashboardState {
  return useSyncExternalStore(
    subscribeDashboard,
    () => dashboardState,
    () => EMPTY_DASHBOARD
  );
}

/** The employee behind the signed-in token, plus today's attendance record. */
export function useSignedInState(): SignedInState {
  return useSyncExternalStore(
    subscribeSignedIn,
    () => signedInState,
    () => EMPTY_SIGNED_IN
  );
}

export function refreshDashboard(): Promise<void> {
  return loadDashboard();
}

export function refreshSignedInEmployee(): Promise<void> {
  return loadSignedIn();
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function fetchEmployee(employeeId: string): Promise<Employee> {
  return toEmployee(await api<RawEmployee>(`/employees/${employeeId}`));
}

export async function fetchDivisions(force = false): Promise<Division[]> {
  if (!force && divisionsCache) return divisionsCache;

  divisionsCache = await api<Division[]>("/divisions");
  return divisionsCache;
}

export async function addEmployee(input: NewEmployee): Promise<Employee> {
  const employee = await api<RawEmployee>("/employees", {
    method: "POST",
    body: {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      joinedAt: input.joinedAt,
      divisionIds: input.divisionIds,
      ...(input.role ? { role: input.role } : {}),
    },
  });

  await Promise.all([refreshDashboard(), refreshSignedInEmployee()]);

  return toEmployee(employee);
}

export async function updateEmployee(
  employeeId: string,
  input: NewEmployee
): Promise<Employee> {
  await api<RawEmployee>(`/employees/${employeeId}`, {
    method: "PATCH",
    body: {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() ? input.phone.trim() : null,
      joinedAt: input.joinedAt,
    },
  });

  await api<RawEmployee>(`/employees/${employeeId}/divisions`, {
    method: "PUT",
    body: { divisionIds: input.divisionIds },
  });

  await Promise.all([refreshDashboard(), refreshSignedInEmployee()]);

  return fetchEmployee(employeeId);
}

export async function terminateEmployee(
  employeeId: string,
  reason = "Terminated by an administrator"
): Promise<void> {
  await api<RawEmployee>(`/employees/${employeeId}/terminate`, {
    method: "POST",
    body: { reason },
  });

  await Promise.all([refreshDashboard(), refreshSignedInEmployee()]);
}

type CheckInDetails = {
  /** Scaled JPEG captured in the browser. */
  file?: File | null;
  /** `lat, lng` from the browser, when the user allowed it. */
  location?: string | null;
};

/**
 * Records today's check-in for the signed-in employee. The server stamps the
 * time, so a client clock cannot be used to fake punctuality.
 */
export async function clockIn({
  file,
  location,
}: CheckInDetails = {}): Promise<void> {
  const form = new FormData();

  if (file) form.append("picture", file);
  if (location) form.append("location", location);

  await apiForm<AttendanceRecord>("/attendance/check-in", form);
  await Promise.all([refreshSignedInEmployee(), refreshDashboard()]);
}

export async function clockOut(): Promise<void> {
  await api<AttendanceRecord>("/attendance/check-out", {
    method: "POST",
    body: {},
  });

  await Promise.all([refreshSignedInEmployee(), refreshDashboard()]);
}
