"use client";

import { useSyncExternalStore } from "react";

/**
 * The two pieces of per-session UI state the email verification nudge needs:
 * when the resend button becomes usable again, and whether the banner has
 * been collapsed.
 *
 * In sessionStorage rather than component state, because both are shared by
 * two surfaces. The banner lives in the app shell and the card lives in
 * Settings, and they must agree: asking for a link from one has to disable
 * the button on the other, or the per-hour limit gets spent by a person who
 * was told twice that they could try again.
 *
 * sessionStorage rather than localStorage, because the brief is that the
 * banner is collapsible for the session and not dismissible. A new tab, or
 * the same tab tomorrow, gets the banner back. Nothing here is a permission
 * or a record: the address is verified or it is not, and only the server
 * knows that.
 *
 * An external store rather than state plus an effect. Reading storage during
 * render would be impure and would differ between the server render and the
 * first client one; copying it into state from an effect is the pattern this
 * round removed everywhere else.
 */

const COOLDOWN_KEY = "relavoi.verify.cooldownUntil";
const COLLAPSED_KEY = "relavoi.verify.collapsed";

/**
 * How long the resend button stays disabled.
 *
 * The server allows five verification mails per user per hour and five per
 * address per hour from one IP, and refuses the sixth with a 429. A minute is
 * not that limit: it is the gap that stops somebody pressing the button three
 * times because the first mail has not arrived yet, which is how the hour's
 * allowance gets spent in ten seconds. The server stays the real limit, and a
 * 429 is still handled.
 */
export const RESEND_COOLDOWN_MS = 60_000;

export interface VerifyEmailUiState {
  /** Epoch ms the resend button becomes usable again. 0 means now. */
  cooldownUntil: number;
  collapsed: boolean;
  /** Whether a link has been asked for in this session. */
  requested: boolean;
}

const EMPTY: VerifyEmailUiState = { cooldownUntil: 0, collapsed: false, requested: false };

let snapshot: VerifyEmailUiState = EMPTY;
const listeners = new Set<() => void>();

function readStorage(): VerifyEmailUiState {
  try {
    const until = Number(window.sessionStorage.getItem(COOLDOWN_KEY) ?? "0");
    return {
      cooldownUntil: Number.isFinite(until) ? until : 0,
      collapsed: window.sessionStorage.getItem(COLLAPSED_KEY) === "1",
      requested: Number.isFinite(until) && until > 0,
    };
  } catch {
    // Private mode, or storage disabled. The nudge still works; it just
    // forgets, which is the right way for this to fail.
    return EMPTY;
  }
}

function refresh(): void {
  const next = readStorage();
  if (
    next.cooldownUntil === snapshot.cooldownUntil &&
    next.collapsed === snapshot.collapsed
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Pick up whatever this tab already had. Called from an effect, so storage
  // is readable and React will take the new snapshot straight afterwards.
  refresh();
  window.addEventListener("storage", refresh);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", refresh);
  };
}

const getSnapshot = (): VerifyEmailUiState => snapshot;
const getServerSnapshot = (): VerifyEmailUiState => EMPTY;

export function useVerifyEmailUi(): VerifyEmailUiState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function startResendCooldown(now: number): void {
  try {
    window.sessionStorage.setItem(COOLDOWN_KEY, String(now + RESEND_COOLDOWN_MS));
  } catch {
    // See readStorage.
  }
  refresh();
}

export function setBannerCollapsed(collapsed: boolean): void {
  try {
    window.sessionStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // See readStorage.
  }
  refresh();
}

/** Test seam: forget everything this module is holding. */
export function resetVerifyEmailUi(): void {
  snapshot = EMPTY;
  try {
    window.sessionStorage.removeItem(COOLDOWN_KEY);
    window.sessionStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // See readStorage.
  }
}
