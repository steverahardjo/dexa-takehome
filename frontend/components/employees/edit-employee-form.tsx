"use client";

import Link from "next/link";
import { UserRoundX } from "lucide-react";

import { EmployeeForm } from "@/components/employees/employee-form";
import { Card, CardContent } from "@/components/ui/card";
import { useEmployeesState } from "@/lib/employees";

/**
 * Looks the employee up in the shared store and renders the form prefilled with
 * the current data. The store is filled from the API, so a skeleton is shown
 * until the first response lands.
 */
export function EditEmployeeForm({ employeeId }: { employeeId: string }) {
  const { employees, status, error } = useEmployeesState();
  const employee = employees.find((item) => item.id === employeeId);
  const isLoading = status === "idle" || status === "loading";

  if (!employee) {
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
                {status === "error" && error
                  ? error
                  : "Mungkin sudah dihapus oleh admin lain."}
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
