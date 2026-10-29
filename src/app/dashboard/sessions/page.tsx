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
      className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-bone-100 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" /> New session
            </button>
          ) : null
        }
      />

      {/* Filter bar */}
      <div className="card p-3 sm:p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* State filter */}
          <div className="relative">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="appearance-none field w-auto pl-3.5 pr-9 text-[13px] cursor-pointer"
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
          <div className="segmented">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                data-active={period === p.value}
                aria-pressed={period === p.value}
                className="segmented-item"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto text-[13px] text-ink-500 tabular-nums">
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
      <div className="card">
        {isLoadingFirstPage ? (
          <LoadingRows />
        ) : q.error && rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm">
            <div className="text-red-700 mb-2">Failed to load sessions</div>
            <button
              onClick={() => q.refetch()}
              className="btn btn-secondary btn-sm"
            >
              Retry
            </button>
          </div>
        ) : isEmpty ? (
          <EmptyState canWrite={canWrite} onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            {/* Phones */}
            <div className="sm:hidden divide-y divide-ink-200 [&>*:first-child]:rounded-t-card [&>*:last-child]:rounded-b-card">
              {rows.map((s) => (
                <SessionCard key={s.id} session={s} onOpen={() => open(s.id)} />
              ))}
            </div>

            {/* Tablet and up */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full table-compact table-grid-md">
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
                        className="th whitespace-nowrap"
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
                      className="group row-link"
                    >
                      <td data-label="Session ID" className="td text-[13px] text-ink-700">
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{truncId(s.id)}</span>
                          <CopyButton text={s.id} />
                        </div>
                      </td>
                      <td data-label="Reference" className="td text-[13px] text-ink-700 max-w-[180px] truncate">
                        {referenceOf(s) ?? <span className="text-ink-400">—</span>}
                      </td>
                      <td data-label="Proxy" className="td text-[13px] text-ink-700 font-mono whitespace-nowrap">
                        {s.proxyNumber}
                      </td>
                      <td data-label="Customer" className="td text-[13px] text-ink-700 font-mono whitespace-nowrap">
                        {s.customerPhoneMasked ?? <span className="text-ink-400">—</span>}
                      </td>
                      <td data-label="Status" className="td text-[13px]">
                        <StatePill state={s.state as SessionState} size="sm" />
                      </td>
                      <td data-label="Dir" className="td text-[13px] text-ink-700">
                        <DirectionIcon mode={s.directionMode} />
                      </td>
                      <td data-label="Calls" className="td text-[13px] text-ink-700 font-mono tabular-nums">
                        {s.callCount ?? 0}
                      </td>
                      <td data-label="Created"
                        className="td text-[13px] text-ink-700 whitespace-nowrap"
                        title={fmtAbsolute(s.createdAt)}
                      >
                        {fmtRelative(s.createdAt)}
                      </td>
                      <td data-label="Expires" className="td text-[13px] text-ink-700 whitespace-nowrap">
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
          <div className="td flex items-center justify-center">
            <button
              disabled={!canLoadMore}
              onClick={() => {
                if (lastAfter) setActiveAfter(lastAfter);
              }}
              className="btn btn-secondary btn-sm"
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
      className="w-full text-left px-4 py-4 active:bg-bone-50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink-900 truncate">
          {reference ?? <span className="font-mono text-[13px]">{truncId(session.id)}</span>}
        </span>
        <StatePill state={session.state as SessionState} size="sm" />
        <ChevronRight className="w-4 h-4 text-ink-400 ml-auto shrink-0" />
      </div>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className="eyebrow">Number</span>
        <span className="text-[15px] font-mono text-ink-900 break-all">{session.proxyNumber}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2 flex-wrap text-[13px]">
        <span className="eyebrow">
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
      <div className="w-16 h-16 rounded-full bg-bone-100 ring-8 ring-bone-50 flex items-center justify-center mb-5">
        <ActivityIcon className="w-7 h-7 text-ink-400" />
      </div>
      <h3 className="section-title mb-1">No sessions yet</h3>
      <p className="text-[14px] text-ink-500 max-w-md">
        Start one here, or let your integration create them.
      </p>
      {canWrite && (
        <button
          onClick={onCreate}
          className="btn btn-primary mt-5"
        >
          <Plus className="w-4 h-4" /> New session
        </button>
      )}
    </div>
  );
}
