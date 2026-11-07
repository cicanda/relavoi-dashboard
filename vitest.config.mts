import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Component tests, in jsdom.
 *
 * This repository had no test runner at all until 7 November 2026. It was
 * added for one reason: the react-hooks round changed how six screens hold
 * their data, and "the build is green and the screenshots look right" is not
 * evidence that a filter change no longer shows the previous filter's rows,
 * or that a background refetch no longer overwrites what somebody is typing.
 * Those are the behaviours that changed, so those are what is tested.
 *
 * Not Playwright, which the operator console uses: these assertions are about
 * a component's own state over time, they need no backend, and a CI job with
 * no API to talk to can run them. The e2e suite next door answers a different
 * question.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
