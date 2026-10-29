"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dismissKybPrompt, getKyb } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { KybBanner, KybPromptModal } from "@/components/dashboard/kyb-card";

const VERIFICATION_HREF = "/dashboard/settings#business-verification";

/**
 * The verification nudge: a one-time modal on first visit, then a slim banner
 * until the business is verified.
 *
 * Deliberately additive. It renders above the page content and never gates it:
 * if this query fails, or the user is a role that cannot act, nothing is shown
 * and every page keeps working. Sandbox is unaffected either way.
 *
 * Whether the modal is due is decided by the server (`showPrompt`), which
 * accounts for the role, the verification state, and whether this user has
 * dismissed it before. Keeping that server-side is what stops the modal
 * reappearing on a second device.
 */
export function KybGate() {
  const router = useRouter();
  const qc = useQueryClient();
  const { tenant } = useAuth();

  const q = useQuery({
    queryKey: ["kyb"],
    queryFn: getKyb,
    staleTime: 60_000,
    // A nudge is not worth retrying or interrupting anyone over.
    retry: false,
  });

  const dismissMut = useMutation({
    mutationFn: dismissKybPrompt,
    // Hide it immediately, then reconcile. Waiting on a round trip to close a
    // modal someone just dismissed feels broken.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["kyb"] });
      const previous = qc.getQueryData(["kyb"]);
      qc.setQueryData(["kyb"], (old: unknown) =>
        old && typeof old === "object"
          ? { ...(old as object), showPrompt: false, promptDismissedAt: new Date().toISOString() }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      // Put it back rather than leaving a dismissal that never persisted.
      if (ctx?.previous) qc.setQueryData(["kyb"], ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["kyb"] });
    },
  });

  const state = q.data;
  if (!state) return null;

  if (state.showPrompt) {
    return (
      <KybPromptModal
        dismissing={dismissMut.isPending}
        onDismiss={() => dismissMut.mutate()}
        onStart={() => {
          // Engaging counts as dismissing: the modal has done its job, and the
          // banner takes over until the application is submitted.
          dismissMut.mutate();
          router.push(VERIFICATION_HREF);
        }}
      />
    );
  }

  return (
    <KybBanner
      state={state}
      href={state.canSubmit ? VERIFICATION_HREF : null}
      sandbox={tenant?.mode !== "live"}
    />
  );
}

/**
 * Whether the merged bar above is currently carrying the sandbox notice.
 *
 * The overview page has its own sandbox banner; it asks this so the two do
 * not both render. Reads the same cached query the gate does, so it costs no
 * extra request and cannot disagree with what is on screen.
 */
export function useKybBannerCarriesSandboxNote(): boolean {
  const q = useQuery({ queryKey: ["kyb"], queryFn: getKyb, staleTime: 60_000, retry: false });
  const state = q.data;
  if (!state) return false;
  // The modal is an overlay, not the bar, so the overview keeps its own
  // banner while the modal is up.
  if (state.showPrompt) return false;
  return state.status !== "APPROVED";
}
