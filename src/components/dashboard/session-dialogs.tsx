"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";

import { createSession, problemMessage, swapSessionTarget } from "@/lib/api";
import { NG_EXAMPLE, incompleteMessage, normaliseNgPhone } from "@/lib/phone-ng";
import type { DirectionMode, Session } from "@/lib/types";

/**
 * Starting and steering a session by hand.
 *
 * These are for the seller with no app and no integration: they type two
 * numbers, read out one Relavoi number, and cut the connection when the
 * delivery is confirmed. Everything here is built for that, and for doing it
 * on a phone, which is why the dialogs are full screen below the sm breakpoint
 * and the primary action sits where a thumb reaches.
 */

const SANDBOX_NOTE = "Sandbox: calls are simulated and nobody's phone will ring.";

// ─── Shell ──────────────────────────────────────────────────────────────────────
/**
 * Full screen on a phone, a centred card from sm up. The header and footer stay
 * put while the body scrolls, so the confirm button never drifts off a short
 * screen when the keyboard opens.
 */
function Sheet({
  title,
  description,
  busy,
  center,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  busy?: boolean;
  /** Centre the body rather than top-aligning it: for the short panels that
   *  would otherwise leave a phone mostly empty. */
  center?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    // Focus the first field so typing can start immediately.
    const first = panelRef.current?.querySelector<HTMLElement>("input, select, button");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center bg-ink-900/40 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        className="bg-paper w-full h-dvh sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:border sm:border-ink-200 sm:rounded-[10px] sm:shadow-card flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-ink-200 sm:border-b-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description && <p className="text-[13px] text-ink-500 mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="shrink-0 p-1 rounded text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`px-5 py-4 flex-1 overflow-y-auto ${
            center ? "flex flex-col justify-center sm:block" : ""
          }`}
        >
          {children}
        </div>

        <div className="px-5 py-4 border-t border-ink-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  );
}

function SandboxNote() {
  return (
    <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md px-3 py-2 text-[13px]">
      {SANDBOX_NOTE}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-800 rounded-md px-3 py-2 text-[13px]">
      {message}
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* a clipboard the browser refuses is not worth an error toast */
        }
      }}
      className="inline-flex items-center gap-1.5 bg-paper border border-ink-200 text-ink-700 px-3 h-10 rounded-md hover:bg-bone-100 text-sm transition-colors"
    >
      {copied ? <Check className="w-4 h-4 text-signal-600" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Phone field ────────────────────────────────────────────────────────────────
/**
 * A phone input that converts while it is typed and says what it understood.
 *
 * The normalised number is shown rather than written back into the field: a
 * field that rewrites itself under the cursor is hostile to type into, and the
 * seller needs to see that 08134132644 reached the API as +2348134132644.
 */
export function PhoneField({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
}) {
  const n = normaliseNgPhone(value);
  const shown = error ?? n.problem;
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink-700 mb-1.5">{label}</span>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={NG_EXAMPLE}
        aria-invalid={shown ? true : undefined}
        className={`w-full bg-paper border rounded-md px-3 h-11 text-[15px] font-mono text-ink-900 placeholder:text-ink-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-signal-500/30 ${
          shown ? "border-red-300" : "border-ink-200"
        }`}
      />
      <div className="mt-1.5 min-h-[18px] text-[12px]">
        {shown ? (
          <span className="text-red-700">{shown}</span>
        ) : n.e164 ? (
          <span className="text-ink-500">
            Reads as <span className="font-mono text-ink-700">{n.e164}</span>
          </span>
        ) : (
          <span className="text-ink-400">{hint ?? `For example ${NG_EXAMPLE}`}</span>
        )}
      </div>
    </label>
  );
}

// ─── Create ─────────────────────────────────────────────────────────────────────
const DIRECTIONS: Array<{ value: DirectionMode; label: string }> = [
  { value: "BIDIRECTIONAL", label: "Both ways" },
  { value: "A_TO_B_ONLY", label: "Rider to customer only" },
  { value: "B_TO_A_ONLY", label: "Customer to rider only" },
];

/**
 * Create a session, then hand over the one number that matters.
 *
 * The success step is part of the dialog on purpose. The Relavoi number is the
 * whole product of this form, and a seller is about to read it down a phone
 * line, so it gets its own screen with a copy button before anything navigates
 * away.
 */
export function CreateSessionDialog({
  sandbox,
  onClose,
  onOpenSession,
}: {
  sandbox: boolean;
  onClose: () => void;
  onOpenSession: (session: Session) => void;
}) {
  const [agent, setAgent] = useState("");
  const [customer, setCustomer] = useState("");
  const [reference, setReference] = useState("");
  const [direction, setDirection] = useState<DirectionMode>("BIDIRECTIONAL");

  const [agentError, setAgentError] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Session | null>(null);

  async function onSubmit() {
    const a = normaliseNgPhone(agent);
    const b = normaliseNgPhone(customer);
    setFormError(null);
    setAgentError(a.e164 ? null : (a.problem ?? incompleteMessage()));
    setCustomerError(b.e164 ? null : (b.problem ?? incompleteMessage()));
    if (!a.e164 || !b.e164) return;
    if (a.e164 === b.e164) {
      setCustomerError("The two numbers must be different.");
      return;
    }

    setBusy(true);
    try {
      const trimmed = reference.trim();
      const session = await createSession({
        agentPhone: a.e164,
        customerPhone: b.e164,
        directionMode: direction,
        metadata: trimmed ? { reference: trimmed } : undefined,
      });
      setCreated(session);
    } catch (err) {
      setFormError(problemMessage(err, "Could not start the session. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Sheet
        title="Session started"
        center
        onClose={() => onOpenSession(created)}
        footer={
          <>
            <CopyButton text={created.proxyNumber} label="Copy number" />
            <button
              type="button"
              onClick={() => onOpenSession(created)}
              className="bg-ink-900 text-paper px-4 h-11 rounded-md font-medium hover:bg-ink-800 transition-colors text-sm"
            >
              Open session
            </button>
          </>
        }
      >
        <div className="text-center py-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
            Relavoi number
          </div>
          <div className="mt-2 text-[30px] sm:text-[34px] leading-tight font-mono text-ink-900 tabular-nums break-all">
            {created.proxyNumber}
          </div>
          <p className="mt-3 text-sm text-ink-700 max-w-sm mx-auto">
            Share this number with both people. They call it to reach each other.
          </p>
        </div>
        {sandbox && <SandboxNote />}
      </Sheet>
    );
  }

  return (
    <Sheet
      title="New session"
      description="Both people call one Relavoi number. Neither sees the other's phone number."
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="bg-paper border border-ink-200 text-ink-700 px-4 h-11 rounded-md hover:bg-bone-100 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="bg-ink-900 text-paper px-4 h-11 rounded-md font-medium hover:bg-ink-800 transition-colors text-sm disabled:opacity-50"
          >
            {busy ? "Starting…" : "Start session"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {sandbox && <SandboxNote />}
        {formError && <FormError message={formError} />}

        <PhoneField
          label="Rider or agent phone"
          value={agent}
          onChange={(v) => {
            setAgent(v);
            setAgentError(null);
          }}
          error={agentError}
        />
        <PhoneField
          label="Customer phone"
          value={customer}
          onChange={(v) => {
            setCustomer(v);
            setCustomerError(null);
          }}
          error={customerError}
        />

        <label className="block">
          <span className="block text-[13px] font-medium text-ink-700 mb-1.5">
            Order reference <span className="text-ink-400 font-normal">(optional)</span>
          </span>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="ORD-9281"
            maxLength={64}
            className="w-full bg-paper border border-ink-200 rounded-md px-3 h-11 text-[15px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-signal-500/30"
          />
          <span className="block mt-1.5 text-[12px] text-ink-400">
            Shown on the session list so you can find this delivery again.
          </span>
        </label>

        <fieldset>
          <legend className="block text-[13px] font-medium text-ink-700 mb-1.5">
            Who can call whom
          </legend>
          <div className="space-y-2">
            {DIRECTIONS.map((d) => (
              <label
                key={d.value}
                className={`flex items-center gap-2.5 border rounded-md px-3 h-11 cursor-pointer transition-colors ${
                  direction === d.value
                    ? "border-ink-900 bg-bone-100"
                    : "border-ink-200 hover:bg-bone-100"
                }`}
              >
                <input
                  type="radio"
                  name="direction"
                  value={d.value}
                  checked={direction === d.value}
                  onChange={() => setDirection(d.value)}
                  className="accent-ink-900"
                />
                <span className="text-sm text-ink-900">{d.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  );
}

// ─── End ────────────────────────────────────────────────────────────────────────
/**
 * End a session, with the choice that actually matters to a seller: whether
 * the two of them can still reach each other afterwards.
 *
 * "Cut off now" sends a zero grace period, which the routing path treats as
 * dead immediately. The other option leaves the workspace's own grace in
 * force, so a call either of them is already expecting still connects.
 */
export function EndSessionDialog({
  graceMinutes,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  graceMinutes: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (gracePeriodMinutes: number | undefined) => void;
}) {
  const [cutNow, setCutNow] = useState(true);

  return (
    <Sheet
      title="End this session?"
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="bg-paper border border-ink-200 text-ink-700 px-4 h-11 rounded-md hover:bg-bone-100 text-sm transition-colors disabled:opacity-50"
          >
            Keep it open
          </button>
          <button
            type="button"
            onClick={() => onConfirm(cutNow ? 0 : undefined)}
            disabled={busy}
            className="bg-red-50 text-red-700 border border-red-200 px-4 h-11 rounded-md hover:bg-red-100 font-medium text-sm disabled:opacity-50"
          >
            {busy ? "Ending…" : "End session"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <FormError message={error} />}
        <Choice
          selected={cutNow}
          onSelect={() => setCutNow(true)}
          title="Cut off contact now"
          detail="Neither of them can reach the other through this number from this moment."
        />
        <Choice
          selected={!cutNow}
          onSelect={() => setCutNow(false)}
          title="Allow a short grace period"
          detail={`Calls still connect for ${graceMinutes} ${
            graceMinutes === 1 ? "minute" : "minutes"
          }, in case one of them rings back.`}
        />
      </div>
    </Sheet>
  );
}

function Choice({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 border rounded-md px-3 py-3 cursor-pointer transition-colors ${
        selected ? "border-ink-900 bg-bone-100" : "border-ink-200 hover:bg-bone-100"
      }`}
    >
      <input
        type="radio"
        name="end-mode"
        checked={selected}
        onChange={onSelect}
        className="mt-0.5 accent-ink-900"
      />
      <span>
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        <span className="block text-[13px] text-ink-500 mt-0.5">{detail}</span>
      </span>
    </label>
  );
}

// ─── Change customer ────────────────────────────────────────────────────────────
/**
 * Point an open session at a different customer.
 *
 * This is the rider working a batch of drops: the same number carries on, so
 * nobody has to be told a new one and no number is burned per recipient. The
 * previous customer stops being able to reach the rider the moment this saves.
 */
export function ChangeCustomerDialog({
  sessionId,
  onCancel,
  onChanged,
}: {
  sessionId: string;
  onCancel: () => void;
  onChanged: (session: Session) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const b = normaliseNgPhone(customer);
    setFormError(null);
    if (!b.e164) {
      setFieldError(b.problem ?? incompleteMessage());
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      onChanged(await swapSessionTarget(sessionId, b.e164));
    } catch (err) {
      setFormError(problemMessage(err, "Could not change the customer. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Change customer"
      description="The Relavoi number stays the same. The previous customer can no longer use it."
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="bg-paper border border-ink-200 text-ink-700 px-4 h-11 rounded-md hover:bg-bone-100 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="bg-ink-900 text-paper px-4 h-11 rounded-md font-medium hover:bg-ink-800 transition-colors text-sm disabled:opacity-50"
          >
            {busy ? "Changing…" : "Change customer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <FormError message={formError} />}
        <PhoneField
          label="New customer phone"
          value={customer}
          onChange={(v) => {
            setCustomer(v);
            setFieldError(null);
          }}
          error={fieldError}
        />
      </div>
    </Sheet>
  );
}
