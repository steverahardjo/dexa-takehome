"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LoaderCircleIcon,
  ShieldAlert,
  Trash2,
  UserRoundX,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { terminateEmployee, type Employee } from "@/lib/employees";

/**
 * Terminating an employee is the only destructive action in the dashboard: it
 * disables the login and revokes sessions, so it asks for the full name before
 * the button unlocks.
 */
export function TerminateEmployeeDialog({
  employee,
  disabled,
}: {
  employee: Employee;
  disabled?: boolean;
}) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const expectedName = employee.fullName.trim();
  const nameMatches =
    confirmation.trim().toLowerCase() === expectedName.toLowerCase();
  const canConfirm = nameMatches && !isSubmitting;

  function reset() {
    setReason("");
    setConfirmation("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;

    setOpen(next);
    if (!next) reset();
  }

  async function handleConfirm() {
    if (!canConfirm) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await terminateEmployee(
        employee.id,
        reason.trim() || "Terminated by an administrator"
      );

      setOpen(false);
      reset();
      router.push("/admin/dashboard");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The employee could not be terminated."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        type="button"
        className={buttonVariants({
          variant: "destructive",
          size: "lg",
          className: "gap-1.5",
        })}
        disabled={disabled}
      >
        <Trash2 className="size-4" />
        Terminate
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <DialogTitle>Terminate {employee.fullName}?</DialogTitle>
          <DialogDescription>
            This ends the employee&apos;s access immediately. It cannot be
            undone from the dashboard.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
          <li className="flex items-start gap-2">
            <UserRoundX className="mt-0.5 size-4 shrink-0 text-destructive" />
            Login is disabled and active sessions are revoked.
          </li>
          <li className="flex items-start gap-2">
            <UserRoundX className="mt-0.5 size-4 shrink-0 text-destructive" />
            They leave today&apos;s expected attendance.
          </li>
          <li className="flex items-start gap-2">
            <UserRoundX className="mt-0.5 size-4 shrink-0 text-destructive" />
            Attendance history and check-in photos are kept for reporting.
          </li>
        </ul>

        <Field>
          <FieldLabel htmlFor="terminate-reason">Reason (optional)</FieldLabel>
          <Input
            id="terminate-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="End of contract"
            autoComplete="off"
            disabled={isSubmitting}
          />
          <FieldDescription>
            Stored with the termination for the audit trail.
          </FieldDescription>
        </Field>

        <Field data-invalid={confirmation.length > 0 && !nameMatches}>
          <FieldLabel htmlFor="terminate-confirm">
            Type{" "}
            <span className="font-semibold text-foreground">{expectedName}</span>{" "}
            to confirm
          </FieldLabel>
          <Input
            id="terminate-confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={expectedName}
            autoComplete="off"
            autoCapitalize="words"
            aria-invalid={confirmation.length > 0 && !nameMatches}
            disabled={isSubmitting}
          />
          <FieldDescription>
            The name must match exactly before termination is allowed.
          </FieldDescription>
        </Field>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="gap-1.5"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            {isSubmitting ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {isSubmitting ? "Terminating…" : "Terminate employee"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
