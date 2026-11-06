import Link from "next/link"
import { LaptopIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Shown instead of the admin dashboard on a phone or a narrow window. Server
 * safe: no hooks, so both the proxy redirect and the client gate can render it.
 */
export function DesktopNotice() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
              <LaptopIcon className="size-5 text-muted-foreground" />
            </div>
            <CardTitle>Buka dasbor di laptop</CardTitle>
            <CardDescription>
              Dasbor dirancang untuk layar lebar: daftar karyawan, tabel
              kehadiran, dan panel absen QR memerlukan ruang. Foto absen Anda
              tetap berfungsi dari ponsel.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-2">
            <Link
              href="/employee"
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              Buka layar karyawan saya
            </Link>
            <Link
              href="/"
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "w-full",
              })}
            >
              Kembali ke halaman masuk
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
