"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "@/components/brand-mark";
import { problemMessage, resetPassword } from "@/lib/api";

/**
 * Where a reset link lands. The token is the credential, so it arrives in the
 * query string and is never stored: it goes straight into the one request that
 * spends it.
 *
 * Setting a password here ends every session the account had, including any
 * the person is holding in another tab. That is the point of the flow, so the
 * screen says so before they submit rather than logging them out in silence.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Checked here as well as by the API, so a mistyped confirmation costs a
    // keystroke rather than a round trip that spends nothing but looks like a
    // failure.
    if (password.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(problemMessage(err, "Could not set your password. The link may have expired."));
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <>
        <p className="mt-6 text-sm text-ink-600 leading-relaxed">
          This link is missing its token, so it cannot be used. Links are single-use and some
          mail clients rewrite them; asking for a new one is the quickest way through.
        </p>
        <Link href="/forgot-password" className="btn btn-primary w-full h-11 mt-7">
          Send me a new link
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <p className="mt-6 text-sm text-ink-600 leading-relaxed">
          Your password is set, and every signed-in session on this account has ended. Sign in
          again with the new one.
        </p>
        <button onClick={() => router.push("/login")} className="btn btn-primary w-full h-11 mt-7">
          Sign in
        </button>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="password" className="field-label mb-0">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
            className="field w-full h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="field-label mb-0">
          Confirm new password
        </label>
        <input
          id="confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
          className="field w-full h-11"
        />
      </div>

      <p className="text-[13px] text-ink-500 leading-relaxed">
        Setting a new password signs this account out everywhere.
      </p>

      <button type="submit" disabled={submitting} className="btn btn-primary w-full h-11">
        {submitting ? "Setting…" : "Set the new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-backdrop min-h-screen w-full flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card rounded-[28px] p-[clamp(1.5rem,1rem+2vw,2.5rem)] shadow-raised animate-dialog-in">
        <div className="flex flex-col items-center text-center">
          <BrandLogo height={44} />
          <h1 className="mt-5 text-[15px] text-ink-500 tracking-normal">Choose a new password</h1>
        </div>
        {/* useSearchParams needs a Suspense boundary, or the build refuses to
            prerender this route. */}
        <Suspense fallback={<p className="mt-6 text-sm text-ink-500">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
