"use client";

import { useMemo, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw, AlertTriangle } from "lucide-react";

import { rotateApiKey } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import { useAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";

// ─── Tiny inline CopyButton ──────────────────────────────────────────────────
function CopyButton({
  text,
  className = "",
  label,
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
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
      aria-label={label ?? "Copy"}
      type="button"
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

// ─── Code block ──────────────────────────────────────────────────────────────
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

// ─── Tabs shell ──────────────────────────────────────────────────────────────
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

// ─── Snippet templates ───────────────────────────────────────────────────────
const JS_SNIPPET = `import { Relavoi } from '@relavoi/sdk';

const client = new Relavoi({
  apiKey: process.env.RELAVOI_API_KEY!,
  apiSecret: process.env.RELAVOI_API_SECRET!,
  tenantId: '{tenant.id}',
});

const session = await client.sessions.create({
  agentPhone: '+2348012345678',
  customerPhone: '+2348087654321',
  metadata: { orderId: 'ORD-9281' },
  gracePeriodMinutes: 15,
});

console.log('proxy:', session.proxyNumber);`;

const KOTLIN_SNIPPET = `val relavoi = Relavoi.Builder(context)
  .apiKey(BuildConfig.RELAVOI_API_KEY)
  .apiSecret(BuildConfig.RELAVOI_API_SECRET)
  .tenantId("{tenant.id}")
  .build()

val session = relavoi.sessions.create(
  agentPhone = "+2348012345678",
  customerPhone = "+2348087654321",
  metadata = mapOf("orderId" to "ORD-9281"),
  gracePeriodMinutes = 15,
)
println("proxy=\${session.proxyNumber}")`;

const SWIFT_SNIPPET = `let client = Relavoi(
  apiKey: ProcessInfo.processInfo.environment["RELAVOI_API_KEY"]!,
  apiSecret: ProcessInfo.processInfo.environment["RELAVOI_API_SECRET"]!,
  tenantId: "{tenant.id}"
)

let session = try await client.sessions.create(
  agentPhone: "+2348012345678",
  customerPhone: "+2348087654321",
  metadata: ["orderId": "ORD-9281"],
  gracePeriodMinutes: 15
)
print("proxy:", session.proxyNumber)`;

const CURL_SNIPPET = `curl -X POST https://api.relavoi.com/v1/auth/token \\
  -H 'Content-Type: application/json' \\
  -d '{"apiKey":"$RELAVOI_API_KEY","apiSecret":"$RELAVOI_API_SECRET"}'`;

// ─── Modal shell ─────────────────────────────────────────────────────────────
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

// ─── Page ────────────────────────────────────────────────────────────────────
type SdkTab = "js" | "kotlin" | "swift";

export default function ApiKeysPage() {
  const { tenant } = useAuth();
  const toast = useToast();

  const [sdkTab, setSdkTab] = useState<SdkTab>("js");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [creds, setCreds] = useState<{ apiKey: string; apiSecret: string } | null>(null);

  const tenantId = tenant?.id ?? "YOUR_TENANT_ID";

  // Deterministic masked key derived from tenant.id (last 4 chars).
  const maskedKey = useMemo(() => {
    const tail =
      tenant?.id && tenant.id.length >= 4
        ? tenant.id.slice(-4).toLowerCase()
        : "0001";
    return `rk_live_••••••••••••••••••••${tail}`;
  }, [tenant?.id]);

  const jsSnippet = useMemo(
    () => JS_SNIPPET.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );
  const kotlinSnippet = useMemo(
    () => KOTLIN_SNIPPET.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );
  const swiftSnippet = useMemo(
    () => SWIFT_SNIPPET.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );

  // Last used placeholder (backend hasn't shipped this yet).
  const lastUsedAt: string | null = null;
  const lastUsedLabel =
    fmtRelative(lastUsedAt) === "—" ? "never" : fmtRelative(lastUsedAt);

  async function handleRotate() {
    setRotating(true);
    try {
      const data = await rotateApiKey();
      setCreds(data);
      setConfirmOpen(false);
      setCredsOpen(true);
      toast.success("Credentials rotated");
    } catch {
      toast.error("Could not rotate credentials", "Please try again");
    } finally {
      setRotating(false);
    }
  }

  const activeSnippet =
    sdkTab === "js" ? jsSnippet : sdkTab === "kotlin" ? kotlinSnippet : swiftSnippet;
  const activeLang =
    sdkTab === "js" ? "typescript" : sdkTab === "kotlin" ? "kotlin" : "swift";

  return (
    <div>
      <PageHeader
        title="API & Keys"
        description="Programmatic access to the Relavoi API"
      />

      {/* Card 1 — API Credentials */}
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-ink-600" />
              <h2 className="font-semibold text-ink-900">Live API Key</h2>
            </div>
            <p className="text-sm text-ink-500 mt-1">
              Used by the SDK and any backend integration.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <code className="font-mono text-[13px] text-ink-700 bg-bone-100 border border-ink-200 rounded-md px-3 py-2">
                {maskedKey}
              </code>
              <CopyButton text={maskedKey} />
            </div>
            <p className="text-xs text-ink-500 mt-2 font-mono">
              Last used: {lastUsedLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors inline-flex items-center gap-1.5 flex-shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rotate Credentials
          </button>
        </div>
      </section>

      {/* Card 2 — SDK Quick Start */}
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5 mb-5">
        <h2 className="font-semibold text-ink-900">Quick start</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Drop-in snippets to get a first masked call running.
        </p>

        <Tabs
          tabs={[
            { id: "js", label: "JavaScript / TypeScript" },
            { id: "kotlin", label: "Kotlin (Android)" },
            { id: "swift", label: "Swift (iOS)" },
          ]}
          active={sdkTab}
          onChange={(id) => setSdkTab(id as SdkTab)}
        />

        <CodeBlock code={activeSnippet} language={activeLang} />
      </section>

      {/* Card 3 — Token Exchange */}
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5">
        <h2 className="font-semibold text-ink-900">Token exchange</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          If you&apos;re not using the SDK, exchange your key + secret for a
          short-lived JWT directly.
        </p>
        <CodeBlock code={CURL_SNIPPET} language="bash" />
      </section>

      {/* Confirm modal */}
      {confirmOpen && (
        <Modal onClose={() => (rotating ? undefined : setConfirmOpen(false))}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-md bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-700" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-900">
                Rotate API credentials?
              </h3>
              <p className="text-sm text-ink-500 mt-1">
                This will invalidate the current key. Any deployed integrations
                will need the new key + secret to continue authenticating.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              type="button"
              disabled={rotating}
              onClick={() => setConfirmOpen(false)}
              className="bg-paper border border-ink-200 text-ink-700 px-3 h-9 rounded-md hover:bg-bone-100 text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={rotating}
              onClick={handleRotate}
              className="bg-red-50 text-red-700 border border-red-200 px-4 h-10 rounded-md hover:bg-red-100 font-medium text-sm disabled:opacity-50"
            >
              {rotating ? "Rotating..." : "Rotate (irreversible)"}
            </button>
          </div>
        </Modal>
      )}

      {/* Credentials modal */}
      {credsOpen && creds && (
        <Modal onClose={() => setCredsOpen(false)}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-4 h-4 text-amber-700" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink-900">
                New credentials
              </h3>
              <p className="text-sm text-red-700 mt-1 font-medium">
                Copy these now. The secret will not be shown again.
              </p>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1">
                API Key
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[12px] text-ink-700 bg-bone-100 border border-ink-200 rounded-md px-3 py-2 flex-1 break-all">
                  {creds.apiKey}
                </code>
                <CopyButton text={creds.apiKey} />
              </div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1">
                API Secret
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[12px] text-ink-700 bg-bone-100 border border-ink-200 rounded-md px-3 py-2 flex-1 break-all">
                  {creds.apiSecret}
                </code>
                <CopyButton text={creds.apiSecret} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end mt-5">
            <button
              type="button"
              onClick={() => setCredsOpen(false)}
              className="bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 text-sm transition-colors"
            >
              I&apos;ve saved them
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
