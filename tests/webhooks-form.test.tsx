import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, waitFor } from "@testing-library/react";

import WebhooksPage from "@/app/dashboard/webhooks/page";
import { freshQueryClient, signedIn, signedOut, withQuery } from "./helpers";

const getWebhookConfig = vi.fn();
const listWebhookLogs = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getWebhookConfig: (...a: unknown[]) => getWebhookConfig(...a),
    listWebhookLogs: (...a: unknown[]) => listWebhookLogs(...a),
  };
});

/**
 * The endpoint form used to mount empty and fill itself in from two effects,
 * each behind a "have I done this yet" boolean. It is seeded from props at
 * mount now. The booleans were load bearing, so what they guarded is what is
 * tested: a refetch must not pull the field out from under somebody typing.
 */
describe("the webhooks endpoint form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
    listWebhookLogs.mockResolvedValue({ data: [], pagination: { after: null, count: 0 } });
  });
  afterEach(() => signedOut());

  it("waits for the config rather than painting an empty URL first", async () => {
    let resolve!: (v: unknown) => void;
    getWebhookConfig.mockReturnValue(new Promise((r) => (resolve = r)));

    withQuery(<WebhooksPage />);
    expect(screen.getByText("Loading webhook settings…")).toBeInTheDocument();
    // The blank field for a configured endpoint is the frame this removes.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await act(async () => {
      resolve({ url: "https://hooks.example.test/relavoi", events: ["call.ended"] });
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("https://hooks.example.test/relavoi")).toBeInTheDocument(),
    );
  });

  it("ticks exactly the saved events", async () => {
    getWebhookConfig.mockResolvedValue({
      url: "https://hooks.example.test/relavoi",
      events: ["call.ended"],
    });
    withQuery(<WebhooksPage />);
    await screen.findByDisplayValue("https://hooks.example.test/relavoi");

    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.filter((b) => b.checked)).toHaveLength(1);
    expect(screen.getByText(/1 of \d+ events will be delivered/)).toBeInTheDocument();
  });

  it("reads no saved events as every event, not as none", async () => {
    // An endpoint registered before the per-event control existed has an
    // empty set stored, and the API treats that as everything. Rendering it
    // as nothing ticked would show a working endpoint as subscribed to
    // nothing, and saving from that screen would make it true.
    getWebhookConfig.mockResolvedValue({ url: "https://hooks.example.test/x", events: [] });
    withQuery(<WebhooksPage />);
    await screen.findByDisplayValue("https://hooks.example.test/x");

    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it("does not overwrite a half typed URL when the config is refetched", async () => {
    getWebhookConfig.mockResolvedValue({
      url: "https://hooks.example.test/relavoi",
      events: ["call.ended"],
    });
    const client = freshQueryClient();
    withQuery(<WebhooksPage />, client);
    const field = await screen.findByDisplayValue("https://hooks.example.test/relavoi");

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(field, "https://hooks.example.test/new-path");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      await client.invalidateQueries({ queryKey: ["webhook-config"] });
    });
    expect(field).toHaveValue("https://hooks.example.test/new-path");
  });

  it("starts empty when the config cannot be read", async () => {
    getWebhookConfig.mockRejectedValue(new Error("nope"));
    withQuery(<WebhooksPage />);
    await waitFor(() =>
      expect(screen.queryByText("Loading webhook settings…")).not.toBeInTheDocument(),
    );
    const field = screen.getByPlaceholderText("https://api.example.com/relavoi/webhooks");
    expect(field).toHaveValue("");
  });
});
