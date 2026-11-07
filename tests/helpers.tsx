import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";

import { ToastProvider } from "@/components/toast";
import { useAuth } from "@/lib/auth-store";
import type { Role, Tenant, TenantUser } from "@/lib/types";

/**
 * A query client per test, with retries off. Retries turn a deliberate
 * failure into a five second test; a client per test is what keeps the order
 * of a file from mattering.
 *
 * gcTime is left at the library default on purpose. Setting it to 0 drops an
 * inactive query the moment a filter changes, which is not what the browser
 * does and would make the test that returning to a filter shows its rows at
 * once fail against code that is correct.
 */
export function freshQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function withQuery(ui: ReactElement, client = freshQueryClient()): RenderResult {
  // The real ToastProvider, not a stub: several of these screens report
  // failures through it, and a stub would let a broken call look silent.
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

export const TEST_TENANT: Tenant = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  name: "Seed Demo Delivery",
  tier: "GROWTH",
} as Tenant;

export function signedIn(overrides: Partial<TenantUser> = {}): TenantUser {
  const user: TenantUser = {
    id: "69d2b581-e5ac-4d7b-aa21-786859f33b65",
    email: "owner@example.test",
    name: "Adaeze Okafor",
    role: "OWNER" as Role,
    tenantId: TEST_TENANT.id,
    ...overrides,
  };
  useAuth.setState({ token: "test-token", user, tenant: TEST_TENANT, hasHydrated: true });
  return user;
}

export function signedOut(): void {
  useAuth.setState({ token: null, user: null, tenant: null, hasHydrated: true });
}

/**
 * A promise React's `use()` will read without suspending.
 *
 * A Client Component may not be handed a plain promise: React calls that an
 * uncached promise, suspends and never retries, so the tree sits on its
 * fallback for ever and every assertion fails for a reason that has nothing
 * to do with the test. In the app it is Next that caches `params`; here it is
 * this. React fast-paths a thenable already marked fulfilled, which is the
 * shape it gives its own cached ones.
 */
export function settled<T>(value: T): Promise<T> {
  const thenable = Promise.resolve(value) as Promise<T> & {
    status?: string;
    value?: T;
  };
  thenable.status = "fulfilled";
  thenable.value = value;
  return thenable;
}
