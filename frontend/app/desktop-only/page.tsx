import { DesktopNotice } from "@/components/layout/desktop-notice";

export const metadata = {
  title: "Buka di laptop — Absensi",
  description: "Dasbor admin memerlukan layar seukuran laptop.",
};

/** Where `proxy.ts` sends a phone or tablet that asked for `/admin`. */
export default function DesktopOnlyPage() {
  return <DesktopNotice />;
}
