# Handoff — current state (Trip Workspace v2 — Plan View v2 shipped)

_Updated 2026-06-28 (Trip Workspace V2.1→V2.3 build session: design pass + data-model foundation + Plan View v2). Supersedes `handoff-trip-workspace-c4.md` (now historical). This is the live "where we are / what's next / how to resume" note._

## TL;DR

Caravan is **feature-complete for the original v1.0 scope** — M0/M1 + fan-out Tracks A/B/C + the C.4 trip workspace + all of Track D (self-host/ops + email) and Track E (design polish), all on `main` with gates green.

**This session (2026-06-28):** shipped **Trip Workspace V2.1 → V2.3** direct to `main`, all pushed to origin — the **design pass** (`f41308c`), the **data-model foundation** (`db99c9e`), and **Plan View v2** (`e721ca8`). The planning surface now renders the order-driven **progression rail** with numbered map pins, inline note/checklist rows, est-cost chips, and drag-to-resequence, on the new typed-item / first-class-days / idea-lists data model. Gates green throughout (typecheck/biome, 259 unit, build, e2e 5/5). `main` is at **`e721ca8`**.

**Immediate next:** **V2.4 — bookings + day anchors:** wall-clock flight/lodging entry → derived bookend check-in/out entries + per-day home-base anchors (PD-14); this lands the flight/lodging columns deferred from V2.2 (the enum value + create-guard already exist).

**Roadmap next:** finish **Trip Workspace v2** (V2.4 → V2.7 — see the brief: routing → money → workspace shell), then **M6 — v1.0 hardening & release** over the v2-inclusive app.

## This session (2026-06-28 — Trip Workspace V2.1 → V2.3 shipped)

Three v2 phases shipped direct to `main` (all pushed to origin), each behind a green gate sweep:

- **V2.1 — design pass — ✅ `f41308c`:** ratified the workspace design via rendered HTML mockups in the owner's claude.ai/design "Caravan Design System" project. Decisions: **left index rail** (240px scrollspy TOC) · **two-line progression rail** · **hero-band overview** (trip identity + planned-vs-actual budget bar) · eager-mount/lazy-renderer. Final spec committed: [`docs/design/trip-workspace-v2-plan-and-shell-spec.md`](design/trip-workspace-v2-plan-and-shell-spec.md). **Build split:** V2.3 builds the rail inside today's tabbed shell; V2.7 wraps it in the left-rail shell.
- **V2.2 — data-model foundation — ✅ `db99c9e`:** typed items (`type` discriminator activity\|note\|checklist\|flight\|lodging + checklist-items JSON + `estimatedCostMinor` + `listId`), first-class `days` table, `idea_lists`; mutations `checklist.toggle`/`day.upsert`/`ideaList.create|update|reorder|delete`; days + idea lists in the snapshot; migration **0005** (additive; validated on the real dev DB). **Flight/lodging columns deferred to V2.4** (enum value + create-guard only). Gates: 249 unit + e2e 5/5 green. **Gates the rest.**
- **V2.3 — Plan View v2 — ✅ `e721ca8`:** the order-driven **progression rail** — two-line rows, numbered square stamps (hollow when unplotted) synced to **numbered map pins**, inline note/checklist rows (checklist toggles), est-cost chips, inline-editable day subtitle, "N stops · ~$est" summary, drag-to-resequence; **idea lists + freeform note/checklist idea types** on Decide; the typed-item form dialog. Built inside today's tabbed shell via an orchestrated foundation + 3-surface-agent pass. **Deferred:** travel-time labels + 🏨 home-base anchors (V2.4 bookings), walk/drive route-mode toggle (V2.5 routing), category-tint pins + drag-between-lists (follow-on polish). Gates: typecheck/biome, 259 unit, build, e2e 5/5 green.

## Previous session (2026-06-28 — Trip Workspace V2.0 quick wins shipped)

The **V2.0 independent quick wins** (brief §7 step 0) shipped direct to `main` in one commit (`26103f5`), via an orchestrated 3-agent parallel pass (disjoint files: server `geo` · web `itinerary` · web `map`): **geocoding `lang=en`** (`GEOCODING_LANGUAGE` env threaded into `core/geo.ts` + cache keys → Latin/English OSM names; +4 unit tests), **date-first "Friday, May 1st" day labels** (`formatDayLabel`, day header + form picker), and the **map day-layer toggle** (per-day pin filter at the GeoJSON data level so clusters recompute). Gates green (geo unit 16/16, build, e2e 5/5). **Japan geocode confirmed already complete** — 53/55 activities pinned via Photon with Latin names; the 2 unpinned rows are the round-trip flights (no single place to pin — D3 booking work).

## Earlier (2026-06-28 — enhancement triage → Trip Workspace v2)

The owner brought 21 manual-testing enhancement ideas; walked them one-card-at-a-time into a coherent design and captured it:
- **Design record (source of truth):** [`docs/design/trip-workspace-v2-brief.md`](design/trip-workspace-v2-brief.md) — 11 decisions (D1–D11), data model, sequenced build plan.
- **Ratified decisions** in `docs/decisions.md`: **PD-13** (typed items via a `type` discriminator on the activity row + first-class `days` table + user-defined idea lists + per-activity cost estimates), **PD-14** (enter-once flight/hotel bookings → derived check-in/out entries + per-day home-base anchors; wall-clock times), **PD-15** (continuous-scroll workspace shell + synced index + overview; Plan View v2 = order-driven progression rail), **TD-13** (real multi-modal routing proxy with travel-times; geocoding `lang=en`). These **amend PD-1** (days are now first-class, not derived) and extend PD-2.
- **Plan:** `docs/plan.md` has the phased **Trip Workspace v2** milestone (V2.0–V2.7), marked current priority (precedes M6).
- Commits: `dfd8824` (enhancement inbox) → `0c7e8bc` (brief) → `10c1a6f` (decisions/plan/handoff) → `5a0d8ab` (precautionary docs pass).

## What shipped previously (Tracks D + E, all on `main`)

| Area | Commits | Notes |
|---|---|---|
| **C.4 follow-up** — ambient map follows the focused day | `5403ab3` | desktop Plan map frames the focused day's pins on day-switch |
| **Map ↔ itinerary** — dropped the redundant under-map list; click an activity title to fly-to/highlight its pin (bidirectional) | `8a558e5` | reclaims map height; completes `selection.tsx` |
| **C.4 review nits** | `b007490` | mobile "Add" dedupe, `useMemberColors` reuse |
| **Track D — ops & admin cluster** (D.3 admin panel, D.4 Litestream, D.5 self-host docs, D.6 release-please + security headers + rate limiting + version footer) | `258a3ca`..`b0aea2f`, plan `1ee6275` | foundation + 3 parallel worktrees + review + remediation; e2e 5/5, 105 unit |
| **Track D — email backbone** (D.1 SMTP invite/membership email, D.2 daily digest + opt-out) | `5b97804`..`ef095a5`, plan `067ed25` | nodemailer + react-email, graceful-off; **verified E2E with a local Mailpit catcher** (invite + both digests observed) |
| **release-please deferred to M6** | `c3dee1b`; gitignore + M6 note `9e47355` | it was failing on every push (repo setting blocks Actions from opening PRs) → set to `workflow_dispatch` (manual-only). Re-enable checklist below + in plan §M6 + the workflow header |
| **Track E — design polish** (E.2 states, E.3 responsive, E.4 a11y) | `7da7cdd`..`9176cc3`, plan `f7ff96a` | shared `EmptyState`/`Skeleton`/`ErrorState`; expenses error state; drag-handle 20→32px, poll/settlement responsive; **feed-drawer focus trap + restore**; **contrast `--ink-soft` → WCAG-AA**; visually verified @390px + focus-trap proven |

Repo hygiene scan done (no secrets/DB/env tracked; `.gitignore` hardened for agent worktrees + playwright scratch). One outstanding GitHub **Dependabot low** alert (unrelated).

## Test data (local dev DB only — NOT in the repo)

The persistent dev DB (`apps/server/data/caravan.db`, Test Admin = `test@testing.com`, role admin) has two trips:
- **Dolomites 2026** — small itinerary (Rome/Florence/Paris pins) used for map verification.
- **Japan 2026** (`7a196dfbceb3982dbbf6bfc39e06a9d2`) — **55 activities across Oct 1–11 2026**, imported from the owner's "Japan 2025" trip-export PDF (shifted onto the 2026 trip; day 1→Oct 1). Categories/times/notes carried over. **Places are geocoded** — 53/55 pinned via Photon with `lang=en` Latin names (Sensō-ji, Tokyo Tower, …); the 2 unplotted rows are the round-trip flights (no single place to pin — D3 booking work).

> The import was a one-off script (`apps/server/src/scripts/import-japan.ts`, since deleted) modeled on `seed.ts` — it used `executeMutation` so versioning + feed events are correct. If you need to re-import or geocode, follow the same pipeline (don't hand-write the DB while the dev server holds it open).

## Trip Workspace v2 (the current priority)

**Read first:** [`docs/design/trip-workspace-v2-brief.md`](design/trip-workspace-v2-brief.md) (full design record) + [`docs/design/trip-workspace-v2-plan-and-shell-spec.md`](design/trip-workspace-v2-plan-and-shell-spec.md) (V2.1 ratified Plan View v2 + shell spec) + `plan.md`'s **Trip Workspace v2** milestone (the V2.0–V2.7 phase table) + PD-13/14/15 & TD-13 in `decisions.md`.

**The build sequence (brief §7 / plan):**
- **V2.0 — quick wins (no deps) — ✅ SHIPPED (`26103f5`):** geocoding `lang=en` (Japan geocode confirmed done); date-first "Friday, May 1st" day labels; map day-layer toggle.
- **V2.1 — design pass — ✅ SHIPPED (`f41308c`):** ratified via rendered HTML mockups — left index rail (240px scrollspy TOC), two-line progression rail, hero-band overview (planned-vs-actual budget bar), eager-mount/lazy-renderer. Spec: `docs/design/trip-workspace-v2-plan-and-shell-spec.md`. Build split: V2.3 builds the rail in today's tabbed shell, V2.7 wraps it in the left-rail shell.
- **V2.2 — data-model foundation — ✅ SHIPPED (`db99c9e`):** typed items (`type` discriminator + checklist-items + `estimatedCostMinor` + `listId`), first-class `days` table, idea lists; `checklist.toggle`/`day.upsert`/`ideaList.*` mutations; migration 0005 (additive). Flight/lodging columns deferred to V2.4. **Gated the rest.**
- **V2.3 — Plan View v2 — ✅ SHIPPED (`e721ca8`):** order-driven progression rail (two-line rows, numbered stamps ↔ numbered map pins, inline note/checklist rows, est-cost chips, drag-to-resequence), idea lists + freeform idea types on Decide, typed-item form dialog. Built in today's tabbed shell.
- **V2.4 — bookings + day anchors — ⏭ NEXT:** wall-clock flight/lodging entry → derived bookend check-in/out entries + per-day home-base anchors (PD-14); lands the flight/lodging columns deferred from V2.2.
- **V2.5 → V2.7:** routing (multi-modal proxy + travel-times) → money (convert-estimate-to-expense + planned-vs-actual budget) → workspace shell (continuous scroll + synced left-rail index wrapping it all).

**Scope guardrails (from the decisions):** **desktop-first** — *mobile UX is its own later design review, not now*. **Deferred:** the file/image upload subsystem (so hero image, image-type ideas, and file attachments wait). **Out of scope:** full UI localization, public-transit routing. Reuse the existing activity row + sync/feed/permissions (PD-13) — don't build parallel machinery per type.

**Next move:** start the **V2.4** bookings + day anchors build (V2.1–V2.3 shipped — see "This session" above).

### Geocoding the Japan trip — ✅ DONE

All pinnable Japan places are geocoded (53/55) via the **Photon** geo proxy with **`lang=en`**, so names are Latin/English where OSM has them (`金龍山 浅草寺` → `Sensō-ji`) and coordinates are correct. The 2 rows without coordinates are the round-trip flights (no single place to pin — that's D3 booking work, not geocoding). New place searches now also return English names via `lang=en`.

> If you ever need to (re)geocode a trip's text-only places: forward-geocode each `place_name` through the server geo proxy (`apps/server/src/core/geo.ts`, Photon keyless, now `lang=en`), take the top hit, and `activity.update` with `place: { name, address, lat, lng, provider: "photon" }` through the mutation pipeline (model on `seed.ts` / `executeMutation`). **Stop the dev server first** (it holds the DB open), and log/skip misses rather than pin them wrong (Photon public has no SLA — TD-5).

## Roadmap after v2: M6 — v1.0 hardening & release

(Trip Workspace v2 runs first — see above + the brief.) From `plan.md` §M6: integration QA across tracks · full design sweep (conform every surface to the E.1 language) · full E2E suite green · perf budget (snapshot < 100 ms @ 500 activities; bundle audit) · security pass (invite token entropy, session fixation, rate limits, headers) · load sanity (10 concurrent editors) · README screenshots + demo instance · tag `v1.0.0` → GHCR → awesome-selfhosted.

**Re-enable release-please when cutting v1.0** (it's deferred): (1) restore the `push: [main]` trigger in `.github/workflows/release-please.yml`; (2) enable repo Settings → Actions → "Allow GitHub Actions to create and approve pull requests" (`gh api -X PUT repos/Aedrand/caravan/actions/permissions/workflow -F can_approve_pull_request_reviews=true`); (3) bump `.github/.release-please-manifest.json` off the `0.0.0` sentinel (else it proposes 1.0.0). Full checklist is in plan §M6 + the workflow header.

## How to resume

- **Run it:** `pnpm dev` → http://localhost:5173 (Vite; API/WS on :3000; persistent dev DB). To test **email** for real, relaunch the server with SMTP pointed at a local Mailpit: `docker run -d --rm -p 1025:1025 -p 8025:8025 axllent/mailpit`, then run the built server with `SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_FROM="Caravan <caravan@example.test>"` (inbox UI at :8025).
- **Gates:** `cd apps/web && pnpm typecheck`; `cd apps/server && pnpm typecheck`; root `pnpm lint`; root `pnpm -r build` **then** root `pnpm test:e2e` (build first — `test:e2e` is a root script; it spins its own prod server on :3456 with a temp DB).
- **Seed a fresh dev DB:** `cd apps/server && pnpm seed` (demo trip; Ada/Bao/Cleo demo users).

## Gotchas (orchestration + code, from the Tracks D/E build era)

- **Agent `isolation: "worktree"` branches from the repo BASE commit, not the current branch HEAD** — worktree agents must `git reset --hard <feature-branch>` onto the foundation first (they did). Integrate disjoint-file worktree branches with `git cherry-pick` (clean, linear).
- A **foundation pass owning shared files** (config / `app.ts` / schema / shared primitives) before fan-out is what makes parallel worktrees collision-free. Same shape worked for D and E.
- **Leftover agent worktrees** under `.claude/worktrees/` each contain a `biome.json` → `biome check .` fails with "nested root configuration" until you `git worktree remove` them. (Now gitignored, but still remove them after a pass.)
- **Rate limiting is ON in prod** (e2e runs `NODE_ENV=production`): the strict auth limiter is **POST-only** so it doesn't throttle Better Auth's `get-session` polling (that bug broke e2e once — `6355b5c`). `TRUST_PROXY` (default false) gates `x-forwarded-for`.
- **Background subagents can't prompt for tool permissions**; the classifier also blocks auto-writing `.claude/settings.local.json`. Run write-capable agents in the foreground (the session auto-allows Edit/Write/Bash), or have the owner pre-authorize.
- Pre-existing: Playwright `dragTo` can't drive dnd-kit (e2e moves activities via the dialog); `getByText`/`getByRole(name)` are substring + case-insensitive (nav clicks use `exact: true`).

## Docs hygiene

External-product names are intentionally kept **out of the repo** (a precautionary owner preference). Research files under `docs/research/raw/` refer to external projects only as generic **"Competitor A–H"** placeholders — **do not reintroduce product names** in docs, code comments, or commit messages. Map/geo *providers* and booking *link-out* targets are tech/features (not external products) and are fine to name.

## Pointers

- **Start here for v2:** `docs/design/trip-workspace-v2-brief.md`. **Plan + status:** `docs/plan.md` (Trip Workspace v2 is the current priority, then §M6). **Decisions:** `docs/decisions.md` (PD-13/14/15, TD-13). **Self-host docs:** `docs/self-hosting/{install,configuration,reverse-proxy,backups}.md`.
- **Idea inbox:** `docs/enhancements.md` (owner logs ideas here; promote into plan/decisions deliberately).
- Cross-session status also lives in the auto-memory (`caravan-planning-status`).
