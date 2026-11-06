import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Absen karyawan — Absensi",
  description: "Absen dengan kamera ponsel dan bagikan lokasi Anda.",
};

export default function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
