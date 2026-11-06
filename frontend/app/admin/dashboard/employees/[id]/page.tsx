import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EditEmployeeForm } from "@/components/employees/edit-employee-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Ubah karyawan — Absensi",
  description: "Muat detail karyawan saat ini dan perbarui.",
};

/**
 * The id is request-time data, so it is resolved inside a boundary: the heading
 * and the back link stay in the static shell and only the card waits.
 */
export default function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

        <h1 className="text-2xl font-semibold tracking-tight">Ubah karyawan</h1>
        <p className="text-sm text-muted-foreground">
          Kartu saat ini dimuat di bawah — sesuaikan apa pun dan simpan untuk
          memperbarui dasbor.
        </p>
      </div>

      <Suspense fallback={<EmployeeFormSkeleton />}>
        {params.then(({ id }) => (
          <EditEmployeeForm employeeId={id} />
        ))}
      </Suspense>
    </div>
  );
}

/**
 * Mirrors the card the form shows while it waits for the employee list, so the
 * swap to the loaded form does not move the page around.
 */
function EmployeeFormSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
        <p className="font-medium">Memuat karyawan…</p>
        <p className="text-sm text-muted-foreground">
          Membaca data tersimpan dari API.
        </p>
      </CardContent>
    </Card>
  );
}
