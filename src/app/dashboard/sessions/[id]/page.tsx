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
  UserRoundPen,
} from "lucide-react";
import type { AxiosError } from "axios";

import {
  endSession,
  getSession,
  listSessionCalls,
  listSessionSms,
  problemMessage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import {
  fmtAbsolute,
  fmtDuration,
  fmtRelative,
} from "@/lib/format";
import {
  ChangeCustomerDialog,
  EndSessionDialog,
} from "@/components/dashboard/session-dialogs";
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
      className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-bone-100 transition-colors"
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
  const { user } = useAuth();
  // Reading a session is open to everyone; changing one is not.
  const canWrite = user?.role !== "VIEWER";

  const [tab, setTab] = useState<"calls" | "sms">("calls");
  const [endOpen, setEndOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
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

  async function onConfirmEnd(gracePeriodMinutes: number | undefined) {
    setEnding(true);
    setEndError(null);
    try {
      await endSession(id, { gracePeriodMinutes });
      toast.success(
        gracePeriodMinutes === 0 ? "Session ended, contact cut off" : "Session ended",
      );
      await qc.invalidateQueries({ queryKey: ["session", id] });
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      setEndOpen(false);
    } catch (err) {
      // Shown inside the dialog: the choice that failed is still on screen.
      setEndError(problemMessage(err, "Could not end the session. Try again."));
    } finally {
      setEnding(false);
    }
  }

  // Loading or 404
  if (sessionQ.isLoading) {
    return (
      <div>
        <BackLink />
        <div className="card p-6">
          <div className="h-6 w-64 max-w-full rounded-md animate-shimmer mb-4" />
          <div className="h-4 w-96 max-w-full rounded-md animate-shimmer" />
        </div>
      </div>
    );
  }

  if (getStatus(sessionQ.error) === 404 || (sessionQ.isError && !sessionQ.data)) {
    return (
      <div>
        <BackLink />
        <div className="card p-10 text-center">
          <h2 className="section-title mb-2">Session not found</h2>
          <p className="text-sm text-ink-500 mb-6">
            We couldn&apos;t find a session with this ID. It may have been deleted or expired.
          </p>
          <Link
            href="/dashboard/sessions"
            className="btn btn-secondary btn-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Sessions
          </Link>
        </div>
      </div>
    );
  }

  const s = sessionQ.data as Session;
  // The same rule the call router applies: a session in grace whose expiry has
  // passed is dead, whatever its state column still says until the expiry
  // worker sweeps it. Offering to end it, or to retarget it, would be offering
  // something the router would refuse.
  const expiresAtMs = Date.parse(s.expiresAt);
  const stillLive =
    (s.state === "ACTIVE" || s.state === "GRACE_PERIOD") &&
    (!Number.isFinite(expiresAtMs) || expiresAtMs > Date.now());
  const rawReference = s.metadata?.reference;
  const reference =
    typeof rawReference === "string" && rawReference.trim() ? rawReference.trim() : null;

  return (
    <div>
      <BackLink />

      {/* Header card */}
      <div className="card p-[clamp(1rem,0.7rem+1.2vw,1.75rem)] mb-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-6">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="eyebrow">ID</span>
            <span className="text-[13px] font-mono text-ink-900 break-all">{s.id}</span>
            <CopyButton text={s.id} />
          </div>
          <StatePill state={s.state} />
          <div className="flex items-center gap-1.5">
            <span className="eyebrow">
              Proxy
            </span>
            <span className="text-[clamp(1.125rem,1rem+0.5vw,1.375rem)] tracking-[-0.02em] text-ink-900 tabular-nums">{s.proxyNumber}</span>
            <CopyButton text={s.proxyNumber} />
          </div>
          {canWrite && stillLive && (
            <div className="sm:ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={() => setChangeOpen(true)}
                className="btn btn-secondary"
              >
                <UserRoundPen className="w-4 h-4" /> Change customer
              </button>
              <button
                onClick={() => {
                  setEndError(null);
                  setEndOpen(true);
                }}
                className="btn bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
              >
                End session
              </button>
            </div>
          )}
        </div>

        {/* Config grid. The two party numbers come first: on a session someone
            started by hand, they are what identifies it. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-2 [&>*]:min-w-0">
          <Block label="Order reference" value={reference ?? "—"} />
          <Block label="Rider / agent" value={s.agentPhoneMasked ?? "—"} />
          <Block label="Customer" value={s.customerPhoneMasked ?? "—"} />
          <Block label="Direction Mode" value={s.directionMode} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-4 [&>*]:min-w-0">
          {/* Recording is not available, so no session is recorded. Stated as a
              fact about the call rather than as a setting. */}
          <Block label="Recording" value={s.recordingEnabled ? "Enabled" : "Not recorded"} />
          <Block label="Consent Mode" value={s.consentPrompt} />
          <Block label="Grace Period (min)" value={String(s.gracePeriodMinutes)} />
        </div>
        <p className="text-[13px] text-ink-500 mb-6 pb-6 border-b border-ink-200">
          Both numbers are masked. Relavoi stores the last four digits for display and nothing
          more of either number is ever shown back.
        </p>

        {/* Timeline */}
        <Timeline session={s} />

        {/* Metadata */}
        <div className="mt-6">
          <button
            onClick={() => setMetaOpen((v) => !v)}
            className="flex items-center gap-1.5 eyebrow hover:text-ink-700 transition-colors"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${metaOpen ? "" : "-rotate-90"}`}
            />
            Metadata
          </button>
          {metaOpen && (
            <pre className="mt-3 bg-bone-50 border border-ink-200 rounded-xl p-4 text-[12px] font-mono text-ink-700 overflow-x-auto">
              {JSON.stringify(s.metadata ?? {}, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-3">
          <div className="tabs" role="tablist">
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
        </div>

        {tab === "calls" ? (
          <CallsTab loading={callsQ.isLoading} error={!!callsQ.error} rows={callsQ.data?.data ?? []} onRetry={() => callsQ.refetch()} />
        ) : (
          <SmsTab loading={smsQ.isLoading} error={!!smsQ.error} rows={smsQ.data?.data ?? []} onRetry={() => smsQ.refetch()} />
        )}
      </div>

      {endOpen && (
        <EndSessionDialog
          graceMinutes={s.gracePeriodMinutes}
          busy={ending}
          error={endError}
          onCancel={() => !ending && setEndOpen(false)}
          onConfirm={onConfirmEnd}
        />
      )}

      {changeOpen && (
        <ChangeCustomerDialog
          sessionId={id}
          onCancel={() => setChangeOpen(false)}
          onChanged={async (updated) => {
            setChangeOpen(false);
            toast.success("Customer changed", `Now ${updated.customerPhoneMasked ?? "updated"}`);
            await qc.invalidateQueries({ queryKey: ["session", id] });
            await qc.invalidateQueries({ queryKey: ["sessions"] });
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/sessions"
      className="inline-flex items-center gap-1 min-h-[44px] lg:min-h-0 text-[14px] text-ink-500 hover:text-ink-900 transition-colors mb-3"
    >
      <ChevronLeft className="w-4 h-4" /> Sessions
    </Link>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bone-50 ring-1 ring-inset ring-ink-900/5 px-3.5 py-3">
      <div className="eyebrow">{label}</div>
      <div className="text-[13px] text-ink-900 mt-1 font-mono break-words">{value}</div>
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
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ring-4 ${
                  done ? "bg-signal-500 ring-signal-500/15" : "bg-ink-300 ring-bone-100"
                }`}
              />
              {i < events.length - 1 && (
                <div
                  className={`flex-1 h-px ${done ? "bg-signal-500" : "bg-ink-200"}`}
                />
              )}
            </div>
            <div
              className={`mt-3 text-[13px] font-medium ${
                done ? "text-ink-900" : "text-ink-400"
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
      role="tab"
      aria-selected={active}
      data-active={active}
      className="tab"
    >
      {label}
      {count != null && (
        <span className="ml-0.5 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-bone-100 text-[11px] text-ink-600 tabular-nums">
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
      <table className="w-full table-stack">
        <thead>
          <tr>
            {["Dir", "Status", "Duration", "Initiated", "Answered", "Ended"].map((h) => (
              <th
                key={h}
                className="th"
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
                  className="btn btn-secondary btn-sm"
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
              <tr key={c.id} className="hover:bg-bone-50 transition-colors">
                <td data-label="Dir" className="td text-[13px] text-ink-700">
                  <DirectionGlyph direction={c.direction} />
                </td>
                <td data-label="Status" className="td text-[13px]">
                  <StatePill state={c.status} size="sm" />
                </td>
                <td data-label="Duration" className="td text-[13px] text-ink-700 font-mono tabular-nums">
                  {fmtDuration(c.durationSeconds)}
                </td>
                <td data-label="Initiated"
                  className="td text-[13px] text-ink-700"
                  title={fmtAbsolute(c.initiatedAt)}
                >
                  {fmtRelative(c.initiatedAt)}
                </td>
                <td data-label="Answered"
                  className="td text-[13px] text-ink-700"
                  title={fmtAbsolute(c.answeredAt)}
                >
                  {fmtRelative(c.answeredAt)}
                </td>
                <td data-label="Ended"
                  className="td text-[13px] text-ink-700"
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
      <div className="mx-3 sm:mx-4 mb-3 px-3.5 py-2.5 rounded-xl bg-blue-50 ring-1 ring-inset ring-blue-200/60 flex items-center gap-2 text-[13px] text-blue-800">
        <Lock className="w-3.5 h-3.5 flex-shrink-0" />
        Message content is encrypted at rest. Only the sender&apos;s app can decrypt it.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-stack">
          <thead>
            <tr>
              {["Dir", "Status", "Cost", "Sent", "Delivered"].map((h) => (
                <th
                  key={h}
                  className="th"
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
                    className="btn btn-secondary btn-sm"
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
                <tr key={m.id} className="hover:bg-bone-50 transition-colors">
                  <td data-label="Dir" className="td text-[13px] text-ink-700">
                    <DirectionGlyph direction={m.direction} />
                  </td>
                  <td data-label="Status" className="td text-[13px]">
                    <StatePill state={m.status} size="sm" />
                  </td>
                  <td data-label="Cost" className="td text-[13px] text-ink-700 font-mono">
                    {m.cost ?? "—"}
                  </td>
                  <td data-label="Sent"
                    className="td text-[13px] text-ink-700"
                    title={fmtAbsolute(m.sentAt)}
                  >
                    {fmtRelative(m.sentAt)}
                  </td>
                  <td data-label="Delivered"
                    className="td text-[13px] text-ink-700"
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
