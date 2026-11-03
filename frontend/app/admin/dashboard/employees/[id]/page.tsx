import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EditEmployeeForm } from "@/components/edit-employee-form";

export const metadata = {
  title: "Change employee — Absences",
  description: "Load an employee's current details and update them.",
};

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

      <EditEmployeeForm employeeId={id} />
    </div>
  );
}
