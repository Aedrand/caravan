# R5: Application Stack — research findings (2026-06-10)

## TL;DR (~5 bullets)

- **Backend pick: Hono on Node.js 24 LTS.** Hono runs on Node, Bun, and edge runtimes from one codebase; its `@hono/node-server` v2 now includes native WebSocket via `upgradeWebSocket` (no separate adapter needed); RPC client `hc` gives end-to-end type safety without a code-gen step; ecosystem is large and growing fast.
- **Database/ORM: Drizzle ORM + better-sqlite3 on SQLite in WAL mode.** Drizzle's `migrate()` runs at boot (zero extra tooling), `drizzle-kit` generates SQL diffs, bundle is tiny. `node:sqlite` is Stability 1.2 RC in Node 24 — not stable enough for v1 yet. Commit SQLite-only for v1; Postgres escape hatch via Drizzle dialect swap is cheap to add later.
- **Frontend: Vite 8 + React 19.x + TanStack Router + TanStack Query v5 + Tailwind v4 + shadcn/ui (now Radix OR Base UI back-end) + dnd-kit.** Zustand for client-only UI state. Skip SSR entirely — correct call for a behind-auth self-hosted tool. SEO irrelevant.
- **Auth: Better Auth** is the 2026 consensus winner. Auth.js maintainers now direct new projects to it. Ships magic links, 2FA, org/invite, Drizzle adapter, SQLite support, and signed-token invite flows in its plugin system — all without a SaaS dependency.
- **Toolchain: pnpm workspace monorepo** (`apps/server`, `apps/web`, `packages/shared`), Biome v2 for lint+format, Vitest 4.x + Playwright for tests, multi-stage Dockerfile → single image ~200–300 MB amd64/arm64. Zod v4 for shared schema validation. pino for structured logs. GlitchTip for optional self-hosted error tracking.

---

## Backend

### Framework comparison

| Framework | WebSocket on Node | Type safety | Runtime portability | Notes |
|---|---|---|---|---|
| **Hono** | `upgradeWebSocket` built into `@hono/node-server` v2; older `@hono/node-ws` deprecated | `hc` RPC client, oRPC or tRPC adapters available | Node, Bun, Deno, CF Workers, Lambda | **Pick.** Best balance of type safety, WS, and portability. |
| **Fastify v5** | `@fastify/websocket` v5 (plugin); well-maintained | Plugin ecosystem mature; tRPC v11 adapter requires Fastify v5+ | Node only | Runner-up. More mature plugin ecosystem; slightly heavier DX. |
| **Express v5** | External `ws` lib; manual upgrade handler | No built-in TS safety | Node only | 40K RPS vs 120–150K for Hono/Fastify; pass. |
| **Elysia** | Native WS baked in | Excellent end-to-end TS with Eden | Bun-first (Node support experimental) | Best perf on Bun; too Bun-coupled for a broad self-host audience. |

- **Finding:** Hono benchmark on Node: ~120–150K RPS hello-world; Elysia on Bun: ~2.5M RPS, Hono on Bun: ~1.2M. In DB-bound workloads all converge at 10–15K RPS.
  - Source: https://www.pkgpulse.com/guides/hono-vs-express-vs-fastify-vs-elysia-2026
  - Date: 2026
  - Type: comparison blog

- **Finding:** `@hono/node-server` v2 ships `upgradeWebSocket` natively; `@hono/node-ws` is deprecated.
  - Source: https://hono.dev/docs/helpers/websocket + https://www.npmjs.com/package/@hono/node-ws
  - Date: 2026
  - Type: official docs + npm

- **Finding:** Fastify tRPC v11 adapter requires Fastify v5+; `@fastify/websocket` v5.0.0 is current.
  - Source: https://trpc.io/docs/server/adapters/fastify + https://github.com/fastify/fastify-websocket/releases
  - Date: 2026
  - Type: official docs

### Runtime: Node.js 24 LTS vs Bun

- **Finding:** Node.js 24 is the current Active LTS as of mid-2026. Node 22 is Maintenance LTS. Node 26 is Current (non-LTS until Oct 2026).
  - Source: https://nodejs.org/en/about/previous-releases
  - Date: 2026-06-10
  - Type: official

- **Finding:** Bun 1.2 is stable on Linux/macOS/Windows; used in production by Fortune 500 teams; npm compatibility ~92%; native addon blockers remain (sharp, bcrypt, node-gyp).
  - Source: https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide
  - Date: 2026
  - Type: vendor blog

- **Finding:** "Is Bun production ready 2026" is still a common search; "ready" depends heavily on your native module stack.
  - Source: https://tech-insider.org/bun-vs-nodejs-2026/
  - Date: 2026
  - Type: editorial

- **Pick:** Node 24 LTS for production self-host. Bun can be used for local dev tooling (`bun install`, `bun test`) but shipping Node ensures maximum contributor compatibility and Docker FROM base availability.

### End-to-end type safety

- **Finding:** Hono RPC (`hc`) — define routes server-side, export the type, import client; no code generation; works in browser/Node/edge.
  - Source: https://hono.dev/docs/guides/rpc
  - Date: 2026
  - Type: official docs

- **Finding:** tRPC v11 — established leader, deep TanStack Query integration, huge adapter ecosystem; Zod-only in v10 but v11 supports multiple schemas.
  - Source: https://www.pkgpulse.com/blog/orpc-vs-trpc-vs-hono-rpc-type-safe-apis-2026
  - Date: 2026
  - Type: comparison blog

- **Finding:** oRPC v1.0 — released Dec 2025; adds OpenAPI output (tRPC cannot), supports Zod/Valibot/ArkType; integrates with TanStack Query; Hono adapter available.
  - Source: https://www.infoq.com/news/2025/12/orpc-v1-typesafe/
  - Date: 2025-12
  - Type: news

- **Pick for Caravan:** Hono `hc` RPC client. Requires no extra library beyond Hono itself, is framework-native, and gives contributors a single mental model. If OpenAPI spec output becomes important (e.g., for AI endpoint documentation), oRPC is a clean upgrade path since it has a Hono adapter.

---

## Database / ORM

### SQLite driver

- **Finding:** `better-sqlite3` — synchronous API, 448K ops/sec benchmark, battle-tested, used in production for years; requires native build but Node 24 prebuilds are robust.
  - Source: https://sqg.dev/blog/sqlite-driver-benchmark/
  - Date: 2026
  - Type: benchmark blog

- **Finding:** `libsql` — async API, 224K ops/sec; best when a future Turso cloud migration is planned; 2x slower than better-sqlite3 for local file use.
  - Source: https://sqg.dev/blog/sqlite-driver-benchmark/
  - Date: 2026
  - Type: benchmark blog

- **Finding:** `node:sqlite` — Stability 1.2 "Release Candidate" in Node 24 (promoted from experimental flag in Node 25.7.0 / Feb 24, 2026). Not fully stable yet; API may change.
  - Source: https://nodejs.org/api/sqlite.html + https://blog.logrocket.com/node-js-24-features/
  - Date: 2026
  - Type: official docs + editorial

- **Pick:** `better-sqlite3`. Fastest, synchronous (simplifies Hono handler code), fully stable, Drizzle adapter mature.

### ORM

- **Finding:** Drizzle supports Cloudflare D1, bun:sqlite, better-sqlite3, and SQLite via HTTP Proxy; Prisma does not support all these SQLite targets.
  - Source: https://www.prisma.io/docs/orm/more/comparisons/prisma-and-drizzle
  - Date: 2026
  - Type: official docs

- **Finding:** Drizzle `migrate()` function runs migrations from a folder at application boot — ideal for self-hosted upgrades (`git pull && docker restart`).
  - Source: https://orm.drizzle.team/docs/migrations
  - Date: 2026
  - Type: official docs

- **Finding:** Prisma Migrate auto-generates migrations and handles destructive change warnings; Prisma Studio is a DX bonus; Prisma 7 announced but Drizzle still leads for SQLite-first deployments.
  - Source: https://techsy.io/en/blog/prisma-vs-drizzle-orm + https://encore.dev/articles/drizzle-vs-prisma
  - Date: 2026
  - Type: editorial

- **Pick:** Drizzle ORM. Lighter bundle, SQLite-native, programmatic `migrate()` at boot, good TypeScript inference, `drizzle-kit` for schema diffs.

### WAL mode & backups

- **Finding:** WAL mode works reliably in Docker named volumes on the same host; `PRAGMA journal_mode=WAL` recommended; concurrent readers don't block writers.
  - Source: https://simonwillison.net/2026/Apr/7/sqlite-wal-docker-containers/
  - Date: 2026-04-07
  - Type: research post

- **Finding:** Litestream (streaming replication to S3/B2/local) is described as "lightweight, battle-tested, and actively maintained" in 2026. LiteFS Cloud was sunset Oct 2024 but Litestream itself is separate and alive.
  - Source: https://litestream.io/ + https://pockit.tools/blog/sqlite-renaissance-turso-d1-libsql-production-guide/
  - Date: 2026
  - Type: official + editorial

- **Finding:** Simple `VACUUM INTO` backup to a dated copy works for manual snapshots without any extra tooling.
  - Source: https://sqlite.org (standard SQLite docs)

- **Pick:** Enable WAL in Drizzle's `db.run(sql`PRAGMA journal_mode=WAL`)` at boot. Ship Litestream as an optional sidecar in `compose.yml` for users who want continuous backup to S3/B2. Document `VACUUM INTO` as the simple alternative.

### Postgres escape hatch

- **Finding:** Drizzle supports both SQLite and PostgreSQL dialects with nearly identical query APIs; schema files differ but business logic does not need to change.
  - Source: https://github.com/drizzle-team/drizzle-orm/discussions/5269
  - Date: 2026
  - Type: GitHub discussion

- **Decision:** Commit SQLite-only for v1. Design the DB layer so the Drizzle dialect can be swapped; document as a future option. No Postgres code in v1.

---

## Frontend

### Versions

- **Finding:** React 19.2.4 released January 26, 2026; stable, enterprise-ready. Concurrent rendering, Actions, RSC stable (though we don't use RSC in a pure SPA).
  - Source: https://react.dev/versions + https://javascript-conference.com/blog/react-19-2-updates-performance-activity-component/
  - Date: 2026-01
  - Type: official + editorial

- **Finding:** Vite 8 released March 12, 2026; ships Rolldown (Rust bundler) as default; 10–30x faster builds; full plugin compatibility maintained.
  - Source: https://vite.dev/blog/announcing-vite8
  - Date: 2026-03-12
  - Type: official

- **Finding:** Tailwind CSS v4.3 current mid-2026 (v4.0 GA early 2025); CSS-first config via `@theme`; up to 100x faster incremental builds via Rust engine.
  - Source: https://tailwindcss.com/blog/tailwindcss-v4 + https://releasebot.io/updates/tailwind
  - Date: 2026
  - Type: official + release tracker

### Router

- **Finding:** TanStack Router — 1.2M weekly downloads (fast-growing); fully typed search params, path params, loader data; best-in-class type safety for SPAs.
  - Source: https://www.pkgpulse.com/blog/tanstack-router-vs-react-router-v7-2026
  - Date: 2026
  - Type: comparison blog

- **Finding:** React Router v7 — 12M+ weekly downloads; merged with Remix; advanced type safety and RSC features only available in "framework mode" (SSR), not in plain SPA mode.
  - Source: https://medium.com/ekino-france/tanstack-router-vs-react-router-v7-32dddc4fcd58
  - Date: 2026
  - Type: editorial

- **Finding:** SSR skip is correct for a behind-auth self-hosted app: SEO irrelevant, no hydration complexity, simpler Hono static file serving.
  - Source: Multiple comparison sources; unanimous on this point.

- **Pick:** TanStack Router (SPA mode). Type-safe routes are worth the smaller download count; contributors will be on a modern standard.

### Data layer

- **Finding:** TanStack Query v5 pattern for WebSocket cache updates: receive WS message → call `queryClient.setQueryData()` or `queryClient.invalidateQueries()`; `refetchOnWindowFocus` typically disabled when WS is active.
  - Source: https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/
  - Date: 2026
  - Type: editorial

- **Pick:** TanStack Query v5 for server state + WS-driven invalidation. Zustand for client-only UI state (map viewport, panel open/close, drag state). Jotai is an equally valid pick for atomic reactive state but Zustand's simpler mental model is better for OSS contributors.

### Styling & components

- **Finding:** shadcn/ui now fully supports Tailwind v4: CLI initializes v4 projects, all components updated for Tailwind v4 + React 19, HSL → OKLCH color conversion (non-breaking).
  - Source: https://ui.shadcn.com/docs/tailwind-v4
  - Date: 2026
  - Type: official docs

- **Finding:** Base UI 1.0 launched Feb 2026 with 35 accessible components; 7-person full-time team; Radix UI development has slowed since WorkOS acquisition.
  - Source: https://www.infoq.com/news/2026/02/baseui-v1-accessible/
  - Date: 2026-02
  - Type: news

- **Finding:** shadcn/ui now supports Base UI as an underlying primitive layer alongside Radix, rebuilt with same API.
  - Source: https://dev.to/edriso/shadcn-vs-radix-vs-base-ui-which-one-should-a-junior-pick-in-2026-1jml
  - Date: 2026
  - Type: editorial

- **Pick:** Tailwind v4 + shadcn/ui (start with Radix back-end; Base UI migration is non-breaking if Radix maintenance further degrades). shadcn's copy-into-repo model gives full visual control for the custom warm travel aesthetic — no fighting a pre-styled library.

### Drag and drop

- **Finding:** dnd-kit is the 2026 standard: 15K+ GitHub stars, keyboard + touch + pointer support, OptimisticSortingPlugin for immediate DOM reorder without full React re-render; supports cross-list moves.
  - Source: https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react + https://dndkit.com/
  - Date: 2026
  - Type: editorial + official

- **Finding:** Atlassian pragmatic-drag-and-drop is institutionally backed (used in large-scale production apps); no React dependency; better for large-scale performance; steeper setup; migration path from react-beautiful-dnd exists.
  - Source: https://www.pkgpulse.com/guides/dnd-kit-vs-react-beautiful-dnd-vs-pragmatic-drag-drop-2026
  - Date: 2026
  - Type: comparison blog

- **Pick:** dnd-kit. Simpler API, better React integration, sufficient for itinerary list + cross-day moves + touch.

---

## Auth

### Better Auth

- **Finding:** Better Auth is the consensus pick for new TypeScript projects in 2026; Auth.js maintainers now direct new projects to Better Auth.
  - Source: https://github.com/nextauthjs/next-auth/discussions/13252 + https://blog.logrocket.com/best-auth-library-nextjs-2026/
  - Date: 2026
  - Type: official discussion + editorial

- **Finding:** Better Auth features: 50+ plugins including magic links, 2FA (TOTP + email OTP), passkeys, RBAC, multi-tenancy/org with invitations, JWT mode; Drizzle adapter with joins support (since v1.4.0); SQLite support confirmed.
  - Source: https://better-auth.com/docs/plugins + https://better-auth.com/docs/adapters/drizzle
  - Date: 2026
  - Type: official docs

- **Finding:** Session model: HTTP-only cookie with rolling expiration + DB session record via Drizzle; supports immediate session revocation across devices.
  - Source: https://www.noorix.com.au/blog/self-hosted-nodejs-authentication-comparison-2026/
  - Date: 2026
  - Type: editorial

- **Finding:** Auth.js v5 added App Router TS support but multi-tenant/org features still require significant custom code; maintenance is now in "security fixes only" mode for most new feature areas.
  - Source: https://authjs.dev/getting-started/migrate-to-better-auth
  - Date: 2026
  - Type: official migration guide

### Invite links

- **Finding:** Better Auth's organization plugin includes invitation flows with signed tokens; custom single-use vs multi-use with expiry configurable.
  - Source: https://better-auth.com/docs/plugins
  - Date: 2026
  - Type: official docs

- **Finding:** Magic link plugin generates cryptographically secure tokens by default; `generateToken` returns a long random string.
  - Source: https://better-auth.com/docs/plugins/magic-link
  - Date: 2026
  - Type: official docs

### OIDC/SSO

- **Finding:** Better Auth has an OIDC plugin available; adding it later is low-friction since it's a plugin, not a core rewrite.
  - Source: https://better-auth.com/docs/plugins
  - Date: 2026
  - Type: official docs

- **Decision:** Defer OIDC for v1; plugin approach means it can be added in a minor version without breaking changes.

---

## Supporting Pieces

### Email

- **Finding:** react-email + nodemailer is the 2026 standard: write JSX components, `@react-email/render` outputs HTML string, pass to nodemailer's `sendMail`. Local dev preview via `npx email dev`. Full TypeScript support.
  - Source: https://react.email/docs/integrations/nodemailer + https://ecosire.com/blog/react-email-templates-guide
  - Date: 2026
  - Type: official docs + editorial

- **Pick:** nodemailer + react-email. "No SMTP configured" path: log the email content to stdout + return a warning in the UI. No queue needed at this scale.

### Web push

- **Finding:** `web-push` npm package (web-push-libs org); 3.5K stars; VAPID key generation + sendNotification; actively maintained in 2026.
  - Source: https://github.com/web-push-libs/web-push
  - Date: 2026
  - Type: official repo

- **Finding:** iOS PWA push requires Home Screen install + iOS 16.4+; EU users blocked (Apple removed standalone PWA under DMA); subscription loss after device restart still reported; Safari 18.4 added Declarative Web Push.
  - Source: https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye + https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
  - Date: 2026
  - Type: editorial

- **Decision:** Implement web push as optional/best-effort. Document iOS Home Screen requirement. EU limitation is a known gap.

### PWA / offline

- **Finding:** vite-plugin-pwa wraps Workbox; recommended strategy: `NetworkFirst` for API calls, `CacheFirst` for static assets, precache the SPA shell for offline read.
  - Source: https://vite-pwa-org.netlify.app/guide/service-worker-precache + https://www.enjoytoday.cn/posts/vite-pwa-guide/
  - Date: 2026
  - Type: official docs + editorial

- **Pick:** vite-plugin-pwa with Workbox `NetworkFirst` strategy for itinerary data + precached SPA shell. Offline = read last-cached itinerary; writes are queued or blocked with user messaging.

### Validation

- **Finding:** Zod v4 stable as of 2026; shipped at `zod/v4` subpath alongside `zod` (v3 compat); 14x faster string parsing, 2.3x smaller bundle; most major libs (tRPC v11+, react-hook-form v8, TanStack Form) have v4 support.
  - Source: https://zod.dev/v4 + https://pockit.tools/blog/zod-v4-migration-guide-breaking-changes-new-features/
  - Date: 2026
  - Type: official + editorial

- **Pick:** Zod v4. Share schema definitions in `packages/shared` between server and client. Import from `zod/v4`.

### Jobs / scheduling

- **Finding:** Croner — TypeScript-native, DST-aware, ~600K weekly downloads, production-grade error recovery; node-cron — simpler, ~3M weekly downloads. Both run in-process. No external queue needed at Caravan's scale.
  - Source: https://www.pkgpulse.com/blog/node-cron-vs-node-schedule-vs-croner-task-scheduling-2026
  - Date: 2026
  - Type: comparison blog

- **Pick:** Croner for in-process scheduling (email digest reminders, push notification scheduling). No queue (BullMQ/Redis adds ops complexity for no benefit at <10 users per instance).

### Logging

- **Finding:** pino — 2.4x faster than Winston in benchmarks; structured JSON output; pino 9 + OpenTelemetry integration for traceId/spanId in log lines.
  - Source: https://signoz.io/guides/pino-logger-nodejs-logging-library/
  - Date: 2026
  - Type: editorial

- **Pick:** pino. Self-host-friendly: logs to stdout, operators pipe to their preferred aggregator (Loki, Datadog, etc.).

### Error tracking

- **Finding:** GlitchTip 6 (Feb 2026) — implements Sentry SDK protocol; existing `@sentry/*` instrumentation works unchanged; runs on PostgreSQL + Redis + Django + Celery; 2GB VPS comfortable for small/mid volume; no Replay or Profiling support.
  - Source: https://danubedata.ro/blog/self-host-sentry-glitchtip-error-tracking-2026 + https://earezki.com/ai-news/2026-03-14-glitchtip-vs-sentry/
  - Date: 2026
  - Type: editorial

- **Pick:** Document GlitchTip as optional; default to pino stdout logs. GlitchTip adds Postgres + Redis overhead which conflicts with single-container goal — provide as `compose.override.yml` example.

### i18n

- **Finding:** Paraglide-JS — compiler-based, tree-shaken, type-safe message functions, 47KB vs 205KB for i18next in typical build; noisier project structure (`.inlang/` dir).
  - Source: https://brodin.dev/blog/paraglide-vs-react-i18n
  - Date: 2026
  - Type: editorial

- **Decision:** Defer i18n for v1. Wrap all user-facing strings in a thin `t()` shim from day one so adding Paraglide later is mechanical. react-i18next is the safe runner-up for contributors familiar with the ecosystem.

### Testing

- **Finding:** Vitest 4.x (latest major per search results: "vitest-dev team shipping Vitest 4.1"); Vite-native, shares Vite config, 3.8x faster than Jest 30 on Node 22; browser mode via Playwright integration available.
  - Source: https://medium.com/@securestartkit/next-js-testing-in-2026-vitest-playwright-0caf6dd1f829 + https://johal.in/2026-testing-framework-shootout-jest-30-vs-vitest-2026/
  - Date: 2026
  - Type: editorial

- **Pick:** Vitest (unit + component) + Playwright (E2E) + React Testing Library (component render helpers). API testing: Hono's `app.request()` test helper for unit-level route tests; Playwright for integration.

### Lint / format

- **Finding:** Biome v2 (early 2026) — single binary replacing ESLint + Prettier + import sorting; monorepo nested config with `"extends": ["//"]`; ~75–85% of typescript-eslint type-aware rules; 20–100x faster than ESLint + Prettier.
  - Source: https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026 + https://www.devbolt.dev/blog/biome-vs-eslint
  - Date: 2026
  - Type: comparison blogs

- **Finding:** ESLint v9 flat config overhaul; full TypeScript type-system rules via typescript-eslint (Biome's coverage gap); better framework-specific plugin support (e.g., eslint-plugin-react-hooks advanced rules).
  - Source: https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/
  - Date: 2026
  - Type: editorial

- **Pick:** Biome v2 for this project. OSS contributors benefit from zero-config fast feedback. Gap in type-aware rules is acceptable; add `eslint-plugin-react-hooks` via ESLint only if Biome's coverage proves insufficient.

---

## The Recommended Stack (single table)

| Slot | Pick | Version | Runner-up | Why pick wins |
|---|---|---|---|---|
| Runtime | Node.js | 24 LTS | Bun 1.2 | Contributor familiarity, Docker base image availability, 100% npm compat |
| HTTP / API framework | Hono | latest (v4.x) | Fastify v5 | WS built-in, multi-runtime, `hc` RPC, MCP endpoint easy to add |
| Type-safe client | Hono `hc` RPC | (bundled) | oRPC v1 | Zero extra lib; oRPC if OpenAPI spec needed |
| SQLite driver | better-sqlite3 | v9.x | libsql | Fastest, sync, stable; libsql if Turso cloud path desired |
| ORM + migrations | Drizzle ORM + drizzle-kit | latest | Prisma 7 | SQLite-native, programmatic `migrate()` at boot, thin bundle |
| Backup | Litestream (optional sidecar) | latest | VACUUM INTO file | Continuous replication to S3; opt-in via compose |
| Bundler | Vite | 8.x | Turbopack | Stable, widest ecosystem, Rolldown speed |
| UI framework | React | 19.2.x | — | Stable, Actions, concurrent rendering |
| Router | TanStack Router | v1.x | React Router v7 (SPA) | Full type safety in SPA mode; no SSR needed |
| Server state | TanStack Query | v5 | SWR | WS cache invalidation pattern, devtools, ecosystem |
| Client state | Zustand | v5.x | Jotai | Simpler API, better for OSS contributor onboarding |
| CSS | Tailwind CSS | v4.3 | UnoCSS | Dominant ecosystem, v4 Rust speed |
| Component primitives | shadcn/ui | latest | Base UI | Copy-in model = full aesthetic control; Radix OR Base UI back-end |
| Drag and drop | dnd-kit | v6.x | pragmatic-dnd | React-native, touch support, cross-list, accessible |
| Auth | Better Auth | latest (v1.x+) | Auth.js v5 | Ships everything needed (magic links, invites, 2FA, Drizzle), no SaaS fees |
| Validation | Zod | v4 (`zod/v4`) | Valibot | Industry standard; shared client/server schemas |
| Email templates | react-email + nodemailer | latest | MJML | JSX DX, no external service required |
| Web push | web-push (VAPID) | latest | — | Standard protocol; iOS caveats documented |
| PWA / offline | vite-plugin-pwa + Workbox | latest | — | Precache SPA shell, NetworkFirst for API |
| Scheduling | Croner | latest | node-cron | TypeScript-native, DST-aware, in-process |
| Logging | pino | v9.x | Winston | Fastest JSON logger, stdout-first |
| Error tracking | GlitchTip (optional) | v6 | Sentry self-host | Sentry SDK compat, lower resource footprint |
| i18n | Defer (thin `t()` shim) | — | Paraglide-JS | Avoid complexity in v1; shim makes migration mechanical |
| Testing (unit) | Vitest | v4.x | Jest 30 | Vite-native, 3.8x faster, shares config |
| Testing (E2E) | Playwright | latest | Cypress | Browser matrix, component testing available |
| Lint + format | Biome | v2.x | ESLint v9 + Prettier | Single binary, 20–100x faster, monorepo nested config |
| Package manager | pnpm | v9.x | npm workspaces | Disk-efficient, workspace protocol, `pnpm deploy` for Docker |

---

## Repo Layout & Build Pipeline Recommendation

### Monorepo structure

```
caravan/
  apps/
    server/          # Hono Node.js server (REST + WS + static + MCP)
    web/             # Vite + React SPA
  packages/
    shared/          # Zod schemas, TypeScript types, constants
  pnpm-workspace.yaml
  biome.json         # root; apps/*/biome.json extend with "extends": ["//"]
  Dockerfile
  compose.yml
```

- **Finding:** pnpm `pnpm deploy` command prunes dev deps and copies only runtime deps — essential for minimal Docker image.
  - Source: https://pnpm.io/cli/deploy
  - Date: 2026
  - Type: official docs

- **Finding:** Multi-stage Dockerfile pattern: Base → Deps (copy lock files, install) → Build (compile TS, bundle Vite) → Production (copy dist + pruned node_modules).
  - Source: https://oneuptime.com/blog/post/2026-01-30-docker-multi-stage-monorepos/view
  - Date: 2026-01-30
  - Type: editorial

### Docker strategy

- **Approach:** Single container: `apps/server` serves `apps/web/dist` as static files from `/public`. One port (e.g., 3000). One volume mount for SQLite file + WAL files.
- **Realistic image size:** Node 24 Alpine base → ~200–300 MB amd64; arm64 available via multi-arch build (`docker buildx bake`).
- **Self-host UX:** `git clone` → `docker compose up -d` → visit `:3000`. Env vars: `DATABASE_PATH`, `SESSION_SECRET`, `SMTP_*` (optional), `VAPID_*` (optional).

---

## Implications for Other Decisions

- **Sync engine research:** The server must support WebSocket. Hono (`@hono/node-server` v2 `upgradeWebSocket`) satisfies this. Any sync library (e.g., Y.js, Electric, custom CRDT) can attach to the same Node process.
- **MCP endpoint:** Hono routes make adding an MCP HTTP endpoint trivial (`/mcp` route group); no separate process needed.
- **Postgres escape hatch:** Drizzle dialect swap is the path; schema files will need to be duplicated or abstracted with a factory, but query code stays the same.
- **AI endpoints:** Can be additional Hono route handlers calling OpenAI/Anthropic APIs; no extra framework needed.
- **Mobile reference use:** Vite PWA + TanStack Router SPA + Tailwind responsive classes covers desktop planning + mobile in-trip. No React Native; no Capacitor.

---

## Open Questions / Unverified Claims

1. **Vitest exact latest major version** — search results mention "Vitest 4.1" but also reference "Vitest 2.0" in some benchmarks. The version cited (4.x) should be verified at https://vitest.dev/releases before pinning.
2. **Better Auth exact version number** — docs confirm v1.x+ with Drizzle joins since 1.4.0 but the exact latest semver was not captured. Check https://better-auth.com/releases.
3. **dnd-kit latest major** — cited as v6.x based on general 2026 sources; confirm at https://github.com/clauderic/dnd-kit/releases.
4. **Hono MCP adapter** — "MCP endpoint on Hono" is assumed straightforward (HTTP route) but an official Hono MCP SDK adapter was not verified. Check https://github.com/honojs/middleware.
5. **`node:sqlite` stable timeline** — RC as of Feb 2026 (Node 25.7.0); unclear if Node 26 LTS (Oct 2026) ships it as Stability 2. Worth re-checking before v1 release.
6. **iOS EU PWA push** — Apple's DMA compliance situation evolves; the EU restriction on standalone PWA mode may change. Needs monitoring.
7. **Litestream active maintainer** — "battle-tested and actively maintained" cited in 2026 blog; GitHub commit frequency not directly verified. Check https://github.com/benbjohnson/litestream/commits.
8. **Base UI as shadcn default** — claim that "shadcn/ui now officially supports Base UI as underlying primitive layer (Feb 2026)" should be confirmed at https://ui.shadcn.com/docs.

---

## Sources

1. https://www.pkgpulse.com/guides/hono-vs-express-vs-fastify-vs-elysia-2026 — framework RPS benchmarks and WS comparison — accessed 2026-06-10
2. https://www.oflight.co.jp/en/columns/hono-vs-express-fastify-elysia-comparison-2026 — framework DX comparison — accessed 2026-06-10
3. https://hono.dev/docs/helpers/websocket — Hono WS helper official docs — accessed 2026-06-10
4. https://www.npmjs.com/package/@hono/node-ws — deprecated node-ws package — accessed 2026-06-10
5. https://github.com/honojs/node-server — @hono/node-server with built-in WS — accessed 2026-06-10
6. https://nodejs.org/en/about/previous-releases — Node.js release schedule — accessed 2026-06-10
7. https://endoflife.date/nodejs — Node.js LTS dates — accessed 2026-06-10
8. https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide — Bun production maturity 2026 — accessed 2026-06-10
9. https://tech-insider.org/bun-vs-nodejs-2026/ — Bun readiness assessment — accessed 2026-06-10
10. https://www.pkgpulse.com/blog/orpc-vs-trpc-vs-hono-rpc-type-safe-apis-2026 — RPC type safety comparison — accessed 2026-06-10
11. https://hono.dev/docs/guides/rpc — Hono RPC official docs — accessed 2026-06-10
12. https://www.infoq.com/news/2025/12/orpc-v1-typesafe/ — oRPC v1.0 release — accessed 2026-06-10
13. https://sqg.dev/blog/sqlite-driver-benchmark/ — better-sqlite3 vs libsql benchmark — accessed 2026-06-10
14. https://nodejs.org/api/sqlite.html — node:sqlite official docs (Stability 1.2) — accessed 2026-06-10
15. https://blog.logrocket.com/node-js-24-features/ — node:sqlite status in Node 24 — accessed 2026-06-10
16. https://orm.drizzle.team/docs/migrations — Drizzle programmatic migrations — accessed 2026-06-10
17. https://www.prisma.io/docs/orm/more/comparisons/prisma-and-drizzle — Prisma vs Drizzle official comparison — accessed 2026-06-10
18. https://encore.dev/articles/drizzle-vs-prisma — Drizzle vs Prisma editorial 2026 — accessed 2026-06-10
19. https://techsy.io/en/blog/prisma-vs-drizzle-orm — Prisma 7 vs Drizzle — accessed 2026-06-10
20. https://simonwillison.net/2026/Apr/7/sqlite-wal-docker-containers/ — SQLite WAL in Docker research (Simon Willison) — accessed 2026-06-10
21. https://litestream.io/ — Litestream official — accessed 2026-06-10
22. https://pockit.tools/blog/sqlite-renaissance-turso-d1-libsql-production-guide/ — Litestream 2026 status — accessed 2026-06-10
23. https://react.dev/versions — React version history — accessed 2026-06-10
24. https://javascript-conference.com/blog/react-19-2-updates-performance-activity-component/ — React 19.2 features — accessed 2026-06-10
25. https://vite.dev/blog/announcing-vite8 — Vite 8 release announcement — accessed 2026-06-10
26. https://tailwindcss.com/blog/tailwindcss-v4 — Tailwind v4.0 release — accessed 2026-06-10
27. https://releasebot.io/updates/tailwind — Tailwind release tracker (v4.3 current) — accessed 2026-06-10
28. https://www.pkgpulse.com/blog/tanstack-router-vs-react-router-v7-2026 — router comparison 2026 — accessed 2026-06-10
29. https://medium.com/ekino-france/tanstack-router-vs-react-router-v7-32dddc4fcd58 — TanStack Router vs RR v7 — accessed 2026-06-10
30. https://ui.shadcn.com/docs/tailwind-v4 — shadcn/ui Tailwind v4 official docs — accessed 2026-06-10
31. https://www.infoq.com/news/2026/02/baseui-v1-accessible/ — Base UI v1.0 launch — accessed 2026-06-10
32. https://dev.to/edriso/shadcn-vs-radix-vs-base-ui-which-one-should-a-junior-pick-in-2026-1jml — shadcn Base UI support — accessed 2026-06-10
33. https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react — dnd-kit 2026 status — accessed 2026-06-10
34. https://www.pkgpulse.com/guides/dnd-kit-vs-react-beautiful-dnd-vs-pragmatic-drag-drop-2026 — dnd-kit vs pragmatic-dnd — accessed 2026-06-10
35. https://github.com/nextauthjs/next-auth/discussions/13252 — Auth.js directing to Better Auth — accessed 2026-06-10
36. https://blog.logrocket.com/best-auth-library-nextjs-2026/ — auth library comparison 2026 — accessed 2026-06-10
37. https://better-auth.com/docs/plugins — Better Auth plugins (magic link, 2FA, org) — accessed 2026-06-10
38. https://better-auth.com/docs/adapters/drizzle — Better Auth Drizzle adapter — accessed 2026-06-10
39. https://better-auth.com/docs/plugins/magic-link — magic link plugin — accessed 2026-06-10
40. https://better-auth.com/docs/plugins/2fa — 2FA plugin — accessed 2026-06-10
41. https://authjs.dev/getting-started/migrate-to-better-auth — Auth.js → Better Auth migration guide — accessed 2026-06-10
42. https://react.email/docs/integrations/nodemailer — react-email + nodemailer integration — accessed 2026-06-10
43. https://ecosire.com/blog/react-email-templates-guide — react-email production guide 2026 — accessed 2026-06-10
44. https://github.com/web-push-libs/web-push — web-push library repo — accessed 2026-06-10
45. https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye — iOS PWA push 2026 status — accessed 2026-06-10
46. https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide — iOS PWA limitations — accessed 2026-06-10
47. https://vite-pwa-org.netlify.app/guide/service-worker-precache — vite-plugin-pwa precache docs — accessed 2026-06-10
48. https://zod.dev/v4 — Zod v4 release notes — accessed 2026-06-10
49. https://pockit.tools/blog/zod-v4-migration-guide-breaking-changes-new-features/ — Zod v4 migration guide — accessed 2026-06-10
50. https://www.pkgpulse.com/blog/node-cron-vs-node-schedule-vs-croner-task-scheduling-2026 — scheduler comparison 2026 — accessed 2026-06-10
51. https://signoz.io/guides/pino-logger-nodejs-logging-library/ — pino guide 2026 — accessed 2026-06-10
52. https://danubedata.ro/blog/self-host-sentry-glitchtip-error-tracking-2026 — GlitchTip self-host 2026 — accessed 2026-06-10
53. https://brodin.dev/blog/paraglide-vs-react-i18n — Paraglide vs react-i18next — accessed 2026-06-10
54. https://medium.com/@securestartkit/next-js-testing-in-2026-vitest-playwright-0caf6dd1f829 — Vitest + Playwright 2026 — accessed 2026-06-10
55. https://johal.in/2026-testing-framework-shootout-jest-30-vs-vitest-2026/ — Vitest 2026 benchmarks — accessed 2026-06-10
56. https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026 — Biome vs ESLint 2026 — accessed 2026-06-10
57. https://www.devbolt.dev/blog/biome-vs-eslint — Biome v2 migration guide — accessed 2026-06-10
58. https://pnpm.io/cli/deploy — pnpm deploy for Docker — accessed 2026-06-10
59. https://oneuptime.com/blog/post/2026-01-30-docker-multi-stage-monorepos/ — monorepo Dockerfile patterns — accessed 2026-06-10
60. https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/ — TanStack Query + WebSocket pattern — accessed 2026-06-10
61. https://github.com/fastify/fastify-websocket/releases — @fastify/websocket v5 — accessed 2026-06-10
62. https://trpc.io/docs/server/adapters/fastify — tRPC Fastify adapter — accessed 2026-06-10
63. https://github.com/drizzle-team/drizzle-orm/discussions/5269 — Drizzle SQLite + Postgres dual dialect — accessed 2026-06-10
