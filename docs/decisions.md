# Decision Log

Running log of product and technical decisions for Caravan. Each entry is dated and carries a status:

- **PROPOSED** — drafted for review, not yet ratified by the project owner
- **ACCEPTED** — ratified; build against it
- **SUPERSEDED** — replaced by a later entry (link forward)

Drafted autonomously 2026-06-10 while the owner was away; **ratified by the owner 2026-06-11** — TREK positioning, TD-1, TD-7†, TD-8, PD-2/3/12 walked through individually, the remainder ratified wholesale (†TD-7 accepted *with modification*: OAuth 2.1 ships in v1.3, not v1.4). Each entry notes which open question from `../PROJECT.md` it resolves; technical decisions (TD-*) are grounded in the research under `research/raw/`. New decisions append below with fresh dates; changes to accepted entries use SUPERSEDED links.

---

## Product decisions

### PD-1: Itinerary data structure — structured records, not freeform text

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Resolves PROJECT.md open question: *itinerary data structure*

**Decision:** Activities are typed, structured records (title, date, time, location, category, notes) — not collaborative freeform text blocks. Days are *derived* from activity dates plus the trip's date range; there is no Day entity. Undated activities live in an "Ideas" pool per trip.

**Why:** Nearly every differentiating feature depends on structure: map plotting needs coordinates, conflict detection needs times, votes/comments need entities to attach to, expenses link to activities, and the AI tool surface ("add an activity", "move dinner to 8pm") needs typed operations. Freeform text makes all of those hard and only improves prose-editing, which is not the core job. Freeform expression still has homes: the per-activity `notes` field, comments, and (later, v1.x) an optional trip-level scratchpad page.

**Alternatives:** Freeform blocks (rejected: kills map/AI/expense linkage); hybrid block-document with embedded activity cards (rejected for v1: large editor complexity for marginal gain — revisit if users demand richer day notes).

**Consequences:** Real-time collaboration operates on records and fields, not text ranges — which dramatically widens the viable sync-engine options (see TD-1). Per-field merge semantics are acceptable; character-level merge is unnecessary.

---

### PD-2: Activity lifecycle and voting mechanics

**Status:** ✅ ACCEPTED (owner, 2026-06-11; proposed 2026-06-10) · Resolves: *vote/poll mechanics*

**Decision:**
- An activity is either in the **Ideas pool** (undated) or **on the itinerary** (dated). Promoting an idea = giving it a date. Demoting = removing the date. No separate "candidate vs. locked" state machine in v1.
- Voting is a single positive **vote toggle** (a "👍 I'm in") per member per activity, available on both ideas and scheduled activities. No downvotes — objections go in comments, where they carry reasons. This keeps voting positive-sum among friends.
- **Voters are visible** (avatars, not just counts). In a group of 6 friends, *who* is excited is the signal; anonymous tallies are for strangers.
- Sort the Ideas pool by votes by default.

**Alternatives:** Up/down voting (rejected: drive-by negativity without rationale; friends don't need it); anonymous counts (rejected: hides the actual signal); approval states with explicit locking (rejected for v1: ceremony that group chats don't have — the group treats "it has a date" as decided).

**Consequences:** Vote model is a trivial (activity, member) toggle — cheap to sync, cheap to display. "Sort ideas by enthusiasm" becomes the de facto decision mechanism, matching how friend groups actually decide.

---

### PD-3: Polls

**Status:** ✅ ACCEPTED (owner, 2026-06-11; proposed 2026-06-10) · Resolves: *vote/poll mechanics (poll half)*

**Decision:** Polls are for open questions that aren't activity-shaped ("Which week works?", "Airbnb or hotel?"). v1 mechanics:
- Creator writes a question + freeform options; any member can vote.
- **Single-choice by default, multi-select as a creation-time toggle.**
- **Members may add options** (creation-time toggle, default ON — mirrors how group chats actually work).
- Voters visible, results live, optional closing date; creator or trip owner can close early. Closed polls stay visible with results.
- A poll can optionally be **converted**: winning option → new activity in the Ideas pool (one-tap follow-through).

**Alternatives:** Ranked choice / scheduling matrices (rejected for v1: Doodle-grade complexity; multi-select covers 90%); anonymous voting (rejected: same rationale as PD-2).

**Consequences:** Poll → activity conversion closes the loop between deciding and planning, which is exactly the gap the polling-app competitors leave open.

---

### PD-4: Comments

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10)

**Decision:** Flat (non-threaded) comment streams on **activities** and **polls**. Plain text with linkification in v1. Editable/deletable by author; deletable by trip owner. No reactions, no threading, no @-mentions in v1 (mentions are the first v1.x addition, feeding notifications).

**Why:** Comments exist to carry *reasons* ("that museum is closed Mondays") asynchronously. Threading fragments small-group conversation; the group chat already handles real-time banter.

---

### PD-5: Concurrent-edit UX — merge silently, surface attribution ambiently

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Resolves: *concurrent-edit UX*

**Decision:** No blocking conflict dialogs, no merge-review surface in v1. Concurrent edits resolve deterministically (per-field last-write-wins; ordering via the sync layer's list semantics — see TD-1). The system communicates what happened through three ambient surfaces instead:
1. **Live presence** — you see who's in the trip and (where cheap) what they're touching, so true simultaneous edits are rare and socially visible.
2. **Recently-edited hint** — a card briefly shows "edited just now · Sam" after a remote change.
3. **The activity feed** — every change is attributed there permanently; "two people moved the same thing" reads as two feed entries.

The canonical conflict (two members move the same activity to different days simultaneously): last write wins, both see the final state live, both moves appear in the feed. Among 2–10 friends this is a shrug, not a data-loss incident.

**Alternatives:** Conflict prompts (rejected: worse than the disease at this scale); operational locks ("Sam is editing this card") (rejected for v1: adds failure modes; presence hints give 80% of the value).

**Consequences:** The activity feed is **load-bearing** for trust in collaboration — it ships in v1, not as polish (see plan). Revisit only if real usage shows surprise-overwrites that the feed doesn't defuse.

---

### PD-6: Offline depth — offline read in v1.x, offline editing explicitly out

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Resolves: *offline depth* · Technical confirmation in TD-1

**Decision:** The product commitment is **offline read**: a member who opened a trip while online can view the full itinerary (and expense summary) on a plane or subway, via PWA caching. Offline *editing* with sync-on-reconnect is **out of scope for v1** and not promised for v2; the sync architecture must merely not foreclose it (TD-1 evaluates which engines leave that door open cheaply).

**Why:** The real mid-trip need is *referencing* the plan without connectivity. Offline editing multiplies scope across every feature (queued mutations, conflict windows measured in hours, stale-permission edge cases) for a group that is, by definition, together on the trip — they can tell each other things. If the chosen sync engine happens to give short-window offline mutation queuing nearly free, we take it as a bonus, not a commitment.

**Consequences:** PWA + cache strategy lands in the polish phase (v1.x); data layer designed so trip state is snapshot-serializable for the cache.

---

### PD-7: Notification strategy — feed-first, email digest, push later

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Resolves: *notification surface*

**Decision:** Three tiers, shipped in this order:
1. **In-app (v1.0):** the per-trip activity feed plus an unread/catch-up marker ("14 changes since you last looked") and per-trip badge. This is the async-coordination core and requires no external infrastructure.
2. **Email via host-configured SMTP (v1.0, degrades gracefully if unconfigured):** *immediate* email only for membership-grade events — trip invites and "you were added/removed". A **per-trip daily digest** (opt-out) summarizes everything else: activities added, polls opened/closing, expenses logged. No SMTP configured → app fully functional, invites become copy-the-link only.
3. **Web push (v1.2, with the PWA):** opt-in, per-trip, for time-sensitive events only (poll closing today, trip starting tomorrow, payment recorded to you). VAPID/web-push; iOS PWA push viability confirmed in research (R5).

Per-user, per-trip preference: digest on/off, push on/off. **No notification ever fires for routine edits** — that's the feed's job. The bar: Caravan must never feel like a second group chat spamming the first.

**Alternatives:** Immediate email per event (rejected: spam → unsubscribes → async gap returns); in-app-only (rejected: invites need to reach people who haven't installed anything); SMS (rejected permanently: cost + carrier mess on the host).

---

### PD-8: Expense rules

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Largely settled by the product brief; mechanics pinned here

**Decision:**
- Amounts stored as **integer minor units** (cents); never floats. **Single currency per trip**, chosen at trip creation (ISO 4217 list, sensible default), displayed via `Intl.NumberFormat`.
- Splits: **equal among selected members** (default: all trip members) or **exact custom amounts** that must sum to the total. Percentage/share-based splits deferred to v1.x.
- **Payments are first-class** ("Alice paid Bob $50"), distinct from expenses; partial settlement works from day one.
- **Settlement view** computes net balances and reduces them to a minimum-transaction list via greedy max-creditor/max-debtor matching (≤ n−1 transfers). Deterministic algorithm, unit-tested to the cent — this is the highest-trust screen in the app.
- Rounding: split remainders distributed deterministically (largest-remainder method, stable order) so totals always reconcile exactly.
- Permissions: expense creator can edit/delete own entries; trip owner can delete any. Edits to settled-against expenses are allowed (balances simply recompute) — no locking ceremony in v1.
- **Departed members persist in expense history** as inactive participants ("ghosts") so balances never silently shift (see PD-9).
- Explicit non-goals for v1: multi-currency, receipt-photo attachments, non-member guest participants, Splitwise import. All noted for the backlog; the schema keeps `currency` per-trip so multi-currency is an additive change later.

---

### PD-9: Trip lifecycle edges

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Resolves: *trip lifecycle edges*

**Decision:**
- **Roles:** single **owner** + editors + viewers (PD-10). Owner can transfer ownership to another member. No multi-owner in v1.
- **Archive:** owner can archive (whole trip becomes read-only; reversible). The UI nudges archiving after the end date. Archived trips stay browsable forever — they're the group's memory.
- **Duplicate as template:** copies structure (activities → Ideas pool, undated; polls/comments/expenses/votes NOT copied) into a new trip. Cheap to build, big quality-of-life for annual trips.
- **Leave trip:** any non-owner may leave. Their authored content and expense participation remain, attributed to a now-inactive "ghost" membership; settlement math is unaffected. A member with a nonzero balance gets a warning, not a block.
- **Remove member:** owner only; same ghost semantics. Rejoining via invite link reactivates the same membership (history reattaches).
- **Delete trip:** owner only, type-the-name confirmation, irreversible in v1 (no soft-delete grace; archive *is* the safe option).

---

### PD-10: Membership, roles, and invites

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10)

**Decision:**
- Roles: **owner** (manage trip, members, dangerous actions) / **editor** (everything else: itinerary, votes, polls, comments, expenses) / **viewer** (read + vote in polls — grandma can pick the restaurant without fear of dragging an activity).
- **Invite links** are per-trip, role-carrying (default: editor), multi-use, revocable, with optional expiry. The flow is "paste one link in the group chat." Following a link → account signup (or login) → instant membership. No per-email invitations in v1 (the link does that job); no approval queue among friends.
- Deployment-level: **first registered user becomes the instance admin**; admin can disable open registration (default: invite-only — registration only via trip invite links) so a public-internet deployment doesn't accrete strangers.

---

### PD-11: Personal AI (BYO assistant) — permission and visibility defaults

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Resolves: *personal-AI defaults & write scope* · Mechanics in TD-7

**Decision:**
- Connecting an assistant grants **read-only** access to trips the user selects, never all trips by default.
- **Write access is opt-in per trip by that member**, and capped at the member's own role (a viewer's AI can never write). The member list shows a visible badge when a member has an AI connected with write access — the group always knows.
- Personal-AI writes affect shared data (that's the point) but are **always attributed as "〔member〕's assistant"** — a distinct actor identity in the feed and audit log, never disguised as the human.
- Trip owner holds a kill switch: disable all personal-AI writes for the trip.
- Every personal-AI action is **rate-limited and audit-logged** (actor, tool, arguments, timestamp, result).
- The "propose-only" mode (AI suggests, human approves) is deliberately deferred — v1 ships read + full member-scoped writes behind the opt-in, because propose-queues add UI surface we can't afford yet.

---

### PD-12: v1.0 scope boundary

**Status:** ✅ ACCEPTED (owner, 2026-06-11; proposed 2026-06-10) · Resolves PROJECT.md next step: *brainstorm/refine scope for v1* · Full sequencing in `plan.md`

**Decision:** **v1.0 = feature areas 1–4 + the self-host story**: collaborative real-time itinerary with presence, ideas pool + voting + polls + comments + activity feed, expenses with settlement, map-forward consumer-grade UI, invite links, email invites/digest (SMTP-optional), single-container deployment. **v1.1 = House AI. v1.2 = PWA/offline-read + web push. v1.3 = Personal AI (MCP).** Export, trip-from-prompt generation, and i18n trail behind those.

**Why this cut:** v1.0 is the smallest release a friend group can run a real trip on end-to-end — and it's already differentiated (nothing self-hostable does collaborative itineraries + decisions + expenses). AI is the flagship *differentiator* but not the *foundation*; per product principle 5 it layers on cleanly, and shipping it as v1.1 keeps the v1.0 review surface tractable. The personal-AI tool surface comes last because it wraps APIs that must exist and stabilize first — but TD-7 reserves its architectural seat (auditable service layer, actor model) from day one.

---

## Technical decisions

> Research agents are in flight (see `research/raw/`). Entries below will be filled in from their findings; placeholders mark the decision surface so reviewers can see the full shape of what's being decided.

### TD-1: Sync & collaboration — server-authoritative mutation log, not a CRDT engine

**Status:** ✅ ACCEPTED (owner, 2026-06-11; proposed 2026-06-10) · Research: `research/raw/sync-engines.md` (R1, 33 sources)

**Decision:** Real-time collaboration via a **server-authoritative mutation log**: every change is an explicit, named mutation (`activity.move`, `expense.create`, `vote.toggle`…) sent over HTTP, validated and permission-checked, applied to relational SQLite in a transaction **together with an attributed feed event**, then broadcast to the trip's WebSocket room. Clients apply changes optimistically and reconcile against the broadcast. Concretely:

- **Conflict semantics:** per-field last-write-wins for record edits; **fractional indexing** (`position` key) for drag-to-reorder, so concurrent reorders merge and concurrent moves of the *same* item resolve to a single deterministic winner (the Figma pattern). Votes/comments are append-only or per-member toggles — conflict-free by construction.
- **Transport split:** mutations go over plain HTTP (standard auth middleware, zod validation, idempotency keys, easy rate limiting); the **WebSocket is server→client only** for broadcasts + a thin presence channel (who's here, what they're viewing/editing, ~100 LOC). Each trip is a room.
- **Catch-up:** each trip has a monotonic version; clients reconnect with their last-seen version and receive the missed events (or a fresh snapshot if too stale). The same event stream *is* the activity feed — PD-5's load-bearing surface costs nothing extra.
- **Offline door (PD-6):** v1 ships offline *read* from cached snapshots. If offline *editing* is ever wanted, the mutation envelope is already the right unit for a client-side queue + replay; and if real CRDT merging is ever needed, it gets added **per-surface** (e.g., a Yjs doc for a future rich-text scratchpad) — the Linear pattern — never as a rewrite.

**Why not Yjs (the research's nominal primary)?** The research scored Yjs+Hocuspocus as the most mature off-the-shelf option (MIT, single process, SQLite extension, presence built-in), and it is the right answer *for collaborative text*. But every Caravan-specific requirement cuts the other way, per the research's own findings:
1. **Permissions are per-author, not per-document.** Votes belong to members, expenses are creator-editable (PD-8), comments author-editable (PD-4). Inside a shared Y.Doc *any* editor's client can mutate *anyone's* data — the server can't reject sub-document writes; Yjs's own docs say to split docs per permission boundary, which for our rules means doc-per-member-per-concern. Server-authoritative makes every rule one `if` statement.
2. **The attributed feed is trust-critical** (PD-5). On Yjs it requires decoding binary CRDT updates into semantic events — flagged in the research as "technically possible but not validated by a working example." On a mutation log it's a transaction-mate insert.
3. **AI is a first-class writer** (TD-6/TD-7). House-AI tools and MCP clients write through a service layer regardless — Yjs would mean *two* write paths (CRDT deltas from browsers + service mutations from AI) with split attribution. The mutation log gives exactly one audited path for humans, house AI, and personal AI.
4. **SQL queryability.** Yjs persists docs as binary blobs — "all activities on day 3" requires deserializing a doc. Relational rows keep AI context-building, conflict detection, settlement math, exports, and admin tooling in plain SQL.
5. **Offline editing — Yjs's headline advantage — is a declared non-goal** (PD-6).
The pattern is proven at far larger scale than ours (Linear: LWW for all structured data, CRDT only for rich text; Figma: property-LWW + fractional indexing), and ~1–2k LOC of boring, contributor-readable sync glue beats an opaque dependency that fights our permission model. **Disqualified outright by the one-container/SQLite constraint:** Zero and Electric (require Postgres + extra service), PowerSync (FSL + server DB), Replicache (maintenance mode), InstantDB (not self-hostable). Automerge (alpha) and Loro (no server/presence ecosystem) are immature for v1.

**Consequences:** We own the sync glue (optimistic apply/rollback, catch-up, presence) — it must be built carefully in M1 and covered by a two-browser Playwright test as the acceptance bar. In exchange: permissions, attribution, audit, AI integration, and exports all become trivial. This decision pairs with PD-1 (structured records) and is the foundation the parallel work tracks build on.

### TD-2: Application stack — TypeScript end-to-end, Hono + React SPA

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Research: `research/raw/app-stack.md` (R5, 63 sources)

**Decision (the full bill of materials):**

| Slot | Pick | Runner-up | Note |
|---|---|---|---|
| Runtime | **Node.js 24 LTS** | Bun 1.2 | Contributor familiarity + native-module compat; Bun fine for local dev |
| Server | **Hono** (`@hono/node-server` v2) | Fastify v5 | One process serves REST + WebSocket (`upgradeWebSocket` native) + static SPA + MCP |
| API typing | **Hono `hc` RPC client** | oRPC | End-to-end types with zero codegen and zero extra deps; oRPC if OpenAPI ever needed |
| DB driver | **better-sqlite3** | libsql | Fastest, synchronous, stable; `node:sqlite` still RC — revisit at Node 26 LTS |
| ORM | **Drizzle + drizzle-kit** | Prisma | Programmatic `migrate()` at boot = the self-host upgrade story (TD-4) |
| Build | **Vite 8** | — | Rolldown-fast; one toolchain with Vitest |
| UI | **React 19.x SPA — no SSR** | — | Behind-auth app; SEO irrelevant; massively simpler serving/deploy |
| Router | **TanStack Router** | React Router v7 SPA-mode | Full type safety in SPA mode |
| Server state | **TanStack Query v5** | — | WS broadcasts land via `setQueryData`/targeted invalidation (TD-1 reconcile point) |
| Client state | **Zustand** | Jotai | Map viewport, panels, drag state — simple mental model for contributors |
| Styling | **Tailwind v4 + shadcn/ui** | — | Copy-in components = full control for the warm travel aesthetic (not default-looking) |
| Drag & drop | **dnd-kit** | pragmatic-drag-and-drop | List + cross-day moves + touch + keyboard a11y |
| Auth | **Better Auth** (email/password + invite-link sessions) | hand-rolled Lucia-style | The 2026 consensus (Auth.js itself points new projects at it); Drizzle/SQLite adapter; magic-link & OIDC plugins later. **Trip membership/invites stay our own domain tables** — Better Auth handles identity/sessions only |
| Validation | **Zod v4** in `packages/shared` | — | One schema → API validation + client types + AI/MCP tool schemas |
| Email | **nodemailer + react-email** | — | SMTP env-configured; unconfigured → log to stdout + UI notice (PD-7) |
| Push | **web-push (VAPID)** | — | v1.2; iOS requires home-screen install — documented caveat |
| PWA | **vite-plugin-pwa** (Workbox) | — | Precached shell + NetworkFirst data = offline read (PD-6) |
| Jobs | **Croner** (in-process) | node-cron | Digests/cleanup; **no queue/Redis at this scale** |
| Logging | **pino** | — | JSON to stdout; operators pipe wherever |
| Lint/format | **Biome v2** | ESLint v9 + Prettier | One fast binary; contributor-friendly |
| Tests | **Vitest + Playwright + RTL** | — | See TD-9 |
| Repo | **pnpm workspace**: `apps/server`, `apps/web`, `packages/shared` | single package | `pnpm deploy` prunes for the Docker image |

**Why this shape:** every choice optimizes for (a) the one-container deploy, (b) contributor approachability (popular, boring, well-documented picks over exotic ones), and (c) full visual control for a consumer-grade UI. The only place we take on custom engineering is the sync glue (TD-1), which is the product's actual differentiator.

### TD-3: Database & persistence — SQLite-only for v1, relational all the way down

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Research: R1 + R5 + R2 converge

**Decision:**
- **SQLite is the only supported database for v1** — no Postgres code path. Rationale: a deployment serves one friend group; WAL-mode SQLite handles orders of magnitude more than that; a second container/service would violate the ops floor for zero benefit. (Mealie's guidance: SQLite to ~20 users; we're 2–10.)
- Boot pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout`. Single DB file at `/app/data/caravan.db` (named volume). Never on NFS/SMB (documented).
- **All domain data is relational rows** (consequence of TD-1) — activities, expenses, votes, feed events are queryable columns, not blobs. Timestamps as integer epoch ms; money as integer minor units (PD-8); IDs as random 128-bit strings (no PII leakage via sequence).
- **Migrations:** Drizzle `migrate()` runs at boot, fail-fast (TD-4). Migration files are committed artifacts; CI runs them against a fixture DB.
- **Backups:** `VACUUM INTO`-based snapshot (admin endpoint + documented CLI) as the simple path; **Litestream** streaming replication opt-in via `LITESTREAM_REPLICA_URL` (TD-4).
- **Postgres escape hatch:** deliberately *not* built, but not foreclosed — Drizzle's dialect swap keeps business logic portable, and the research warns (via Vikunja's experience) that if Postgres support ever lands it must ship with a SQLite→Postgres migration utility, not just a config option.

### TD-4: Packaging & distribution — one container, one volume, boring on purpose

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Research: `research/raw/self-host-prior-art.md` (R2)

**Decision:**
- **One Docker container** serving everything (SPA + API + WebSockets + MCP endpoint), **one named volume** (`/app/data`) holding SQLite DB + uploads. This is the pattern the community rewards (Mealie, Vikunja, Grist, Actual Budget all prove it); every extra service is a support burden. Ship a reference `docker-compose.yml` (1 service, 1 volume) *and* document the equivalent single `docker run`.
- **Config entirely via env vars with aggressive defaults.** The only semi-required var is `SECRET_KEY` — and even that is auto-generated and persisted to the data volume on first boot (with a log notice) so the true minimum config is *zero*. `BASE_URL` defaults to localhost and is needed only for correct links in emails/invites.
- **Migrations run automatically on boot**, fail-fast (non-zero exit on migration failure — never run on a broken schema). Upgrade = pull new image + restart; rollback = previous tag + restore volume snapshot. Documented as a 3-command flow. Publish `latest` plus semver tags (`v1.2.3`, `v1.2`, `v1`) so Watchtower users and pinners both work.
- **First-run:** if the DB has no users — `ADMIN_EMAIL`/`ADMIN_PASSWORD` env pre-seed if set, else first registrant becomes instance admin; open registration defaults OFF after that (PD-10: invite links are how friends get in).
- **Backups:** `sqlite3 .backup`-based snapshot endpoint/CLI + documented volume snapshot as the manual path; **optional Litestream streaming replication** activated by `LITESTREAM_REPLICA_URL` (runs as a co-process via entrypoint). Document "never put the SQLite file on NFS/SMB".
- **Publishing:** GHCR primary (Docker Hub mirror for discoverability), **multi-arch amd64+arm64** (home servers and Pis are the audience), Node-on-Alpine multi-stage build, target image ≤ 300 MB. `HEALTHCHECK` against `/health`. Structured JSON logs (pretty-printed in dev).
- **Reverse proxy:** subdomain-first guidance with copy-paste Caddy (2-liner) and Traefik examples in docs; `BASE_URL` honored. Subpath serving is a documented non-goal for v1.
- **Releases:** semver + conventional commits + release-please (automated changelog/GitHub Releases). A public demo instance with sample trips is the #1 adoption driver on awesome-selfhosted — planned as a post-v1.0 task.

**Alternatives:** compose with separate Postgres (rejected for v1 — see TD-3); Kubernetes/Helm charts (deferred — `docker run` audience first).

### TD-5: Maps, geocoding & places — MapLibre + OpenFreeMap + Photon, key-optional upgrades

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Research: `research/raw/maps-places.md` (R3, 30 sources)

**Decision:**
- **Renderer:** MapLibre GL JS (pin the v5 line; v6 is in pre-release — migrate deliberately later). React binding: **`@vis.gl/react-maplibre`** (the vis.gl package purpose-built for MapLibre). Clustering via MapLibre's native GeoJSON clustering — no extra library.
- **Tiles (zero-config default):** **OpenFreeMap** vector tiles — no key, no registration, no hard limits, CDN-served; attribution auto-applied via MapLibre. Tiles load **directly from the browser** (never proxied through our server — that would defeat CDN caching).
- **Geocoding/autocomplete (zero-config default):** **Photon (komoot public instance)** — the only viable $0 keyless autocomplete; debounced ≥300 ms client-side, ≤1 req/s. **Nominatim public is autocomplete-forbidden by policy** and is used only for occasional reverse geocoding (map click → address), cached, with proper attribution.
- **All geocoding flows through a thin server-side proxy endpoint** (`/api/geo/*`), always — even keyless Photon. Reasons: API keys never reach the browser, responses are cached in SQLite/LRU (Nominatim *requires* caching; it also cuts load on Photon's public instance), providers are swappable server-side, and per-deployment rate limiting is enforceable in one place.
- **Key-based upgrades via env vars:** `GEOAPIFY_KEY` (3k req/day free — preferred upgrade), `LOCATIONIQ_KEY` (5k/day, attribution link required), `MAPTILER_KEY` / `STADIA_KEY` for nicer tile styles (both non-commercial-restricted free tiers — docs must tell hosts to read the terms). Provider selection: `TILE_PROVIDER`, `GEOCODING_PROVIDER`, with `PHOTON_URL` override for self-hosted Photon.
- **Heavy self-host mode (documented, not default):** self-hosted PMTiles basemap (~120 GB planet, regional extracts smaller; served as one static file via HTTP range requests) + self-hosted Photon regional index. This is also the *only* policy-clean path to offline map tiles for the PWA later — public tile sources prohibit or don't support bulk caching.
- **POI discovery:** no bundled places database. Overture/FSQ OS Places are bulk columnar datasets, not realtime search APIs — wrong weight class for this app. Photon covers POI + address search; richer discovery is the AI layer's job plus link-outs.
- Activities store: `place_name`, `address`, `lat`, `lng`, plus `place_provider` + `place_ref` for provenance. Freeform location (no coordinates) remains fully supported — unplotted activities are normal, not errors.

**Risks accepted:** OpenFreeMap is donation-funded with no SLA (mitigation: provider-swap is one env var; PMTiles is the exit hatch). Photon public can throttle without notice (mitigation: server-side cache + `GEOAPIFY_KEY` upgrade path + self-host option).

**Alternatives:** Google Maps/Mapbox as defaults (rejected: key-required, vendor lock-in, Mapbox GL JS v2+ is proprietary; may be added later as optional named providers); bundling Overture/FSQ POI data (rejected: requires columnar query infrastructure).

### TD-6: House AI provider layer — Vercel AI SDK, server-side tool loop, budget-capped

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Research: `research/raw/ai-mcp.md` (R4, Part A)

**Decision:**
- **Abstraction: Vercel AI SDK (v6 line, Apache-2.0).** The de facto provider-agnostic TS layer in 2026 (24+ official / 30+ community providers, unified streaming + tool-calling + Zod structured output). Provider swap is config, not code. Covers Anthropic, OpenAI, Google, Mistral, Groq natively; **Ollama** via community provider (`ai-sdk-ollama`, which hardens local-model tool calling); OpenRouter/vLLM/LM Studio via the OpenAI-compat provider with custom `baseURL`.
- **Explicitly rejected as the abstraction:** provider OpenAI-compat shims (Anthropic documents theirs as non-production: tool-schema strictness silently dropped), LiteLLM proxy (a second service + a 2026 supply-chain incident on record), LangChain.js (weight without benefit).
- **Host config surface (env):** `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, plus limits: `AI_MAX_TOKENS_PER_REQUEST`, `AI_RATE_LIMIT_RPM_PER_USER`, `AI_RATE_LIMIT_TOKENS_PER_USER_PER_DAY`, `AI_RATE_LIMIT_TOKENS_PER_TRIP_PER_DAY`. Unset → AI UI is hidden entirely; nothing else changes (product principle 5). Keys are server-side only, never sent to the browser. Per-trip AI enable toggle for the owner.
- **Independent of the personal-AI surface (owner directive, 2026-06-11):** House AI and Personal AI (TD-7) enable/disable separately — both, either, or none per deployment. House AI hinges solely on the env key above; nothing in TD-7 requires it.
- **NL itinerary edits:** server-side tool loop (`streamText` + app-defined tools: read itinerary, add/update/move activity, detect conflicts), `maxSteps ≤ 5`. **Writes are applied through the same service layer humans use**, executed as a distinct AI actor identity → feed entries read "Caravan AI (asked by Sam)". If a model can't produce valid tool calls (weak local models), degrade to suggestion-text in chat — never write unvalidated structured output.
- **Gap/conflict detection is deterministic code first:** overlapping times, missing-date gaps, budget overrun = pure code (zero tokens, 100% reliable — research cites LLM-only temporal reasoning as unreliable). LLM handles only semantic judgments ("is 20 min realistic from LAX to downtown?"), clearly labeled as AI opinion.
- **Cost controls:** `ai_usage` table tracking per-user/per-trip token windows (1-min + 1-day), checked before each call, exact usage recorded from the SDK's `onFinish`; budget exhausted → friendly "AI budget used up for today" message, core features unaffected. Admin-visible usage dashboard (deployment owner is paying — they get visibility).

**Consequences:** Chat history, suggestions, and edits all run through one audited path (shared with TD-7's audit schema). The AI SDK's Zod-schema tools align with the MCP tool definitions — one tool registry can serve both surfaces.

### TD-7: Personal AI surface — MCP over Streamable HTTP; PAT + OAuth 2.1 together in v1.3

**Status:** ✅ ACCEPTED with modification (owner, 2026-06-11; proposed 2026-06-10) · Research: `research/raw/ai-mcp.md` (R4, Part B) · Owner overrode the proposed PAT-first staging in favor of full client coverage at launch

**Decision:**
- **Protocol: MCP** (Linux Foundation standard, adopted across OpenAI/Google/Microsoft/Anthropic — this *is* the BYO-assistant substrate in 2026). **Streamable HTTP** transport, built against the **stable 2025-11-25 spec** (the next revision targets final publication 2026-07-28, RC locked 2026-05-21; auth middleware kept swappable for it). TypeScript SDK v1.x (pin; v2 is pre-alpha), endpoint mounted at `/mcp` **inside the main app server** — no separate service.
- **Auth (owner decision, 2026-06-11 — full coverage at launch):** research found a hard client split — Claude Desktop / Claude Code / Anthropic API accept **static bearer tokens**, while **claude.ai web/mobile and ChatGPT require a full OAuth 2.1 (PKCE) authorization server** (bearer support closed "not planned"). The proposed PAT-first staging (OAuth deferred to v1.4) was overridden; **v1.3 ships both**:
  - **PAT bearer auth** — user generates a scoped token in trip settings (256-bit opaque, hashed at rest, revocable, per-trip scopes): the paste-a-token path for desktop/CLI/API clients and the REST-fallback credential.
  - **OAuth 2.1 (PKCE) authorization server** layered on the same token store (PATs serve as the issued access tokens), so claude.ai web/mobile and ChatGPT connect from day one of the surface. This is the largest single chunk of auth engineering in the project — an accepted cost; TREK's solo-built OAuth+MCP server is the existence proof it's tractable.
- **Companion REST+PAT API:** the same tool operations exposed as plain REST endpoints authenticated by the same PATs — the universal fallback for any client that speaks neither MCP nor OAuth. Near-free since the service layer and PATs already exist.
- **Independently optional (owner directive, 2026-06-11):** the two AI surfaces decouple completely — a deployment can run both, either, or none. Personal AI hinges on an instance setting **`personal_ai_enabled`** (admin panel, env-overridable; **default ON-but-inert** — `/mcp` does nothing until a user mints a token and writes still require the per-trip opt-in; OFF hides token generation and 404s `/mcp`). The personal-only state needs **no host LLM key**: BYO assistants bring their own inference. The only House↔Personal coupling anywhere is the shared tool-registry *library* — a build-order concern, not a runtime dependency (plan §4 note).
- **Tool surface (v1.3):** reads on by default — `get_itinerary`, `get_activity`, `get_expense_summary`, `search_places`; writes default-off behind the per-trip opt-in (PD-11) — `add_activity`, `update_activity`, `move_activity`, `create_poll`, `vote_poll`, `log_expense`, `add_comment`. Tools are defined once (Zod schemas) and shared with the House AI loop (TD-6).
- **Enforcement is server-side at the service layer**, not in tool descriptions: every call re-checks trip membership, role, and the write opt-in; viewer-role AI can never write regardless of token scopes (defense in depth against confused-deputy).
- **Limits & audit:** per-token rate limits (default 60 calls/hour), every invocation logged to `ai_audit_log` (`ts, user_id, trip_id, surface: house_ai|mcp, tool, input_hash, result, client_hint`) — the same table TD-6 writes. Personal-AI mutations also emit normal feed events attributed "〔member〕's assistant" (PD-11).

**Consequences:** PAT table + audit log + the shared tool registry land early in the build (they're cheap), so the v1.3 surface is "mount and expose" *plus* the OAuth server — making M9 the largest post-v1.0 milestone. It parallelizes internally (OAuth server ∥ MCP endpoint/tools ∥ PAT + audit UI); see plan §6/M9.

### TD-8: License & contribution norms — AGPL-3.0 + DCO

**Status:** ✅ ACCEPTED (owner, 2026-06-11; proposed 2026-06-10) · Research: `research/raw/self-host-prior-art.md` (R2)

**Decision:** **AGPL-3.0** for the app, **DCO** (signed-off-by) instead of a CLA.

**Why:** Caravan delivers value as a network-accessed web app — exactly the case AGPL was designed for: it closes the loophole where someone runs a modified hosted fork without sharing changes (GPL-3.0 leaves that open; "do not choose GPL-3.0" was the research's strongest licensing statement). The self-hosting audience is entirely unaffected. This matches the closest peers (Vikunja, Plausible, Nextcloud, Mastodon — and both nearby travel projects). DCO over CLA keeps contribution friction near zero (the 2025-2026 trend, e.g. OpenStack's CLA→DCO migration) — a CLA only pays off if you anticipate relicensing, which contradicts the project's no-monetization stance.

**Runner-up:** Apache-2.0 if maximum adoption/permissiveness ever outranks SaaS-fork protection. All proposed dependencies are MIT/Apache/BSD — compatible either way.

**One caution:** nearby projects are AGPL — implementations must stay clean-room (no code lifted from them), which the restart's "old codebase off-limits" discipline already enforces by habit.

### TD-9: Testing, CI & release pipeline

**Status:** ✅ ACCEPTED (owner ratified 2026-06-11; proposed 2026-06-10) · Research: R2 + R5

**Decision:**
- **Test pyramid:** Vitest unit tests for all pure logic — settlement algorithm (tested to the cent, including rounding-remainder cases), fractional indexing, permission checks, feed-event derivation; Hono `app.request()` integration tests for every API route (auth + validation + permission matrix); Playwright E2E for the flagship flows.
- **The acceptance bar for M1 is a two-browser-context Playwright test**: two signed-in members edit the same itinerary simultaneously — both converge, presence shows both, the feed attributes both. This test is the executable form of the product's core promise and runs in CI from M1 onward.
- **CI (GitHub Actions):** PRs → Biome + typecheck + unit/integration + Playwright (sharded). Tags `v*` → multi-arch Buildx (amd64+arm64) → GHCR (`latest` + semver tags) with Docker Hub mirror. **release-please** manages versioning + CHANGELOG from conventional commits.
- A nightly job boots the published container from scratch (empty volume → migrate → healthcheck → smoke test) — the self-host first-run experience is itself under test.
- **DCO check** on PRs (TD-8). CONTRIBUTING.md documents the one-command dev setup (`pnpm i && pnpm dev`).

### TD-10: Instance theming — semantic token contract, themes as data

**Status:** ✅ ACCEPTED (owner directed 2026-06-11, in-session) · **Extended by TD-11** (2026-06-19: theming split into two orthogonal axes — style pack × color theme)

**Decision:**
- **The token contract comes first, the default look is an instance of it.** Every UI surface consumes only semantic CSS custom properties (`--primary`, `--accent`, `--muted`, `--warning`, `--danger`, radius, …) — never raw palette values. E.1's "design language" deliverable is therefore two artifacts: the token contract itself, and Caravan's warm default expressed inside it. Defined before the itinerary UI (1.7/1.8) so the app's biggest surface is born compliant, not retrofitted.
- **Themes are data, not CSS.** An admin "theme" is a small set of `instance_settings` values (≈2–3 base hues + light/dark preference) injected as CSS variables at the shell. No custom CSS upload, no arbitrary overrides (XSS surface, support burden).
- **Derived ramps, not free pickers.** Hover/foreground/border/muted tones derive from the chosen hues via OKLCH math with contrast floors — admins pick a personality, the system keeps it legible. Curated presets up front; a custom-hue picker behind them.
- **Status colors are tokens too** — warning/danger/success states (archived banners, connection dots) theme along with everything else instead of hardcoding amber/red.
- **Identity marks centralize now, customize later:** logo/wordmark/favicon render through one `<BrandMark/>` indirection; actual logo/icon upload stays in `docs/enhancements.md` until promoted.
- **Surfaces:** admin picker UI lands with D.3's panel (Track D); custom instance name (already D.3 scope) joins the theme as part of "instance identity."

**Rejected:** full custom CSS (unbounded support/security surface); per-user themes (it's the *group's* instance — one identity per deployment, v1); swappable icon sets (low payoff, asset-pipeline cost).

---

### TD-11: Two-axis theming — style pack × color theme as independent axes

**Status:** ✅ ACCEPTED (owner directed 2026-06-19, in-session) · Extends [TD-10] · Grounded in the approved Caravan Design System (claude.ai/design, "D · The Blend")

**Context:** TD-10 modeled a theme as "a few base hues + light/dark." The owner wants more reach: an instance should be able to change *the whole aesthetic personality* — not just recolor it. The reference design ("poster": warm paper, 2px espresso-ink outlines, hard zero-blur offset shadows, Bricolage/Albert type) is our default, but a host should be able to run "material" (soft elevation, hairline borders, tight radii) or "beach" (airy, big radii, soft long shadows) instead — and pick colors *independently* of that.

**Decision — theming is two orthogonal axes, both data, that compose:**

1. **Style pack** (`data-style` on the root: `poster` | `material` | `beach` | …) — the *structural personality*. A style pack sets only **structural tokens**: border treatment (`--border-interactive`, `--border-w`), the shadow system (`--shadow-control/raised/overlay/pressed/focus`, including blur vs. zero-blur offset), the radius scale (`--radius-control/card/pill/stamp`), the type pairing (`--font-display`, `--font-body`, tracking/weight floors), motion (`--motion-press`, press-translate distance), and density. It sets **no hues**.
2. **Color theme** (`data-theme` on the root: `warm` | `dusk` | … , with `.dark` as an orthogonal light/dark modifier) — the *palette*. A color theme sets only **base hue + neutral + ink tokens** (`--paper`, `--surface-card`, `--ink`, `--ink-soft`, `--hue-primary/accent/success/info/danger` + `-soft` pairs). It sets **no structure**.
3. **The semantic layer resolves both.** Components consume only semantic aliases — `--color-primary`, `--shadow-raised`, `--border-interactive`, `--radius-card`, `--font-display`, … — never a raw hue and never a literal border/shadow. Critically, **structural recipes reference color tokens**: e.g. poster's `--shadow-raised: var(--offset) var(--offset) 0 var(--ink)` pulls its ink from the *color* axis, so the two axes mix freely (poster+dusk re-inks every shadow; material+warm softens every edge). This is what makes them genuinely independent rather than a bundle.

**Consequences:**
- The E.1 token files split accordingly: `themes/*.css` (color, one file per palette) and `styles/*.css` (style packs, one file per personality), over a shared `semantic.css` + a shadcn/ui bridge. Adding a preset = adding one data file on one axis; it never touches components.
- **D.3's admin picker becomes two selects** (Style + Color) plus a light/dark toggle — not one theme dropdown. `instance_settings` grows a `style_pack` key alongside the palette keys.
- v1 ships **poster as default + warm as default**, with **material** as the second style pack and **dusk** as a second palette — enough to prove and exercise both axes in CI. `beach` and further presets are curated backlog (TD-10's "curated presets up front" still holds, now on two axes).
- Self-host honesty (per owner, 2026-06-19): fonts are **vendored, not CDN-loaded** (`@fontsource/*` → bundled woff2), and icons stay the already-installed `lucide-react` package — no Google Fonts / unpkg calls at runtime, consistent with TD-4's offline-capable posture.

**Rejected:** single-axis "skins" that bundle color+structure (rejected: the whole point is mixing a personality with an unrelated palette); per-component style overrides (rejected: re-introduces the divergence the token contract exists to prevent); letting a style pack set hues or a color theme set structure (rejected: collapses the two axes back into one). Custom-CSS upload stays rejected from TD-10.
