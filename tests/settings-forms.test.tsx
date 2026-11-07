import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, waitFor, within } from "@testing-library/react";

import SettingsPage from "@/app/dashboard/settings/page";
import { freshQueryClient, signedIn, signedOut, withQuery, TEST_TENANT } from "./helpers";

const getConfig = vi.fn();
const patchConfig = vi.fn();
const getKyb = vi.fn();
const listTeam = vi.fn();
const getReferenceLists = vi.fn();
const getMe = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getConfig: (...a: unknown[]) => getConfig(...a),
    patchConfig: (...a: unknown[]) => patchConfig(...a),
    getKyb: (...a: unknown[]) => getKyb(...a),
    listTeam: (...a: unknown[]) => listTeam(...a),
    getReferenceLists: (...a: unknown[]) => getReferenceLists(...a),
    getMe: (...a: unknown[]) => getMe(...a),
  };
});

function tenant(name: string) {
  return { ...TEST_TENANT, name, mode: "sandbox" };
}

/** The General card, by its heading. Settings has several Save buttons. */
async function generalCard(): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name: "General" });
  return heading.closest("section") as HTMLElement;
}

function typeInto(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * The General card used to copy `tenant.name` into state from an effect keyed
 * on it. It is keyed by the parent now, so React resets it. These are the two
 * things that has to keep doing, in the right order: not clobber somebody who
 * is typing, and go back to the stored value once that value moves.
 */
describe("the Settings forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
    getConfig.mockResolvedValue(tenant("Seed Demo Delivery"));
    getMe.mockResolvedValue({ tenant: tenant("Seed Demo Delivery"), user: null });
    getKyb.mockResolvedValue({
      status: "APPROVED",
      editable: false,
      showPrompt: false,
      details: {},
      missingDetails: [],
      missingKinds: [],
      documents: [],
    });
    listTeam.mockResolvedValue([]);
    getReferenceLists.mockResolvedValue({ industries: [], countries: [] });
  });
  afterEach(() => signedOut());

  it("does not take the field away from somebody who is typing", async () => {
    const client = freshQueryClient();
    withQuery(<SettingsPage />, client);
    const field = within(await generalCard()).getByDisplayValue("Seed Demo Delivery");

    typeInto(field, "Seed Demo Delivery NG");
    expect(field).toHaveValue("Seed Demo Delivery NG");

    // A background refetch returning the same stored value. The effect this
    // replaced would have run and put "Seed Demo Delivery" back.
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["config"] });
    });
    expect(field).toHaveValue("Seed Demo Delivery NG");
  });

  it("goes back to the stored value when that value changes on the server", async () => {
    const client = freshQueryClient();
    withQuery(<SettingsPage />, client);
    const heading = await screen.findByRole("heading", { name: "General" });
    const field = within(heading.closest("section") as HTMLElement).getByDisplayValue(
      "Seed Demo Delivery",
    );

    typeInto(field, "a half typed name");

    getConfig.mockResolvedValue(tenant("Renamed In The Console"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["config"] });
    });

    await waitFor(() =>
      expect(
        within(
          (screen.getByRole("heading", { name: "General" }).closest("section")) as HTMLElement,
        ).queryByDisplayValue("Renamed In The Console"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("a half typed name")).not.toBeInTheDocument();
  });

  it("keeps Save changes inert until the name actually differs", async () => {
    withQuery(<SettingsPage />);
    const card = within(await generalCard());
    const field = card.getByDisplayValue("Seed Demo Delivery");
    expect(card.getByRole("button", { name: "Save changes" })).toBeDisabled();

    typeInto(field, "Seed Demo Delivery NG");
    expect(
      within(await generalCard()).getByRole("button", { name: "Save changes" }),
    ).toBeEnabled();
  });
});
