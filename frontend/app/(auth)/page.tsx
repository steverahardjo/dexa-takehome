"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { LoginForm } from "@/components/login-form"
import { OtpForm } from "@/components/otp-form"
import { useEmployees } from "@/lib/employees"
import { signIn } from "@/lib/session"

const OTP_LENGTH = 6
const OTP_TTL_SECONDS = 60

/** Demo only: the code the mock backend accepts. */
const DEMO_OTP_CODE = "123456"

type Step = "login" | "otp"

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function LoginPage() {
  const router = useRouter()
  const employees = useEmployees()
  const [step, setStep] = React.useState<Step>("login")
  const [email, setEmail] = React.useState("")

  // Demo: the first employee is prefilled so the mocked flow has an account
  // that actually has an employee page behind it.
  const demoEmail = employees[0]?.email ?? ""

  // TODO: replace these mocks with real requests to your auth backend.
  async function handleLogin(email: string) {
    await delay(600)

    if (!email) {
      throw new Error("Enter your email address to continue.")
    }

    console.info(`[mock] code for ${email}: ${DEMO_OTP_CODE}`)
    setEmail(email)
    setStep("otp")
  }

  async function handleVerify(code: string) {
    await delay(700)

    if (code !== DEMO_OTP_CODE) {
      throw new Error("That code is incorrect. Check your email and try again.")
    }

    signIn(email)
    router.push("/employee")
  }

  async function handleResend() {
    await delay(600)
    console.info(`[mock] resent code for ${email}: ${DEMO_OTP_CODE}`)
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

  return <LoginForm defaultEmail={email || demoEmail} onSubmit={handleLogin} />
}
