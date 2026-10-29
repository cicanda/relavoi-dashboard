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
    <div className="card lift p-5 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-ink-600">{label}</div>
          {loading ? (
            <div className="mt-3 h-9 w-24 rounded-lg animate-shimmer" />
          ) : (
            <div className="mt-2 text-[clamp(1.75rem,1.5rem+0.8vw,2.25rem)] leading-none font-normal tracking-[-0.04em] text-ink-900 tabular-nums">{value}</div>
          )}
          {hint && !loading && <div className="text-[13px] text-ink-500 mt-2">{hint}</div>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-full bg-bone-100 ring-1 ring-ink-900/5 flex items-center justify-center flex-shrink-0">
            <Icon className="w-[18px] h-[18px] text-brand-teal" />
          </div>
        )}
      </div>
      {trend && !loading && (
        <div
          className={`mt-auto pt-3 text-[12px] font-medium ${
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
