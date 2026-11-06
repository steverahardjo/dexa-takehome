"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  Hourglass,
  LogOut,
  Plus,
  Search,
  UserRoundX,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeCard } from "@/components/employees/employee-card";
import {
  ATTENDANCE_STATUSES,
  attendanceTone,
  type AttendanceStatus,
} from "@/lib/attendance";
import { useTodayLabel } from "@/lib/clock";
import { useDivisionsState } from "@/lib/divisions";
import { useEmployeesState } from "@/lib/employees";
import { isAdminRole } from "@/lib/roles";
import { signOut, useSession } from "@/lib/session";
import { useTodayReport } from "@/lib/today";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  ON_TIME: "Checked in",
  LATE: "Late",
  ABSENT: "Absent",
  NOT_CHECKED_IN: "Not yet",
  ON_LEAVE: "On leave",
  NOT_WORKING: "Not a work day",
};

type StatusFilter = "all" | AttendanceStatus;

/**
 * The HR view: everyone, today's counters and each person's day.
 *
 * Counters come from `GET /attendance/today` rather than from counting rows in
 * the browser, and each card is joined to its own row in that report.
 */
export default function EmployeeDashboard() {
  const session = useSession();
  const { employees, status, error } = useEmployeesState();
  const { report, status: reportStatus, error: reportError } = useTodayReport();
  const { divisions } = useDivisionsState();
  const today = useTodayLabel();

  const [search, setSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<StatusFilter>("all");
  const [divisionId, setDivisionId] = useState("all");

  const byEmployeeId = useMemo(() => {
    return new Map(
      (report?.items ?? []).map((item) => [item.employeeId, item]),
    );
  }, [report]);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch =
        !needle ||
        employee.fullName.toLowerCase().includes(needle) ||
        employee.email.toLowerCase().includes(needle) ||
        employee.employeeNumber.toLowerCase().includes(needle);

      const attendance = byEmployeeId.get(employee.id);
      const matchesStatus =
        attendanceFilter === "all" ||
        (attendance?.status ?? "NOT_CHECKED_IN") === attendanceFilter;

      const matchesDivision =
        divisionId === "all" || employee.divisionIds.includes(divisionId);

      return matchesSearch && matchesStatus && matchesDivision;
    });
  }, [employees, byEmployeeId, search, attendanceFilter, divisionId]);

  if (!session) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="space-y-2 text-center">
          <p className="font-medium">Sign in to open the dashboard</p>
          <p className="text-sm text-muted-foreground">
            The dashboard reads the employee directory from the gateway.
          </p>
          <Link href="/" className="text-sm underline underline-offset-4">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!isAdminRole(session.role)) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="font-medium">This dashboard needs an admin account</p>
          <p className="text-sm text-muted-foreground">
            You are signed in as {session.email} ({session.role}).
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link href="/employee" className="text-sm underline underline-offset-4">
              Go to my check-in
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Absences &amp; WFH
          </h1>
          <p className="text-sm text-muted-foreground">
            Everyone is working from home — track who checked in today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span suppressHydrationWarning>{today ?? "\u00a0"}</span>
          </div>

          <Link
            href="/admin/dashboard/employees/new"
            aria-label="Add employee"
            className={buttonVariants({ size: "lg", className: "gap-1.5" })}
          >
            <Plus className="size-4" />
            Add employee
          </Link>

          <Link
            href="/choose"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "gap-1.5",
            })}
          >
            Switch workspace
          </Link>

          <Button
            variant="ghost"
            size="lg"
            className="gap-1.5"
            onClick={signOut}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </header>

      {(status === "error" || reportStatus === "error") && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error ?? reportError}
        </div>
      )}

      {report && report.dayType !== "WORKING_DAY" && (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {report.dayType === "HOLIDAY"
            ? `Today is a national holiday${report.holidayName ? ` (${report.holidayName})` : ""}, so no check-in is expected.`
            : report.dayType === "WEEKEND"
              ? "Today is a weekend, so no check-in is expected."
              : "The holiday calendar is unavailable, so today's status is unknown."}
        </div>
      )}

      {/* Statistics */}
      <AttendanceStats report={report} />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Employee Filters
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={attendanceFilter}
              onValueChange={(value) =>
                setAttendanceFilter((value ?? "all") as StatusFilter)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by attendance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any attendance</SelectItem>
                {ATTENDANCE_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={divisionId}
              onValueChange={(value) => setDivisionId(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All divisions</SelectItem>
                {divisions.map((division) => (
                  <SelectItem key={division.id} value={division.id}>
                    {division.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setAttendanceFilter("all");
                setDivisionId("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Employee List */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Employees</h2>
        <Badge variant="secondary">
          {filteredEmployees.length} results
        </Badge>
        {report && (
          <Badge variant="outline">{report.totalEmployees} expected</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredEmployees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            today={byEmployeeId.get(employee.id)}
            divisions={divisions}
          />
        ))}

        {(status === "idle" || status === "loading") && (
          <div className="col-span-full rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Loading employees…
          </div>
        )}

        {status === "ready" && filteredEmployees.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">No employees found</p>
            <p className="text-sm text-muted-foreground">
              Try changing your search or filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The server's counters. "Not yet" and "absent" are separate: the first is
 * someone expected to check in who has no row yet, the second is the sweep's
 * verdict after the cut-off.
 */
function AttendanceStats({
  report,
}: {
  report: ReturnType<typeof useTodayReport>["report"];
}) {
  const stats = [
    {
      status: "ON_TIME" as const,
      label: "Checked in",
      hint: "Submitted a check-in today",
      value: report?.onTime ?? 0,
      Icon: CheckCircle2,
    },
    {
      status: "LATE" as const,
      label: "Late",
      hint: "Checked in after the cut-off",
      value: report?.late ?? 0,
      Icon: Clock,
    },
    {
      status: "NOT_CHECKED_IN" as const,
      label: "Not yet",
      hint: "Expected, but no check-in yet",
      value: report?.notCheckedIn ?? 0,
      Icon: Hourglass,
    },
    {
      status: "ABSENT" as const,
      label: "Absent",
      hint: "Marked absent by the sweep",
      value: report?.absent ?? 0,
      Icon: UserRoundX,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(({ status, label, hint, value, Icon }) => {
        const tone = attendanceTone[status];

        return (
          <Card key={status} className={tone.card}>
            <CardContent className="flex items-center gap-4 p-5">
              <Icon className={`h-8 w-8 ${tone.icon}`} />
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold tabular-nums ${tone.value}`}>
                  {value}
                </p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
