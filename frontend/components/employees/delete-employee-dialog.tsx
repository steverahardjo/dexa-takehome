"use client";

import * as React from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteEmployee, type Employee } from "@/lib/employees";

/**
 * The confirmation in front of `DELETE /admin/employees/:id`.
 *
 * Deleting is not a status change, so the dialog spells out what goes: the
 * login identity, the attendance history with its proof photos, and the avatar
 * (`employee.remove` in the service, plus the attendance purge the gateway does
 * first). Only a master admin is offered the button; a plain admin who gets
 * here some other way sees the gateway's 403 as a message.
 */
export function DeleteEmployeeDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee: Employee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      await deleteEmployee(employee.id);
      // The store has refreshed, so this card is already gone; closing is only
      // to keep the dialog from flashing over the new grid.
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Karyawan gagal dihapus.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;

        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hapus {employee.fullName}?</DialogTitle>
          <DialogDescription>
            Akun masuk, seluruh riwayat absen beserta foto buktinya, dan avatar
            ikut terhapus. Tindakan ini tidak dapat dibatalkan.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Batal
          </Button>

          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            {deleting ? "Menghapus…" : "Hapus karyawan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
