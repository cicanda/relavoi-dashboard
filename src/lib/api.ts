"use client";

import axios, { AxiosError, type AxiosInstance } from "axios";
import { readPersistedToken } from "./auth-store";
import type {
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
  fullName?: string;
  workspaceSlug?: string;
  country?: string;
  industry?: string;
  companySize?: string;
  useCase?: string;
  expectedSessionsPerDay?: string;
  avgSessionLifespan?: string;
  regions?: string[];
  requestedPoolSize?: number;
  carrierMix?: string;
  defaultSessionTtlMin?: number;
  cooldownMin?: number;
  ncc_consent?: boolean;
}

export interface SignupResponse {
  tenantId: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  user: TenantUser;
  tenant?: Tenant;
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

export async function endSession(id: string) {
  const { data } = await api.post<Session>(`/sessions/${id}/end`);
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
