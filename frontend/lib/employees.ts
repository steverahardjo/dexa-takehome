"use client";

import { useSyncExternalStore } from "react";

import { api, ApiError } from "@/lib/api";
import type { Attendance, CheckInPosition } from "@/lib/attendance";
import { isAdminRole, type Role } from "@/lib/roles";
import { getSession, subscribeSession } from "@/lib/session";

/** Mirrors `EmploymentStatus` in `backend/shared/enums/roles.enum.ts`. */
export type EmploymentStatus = "ACTIVE" | "INACTIVE" | "TERMINATED";

/**
 * The employee shape the API returns.
 *
 * Mirrors `EmployeeView` in `backend/shared/contracts/employee.contracts.ts`:
 * divisions are ids, and `avatarUrl` is a presigned URL that expires, so the
 * avatar is re-read rather than cached. There is no role here — the role lives
 * on the login identity, and the token is the only place the client sees it.
 */
export type Employee = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  employmentStatus: EmploymentStatus;
  /** `YYYY-MM-DD`. */
  joinedAt: string;
  terminatedAt: string | null;
  divisionIds: string[];
  avatarKey: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

/** `GET /employee/me`: the signed-in employee plus their day. */
export type MeView = Employee & {
  attendance: Attendance | null;
};

/**
 * `POST /admin/employees` body. `avatarKey` is required: the employee service
 * only accepts a key that points at an object the browser already uploaded.
 */
export type NewEmployee = {
  fullName: string;
  email: string;
  phone?: string;
  joinedAt: string;
  avatarKey: string;
  employeeNumber?: string;
  divisionIds?: string[];
  /** Only honoured when the caller is a master admin. */
  role?: Role;
};

/** `PATCH /admin/employees/:id`; only what is sent changes. */
export type EmployeeUpdate = {
  fullName?: string;
  email?: string;
  phone?: string | null;
  joinedAt?: string;
  avatarKey?: string;
  divisionIds?: string[];
};

type Status = "idle" | "loading" | "ready" | "error";

export type EmployeesState = {
  employees: Employee[];
  status: Status;
  error: string | null;
};

export type SignedInEmployeeState = {
  employee: MeView | null;
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

/** The employee list is admin-only; other roles simply see an empty list. */
function canReadEmployees(): boolean {
  return isAdminRole(getSession()?.role);
}

async function loadEmployees(): Promise<void> {
  if (!canReadEmployees()) {
    setEmployees({ employees: [], status: "ready", error: null });
    return;
  }

  setEmployees({ status: "loading", error: null });

  try {
    const page = await api<{ items: Employee[] }>("/admin/employees?limit=200");

    setEmployees({ employees: page.items, status: "ready", error: null });
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
    const me = await api<MeView>("/employee/me");

    setSignedIn({ employee: me, status: "ready", error: null });
  } catch (error) {
    // 403 means the identity is not linked to an employee yet; the phone screen
    // says so instead of pretending the request failed.
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
    () => EMPTY_EMPLOYEES,
  );
}

export function useEmployees(): Employee[] {
  return useEmployeesState().employees;
}

/** The employee behind the signed-in token, with their day. */
export function useSignedInEmployee(): SignedInEmployeeState {
  return useSyncExternalStore(
    subscribeSignedIn,
    () => signedInState,
    () => EMPTY_SIGNED_IN,
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

/** Replaces the stored data of an existing employee, keeping their attendance. */
export async function updateEmployee(
  employeeId: string,
  input: EmployeeUpdate,
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

/** Content types the storage service signs an avatar for. */
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PROOF_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type UploadUrl = {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
};

/**
 * Uploads a file straight to storage with a presigned URL and returns its key.
 *
 * The bytes never pass through the API: it only reserves the key and signs the
 * URL, so a phone photo does not have to be posted through the gateway.
 */
async function uploadFile(
  file: Blob,
  fileName: string,
  contentType: string,
  uploadUrlPath: string,
): Promise<string> {
  const upload = await api<UploadUrl>(uploadUrlPath, {
    method: "POST",
    body: { fileName, contentType },
  });

  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": contentType },
  });

  if (!response.ok) {
    throw new ApiError("The file could not be uploaded.", response.status);
  }

  return upload.key;
}

/**
 * Uploads an avatar and returns the key to store on the employee.
 *
 * Only jpeg, png and webp are signable, and the storage service checks that
 * the file name's extension agrees with the content type — so both come from
 * the same map instead of from whatever the phone named the photo.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const extension = AVATAR_TYPES[file.type];

  if (!extension) {
    throw new Error("The avatar must be a JPG, PNG or WebP image.");
  }

  return uploadFile(
    file,
    `avatar.${extension}`,
    file.type,
    "/admin/employees/avatar/upload-url",
  );
}

type ProofUpload = {
  /** Send this back as `proofKey`; the object is already in the bucket. */
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
  attendanceDate: string;
};

/**
 * Uploads the check-in photo straight to MinIO with a presigned URL: the bytes
 * never pass through the API, which only hands out the URL and records the key.
 */
async function uploadProof(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const contentType = PROOF_EXTENSIONS[blob.type] ? blob.type : "image/jpeg";

  const upload = await api<ProofUpload>("/attendance/proof-url", {
    method: "POST",
    body: {
      fileName: `proof.${PROOF_EXTENSIONS[contentType]}`,
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

type CheckInDetails = {
  /** Photo taken in the browser, as a JPEG data URL. Required by the API. */
  evidence: string;
  /** Where the browser was when the photo was sent. */
  position?: CheckInPosition | null;
};

/**
 * Records today's check-in: reserve a proof URL, PUT the photo to MinIO, then
 * send the key. The employee and the check-in time both come from the token and
 * the server clock — the request cannot name someone else or backdate itself.
 *
 * Returns the refreshed `/employee/me` view the gateway composes after the
 * write, so the screen does not need a second request.
 */
export async function clockIn({
  evidence,
  position = null,
}: CheckInDetails): Promise<MeView> {
  const proofKey = await uploadProof(evidence);

  const me = await api<MeView>("/attendance/check-in", {
    method: "POST",
    body: {
      proofKey,
      ...(position ? { location: coordinatesOf(position) } : {}),
    },
  });

  setSignedIn({ employee: me, status: "ready", error: null });

  return me;
}
