"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, LoaderCircle, LockKeyhole, Sprout } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthMode } from "@/lib/auth-navigation";

export function LoginForm({
  returnTo,
  initialMode,
  verificationFailed,
}: {
  returnTo: string;
  initialMode: AuthMode;
  verificationFailed: boolean;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    verificationFailed ? "This verification link is invalid or has expired." : "",
  );
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setConfirmationSent(false);
    setUnverifiedEmail("");

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    setLoading(true);

    const response = await fetch(`/api/auth/${mode === "signin" ? "login" : "signup"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        ...(mode === "signup"
          ? { name: String(data.get("name") ?? "").trim() }
          : {}),
      }),
    }).catch(() => null);

    setLoading(false);
    if (!response) {
      setMessage("The account service is unavailable. Please try again.");
      return;
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(result?.message ?? "The request could not be completed.");
      if (result?.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(email);
      return;
    }
    if (mode === "signin") {
      window.location.assign(returnTo);
      return;
    }
    setConfirmationSent(true);
    setUnverifiedEmail(email);
    setMessage("Check your inbox and verify your email to enter your private space.");
  }

  async function resendVerification() {
    if (!unverifiedEmail || loading) return;
    setLoading(true);
    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: unverifiedEmail }),
    }).catch(() => null);
    setLoading(false);
    const result = await response?.json().catch(() => null);
    setConfirmationSent(Boolean(response?.ok));
    setMessage(
      response?.ok
        ? "A new verification email is on its way."
        : result?.message ?? "The verification email could not be sent.",
    );
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    setConfirmationSent(false);
    setUnverifiedEmail("");
    window.history.replaceState(
      null,
      "",
      `/login?mode=${nextMode}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link href="/"><ArrowLeft size={17} /> Back to Bloom</Link>
        <div>
          <span><Sprout size={25} /></span>
          <p>PRIVATE PRACTICE · HONEST RECORD</p>
          <blockquote>Build a life that keeps its word.</blockquote>
          <small>Structure for the promises that deserve a place in your day.</small>
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <span className="auth-lock">
            {confirmationSent ? <CheckCircle2 size={22} /> : <LockKeyhole size={22} />}
          </span>
          <p>{mode === "signin" ? "WELCOME BACK" : "BEGIN YOUR PRACTICE"}</p>
          <h1>{mode === "signin" ? "Enter your private space" : "Create a space that is yours"}</h1>
          <small>
            {returnTo.startsWith("/admin")
              ? "Use an approved support or super-admin account to continue."
              : mode === "signin"
                ? "Your habits and records appear only after your session is verified."
                : "Start with your name, email, and one promise you intend to keep."}
          </small>

          {mode === "signup" && (
            <Label className="block" htmlFor="name">Your name<Input id="name" name="name" autoComplete="name" required placeholder="What should Bloom call you?" /></Label>
          )}
          <Label className="block" htmlFor="email">Email<Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></Label>
          <Label className="block" htmlFor="password">Password<Input id="password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required placeholder="At least 8 characters" /></Label>
          <Button disabled={loading}>
            {loading && <LoaderCircle className="spin" size={17} />}
            {mode === "signin" ? "Sign in securely" : "Create private space"}
          </Button>
          {message && (
            <div className={confirmationSent ? "form-message form-message--success" : "form-message form-message--error"} role="status">
              {message}
            </div>
          )}
          {unverifiedEmail && (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => void resendVerification()}
            >
              Resend verification email
            </Button>
          )}
          <footer>
            {mode === "signin" ? "New to Bloom?" : "Already registered?"}
            <button type="button" onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}
