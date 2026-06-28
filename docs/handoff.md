# Handoff — current state (post Tracks D + E)

_Written 2026-06-28. Supersedes `handoff-trip-workspace-c4.md` (now historical). This is the live "where we are / what's next / how to resume" note._

## TL;DR

Caravan is **feature-complete and polished for v1.0**. On top of M0/M1 + fan-out Tracks A/B/C + the C.4 trip workspace, this session shipped **all of Track D (self-host & ops + email)** and **all of Track E (design polish)** to `main`, each via an orchestrated multi-agent pass (foundation → parallel worktree agents → adversarial review → remediation), landed **direct to `main`** (owner's call) with every gate green. `main` is at **`f7ff96a`** (+ this handoff commit).

**Immediate next task (owner asked):** geocode the **Japan 2026** test trip's places so the map lights up (they're imported as text-only / unplotted — see "Test data" below).

**Roadmap next:** **M6 — v1.0 hardening & release**.

## What shipped this session (all on `main`)

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
- **Japan 2026** (`7a196dfbceb3982dbbf6bfc39e06a9d2`) — **55 activities across Oct 1–11 2026**, imported from the owner's "Japan 2025 – Wanderlog" PDF (shifted onto the 2026 trip; day 1→Oct 1). Categories/times/notes carried over. **Places are text-only (unplotted) — geocoding is the next task.**

> The import was a one-off script (`apps/server/src/scripts/import-japan.ts`, since deleted) modeled on `seed.ts` — it used `executeMutation` so versioning + feed events are correct. If you need to re-import or geocode, follow the same pipeline (don't hand-write the DB while the dev server holds it open).

## Immediate next: geocode the Japan trip

Goal: give the ~50 Japanese places real `lat`/`lng` so they pin on the map. Approach options:
- The app has a server-side geo proxy (`apps/server/src/core/geo.ts`) over **Photon** (keyless) — forward-geocode each `place_name`, take the top hit, and `activity.update` the activity with `place: { name, address, lat, lng, provider: "photon" }` through the mutation pipeline.
- Expect a few misses/ambiguities (Japanese names, generic spots like "Akihabara"); log/skip those rather than pin them wrong. Confirm reachability first (Photon public instance has no SLA — TD-5).
- Stop the dev server before a bulk script run, then restart (same reason as the import).

## Roadmap next: M6 — v1.0 hardening & release

From `plan.md` §M6: integration QA across tracks · full design sweep (conform every surface to the E.1 language) · full E2E suite green · perf budget (snapshot < 100 ms @ 500 activities; bundle audit) · security pass (invite token entropy, session fixation, rate limits, headers) · load sanity (10 concurrent editors) · README screenshots + demo instance · tag `v1.0.0` → GHCR → awesome-selfhosted.

**Re-enable release-please when cutting v1.0** (it's deferred): (1) restore the `push: [main]` trigger in `.github/workflows/release-please.yml`; (2) enable repo Settings → Actions → "Allow GitHub Actions to create and approve pull requests" (`gh api -X PUT repos/Aedrand/caravan/actions/permissions/workflow -F can_approve_pull_request_reviews=true`); (3) bump `.github/.release-please-manifest.json` off the `0.0.0` sentinel (else it proposes 1.0.0). Full checklist is in plan §M6 + the workflow header.

## How to resume

- **Run it:** `pnpm dev` → http://localhost:5173 (Vite; API/WS on :3000; persistent dev DB). To test **email** for real, relaunch the server with SMTP pointed at a local Mailpit: `docker run -d --rm -p 1025:1025 -p 8025:8025 axllent/mailpit`, then run the built server with `SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_FROM="Caravan <caravan@example.test>"` (inbox UI at :8025).
- **Gates:** `cd apps/web && pnpm typecheck`; `cd apps/server && pnpm typecheck`; root `pnpm lint`; root `pnpm -r build` **then** root `pnpm test:e2e` (build first — `test:e2e` is a root script; it spins its own prod server on :3456 with a temp DB).
- **Seed a fresh dev DB:** `cd apps/server && pnpm seed` (demo trip; Ada/Bao/Cleo demo users).

## Gotchas learned this session (orchestration + code)

- **Agent `isolation: "worktree"` branches from the repo BASE commit, not the current branch HEAD** — worktree agents must `git reset --hard <feature-branch>` onto the foundation first (they did). Integrate disjoint-file worktree branches with `git cherry-pick` (clean, linear).
- A **foundation pass owning shared files** (config / `app.ts` / schema / shared primitives) before fan-out is what makes parallel worktrees collision-free. Same shape worked for D and E.
- **Leftover agent worktrees** under `.claude/worktrees/` each contain a `biome.json` → `biome check .` fails with "nested root configuration" until you `git worktree remove` them. (Now gitignored, but still remove them after a pass.)
- **Rate limiting is ON in prod** (e2e runs `NODE_ENV=production`): the strict auth limiter is **POST-only** so it doesn't throttle Better Auth's `get-session` polling (that bug broke e2e once — `6355b5c`). `TRUST_PROXY` (default false) gates `x-forwarded-for`.
- **Background subagents can't prompt for tool permissions**; the classifier also blocks auto-writing `.claude/settings.local.json`. Run write-capable agents in the foreground (the session auto-allows Edit/Write/Bash), or have the owner pre-authorize.
- Pre-existing: Playwright `dragTo` can't drive dnd-kit (e2e moves activities via the dialog); `getByText`/`getByRole(name)` are substring + case-insensitive (nav clicks use `exact: true`).

## Pointers

- **Plan + status:** `docs/plan.md` (task tables carry ✅/status notes; §M6 is next). **Decisions:** `docs/decisions.md`. **Self-host docs:** `docs/self-hosting/{install,configuration,reverse-proxy,backups}.md`.
- **Idea inbox:** `docs/enhancements.md` (owner logs ideas here; promote into plan/decisions deliberately).
- Cross-session status also lives in the auto-memory (`caravan-planning-status`).
