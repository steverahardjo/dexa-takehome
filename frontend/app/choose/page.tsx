import type { Metadata } from "next";

import { ChooseWorkspace } from "@/components/auth/choose-workspace";

export const metadata: Metadata = {
  title: "Choose your workspace — Absences",
  description:
    "Pick the admin dashboard on a laptop or the employee check-in on a phone.",
};

/** The go-between between signing in and either workspace. */
export default function ChooseWorkspacePage() {
  return <ChooseWorkspace />;
}
