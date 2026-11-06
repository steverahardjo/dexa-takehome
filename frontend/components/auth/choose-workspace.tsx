"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  LaptopIcon,
  LoaderCircleIcon,
  LogOutIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useIsDesktop } from "@/lib/device";
import { isAdminRole, roleLabel } from "@/lib/roles";
import { signOut, useSession } from "@/lib/session";

/**
 * The go-between after an admin signs in. It is a real page (`/choose`) so the
 * choice can be revisited from the dashboard instead of being a one-shot
 * redirect hidden inside the OTP screen.
 *
 * Both options are always rendered; only the one that fits the current device
 * is actionable, and the other explains where it lives.
 */
export function ChooseWorkspace() {
  const router = useRouter();
  const session = useSession();
  const isDesktop = useIsDesktop();

  // Only admins have a choice. Everyone else belongs on the check-in screen.
  React.useEffect(() => {
    if (session && !isAdminRole(session.role)) router.replace("/employee");
  }, [session, router]);

  if (!session) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Pilih ruang kerja Anda</CardTitle>
            <CardDescription>
              Masuk terlebih dahulu — lalu pilih dasbor admin atau layar absen
              karyawan.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              href="/"
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              Buka halaman masuk
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!isAdminRole(session.role)) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
            <p className="font-medium">Mengarahkan Anda ke halaman absen…</p>
            <p className="text-sm text-muted-foreground">
              Dasbor admin hanya tersedia untuk admin.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="space-y-1 text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Masuk sebagai {session.email} · {roleLabel(session.role)}
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Pilih ruang kerja Anda
        </h1>
        <p className="text-sm text-muted-foreground">
          Dasbor memerlukan laptop. Absen memerlukan kamera ponsel Anda.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <WorkspaceOption
          href="/admin/dashboard"
          icon={LaptopIcon}
          title="Dasbor admin"
          description="Karyawan, jadwal, dan laporan kehadiran di layar lebar."
          actionLabel="Buka dasbor"
          deviceLabel="Laptop"
          available={isDesktop}
          unavailableLabel="Perlu laptop"
          unavailableHint="Buka halaman ini di komputer untuk menggunakan dasbor."
        />

        <WorkspaceOption
          href="/employee"
          icon={SmartphoneIcon}
          title="Absen karyawan"
          description="Absen dengan kamera ponsel dan bagikan lokasi Anda."
          actionLabel="Buka absen"
          deviceLabel="Ponsel"
          available={!isDesktop}
          unavailableLabel="Perlu ponsel"
          unavailableHint="Buka halaman ini di ponsel Anda untuk absen."
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={signOut}>
          <LogOutIcon className="size-4" />
          Keluar
        </Button>
        <p className="text-xs text-muted-foreground">
          Anda dapat kembali ke sini dengan “Ganti ruang kerja”.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-3xl space-y-6">{children}</div>
    </main>
  );
}

type WorkspaceOptionProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  deviceLabel: string;
  available: boolean;
  unavailableLabel: string;
  unavailableHint: string;
};

function WorkspaceOption({
  href,
  icon: Icon,
  title,
  description,
  actionLabel,
  deviceLabel,
  available,
  unavailableLabel,
  unavailableHint,
}: WorkspaceOptionProps) {
  return (
    <Card className={available ? "h-full" : "h-full opacity-70"}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <Badge variant={available ? "secondary" : "outline"}>
            {available ? deviceLabel : unavailableLabel}
          </Badge>
        </div>

        <CardTitle className="mt-1">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="mt-auto space-y-2">
        {available ? (
          <Link
            href={href}
            className={buttonVariants({
              size: "lg",
              className: "w-full justify-between",
            })}
          >
            {actionLabel}
            <ArrowRightIcon className="size-4" />
          </Link>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              disabled
            >
              {unavailableLabel}
            </Button>
            <p className="text-xs text-muted-foreground">{unavailableHint}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
