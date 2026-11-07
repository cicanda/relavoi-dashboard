import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import TopUpReturnPage from "@/app/dashboard/billing/topup/return/page";
import { signedIn, signedOut, withQuery } from "./helpers";

const verifyTopUp = vi.fn();
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => params,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, verifyTopUp: (...a: unknown[]) => verifyTopUp(...a) };
});

describe("the top-up return page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
  });
  afterEach(() => signedOut());

  it("says a link has no reference, and asks the processor nothing", async () => {
    // This used to mount as "checking" and be corrected by an effect, so a
    // link with no reference began by claiming we were confirming a payment
    // we had no reference for. It is read off the URL during render now.
    //
    // The removed frame itself is NOT what this asserts, and cannot be:
    // Testing Library's render runs inside act, which flushes effects before
    // it returns, so the intermediate paint is never observable from here.
    // The lint rule is what holds that line. What is asserted is the part
    // that is observable and still worth a guard: the message, and that a
    // link with no reference asks the payment processor nothing.
    params = new URLSearchParams();
    withQuery(<TopUpReturnPage />);

    expect(screen.getByText("This link is missing its payment reference.")).toBeInTheDocument();
    expect(
      screen.queryByText("Confirming with the payment processor…"),
    ).not.toBeInTheDocument();
    expect(verifyTopUp).not.toHaveBeenCalled();
  });

  it("confirms a reference it was given", async () => {
    params = new URLSearchParams({ reference: "ref_123" });
    verifyTopUp.mockResolvedValue({
      status: "credited",
      paid: { display: "NGN 10,000.00" },
      fee: { display: "NGN 150.00" },
      credited: { display: "NGN 9,850.00" },
      balance: { display: "NGN 9,850.00" },
    });
    withQuery(<TopUpReturnPage />);

    expect(await screen.findByText("Payment received")).toBeInTheDocument();
    await waitFor(() => expect(verifyTopUp).toHaveBeenCalledWith("ref_123"));
  });

  it("accepts trxref, which is the name the processor sends back", async () => {
    params = new URLSearchParams({ trxref: "ref_456" });
    verifyTopUp.mockResolvedValue({ status: "pending" });
    withQuery(<TopUpReturnPage />);
    await waitFor(() => expect(verifyTopUp).toHaveBeenCalledWith("ref_456"));
  });
});
