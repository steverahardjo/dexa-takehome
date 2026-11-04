"use client";

import * as React from "react";
import {
  Camera,
  CheckCircle2,
  LoaderCircle,
  LogOut,
  MapPin,
  RefreshCw,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  attendanceTone,
  statusLabel,
  type AttendanceStatus,
} from "@/lib/attendance";
import {
  clockIn,
  clockOut,
  getInitials,
  type AttendanceRecord,
  type Employee,
} from "@/lib/employees";
import { currentPosition } from "@/lib/geolocation";
import { formatCoordinates, googleMapsUrl } from "@/lib/maps";
import { dataUrlToFile, readPhotoFile } from "@/lib/photo";
import { COMPANY_TIMEZONE, formatInstantClock } from "@/lib/time";

type CapturedPhoto = {
  file: File;
  preview: string;
};

/**
 * The employee's own screen: today's status, an optional photo and the buttons
 * that record check-in/check-out. The server stamps every time, so it cannot be
 * edited from here.
 */
export function CheckInPanel({
  employee,
  attendance,
}: {
  employee: Employee;
  attendance: AttendanceRecord | null;
}) {
  const checkedIn = Boolean(attendance?.checkInTime);
  const checkedOut = Boolean(attendance?.checkOutTime);
  const status: AttendanceStatus = checkedIn
    ? attendance?.late
      ? "LATE"
      : "ON_TIME"
    : "NOT_CHECKED_IN";
  const tone = attendanceTone[status];

  const [photo, setPhoto] = React.useState<CapturedPhoto | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [isCheckingOut, setIsCheckingOut] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const timezone = attendance?.timezone ?? COMPANY_TIMEZONE;

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError(null);

    try {
      const preview = await readPhotoFile(file);
      setPhoto({ preview, file: dataUrlToFile(preview) });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "That photo could not be read."
      );
    }
  }

  async function handleCheckIn() {
    setError(null);
    setNotice(null);
    setIsSending(true);

    try {
      const position = await currentPosition();
      const location = position ? formatCoordinates(position) : undefined;

      await clockIn({ file: photo?.file, location });

      setPhoto(null);
      setNotice("Check-in saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The check-in could not be saved."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleCheckOut() {
    setError(null);
    setNotice(null);
    setIsCheckingOut(true);

    try {
      await clockOut();
      setNotice("Check-out saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The check-out could not be saved."
      );
    } finally {
      setIsCheckingOut(false);
    }
  }

  const evidence = attendance?.pictureUrl ?? photo?.preview;

  return (
    <div className="overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/10">
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar size="lg">
          <AvatarFallback>{getInitials(employee.fullName)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{employee.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {employee.employeeNumber}
            {employee.divisions.length
              ? ` · ${employee.divisions.map((division) => division.name).join(", ")}`
              : ""}
          </p>
        </div>

        <Badge className={tone.badge}>{statusLabel(status)}</Badge>
      </div>

      <div className="space-y-3 border-t px-4 py-4">
        <p className="text-xs text-muted-foreground">
          {checkedIn && attendance?.checkInTime
            ? attendance.late
              ? `Checked in late at ${formatInstantClock(attendance.checkInTime, timezone)}`
              : `Checked in at ${formatInstantClock(attendance.checkInTime, timezone)}`
            : "No check-in yet today"}
        </p>

        {checkedIn ? (
          <>
            {evidence && (
              <>
                {/* Photo served by the storage provider — next/image has nothing to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={evidence}
                  alt={`Check-in photo for ${employee.fullName}`}
                  className="max-h-[38vh] w-full rounded-lg bg-muted object-contain"
                />
              </>
            )}

            <div className="space-y-1">
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Checked in at{" "}
                {formatInstantClock(attendance?.checkInTime, timezone)}
              </p>

              {attendance?.location ? (
                <a
                  href={googleMapsUrl(attendance.location)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <MapPin className="size-4" />
                  {attendance.location}
                </a>
              ) : (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4" />
                  Location not shared
                </p>
              )}

              <p className="flex items-center gap-1.5 text-muted-foreground">
                <LogOut className="size-4" />
                {checkedOut && attendance?.checkOutTime
                  ? `Checked out at ${formatInstantClock(attendance.checkOutTime, timezone)}`
                  : "Not checked out yet"}
              </p>
            </div>

            {!checkedOut && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-12 w-full"
                onClick={() => void handleCheckOut()}
                disabled={isCheckingOut}
              >
                {isCheckingOut ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <LogOut />
                )}
                {isCheckingOut ? "Checking out…" : "Check out now"}
              </Button>
            )}
          </>
        ) : (
          <>
            {photo ? (
              <div className="space-y-2">
                {/* Data URL preview — next/image has nothing to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.preview}
                  alt="Check-in photo preview"
                  className="aspect-3/4 w-full rounded-lg bg-muted object-cover"
                />

                <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-input text-sm font-medium transition-colors hover:bg-muted">
                  <RefreshCw className="size-4" />
                  Retake photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={handlePhotoChange}
                  />
                </label>
              </div>
            ) : (
              <label className="flex aspect-3/4 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted">
                <Camera className="size-8" />
                <span className="font-medium">Add a photo</span>
                <span className="text-xs">Optional — opens your camera</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handlePhotoChange}
                />
              </label>
            )}

            <Button
              type="button"
              size="lg"
              className="h-12 w-full"
              onClick={() => void handleCheckIn()}
              disabled={isSending}
            >
              {isSending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              {isSending ? "Checking in…" : "Check in now"}
            </Button>
          </>
        )}

        {notice && !error && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="size-4" />
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground">
          The time is recorded by the server when you check in.
        </p>
      </div>
    </div>
  );
}
