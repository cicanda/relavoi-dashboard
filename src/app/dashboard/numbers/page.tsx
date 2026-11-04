"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import {
  getNumberQuota,
  listNumberRequests,
  problemMessage,
  requestMoreNumbers,
  withdrawNumberRequest,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { fmtAbsolute, fmtNumber, fmtRelative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatePill } from "@/components/state-pill";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";

/**
 * Your numbers.
 *
 * This page used to show the shared pool: total, available, in use, cooldown,
 * quarantined, with a utilization gauge and a per-region table. None of that
 * was this workspace's: the pool is shared, so "available: 40" never meant 40
 * were available to them, and the figure moved with other customers' traffic.
 * It showed a workspace our capacity and other people's activity.
 *
 * What it shows now is what they hold against what they may hold, the numbers
 * themselves, and the way to ask for more. The gauge is kept, measuring their
 * own usage of their own limit, which is the one reading that was ever theirs.
 */

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

function utilColor(p: number): string {
  if (p < 60) return "bg-signal-500";
  if (p < 80) return "bg-amber-500";
  return "bg-red-500";
}

export default function NumbersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Asking is OWNER-only, because an approval changes a plan term. Everyone
  // else sees the same figures and is told who to ask.
  const canAsk = user?.role === "OWNER";

  const quotaQ = useQuery({
    queryKey: ["number-quota"],
    queryFn: getNumberQuota,
    refetchInterval: 30_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const requestsQ = useQuery({
    queryKey: ["number-requests"],
    queryFn: listNumberRequests,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const quota = quotaQ.data;
  const held = quota?.held ?? 0;
  const limit = quota?.limit ?? 0;
  const usage = pct(held, limit);
  const spare = Math.max(limit - held, 0);
  const pending = quota?.pendingRequest ?? null;

  const [wanted, setWanted] = useState("");
  const [note, setNote] = useState("");

  const askMutation = useMutation({
    mutationFn: () =>
      requestMoreNumbers({
        region: "lagos",
        requestedTotal: Number(wanted),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Request sent", "We will email you when it is decided.");
      setWanted("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["number-quota"] });
      queryClient.invalidateQueries({ queryKey: ["number-requests"] });
    },
    onError: (err) => {
      toast.error("Could not send that request", problemMessage(err, "Please try again."));
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => withdrawNumberRequest(id),
    onSuccess: () => {
      toast.success("Request withdrawn");
      queryClient.invalidateQueries({ queryKey: ["number-quota"] });
      queryClient.invalidateQueries({ queryKey: ["number-requests"] });
    },
    onError: (err) => {
      toast.error("Could not withdraw it", problemMessage(err, "Please try again."));
    },
  });

  const loading = quotaQ.isLoading;
  const updatedLabel =
    quotaQ.dataUpdatedAt > 0
      ? `Updated ${fmtRelative(new Date(quotaQ.dataUpdatedAt).toISOString())}`
      : "Not updated yet";

  const history = useMemo(
    () => (requestsQ.data ?? []).filter((r) => r.status !== "PENDING"),
    [requestsQ.data],
  );

  const wantedNum = Number(wanted);
  const wantedValid = Number.isInteger(wantedNum) && wantedNum > limit && wantedNum <= 10_000;

  return (
    <div>
      <PageHeader
        title="Your Numbers"
        description="The proxy numbers your workspace is using, and your limit"
        actions={
          <button
            onClick={() => quotaQ.refetch()}
            disabled={quotaQ.isFetching}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${quotaQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      <div className="-mt-2 mb-4 eyebrow">{updatedLabel}</div>

      <div className="tray grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-4 [&>*]:min-w-0">
        <StatCard label="In use now" value={loading ? "" : fmtNumber(held)} loading={loading} />
        <StatCard label="Your limit" value={loading ? "" : fmtNumber(limit)} loading={loading} />
        <StatCard label="Spare" value={loading ? "" : fmtNumber(spare)} loading={loading} />
      </div>

      {/* Your usage of your own limit. */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Numbers in use</h2>
          {!loading && (
            <span className="text-[clamp(1.5rem,1.3rem+0.6vw,1.875rem)] leading-none tracking-[-0.04em] text-ink-900 tabular-nums">
              {usage}%
            </span>
          )}
        </div>
        {loading ? (
          <Skeleton className="h-3 w-full" />
        ) : (
          <div className="bg-bone-100 ring-1 ring-inset ring-ink-900/5 h-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${utilColor(usage)} transition-all duration-700`}
              style={{ width: `${usage}%` }}
            />
          </div>
        )}
        {!loading && (
          <div className="mt-3 text-[13px] text-ink-700 tabular-nums">
            <span className="font-medium">{fmtNumber(held)}</span> of{" "}
            <span className="font-medium">{fmtNumber(limit)}</span> numbers in use
          </div>
        )}
      </div>

      {/* Why the limit is the size it is. The sentence comes from the API, so
          this page and the docs and our emails cannot drift apart. */}
      <div className="card p-5 mb-4">
        <h2 className="section-title mb-2">Why one number can be enough</h2>
        {loading ? (
          <Skeleton className="h-3 w-full" />
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-700">{quota?.explanation}</p>
        )}
      </div>

      {/* The numbers themselves. */}
      <div className="card mb-4">
        <div className="card-head">
          <h2 className="section-title">Numbers in use now</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-stack">
            <thead>
              <tr>
                <th className="th">Number</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i}>
                    <td className="td">
                      <Skeleton className="h-3 w-full" />
                    </td>
                  </tr>
                ))
              ) : (quota?.numbers.length ?? 0) === 0 ? (
                <tr>
                  <td className="px-4 py-8 border-t border-ink-200 text-center text-sm text-ink-500">
                    No numbers in use. One is assigned when you open a session.
                  </td>
                </tr>
              ) : (
                quota!.numbers.map((n) => (
                  <tr key={n}>
                    <td
                      data-label="Number"
                      className="td text-[13px] text-ink-700 font-mono tabular-nums"
                    >
                      {n}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ask for more. */}
      <div className="card p-5 mb-4">
        <h2 className="section-title mb-2">Need more numbers?</h2>

        {pending ? (
          <>
            <p className="text-[13px] text-ink-700">
              You have asked to hold{" "}
              <span className="font-medium tabular-nums">{pending.requestedTotal}</span> numbers at
              once. We will email you when it is decided.
            </p>
            <p className="text-[13px] text-ink-500 mt-1">
              Asked {fmtRelative(pending.createdAt)}
              {pending.note ? `. You said: "${pending.note}"` : ""}
            </p>
            {canAsk && (
              <button
                onClick={() => withdrawMutation.mutate(pending.id)}
                disabled={withdrawMutation.isPending}
                className="btn btn-secondary mt-3"
              >
                Withdraw this request
              </button>
            )}
          </>
        ) : canAsk ? (
          <>
            <p className="text-[13px] text-ink-700 mb-3">
              Ask for the total you want to hold at once, not how many more. Numbers are bought and
              loaded by hand, so a person decides this and we email you either way.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
              <input
                type="number"
                min={limit + 1}
                value={wanted}
                onChange={(e) => setWanted(e.target.value)}
                placeholder={`More than ${limit}`}
                className="field w-full sm:w-40 tabular-nums"
                aria-label="Numbers you want to hold at once"
              />
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Which of your people are in two sessions at once?"
                maxLength={1000}
                className="field w-full flex-1"
                aria-label="Why you need more"
              />
              <button
                onClick={() => askMutation.mutate()}
                disabled={!wantedValid || askMutation.isPending}
                className="btn btn-primary"
              >
                Request numbers
              </button>
            </div>
            {wanted !== "" && !wantedValid && (
              <p className="text-[13px] text-red-700 mt-2">
                Ask for a whole number greater than your current limit of {limit}.
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-ink-700">
            Only an owner of this workspace can ask for more numbers.
          </p>
        )}
      </div>

      {/* What was asked before, and what we said. */}
      {history.length > 0 && (
        <div className="card mb-4">
          <div className="card-head">
            <h2 className="section-title">Earlier requests</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-stack">
              <thead>
                <tr>
                  {["Asked", "For", "Outcome", "Granted", "What we said"].map((h) => (
                    <th key={h} className="th">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Asked" className="td text-[13px] text-ink-700">
                      {fmtAbsolute(r.createdAt)}
                    </td>
                    <td data-label="For" className="td text-[13px] text-ink-700 tabular-nums">
                      {fmtNumber(r.requestedTotal)}
                    </td>
                    <td data-label="Outcome" className="td text-[13px]">
                      <StatePill state={r.status} />
                    </td>
                    <td data-label="Granted" className="td text-[13px] text-ink-700 tabular-nums">
                      {r.grantedTotal === null ? "None" : fmtNumber(r.grantedTotal)}
                    </td>
                    <td data-label="What we said" className="td text-[13px] text-ink-700">
                      {r.decisionNote ?? "Not set"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
