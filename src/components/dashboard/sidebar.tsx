"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-store";
import { listSessions } from "@/lib/api";
import { BrandLogo, BrandMark } from "@/components/brand-mark";
import { useSidebar } from "@/lib/sidebar-store";
import { useEffect, useState } from "react";
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
  const { open, collapsed, closeSidebar } = useSidebar();
  const isDesktop = useIsDesktop();

  // Escape closes the mobile overlay. Also stop the page behind it scrolling
  // while it is covered, which otherwise feels broken on touch.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSidebar();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, closeSidebar]);

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
    <>
      {/* Backdrop — mobile only, and only while the overlay is open. */}
      {open && (
        <div
          onClick={closeSidebar}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden"
        />
      )}

      <aside
        data-open={open ? "true" : "false"}
        // Below lg the panel slides; from lg it is an in-flow column and must
        // carry no transform at all. Server-rendered as mobile-and-closed,
        // which is the safe initial state on any screen.
        style={isDesktop ? undefined : { transform: open ? "translateX(0)" : "translateX(-100%)" }}
        className={[
          // Below lg the sidebar is an overlay: out of flow, off-screen until
          // opened, so the main column gets the full viewport width. The slide
          // itself lives in globals.css under .sidebar-panel.
          "sidebar-panel",
          "fixed inset-y-0 left-0 z-50 w-[17rem] flex flex-col bg-paper border-r border-ink-200",
          // From lg it is a normal column again and no transform applies.
          "lg:static lg:z-auto lg:h-screen lg:flex-shrink-0",
          collapsed ? "lg:w-16" : "lg:w-60",
        ].join(" ")}
      >
      {/* Brand */}
      <div
        className={`py-4 border-b border-ink-200 flex items-center gap-3 ${
          collapsed ? "lg:justify-center lg:px-0 px-4" : "px-4"
        }`}
      >
        {/* Collapsed rail is 4rem wide — only the tile fits there. */}
        <div className={collapsed ? "hidden lg:block" : "hidden"}>
          <BrandMark size={36} />
        </div>
        <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
          <BrandLogo height={28} />
          <div className="mt-1 text-[11px] text-ink-500 truncate" title={tenant?.name ?? ""}>
            {tenant?.name ?? "—"}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV.map((group) => (
          <div key={group.label}>
            <div
              className={`px-2 pb-1 text-[11px] font-mono uppercase tracking-wider text-ink-500 ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
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
                    // Tapping a destination on mobile should leave the nav; on
                    // desktop `open` is unused so this is a no-op.
                    onClick={closeSidebar}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-2.5 rounded-md text-[13px] transition-colors min-h-[44px] lg:min-h-0 px-2 py-2.5 lg:py-1.5 ${
                      collapsed ? "lg:justify-center lg:px-0" : ""
                    } ${
                      active
                        ? "bg-bone-100 text-ink-900 font-medium"
                        : "text-ink-700 hover:bg-bone-100 hover:text-ink-900"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 ${active ? "text-ink-900" : "text-ink-500"}`}
                    />
                    <span className={`flex-1 ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    {showCount && (
                      <span
                        className={`text-[10px] font-mono font-medium text-ink-500 ${
                          collapsed ? "lg:hidden" : ""
                        }`}
                      >
                        {count}
                      </span>
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
        <div className={`flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
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
    </>
  );
}

/**
 * True at the lg breakpoint and above. Starts false so the server-rendered
 * markup is the mobile, closed state -- correct on a phone and harmlessly
 * corrected on the first client paint on a laptop.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isDesktop;
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
