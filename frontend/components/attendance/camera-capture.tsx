"use client";

import * as React from "react";
import {
  Camera,
  CameraOff,
  Check,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dataUrlToFile, toScaledJpegDataUrl } from "@/lib/photo";

export type CapturedPhoto = {
  file: File;
  preview: string;
};

type CameraStatus = "idle" | "starting" | "ready" | "error";

/**
 * Live camera capture for the check-in photo. Deliberately no file input: the
 * evidence has to be taken at the moment of check-in, at the place of work.
 *
 * The stream is opened only while the dialog is mounted and every track is
 * stopped when it closes, so the camera light never stays on.
 */
export function CameraCapture({
  open,
  onOpenChange,
  onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: (photo: CapturedPhoto) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [status, setStatus] = React.useState<CameraStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  const isError = Boolean(error) && !preview;

  const stopCamera = React.useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = React.useCallback(async () => {
    setPreview(null);
    setError(null);
    stopCamera();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("error");
      setError(
        "This browser cannot open a camera. Use your phone's browser over HTTPS."
      );
      return;
    }

    setStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 1920 },
        },
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }

      video.srcObject = stream;
      await video.play().catch(() => null);

      setStatus("ready");
    } catch (cause) {
      stopCamera();
      setStatus("error");
      setError(cameraErrorMessage(cause));
    }
  }, [stopCamera]);

  // Stop the camera if the component unmounts while the dialog is open.
  React.useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  /**
   * Resets state from the event that opens or closes the dialog, not from an
   * effect, so a close keeps the last frame during the exit animation and the
   * next open always starts clean.
   */
  function handleOpenChange(next: boolean) {
    stopCamera();

    if (next) {
      setPreview(null);
      setError(null);
      setStatus("starting");
    }

    onOpenChange(next);
  }

  function capture() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("The camera is still starting. Try again in a moment.");
      return;
    }

    const dataUrl = toScaledJpegDataUrl(
      video,
      video.videoWidth,
      video.videoHeight
    );

    if (!dataUrl) {
      setError("The photo could not be captured. Try again.");
      return;
    }

    stopCamera();
    setError(null);
    setPreview(dataUrl);
  }

  function usePhoto() {
    if (!preview) return;

    onCaptured({
      preview,
      file: dataUrlToFile(preview, `check-in-${Date.now()}.jpg`),
    });
    handleOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        // Started from the dialog's own lifecycle callback rather than an
        // effect, so the camera begins only once the popup is on screen.
        if (nextOpen) void startCamera();
        else stopCamera();
      }}
    >
      <DialogContent className="max-h-[92svh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Take a check-in photo</DialogTitle>
          <DialogDescription>
            Captured live from your camera and attached to today&apos;s
            check-in.
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg bg-black">
          {preview ? (
            // Data URL preview — next/image has nothing to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Check-in photo preview"
              className="aspect-3/4 max-h-[58svh] w-full rounded-lg object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-3/4 max-h-[58svh] w-full object-cover"
            />
          )}

          {!preview && (status === "starting" || isError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center text-sm text-white">
              {error ? (
                <>
                  <CameraOff className="size-8" />
                  <p className="text-balance">{error}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => void startCamera()}
                  >
                    <RotateCcw className="size-3.5" />
                    Try again
                  </Button>
                </>
              ) : (
                <>
                  <LoaderCircle className="size-7 animate-spin" />
                  <p>Starting the camera…</p>
                </>
              )}
            </div>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          Camera permission is required. Uploading a file is not supported.
        </p>

        <div className="flex justify-end gap-2">
          {preview ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5"
                onClick={() => void startCamera()}
              >
                <RotateCcw className="size-4" />
                Retake
              </Button>
              <Button type="button" className="gap-1.5" onClick={usePhoto}>
                <Check className="size-4" />
                Use photo
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                onClick={capture}
                disabled={status !== "ready"}
              >
                <Camera className="size-4" />
                Capture
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cameraErrorMessage(cause: unknown): string {
  if (cause instanceof DOMException) {
    switch (cause.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera access is blocked. Allow the camera in your browser settings, then try again.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No camera was found on this device.";
      case "NotReadableError":
        return "The camera is already being used by another app.";
      default:
        return cause.message || "The camera could not be opened.";
    }
  }

  return cause instanceof Error
    ? cause.message
    : "The camera could not be opened.";
}
