# Relavoi Tenant Dashboard

Web dashboard for Relavoi tenants to manage sessions, view analytics, configure settings, and monitor usage.

## Stack

- Next.js 16 (App Router, Turbopack)
- React 19, TypeScript strict
- Tailwind v4 (CSS-based `@theme inline` design tokens)
- Zustand + persist for client auth (localStorage key `relavoi.auth.v1`)
- TanStack React Query for data
- Recharts for charts; lucide-react for icons
- IBM Plex Sans + Plex Mono via `next/font/google`

## Setup

```bash
cp .env.local.example .env.local
npm install
npm run dev -- -p 3001
# open http://localhost:3001/login
```

The dashboard needs the [relavoi-backend](https://github.com/cicanda/relavoi-backend) API to be reachable at the URL in `NEXT_PUBLIC_API_URL`. For local dev that's `http://localhost:8080/v1`.

## Dev credentials

Run `npm run seed` in `relavoi-backend` first. Then log in with:

| Email | Password |
|---|---|
| `dev@chowdeck.com` | `password123` |

## Pages

| Route | Description |
|---|---|
| `/login` | Email + password sign-in |
| `/signup` | 4-step onboarding wizard (Company → Use case → Numbers → Review) |
| `/dashboard` | Overview — greeting, active-session stats, recent sessions table |
| `/dashboard/sessions` | List + filter sessions; cursor pagination |
| `/dashboard/sessions/[id]` | Detail — timeline, metadata, Calls/SMS tabs, End Session action |
| `/dashboard/calls` | Cross-session call history with summary stats |
| `/dashboard/numbers` | Number pool — utilization gauge, per-region/per-provider tables |
| `/dashboard/analytics` | Call volume area chart, direction pie, sessions line chart |
| `/dashboard/billing` | Current period, per-metric progress bars, history |
| `/dashboard/api-keys` | View masked key + Rotate flow + SDK quick-start snippets |
| `/dashboard/webhooks` | Endpoint config, delivery log, signature verification examples |
| `/dashboard/sdk-docs` | Install + initialize tabs (Android/iOS/Web), feature grid |
| `/dashboard/settings` | General, Team, Session defaults, Recording, Push, SMS, Workspace, Password |

## Project layout

```
src/
  app/                  app router pages + layouts
  components/           shared UI (brand-mark, state-pill, stat-card, …)
  components/dashboard/ sidebar, topbar, auth-guard
  lib/
    types.ts            Session, CallRecord, Tenant, …
    auth-store.ts       zustand+persist; key `relavoi.auth.v1`
    api.ts              axios client + login/signup/etc
    format.ts           fmtRelative, fmtAbsolute, fmtNumber, slugify, …
```

## Design system

Tokens live in `src/app/globals.css` (Tailwind v4 `@theme inline`):
ink-{200..900}, bone-100, paper, signal-{500..700} (brand green).
Typography is IBM Plex Sans (UI) + IBM Plex Mono (IDs, phone numbers, codes).

See the public design language reference at https://docs.relavoi.com/design.

## Build & deploy

```bash
npm run build          # production build
npm run start          # serve the build locally
```

Production deploys via the Vercel Git integration (`main` → prod, branches → previews). Set `NEXT_PUBLIC_API_URL=https://api.relavoi.com/v1` in the Vercel project's environment variables. `.github/workflows/ci.yml` runs type-check + build on every PR; `deploy.yml` is a stub for CI-driven deploys when needed.

## Related Repositories

- [relavoi-backend](https://github.com/cicanda/relavoi-backend) — API server
- [relavoi-admin](https://github.com/cicanda/relavoi-admin) — Operator console
- [relavoi-android-sdk](https://github.com/cicanda/relavoi-android-sdk) — Android SDK
- [relavoi-ios-sdk](https://github.com/cicanda/relavoi-ios-sdk) — iOS SDK
- [relavoi-docs](https://github.com/cicanda/relavoi-docs) — Documentation site
- [relavoi-infra](https://github.com/cicanda/relavoi-infra) — Terraform infrastructure
