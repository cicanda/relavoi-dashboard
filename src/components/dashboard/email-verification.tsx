"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

import { getMe, problemOf, sendVerificationEmail } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useNow } from "@/lib/use-now";
import {
  setBannerCollapsed,
  startResendCooldown,
  useVerifyEmailUi,
} from "@/lib/verify-email-ui";

/**
 * The email verification nudge, in two shapes: a banner in the app shell and
 * a card in Settings.
 *
 * Both read the same ["me"] query the auth guard already runs, so neither
 * costs a request, and both write to the same session store, so asking for a
 * link from one disables the button on the other.
 *
 * Why this exists at all: an unverified address receives none of the notices
 * a sandbox workspace is sent, including the one that says the balance is
 * running low. Nothing in the dashboard said so, and the only way to ask for
 * a new link was to already be holding one.
 */

interface Verification {
  /** False while /tenants/me has not answered, or answered without a user. */
  known: boolean;
  verifiedAt: string | null;
}

function useVerification(): Verification {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: !!token,
    staleTime: 60_000,
  });
  const user = q.data?.user;
  // `known` is false both while this is loading and when the token carries no
  // dashboard user, which is what an API key's token does. Neither is an
  // unverified address, and neither should put a banner on the screen.
  if (!user || !("emailVerifiedAt" in user)) return { known: false, verifiedAt: null };
  return { known: true, verifiedAt: user.emailVerifiedAt ?? null };
}

type ResendState = "idle" | "sending" | "sent" | "already" | "limited" | "failed";

function useResend(): {
  state: ResendState;
  secondsLeft: number;
  disabled: boolean;
  send: () => void;
} {
  const now = useNow();
  const { cooldownUntil } = useVerifyEmailUi();
  const mut = useMutation({
    mutationFn: sendVerificationEmail,
    onSuccess: (result) => {
      // 204 means the address was already verified, so there is no mail and
      // no point starting a cooldown: the next render has nothing to show.
      if (result.alreadyVerified) return;
      startResendCooldown(Date.now());
    },
    onError: (err) => {
      // A 429 is the server's own per-hour limit, which is a different thing
      // from our minute. Hold the button for a minute either way, so pressing
      // it again does not produce the same refusal.
      if (problemOf(err)?.status === 429) startResendCooldown(Date.now());
    },
  });

  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const state: ResendState = mut.isPending
    ? "sending"
    : mut.isError
      ? problemOf(mut.error)?.status === 429
        ? "limited"
        : "failed"
      : mut.isSuccess
        ? mut.data.alreadyVerified
          ? "already"
          : "sent"
        : "idle";

  return {
    state,
    secondsLeft,
    disabled: mut.isPending || secondsLeft > 0,
    send: () => mut.mutate(),
  };
}

function resendLabel(state: ResendState, secondsLeft: number): string {
  if (state === "sending") return "Sending…";
  if (secondsLeft > 0) return `Send again in ${secondsLeft}s`;
  return state === "idle" ? "Send me a link" : "Send another link";
}

function resendNote(state: ResendState, email: string | undefined): string | null {
  if (state === "sent") return `A link is on its way to ${email ?? "your address"}.`;
  if (state === "already") return "That address is already confirmed.";
  if (state === "limited") return "Too many links asked for in the last hour. Try again later.";
  if (state === "failed") return "That did not go through. Try again in a moment.";
  return null;
}

/**
 * The app shell banner.
 *
 * Rendered on every dashboard page until the address is confirmed, and
 * collapsible but not dismissible: collapsing it leaves a line saying the
 * address is unconfirmed and a control to open it again, and a new session
 * starts expanded. The styling is the KYB banner's "action needed" tone,
 * unchanged, so the two bars above the page read as one thing.
 */
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { known, verifiedAt } = useVerification();
  const { collapsed } = useVerifyEmailUi();
  const resend = useResend();

  if (!known || verifiedAt) return null;

  if (collapsed) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-ink-200 bg-paper text-ink-800 shadow-sm px-3.5 py-2.5 text-[13px]">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="min-w-0">Email address not confirmed</span>
        <button
          type="button"
          onClick={() => setBannerCollapsed(false)}
          className="ml-auto inline-flex items-center gap-1 font-medium underline hover:no-underline"
        >
          Show
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const note = resendNote(resend.state, user?.email);

  return (
    <div className="mb-5 rounded-xl border border-ink-200 bg-paper text-ink-800 shadow-sm px-3.5 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="min-w-0">
          Confirm your email address. Sandbox notices, including the one that says your
          balance is running low, only go to confirmed addresses.
        </span>
        <button
          type="button"
          onClick={resend.send}
          disabled={resend.disabled}
          className="font-medium underline hover:no-underline disabled:no-underline disabled:opacity-50"
        >
          {resendLabel(resend.state, resend.secondsLeft)}
        </button>
        <button
          type="button"
          onClick={() => setBannerCollapsed(true)}
          aria-label="Collapse this notice for now"
          className="ml-auto text-ink-500 hover:text-ink-900 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>
      {note && <p className="mt-1.5 pl-5 text-[12px] text-ink-500">{note}</p>}
    </div>
  );
}

/**
 * The Settings card.
 *
 * Gone once the address is confirmed, with one exception: if a link was asked
 * for in this session, the card stays to say that it worked. Being returned
 * to a Settings page with no trace of what just happened reads as the action
 * having failed.
 */
export function VerifyEmailCard() {
  const { user } = useAuth();
  const { known, verifiedAt } = useVerification();
  const { requested } = useVerifyEmailUi();
  const resend = useResend();

  if (!known) return null;
  if (verifiedAt && !requested) return null;

  const note = resendNote(resend.state, user?.email);

  return (
    <section className="card p-[clamp(1.125rem,0.8rem+1.2vw,1.75rem)] xl:grid xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] xl:gap-x-10">
      <div className="mb-5 xl:mb-0">
        <h2 className="section-title">Verify your email</h2>
        <p className="text-[14px] text-ink-500 mt-1.5">
          Sandbox notices only go to confirmed addresses.
        </p>
      </div>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {verifiedAt ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-signal-700 shrink-0" />
              <span className="text-[14px] text-ink-900">
                Verified on {format(new Date(verifiedAt), "d MMMM yyyy")}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-ink-500 shrink-0" />
              <span className="text-[14px] text-ink-900">Not verified</span>
            </>
          )}
          {user?.email && (
            <span className="text-[13px] text-ink-500 font-mono break-all">{user.email}</span>
          )}
        </div>

        {!verifiedAt && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={resend.send}
              disabled={resend.disabled}
              className="btn btn-secondary"
            >
              {resendLabel(resend.state, resend.secondsLeft)}
            </button>
            {note && <span className="text-[13px] text-ink-500">{note}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
