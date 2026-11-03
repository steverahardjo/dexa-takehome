"use client";

import Link from "next/link";
import { UserRoundX } from "lucide-react";

import { EmployeeForm } from "@/components/employee-form";
import { Card, CardContent } from "@/components/ui/card";
import { useEmployees } from "@/lib/employees";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Looks the employee up in the shared store and renders the form prefilled with
 * the current data. Stored employees only exist after hydration, so a skeleton
 * is shown until then.
 */
export function EditEmployeeForm({ employeeId }: { employeeId: string }) {
  const employees = useEmployees();
  const hydrated = useHydrated();
  const employee = employees.find((item) => item.id === employeeId);

  if (!employee) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          {hydrated ? (
            <>
              <UserRoundX className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Employee not found</p>
              <p className="text-sm text-muted-foreground">
                It may have been removed from this browser.
              </p>
              <Link
                href="/admin/dashboard"
                className="text-sm underline underline-offset-4"
              >
                Back to dashboard
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium">Loading employee…</p>
              <p className="text-sm text-muted-foreground">
                Reading the saved data from this browser.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return <EmployeeForm employee={employee} />;
}
