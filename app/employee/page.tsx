"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { CheckInCard } from "@/components/checkin-card";
import { Button } from "@/components/ui/button";
import { attendanceTone, getAttendance } from "@/lib/attendance";
import { useNowSeconds } from "@/lib/clock";
import { useEmployees } from "@/lib/employees";
import { signOut, useSignedInEmail } from "@/lib/session";

/**
 * Where the employee lands after the OTP step: one card with their status and
 * the QR code their phone scans.
 */
export default function EmployeePage() {
  const email = useSignedInEmail();
  const employees = useEmployees();
  const seconds = useNowSeconds();
  const now = seconds === null ? null : new Date(seconds * 1000);

  const employee = email
    ? employees.find(
        (candidate) => candidate.email.toLowerCase() === email.toLowerCase()
      )
    : undefined;

  const attendance = now && employee ? getAttendance(now, employee) : null;
  const tone = attendanceTone[attendance?.status ?? "not-started"];

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-4">
      <div className="w-full max-w-sm space-y-3">
        {!email ? (
          <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            Sign in to check in.{" "}
            <Link href="/" className="underline underline-offset-4">
              Go to sign in
            </Link>
          </p>
        ) : !employee ? (
          <div className="space-y-2 rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
            <p className="font-medium">No employee for {email}</p>
            <p className="text-sm text-muted-foreground">
              Ask an admin to add this email, then sign in again.
            </p>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <>
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
  );
}
