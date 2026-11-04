import { Suspense } from "react";

import { YearlyAttendance } from "@/components/employees/yearly-attendance";

export const metadata = {
  title: "Yearly attendance — Absences",
  description: "Yearly attendance, monthly breakdown and daily history.",
};

/**
 * The id is request-time data, so it is resolved inside a boundary: the shell
 * stays static and only the report waits for the API.
 */
export default function YearlyAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      {params.then(({ id }) => (
        <YearlyAttendance employeeId={id} />
      ))}
    </Suspense>
  );
}

function ReportSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <p className="font-medium">Loading attendance report…</p>
      <p className="text-sm text-muted-foreground">
        Building the yearly summary from the reporting service.
      </p>
    </div>
  );
}
