"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { OtpForm } from "@/components/auth/otp-form";
import { api } from "@/lib/api";
import { isAdminRole, type Role } from "@/lib/roles";
import { expiresAtIn, signIn } from "@/lib/session";

const OTP_LENGTH = 6;
const OTP_RESEND_SECONDS = 60;
/** `OTP_EXPIRY_SECONDS` default in the auth service; the request only 202s. */
const OTP_LIFETIME_SECONDS = 5 * 60;

/** The account a seeded database expects to sign in first. */
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "john@company.com";

type Step = "login" | "otp";

type OtpRequested = {
  message: string;
  /** The issued code. Email is disabled, so the API returns it directly. */
  code?: string;
};

type AccessTokenResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

/** Claims of the token just issued; the browser does not decode the JWT. */
type JwtClaims = {
  sub: string;
  employeeId: string | null;
  email: string;
  role: Role;
  type: "access";
};

/**
 * Two screens: ask for a code, then exchange it for an access token.
 *
 * The verify response carries only the token, so the role and employee id are
 * read back from `GET /auth/me` — the same claims the gateway uses, verified
 * rather than decoded.
 */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("login");
  const [email, setEmail] = React.useState("");
  /** The code the API issued for this address, shown on the code step. */
  const [issuedCode, setIssuedCode] = React.useState<string | null>(null);

  /** Asks the auth service for a code and moves to the code step. */
  async function requestCode(address: string) {
    const result = await api<OtpRequested>("/auth/otp/request", {
      method: "POST",
      body: { email: address },
      auth: false,
    });

    setIssuedCode(result.code ?? null);
    setEmail(address);
    setStep("otp");
  }

  async function handleLogin(address: string) {
    const trimmed = address.trim();

    if (!trimmed) {
      throw new Error("Masukkan alamat email Anda untuk melanjutkan.");
    }

    await requestCode(trimmed);
  }

  /** Stores the session and opens the screen the role belongs to. */
  async function handleVerify(code: string) {
    const token = await api<AccessTokenResponse>("/auth/otp/verify", {
      method: "POST",
      body: { email, code },
      auth: false,
    });

    const claims = await api<JwtClaims>("/auth/me", {
      token: token.accessToken,
    });

    signIn({
      email: claims.email,
      token: token.accessToken,
      role: claims.role,
      employeeId: claims.employeeId,
      expiresAt: expiresAtIn(token.expiresIn),
    });

    // Admins get the picker so they consciously choose a workspace; everyone
    // else has exactly one place to be and is sent straight there.
    router.push(isAdminRole(claims.role) ? "/choose" : "/employee");
  }

  async function handleResend() {
    await requestCode(email);
  }

  if (step === "otp") {
    return (
      <OtpForm
        email={email}
        issuedCode={issuedCode}
        codeLength={OTP_LENGTH}
        expiresInSeconds={OTP_LIFETIME_SECONDS}
        resendInSeconds={OTP_RESEND_SECONDS}
        onVerify={handleVerify}
        onResend={handleResend}
        onChangeEmail={() => setStep("login")}
      />
    );
  }

  return <LoginForm defaultEmail={email || DEMO_EMAIL} onSubmit={handleLogin} />;
}
