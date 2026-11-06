import type { Metadata } from "next";

import { ChooseWorkspace } from "@/components/auth/choose-workspace";

export const metadata: Metadata = {
  title: "Pilih ruang kerja Anda — Absensi",
  description:
    "Pilih dasbor admin di laptop atau absen karyawan di ponsel.",
};

/** The go-between between signing in and either workspace. */
export default function ChooseWorkspacePage() {
  return <ChooseWorkspace />;
}
