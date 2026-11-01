"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-store";
import { getMe } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, user, tenant, hasHydrated, setSession, setTenant } = useAuth();

  // Wait for zustand persist rehydration before deciding.
  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) router.replace("/login");
  }, [hasHydrated, token, router]);

  // Refresh tenant/user from /tenants/me on every load, not only when they are
  // missing.
  //
  // This used to be `&& !tenant`, so once the store held a tenant it was never
  // asked again. The tenant is persisted in localStorage, so a rename made
  // anywhere else, including in the operator console, left every surface that
  // reads the store showing the old name until the user signed out. The only
  // screen that corrected itself was Settings, because it fetches /config and
  // writes the result back, which is exactly the shape of two sources
  // disagreeing: one cached at login, one fetched now.
  //
  // staleTime keeps this to one request a minute, and the store stays as the
  // synchronous read for render. The server is the source of truth.
  useQuery({
    queryKey: ["me"],
    enabled: !!token && hasHydrated,
    queryFn: async () => {
      const data = await getMe();
      if (data.user) {
        setSession({ token: token!, user: data.user, tenant: data.tenant });
      } else if (data.tenant) {
        setTenant(data.tenant);
      }
      return data;
    },
    staleTime: 60_000,
  });

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">
        Loading…
      </div>
    );
  }

  if (!token || !user) {
    // Will redirect via the effect above; render nothing in the meantime.
    return null;
  }

  return <>{children}</>;
}
