import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EmployeeForm } from "@/components/employees/employee-form";

export const metadata = {
  title: "Tambah karyawan — Absensi",
  description: "Tambahkan karyawan baru ke dasbor kehadiran.",
};

export default function NewEmployeePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke dasbor
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Tambah karyawan</h1>
        <p className="text-sm text-muted-foreground">
          Masukkan data karyawan sekali, lalu pantau absen mereka di dasbor.
        </p>
      </div>

      <EmployeeForm />
    </div>
  );
}
