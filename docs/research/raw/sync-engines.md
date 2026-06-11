# R1: Sync & Collaboration Layer — research findings (2026-06-10)

## TL;DR

- **Primary recommendation: Yjs + Hocuspocus v4 + SQLite** (via `@hocuspocus/extension-sqlite`). MIT-licensed, actively maintained (v4.1.1 released 2026-06-10), runs as a single Node/Bun process, first-class presence/awareness, production-proven at scale. The structured-data mismatch (Yjs was designed for rich text) is real but manageable: model each activity as a `Y.Map`, days as `Y.Array<Y.Map>`, field edits as map `.set()`. Permission enforcement at the connection level is good; per-field enforcement requires doc-splitting or a wrapping layer. Attribution requires custom `onChange` hook work — not free but not hard.
- **Runner-up: Server-authoritative REST/WebSocket + per-field LWW + fractional indexing** (the "boring" baseline). No dependencies, full permission enforcement, attribution falls out naturally as a server-side event log. The one non-trivial piece is drag-to-reorder ordering: solvable with fractional indexing. Total implementation cost is moderate but the surface area is entirely yours to own. This is what Linear does for structured data (they only added CRDTs for issue *descriptions* — plain text — later).
- Zero (Rocicorp) hit 1.0 in June 2026 and is technically impressive, but **requires Postgres** — a hard disqualifier for the one-container/SQLite constraint.
- Electric SQL is read-path only; you supply your own write path. Works with Postgres only. Interesting for read-scale but adds complexity rather than reducing it for Caravan's scale.
- Automerge/automerge-repo is the best choice if Git-like version history is a first-class feature need, but its sync server story is thinner than Hocuspocus and SQLite storage is community-only.

---

## Landscape (how the community frames this choice in 2026)

The community has coalesced around three archetypes in 2026:

1. **CRDT libraries (Yjs, Automerge, Loro)**: Handle conflict resolution mathematically; you supply network transport, persistence, and permission logic. Optimized for rich text but usable for structured data.
2. **Sync engines (Zero, Electric, PowerSync, Triplit, Replicache)**: Opinionated full-stack systems that manage the read/write pipeline and often include permission models. Almost all require Postgres as the source of truth — a hard conflict with SQLite-only self-host.
3. **Server-authoritative custom sync (Linear/Figma pattern)**: Per-field LWW + WebSocket broadcast + optimistic client. Not a library — a pattern. Works well for structured data because conflicts are rare and the semantic meaning of "last write wins on a field" is natural. The community has stopped treating this as a cop-out; several local-first thought leaders now recommend it as a first-class option for structured records.

The dominant 2026 trend: sync engines are winning mindshare from CRDT libraries for greenfield apps, but nearly all require Postgres. For SQLite-constrained self-hosters, the practical choices remain Yjs + Hocuspocus or a hand-rolled approach.

---

## Option Assessments

### 1. Yjs + Hocuspocus

**What it is:** Yjs is a CRDT library (MIT, ~920K weekly npm downloads) providing `Y.Doc`, `Y.Map`, `Y.Array`, `Y.Text` shared types. Hocuspocus is the official Yjs WebSocket server, maintained by ueberdosis (also makers of Tiptap).

**Current status & license (verified 2026-06-10):**
- Yjs: MIT, actively maintained, ~5800 stars, npm downloads confirm widest CRDT adoption
- Hocuspocus: MIT, v4.1.1 released 2026-06-10, 2.4k stars, ueberdosis-maintained, institutional sponsors (Tiptap, Outline, Ahrefs, Cargo)
- `@hocuspocus/extension-sqlite`: v3.4.3, published ~3 days before research date; uses `better-sqlite3`
- Hocuspocus v4 declared stable 2026-05-08; cross-runtime (Node, Bun, Deno, Cloudflare Workers), backward-compatible wire protocol

**Self-host fit:** Excellent. Single Node/Bun process. SQLite extension handles persistence natively. No Postgres required. Runs in one Docker container. Production-tested at 3,000 concurrent users on 1vCPU/1GB RAM per HN discussion.

**Fit for Caravan's data shape:**
- `Y.Map` for each activity record (title, date, time, location, notes, category) — concurrent edits to different fields merge cleanly
- `Y.Array<Y.Map>` for ordered day lists — concurrent reorders on different items merge; concurrent moves of the *same* item produce deterministic but potentially surprising results (Yjs uses a tombstone/interleaving model, not true moveable-list semantics)
- Yjs does NOT natively support a move operation for list elements; reordering with drag-to-drag is typically done by deleting and reinserting, which in concurrent scenarios can leave duplicates. Workarounds: (a) fractional index stored as a field in each `Y.Map` (best), (b) Loro's moveable-list type (see §3), (c) accept last-write-wins on position field
- Notes fields as `Y.Text` gives collaborative text editing "for free" if wanted; plain-text last-write-wins on a `string` field in `Y.Map` is also valid for v1
- Expenses, votes, comments: `Y.Map` and `Y.Array` handle these naturally
- Presence/awareness: built-in via Yjs awareness protocol; Hocuspocus exposes `beforeHandleAwareness` hook for validation

**Permission + attribution story:**
- Connection-level permissions: `onAuthenticate` hook rejects unauthorized connections; `connection.readOnly = true` prevents write from read-only users. This is solid.
- Field-level permissions: **Not natively supported.** Yjs docs state "Permissions cannot be practically enforced within a YDoc so you need to split data into multiple YDocs if you need different permissions." For Caravan's owner/editor/viewer roles, splitting is feasible (one doc per trip).
- Rejecting individual mutations: `beforeHandleMessage` hook can close the connection if a message violates custom rules, but granular per-operation rejection is hard — you get "all or nothing" at the connection level.
- Attribution/audit trail: **Not automatic.** Yjs encodes ops with peer IDs internally but does not expose a human-readable changelog. Hocuspocus `onChange` fires on every change with the `transaction.origin` (structured in v4 as `ConnectionTransactionOrigin | RedisTransactionOrigin | LocalTransactionOrigin`). You can attach user identity to `onAuthenticate` context and read it in `onChange` to write activity-feed rows to SQLite. This is custom work, not free — estimate 1–2 days.
- The activity feed "Sam added 3 activities" requires semantic interpretation of raw CRDT ops (detect `Y.Array.insert` vs `Y.Map.set`). Doable but requires care.

**Risks:**
- Structured-data mismatch: Yjs is designed for text. Using it for structured records works but fights the grain slightly. Garbage collection and memory management of large numbers of small YDocs has been flagged in HN discussions.
- Attribution is custom work; easy to get subtly wrong
- No official moveable-list type; fractional indexing workaround required for safe drag-reorder
- Bus factor: ueberdosis is a small company; Hocuspocus is secondary to their core Tiptap product. However, institutional sponsorship and the v4 stable release are positive signals.
- Sources: [1][2][3][4][5][6]

---

### 2. Automerge / automerge-repo

**What it is:** Automerge is a CRDT library (MIT) by Ink & Switch. automerge-repo is the "batteries-included" layer providing storage and network adapters. Core is written in Rust/WASM for performance; JS API wraps it.

**Current status & license (verified 2026-06-10):**
- automerge-repo: v2.6.0-alpha.2 (June 5, 2026), 686 stars, MIT license
- Still in alpha. The version number and alpha tag suggest caution for production use.
- Public sync server at `wss://sync.automerge.org` (demo use only; run your own for production)
- Official storage adapters: IndexedDB (browser), Node.js filesystem only
- SQLite adapters: community-only (`bijela-gora/automerge-repo-storage-better-sqlite3`, `@marionauta/automerge-repo-better-sqlite3`, `@marionauta/automerge-repo-bun-sqlite` on JSR)

**Self-host fit:** Moderate. The sync server (`automerge-repo-sync-server`) is a thin WebSocket relay. Community SQLite adapters exist but are not official. No integrated presence/awareness system. You would build the full server stack yourself.

**Fit for Caravan's data shape:**
- `Automerge.from({})` can represent any JSON-serializable structured record; concurrent edits to different keys merge cleanly
- Lists use a sequence CRDT; `Automerge.insertAt` / `Automerge.deleteAt` are available
- True move operation: Automerge Repo 2.0 added `history()`, `view()`, `diff()` for version control — best-in-class for audit trails among CRDT libraries
- Conflict detection: `Automerge.getConflicts()` shows concurrent writes to the same property. For Caravan's use (two users move the same activity to different days), you can detect and surface the conflict to users
- Notes: Automerge has first-class rich text via Peritext integration

**Permission + attribution story:**
- No server-side permission enforcement built-in; the sync server is a relay
- Attribution is the strongest point: each Automerge change has a built-in actor ID; `history()` returns a log of all changes with metadata. The activity feed could be derived from this change log more naturally than with Yjs.
- Still requires custom work to map actor IDs to human-readable user names and semantic actions

**Risks:**
- Still alpha (v2.6.0-alpha.2); API stability unclear
- 686 stars is relatively low; bus factor risk (Ink & Switch is a research lab, not a product company)
- No official SQLite storage adapter; community adapters may lag
- No built-in presence/awareness; must build separately
- Bundle size / WASM load penalty
- Sources: [7][8][9]

---

### 3. Loro

**What it is:** High-performance CRDT library (MIT) written in Rust with WASM/JS bindings. Provides `LoroMap`, `LoroList` (with **true moveable semantics**), `LoroText`, `LoroTree`.

**Current status & license (verified 2026-06-10):**
- v1.23.2, latest package published June 8, 2026; 5.7k stars, MIT license
- Loro 1.0 recently released; has reached API stability milestone
- Benchmarks show fastest performance and best compression among CRDT libs
- ~12K npm weekly downloads (vs Yjs ~920K); ecosystem is early-stage

**Self-host fit:** Poor out-of-the-box. No sync server component — you build your own WebSocket relay. No presence/awareness built-in (must implement at app layer). No SQLite persistence layer. You get the CRDT algorithms; everything else is DIY.

**Fit for Caravan's data shape:**
- `LoroList` with true move semantics is the best answer in any library to "two users drag the same activity to different days simultaneously" — this is Loro's headline structural advantage
- `LoroMap` handles per-field edits with LWW semantics
- No official collaborative text beyond basic operations
- Moveable tree CRDT for hierarchical data (not directly relevant to Caravan)

**Permission + attribution story:**
- No built-in solution; fully custom
- Change attribution requires instrumenting the app layer

**Risks:**
- No sync server, no presence, no persistence layer — all DIY
- Small ecosystem; few production examples
- WASM load time overhead (noted as worst metric in benchmarks)
- Best structural fit for the drag-reorder problem, but the surrounding ecosystem gap makes it a risky choice for v1
- Sources: [10][11][12]

---

### 4. Electric SQL

**What it is:** Read-path sync engine (Apache-2.0) that streams Postgres data to clients via HTTP using "Shapes" (filtered table subsets). Electric.ax is the current canonical URL (electric-sql.com redirects).

**Current status & license (verified 2026-06-10):**
- Apache-2.0 license; actively maintained
- Architecture pivoted in mid-2024 to "read-path only" — Electric no longer handles writes
- Write patterns are fully DIY (four documented patterns: online writes, optimistic state, shared persistent optimistic state, through-the-database writes)

**Self-host fit:** Disqualifying constraint: **requires Postgres with logical replication enabled**. Cannot use SQLite as primary database. Adds a separate Electric sync service process to the deployment.

**Fit for Caravan's data shape:**
- Read sync is excellent for structured records; you subscribe to shape changes and get real-time table-level updates
- For collaborative editing you still need to implement your own write/conflict path
- No built-in presence/awareness
- Good fit for read-heavy features (map view, read-only itinerary sharing) but incomplete as a collaboration layer on its own

**Risks:**
- Hard constraint violation: requires Postgres
- Write path is entirely custom — you get sync-on-read but not collaboration-on-write
- Sources: [13][14]

---

### 5. Zero (Rocicorp)

**What it is:** General-purpose sync engine (open-source, fully MIT/Apache — Rocicorp states no plans to ever change licensing). Pairs a client library with a `zero-cache` service that maintains a SQLite replica of a Postgres database.

**Current status & license (verified 2026-06-10):**
- Zero 1.0 released June 2026 (InfoQ article confirms). First stable release after ~2 years of alpha/beta.
- License: open-source; Rocicorp committed to keeping it so
- zero-cache uses SQLite internally as a read replica, but Postgres is the authoritative source
- TypeScript-only clients; ~232KB gzipped client bundle
- Does NOT support offline writes or extended offline periods

**Self-host fit:** Near-disqualifying. Requires Postgres as authoritative source AND a separate `zero-cache` service process. Single-node deployment is documented and possible, but you cannot replace Postgres with SQLite as the primary database.

**Fit for Caravan's data shape:**
- Excellent for structured records: query-based subscriptions, strong permission model ("only sync data the user can see")
- Real-time sync is smooth; 1.0 release signals API stability
- No offline writes; offline read only

**Risks:**
- Hard constraint: Postgres required
- Large client bundle (~232KB gzip)
- Postgres views not synced; some column types (arrays) unsupported
- Sources: [15][16][17]

---

### 6. Replicache

**What it is:** Local-first sync framework (Rocicorp) implementing push/pull/poke pattern with optimistic client + server-authoritative reconciliation.

**Current status & license (verified 2026-06-10):**
- **Maintenance mode.** Rocicorp officially deprecated Replicache and is directing users to migrate to Zero.
- Code has been open-sourced; license key no longer required; free to use
- No new features will be added

**Self-host fit:** Would have been good (BYO backend including SQLite), but maintenance-mode status makes it a poor long-term foundation. Building on a deprecated framework for a new project is inadvisable.

- Sources: [18]

---

### 7. PowerSync

**What it is:** Source-available sync engine connecting server databases (Postgres, MySQL, MongoDB, SQL Server) to SQLite on clients.

**Current status & license (verified 2026-06-10):**
- Server: Functional Source License (FSL) — converts to Apache 2.0 after 2 years. Not OSI-approved open source today; may be a concern for a FOSS project.
- Client SDKs: Apache-2.0
- Self-hosted via Docker (`journeyapps/powersync-service`); Docker Compose CLI available
- Backend source: Postgres (primary), MongoDB, MySQL, SQL Server

**Self-host fit:** Partial. Requires a server-side database (Postgres/MySQL etc.) in addition to the PowerSync service. Two processes minimum. SQLite is the *client-side* store, not the server store. Fails the "SQLite strongly preferred" constraint for the server.

**Fit for Caravan's data shape:**
- Strong for offline-first mobile; less natural for server-side conflict arbitration
- No built-in presence/awareness for real-time cursor/editing indicators

**Risks:**
- FSL is not truly open source today (would convert in 2 years from initial publication, but FSL terms vary by version date)
- Requires a server-side relational database; cannot use SQLite as the canonical store
- Primarily mobile-focused; web real-time collaboration story is secondary
- Sources: [19][20]

---

### 8. Quick Assessments: Triplit, Jazz, LiveStore, TinyBase, InstantDB

**Triplit:**
- Open source (Apache-2.0), TypeScript-first, runs on both server and client, self-hostable
- v1.0 recently released; schema defined in TypeScript
- Supports SQLite storage (pluggable: IndexedDB, SQLite, Durable Objects)
- Websocket sync with real-time subscriptions; built-in permission rules
- Promising but smaller ecosystem and fewer production references than Yjs
- Source: [21][22]

**InstantDB:**
- Open source but **not currently self-hostable** ("can't bring your own postgres yet" — HN discussion 2024)
- YC-backed, backend in Clojure — limits TypeScript-first self-host story
- Designed as managed cloud service; disqualified by self-host constraint
- Source: [23]

**LiveStore:**
- Very early stage (Bluesky post, no stable release found)
- Reactive event-sourced local-first; promising but not mature enough for new production projects
- Source: [24]

**TinyBase:**
- MIT, TypeScript, MergeableStore as native CRDT
- `WsServer` module for self-hosted WebSocket sync
- SQLite synchronizer support (via ExpoSQLite, op-sqlite)
- Designed for small reactive apps; not a heavy sync engine
- Viable for Caravan if scope stays small; lacks production scale examples
- Source: [25]

**Jazz:**
- Local-first collaborative data framework; global mesh network concept
- Self-host story unclear; depends on Jazz mesh infrastructure
- Not evaluated as a primary option given dependency on external mesh
- Source: [26]

---

### 9. The "Boring" Baseline: Server-Authoritative REST/WebSocket + LWW

**What it is:** No specialized library. Server holds SQLite as the canonical store. Mutations are HTTP POST or WebSocket messages. Server applies change, persists, broadcasts delta to connected clients. Client applies optimistically; reconciles on server response. Presence via lightweight WebSocket ping/state channel separate from data channel.

**Conflict handling for Caravan's data shape:**
- Per-field LWW with server timestamp: natural for activity field edits (title, notes, time); if two users edit the same field concurrently, last write to server wins. This is what Linear does for structured records.
- Drag-to-reorder: use fractional indexing (arbitrary-precision decimal position stored as a column). Concurrent moves of the same item: both writes reach server; server processes them in receipt order; last write wins on `position` column. Item ends up in one place. No duplicate/disappear issues. This is what Figma uses for ordered objects.
- Comments, votes: append-only structures — no conflicts possible.
- Expenses: per-record LWW on fields is safe; concurrent delete + edit can be handled with soft-delete + server-side validation.

**Permission enforcement:** First-class. Every mutation is a server function call. Owner/editor/viewer check before any DB write. Reject unauthorized changes with HTTP 403. No CRDT leakage.

**Attribution/audit trail:** First-class. Every mutation handler writes an activity log row: `{userId, action, entityType, entityId, diff, timestamp}`. The activity feed "Sam added 3 activities" falls out naturally.

**Presence/awareness:** Lightweight separate WebSocket channel. On connect, broadcast `{userId, name, color, cursor: {tripId, dayId, activityId}}`. Heartbeat to detect disconnects. ~100 lines of code.

**What it costs:**
- Not zero: ordering conflict edge cases require fractional indexing implementation (use `fractional-indexing` npm package, ~100 lines to integrate)
- Optimistic client requires a reconciliation step (rebase local uncommitted changes on server state); ~200-400 lines depending on UI framework
- No offline editing; offline read is fine (serve cached data)
- Total: 1,000–2,000 lines of bespoke sync glue code, but no complex dependencies to maintain

**Existence proof:** Linear uses server-authoritative LWW for all structured issue data; only added CRDT (Yjs) for rich-text issue descriptions. Figma uses property-level LWW with fractional indexing for all objects.

**Actual Budget case study:** Actual uses a CRDT-message model (each budget change is an immutable CRDT message) + a simple sync server that relays encrypted blobs + SQLite per user. This is closer to Automerge's model than Yjs's. It achieves local-first with simple self-host. Key insight: the sync server is a *relay* that doesn't interpret payloads. For Caravan, this is appealing for offline-editing in v2, but the relay model means the server cannot enforce field-level permissions on the encrypted payload — a tradeoff.

---

### 10. y-sweet

**What it is:** Rust-based Yjs server (MIT, by Jamsocket). Persists to S3-compatible storage or local directory. Alternative to Hocuspocus.

**Current status (verified 2026-06-10):**
- v0.9.1 (September 2025); ~998 stars; MIT
- Slower release cadence than Hocuspocus; no v4-equivalent recent major release
- Local directory persistence works (no S3 required)
- Smaller ecosystem than Hocuspocus; fewer examples

**Assessment:** Valid alternative to Hocuspocus if Rust runtime is preferred, but Hocuspocus has more active development, better documentation, and native SQLite extension. Not recommended over Hocuspocus for this project.

---

## Comparative Table

| Option | License | Postgres req? | SQLite server? | Presence built-in? | Permission enforcement | Attribution/audit | Maturity (2026) |
|---|---|---|---|---|---|---|---|
| Yjs + Hocuspocus | MIT | No | Yes (extension) | Yes (awareness) | Connection-level good; field-level manual | Custom (onChange hook) | Production-ready |
| Server-auth + LWW | N/A (hand-rolled) | No | Yes (native) | Manual (~100 LOC) | First-class (server function) | First-class (event log) | Pattern proven at scale |
| Automerge-repo | MIT | No | Community-only | No (build it) | No (relay only) | Best-in-class (change log) | Alpha |
| Loro | MIT | No | No (DIY) | No (DIY) | No | Custom | Early-stage, 1.0 reached |
| Electric SQL | Apache-2.0 | **Yes** | No | No | Via HTTP proxy | No | Stable (read-only) |
| Zero | Open-source | **Yes** | replica only | No | Good (query-based) | No | 1.0 stable |
| Replicache | Open-source | No | Yes (BYO) | No | BYO | Custom | **Maintenance mode** |
| PowerSync | FSL / Apache | No (Postgres preferred) | Client-side only | No | Via rules | No | Stable |
| Triplit | Apache-2.0 | No | Yes | WebSocket | Yes (built-in rules) | Custom | ~1.0, small ecosystem |
| TinyBase | MIT | No | Yes | Via WsServer | Manual | Manual | Stable, small scale |
| InstantDB | Open-source | No | N/A | Yes | Yes | Unknown | **Not self-hostable** |
| y-sweet | MIT | No | No (local dir or S3) | No | Via hooks | Custom | v0.9.1, slower pace |

---

## Recommendation

### Primary: Yjs + Hocuspocus v4 + SQLite

For Caravan v1, use **Yjs + Hocuspocus v4** with `@hocuspocus/extension-sqlite` for persistence.

**What to build for v1:**
- Model each trip as a `Y.Doc`. Inside: one `Y.Map` for trip metadata, one `Y.Array` of day `Y.Map`s, each day containing a `Y.Array` of activity `Y.Map`s.
- Store a `position` field (fractional index) on each activity `Y.Map` for drag-reorder safety (prevents concurrent-move duplicates from the Y.Array delete/reinsert pattern).
- Use Hocuspocus `onAuthenticate` to validate JWT, attach user to connection context, set `readOnly: true` for viewer role.
- Implement `onChange` hook: deserialize the Yjs update, detect insert/delete/update operations, write rows to a SQLite `activity_feed` table with `{userId, action, entityType, entityId, timestamp}`. This is the one non-trivial custom piece.
- Presence: Yjs awareness protocol, available for free via Hocuspocus; store `{userId, name, color, activeDay, activeActivityId}`.
- Votes, polls, comments: model as `Y.Array<Y.Map>` (append-only patterns); no conflict issues.
- Expenses: model as `Y.Map<expenseId, Y.Map>` for per-expense records.

**Offline editing path (v2):** Because Yjs encodes all changes as mergeable CRDT operations, offline editing comes largely free. Implement an `IndexedDB` or `SQLite` (via op-sqlite in a PWA context) client-side storage adapter. On reconnect, Hocuspocus merges the offline updates automatically. This is near-zero additional server work.

### Fallback: Server-Authoritative Hand-Rolled

If team appetite for the CRDT model is low, or if the attribution/permission stories prove too complex to layer onto Yjs, **go with the hand-rolled server-authoritative approach**:

- Hono + Bun + `bun:sqlite` (built-in, no npm package needed) for HTTP mutations
- WebSocket channel for broadcasting deltas and presence state
- Fractional indexing (`fractional-indexing` npm package) for drag-reorder
- Activity feed table as an append-only event log — trivially populated by mutation handlers
- Full permission enforcement on every mutation handler

**What you lose vs Yjs:** Offline editing in v2 requires building a client-side queue + merge logic (harder without CRDT math). But v1 offline-read is easy either way.

**What you gain:** Simpler mental model, first-class permissions, natural audit trail, no CRDT debugging. Linear runs this pattern at scale; Caravan's scale is far smaller.

---

## Implications for Other Decisions

**DB choice:**
- Yjs path: SQLite stores the raw Yjs binary (`Y.Doc` as `Uint8Array`) plus a separate relational `activity_feed` table. You cannot trivially query "all activities on day 3" via SQL alone; you must deserialize the Yjs doc. This is a real ergonomic cost for admin tooling, AI features, and reporting.
- Hand-rolled path: Fully relational SQLite; every field is a queryable column. AI features (trip summaries, suggestions) can query the DB directly with zero translation layer.

**API design:**
- Yjs: Server exposes a WebSocket endpoint for Hocuspocus; REST API for auth, trip creation, user management, and non-collaborative reads. Two tiers.
- Hand-rolled: All mutations as tRPC procedures or REST endpoints; WebSocket for subscription/broadcast. One tier.

**Activity feed:**
- Yjs: Custom `onChange` decoder required; medium complexity.
- Hand-rolled: Event log row in every mutation handler; trivial.

**Permissions:**
- Yjs: Good for connection-level roles (owner/editor/viewer); awkward for field-level rules. Owner-only fields (e.g., trip deletion) require separate document or wrapping.
- Hand-rolled: First-class; any rule expressible in code.

---

## Open Questions / Unverified Claims

1. `@hocuspocus/extension-sqlite` v3.4.3 was reported "published 3 days ago" from search date — could not independently verify exact publish timestamp. Check npmjs.com directly before locking version.
2. The SQLite extension stores the `Y.Doc` as a binary blob per document name. Schema structure of this storage was not fully verified — confirm it supports querying by document name efficiently.
3. Triplit v1.0 blog post returned a "loading" placeholder during fetch; full feature list and license confirmation from first-party source pending. GitHub shows Apache-2.0.
4. Automerge-repo v2.6.0-alpha.2: alpha tag — unclear when stable 2.x will land. Ink & Switch's commercial relationship to the project is unclear (research lab, not product company).
5. Zero's `zero.rocicorp.dev/docs/open-source` states "no plans to ever change licensing" but the exact license (MIT vs Apache vs custom) was not confirmed from the doc text itself.
6. PowerSync FSL: the FSL "converts to Apache 2.0 after 2 years" — the precise 2-year start date for each published component was not captured. Some components may have already converted.
7. Loro production stability: "API and encoding schema remain experimental" was a quote from earlier sources; Loro 1.0 was claimed to have reached API stability. Contradiction — verify against current loro-crdt README.
8. Whether Hocuspocus can receive a Yjs `Y.Doc` update, decode it server-side to extract semantic meaning (e.g., "activity X was moved from day 2 to day 3"), and write a structured activity-feed row — this is technically possible but implementation complexity was not fully validated by a working example.

---

## Sources

1. [Hocuspocus GitHub — ueberdosis/hocuspocus](https://github.com/ueberdosis/hocuspocus) — version, stars, license, v4 features — accessed 2026-06-10
2. [Hocuspocus v4 Stable Release — Tiptap Blog](https://tiptap.dev/blog/release-notes/hocuspocus-4-stable-release) — v4 features, cross-runtime support, SQLite switch to better-sqlite3 — accessed 2026-06-10
3. [Hocuspocus Server Hooks — Tiptap Docs](https://tiptap.dev/docs/hocuspocus/server/hooks) — onAuthenticate, beforeHandleMessage, onChange hooks — accessed 2026-06-10
4. [Hocuspocus Awareness — Tiptap Docs](https://tiptap.dev/docs/hocuspocus/guides/awareness) — presence/awareness protocol — accessed 2026-06-10
5. [@hocuspocus/extension-sqlite — npm](https://www.npmjs.com/package/@hocuspocus/extension-sqlite) — SQLite extension version, publish date — accessed 2026-06-10
6. [Show HN: Hocuspocus 4 — HN Discussion](https://news.ycombinator.com/item?id=48208834) — community reactions, scale evidence (3k concurrent on 1vCPU/1GB), memory concerns — accessed 2026-06-10
7. [automerge-repo GitHub](https://github.com/automerge/automerge-repo) — version, stars, storage adapters — accessed 2026-06-10
8. [Automerge Repo 2.0 Blog Post](https://automerge.org/blog/automerge-repo-2/) — new APIs: history(), diff(), view() — accessed 2026-06-10
9. [automerge-repo-storage-better-sqlite3 — GitHub](https://github.com/bijela-gora/automerge-repo-storage-better-sqlite3) — community SQLite adapter existence — accessed 2026-06-10
10. [Loro GitHub — loro-dev/loro](https://github.com/loro-dev/loro) — version 1.23.2, stars, license, data structures — accessed 2026-06-10
11. [Yjs vs Automerge vs Loro: CRDT Libraries 2026 — PkgPulse](https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026) — comparative analysis, download numbers — accessed 2026-06-10
12. [Loro CRDT presence/awareness — search result discussion](https://velt.dev/blog/best-crdt-libraries-real-time-data-sync) — presence not built-in; must implement at app layer — accessed 2026-06-10
13. [Electric SQL Architecture — electric.ax](https://electric-sql.com/docs/reference/architecture) — read-path only, Postgres required — accessed 2026-06-10
14. [Electric Writes Guide — electric.ax](https://electric.ax/docs/guides/writes) — four write patterns; DIY write path — accessed 2026-06-10
15. [Zero Reaches 1.0 — InfoQ](https://www.infoq.com/news/2026/06/zero-version-1/) — 1.0 stable release confirmation, Postgres requirement, 232KB bundle — accessed 2026-06-10
16. [Zero When To Use — zero.rocicorp.dev](https://zero.rocicorp.dev/docs/when-to-use) — Postgres only, no offline writes, no SQLite as primary — accessed 2026-06-10
17. [Zero Self-Hosting — zero.rocicorp.dev](https://zero.rocicorp.dev/docs/deployment) — single-node deployment docs; Postgres + zero-cache required — accessed 2026-06-10
18. [Replicache maintenance mode — search results](https://replicache.dev/) — officially deprecated; migrate to Zero — accessed 2026-06-10
19. [PowerSync FSL License](https://www.powersync.com/legal/fsl) — FSL terms, 2-year Apache conversion — accessed 2026-06-10
20. [PowerSync Open-Source Packages](https://powersync.com/open-source) — self-hosted Open Edition; Docker Hub image — accessed 2026-06-10
21. [Triplit Self-Hosting Docs](https://www.triplit.dev/docs/self-hosting) — self-host instructions, Apache-2.0 — accessed 2026-06-10
22. [Triplit GitHub — aspen-cloud/triplit](https://github.com/aspen-cloud/triplit) — pluggable storage including SQLite, TypeScript-first — accessed 2026-06-10
23. [InstantDB self-hosting HN discussion](https://news.ycombinator.com/item?id=41327630) — not self-hostable; cloud-only as of 2024 — accessed 2026-06-10
24. [LiveStore Bluesky post — Johannes Schickling](https://bsky.app/profile/schickling.dev/post/3lbhx63rop22c) — early-stage local-first data layer — accessed 2026-06-10
25. [TinyBase synchronization guide](https://tinybase.org/guides/synchronization/) — WsServer, MergeableStore, CRDT sync — accessed 2026-06-10
26. [Offline-First Landscape — marcoapp.io](https://marcoapp.io/blog/offline-first-landscape) — landscape overview including Jazz — accessed 2026-06-10
27. [About read-only mode and permissions — Yjs Community](https://discuss.yjs.dev/t/about-read-only-mode-and-permissions/1587) — permission enforcement limits in Yjs; workarounds — accessed 2026-06-10
28. [Figma multiplayer technology — Figma Blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — server-authoritative LWW per-property, fractional indexing — accessed 2026-06-10
29. [Understanding sync engines: Figma, Linear, Google Docs — Liveblocks Blog](https://liveblocks.io/blog/understanding-sync-engines-how-figma-linear-and-google-docs-work) — Linear LWW for structured data; CRDTs for text only — accessed 2026-06-10
30. [Fractional indexing for CRDTs — Liveblocks Blog](https://liveblocks.io/blog/how-crdts-and-sync-engines-keep-realtime-lists-ordered-with-fractional-indexing) — fractional indexing mechanics — accessed 2026-06-10
31. [y-sweet GitHub — jamsocket/y-sweet](https://github.com/jamsocket/y-sweet) — v0.9.1, MIT, local dir or S3, Rust server — accessed 2026-06-10
32. [Actual Budget architecture — Railway deploy page + community articles](https://railway.com/deploy/actual-personal-finance) — CRDT-message relay + SQLite + encrypted blobs existence proof — accessed 2026-06-10
33. [Hono WebSocket + Bun + SQLite — hono.dev](https://hono.dev/docs/helpers/websocket) — hand-rolled baseline stack viability — accessed 2026-06-10
