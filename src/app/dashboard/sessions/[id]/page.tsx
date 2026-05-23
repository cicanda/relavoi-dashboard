"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronDown,
  Check,
  Copy,
  Lock,
  X,
} from "lucide-react";
import type { AxiosError } from "axios";

import {
  endSession,
  getSession,
  listSessionCalls,
  listSessionSms,
} from "@/lib/api";
import {
  fmtAbsolute,
  fmtDuration,
  fmtRelative,
} from "@/lib/format";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import type { CallRecord, Session, SmsRecord } from "@/lib/types";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 text-ink-400 hover:text-ink-700 transition-colors"
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

function DirectionGlyph({ direction }: { direction: "A_TO_B" | "B_TO_A" }) {
  if (direction === "A_TO_B") return <ArrowRight className="w-4 h-4 text-ink-600" />;
  return <ArrowLeft className="w-4 h-4 text-ink-600" />;
}

function getStatus(err: unknown): number | undefined {
  return (err as AxiosError | undefined)?.response?.status;
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"calls" | "sms">("calls");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  const sessionQ = useQuery({
    queryKey: ["session", id],
    queryFn: () => getSession(id),
    staleTime: 30_000,
    retry: (count, error) => {
      const s = getStatus(error);
      if (s === 404) return false;
      return count < 2;
    },
  });

  const callsQ = useQuery({
    queryKey: ["session", id, "calls"],
    queryFn: () => listSessionCalls(id),
    staleTime: 30_000,
    enabled: !!sessionQ.data && tab === "calls",
  });

  const smsQ = useQuery({
    queryKey: ["session", id, "sms"],
    queryFn: () => listSessionSms(id),
    staleTime: 30_000,
    enabled: !!sessionQ.data && tab === "sms",
  });

  const errShown = useRef<Set<string>>(new Set());
  function showErrorOnce(key: string, message: string) {
    if (errShown.current.has(key)) return;
    errShown.current.add(key);
    toast.error(message);
  }
  useEffect(() => {
    if (callsQ.error) showErrorOnce("calls", "Could not load calls for this session");
  }, [callsQ.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (smsQ.error) showErrorOnce("sms", "Could not load SMS for this session");
  }, [smsQ.error]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onConfirmEnd() {
    setEnding(true);
    try {
      await endSession(id);
      toast.success("Session ended");
      await qc.invalidateQueries({ queryKey: ["session", id] });
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      setConfirmOpen(false);
    } catch {
      toast.error("Failed to end session");
    } finally {
      setEnding(false);
    }
  }

  // Loading or 404
  if (sessionQ.isLoading) {
    return (
      <div>
        <BackLink />
        <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-6">
          <div className="h-6 w-64 rounded animate-shimmer mb-4" />
          <div className="h-4 w-96 rounded animate-shimmer" />
        </div>
      </div>
    );
  }

  if (getStatus(sessionQ.error) === 404 || (sessionQ.isError && !sessionQ.data)) {
    return (
      <div>
        <BackLink />
        <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-10 text-center">
          <h2 className="text-lg font-semibold text-ink-900 mb-2">Session not found</h2>
          <p className="text-sm text-ink-500 mb-6">
            We couldn&apos;t find a session with this ID. It may have been deleted or expired.
          </p>
          <Link
            href="/dashboard/sessions"
            className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Sessions
          </Link>
        </div>
      </div>
    );
  }

  const s = sessionQ.data as Session;
  const canEnd = s.state === "ACTIVE" || s.state === "GRACE_PERIOD";

  return (
    <div>
      <BackLink />

      {/* Header card */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-6 mb-4">
        <div className="flex flex-wrap items-center gap-4 mb-5">
          <div className="flex items-center gap-1">
            <span className="text-[12px] font-mono text-ink-500">ID</span>
            <span className="text-[13px] font-mono text-ink-900">{s.id}</span>
            <CopyButton text={s.id} />
          </div>
          <StatePill state={s.state} />
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
              Proxy
            </span>
            <span className="text-lg font-mono text-ink-900">{s.proxyNumber}</span>
            <CopyButton text={s.proxyNumber} />
          </div>
          {canEnd && (
            <button
              onClick={() => setConfirmOpen(true)}
              className="ml-auto bg-red-50 text-red-700 border border-red-200 px-4 h-10 rounded-md hover:bg-red-100 font-medium text-sm"
            >
              End Session
            </button>
          )}
        </div>

        {/* Config grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 pb-6 border-b border-ink-200">
          <Block label="Direction Mode" value={s.directionMode} />
          <Block label="Recording" value={s.recordingEnabled ? "Enabled" : "Disabled"} />
          <Block label="Consent Mode" value={s.consentPrompt} />
          <Block label="Grace Period (min)" value={String(s.gracePeriodMinutes)} />
        </div>

        {/* Timeline */}
        <Timeline session={s} />

        {/* Metadata */}
        <div className="mt-6">
          <button
            onClick={() => setMetaOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-500 hover:text-ink-700 transition-colors"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${metaOpen ? "" : "-rotate-90"}`}
            />
            Metadata
          </button>
          {metaOpen && (
            <pre className="mt-3 bg-bone-100 border border-ink-200 rounded-md p-4 text-[12px] font-mono text-ink-700 overflow-x-auto">
              {JSON.stringify(s.metadata ?? {}, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card">
        <div className="flex border-b border-ink-200 px-2">
          <TabButton
            label="Calls"
            count={callsQ.data?.pagination.count}
            active={tab === "calls"}
            onClick={() => setTab("calls")}
          />
          <TabButton
            label="SMS"
            count={smsQ.data?.pagination.count}
            active={tab === "sms"}
            onClick={() => setTab("sms")}
          />
        </div>

        {tab === "calls" ? (
          <CallsTab loading={callsQ.isLoading} error={!!callsQ.error} rows={callsQ.data?.data ?? []} onRetry={() => callsQ.refetch()} />
        ) : (
          <SmsTab loading={smsQ.isLoading} error={!!smsQ.error} rows={smsQ.data?.data ?? []} onRetry={() => smsQ.refetch()} />
        )}
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <ConfirmModal
          title="End this session?"
          description="The session will move to GRACE_PERIOD and ultimately EXPIRED. Active calls already in progress will complete; no new calls will be routed after the grace window."
          confirmLabel={ending ? "Ending..." : "End Session"}
          danger
          disabled={ending}
          onCancel={() => !ending && setConfirmOpen(false)}
          onConfirm={onConfirmEnd}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/sessions"
      className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 transition-colors mb-4"
    >
      <ChevronLeft className="w-4 h-4" /> Sessions
    </Link>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-sm text-ink-900 mt-1 font-mono">{value}</div>
    </div>
  );
}

function Timeline({ session }: { session: Session }) {
  const events: Array<{ label: string; ts?: string | null }> = [
    { label: "Created", ts: session.createdAt },
    { label: "Activated", ts: session.activatedAt },
    { label: "Ended", ts: session.endedAt },
    { label: "Expired", ts: session.expiredAt },
  ];
  return (
    <div className="flex items-start justify-between gap-2 overflow-x-auto">
      {events.map((e, i) => {
        const done = !!e.ts;
        return (
          <div key={e.label} className="flex-1 min-w-[120px] relative">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  done ? "bg-signal-500" : "bg-ink-200"
                }`}
              />
              {i < events.length - 1 && (
                <div
                  className={`flex-1 h-px ${done ? "bg-signal-500" : "bg-ink-200"}`}
                />
              )}
            </div>
            <div
              className={`mt-2 text-[11px] font-mono uppercase tracking-wider ${
                done ? "text-ink-700" : "text-ink-400"
              }`}
            >
              {e.label}
            </div>
            <div
              className={`text-[12px] mt-0.5 ${done ? "text-ink-700" : "text-ink-400"}`}
            >
              {done ? fmtAbsolute(e.ts) : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 h-11 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-signal-500 text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {label}
      {count != null && (
        <span className="ml-2 text-[11px] font-mono text-ink-500 tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

function CallsTab({
  loading,
  error,
  rows,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  rows: CallRecord[];
  onRetry: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {["Dir", "Status", "Duration", "Initiated", "Answered", "Ended"].map((h) => (
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
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
          ) : error ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 border-t border-ink-200 text-center text-sm">
                <div className="text-red-700 mb-2">Failed to load calls</div>
                <button
                  onClick={onRetry}
                  className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors"
                >
                  Retry
                </button>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-10 border-t border-ink-200 text-center text-sm text-ink-500"
              >
                No calls on this session yet.
              </td>
            </tr>
          ) : (
            rows.map((c) => (
              <tr key={c.id} className="hover:bg-bone-100 transition-colors">
                <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                  <DirectionGlyph direction={c.direction} />
                </td>
                <td className="px-4 py-3 border-t border-ink-200 text-[13px]">
                  <StatePill state={c.status} size="sm" />
                </td>
                <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono tabular-nums">
                  {fmtDuration(c.durationSeconds)}
                </td>
                <td
                  className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700"
                  title={fmtAbsolute(c.initiatedAt)}
                >
                  {fmtRelative(c.initiatedAt)}
                </td>
                <td
                  className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700"
                  title={fmtAbsolute(c.answeredAt)}
                >
                  {fmtRelative(c.answeredAt)}
                </td>
                <td
                  className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700"
                  title={fmtAbsolute(c.endedAt)}
                >
                  {fmtRelative(c.endedAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SmsTab({
  loading,
  error,
  rows,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  rows: SmsRecord[];
  onRetry: () => void;
}) {
  return (
    <div>
      <div className="px-4 py-3 bg-blue-50 border-b border-ink-200 flex items-center gap-2 text-[12px] text-blue-700">
        <Lock className="w-3.5 h-3.5 flex-shrink-0" />
        Message content is encrypted at rest. Only the sender&apos;s app can decrypt it.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {["Dir", "Status", "Cost", "Sent", "Delivered"].map((h) => (
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
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 border-t border-ink-200 text-center text-sm">
                  <div className="text-red-700 mb-2">Failed to load SMS</div>
                  <button
                    onClick={onRetry}
                    className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 border-t border-ink-200 text-center text-sm text-ink-500"
                >
                  No SMS on this session yet.
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="hover:bg-bone-100 transition-colors">
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                    <DirectionGlyph direction={m.direction} />
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px]">
                    <StatePill state={m.status} size="sm" />
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono">
                    {m.cost ?? "—"}
                  </td>
                  <td
                    className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700"
                    title={fmtAbsolute(m.sentAt)}
                  >
                    {fmtRelative(m.sentAt)}
                  </td>
                  <td
                    className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700"
                    title={fmtAbsolute(m.deliveredAt)}
                  >
                    {fmtRelative(m.deliveredAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger,
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40">
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold text-ink-900">{title}</h3>
          <button
            onClick={onCancel}
            disabled={disabled}
            className="text-ink-400 hover:text-ink-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-ink-500 mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={disabled}
            className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className={
              danger
                ? "bg-red-50 text-red-700 border border-red-200 px-4 h-10 rounded-md hover:bg-red-100 font-medium text-sm disabled:opacity-50"
                : "bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 transition-colors text-sm disabled:opacity-50"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

