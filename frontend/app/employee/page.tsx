"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircle, LogOut } from "lucide-react";

import { CheckInPanel } from "@/components/attendance/checkin-panel";
import { Button } from "@/components/ui/button";
import { useSignedInEmployee } from "@/lib/employees";
import { signOut, useSession } from "@/lib/session";

export default function EmployeePage() {
  const session = useSession();
  const { employee, status, error } = useSignedInEmployee();

  const isLoading = status === "idle" || status === "loading";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-4">
      <div className="w-full max-w-sm space-y-3">
        {!session ? (
          <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            Masuk untuk melakukan absen.{" "}
            <Link href="/" className="underline underline-offset-4">
              Buka halaman masuk
            </Link>
          </p>
        ) : isLoading ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            <LoaderCircle className="size-4 animate-spin" />
            Memuat data Anda…
          </p>
        ) : !employee ? (
          <div className="space-y-2 rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
            <p className="font-medium">
              {status === "error"
                ? "Data Anda tidak dapat dimuat"
                : `Tidak ada karyawan untuk ${session.email}`}
            </p>

            <p className="text-sm text-muted-foreground">
              {status === "error" && error
                ? error
                : "Minta admin menambahkan email ini, lalu masuk kembali."}
            </p>

            <Button variant="outline" size="sm" onClick={signOut}>
              Keluar
            </Button>
          </div>
        ) : (
          <>
            <CheckInPanel key={employee.id} employee={employee} />

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut />
                Keluar
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
