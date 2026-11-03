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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ROLES,
  addEmployee,
  getInitials,
  updateEmployee,
  type Employee,
  type NewEmployee,
  type Role,
} from "@/lib/employees";
import { timeToMinutes } from "@/lib/time";

const emptyForm: NewEmployee = {
  name: "",
  email: "",
  phone: "",
  role: "Employee",
  division: "",
  address: "",
  contractExpiry: "",
  leaveBalance: 12,
  workStart: "09:00",
  workEnd: "17:00",
  avatar: "",
  evidence: "",
};

function toFormValues(employee?: Employee): NewEmployee {
  if (!employee) return emptyForm;

  return {
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    role: employee.role,
    division: employee.division,
    address: employee.address,
    contractExpiry: employee.contractExpiry,
    leaveBalance: employee.leaveBalance,
    workStart: employee.workStart,
    workEnd: employee.workEnd,
    avatar: employee.avatar ?? "",
    evidence: employee.evidence ?? "",
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

  function update<K extends keyof NewEmployee>(key: K, value: NewEmployee[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof NewEmployee, string>> = {};

    if (!form.name.trim()) nextErrors.name = "Full name is required.";

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!form.division.trim()) nextErrors.division = "Division is required.";

    if (!form.contractExpiry) {
      nextErrors.contractExpiry = "Contract expiry date is required.";
    }

    if (!Number.isFinite(form.leaveBalance)) {
      nextErrors.leaveBalance = "Enter a number of days.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    const values: NewEmployee = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      division: form.division.trim(),
      address: form.address.trim(),
      avatar: form.avatar?.trim() ? form.avatar.trim() : undefined,
      evidence: form.evidence?.trim() ? form.evidence.trim() : undefined,
    };

    if (employee) {
      updateEmployee(employee.id, values);
    } else {
      addEmployee(values);
    }

    router.push("/admin/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit employee" : "Employee details"}</CardTitle>
          <CardDescription>
            {isEditing
              ? "The card on the dashboard updates as soon as you save."
              : "New employees appear on the dashboard right away with their work start time and attendance."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4">
            <Avatar size="lg">
              <AvatarImage src={form.avatar || undefined} alt="" />
              <AvatarFallback>
                {getInitials(form.name) || <UserPlus className="size-4" />}
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
              <Badge variant="secondary">WFH</Badge>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input
                id="name"
                autoComplete="name"
                placeholder="Jane Smith"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
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

            <Field data-invalid={Boolean(errors.division)}>
              <FieldLabel htmlFor="division">Division</FieldLabel>
              <Input
                id="division"
                placeholder="Engineering"
                value={form.division}
                onChange={(event) => update("division", event.target.value)}
              />
              {errors.division && <FieldError>{errors.division}</FieldError>}
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
                onValueChange={(value) => update("role", (value ?? "Employee") as Role)}
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
              <FieldLabel htmlFor="contractExpiry">Contract expiry</FieldLabel>
              <Input
                id="contractExpiry"
                type="date"
                value={form.contractExpiry}
                onChange={(event) =>
                  update("contractExpiry", event.target.value)
                }
              />
              {errors.contractExpiry && (
                <FieldError>{errors.contractExpiry}</FieldError>
              )}
            </Field>

            <Field data-invalid={Boolean(errors.workStart)}>
              <FieldLabel htmlFor="workStart">Work start</FieldLabel>
              <Input
                id="workStart"
                type="time"
                value={form.workStart}
                onChange={(event) => update("workStart", event.target.value)}
              />
              <FieldDescription>
                Countdown on the dashboard targets this time.
              </FieldDescription>
              {errors.workStart && <FieldError>{errors.workStart}</FieldError>}
            </Field>

            <Field data-invalid={Boolean(errors.leaveBalance)}>
              <FieldLabel htmlFor="leaveBalance">Leave balance (days)</FieldLabel>
              <Input
                id="leaveBalance"
                type="number"
                step="1"
                inputMode="numeric"
                value={form.leaveBalance}
                onChange={(event) =>
                  update("leaveBalance", event.target.valueAsNumber)
                }
              />
              <FieldDescription>
                Negative values mark the employee as out of leave balance.
              </FieldDescription>
              {errors.leaveBalance && (
                <FieldError>{errors.leaveBalance}</FieldError>
              )}
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="lg"
          render={<Link href="/admin/dashboard" />}
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
