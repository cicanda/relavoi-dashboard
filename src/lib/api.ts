"use client";

import axios, { AxiosError, type AxiosInstance } from "axios";
import { readPersistedToken } from "./auth-store";
import type {
  DirectionMode,
  Tenant,
  TenantUser,
  Session,
  CallRecord,
  SmsRecord,
  PoolStatus,
  UsageSummary,
  PricingTierRow,
  PaginatedResponse,
  WebhookDeliveryLog,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/v1";

export const api: AxiosInstance = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// ─── Auth header ──────────────────────────────────────────────────────────────
api.interceptors.request.use((cfg) => {
  const token = readPersistedToken();
  if (token) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return cfg;
});

// ─── 401 -> /login redirect ───────────────────────────────────────────────────
api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (typeof window !== "undefined" && err.response?.status === 401) {
      const isLoginCall = (err.config?.url ?? "").includes("/auth/");
      if (!isLoginCall) {
        try {
          window.localStorage.removeItem("relavoi.auth.v1");
        } catch {}
        if (window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
      }
    }
    return Promise.reject(err);
  },
);

// ─── Problem details (RFC 7807) ───────────────────────────────────────────────
/**
 * The backend answers every failure with `application/problem+json`, and its
 * `detail` is written to be read by a person. So the dashboard shows it rather
 * than inventing its own wording, and only overrides the cases where the
 * server has to speak in terms of the API and a seller needs the plain version
 * ("no number available" means nothing to someone who never provisioned one).
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
}

export function problemOf(err: unknown): ProblemDetails | null {
  const res = (err as AxiosError | undefined)?.response;
  if (!res) return null;
  const data = res.data as ProblemDetails | undefined;
  const problem: ProblemDetails = data && typeof data === "object" ? { ...data } : {};
  problem.status = problem.status ?? res.status;
  return problem;
}

/** The trailing slug of a problem `type` URL, e.g. ".../errors/pool-exhausted". */
function problemSlug(problem: ProblemDetails | null): string | null {
  if (!problem?.type) return null;
  const parts = problem.type.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

const PLAIN_MESSAGES: Record<string, string> = {
  "tier-session-limit":
    "You have as many sessions open as your plan allows. End one you have finished with, or move to a bigger plan.",
  "pool-exhausted":
    "No Relavoi number is free at the moment. End a session you have finished with, or try again shortly.",
  "target-conflict":
    "That customer is already on another open session using this number. End that one first.",
  "invalid-target": "That number cannot be used here.",
  "session-expired": "This session has already ended.",
  "tenant-suspended": "This workspace is suspended. Contact support.",
  forbidden: "Your role cannot change sessions. Ask an owner or an admin to do it.",
};

/**
 * What to put in front of the user when a request fails.
 *
 * Order: a plain rewrite where we have one, then the server's own detail, then
 * the caller's fallback. A network failure has no problem document at all,
 * which is the one case worth naming separately.
 */
export function problemMessage(err: unknown, fallback: string): string {
  const problem = problemOf(err);
  if (!problem) {
    return "Could not reach Relavoi. Check your connection and try again.";
  }
  const slug = problemSlug(problem);
  if (slug && PLAIN_MESSAGES[slug]) return PLAIN_MESSAGES[slug];
  // A validation failure quotes a schema at us; that is not for a seller to read.
  if (slug === "validation" || slug === "session-create-failed") {
    return problem.status === 400 ? fallback : (problem.detail ?? fallback);
  }
  return problem.detail?.trim() || fallback;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface DashboardLoginResponse {
  accessToken: string;
  user: TenantUser;
  tenant: Tenant;
}

export async function dashboardLogin(email: string, password: string) {
  const { data } = await api.post<DashboardLoginResponse>("/auth/dashboard/login", {
    email,
    password,
  });
  return data;
}

export interface SignupPayload {
  companyName: string;
  email: string;
  password: string;
  name: string;
  // Signup no longer collects any of this -- it lives in Settings → Workspace
  // Setup -- but the API still accepts it, so an integrator who already has the
  // answers can send them.
  workspaceSlug?: string;
  country?: string;
  industry?: string;
  companySize?: string;
  useCase?: string;
  requestedPoolSize?: number;
  defaultSessionTtlMin?: number;
  cooldownMin?: number;
}

export interface SignupResponse {
  accessToken: string;
  user: TenantUser;
  tenant: Tenant;
}

export async function signup(payload: SignupPayload) {
  const { data } = await api.post<SignupResponse>("/auth/signup", payload);
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await api.post("/auth/dashboard/change-password", {
    currentPassword,
    newPassword,
  });
  return data;
}

export async function rotateApiKey() {
  const { data } = await api.post<{ apiKey: string; apiSecret: string }>("/auth/rotate-key");
  return data;
}

export interface LiveRequirement {
  key: string;
  label: string;
  met: boolean;
}

export async function generateApiKeys(mode: "sandbox" | "live") {
  const { data } = await api.post<{ apiKey: string; apiSecret: string; mode: string }>(
    "/auth/keys/generate",
    { mode },
  );
  return data;
}

export async function getLiveRequirements() {
  const { data } = await api.get<{ mode: "sandbox" | "live"; requirements: LiveRequirement[] }>(
    "/auth/keys/requirements",
  );
  return data;
}

export async function activateLiveMode() {
  const { data } = await api.post<{ mode: "live"; requirements: LiveRequirement[] }>(
    "/auth/keys/activate-live",
  );
  return data;
}

// ─── Tenant ───────────────────────────────────────────────────────────────────
export async function getMe() {
  const { data } = await api.get<{ tenant: Tenant; user?: TenantUser }>("/tenants/me");
  return data;
}

export async function getConfig() {
  const { data } = await api.get<Tenant>("/config");
  return data;
}

export async function patchConfig(patch: Partial<Tenant>) {
  const { data } = await api.patch<Tenant>("/config", patch);
  return data;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export async function listSessions(params: {
  state?: string;
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await api.get<PaginatedResponse<Session>>("/sessions", { params });
  return data;
}

export async function getSession(id: string) {
  const { data } = await api.get<Session>(`/sessions/${id}`);
  return data;
}

export interface CreateSessionPayload {
  agentPhone: string;
  customerPhone: string;
  metadata?: Record<string, unknown>;
  directionMode?: DirectionMode;
}

export async function createSession(payload: CreateSessionPayload) {
  const { data } = await api.post<Session>("/sessions", payload);
  return data;
}

/**
 * End a session. `gracePeriodMinutes: 0` cuts contact off at once; omitting it
 * leaves the workspace's own grace period in force.
 */
export async function endSession(id: string, opts: { gracePeriodMinutes?: number } = {}) {
  const body = opts.gracePeriodMinutes === undefined ? {} : { gracePeriodMinutes: opts.gracePeriodMinutes };
  const { data } = await api.post<Session>(`/sessions/${id}/end`, body);
  return data;
}

/** Repoint an open session at a different customer, keeping the same number. */
export async function swapSessionTarget(id: string, customerPhone: string) {
  const { data } = await api.patch<Session>(`/sessions/${id}/target`, { customerPhone });
  return data;
}

export async function listSessionCalls(id: string) {
  const { data } = await api.get<PaginatedResponse<CallRecord>>(`/sessions/${id}/calls`);
  return data;
}

export async function listSessionSms(id: string) {
  const { data } = await api.get<PaginatedResponse<SmsRecord>>(`/sessions/${id}/sms`);
  return data;
}

// ─── Calls ────────────────────────────────────────────────────────────────────
export async function listCalls(params: {
  status?: string;
  direction?: string;
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await api.get<PaginatedResponse<CallRecord>>("/calls", { params });
  return data;
}

// ─── Numbers ──────────────────────────────────────────────────────────────────
export async function getPool() {
  // Backend shape: { pools: PoolStatus[] }. Tolerate a bare array too.
  const { data } = await api.get<{ pools: PoolStatus[] } | PoolStatus[]>("/numbers/pool");
  return Array.isArray(data) ? data : (data.pools ?? []);
}

// ─── Billing ──────────────────────────────────────────────────────────────────
export async function getUsage(periodStart: string, periodEnd: string) {
  const { data } = await api.get<UsageSummary>("/billing/usage", {
    params: { periodStart, periodEnd },
  });
  return data;
}

export async function getPricing() {
  const { data } = await api.get<{ tiers: PricingTierRow[] } | PricingTierRow[]>("/billing/pricing");
  return Array.isArray(data) ? data : data.tiers;
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export interface TimeBucket { ts: string; [k: string]: number | string }

export async function getSessionsOverTime(
  periodStart: string,
  periodEnd: string,
  granularity: "hour" | "day" = "day",
) {
  const { data } = await api.get<TimeBucket[]>("/analytics/sessions-over-time", {
    params: { periodStart, periodEnd, granularity },
  });
  return data;
}

export async function getCallSuccessRate(
  periodStart: string,
  periodEnd: string,
  granularity: "hour" | "day" = "day",
) {
  const { data } = await api.get<TimeBucket[]>("/analytics/call-success-rate", {
    params: { periodStart, periodEnd, granularity },
  });
  return data;
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────
export async function getWebhookConfig() {
  const { data } = await api.get<{
    url?: string | null;
    events?: string[];
    hasSecret?: boolean;
    recentDeliveries?: WebhookDeliveryLog[];
  }>("/webhooks");
  return data;
}

export async function registerWebhook(url: string, events: string[]) {
  const { data } = await api.post<{ url: string; secret: string; events: string[] }>(
    "/webhooks",
    { url, events },
  );
  return data;
}

export async function sendTestWebhook() {
  const { data } = await api.post("/webhooks/test");
  return data;
}

export async function listWebhookLogs(params: { limit?: number; after?: string } = {}) {
  const { data } = await api.get<PaginatedResponse<WebhookDeliveryLog>>("/webhooks/logs", {
    params,
  });
  return data;
}

// ─── Invite team member ───────────────────────────────────────────────────────
export async function inviteUser(email: string, role: "OWNER" | "ADMIN" | "VIEWER") {
  const { data } = await api.post<{ userId: string; tempPassword: string }>(
    "/auth/dashboard/invite",
    { email, role },
  );
  return data;
}

// ─── Business verification (KYB) ──────────────────────────────────────────────

export type KybStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";

export type KybDocumentKind =
  | "REGISTRATION_CERTIFICATE"
  | "STATUS_REPORT"
  | "MEMART"
  | "OWNER_ID"
  | "PROOF_OF_ADDRESS"
  | "OTHER";

export interface KybDocument {
  id: string;
  kind: KybDocumentKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface KybDetails {
  registrationType: "COMPANY" | "BUSINESS_NAME" | "OTHER" | null;
  legalName: string | null;
  registrationNumber: string | null;
  registeredAddress: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  contactPhone: string | null;
  website: string | null;
}

export interface KybState {
  status: KybStatus;
  editable: boolean;
  details: KybDetails;
  documents: KybDocument[];
  requiredKinds: KybDocumentKind[];
  missingKinds: KybDocumentKind[];
  missingDetails: string[];
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  canSubmit: boolean;
  promptDismissedAt: string | null;
  showPrompt: boolean;
}

export async function getKyb() {
  const { data } = await api.get<KybState>("/kyb");
  return data;
}

export type KybDetailsPayload = {
  registrationType: "COMPANY" | "BUSINESS_NAME" | "OTHER";
  legalName: string;
  registrationNumber: string;
  registeredAddress: string;
  city?: string | null;
  state: string;
  contactName: string;
  contactPhone: string;
  website?: string | null;
};

export async function putKybDetails(payload: KybDetailsPayload) {
  const { data } = await api.put<Partial<KybState>>("/kyb/details", payload);
  return data;
}

/**
 * Upload one document. `onProgress` receives 0-100 so the caller can show a
 * per-file bar; it is driven by axios upload events, so it reflects bytes put
 * on the wire rather than a fake animation.
 */
export async function uploadKybDocument(
  kind: KybDocumentKind,
  file: File,
  onProgress?: (percent: number) => void,
) {
  const form = new FormData();
  // Field before file, so a server reading parts in order has the kind in hand
  // by the time the bytes arrive.
  form.append("kind", kind);
  form.append("file", file, file.name);

  const { data } = await api.post<KybDocument>("/kyb/documents", form, {
    // Let the browser set the multipart boundary.
    headers: { "Content-Type": undefined as unknown as string },
    // Documents are up to 10 MB and Nigerian uplinks are not fast.
    timeout: 120_000,
    onUploadProgress: (e) => {
      if (!onProgress) return;
      const total = e.total ?? file.size;
      if (!total) return;
      onProgress(Math.min(100, Math.round((e.loaded / total) * 100)));
    },
  });
  return data;
}

export async function deleteKybDocument(id: string) {
  await api.delete(`/kyb/documents/${id}`);
}

export async function submitKyb() {
  const { data } = await api.post<{ status: KybStatus; submittedAt: string }>("/kyb/submit");
  return data;
}

export async function dismissKybPrompt() {
  const { data } = await api.post<{ promptDismissedAt: string; showPrompt: false }>(
    "/kyb/prompt/dismiss",
  );
  return data;
}
