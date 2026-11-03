"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  CameraIcon,
  CheckCircle2,
  LoaderCircleIcon,
  RotateCwIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CapturePosition, CaptureSession } from "@/lib/attendance-capture";

/** Long edge of the photo we keep; anything larger only costs bandwidth. */
const MAX_EDGE = 1080;
const JPEG_QUALITY = 0.82;

type Step = "loading" | "camera" | "review" | "sending" | "sent" | "error";

/** Draws a frame (video or image) on a canvas and returns a JPEG data URL. */
function toScaledDataUrl(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");

  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Turns the getUserMedia rejection into something the employee can act on. */
function describeCameraError(cause: unknown) {
  const name =
    typeof cause === "object" && cause !== null && "name" in cause
      ? String((cause as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was blocked. Allow the camera for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is already in use by another app. Close it and try again.";
    default:
      return "The camera could not be started. You can upload a photo instead.";
  }
}

/** Best-effort position; a decline or timeout simply means "unknown". */
async function readPosition(): Promise<CapturePosition | null> {
  if (!("geolocation" in navigator)) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (result) =>
        resolve({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: Number.isFinite(result.coords.accuracy)
            ? result.coords.accuracy
            : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    );
  });
}

/**
 * Phone side of the check-in: the QR code on the desktop points here. The
 * employee takes a photo, confirms it (or retakes it), and sends it back
 * together with the time and, when allowed, the current position.
 */
export function CaptureFlow() {
  const sessionId = useSearchParams().get("s");
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [step, setStep] = React.useState<Step>("loading");
  const [session, setSession] = React.useState<CaptureSession | null>(null);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  // Chrome's own geolocation prompt is requested once the session is live; the
  // promise is kept so sending can wait for the employee's answer.
  const positionRef = React.useRef<Promise<CapturePosition | null> | null>(null);
  // The live stream lives in state so the <video> can be bound as soon as it
  // exists — binding it from a ref happens too early and leaves a black frame.
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [isCameraReady, setIsCameraReady] = React.useState(false);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setIsCameraReady(false);
  }, []);

  const startCamera = React.useCallback(async () => {
    setCameraError(null);
    setIsCameraReady(false);
    setStep("camera");

    // Browsers only expose the camera in a secure context (HTTPS or localhost).
    // A phone opening http://192.168.x.x:3000 counts as insecure.
    if (!window.isSecureContext) {
      setCameraError(
        "This page is not on HTTPS, so the browser hides the camera. Use the button below, or open the page over https://."
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "This browser does not expose a camera API. Use the button below to open your phone camera."
      );
      return;
    }

    try {
      // Drop whatever is still live before asking for a new stream.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = next;
      setStream(next);
    } catch (cause) {
      setCameraError(describeCameraError(cause));
    }
  }, []);

  // Load the session the QR code points at.
  React.useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/attendance/sessions/${sessionId}`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          session?: CaptureSession;
          error?: string;
        };

        if (!response.ok || !data.session) {
          throw new Error(data.error ?? "This QR code is no longer valid.");
        }

        if (cancelled) return;

        setSession(data.session);

        if (data.session.status === "submitted") {
          setStep("sent");
          return;
        }

        // Ask for the location first; Chrome shows its own prompt on the phone.
        positionRef.current = readPosition();
        void startCamera();
      } catch (cause) {
        if (cancelled) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "This QR code is no longer valid."
        );
        setStep("error");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, startCamera]);

  React.useEffect(() => stopCamera, [stopCamera]);

  // Bind the stream the moment it exists; the <video> is already mounted by then.
  React.useEffect(() => {
    const video = videoRef.current;

    if (!stream || !video) return;

    video.srcObject = stream;
    void video.play().catch(() => {});
  }, [stream]);

  function handleShutter() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0) return;

    const next = toScaledDataUrl(video, video.videoWidth, video.videoHeight);
    if (!next) return;

    stopCamera();
    setPhoto(next);
    setStep("review");
  }

  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const next = toScaledDataUrl(image, image.naturalWidth, image.naturalHeight);
        if (!next) return;

        stopCamera();
        setPhoto(next);
        setStep("review");
      };

      image.src = String(reader.result);
    };

    reader.readAsDataURL(file);
  }

  async function handleSend() {
    if (!photo || !sessionId) return;

    setError(null);
    setStep("sending");

    try {
      // Usually already answered by now; awaiting it is instant in that case.
      const position = await (positionRef.current ?? readPosition());
      const response = await fetch(`/api/attendance/sessions/${sessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: photo,
          capturedAt: new Date().toISOString(),
          position,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "The photo could not be sent.");
      }

      setStep("sent");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The photo could not be sent."
      );
      setStep("review");
    }
  }

  if (!sessionId) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Check in</CardTitle>
          <CardDescription>A QR code is needed to start.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <TriangleAlertIcon className="size-8 text-destructive" />
            <p className="font-medium">This check-in link did not work</p>
            <p className="text-sm text-muted-foreground">
              Scan the QR code on the desktop again.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          {session ? `Check in for ${session.employeeName}` : "Check in"}
        </CardTitle>
        <CardDescription>{describeStep(step)}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {(step === "loading" || step === "sending") && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-6 animate-spin" />
            <p>{step === "loading" ? "Opening the camera…" : "Sending your photo…"}</p>
          </div>
        )}

        {step === "camera" && (
          <>
            <div className="relative overflow-hidden rounded-xl bg-neutral-900">
              {cameraError ? (
                <div className="flex aspect-3/4 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/80">
                  <CameraIcon className="size-8" />
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="rounded-lg border border-white/30 px-3 py-1.5 text-white"
                  >
                    Try the camera again
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    onLoadedMetadata={() => setIsCameraReady(true)}
                    className="aspect-3/4 w-full object-cover"
                  />

                  {!isCameraReady && (
                    <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70">
                      <LoaderCircleIcon className="size-4 animate-spin" />
                      Starting the camera…
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {!cameraError && (
                <Button
                  type="button"
                  size="lg"
                  onClick={handleShutter}
                  disabled={!isCameraReady}
                  className="h-14 w-full"
                >
                  <CameraIcon />
                  Take photo
                </Button>
              )}

              <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-input text-sm font-medium transition-colors hover:bg-muted">
                <UploadIcon className="size-4" />
                Upload from this phone
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleUpload}
                />
              </label>
            </div>
          </>
        )}

        {step === "review" && photo && (
          <>
            {/* A data URL from the camera roll — next/image would only re-encode it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt="Check-in photo you just took"
              className="aspect-3/4 w-full rounded-xl bg-muted object-cover"
            />

            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setPhoto(null);
                  setError(null);
                  void startCamera();
                }}
              >
                <RotateCwIcon />
                Retake
              </Button>

              <Button type="button" size="lg" onClick={handleSend}>
                <CheckCircle2 />
                Use photo
              </Button>
            </div>
          </>
        )}

        {step === "sent" && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" />
            <p className="font-medium">Check-in sent</p>
            <p className="text-sm text-muted-foreground">
              Your photo is on the desktop. You can close this page.
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <TriangleAlertIcon className="size-8 text-destructive" />
            <p className="font-medium">This check-in link did not work</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function describeStep(step: Step) {
  switch (step) {
    case "loading":
      return "Reading the QR code…";
    case "camera":
      return "Point the camera at yourself or your desk, then take a photo.";
    case "review":
      return "Happy with the photo? Send it, or take another one.";
    case "sending":
      return "Uploading the photo and your position.";
    case "sent":
      return "Nothing else to do here.";
    case "error":
      return "Ask the desktop for a fresh QR code.";
  }
}
