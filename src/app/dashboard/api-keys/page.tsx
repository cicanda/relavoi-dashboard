"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, RefreshCw, X } from "lucide-react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  generateApiKeys,
  getLiveRequirements,
  activateLiveMode,
  type LiveRequirement,
} from "@/lib/api";
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

      <KeyCards />

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

    </div>
  );
}

// ─── Sandbox / live key management ──────────────────────────────────────────

/**
 * Two key sections. Sandbox is always available; live is gated behind
 * activation, and the gate shows exactly what is still missing rather than a
 * generic refusal -- a tenant who cannot go live should be able to see why
 * without reading the docs.
 */
function KeyCards() {
  const { tenant, setTenant } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [creds, setCreds] = useState<{ apiKey: string; apiSecret: string; mode: string } | null>(
    null,
  );

  const reqQuery = useQuery({
    queryKey: ["live-requirements"],
    queryFn: getLiveRequirements,
  });
  const mode = reqQuery.data?.mode ?? tenant?.mode ?? "sandbox";
  const requirements: LiveRequirement[] = reqQuery.data?.requirements ?? [];
  const allMet = requirements.length > 0 && requirements.every((r) => r.met);

  const genMut = useMutation({
    mutationFn: (m: "sandbox" | "live") => generateApiKeys(m),
    onSuccess: (data) => {
      setCreds(data);
      void qc.invalidateQueries({ queryKey: ["live-requirements"] });
    },
    onError: (err: unknown) => toast.error("Could not generate keys", extractError(err)),
  });

  const activateMut = useMutation({
    mutationFn: activateLiveMode,
    onSuccess: (data) => {
      if (tenant) setTenant({ ...tenant, mode: data.mode });
      toast.success("Live mode activated", "You can now generate live API keys.");
      void qc.invalidateQueries({ queryKey: ["live-requirements"] });
    },
    onError: (err: unknown) => toast.error("Could not activate live mode", extractError(err)),
  });

  return (
    <>
      <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5 mb-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-ink-600" />
          <h2 className="font-semibold text-ink-900">Sandbox keys</h2>
          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-mono text-[10px] uppercase tracking-wider">
            rk_test_
          </span>
        </div>
        <p className="text-sm text-ink-500 mt-1">
          Free. Sessions and webhooks behave normally, but no real calls are placed and nothing is
          billed.
        </p>
        <button
          type="button"
          onClick={() => genMut.mutate("sandbox")}
          disabled={genMut.isPending}
          className="mt-4 bg-ink-900 text-paper px-3 h-9 rounded-md text-sm font-medium hover:bg-ink-800 transition-colors disabled:opacity-60"
        >
          {tenant?.hasSandboxKeys ? "Regenerate sandbox keys" : "Generate sandbox keys"}
        </button>
        {tenant?.hasSandboxKeys && (
          <p className="text-xs text-ink-500 mt-2">
            Regenerating immediately invalidates the previous sandbox key.
          </p>
        )}
      </section>

      <section
        className={`bg-paper border rounded-[10px] shadow-card p-5 mb-5 ${
          mode === "live" ? "border-ink-200" : "border-ink-200 opacity-90"
        }`}
      >
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-ink-600" />
          <h2 className="font-semibold text-ink-900">Live keys</h2>
          <span className="px-1.5 py-0.5 rounded bg-signal-500/15 text-signal-700 font-mono text-[10px] uppercase tracking-wider">
            rk_live_
          </span>
        </div>
        <p className="text-sm text-ink-500 mt-1">
          Routes through the carrier. Calls connect for real and are billed.
        </p>

        {mode === "live" ? (
          <button
            type="button"
            onClick={() => genMut.mutate("live")}
            disabled={genMut.isPending}
            className="mt-4 bg-ink-900 text-paper px-3 h-9 rounded-md text-sm font-medium hover:bg-ink-800 transition-colors disabled:opacity-60"
          >
            {tenant?.hasLiveKeys ? "Regenerate live keys" : "Generate live keys"}
          </button>
        ) : (
          <div className="mt-4">
            <div className="text-[12px] font-medium text-ink-700 mb-2">
              Before you can go live:
            </div>
            <ul className="space-y-1.5 mb-4">
              {reqQuery.isLoading && <li className="text-sm text-ink-500">Checking…</li>}
              {requirements.map((r) => (
                <li key={r.key} className="flex items-start gap-2 text-sm">
                  {r.met ? (
                    <Check className="w-4 h-4 text-signal-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  )}
                  <span
                    className={`${r.met ? "text-ink-700" : "text-ink-600"} flex flex-wrap items-center gap-x-2 min-w-0`}
                  >
                    <span className="min-w-0">{r.label}</span>
                    {/* Verification is the one requirement with somewhere to go. */}
                    {r.key === "kyb_approved" && !r.met && (
                      <a
                        href="/dashboard/settings#business-verification"
                        className="font-medium text-signal-600 underline hover:no-underline"
                      >
                        Verify your business
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => activateMut.mutate()}
              disabled={!allMet || activateMut.isPending}
              className="bg-ink-900 text-paper px-3 h-9 rounded-md text-sm font-medium hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {activateMut.isPending ? "Activating…" : "Activate live mode"}
            </button>
          </div>
        )}
      </section>

      {creds && (
        <Modal onClose={() => setCreds(null)}>
          <h3 className="font-semibold text-ink-900">
            {creds.mode === "live" ? "Live" : "Sandbox"} credentials
          </h3>
          <p className="text-sm text-ink-500 mt-1">
            The secret is shown once and is not recoverable. Store it somewhere safe before closing.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <div className="text-[12px] font-medium text-ink-700 mb-1">API key</div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[12px] bg-bone-100 border border-ink-200 rounded-md px-3 py-2 break-all flex-1">
                  {creds.apiKey}
                </code>
                <CopyButton text={creds.apiKey} />
              </div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-ink-700 mb-1">API secret</div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[12px] bg-bone-100 border border-ink-200 rounded-md px-3 py-2 break-all flex-1">
                  {creds.apiSecret}
                </code>
                <CopyButton text={creds.apiSecret} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreds(null)}
            className="mt-5 bg-ink-900 text-paper px-4 h-9 rounded-md text-sm font-medium hover:bg-ink-800"
          >
            I've stored them
          </button>
        </Modal>
      )}
    </>
  );
}

function extractError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string } }; message?: string };
  return e?.response?.data?.detail ?? e?.message ?? "Something went wrong.";
}
