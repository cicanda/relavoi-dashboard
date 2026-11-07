import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, waitFor } from "@testing-library/react";

import SessionsListPage from "@/app/dashboard/sessions/page";
import { signedIn, signedOut, withQuery } from "./helpers";

const listSessions = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, listSessions: (...args: unknown[]) => listSessions(...args) };
});

function session(id: string, state = "ACTIVE") {
  return {
    id,
    tenantId: "t1",
    proxyNumber: "+234 900 000 0100",
    state,
    directionMode: "BIDIRECTIONAL",
    metadata: {},
    callCount: 0,
    createdAt: "2026-11-07T09:00:00.000Z",
    expiresAt: "2026-11-07T11:00:00.000Z",
  };
}

const page = (rows: ReturnType<typeof session>[], after: string | null) => ({
  data: rows,
  pagination: { after, count: rows.length },
});

/**
 * The sessions list used to hold its fetched pages in component state and
 * append to them from an effect, with a second effect emptying both when the
 * filter changed. These are the two things that behaviour got wrong, and the
 * two things useInfiniteQuery has to keep right.
 */
describe("the sessions list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
  });
  afterEach(() => signedOut());

  it("appends the next page rather than replacing the first", async () => {
    listSessions
      .mockResolvedValueOnce(page([session("aaaaaaaa-0001")], "cursor-1"))
      .mockResolvedValueOnce(page([session("bbbbbbbb-0002")], null));

    withQuery(<SessionsListPage />);
    // All, not one: the list renders a card layout for phones and a table for
    // wider screens, so every row is in the document twice.
    expect(await screen.findAllByText(/aaaaaaaa/)).not.toHaveLength(0);

    const more = await screen.findByRole("button", { name: "Load more" });
    await act(async () => {
      more.click();
    });

    await waitFor(() => expect(screen.getAllByText(/bbbbbbbb/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/aaaaaaaa/).length).toBeGreaterThan(0);
    // The cursor is passed on, not dropped.
    expect(listSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: "cursor-1" }),
    );
  });

  it("stops offering Load more once the API says there is no cursor", async () => {
    listSessions.mockResolvedValue(page([session("aaaaaaaa-0001")], null));
    withQuery(<SessionsListPage />);
    await screen.findAllByText(/aaaaaaaa/);
    // `after: null` on the last page used to be handed straight back as a
    // page param, which fetches page one again for ever.
    expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
  });

  it("never shows the previous filter's rows under the new filter", async () => {
    listSessions.mockImplementation(({ status }: { status?: string }) =>
      Promise.resolve(
        status === "ended"
          ? page([session("eeeeeeee-0009", "EXPIRED")], null)
          : page([session("aaaaaaaa-0001", "ACTIVE")], null),
      ),
    );

    withQuery(<SessionsListPage />);
    await screen.findAllByText(/aaaaaaaa/);

    const select = screen.getByRole("combobox");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )!.set!;
      setter.call(select, "group:ended");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Not "eventually gone": gone from the first render under the new filter.
    // The old shape could paint the previous rows for a frame, because React
    // may commit the filter change before the reset effect runs.
    expect(screen.queryAllByText(/aaaaaaaa/)).toHaveLength(0);
    await waitFor(() => expect(screen.getAllByText(/eeeeeeee/).length).toBeGreaterThan(0));
  });

  it("brings a filter's own rows straight back when you return to it", async () => {
    listSessions.mockImplementation(({ status }: { status?: string }) =>
      Promise.resolve(
        status === "ended"
          ? page([session("eeeeeeee-0009", "EXPIRED")], null)
          : page([session("aaaaaaaa-0001", "ACTIVE")], null),
      ),
    );
    withQuery(<SessionsListPage />);
    await screen.findAllByText(/aaaaaaaa/);

    const select = screen.getByRole("combobox");
    const setValue = (value: string) =>
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value",
        )!.set!;
        setter.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

    await setValue("group:ended");
    await waitFor(() => expect(screen.getAllByText(/eeeeeeee/).length).toBeGreaterThan(0));

    await setValue("group:all");
    // Synchronously, from the cache under that filter's own key. The old
    // shape threw the rows away and fetched page one again.
    expect(screen.getAllByText(/aaaaaaaa/).length).toBeGreaterThan(0);
  });
});
