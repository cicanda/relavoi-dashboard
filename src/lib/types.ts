// Shared types for the Relavoi tenant dashboard.
//
// Most response shapes match what the relavoi-backend routes emit verbatim
// (camelCase DTOs). Where the backend hasn't shipped a particular field yet,
// the shape is marked optional so the UI degrades gracefully.

export type SessionState = "PENDING" | "ACTIVE" | "GRACE_PERIOD" | "EXPIRED" | "FAILED";
export type DirectionMode = "BIDIRECTIONAL" | "A_TO_B_ONLY" | "B_TO_A_ONLY";
export type ConsentPrompt = "DEFAULT" | "CUSTOM" | "NONE";
export type Tier = "STARTER" | "GROWTH" | "SCALE" | "ENTERPRISE";
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
  // Workspace setup. Signup stopped asking for these; they are edited in
  // Settings → Workspace Setup and are null until someone fills them in.
  workspaceSlug?: string | null;
  country?: string | null;
  industry?: string | null;
  requestedPoolSize?: number | null;
  defaultSessionTtlMin?: number | null;
  cooldownMin?: number | null;
  /** Sandbox until the workspace is explicitly activated for live traffic. */
  mode?: "sandbox" | "live";
  hasSandboxKeys?: boolean;
  hasLiveKeys?: boolean;
  /** False until the tenant generates credentials from the API keys page. */
  hasApiCredentials?: boolean;
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
  /**
   * Both parties, masked: +234******1234. The API never returns the numbers
   * themselves, and null means the session predates the stored digits.
   */
  agentPhoneMasked?: string | null;
  customerPhoneMasked?: string | null;
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

// ─── Billing wallet ───────────────────────────────────────────────────────────

/**
 * Money, as the server sends it.
 *
 * Three representations of one figure: the exact amount in kobo as a string,
 * the string to print, and the plain decimal. The dashboard prints `display`
 * and never computes with any of them. Every total, fee and percentage on the
 * billing page is worked out server-side in integer kobo, because a rounding
 * difference between what the page shows and what the ledger holds is worse
 * than a page that shows nothing.
 */
export interface Money {
  kobo: string;
  display: string;
  naira: string;
}

export type BillingBanner = "ok" | "low" | "grace" | "blocked" | "bypass";

export interface TopUpPreset {
  amountNaira: number;
  requested: Money;
  fee: Money;
  total: Money;
}

export interface WalletOverview {
  mode: "sandbox" | "live";
  plan: {
    tier: Tier;
    monthly: Money;
    includedMinutes: number;
    overagePerMinute: Money;
  } | null;
  includedMinutes: { total: number; used: number; left: number; percentUsed: number };
  wallet: {
    balance: Money;
    creditLimit: Money;
    lowBalanceThreshold: Money;
    negative: boolean;
  };
  status: {
    state: BillingBanner;
    blocked: boolean;
    graceUntil: string | null;
    graceDaysLeft: number | null;
    bypassUntil: string | null;
  };
  topUp: {
    minimumNaira: number;
    available: boolean;
    presets: TopUpPreset[];
    internationalCardNote: string;
  };
  period: { id: string; start: string; end: string } | null;
}

export type LedgerType =
  | "TOPUP"
  | "FEE"
  | "SUBSCRIPTION"
  | "USAGE"
  | "ADJUSTMENT"
  | "REFUND"
  | "REVERSAL";

export interface LedgerEntryDto {
  id: string;
  type: LedgerType;
  label: string;
  amount: Money;
  balanceAfter: Money;
  reference: string | null;
  reason: string | null;
  createdAt: string;
}

export interface TopUpQuote {
  allowed: boolean;
  minimumNaira: number;
  requested: Money;
  fee: Money | null;
  total: Money | null;
}

export interface TopUpOpened {
  reference: string;
  checkoutUrl: string;
  requested: Money;
  fee: Money;
  total: Money;
}

export interface TopUpVerified {
  status: "credited" | "already-credited" | "not-paid" | "unknown-reference";
  paid: Money;
  fee: Money;
  credited: Money;
  balance: Money;
}

export interface InvoiceListItem {
  id: string;
  number: string;
  status: string;
  total: Money;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
}
