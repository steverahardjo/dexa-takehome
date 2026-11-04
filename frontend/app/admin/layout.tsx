import { DesktopOnly } from "@/components/layout/desktop-only";

export const metadata = {
  title: "Admin dashboard — Absences",
};

/**
 * The dashboard is laptop-only. This catches a narrow window; `proxy.ts` catches
 * a phone or tablet before the page is even rendered.
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
