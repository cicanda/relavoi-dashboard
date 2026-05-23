"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { getPool } from "@/lib/api";
import { fmtNumber, fmtRelative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Skeleton } from "@/components/skeleton";
import type { PoolStatus } from "@/lib/types";

interface PoolAggregate {
  total: number;
  available: number;
  inUse: number;
  cooldown: number;
  quarantined: number;
}

function emptyAgg(): PoolAggregate {
  return { total: 0, available: 0, inUse: 0, cooldown: 0, quarantined: 0 };
}

function aggregate(rows: PoolStatus[]): PoolAggregate {
  return rows.reduce<PoolAggregate>((acc, r) => {
    acc.total += r.total;
    acc.available += r.available;
    acc.inUse += r.inUse;
    acc.cooldown += r.cooldown;
    acc.quarantined += r.quarantined ?? 0;
    return acc;
  }, emptyAgg());
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

function utilColor(p: number): string {
  if (p < 60) return "bg-signal-500";
  if (p < 80) return "bg-amber-500";
  return "bg-red-500";
}

function groupBy<T, K extends string>(rows: T[], key: (r: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const r of rows) {
    const k = key(r);
    if (!out[k]) out[k] = [];
    out[k].push(r);
  }
  return out;
}

export default function NumbersPage() {
  const poolQ = useQuery({
    queryKey: ["pool"],
    queryFn: getPool,
    refetchInterval: 30_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const rows: PoolStatus[] = useMemo(() => poolQ.data ?? [], [poolQ.data]);
  const totals = useMemo(() => aggregate(rows), [rows]);
  const utilization = pct(totals.inUse, totals.total);

  const byRegion = useMemo(() => {
    const groups = groupBy(rows, (r) => r.region);
    return Object.entries(groups)
      .map(([region, regionRows]) => ({ region, ...aggregate(regionRows) }))
      .sort((a, b) => a.region.localeCompare(b.region));
  }, [rows]);

  const byProvider = useMemo(() => {
    const groups = groupBy(rows, (r) => r.provider);
    return Object.entries(groups)
      .map(([provider, providerRows]) => ({ provider, ...aggregate(providerRows) }))
      .sort((a, b) => a.provider.localeCompare(b.provider));
  }, [rows]);

  const loading = poolQ.isLoading;
  const updatedLabel =
    poolQ.dataUpdatedAt > 0 ? fmtRelative(new Date(poolQ.dataUpdatedAt).toISOString()) : "—";

  return (
    <div>
      <PageHeader
        title="Number Pool"
        description="Status of your proxy number fleet"
        actions={
          <button
            onClick={() => poolQ.refetch()}
            disabled={poolQ.isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-ink-700 bg-paper border border-ink-200 rounded-md hover:bg-bone-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${poolQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      <div className="-mt-4 mb-4 text-[11px] font-mono uppercase tracking-wider text-ink-500">
        Updated {updatedLabel}
      </div>

      {/* Pool Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Total" value={loading ? "" : fmtNumber(totals.total)} loading={loading} />
        <StatCard
          label="Available"
          value={loading ? "" : fmtNumber(totals.available)}
          loading={loading}
        />
        <StatCard label="In Use" value={loading ? "" : fmtNumber(totals.inUse)} loading={loading} />
        <StatCard
          label="Cooldown"
          value={loading ? "" : fmtNumber(totals.cooldown)}
          loading={loading}
        />
        <StatCard
          label="Quarantined"
          value={loading ? "" : fmtNumber(totals.quarantined)}
          loading={loading}
        />
      </div>

      {/* Utilization Gauge */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base text-ink-900">Pool Utilization</h2>
          {!loading && (
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500 tabular-nums">
              {utilization}%
            </span>
          )}
        </div>
        {loading ? (
          <Skeleton className="h-3 w-full" />
        ) : (
          <div className="bg-ink-200 h-3 rounded-full overflow-hidden">
            <div
              className={`h-full ${utilColor(utilization)} transition-all`}
              style={{ width: `${utilization}%` }}
            />
          </div>
        )}
        {!loading && (
          <>
            <div className="mt-3 text-[13px] text-ink-700 tabular-nums">
              <span className="font-medium">{fmtNumber(totals.inUse)}</span> of{" "}
              <span className="font-medium">{fmtNumber(totals.total)}</span> numbers in use (
              {utilization}%)
            </div>
            <div className="text-xs text-ink-500 mt-0.5 tabular-nums">
              {fmtNumber(totals.available)} available, {fmtNumber(totals.cooldown)} in cooldown
            </div>
          </>
        )}
      </div>

      {/* By Region */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card mb-4">
        <div className="px-5 py-4 border-b border-ink-200">
          <h2 className="text-sm font-semibold text-ink-900">By Region</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  "Region",
                  "Total",
                  "Available",
                  "In Use",
                  "Cooldown",
                  "Quarantined",
                  "Utilization",
                ].map((h) => (
                  <th
                    key={h}
                    className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3 border-t border-ink-200">
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : byRegion.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 border-t border-ink-200 text-center text-sm text-ink-500"
                  >
                    No regions configured yet.
                  </td>
                </tr>
              ) : (
                byRegion.map((r) => {
                  const u = pct(r.inUse, r.total);
                  return (
                    <tr key={r.region}>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono uppercase tracking-wider">
                        {r.region}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                        {fmtNumber(r.total)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-signal-700 tabular-nums">
                        {fmtNumber(r.available)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-blue-700 tabular-nums">
                        {fmtNumber(r.inUse)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-amber-700 tabular-nums">
                        {fmtNumber(r.cooldown)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-red-700 tabular-nums">
                        {fmtNumber(r.quarantined)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                        <div className="flex items-center gap-2">
                          <div
                            className="bg-ink-200 h-1.5 rounded-full overflow-hidden"
                            style={{ width: 80 }}
                          >
                            <div
                              className={`h-full ${utilColor(u)}`}
                              style={{ width: `${u}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-ink-500 tabular-nums">
                            {u}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Provider */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card">
        <div className="px-5 py-4 border-b border-ink-200">
          <h2 className="text-sm font-semibold text-ink-900">By Provider</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Provider", "Total", "Available", "In Use", "Cooldown"].map((h) => (
                  <th
                    key={h}
                    className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3 border-t border-ink-200">
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : byProvider.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 border-t border-ink-200 text-center text-sm text-ink-500"
                  >
                    No providers configured yet.
                  </td>
                </tr>
              ) : (
                byProvider.map((p) => (
                  <tr key={p.provider}>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono uppercase tracking-wider">
                      {p.provider}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                      {fmtNumber(p.total)}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-signal-700 tabular-nums">
                      {fmtNumber(p.available)}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-blue-700 tabular-nums">
                      {fmtNumber(p.inUse)}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-amber-700 tabular-nums">
                      {fmtNumber(p.cooldown)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
