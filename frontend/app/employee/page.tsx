"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircle, LogOut } from "lucide-react";

import { CheckInPanel } from "@/components/attendance/checkin-panel";
import { Button } from "@/components/ui/button";
import { useSignedInState } from "@/lib/employees";
import { signOut, useSession } from "@/lib/session";

export default function EmployeePage() {
  const session = useSession();
  const { employee, attendance, status, error } = useSignedInState();

  const isLoading = status === "idle" || status === "loading";

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
            <CheckInPanel employee={employee} attendance={attendance} />

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
