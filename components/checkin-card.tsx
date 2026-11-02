"use client";

import * as React from "react";
import {
  CheckCircle2,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import QRCode from "react-qr-code";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CaptureSession } from "@/lib/attendance-capture";
import { clockIn, getInitials, type Employee } from "@/lib/employees";
import { formatCoordinates, googleMapsUrl } from "@/lib/maps";
import { formatClockTime } from "@/lib/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** How often the desktop asks whether the phone has sent its photo. */
const POLL_INTERVAL_MS = 1500;

type Phase = "creating" | "waiting" | "review" | "saved" | "error";

async function requestSession(input: {
  employeeId: string;
  employeeName: string;
}) {
  const response = await fetch("/api/attendance/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as {
    session?: CaptureSession;
    lanHosts?: string[];
    error?: string;
  };

  if (!response.ok || !data.session) {
    throw new Error(data.error ?? "Could not create the QR code.");
  }

  return { session: data.session, lanHosts: data.lanHosts ?? [] };
}

/**
 * The QR code has to carry an address the phone can open. When the desktop was
 * opened through localhost, swap in this machine's network address instead.
 */
function buildCaptureUrl(sessionId: string, lanHosts: string[]) {
  const { hostname, port, origin } = window.location;
  const isLoopback =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const useLan = isLoopback && lanHosts.length > 0;
  const base = useLan ? `http://${lanHosts[0]}${port ? `:${port}` : ""}` : origin;

  return { url: `${base}/employee/capture?s=${sessionId}`, useLan };
}

async function dropSession(id: string) {
  await fetch(`/api/attendance/sessions/${id}`, { method: "DELETE" }).catch(
    () => {}
  );
}

/**
 * One employee, one screen: the QR code for the phone, the photo it sends back,
 * and the confirm step. Nothing else.
 */
export function CheckInCard({
  employee,
  status,
}: {
  employee: Employee;
  /** Attendance badge and detail, resolved by the page once the clock ticks. */
  status: { label: string; detail: string; tone: string } | null;
}) {
  const [phase, setPhase] = React.useState<Phase>("creating");
  const [session, setSession] = React.useState<CaptureSession | null>(null);
  const [captureUrl, setCaptureUrl] = React.useState("");
  const [useLan, setUseLan] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const sessionRef = React.useRef<string | null>(null);

  const employeeId = employee.id;
  const employeeName = employee.name;

  React.useEffect(() => {
    let cancelled = false;

    async function create() {
      try {
        const created = await requestSession({ employeeId, employeeName });

        if (cancelled) {
          void dropSession(created.session.id);
          return;
        }

        sessionRef.current = created.session.id;
        setSession(created.session);

        const capture = buildCaptureUrl(created.session.id, created.lanHosts);

        setCaptureUrl(capture.url);
        setUseLan(capture.useLan);
        setPhase("waiting");
      } catch (cause) {
        if (cancelled) return;

        setError(
          cause instanceof Error ? cause.message : "Could not create the QR code."
        );
        setPhase("error");
      }
    }

    void create();

    return () => {
      cancelled = true;

      if (sessionRef.current) {
        void dropSession(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, [employeeId, employeeName, attempt]);

  // Poll while the QR code is on screen; stop as soon as the photo arrives.
  React.useEffect(() => {
    if (phase !== "waiting" || !session) return;

    let cancelled = false;
    const id = session.id;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/attendance/sessions/${id}`, {
          cache: "no-store",
        });

        if (cancelled) return;

        if (response.status === 404) {
          setError("That QR code expired.");
          setPhase("error");
          return;
        }

        if (!response.ok) return;

        const data = (await response.json()) as { session: CaptureSession };

        if (cancelled || data.session.status !== "submitted") return;

        setSession(data.session);
        setPhase("review");
      } catch {
        // Transient network hiccup: the next tick tries again.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, session]);

  function handleSave() {
    if (!session?.submission) return;

    clockIn(employee.id, {
      at: new Date(session.submission.capturedAt),
      evidence: session.submission.image,
      position: session.submission.position,
      // The photo was reviewed on screen, so it wins over an older check-in.
      replace: true,
    });

    void dropSession(session.id);
    sessionRef.current = null;
    setPhase("saved");
  }

  function handleRetry() {
    setPhase("creating");
    setError(null);
    setSession(null);
    setAttempt((current) => current + 1);
  }

  const submission = session?.submission ?? null;

  return (
    <div className="overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/10">
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar size="lg">
          <AvatarImage src={employee.avatar} alt={`${employee.name} avatar`} />
          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{employee.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {employee.role} · {employee.division || "No division"}
          </p>
        </div>

        {status && <Badge className={status.tone}>{status.label}</Badge>}
      </div>

      <div className="space-y-3 border-t px-4 py-4">
        {status && (
          <p className="text-xs text-muted-foreground">{status.detail}</p>
        )}

        {phase === "creating" && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Preparing the QR code…
          </div>
        )}

        {phase === "waiting" && captureUrl && (
          <>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-lg bg-white p-2.5">
                <QRCode
                  value={captureUrl}
                  size={148}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                  title="Scan to check in from your phone"
                />
              </div>

              <p className="flex items-center gap-1.5 font-medium">
                <Smartphone className="size-4" />
                Scan with your phone
              </p>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                Waiting for the photo…
              </p>

              {useLan && (
                <p className="text-center text-xs text-muted-foreground">
                  Phone must be on the same Wi-Fi.
                </p>
              )}
            </div>
          </>
        )}

        {phase === "review" && submission && (
          <>
            {/* Data URL captured on the phone — next/image has nothing to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={submission.image}
              alt={`Check-in photo for ${employee.name}`}
              className="max-h-[38vh] w-full rounded-lg bg-muted object-contain"
            />

            <div className="space-y-1">
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Photo taken at{" "}
                {formatClockTime(toClockTime(submission.capturedAt))}
              </p>

              {submission.position ? (
                <a
                  href={googleMapsUrl(formatCoordinates(submission.position))}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <MapPin className="size-4" />
                  {formatCoordinates(submission.position)}
                </a>
              ) : (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4" />
                  Location not shared
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={handleRetry}>
                <RefreshCw />
                Scan again
              </Button>
              <Button type="button" onClick={handleSave}>
                <CheckCircle2 />
                Save check-in
              </Button>
            </div>
          </>
        )}

        {phase === "saved" && (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="size-8 text-emerald-600" />
            <p className="font-medium">Checked in</p>
            <p className="text-muted-foreground">
              {employee.clockInAt
                ? formatClockTime(employee.clockInAt)
                : "the time on the photo"}
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-2">
            <p role="alert" className="font-medium text-destructive">
              {error}
            </p>
            <Button type="button" className="w-full" onClick={handleRetry}>
              <RefreshCw />
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** `"2024-05-01T09:14:00.000Z"` -> `"09:14"` in the desktop's local time. */
function toClockTime(isoTimestamp: string) {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) return "--:--";

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}
