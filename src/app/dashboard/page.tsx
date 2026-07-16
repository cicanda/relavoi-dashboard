"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  PhoneCall,
  Clock,
  MessageSquare,
  ArrowLeftRight,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

import { listSessions, listCalls } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { truncId, fmtRelative, fmtNumber } from "@/lib/format";
import { StatCard } from "@/components/stat-card";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import type { Session, DirectionMode } from "@/lib/types";

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string | null): string {
  if (!name) return "there";
  const trimmed = name.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateHeader(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Lagos is +01:00 (WAT, no DST). Render the time in that zone so the header
// reads correctly for operators no matter where their browser thinks they are.
function formatLagosTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  }).format(d);
}

function DirectionIcon({ mode }: { mode: DirectionMode }) {
  if (mode === "A_TO_B_ONLY") return <ArrowRight className="w-4 h-4 text-ink-600" />;
  if (mode === "B_TO_A_ONLY") return <ArrowLeft className="w-4 h-4 text-ink-600" />;
  return <ArrowLeftRight className="w-4 h-4 text-ink-600" />;
}

export default function OverviewPage() {
  const router = useRouter();
  const toast = useToast();
  const { tenant, user } = useAuth();
  const now = useMemo(() => new Date(), []);

  const errorShown = useRef<Set<string>>(new Set());
  function showErrorOnce(key: string, message: string) {
    if (errorShown.current.has(key)) return;
    errorShown.current.add(key);
    toast.error(message);
  }

  const activeQ = useQuery({
    queryKey: ["overview", "active-sessions"],
    queryFn: () => listSessions({ state: "ACTIVE", limit: 100 }),
    staleTime: 30_000,
  });

  const activeRecentQ = useQuery({
    queryKey: ["overview", "active-recent"],
    queryFn: () => listSessions({ state: "ACTIVE", limit: 10 }),
    staleTime: 30_000,
  });

  const periodStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);
  const periodEnd = useMemo(() => new Date().toISOString(), []);

  const callsQ = useQuery({
    queryKey: ["overview", "calls-30d", periodStart, periodEnd],
    queryFn: () => listCalls({ periodStart, periodEnd, limit: 1 }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (activeQ.error) showErrorOnce("active", "Could not load active sessions");
  }, [activeQ.error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeRecentQ.error) showErrorOnce("active-recent", "Could not load recent sessions");
  }, [activeRecentQ.error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (callsQ.error) showErrorOnce("calls", "Could not load call totals");
  }, [callsQ.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = activeQ.data?.data.length ?? 0;
  const callsTotal =
    callsQ.data?.pagination.count != null
      ? fmtNumber(callsQ.data.pagination.count)
      : callsQ.error
        ? "—"
        : undefined;

  const recentSessions: Session[] = activeRecentQ.data?.data ?? [];

  return (
    <div>
      {/* Greeting bar */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
            {greeting(now)}, {firstName(user?.name)}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            {formatDateHeader(now)} · Lagos · {formatLagosTime(now)} WAT
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono uppercase tracking-wider rounded-md bg-signal-500/15 text-signal-700">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-500 animate-pulse-dot" />
            All systems operational
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Active Sessions"
          value={activeQ.isLoading ? "" : fmtNumber(activeCount)}
          icon={Activity}
          hint="currently routing"
          loading={activeQ.isLoading}
        />
        <StatCard
          label="Total Calls"
          value={callsQ.isLoading ? "" : (callsTotal ?? "—")}
          icon={PhoneCall}
          hint="last 30 days"
          loading={callsQ.isLoading}
        />
        <StatCard
          label="Call Minutes"
          value="—"
          icon={Clock}
          hint="(coming soon)"
        />
        <StatCard
          label="SMS Sent"
          value="—"
          icon={MessageSquare}
          hint="(coming soon)"
        />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Active sessions table */}
        <div className="lg:col-span-3">
          <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card">
            <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Active Sessions</h2>
                <p className="text-xs text-ink-500 mt-0.5">10 most recent</p>
              </div>
              <Link
                href="/dashboard/sessions"
                className="text-xs text-ink-600 hover:text-ink-900 inline-flex items-center gap-1"
              >
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                      Session ID
                    </th>
                    <th className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                      Proxy
                    </th>
                    <th className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                      Status
                    </th>
                    <th className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                      Dir
                    </th>
                    <th className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                      Calls
                    </th>
                    <th className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeRecentQ.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                  ) : recentSessions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 border-t border-ink-200 text-center text-sm text-ink-500"
                      >
                        No active sessions right now.
                      </td>
                    </tr>
                  ) : (
                    recentSessions.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => router.push(`/dashboard/sessions/${s.id}`)}
                        className="cursor-pointer hover:bg-bone-100 transition-colors"
                      >
                        <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono">
                          {truncId(s.id)}
                        </td>
                        <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono">
                          {s.proxyNumber}
                        </td>
                        <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                          <StatePill state={s.state} size="sm" />
                        </td>
                        <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                          <DirectionIcon mode={s.directionMode} />
                        </td>
                        <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono tabular-nums">
                          {s.callCount ?? 0}
                        </td>
                        <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                          {fmtRelative(s.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Quick config */}
          <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-3">Quick Config</h2>
            <dl className="space-y-2.5">
              <ConfigRow label="Tier" value={tenant?.tier ?? "—"} />
              <ConfigRow
                label="Recording"
                value={tenant?.recordingEnabled ? "Enabled" : "Disabled"}
              />
              <ConfigRow
                label="Push"
                value={
                  tenant?.pushConfig && Object.keys(tenant.pushConfig).length > 0
                    ? "Configured"
                    : "Not configured"
                }
              />
              <ConfigRow
                label="Grace Period"
                value={
                  tenant?.defaultGracePeriod != null ? `${tenant.defaultGracePeriod} min` : "—"
                }
              />
              <ConfigRow
                label="Expired Behavior"
                value={tenant?.expiredCallBehavior ?? "—"}
                mono
              />
            </dl>
            <Link
              href="/dashboard/settings"
              className="mt-4 inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900"
            >
              Manage settings <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Billing snapshot */}
          <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-2">Billing</h2>
            <p className="text-xs text-ink-500">
              Current period: this month · Plan:{" "}
              <span className="font-mono uppercase text-ink-700">{tenant?.tier ?? "—"}</span>
            </p>
            <Link
              href="/dashboard/billing"
              className="mt-4 inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900"
            >
              View details <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] font-mono uppercase tracking-wider text-ink-500">{label}</dt>
      <dd
        className={`text-[13px] text-ink-900 text-right truncate ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
