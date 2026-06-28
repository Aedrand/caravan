# Caravan — End-to-End Implementation Plan

Drafted 2026-06-10; **ratified by the owner 2026-06-11** (all decisions ACCEPTED — see `decisions.md`; TD-7 modified: OAuth 2.1 ships with v1.3). **Build status: M0 + M1 COMPLETE (M1 closed 2026-06-19)** — walking skeleton, full collaborative itinerary (create/edit/reorder), presence, attributed feed, and the two-browser gate all landed and CI-green. Contracts frozen. **Fan-out Tracks A/B/C integrated to `main` 2026-06-20** (`f114142`) — group decisions, expenses + settlement, and maps/places, built in parallel (worktree agents) and merged with one unified migration (0003); repo-wide green (190 tests) + in-browser verified. C.4 trip workspace MERGED to `main` 2026-06-23 (PR #1); its deferred map-follows-focused-day + click-to-focus follow-ups landed too. **Track D COMPLETE on `main` 2026-06-27** — ops & admin cluster (D.3 admin panel, D.4 Litestream, D.5 docs, D.6 release-please + security headers/rate-limiting) plus the email backbone (D.1 SMTP invite/membership email, D.2 daily digest); email verified E2E via a Mailpit catcher. **Track E COMPLETE on `main` 2026-06-28** (`7da7cdd`..`9176cc3`) — design polish E.2 (state primitives + expenses error state) / E.3 (responsive: drag-handle, settlement, poll rows) / E.4 (a11y: feed-drawer focus trap, split-tab ARIA, WCAG-AA contrast); visually verified. All via orchestrated multi-agent passes, direct-to-main, all gates green. **Trip Workspace v2 IN PROGRESS (owner-prioritized 2026-06-28; precedes M6) — see `design/trip-workspace-v2-brief.md` + `handoff.md` for live state.** V2.0–V2.3 SHIPPED & pushed to `main` 2026-06-28: V2.0 quick wins (`26103f5`: geocoding `lang=en`, date-first day labels, map day-layer toggle; Japan geocode confirmed done, 53/55 pinned); V2.1 design pass (`f41308c`: ratified left-index-rail workspace + progression-rail Plan View; spec `design/trip-workspace-v2-plan-and-shell-spec.md`); V2.2 data-model foundation (`db99c9e`: typed items + first-class `days` + idea lists + `estimatedCostMinor`; migration 0005; flight/lodging cols deferred to V2.4); V2.3 Plan View v2 (`e721ca8`: order-driven progression rail w/ numbered map pins, inline note/checklist rows, est-cost chips, drag-to-resequence, idea lists + typed-item form). Gates green throughout (259 unit, e2e 5/5). **NEXT = V2.4 bookings + day anchors.** M6 (v1.0 hardening & release) follows the v2 build (V2.4→V2.7). Companion reading order: `../PROJECT.md` → `decisions.md` → `handoff.md` → this file.

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

> **2026-06-28 — v1.0 scope extended (PD-13/14/15, TD-13).** The **Trip Workspace v2** build (`design/trip-workspace-v2-brief.md`) is the current priority and **precedes M6**; v1.0 ships with it. The upload subsystem (hero image / image-ideas / file attachments) and full UI localization remain out of v1.0.

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
     ├─ Track D: Self-host polish (ops/admin/docs ✅; email/digest ✅) [P]  │
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
| Notifications: invites / digest / push | PD-7 | D.1, D.2 ✅ (2026-06-27), M8 |
| Offline read + installable PWA | PD-6 | M8 |
| House AI (chat, NL edits, conflicts, budgets, per-trip toggle) | TD-6 | M7 |
| Personal AI (tools, permissions, audit, OAuth) | PD-11, TD-7 | M9 |
| AI surfaces independently optional (both/either/none) | TD-6, TD-7 | M7 (env key), M9 (`personal_ai_enabled` toggle) |
| One-command self-host, backups, admin | TD-3, TD-4 | 0.7–0.9, D.3–D.6 ✅ |
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

> ✅ **Done 2026-06-20** — integrated to `main`. Voting (visible voter avatars, ideas-by-votes), comments (on activities + polls), polls (create / multi-select / member-options, vote, manual close, poll→activity conversion), feed verbs. Optional scheduled poll auto-close + two-browser poll E2E deferred (lifecycle covered by unit tests).

| # | Task | Size |
|---|---|---|
| A.1 | Vote toggle: mutation + optimistic UI + voter avatars + ideas-sort-by-votes (PD-2) | M |
| A.2 | Polls: create (multi-select / member-options flags), vote, close (manual + scheduled via the 0.9 job registry), results live view (PD-3) | L |
| A.3 | Poll→activity conversion (winning option → ideas pool) | S |
| A.4 | Comments on activities + polls: flat stream, edit/delete rules (PD-4), feed integration | M |
| A.5 | Feed verbs + digest copy for all of the above; E2E: poll lifecycle in two browsers | S |

### Track B — Expenses `[P]` (≈ M3)

> ✅ **Done 2026-06-20** — integrated to `main`. Expense CRUD + equal/custom splits, first-class payments, the exhaustively-tested min-transaction settlement engine (integer cents, ghosts, largest-remainder rounding), and the money UI. Money reads via a dedicated endpoint outside the snapshot (TD-12). Optional two-browser money E2E deferred (settlement covered by unit tests).

| # | Task | Size |
|---|---|---|
| B.1 | Expense CRUD + splits (equal default / exact with sum validation), category set, optional day/activity link (PD-8) | L |
| B.2 | Payments (first-class, from→to) + edit/delete permission rules | S |
| B.3 | **Settlement engine**: net balances → greedy min-transaction list; largest-remainder rounding; exhaustive unit tests incl. ghosts (PD-8/9) | M |
| B.4 | Money UI: expense list/forms, settlement screen ("who pays whom"), per-person + per-category totals, trip budget overview | L |
| B.5 | Feed integration + E2E: log → split → settle in two browsers | S |

### Track C — Map & places `[P]` (≈ M4)

> 🟡 **C.1–C.3 + C.5 done 2026-06-20** — integrated to `main`. Geo proxy (`/api/geo/search|reverse`, Photon keyless default + key-optional providers, SQLite cache, rate limit), debounced place autocomplete in the activity form (freeform fallback), lazy MapLibre + OpenFreeMap map panel (clustered pins, pin↔card highlight, unplotted list), provider/tile config + attribution + `docs/maps-and-places.md`. **C.4 (split-view workspace + long-trip day navigation) is now with Claude Design** as the trip-page layout pass — it absorbed the broader workspace IA, since the fan-out added Polls/Expenses/Map panels that currently stack vertically. Brief: `docs/design/trip-page-layout-brief.md`.

> ✅ **C.4 MERGED to `main` 2026-06-23 (PR #1)** — built on branch `feat/trip-workspace-layout`; design deliverable vendored to `docs/design/reference/trip-page/`. e2e M1 gate (01–04) green per stage + an end-of-phase adversarial review (verdict: sound, no blockers): **(1)** workspace shell — left rail (Plan/Decide/Money/Group + ☀ warm↔dusk toggle) + one consolidated top bar (global header suppressed on the trip route) + collapsible ambient map split + bell-triggered feed drawer; **(2)** long-trip day nav — sticky day-jump rail + Today/Trip-start, collapsible days (today+ahead open by default), one-line compact empty days, Today badge; **(3)** ideas pool relocated itinerary→Decide (Plan keeps a pointer card); **(4)** feed drawer polish — bell unread badge, "caught up to here" divider, mark-all-read; **(5)** mobile — bottom-tab nav (Plan·Map·Decide·Money·Group, Map its own tab on mobile), thumb FAB, Plan split→single-column, full-screen feed; **+ cleanup** removing the now-dead non-embedded FeedPanel path. **Merged via PR #1 (`github.com/Aedrand/caravan/pull/1`).** The deferred follow-up below (map-follows-focused-day) is now the only remaining C.4 item.
>
> ⏳ **Deferred follow-up — map-follows-focused-day** (post-C.4 polish, not blocked): the itinerary already tracks a "focused day" but it only drives the day-rail highlight today. Wire it to the ambient map so scrolling/hovering a day frames *that day's* pins. Feasible now — keyless OpenFreeMap tiles + Photon geocoding are live, and the card↔pin highlight already works; this is additive polish. Sketch: lift `focusedIso` from `ItineraryBoard` up to `PlanView` (or a small shared context) and pass it to `MapPanel`, which fits/flies to the focused day's plotted activities.

| # | Task | Size |
|---|---|---|
| C.1 | Geo proxy: `/api/geo/search|reverse` — Photon default, Geoapify/LocationIQ via env, SQLite cache, per-deployment rate limit (TD-5) | M |
| C.2 | Place autocomplete in activity form (debounced ≥300 ms), freeform fallback, provenance fields | M |
| C.3 | Map pane: MapLibre + OpenFreeMap, pins + clustering, pin↔card bidirectional highlight/scroll, unplotted-activities affordance | L |
| C.4 | Split-view workspace layout: persistent map beside itinerary (desktop), toggle/bottom-sheet (mobile). **C.4 owns all map-pane layout**, consuming the shell slots E.1 defines; E.3 explicitly excludes the map pane. **Also owns long-trip itinerary navigation** (owner call 2026-06-19, folded in here): the 1.7 itinerary is a plain vertical day list — fine short-term, but a long trip (e.g. the 43-day Dolomites demo, mostly empty days) becomes an endless scroll. Design the fix *with* the map pane so the whole workspace is reshaped once: a sticky **DayTabs** day-jump rail (the component already exists in the design system) with the active day highlighted, **compact empty days** (thin one-line "+ Day N" rows, not full drop-boxes), and collapsible day sections / jump-to-today. | L |
| C.5 | Tile/geocoder provider config surface + attribution + docs (incl. PMTiles heavy mode page) | S |

### Track D — Self-host polish `[P]` (≈ M5)

> ✅ **Track D COMPLETE on `main` 2026-06-27.** Two orchestrated passes. **Ops & admin cluster (D.3–D.6):** admin panel (`/admin`: settings + overview + `VACUUM INTO` backup, `requireAdmin` guard), opt-in Litestream streaming backup (default path unchanged when unset; auto-restore on empty volume), full self-host docs (install/config/reverse-proxy/backups + CONTRIBUTING/DCO + demo seed), release-please + footer version + security-headers & rate-limiting middleware (foundation `258a3ca`, remediation `b0aea2f`). **Email backbone (D.1/D.2):** nodemailer + react-email service (graceful no-op when SMTP unset), invite + ownership-transfer emails, daily digest job + per-user opt-out (foundation `5b97804`, remediation `ef095a5`). All gates green at landing (typecheck server+web, biome, `pnpm -r build`, e2e M1 gate 5/5, 126/126 server unit) and the **email paths verified end-to-end with a Mailpit catcher** (invite send + both digests observed).

| # | Task | Size | Status |
|---|---|---|---|
| D.1 | SMTP email: nodemailer + react-email; invite + membership emails; graceful unconfigured path (PD-7) | M | ✅ Done 2026-06-27 (`5b97804`,`8279370`,`ef095a5`) — `services/email/` (nodemailer + react-email, no-op when SMTP unset, swallows transport errors), invite email (optional recipient on `invite.create` → `inviteLinks.email`; join link) + ownership-transfer email; SMTP config vars; email deps threaded via the mutation context; subjects CRLF-sanitized. Verified E2E (Mailpit) |
| D.2 | Daily digest: job via the 0.9 registry, per-trip batching, opt-out prefs | M | ✅ Done 2026-06-27 (`5b97804`,`f4a7b6f`,`ef095a5`) — `daily-digest` job (cron `DIGEST_CRON`, default 8am) batches last-24h feed events per trip → email to active members with `digestEnabled` (default on, bulk-fetched, skips self-only); `notification_prefs` table + `GET/PUT /api/me/notification-prefs` + `/settings` opt-out toggle. Verified E2E (Mailpit) |
| D.3 | Admin panel — scope: writable (registration toggle, instance name, **theme picker per TD-10**: presets + custom hues, light/dark), read-only (members/trips/disk usage), backup button (`VACUUM INTO` → snapshot download), admin-role route guard | M | ✅ Done 2026-06-27 (`42e68e4`) — `/admin` page + nav link (admins only); `GET/PUT /api/admin/settings` (instance name, registration toggle, theme preset = two-axis style×theme per TD-11), `GET /api/admin/overview` (users/trips/active-members/DB+WAL bytes), `GET /api/admin/backup` (`VACUUM INTO` → download), `requireAdmin()` route guard |
| D.4 | Litestream opt-in (entrypoint co-process), backup/restore + upgrade/rollback docs incl. when-to-enable guidance and S3/B2 cost note (TD-4) | S | ✅ Done 2026-06-27 (`cdd7897`) — `docker-entrypoint.sh` co-process (default path unchanged when `LITESTREAM_REPLICA_URL` unset; auto-restore on empty volume), `litestream.yml`, Dockerfile install (v0.5.12, multi-arch), compose note, `docs/self-hosting/backups.md` |
| D.5 | Docs: install guide (compose + `docker run`), Caddy/Traefik examples, config reference (generated from env module), CONTRIBUTING + DCO, demo seed script | M | ✅ Done 2026-06-27 (`ad58956`) — `README.md` quick-start, `docs/self-hosting/{install,configuration,reverse-proxy,backups}.md` (config reference generated from `config.ts`; Caddy/Traefik + WS), `CONTRIBUTING.md` + DCO (`.github/workflows/dco.yml`), demo seed (`apps/server/src/scripts/seed.ts`, `pnpm --filter @caravan/server seed`) |
| D.6 | release-please + version surfacing in UI footer; security headers, rate limiting middleware | S | ✅ Done 2026-06-27 (`8acc772`, `6355b5c`, `b0aea2f`) — release-please automation (`release-please-config.json` + `release-please.yml`; `release.yml` made a reusable `workflow_call`), app version in the web footer (non-trip layout), security-headers middleware (nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy, HSTS in prod), rate-limiting middleware (general `/api` 300/min + POST auth strict 20/min, IP-keyed with `TRUST_PROXY`-gated x-forwarded-for, periodic prune) |

### Track E — Design & polish `[P]` (continuous through fan-out)

> ✅ **E.2–E.4 shipped to `main` 2026-06-28** (foundation `7da7cdd` → surface passes → a11y remediation `9176cc3`) via an orchestrated pass (recon → foundation primitives → 3 parallel surface worktrees → review → remediation). Built shared `EmptyState`/`Skeleton`/`ErrorState` primitives; added states across every surface (notably the missing **expenses error/loading**); responsive fixes (drag handle 20→32px, `min-h-11` poll rows, settlement rows stack at 375px, dialog mobile); a11y (**feed-drawer focus trap+restore**, expense split-tab ARIA tablist, vote focus ring, feed `aria-live`/`aria-busy`, **contrast `--ink-soft` darkened to WCAG-AA 4.5:1** in both themes). All gates green + **visually verified** at 390px/desktop + focus-trap proven; adversarial review found no blockers.

| # | Task | Size |
|---|---|---|
| E.1 | Design language **as the default theme of the TD-10 token contract**: define the semantic token set (incl. status colors, radius) + the warm default expressed in it; `<BrandMark/>` indirection for identity marks; type scale, card system, motion guidelines — applied to shell + itinerary first. **Run alongside 1.7/1.8 so the itinerary is born compliant** | M | 🟡 Foundation landed 2026-06-19 (grounds in approved "D · The Blend" design): **two-axis token system per TD-11** (`data-style` poster+material × `data-theme` warm+dusk) in `apps/web/src/index.css`; self-hosted Bricolage/Albert via `@fontsource`; `BrandMark` + logo SVGs; `cv-control`/`cv-card` personality classes; Button/Card/auth-shell/header adopt them (placeholder emoji retired). Independent axis swap verified by screenshot. **Remaining:** `.dark` mode values per theme; category/stamp/avatar component tokens applied to itinerary surfaces as 1.7+ land; admin two-select picker is D.3 |
| E.2 | Empty/loading/error states for every feature surface (work with A–D as they land) | M | ✅ Done 2026-06-28 — shared `EmptyState`/`Skeleton`/`ErrorState` (`components/ui/`) adopted across dashboard/admin/settings/trip-route/itinerary/map/ideas/polls/members/feed/join; expenses gained loading+empty+**error** (was missing); map + place-autocomplete error affordances |
| E.3 | Responsive pass: in-trip mobile ergonomics (today view, thumb reach, bottom nav) | M | ✅ Done 2026-06-28 — drag handle 20→32px, poll rows `min-h-11`, expense settlement rows stack/no-clip @375px, dialog mobile padding+scroll; verified at 390px (Plan/Money/Decide) atop the C.4 mobile shell |
| E.4 | Accessibility: keyboard paths (incl. dnd), focus management, contrast audit | M | ✅ Done 2026-06-28 — feed-drawer focus trap+restore (verified) + `aria-modal`/`h2`; expense split-tab ARIA tablist (roving tabindex+arrows+`tabpanel`); vote focus ring; feed `aria-live`+`aria-relevant=additions`+`aria-busy`; **contrast `--ink-soft` → WCAG-AA 4.5:1** both themes. (dnd KeyboardSensor already wired) |

### Trip Workspace v2 `[S]` — CURRENT PRIORITY (precedes M6)

> Promoted 2026-06-28 from `design/trip-workspace-v2-brief.md` (owner: "anything we decided here has priority"). Ratified in PD-13/14/15 + TD-13. Evolves the planning surface into a continuous **trip-canvas**: typed items, first-class days, enter-once bookings that anchor each day, real auto-routing, Plan View v2, a synced-index workspace shell + overview, idea lists, and activity cost estimates. **Desktop-first; mobile UX is its own later design review.** Phases (brief §7), dependency-ordered:

| # | Phase | Notes |
|---|---|---|
| V2.0 ✅ | Quick wins (no deps) — **SHIPPED `26103f5`** | geocoding `lang=en` (TD-13) — **Japan geocode confirmed done** (53/55 pinned, Latin names; 2 unpinned = flights); date-first "Friday, May 1st" day labels; map day-layer toggle |
| V2.1 ✅ | Design pass — **SHIPPED `f41308c`** | ratified the workspace via rendered HTML mockups: **left index rail** (240px scrollspy TOC) · **two-line progression rail** · **hero-band overview** (trip identity + planned-vs-actual budget bar) · eager-mount/lazy-renderer. Final spec `design/trip-workspace-v2-plan-and-shell-spec.md`; build split — V2.3 builds the rail in today's tabbed shell, V2.7 wraps it in the left-rail shell |
| V2.2 ✅ | Data-model foundation — **SHIPPED `db99c9e`** | typed items (`type` discriminator activity\|note\|checklist\|flight\|lodging + checklist-items JSON + `estimatedCostMinor` + `listId`), first-class `days` table, `idea_lists`; mutations `checklist.toggle`/`day.upsert`/`ideaList.*`; days + idea lists in the snapshot; migration **0005** (additive, validated on the dev DB). **Flight/lodging columns deferred to V2.4** (enum value + create-guard only). 249 unit + e2e 5/5 green |
| V2.3 ✅ | Plan View v2 build — **SHIPPED `e721ca8`** | order-driven **progression rail**: two-line rows, numbered square stamps (hollow when unplotted) synced to **numbered map pins**, inline note/checklist rows (toggles), est-cost chips, inline-editable day subtitle, "N stops · ~$est" summary, drag-to-resequence; idea lists + freeform note/checklist idea types on Decide; typed-item form dialog. Built in today's tabbed shell (foundation + 3-surface-agent pass). **Deferred:** travel-time labels + 🏨 home-base anchors (V2.4), route-mode toggle (V2.5), category-tint pins + drag-between-lists (polish). 259 unit, e2e 5/5 green |
| V2.4 | Bookings + day anchors — **NEXT** | wall-clock flight/lodging entry → derived bookend check-in/out entries + per-day home-base anchors (PD-14); lands the flight/lodging columns deferred from V2.2 |
| V2.5 | Routing | proxy + multi-modal engine, route lines, travel-times, modes (TD-13) — consumes V2.4 anchors as day endpoints |
| V2.6 | Money | convert-estimate→split-expense + planned-vs-actual budget (D7); surface "needs attention" in the overview |
| V2.7 | Workspace shell | continuous scroll + synced index wrapping it all (D9); Plan View v2 becomes a section within it |
| — | Deferred | upload subsystem (D6) → hero image / image-ideas / file attachments; mobile design review |

Then v1.0 hardening (M6) runs over the v2-inclusive app.

### M6 — v1.0 hardening & release `[S]`

Integration QA across tracks · **full design sweep** (the stage-2 visual pass: consistency audit across every surface, layout/positioning/density refinements, E.3/E.4 finishing — E.1 established the language, this conforms the whole app to it) · full E2E suite green · perf budget (snapshot < 100 ms at 500-activity trip; bundle audit) · security pass (invite token entropy, session fixation, rate limits, headers) · load sanity (10 concurrent editors) · README screenshots + demo instance · tag v1.0.0 → GHCR → awesome-selfhosted submission.

> ⚑ **Re-enable release automation here.** `release-please` was deferred during Track D (it failed on every push pre-v1.0 on 2026-06-27 — the repo setting blocked Actions from opening its PR) and is now **manual-only** (`.github/workflows/release-please.yml`, `on: workflow_dispatch`; config files kept). To cut v1.0: (1) restore its `push: { branches: [main] }` trigger; (2) enable repo Settings → Actions → "Allow GitHub Actions to create and approve pull requests" (`gh api -X PUT repos/Aedrand/caravan/actions/permissions/workflow -F can_approve_pull_request_reviews=true`); (3) bump `.github/.release-please-manifest.json` off the `0.0.0` sentinel to the intended version. The full checklist also lives in the workflow header.

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
| **A direct FOSS competitor exists** (fact-check refuted the "open niche" finding: a self-hostable group planner with real-time co-editing, polls, and expense splits is already out there) | Positioning / motivation | ✅ Decided 2026-06-11: proceed & differentiate (decision-first UX, settlement, house AI + trust UX, design — comparison in PROJECT.md). Whitespace claim amended. Clean-room discipline (TD-8) applies |
| LLM provider drift (AI SDK majors, MCP RC) | v1.1+ | AI isolated behind service layer + tool registry; never load-bearing (principle 5) |
| Scope creep during fan-out | v1.0 date | PD-12 boundary + §9 backlog is the pressure valve |
| User-data hygiene expectations (account deletion, audit-log retention) | Trust | Self-hosted = data stays home, but tooling is still owed: account deletion + per-user wipe in §9 (flagged as a pull-into-v1.0 candidate); audit-log retention documented |

## 9. Backlog (explicitly post-v1.3)

Percentage splits · multi-currency · guest (non-account) expense participants · receipt photos · trip export (PDF/.ics) · trip-from-prompt generation · @-mentions · trip-level scratchpad (the Yjs-per-surface candidate) · OIDC/SSO · 2FA · i18n (strings behind `t()` shim from M0) · public read-only trip share links · Postgres + migration utility · subpath serving · **account deletion & per-user data wipe (owner call: candidate to pull into v1.0)**.

## 10. Owner review checklist (the ⚑ items)

> **All items resolved 2026-06-11.** Remaining decisions ratified wholesale. **Build: UNDERWAY** (owner go signal 2026-06-11). Repo: [github.com/Aedrand/caravan](https://github.com/Aedrand/caravan), public, AGPL-3.0.

1. **Competitive positioning** — ✅ **RESOLVED (owner, 2026-06-11): proceed & differentiate** — group-decision-first, settlement-complete, design-led, house AI + AI-trust UX. Comparison recorded in PROJECT.md.
2. **TD-1** — ✅ RESOLVED (owner, 2026-06-11): server-authoritative sync ACCEPTED.
3. **TD-7** — ✅ RESOLVED (owner, 2026-06-11): OAuth 2.1 ships **with** v1.3 alongside PATs (proposed staging overridden; former v1.4 folded into M9).
4. **TD-8** — ✅ RESOLVED (owner, 2026-06-11): AGPL-3.0 + DCO ACCEPTED.
5. **PD-2/PD-3** — ✅ RESOLVED (owner, 2026-06-11): positive-only votes, visible voters ACCEPTED.
6. **PD-12** — ✅ RESOLVED (owner, 2026-06-11): v1.0 ships without House AI (v1.1) ACCEPTED.
7. Name — ✅ RESOLVED (owner, 2026-06-11): **Caravan confirmed** (no longer a working title).
8. Process — ✅ RESOLVED (owner, 2026-06-11): GitHub, personal account; AGPL-3.0 LICENSE file; git init is the first M0 act.
