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

  // Hydrate tenant/user from /tenants/me if missing on a hard reload.
  useQuery({
    queryKey: ["me"],
    enabled: !!token && hasHydrated && !tenant,
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
