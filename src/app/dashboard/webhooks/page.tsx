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
const EVENT_TYPES: Array<{ id: string; description: string }> = [
  { id: "session.created", description: "A new masking session was created" },
  { id: "session.activated", description: "Session is now routing calls" },
  { id: "session.expired", description: "Session has terminated" },
  { id: "call.incoming", description: "A call has arrived on a proxy number" },
  { id: "call.answered", description: "The callee picked up" },
  { id: "call.ended", description: "The call concluded" },
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
      className={`inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-500 hover:text-ink-900 transition-colors ${className}`}
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
        <div className="absolute top-2 left-3 text-[10px] font-mono uppercase tracking-wider text-ink-400">
          {language}
        </div>
      )}
      <div className="absolute top-2 right-2">
        <CopyButton text={content} className="text-ink-400 hover:text-paper" />
      </div>
      <pre className="bg-ink-900 text-paper font-mono text-[12px] leading-relaxed p-4 pt-7 rounded-md overflow-x-auto">
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
    <div className="flex items-center gap-0 border-b border-ink-200 mb-3">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3 h-9 text-sm transition-colors -mb-px border-b-2 ${
              isActive
                ? "border-signal-500 text-ink-900 font-medium"
                : "border-transparent text-ink-500 hover:text-ink-700"
            }`}
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
      className="fixed inset-0 z-50 bg-ink-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper rounded-[10px] shadow-card max-w-md w-full p-6"
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
export default function WebhooksPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [urlInput, setUrlInput] = useState("");
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [verifyTab, setVerifyTab] = useState<VerifyTab>("node");

  const configQuery = useQuery({
    queryKey: ["webhook-config"],
    queryFn: getWebhookConfig,
  });

  const logsQuery = useQuery({
    queryKey: ["webhook-logs"],
    queryFn: () => listWebhookLogs({ limit: 50 }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!urlInitialized && configQuery.data?.url) {
      setUrlInput(configQuery.data.url);
      setUrlInitialized(true);
    }
  }, [configQuery.data, urlInitialized]);

  const registerMutation = useMutation({
    mutationFn: (url: string) => registerWebhook(url, ALL_EVENT_IDS),
    onSuccess: () => {
      toast.success("Webhook saved");
      queryClient.invalidateQueries({ queryKey: ["webhook-config"] });
    },
    onError: () => {
      toast.error("Could not save webhook", "Please try again");
    },
  });

  const regenMutation = useMutation({
    // Regenerating the secret re-registers with the same URL; backend rotates secret.
    mutationFn: (url: string) => registerWebhook(url, ALL_EVENT_IDS),
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
    const url = configQuery.data?.url ?? urlInput.trim();
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
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5 mb-5">
        <div className="flex items-center gap-2">
          <WebhookIcon className="w-4 h-4 text-ink-600" />
          <h2 className="font-semibold text-ink-900">Endpoint URL</h2>
        </div>

        <div className="mt-3 flex items-stretch gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://api.example.com/relavoi/webhooks"
            className="flex-1 h-9 px-3 border border-ink-200 rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 bg-paper font-mono"
          />
          <button
            type="button"
            onClick={handleSaveUrl}
            disabled={registerMutation.isPending}
            className="bg-ink-900 text-paper px-4 h-9 rounded-md font-medium hover:bg-ink-800 text-sm transition-colors disabled:opacity-50"
          >
            {registerMutation.isPending ? "Saving..." : "Update"}
          </button>
        </div>
        <p className="text-xs italic text-ink-500 mt-2">
          POST events go to this URL. We expect a 2xx response within 10s.
        </p>

        {/* Signing secret */}
        <div className="mt-5 pt-5 border-t border-ink-200">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
            Signing secret
          </div>
          <div className="flex items-center gap-3">
            <code className="font-mono text-[13px] text-ink-700 bg-bone-100 border border-ink-200 rounded-md px-3 py-2">
              {maskedSecret}
            </code>
            <CopyButton text={maskedSecret} />
            <button
              type="button"
              onClick={() => setRegenOpen(true)}
              className="ml-auto bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate secret
            </button>
          </div>
        </div>
      </section>

      {/* Card 2 — Event Subscriptions */}
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5 mb-5">
        <h2 className="font-semibold text-ink-900">Events</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Which event types are delivered to your endpoint.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EVENT_TYPES.map((evt) => (
            <label
              key={evt.id}
              className="flex items-start gap-3 p-3 border border-ink-200 rounded-md bg-bone-100/40 opacity-90"
            >
              <input
                type="checkbox"
                checked
                disabled
                readOnly
                className="mt-0.5 accent-signal-600"
              />
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-ink-900">{evt.id}</div>
                <div className="text-xs text-ink-500 mt-0.5">
                  {evt.description}
                </div>
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs italic text-ink-500 mt-4">
          Per-event selection coming soon. All events are currently delivered.
        </p>
      </section>

      {/* Card 3 — Delivery Logs */}
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card mb-5">
        <div className="p-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink-900">Delivery log</h2>
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mt-1">
              auto-refreshing every 30s
            </p>
          </div>
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 text-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {testMutation.isPending ? "Sending..." : "Send Test Event"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Event type", "Status", "HTTP", "Attempt #", "When"].map(
                  (h) => (
                    <th
                      key={h}
                      className="bg-bone-100 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2"
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
                    No deliveries yet — send a test event to verify.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-bone-100/60 transition-colors">
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono">
                      {log.eventType}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200">
                      <StatePill
                        state={log.success ? "DELIVERED" : "FAILED"}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono tabular-nums">
                      {log.status ?? "—"}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700 font-mono tabular-nums">
                      {log.attemptNumber ?? 1}
                    </td>
                    <td
                      className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700"
                      title={fmtAbsolute(log.deliveredAt)}
                    >
                      {fmtRelative(log.deliveredAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Card 4 — Signature Verification */}
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5">
        <h2 className="font-semibold text-ink-900">Verify the signature</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Each request includes{" "}
          <code className="font-mono text-[12px] bg-bone-100 px-1.5 py-0.5 rounded">
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
            <div className="w-9 h-9 rounded-md bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-700" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-900">
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
              className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={regenMutation.isPending}
              onClick={handleRegen}
              className="bg-red-50 text-red-700 border border-red-200 px-4 h-10 rounded-md hover:bg-red-100 font-medium text-sm disabled:opacity-50"
            >
              {regenMutation.isPending ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
