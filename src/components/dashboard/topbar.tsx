"use client";

import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-store";
import { useSidebar } from "@/lib/sidebar-store";

export function Topbar() {
  const { user } = useAuth();
  const { open, collapsed, openSidebar, toggleCollapsed } = useSidebar();
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K to focus the global search input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-bone-100/85 backdrop-blur-md border-b border-ink-200 px-[var(--space-gutter)] flex items-center gap-2 sm:gap-4 flex-shrink-0">
      {/* Two buttons rather than one that branches on viewport width: the
          breakpoint is a CSS concern, and reading window.innerWidth during
          render is not SSR-safe. Same slot, so it reads as one control. */}
      <button
        type="button"
        onClick={openSidebar}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="dashboard-nav"
        className="lg:hidden -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-ink-900/5 rounded-full transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        aria-controls="dashboard-nav"
        className="hidden lg:flex -ml-2 w-9 h-9 items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 rounded-full transition-colors"
      >
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      <div className="relative flex-1 min-w-0 max-w-md">
        <Search className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search session ID, proxy number, order ID…"
          aria-label="Search"
          className="field h-10 pl-10 pr-14 bg-paper/70 text-[14px] text-ink-700 placeholder:text-ink-400 focus:bg-paper"
        />
        <kbd className="hidden md:inline-flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 bg-bone-100 border border-ink-200 rounded-md text-[11px] font-mono text-ink-500 select-none pointer-events-none">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
        <ModeBadge />

        <button
          className="hidden sm:inline-flex w-10 h-10 items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 rounded-full transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        <div className="hidden sm:block h-6 w-px bg-ink-200" />
        <div className="text-[13px] text-ink-600 hidden sm:block truncate max-w-[16rem]">{user?.email ?? ""}</div>
      </div>
    </header>
  );
}

/**
 * Which mode the workspace is in. Sandbox is the default for every new
 * workspace, so this is the common case rather than an error state: amber, not
 * red, and worded as a state rather than a warning.
 */
function ModeBadge() {
  const { tenant } = useAuth();
  const live = tenant?.mode === "live";
  return (
    <span
      title={
        live
          ? "Live mode. API calls route through the carrier and are billed."
          : "Sandbox mode. API calls are free and no real calls are placed."
      }
      className={`chip ${
        live ? "bg-signal-500/15 text-signal-700" : "bg-brand-amber/15 text-amber-700"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          live ? "bg-signal-500 animate-pulse-dot" : "bg-amber-500"
        }`}
      />
      {live ? "Live" : "Sandbox"}
    </span>
  );
}
