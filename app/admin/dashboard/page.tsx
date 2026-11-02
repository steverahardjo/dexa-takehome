"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Filter,
  Hourglass,
  Plus,
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
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeCard } from "@/components/employee-card";
import { useNowSeconds, useTodayLabel } from "@/lib/clock";
import { ROLES, useEmployees, type Employee } from "@/lib/employees";
import { attendanceTone, summarizeAttendance } from "@/lib/attendance";

export default function EmployeeDashboard() {
  const employees = useEmployees();
  const today = useTodayLabel();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [date, setDate] = useState("");
  const [outOfBalance, setOutOfBalance] = useState(false);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesName = employee.name
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesRole = role === "all" || employee.role === role;

      const matchesDate = !date || employee.contractExpiry === date;

      const matchesBalance =
        !outOfBalance || employee.leaveBalance < 0;

      return matchesName && matchesRole && matchesDate && matchesBalance;
    });
  }, [employees, search, role, date, outOfBalance]);

  const negativeBalanceCount = employees.filter(
    (employee) => employee.leaveBalance < 0
  ).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Absences &amp; WFH
          </h1>
          <p className="text-sm text-muted-foreground">
            Everyone is working from home — track check-ins against work start
            times.
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
        </div>
      </header>

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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={outOfBalance}
                onCheckedChange={(checked) =>
                  setOutOfBalance(checked === true)
                }
              />
              Show employees out of leave balance
            </label>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setRole("all");
                setDate("");
                setOutOfBalance(false);
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
        {negativeBalanceCount > 0 && (
          <Badge className={attendanceTone.late.badge}>
            {negativeBalanceCount} out of leave balance
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredEmployees.map((employee) => (
          <EmployeeCard key={employee.id} employee={employee} />
        ))}

        {filteredEmployees.length === 0 && (
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
  const nowSeconds = useNowSeconds();
  const now = nowSeconds === null ? null : new Date(nowSeconds * 1000);
  const summary = now ? summarizeAttendance(employees, now) : null;

  const stats = [
    {
      status: "on-time" as const,
      label: "On time",
      hint: "Checked in at or before work start",
      value: summary?.["on-time"] ?? null,
      Icon: CheckCircle2,
    },
    {
      status: "late" as const,
      label: "Late",
      hint: "Checked in after work start",
      value: summary?.late ?? null,
      Icon: AlertTriangle,
    },
    {
      status: "not-started" as const,
      label: "Not started",
      hint: "No check-in yet today",
      value: summary?.["not-started"] ?? null,
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
                  {value ?? "—"}
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
