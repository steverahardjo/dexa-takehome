"use client";

import { useSyncExternalStore } from "react";

import { api, ApiError } from "@/lib/api";
import type { CheckInPosition } from "@/lib/attendance";
import { getSession, subscribeSession } from "@/lib/session";

export const ROLES = ["Employee", "Manager", "HR Admin"] as const;
export type Role = (typeof ROLES)[number];

/** The divisions the employee form offers; the form is a single-choice MCQ. */
export const DIVISIONS = [
  "Sales",
  "Human Resources",
  "Engineering",
  "Finance",
  "Operations",
] as const;
export type Division = (typeof DIVISIONS)[number];

/** The employee shape the API returns and every screen renders. */
export type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  division: Division;
  address: string;
  contractExpiry: string;
  /** `HH:mm` local time today when the employee checked in, or `null`. */
  clockInAt: string | null;
  /** Today's check-in was after 09:00: the card shows the red status. */
  late?: boolean;
  avatar?: string;
  /** Photo evidence uploaded with the check-in (image URL or data URL). */
  evidence?: string;
  /** Where the browser was when the check-in photo was sent. */
  checkInPosition?: CheckInPosition | null;
};

/** What the admin form posts. `division` is empty only before a choice is made. */
export type NewEmployee = {
  name: string;
  email: string;
  phone: string;
  role: Role;
  division: Division | "";
  address: string;
  contractExpiry: string;
  avatar?: string;
};

type Status = "idle" | "loading" | "ready" | "error";

export type EmployeesState = {
  employees: Employee[];
  status: Status;
  error: string | null;
};

export type SignedInEmployeeState = {
  employee: Employee | null;
  status: Status;
  error: string | null;
};

const EMPTY_EMPLOYEES: EmployeesState = {
  employees: [],
  status: "idle",
  error: null,
};

const EMPTY_SIGNED_IN: SignedInEmployeeState = {
  employee: null,
  status: "idle",
  error: null,
};

let employeesState: EmployeesState = EMPTY_EMPLOYEES;
let signedInState: SignedInEmployeeState = EMPTY_SIGNED_IN;
let sessionBound = false;

const employeeListeners = new Set<() => void>();
const signedInListeners = new Set<() => void>();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

function emit(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

function setEmployees(next: Partial<EmployeesState>) {
  employeesState = { ...employeesState, ...next };
  emit(employeeListeners);
}

function setSignedIn(next: SignedInEmployeeState) {
  signedInState = next;
  emit(signedInListeners);
}

/** The employee list is HR-only; other roles simply see an empty list. */
function canReadEmployees(): boolean {
  return getSession()?.role === "HR Admin";
}

async function loadEmployees(): Promise<void> {
  if (!canReadEmployees()) {
    setEmployees({ employees: [], status: "ready", error: null });
    return;
  }

  setEmployees({ status: "loading", error: null });

  try {
    const page = await api<{ data: Employee[] }>("/admin/employees?limit=200");

    setEmployees({ employees: page.data, status: "ready", error: null });
  } catch (error) {
    setEmployees({ status: "error", error: messageOf(error) });
  }
}

async function loadSignedIn(): Promise<void> {
  if (!getSession()) {
    setSignedIn({ ...EMPTY_SIGNED_IN, status: "ready" });
    return;
  }

  setSignedIn({
    employee: signedInState.employee,
    status: signedInState.employee ? signedInState.status : "loading",
    error: null,
  });

  try {
    const employee = await api<Employee>("/employee/me");

    setSignedIn({ employee, status: "ready", error: null });
  } catch (error) {
    setSignedIn({ employee: null, status: "error", error: messageOf(error) });
  }
}

/** Re-reads both stores after a sign-in, sign-out or a write. */
function refreshStores() {
  void loadEmployees();
  void loadSignedIn();
}

function bindSession() {
  if (sessionBound) return;

  sessionBound = true;
  subscribeSession(refreshStores);
}

function subscribeEmployees(listener: () => void) {
  employeeListeners.add(listener);
  bindSession();

  if (employeesState.status === "idle") void loadEmployees();

  return () => {
    employeeListeners.delete(listener);
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

/** All employees, shared across the admin screens. */
export function useEmployeesState(): EmployeesState {
  return useSyncExternalStore(
    subscribeEmployees,
    () => employeesState,
    () => EMPTY_EMPLOYEES
  );
}

export function useEmployees(): Employee[] {
  return useEmployeesState().employees;
}

/** The employee behind the signed-in token. */
export function useSignedInEmployee(): SignedInEmployeeState {
  return useSyncExternalStore(
    subscribeSignedIn,
    () => signedInState,
    () => EMPTY_SIGNED_IN
  );
}

export function refreshEmployees(): Promise<void> {
  return loadEmployees();
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

export async function addEmployee(input: NewEmployee): Promise<Employee> {
  const employee = await api<Employee>("/admin/employees", {
    method: "POST",
    body: input,
  });

  await refreshEmployees();

  return employee;
}

/** Replaces the stored data of an existing employee, keeping their check-in. */
export async function updateEmployee(
  employeeId: string,
  input: NewEmployee
): Promise<Employee> {
  const employee = await api<Employee>(`/admin/employees/${employeeId}`, {
    method: "PATCH",
    body: input,
  });

  await refreshEmployees();

  return employee;
}

export async function deleteEmployee(employeeId: string): Promise<void> {
  await api<void>(`/admin/employees/${employeeId}`, { method: "DELETE" });

  await refreshEmployees();
}

type CheckInDetails = {
  /** Photo evidence taken in the browser (image data URL). */
  evidence?: string;
  /** Where the browser was when the photo was sent. */
  position?: CheckInPosition | null;
};

type ProofUpload = {
  /** Send this back as `proofKey`; the object is already in the bucket. */
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
  attendanceDate: string;
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Uploads the photo straight to MinIO with a presigned URL: the bytes never
 * pass through the API, which only hands out the URL and records the key.
 */
async function uploadProof(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const contentType = EXTENSIONS[blob.type] ? blob.type : "image/jpeg";

  const upload = await api<ProofUpload>("/attendance/proof-url", {
    method: "POST",
    body: {
      fileName: `proof.${EXTENSIONS[contentType]}`,
      contentType,
    },
  });

  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "content-type": contentType },
  });

  if (!response.ok) {
    throw new ApiError("The photo could not be uploaded.", response.status);
  }

  return upload.key;
}

/** Degrees × 1e6 on the wire -> a "lat, lng" pair the backend stores. */
function coordinatesOf(position: CheckInPosition): string {
  return `${(position.latitude / 1_000_000).toFixed(5)}, ${(
    position.longitude / 1_000_000
  ).toFixed(5)}`;
}

/**
 * Records today's check-in: reserve a proof URL, PUT the photo to MinIO, then
 * send the key. The employee and the check-in time both come from the token and
 * the server clock — the request cannot name someone else or backdate itself.
 */
export async function clockIn({
  evidence,
  position = null,
}: CheckInDetails = {}): Promise<void> {
  if (!evidence) {
    throw new Error("Take a photo before checking in.");
  }

  const proofKey = await uploadProof(evidence);

  await api("/attendance/check-in", {
    method: "POST",
    body: {
      proofKey,
      ...(position ? { location: coordinatesOf(position) } : {}),
    },
  });

  await Promise.all([refreshEmployees(), refreshSignedInEmployee()]);
}
