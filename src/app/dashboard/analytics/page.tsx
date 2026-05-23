"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import {
  getCallSuccessRate,
  getSessionsOverTime,
  listCalls,
  listSessions,
  type TimeBucket,
} from "@/lib/api";
import { fmtDuration, fmtNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import type { CallRecord } from "@/lib/types";

type RangeKey = "24h" | "7d" | "30d" | "3m";

interface RangeDef {
  key: RangeKey;
  label: string;
  durationMs: number;
  granularity: "hour" | "day";
}

const RANGES: RangeDef[] = [
  { key: "24h", label: "Last 24h", durationMs: 24 * 60 * 60 * 1000, granularity: "hour" },
  { key: "7d", label: "7d", durationMs: 7 * 24 * 60 * 60 * 1000, granularity: "day" },
  { key: "30d", label: "30d", durationMs: 30 * 24 * 60 * 60 * 1000, granularity: "day" },
  { key: "3m", label: "3 months", durationMs: 90 * 24 * 60 * 60 * 1000, granularity: "day" },
];

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

const CALL_COLORS = {
  answered: "#5BC97A",
  missed: "#F59E0B",
  failed: "#EF4444",
};

const AXIS_TICK = { fontSize: 11, fill: "#64748B", fontFamily: "var(--font-mono)" };

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string }>;
  label?: string | number;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const displayLabel = labelFormatter && label != null ? labelFormatter(label) : String(label ?? "");
  return (
    <div className="bg-paper border border-ink-200 rounded-md shadow-card px-3 py-2 text-[12px]">
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1">
        {displayLabel}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ background: p.color ?? "#5BC97A" }}
          />
          <span className="text-ink-500 capitalize">{p.name ?? p.dataKey}</span>
          <span className="ml-auto font-medium text-ink-900 tabular-nums">
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  height = 280,
  children,
  loading,
  error,
  onRetry,
  empty,
}: {
  title: string;
  height?: number;
  children: React.ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  empty?: boolean;
}) {
  return (
    <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5">
      <h2 className="text-sm font-semibold text-ink-900 mb-3">{title}</h2>
      {loading ? (
        <div className="rounded animate-shimmer" style={{ height }} />
      ) : error ? (
        <div
          className="flex flex-col items-center justify-center gap-2 text-sm text-ink-500"
          style={{ height }}
        >
          <div>Couldn&apos;t load chart</div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-[12px] bg-paper border border-ink-200 rounded-md text-ink-700 hover:bg-bone-100"
            >
              Retry
            </button>
          )}
        </div>
      ) : empty ? (
        <div
          className="flex items-center justify-center text-sm text-ink-500"
          style={{ height }}
        >
          No data for this range
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const range = useMemo(() => RANGES.find((r) => r.key === rangeKey)!, [rangeKey]);

  const { periodStart, periodEnd } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - range.durationMs);
    return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
  }, [range]);

  const xLabelFormatter = useMemo(() => {
    return (raw: string | number): string => {
      const d = typeof raw === "string" ? new Date(raw) : new Date(String(raw));
      if (isNaN(d.getTime())) return String(raw);
      return range.granularity === "hour" ? format(d, "HH:mm") : format(d, "MMM d");
    };
  }, [range]);

  const callsQ = useQuery({
    queryKey: ["analytics", "call-success-rate", periodStart, periodEnd, range.granularity],
    queryFn: () => getCallSuccessRate(periodStart, periodEnd, range.granularity),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const sessionsQ = useQuery({
    queryKey: ["analytics", "sessions-over-time", periodStart, periodEnd, range.granularity],
    queryFn: () => getSessionsOverTime(periodStart, periodEnd, range.granularity),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const callsListQ = useQuery({
    queryKey: ["analytics", "calls-list", periodStart, periodEnd],
    queryFn: () => listCalls({ periodStart, periodEnd, limit: 200 }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const activeSessionsQ = useQuery({
    queryKey: ["analytics", "active-sessions"],
    queryFn: () => listSessions({ state: "ACTIVE", limit: 200 }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const callBuckets: TimeBucket[] = callsQ.data ?? [];
  const sessionBuckets: TimeBucket[] = sessionsQ.data ?? [];
  const callsList: CallRecord[] = callsListQ.data?.data ?? [];

  // Summary stats
  const totalCalls = useMemo(() => {
    return callBuckets.reduce((sum, b) => {
      const keys = Object.keys(b).filter((k) => k !== "ts");
      return sum + keys.reduce((s, k) => s + asNumber(b[k]), 0);
    }, 0);
  }, [callBuckets]);

  const answerRate = useMemo(() => {
    let answered = 0;
    let total = 0;
    for (const b of callBuckets) {
      const a = asNumber(b.answered) + asNumber(b.completed);
      const all = Object.keys(b)
        .filter((k) => k !== "ts")
        .reduce((s, k) => s + asNumber(b[k]), 0);
      answered += a;
      total += all;
    }
    if (total === 0) return "—";
    return `${Math.round((answered / total) * 100)}%`;
  }, [callBuckets]);

  const avgDurationSec = useMemo(() => {
    const withDur = callsList.filter(
      (c): c is CallRecord & { durationSeconds: number } =>
        typeof c.durationSeconds === "number" && c.durationSeconds > 0,
    );
    if (withDur.length === 0) return null;
    const total = withDur.reduce((s, c) => s + c.durationSeconds, 0);
    return Math.round(total / withDur.length);
  }, [callsList]);

  const activeSessionsCount =
    activeSessionsQ.data?.pagination.count ?? activeSessionsQ.data?.data.length ?? 0;

  // Call volume series — normalize keys
  const callVolumeData = useMemo(() => {
    return callBuckets.map((b) => ({
      ts: b.ts,
      answered: asNumber(b.answered) + asNumber(b.completed),
      missed: asNumber(b.missed),
      failed: asNumber(b.failed),
    }));
  }, [callBuckets]);

  // Direction pie data
  const directionData = useMemo(() => {
    let aToB = 0;
    let bToA = 0;
    for (const c of callsList) {
      if (c.direction === "A_TO_B") aToB++;
      else if (c.direction === "B_TO_A") bToA++;
    }
    if (aToB === 0 && bToA === 0) return [];
    return [
      { name: "A → B", value: aToB, color: "#5BC97A" },
      { name: "B → A", value: bToA, color: "#3B82F6" },
    ];
  }, [callsList]);

  // Sessions series — sum numeric fields per bucket
  const sessionSeriesData = useMemo(() => {
    return sessionBuckets.map((b) => {
      const keys = Object.keys(b).filter((k) => k !== "ts");
      const total = keys.reduce((s, k) => s + asNumber(b[k]), 0);
      return { ts: b.ts, sessions: total };
    });
  }, [sessionBuckets]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Operational insights from your masked sessions"
      />

      {/* Period selector */}
      <div className="mb-5 inline-flex rounded-md overflow-hidden border border-ink-200">
        {RANGES.map((r, i) => {
          const selected = r.key === rangeKey;
          return (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`px-3 py-1.5 text-[13px] transition-colors ${
                selected
                  ? "bg-ink-900 text-paper"
                  : "bg-paper text-ink-700 hover:bg-bone-100"
              } ${i > 0 ? "border-l border-ink-200" : ""}`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Total Calls"
          value={callsQ.isLoading ? "" : fmtNumber(totalCalls)}
          loading={callsQ.isLoading}
        />
        <StatCard
          label="Answer Rate"
          value={callsQ.isLoading ? "" : answerRate}
          loading={callsQ.isLoading}
        />
        <StatCard
          label="Avg Duration"
          value={callsListQ.isLoading ? "" : fmtDuration(avgDurationSec)}
          loading={callsListQ.isLoading}
        />
        <StatCard
          label="Active Sessions"
          value={activeSessionsQ.isLoading ? "" : fmtNumber(activeSessionsCount)}
          loading={activeSessionsQ.isLoading}
        />
      </div>

      {/* Call Volume chart */}
      <div className="mb-4">
        <ChartCard
          title="Call Volume"
          height={280}
          loading={callsQ.isLoading}
          error={!!callsQ.error}
          onRetry={() => callsQ.refetch()}
          empty={!callsQ.isLoading && callVolumeData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={callVolumeData} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ts"
                tick={AXIS_TICK}
                tickFormatter={xLabelFormatter}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={<ChartTooltip labelFormatter={xLabelFormatter} />}
                cursor={{ stroke: "#E2E8F0", strokeDasharray: "3 3" }}
              />
              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              />
              <Area
                type="monotone"
                dataKey="answered"
                stackId="calls"
                stroke={CALL_COLORS.answered}
                fill={CALL_COLORS.answered}
                fillOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="missed"
                stackId="calls"
                stroke={CALL_COLORS.missed}
                fill={CALL_COLORS.missed}
                fillOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="failed"
                stackId="calls"
                stroke={CALL_COLORS.failed}
                fill={CALL_COLORS.failed}
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Two-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Call Direction"
          height={260}
          loading={callsListQ.isLoading}
          error={!!callsListQ.error}
          onRetry={() => callsListQ.refetch()}
          empty={!callsListQ.isLoading && directionData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={directionData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                stroke="#FFFFFF"
                strokeWidth={2}
              >
                {directionData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Sessions over Time"
          height={260}
          loading={sessionsQ.isLoading}
          error={!!sessionsQ.error}
          onRetry={() => sessionsQ.refetch()}
          empty={!sessionsQ.isLoading && sessionSeriesData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sessionSeriesData}
              margin={{ top: 5, right: 12, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ts"
                tick={AXIS_TICK}
                tickFormatter={xLabelFormatter}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={<ChartTooltip labelFormatter={xLabelFormatter} />}
                cursor={{ stroke: "#E2E8F0", strokeDasharray: "3 3" }}
              />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#5BC97A"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: "#5BC97A", stroke: "#FFFFFF", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
