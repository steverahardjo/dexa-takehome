"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  LoaderCircleIcon,
  Upload,
  UserPlus,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { divisionNames, useDivisionsState } from "@/lib/divisions";
import {
  addEmployee,
  getInitials,
  updateEmployee,
  uploadAvatar,
  type Employee,
} from "@/lib/employees";
import { isMasterAdmin, ROLES, roleLabel, type Role } from "@/lib/roles";
import { useSession } from "@/lib/session";

/** What the form edits, in the flat shape the API accepts (plus a file). */
type FormValues = {
  fullName: string;
  email: string;
  phone: string;
  employeeNumber: string;
  joinedAt: string;
  divisionIds: string[];
  role: Role;
};

const NEW_EMPLOYEE_ROLE: Role = "EMPLOYEE";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toFormValues(employee?: Employee): FormValues {
  if (!employee) {
    return {
      fullName: "",
      email: "",
      phone: "",
      employeeNumber: "",
      joinedAt: todayIso(),
      divisionIds: [],
      role: NEW_EMPLOYEE_ROLE,
    };
  }

  return {
    fullName: employee.fullName,
    email: employee.email,
    phone: employee.phone ?? "",
    employeeNumber: employee.employeeNumber,
    joinedAt: employee.joinedAt.slice(0, 10),
    divisionIds: employee.divisionIds,
    role: NEW_EMPLOYEE_ROLE,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates or edits one employee.
 *
 * The avatar is uploaded first (presigned PUT straight to storage) because the
 * API only accepts a key that points at an object already in the bucket; the
 * form therefore shows the picked file before anything is saved.
 */
export function EmployeeForm({ employee }: { employee?: Employee }) {
  const router = useRouter();
  const session = useSession();
  const { divisions } = useDivisionsState();
  const isEditing = Boolean(employee);

  const [form, setForm] = React.useState<FormValues>(() =>
    toFormValues(employee),
  );
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormValues | "avatar", string>>
  >({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Object URLs are cheap but leak: drop the old one on change and on unmount.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function toggleDivision(divisionId: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      divisionIds: checked
        ? [...current.divisionIds, divisionId]
        : current.divisionIds.filter((id) => id !== divisionId),
    }));
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setAvatarFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setErrors((current) => ({ ...current, avatar: undefined }));
  }

  function validate(): boolean {
    const nextErrors: typeof errors = {};

    if (!form.fullName.trim()) nextErrors.fullName = "Nama lengkap wajib diisi.";

    if (!form.email.trim()) {
      nextErrors.email = "Email wajib diisi.";
    } else if (!EMAIL.test(form.email.trim())) {
      nextErrors.email = "Masukkan alamat email yang valid.";
    }

    if (!form.joinedAt) nextErrors.joinedAt = "Tanggal bergabung wajib diisi.";

    // The employee service requires an avatar key on create.
    if (!isEditing && !avatarFile) {
      nextErrors.avatar = "Tambahkan foto profil sebelum menyimpan.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || !validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const avatarKey = avatarFile ? await uploadAvatar(avatarFile) : undefined;
      const phone = form.phone.trim();
      const divisionIds = form.divisionIds;

      if (employee) {
        await updateEmployee(employee.id, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: phone || null,
          joinedAt: form.joinedAt,
          divisionIds,
          ...(avatarKey ? { avatarKey } : {}),
        });
      } else {
        if (!avatarKey) {
          // validate() already requires one; this keeps the type honest.
          throw new Error("Tambahkan foto profil sebelum menyimpan.");
        }

        await addEmployee({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          joinedAt: form.joinedAt,
          divisionIds,
          avatarKey,
          ...(phone ? { phone } : {}),
          ...(form.employeeNumber.trim()
            ? { employeeNumber: form.employeeNumber.trim() }
            : {}),
          // Ignored by the gateway unless the caller is a master admin.
          role: form.role,
        });
      }

      router.push("/admin/dashboard");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Karyawan tidak dapat disimpan.",
      );
      setIsSubmitting(false);
    }
  }

  const avatarSrc = previewUrl ?? employee?.avatarUrl ?? undefined;
  const divisionLabel = divisionNames(divisions, form.divisionIds).join(", ");

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {isEditing ? "Ubah karyawan" : "Detail karyawan"}
          </CardTitle>

          <CardDescription>
            {isEditing
              ? "Kartu di dasbor diperbarui segera setelah Anda menyimpan."
              : "Email menjadi identitas masuk karyawan. Mereka dapat langsung masuk dengan kode sekali pakai."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Employee preview */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4">
            <Avatar size="lg">
              <AvatarImage src={avatarSrc} alt="" />
              <AvatarFallback>
                {getInitials(form.fullName) || <UserPlus className="size-4" />}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 space-y-1">
              <p className="truncate font-medium">
                {form.fullName.trim() || (isEditing ? "Karyawan" : "Karyawan baru")}
              </p>

              <p className="truncate text-sm text-muted-foreground">
                {form.email.trim() || "karyawan@perusahaan.com"}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {form.employeeNumber && (
                <Badge variant="outline">{form.employeeNumber}</Badge>
              )}
              {divisionLabel && <Badge variant="secondary">{divisionLabel}</Badge>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.fullName)}>
              <FieldLabel htmlFor="fullName">Nama lengkap</FieldLabel>
              <Input
                id="fullName"
                autoComplete="name"
                placeholder="Budi Santoso"
                value={form.fullName}
                onChange={(event) => update("fullName", event.target.value)}
                aria-invalid={Boolean(errors.fullName)}
              />
              {errors.fullName && <FieldError>{errors.fullName}</FieldError>}
            </Field>

            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="budi@perusahaan.com"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <FieldError>{errors.email}</FieldError>}
              <FieldDescription>
                Mengubah ini juga mengubah identitas masuk.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="phone">Telepon</FieldLabel>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+62 812 3456 7890"
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>

            <Field data-invalid={Boolean(errors.joinedAt)}>
              <FieldLabel htmlFor="joinedAt">Bergabung</FieldLabel>
              <Input
                id="joinedAt"
                type="date"
                value={form.joinedAt}
                onChange={(event) => update("joinedAt", event.target.value)}
                aria-invalid={Boolean(errors.joinedAt)}
              />
              {errors.joinedAt && <FieldError>{errors.joinedAt}</FieldError>}
            </Field>

            {!isEditing && (
              <Field>
                <FieldLabel htmlFor="employeeNumber">
                  Nomor karyawan
                </FieldLabel>
                <Input
                  id="employeeNumber"
                  placeholder="Dibuat otomatis jika kosong"
                  value={form.employeeNumber}
                  onChange={(event) =>
                    update("employeeNumber", event.target.value)
                  }
                />
              </Field>
            )}

            {!isEditing && isMasterAdmin(session?.role) && (
              <Field>
                <FieldLabel htmlFor="role">Peran</FieldLabel>
                <Select
                  value={form.role}
                  onValueChange={(value) =>
                    update("role", (value ?? NEW_EMPLOYEE_ROLE) as Role)
                  }
                >
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Hanya master admin yang dapat menetapkan peran.
                </FieldDescription>
              </Field>
            )}

            <Field
              className="sm:col-span-2"
              data-invalid={Boolean(errors.avatar)}
            >
              <FieldLabel htmlFor="avatar">Foto profil</FieldLabel>
              <label className="inline-flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-input px-2.5 text-sm transition-colors hover:bg-muted">
                <Upload className="size-4" />
                {avatarFile ? avatarFile.name : "Pilih JPG, PNG, atau WebP"}
                <input
                  id="avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleAvatarChange}
                />
              </label>
              {errors.avatar ? (
                <FieldError>{errors.avatar}</FieldError>
              ) : (
                <FieldDescription>
                  Diunggah langsung ke penyimpanan saat Anda menyimpan.
                </FieldDescription>
              )}
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel id="division-label">Divisi</FieldLabel>

              {divisions.length === 0 ? (
                <FieldDescription>
                  Belum ada divisi. Simpan karyawan tanpa divisi, atau tambahkan
                  divisi ke basis data.
                </FieldDescription>
              ) : (
                <div
                  role="group"
                  aria-labelledby="division-label"
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {divisions.map((division) => {
                    const checked = form.divisionIds.includes(division.id);

                    return (
                      <label
                        key={division.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50 has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            toggleDivision(division.id, value === true)
                          }
                        />
                        {division.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Form actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {submitError && (
          <p
            role="alert"
            className="mr-auto text-sm font-medium text-destructive"
          >
            {submitError}
          </p>
        )}

        <Button
          variant="ghost"
          size="lg"
          render={<Link href="/admin/dashboard" />}
          disabled={isSubmitting}
        >
          <ArrowLeft />
          Batal
        </Button>

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : isEditing ? (
            <Check />
          ) : (
            <UserPlus />
          )}

          {isEditing ? "Simpan perubahan" : "Simpan karyawan"}
        </Button>
      </div>
    </form>
  );
}
