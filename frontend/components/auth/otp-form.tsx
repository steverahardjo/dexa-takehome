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
  /** Address the code was sent to. Rendered above the input. */
  email: string
  /** Number of digits in the code. */
  codeLength?: number
  /** Lifetime of a code in seconds, drives the resend timer. */
  expiresInSeconds?: number
  /** Seconds before another code may be requested. */
  resendInSeconds?: number
  /** Dev-only code, shown and prefilled when the API returns one. */
  devCode?: string | null
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
  codeLength = 6,
  expiresInSeconds = 60,
  resendInSeconds = 60,
  devCode = null,
  onChangeEmail,
  onResend,
  onVerify,
  ...props
}: OtpFormProps) {
  const [code, setCode] = React.useState(() => devCode ?? "")
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
      setError(`Enter the ${codeLength}-digit code from your email.`)
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
          : "That code could not be verified. Please try again."
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
      setNotice(`A new ${codeLength}-digit code was sent to ${email}.`)
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : "We could not send a new code. Please try again."
      )
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a {codeLength}-digit confirmation code to your inbox.
            Enter it below to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                      Change
                    </Button>
                  )}
                </div>
              </Field>

              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="otp-code">Confirmation code</FieldLabel>
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
                    ? `The code expires in ${formatCountdown(secondsLeft)}.`
                    : "This code has expired. Request a new one to continue."}
                </FieldDescription>
                {devCode && (
                  <FieldDescription>
                    Dev code:{" "}
                    <span className="font-mono font-semibold tracking-widest text-foreground">
                      {devCode}
                    </span>
                  </FieldDescription>
                )}
                <FieldError id={errorId}>{error}</FieldError>
              </Field>

              <Field>
                <Button type="submit" disabled={!isComplete || isVerifying}>
                  {isVerifying && (
                    <LoaderCircleIcon className="animate-spin" />
                  )}
                  {isVerifying ? "Verifying…" : "Verify code"}
                </Button>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {resend.isActive
                      ? `Resend available in ${formatCountdown(resend.secondsLeft)}`
                      : "Didn't get the code?"}
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
                    {isResending ? "Sending…" : "Resend code"}
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
