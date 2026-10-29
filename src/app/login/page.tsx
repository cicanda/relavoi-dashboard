"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "@/components/brand-mark";
import { useAuth } from "@/lib/auth-store";
import { dashboardLogin } from "@/lib/api";

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
    "Sign-in failed. Check your credentials and try again."
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { token, hasHydrated, setSession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && token) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, token, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await dashboardLogin(email.trim(), password);
      setSession({ token: data.accessToken, user: data.user, tenant: data.tenant });
      router.push("/dashboard");
    } catch (err) {
      setError(extractErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-backdrop min-h-screen w-full flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card rounded-[28px] p-[clamp(1.5rem,1rem+2vw,2.5rem)] shadow-raised animate-dialog-in">
        <div className="flex flex-col items-center text-center">
          <BrandLogo height={44} />
          <h1 className="mt-5 text-[15px] text-ink-500 tracking-normal">Sign in to your workspace</h1>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="field-label mb-0">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="field w-full h-11"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="field-label mb-0">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="field w-full h-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              href="/login"
              className="text-[13px] text-ink-500 hover:text-ink-900 transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary w-full h-11"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-ink-200 text-center text-[13px] text-ink-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-ink-900 font-medium hover:text-brand-teal transition-colors"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
