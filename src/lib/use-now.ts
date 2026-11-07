"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock, as a value a component may read during render.
 *
 * Reading `Date.now()` in a render body is impure: two renders of the same
 * props can disagree, and nothing tells the screen to re-render when the
 * answer changes. The session detail page had both halves of that problem. It
 * decided whether a session was still live by comparing its expiry to
 * `Date.now()` during render, which gated the End and Retarget buttons, so
 * leaving the page open past the expiry left both buttons offering an action
 * the call router would refuse.
 *
 * This is an external store rather than state plus an effect, for two
 * reasons. The clock is genuinely external to React, which is what
 * `useSyncExternalStore` is for; and every reader shares one interval instead
 * of each starting its own, so ten components asking the time cost one timer.
 *
 * The clock is read at module load and on each tick, never during a render.
 * `getSnapshot` hands back a value that was already computed, which is what
 * makes it safe to call as often as React likes.
 *
 * On the server it reports 0. Nothing rendered on the server depends on it:
 * the data these components compare against arrives from a client query, so a
 * server render has nothing to compare in the first place.
 */
let current = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  current = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    // One second is finer than anything that reads this needs, and coarse
    // enough that an idle tab is doing nothing worth measuring.
    timer = setInterval(tick, 1_000);
    // A tab that has been in the background may be reading a value from
    // minutes ago, so refresh on the way in rather than waiting a tick.
    tick();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): number => current;
const getServerSnapshot = (): number => 0;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
