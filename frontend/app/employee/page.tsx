
"use client"

import * as React from "react"
import Link from "next/link"
import { LogOut, LoaderCircle, Camera } from "lucide-react"

import { CheckInCard } from "@/components/checkin-card"
import { Button } from "@/components/ui/button"
import { attendanceTone, getAttendance } from "@/lib/attendance"
import { useSignedInEmployee } from "@/lib/employees"
import { signOut, useSession } from "@/lib/session"
import { useIsMobile } from "@/hooks/use-mobile"

export default function EmployeePage() {
  const session = useSession()
  const { employee, status, error } = useSignedInEmployee()
  const isMobile = useIsMobile()

  const [photo, setPhoto] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)

  const attendance = employee ? getAttendance(employee) : null
  const tone = attendanceTone[attendance?.status ?? "not-checked-in"]
  const isLoading = status === "idle" || status === "loading"

  React.useEffect(() => {
    if (!photo) {
      setPreview(null)
      return
    }

    const url = URL.createObjectURL(photo)
    setPreview(url)

    return () => URL.revokeObjectURL(url)
  }, [photo])

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (file) {
      setPhoto(file)
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-4">
      <div className="w-full max-w-sm space-y-3">
        {!session ? (
          <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            Sign in to check in.{" "}
            <Link href="/" className="underline underline-offset-4">
              Go to sign in
            </Link>
          </p>
        ) : isLoading ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            <LoaderCircle className="size-4 animate-spin" />
            Loading your details…
          </p>
        ) : !employee ? (
          <div className="space-y-2 rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
            <p className="font-medium">
              {status === "error"
                ? "Could not load your details"
                : `No employee for ${session.email}`}
            </p>

            <p className="text-sm text-muted-foreground">
              {status === "error" && error
                ? error
                : "Ask an admin to add this email, then sign in again."}
            </p>

            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <>
            {isMobile ? (
              <div className="space-y-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
                <div className="space-y-1 text-center">
                  <h2 className="font-semibold">Attendance photo</h2>
                  <p className="text-sm text-muted-foreground">
                    Take a photo using your phone camera to check in.
                  </p>
                </div>

                {preview && (
                  <img
                    src={preview}
                    alt="Attendance preview"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                )}

                <input
                  id="attendance-camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                />

                <Button
                  className="w-full"
                  onClick={() =>
                    document.getElementById("attendance-camera")?.click()
                  }
                >
                  <Camera className="mr-2 size-4" />
                  {photo ? "Retake photo" : "Open camera"}
                </Button>

                {photo && (
                  <p className="text-center text-xs text-muted-foreground">
                    {photo.name}
                  </p>
                )}
              </div>
            ) : (
              <CheckInCard
                key={employee.id}
                employee={employee}
                status={
                  attendance
                    ? {
                        label: attendance.label,
                        detail: attendance.detail,
                        tone: tone.badge,
                      }
                    : null
                }
              />
            )}

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut />
                Sign out
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
