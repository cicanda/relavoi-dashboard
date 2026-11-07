import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // Both of these outlive a test otherwise: the store in lib/use-now keeps a
  // module-level interval, and a component that wrote a flag in one test
  // would be read by the next.
  vi.useRealTimers();
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    // Private mode and similar. Nothing to clear.
  }
});

// jsdom implements neither, and the dashboard's cards and dialogs use both.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
