# Trip page workspace layout — design brief

> Handed to the **Caravan Design System** project (claude.ai/design, "D · The Blend") on 2026-06-20 to design the trip-page workspace IA/layout. This is the deferred **C.4** ("split-view workspace + long-trip day navigation"), now expanded to the whole workspace information architecture because the parallel fan-out (Tracks A/B/C) added Polls, Expenses, and Map panels that currently stack vertically. See `../plan.md` Track C.

## Context
Caravan is a self-hostable group travel planner. The **trip page** (`/trips/:id`) is the core workspace. All the *features* now exist and work end-to-end — but they're stacked vertically in one long column, and we need a design for the **information architecture and layout** that organizes them into a real workspace. Everything must live inside the existing design system ("D · The Blend" — warm paper, espresso-ink outlines, hard offset shadows, Bricolage/Albert, the two-axis token contract). Don't invent new visual language; compose the existing one.

## What we have today (all built, all functional)
The page is currently a single vertical stack of these sections, in order:

1. **Trip header** — back link, editable trip name, destination + date range, a live **presence cluster** (person-colored avatars of who's online + a "Live/Connecting/Offline" connection dot), and a trip-actions menu (duplicate / archive / delete).
2. **Itinerary** — a day-by-day timeline. Days are *derived* from the trip's date range unioned with any dated activities (a trip can be 2 days or **43 days**). Each day is a list of **activity cards** (category tile, time, place, notes, map/booking link-outs, a **vote control** with voter avatars, an "X is editing…" presence hint, a recently-edited flash). Cards **drag-and-drop** within/across days. Below the days is an **Ideas pool** (undated candidates, sorted by votes). Empty days currently render as full dashed "Add something" boxes — for a long trip that's ~40 big empty boxes to scroll past.
3. **Map** — a MapLibre/OpenFreeMap pane (clustered pins for located activities, an "unplotted" list, attribution). Pins and activity cards already **highlight each other bidirectionally**. Currently just another stacked block.
4. **Polls** (group decisions) — create/vote/close polls, live results, "convert winner to an idea." (Comments also exist, attached to activities and polls.)
5. **Expenses** — expense list, add-expense (equal/custom splits), record-payment, a settlement summary ("who pays whom"), per-person and per-category totals, budget overview.
6. **Activity feed** — a collapsible, attributed change log ("Priya added Pastéis de Belém · 2m ago") with an unread badge and a "caught up to here" divider. This is the async catch-up surface (Caravan deliberately has **no group chat**).
7. **Members** — roster with roles + invite-link creation.

## The problem
Six feature areas stacked in one column is a wall — you scroll past a 43-day itinerary *and* a map *and* polls *and* expenses to reach the feed. No sense of "where am I," no way to jump around, and the long-trip itinerary alone is exhausting to navigate.

## What we need designed
A **trip-page workspace shell + IA** that makes these areas navigable and calm. The real design questions:

- **Top-level structure.** What's *always visible* vs. *a tab/view* vs. *a drawer/panel*? Standing direction is **map-forward**: the map should feel ambient — a persistent pane beside the itinerary on desktop, not a destination you click to. Decisions (polls), Expenses, Members read more like switchable views or secondary nav. The feed reads like a slide-in/drawer "what changed." Propose the structure (tabs? left rail + split content? something better) and justify it.
- **Long-trip itinerary navigation (the original C.4).** A sticky **DayTabs** day-jump rail (the component already exists in the system) with the active day highlighted; **compact empty days** (a thin one-line "+ Day 7 · Wed" row, not a full box); collapsible day sections; "jump to today / trip start." Make a 43-day trip scannable.
- **The map split.** How the itinerary column and map pane share space on desktop (day-grouped timeline alongside the persistent map), and how it collapses on mobile (map as a toggle / bottom sheet).
- **Persistent chrome** — trip identity, presence cluster, connection state, the feed's unread indicator — in a sticky header/shell that survives view switches.
- **Responsive.** Desktop split-view → mobile single-column with bottom-tab navigation and a thumb-reachable "add." In-trip mobile use is first-class, not an afterthought.
- **States.** Empty (no activities / no expenses / no polls), loading, and viewer (read-only) vs. editor.

## Constraints
- Consume only the **semantic token contract** (`--color-*`, `--shadow-*`, `--radius-*`, `cv-card`/`cv-control`, `font-display`) — must re-theme across style packs and color themes untouched.
- Reuse existing components (ActivityCard, DayTabs, IdeaChip, MapPin, PresencePill, the feed/poll/expense cards) — restyle/recompose, don't replace.
- Warm, consumer-grade, calm; for the *least* technical friend in the group. Sentence case, attributed, friendly.
- Works for 2-day weekends and 40+-day epics, for groups of 2–10.

## Deliverable
A layout/IA spec for the trip page: the desktop shell (nav model + map split + day rail), the mobile adaptation, and how the areas map into it — enough for an implementation agent to build against. Bias toward fewer concepts and opinionated defaults over configurability.
