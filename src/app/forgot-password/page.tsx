"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-mark";
import { requestPasswordReset } from "@/lib/api";

/**
 * "Forgot password?" used to link back to /login, which is where this starts.
 *
 * The screen deliberately says the same thing whether or not the address has
 * an account, because the API deliberately answers the same 202. Telling a
 * visitor "no such account" would turn this form into a way to ask whether
 * somebody is a Relavoi customer.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!email.trim()) {
      setError("Enter the email address on your account.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch {
      // The only real failure here is the request not arriving. A rate limit
      // also lands here, and saying "too many attempts" would leak that the
      // address exists, so the message stays about the connection.
      setError("Could not reach us just now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-backdrop min-h-screen w-full flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card rounded-[28px] p-[clamp(1.5rem,1rem+2vw,2.5rem)] shadow-raised animate-dialog-in">
        <div className="flex flex-col items-center text-center">
          <BrandLogo height={44} />
          <h1 className="mt-5 text-[15px] text-ink-500 tracking-normal">
            {sent ? "Check your inbox" : "Reset your password"}
          </h1>
        </div>

        {sent ? (
          <>
            <p className="mt-6 text-sm text-ink-600 leading-relaxed">
              If <span className="text-ink-900">{email.trim()}</span> has a Relavoi account, a
              link to set a new password is on its way. It works once, and for an hour.
            </p>
            <p className="mt-3 text-[13px] text-ink-500 leading-relaxed">
              Nothing arrived? Check spam, then try again. We send to the address on the
              account, so a different one will not reach you.
            </p>
            <Link href="/login" className="btn btn-primary w-full h-11 mt-7">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="field-label mb-0">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="field w-full h-11"
              />
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary w-full h-11">
              {submitting ? "Sending…" : "Send the link"}
            </button>
          </form>
        )}

        {!sent && (
          <div className="mt-8 pt-6 border-t border-ink-200 text-center text-[13px] text-ink-500">
            Remembered it?{" "}
            <Link
              href="/login"
              className="text-ink-900 font-medium hover:text-brand-teal transition-colors"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
