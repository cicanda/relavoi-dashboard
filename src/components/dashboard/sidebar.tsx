"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-store";
import { listSessions } from "@/lib/api";
import { BrandMark } from "@/components/brand-mark";
import {
  LayoutDashboard,
  Activity,
  PhoneCall,
  Hash,
  BarChart3,
  Receipt,
  KeyRound,
  Webhook,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional counter slot — looked up from a query in the sidebar component. */
  badge?: "active-sessions";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Sessions", href: "/dashboard/sessions", icon: Activity, badge: "active-sessions" },
      { label: "Call History", href: "/dashboard/calls", icon: PhoneCall },
      { label: "Numbers", href: "/dashboard/numbers", icon: Hash },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { label: "Billing", href: "/dashboard/billing", icon: Receipt },
    ],
  },
  {
    label: "Develop",
    items: [
      { label: "API & Keys", href: "/dashboard/api-keys", icon: KeyRound },
      { label: "Webhooks", href: "/dashboard/webhooks", icon: Webhook },
      { label: "SDK & Docs", href: "/dashboard/sdk-docs", icon: BookOpen },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", href: "/dashboard/settings", icon: Settings }],
  },
];

export function Sidebar() {
  const path = usePathname();
  const { tenant, user, clearSession } = useAuth();

  // Active-session count drives the Sessions nav badge — refreshes once a minute.
  const activeSessions = useQuery({
    queryKey: ["sidebar", "active-sessions"],
    queryFn: () => listSessions({ state: "ACTIVE", limit: 100 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const activeCount = activeSessions.data?.pagination.count ?? activeSessions.data?.data.length ?? null;

  function badgeFor(key: NavItem["badge"]): number | null {
    if (key === "active-sessions") return activeCount;
    return null;
  }

  function isActive(href: string): boolean {
    if (href === "/dashboard") return path === "/dashboard";
    return path.startsWith(href);
  }

  function onLogout() {
    clearSession();
    try {
      window.localStorage.removeItem("relavoi.auth.v1");
    } catch {}
    window.location.assign("/login");
  }

  return (
    <aside className="w-60 bg-paper border-r border-ink-200 flex flex-col h-screen flex-shrink-0">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-ink-200 flex items-center gap-3">
        <BrandMark size={36} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-900 leading-tight">Relavoi</div>
          <div className="text-[11px] text-ink-500 truncate" title={tenant?.name ?? ""}>
            {tenant?.name ?? "—"}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1 text-[11px] font-mono uppercase tracking-wider text-ink-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                const count = item.badge ? badgeFor(item.badge) : null;
                const showCount = count != null && count > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                      active
                        ? "bg-bone-100 text-ink-900 font-medium"
                        : "text-ink-700 hover:bg-bone-100 hover:text-ink-900"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? "text-ink-900" : "text-ink-500"}`} />
                    <span className="flex-1">{item.label}</span>
                    {showCount && (
                      <span className="text-[10px] font-mono font-medium text-ink-500">{count}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-ink-200 px-3 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-ink-700 text-paper flex items-center justify-center text-xs font-medium">
          {initials(user?.name ?? user?.email ?? "?")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink-900 truncate font-medium">{user?.name ?? user?.email ?? "—"}</div>
          <div className="text-[11px] font-mono uppercase text-ink-500">{user?.role ?? ""}</div>
        </div>
        <button
          onClick={onLogout}
          className="p-1.5 text-ink-500 hover:text-ink-900 hover:bg-bone-100 rounded-md transition-colors"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

function initials(s: string): string {
  return s
    .split(/[\s@]/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
