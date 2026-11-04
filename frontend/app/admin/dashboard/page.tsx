"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  Hourglass,
  LogOut,
  MinusCircle,
  Plane,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useTodayLabel } from "@/lib/clock";
import {
  useDashboardState,
  refreshDashboard,
  type DashboardEmployee,
} from "@/lib/employees";
import {
  ATTENDANCE_STATUSES,
  attendanceTone,
  statusLabel,
  type AttendanceStatus,
} from "@/lib/attendance";
import { isAdminRole } from "@/lib/roles";
import { signOut, useSession } from "@/lib/session";
import { formatDateLabel } from "@/lib/time";

export default function EmployeeDashboard() {
  const session = useSession();
  const { date, summary, employees, status, error } = useDashboardState();
  const today = useTodayLabel();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [division, setDivision] = useState("all");

  const divisions = useMemo(() => {
    const names = new Set<string>();
    for (const employee of employees) {
      if (employee.division) names.add(employee.division);
    }
    return [...names].sort();
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesQuery =
        !query ||
        employee.name.toLowerCase().includes(query) ||
        employee.employeeNumber.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || employee.status === statusFilter;

      const matchesDivision =
        division === "all" ||
        (employee.division ?? "")
          .toLowerCase()
          .split(",")
          .map((part) => part.trim())
          .includes(division.toLowerCase());

      return matchesQuery && matchesStatus && matchesDivision;
    });
  }, [employees, search, statusFilter, division]);

  if (!session) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="space-y-2 text-center">
          <p className="font-medium">Sign in to open the dashboard</p>
          <p className="text-sm text-muted-foreground">
            The dashboard reads attendance from the reporting service.
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Attendance dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Everyone expected to work today and whether they checked in on time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span suppressHydrationWarning>
              {date ? formatDateLabel(date) : (today ?? "\u00a0")}
            </span>
          </div>

          <Button
            variant="outline"
            size="lg"
            className="gap-1.5"
            onClick={() => void refreshDashboard()}
            disabled={status === "loading"}
          >
            <RefreshCw className={status === "loading" ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>

          <Link
            href="/admin/dashboard/employees/new"
            aria-label="Add employee"
            className={buttonVariants({ size: "lg", className: "gap-1.5" })}
          >
            <Plus className="size-4" />
            Add employee
          </Link>

          <Button variant="ghost" size="lg" className="gap-1.5" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </header>

      {status === "error" && error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <AttendanceStats
        employees={employees}
        summary={summary}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Employee filters
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or employee number…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ATTENDANCE_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {statusLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={division}
              onValueChange={(value) => setDivision(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All divisions</SelectItem>
                {divisions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
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
                setStatusFilter("all");
                setDivision("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Employees</h2>
        <Badge variant="secondary">{filteredEmployees.length} results</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredEmployees.map((employee) => (
          <EmployeeCard key={employee.id} employee={employee} />
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

function AttendanceStats({
  employees,
  summary,
}: {
  employees: DashboardEmployee[];
  summary: {
    totalEmployees: number;
    checkedIn: number;
    onTime: number;
    late: number;
    notCheckedIn: number;
    onLeave: number;
    notWorking: number;
  } | null;
}) {
  const fallback = {
    totalEmployees: employees.filter((item) => item.status !== "NOT_WORKING").length,
    checkedIn: employees.filter(
      (item) => item.status === "ON_TIME" || item.status === "LATE"
    ).length,
    onTime: employees.filter((item) => item.status === "ON_TIME").length,
    late: employees.filter((item) => item.status === "LATE").length,
    notCheckedIn: employees.filter((item) => item.status === "NOT_CHECKED_IN").length,
    onLeave: employees.filter((item) => item.status === "ON_LEAVE").length,
    notWorking: employees.filter((item) => item.status === "NOT_WORKING").length,
  };

  const counts = summary ?? fallback;

  const stats: Array<{
    key: string;
    status: AttendanceStatus;
    label: string;
    hint: string;
    value: number;
    Icon: typeof CheckCircle2;
  }> = [
    {
      key: "expected",
      status: "NOT_CHECKED_IN",
      label: "Expected today",
      hint: "Scheduled or on leave",
      value: counts.totalEmployees,
      Icon: CalendarCheck2,
    },
    {
      key: "on-time",
      status: "ON_TIME",
      label: "On time",
      hint: "Checked in by 09:00",
      value: counts.onTime,
      Icon: CheckCircle2,
    },
    {
      key: "late",
      status: "LATE",
      label: "Late",
      hint: "Checked in after 09:00",
      value: counts.late,
      Icon: Clock,
    },
    {
      key: "not-checked-in",
      status: "NOT_CHECKED_IN",
      label: "Not checked in",
      hint: "No check-in recorded yet",
      value: counts.notCheckedIn,
      Icon: Hourglass,
    },
    {
      key: "leave",
      status: "ON_LEAVE",
      label: "On leave",
      hint: "Approved leave today",
      value: counts.onLeave,
      Icon: Plane,
    },
    {
      key: "not-working",
      status: "NOT_WORKING",
      label: "Not working",
      hint: "Not scheduled today",
      value: counts.notWorking,
      Icon: MinusCircle,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map(({ key, status, label, hint, value, Icon }) => {
        const tone = attendanceTone[status];

        return (
          <Card key={key} className={tone.card}>
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
