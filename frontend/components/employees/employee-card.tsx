"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  ImageIcon,
  LogIn,
  LogOut,
  Pencil,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmployeeCalendar } from "@/components/employees/employee-calendar";
import {
  attendanceTone,
  isPresent,
  statusLabel,
} from "@/lib/attendance";
import { getInitials, type DashboardEmployee } from "@/lib/employees";
import { formatClockTime } from "@/lib/time";

/**
 * Dashboard card for one employee.
 * The header band is green when the employee checked in on time, red when late,
 * amber for approved leave and dark when no check-in has been recorded.
 */
export function EmployeeCard({ employee }: { employee: DashboardEmployee }) {
  const tone = attendanceTone[employee.status];
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const present = isPresent(employee.status);

  function openCalendar(event: React.SyntheticEvent) {
    if ((event.target as HTMLElement).closest("a,button")) return;

    setCalendarOpen(true);
  }

  return (
    <>
      <Card
        className="cursor-pointer gap-0 overflow-hidden py-0 transition hover:ring-foreground/20"
        role="button"
        tabIndex={0}
        title={`Open ${employee.name}'s attendance calendar`}
        onClick={openCalendar}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            setCalendarOpen(true);
          }
        }}
      >
        <div className={`flex items-start justify-between gap-2 px-4 py-4 ${tone.header}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback className="bg-white/15 text-white">
                {getInitials(employee.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <CardTitle className="truncate text-base text-white">
                {employee.name}
              </CardTitle>
              <p className={`truncate text-sm ${tone.headerMuted}`}>
                {employee.employeeNumber}
                {employee.division ? ` · ${employee.division}` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Badge className={tone.headerAccent}>{statusLabel(employee.status)}</Badge>

            <Link
              href={`/admin/dashboard/employees/${employee.id}/attendance`}
              aria-label={`Yearly attendance for ${employee.name}`}
              title="Yearly attendance"
              className={buttonVariants({
                variant: "ghost",
                size: "icon-sm",
                className:
                  "text-white/80 hover:bg-white/15 hover:text-white",
              })}
            >
              <CalendarDays className="size-4" />
            </Link>

            <Link
              href={`/admin/dashboard/employees/${employee.id}`}
              aria-label={`Change ${employee.name}`}
              title="Change employee"
              className={buttonVariants({
                variant: "ghost",
                size: "icon-sm",
                className:
                  "text-white/80 hover:bg-white/15 hover:text-white",
              })}
            >
              <Pencil className="size-4" />
            </Link>
          </div>
        </div>

        <CardContent className="space-y-3 px-4 py-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <Badge className={tone.badge}>{statusLabel(employee.status)}</Badge>
              <p className="text-xs text-muted-foreground">
                {present && employee.checkInTime
                  ? `Checked in at ${formatClockTime(employee.checkInTime)}`
                  : employee.status === "ON_LEAVE"
                    ? "Approved leave today"
                    : employee.status === "NOT_WORKING"
                      ? "Not scheduled to work today"
                      : "No check-in recorded today"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <LogIn className="size-4 text-muted-foreground" />
              <span className="tabular-nums">
                {employee.checkInTime
                  ? formatClockTime(employee.checkInTime)
                  : "—"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <LogOut className="size-4 text-muted-foreground" />
              <span className="tabular-nums">
                {employee.checkOutTime
                  ? formatClockTime(employee.checkOutTime)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4" />
            <span>
              Scheduled {formatClockTime(employee.scheduledCheckIn ?? "09:00")} –{" "}
              {formatClockTime(employee.scheduledCheckOut ?? "18:00")}
              {employee.lateMinutes > 0
                ? ` · ${employee.lateMinutes} min late`
                : ""}
            </span>
          </div>

          <div className="flex justify-end border-t pt-3">
            <EvidenceButton employee={employee} />
          </div>
        </CardContent>
      </Card>

      <EmployeeCalendar
        employeeId={employee.id}
        employeeName={employee.name}
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
      />
    </>
  );
}

/** Check-in photo. The button opens the photo in an overlay. */
function EvidenceButton({ employee }: { employee: DashboardEmployee }) {
  if (!employee.photoUrl) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <ImageIcon className="size-4" />
        No photo
      </span>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`View check-in photo for ${employee.name}`}
        title="View check-in photo"
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "shrink-0 gap-1.5",
        })}
      >
        <ImageIcon className="size-4" />
        View photo
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Check-in evidence</DialogTitle>
          <DialogDescription>
            {employee.name}
            {employee.checkInTime
              ? ` · checked in ${formatClockTime(employee.checkInTime)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Photo served by the storage provider — next/image has nothing to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={employee.photoUrl}
          alt={`${employee.name} check-in evidence`}
          className="max-h-[65vh] w-full rounded-lg bg-muted object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
