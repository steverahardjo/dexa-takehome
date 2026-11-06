"use client"

import * as React from "react"
import { LoaderCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "cn"

export type LoginFormProps = Omit<React.ComponentProps<"div">, "onSubmit"> & {
  /** Prefills the email field, e.g. when returning from the code step. */
  defaultEmail?: string
  /** Called with the email; resolves when the code has been emailed. */
  onSubmit?: (email: string) => void | Promise<void>
}

export function LoginForm({
  className,
  defaultEmail = "",
  onSubmit,
  ...props
}: LoginFormProps) {
  const [email, setEmail] = React.useState(defaultEmail)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit?.(email.trim())
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Kami tidak dapat memproses masuk Anda. Silakan coba lagi."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Masuk</CardTitle>
          <CardDescription>
            Masukkan email Anda. Kami akan mengirim kode sekali pakai untuk
            memastikan itu Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@contoh.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </Field>
              <Field>
                <FieldError>{error}</FieldError>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <LoaderCircleIcon className="animate-spin" />
                  )}
                  {isSubmitting ? "Mengirim kode…" : "Lanjutkan"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
