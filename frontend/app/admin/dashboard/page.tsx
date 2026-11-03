"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Filter,
  Hourglass,
  Clock,
  LogOut,
  Plus,
  QrCode,
  Search,
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
import { EmployeeCard } from "@/components/employee-card";
import { useTodayLabel } from "@/lib/clock";
import { ROLES, useEmployeesState, type Employee } from "@/lib/employees";
import { attendanceTone, summarizeAttendance } from "@/lib/attendance";
import { signOut, useSession } from "@/lib/session";

export default function EmployeeDashboard() {
  const session = useSession();
  const { employees, status, error } = useEmployeesState();
  const today = useTodayLabel();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [date, setDate] = useState("");

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesName = employee.name
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesRole = role === "all" || employee.role === role;

      const matchesDate = !date || employee.contractExpiry === date;

      return matchesName && matchesRole && matchesDate;
    });
  }, [employees, search, role, date]);

  if (!session) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="space-y-2 text-center">
          <p className="font-medium">Sign in to open the dashboard</p>
          <p className="text-sm text-muted-foreground">
            The dashboard reads employee data from the admin service.
          </p>
          <Link href="/" className="text-sm underline underline-offset-4">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (session.role !== "HR Admin") {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="font-medium">This dashboard needs an HR Admin account</p>
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

      {status === "error" && error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Statistics */}
      <AttendanceStats employees={employees} />

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
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={role}
              onValueChange={(value) => setRole(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-9"
                aria-label="Filter by contract expiry date"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setRole("all");
                setDate("");
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

function AttendanceStats({ employees }: { employees: Employee[] }) {
  const summary = summarizeAttendance(employees);

  const stats = [
    {
      status: "checked-in" as const,
      label: "Checked in",
      hint: "Submitted a check-in today",
      value: summary["checked-in"],
      Icon: CheckCircle2,
    },
    {
      status: "late" as const,
      label: "Late",
      hint: "Checked in after 09:00 today",
      value: summary["late"],
      Icon: Clock,
    },
    {
      status: "not-checked-in" as const,
      label: "Not yet",
      hint: "No check-in yet today",
      value: summary["not-checked-in"],
      Icon: Hourglass,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
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
