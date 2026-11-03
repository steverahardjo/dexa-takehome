"use client";

import Link from "next/link";
import {
  CalendarCheck2,
  Check,
  Clock,
  ExternalLink,
  ImageIcon,
  MapPin,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { attendanceTone, getAttendance } from "@/lib/attendance";
import { useNowSeconds } from "@/lib/clock";
import { clockIn, getInitials, type Employee } from "@/lib/employees";
import { formatCoordinates, googleMapsUrl } from "@/lib/maps";
import { formatClockTime } from "@/lib/time";

/**
 * Employee info card. The header band is green when the employee checked in on
 * time, red when late, and black while there is no check-in yet. Leave balance
 * leads the card; the check-in location links out to Google Maps and the photo
 * evidence opens in an overlay.
 */
export function EmployeeCard({ employee }: { employee: Employee }) {
  const seconds = useNowSeconds();
  const now = seconds === null ? null : new Date(seconds * 1000);
  const attendance = now ? getAttendance(now, employee) : null;
  const tone = attendanceTone[attendance?.status ?? "not-started"];
  const isClockedIn = employee.clockInAt !== null;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className={`flex items-start justify-between gap-2 px-4 py-4 ${tone.header}`}>
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
        {/* Leave balance leads the card */}
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="flex items-center gap-2 font-medium">
            <CalendarCheck2 className="size-4 text-muted-foreground" />
            Leave balance
          </span>
          <Badge
            variant={employee.leaveBalance < 0 ? "destructive" : "secondary"}
          >
            {employee.leaveBalance} days
          </Badge>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <Badge className={tone.badge}>
              {attendance?.label ?? "…"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {attendance?.detail ?? "Reading the clock…"}
            </p>
          </div>

          {!isClockedIn && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => clockIn(employee.id)}
            >
              <Check />
              Clock in
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Clock className="size-4 text-muted-foreground" />
          <span className="tabular-nums">
            {employee.clockInAt
              ? `Checked in ${formatClockTime(employee.clockInAt)}`
              : `Work start ${formatClockTime(employee.workStart)}`}
          </span>
        </div>

        <p className="text-muted-foreground">
          {employee.division}
          {employee.contractExpiry
            ? ` · Contract expiry: ${employee.contractExpiry}`
            : ""}
        </p>

        {/* Location + photo evidence */}
        <div className="flex items-end justify-between gap-3 border-t pt-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Check-in location
            </p>

            <LocationLink employee={employee} />

            <p className="text-xs text-muted-foreground">
              {employee.checkInPosition
                ? "WFH · from the phone"
                : employee.address
                  ? "WFH · Google Maps"
                  : "WFH"}
            </p>
          </div>

          <EvidenceButton employee={employee} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Check-in location: a plain link that opens Google Maps in a new page. */
function LocationLink({ employee }: { employee: Employee }) {
  // A check-in sent from the phone carries its own position; fall back to the
  // address on file for check-ins made on the desktop.
  const target = employee.checkInPosition
    ? formatCoordinates(employee.checkInPosition)
    : employee.address;

  if (!target) {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <MapPin className="size-4" />
        No location on file
      </p>
    );
  }

  return (
    <a
      href={googleMapsUrl(target)}
      target="_blank"
      rel="noreferrer"
      title={`Open ${target} in Google Maps`}
      className="group inline-flex max-w-full items-center gap-1.5 font-medium underline-offset-4 hover:text-foreground hover:underline"
    >
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{target}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
    </a>
  );
}

/**
 * Check-in photo. Nothing is shown in the card itself — the button opens the
 * photo in an overlay.
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

        <img
          src={employee.evidence}
          alt={`${employee.name} check-in evidence`}
          className="max-h-[65vh] w-full rounded-lg bg-muted object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
