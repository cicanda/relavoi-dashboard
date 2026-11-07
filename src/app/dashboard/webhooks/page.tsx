"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  RefreshCw,
  Send,
  Webhook as WebhookIcon,
} from "lucide-react";

import {
  getWebhookConfig,
  listWebhookLogs,
  registerWebhook,
  sendTestWebhook,
} from "@/lib/api";
import { fmtAbsolute, fmtRelative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import type { WebhookDeliveryLog } from "@/lib/types";

// ─── Event subscription metadata ─────────────────────────────────────────────
/**
 * The events the platform actually publishes and delivers.
 *
 * Checked against the event bus rather than written from the architecture
 * notes. `session.activated` was offered here and is published by nothing (the
 * consumer for it was removed as dead), while `call.missed`, `call.failed`,
 * `session.ended` and `session.target_swapped` fire and were not offered at
 * all. A tenant wiring a dispatch retry needed `call.missed` and could not
 * subscribe to it.
 */
const EVENT_TYPES: Array<{ id: string; description: string }> = [
  { id: "session.created", description: "A new masking session was created" },
  { id: "session.ended", description: "The session was ended, and may still be in its grace period" },
  { id: "session.expired", description: "The session is over and the number is released" },
  { id: "session.target_swapped", description: "The customer on the session was changed" },
  { id: "call.incoming", description: "A call has arrived on a proxy number" },
  { id: "call.answered", description: "The person called picked up" },
  { id: "call.ended", description: "The call finished after being answered" },
  { id: "call.missed", description: "The call rang out and nobody answered" },
  { id: "call.failed", description: "The call could not be placed or was refused" },
  { id: "sms.received", description: "An SMS arrived on a proxy number" },
  { id: "sms.sent", description: "Your outbound SMS was sent" },
];
const ALL_EVENT_IDS = EVENT_TYPES.map((e) => e.id);

// ─── Copy button ─────────────────────────────────────────────────────────────
function CopyButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
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
          /* ignore */
        }
      }}
      className={`inline-flex items-center gap-1.5 min-h-11 -my-3.5 lg:min-h-0 lg:my-0 eyebrow hover:text-ink-900 transition-colors ${className}`}
      aria-label="Copy"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-signal-600" />
          <span className="text-signal-700">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// ─── CodeBlock ───────────────────────────────────────────────────────────────
function CodeBlock({
  code,
  language,
  children,
}: {
  code?: string;
  language?: string;
  children?: string;
}) {
  const content = code ?? children ?? "";
  return (
    <div className="relative group">
      {language && (
        <div className="absolute top-3 left-4 text-[10px] font-mono uppercase tracking-wider text-ink-400">
          {language}
        </div>
      )}
      <div className="absolute top-2 right-2.5">
        <CopyButton text={content} className="text-ink-400 hover:text-paper" />
      </div>
      <pre className="code-block p-4 pt-9">
        <code>{content}</code>
      </pre>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
interface TabDef {
  id: string;
  label: string;
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs mb-3">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            data-active={isActive}
            aria-pressed={isActive}
            className="tab"
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-brand-navy/40 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="dialog animate-dialog-in max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Signature verification snippets ─────────────────────────────────────────
const NODE_SNIPPET = `import crypto from 'crypto';

function verifyRelavoiWebhook(req, secret) {
  const sig = req.headers['x-relavoi-signature'];
  const ts = req.headers['x-relavoi-timestamp'];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${ts}.\${JSON.stringify(req.body)}\`)
    .digest('hex');
  if (sig !== expected) throw new Error('invalid signature');
}`;

const PYTHON_SNIPPET = `import hmac, hashlib, json

def verify_relavoi_webhook(request, secret: str):
    sig = request.headers["X-Relavoi-Signature"]
    ts  = request.headers["X-Relavoi-Timestamp"]
    body = json.dumps(request.json, separators=(",", ":"))
    expected = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise PermissionError("invalid signature")`;

const GO_SNIPPET = `import (
  "crypto/hmac"
  "crypto/sha256"
  "encoding/hex"
)

func verifyRelavoiWebhook(body []byte, ts, sig, secret string) bool {
  mac := hmac.New(sha256.New, []byte(secret))
  mac.Write([]byte(ts + "." + string(body)))
  return hmac.Equal([]byte(sig), []byte(hex.EncodeToString(mac.Sum(nil))))
}`;

type VerifyTab = "node" | "python" | "go";

// ─── Page ────────────────────────────────────────────────────────────────────
/**
 * Waits for the config, then hands it to the form as its starting values.
 *
 * The form used to mount empty and fill itself in from two effects, each
 * guarded by its own "have I done this yet" boolean. That is four pieces of
 * state standing in for one fact, and it put a frame on screen in which the
 * URL field was blank for an endpoint that is configured. Seeding `useState`
 * from props at mount does the same job with none of it, and the guards go
 * away because a component is only mounted once.
 *
 * Seeded at mount and not re-seeded afterwards, which is what the booleans
 * were enforcing: a background refetch must never pull the field out from
 * under somebody who is typing in it.
 */
export default function WebhooksPage() {
  const configQuery = useQuery({
    queryKey: ["webhook-config"],
    queryFn: getWebhookConfig,
  });

  if (configQuery.isPending) {
    return (
      <div>
        <PageHeader
          title="Webhooks"
          description="Receive real-time events about your sessions and calls"
        />
        <div className="text-sm text-ink-500">Loading webhook settings…</div>
      </div>
    );
  }

  // An error leaves `data` undefined and the form starts empty, which is where
  // it started before this query existed.
  const saved = configQuery.data;
  const savedEvents = saved?.events ?? [];
  return (
    <WebhooksForm
      initialUrl={saved?.url ?? ""}
      // No saved rows means every event, which is what the API does with an
      // empty set, so an endpoint registered before this control existed keeps
      // receiving exactly what it receives today.
      initialEvents={savedEvents.length > 0 ? savedEvents : ALL_EVENT_IDS}
      savedUrl={saved?.url ?? null}
    />
  );
}

function WebhooksForm({
  initialUrl,
  initialEvents,
  savedUrl,
}: {
  initialUrl: string;
  initialEvents: string[];
  savedUrl: string | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [urlInput, setUrlInput] = useState(initialUrl);
  /**
   * Which events go to the endpoint.
   *
   * This was a row of ticked, disabled boxes under the line "Per-event
   * selection coming soon", and the page always registered every event. The
   * API has stored the selection per tenant and filtered deliveries against
   * it since tenant webhooks shipped, so the only thing missing was this.
   */
  const [events, setEvents] = useState<string[]>(initialEvents);
  const [regenOpen, setRegenOpen] = useState(false);
  const [verifyTab, setVerifyTab] = useState<VerifyTab>("node");

  const logsQuery = useQuery({
    queryKey: ["webhook-logs"],
    queryFn: () => listWebhookLogs({ limit: 50 }),
    refetchInterval: 30_000,
  });

  const registerMutation = useMutation({
    mutationFn: (url: string) => registerWebhook(url, events),
    onSuccess: () => {
      toast.success("Webhook saved");
      queryClient.invalidateQueries({ queryKey: ["webhook-config"] });
    },
    onError: () => {
      toast.error("Could not save webhook", "Please try again");
    },
  });

  const regenMutation = useMutation({
    // Regenerating the secret re-registers with the same URL; backend rotates
    // secret. It must carry the current selection, or rotating a secret would
    // silently re-subscribe the endpoint to everything.
    mutationFn: (url: string) => registerWebhook(url, events),
    onSuccess: () => {
      toast.success("Signing secret regenerated");
      queryClient.invalidateQueries({ queryKey: ["webhook-config"] });
      setRegenOpen(false);
    },
    onError: () => {
      toast.error("Could not regenerate secret");
    },
  });

  const testMutation = useMutation({
    mutationFn: sendTestWebhook,
    onSuccess: () => {
      toast.success("Test event sent", "Check delivery log");
      // Give backend a beat to write the log, then refetch.
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: ["webhook-logs"] }),
        500,
      );
    },
    onError: () => {
      toast.error("Could not send test event");
    },
  });

  const maskedSecret = "whsec_••••••••••••••••";
  const logs: WebhookDeliveryLog[] = logsQuery.data?.data ?? [];
  const isLogsLoading = logsQuery.isLoading;
  const verifySnippet =
    verifyTab === "node"
      ? NODE_SNIPPET
      : verifyTab === "python"
        ? PYTHON_SNIPPET
        : GO_SNIPPET;
  const verifyLang =
    verifyTab === "node"
      ? "javascript"
      : verifyTab === "python"
        ? "python"
        : "go";

  function handleSaveUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error("URL is required");
      return;
    }
    registerMutation.mutate(trimmed);
  }

  function handleRegen() {
    const url = savedUrl ?? urlInput.trim();
    if (!url) {
      toast.error("Set a URL first");
      setRegenOpen(false);
      return;
    }
    regenMutation.mutate(url);
  }

  return (
    <div>
      <PageHeader
        title="Webhooks"
        description="Receive real-time events about your sessions and calls"
      />

      {/* Card 1 — Endpoint Configuration */}
      <section className="card p-5 mb-5">
        <div className="flex items-center gap-2">
          <WebhookIcon className="w-4 h-4 text-ink-600" />
          <h2 className="section-title">Endpoint URL</h2>
        </div>

        <div className="mt-3 flex items-stretch gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://api.example.com/relavoi/webhooks"
            className="field flex-1 font-mono"
          />
          <button
            type="button"
            onClick={handleSaveUrl}
            disabled={registerMutation.isPending}
            className="btn btn-primary btn-sm"
          >
            {registerMutation.isPending ? "Saving..." : "Update"}
          </button>
        </div>
        <p className="text-[13px] italic text-ink-500 mt-2">
          POST events go to this URL. We expect a 2xx response within 10s.
        </p>

        {/* Signing secret */}
        <div className="mt-5 pt-5 border-t border-ink-200">
          <div className="eyebrow mb-2">
            Signing secret
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-[13px] text-ink-700 bg-bone-50 border border-ink-200 rounded-lg px-3 py-2 min-w-0 break-all">
              {maskedSecret}
            </code>
            <CopyButton text={maskedSecret} />
            <button
              type="button"
              onClick={() => setRegenOpen(true)}
              className="btn btn-secondary btn-sm ml-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate secret
            </button>
          </div>
        </div>
      </section>

      {/* Card 2 — Event Subscriptions */}
      <section className="card p-5 mb-5">
        <h2 className="section-title">Events</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Which event types are delivered to your endpoint.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EVENT_TYPES.map((evt) => (
            <label
              key={evt.id}
              className={`flex items-start gap-3 p-3.5 border rounded-xl cursor-pointer transition-colors ${
                events.includes(evt.id)
                  ? "border-ink-300 bg-bone-50"
                  : "border-ink-200 bg-white hover:bg-bone-50"
              }`}
            >
              <input
                type="checkbox"
                checked={events.includes(evt.id)}
                onChange={(e) =>
                  setEvents((prev) =>
                    e.target.checked
                      ? [...prev, evt.id]
                      : prev.filter((x) => x !== evt.id),
                  )
                }
                className="mt-0.5 accent-signal-600"
              />
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-ink-900">{evt.id}</div>
                <div className="text-[13px] text-ink-500 mt-0.5">
                  {evt.description}
                </div>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-500">
            {events.length === 0
              ? "Choose at least one event. An endpoint subscribed to nothing would never be called."
              : `${events.length} of ${ALL_EVENT_IDS.length} events will be delivered.`}
          </p>
          <button
            type="button"
            disabled={
              events.length === 0 || !urlInput.trim() || registerMutation.isPending
            }
            onClick={() => registerMutation.mutate(urlInput.trim())}
            className="btn btn-secondary btn-sm"
          >
            {registerMutation.isPending ? "Saving…" : "Save events"}
          </button>
        </div>
      </section>

      {/* Card 3 — Delivery Logs */}
      <section className="card mb-5">
        <div className="p-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Delivery log</h2>
            <p className="eyebrow mt-1">
              auto-refreshing every 30s
            </p>
          </div>
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="btn btn-primary"
          >
            <Send className="w-3.5 h-3.5" />
            {testMutation.isPending ? "Sending..." : "Send Test Event"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-stack">
            <thead>
              <tr>
                {["Event type", "Status", "HTTP", "Attempt #", "When"].map(
                  (h) => (
                    <th
                      key={h}
                      className="th"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {isLogsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={5} />
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 border-t border-ink-200 text-center text-sm text-ink-500"
                  >
                    No deliveries yet. Send a test event to verify.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-bone-50 transition-colors">
                    <td data-label="Event type" className="td text-[13px] text-ink-700 font-mono">
                      {log.event}
                    </td>
                    <td data-label="Status" className="td">
                      <StatePill
                        state={log.success ? "DELIVERED" : "FAILED"}
                        size="sm"
                      />
                    </td>
                    <td data-label="HTTP" className="td text-[13px] text-ink-700 font-mono tabular-nums">
                      {log.statusCode ?? "None"}
                    </td>
                    <td data-label="Attempt #" className="td text-[13px] text-ink-700 font-mono tabular-nums">
                      {log.attemptCount ?? 1}
                    </td>
                    <td data-label="When"
                      className="td text-[13px] text-ink-700"
                      title={fmtAbsolute(log.requestedAt)}
                    >
                      {fmtRelative(log.requestedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Card 4 — Signature Verification */}
      <section className="card p-5">
        <h2 className="section-title">Verify the signature</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Each request includes{" "}
          <code className="font-mono text-[12px] bg-bone-100 px-1.5 py-0.5 rounded-md">
            X-Relavoi-Signature: t=…,v1=…
          </code>
          . Recompute the HMAC and reject mismatches.
        </p>

        <Tabs
          tabs={[
            { id: "node", label: "Node.js" },
            { id: "python", label: "Python" },
            { id: "go", label: "Go" },
          ]}
          active={verifyTab}
          onChange={(id) => setVerifyTab(id as VerifyTab)}
        />

        <CodeBlock code={verifySnippet} language={verifyLang} />
      </section>

      {/* Regenerate secret modal */}
      {regenOpen && (
        <Modal onClose={() => (regenMutation.isPending ? undefined : setRegenOpen(false))}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-700" />
            </div>
            <div>
              <h3 className="section-title">
                Regenerate signing secret?
              </h3>
              <p className="text-sm text-ink-500 mt-1">
                Existing receivers will start rejecting our signatures until you
                deploy the new secret on your side.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              type="button"
              disabled={regenMutation.isPending}
              onClick={() => setRegenOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={regenMutation.isPending}
              onClick={handleRegen}
              className="btn bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
            >
              {regenMutation.isPending ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
