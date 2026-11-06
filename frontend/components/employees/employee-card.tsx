"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  ExternalLink,
  ImageIcon,
  MapPin,
  Phone,
} from "lucide-react";

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
import { divisionNames, type Division } from "@/lib/divisions";
import { getInitials, type Employee } from "@/lib/employees";
import { googleMapsUrl } from "@/lib/maps";
import { formatDate, formatIsoClock } from "@/lib/time";
import type { TodayItem } from "@/lib/today";

/**
 * One employee in the dashboard grid.
 *
 * The status, the check-in time, the location and the proof photo all come from
 * today's report row (`TodayItem`), because they live in the attendance
 * database, not on the employee. `today` is undefined when the report has no
 * row for this person — which is what "not checked in yet" looks like.
 *
 * The phone is the person's own field, not today's: it is shown next to the
 * division/join date so the card keeps its height.
 */
export function EmployeeCard({
  employee,
  today,
  divisions,
}: {
  employee: Employee;
  today?: TodayItem;
  divisions: Division[];
}) {
  const attendance = getAttendance(today ?? null);
  const tone = attendanceTone[attendance.status];
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const divisionNameList = divisionNames(divisions, employee.divisionIds);

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
        title={`Buka kalender keterlambatan ${employee.fullName}`}
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
                src={employee.avatarUrl ?? undefined}
                alt={`Avatar ${employee.fullName}`}
              />
              <AvatarFallback className="bg-white/15 text-white">
                {getInitials(employee.fullName)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <CardTitle className="truncate text-base text-white">
                {employee.fullName}
              </CardTitle>
              <p className={`truncate text-sm ${tone.headerMuted}`}>
                {employee.email}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Badge className={tone.headerAccent}>
              {employee.employeeNumber}
            </Badge>

            <Link
              href={`/admin/dashboard/employees/${employee.id}`}
              aria-label={`Ubah ${employee.fullName}`}
              title="Ubah karyawan"
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
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="tabular-nums">
              {today?.checkInTime
                ? `Absen ${formatIsoClock(today.checkInTime)}`
                : "Belum absen hari ini"}
            </span>
          </div>

          {/* Employee details, with the phone kept on the same row so the grid
              card does not grow a line for it. */}
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-muted-foreground">
              {divisionNameList.length > 0
                ? divisionNameList.join(", ")
                : "Tidak ada divisi"}
              {` · Bergabung ${formatDate(employee.joinedAt)}`}
            </p>

            {employee.phone && <PhoneLink phone={employee.phone} />}
          </div>

          {/* Check-in location and proof photo */}
          <div className="space-y-3 border-t pt-3">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Lokasi absen
              </p>

              <LocationLink
                location={today?.location}
                emptyLabel="Koordinat absen tidak tercatat"
              />
            </div>

            <div className="flex justify-end">
              <EvidenceButton
                name={employee.fullName}
                proofUrl={today?.proofUrl}
                checkInTime={today?.checkInTime ?? null}
              />
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

/** The employee's phone, as a `tel:` link. Absent for people without one. */
function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      title={`Telepon ${phone}`}
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <Phone className="size-3.5 shrink-0" />
      <span className="tabular-nums">{phone}</span>
    </a>
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
      title={`Buka ${location} di Google Maps`}
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
 * The button opens the presigned photo in an overlay.
 */
function EvidenceButton({
  name,
  proofUrl,
  checkInTime,
}: {
  name: string;
  proofUrl?: string | null;
  checkInTime: string | null;
}) {
  if (!proofUrl) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <ImageIcon className="size-4" />
        Tidak ada foto
      </span>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Lihat foto absen ${name}`}
        title="Lihat foto absen"
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "shrink-0 gap-1.5",
        })}
      >
        <ImageIcon className="size-4" />
        Lihat foto
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Bukti absen</DialogTitle>
          <DialogDescription>
            {name}
            {checkInTime ? ` · absen ${formatIsoClock(checkInTime)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Presigned MinIO URL with a short lifetime — next/image would cache a dead link. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proofUrl}
          alt={`Bukti absen ${name}`}
          className="max-h-[65vh] w-full rounded-lg bg-muted object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
