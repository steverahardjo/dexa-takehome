"use client";

import { useSyncExternalStore } from "react";

import type { CapturePosition } from "@/lib/attendance-capture";

export const ROLES = ["Employee", "Manager", "HR Admin"] as const;
export type Role = (typeof ROLES)[number];

export type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  division: string;
  address: string;
  contractExpiry: string;
  leaveBalance: number;
  /** `HH:mm`, local time. */
  workStart: string;
  /** `HH:mm`, local time. */
  workEnd: string;
  /** `HH:mm` local time today when the employee checked in, or `null`. */
  clockInAt: string | null;
  avatar?: string;
  /** Photo evidence uploaded with the check-in (image URL). */
  evidence?: string;
  /** Where the phone was when the check-in photo was sent. */
  checkInPosition?: CapturePosition | null;
};

export type NewEmployee = Omit<Employee, "id" | "clockInAt">;

const STORAGE_KEY = "absences:employees:v2";

const seedEmployees: Employee[] = [
  {
    id: "seed-1",
    name: "John Doe",
    email: "john@company.com",
    phone: "+62 812 3456 7890",
    role: "HR Admin",
    division: "People Operations",
    address: "Jl. Sudirman 12, Jakarta",
    contractExpiry: "2026-12-31",
    leaveBalance: 12,
    workStart: "08:00",
    workEnd: "17:00",
    clockInAt: "07:52",
    avatar: "https://i.pravatar.cc/160?img=12",
    evidence: "https://picsum.photos/seed/wfh-evidence-1/900/1200",
  },
  {
    id: "seed-2",
    name: "Jane Smith",
    email: "jane@company.com",
    phone: "+62 812 4567 8901",
    role: "Employee",
    division: "Engineering",
    address: "Jl. Kemang 4, Jakarta",
    contractExpiry: "2026-11-15",
    leaveBalance: -2,
    workStart: "09:00",
    workEnd: "18:00",
    clockInAt: "08:55",
    avatar: "https://i.pravatar.cc/160?img=45",
    evidence: "https://picsum.photos/seed/wfh-evidence-2/900/1200",
  },
  {
    id: "seed-3",
    name: "Michael Tan",
    email: "michael@company.com",
    phone: "+62 812 5678 9012",
    role: "Manager",
    division: "Engineering",
    address: "Jl. Senopati 8, Jakarta",
    contractExpiry: "2027-03-20",
    leaveBalance: 5,
    workStart: "10:00",
    workEnd: "19:00",
    clockInAt: "10:14",
    avatar: "https://i.pravatar.cc/160?img=33",
    evidence: "https://picsum.photos/seed/wfh-evidence-3/900/1200",
  },
];

let snapshot: Employee[] | null = null;
let storageBound = false;
const listeners = new Set<() => void>();

function isEmployee(value: unknown): value is Employee {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.workStart === "string" &&
    typeof candidate.workEnd === "string"
  );
}

function readFromStorage(): Employee[] {
  if (typeof window === "undefined") return seedEmployees;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedEmployees;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedEmployees;

    const employees = parsed.filter(isEmployee);

    return employees.length > 0 ? employees : seedEmployees;
  } catch {
    return seedEmployees;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function bindStorage() {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;

  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;

    snapshot = readFromStorage();
    emit();
  });
}

function getSnapshot(): Employee[] {
  if (snapshot === null) {
    snapshot = readFromStorage();
  }

  return snapshot;
}

function getServerSnapshot(): Employee[] {
  return seedEmployees;
}

function persist(next: Employee[]) {
  snapshot = next;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode, quota); keep in-memory state.
    }
  }

  emit();
}

function subscribe(listener: () => void) {
  bindStorage();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `employee-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function nowAsTime(now: Date) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
}

/** All employees, shared across the app and persisted to localStorage. */
export function useEmployees(): Employee[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addEmployee(input: NewEmployee): Employee {
  const employee: Employee = { ...input, id: createId(), clockInAt: null };

  persist([...getSnapshot(), employee]);

  return employee;
}

/** Replaces the stored data of an existing employee, keeping its check-in. */
export function updateEmployee(employeeId: string, input: NewEmployee) {
  persist(
    getSnapshot().map((employee) =>
      employee.id === employeeId
        ? {
            ...input,
            id: employee.id,
            clockInAt: employee.clockInAt,
            checkInPosition: employee.checkInPosition,
          }
        : employee
    )
  );
}

type CheckInDetails = {
  /** Local time of the check-in, defaults to now. */
  at?: Date;
  /** Photo evidence taken on the phone (image data URL). */
  evidence?: string;
  /** Where the phone was when the photo was sent. */
  position?: CapturePosition | null;
  /** Overwrite an existing check-in instead of leaving it alone. */
  replace?: boolean;
};

/** Records a check-in for today together with the photo and position it came with. */
export function clockIn(
  employeeId: string,
  { at = new Date(), evidence, position = null, replace = false }: CheckInDetails = {}
) {
  const clockInAt = nowAsTime(at);

  persist(
    getSnapshot().map((employee) =>
      employee.id === employeeId && (replace || employee.clockInAt === null)
        ? {
            ...employee,
            clockInAt,
            evidence: evidence ?? employee.evidence,
            checkInPosition: position,
          }
        : employee
    )
  );
}
