"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  Clock,
  FlaskConical,
  MessageSquare,
  PhoneCall,
} from "lucide-react";

import { listSessions, listCalls, getConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useKybBannerCarriesSandboxNote } from "@/components/dashboard/kyb-gate";
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
    // limit:100 (the API max) so the count reflects real calls, not the page size.
    queryFn: () => listCalls({ periodStart, periodEnd, limit: 100 }),
    staleTime: 30_000,
  });

  // Full tenant config (grace period, expired behavior, recording) — the
  // auth-store tenant only carries id/name/tier/status.
  const configQ = useQuery({
    queryKey: ["overview", "config"],
    queryFn: getConfig,
    staleTime: 60_000,
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
    callsQ.data?.data != null
      ? fmtNumber(callsQ.data.data.length)
      : callsQ.error
        ? "—"
        : undefined;
  const config = configQ.data;

  const recentSessions: Session[] = activeRecentQ.data?.data ?? [];

  return (
    <div>
      <SandboxBanner />

      {/* Greeting bar */}
      <div className="mb-[var(--space-section)] flex items-end justify-between gap-x-4 gap-y-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="display-title">
            {greeting(now)}, {firstName(user?.name)}
          </h1>
          <p className="text-[15px] text-ink-500 mt-2">
            {formatDateHeader(now)} · Lagos · {formatLagosTime(now)} WAT
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="chip bg-paper text-signal-700 shadow-sm ring-1 ring-ink-900/5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-500 animate-pulse-dot" />
            All systems operational
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="tray grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 mb-[var(--space-section)] [&>*]:min-w-0">
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
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 [&>*]:min-w-0">
        {/* Active sessions table */}
        <div className="xl:col-span-3">
          <div className="card">
            <div className="card-head flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">Active Sessions</h2>
                <p className="text-[13px] text-ink-500 mt-0.5">10 most recent</p>
              </div>
              <Link
                href="/dashboard/sessions"
                className="link-more"
              >
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-stack">
                <thead>
                  <tr>
                    <th className="th">
                      Session ID
                    </th>
                    <th className="th">
                      Proxy
                    </th>
                    <th className="th">
                      Status
                    </th>
                    <th className="th">
                      Dir
                    </th>
                    <th className="th">
                      Calls
                    </th>
                    <th className="th">
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
                        className="row-link"
                      >
                        <td data-label="Session ID" className="td text-[13px] text-ink-700 font-mono">
                          {truncId(s.id)}
                        </td>
                        <td data-label="Proxy" className="td text-[13px] text-ink-700 font-mono">
                          {s.proxyNumber}
                        </td>
                        <td data-label="Status" className="td text-[13px] text-ink-700">
                          <StatePill state={s.state} size="sm" />
                        </td>
                        <td data-label="Dir" className="td text-[13px] text-ink-700">
                          <DirectionIcon mode={s.directionMode} />
                        </td>
                        <td data-label="Calls" className="td text-[13px] text-ink-700 font-mono tabular-nums">
                          {s.callCount ?? 0}
                        </td>
                        <td data-label="Created" className="td text-[13px] text-ink-700">
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
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 content-start gap-4 [&>*]:min-w-0">
          {/* Quick config */}
          <div className="card p-5">
            <h2 className="section-title mb-4">Quick Config</h2>
            <dl className="divide-y divide-ink-200">
              <ConfigRow label="Tier" value={config?.tier ?? tenant?.tier ?? "—"} />
              {/* Not "Disabled", which reads like a choice this workspace made.
                  Recording is not available to anyone yet. */}
              <ConfigRow label="Recording" value="Coming soon" />
              <ConfigRow
                label="Push"
                value={
                  config?.pushConfig && Object.keys(config.pushConfig).length > 0
                    ? "Configured"
                    : "Not configured"
                }
              />
              <ConfigRow
                label="Grace Period"
                value={
                  config?.defaultGracePeriod != null ? `${config.defaultGracePeriod} min` : "—"
                }
              />
              <ConfigRow
                label="Expired Behavior"
                value={config?.expiredCallBehavior ?? "—"}
                mono
              />
            </dl>
            <Link
              href="/dashboard/settings"
              className="mt-4 link-more"
            >
              Manage settings <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Billing snapshot */}
          <div className="card p-5">
            <h2 className="section-title mb-2">Billing</h2>
            <p className="text-[13px] text-ink-500">
              Current period: this month · Plan:{" "}
              <span className="font-mono uppercase text-ink-700">{tenant?.tier ?? "—"}</span>
            </p>
            <Link
              href="/dashboard/billing"
              className="mt-4 link-more"
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
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="eyebrow">{label}</dt>
      <dd
        className={`text-[14px] text-ink-900 text-right truncate ${mono ? "font-mono text-[13px]" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Shown only while the workspace is sandboxed. Deliberately informational
 * rather than an alert: sandbox is the normal starting state, not a misconfig.
 */
function SandboxBanner() {
  const { tenant } = useAuth();
  // The verification bar in the layout folds this notice in when it is showing,
  // so rendering here too would stack two bars saying the same thing.
  const mergedIntoKybBanner = useKybBannerCarriesSandboxNote();
  if (tenant?.mode === "live") return null;
  if (mergedIntoKybBanner) return null;
  return (
    <div className="callout mb-5 border-brand-amber/30 bg-brand-amber/10">
      <FlaskConical className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
      <div className="text-[13px] text-ink-700">
        You&apos;re in sandbox mode. API calls are free and no real calls are placed.{" "}
        <Link href="/dashboard/api-keys" className="font-medium text-ink-900 underline">
          Activate live mode
        </Link>{" "}
        when you&apos;re ready.
      </div>
    </div>
  );
}
