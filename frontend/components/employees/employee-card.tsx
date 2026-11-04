
"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, ExternalLink, ImageIcon, MapPin } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { attendanceTone, getAttendance } from "@/lib/attendance";
import { getInitials, type Employee } from "@/lib/employees";
import { formatCoordinates, googleMapsUrl } from "@/lib/maps";
import { formatClockTime } from "@/lib/time";

/**
 * Employee info card.
 * The header band is green when the employee checked in today
 * and dark while there is no check-in yet.
 */
export function EmployeeCard({ employee }: { employee: Employee }) {
  const attendance = getAttendance(employee);
  const tone = attendanceTone[attendance.status];
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  /**
   * Clicking the card opens the employee's late-day calendar.
   * Links and buttons retain their own click behavior.
   */
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
        title={`Open ${employee.name}'s late-day calendar`}
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
        {/* Employee header */}
        <div
          className={`flex items-start justify-between gap-2 px-4 py-4 ${tone.header}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="lg">
              <AvatarImage
                src={employee.avatar}
                alt={`${employee.name} avatar`}
              />
              <AvatarFallback className="bg-white/15 text-white">
                {getInitials(employee.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <CardTitle className="truncate text-base text-white">
                {employee.name}
              </CardTitle>
              <p className={`truncate text-sm ${tone.headerMuted}`}>
                {employee.email}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Badge className={tone.headerAccent}>{employee.role}</Badge>

            <Link
              href={`/admin/dashboard/employees/${employee.id}`}
              aria-label={`Change ${employee.name}`}
              title="Change employee"
              className={buttonVariants({
                variant: "ghost",
                size: "icon-sm",
                className:
                  "text-base font-semibold leading-none text-white/80 hover:bg-white/15 hover:text-white",
              })}
            >
              :
            </Link>
          </div>
        </div>

        <CardContent className="space-y-3 px-4 py-4 text-sm">
          {/* Attendance status */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <Badge className={tone.badge}>{attendance.label}</Badge>
              <p className="text-xs text-muted-foreground">
                {attendance.detail}
              </p>
            </div>
          </div>

          {/* Check-in time */}
          <div className="flex items-center gap-3">
            <Clock className="size-4 text-muted-foreground" />
            <span className="tabular-nums">
              {employee.clockInAt
                ? `Checked in ${formatClockTime(employee.clockInAt)}`
                : "No check-in yet today"}
            </span>
          </div>

          {/* Employee details */}
          <p className="text-muted-foreground">
            {employee.division}
            {employee.contractExpiry
              ? ` · Contract expiry: ${employee.contractExpiry}`
              : ""}
          </p>

          <div className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Home address
            </p>

            <LocationLink
              location={employee.address}
              emptyLabel="No home address on file"
            />
          </div>


          {/* Home address and actual check-in location */}
          <div className="space-y-3 border-t pt-3">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Check-in location
              </p>

              <LocationLink
                location={
                  employee.checkInPosition
                    ? formatCoordinates(employee.checkInPosition)
                    : undefined
                }
                emptyLabel="No check-in coordinates recorded"
              />
            </div>

            <div className="flex justify-end">
              <EvidenceButton employee={employee} />
            </div>
          </div>
        </CardContent>
      </Card>

      <EmployeeCalendar
        employee={employee}
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
      />
    </>
  );
}

/** Displays a location with a Google Maps link. */
function LocationLink({
  location,
  emptyLabel,
}: {
  location?: string | null;
  emptyLabel: string;
}) {
  if (!location) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0" />
        {emptyLabel}
      </p>
    );
  }

  return (
    <a
      href={googleMapsUrl(location)}
      target="_blank"
      rel="noreferrer"
      title={`Open ${location} in Google Maps`}
      className="group inline-flex max-w-full items-center gap-1.5 text-sm font-medium underline-offset-4 hover:text-foreground hover:underline"
    >
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{location}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
    </a>
  );
}

/**
 * Check-in photo.
 * The button opens the photo in an overlay.
 */
function EvidenceButton({ employee }: { employee: Employee }) {
  if (!employee.evidence) {
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
            {employee.clockInAt
              ? ` · checked in ${formatClockTime(employee.clockInAt)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Data URL stored with the check-in — next/image has nothing to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={employee.evidence}
          alt={`${employee.name} check-in evidence`}
          className="max-h-[65vh] w-full rounded-lg bg-muted object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
