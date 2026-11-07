import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, waitFor } from "@testing-library/react";

import SessionDetailPage from "@/app/dashboard/sessions/[id]/page";
import { settled, signedIn, signedOut, withQuery } from "./helpers";

const getSession = vi.fn();
const listSessionCalls = vi.fn();
const listSessionSms = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getSession: (...a: unknown[]) => getSession(...a),
    listSessionCalls: (...a: unknown[]) => listSessionCalls(...a),
    listSessionSms: (...a: unknown[]) => listSessionSms(...a),
  };
});

const NOW = new Date("2026-11-07T10:00:00.000Z");

/**
 * The route component reads `params` with React's `use()`, so it suspends
 * until that promise settles. Next supplies the boundary in the app; a test
 * rendering the component on its own has to supply its own, or the render is
 * an empty div and every query fails for the wrong reason.
 */
async function renderDetail() {
  const result = withQuery(
    <Suspense fallback={<div>loading</div>}>
      <SessionDetailPage params={settled({ id: "s1" })} />
    </Suspense>,
  );
  // Let the params promise settle inside act. waitFor alone leaves the tree
  // suspended here, because resolving it is a React update and not a timer.
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

function activeSession(expiresAt: string) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    tenantId: "t1",
    proxyNumber: "+234 900 000 0100",
    state: "ACTIVE",
    directionMode: "BIDIRECTIONAL",
    metadata: {},
    callCount: 0,
    createdAt: "2026-11-07T09:00:00.000Z",
    expiresAt,
  };
}

/**
 * The End session and Change customer buttons are gated on whether the session is still
 * live, which used to be decided by calling Date.now() in the render body.
 * Two renders of the same session could disagree, and nothing re-rendered
 * when the expiry passed, so the buttons sat there offering an action the
 * call router would refuse.
 */
describe("the session detail screen and the clock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    signedIn();
    listSessionCalls.mockResolvedValue({ data: [], pagination: { after: null, count: 0 } });
    listSessionSms.mockResolvedValue({ data: [], pagination: { after: null, count: 0 } });
  });
  afterEach(() => {
    vi.useRealTimers();
    signedOut();
  });

  it("withdraws End session and Change customer the moment the expiry passes", async () => {
    getSession.mockResolvedValue(activeSession("2026-11-07T10:00:30.000Z"));
    await renderDetail();

    expect(await screen.findByRole("button", { name: /End session/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change customer/i })).toBeInTheDocument();

    // Nothing else changes: no refetch, no prop moves. Only the clock.
    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /End session/i })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /Change customer/i })).not.toBeInTheDocument();
  });

  it("offers neither for a session that was already past its expiry on arrival", async () => {
    getSession.mockResolvedValue(activeSession("2026-11-07T09:30:00.000Z"));
    await renderDetail();

    await screen.findByText(/11111111/);
    expect(screen.queryByRole("button", { name: /End session/i })).not.toBeInTheDocument();
  });

  it("keeps them for a session whose expiry is still ahead", async () => {
    getSession.mockResolvedValue(activeSession("2026-11-07T12:00:00.000Z"));
    await renderDetail();

    expect(await screen.findByRole("button", { name: /End session/i })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("button", { name: /End session/i })).toBeInTheDocument();
  });
});
