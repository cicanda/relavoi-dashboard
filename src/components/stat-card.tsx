import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  trend?: { direction: "up" | "down" | "flat"; value: string };
  loading?: boolean;
}) {
  return (
    <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500">{label}</div>
          {loading ? (
            <div className="mt-2 h-8 w-24 rounded animate-shimmer" />
          ) : (
            <div className="mt-1.5 text-2xl font-semibold text-ink-900 tabular-nums">{value}</div>
          )}
          {hint && !loading && <div className="text-xs text-ink-500 mt-0.5">{hint}</div>}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-md bg-bone-100 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-ink-600" />
          </div>
        )}
      </div>
      {trend && !loading && (
        <div
          className={`mt-3 text-[11px] font-mono uppercase ${
            trend.direction === "up"
              ? "text-signal-700"
              : trend.direction === "down"
                ? "text-red-700"
                : "text-ink-500"
          }`}
        >
          {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "•"} {trend.value}
        </div>
      )}
    </div>
  );
}
