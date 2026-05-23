"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Tenant, TenantUser } from "./types";

interface AuthState {
  token: string | null;
  user: TenantUser | null;
  tenant: Tenant | null;
  setSession: (args: { token: string; user: TenantUser; tenant?: Tenant }) => void;
  setTenant: (tenant: Tenant) => void;
  clearSession: () => void;
  hasHydrated: boolean;
  setHasHydrated: (b: boolean) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      tenant: null,
      hasHydrated: false,
      setHasHydrated: (b) => set({ hasHydrated: b }),
      setSession: ({ token, user, tenant }) =>
        set({ token, user, tenant: tenant ?? null }),
      setTenant: (tenant) => set({ tenant }),
      clearSession: () => set({ token: null, user: null, tenant: null }),
    }),
    {
      name: "relavoi.auth.v1",
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? // SSR no-op storage (zustand's default would throw)
            { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
          : window.localStorage,
      ),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

// Side-channel for the axios interceptor that doesn't have access to the store.
const TOKEN_KEY = "relavoi.auth.v1";

export function readPersistedToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}
