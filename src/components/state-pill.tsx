import type { SessionState } from "@/lib/types";

const MAP: Record<string, { bg: string; text: string; dot: string; label?: string }> = {
  ACTIVE:        { bg: "bg-signal-500/15", text: "text-signal-700", dot: "bg-signal-500" },
  PENDING:       { bg: "bg-amber-500/15", text: "text-amber-700",  dot: "bg-amber-500" },
  GRACE_PERIOD:  { bg: "bg-blue-500/15",  text: "text-blue-700",   dot: "bg-blue-500", label: "GRACE" },
  EXPIRED:       { bg: "bg-ink-200",      text: "text-ink-600",    dot: "bg-ink-400" },
  FAILED:        { bg: "bg-red-500/15",   text: "text-red-700",    dot: "bg-red-500" },
  DELIVERED:     { bg: "bg-signal-500/15", text: "text-signal-700", dot: "bg-signal-500" },
  SENT:          { bg: "bg-blue-500/15",  text: "text-blue-700",   dot: "bg-blue-500" },
  RINGING:       { bg: "bg-amber-500/15", text: "text-amber-700",  dot: "bg-amber-500" },
  ANSWERED:      { bg: "bg-signal-500/15", text: "text-signal-700", dot: "bg-signal-500" },
  COMPLETED:     { bg: "bg-ink-200",      text: "text-ink-700",    dot: "bg-ink-500" },
  MISSED:        { bg: "bg-amber-500/15", text: "text-amber-700",  dot: "bg-amber-500" },
};

export function StatePill({
  state,
  size = "md",
}: {
  state: SessionState | string;
  size?: "sm" | "md";
}) {
  const cfg = MAP[state] ?? { bg: "bg-ink-200", text: "text-ink-700", dot: "bg-ink-400" };
  const label = cfg.label ?? state;
  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${cfg.bg} ${cfg.text} ${padding} rounded-md font-mono uppercase tracking-wider font-medium`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${state === "ACTIVE" ? "animate-pulse-dot" : ""}`}
      />
      {label}
    </span>
  );
}
