"use client";

import Link from "next/link";
import { UserRoundX } from "lucide-react";

import { EmployeeForm } from "@/components/employee-form";
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
              <p className="font-medium">Loading employee…</p>
              <p className="text-sm text-muted-foreground">
                Reading the saved data from the API.
              </p>
            </>
          ) : (
            <>
              <UserRoundX className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Employee not found</p>
              <p className="text-sm text-muted-foreground">
                {status === "error" && error
                  ? error
                  : "It may have been removed by another admin."}
              </p>
              <Link
                href="/admin/dashboard"
                className="text-sm underline underline-offset-4"
              >
                Back to dashboard
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return <EmployeeForm employee={employee} />;
}
