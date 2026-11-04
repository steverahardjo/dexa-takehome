
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, LoaderCircleIcon, UserPlus } from "lucide-react";

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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DIVISIONS,
  ROLES,
  addEmployee,
  getInitials,
  updateEmployee,
  type Employee,
  type NewEmployee,
  type Role,
} from "@/lib/employees";

const emptyForm: NewEmployee = {
  name: "",
  email: "",
  phone: "",
  role: "Employee",
  division: "",
  address: "",
  contractExpiry: "",
  avatar: "",
};

function toFormValues(employee?: Employee): NewEmployee {
  if (!employee) return { ...emptyForm };

  return {
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    role: employee.role,
    division: employee.division,
    address: employee.address,
    contractExpiry: employee.contractExpiry,
    avatar: employee.avatar ?? "",
  };
}

export function EmployeeForm({ employee }: { employee?: Employee }) {
  const router = useRouter();
  const isEditing = Boolean(employee);

  const [form, setForm] = React.useState<NewEmployee>(() =>
    toFormValues(employee)
  );

  const [errors, setErrors] = React.useState<
    Partial<Record<keyof NewEmployee, string>>
  >({});

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  function update<K extends keyof NewEmployee>(
    key: K,
    value: NewEmployee[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    setErrors((current) => ({
      ...current,
      [key]: undefined,
    }));
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof NewEmployee, string>> = {};

    if (!form.name.trim()) {
      nextErrors.name = "Full name is required.";
    }

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!form.division) {
      nextErrors.division = "Choose a division.";
    }

    if (!form.contractExpiry) {
      nextErrors.contractExpiry = "Contract expiry date is required.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isSubmitting || !validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const values: NewEmployee = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      division: form.division,
      address: form.address.trim(),
      avatar: form.avatar?.trim() || undefined,
    };

    try {
      if (employee) {
        await updateEmployee(employee.id, values);
      } else {
        await addEmployee(values);
      }

      router.push("/admin/dashboard");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not save the employee."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {isEditing ? "Edit employee" : "Employee details"}
          </CardTitle>

          <CardDescription>
            {isEditing
              ? "The card on the dashboard updates as soon as you save."
              : "New employees appear on the dashboard right away with their attendance."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Employee preview */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4">
            <Avatar size="lg">
              <AvatarImage src={form.avatar || undefined} alt="" />
              <AvatarFallback>
                {getInitials(form.name) || (
                  <UserPlus className="size-4" />
                )}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 space-y-1">
              <p className="truncate font-medium">
                {form.name.trim() || (isEditing ? "Employee" : "New employee")}
              </p>

              <p className="truncate text-sm text-muted-foreground">
                {form.email.trim() || "employee@company.com"}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline">{form.role}</Badge>
              {form.division && (
                <Badge variant="secondary">{form.division}</Badge>
              )}
              <Badge variant="secondary">WFH</Badge>
            </div>
          </div>

          {/* Employee information */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input
                id="name"
                autoComplete="name"
                placeholder="Jane Smith"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
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
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input
                id="address"
                autoComplete="street-address"
                placeholder="Jl. Kemang 4, Jakarta"
                value={form.address}
                onChange={(event) => update("address", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="role">Role</FieldLabel>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  update("role", (value ?? "Employee") as Role)
                }
              >
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field data-invalid={Boolean(errors.contractExpiry)}>
              <FieldLabel htmlFor="contractExpiry">
                Contract expiry
              </FieldLabel>
              <Input
                id="contractExpiry"
                type="date"
                value={form.contractExpiry}
                onChange={(event) =>
                  update("contractExpiry", event.target.value)
                }
                aria-invalid={Boolean(errors.contractExpiry)}
              />
              {errors.contractExpiry && (
                <FieldError>{errors.contractExpiry}</FieldError>
              )}
            </Field>

            <Field
              className="sm:col-span-2"
              data-invalid={Boolean(errors.division)}
            >
              <FieldLabel id="division-label">Division</FieldLabel>

              <RadioGroup
                aria-labelledby="division-label"
                aria-invalid={Boolean(errors.division)}
                value={form.division}
                onValueChange={(value) => update("division", value)}
                className="grid gap-2 sm:grid-cols-3"
              >
                {DIVISIONS.map((division) => (
                  <label
                    key={division}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50 has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
                  >
                    <Radio value={division} />
                    {division}
                  </label>
                ))}
              </RadioGroup>

              {errors.division && <FieldError>{errors.division}</FieldError>}
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="avatar">Avatar image URL</FieldLabel>
              <Input
                id="avatar"
                type="url"
                placeholder="https://example.com/avatar.png"
                value={form.avatar ?? ""}
                onChange={(event) => update("avatar", event.target.value)}
              />
              <FieldDescription>
                Optional. Initials are shown when the image cannot load.
              </FieldDescription>
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
          Cancel
        </Button>

        <Button type="submit" size="lg" disabled={isSubmitting}>
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
