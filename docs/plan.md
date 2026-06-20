# Caravan — End-to-End Implementation Plan

Drafted 2026-06-10; **ratified by the owner 2026-06-11** (all decisions ACCEPTED — see `decisions.md`; TD-7 modified: OAuth 2.1 ships with v1.3). **Build status: M0 + M1 COMPLETE (M1 closed 2026-06-19)** — walking skeleton, full collaborative itinerary (create/edit/reorder), presence, attributed feed, and the two-browser gate all landed and CI-green. Contracts frozen; the parallel fan-out (Tracks A–E) is open. Companion reading order: `../PROJECT.md` → `decisions.md` → this file.

**This plan is built for parallel execution.** After a deliberately serial foundation (M0–M1) establishes the contracts, the work fans out into independent tracks with disjoint file ownership, designed so multiple implementation agents (or people) can run concurrently without colliding. §5 defines the execution model; every task is tagged `[P]` (parallel-safe) or `[S]` (serial/foundation).

---

## 1. What we're building, in one paragraph

A single Docker container that a tech-savvy friend runs (`docker compose up`), serving a React SPA where their friend group plans trips together: a real-time co-edited, day-grouped itinerary with an ideas pool, voting, polls, and comments; an attributed activity feed for async catch-up; expense tracking with minimal-transaction settlement; an ambient map; and — layered on later, never load-bearing — a House AI assistant on the host's API key plus a bring-your-own-AI surface over MCP.

## 2. Release map & success criteria

| Release | Contents | Done when |
|---|---|---|
| **v1.0** | Feature areas 1–4 + self-host story (PD-12): trips, members, invites, real-time itinerary + presence, ideas/votes/polls/comments, activity feed, expenses + settlement, ambient map, email invites/digest (SMTP-optional), polished responsive UI, one-command deploy | A real friend group plans a real trip end-to-end on a stranger's deployment with zero support |
| **v1.1** | House AI (TD-6) | NL edit applied by AI, visibly attributed, on a budget-capped key; everything still works with AI unconfigured |
| **v1.2** | PWA offline-read + web push (PD-6/PD-7) | Itinerary readable in airplane mode; poll-closing push lands on a phone |
| **v1.3** | Personal AI: MCP + PAT **+ OAuth 2.1** (TD-7, owner decision 2026-06-11), audit UI | Claude Desktop *and* claude.ai web read & (with opt-in) write a trip, attributed and audit-logged |

North-star qualities (tested, not aspirational): the **two-browser test** (TD-9) stays green from M1 forever; container cold-start to usable < 10 s; fresh-clone contributor to running dev environment < 10 min.

## 3. Architecture overview

### 3.1 Process & module map

One Node 24 process (Hono). One SQLite file. No other services.

```
apps/server/src/
  index.ts            # boot: pragmas → migrate() → start
  auth/               # Better Auth mount + session helpers       [M0]
  db/                 # drizzle schema, migrations, fixtures      [M0, contract]
  core/mutations/     # mutation registry: validate→authorize→apply→feed→broadcast [M1, contract]
  core/ws/            # trip rooms, broadcast, presence           [M1]
  core/permissions.ts # role checks (owner/editor/viewer, ghosts) [M1, contract]
  features/<area>/    # trips, itinerary, decisions, expenses, geo, ai, mcp, notify
                      #   each: routes.ts (hc-typed) + service.ts + mutations.ts
  static.ts           # serve apps/web/dist (+ SPA fallback)
apps/web/src/
  app/                # router, shell, providers, theme           [M0]
  lib/sync/           # optimistic mutation client, ws, catch-up  [M1, contract]
  features/<area>/    # UI per feature area (mirrors server)
  components/ui/      # shadcn/ui + Caravan design tokens         [M0 + Track E]
packages/shared/
  schemas/            # Zod: entities, mutation payloads, API DTOs [contract]
  tools/              # AI/MCP tool definitions (Zod) — single registry for TD-6/TD-7
```

### 3.2 Data model (the schema contract)

All relational (TD-1/TD-3); money in minor units; timestamps epoch-ms; IDs random 128-bit.

- **Identity/instance:** Better Auth tables + `user_profiles` (display name, avatar color) · `instance_settings` (registration_open, …)
- **Trips:** `trips` (name, destination, start/end dates, currency, archived_at, version) · `trip_members` (role owner|editor|viewer, status active|**ghost** (PD-9), ai_write_enabled (PD-11), last_seen_version) · `invite_links` (token_hash, role, expires_at, revoked_at)
- **Itinerary:** `activities` (trip, date **nullable = ideas pool** (PD-2), **position** fractional index, title, start/end time, place_name, address, lat/lng, place_provider/ref, category, notes, link_url, created_by) · `activity_votes` (activity × member)
- **Decisions:** `polls` (question, multi_select, allow_member_options, closes_at, closed_at) · `poll_options` (+created_by) · `poll_votes` · `comments` (polymorphic target: activity|poll, author, edited_at)
- **Money:** `expenses` (amount_minor, category, paid_by, date?, activity_id?, …) · `expense_splits` (member, amount_minor) · `payments` (from → to, amount_minor)
- **Sync/feed:** `feed_events` (trip, **version** — per-trip monotonic, actor_type user|house_ai|personal_ai, actor_member, verb, entity_type/id, payload summary, ts) — *this one table is simultaneously the sync catch-up log, the activity feed, and the attribution record*
- **Notifications:** `notification_prefs` · `push_subscriptions`
- **AI (tables land early, features later):** `ai_usage` (token windows) · `ai_audit_log` (TD-7 schema) · `personal_ai_tokens` (hash, trip scopes, can_write, revoked_at) · `ai_chat_messages` (v1.1)
- **Infra:** `geocode_cache`

### 3.3 The sync contract (TD-1) — frozen at end of M1

```
POST /api/trips/:id/mutations   { id (idempotency), type, payload }     → { version, event }
GET  /api/trips/:id/snapshot                                            → full state + version
GET  /api/trips/:id/events?since=<version>                              → missed events
WS   /api/trips/:id/ws          server→client: events + presence; client→server: presence only
```

Every mutation: Zod-validate → permission check → SQLite transaction (apply + `feed_events` insert + version bump) → broadcast. Adding a feature = registering mutation types + handlers; **the pipeline itself never changes after M1** — that's what makes the fan-out safe. House AI and MCP call the *same* service functions with a different actor.

### 3.4 Frontend sync client (M1, contract)

TanStack Query holds server state; `lib/sync` applies mutations optimistically (rollback on reject), applies broadcast events via `setQueryData`, runs version catch-up on reconnect, and exposes `usePresence(tripId)`. Feature tracks consume these hooks; they never touch the WS directly.

## 4. Dependency DAG

```
M0 Walking skeleton [S]
 └─ M1 Collaborative itinerary core [S]   ← the contracts freeze here
     ├─ Track A: Decisions (votes/polls/comments)        [P] ─┐
     ├─ Track B: Expenses & settlement                   [P]  ├─ M6 v1.0 hardening & release [S]
     ├─ Track C: Map & places                            [P]  │
     ├─ Track D: Self-host polish (email/admin/docs/ops) [P]  │
     └─ Track E: Design & polish pass (continuous)       [P] ─┘
         M6 ─┬─ M7 House AI (v1.1)        [P with M8]
             └─ M8 PWA + push (v1.2)      [P with M7]
                 M7 ─ M9 Personal AI/MCP + OAuth 2.1 (v1.3)
```

Tracks A–D are mutually independent: disjoint DB tables (additive migrations only), disjoint `features/<area>/` directories on both server and web, communicating only through the §3 contracts. Track E touches shared UI but owns `components/ui/` and visual-only changes. M7∥M8 are independent. M9's edge to M7 is **build-order only** (the shared tool registry, task 7.2): at runtime House AI and Personal AI are independently enableable per instance — both, either, or none (TD-6/TD-7, owner directive 2026-06-11) — and if priorities ever flip, the registry simply builds in M9 with M7 consuming it instead.

## 5. Parallel execution model

How implementation actually runs (the part this plan is shaped around):

1. **Supervisor + specialists.** A supervisor session owns: the contracts (`packages/shared`, `db/schema`, `core/`), task dispatch, merge order, and integration tests. Specialist agents (or contributors) each own one track at a time.
2. **Isolation:** each track runs in its own git worktree/branch (`track/decisions`, `track/expenses`, …). File-ownership map (§3.1) is the collision-avoidance rule; CI rejects PRs that modify files outside the track's ownership plus its own migrations.
3. **Contract discipline:** during fan-out phases, changes to `packages/shared`, `core/`, or existing migrations require supervisor sign-off (in practice: a tiny serial PR that all tracks rebase on). New tables/columns are fine; mutations to shared shapes are not.
4. **Migration coordination:** migration files are numbered with a track prefix lane (e.g., `0301_expenses_*`) allocated up front so parallel branches never conflict on filenames; supervisor squashes ordering at merge.
5. **Merge train per milestone:** tracks merge in a fixed order (smallest diff first), each behind a green two-browser test + their own acceptance tests. Integration issues are supervisor work, not track work.
6. **Task granularity:** every task below is sized to one focused agent session (S ≈ half-day-human-equivalent, M ≈ 1–2 days, L ≈ 3+, split before dispatch). `[P]`-tagged tasks within a track can also run concurrently when they touch different files.

## 6. Work breakdown

### 6.0 Vision → plan traceability

Every commitment in `PROJECT.md`/`product-brief.md` and where it lands:

| Vision item | Decision | Plan home |
|---|---|---|
| Trip workspaces, roles, invite links | PD-9, PD-10 | 1.1, 1.5 |
| Trip dashboard (name, dates, members) | — | 1.1 |
| Day-by-day itinerary, categories, notes | PD-1 | 1.6, 1.7 |
| Drag-to-reorder, cross-day moves | TD-1 | 1.6, 1.8 |
| Real-time co-editing, no lost edits | TD-1 | 1.2–1.4 · gate 1.11 |
| Live presence | PD-5 | 1.3, 1.9 |
| Activity feed / async catch-up | PD-5, PD-7 | 1.2, 1.10 |
| Archive / duplicate / leave / remove / delete | PD-9 | 1.1, 1.5 |
| Place search + autocomplete | TD-5 | C.1, C.2 |
| Ambient map, pins ↔ cards | TD-5 | C.3, C.4 |
| Voting on activities | PD-2 | A.1 |
| Polls + convert-to-activity | PD-3 | A.2, A.3 |
| Comments | PD-4 | A.4 |
| Expenses, splits, categories | PD-8 | B.1 |
| Payments + min-transaction settlement | PD-8 | B.2–B.4 |
| Booking link-outs only | PD-12 | 1.7 (`link_url` + link-out buttons) |
| Consumer-grade UI, states, responsive | — | E.1–E.4 |
| Notifications: invites / digest / push | PD-7 | D.1, D.2, M8 |
| Offline read + installable PWA | PD-6 | M8 |
| House AI (chat, NL edits, conflicts, budgets, per-trip toggle) | TD-6 | M7 |
| Personal AI (tools, permissions, audit, OAuth) | PD-11, TD-7 | M9 |
| AI surfaces independently optional (both/either/none) | TD-6, TD-7 | M7 (env key), M9 (`personal_ai_enabled` toggle) |
| One-command self-host, backups, admin | TD-3, TD-4 | 0.7–0.9, D.3–D.6 |
| Export, trip-from-prompt, mentions, scratchpad | PD-12 | §9 backlog (deliberate) |

### M0 — Walking skeleton `[S]` (foundation; some internal parallelism)

| # | Task | Size | Notes / acceptance |
|---|---|---|---|
| 0.1 | Repo scaffold: pnpm workspace, TS config, Biome, Vitest, Playwright harness, CI (lint+typecheck+test) | M | `pnpm i && pnpm dev` runs both apps |
| 0.2 | `packages/shared` bootstrap: Zod v4, entity schema stubs, ID/time helpers | S | Imported by both apps |
| 0.3 | Drizzle + better-sqlite3: pragmas, `migrate()` on boot (fail-fast), initial schema (identity/instance/trips tables), fixtures | M | Boot creates DB; bad migration exits non-zero |
| 0.4 | Better Auth: email/password, sessions, `user_profiles`; instance bootstrap (env-preseed admin / first-user-admin, registration toggle) (TD-4/PD-10) | M | Register→login→session persists; second registration blocked when closed |
| 0.5 | Hono server shell: static SPA serving + SPA fallback, `/health`, pino, error envelope, hc client export | S | |
| 0.6 | Web shell: TanStack Router, providers, layout, theme tokens (warm palette v0), shadcn/ui init, empty dashboard | M | |
| 0.7 | Dockerfile (multi-stage, pnpm deploy, amd64+arm64) + compose + HEALTHCHECK + GHCR publish workflow + nightly cold-boot smoke test (TD-9) | M | Fresh volume → migrate → healthy |
| 0.8 | `SECRET_KEY` auto-generation to volume; env config module with validation + defaults table | S | Zero-env boot works |
| 0.9 | Job-registry bootstrap: single croner instance in `core/jobs`, registration API, startup/shutdown lifecycle | S | Tracks A (poll auto-close) and D (digests) register jobs here — no parallel-track scheduler collisions |

0.1→(0.2,0.3,0.5 parallel)→(0.4,0.6,0.7,0.8,0.9 parallel). **Exit:** `docker compose up` → register → empty dashboard, in CI.

### M1 — Collaborative itinerary core `[S]` (the heart; internal parallelism after 1.1–1.3)

| # | Task | Size | Notes / acceptance |
|---|---|---|---|
| 1.1 | ✅ Trips + members + roles: CRUD, dashboard, create flow (name/dates/currency), archive + duplicate-as-template + delete-with-confirm (PD-9) | M | Done 2026-06-11 |
| 1.2 | ✅ **Mutation pipeline** (§3.3): registry, idempotency, permission middleware, `feed_events` + version, broadcast hook | L | Contract artifact — supervisor-owned. Done 2026-06-11; events/responses carry an entity post-image |
| 1.3 | ✅ WS rooms + presence channel + catch-up endpoints | M | Done 2026-06-11. Reconnect catch-up = hello-version check → snapshot refetch |
| 1.4 | ✅ **Client sync lib** (§3.4): optimistic apply/rollback, event application, presence hook | L | Contract artifact. Done 2026-06-11 |
| 1.5 | ✅ Membership flows: invite links (create/revoke/expiry, role-carrying), join flow (signup→membership), leave trip + owner-removes-member with ghost semantics, ghost-rejoin reattach, ownership transfer (PD-9/10) | M | Done 2026-06-11; e2e 03 covers link→register→collaborate. Explicit semantics: ghost-rejoin reattaches the row but takes the LINK's role (links are role-carrying grants); any valid invite opens instance registration (multi-use by design — revisit scope at M6 security pass). ⚑ review debt: now that non-owner members exist, revisit trip.update being editor-gated (incl. currency — PD-8/10) and duplicate having no role gate |
| 1.6 | ✅ Itinerary data layer: activity mutations (create/update/delete/move/reorder), fractional indexing util (property-tested) | M | Done 2026-06-11. Concurrent same-item moves converge (LWW on date+position) |
| 1.7 | Itinerary UI: day timeline + ideas pool, activity cards, create/edit (no map yet — freeform location), category chips, `link_url` field + **link-out buttons** (open in Google Maps / booking site — PD-12: link-outs are the only booking story) | L | ✅ Done 2026-06-19 — `components/itinerary/*` (board, day sections derived from PD-1 date range ∪ activity dates, ideas pool, activity card, create/edit dialog) wired into the trip route. Promote/demote between day and Ideas goes through `activity.move`; other edits via `activity.update`. Born on the E.1 tokens (cv-card, category color tokens, Bricolage). Verified in-browser (add → renders on Day 1 with Map link-out). Reorder/drag is 1.8 |
| 1.8 | dnd-kit: reorder within day, drag across days, drag idea→day (touch + keyboard) | M | ✅ Done 2026-06-19 — `@dnd-kit` DndContext over the board; each day + ideas pool is a droppable column, cards drag by a grip handle (links/menu stay clickable). `onDragEnd` computes the new fractional position from the drop neighbors and fires `activity.move` (date + position); same-slot drops are skipped to avoid feed noise. Pointer + touch + keyboard sensors. Verified in-browser (drag Day 1 → Day 2 relocates + persists) |
| 1.9 | Presence UI: member avatars, "editing now" hints, recently-edited flash (PD-5) | S | ✅ Done 2026-06-19 — header `PresenceStrip` (online members, person-colored avatars + green dot, shared join-order color map); per-card "✦ name is editing…" hints driven by reporting `view.editing` while the edit dialog is open; recently-edited flash on `updatedAt` advance (seeds silently on mount). ⚑ debt cleared: WS heartbeat added (`startHeartbeat` ping/terminate via `ws.raw`, half-open sockets reaped → leave roster). Solo-verified avatar+dot; multi-member hints/avatars exercise in the 1.11 two-browser gate |
| 1.10 | Activity feed UI: per-trip feed, catch-up divider + unread count from `last_seen_version` (PD-7) | M | ✅ Done 2026-06-19 — collapsible `FeedPanel`: newest-first attributed lines ("Priya added X · 2m ago"), person-colored actor avatars, AI actor shown as Scout ✦, catch-up divider frozen at open, unread badge from `last_seen_version`, mark-seen on open. Live events prepend via the sync context; history via the new descending `events?before=` page. ⚑ debt cleared: `events` now dual-mode (`?since` forward / `?before` newest) and **returns `hasMore`** — no silent 500 truncation; new `GET/POST :tripId/seen` cursor. Solo-verified the feed renders real events; divider/unread across sessions exercise in 1.11 |
| 1.11 | **Two-browser Playwright test** (TD-9) + sync unit/integration suite | M | ✅ Done 2026-06-19 — `e2e/04-two-browser-gate.spec.ts` (5/5 e2e green): ① independent adds both persist ③ move converges via `activity.move` ④ presence "2 here now" + live editing hints both sides ⑤ feed attributes both actors ⑥ B offline → reconnect catch-up replays. ② same-field LWW and ⑦ optimistic rollback are covered deterministically by `apply.test.ts`/`sync.test.ts` (called out in the spec) rather than re-proven in the flaky multi-browser path |

**Exit:** ✅ **M1 complete (2026-06-19)** — the product's core promise is demo-able and CI-tested. Contracts are frozen; the parallel fan-out (Tracks A–E) is now open.

### Track A — Decisions `[P]` (≈ M2)

| # | Task | Size |
|---|---|---|
| A.1 | Vote toggle: mutation + optimistic UI + voter avatars + ideas-sort-by-votes (PD-2) | M |
| A.2 | Polls: create (multi-select / member-options flags), vote, close (manual + scheduled via the 0.9 job registry), results live view (PD-3) | L |
| A.3 | Poll→activity conversion (winning option → ideas pool) | S |
| A.4 | Comments on activities + polls: flat stream, edit/delete rules (PD-4), feed integration | M |
| A.5 | Feed verbs + digest copy for all of the above; E2E: poll lifecycle in two browsers | S |

### Track B — Expenses `[P]` (≈ M3)

| # | Task | Size |
|---|---|---|
| B.1 | Expense CRUD + splits (equal default / exact with sum validation), category set, optional day/activity link (PD-8) | L |
| B.2 | Payments (first-class, from→to) + edit/delete permission rules | S |
| B.3 | **Settlement engine**: net balances → greedy min-transaction list; largest-remainder rounding; exhaustive unit tests incl. ghosts (PD-8/9) | M |
| B.4 | Money UI: expense list/forms, settlement screen ("who pays whom"), per-person + per-category totals, trip budget overview | L |
| B.5 | Feed integration + E2E: log → split → settle in two browsers | S |

### Track C — Map & places `[P]` (≈ M4)

| # | Task | Size |
|---|---|---|
| C.1 | Geo proxy: `/api/geo/search|reverse` — Photon default, Geoapify/LocationIQ via env, SQLite cache, per-deployment rate limit (TD-5) | M |
| C.2 | Place autocomplete in activity form (debounced ≥300 ms), freeform fallback, provenance fields | M |
| C.3 | Map pane: MapLibre + OpenFreeMap, pins + clustering, pin↔card bidirectional highlight/scroll, unplotted-activities affordance | L |
| C.4 | Split-view workspace layout: persistent map beside itinerary (desktop), toggle/bottom-sheet (mobile). **C.4 owns all map-pane layout**, consuming the shell slots E.1 defines; E.3 explicitly excludes the map pane | M |
| C.5 | Tile/geocoder provider config surface + attribution + docs (incl. PMTiles heavy mode page) | S |

### Track D — Self-host polish `[P]` (≈ M5)

| # | Task | Size |
|---|---|---|
| D.1 | SMTP email: nodemailer + react-email; invite + membership emails; graceful unconfigured path (PD-7) | M |
| D.2 | Daily digest: job via the 0.9 registry, per-trip batching, opt-out prefs | M |
| D.3 | Admin panel — scope: writable (registration toggle, instance name, **theme picker per TD-10**: presets + custom hues, light/dark), read-only (members/trips/disk usage), backup button (`VACUUM INTO` → snapshot download), admin-role route guard | M |
| D.4 | Litestream opt-in (entrypoint co-process), backup/restore + upgrade/rollback docs incl. when-to-enable guidance and S3/B2 cost note (TD-4) | S |
| D.5 | Docs: install guide (compose + `docker run`), Caddy/Traefik examples, config reference (generated from env module), CONTRIBUTING + DCO, demo seed script | M |
| D.6 | release-please + version surfacing in UI footer; security headers, rate limiting middleware | S |

### Track E — Design & polish `[P]` (continuous through fan-out)

| # | Task | Size |
|---|---|---|
| E.1 | Design language **as the default theme of the TD-10 token contract**: define the semantic token set (incl. status colors, radius) + the warm default expressed in it; `<BrandMark/>` indirection for identity marks; type scale, card system, motion guidelines — applied to shell + itinerary first. **Run alongside 1.7/1.8 so the itinerary is born compliant** | M | 🟡 Foundation landed 2026-06-19 (grounds in approved "D · The Blend" design): **two-axis token system per TD-11** (`data-style` poster+material × `data-theme` warm+dusk) in `apps/web/src/index.css`; self-hosted Bricolage/Albert via `@fontsource`; `BrandMark` + logo SVGs; `cv-control`/`cv-card` personality classes; Button/Card/auth-shell/header adopt them (placeholder emoji retired). Independent axis swap verified by screenshot. **Remaining:** `.dark` mode values per theme; category/stamp/avatar component tokens applied to itinerary surfaces as 1.7+ land; admin two-select picker is D.3 |
| E.2 | Empty/loading/error states for every feature surface (work with A–D as they land) | M |
| E.3 | Responsive pass: in-trip mobile ergonomics (today view, thumb reach, bottom nav) | M |
| E.4 | Accessibility: keyboard paths (incl. dnd), focus management, contrast audit | M |

### M6 — v1.0 hardening & release `[S]`

Integration QA across tracks · **full design sweep** (the stage-2 visual pass: consistency audit across every surface, layout/positioning/density refinements, E.3/E.4 finishing — E.1 established the language, this conforms the whole app to it) · full E2E suite green · perf budget (snapshot < 100 ms at 500-activity trip; bundle audit) · security pass (invite token entropy, session fixation, rate limits, headers) · load sanity (10 concurrent editors) · README screenshots + demo instance · tag v1.0.0 → GHCR → awesome-selfhosted submission.

### M7 — House AI (v1.1) `[P with M8]`

| # | Task | Size |
|---|---|---|
| 7.1 | AI service core: AI SDK v6 provider factory from env, `ai_usage` budgets/rate limits, feature-flag exposure to client (TD-6) | M |
| 7.2 | **Tool registry** in `packages/shared/tools`: Zod tools wrapping the service layer (read itinerary, add/update/move activity, detect conflicts, expenses summary, search places) — *built once, reused by MCP in M9* | M |
| 7.3 | Trip chat panel: streaming UI, history (`ai_chat_messages`), "AI is acting" affordances | L |
| 7.4 | NL edits: tool loop (`maxSteps≤5`), AI actor attribution in feed, tool-incapable-model degradation to suggestions (TD-6) | M |
| 7.5 | Deterministic conflict detection (overlaps, gaps — pure code) surfaced inline + to AI context; LLM semantic warnings labeled as AI opinion | M |
| 7.6 | Admin AI usage dashboard + per-trip enable toggle | S |

### M8 — PWA + notifications (v1.2) `[P with M7]`

vite-plugin-pwa (precache shell, NetworkFirst data) → offline read of visited trips (PD-6) · install prompts + icons · web-push (VAPID env, subscription management, prefs UI) · push events: poll closing, trip starting, payment received (PD-7) · iOS caveats doc.

### M9 — Personal AI (v1.3): MCP + PAT + OAuth 2.1

Instance-level `personal_ai_enabled` setting (admin panel; OFF → token UI hidden, `/mcp` 404s; works with or without House AI configured — TD-7) · PAT management UI (scopes, revoke, last-used) · MCP Streamable HTTP endpoint at `/mcp` reusing the M7 tool registry, bearer auth, **Origin validation + explicit CORS policy** (Streamable HTTP requirement), per-trip write opt-in + member badge (PD-11) · `ai_audit_log` UI for owners · rate limits · REST+PAT fallback docs · **OAuth 2.1 (PKCE) authorization server over the PAT store** (owner decision 2026-06-11: ships with v1.3, not deferred — claude.ai web/mobile + ChatGPT covered at launch of the surface) · connection guides (Claude Desktop/Code, claude.ai web, ChatGPT). M9 is now the largest post-v1.0 milestone; it parallelizes internally: OAuth server ∥ MCP endpoint/tools ∥ PAT + audit UI.

## 7. Testing strategy (TD-9 applied)

- **Per track:** unit tests for logic (settlement to the cent, fractional indexing properties, permission matrix), `app.request()` integration tests per route, one flagship Playwright flow per track (run two-browser where collaboration is involved).
- **Always-on:** the M1 two-browser test is the canary — any track that breaks it blocks the merge train.
- **Self-host CI:** nightly cold-boot of the published image (empty volume → migrate → register → smoke).
- **Pre-release (M6):** cross-track E2E narrative test — "plan a weekend trip": create, invite, ideas, vote, schedule, expenses, settle — as one Playwright scenario.

## 8. Risks & mitigations

| Risk | Exposure | Mitigation |
|---|---|---|
| Sync glue correctness (we own it — TD-1) | Core promise | Contracts frozen at M1; two-browser CI gate; property tests; pattern is industry-proven (Linear/Figma) |
| Fan-out integration drift | Schedule | File-ownership CI rule, contract sign-off discipline, merge train, supervisor integration tests |
| OpenFreeMap / Photon public instances degrade (no SLA) | Maps UX | Server-side proxy + cache; env-swap to keyed providers; PMTiles/self-Photon documented exit (TD-5) |
| Better Auth fit for invite-centric flows | M0/M1 | Membership is our domain code (TD-2); worst case Better Auth handles identity only — already the design |
| MCP TS SDK v1.x middleware gaps | M9 | Manual `StreamableHTTPServerTransport` wiring is a known fallback; spec pinned to 2025-11-25 with swappable auth (TD-7) |
| Single-maintainer deps (Hocuspocus avoided; OpenFreeMap, Litestream remain) | Ops | All are optional/swappable layers; pin versions + Renovate |
| **TREK is a confirmed direct competitor** (fact-check refuted the "open niche" finding: it has real-time group co-editing, polls, expense splits, AGPL, Node+SQLite, ~5.6k ★) | Positioning / motivation | ✅ Decided 2026-06-11: proceed & differentiate (decision-first UX, settlement, house AI + trust UX, design — comparison in PROJECT.md). Whitespace claim amended. Clean-room discipline (TD-8) applies |
| LLM provider drift (AI SDK majors, MCP RC) | v1.1+ | AI isolated behind service layer + tool registry; never load-bearing (principle 5) |
| Scope creep during fan-out | v1.0 date | PD-12 boundary + §9 backlog is the pressure valve |
| User-data hygiene expectations (account deletion, audit-log retention) | Trust | Self-hosted = data stays home, but tooling is still owed: account deletion + per-user wipe in §9 (flagged as a pull-into-v1.0 candidate); audit-log retention documented |

## 9. Backlog (explicitly post-v1.3)

Percentage splits · multi-currency · guest (non-account) expense participants · receipt photos · trip export (PDF/.ics) · trip-from-prompt generation · @-mentions · trip-level scratchpad (the Yjs-per-surface candidate) · OIDC/SSO · 2FA · i18n (strings behind `t()` shim from M0) · public read-only trip share links · Postgres + migration utility · subpath serving · **account deletion & per-user data wipe (owner call: candidate to pull into v1.0)**.

## 10. Owner review checklist (the ⚑ items)

> **All items resolved 2026-06-11.** Remaining decisions ratified wholesale. **Build: UNDERWAY** (owner go signal 2026-06-11). Repo: [github.com/Aedrand/caravan](https://github.com/Aedrand/caravan), public, AGPL-3.0.

1. **Positioning vs TREK** — ✅ **RESOLVED (owner, 2026-06-11): proceed & differentiate** — group-decision-first, settlement-complete, design-led, house AI + AI-trust UX. Comparison table recorded in PROJECT.md.
2. **TD-1** — ✅ RESOLVED (owner, 2026-06-11): server-authoritative sync ACCEPTED.
3. **TD-7** — ✅ RESOLVED (owner, 2026-06-11): OAuth 2.1 ships **with** v1.3 alongside PATs (proposed staging overridden; former v1.4 folded into M9).
4. **TD-8** — ✅ RESOLVED (owner, 2026-06-11): AGPL-3.0 + DCO ACCEPTED.
5. **PD-2/PD-3** — ✅ RESOLVED (owner, 2026-06-11): positive-only votes, visible voters ACCEPTED.
6. **PD-12** — ✅ RESOLVED (owner, 2026-06-11): v1.0 ships without House AI (v1.1) ACCEPTED.
7. Name — ✅ RESOLVED (owner, 2026-06-11): **Caravan confirmed** (no longer a working title).
8. Process — ✅ RESOLVED (owner, 2026-06-11): GitHub, personal account; AGPL-3.0 LICENSE file; git init is the first M0 act.
