"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/toast";
import {
  changePassword,
  getConfig,
  inviteUser,
  patchConfig,
} from "@/lib/api";
import type { ConsentPrompt, Role, Tenant, Tier } from "@/lib/types";

interface ApiErrorShape {
  response?: { data?: { message?: string; detail?: string; error?: string } };
  message?: string;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const e = err as ApiErrorShape;
  return (
    e?.response?.data?.message ??
    e?.response?.data?.detail ??
    e?.response?.data?.error ??
    e?.message ??
    fallback
  );
}

interface PushConfig {
  push_enabled?: boolean;
  push_title_template?: string;
  push_body_template?: string;
  sms_auto_reply_on_expired?: boolean;
  workspace_slug?: string;
  country?: string;
  industry?: string;
  default_session_ttl_min?: number;
  cooldown_min?: number;
  requested_pool_size?: number;
}

function readPush(tenant: Tenant | undefined | null): PushConfig {
  return (tenant?.pushConfig ?? {}) as PushConfig;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, tenant: authTenant, setTenant } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 30_000,
  });

  // Keep auth-store tenant in sync with fresh config data.
  useEffect(() => {
    if (configQuery.data) {
      setTenant(configQuery.data);
    }
  }, [configQuery.data, setTenant]);

  const tenant = configQuery.data ?? authTenant ?? undefined;

  const patchMut = useMutation({
    mutationFn: (patch: Partial<Tenant>) => patchConfig(patch),
    onSuccess: (data) => {
      qc.setQueryData(["config"], data);
      setTenant(data);
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error("Save failed", extractErrorMessage(err, "Could not update settings."));
    },
  });

  const canManageTeam = user?.role === "OWNER" || user?.role === "ADMIN";

  if (configQuery.isLoading && !tenant) {
    return (
      <>
        <PageHeader title="Settings" description="Workspace, team, and account preferences." />
        <div className="text-sm text-ink-500">Loading settings…</div>
      </>
    );
  }

  if (!tenant) {
    return (
      <>
        <PageHeader title="Settings" description="Workspace, team, and account preferences." />
        <div className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-6 text-sm text-ink-700">
          Could not load workspace settings. Refresh the page or contact support.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Workspace, team, and account preferences." />

      <div className="space-y-5">
        <GeneralCard tenant={tenant} onSave={(patch) => patchMut.mutate(patch)} saving={patchMut.isPending} />

        {canManageTeam && <TeamCard />}

        <SessionDefaultsCard
          tenant={tenant}
          onSave={(patch) => patchMut.mutate(patch)}
          saving={patchMut.isPending}
        />

        <RecordingCard
          tenant={tenant}
          onSave={(patch) => patchMut.mutate(patch)}
          saving={patchMut.isPending}
        />

        <PushCard
          tenant={tenant}
          onSave={(patch) => patchMut.mutate(patch)}
          saving={patchMut.isPending}
        />

        <SmsCard
          tenant={tenant}
          onSave={(patch) => patchMut.mutate(patch)}
          saving={patchMut.isPending}
        />

        <WorkspaceCard tenant={tenant} />

        <ChangePasswordCard />
      </div>
    </>
  );
}

// ─── Card shell ─────────────────────────────────────────────────────────────

function Card({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="bg-paper border border-ink-200 rounded-[10px] shadow-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description && <p className="text-sm text-ink-500 mt-1">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
      {footer && <div className="mt-4 pt-4 border-t border-ink-200 flex justify-end">{footer}</div>}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="block text-[12px] font-medium text-ink-700 mb-1.5">{children}</label>;
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-[11px] text-ink-500">{children}</div>;
}

const inputClass =
  "w-full h-9 px-3 border border-ink-200 rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors";

const selectClass = `${inputClass} bg-paper`;

const primaryBtn =
  "bg-ink-900 text-paper px-4 h-10 rounded-md font-medium hover:bg-ink-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const secondaryBtn =
  "bg-paper border border-ink-200 text-ink-700 px-4 h-10 rounded-md hover:bg-bone-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

// ─── General ────────────────────────────────────────────────────────────────

function GeneralCard({
  tenant,
  onSave,
  saving,
}: {
  tenant: Tenant;
  onSave: (patch: Partial<Tenant>) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(tenant.name);
  useEffect(() => setName(tenant.name), [tenant.name]);

  const dirty = name.trim() !== tenant.name && name.trim().length > 0;

  return (
    <Card
      title="General"
      description="Display name, plan tier, and unique account identifier."
      footer={
        <button
          type="button"
          className={primaryBtn}
          disabled={!dirty || saving}
          onClick={() => onSave({ name: name.trim() })}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Tenant name</Label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <Label>Plan tier</Label>
          <div className="h-9 flex items-center">
            <TierBadge tier={tenant.tier} />
          </div>
        </div>
      </div>
      <div>
        <Label>Account ID</Label>
        <CopyableMono value={tenant.id} />
      </div>
    </Card>
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

function CopyableMono({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex items-stretch">
      <code className="flex-1 min-w-0 bg-bone-100 border border-ink-200 rounded-l-md px-3 py-2 text-[12px] font-mono text-ink-900 break-all">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="px-3 border border-l-0 border-ink-200 rounded-r-md bg-paper text-ink-700 hover:bg-bone-100 transition-colors inline-flex items-center gap-1.5 text-[12px]"
      >
        {copied ? <Check className="w-4 h-4 text-signal-700" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ─── Team ───────────────────────────────────────────────────────────────────

function TeamCard() {
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <Card
      title="Team members"
      description="Invite teammates to collaborate on your workspace."
    >
      <div className="overflow-x-auto -mx-1">
        <table className="w-full">
          <thead>
            <tr>
              <th className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                Name
              </th>
              <th className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                Email
              </th>
              <th className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                Role
              </th>
              <th className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                Invited at
              </th>
              <th className="bg-bone-100 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-bone-100 transition-colors">
              <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                {user?.name ?? "—"}
              </td>
              <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                {user?.email ?? "—"}
              </td>
              <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">
                <RolePill role={user?.role ?? "VIEWER"} />
              </td>
              <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-700">—</td>
              <td className="px-4 py-3 border-t border-ink-200 text-[13px] text-ink-500">
                You
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-ink-500">Team listing endpoint coming soon.</div>
      <div className="flex justify-end">
        <button type="button" className={primaryBtn} onClick={() => setInviteOpen(true)}>
          Invite member
        </button>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </Card>
  );
}

function RolePill({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    OWNER: "bg-signal-500/15 text-signal-700",
    ADMIN: "bg-blue-500/15 text-blue-700",
    DEVELOPER: "bg-amber-500/15 text-amber-700",
    VIEWER: "bg-ink-200 text-ink-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md font-mono text-[11px] uppercase tracking-wider font-medium ${styles[role]}`}
    >
      {role}
    </span>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "VIEWER">("VIEWER");
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const inviteMut = useMutation({
    mutationFn: (vars: { email: string; role: "OWNER" | "ADMIN" | "VIEWER" }) =>
      inviteUser(vars.email, vars.role),
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
      toast.success("Invitation created");
    },
    onError: (err) => {
      toast.error("Invite failed", extractErrorMessage(err, "Could not create invite."));
    },
  });

  function onSubmit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Invalid email", "Enter a valid email address.");
      return;
    }
    inviteMut.mutate({ email: email.trim(), role });
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-paper border border-ink-200 rounded-[10px] shadow-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Invite team member</h3>
            <p className="text-sm text-ink-500 mt-1">
              They will receive a temporary password to sign in with.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-ink-400 hover:text-ink-900 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!tempPassword ? (
          <div className="space-y-4">
            <div>
              <Label>Email</Label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="teammate@company.com"
              />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "OWNER" | "ADMIN" | "VIEWER")}
                className={selectClass}
              >
                <option value="VIEWER">Viewer — read-only access</option>
                <option value="ADMIN">Admin — manage settings and team</option>
                <option value="OWNER">Owner — full account control</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={secondaryBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={primaryBtn}
                disabled={inviteMut.isPending}
                onClick={onSubmit}
              >
                {inviteMut.isPending ? "Inviting…" : "Send invite"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-signal-500/10 border border-signal-500/30 rounded-md px-3 py-2 text-[13px] text-signal-700">
              Invite created. Share the temporary password securely — it will not be shown
              again.
            </div>
            <div>
              <Label>Temporary password</Label>
              <CopyableMono value={tempPassword} />
            </div>
            <div className="flex justify-end">
              <button type="button" className={primaryBtn} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session defaults ───────────────────────────────────────────────────────

function SessionDefaultsCard({
  tenant,
  onSave,
  saving,
}: {
  tenant: Tenant;
  onSave: (patch: Partial<Tenant>) => void;
  saving: boolean;
}) {
  const [grace, setGrace] = useState<number>(tenant.defaultGracePeriod ?? 15);
  const [expired, setExpired] = useState<NonNullable<Tenant["expiredCallBehavior"]>>(
    tenant.expiredCallBehavior ?? "DEAD_LINE",
  );
  const [supportPhone, setSupportPhone] = useState<string>(tenant.supportPhone ?? "");
  const [maxDuration, setMaxDuration] = useState<number>(120);

  useEffect(() => {
    setGrace(tenant.defaultGracePeriod ?? 15);
    setExpired(tenant.expiredCallBehavior ?? "DEAD_LINE");
    setSupportPhone(tenant.supportPhone ?? "");
  }, [tenant.defaultGracePeriod, tenant.expiredCallBehavior, tenant.supportPhone]);

  function onSubmit() {
    const patch: Partial<Tenant> = {
      defaultGracePeriod: grace,
      expiredCallBehavior: expired,
      supportPhone: supportPhone.trim() || null,
    };
    onSave(patch);
  }

  return (
    <Card
      title="Session defaults"
      description="Defaults applied when sessions don't override these values."
      footer={
        <button type="button" className={primaryBtn} disabled={saving} onClick={onSubmit}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Default grace period (min)</Label>
          <input
            type="number"
            min={0}
            max={60}
            value={grace}
            onChange={(e) => setGrace(Number(e.target.value))}
            className={inputClass}
          />
          <Hint>Window after end during which the session may receive a final call.</Hint>
        </div>
        <div>
          <Label>Expired-call behavior</Label>
          <select
            value={expired}
            onChange={(e) =>
              setExpired(e.target.value as NonNullable<Tenant["expiredCallBehavior"]>)
            }
            className={selectClass}
          >
            <option value="DEAD_LINE">DEAD_LINE — hang up with message</option>
            <option value="REDIRECT_SUPPORT">REDIRECT_SUPPORT — forward to support</option>
            <option value="PLAY_MESSAGE">PLAY_MESSAGE — play custom audio</option>
          </select>
        </div>
        <div>
          <Label>Support phone (E.164)</Label>
          <input
            type="tel"
            value={supportPhone}
            onChange={(e) => setSupportPhone(e.target.value)}
            placeholder="+2348012345678"
            className={`${inputClass} font-mono`}
          />
        </div>
        <div>
          <Label>Max session duration (min)</Label>
          <input
            type="number"
            min={5}
            max={1440}
            value={maxDuration}
            onChange={(e) => setMaxDuration(Number(e.target.value))}
            className={inputClass}
          />
          <Hint>Hard timeout. Not yet persisted via /config — coming soon.</Hint>
        </div>
      </div>
    </Card>
  );
}

// ─── Recording ──────────────────────────────────────────────────────────────

function RecordingCard({
  tenant,
  onSave,
  saving,
}: {
  tenant: Tenant;
  onSave: (patch: Partial<Tenant>) => void;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean>(tenant.recordingEnabled ?? false);
  const [mode, setMode] = useState<ConsentPrompt>(tenant.recordingConsentMode ?? "DEFAULT");
  const [audioUrl, setAudioUrl] = useState<string>(tenant.recordingConsentAudioUrl ?? "");

  useEffect(() => {
    setEnabled(tenant.recordingEnabled ?? false);
    setMode(tenant.recordingConsentMode ?? "DEFAULT");
    setAudioUrl(tenant.recordingConsentAudioUrl ?? "");
  }, [tenant.recordingEnabled, tenant.recordingConsentMode, tenant.recordingConsentAudioUrl]);

  function onSubmit() {
    onSave({
      recordingEnabled: enabled,
      recordingConsentMode: mode,
      recordingConsentAudioUrl: audioUrl.trim() || null,
    });
  }

  return (
    <Card
      title="Recording"
      description="Capture call audio for QA and dispute resolution."
      footer={
        <button type="button" className={primaryBtn} disabled={saving} onClick={onSubmit}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <Toggle
        label="Recording enabled"
        checked={enabled}
        onChange={setEnabled}
        description="When enabled, calls are recorded and stored against your retention policy."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Consent prompt mode</Label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ConsentPrompt)}
            className={selectClass}
          >
            <option value="DEFAULT">DEFAULT — Relavoi-provided announcement</option>
            <option value="CUSTOM">CUSTOM — your uploaded audio</option>
            <option value="NONE">NONE — only valid if recording is disabled</option>
          </select>
        </div>
        <div>
          <Label>Consent audio URL (CUSTOM)</Label>
          <input
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://cdn.example.com/consent.mp3"
            className={inputClass}
          />
        </div>
      </div>
      <Hint>
        NDPR requires a consent prompt when recording is enabled. <code className="font-mono">NONE</code> is rejected by the API if recording is on.
      </Hint>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-900">{label}</div>
        {description && <div className="text-[12px] text-ink-500 mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors mt-0.5 ${
          checked ? "bg-signal-500" : "bg-ink-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-paper shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

// ─── Push ───────────────────────────────────────────────────────────────────

function PushCard({
  tenant,
  onSave,
  saving,
}: {
  tenant: Tenant;
  onSave: (patch: Partial<Tenant>) => void;
  saving: boolean;
}) {
  const push = readPush(tenant);
  const [enabled, setEnabled] = useState<boolean>(push.push_enabled ?? true);
  const [title, setTitle] = useState<string>(
    push.push_title_template ?? "Incoming call from {tenant_name}",
  );
  const [body, setBody] = useState<string>(
    push.push_body_template ?? "{agent_name} is calling about order {order_id}",
  );

  useEffect(() => {
    const p = readPush(tenant);
    setEnabled(p.push_enabled ?? true);
    setTitle(p.push_title_template ?? "Incoming call from {tenant_name}");
    setBody(p.push_body_template ?? "{agent_name} is calling about order {order_id}");
  }, [tenant]);

  function onSubmit() {
    const merged: PushConfig = {
      ...readPush(tenant),
      push_enabled: enabled,
      push_title_template: title,
      push_body_template: body,
    };
    onSave({ pushConfig: merged as Record<string, unknown> });
  }

  return (
    <Card
      title="Push notifications"
      description="Branded push messages delivered when masked calls are initiated."
      footer={
        <button type="button" className={primaryBtn} disabled={saving} onClick={onSubmit}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <Toggle
        label="Push enabled"
        checked={enabled}
        onChange={setEnabled}
        description="Deliver push notifications via FCM (Android) and APNs (iOS)."
      />
      <div>
        <Label>Title template</Label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <Label>Body template</Label>
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={inputClass}
        />
      </div>
      <Hint>
        Available variables: <code className="font-mono">{"{tenant_name}"}</code>,{" "}
        <code className="font-mono">{"{agent_name}"}</code>,{" "}
        <code className="font-mono">{"{order_id}"}</code>
      </Hint>
    </Card>
  );
}

// ─── SMS ────────────────────────────────────────────────────────────────────

function SmsCard({
  tenant,
  onSave,
  saving,
}: {
  tenant: Tenant;
  onSave: (patch: Partial<Tenant>) => void;
  saving: boolean;
}) {
  const push = readPush(tenant);
  const [autoReply, setAutoReply] = useState<boolean>(push.sms_auto_reply_on_expired ?? false);

  useEffect(() => {
    setAutoReply(readPush(tenant).sms_auto_reply_on_expired ?? false);
  }, [tenant]);

  function onSubmit() {
    const merged: PushConfig = {
      ...readPush(tenant),
      sms_auto_reply_on_expired: autoReply,
    };
    onSave({ pushConfig: merged as Record<string, unknown> });
  }

  return (
    <Card
      title="SMS"
      description="How SMS to expired masking numbers is handled."
      footer={
        <button type="button" className={primaryBtn} disabled={saving} onClick={onSubmit}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <Toggle
        label="Auto-reply on expired sessions"
        checked={autoReply}
        onChange={setAutoReply}
        description="Send an automatic SMS reply when someone texts a proxy number whose session has expired."
      />
    </Card>
  );
}

// ─── Workspace (read-only signup metadata) ──────────────────────────────────

function WorkspaceCard({ tenant }: { tenant: Tenant }) {
  const meta = readPush(tenant);
  return (
    <Card
      title="Workspace"
      description="Configured during signup. Contact support to change these."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReadOnlyRow label="Workspace slug" value={meta.workspace_slug ?? "—"} mono />
        <ReadOnlyRow label="Country" value={meta.country ?? "—"} mono />
        <ReadOnlyRow label="Industry" value={meta.industry ?? "—"} />
        <ReadOnlyRow
          label="Default session TTL"
          value={meta.default_session_ttl_min != null ? `${meta.default_session_ttl_min} min` : "—"}
          mono
        />
        <ReadOnlyRow
          label="Cooldown"
          value={meta.cooldown_min != null ? `${meta.cooldown_min} min` : "—"}
          mono
        />
        <ReadOnlyRow
          label="Requested pool size"
          value={meta.requested_pool_size != null ? `${meta.requested_pool_size} numbers` : "—"}
          mono
        />
      </div>
    </Card>
  );
}

function ReadOnlyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <div
        className={`h-9 px-3 border border-ink-200 rounded-md bg-bone-100 text-[13px] text-ink-700 flex items-center ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Change password ────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const mut = useMutation({
    mutationFn: (vars: { current: string; next: string }) =>
      changePassword(vars.current, vars.next),
    onSuccess: () => {
      toast.success("Password updated");
      setCurrent("");
      setNext("");
    },
    onError: (err) => {
      toast.error("Update failed", extractErrorMessage(err, "Could not change password."));
    },
  });

  function onSubmit() {
    if (!current || !next) {
      toast.error("Missing fields", "Enter both your current and new password.");
      return;
    }
    if (next.length < 8) {
      toast.error("Password too short", "New password must be at least 8 characters.");
      return;
    }
    mut.mutate({ current, next });
  }

  return (
    <Card
      title="Change password"
      description="Update the password for your own account."
      footer={
        <button
          type="button"
          className={primaryBtn}
          disabled={mut.isPending}
          onClick={onSubmit}
        >
          {mut.isPending ? "Updating…" : "Update password"}
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Current password</Label>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <Label>New password</Label>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </Card>
  );
}
