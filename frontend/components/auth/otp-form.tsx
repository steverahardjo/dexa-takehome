"use client"

import * as React from "react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import {
  LoaderCircleIcon,
  MailIcon,
  PencilIcon,
  RotateCwIcon,
} from "lucide-react"

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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { formatCountdown, useCountdown } from "@/hooks/use-countdown"
import { cn } from "cn"

export type OtpFormProps = Omit<React.ComponentProps<"div">, "onSubmit"> & {
  /** Address the code was issued for. Rendered above the input. */
  email: string
  /**
   * The code the API returned with the login request (no email is sent).
   * Shown on the screen, with a button that fills the input.
   */
  issuedCode?: string | null
  /** Number of digits in the code. */
  codeLength?: number
  /** Lifetime of a code in seconds, drives the resend timer. */
  expiresInSeconds?: number
  /** Seconds before another code may be requested. */
  resendInSeconds?: number
  /** Lets the user go back and edit the address. */
  onChangeEmail?: () => void
  /** Request a new code. The timer restarts when it resolves. */
  onResend?: (email: string) => void | Promise<void>
  /** Validate the entered code. Throw to surface an error message. */
  onVerify?: (code: string, email: string) => void | Promise<void>
}

export function OtpForm({
  className,
  email,
  issuedCode = null,
  codeLength = 6,
  expiresInSeconds = 60,
  resendInSeconds = 60,
  onChangeEmail,
  onResend,
  onVerify,
  ...props
}: OtpFormProps) {
  const [code, setCode] = React.useState("")
  const [isVerifying, setIsVerifying] = React.useState(false)
  const [isResending, setIsResending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const { secondsLeft, isActive, start } = useCountdown(expiresInSeconds)
  const resend = useCountdown(resendInSeconds)

  // The first code is sent by the login step, so start the timer on mount.
  React.useEffect(() => {
    start(expiresInSeconds)
    resend.start(resendInSeconds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isComplete = code.length === codeLength
  const canResend = !resend.isActive && !isVerifying && !isResending
  const errorId = "otp-code-error"
  const hintId = "otp-code-hint"

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)

    if (!isComplete) {
      setError(`Masukkan kode ${codeLength} digit untuk melanjutkan.`);
      return
    }

    setError(null)
    setIsVerifying(true)

    try {
      await onVerify?.(code, email)
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Kode tersebut tidak dapat diverifikasi. Silakan coba lagi."
      )
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResend() {
    setError(null)
    setNotice(null)
    setIsResending(true)

    try {
      await onResend?.(email)
      setCode("")
      start(expiresInSeconds)
      resend.start(resendInSeconds)
      setNotice(
        `Kode ${codeLength} digit baru diterbitkan. Lihat kode di atas.`
      );
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : "Kami tidak dapat mengirim kode baru. Silakan coba lagi."
      )
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Masukkan kode</CardTitle>
          <CardDescription>
            {issuedCode
              ? `Kode konfirmasi ${codeLength} digit untuk ${email} tampil di bawah ini. Email tidak dikirim.`
              : `Kode tidak diterbitkan untuk ${email}. Periksa kembali alamatnya, atau masuk dengan akun lain.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {issuedCode && (
            <div
              className="rounded-lg border border-dashed border-amber-500/60 bg-amber-500/10 p-3"
              role="status"
            >
              <p className="text-sm font-medium">Kode konfirmasi Anda</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="font-mono text-2xl font-semibold tracking-[0.3em]">
                  {issuedCode}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto shrink-0"
                  onClick={() => {
                    setCode(issuedCode)
                    setError(null)
                  }}
                  disabled={isVerifying}
                >
                  Isi otomatis
                </Button>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="otp-email">Email</FieldLabel>
                <div
                  id="otp-email"
                  data-slot="input"
                  className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <MailIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{email}</span>
                  {onChangeEmail && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="ml-auto shrink-0"
                      onClick={onChangeEmail}
                      disabled={isVerifying}
                    >
                      <PencilIcon />
                      Ubah
                    </Button>
                  )}
                </div>
              </Field>

              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="otp-code">Kode konfirmasi</FieldLabel>
                <InputOTP
                  id="otp-code"
                  value={code}
                  onChange={(value) => {
                    setCode(value)
                    if (error) setError(null)
                  }}
                  maxLength={codeLength}
                  pattern={REGEXP_ONLY_DIGITS}
                  disabled={isVerifying}
                  autoFocus
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${hintId} ${errorId}` : hintId}
                >
                  <InputOTPGroup>
                    {Array.from({ length: codeLength }, (_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="size-9 text-base sm:size-10"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <FieldDescription id={hintId}>
                  {isActive
                    ? `Kode kedaluwarsa dalam ${formatCountdown(secondsLeft)}.`
                    : "Kode ini telah kedaluwarsa. Minta kode baru untuk melanjutkan."}
                </FieldDescription>
                <FieldError id={errorId}>{error}</FieldError>
              </Field>

              <Field>
                <Button type="submit" disabled={!isComplete || isVerifying}>
                  {isVerifying && (
                    <LoaderCircleIcon className="animate-spin" />
                  )}
                  {isVerifying ? "Memverifikasi…" : "Verifikasi kode"}
                </Button>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {resend.isActive
                      ? `Kode baru tersedia dalam ${formatCountdown(resend.secondsLeft)}`
                      : "Butuh kode baru?"}
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={handleResend}
                    disabled={!canResend}
                  >
                    {isResending ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <RotateCwIcon />
                    )}
                    {isResending ? "Menerbitkan…" : "Terbitkan kode baru"}
                  </Button>
                </div>
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
