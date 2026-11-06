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
import { isAdminRole, roleLabel } from "@/lib/roles";
import { signOut, useSession } from "@/lib/session";
import { useTodayReport } from "@/lib/today";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  ON_TIME: "Sudah absen",
  LATE: "Terlambat",
  ABSENT: "Tidak hadir",
  NOT_CHECKED_IN: "Belum absen",
  ON_LEAVE: "Cuti",
  NOT_WORKING: "Bukan hari kerja",
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
          <p className="font-medium">Masuk untuk membuka dasbor</p>
          <p className="text-sm text-muted-foreground">
            Dasbor membaca direktori karyawan dari gateway.
          </p>
          <Link href="/" className="text-sm underline underline-offset-4">
            Buka halaman masuk
          </Link>
        </div>
      </main>
    );
  }

  if (!isAdminRole(session.role)) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="font-medium">Dasbor ini memerlukan akun admin</p>
          <p className="text-sm text-muted-foreground">
            Anda masuk sebagai {session.email} ({roleLabel(session.role)}).
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link href="/employee" className="text-sm underline underline-offset-4">
              Buka absen saya
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut />
              Keluar
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
            Absensi &amp; WFH
          </h1>
          <p className="text-sm text-muted-foreground">
            Semua bekerja dari rumah — pantau siapa yang sudah absen hari ini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span suppressHydrationWarning>{today ?? "\u00a0"}</span>
          </div>

          <Link
            href="/admin/dashboard/employees/new"
            aria-label="Tambah karyawan"
            className={buttonVariants({ size: "lg", className: "gap-1.5" })}
          >
            <Plus className="size-4" />
            Tambah karyawan
          </Link>

          <Link
            href="/choose"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "gap-1.5",
            })}
          >
            Ganti ruang kerja
          </Link>

          <Button
            variant="ghost"
            size="lg"
            className="gap-1.5"
            onClick={signOut}
          >
            <LogOut className="size-4" />
            Keluar
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
            ? `Hari ini hari libur nasional${report.holidayName ? ` (${report.holidayName})` : ""}, jadi tidak ada absen yang diharapkan.`
            : report.dayType === "WEEKEND"
              ? "Hari ini akhir pekan, jadi tidak ada absen yang diharapkan."
              : "Kalender hari libur tidak tersedia, jadi status hari ini tidak diketahui."}
        </div>
      )}

      {/* Statistics */}
      <AttendanceStats report={report} />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filter Karyawan
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari berdasarkan nama, email, atau nomor..."
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
                <SelectValue placeholder="Filter berdasarkan kehadiran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kehadiran</SelectItem>
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
                <SelectValue placeholder="Filter berdasarkan divisi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua divisi</SelectItem>
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
              Hapus filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Employee List */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Karyawan</h2>
        <Badge variant="secondary">
          {filteredEmployees.length} hasil
        </Badge>
        {report && (
          <Badge variant="outline">{report.totalEmployees} diharapkan</Badge>
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
            Memuat karyawan…
          </div>
        )}

        {status === "ready" && filteredEmployees.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Karyawan tidak ditemukan</p>
            <p className="text-sm text-muted-foreground">
              Coba ubah pencarian atau filter Anda.
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
      label: "Sudah absen",
      hint: "Sudah melakukan absen hari ini",
      value: report?.onTime ?? 0,
      Icon: CheckCircle2,
    },
    {
      status: "LATE" as const,
      label: "Terlambat",
      hint: "Absen melewati batas waktu",
      value: report?.late ?? 0,
      Icon: Clock,
    },
    {
      status: "NOT_CHECKED_IN" as const,
      label: "Belum absen",
      hint: "Diharapkan hadir, tetapi belum absen",
      value: report?.notCheckedIn ?? 0,
      Icon: Hourglass,
    },
    {
      status: "ABSENT" as const,
      label: "Tidak hadir",
      hint: "Ditandai tidak hadir oleh sistem",
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
