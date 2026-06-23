# Handoff — Trip-page workspace layout (C.4)

_Written 2026-06-22 · branch `feat/trip-workspace-layout` (local, **not pushed / no PR**)._

## TL;DR
The trip page (`/trips/:id`) was reworked from a 6-section vertical stack into a **workspace
shell**, implementing the Claude Design deliverable. **All 5 planned stages + a cleanup are
done, committed on the branch, e2e-green, and passed an end-of-phase review (verdict: sound,
no blockers).** The branch is local and unpushed. **Immediate next action: owner review →
push + open a PR.** The only remaining C.4 item is a deferred polish (map-follows-focused-day).

## Status at a glance
- **Branch:** `feat/trip-workspace-layout`, cut from `main` at `bbfa8a5`. 10 commits, `d70db0f`..`ee0cf95`.
- **Gates (all green):** `pnpm typecheck` (apps/web) · `pnpm lint` = `biome check .` (0 errors / 0 warnings) · `pnpm -r build` · `pnpm test:e2e` (M1 gate, specs 01–04).
- **Review:** end-of-phase adversarial review = **sound, no blockers**; its one real finding (dead `FeedPanel` code) was fixed in `5cf244b`.
- **Working tree:** clean except this handoff doc (intentionally uncommitted).
- **Process note:** implementation was delegated to development subagents; the orchestrator did planning, verification, and commits (to preserve context).

## What we did

Design source (vendored, read-only prototype — **do not import, translate intent only**):
`docs/design/reference/trip-page/`. Original brief: `docs/design/trip-page-layout-brief.md`.

**Decisions taken with the owner before/while building:**
- Nav frame: **left rail** (Plan · Decide · Money · Group), not top tabs.
- Chrome: **one consolidated top bar** — the app's global header is suppressed on the trip
  route (`__root.tsx` via `useRouterState`); brand mark + account menu fold into the
  workspace top bar.
- Map: **collapsible split, default open** on desktop; **its own tab on mobile**.
- Ideas pool: **relocated to Decide**; Plan keeps a compact pointer card.
- Labels: friendly verbs (Plan/Decide/Money/Group).
- Map-follows-focused-day: **deferred** (see "What's next").

**Stages (each its own commit; e2e M1 gate green per stage):**
| Commit(s) | Stage |
|---|---|
| `51f1b32` + `b70e3f3` | **1** shell + consolidation — rail, single top bar, collapsible ambient map split, feed drawer, ☀ warm↔dusk theme toggle |
| `65e4f5c` | **2** long-trip day nav — sticky day-jump rail + Today/Trip-start, collapsible days (today+ahead open by default), one-line compact empty days, Today badge |
| `a5b49e6` | **3** ideas pool → Decide; Plan keeps a pointer card |
| `4322b33` | **4** feed drawer polish — bell unread badge, "caught up to here" divider, "{N} new" pill, mark-all-read |
| `408240c` | **5** mobile — bottom-tab nav (Plan·Map·Decide·Money·Group, Map its own tab), thumb FAB, Plan split→single-column, full-screen feed |
| `5cf244b` | cleanup — removed FeedPanel's now-dead non-embedded path (drawer-only/embedded now) |
| `d70db0f`, `42c2691`, `ee0cf95` | docs — vendored design reference; plan status |

**Key files:**
- `apps/web/src/components/trips/trip-workspace.tsx` — the shell (rail, top bar, view switch, Plan split, feed drawer, bottom nav, FAB, account/theme).
- `apps/web/src/components/itinerary/itinerary-board.tsx` — day rail, collapsible/compact days, DnD, ideas pointer, `ItineraryBoardHandle` (FAB → add-activity).
- `apps/web/src/components/decisions/ideas-panel.tsx` — ideas pool in Decide (reuses ActivityCard + vote/comment footer).
- `apps/web/src/components/trips/feed-panel.tsx` — drawer feed rows (embedded-only after cleanup).
- `apps/web/src/lib/sync/feed.ts` — `useUnreadCount(tripId)` (bell badge).
- `apps/web/src/lib/use-media-query.ts` — `useMediaQuery` / `useIsDesktop`.
- `apps/web/src/routes/__root.tsx` — suppresses the global header on the trip route.
- `apps/web/src/routes/trips.$tripId.tsx` — route states (full-height skeleton/notfound/error).
- `apps/web/src/components/map/map-panel.tsx` — gained a `fill` prop (height-filling pane).

## What's next
1. **Push the branch + open a PR** against `main` (not done yet — awaiting owner go). The 10 commit messages already read as a clean stage-by-stage story for the PR body.
2. **Deferred — map-follows-focused-day** (recorded in `docs/plan.md`, Track C). The itinerary
   already tracks a "focused day" but it only drives the day-rail highlight today. Sketch:
   lift `focusedIso` from `ItineraryBoard` → `PlanView` (or a small shared context) and pass
   it to `MapPanel`, which fits/flies to the focused day's plotted activities. Map providers
   are live (keyless OpenFreeMap tiles + Photon geocoding, both reachable), so this is
   additive polish, not blocked.
3. **Optional review nits** (not blockers; from the end-of-phase review):
   - FAB and the day-rail "Add activity" share an accessible name — unique on desktop (FAB is
     `lg:hidden`), but two exist at a mobile viewport. Consider a distinct FAB label / scoping.
   - `itinerary-board.tsx` re-derives member colors inline; could reuse `useMemberColors`
     (`components/decisions/use-decisions.ts`).
   - `focusedIso` / `collapseOverride` don't reconcile when trip dates change (cosmetic,
     self-correcting on next interaction).
   - Near-duplicate "No ideas yet" copy across `ideas-panel.tsx` and the Plan pointer.

## How to resume
- **Switch:** `git switch feat/trip-workspace-layout`.
- **Run it:** `pnpm dev` → http://localhost:5173 (Vite; API/WS on :3000; uses the persistent
  dev DB `apps/server/data/caravan.db` — the owner's account is there). For a clean slate, run
  the built server with a temp DATA_DIR:
  `cd apps/server && DATA_DIR="$(mktemp -d)" NODE_ENV=production PORT=3457 BASE_URL=http://127.0.0.1:3457 node dist/index.js`.
- **Verify:** `cd apps/web && pnpm typecheck`; root `pnpm lint`; root `pnpm -r build` **then**
  root `pnpm test:e2e` (build first; `test:e2e` is a **root** script, not in apps/web).
- **Gotchas (learned this phase):**
  - Playwright `dragTo` can't drive dnd-kit (pointer vs mouse events) — e2e moves activities
    via the edit dialog, not drag. Verify drag-and-drop by hand.
  - `getByText` / `getByRole(name)` are **substring + case-insensitive** — nav clicks use
    `exact: true`; avoid UI copy that collides with assertion words ("live"/"planned"/"group").
  - **Desktop must not regress:** mobile chrome is `lg:hidden`, desktop chrome `hidden lg:flex`
    (both `display:none`) so duplicate-named nav buttons leave the a11y tree at the 1280px e2e
    viewport.
  - The map needs internet (OpenFreeMap + Photon) **and** an activity with a *picked* location
    (place autocomplete) before any pins/clusters show — empty map is the correct empty state.
  - Biome excludes `docs/design/reference` (vendored prototype). Don't lint/format it.
