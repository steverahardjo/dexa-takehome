import { DesktopNotice } from "@/components/desktop-notice";

export const metadata = {
  title: "Open on a laptop — Absences",
  description: "The admin dashboard needs a laptop-sized screen.",
};

/** Where `proxy.ts` sends a phone or tablet that asked for `/admin`. */
export default function DesktopOnlyPage() {
  return <DesktopNotice />;
}
