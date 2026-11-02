"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand-mark";
import { useAuth } from "@/lib/auth-store";
import { sendVerificationEmail, verifyEmail } from "@/lib/api";

/**
 * Where a verification link lands.
 *
 * Redeemed on load rather than behind a button: the person has already acted
 * by clicking the link in their mail, and asking them to confirm the
 * confirmation is a step for nothing.
 *
 * The guard ref matters. React runs effects twice in development, and the
 * token is single-use, so without it the second run reports a valid link as
 * already used, which is the one failure this screen must not invent.
 */
function VerifyEmailBody() {
  const token = useSearchParams().get("token") ?? "";
  const { token: session } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed" | "no-token">(
    token ? "working" : "no-token",
  );
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const attempted = useRef(false);

  async function onResend() {
    setResend("sending");
    try {
      await sendVerificationEmail();
      setResend("sent");
    } catch {
      setResend("failed");
    }
  }

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    verifyEmail(token)
      .then(() => setState("done"))
      .catch(() => setState("failed"));
  }, [token]);

  if (state === "working") {
    return <p className="mt-6 text-sm text-ink-500">Confirming your address…</p>;
  }

  if (state === "done") {
    return (
      <>
        <p className="mt-6 text-sm text-ink-600 leading-relaxed">
          Your email address is confirmed. We can reach you about your workspace now, which
          includes the notices that say your balance is running low.
        </p>
        <Link href="/dashboard" className="btn btn-primary w-full h-11 mt-7">
          Open the dashboard
        </Link>
      </>
    );
  }

  // A dead link with a live session is the common case: the link sat in a
  // mailbox for a day, or was opened twice. So the next step is a new link,
  // not a sign-in form they are already past.
  if (session) {
    return (
      <>
        <p className="mt-6 text-sm text-ink-600 leading-relaxed">
          {state === "no-token"
            ? "This link is missing its token, so it cannot be used."
            : "This link is no longer valid. They work once, and for a day."}
        </p>
        {resend === "sent" ? (
          <p className="mt-3 text-[13px] text-ink-500 leading-relaxed">
            A new link is on its way to the address on your account.
          </p>
        ) : (
          <>
            {resend === "failed" && (
              <p className="mt-3 text-[13px] text-red-700 leading-relaxed">
                That did not go through. Try again in a moment.
              </p>
            )}
            <button
              onClick={onResend}
              disabled={resend === "sending"}
              className="btn btn-primary w-full h-11 mt-7"
            >
              {resend === "sending" ? "Sending…" : "Send me a new link"}
            </button>
          </>
        )}
        <Link
          href="/dashboard"
          className="block text-center text-[13px] text-ink-500 hover:text-ink-900 transition-colors mt-5"
        >
          Back to the dashboard
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="mt-6 text-sm text-ink-600 leading-relaxed">
        {state === "no-token"
          ? "This link is missing its token, so it cannot be used."
          : "This link is no longer valid. They work once, and for a day."}
      </p>
      <p className="mt-3 text-[13px] text-ink-500 leading-relaxed">
        Sign in and we will send you a new one.
      </p>
      <Link href="/login" className="btn btn-primary w-full h-11 mt-7">
        Sign in
      </Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="auth-backdrop min-h-screen w-full flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card rounded-[28px] p-[clamp(1.5rem,1rem+2vw,2.5rem)] shadow-raised animate-dialog-in">
        <div className="flex flex-col items-center text-center">
          <BrandLogo height={44} />
          <h1 className="mt-5 text-[15px] text-ink-500 tracking-normal">Confirm your email</h1>
        </div>
        <Suspense fallback={<p className="mt-6 text-sm text-ink-500">Loading…</p>}>
          <VerifyEmailBody />
        </Suspense>
      </div>
    </div>
  );
}
