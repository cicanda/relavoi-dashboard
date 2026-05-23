import { formatDistanceToNow, format } from "date-fns";

export function truncId(id?: string | null, n = 8): string {
  if (!id) return "—";
  return id.length <= n + 2 ? id : `${id.slice(0, n)}…`;
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function fmtAbsolute(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy HH:mm");
  } catch {
    return iso;
  }
}

export function fmtDuration(seconds?: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function fmtNumber(n?: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtCurrency(value?: number | null, currency = "NGN"): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function fmtPhone(phone?: string | null): string {
  return phone ?? "—";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
