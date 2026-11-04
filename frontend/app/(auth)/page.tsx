"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { OtpForm } from "@/components/auth/otp-form"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { Role } from "@/lib/employees"
import { expiresAtIn, signIn } from "@/lib/session"

const OTP_LENGTH = 6
const OTP_RESEND_SECONDS = 60

/** The account the demo database seeds as HR Admin. */
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "john@company.com"

type Step = "login" | "otp" | "choose"

/** The two screens an admin account can open. */
type ViewChoice = "admin" | "employee"

type OtpRequested = {
  message: string
  expiresIn: number
}

type SignedInUser = {
  id: string
  email: string
  name: string
  role: Role
}

type OtpVerified = {
  accessToken: string
  expiresIn: number
  tokenType: "Bearer"
  user: SignedInUser
}

/**
 * An admin account is not signed in yet: the code was good, and the API asks
 * which of the two screens this session should open.
 */
type RoleChoiceResponse = {
  needsChoice: true
  choiceToken: string
  expiresIn: number
  user: SignedInUser
  options: { view: ViewChoice; label: string; role: Role }[]
}

type VerifyResult = OtpVerified | RoleChoiceResponse

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>("login")
  const [email, setEmail] = React.useState("")
  const [expiresIn, setExpiresIn] = React.useState(10 * 60)
  const [choice, setChoice] = React.useState<{
    token: string
    email: string
    options: { view: ViewChoice; label: string }[]
  } | null>(null)
  const [choosing, setChoosing] = React.useState<ViewChoice | null>(null)
  const [choiceError, setChoiceError] = React.useState<string | null>(null)

  /** Asks the auth service for a code and moves to the code step. */
  async function requestCode(address: string) {
    const result = await api<OtpRequested>("/auth/otp", {
      method: "POST",
      body: { email: address },
      auth: false,
    })

    setEmail(address)
    setExpiresIn(result.expiresIn)
    setStep("otp")
  }

  async function handleLogin(address: string) {
    const trimmed = address.trim()

    if (!trimmed) {
      throw new Error("Enter your email address to continue.")
    }

    await requestCode(trimmed)
  }

  /** Stores the session and opens the screen the role belongs to. */
  function openScreen(session: OtpVerified) {
    signIn({
      email: session.user.email,
      token: session.accessToken,
      role: session.user.role,
      expiresAt: expiresAtIn(session.expiresIn),
    })

    router.push(
      session.user.role === "HR Admin" ? "/admin/dashboard" : "/employee"
    )
  }

  async function handleVerify(code: string) {
    const result = await api<VerifyResult>("/auth/otp/verify", {
      method: "POST",
      body: { email, code },
      auth: false,
    })

    if ("choiceToken" in result) {
      setChoice({
        token: result.choiceToken,
        email: result.user.email,
        options: result.options,
      })
      setStep("choose")
      return
    }

    openScreen(result)
  }

  /** The choice token buys the view that was picked. */
  async function handleChoose(view: ViewChoice) {
    if (!choice) return

    setChoiceError(null)
    setChoosing(view)

    try {
      const session = await api<OtpVerified>("/auth/choice", {
        method: "POST",
        body: { view },
        auth: false,
        token: choice.token,
      })

      openScreen(session)
    } catch (chooseError) {
      setChoiceError(
        chooseError instanceof Error
          ? chooseError.message
          : "That view could not be opened. Pick again."
      )
      setChoosing(null)
    }
  }

  async function handleResend() {
    await requestCode(email)
  }

  // An admin picks between the dashboard and the employee screen, right here.
  if (step === "choose" && choice) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{choice.email}</span>.
          Where do you want to go?
        </p>

        {choice.options.map((option) => (
          <Button
            key={option.view}
            size="lg"
            className="w-full"
            variant={option.view === "admin" ? "default" : "outline"}
            disabled={choosing !== null}
            onClick={() => handleChoose(option.view)}
          >
            {choosing === option.view ? "Opening…" : option.label}
          </Button>
        ))}

        {choiceError && (
          <p className="text-sm text-destructive">{choiceError}</p>
        )}

        <Button
          variant="ghost"
          size="sm"
          disabled={choosing !== null}
          onClick={() => {
            setChoice(null)
            setChoiceError(null)
            setStep("login")
          }}
        >
          Use a different account
        </Button>
      </div>
    )
  }

  if (step === "otp") {
    return (
      <OtpForm
        email={email}
        codeLength={OTP_LENGTH}
        expiresInSeconds={expiresIn}
        resendInSeconds={OTP_RESEND_SECONDS}
        onVerify={handleVerify}
        onResend={handleResend}
        onChangeEmail={() => setStep("login")}
      />
    )
  }

  return <LoginForm defaultEmail={email || DEMO_EMAIL} onSubmit={handleLogin} />
}
