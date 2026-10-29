"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Activity as ActivityIcon,
} from "lucide-react";

import { listSessions } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { fmtAbsolute, fmtRelative, truncId } from "@/lib/format";
import { CreateSessionDialog } from "@/components/dashboard/session-dialogs";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { useToast } from "@/components/toast";
import type { DirectionMode, Session, SessionState } from "@/lib/types";

const STATE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All states", value: "" },
  { label: "PENDING", value: "PENDING" },
  { label: "ACTIVE", value: "ACTIVE" },
  { label: "GRACE_PERIOD", value: "GRACE_PERIOD" },
  { label: "EXPIRED", value: "EXPIRED" },
  { label: "FAILED", value: "FAILED" },
];

type Period = "today" | "7d" | "30d" | "all";

const PERIODS: Array<{ label: string; value: Period }> = [
  { label: "Today", value: "today" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

function periodStartMs(p: Period): number {
  const now = new Date();
  if (p === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (p === "7d") return now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (p === "30d") return now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

function DirectionIcon({ mode }: { mode: DirectionMode }) {
  if (mode === "A_TO_B_ONLY") return <ArrowRight className="w-4 h-4 text-ink-600" />;
  if (mode === "B_TO_A_ONLY") return <ArrowLeft className="w-4 h-4 text-ink-600" />;
  return <ArrowLeftRight className="w-4 h-4 text-ink-600" />;
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

/** The order reference a seller typed, if they typed one. */
function referenceOf(s: Session): string | null {
  const ref = s.metadata?.reference;
  return typeof ref === "string" && ref.trim() ? ref.trim() : null;
}

export default function SessionsListPage() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, tenant } = useAuth();
  // A viewer is here to read reports, not to put two people on a call.
  const canWrite = user?.role !== "VIEWER";

  const [createOpen, setCreateOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<string>("");
  const [period, setPeriod] = useState<Period>("all");
  const [pages, setPages] = useState<Array<{ data: Session[]; after?: string | null }>>([]);
  const [activeAfter, setActiveAfter] = useState<string | undefined>(undefined);

  // Reset paging when filter changes
  useEffect(() => {
    setPages([]);
    setActiveAfter(undefined);
  }, [stateFilter]);

  const q = useQuery({
    queryKey: ["sessions", stateFilter || "all", activeAfter ?? "first"],
    queryFn: () =>
      listSessions({
        state: stateFilter || undefined,
        limit: 25,
        after: activeAfter,
      }),
    staleTime: 30_000,
  });

  const errorShown = useRef<boolean>(false);
  useEffect(() => {
    if (q.error && !errorShown.current) {
      errorShown.current = true;
      toast.error("Could not load sessions");
    }
    if (!q.error) errorShown.current = false;
  }, [q.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accumulate pages
  useEffect(() => {
    if (!q.data) return;
    setPages((prev) => {
      // If first page (no activeAfter), replace
      if (!activeAfter) return [{ data: q.data.data, after: q.data.pagination.after }];
      // Avoid duplicating if effect re-runs on same data
      const last = prev[prev.length - 1];
      if (last && last.data === q.data.data) return prev;
      return [...prev, { data: q.data.data, after: q.data.pagination.after }];
    });
  }, [q.data, activeAfter]);

  const rowsRaw = useMemo<Session[]>(() => pages.flatMap((p) => p.data), [pages]);
  const cutoffMs = periodStartMs(period);
  const rows = useMemo(
    () =>
      cutoffMs === 0
        ? rowsRaw
        : rowsRaw.filter((s) => {
            const t = Date.parse(s.createdAt);
            return Number.isFinite(t) && t >= cutoffMs;
          }),
    [rowsRaw, cutoffMs],
  );

  const lastAfter = pages.length > 0 ? pages[pages.length - 1].after : undefined;
  const canLoadMore = !!lastAfter && !q.isFetching;
  const isLoadingFirstPage = q.isLoading && pages.length === 0;
  const isEmpty = !isLoadingFirstPage && rows.length === 0 && !q.error;
  const open = (id: string) => router.push(`/dashboard/sessions/${id}`);

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="All masking sessions for your workspace"
        actions={
          canWrite ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 transition-colors text-sm inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> New session
            </button>
          ) : null
        }
      />

      {/* Filter bar */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* State filter */}
          <div className="relative">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="appearance-none bg-paper border border-ink-200 text-ink-700 text-sm pl-3 pr-8 h-9 rounded-md hover:bg-bone-100 transition-colors font-mono uppercase tracking-wider text-[11px]"
            >
              {STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-ink-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Period pills */}
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
            {rows.length} {rows.length === 1 ? "session" : "sessions"} shown
          </div>
        </div>
      </div>

      {/* Rows.
          Below sm the table becomes stacked cards. The desktop view carries
          nine columns, and on a phone that is either a sideways scroll or
          unreadable -- unacceptable for the screen a seller runs a delivery
          from. The states around the rows (loading, error, empty) are rendered
          once and work at any width. */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card">
        {isLoadingFirstPage ? (
          <LoadingRows />
        ) : q.error && rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm">
            <div className="text-red-700 mb-2">Failed to load sessions</div>
            <button
              onClick={() => q.refetch()}
              className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        ) : isEmpty ? (
          <EmptyState canWrite={canWrite} onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            {/* Phones */}
            <div className="sm:hidden divide-y divide-ink-200">
              {rows.map((s) => (
                <SessionCard key={s.id} session={s} onOpen={() => open(s.id)} />
              ))}
            </div>

            {/* Tablet and up */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {[
                      "Session ID",
                      "Reference",
                      "Proxy",
                      "Customer",
                      "Status",
                      "Dir",
                      "Calls",
                      "Created",
                      "Expires",
                    ].map((h) => (
                      <th
                        key={h}
                        className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => open(s.id)}
                      className="group cursor-pointer hover:bg-bone-100 transition-colors"
                    >
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{truncId(s.id)}</span>
                          <CopyButton text={s.id} />
                        </div>
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 max-w-[180px] truncate">
                        {referenceOf(s) ?? <span className="text-ink-400">—</span>}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono whitespace-nowrap">
                        {s.proxyNumber}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono whitespace-nowrap">
                        {s.customerPhoneMasked ?? <span className="text-ink-400">—</span>}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px]">
                        <StatePill state={s.state as SessionState} size="sm" />
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                        <DirectionIcon mode={s.directionMode} />
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono tabular-nums">
                        {s.callCount ?? 0}
                      </td>
                      <td
                        className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 whitespace-nowrap"
                        title={fmtAbsolute(s.createdAt)}
                      >
                        {fmtRelative(s.createdAt)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 whitespace-nowrap">
                        {fmtRelative(s.expiresAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Load more */}
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

      {createOpen && (
        <CreateSessionDialog
          sandbox={tenant?.mode !== "live"}
          onClose={() => setCreateOpen(false)}
          onOpenSession={(session) => {
            setCreateOpen(false);
            void qc.invalidateQueries({ queryKey: ["sessions"] });
            open(session.id);
          }}
        />
      )}
    </div>
  );
}

/** One session as a card, for phone widths. */
function SessionCard({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const reference = referenceOf(session);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3.5 active:bg-bone-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink-900 truncate">
          {reference ?? <span className="font-mono text-[13px]">{truncId(session.id)}</span>}
        </span>
        <StatePill state={session.state as SessionState} size="sm" />
        <ChevronRight className="w-4 h-4 text-ink-400 ml-auto shrink-0" />
      </div>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">Number</span>
        <span className="text-[15px] font-mono text-ink-900">{session.proxyNumber}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2 flex-wrap text-[13px]">
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
          Customer
        </span>
        <span className="font-mono text-ink-700">{session.customerPhoneMasked ?? "—"}</span>
      </div>
      <div className="mt-2 text-[12px] text-ink-500">
        {session.callCount ?? 0} {(session.callCount ?? 0) === 1 ? "call" : "calls"} ·{" "}
        {fmtRelative(session.createdAt)}
      </div>
    </button>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y divide-ink-200">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-4 py-4">
          <div className="h-4 w-40 rounded animate-shimmer mb-2" />
          <div className="h-3 w-56 rounded animate-shimmer" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ canWrite, onCreate }: { canWrite: boolean; onCreate: () => void }) {
  return (
    <div className="px-4 py-16 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-bone-100 flex items-center justify-center mb-4">
        <ActivityIcon className="w-7 h-7 text-ink-400" />
      </div>
      <h3 className="text-base font-semibold text-ink-900 mb-1">No sessions yet</h3>
      <p className="text-sm text-ink-500 max-w-md">
        Start one here, or let your integration create them.
      </p>
      {canWrite && (
        <button
          onClick={onCreate}
          className="mt-5 bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 transition-colors text-sm inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New session
        </button>
      )}
    </div>
  );
}
