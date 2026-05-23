"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, Eye, EyeOff } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/lib/auth-store";
import { signup, type SignupResponse } from "@/lib/api";
import { slugify } from "@/lib/format";
import { useToast } from "@/components/toast";
import type { Tier } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SignupDraft {
  // Step 1
  fullName: string;
  email: string;
  companyName: string;
  workspaceSlug: string;
  country: string;
  password: string;
  acceptedTosNdpr: boolean;
  // Step 2
  industry: string;
  expectedSessionsPerDay: string;
  avgSessionLifespan: string;
  regions: string[];
  useCase: string;
  // Step 3
  requestedPoolSize: number;
  carrierMix: string;
  defaultSessionTtlMin: number;
  cooldownMin: number;
  // Step 4
  nccConsent: boolean;
}

const DRAFT_KEY = "relavoi.signup.draft.v1";

const DEFAULT_DRAFT: SignupDraft = {
  fullName: "",
  email: "",
  companyName: "",
  workspaceSlug: "",
  country: "NG",
  password: "",
  acceptedTosNdpr: false,
  industry: "",
  expectedSessionsPerDay: "",
  avgSessionLifespan: "",
  regions: [],
  useCase: "",
  requestedPoolSize: 100,
  carrierMix: "AT only",
  defaultSessionTtlMin: 120,
  cooldownMin: 5,
  nccConsent: false,
};

const INDUSTRIES = [
  "Delivery",
  "Ride-hailing",
  "E-commerce",
  "Healthcare",
  "Logistics",
  "Other",
];
const SESSIONS_OPTIONS = [
  "<500",
  "500-2,000",
  "2,000-5,000",
  "5,000-20,000",
  "20,000+",
] as const;
const LIFESPAN_OPTIONS = ["<1h", "1-3h", "3-12h", "12-24h", "1-7d", ">7d"];
const REGIONS_OPTIONS = ["Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan", "Other"];
const CARRIER_MIX_OPTIONS = [
  "AT only",
  "AT + Twilio failover (20%)",
  "Custom (talk to sales)",
];
const COUNTRY_OPTIONS = [
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "KE", label: "Kenya" },
  { code: "ZA", label: "South Africa" },
];

const STEP_LABELS = ["Company", "Use case", "Numbers", "Review"] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ApiErrorShape {
  response?: { data?: { message?: string; detail?: string; error?: string } };
  message?: string;
}

function extractErrorMessage(err: unknown): string {
  const e = err as ApiErrorShape;
  return (
    e?.response?.data?.message ??
    e?.response?.data?.detail ??
    e?.response?.data?.error ??
    e?.message ??
    "Sign-up failed. Please try again."
  );
}

function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function passwordSegmentColor(score: number, segmentIndex: number): string {
  if (segmentIndex >= score) return "bg-ink-200";
  if (score === 1) return "bg-red-500";
  if (score === 2) return "bg-amber-500";
  if (score === 3) return "bg-amber-500";
  return "bg-signal-500";
}

function recommendTier(sessionsBucket: string): { tier: Tier; reason: string } {
  const order: string[] = [...SESSIONS_OPTIONS];
  const idx = order.indexOf(sessionsBucket);
  if (idx >= order.indexOf("5,000-20,000")) {
    return {
      tier: "ENTERPRISE",
      reason: "High-volume traffic with dedicated pool and priority support.",
    };
  }
  if (idx >= order.indexOf("500-2,000")) {
    return {
      tier: "GROWTH",
      reason: "Mid-scale workloads with elastic pool sizing and analytics.",
    };
  }
  return {
    tier: "STARTER",
    reason: "Get started with a shared pool — upgrade anytime as you scale.",
  };
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isValidSlug(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(s);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const { token, hasHydrated, setSession } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [draft, setDraft] = useState<SignupDraft>(DEFAULT_DRAFT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<SignupResponse | null>(null);

  const formRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SignupDraft>;
        setDraft({ ...DEFAULT_DRAFT, ...parsed });
        if (parsed.workspaceSlug && parsed.companyName) {
          if (slugify(parsed.companyName) !== parsed.workspaceSlug) {
            setSlugTouched(true);
          }
        }
      }
    } catch {
      // ignore corrupt draft
    }
  }, []);

  // Persist draft to localStorage on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // quota or disabled storage — ignore
    }
  }, [draft]);

  // If already authenticated, hop to dashboard.
  useEffect(() => {
    if (hasHydrated && token) router.replace("/dashboard");
  }, [hasHydrated, token, router]);

  const update = useCallback(<K extends keyof SignupDraft>(key: K, value: SignupDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Auto-derive slug from companyName unless user has edited it.
  function onCompanyNameChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setDraft((prev) => ({
      ...prev,
      companyName: v,
      workspaceSlug: slugTouched ? prev.workspaceSlug : slugify(v),
    }));
  }

  function onSlugChange(e: ChangeEvent<HTMLInputElement>) {
    setSlugTouched(true);
    update("workspaceSlug", slugify(e.target.value));
  }

  function toggleRegion(region: string) {
    setDraft((prev) => {
      const has = prev.regions.includes(region);
      return {
        ...prev,
        regions: has ? prev.regions.filter((r) => r !== region) : [...prev.regions, region],
      };
    });
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  function validateStep(s: 1 | 2 | 3 | 4): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!draft.fullName.trim()) e.fullName = "Full name is required.";
      if (!draft.email.trim()) e.email = "Email is required.";
      else if (!isValidEmail(draft.email)) e.email = "Enter a valid email address.";
      if (!draft.companyName.trim()) e.companyName = "Company name is required.";
      if (!draft.workspaceSlug) e.workspaceSlug = "Workspace slug is required.";
      else if (!isValidSlug(draft.workspaceSlug))
        e.workspaceSlug = "Use lowercase letters, digits, or dashes (3-60 chars).";
      if (!draft.country) e.country = "Select a country.";
      if (!draft.password) e.password = "Password is required.";
      else if (scorePassword(draft.password) < 3)
        e.password = "Password is too weak — aim for at least 3 of 4 strength bars.";
      if (!draft.acceptedTosNdpr)
        e.acceptedTosNdpr = "You must accept the Terms of Service and NDPR addendum.";
    }
    if (s === 2) {
      if (!draft.industry) e.industry = "Pick an industry.";
      if (!draft.expectedSessionsPerDay)
        e.expectedSessionsPerDay = "Estimate your sessions per day.";
      if (!draft.avgSessionLifespan)
        e.avgSessionLifespan = "Pick a typical session lifespan.";
      if (draft.regions.length === 0)
        e.regions = "Select at least one region.";
      if (!draft.useCase.trim()) e.useCase = "Briefly describe your use case.";
    }
    if (s === 3) {
      if (draft.requestedPoolSize < 10 || draft.requestedPoolSize > 500)
        e.requestedPoolSize = "Pool size must be between 10 and 500.";
      if (!draft.carrierMix) e.carrierMix = "Select a carrier mix.";
      if (draft.defaultSessionTtlMin < 30 || draft.defaultSessionTtlMin > 1440)
        e.defaultSessionTtlMin = "Session TTL must be between 30 and 1440 minutes.";
      if (draft.cooldownMin < 0 || draft.cooldownMin > 60)
        e.cooldownMin = "Cooldown must be between 0 and 60 minutes.";
    }
    if (s === 4) {
      if (!draft.nccConsent) e.nccConsent = "NCC compliance acknowledgement is required.";
    }
    return e;
  }

  function scrollToFirstError(errMap: Record<string, string>) {
    const first = Object.keys(errMap)[0];
    if (!first) return;
    const el = document.querySelector(`[data-field="${first}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el.querySelector("input, select, textarea, button") as
        | HTMLElement
        | null;
      focusable?.focus();
    } else {
      formRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function onContinue() {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      scrollToFirstError(e);
      return;
    }
    setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
  }

  function onBack() {
    setErrors({});
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));
  }

  async function onSubmit() {
    const e = validateStep(4);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      scrollToFirstError(e);
      return;
    }
    setSubmitting(true);
    try {
      const result = await signup({
        fullName: draft.fullName,
        email: draft.email.trim(),
        password: draft.password,
        companyName: draft.companyName,
        workspaceSlug: draft.workspaceSlug,
        country: draft.country,
        industry: draft.industry,
        useCase: draft.useCase,
        expectedSessionsPerDay: draft.expectedSessionsPerDay,
        avgSessionLifespan: draft.avgSessionLifespan,
        regions: draft.regions,
        requestedPoolSize: draft.requestedPoolSize,
        carrierMix: draft.carrierMix,
        defaultSessionTtlMin: draft.defaultSessionTtlMin,
        cooldownMin: draft.cooldownMin,
        ncc_consent: true,
      });
      setCredentials(result);
    } catch (err) {
      toast.error("Sign-up failed", extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function onCredentialsDismiss() {
    if (!credentials) return;
    setSession({
      token: credentials.accessToken,
      user: credentials.user,
      tenant: credentials.tenant,
    });
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    router.push("/dashboard");
  }

  const passwordScore = scorePassword(draft.password);
  const recommendation = useMemo(
    () => recommendTier(draft.expectedSessionsPerDay),
    [draft.expectedSessionsPerDay],
  );

  return (
    <div className="min-h-screen w-full bg-ink-900 flex items-center justify-center px-4 py-12">
      <div
        ref={formRef}
        className="w-full max-w-2xl bg-paper border border-ink-200 rounded-[10px] shadow-card p-8"
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <BrandMark size={44} />
          <h1 className="mt-4 text-2xl font-semibold text-ink-900 tracking-tight">
            Create your workspace
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            A few details to provision your number pool and get you live.
          </p>
        </div>

        {/* Progress strip */}
        <div className="mt-8 flex items-center justify-between gap-2">
          {STEP_LABELS.map((label, i) => {
            const idx = (i + 1) as 1 | 2 | 3 | 4;
            const isActive = idx === step;
            const isComplete = idx < step;
            const dotClass = isActive
              ? "bg-signal-500"
              : isComplete
                ? "bg-ink-700"
                : "bg-ink-300";
            const textClass = isActive
              ? "text-ink-900 font-medium"
              : isComplete
                ? "text-ink-700"
                : "text-ink-400";
            return (
              <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="flex items-center w-full">
                  <div className={`flex-1 h-px ${i === 0 ? "bg-transparent" : isComplete || isActive ? "bg-ink-700" : "bg-ink-200"}`} />
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${dotClass} ${isActive ? "ring-2 ring-signal-500/30" : ""}`}
                  />
                  <div className={`flex-1 h-px ${i === STEP_LABELS.length - 1 ? "bg-transparent" : isComplete ? "bg-ink-700" : "bg-ink-200"}`} />
                </div>
                <div className={`text-[11px] font-mono uppercase tracking-wider ${textClass}`}>
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="mt-8 space-y-5">
          {step === 1 && (
            <Step1
              draft={draft}
              errors={errors}
              update={update}
              onCompanyNameChange={onCompanyNameChange}
              onSlugChange={onSlugChange}
              passwordScore={passwordScore}
              showPassword={showPassword}
              toggleShowPassword={() => setShowPassword((v) => !v)}
            />
          )}
          {step === 2 && (
            <Step2
              draft={draft}
              errors={errors}
              update={update}
              toggleRegion={toggleRegion}
              recommendation={recommendation}
            />
          )}
          {step === 3 && <Step3 draft={draft} errors={errors} update={update} />}
          {step === 4 && (
            <Step4
              draft={draft}
              errors={errors}
              update={update}
              recommendation={recommendation}
            />
          )}
        </div>

        {/* Nav */}
        <div className="mt-8 pt-6 border-t border-ink-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={step === 1 || submitting}
            className="bg-paper border border-ink-200 text-ink-700 px-4 h-10 rounded-md hover:bg-bone-100 transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={onContinue}
              className="bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 transition-colors inline-flex items-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 transition-colors inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating workspace…" : "Create workspace"}
            </button>
          )}
        </div>

        <div className="mt-6 text-center text-[12px] text-ink-500">
          Already have an account?{" "}
          <Link href="/login" className="text-ink-900 font-medium hover:text-signal-700">
            Sign in
          </Link>
        </div>
      </div>

      {credentials && (
        <CredentialsModal credentials={credentials} onDismiss={onCredentialsDismiss} />
      )}
    </div>
  );
}

// ─── Step 1 ─────────────────────────────────────────────────────────────────

function Step1({
  draft,
  errors,
  update,
  onCompanyNameChange,
  onSlugChange,
  passwordScore,
  showPassword,
  toggleShowPassword,
}: {
  draft: SignupDraft;
  errors: Record<string, string>;
  update: <K extends keyof SignupDraft>(k: K, v: SignupDraft[K]) => void;
  onCompanyNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSlugChange: (e: ChangeEvent<HTMLInputElement>) => void;
  passwordScore: number;
  showPassword: boolean;
  toggleShowPassword: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name" error={errors.fullName} fieldKey="fullName">
          <input
            type="text"
            autoComplete="name"
            value={draft.fullName}
            onChange={(e) => update("fullName", e.target.value)}
            className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
          />
        </Field>
        <Field label="Work email" error={errors.email} fieldKey="email">
          <input
            type="email"
            autoComplete="email"
            value={draft.email}
            onChange={(e) => update("email", e.target.value)}
            className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
          />
        </Field>
      </div>

      <Field label="Company name" error={errors.companyName} fieldKey="companyName">
        <input
          type="text"
          value={draft.companyName}
          onChange={onCompanyNameChange}
          className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
        />
      </Field>

      <Field
        label="Workspace slug"
        error={errors.workspaceSlug}
        fieldKey="workspaceSlug"
        hint="Used in URLs and API references. Lowercase letters, digits, and dashes."
      >
        <div className="flex items-center">
          <span className="inline-flex items-center h-9 px-3 border border-r-0 border-ink-200 rounded-l-md bg-bone-100 text-[12px] font-mono text-ink-500">
            relavoi.com/
          </span>
          <input
            type="text"
            value={draft.workspaceSlug}
            onChange={onSlugChange}
            className="flex-1 h-9 px-3 border border-ink-200 rounded-r-md text-[13px] font-mono focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
          />
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Country" error={errors.country} fieldKey="country">
          <select
            value={draft.country}
            onChange={(e) => update("country", e.target.value)}
            className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] bg-paper focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Password" error={errors.password} fieldKey="password">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={draft.password}
              onChange={(e) => update("password", e.target.value)}
              className="w-full h-9 pl-3 pr-10 border border-ink-200 rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-400 hover:text-ink-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
      </div>

      <div>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${passwordSegmentColor(passwordScore, i)} transition-colors`}
            />
          ))}
        </div>
        <div className="mt-1.5 text-[11px] text-ink-500 font-mono">
          Strength: {passwordScore}/4 — uses ≥8 chars, uppercase, digit, and symbol checks.
        </div>
      </div>

      <div data-field="acceptedTosNdpr">
        <label className="flex items-start gap-2.5 text-[13px] text-ink-700 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.acceptedTosNdpr}
            onChange={(e) => update("acceptedTosNdpr", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-ink-300 text-signal-500 focus:ring-signal-500"
          />
          <span>
            I agree to the{" "}
            <a href="#" className="text-ink-900 underline hover:text-signal-700">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-ink-900 underline hover:text-signal-700">
              NDPR Data Processing Addendum
            </a>
            .
          </span>
        </label>
        {errors.acceptedTosNdpr && (
          <div className="mt-1 text-[12px] text-red-700">{errors.acceptedTosNdpr}</div>
        )}
      </div>
    </>
  );
}

// ─── Step 2 ─────────────────────────────────────────────────────────────────

function Step2({
  draft,
  errors,
  update,
  toggleRegion,
  recommendation,
}: {
  draft: SignupDraft;
  errors: Record<string, string>;
  update: <K extends keyof SignupDraft>(k: K, v: SignupDraft[K]) => void;
  toggleRegion: (r: string) => void;
  recommendation: { tier: Tier; reason: string };
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Industry" error={errors.industry} fieldKey="industry">
          <select
            value={draft.industry}
            onChange={(e) => update("industry", e.target.value)}
            className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] bg-paper focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
          >
            <option value="">Select industry…</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Expected sessions per day"
          error={errors.expectedSessionsPerDay}
          fieldKey="expectedSessionsPerDay"
        >
          <select
            value={draft.expectedSessionsPerDay}
            onChange={(e) => update("expectedSessionsPerDay", e.target.value)}
            className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] bg-paper focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
          >
            <option value="">Estimate volume…</option>
            {SESSIONS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Average session lifespan"
        error={errors.avgSessionLifespan}
        fieldKey="avgSessionLifespan"
        hint="How long a typical mask stays usable before it expires."
      >
        <select
          value={draft.avgSessionLifespan}
          onChange={(e) => update("avgSessionLifespan", e.target.value)}
          className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] bg-paper focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
        >
          <option value="">Pick a range…</option>
          {LIFESPAN_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <div data-field="regions">
        <div className="text-[12px] font-medium text-ink-700">Operating regions</div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REGIONS_OPTIONS.map((r) => {
            const checked = draft.regions.includes(r);
            return (
              <label
                key={r}
                className={`flex items-center gap-2 px-3 h-9 rounded-md border text-[13px] cursor-pointer transition-colors ${
                  checked
                    ? "border-signal-500 bg-signal-500/10 text-ink-900"
                    : "border-ink-200 bg-paper text-ink-700 hover:bg-bone-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRegion(r)}
                  className="w-4 h-4 rounded border-ink-300 text-signal-500 focus:ring-signal-500"
                />
                {r}
              </label>
            );
          })}
        </div>
        {errors.regions && (
          <div className="mt-1 text-[12px] text-red-700">{errors.regions}</div>
        )}
      </div>

      <Field
        label="Describe your use case"
        error={errors.useCase}
        fieldKey="useCase"
        hint="A sentence or two: who calls whom, and what privacy guarantee you need."
      >
        <textarea
          rows={4}
          value={draft.useCase}
          onChange={(e) => update("useCase", e.target.value)}
          className="w-full px-3 py-2 border border-ink-200 rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors resize-y"
        />
      </Field>

      {draft.expectedSessionsPerDay && (
        <div className="bg-bone-100 border border-ink-200 rounded-md p-3 flex items-start gap-3">
          <TierBadge tier={recommendation.tier} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-mono uppercase tracking-wider text-ink-500">
              Recommended tier
            </div>
            <div className="text-[13px] text-ink-700 mt-0.5">{recommendation.reason}</div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Step 3 ─────────────────────────────────────────────────────────────────

function Step3({
  draft,
  errors,
  update,
}: {
  draft: SignupDraft;
  errors: Record<string, string>;
  update: <K extends keyof SignupDraft>(k: K, v: SignupDraft[K]) => void;
}) {
  return (
    <>
      <SliderField
        label="Requested pool size"
        hint="Numbers provisioned in your starter pool. Pool auto-scales above this."
        value={draft.requestedPoolSize}
        min={10}
        max={500}
        step={10}
        suffix="numbers"
        onChange={(v) => update("requestedPoolSize", v)}
        error={errors.requestedPoolSize}
        fieldKey="requestedPoolSize"
      />

      <Field label="Carrier mix" error={errors.carrierMix} fieldKey="carrierMix">
        <select
          value={draft.carrierMix}
          onChange={(e) => update("carrierMix", e.target.value)}
          className="w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] bg-paper focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
        >
          {CARRIER_MIX_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <SliderField
        label="Default session TTL"
        hint="Hard timeout for a masking session after creation."
        value={draft.defaultSessionTtlMin}
        min={30}
        max={1440}
        step={30}
        suffix="min"
        onChange={(v) => update("defaultSessionTtlMin", v)}
        error={errors.defaultSessionTtlMin}
        fieldKey="defaultSessionTtlMin"
      />

      <SliderField
        label="Cooldown after expiry"
        hint="How long a proxy number is held back from re-allocation."
        value={draft.cooldownMin}
        min={0}
        max={60}
        step={1}
        suffix="min"
        onChange={(v) => update("cooldownMin", v)}
        error={errors.cooldownMin}
        fieldKey="cooldownMin"
      />
    </>
  );
}

// ─── Step 4 ─────────────────────────────────────────────────────────────────

function Step4({
  draft,
  errors,
  update,
  recommendation,
}: {
  draft: SignupDraft;
  errors: Record<string, string>;
  update: <K extends keyof SignupDraft>(k: K, v: SignupDraft[K]) => void;
  recommendation: { tier: Tier; reason: string };
}) {
  return (
    <>
      <SummarySection title="Company">
        <SummaryRow label="Full name" value={draft.fullName} />
        <SummaryRow label="Email" value={draft.email} />
        <SummaryRow label="Company" value={draft.companyName} />
        <SummaryRow label="Workspace" value={draft.workspaceSlug} mono />
        <SummaryRow label="Country" value={draft.country} mono />
      </SummarySection>

      <SummarySection title="Use case">
        <SummaryRow label="Industry" value={draft.industry} />
        <SummaryRow label="Volume" value={draft.expectedSessionsPerDay} />
        <SummaryRow label="Lifespan" value={draft.avgSessionLifespan} />
        <SummaryRow
          label="Regions"
          value={draft.regions.length > 0 ? draft.regions.join(", ") : "—"}
        />
        <SummaryRow label="Description" value={draft.useCase} />
        <SummaryRow
          label="Recommended tier"
          value={recommendation.tier}
          renderValue={() => <TierBadge tier={recommendation.tier} />}
        />
      </SummarySection>

      <SummarySection title="Numbers">
        <SummaryRow label="Pool size" value={`${draft.requestedPoolSize} numbers`} mono />
        <SummaryRow label="Carrier mix" value={draft.carrierMix} />
        <SummaryRow label="Session TTL" value={`${draft.defaultSessionTtlMin} min`} mono />
        <SummaryRow label="Cooldown" value={`${draft.cooldownMin} min`} mono />
      </SummarySection>

      <SummarySection title="Account credentials">
        <div className="text-[13px] text-ink-500">
          Your API key and secret will be generated when you create the workspace, and shown
          to you exactly once.
        </div>
      </SummarySection>

      <div data-field="nccConsent">
        <label className="flex items-start gap-2.5 text-[13px] text-ink-700 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.nccConsent}
            onChange={(e) => update("nccConsent", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-ink-300 text-signal-500 focus:ring-signal-500"
          />
          <span>
            I confirm Relavoi will provision numbers through licensed CPaaS providers in
            compliance with NCC type-approval requirements.
          </span>
        </label>
        {errors.nccConsent && (
          <div className="mt-1 text-[12px] text-red-700">{errors.nccConsent}</div>
        )}
      </div>
    </>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  error,
  fieldKey,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  fieldKey: string;
  children: React.ReactNode;
}) {
  return (
    <div data-field={fieldKey}>
      <label className="block text-[12px] font-medium text-ink-700 mb-1.5">{label}</label>
      {children}
      {hint && !error && <div className="mt-1 text-[11px] text-ink-500">{hint}</div>}
      {error && <div className="mt-1 text-[12px] text-red-700">{error}</div>}
    </div>
  );
}

function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  error,
  fieldKey,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
  error?: string;
  fieldKey: string;
}) {
  return (
    <div data-field={fieldKey}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label className="text-[12px] font-medium text-ink-700">{label}</label>
        <span className="text-[13px] font-mono text-ink-900 tabular-nums">
          {value} <span className="text-ink-500">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-signal-500"
      />
      <div className="flex justify-between text-[10px] font-mono text-ink-400 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {hint && !error && <div className="mt-1 text-[11px] text-ink-500">{hint}</div>}
      {error && <div className="mt-1 text-[12px] text-red-700">{error}</div>}
    </div>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bone-100 border border-ink-200 rounded-md p-4">
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
  renderValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  renderValue?: () => React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-[13px]">
      <div className="w-32 flex-shrink-0 text-ink-500">{label}</div>
      <div className={`flex-1 min-w-0 text-ink-900 break-words ${mono ? "font-mono" : ""}`}>
        {renderValue ? renderValue() : value || "—"}
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const styles: Record<Tier, string> = {
    STARTER: "bg-ink-200 text-ink-700",
    GROWTH: "bg-blue-500/15 text-blue-700",
    ENTERPRISE: "bg-signal-500/20 text-signal-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md font-mono text-[11px] uppercase tracking-wider font-medium ${styles[tier]}`}
    >
      {tier}
    </span>
  );
}

// ─── Credentials modal ──────────────────────────────────────────────────────

function CredentialsModal({
  credentials,
  onDismiss,
}: {
  credentials: SignupResponse;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-paper border border-ink-200 rounded-[10px] shadow-card p-6">
        <div className="text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-signal-500/15 flex items-center justify-center">
            <Check className="w-5 h-5 text-signal-700" />
          </div>
          <h2 className="mt-3 text-lg font-semibold text-ink-900">Workspace created</h2>
          <p className="mt-1 text-sm text-ink-500">
            Save these credentials — they will not be shown again.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          <CredentialRow label="API key" value={credentials.apiKey} />
          <CredentialRow label="API secret" value={credentials.apiSecret} />
        </div>

        <div className="mt-4 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-[12px] text-red-700">
          Treat the secret like a password. Store it in your backend secret manager — it is
          required to authenticate SDK and API requests.
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 w-full bg-ink-900 text-paper h-10 rounded-md font-medium hover:bg-ink-800 transition-colors"
        >
          I&apos;ve saved them, continue
        </button>
      </div>
    </div>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — older browsers
    }
  }
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1">
        {label}
      </div>
      <div className="flex items-stretch">
        <code className="flex-1 min-w-0 bg-bone-100 border border-ink-200 rounded-l-md px-3 py-2 text-[12px] font-mono text-ink-900 break-all">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="px-3 border border-l-0 border-ink-200 rounded-r-md bg-paper text-ink-700 hover:bg-bone-100 transition-colors inline-flex items-center gap-1.5 text-[12px]"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="w-4 h-4 text-signal-700" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
