"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  MessageSquare,
  Phone,
  Radio,
  ShieldCheck,
  Star,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";

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
const ANDROID_INSTALL = `// settings.gradle.kts
dependencyResolutionManagement {
  repositories {
    mavenCentral()
    maven("https://maven.relavoi.com/releases")
  }
}

// app/build.gradle.kts
dependencies {
  implementation("com.relavoi:sdk:0.1.0")
}`;

const IOS_INSTALL = `// Package.swift
dependencies: [
  .package(url: "https://github.com/relavoi/relavoi-ios-sdk", from: "0.1.0")
]

.target(
  name: "MyApp",
  dependencies: [
    .product(name: "RelavoiSDK", package: "relavoi-ios-sdk")
  ]
)`;

const ANDROID_INIT = `// Application.onCreate()
Relavoi.initialize(
  context = this,
  apiKey = BuildConfig.RELAVOI_API_KEY,
  apiSecret = BuildConfig.RELAVOI_API_SECRET,
  tenantId = "{tenant.id}",
)`;

const IOS_INIT = `// AppDelegate
Relavoi.initialize(
  apiKey: Bundle.main.infoDictionary?["RelavoiApiKey"] as! String,
  apiSecret: Bundle.main.infoDictionary?["RelavoiApiSecret"] as! String,
  tenantId: "{tenant.id}"
)`;

// ─── Features ────────────────────────────────────────────────────────────────
interface FeatureTile {
  title: string;
  description: string;
  icon: LucideIcon;
}

const FEATURES: FeatureTile[] = [
  {
    title: "Call Masking",
    description: "Connect users without revealing real numbers",
    icon: Phone,
  },
  {
    title: "SMS Masking",
    description: "Two-way SMS through the same proxy",
    icon: MessageSquare,
  },
  {
    title: "Call Verification",
    description: "Native banners show when a call is from your platform",
    icon: ShieldCheck,
  },
  {
    title: "Push Notifications",
    description: "Branded FCM/APNs payloads on incoming calls",
    icon: Bell,
  },
  {
    title: "Real-time Events",
    description: "WebSocket stream of session and call events",
    icon: Radio,
  },
  {
    title: "Post-call Feedback",
    description: "Drop-in rating + issue reporter components",
    icon: Star,
  },
];

// ─── Page ────────────────────────────────────────────────────────────────────
type InstallTab = "android" | "ios" | "web";

export default function SdkDocsPage() {
  const { tenant } = useAuth();
  const toast = useToast();

  const [installTab, setInstallTab] = useState<InstallTab>("android");
  const [notifyEmail, setNotifyEmail] = useState("");

  const tenantId = tenant?.id ?? "YOUR_TENANT_ID";

  const androidInit = useMemo(
    () => ANDROID_INIT.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );
  const iosInit = useMemo(
    () => IOS_INIT.replaceAll("{tenant.id}", tenantId),
    [tenantId],
  );

  function onNotifyMe() {
    setNotifyEmail("");
    toast.success("We'll let you know");
  }

  function onApiRef() {
    toast.info("Coming soon");
  }

  function onPostman() {
    toast.info("Coming soon");
  }

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
            { id: "android", label: "Android (Gradle)" },
            { id: "ios", label: "iOS (Swift Package Manager)" },
            { id: "web", label: "Web (coming soon)" },
          ]}
          active={installTab}
          onChange={(id) => setInstallTab(id as InstallTab)}
        />

        {installTab === "android" && (
          <CodeBlock code={ANDROID_INSTALL} language="kotlin" />
        )}
        {installTab === "ios" && (
          <CodeBlock code={IOS_INSTALL} language="swift" />
        )}
        {installTab === "web" && (
          <div className="bg-bone-50 border border-dashed border-ink-300 rounded-2xl p-8 flex flex-col items-center text-center">
            <div className="section-title mb-1">
              Web SDK coming soon
            </div>
            <p className="text-[13px] text-ink-500 max-w-sm mb-4">
              Drop your email to hear when the browser SDK is ready.
            </p>
            <div className="flex items-stretch gap-2 w-full max-w-sm">
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="you@company.com"
                className="field flex-1"
              />
              <button
                type="button"
                onClick={onNotifyMe}
                className="btn btn-primary btn-sm"
              >
                Notify me
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Card 3 — Initialize */}
      <section className="card p-5 mb-5">
        <h2 className="section-title">Initialize</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          After installation, initialize once at app startup with your API key,
          secret, and tenant ID.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="eyebrow mb-2">
              Android
            </div>
            <CodeBlock code={androidInit} language="kotlin" />
          </div>
          <div>
            <div className="eyebrow mb-2">
              iOS
            </div>
            <CodeBlock code={iosInit} language="swift" />
          </div>
        </div>
      </section>

      {/* Card 4 — Features */}
      <section className="card p-5 mb-5">
        <h2 className="section-title">What you get out of the box</h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          Every SDK release ships these capabilities by default.
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
          Deep dives, references, and tooling.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onApiRef();
            }}
            className="btn btn-secondary btn-sm"
          >
            View full API reference
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onPostman();
            }}
            className="btn btn-secondary btn-sm"
          >
            Open in Postman
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>
    </div>
  );
}
