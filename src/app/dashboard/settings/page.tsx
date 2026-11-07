"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/toast";
import { BusinessVerificationCard } from "@/components/dashboard/kyb-card";
import { VerifyEmailCard } from "@/components/dashboard/email-verification";
import {
  changePassword,
  getConfig,
  getReferenceLists,
  inviteUser,
  listTeam,
  patchConfig,
  type TeamMember,
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
        <div className="card p-6 text-sm text-ink-700">
          Could not load workspace settings. Refresh the page or contact support.
        </div>
      </>
    );
  }

  /**
   * Remount a form card when the server's copy of its fields changes, rather
   * than copying them into state from an effect.
   *
   * Typing does not move these values: they come from /config. So a key built
   * from them is stable for the whole time somebody is editing, and changes
   * exactly when a save lands or when the workspace is edited somewhere else,
   * which is when the form should go back to showing what is stored. That is
   * the same moment the old effects fired, with one fewer render and no
   * window in which the inputs and the data disagree.
   */
  const sessionDefaultsKey = [
    tenant.defaultGracePeriod,
    tenant.expiredCallBehavior,
    tenant.supportPhone,
    tenant.expiredMessage,
    tenant.defaultSessionTtlMin,
  ].join("|");

  return (
    <>
      <PageHeader title="Settings" description="Workspace, team, and account preferences." />

      <div className="space-y-5">
        <GeneralCard
          key={tenant.name}
          tenant={tenant}
          onSave={(patch) => patchMut.mutate(patch)}
          saving={patchMut.isPending}
        />

        {/* Verification sits high up: it is the one thing standing between a
            new workspace and live calls. */}
        <BusinessVerificationCard canManage={canManageTeam} />

        {canManageTeam && <TeamCard />}

        <SessionDefaultsCard
          key={sessionDefaultsKey}
          tenant={tenant}
          onSave={(patch) => patchMut.mutate(patch)}
          saving={patchMut.isPending}
        />

        <RecordingCard />

        <PushCard />

        <SmsCard />

        <WorkspaceSetupCard
          tenant={tenant}
          onSave={(patch) => patchMut.mutate(patch)}
          saving={patchMut.isPending}
        />

        {/* With the password card: both are about this person's own
            account rather than the workspace. Renders nothing once the
            address is confirmed. */}
        <VerifyEmailCard />

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
    <section className="card p-[clamp(1.125rem,0.8rem+1.2vw,1.75rem)] xl:grid xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] xl:gap-x-10">
      <div className="mb-5 xl:mb-0">
        <h2 className="section-title">{title}</h2>
        {description && <p className="text-[14px] text-ink-500 mt-1.5">{description}</p>}
      </div>
      <div className="min-w-0">
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-5 pt-4 border-t border-ink-200 flex justify-end">{footer}</div>}
      </div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="field-label">{children}</label>;
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 text-[12px] text-ink-500">{children}</div>;
}

const inputClass =
  "field w-full";

const selectClass = `${inputClass} bg-paper`;

const primaryBtn =
  "btn btn-primary";

const secondaryBtn =
  "btn btn-secondary";

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
  // No effect syncing this back from `tenant`. The parent remounts this card
  // when the server's name changes, which resets the field by construction;
  // see the key on <GeneralCard> below.
  const [name, setName] = useState(tenant.name);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:min-w-0">
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
          <div className="h-10 flex items-center">
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
    STARTER: "bg-bone-200 text-ink-700",
    GROWTH: "bg-blue-500/15 text-blue-700",
    SCALE: "bg-violet-500/15 text-violet-700",
    ENTERPRISE: "bg-signal-500/20 text-signal-700",
  };
  return (
    <span
      className={`chip ${styles[tier]}`}
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
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 bg-bone-50 border border-ink-200 rounded-lg px-3 py-2.5 text-[12px] font-mono text-ink-900 break-all">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="btn btn-secondary btn-sm shrink-0"
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

  // The table used to render one hardcoded row, the signed-in user, with
  // "Invited at: None" and the note "Team listing endpoint coming soon". An
  // OWNER could invite somebody and never see them again.
  const teamQ = useQuery({
    queryKey: ["team"],
    queryFn: listTeam,
    staleTime: 30_000,
  });

  const rows: TeamMember[] =
    teamQ.data ??
    // Until the first response lands, show what we already know: the person
    // reading the page. One row that is true beats an empty table.
    (user
      ? [
          {
            id: user.id,
            email: user.email,
            name: user.name ?? "",
            role: user.role,
            isActive: true,
            lastLoginAt: null,
            createdAt: new Date().toISOString(),
            isYou: true,
          },
        ]
      : []);

  return (
    <Card
      title="Team members"
      description="Invite teammates to collaborate on your workspace."
    >
      <div className="overflow-x-auto rounded-xl border border-ink-200">
        <table className="w-full table-stack">
          <thead>
            <tr>
              <th className="th">
                Name
              </th>
              <th className="th">
                Email
              </th>
              <th className="th">
                Role
              </th>
              <th className="th">
                Added
              </th>
              <th className="th">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-bone-50 transition-colors">
                <td data-label="Name" className="td text-[13px] text-ink-700">
                  {m.name || "Not set"}
                  {m.isYou && <span className="text-ink-400"> (you)</span>}
                </td>
                <td data-label="Email" className="td text-[13px] text-ink-700">{m.email}</td>
                <td data-label="Role" className="td text-[13px] text-ink-700">
                  <RolePill role={m.role} />
                </td>
                <td data-label="Added" className="td text-[13px] text-ink-700">
                  {new Date(m.createdAt).toLocaleDateString()}
                </td>
                <td data-label="Status" className="td text-[13px] text-ink-500">
                  {!m.isActive
                    ? "Deactivated"
                    : m.lastLoginAt
                      ? `Last signed in ${new Date(m.lastLoginAt).toLocaleDateString()}`
                      : "Invited, not signed in yet"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button type="button" className={primaryBtn} onClick={() => setInviteOpen(true)}>
          Invite member
        </button>
      </div>

      {inviteOpen && (
        <InviteModal
          onClose={() => {
            setInviteOpen(false);
            void teamQ.refetch();
          }}
        />
      )}
    </Card>
  );
}

function RolePill({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    OWNER: "bg-signal-500/15 text-signal-700",
    ADMIN: "bg-blue-500/15 text-blue-700",
    DEVELOPER: "bg-brand-amber/15 text-amber-700",
    VIEWER: "bg-ink-200 text-ink-700",
  };
  return (
    <span
      className={`chip ${styles[role]}`}
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
    <div className="fixed inset-0 z-50 bg-brand-navy/40 backdrop-blur-[2px] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-md dialog animate-dialog-in p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="section-title">Invite team member</h3>
            <p className="text-sm text-ink-500 mt-1">
              They will receive a temporary password to sign in with.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-1.5 w-10 h-10 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-900 hover:bg-bone-100 transition-colors"
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
                <option value="VIEWER">Viewer (read-only access)</option>
                <option value="ADMIN">Admin (manage settings and team)</option>
                <option value="OWNER">Owner (full account control)</option>
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
            <div className="bg-signal-500/10 border border-signal-500/30 rounded-xl px-3.5 py-2.5 text-[13px] text-signal-700">
              Invite created. Share the temporary password securely. It will not be shown
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
  const [expiredMessage, setExpiredMessage] = useState<string>(tenant.expiredMessage ?? "");
  // Was a number input that saved nothing, under the words "Not yet persisted
  // via /config (coming soon)". /config has both read it and accepted it as
  // defaultSessionTtlMin for as long as the field has been on screen, and the
  // session manager applies it to every session it creates.
  const [maxDuration, setMaxDuration] = useState<number>(tenant.defaultSessionTtlMin ?? 120);

  // No effect syncing these five back from `tenant`: the parent remounts this
  // card when any of them changes on the server. See sessionDefaultsKey.

  const trimmedMessage = expiredMessage.trim();
  // The API refuses this pairing with 422. Catching it here means the person
  // is told before they press Save, rather than by an error afterwards.
  const messageMissing = expired === "PLAY_MESSAGE" && trimmedMessage === "";

  function onSubmit() {
    const patch: Partial<Tenant> = {
      defaultGracePeriod: grace,
      expiredCallBehavior: expired,
      supportPhone: supportPhone.trim() || null,
      expiredMessage: trimmedMessage || null,
      defaultSessionTtlMin: maxDuration,
    };
    onSave(patch);
  }

  return (
    <Card
      title="Session defaults"
      description="Defaults applied when sessions don't override these values."
      footer={
        <button
          type="button"
          className={primaryBtn}
          disabled={saving || messageMissing}
          onClick={onSubmit}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:min-w-0">
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
            <option value="DEAD_LINE">Play the standard line and hang up</option>
            <option value="REDIRECT_SUPPORT">Forward to your support line</option>
            {/* Not "play custom audio": there is no audio upload, and offering
                one would be offering something that does not exist. */}
            <option value="PLAY_MESSAGE">Play a message you write, then hang up</option>
          </select>
          <Hint>What a customer hears if they call the number after the session is over.</Hint>
        </div>
        <div>
          <Label>Support phone (E.164)</Label>
          <input
            type="tel"
            value={supportPhone}
            onChange={(e) => setSupportPhone(e.target.value)}
            placeholder="+2349000000001"
            className={`${inputClass} font-mono`}
          />
        </div>
        {expired === "PLAY_MESSAGE" && (
          <div className="sm:col-span-2">
            <Label>Your message</Label>
            <textarea
              value={expiredMessage}
              onChange={(e) => setExpiredMessage(e.target.value.slice(0, 300))}
              rows={3}
              placeholder="This order is complete. Please place a new order in the app to call again."
              className={`${inputClass} h-auto py-2.5 leading-relaxed`}
            />
            <div className="flex items-center justify-between gap-3 mt-1">
              <Hint>
                Plain text, read aloud by a voice. No angle brackets. Keep it short: most people
                hang up after a few seconds.
              </Hint>
              <span
                className={`text-[12px] tabular-nums shrink-0 ${
                  expiredMessage.length >= 300 ? "text-red-600" : "text-ink-400"
                }`}
              >
                {expiredMessage.length}/300
              </span>
            </div>

            {messageMissing ? (
              <p className="mt-2 text-[13px] text-red-600">
                Write the message before saving. Without one, callers would hear the standard line
                instead and this setting would do nothing.
              </p>
            ) : (
              <div className="mt-2 rounded-xl border border-ink-200 bg-bone-50 px-3.5 py-3">
                <div className="text-[12px] text-ink-500 mb-1">Your caller will hear</div>
                <p className="text-[14px] text-ink-900 italic">{trimmedMessage}</p>
              </div>
            )}
          </div>
        )}

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
          <Hint>
            Hard timeout. A session ends at this point whether or not it was ended in your app.
          </Hint>
        </div>
      </div>
    </Card>
  );
}

// ─── Recording ──────────────────────────────────────────────────────────────

function RecordingCard() {
  // Recording is not available yet, so there is nothing to switch on and
  // nothing to save. The API refuses recordingEnabled true on both the session
  // and the tenant with 422 feature-not-available, so a working control here
  // would only produce an error.
  //
  // The card stays rather than disappearing, because recording is a question
  // customers ask about and a visible "coming soon" answers it. The consent
  // prompt and consent audio fields are gone: they only ever mattered when
  // recording was on, and leaving inputs that save nothing is worse than not
  // showing them.
  return (
    <Card
      title="Recording"
      description="Call recording is not available yet."
    >
      <Toggle
        label="Recording enabled"
        checked={false}
        onChange={() => {}}
        disabled
        description="Coming soon. When it arrives, a call will only be recorded after a consent message that the person on the call hears first."
      />
      <Hint>
        Nothing is recorded today, and no call audio is stored. We will let you
        know before this can be switched on.
      </Hint>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  description,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink-900">{label}</div>
        {description && <div className="text-[13px] text-ink-500 mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="relative inline-flex h-11 w-14 -my-2 -mr-1.5 flex-shrink-0 items-center justify-center rounded-full"
      >
        {/* The visible track; the button around it is the 44px tap target. */}
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            checked ? "bg-signal-500" : "bg-ink-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-paper shadow transition-transform duration-200 ${
              checked ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
    </label>
  );
}

// ─── Push ───────────────────────────────────────────────────────────────────

/**
 * Push notifications.
 *
 * This was a settings card: an enabled toggle, a title template and a body
 * template. All three saved and none was read, because the dashboard wrote
 * push_title_template and push_body_template while the service looked for
 * title and body. That mismatch is fixed and the keys are applied now.
 *
 * What is still missing is delivery. No push credentials are configured in
 * production, so nothing reaches a device whatever is set here. A settings
 * card for an effect that cannot happen is the defect the audit was about, so
 * the fields are hidden until a notification can actually arrive.
 *
 * Nothing is cleared. A workspace that configured wording keeps it, and it
 * takes effect when the credentials exist. The API still accepts pushConfig,
 * which is documented.
 */
function PushCard() {
  return (
    <Card title="Push notifications" description="Not available yet.">
      <p className="text-[13px] text-ink-500 leading-relaxed">
        Your customer sees the proxy number when the call arrives. A branded notification just
        before it is built on our side but is not switched on, so none are being delivered.
        There is nothing to set here until they are, and we will tell you when that changes.
      </p>
      <p className="text-[12px] text-ink-400 mt-3">
        Your app can register device tokens today. That is the half that works, and it means
        nothing has to change in your app when delivery starts.
      </p>
    </Card>
  );
}

// ─── SMS ────────────────────────────────────────────────────────────────────

/**
 * SMS.
 *
 * This was an "Auto-reply on expired sessions" toggle. It wrote
 * sms_auto_reply_on_expired into the pushConfig blob, nothing has ever read
 * that key, and there is no auto-reply implementation to read it: a text to a
 * closed session's number matches no live session and goes nowhere. There is
 * a tenants.sms_auto_reply_on_expired column from the first migration which
 * nothing reads either.
 *
 * So the toggle described a behaviour that does not exist, and a workspace
 * that switched it on had every reason to believe its customers were getting a
 * reply. Found while hiding the push card, which was the same defect.
 *
 * Stored values are left alone.
 */
function SmsCard() {
  return (
    <Card title="SMS" description="What happens to a text sent to a masking number.">
      <p className="text-[13px] text-ink-500 leading-relaxed">
        While a session is live, a text to its masking number is passed on to the other person,
        and a reply comes back the same way. Nothing is sent automatically, and a text to a
        number whose session is over is not answered.
      </p>
      <p className="text-[12px] text-ink-400 mt-3">
        There is no API for sending a message yourself yet. Tell us if you need one.
      </p>
    </Card>
  );
}

// ─── Workspace setup (moved off the signup form) ────────────────────────────

/**
 * Signup asks four questions and nothing else, so everything here starts empty.
 * It used to be captured during onboarding and shown read-only ("contact
 * support to change these"), which would now leave the fields unsettable
 * forever. They are editable.
 */
function WorkspaceSetupCard({
  tenant,
  onSave,
  saving,
}: {
  tenant: Tenant;
  onSave: (patch: Partial<Tenant>) => void;
  saving: boolean;
}) {
  const legacy = readPush(tenant);
  const initial = {
    industry: tenant.industry ?? legacy.industry ?? "",
    country: tenant.country ?? legacy.country ?? "",
    workspaceSlug: tenant.workspaceSlug ?? legacy.workspace_slug ?? "",
    requestedPoolSize: tenant.requestedPoolSize ?? legacy.requested_pool_size ?? null,
    defaultSessionTtlMin: tenant.defaultSessionTtlMin ?? legacy.default_session_ttl_min ?? null,
    cooldownMin: tenant.cooldownMin ?? legacy.cooldown_min ?? null,
  };

  const [industry, setIndustry] = useState(initial.industry);
  const [country, setCountry] = useState(initial.country);

  /**
   * The two lists come from the API, not from a constant in here. The server
   * validates against the same list it serves, so a local copy would
   * eventually offer a value the server refuses. Unauthenticated and cached
   * for a day at the edge of the API, so this is a cheap call.
   */
  const reference = useQuery({
    queryKey: ["reference"],
    queryFn: getReferenceLists,
    staleTime: 60 * 60 * 1000,
  });

  /**
   * A value stored before the list existed is kept as an option of its own
   * rather than silently dropped, which would show the field as empty and let
   * a save blank it.
   */
  const industryOptions = (() => {
    const list = reference.data?.industries ?? [];
    if (industry && !list.some((i) => i.code === industry)) {
      return [...list, { code: industry, label: industry }];
    }
    return list;
  })();

  const countryOptions = (() => {
    const list = reference.data?.countries ?? [];
    if (country && !list.some((c) => c.code === country)) {
      return [...list, { code: country, name: country }];
    }
    return list;
  })();
  const [slug, setSlug] = useState(initial.workspaceSlug);
  const [poolSize, setPoolSize] = useState<string>(
    initial.requestedPoolSize != null ? String(initial.requestedPoolSize) : "",
  );
  const [ttl, setTtl] = useState<string>(
    initial.defaultSessionTtlMin != null ? String(initial.defaultSessionTtlMin) : "",
  );
  const [cooldown, setCooldown] = useState<string>(
    initial.cooldownMin != null ? String(initial.cooldownMin) : "",
  );

  function onSubmit() {
    const patch: Partial<Tenant> = {
      industry: industry || null,
      country: country || null,
      workspaceSlug: slug.trim() || null,
      requestedPoolSize: poolSize.trim() ? Number(poolSize) : null,
    };
    // TTL and cooldown have server-side defaults; only send real numbers.
    if (ttl.trim()) patch.defaultSessionTtlMin = Number(ttl);
    if (cooldown.trim()) patch.cooldownMin = Number(cooldown);
    onSave(patch);
  }

  return (
    <Card
      title="Workspace setup"
      description="Optional context we no longer ask for at signup. Fill it in whenever you're ready."
      footer={
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="btn btn-primary btn-sm"
        >
          {saving ? "Saving…" : "Save workspace setup"}
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:min-w-0">
        <div>
          <Label>Industry</Label>
          <select
            className={selectClass}
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={reference.isLoading}
          >
            <option value="">Not set</option>
            {industryOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Country</Label>
          <select
            className={selectClass}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={reference.isLoading}
          >
            <option value="">Not set</option>
            {countryOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
          <Hint>Where the business is registered, not where your riders are.</Hint>
        </div>
        <div>
          <Label>Workspace slug</Label>
          <input
            className="field w-full font-mono"
            value={slug}
            placeholder="sysogen"
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div>
          <Label>Requested pool size</Label>
          <input
            className="field w-full font-mono"
            value={poolSize}
            inputMode="numeric"
            placeholder="10"
            onChange={(e) => setPoolSize(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <Hint>How many proxy numbers you expect to need.</Hint>
        </div>
        <div>
          <Label>Default session TTL (min)</Label>
          <input
            className="field w-full font-mono"
            value={ttl}
            inputMode="numeric"
            placeholder="120"
            onChange={(e) => setTtl(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div>
          <Label>Cooldown (min)</Label>
          <input
            className="field w-full font-mono"
            value={cooldown}
            inputMode="numeric"
            placeholder="5"
            onChange={(e) => setCooldown(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <Hint>How long a released number rests before reallocation.</Hint>
        </div>
      </div>
    </Card>
  );
}

// ─── Change password ────────────────────────────────────────────────────────

/**
 * The floor the API enforces on every form that sets a password: signup, the
 * reset that follows a reset link, and this one. Checked here too, so a
 * password that cannot work costs a keystroke rather than a round trip.
 */
const MIN_PASSWORD = 12;

function ChangePasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mut = useMutation({
    mutationFn: (vars: { current: string; next: string }) =>
      changePassword(vars.current, vars.next),
    onSuccess: () => {
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (err) => {
      toast.error("Update failed", extractErrorMessage(err, "Could not change password."));
    },
  });

  function onSubmit() {
    if (!current || !next || !confirm) {
      toast.error("Missing fields", "Fill in all three fields.");
      return;
    }
    if (next.length < MIN_PASSWORD) {
      toast.error(
        "Password too short",
        `Use at least ${MIN_PASSWORD} characters.`,
      );
      return;
    }
    // Same order as the reset form: length first, then the match, so a short
    // password is not reported as a mismatch.
    if (next !== confirm) {
      toast.error("Passwords do not match", "The two new passwords are different.");
      return;
    }
    mut.mutate({ current, next });
  }

  const mismatch = confirm.length > 0 && next !== confirm;

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:min-w-0">
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
          <Hint>At least {MIN_PASSWORD} characters.</Hint>
        </div>
        <div>
          <Label>Confirm new password</Label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
            className={inputClass}
          />
          {mismatch && <Hint>The two new passwords are different.</Hint>}
        </div>
      </div>
    </Card>
  );
}
