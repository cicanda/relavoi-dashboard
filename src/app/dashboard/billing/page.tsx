"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";

import { getPricing, getUsage } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { fmtCurrency, fmtNumber, fmtAbsolute } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { Skeleton } from "@/components/skeleton";
import type { PricingTierRow, Tier } from "@/lib/types";

interface PeriodOption {
  value: string;
  label: string;
  monthsAgo: number;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "current", label: "Current period", monthsAgo: 0 },
  { value: "last", label: "Last month", monthsAgo: 1 },
  { value: "2mo", label: "2 months ago", monthsAgo: 2 },
  { value: "3mo", label: "3 months ago", monthsAgo: 3 },
];

function monthRange(monthsAgo: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59, 999);
  const label = format(start, "MMMM yyyy");
  return { start, end, label };
}

function metricLabel(metric: string): string {
  const map: Record<string, string> = {
    session_created: "Sessions created",
    call_minute: "Call minutes",
    sms_sent: "SMS sent",
    sms_received: "SMS received",
    number_rental: "Numbers rented",
    recording_minute: "Recording minutes",
  };
  return map[metric] ?? metric;
}

function progressColor(pct: number): string {
  if (pct < 80) return "bg-signal-500";
  if (pct < 100) return "bg-amber-500";
  return "bg-red-500";
}

export default function BillingPage() {
  const { tenant } = useAuth();
  const tier: Tier = (tenant?.tier as Tier | undefined) ?? "STARTER";

  const [periodValue, setPeriodValue] = useState<string>("current");
  const [pricingOpen, setPricingOpen] = useState(false);

  const selectedOption = useMemo(
    () => PERIOD_OPTIONS.find((p) => p.value === periodValue) ?? PERIOD_OPTIONS[0],
    [periodValue],
  );

  const { periodStart, periodEnd, periodLabel, dateRangeLabel } = useMemo(() => {
    const { start, end, label } = monthRange(selectedOption.monthsAgo);
    const range = `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      periodLabel: label,
      dateRangeLabel: range,
    };
  }, [selectedOption]);

  const usageQ = useQuery({
    queryKey: ["billing", "usage", periodStart, periodEnd],
    queryFn: () => getUsage(periodStart, periodEnd),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const pricingQ = useQuery({
    queryKey: ["billing", "pricing"],
    queryFn: getPricing,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const pricing: PricingTierRow[] = pricingQ.data ?? [];

  const pricingForTier = useMemo(() => {
    const out: Record<string, PricingTierRow> = {};
    for (const row of pricing) {
      if (row.tier === tier) out[row.metric] = row;
    }
    return out;
  }, [pricing, tier]);

  const usageMetrics = usageQ.data?.metrics ?? {};
  const totalEvents = usageQ.data?.totalEvents ?? 0;

  // Compute total spend = sum over metrics: unitPrice * max(0, quantity - included) (overage)
  // Plus base inclusion is treated as "within plan"; spend is overage only.
  const totalSpend = useMemo(() => {
    let total = 0;
    let currency = "NGN";
    for (const [metric, qty] of Object.entries(usageMetrics)) {
      const row = pricingForTier[metric];
      if (!row) continue;
      currency = row.currency || currency;
      const overageQty = Math.max(0, qty - row.includedQuantity);
      const price = row.overagePrice ?? row.unitPrice ?? 0;
      total += overageQty * price;
    }
    return { value: total, currency };
  }, [usageMetrics, pricingForTier]);

  // Group pricing by tier
  const pricingByTier = useMemo(() => {
    const out: Record<string, PricingTierRow[]> = {};
    for (const row of pricing) {
      if (!out[row.tier]) out[row.tier] = [];
      out[row.tier].push(row);
    }
    return out;
  }, [pricing]);

  const usageLoading = usageQ.isLoading;
  const usageError = !!usageQ.error;

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Usage and invoices for your workspace"
        actions={
          <select
            value={periodValue}
            onChange={(e) => setPeriodValue(e.target.value)}
            className="px-3 py-1.5 text-[13px] text-ink-700 bg-paper border border-ink-200 rounded-md hover:bg-bone-100 transition-colors"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        }
      />

      {/* Current Period Summary */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Left */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
              Period
            </div>
            <div className="text-base font-semibold text-ink-900 mb-2">{periodLabel}</div>
            <div className="mb-2">
              <StatePill state="ACTIVE" size="sm" />
            </div>
            <div className="text-[12px] font-mono text-ink-500 tabular-nums">{dateRangeLabel}</div>
          </div>

          {/* Middle */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
              Total spend
            </div>
            {usageLoading || pricingQ.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-semibold text-ink-900 tabular-nums">
                {fmtCurrency(totalSpend.value, totalSpend.currency)}
              </div>
            )}
            <div className="text-xs text-ink-500 mt-1">Overage charges this period</div>
          </div>

          {/* Right */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
              Events
            </div>
            {usageLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold text-ink-900 tabular-nums">
                {fmtNumber(totalEvents)}
              </div>
            )}
            <div className="text-xs text-ink-500 mt-1">Total billable events recorded</div>
          </div>
        </div>
      </div>

      {/* Usage Breakdown */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card mb-4">
        <div className="px-5 py-4 border-b border-ink-200">
          <h2 className="text-sm font-semibold text-ink-900">Usage by metric</h2>
        </div>
        <div className="p-5">
          {usageLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : usageError ? (
            <div className="text-sm text-red-700">Couldn&apos;t load usage data.</div>
          ) : Object.keys(usageMetrics).length === 0 ? (
            <div className="text-sm text-ink-500 text-center py-6">
              No usage recorded for this period yet.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(usageMetrics).map(([metric, qty]) => {
                const row = pricingForTier[metric];
                const included = row?.includedQuantity ?? 0;
                const pct = included > 0 ? (qty / included) * 100 : qty > 0 ? 100 : 0;
                const overage = Math.max(0, qty - included);
                const price = row?.overagePrice ?? row?.unitPrice ?? 0;
                const cost = overage * price;
                const currency = row?.currency ?? "NGN";

                return (
                  <div key={metric} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-3 min-w-0">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
                          {metric}
                        </span>
                        <span className="text-[13px] text-ink-900 font-medium truncate">
                          {metricLabel(metric)}
                        </span>
                      </div>
                      <div className="text-[13px] text-ink-700 tabular-nums flex-shrink-0">
                        <span className="font-medium text-ink-900">{qty.toLocaleString()}</span>
                        <span className="text-ink-500"> / {included.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-ink-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${progressColor(pct)} transition-all`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="text-[12px] tabular-nums w-32 text-right flex-shrink-0">
                        {pct > 100 ? (
                          <span className="text-red-700 font-medium">
                            {fmtCurrency(cost, currency)}
                          </span>
                        ) : (
                          <span className="text-signal-700">Within plan</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pricing reference (collapsible) */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card mb-4">
        <button
          onClick={() => setPricingOpen((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-bone-100 transition-colors rounded-[10px]"
        >
          <h2 className="text-sm font-semibold text-ink-900">Tier Pricing</h2>
          {pricingOpen ? (
            <ChevronDown className="w-4 h-4 text-ink-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-ink-500" />
          )}
        </button>
        {pricingOpen && (
          <div className="px-5 pb-5 border-t border-ink-200">
            {pricingQ.isLoading ? (
              <div className="space-y-2 pt-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : pricingQ.error ? (
              <div className="pt-4 text-sm text-red-700">Couldn&apos;t load pricing.</div>
            ) : Object.keys(pricingByTier).length === 0 ? (
              <div className="pt-4 text-sm text-ink-500">No pricing data available.</div>
            ) : (
              <div className="space-y-5 pt-4">
                {(["STARTER", "GROWTH", "ENTERPRISE"] as Tier[])
                  .filter((t) => pricingByTier[t])
                  .map((t) => {
                    const rows = pricingByTier[t];
                    const isCurrent = t === tier;
                    return (
                      <div key={t}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-[13px] font-semibold text-ink-900 font-mono uppercase tracking-wider">
                            {t}
                          </h3>
                          {isCurrent && (
                            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-signal-500/15 text-signal-700">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr>
                                {["Metric", "Included", "Unit price", "Overage", "Currency"].map(
                                  (h) => (
                                    <th
                                      key={h}
                                      className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left"
                                    >
                                      {h}
                                    </th>
                                  ),
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr
                                  key={`${row.tier}-${row.metric}`}
                                  className={isCurrent ? "bg-bone-100" : ""}
                                >
                                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                                    <span className="font-mono uppercase text-[11px] text-ink-500 mr-2">
                                      {row.metric}
                                    </span>
                                    {metricLabel(row.metric)}
                                  </td>
                                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                                    {row.includedQuantity.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                                    {fmtCurrency(row.unitPrice, row.currency)}
                                  </td>
                                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                                    {row.overagePrice != null
                                      ? fmtCurrency(row.overagePrice, row.currency)
                                      : "—"}
                                  </td>
                                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono">
                                    {row.currency}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Billing history */}
      <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card">
        <div className="px-5 py-4 border-b border-ink-200">
          <h2 className="text-sm font-semibold text-ink-900">Billing history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Period", "Status", "Total events", "Cost", "Invoiced at", "Actions"].map((h) => (
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
              {usageLoading ? (
                <tr>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3 border-t border-ink-200">
                      <Skeleton className="h-3 w-full" />
                    </td>
                  ))}
                </tr>
              ) : selectedOption.monthsAgo === 0 ? (
                <tr>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                    {periodLabel}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200">
                    <StatePill state="ACTIVE" size="sm" />
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                    {fmtNumber(totalEvents)}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                    {fmtCurrency(totalSpend.value, totalSpend.currency)}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-500">
                    Pending close
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-400">
                    <span title="Coming soon" className="cursor-not-allowed">
                      Download invoice →
                    </span>
                  </td>
                </tr>
              ) : usageQ.data ? (
                <tr>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                    {periodLabel}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200">
                    <StatePill state="COMPLETED" size="sm" />
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                    {fmtNumber(totalEvents)}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 tabular-nums">
                    {fmtCurrency(totalSpend.value, totalSpend.currency)}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                    {fmtAbsolute(periodEnd)}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-400">
                    <span title="Coming soon" className="cursor-not-allowed">
                      Download invoice →
                    </span>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 border-t border-ink-200 text-center text-sm text-ink-500"
                  >
                    No historical periods yet. They appear here at the end of each month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
