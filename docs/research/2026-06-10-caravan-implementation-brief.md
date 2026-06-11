# Research Brief: Caravan implementation strategy

Synthesized 2026-06-10 from five parallel research streams (raw findings in `raw/`, ~190 cited sources total, all claims verified against mid-2026 state of the ecosystem; a fact-check pass on decision-critical claims is recorded in `raw/fact-check.md`). This brief is the summary layer; **`../decisions.md` carries the resulting proposed decisions and `../plan.md` carries the build plan.**

## Problem Statement

Build Caravan: a free, open-source, self-hostable collaborative travel planner for small friend groups (2–10 people) — real-time co-edited itineraries, group decision tools (votes/polls/comments/activity feed), expense splitting with settlement, an ambient map, House AI on the deployment owner's key, and a bring-your-own-AI tool surface. Greenfield TypeScript build (deliberate restart; prior implementation discarded and off-limits). Hard constraints: `git clone` + one command self-host (single container, SQLite), vendor-neutral components, $0-default external services, AI augments but never gates.

## Domain Landscape

**Sync (R1):** The 2026 ecosystem splits into CRDT libraries (Yjs/Automerge/Loro), sync engines (Zero/Electric/PowerSync — nearly all Postgres-coupled, which disqualifies them here), and the server-authoritative pattern (Linear/Figma-style per-field LWW + fractional indexing), which the community now treats as a first-class choice for structured records rather than a cop-out. For SQLite-constrained self-hosting the practical shortlist is Yjs+Hocuspocus vs. hand-rolled server-authoritative; Caravan's permission model (per-author rules), trust-critical attributed feed, AI write paths, and SQL-queryability needs all favor **server-authoritative** (TD-1 argues this against the raw research's nominal Yjs lean).

**Self-hosting (R2, corrected by fact-check):** Single container + SQLite (WAL) is the gold standard the community rewards (Mealie, Vikunja, Grist, Actual Budget); auto-migrate on boot, env-var config with aggressive defaults, GHCR multi-arch images, optional Litestream backup. **Competitive niche — correction:** the original finding called the niche "genuinely open," but the fact-check **refuted** that: **TREK** (github.com/mauriceboe/TREK, ~5.6k ★, AGPL-3.0, Node+SQLite+React) is a *direct* FOSS competitor — by its own README a real-time collaborative group planner with WebSocket co-editing, polls, group chat, and per-person expense splits. AdventureLog (GPL-3.0, Django+Postgres) is confirmed non-overlapping (personal-journal-first, share-links only, no expense splitting). Caravan's positioning must therefore rest on *differentiation* (simpler ops floor, BYO-AI depth, group-decision UX, design taste), not on an empty niche — flagged for the owner in `../plan.md` §10. AGPL-3.0 + DCO remains the licensing norm among peers.

**Maps (R3):** A genuinely $0, keyless, policy-clean default exists: MapLibre GL JS + OpenFreeMap vector tiles + Photon geocoding (the only public geocoder permitting autocomplete; Nominatim explicitly forbids it). Key-based upgrades (Geoapify/LocationIQ) and a fully self-hosted heavy mode (PMTiles + own Photon) layer on via env vars. Geocoding proxies through the app server (caching, key concealment, provider swap); tiles never do.

**AI (R4):** Vercel AI SDK v6 is the provider-agnostic TS consensus (provider swap = config; Ollama supported; provider OpenAI-compat shims are documented non-production and rejected as the abstraction). MCP is the BYO-assistant standard (Linux Foundation; all major vendors). The decision-critical wrinkle: **Claude Desktop/Code/API accept static bearer tokens for remote MCP, but claude.ai web/mobile and ChatGPT require a full OAuth 2.1 server** — hence the staged auth plan in TD-7. Deterministic code beats LLMs for temporal conflict detection; LLMs handle only semantic judgment.

**Stack (R5):** A coherent, boring-in-the-good-way 2026 stack exists with no exotic picks: Node 24 LTS, Hono (native WS, `hc` typed client), better-sqlite3 + Drizzle (programmatic migrate-on-boot), Vite 8 + React 19 SPA (no SSR), TanStack Router/Query, Tailwind v4 + shadcn/ui, dnd-kit, Better Auth, Zod v4 shared schemas, pnpm monorepo, Biome v2, Vitest + Playwright.

## Existing Codebase Context

Greenfield — repo contains only product docs. The prior `../travel-planner` implementation is explicitly off-limits as reference.

## Key Technologies & APIs

| Layer | Choice | One-line rationale |
|---|---|---|
| Sync | Hand-rolled mutation log + WS broadcast + fractional indexing | Permissions/attribution/AI-writes first-class; pattern proven by Linear/Figma (TD-1) |
| Server | Hono on Node 24 LTS | REST + WS + static + MCP in one process (TD-2) |
| Data | SQLite (WAL) + better-sqlite3 + Drizzle | One file, one volume, migrate-on-boot (TD-3) |
| Frontend | Vite 8 + React 19 + TanStack Router/Query + Zustand | Type-safe SPA, no SSR complexity (TD-2) |
| UI | Tailwind v4 + shadcn/ui + dnd-kit | Full control for warm consumer aesthetic (TD-2) |
| Auth | Better Auth + domain-owned trip invites | 2026 consensus; identity only, membership is ours (TD-2/PD-10) |
| Maps | MapLibre + OpenFreeMap + Photon (proxied) | $0 keyless default, policy-clean autocomplete (TD-5) |
| House AI | Vercel AI SDK v6, env-keyed, budget-capped | Provider-agnostic incl. Ollama; never gates (TD-6) |
| Personal AI | MCP Streamable HTTP at `/mcp`; PAT + OAuth 2.1 together (v1.3) | Full client coverage at launch — owner decision 2026-06-11 (TD-7) |
| Packaging | Single Docker container, GHCR, amd64+arm64 | The one-command story (TD-4) |
| License | AGPL-3.0 + DCO (owner's call) | Peer norm; closes hosted-fork loophole (TD-8) |

## Orchestration Recommendation

- [ ] Single agent
- [ ] Sequential subagents
- [ ] Parallel subagents
- [x] **Supervisor + specialists** (with heavy parallel phases)

**Rationale:** After a deliberately *serial* foundation milestone (M0–M1: schema, auth, sync engine, app shell — the contracts everything depends on), the feature areas decompose into genuinely independent tracks (decisions/voting, expenses, maps, AI, packaging/CI, design system) that touch disjoint files and communicate only through the shared Zod schemas and the mutation-envelope contract. A supervisor holds the contracts and integration; specialist agents run the tracks concurrently. `../plan.md` encodes this as an explicit dependency DAG with interface contracts defined up front — the plan is built for parallel execution.

## Open Questions

Carried into the plan/decisions for owner review (⚑-flagged where a judgment call was staged):

1. **TD-1 sync choice** — server-authoritative over Yjs is argued, not self-evident; review the reasoning before M1 starts.
2. **TD-7 auth staging** — ✅ resolved 2026-06-11: owner chose OAuth 2.1 + PAT together in v1.3 (staging proposal overridden).
3. **TD-8 license** — AGPL-3.0 + DCO recommended; owner's call.
4. **TREK differentiation (fact-check: refuted the open-niche claim)** — TREK is a confirmed direct competitor with real-time group collaboration and expense splits. Decide Caravan's differentiation stance and amend PROJECT.md's whitespace claim; the build case now rests on doing it *better/simpler*, not *first*.
5. Smaller unverified items are listed per-file under "Open questions / unverified claims" in `raw/` — notably exact current versions to pin at scaffold time (Vitest major, Better Auth semver, dnd-kit major, `@hocuspocus/extension-sqlite` — moot if TD-1 stands), the MCP TS SDK's v1.x Hono middleware availability (manual `StreamableHTTPServerTransport` wiring is the fallback), and `node:sqlite` stabilization at Node 26 LTS (a cheap better-sqlite3 swap later).
