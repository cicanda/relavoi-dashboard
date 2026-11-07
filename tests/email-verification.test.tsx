import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, waitFor } from "@testing-library/react";

import {
  EmailVerificationBanner,
  VerifyEmailCard,
} from "@/components/dashboard/email-verification";
import { resetVerifyEmailUi } from "@/lib/verify-email-ui";
import { freshQueryClient, signedIn, signedOut, withQuery, TEST_TENANT } from "./helpers";

const getMe = vi.fn();
const sendVerificationEmail = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getMe: (...args: unknown[]) => getMe(...args),
    sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args),
  };
});

function me(emailVerifiedAt: string | null) {
  return {
    tenant: TEST_TENANT,
    user: {
      id: "u1",
      email: "owner@example.test",
      name: "Adaeze Okafor",
      role: "OWNER",
      tenantId: TEST_TENANT.id,
      emailVerifiedAt,
    },
  };
}

describe("the unverified email nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVerifyEmailUi();
    signedIn();
    sendVerificationEmail.mockResolvedValue({ alreadyVerified: false });
  });
  afterEach(() => {
    signedOut();
    resetVerifyEmailUi();
  });

  it("shows the banner for an address that is not verified", async () => {
    getMe.mockResolvedValue(me(null));
    withQuery(<EmailVerificationBanner />);
    expect(await screen.findByText(/Confirm your email address/)).toBeInTheDocument();
    // The reason has to be on screen, not only the instruction.
    expect(screen.getByText(/balance is running low/)).toBeInTheDocument();
  });

  it("shows nothing once the address is verified", async () => {
    getMe.mockResolvedValue(me("2026-11-07T09:30:00.000Z"));
    withQuery(<EmailVerificationBanner />);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByText(/Confirm your email address/)).not.toBeInTheDocument();
    // Not the collapsed line either: verified means gone, not quiet.
    expect(screen.queryByText("Email address not confirmed")).not.toBeInTheDocument();
  });

  it("shows nothing for a token that carries no dashboard user", async () => {
    // An API key's token. `user` is absent, which is not the same fact as an
    // unverified address, and an integration must never be told to go and
    // confirm an address it does not have.
    getMe.mockResolvedValue({ tenant: TEST_TENANT });
    withQuery(<EmailVerificationBanner />);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByText(/Confirm your email address/)).not.toBeInTheDocument();
    expect(screen.queryByText("Email address not confirmed")).not.toBeInTheDocument();
  });

  it("collapses to a line and opens again, without ever disappearing", async () => {
    getMe.mockResolvedValue(me(null));
    withQuery(<EmailVerificationBanner />);
    const collapse = await screen.findByLabelText("Collapse this notice for now");

    act(() => collapse.click());
    expect(screen.getByText("Email address not confirmed")).toBeInTheDocument();
    expect(screen.queryByText(/balance is running low/)).not.toBeInTheDocument();

    act(() => screen.getByRole("button", { name: /Show/ }).click());
    expect(screen.getByText(/balance is running low/)).toBeInTheDocument();
  });

  it("holds the resend button for a minute after a link goes out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getMe.mockResolvedValue(me(null));
    withQuery(<EmailVerificationBanner />);

    const button = await screen.findByRole("button", { name: "Send me a link" });
    await act(async () => {
      button.click();
    });

    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/A link is on its way to owner@example.test/)).toBeInTheDocument();

    const held = screen.getByRole("button", { name: /Send again in/ });
    expect(held).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("button", { name: /Send again in/ })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send another link" })).toBeEnabled(),
    );
  });

  it("starts no cooldown when the server says the address was already verified", async () => {
    // 204, not 202. No mail was sent, so disabling the button for a minute
    // would be holding it for nothing.
    getMe.mockResolvedValue(me(null));
    sendVerificationEmail.mockResolvedValue({ alreadyVerified: true });
    withQuery(<EmailVerificationBanner />);

    const button = await screen.findByRole("button", { name: "Send me a link" });
    await act(async () => {
      button.click();
    });
    await waitFor(() =>
      expect(screen.getByText("That address is already confirmed.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /Send again in/ })).not.toBeInTheDocument();
  });

  it("holds the button after a 429 too, so pressing it repeats nothing", async () => {
    getMe.mockResolvedValue(me(null));
    sendVerificationEmail.mockRejectedValue({
      response: { status: 429, data: { status: 429, title: "Too Many Requests" } },
    });
    withQuery(<EmailVerificationBanner />);

    const button = await screen.findByRole("button", { name: "Send me a link" });
    await act(async () => {
      button.click();
    });
    await waitFor(() =>
      expect(screen.getByText(/Too many links asked for in the last hour/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Send again in/ })).toBeDisabled();
  });
});

describe("the Verify your email card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVerifyEmailUi();
    signedIn();
    sendVerificationEmail.mockResolvedValue({ alreadyVerified: false });
  });
  afterEach(() => {
    signedOut();
    resetVerifyEmailUi();
  });

  it("reports an unverified address and offers a link", async () => {
    getMe.mockResolvedValue(me(null));
    withQuery(<VerifyEmailCard />);
    expect(await screen.findByText("Not verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send me a link" })).toBeEnabled();
  });

  it("is not rendered at all for an address that is already verified", async () => {
    getMe.mockResolvedValue(me("2026-11-05T08:00:00.000Z"));
    withQuery(<VerifyEmailCard />);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByText("Verify your email")).not.toBeInTheDocument();
    expect(screen.queryByText(/Verified on/)).not.toBeInTheDocument();
  });

  it("stays, saying when, if the address was verified after a link was asked for here", async () => {
    // The sequence a person actually sees: ask for a link, open it in the
    // mail client, come back. Hiding the card at that point leaves no sign
    // that anything happened.
    getMe.mockResolvedValue(me(null));
    const client = freshQueryClient();
    withQuery(<VerifyEmailCard />, client);
    const button = await screen.findByRole("button", { name: "Send me a link" });
    await act(async () => {
      button.click();
    });
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalled());

    // What the link in the mail does: the address is verified elsewhere, and
    // this tab learns about it on its next read of /tenants/me.
    getMe.mockResolvedValue(me("2026-11-07T09:30:00.000Z"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["me"] });
    });
    expect(await screen.findByText("Verified on 7 November 2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send/ })).not.toBeInTheDocument();
  });

  it("shares the cooldown with the banner", async () => {
    getMe.mockResolvedValue(me(null));
    withQuery(
      <>
        <EmailVerificationBanner />
        <VerifyEmailCard />
      </>,
    );
    const buttons = await screen.findAllByRole("button", { name: "Send me a link" });
    expect(buttons).toHaveLength(2);

    await act(async () => {
      buttons[0].click();
    });
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledTimes(1));

    // Both, not one: the per-hour allowance is spent by a person being told
    // twice that they may try again.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Send again in/ })).toHaveLength(2),
    );
  });
});
