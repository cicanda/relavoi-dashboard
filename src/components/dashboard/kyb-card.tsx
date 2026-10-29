"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, FileText, Trash2, Upload, X } from "lucide-react";
import {
  deleteKybDocument,
  getKyb,
  putKybDetails,
  submitKyb,
  uploadKybDocument,
  type KybDetailsPayload,
  type KybDocument,
  type KybDocumentKind,
  type KybState,
} from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";

/**
 * Business verification, as the tenant sees it.
 *
 * One card holding the whole flow: a status banner, the registered-identity
 * form, document uploads, and the submit action. The server owns the state
 * machine; this component only ever renders what `editable` and `status` say,
 * so a stale tab cannot be used to edit a submission that is already under
 * review.
 */

// Matches the server's allow-list. Checked here too so a 20 MB file is refused
// before it is put on a Nigerian uplink rather than after.
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const ACCEPTED_LABEL = "PDF, JPEG or PNG";
const MAX_BYTES = 10 * 1024 * 1024;

const KIND_LABELS: Record<KybDocumentKind, string> = {
  REGISTRATION_CERTIFICATE: "Certificate of registration",
  OWNER_ID: "Director or owner ID",
  STATUS_REPORT: "CAC status report",
  MEMART: "MEMART",
  PROOF_OF_ADDRESS: "Proof of address",
  OTHER: "Other document",
};

const UPLOAD_ORDER: KybDocumentKind[] = [
  "REGISTRATION_CERTIFICATE",
  "OWNER_ID",
  "STATUS_REPORT",
  "MEMART",
  "PROOF_OF_ADDRESS",
  "OTHER",
];

const inputClass =
  "field w-full";
const selectClass = `${inputClass} bg-paper`;
const primaryBtn =
  "btn btn-primary";
const secondaryBtn =
  "btn btn-secondary";

function Label({ children }: { children: ReactNode }) {
  return <label className="field-label">{children}</label>;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === "string" && detail.length > 0 ? detail : fallback;
}

/** Client-side gate. The server re-checks by magic bytes regardless. */
function validateFile(file: File): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_BYTES) {
    return `That file is ${fmtBytes(file.size)}. The limit is 10 MB.`;
  }
  // Some browsers report an empty type for a file dragged from certain apps;
  // let those through and let the server's content sniffing decide.
  if (file.type && !(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return `Documents must be ${ACCEPTED_LABEL}.`;
  }
  return null;
}

// ─── Status banner ────────────────────────────────────────────────────────────

function StatusBanner({ state, onEdit }: { state: KybState; onEdit: () => void }) {
  if (state.status === "APPROVED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-emerald-900">Business verified</div>
          <p className="text-[12px] text-emerald-800 mt-0.5">
            Your business is verified. You can activate live mode from API keys.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "PENDING") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
        <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-amber-900">Verification under review</div>
          <p className="text-[12px] text-amber-800 mt-0.5">
            Submitted{" "}
            {state.submittedAt ? new Date(state.submittedAt).toLocaleDateString() : "recently"}. We
            will email you when it is decided. Details and documents are locked while we review.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "REJECTED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
        <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-rose-900">Verification needs changes</div>
          {state.rejectionReason && (
            <p className="text-[12px] text-rose-800 mt-1 whitespace-pre-wrap break-words">
              {state.rejectionReason}
            </p>
          )}
          <button
            onClick={onEdit}
            className="mt-2 text-[12px] font-medium text-rose-900 underline hover:no-underline"
          >
            Edit and resubmit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-ink-200 bg-bone-50 p-3.5">
      <AlertCircle className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-900">Not submitted</div>
        <p className="text-[12px] text-ink-600 mt-0.5">
          Verify your business to activate live calls. Sandbox keeps working either way.
        </p>
      </div>
    </div>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  editable,
  onDelete,
  deleting,
}: {
  doc: KybDocument;
  editable: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5 border-t border-ink-200 first:border-t-0">
      <FileText className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink-900 break-words">{KIND_LABELS[doc.kind]}</div>
        <div className="text-[11px] text-ink-500 break-all">
          {doc.filename} · {fmtBytes(doc.sizeBytes)} ·{" "}
          {new Date(doc.uploadedAt).toLocaleDateString()}
        </div>
      </div>
      {editable && (
        <button
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Remove ${doc.filename}`}
          className="shrink-0 -my-2 w-11 h-11 lg:w-8 lg:h-8 lg:my-0 flex items-center justify-center rounded-full text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

// ─── Upload control ───────────────────────────────────────────────────────────

interface PendingUpload {
  id: string;
  name: string;
  percent: number;
  error?: string;
}

function UploadRow({
  kind,
  required,
  disabled,
  onPick,
  pending,
}: {
  kind: KybDocumentKind;
  required: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  pending: PendingUpload[];
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="py-3 border-t border-ink-200 first:border-t-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] text-ink-900">
            {KIND_LABELS[kind]}
            {required && <span className="text-rose-600 ml-1">*</span>}
          </div>
          <div className="text-[11px] text-ink-500">{ACCEPTED_LABEL}, up to 10 MB</div>
        </div>
        <div className="shrink-0">
          <input
            ref={ref}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Reset first, so picking the same file twice still fires.
              e.target.value = "";
              if (f) onPick(f);
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => ref.current?.click()}
            className={`${secondaryBtn} btn-sm w-full sm:w-auto`}
          >
            <Upload className="w-3.5 h-3.5" /> Choose file
          </button>
        </div>
      </div>

      {pending.map((p) => (
        <div key={p.id} className="mt-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-ink-600 break-all min-w-0">{p.name}</span>
            <span className={p.error ? "text-rose-600 shrink-0" : "text-ink-500 shrink-0"}>
              {p.error ? "Failed" : `${p.percent}%`}
            </span>
          </div>
          {p.error ? (
            <div className="mt-1 text-[11px] text-rose-600 break-words">{p.error}</div>
          ) : (
            <div className="mt-1 h-1 w-full rounded-full bg-bone-200 overflow-hidden">
              <div
                className="h-full bg-signal-500 transition-[width] duration-200"
                style={{ width: `${p.percent}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── The card ─────────────────────────────────────────────────────────────────

export function BusinessVerificationCard({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [forceEdit, setForceEdit] = useState(false);
  const [pending, setPending] = useState<Record<string, PendingUpload[]>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["kyb"], queryFn: getKyb, staleTime: 15_000 });
  const state = q.data;

  const [form, setForm] = useState<KybDetailsPayload>({
    registrationType: "COMPANY",
    legalName: "",
    registrationNumber: "",
    registeredAddress: "",
    city: "",
    state: "",
    contactName: "",
    contactPhone: "",
    website: "",
  });

  // Seed the form from the server once, and again whenever the saved details
  // change underneath (a resubmission, or another admin editing).
  useEffect(() => {
    if (!state) return;
    const d = state.details;
    setForm({
      registrationType: d.registrationType ?? "COMPANY",
      legalName: d.legalName ?? "",
      registrationNumber: d.registrationNumber ?? "",
      registeredAddress: d.registeredAddress ?? "",
      city: d.city ?? "",
      state: d.state ?? "",
      contactName: d.contactName ?? "",
      contactPhone: d.contactPhone ?? "",
      website: d.website ?? "",
    });
  }, [state?.details]);

  const detailsMut = useMutation({
    mutationFn: (payload: KybDetailsPayload) => putKybDetails(payload),
    onSuccess: () => {
      toast.success("Business details saved");
      void qc.invalidateQueries({ queryKey: ["kyb"] });
    },
    onError: (err) =>
      toast.error("Could not save", extractErrorMessage(err, "Check the fields and try again.")),
  });

  const submitMut = useMutation({
    mutationFn: submitKyb,
    onSuccess: () => {
      toast.success("Submitted for review", "We will email you when it is decided.");
      setForceEdit(false);
      void qc.invalidateQueries({ queryKey: ["kyb"] });
      void qc.invalidateQueries({ queryKey: ["live-requirements"] });
    },
    onError: (err) =>
      toast.error("Could not submit", extractErrorMessage(err, "Something is still missing.")),
  });

  async function onPick(kind: KybDocumentKind, file: File) {
    const problem = validateFile(file);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (problem) {
      // Surfaced inline against the row, not just as a toast, so it is clear
      // which file was refused.
      setPending((p) => ({
        ...p,
        [kind]: [...(p[kind] ?? []), { id, name: file.name, percent: 0, error: problem }],
      }));
      return;
    }

    setPending((p) => ({
      ...p,
      [kind]: [...(p[kind] ?? []), { id, name: file.name, percent: 0 }],
    }));

    try {
      await uploadKybDocument(kind, file, (percent) => {
        setPending((p) => ({
          ...p,
          [kind]: (p[kind] ?? []).map((u) => (u.id === id ? { ...u, percent } : u)),
        }));
      });
      setPending((p) => ({ ...p, [kind]: (p[kind] ?? []).filter((u) => u.id !== id) }));
      toast.success("Document uploaded");
      await qc.invalidateQueries({ queryKey: ["kyb"] });
    } catch (err) {
      const message = extractErrorMessage(err, "Upload failed. Try again.");
      setPending((p) => ({
        ...p,
        [kind]: (p[kind] ?? []).map((u) => (u.id === id ? { ...u, error: message } : u)),
      }));
    }
  }

  async function onDelete(doc: KybDocument) {
    setDeletingId(doc.id);
    try {
      await deleteKybDocument(doc.id);
      await qc.invalidateQueries({ queryKey: ["kyb"] });
      toast.success("Document removed");
    } catch (err) {
      toast.error("Could not remove", extractErrorMessage(err, "Try again."));
    } finally {
      setDeletingId(null);
    }
  }

  const docsByKind = useMemo(() => {
    const out = new Map<KybDocumentKind, KybDocument[]>();
    for (const d of state?.documents ?? []) {
      out.set(d.kind, [...(out.get(d.kind) ?? []), d]);
    }
    return out;
  }, [state?.documents]);

  if (q.isLoading) {
    return (
      <section className="card p-5">
        <Skeleton className="h-4 w-48" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="card p-5 text-sm text-ink-700">
        Could not load business verification. Refresh the page.
      </section>
    );
  }

  // The server decides; forceEdit only reveals the form again after a
  // rejection, it never unlocks a PENDING or APPROVED application.
  const editable = state.editable && canManage;
  const showForm = editable && (state.status !== "REJECTED" || forceEdit || !state.details.legalName);
  const readyToSubmit =
    editable && state.missingDetails.length === 0 && state.missingKinds.length === 0;

  return (
    <section id="business-verification" className="card p-[clamp(1.125rem,0.8rem+1.2vw,1.75rem)] scroll-mt-24 xl:grid xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] xl:gap-x-10">
      <div className="mb-5 xl:mb-0">
        <h2 className="section-title">Business verification</h2>
        <p className="text-[14px] text-ink-500 mt-1.5">
          Required before live mode. A Relavoi operator reviews your registration by hand.
        </p>
      </div>

      <div className="space-y-4 min-w-0">
        <StatusBanner state={state} onEdit={() => setForceEdit(true)} />

        {!canManage && (
          <p className="text-[12px] text-ink-500">
            Only an owner or admin can submit business verification.
          </p>
        )}

        {showForm && (
          <div className="space-y-4">
            {/* Stacked on a phone, two columns from sm up. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:min-w-0">
              <div className="sm:col-span-2">
                <Label>Registered name, exactly as on the certificate</Label>
                <input
                  className={inputClass}
                  value={form.legalName}
                  onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                  placeholder="Quickeatables Delivery Limited"
                />
              </div>

              <div>
                <Label>Registration type</Label>
                <select
                  className={selectClass}
                  value={form.registrationType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      registrationType: e.target.value as KybDetailsPayload["registrationType"],
                    })
                  }
                >
                  <option value="COMPANY">Limited company (RC)</option>
                  <option value="BUSINESS_NAME">Business name (BN)</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <Label>Registration number</Label>
                <input
                  className={inputClass}
                  value={form.registrationNumber}
                  onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                  placeholder="RC 1654321"
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Registered address</Label>
                <input
                  className={inputClass}
                  value={form.registeredAddress}
                  onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })}
                  placeholder="14 Admiralty Way, Lekki Phase 1"
                />
              </div>

              <div>
                <Label>City</Label>
                <input
                  className={inputClass}
                  value={form.city ?? ""}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Lagos"
                />
              </div>

              <div>
                <Label>State</Label>
                <input
                  className={inputClass}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="Lagos"
                />
              </div>

              <div>
                <Label>Contact name</Label>
                <input
                  className={inputClass}
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  placeholder="Full name"
                />
              </div>

              <div>
                <Label>Contact phone</Label>
                <input
                  className={inputClass}
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  placeholder="+2348012345678"
                  inputMode="tel"
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Website (optional)</Label>
                <input
                  className={inputClass}
                  value={form.website ?? ""}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                className={primaryBtn}
                disabled={detailsMut.isPending}
                onClick={() =>
                  detailsMut.mutate({
                    ...form,
                    city: form.city?.trim() ? form.city.trim() : null,
                    website: form.website?.trim() ? form.website.trim() : null,
                  })
                }
              >
                {detailsMut.isPending ? "Saving…" : "Save details"}
              </button>
            </div>
          </div>
        )}

        {/* ── Documents ── */}
        <div>
          <h3 className="text-[15px] font-medium tracking-[-0.01em] text-ink-900 mb-1">Documents</h3>
          <p className="text-[12px] text-ink-500 mb-2">
            A certificate of registration and a director or owner ID are required. Others help us
            decide faster.
          </p>

          {(state.documents.length > 0 || !editable) && (
            <ul className="mb-3">
              {state.documents.length === 0 && (
                <li className="py-2 text-[12px] text-ink-500">No documents uploaded.</li>
              )}
              {state.documents.map((d) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  editable={editable}
                  deleting={deletingId === d.id}
                  onDelete={() => void onDelete(d)}
                />
              ))}
            </ul>
          )}

          {editable && (
            <div className="rounded-xl border border-ink-200">
              <div className="px-3.5">
                {UPLOAD_ORDER.map((kind) => (
                  <UploadRow
                    key={kind}
                    kind={kind}
                    required={state.requiredKinds.includes(kind)}
                    disabled={!editable}
                    onPick={(f) => void onPick(kind, f)}
                    pending={pending[kind] ?? []}
                  />
                ))}
              </div>
            </div>
          )}

          {editable && docsByKind.size > 0 && state.missingKinds.length > 0 && (
            <p className="mt-2 text-[12px] text-amber-700">
              Still needed: {state.missingKinds.map((k) => KIND_LABELS[k]).join(", ")}.
            </p>
          )}
        </div>

        {/* ── Submit ── */}
        {editable && (
          <div className="pt-4 border-t border-ink-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-[12px] text-ink-500 min-w-0">
              {readyToSubmit
                ? "Everything we need is here."
                : [
                    state.missingDetails.length > 0
                      ? `Missing details: ${state.missingDetails.join(", ")}`
                      : null,
                    state.missingKinds.length > 0
                      ? `Missing documents: ${state.missingKinds
                          .map((k) => KIND_LABELS[k])
                          .join(", ")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(". ")}
            </div>
            <button
              // shrink-0 and nowrap: the missing-items text beside it is long
              // enough to squeeze the button until its label wraps and clips.
              className={`${primaryBtn} w-full sm:w-auto shrink-0 whitespace-nowrap`}
              disabled={!readyToSubmit || submitMut.isPending}
              onClick={() => submitMut.mutate()}
            >
              {submitMut.isPending ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── First-visit modal ────────────────────────────────────────────────────────

export function KybPromptModal({
  onStart,
  onDismiss,
  dismissing,
}: {
  onStart: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-navy/40 backdrop-blur-[2px] p-0 sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kyb-prompt-title"
    >
      <div className="bg-paper w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] shadow-raised ring-1 ring-ink-900/5 max-h-[90vh] overflow-y-auto animate-dialog-in">
        <div className="flex items-start justify-between gap-3 p-6 pb-3">
          <h2 id="kyb-prompt-title" className="section-title">
            Verify your business to go live
          </h2>
          <button
            onClick={onDismiss}
            disabled={dismissing}
            aria-label="Close"
            className="shrink-0 -m-1.5 w-10 h-10 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 hover:bg-bone-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6">
          <p className="text-[13px] text-ink-600">
            Sandbox works right now with no verification. To place real calls, we need to confirm
            who you are.
          </p>

          <ul className="mt-3 space-y-2">
            {[
              "Your registered business details",
              "Certificate of registration",
              "A director or owner ID",
              "About 5 minutes",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-ink-700">
                <CheckCircle2 className="w-4 h-4 text-signal-500 mt-0.5 shrink-0" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button onClick={onDismiss} disabled={dismissing} className={secondaryBtn}>
              {dismissing ? "Saving…" : "Do this later"}
            </button>
            <button onClick={onStart} className={primaryBtn}>
              Start verification
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slim persistent banner ───────────────────────────────────────────────────

// href is null for roles that cannot act on it: a nudge with a dead link is
// worse than a nudge with none.
//
// `sandbox` folds the sandbox-mode notice into this same bar. Both notices say
// something about not being live yet, and stacking two of them turns the top of
// every page into a wall. Verification comes first because it is the thing
// standing in the way; the sandbox note follows as context.
export function KybBanner({
  state,
  href,
  sandbox = false,
}: {
  state: KybState;
  href: string | null;
  sandbox?: boolean;
}) {
  if (state.status === "APPROVED") return null;

  const copy =
    state.status === "PENDING"
      ? { text: "Verification under review", link: null, tone: "amber" as const }
      : state.status === "REJECTED"
        ? { text: "Verification needs changes", link: "See why", tone: "rose" as const }
        : {
            text: "Verify your business to activate live calls",
            link: "Verify now",
            tone: "ink" as const,
          };

  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    ink: "border-ink-200 bg-paper text-ink-800 shadow-sm",
  };

  return (
    <div
      className={`mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3.5 py-2.5 text-[13px] ${tones[copy.tone]}`}
    >
      {state.status === "PENDING" ? (
        <Clock className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="min-w-0">{copy.text}</span>
      {copy.link && href && (
        <a href={href} className="font-medium underline hover:no-underline">
          {copy.link}
        </a>
      )}
      {sandbox && (
        <>
          {/* Hidden once the bar wraps, where the rule is orphaned at the end
              of a line instead of sitting between the two messages. */}
          <span aria-hidden="true" className="hidden sm:inline opacity-40">
            |
          </span>
          <span className="min-w-0 opacity-90">
            Sandbox calls are free and never placed.
          </span>
        </>
      )}
    </div>
  );
}
