"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  attendanceTone,
  statusLabel,
  type AttendanceStatus,
} from "@/lib/attendance";
import { api } from "@/lib/api";
import { formatDateLabel, formatClockTime } from "@/lib/time";

type AttendanceSummary = {
  workingDays: number;
  presentDays: number;
  onTimeDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  notCheckedInDays: number;
};

type EmployeeView = {
  id: string;
  employeeNumber: string;
  fullName: string;
  division: string | null;
  employmentStatus: string;
};

type YearlyResponse = {
  employee: EmployeeView;
  year: number;
  summary: AttendanceSummary;
  punctualityRate: number;
};

type MonthlyResponse = {
  employee: EmployeeView;
  year: number;
  months: Array<AttendanceSummary & { month: number; label: string }>;
};

type HistoryRow = {
  date: string;
  status: AttendanceStatus;
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  actualCheckInLocal: string | null;
  actualCheckOutLocal: string | null;
  lateMinutes: number;
  photoUrl: string | null;
};

type HistoryResponse = {
  data: HistoryRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  employee: EmployeeView;
  year: number;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, index) => CURRENT_YEAR - index);

export function YearlyAttendance({ employeeId }: { employeeId: string }) {
  const [year, setYear] = React.useState(CURRENT_YEAR);
  const [page, setPage] = React.useState(1);
  const [yearly, setYearly] = React.useState<YearlyResponse | null>(null);
  const [monthly, setMonthly] = React.useState<MonthlyResponse | null>(null);
  const [history, setHistory] = React.useState<HistoryResponse | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    setError(null);

    void Promise.all([
      api<YearlyResponse>(`/reports/employees/${employeeId}/yearly?year=${year}`),
      api<MonthlyResponse>(`/reports/employees/${employeeId}/monthly?year=${year}`),
      api<HistoryResponse>(
        `/reports/employees/${employeeId}/history?year=${year}&page=${page}&limit=31`
      ),
    ])
      .then(([yearlyResult, monthlyResult, historyResult]) => {
        if (cancelled) return;
        setYearly(yearlyResult);
        setMonthly(monthlyResult);
        setHistory(historyResult);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "The report could not be loaded."
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId, year, page]);

  const employee = yearly?.employee;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight">
            {employee?.fullName ?? "Attendance report"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {employee
              ? `${employee.employeeNumber}${employee.division ? ` · ${employee.division}` : ""} · ${employee.employmentStatus}`
              : "Yearly attendance, monthly breakdown and daily history."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select
              value={String(year)}
              onValueChange={(value) => {
                setYear(Number(value ?? CURRENT_YEAR));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Link
            href={`/admin/dashboard/employees/${employeeId}`}
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "gap-1.5",
            })}
          >
            <Pencil className="size-4" />
            Edit employee
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {status === "loading" && !yearly ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Building the {year} report…
        </div>
      ) : yearly ? (
        <>
          <SummaryCards yearly={yearly} />

          {monthly && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly breakdown</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Month</th>
                      <th className="px-3 py-2 text-right font-medium">Working</th>
                      <th className="px-3 py-2 text-right font-medium">Present</th>
                      <th className="px-3 py-2 text-right font-medium">On time</th>
                      <th className="px-3 py-2 text-right font-medium">Late</th>
                      <th className="px-3 py-2 text-right font-medium">Absent</th>
                      <th className="px-3 py-2 text-right font-medium">Leave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.months.map((month) => (
                      <tr key={month.month} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{month.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {month.workingDays}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {month.presentDays}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                          {month.onTimeDays}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600">
                          {month.lateDays}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {month.absentDays}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {month.leaveDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Attendance history</CardTitle>
              <p className="text-sm text-muted-foreground">
                {history ? `${history.meta.total} days` : ""}
              </p>
            </CardHeader>

            <CardContent className="space-y-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Scheduled in</th>
                    <th className="px-3 py-2 font-medium">Actual in</th>
                    <th className="px-3 py-2 font-medium">Scheduled out</th>
                    <th className="px-3 py-2 font-medium">Actual out</th>
                    <th className="px-3 py-2 text-right font-medium">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {(history?.data ?? []).map((row) => {
                    const tone = attendanceTone[row.status];

                    return (
                      <tr key={row.date} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">
                          {formatDateLabel(row.date)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={tone.badge}>
                            {statusLabel(row.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.scheduledCheckIn
                            ? formatClockTime(row.scheduledCheckIn)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.actualCheckInLocal
                            ? formatClockTime(row.actualCheckInLocal)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.scheduledCheckOut
                            ? formatClockTime(row.scheduledCheckOut)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.actualCheckOutLocal
                            ? formatClockTime(row.actualCheckOutLocal)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.lateMinutes > 0 ? `${row.lateMinutes} min` : "—"}
                        </td>
                      </tr>
                    );
                  })}

                  {history && history.data.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-10 text-center text-muted-foreground"
                      >
                        No attendance history for {year}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {history && history.meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {history.meta.page} of {history.meta.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={history.meta.page <= 1 || status === "loading"}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      <ChevronLeft />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        history.meta.page >= history.meta.totalPages ||
                        status === "loading"
                      }
                      onClick={() =>
                        setPage((current) =>
                          Math.min(history.meta.totalPages, current + 1)
                        )
                      }
                    >
                      Next
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function SummaryCards({ yearly }: { yearly: YearlyResponse }) {
  const { summary } = yearly;

  const cards: Array<{ label: string; value: number; tone?: string }> = [
    { label: "Working days", value: summary.workingDays },
    { label: "Present", value: summary.presentDays },
    { label: "On time", value: summary.onTimeDays, tone: "text-emerald-600" },
    { label: "Late", value: summary.lateDays, tone: "text-rose-600" },
    { label: "Absent", value: summary.absentDays },
    { label: "On leave", value: summary.leaveDays },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="lg:col-span-1">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Punctuality</p>
          <p className="text-3xl font-bold tabular-nums">
            {yearly.punctualityRate.toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground">
            On-time days divided by present days
          </p>
        </CardContent>
      </Card>

      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p
              className={`text-3xl font-bold tabular-nums ${card.tone ?? ""}`}
            >
              {card.value}
            </p>
            {card.label === "Working days" && summary.notCheckedInDays > 0 && (
              <p className="text-xs text-muted-foreground">
                {summary.notCheckedInDays} still open today
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
