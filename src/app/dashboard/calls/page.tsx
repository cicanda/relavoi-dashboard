"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Phone,
  PhoneCall as PhoneCallIcon,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

import { listCalls } from "@/lib/api";
import {
  fmtAbsolute,
  fmtDuration,
  fmtNumber,
  fmtRelative,
  truncId,
} from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { StatCard } from "@/components/stat-card";
import { SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import type { CallRecord } from "@/lib/types";

type Period = "today" | "7d" | "30d" | "all";

const PERIODS: Array<{ label: string; value: Period }> = [
  { label: "Today", value: "today" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

const STATUSES: Array<{ label: string; value: string }> = [
  { label: "All statuses", value: "" },
  { label: "RINGING", value: "RINGING" },
  { label: "ANSWERED", value: "ANSWERED" },
  { label: "COMPLETED", value: "COMPLETED" },
  { label: "MISSED", value: "MISSED" },
  { label: "FAILED", value: "FAILED" },
];

const DIRECTIONS: Array<{ label: string; value: string }> = [
  { label: "All directions", value: "" },
  { label: "A → B", value: "A_TO_B" },
  { label: "B → A", value: "B_TO_A" },
];

function periodRange(p: Period): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const periodEnd = now.toISOString();
  if (p === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { periodStart: d.toISOString(), periodEnd };
  }
  if (p === "7d") {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { periodStart: d.toISOString(), periodEnd };
  }
  if (p === "30d") {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { periodStart: d.toISOString(), periodEnd };
  }
  return { periodStart: "1970-01-01T00:00:00.000Z", periodEnd };
}

function DirectionGlyph({ direction }: { direction: "A_TO_B" | "B_TO_A" }) {
  if (direction === "A_TO_B") return <ArrowRight className="w-4 h-4 text-ink-600" />;
  return <ArrowLeft className="w-4 h-4 text-ink-600" />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 text-ink-400 hover:text-ink-700 transition-colors opacity-0 group-hover:opacity-100"
      aria-label="Copy"
    >
      {copied ? (
        <Check className="w-3 h-3 text-signal-600" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}

export default function CallsHistoryPage() {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [direction, setDirection] = useState("");
  const [period, setPeriod] = useState<Period>("30d");

  const [pages, setPages] = useState<Array<{ data: CallRecord[]; after?: string | null }>>([]);
  const [activeAfter, setActiveAfter] = useState<string | undefined>(undefined);

  const range = useMemo(() => periodRange(period), [period]);

  // Reset on filter change
  useEffect(() => {
    setPages([]);
    setActiveAfter(undefined);
  }, [status, direction, period]);

  const q = useQuery({
    queryKey: [
      "calls",
      status || "all",
      direction || "all",
      period,
      activeAfter ?? "first",
    ],
    queryFn: () =>
      listCalls({
        status: status || undefined,
        direction: direction || undefined,
        periodStart: range.periodStart,
        periodEnd: range.periodEnd,
        limit: 25,
        after: activeAfter,
      }),
    staleTime: 30_000,
  });

  const errShown = useRef<boolean>(false);
  useEffect(() => {
    if (q.error && !errShown.current) {
      errShown.current = true;
      toast.error("Could not load calls");
    }
    if (!q.error) errShown.current = false;
  }, [q.error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!q.data) return;
    setPages((prev) => {
      if (!activeAfter) return [{ data: q.data.data, after: q.data.pagination.after }];
      const last = prev[prev.length - 1];
      if (last && last.data === q.data.data) return prev;
      return [...prev, { data: q.data.data, after: q.data.pagination.after }];
    });
  }, [q.data, activeAfter]);

  const rows = useMemo<CallRecord[]>(() => pages.flatMap((p) => p.data), [pages]);

  // Stats client-side
  const stats = useMemo(() => {
    const total = rows.length;
    const answered = rows.filter(
      (r) => r.status === "ANSWERED" || r.status === "COMPLETED",
    ).length;
    const failed = rows.filter(
      (r) => r.status === "FAILED" || r.status === "MISSED",
    ).length;
    const withDuration = rows.filter(
      (r) => r.durationSeconds != null && r.durationSeconds > 0,
    );
    const avgDuration =
      withDuration.length === 0
        ? null
        : Math.round(
            withDuration.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0) /
              withDuration.length,
          );
    const answerRate = total === 0 ? null : (answered / total) * 100;
    return { total, answered, failed, avgDuration, answerRate };
  }, [rows]);

  const lastAfter = pages.length > 0 ? pages[pages.length - 1].after : undefined;
  const canLoadMore = !!lastAfter && !q.isFetching;
  const isLoadingFirstPage = q.isLoading && pages.length === 0;
  const isEmpty = !isLoadingFirstPage && rows.length === 0 && !q.error;

  return (
    <div>
      <PageHeader title="Call History" description="Every routed call across your sessions" />

      {/* Filter bar */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="appearance-none bg-paper border border-ink-200 text-ink-700 text-sm pl-3 pr-8 h-9 rounded-md hover:bg-bone-100 transition-colors font-mono uppercase tracking-wider text-[11px]"
            >
              {STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-ink-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="appearance-none bg-paper border border-ink-200 text-ink-700 text-sm pl-3 pr-8 h-9 rounded-md hover:bg-bone-100 transition-colors font-mono uppercase tracking-wider text-[11px]"
            >
              {DIRECTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-ink-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="flex items-center gap-1 bg-bone-100 rounded-md p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 h-8 rounded text-[11px] font-mono uppercase tracking-wider transition-colors ${
                  period === p.value
                    ? "bg-paper text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto text-xs text-ink-500 font-mono">
            {rows.length} loaded
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Total Calls"
          value={isLoadingFirstPage ? "" : fmtNumber(stats.total)}
          icon={PhoneCallIcon}
          loading={isLoadingFirstPage}
        />
        <StatCard
          label="Answer Rate"
          value={
            isLoadingFirstPage
              ? ""
              : stats.answerRate == null
                ? "—"
                : `${stats.answerRate.toFixed(1)}%`
          }
          icon={CheckCircle2}
          loading={isLoadingFirstPage}
        />
        <StatCard
          label="Avg Duration"
          value={
            isLoadingFirstPage
              ? ""
              : stats.avgDuration == null
                ? "—"
                : fmtDuration(stats.avgDuration)
          }
          icon={Clock}
          loading={isLoadingFirstPage}
        />
        <StatCard
          label="Failed / Missed"
          value={isLoadingFirstPage ? "" : fmtNumber(stats.failed)}
          icon={XCircle}
          loading={isLoadingFirstPage}
        />
      </div>

      {/* Table */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  "Proxy",
                  "Dir",
                  "Status",
                  "Duration",
                  "Call ID",
                  "Time",
                  "Session",
                ].map((h) => (
                  <th
                    key={h}
                    className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoadingFirstPage ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
              ) : q.error && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 border-t border-ink-200 text-center text-sm"
                  >
                    <div className="text-red-700 mb-2">Failed to load calls</div>
                    <button
                      onClick={() => q.refetch()}
                      className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={7} className="border-t border-ink-200">
                    <EmptyState />
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="group hover:bg-bone-100 transition-colors">
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono">
                      {c.proxyNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                      <DirectionGlyph direction={c.direction} />
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px]">
                      <StatePill state={c.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono tabular-nums">
                      {fmtDuration(c.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                      <div className="flex items-center gap-1">
                        <span className="font-mono">{truncId(c.id)}</span>
                        <CopyButton text={c.id} />
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700"
                      title={fmtAbsolute(c.initiatedAt)}
                    >
                      {fmtRelative(c.initiatedAt)}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                      {c.sessionId ? (
                        <Link
                          href={`/dashboard/sessions/${c.sessionId}`}
                          className="text-ink-600 hover:text-ink-900 inline-flex items-center gap-0.5 transition-colors"
                        >
                          view <ArrowRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(canLoadMore || q.isFetching) && rows.length > 0 && (
          <div className="px-4 py-3 border-t border-ink-200 flex items-center justify-center">
            <button
              disabled={!canLoadMore}
              onClick={() => {
                if (lastAfter) setActiveAfter(lastAfter);
              }}
              className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {q.isFetching ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-16 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-bone-100 flex items-center justify-center mb-4">
        <Phone className="w-9 h-9 text-ink-300" />
      </div>
      <h3 className="text-base font-semibold text-ink-900 mb-1">No calls in this range</h3>
      <p className="text-sm text-ink-500 max-w-md">
        Try widening the time period or clearing your filters.
      </p>
    </div>
  );
}
