"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  LoaderCircleIcon,
  Trash2,
  UserPlus,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  addEmployee,
  fetchDivisions,
  getInitials,
  terminateEmployee,
  updateEmployee,
  type Division,
  type Employee,
  type NewEmployee,
} from "@/lib/employees";
import { isMasterAdmin, ROLES, roleLabel, type Role } from "@/lib/roles";
import { useSession } from "@/lib/session";

const emptyForm: NewEmployee = {
  fullName: "",
  email: "",
  phone: "",
  joinedAt: new Date().toISOString().slice(0, 10),
  divisionIds: [],
};

function toFormValues(employee?: Employee): NewEmployee {
  if (!employee) return { ...emptyForm };

  return {
    fullName: employee.fullName,
    email: employee.email,
    phone: employee.phone ?? "",
    joinedAt: employee.joinedAt.slice(0, 10),
    divisionIds: employee.divisions.map((division) => division.id),
  };
}

export function EmployeeForm({ employee }: { employee?: Employee }) {
  const router = useRouter();
  const session = useSession();
  const isEditing = Boolean(employee);

  const [form, setForm] = React.useState<NewEmployee>(() =>
    toFormValues(employee)
  );
  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof NewEmployee, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isTerminating, setIsTerminating] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void fetchDivisions()
      .then((result) => {
        if (!cancelled) setDivisions(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSubmitError(
            error instanceof Error
              ? error.message
              : "The divisions could not be loaded."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof NewEmployee>(key: K, value: NewEmployee[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function toggleDivision(divisionId: string) {
    setForm((current) => ({
      ...current,
      divisionIds: current.divisionIds.includes(divisionId)
        ? current.divisionIds.filter((id) => id !== divisionId)
        : [...current.divisionIds, divisionId],
    }));
    setErrors((current) => ({ ...current, divisionIds: undefined }));
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof NewEmployee, string>> = {};

    if (!form.fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!form.joinedAt) {
      nextErrors.joinedAt = "Joining date is required.";
    }

    if (form.divisionIds.length === 0) {
      nextErrors.divisionIds = "Choose at least one division.";
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
      if (employee) {
        await updateEmployee(employee.id, form);
      } else {
        await addEmployee(form);
      }

      router.push("/admin/dashboard");
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not save the employee."
      );
      setIsSubmitting(false);
    }
  }

  async function handleTerminate() {
    if (!employee || isTerminating) return;

    if (
      !window.confirm(
        `Terminate ${employee.fullName}? Their login is disabled, but attendance history is kept.`
      )
    ) {
      return;
    }

    setIsTerminating(true);
    setSubmitError(null);

    try {
      await terminateEmployee(employee.id);
      router.push("/admin/dashboard");
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not terminate the employee."
      );
      setIsTerminating(false);
    }
  }

  const canChooseRole = !isEditing && isMasterAdmin(session?.role);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit employee" : "Employee details"}</CardTitle>

          <CardDescription>
            {isEditing
              ? "The dashboard updates as soon as you save."
              : "New employees appear on the dashboard once they have a schedule."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4">
            <Avatar size="lg">
              <AvatarFallback>
                {getInitials(form.fullName) || <UserPlus className="size-4" />}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 space-y-1">
              <p className="truncate font-medium">
                {form.fullName.trim() || "New employee"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {form.email.trim() || "employee@company.com"}
              </p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {employee && (
                <Badge variant="outline">{employee.employmentStatus}</Badge>
              )}
              {form.divisionIds.map((id) => {
                const division = divisions.find((item) => item.id === id);
                return division ? (
                  <Badge key={id} variant="secondary">
                    {division.name}
                  </Badge>
                ) : null;
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.fullName)}>
              <FieldLabel htmlFor="fullName">Full name</FieldLabel>
              <Input
                id="fullName"
                autoComplete="name"
                placeholder="Jane Smith"
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
                placeholder="jane@company.com"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <FieldError>{errors.email}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+62 812 3456 7890"
                value={form.phone ?? ""}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>

            <Field data-invalid={Boolean(errors.joinedAt)}>
              <FieldLabel htmlFor="joinedAt">Joined on</FieldLabel>
              <Input
                id="joinedAt"
                type="date"
                value={form.joinedAt}
                onChange={(event) => update("joinedAt", event.target.value)}
                aria-invalid={Boolean(errors.joinedAt)}
              />
              {errors.joinedAt && <FieldError>{errors.joinedAt}</FieldError>}
            </Field>

            {canChooseRole && (
              <Field>
                <FieldLabel htmlFor="role">Role</FieldLabel>
                <Select
                  value={form.role ?? "EMPLOYEE"}
                  onValueChange={(value) =>
                    update("role", (value ?? "EMPLOYEE") as Role)
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
                  Admins see the dashboard; master admins can also manage roles.
                </FieldDescription>
              </Field>
            )}
          </div>

          <Field data-invalid={Boolean(errors.divisionIds)}>
            <FieldLabel id="division-label">Divisions</FieldLabel>

            <div
              aria-labelledby="division-label"
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            >
              {divisions.map((division) => {
                const checked = form.divisionIds.includes(division.id);

                return (
                  <label
                    key={division.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={() => toggleDivision(division.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {division.name}
                      </span>
                      {division.employeeCount !== undefined && (
                        <span className="block text-xs text-muted-foreground">
                          {division.employeeCount} employee
                          {division.employeeCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}

              {divisions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No divisions yet. Create one through the divisions API first.
                </p>
              )}
            </div>

            {errors.divisionIds && <FieldError>{errors.divisionIds}</FieldError>}
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {submitError && (
          <p role="alert" className="mr-auto text-sm font-medium text-destructive">
            {submitError}
          </p>
        )}

        {employee && (
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="mr-auto gap-1.5"
            onClick={() => void handleTerminate()}
            disabled={isSubmitting || isTerminating}
          >
            {isTerminating ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            {isTerminating ? "Terminating…" : "Terminate"}
          </Button>
        )}

        <Button
          variant="ghost"
          size="lg"
          render={<Link href="/admin/dashboard" />}
          disabled={isSubmitting}
        >
          <ArrowLeft />
          Cancel
        </Button>

        <Button type="submit" size="lg" disabled={isSubmitting || isTerminating}>
          {isSubmitting ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : isEditing ? (
            <Check />
          ) : (
            <UserPlus />
          )}

          {isEditing ? "Save changes" : "Save employee"}
        </Button>
      </div>
    </form>
  );
}
