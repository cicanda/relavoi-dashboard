# Backlog

Work that was found, understood and deliberately not done, with enough detail
that picking it up does not mean rediscovering it. Dated entries, newest first.
Delete an entry when it ships; do not leave it here marked done.

## 2026-11-02

### Eleven react-hooks findings, downgraded to warnings when linting landed

This repo had no ESLint until today. Adding it surfaced 16 errors. Five were
fixed in the same commit; these eleven are real and each needs a behaviour
change to a screen, so they are warnings in `eslint.config.mjs` rather than
disabled or left failing the build.

`react-hooks/set-state-in-effect`, ten sites, two patterns:

- `src/app/dashboard/calls/page.tsx:117`, `sessions/page.tsx:121` reset
  pagination state in an effect keyed on the filters. React can render the
  intermediate state, so the list can flash the old page under the new filter.
  The React 19 answer is to key the list component on the filter tuple and let
  it remount, which is also less code than the reset.
- `calls/page.tsx:152`, `sessions/page.tsx:150` accumulate the query's pages
  into component state from an effect watching `q.data`. That is derived data
  held in state; it belongs in the query cache. `useInfiniteQuery` is what
  TanStack Query provides for exactly this and would delete both effects.
- `settings/page.tsx:204` and `:542`, `webhooks/page.tsx:249` and `:260`,
  `kyb-card.tsx:409`, `billing/topup/return/page.tsx:46` all sync fetched data
  into form state in an effect. Each is the same shape: a form whose initial
  values come from a query. The fix is to render the form only once the query
  has settled and pass the values as `defaultValue`, or to key the form on the
  record id.

`react-hooks/purity`, one site:

- `src/app/dashboard/sessions/[id]/page.tsx:187` reads `Date.now()` during
  render to decide whether a session is still live, which gates the End and
  Retarget buttons. Two renders of the same session can disagree. It is also a
  small real bug: leave the page open past the expiry and the buttons stay. The
  fix is to hold the current time in state and refresh it on an interval, so
  the screen notices expiry instead of being right only when it happens to
  re-render.

Not done now because the sessions, calls and settings screens are three that
Genesis has redesigned, and a refactor of how they hold their data does not
belong in the commit that introduces linting. Every other rule, and any new
instance of these two, still fails the build.
