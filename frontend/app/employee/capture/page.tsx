import { Suspense } from "react";
import { LoaderCircleIcon } from "lucide-react";

import { CaptureFlow } from "@/components/capture-flow";

export const metadata = {
  title: "Check in — Absences",
  description:
    "Take the check-in photo on your phone and send it back to the desktop.",
};

export default function CapturePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 p-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Opening…
          </div>
        }
      >
        <CaptureFlow />
      </Suspense>
    </main>
  );
}
