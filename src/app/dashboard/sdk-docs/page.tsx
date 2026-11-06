"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Phone,
  Radio,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import {
  ANDROID_INSTALL,
  FLUTTER_INSTALL,
  IOS_INSTALL,
  SDK_RELEASES,
} from "@/lib/sdk-releases";

// ─── Copy button ─────────────────────────────────────────────────────────────
function CopyButton({
  text,
  className = "",
  variant = "muted",
}: {
  text: string;
  className?: string;
  variant?: "muted" | "dark";
}) {
  const [copied, setCopied] = useState(false);
  const color =
    variant === "dark"
      ? "text-ink-400 hover:text-paper"
      : "text-ink-500 hover:text-ink-900";
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
      className={`inline-flex items-center gap-1.5 min-h-11 -my-3.5 lg:min-h-0 lg:my-0 text-[11px] font-mono uppercase tracking-wider transition-colors ${color} ${className}`}
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
        <CopyButton text={content} variant="dark" />
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

// ─── Snippets ────────────────────────────────────────────────────────────────
//
// The install snippets live in lib/sdk-releases.ts, with the versions they are
// built from. These are the init ones.
//
// From 0.3.0 the SDKs take a token provider: your backend holds the secret and
// mints a short-lived token for one user, and the app hands that to the SDK.
// The key and secret form still works and is deprecated.
const ANDROID_INIT = `// Application.onCreate()
Relavoi.initialize(
  context = applicationContext,
  tenantId = "{tenant.id}",
  // Asks YOUR backend, which holds the API secret and calls
  // POST /v1/auth/sdk-token. Nothing secret is compiled into this app.
  tokenProvider = { myBackend.relavoiToken() },
)`;

const IOS_INIT = `// AppDelegate / @main App.init
Relavoi.initialize(tenantId: "{tenant.id}") {
  // Asks YOUR backend, which holds the API secret and calls
  // POST /v1/auth/sdk-token. Nothing secret is compiled into this app.
  let t = try await MyBackend.relavoiToken()
  return RelavoiToken(accessToken: t.accessToken, expiresIn: t.expiresIn)
}`;

const FLUTTER_INIT = `// main() before runApp
await Relavoi.initialize(
  tenantId: '{tenant.id}',
  // Asks YOUR backend, which holds the API secret and calls
  // POST /v1/auth/sdk-token. Nothing secret is compiled into this app.
  tokenProvider: () async => myBackend.relavoiToken(),
);`;

/** What the tenant's own backend runs, which is where the secret stays. */
const BACKEND_MINT = `// On YOUR server, where the API secret lives.
const tenant = await fetch("https://api.relavoi.com/v1/auth/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ apiKey: RELAVOI_API_KEY, apiSecret: RELAVOI_API_SECRET }),
}).then((r) => r.json());

// One user, narrow scopes, fifteen minutes.
const device = await fetch("https://api.relavoi.com/v1/auth/sdk-token", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: \`Bearer \${tenant.accessToken}\`,
  },
  body: JSON.stringify({
    userPhone: "+2349000000001",
    scope: ["sessions:verify", "sessions:read", "devices:write"],
  }),
}).then((r) => r.json());

return device; // { accessToken, expiresIn, scope, subject }`;

// ─── Features ────────────────────────────────────────────────────────────────
interface FeatureTile {
  title: string;
  description: string;
  icon: LucideIcon;
}

const FEATURES: FeatureTile[] = [
  {
    title: "Call Masking",
    description: "Create a session, get a proxy number, connect two people",
    icon: Phone,
  },
  {
    title: "Call Verification",
    description: "Tell the user whether the call really came from you",
    icon: ShieldCheck,
  },
  {
    title: "Real-time Events",
    description: "WebSocket stream of session and call events",
    icon: Radio,
  },
];

// ─── Page ────────────────────────────────────────────────────────────────────
type InstallTab = "android" | "ios" | "flutter";

/** Published on docs.relavoi.com, generated from the backend's openapi.yaml. */
const API_REFERENCE_URL = "https://docs.relavoi.com/api-reference/sessions";
const POSTMAN_COLLECTION_URL =
  "https://docs.relavoi.com/relavoi.postman_collection.json";
const POSTMAN_ENVIRONMENT_URL =
  "https://docs.relavoi.com/relavoi.postman_environment.json";
const POSTMAN_GUIDE_URL = "https://docs.relavoi.com/api-reference/tools";

export default function SdkDocsPage() {
  const { tenant } = useAuth();

  const [installTab, setInstallTab] = useState<InstallTab>("android");

  const tenantId = tenant?.id ?? "YOUR_TENANT_ID";

  const androidInit = useMemo(
    () => ANDROID_INIT.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );
  const iosInit = useMemo(
    () => IOS_INIT.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );
  const flutterInit = useMemo(
    () => FLUTTER_INIT.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );

  return (
    <div>
      <PageHeader
        title="SDK & Docs"
        description="Everything you need to integrate Relavoi into your apps"
      />

      {/* Card 1 — Tenant ID */}
      <section className="card p-5 mb-5">
        <h2 className="section-title">Your tenant ID</h2>
        <p className="text-sm text-ink-500 mt-1 mb-3">
          Required to initialize the SDK on iOS/Android.
        </p>
        <div className="flex items-center gap-3">
          <div className="bg-bone-50 border border-ink-200 rounded-xl p-3 font-mono text-[12px] text-ink-700 flex-1 break-all">
            {tenantId}
          </div>
          <CopyButton text={tenantId} />
        </div>
      </section>

      {/* Card 2 — Installation */}
      <section className="card p-5 mb-5">
        <h2 className="section-title">Installation</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Add the Relavoi SDK to your project.
        </p>

        <Tabs
          tabs={[
            { id: "android", label: `Android ${SDK_RELEASES.android.version}` },
            { id: "ios", label: `iOS ${SDK_RELEASES.ios.version}` },
            { id: "flutter", label: `Flutter ${SDK_RELEASES.flutter.version}` },
          ]}
          active={installTab}
          onChange={(id) => setInstallTab(id as InstallTab)}
        />

        {installTab === "android" && (
          <>
            <CodeBlock code={ANDROID_INSTALL} language="kotlin" />
            <p className="text-[13px] text-ink-500 mt-3">
              JitPack builds the public repository at the tag, which is the
              interim distribution until the SDK is on Maven Central.{" "}
              <code className="font-mono text-[12px]">google()</code> is
              required in the repository list: the SDK depends on
              firebase-bom, which only Google&apos;s repository serves.
            </p>
          </>
        )}
        {installTab === "ios" && (
          <CodeBlock code={IOS_INSTALL} language="swift" />
        )}
        {installTab === "flutter" && (
          <>
            <CodeBlock code={FLUTTER_INSTALL} language="yaml" />
            <p className="text-[13px] text-ink-500 mt-3">
              A git dependency pinned to a tag, until the package is on
              pub.dev.
            </p>
          </>
        )}
      </section>

      {/* Card 3 — Initialize */}
      <section className="card p-5 mb-5">
        <h2 className="section-title">Initialize</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Once at app startup, with your tenant ID and a token provider.
        </p>

        <div className="callout mb-4 border-brand-amber/30 bg-brand-amber/10">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-medium text-[14px] mb-1">
              The secret stays on your server
            </div>
            <p className="text-[13px]">
              Anything compiled into an app can be read back out of it. A live
              API secret in a published build lets anyone create sessions
              billed to you, and list every session and call on your workspace.
            </p>
            <p className="text-[13px] mt-2">
              So from SDK 0.3.0 the app holds no secret at all: your backend
              mints a short-lived token for one user and the app passes it
              through. The older{" "}
              <code className="font-mono text-[12px]">apiKey</code> and{" "}
              <code className="font-mono text-[12px]">apiSecret</code> form
              still works and is deprecated; use it with a sandbox key while
              you develop.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="eyebrow mb-2">Android</div>
            <CodeBlock code={androidInit} language="kotlin" />
          </div>
          <div>
            <div className="eyebrow mb-2">iOS</div>
            <CodeBlock code={iosInit} language="swift" />
          </div>
          <div>
            <div className="eyebrow mb-2">Flutter</div>
            <CodeBlock code={flutterInit} language="dart" />
          </div>
          <div>
            <div className="eyebrow mb-2">Your backend</div>
            <CodeBlock code={BACKEND_MINT} language="javascript" />
          </div>
        </div>

        <p className="text-[13px] text-ink-500 mt-3">
          A device token reaches verify, its own user&apos;s sessions, and
          device registration. It cannot create a session, read the workspace,
          touch billing or mint another token.{" "}
          <a
            href="https://docs.relavoi.com/guides/sdk-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            How it works
          </a>
          .
        </p>
      </section>

      {/* Card 4 — Features */}
      <section className="card p-5 mb-5">
        <h2 className="section-title">What you get out of the box</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Verified against the released SDKs on all three platforms. Anything
          not listed here is not in them.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="border border-ink-200 rounded-2xl p-4 flex items-start gap-3 bg-paper lift hover:border-ink-300"
              >
                <div className="w-10 h-10 rounded-full bg-bone-100 ring-1 ring-ink-900/5 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-ink-600" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-[15px] tracking-[-0.01em] text-ink-900">
                    {f.title}
                  </div>
                  <div className="text-[13px] text-ink-500 mt-1">{f.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Card 5 — Resources */}
      <section className="card p-5">
        <h2 className="section-title">Resources</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          The reference, and the collection to try it with.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={API_REFERENCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            View full API reference
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href={POSTMAN_COLLECTION_URL}
            download="relavoi.postman_collection.json"
            className="btn btn-secondary btn-sm"
          >
            Download Postman collection
            <Download className="w-3.5 h-3.5" />
          </a>
          <a
            href={POSTMAN_ENVIRONMENT_URL}
            download="relavoi.postman_environment.json"
            className="btn btn-secondary btn-sm"
          >
            Postman environment
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-[13px] text-ink-500 mt-3">
          Import both files, run{" "}
          <span className="font-mono text-[12px]">Authentication</span> &rarr;
          the token request, and paste the{" "}
          <span className="font-mono text-[12px]">accessToken</span> into the
          environment. The environment ships with empty, masked variables and no
          secrets.{" "}
          <a
            href={POSTMAN_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Full instructions
          </a>
          .
        </p>
      </section>
    </div>
  );
}
