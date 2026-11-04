"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { OtpForm } from "@/components/auth/otp-form";
import { api } from "@/lib/api";
import type { Role } from "@/lib/roles";
import { isAdminRole } from "@/lib/roles";
import { expiresAtIn, signIn } from "@/lib/session";

const OTP_LENGTH = 6;
const OTP_RESEND_SECONDS = 60;

/** Prefilled on the sign-in form; the seed creates this account. */
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "master@absences.local";

type Step = "login" | "otp";

type OtpRequested = {
  message: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** Present outside production when OTP_DEV_RETURN=true. */
  devCode?: string;
};

type SignedInUser = {
  identityId: string;
  employeeId: string;
  email: string;
  role: Role;
};

type OtpVerified = {
  user: SignedInUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: "Bearer";
    expiresIn: number;
    refreshExpiresIn: number;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("login");
  const [email, setEmail] = React.useState("");
  const [expiresIn, setExpiresIn] = React.useState(5 * 60);
  const [resendIn, setResendIn] = React.useState(OTP_RESEND_SECONDS);
  const [devCode, setDevCode] = React.useState<string | null>(null);

  /** Asks the auth service for a code and moves to the code step. */
  async function requestCode(address: string) {
    const result = await api<OtpRequested>("/auth/request-otp", {
      method: "POST",
      body: { email: address },
      auth: false,
    });

    setEmail(address.trim().toLowerCase());
    setExpiresIn(result.expiresInSeconds);
    setResendIn(result.resendAfterSeconds);
    setDevCode(result.devCode ?? null);
    setStep("otp");
  }

  async function handleLogin(address: string) {
    const trimmed = address.trim();

    if (!trimmed) {
      throw new Error("Enter your email address to continue.");
    }

    await requestCode(trimmed);
  }

  /** Stores the session and opens the screen the role belongs to. */
  function openScreen(result: OtpVerified) {
    signIn({
      email: result.user.email,
      token: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      role: result.user.role,
      expiresAt: expiresAtIn(result.tokens.expiresIn),
    });

    router.push(
      isAdminRole(result.user.role) ? "/admin/dashboard" : "/employee"
    );
  }

  async function handleVerify(code: string) {
    const result = await api<OtpVerified>("/auth/verify-otp", {
      method: "POST",
      body: { email, otp: code },
      auth: false,
    });

    openScreen(result);
  }

  async function handleResend() {
    await requestCode(email);
  }

  if (step === "otp") {
    return (
      <div className="space-y-3">
        <OtpForm
          email={email}
          codeLength={OTP_LENGTH}
          expiresInSeconds={expiresIn}
          resendInSeconds={resendIn}
          onVerify={handleVerify}
          onResend={handleResend}
          onChangeEmail={() => {
            setDevCode(null);
            setStep("login");
          }}
        />

        {devCode && (
          <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
            Local development code:{" "}
            <span className="font-mono font-semibold tracking-[0.3em] text-foreground">
              {devCode}
            </span>
          </p>
        )}
      </div>
    );
  }

  return <LoginForm defaultEmail={email || DEMO_EMAIL} onSubmit={handleLogin} />;
}
