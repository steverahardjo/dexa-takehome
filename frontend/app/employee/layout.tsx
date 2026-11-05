import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Employee check-in — Absences",
  description: "Clock in with your phone camera and share your location.",
};

export default function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
