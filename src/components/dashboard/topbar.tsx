"use client";

import { Bell, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-store";

export function Topbar() {
  const { user } = useAuth();
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
    <header className="h-[52px] bg-paper border-b border-ink-200 px-4 flex items-center gap-4 flex-shrink-0">
      <div className="relative flex-1 max-w-md">
        <Search className="w-3.5 h-3.5 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search session ID, proxy number, order ID…"
          className="w-full h-9 pl-8 pr-12 bg-bone-100 border border-ink-200 rounded-md font-mono text-[12px] text-ink-700 placeholder:text-ink-400 focus:outline-none focus:border-signal-500 focus:bg-paper transition-colors"
        />
        <kbd className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 bg-paper border border-ink-200 rounded text-[10px] font-mono text-ink-500 select-none">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-signal-500/15 text-signal-700 rounded-md font-mono text-[11px] uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-500 animate-pulse-dot" />
          Live mode
        </span>

        <button
          className="p-2 text-ink-500 hover:text-ink-900 hover:bg-bone-100 rounded-md transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        <div className="h-6 w-px bg-ink-200" />
        <div className="text-xs text-ink-500 hidden sm:block">{user?.email ?? ""}</div>
      </div>
    </header>
  );
}
