"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, FileText, Info, Printer, ShieldCheck } from "lucide-react";

import {
  getInvoices,
  getTopUpQuote,
  getWalletLedger,
  getWalletOverview,
  openInvoiceForPrint,
  setLowBalanceThreshold,
  startTopUp,
  problemMessage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { fmtAbsolute, fmtNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import type { InvoiceListItem, LedgerEntryDto, Money, WalletOverview } from "@/lib/types";

/**
 * Billing.
 *
 * Everything with a naira sign on this page arrives already worked out. The
 * server sends each figure as both an exact kobo amount and the string to
 * print, and this file prints the string. There is no multiplication, no
 * percentage and no total computed here, deliberately: the ledger is the
 * record of what was charged, and a page that recomputes it will eventually
 * disagree with it by a kobo and make a customer doubt both.
 *
 * Two roles can spend: OWNER and ADMIN. A developer or a viewer sees the same
 * figures and no way to start a payment. The check here is so the buttons are
 * not offered, not so the rule holds; the rule holds because the endpoint
 * refuses.
 */

const CUSTOM = "custom";

function moneyText(m: Money | null | undefined): string {
  return m?.display ?? "None";
}

/** Which banner, and what it says. The state is the server's decision. */
function banner(data: WalletOverview | undefined): {
  tone: "warn" | "stop" | "info";
  icon: typeof AlertTriangle;
  title: string;
  body: string;
} | null {
  if (!data) return null;
  const s = data.status;
  if (s.state === "blocked") {
    return {
      tone: "stop",
      icon: AlertTriangle,
      title: "Live calls are paused",
      body: "This period's included minutes are used up and the wallet has no credit left to cover minutes beyond them. Callers hear a short neutral message that says nothing about billing. Sandbox keys keep working.",
    };
  }
  if (s.state === "grace") {
    const days = s.graceDaysLeft ?? 0;
    return {
      tone: "warn",
      icon: Clock,
      title:
        days <= 1
          ? "Live calls stop tomorrow unless the balance is cleared"
          : `Live calls stop in ${days} days unless the balance is cleared`,
      body: "This month's subscription could not be covered by the wallet. Calls keep running on the included minutes the subscription bought. Minutes beyond the allowance are not available while the balance is negative.",
    };
  }
  if (s.state === "bypass") {
    return {
      tone: "info",
      icon: ShieldCheck,
      title: "Billing enforcement is suspended on this workspace",
      body: "An operator has lifted the block temporarily. It expires on its own.",
    };
  }
  if (s.state === "low") {
    return {
      tone: "warn",
      icon: Info,
      title: "Wallet balance is low",
      body: "Calls keep connecting while the included minutes last. Top up before they run out.",
    };
  }
  return null;
}

const TONES = {
  stop: "bg-red-500/10 text-red-800 ring-red-500/20",
  warn: "bg-amber-500/12 text-amber-900 ring-amber-500/25",
  info: "bg-sky-500/10 text-sky-900 ring-sky-500/20",
} as const;

export default function BillingPage() {
  const { user } = useAuth();
  const canSpend = user?.role === "OWNER" || user?.role === "ADMIN";
  const toast = useToast();
  const qc = useQueryClient();

  const walletQ = useQuery({
    queryKey: ["billing", "wallet"],
    queryFn: getWalletOverview,
    staleTime: 15_000,
  });

  const ledgerQ = useQuery({
    queryKey: ["billing", "ledger"],
    queryFn: () => getWalletLedger(25),
    staleTime: 15_000,
  });

  const invoicesQ = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => getInvoices(24),
    staleTime: 60_000,
  });

  const data = walletQ.data;
  const note = banner(data);

  return (
    <div>
      <PageHeader title="Billing" description="Plan, wallet and invoices for this workspace" />

      {walletQ.isLoading ? (
        <Skeleton className="h-24 w-full mb-4" />
      ) : walletQ.error ? (
        <div className="card p-5 mb-4 text-sm text-red-700">
          Couldn&apos;t load billing. {problemMessage(walletQ.error, "Try again in a moment.")}
        </div>
      ) : data ? (
        <>
          {note ? (
            <div className={`rounded-card ring-1 ring-inset p-4 mb-4 flex gap-3 ${TONES[note.tone]}`}>
              <note.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[14px] font-medium">{note.title}</div>
                <p className="text-[13px] mt-1 opacity-90">{note.body}</p>
                {canSpend && data.topUp.available && note.tone !== "info" ? (
                  <a href="#top-up" className="btn btn-primary btn-sm mt-3">
                    Top up
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <Summary data={data} />
          <TopUp data={data} canSpend={canSpend} />
        </>
      ) : null}

      <Ledger
        entries={ledgerQ.data?.entries ?? []}
        loading={ledgerQ.isLoading}
        error={ledgerQ.error ? problemMessage(ledgerQ.error, "Couldn't load the wallet activity.") : null}
      />

      <Invoices
        invoices={invoicesQ.data ?? []}
        loading={invoicesQ.isLoading}
        onPrintFailed={(msg) => toast.error("Couldn't open the invoice", msg)}
      />

      {data ? (
        <LowBalance
          current={data.wallet.lowBalanceThreshold}
          canEdit={canSpend}
          onSaved={() => void qc.invalidateQueries({ queryKey: ["billing", "wallet"] })}
        />
      ) : null}
    </div>
  );
}

// ─── Plan, allowance and balance ──────────────────────────────────────────────

function Summary({ data }: { data: WalletOverview }) {
  const minutes = data.includedMinutes;
  const meterColor =
    minutes.percentUsed >= 100
      ? "bg-red-500"
      : minutes.percentUsed >= 80
        ? "bg-amber-500"
        : "bg-signal-500";

  return (
    <div className="tray mb-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 [&>*]:min-w-0">
        <div className="card p-5">
          <div className="eyebrow mb-1.5">Plan</div>
          <div className="section-title mb-2">{data.plan?.tier ?? "Not set"}</div>
          <div className="text-[13px] text-ink-700 tabular-nums">
            {moneyText(data.plan?.monthly)} per month
          </div>
          <div className="text-[13px] text-ink-500 tabular-nums mt-0.5">
            {moneyText(data.plan?.overagePerMinute)} per minute beyond the allowance
          </div>
        </div>

        <div className="card p-5">
          <div className="eyebrow mb-1.5">Included minutes</div>
          <div className="text-[clamp(1.75rem,1.5rem+0.8vw,2.25rem)] leading-none font-normal tracking-[-0.04em] text-ink-900 tabular-nums">
            {fmtNumber(minutes.left)}
          </div>
          <div className="text-[13px] text-ink-500 mt-1 tabular-nums">
            left of {fmtNumber(minutes.total)} this period
          </div>
          <div className="mt-3 bg-bone-100 ring-1 ring-inset ring-ink-900/5 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${meterColor} transition-all duration-700`}
              style={{ width: `${Math.min(minutes.percentUsed, 100)}%` }}
            />
          </div>
          <div className="text-[12px] text-ink-500 mt-1.5 tabular-nums">
            {fmtNumber(minutes.used)} used
          </div>
        </div>

        <div className="card p-5">
          <div className="eyebrow mb-1.5">Wallet</div>
          <div
            className={`text-[clamp(1.75rem,1.5rem+0.8vw,2.25rem)] leading-none font-normal tracking-[-0.04em] tabular-nums ${
              data.wallet.negative ? "text-red-700" : "text-ink-900"
            }`}
          >
            {data.wallet.balance.display}
          </div>
          <div className="text-[13px] text-ink-500 mt-1">
            {data.wallet.negative
              ? "Owed from an unpaid subscription"
              : "Covers minutes beyond the allowance"}
          </div>
          {data.period ? (
            <div className="text-[12px] font-mono text-ink-500 tabular-nums mt-2">
              Period ends {fmtAbsolute(data.period.end)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Top up ───────────────────────────────────────────────────────────────────

function TopUp({ data, canSpend }: { data: WalletOverview; canSpend: boolean }) {
  const toast = useToast();
  const [selected, setSelected] = useState<number | typeof CUSTOM>(
    data.topUp.presets[0]?.amountNaira ?? CUSTOM,
  );
  const [customText, setCustomText] = useState("");

  const customAmount = useMemo(() => {
    const n = Number(customText.replace(/[^0-9]/g, ""));
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [customText]);

  // Debounced, so a quote is not asked for on every keystroke.
  const [debounced, setDebounced] = useState<number | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(customAmount), 350);
    return () => window.clearTimeout(t);
  }, [customAmount]);

  const quoteQ = useQuery({
    queryKey: ["billing", "quote", debounced],
    queryFn: () => getTopUpQuote(debounced as number),
    enabled: selected === CUSTOM && debounced !== null,
    staleTime: 60_000,
  });

  const preset =
    selected === CUSTOM
      ? null
      : (data.topUp.presets.find((p) => p.amountNaira === selected) ?? null);

  const quoted =
    selected === CUSTOM
      ? quoteQ.data?.allowed && quoteQ.data.fee && quoteQ.data.total
        ? { requested: quoteQ.data.requested, fee: quoteQ.data.fee, total: quoteQ.data.total }
        : null
      : preset
        ? { requested: preset.requested, fee: preset.fee, total: preset.total }
        : null;

  const amountNaira = selected === CUSTOM ? customAmount : selected;

  const start = useMutation({
    mutationFn: (naira: number) => startTopUp(naira),
    onSuccess: (opened) => {
      // Leaves the dashboard. The return page picks the reference back up.
      window.location.assign(opened.checkoutUrl);
    },
    onError: (err) =>
      toast.error("Couldn't start the payment", problemMessage(err, "Try again in a moment.")),
  });

  if (!data.topUp.available) {
    return (
      <div className="card p-5 mb-4">
        <h2 className="section-title mb-1.5">Top up</h2>
        <p className="text-[13px] text-ink-500">
          Card payments are not switched on for this workspace yet. Ask us for bank transfer
          details and we will credit the wallet manually.
        </p>
      </div>
    );
  }

  return (
    <div className="card mb-4" id="top-up">
      <div className="card-head">
        <h2 className="section-title">Top up</h2>
      </div>
      <div className="p-5">
        {!canSpend ? (
          <p className="text-[13px] text-ink-500">
            Only an owner or an admin can start a payment. Ask one of them to top up.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {data.topUp.presets.map((p) => (
                <button
                  key={p.amountNaira}
                  type="button"
                  onClick={() => setSelected(p.amountNaira)}
                  className={`btn btn-sm ${selected === p.amountNaira ? "btn-primary" : "btn-secondary"}`}
                >
                  {p.requested.display}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected(CUSTOM)}
                className={`btn btn-sm ${selected === CUSTOM ? "btn-primary" : "btn-secondary"}`}
              >
                Another amount
              </button>
            </div>

            {selected === CUSTOM ? (
              <div className="mb-4 max-w-xs">
                <label className="field-label" htmlFor="custom-topup">
                  Amount in naira
                </label>
                <input
                  id="custom-topup"
                  className="field"
                  inputMode="numeric"
                  placeholder={String(data.topUp.minimumNaira)}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                />
                {customAmount !== null && customAmount < data.topUp.minimumNaira ? (
                  <p className="text-[12px] text-amber-800 mt-1.5 tabular-nums">
                    The smallest top-up is NGN {data.topUp.minimumNaira.toLocaleString("en-NG")}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Every figure here comes from the server, priced before anyone commits. */}
            <div className="rounded-card bg-bone-50 ring-1 ring-inset ring-ink-900/5 p-4 mb-4">
              <Row label="Credited to your wallet" value={moneyText(quoted?.requested)} />
              <Row label="Processing fee" value={quoted ? `+ ${quoted.fee.display}` : "Not set"} muted />
              <div className="border-t border-ink-200 mt-2 pt-2">
                <Row label="You will be charged" value={moneyText(quoted?.total)} strong />
              </div>
            </div>

            <p className="text-[12px] text-ink-500 mb-4">{data.topUp.internationalCardNote}</p>

            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !quoted ||
                amountNaira === null ||
                amountNaira < data.topUp.minimumNaira ||
                start.isPending
              }
              onClick={() => amountNaira !== null && start.mutate(amountNaira)}
            >
              {start.isPending ? "Opening checkout…" : "Continue to payment"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={`text-[13px] ${muted ? "text-ink-500" : "text-ink-700"}`}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "text-[15px] font-medium text-ink-900" : "text-[13px] text-ink-700"}`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

function Ledger({
  entries,
  loading,
  error,
}: {
  entries: LedgerEntryDto[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="card mb-4">
      <div className="card-head">
        <h2 className="section-title">Wallet activity</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-stack">
          <thead>
            <tr>
              {["When", "What", "Amount", "Balance after", "Reference"].map((h) => (
                <th key={h} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="td">
                    <Skeleton className="h-3 w-full" />
                  </td>
                ))}
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 border-t border-ink-200 text-center text-sm text-red-700"
                >
                  {error}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 border-t border-ink-200 text-center text-sm text-ink-500"
                >
                  Nothing on the wallet yet. Charges and top-ups appear here as they happen.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td data-label="When" className="td text-[13px] text-ink-700">
                    {fmtAbsolute(e.createdAt)}
                  </td>
                  <td data-label="What" className="td text-[13px] text-ink-900">
                    {e.label}
                    {e.reason ? (
                      <div className="text-[12px] text-ink-500 mt-0.5">{e.reason}</div>
                    ) : null}
                  </td>
                  <td
                    data-label="Amount"
                    className={`td text-[13px] tabular-nums ${
                      e.amount.kobo.startsWith("-") ? "text-ink-700" : "text-signal-700"
                    }`}
                  >
                    {e.amount.display}
                  </td>
                  <td
                    data-label="Balance after"
                    className="td text-[13px] text-ink-700 tabular-nums"
                  >
                    {e.balanceAfter.display}
                  </td>
                  <td data-label="Reference" className="td text-[12px] font-mono text-ink-500">
                    {e.reference ?? "None"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

function Invoices({
  invoices,
  loading,
  onPrintFailed,
}: {
  invoices: InvoiceListItem[];
  loading: boolean;
  onPrintFailed: (msg: string) => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);

  async function print(id: string) {
    setOpening(id);
    try {
      await openInvoiceForPrint(id);
    } catch (err) {
      onPrintFailed(problemMessage(err, "Try again in a moment."));
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="card mb-4">
      <div className="card-head">
        <h2 className="section-title">Invoices</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-stack">
          <thead>
            <tr>
              {["Number", "Period", "Total", "Issued", ""].map((h, i) => (
                <th key={i} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="td">
                    <Skeleton className="h-3 w-full" />
                  </td>
                ))}
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 border-t border-ink-200 text-center text-sm text-ink-500"
                >
                  No invoices yet. One is issued at the end of each billing period.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <td data-label="Number" className="td text-[13px] font-mono text-ink-900">
                    {inv.number}
                  </td>
                  <td data-label="Period" className="td text-[13px] text-ink-700">
                    {fmtAbsolute(inv.periodStart)} to {fmtAbsolute(inv.periodEnd)}
                  </td>
                  <td data-label="Total" className="td text-[13px] text-ink-900 tabular-nums">
                    {inv.total.display}
                  </td>
                  <td data-label="Issued" className="td text-[13px] text-ink-500">
                    {fmtAbsolute(inv.issuedAt)}
                  </td>
                  <td data-label="" className="td">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={opening === inv.id}
                      onClick={() => void print(inv.id)}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {opening === inv.id ? "Opening…" : "Print"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-ink-200 text-[12px] text-ink-500 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
        Usage is settled from the wallet as it is metered. An invoice is the record of those
        charges, not a demand for payment.
      </div>
    </div>
  );
}

// ─── Low balance alert ────────────────────────────────────────────────────────

function LowBalance({
  current,
  canEdit,
  onSaved,
}: {
  current: Money;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState(() => current.naira.split(".")[0]);

  const save = useMutation({
    mutationFn: (naira: number) => setLowBalanceThreshold(naira),
    onSuccess: (res) => {
      toast.success("Saved", `We will email you below ${res.lowBalanceThreshold.display}.`);
      onSaved();
    },
    onError: (err) => toast.error("Couldn't save", problemMessage(err, "Try again in a moment.")),
  });

  const amount = useMemo(() => {
    const n = Number(text.replace(/[^0-9]/g, ""));
    return Number.isInteger(n) && n >= 0 ? n : null;
  }, [text]);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="section-title">Low balance alert</h2>
      </div>
      <div className="p-5">
        <p className="text-[13px] text-ink-500 mb-3">
          We email the workspace billing address when the wallet falls below this. Zero turns the
          alert off. At most one email a day.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="max-w-[12rem]">
            <label className="field-label" htmlFor="low-balance">
              Alert below, in naira
            </label>
            <input
              id="low-balance"
              className="field"
              inputMode="numeric"
              value={text}
              disabled={!canEdit}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canEdit || amount === null || save.isPending}
            onClick={() => amount !== null && save.mutate(amount)}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
        {!canEdit ? (
          <p className="text-[12px] text-ink-500 mt-2">Only an owner or an admin can change this.</p>
        ) : null}
      </div>
    </div>
  );
}
