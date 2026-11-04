"use client";

import * as React from "react";
import Link from "next/link";
import { UserRoundX } from "lucide-react";

import { EmployeeForm } from "@/components/employees/employee-form";
import { Card, CardContent } from "@/components/ui/card";
import { fetchEmployee, type Employee } from "@/lib/employees";

/**
 * Loads the employee by id and renders the form prefilled with the current
 * data. The list page does not have to be visited first.
 */
export function EditEmployeeForm({ employeeId }: { employeeId: string }) {
  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void fetchEmployee(employeeId)
      .then((result) => {
        if (cancelled) return;
        setEmployee(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "The employee could not be loaded."
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (!employee) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          {status === "loading" ? (
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
                {error ?? "It may have been removed by another admin."}
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
