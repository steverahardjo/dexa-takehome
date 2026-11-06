"use client";

import * as React from "react";
import {
  Camera,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  RefreshCw,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { attendanceTone, getAttendance } from "@/lib/attendance";
import { clockIn, getInitials, type MeView } from "@/lib/employees";
import { currentPosition } from "@/lib/geolocation";
import { googleMapsUrl } from "@/lib/maps";
import { readPhotoFile } from "@/lib/photo";
import { formatIsoClock } from "@/lib/time";

/**
 * The employee's own screen: today's status, an optional photo and the button
 * that records the check-in. The server stamps the time, so it cannot be edited
 * from here.
 *
 * The API needs a proof key for every check-in, so a photo is required: the
 * button stays disabled until one has been taken.
 */
export function CheckInPanel({ employee }: { employee: MeView }) {
  const attendance = employee.attendance;
  const summary = getAttendance(attendance);
  const tone = attendanceTone[summary.status];
  const hasCheckedIn = summary.status !== "NOT_CHECKED_IN";

  const [photo, setPhoto] = React.useState<string | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError(null);

    try {
      setPhoto(await readPhotoFile(file));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "That photo could not be read.",
      );
    }
  }

  async function handleCheckIn() {
    if (!photo) return;

    setError(null);
    setIsSending(true);

    try {
      const position = await currentPosition();

      // The gateway answers with the refreshed employee + day view.
      await clockIn({ evidence: photo, position });

      setPhoto(null);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The check-in could not be saved.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/10">
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar size="lg">
          <AvatarImage
            src={employee.avatarUrl ?? undefined}
            alt={`${employee.fullName} avatar`}
          />
          <AvatarFallback>{getInitials(employee.fullName)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{employee.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {employee.employeeNumber}
          </p>
        </div>

        <Badge className={tone.badge}>{summary.label}</Badge>
      </div>

      <div className="space-y-3 border-t px-4 py-4">
        <p className="text-xs text-muted-foreground">{summary.detail}</p>

        {hasCheckedIn ? (
          <>
            {attendance?.proofUrl && (
              // Presigned URL with a short lifetime — next/image would cache a dead link.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attendance.proofUrl}
                alt={`Check-in photo for ${employee.fullName}`}
                className="max-h-[38vh] w-full rounded-lg bg-muted object-contain"
              />
            )}

            <div className="space-y-1">
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Checked in at{" "}
                {attendance?.checkInTime
                  ? formatIsoClock(
                      attendance.checkInTime,
                      attendance.timezone ?? undefined,
                    )
                  : "an unknown time"}
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
            </div>
          </>
        ) : (
          <>
            {photo ? (
              <div className="space-y-2">
                {/* Data URL preview — next/image has nothing to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
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
                <span className="font-medium">Take a check-in photo</span>
                <span className="text-xs">Required — opens your camera</span>
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
              disabled={isSending || !photo}
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

        {saved && !error && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="size-4" />
            Check-in saved.
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
