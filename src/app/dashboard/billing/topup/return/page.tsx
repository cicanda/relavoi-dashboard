"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import { problemMessage, verifyTopUp } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import type { TopUpVerified } from "@/lib/types";

/**
 * Where the payer lands after checkout.
 *
 * This page is a convenience, not the mechanism. The provider's webhook
 * credits the wallet whether or not anyone ever comes back here, and both
 * paths run the same idempotent crediting. What this adds is an answer while
 * the payer is still looking: they paid ten seconds ago and want to see the
 * balance move, not read "it will appear shortly".
 *
 * So it verifies once, and if the payment is still settling it tries a few
 * more times before giving up gracefully. Giving up here does not mean the
 * money is lost; it means the webhook will finish the job.
 */

const RETRIES = 5;
const RETRY_MS = 2_000;

function ReturnInner() {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get("reference") ?? params.get("trxref");

  const [state, setState] = useState<"checking" | "done" | "pending" | "failed">("checking");
  const [result, setResult] = useState<TopUpVerified | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Strict mode mounts twice in development; verifying twice is harmless but
  // noisy, and the guard keeps the attempt count honest.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!reference) {
      setState("failed");
      setError("This link is missing its payment reference.");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function check(): Promise<void> {
      attempts += 1;
      try {
        const res = await verifyTopUp(reference as string);
        if (cancelled) return;
        if (res.status === "credited" || res.status === "already-credited") {
          setResult(res);
          setState("done");
          return;
        }
        if (attempts < RETRIES) {
          window.setTimeout(() => void check(), RETRY_MS);
          return;
        }
        setState("pending");
      } catch (err) {
        if (cancelled) return;
        if (attempts < RETRIES) {
          window.setTimeout(() => void check(), RETRY_MS);
          return;
        }
        setState("failed");
        setError(problemMessage(err, "The payment processor did not answer."));
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <div>
      <PageHeader title="Top up" description="Confirming your payment" />

      <div className="card p-6 max-w-xl">
        {state === "checking" ? (
          <div className="flex items-center gap-3 text-ink-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[14px]">Confirming with the payment processor…</span>
          </div>
        ) : null}

        {state === "done" && result ? (
          <>
            <div className="flex items-center gap-2 text-signal-700 mb-4">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-[15px] font-medium">Payment received</span>
            </div>
            <dl className="space-y-1.5">
              <Line label="Paid" value={result.paid.display} />
              <Line label="Processing fee" value={`- ${result.fee.display}`} muted />
              <Line label="Credited to your wallet" value={result.credited.display} />
              <div className="border-t border-ink-200 mt-2 pt-2">
                <Line label="Wallet balance" value={result.balance.display} strong />
              </div>
            </dl>
            <p className="text-[12px] text-ink-500 mt-4">
              A receipt has gone to the workspace billing address. The fee is charged by the
              payment processor and shown here in full; it is not a Relavoi charge.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-5"
              onClick={() => router.push("/dashboard/billing")}
            >
              Back to billing
            </button>
          </>
        ) : null}

        {state === "pending" ? (
          <>
            <div className="flex items-center gap-2 text-amber-800 mb-3">
              <Loader2 className="w-5 h-5" />
              <span className="text-[15px] font-medium">Still settling</span>
            </div>
            <p className="text-[13px] text-ink-700">
              The payment has not been confirmed yet. Nothing is lost: the wallet is credited as
              soon as the processor confirms it, with or without this page. Check the billing page
              again in a minute.
            </p>
            <Link href="/dashboard/billing" className="btn btn-secondary mt-5">
              Back to billing
            </Link>
          </>
        ) : null}

        {state === "failed" ? (
          <>
            <div className="flex items-center gap-2 text-red-700 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-[15px] font-medium">We could not confirm this payment</span>
            </div>
            <p className="text-[13px] text-ink-700">{error}</p>
            <p className="text-[13px] text-ink-500 mt-2">
              If money left your account, it will still be credited once the processor confirms it.
              Nothing needs paying twice.
            </p>
            <Link href="/dashboard/billing" className="btn btn-secondary mt-5">
              Back to billing
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`text-[13px] ${muted ? "text-ink-500" : "text-ink-700"}`}>{label}</dt>
      <dd
        className={`tabular-nums ${strong ? "text-[15px] font-medium text-ink-900" : "text-[13px] text-ink-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * useSearchParams needs a Suspense boundary above it, or the production build
 * fails on this route rather than at runtime.
 */
export default function TopUpReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="card p-6 max-w-xl">
          <div className="flex items-center gap-3 text-ink-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[14px]">Loading…</span>
          </div>
        </div>
      }
    >
      <ReturnInner />
    </Suspense>
  );
}
