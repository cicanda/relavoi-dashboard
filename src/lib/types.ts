// Shared types for the Relavoi tenant dashboard.
//
// Most response shapes match what the relavoi-backend routes emit verbatim
// (camelCase DTOs). Where the backend hasn't shipped a particular field yet,
// the shape is marked optional so the UI degrades gracefully.

export type SessionState = "PENDING" | "ACTIVE" | "GRACE_PERIOD" | "EXPIRED" | "FAILED";
export type DirectionMode = "BIDIRECTIONAL" | "A_TO_B_ONLY" | "B_TO_A_ONLY";
export type ConsentPrompt = "DEFAULT" | "CUSTOM" | "NONE";
export type Tier = "STARTER" | "GROWTH" | "ENTERPRISE";
export type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";

export interface Tenant {
  id: string;
  name: string;
  tier: Tier;
  status?: string;
  webhookUrl?: string | null;
  defaultGracePeriod?: number;
  expiredCallBehavior?: "DEAD_LINE" | "REDIRECT_SUPPORT" | "PLAY_MESSAGE";
  supportPhone?: string | null;
  recordingEnabled?: boolean;
  recordingConsentMode?: ConsentPrompt;
  recordingConsentAudioUrl?: string | null;
  pushConfig?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string;
  name?: string;
}

export interface Session {
  id: string;
  tenantId: string;
  proxyNumber: string;
  state: SessionState;
  directionMode: DirectionMode;
  metadata: Record<string, unknown>;
  gracePeriodMinutes: number;
  maxDurationMinutes: number;
  recordingEnabled: boolean;
  consentPrompt: ConsentPrompt;
  expiresAt: string;
  createdAt: string;
  activatedAt?: string | null;
  endedAt?: string | null;
  expiredAt?: string | null;
  callCount?: number;
  lastCallAt?: string | null;
}

export interface CallRecord {
  id: string;
  sessionId?: string;
  cpaasCallId?: string | null;
  direction: "A_TO_B" | "B_TO_A";
  status: "RINGING" | "ANSWERED" | "COMPLETED" | "MISSED" | "FAILED";
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  initiatedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  proxyNumber?: string;
}

export interface SmsRecord {
  id: string;
  sessionId?: string;
  direction: "A_TO_B" | "B_TO_A";
  status: "PENDING" | "DELIVERED" | "FAILED";
  cost?: string | null;
  sentAt: string;
  deliveredAt?: string | null;
}

export interface PoolStatus {
  region: string;
  provider: string;
  total: number;
  available: number;
  inUse: number;
  cooldown: number;
  quarantined?: number;
}

export interface BillingMetricRow {
  metric: string;
  quantity: number;
}

export interface UsageSummary {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, number>;
  totalEvents: number;
}

export interface PricingTierRow {
  tier: Tier;
  metric: string;
  unitPrice: number;
  includedQuantity: number;
  overagePrice?: number | null;
  currency: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { count: number; after?: string | null };
}

// Matches the backend deliveryLogDto emitted by GET /webhooks/logs and
// GET /webhooks (recentDeliveries).
export interface WebhookDeliveryLog {
  id: string;
  event: string;
  url?: string;
  statusCode?: number | null;
  success: boolean;
  attemptCount?: number;
  error?: string | null;
  requestedAt: string;
  completedAt?: string | null;
}
