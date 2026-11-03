import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EmployeeForm } from "@/components/employee-form";

export const metadata = {
  title: "Add employee — Absences",
  description: "Add a new employee with their work start time and leave balance.",
};

export default function NewEmployeePage() {
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

        <h1 className="text-2xl font-semibold tracking-tight">Add employee</h1>
        <p className="text-sm text-muted-foreground">
          Enter the employee data once, then track their work start countdown
          and leave balance on the dashboard.
        </p>
      </div>

      <EmployeeForm />
    </div>
  );
}
