import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EditEmployeeForm } from "@/components/employees/edit-employee-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Change employee — Absences",
  description: "Load an employee's current details and update them.",
};

/**
 * The id is request-time data, so it is resolved inside a boundary: the heading
 * and the back link stay in the static shell and only the card waits.
 */
export default function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Change employee</h1>
        <p className="text-sm text-muted-foreground">
          The current card is loaded below — adjust anything and save to update
          the dashboard.
        </p>
      </div>

      <Suspense fallback={<EmployeeFormSkeleton />}>
        {params.then(({ id }) => (
          <EditEmployeeForm employeeId={id} />
        ))}
      </Suspense>
    </div>
  );
}

/**
 * Mirrors the card the form shows while it waits for the employee list, so the
 * swap to the loaded form does not move the page around.
 */
function EmployeeFormSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
        <p className="font-medium">Loading employee…</p>
        <p className="text-sm text-muted-foreground">
          Reading the saved data from the API.
        </p>
      </CardContent>
    </Card>
  );
}
