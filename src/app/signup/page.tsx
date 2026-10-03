"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/lib/auth-store";
import { signup } from "@/lib/api";
import { useToast } from "@/components/toast";

// Signup asks four questions and nothing else. Industry, regions, volumes and
// pool sizing used to live here across a four-step wizard; they are workspace
// configuration, not a precondition for seeing the product, so they moved to
// Settings → Workspace Setup where a tenant fills them in when it matters.
//
// No API credentials are minted here either. The dashboard issues them on
// request, so a long-lived secret is never handed to someone still looking
// around.

const MIN_PASSWORD = 12;

interface Draft {
  name: string;
  email: string;
  companyName: string;
  password: string;
}

const EMPTY: Draft = { name: "", email: "", companyName: "", password: "" };

function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= MIN_PASSWORD) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function passwordSegmentColor(score: number, segmentIndex: number): string {
  if (segmentIndex >= score) return "bg-ink-200";
  if (score === 1) return "bg-red-500";
  if (score <= 3) return "bg-amber-500";
  return "bg-signal-500";
}

export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const { token, hasHydrated, setSession } = useAuth();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (hasHydrated && token) router.replace("/dashboard");
  }, [hasHydrated, token, router]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(d: Draft): Record<string, string> {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = "Enter your full name.";
    if (!d.companyName.trim()) e.companyName = "Enter your company name.";
    if (!d.email.trim()) e.email = "Enter your work email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
      e.email = "That doesn't look like a valid email.";
    if (!d.password) e.password = "Choose a password.";
    else if (d.password.length < MIN_PASSWORD)
      e.password = `Use at least ${MIN_PASSWORD} characters.`;
    return e;
  }

  async function onSubmit(ev?: React.FormEvent) {
    ev?.preventDefault();
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = document.querySelector<HTMLElement>(`[data-field="${Object.keys(e)[0]}"]`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.querySelector("input")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await signup({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        companyName: draft.companyName.trim(),
      });
      setSession({
        token: result.accessToken,
        user: result.user,
        tenant: result.tenant,
      });
      // Straight to the product. No credentials modal to dismiss.
      router.push("/dashboard");
    } catch (err) {
      toast.error("Sign-up failed", extractErrorMessage(err));
      setSubmitting(false);
    }
  }

  const score = scorePassword(draft.password);

  return (
    <main className="min-h-screen bg-bone-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-[460px]">
        <div className="flex items-center gap-2.5 mb-8">
          <BrandMark />
          <span className="font-semibold text-[17px] tracking-tight text-ink-900">Relavoi</span>
        </div>

        <div className="bg-paper border border-ink-200 rounded-xl p-7">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            Create your workspace
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-500">
            Four fields and you&apos;re in. You can set up numbers, regions and session defaults
            later from Settings.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <Field label="Full name" fieldKey="name" error={errors.name}>
              <Input
                value={draft.name}
                autoComplete="name"
                autoFocus
                placeholder="Kay Okafor"
                onChange={(e) => update("name", e.target.value)}
                invalid={Boolean(errors.name)}
              />
            </Field>

            <Field label="Company name" fieldKey="companyName" error={errors.companyName}>
              <Input
                value={draft.companyName}
                autoComplete="organization"
                placeholder="Sysogen"
                onChange={(e) => update("companyName", e.target.value)}
                invalid={Boolean(errors.companyName)}
              />
            </Field>

            <Field label="Work email" fieldKey="email" error={errors.email}>
              <Input
                value={draft.email}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                onChange={(e) => update("email", e.target.value)}
                invalid={Boolean(errors.email)}
              />
            </Field>

            <Field
              label="Password"
              fieldKey="password"
              error={errors.password}
              hint={`At least ${MIN_PASSWORD} characters.`}
            >
              <div className="relative">
                <Input
                  value={draft.password}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  onChange={(e) => update("password", e.target.value)}
                  invalid={Boolean(errors.password)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {draft.password.length > 0 && (
                <div className="mt-2 flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${passwordSegmentColor(score, i)}`}
                    />
                  ))}
                </div>
              )}
            </Field>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-ink-900 text-paper h-10 rounded-md font-medium hover:bg-ink-800 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating workspace…" : "Create workspace"}
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] text-ink-500">
          Already have an account?{" "}
          <Link href="/login" className="text-ink-900 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

// ─── Primitives ─────────────────────────────────────────────────────────────

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

function Input({
  invalid,
  className = "",
  ...props
}: {
  invalid?: boolean;
  className?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={`w-full h-9 px-3 border rounded-md bg-paper text-[13px] text-ink-900 placeholder:text-ink-400 outline-none focus:border-ink-900 transition-colors ${
        invalid ? "border-red-400" : "border-ink-200"
      } ${className}`}
    />
  );
}

function extractErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
  return (
    e?.response?.data?.detail ??
    e?.response?.data?.message ??
    e?.message ??
    "Something went wrong. Please try again."
  );
}
