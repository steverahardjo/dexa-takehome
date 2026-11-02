"use client"

import * as React from "react"
import { CheckCircle2Icon } from "lucide-react"

import { LoginForm } from "@/components/login-form"
import { OtpForm } from "@/components/otp-form"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const OTP_LENGTH = 6
const OTP_TTL_SECONDS = 60

/** Demo only: the code the mock backend accepts. */
const DEMO_OTP_CODE = "123456"

type Step = "login" | "otp" | "done"

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function LoginPage() {
  const [step, setStep] = React.useState<Step>("login")
  const [email, setEmail] = React.useState("")

  // TODO: replace these mocks with real requests to your auth backend.
  async function handleLogin(credentials: { email: string; password: string }) {
    await delay(600)

    if (!credentials.email) {
      throw new Error("Enter your email address to continue.")
    }

    console.info(`[mock] code for ${credentials.email}: ${DEMO_OTP_CODE}`)
    setEmail(credentials.email)
    setStep("otp")
  }

  async function handleVerify(code: string) {
    await delay(700)

    if (code !== DEMO_OTP_CODE) {
      throw new Error("That code is incorrect. Check your email and try again.")
    }

    setStep("done")
  }

  async function handleResend() {
    await delay(600)
    console.info(`[mock] resent code for ${email}: ${DEMO_OTP_CODE}`)
  }

  if (step === "done") {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2Icon className="size-8 text-primary" />
          <CardTitle>You&apos;re signed in</CardTitle>
          <CardDescription>
            {email} was verified successfully on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStep("login")
              setEmail("")
            }}
          >
            Use a different account
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === "otp") {
    return (
      <OtpForm
        email={email}
        codeLength={OTP_LENGTH}
        expiresInSeconds={OTP_TTL_SECONDS}
        onVerify={handleVerify}
        onResend={handleResend}
        onChangeEmail={() => setStep("login")}
      />
    )
  }

  return <LoginForm defaultEmail={email} onSubmit={handleLogin} />
}
