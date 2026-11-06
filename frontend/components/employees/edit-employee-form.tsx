"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserRoundX } from "lucide-react";

import { EmployeeForm } from "@/components/employees/employee-form";
import { Card, CardContent } from "@/components/ui/card";
import {
  getEmployee,
  useEmployeesState,
  type Employee,
} from "@/lib/employees";

/** The direct read, keyed by the id it was made for. */
type Lookup = {
  employeeId: string | null;
  employee: Employee | null;
  error: string | null;
};

const NOT_LOOKED_UP: Lookup = { employeeId: null, employee: null, error: null };

/**
 * Renders the form for one employee.
 *
 * The shared store comes first because it is already in memory on the way from
 * the dashboard. It only lists ACTIVE people though (the directory's default),
 * so an inactive or terminated person is read from the API by id — otherwise an
 * existing employee would be reported as missing.
 */
export function EditEmployeeForm({ employeeId }: { employeeId: string }) {
  const { employees, status, error } = useEmployeesState();
  const stored = employees.find((item) => item.id === employeeId);
  const isStoreBusy = status === "idle" || status === "loading";

  const [lookup, setLookup] = useState<Lookup>(NOT_LOOKED_UP);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (stored || isStoreBusy) return;
    if (requested.current === employeeId) return;

    requested.current = employeeId;
    let cancelled = false;

    getEmployee(employeeId)
      .then((employee) => {
        if (!cancelled) {
          setLookup({ employeeId, employee, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLookup({
            employeeId,
            employee: null,
            error:
              cause instanceof Error ? cause.message : "Permintaan gagal.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stored, isStoreBusy, employeeId]);

  /** A direct read only counts for the id it was made for. */
  const direct = lookup.employeeId === employeeId ? lookup : NOT_LOOKED_UP;
  const employee = stored ?? direct.employee;

  if (!employee) {
    // A direct lookup that has not answered yet is still a missing employee.
    const isLoading = isStoreBusy || direct.employeeId === null;

    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          {isLoading ? (
            <>
              <p className="font-medium">Memuat karyawan…</p>
              <p className="text-sm text-muted-foreground">
                Membaca data tersimpan dari API.
              </p>
            </>
          ) : (
            <>
              <UserRoundX className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Karyawan tidak ditemukan</p>
              <p className="text-sm text-muted-foreground">
                {direct.error ??
                  (status === "error" && error
                    ? error
                    : "Mungkin sudah dihapus oleh admin lain.")}
              </p>
              <Link
                href="/admin/dashboard"
                className="text-sm underline underline-offset-4"
              >
                Kembali ke dasbor
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return <EmployeeForm employee={employee} />;
}
