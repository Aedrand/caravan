# UI Specification: Trip Workspace v2.1 — Continuous Canvas + Plan View v2

**Status:** FINAL design spec for **V2.1** (implementable). Derived from `docs/design/trip-workspace-v2-brief.md` (D1–D11). The four contested design points (F.1–F.4) were **ratified by the owner 2026-06-28**; this document records them as settled and reconciles the body to them — it is no longer an options survey.
**Scope:** the two surfaces that are really one — **Plan View v2** (D5, the progression rail) and the **workspace shell + Overview** (D9, the continuous-scroll canvas). Specced together because the rail is a *section inside* the canvas.
**Targets:** desktop web (React SPA, TanStack Router, Tailwind v4 + shadcn, MapLibre). **Desktop-first** — mobile is a deliberately deferred, separate review (§E.2).
**Source of truth:** the brief above + `docs/decisions.md` (PD-13/14/15, TD-13; TD-10/11 token contract).
**Mockups (pixel-faithful, poster×warm):** the chosen cards live in the owner's claude.ai/design **"Caravan Design System"** project — group **"V2.1 — Workspace options / Rail density / Overview"**, chosen cards **"Index: left rail"**, **"Rail: two-line"**, **"Overview: hero band"**.
**House style:** clean-room — **no competitor product names** anywhere.

This spec assumes the data-model foundation of brief §7 phase 2 (typed-item `type` discriminator, `days` table, `IdeaList`, `estimatedCostMinor`). It defines the **target surface** so each build phase has something concrete to build to (build split in §E.3).

---

## Decisions (ratified 2026-06-28)

These four are **settled**. The body of the spec is written to them; the per-decision "rejected" note is for the record only.

### F.1 — Workspace frame: the **left index rail**
A persistent **~240px sticky left column** that is the scrollspy table-of-contents: sections, with **days nested under Itinerary**, "you are here" markers, and count badges. The desktop frame is **three columns**: `index rail │ center canvas │ right ambient map`. The map **persists for Overview + Itinerary** and **releases** (slides out, center widens) for Money + Group, where a map is dead weight.
- **Rationale:** the literal expression of D9 — today's vertical tab rail *and* the in-board day-jump rail unify into one index; best "where am I," room to nest days + counts, and desktop-first gives us the width.
- **Rejected (for the record):** slim 80px icon rail + day flyout (hides days behind a hover, weak "where am I" on a long trip); sticky top section-bar + floating day scrubber (two nav surfaces — the opposite of D9's one index).

### F.2 — Plan View v2 rail density: **two-line comfortable**
Every itinerary stop row is **two lines**: line 1 (number stamp · glyph · title · cost chip · time) and an **always-present** line 2 (place + meta on the left, vote/comment counts on the right). Roomier vertical rhythm, larger touch targets, ~half the density of a single-line rail. Still the order-driven progression rail (2px spine, numbered stop stamps synced to the map pins, travel-time slots between stops, 🏨 home-base anchors, inline note/checklist rows).
- **Rationale:** place + a note hint are *always* visible without a hover/expand; calmer to read; bigger targets that survive the eventual mobile pass.
- **Rejected (for the record):** ultra-compact single line with adaptive second line (max density but place/notes hidden until expand, tight for touch); card-on-rail (barely denser than v1 — undercuts the compact-rail goal of D5).
- **Consequence:** big days scroll more; this leans on the day nav in the index rail and on windowing for very long trips (F.4).

### F.3 — Overview / front page: the **hero band**
A trip-identity band at the head — **trip name · countdown ("12 days to go") · member avatars · planned-vs-actual budget bar** — followed by compact **attention chips** (you-owe/owed, over-budget, polls needing a vote, unplotted places), then the **bulletin**, then the **recent-feed peek**. Identity-forward, with attention still present as chips directly below the band.
- **Rationale:** strong landing identity (countdown, faces, budget) the moment you open the trip; attention stays one glance away as chips.
- **Rejected (for the record):** single prioritized triage column (cheapest, most "actionable," but no landing identity); attention grid + bulletin alongside (cramped two-column inside the already-narrow canvas).
- **Tradeoff flagged in the draft:** the hero is the most net-new component (countdown, avatar stack, budget bar). §B keeps it **actionable, not decorative** — every band element is live and every chip is a jump link; nothing on it is ornament.

### F.4 — Mount / lazy-load: **eager data + eager DOM, lazy renderers, windowing only Itinerary**
**Eager-fetch all data** (snapshot + money + feed on workspace mount) and **eager-mount all section DOM** (stable scrollspy anchors + native find-in-page). **Lazy-load only the expensive renderers** (MapLibre stays a `Suspense` chunk; routing calls fire on-demand per focused day). Reserve **windowing for the one unbounded section** — Itinerary on a very long trip — not the whole canvas.
- **Rationale:** the snapshot is hot and money/feed are small and *feed the Overview anyway*, so gating them buys nothing; the only real cost is the map renderer (already lazy) and routing (on-demand). Eager DOM keeps the index/scrollspy offsets and Ctrl/Cmd-F rock-solid.
- **Rejected (for the record):** viewport-gated fetches (the Overview needs money + feed immediately, so you'd special-case them anyway); virtualizing the whole canvas (breaks anchor stability + find-in-page — the things the index relies on — for no benefit at friend-group scale).

---

## Design principles (carried from the brief)

1. **Order over clock.** The itinerary is a *sequence*, not a timetable. Position drives everything; time is a label on a row, never a coordinate. This is what makes untimed/overlapping/all-day items non-special.
2. **One surface, one scroll.** Navigation is *position in a document*, not a mode switch. The index tells you where you are and takes you elsewhere; it never hides a section.
3. **Identity first, attention always present.** The Overview leads with *whose trip this is and when*, then immediately surfaces "what should I do?" as chips. Both are above the fold.
4. **Reuse the row.** Every item type (activity / note / checklist / flight / lodging) is the *same* collaborative row with a different glyph + body — same votes, comments, feed, sync, permissions. New types are renderers, not new machinery.
5. **Stay inside the token contract (TD-10/11).** Every surface consumes only semantic tokens (`--color-*`, `--shadow-*`, `--border-interactive`, `--radius-*`, `--font-*`). No raw hues, no literal borders/shadows. A style-pack or color-theme swap must restyle the whole canvas for free.

---

## A. Information Architecture — the continuous-scroll workspace

### A.1 Section order (top → bottom of the canvas)
The trip is a single vertical document. Sections, in order:

1. **Overview** — hero band + attention chips + bulletin + recent peek (§B).
2. **Itinerary** — the days, each a Plan View v2 progression rail (§C). Preceded by a compact **Bookings strip** (flights/hotels, §D.3).
3. **Ideas & Lists** — the idea pool organized into user lists (D10) + polls (§D.5). (Today's "Decide".)
4. **Money** — expenses, settlement, planned-vs-actual budget (§D.4 / D7). (Today's "Money".)
5. **Group** — members, roles, invite link. (Today's "Group".)

Each section is a `<section>` with a stable `id` (`#overview`, `#itinerary`, `#ideas`, `#money`, `#group`) and an `<h2>` heading anchor. Within Itinerary, each day is a nested anchor (`#day-2026-05-01`).

### A.2 Three-column desktop frame
The shell replaces today's `TripWorkspace` (80px icon rail + single switching `<main>`) with a **fixed three-column frame** under the existing global top bar:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Top bar: ‹ back · caravan · Trip name (inline edit) · dates · ◦◦ presence │
│           · ● Live · 🔔3 feed · ⋯ actions · ◐ theme · (A) account          │
├────────────┬─────────────────────────────────────────┬─────────────────────┤
│  INDEX     │            CANVAS (scrolls)             │   AMBIENT MAP        │
│  (sticky)  │   ┌───────────────────────────────┐     │   (sticky; present   │
│  ~240px    │   │  Overview — hero band         │     │    for Overview +    │
│            │   │   identity · countdown ·      │     │    Itinerary, then   │
│  Overview  │   │   avatars · budget bar        │     │    releases)         │
│  Itinerary │   │   → attention chips           │     │   ~380–440px         │
│   · Day 1  │   ├───────────────────────────────┤     │   ┌──────────────┐   │
│   ● Day 2  │◀──│  Itinerary                    │     │   │  numbered    │   │
│   · Day 3  │   │   Bookings strip              │     │   │  pins ①②③    │   │
│  Ideas     │   │   Day 1 ▸ progression rail    │     │   │  route line  │   │
│  Money  ·3 │   │   Day 2 ▸ …                   │     │   └──────────────┘   │
│  Group     │   ├───────────────────────────────┤     │   per-day filter     │
│            │   │  Ideas / Money / Group        │     │   unplotted chips     │
└────────────┴───┴───────────────────────────────┴─────┴─────────────────────┘
```

- **Left — Index rail** (`<nav aria-label="Trip contents">`): the scrollspy table of contents. Sticky, full-height, **240px**, `border-right` ink, `--paper-bright` background, scrolls internally if tall. Replaces *both* today's vertical tab rail *and* the in-itinerary day-jump rail (§A.3).
- **Center — Canvas**: the scrolling document. `max-width: ~42rem` content column (the mockup uses a 680px `.col`), centered in the available center track so prose/rows stay readable on wide monitors. **This is the only scroll container that matters** — the page itself does not scroll (the frame is `h-dvh`).
- **Right — Ambient map**: sticky, **present while Overview or Itinerary is the active section**; it **releases** (slides/fades out, center track widens) once the active section is Ideas/Money/Group. MapLibre stays the lazy chunk it is today (§A.4 / F.4). The map's per-day pin filter, numbered pins, unplotted strip, and recently-edited flash carry over unchanged.

> Why the map is a companion, not a section: pins are numbered to the rail and follow the focused day (existing `useFocusedDay` + `useMapSelection` providers). Keeping it sticky beside Overview+Itinerary preserves the v1 "ambient split," and releasing it for Money/Group recovers reading width. **This persistence rule is the ratified F.1 companion behavior** (persist for Overview+Itinerary, release below).

### A.3 The synced index (scrollspy) — form, "you are here", jumping
**Form.** A vertical list of section entries under a "Contents" cap label. The **Itinerary** entry is expandable and nests **day entries** (`Day N` · short date, e.g. "Fri Oct 2") as second-level items — these are exactly the chips that used to live in the in-board `DayRail`, relocated into the index. Day entries render only when Itinerary has ≥1 day; **empty days show dimmed** (`opacity-55`, reusing today's empty-day treatment). The day nest is indented with a left `--ink-faint` rule that reads as a mini-spine.

```
Index entry states (reuse the existing Rail/DayRail visual grammar):
  ┌─────────────────────────────┐
  │ ● Overview                  │   active   → bg-card · border-border · shadow-control
  │   Itinerary             ▾   │   parent active (a child day is in view) → ink color
  │     · Day 1 — Thu Oct 1     │
  │     ● Day 2 — Fri Oct 2     │   active day (in viewport) → filled marker + aria-current
  │       Day 4 — Sun Oct 4     │   dimmed (empty day) → opacity-55
  │   Ideas & Lists             │   inactive → text-muted-foreground, hover:text-foreground
  │   Money            ·3       │   trailing count badge (accent-soft pill, e.g. unsettled)
  │   Group                     │
  │  [ Today ] [ Trip start ]   │   pinned quick-jumps at the foot
  └─────────────────────────────┘
```

- **Active section/day:** `--surface-card` fill + `--border-interactive` + `--shadow-control`, ink text, filled marker dot (`--color-primary`). **Inactive:** `--color-muted-foreground` → `hover:--color-foreground`. **Parent active** (Itinerary, when a day is in view): ink text, chevron expanded.
- **Count badge:** trailing pill (`--accent-soft` fill, ink border) on sections with a numeric signal (e.g. Money unsettled count). Optional and self-hiding when zero.
- **Quick-jumps:** "Today" and "Trip start" pinned at the foot of the rail (`margin-top:auto`), replacing the old `ItineraryBoard` quick-jumps. They also appear as small buttons in the Itinerary section header.

**"You are here" tracking.** An `IntersectionObserver` (root = the canvas scroll container) watches every section `<h2>` anchor *and* every day anchor. The active entry is the **last anchor whose top crossed the container's top edge**. Update on scroll (rAF-throttled). Set `aria-current="true"` on the active section entry and `aria-current="location"` on the active day. When the active day changes, also set `focusedDay` (existing provider) so the map frames that day's pins — the index, the canvas, and the map stay in lockstep.

**Jumping.** Clicking an index entry calls `el.scrollIntoView({ behavior: 'smooth', block: 'start' })` on the section/day anchor and sets `focusedDay`. Honor `prefers-reduced-motion` → `behavior: 'auto'`. Each anchor carries `scroll-mt` (existing `scroll-mt-20` pattern) so it clears the sticky top bar. After a jump, move keyboard focus to the section heading (`tabindex=-1` + `.focus()`) so screen-reader and keyboard users land *in* the section.

**No separate in-canvas day rail.** The day anchors in the index are the canonical day navigation — there is **no sticky day-jump rail inside the canvas anymore** (it unifies into the index, per D9).

### A.4 Mount / lazy-load strategy (F.4, settled)
**Data temperature (grounded in the codebase):**
- The **`TripSnapshot`** (trip, activities, votes, comments, members, polls) is *hot* — fetched on every trip open. Overview, Itinerary, Ideas/Lists, and Group all read from it with **zero additional fetch**.
- **Money** is a *separate* query (`useMoney(tripId)` → `GET /api/trips/:id/money`, TD-12), refetched only on `expense.*`/`payment.*` feed events. Small (tens of rows at friend-group scale).
- **Feed** is its own query; it already powers the unread badge and the "What changed" drawer.
- **MapLibre GL** (~300 kB gzip) is the only genuinely heavy code and is already lazy behind `Suspense`.

**The strategy:**
1. **Mount every section's DOM eagerly.** The whole document is in the tree from first paint, because (a) the scrollspy needs every anchor for stable offset math — conditionally-mounted sections make the index jump; (b) native find-in-page and "scroll to anything" only work if content is present; (c) at friend-group scale the DOM is small.
2. **Fetch all data queries on workspace mount** — snapshot (already), `useMoney`, and feed. The Overview's hero budget bar and signals *depend* on money (over-budget, unsettled) and feed (recent peek), so deferring those would leave the front page half-blank. Each section still renders its own `Skeleton`/`ErrorState` (existing primitives) until its query resolves, so a slow money fetch never blocks the rail.
3. **Lazy-load only expensive *renderers*, gated by proximity, not by mount:**
   - **MapLibre**: keep the `lazy()` + `Suspense` boundary; boot the map when the ambient companion first enters/near the viewport (it does for Overview/Itinerary at the top, so effectively on load — but the chunk stays off the initial route bundle).
   - **Routing requests (D4, build V2.5)**: travel-time/route-line calls fire **per focused day**, on demand (the day in/near view), cached by ordered-waypoints+mode. Never compute all days' routes up front.
4. **Windowing is reserved for the one unbounded section.** If a trip exceeds a threshold (e.g. > ~25 days or > ~150 rows), virtualize **within the Itinerary section only** (windowed day blocks), keeping anchor stubs for off-screen days so the index still resolves. Everything else stays plain DOM. Two-line rows (F.2) make a big day taller, so this windowing is the safety valve for the density cost — but it stays scoped to Itinerary.

---

## B. Overview / front page — the hero band

### B.1 Purpose
The landing section. It answers, in one glance, **"whose trip is this, when, and how are we doing on money?"** (the identity band), then **"what needs my attention right now?"** (the chips), then offers the freeform group bulletin and a peek at recent activity. Everything actionable here is a **shortcut into a deeper section** — the Overview owns no data of its own except the bulletin.

### B.2 Layout (top → bottom)

```
OVERVIEW
🧭 Overview
┌─ HERO BAND ──────────────────────────────────────────────────────────┐
│  Tokyo with the crew                                    ┌──────────┐  │
│  Thu Oct 1 – Fri Oct 9 · 9 days · Shibuya base          │   12     │  │
│  (S)(M)(T)(P)(R)(K)  6 going                            │ DAYS TO  │  │
│                                                          │   GO     │  │
│  ····················································      └──────────┘  │
│  BUDGET            Planned $1,200 · Actual $1,310 · $110 over          │
│  [██████████████████████████████████████▏marker ]                     │
└──────────────────────────────────────────────────────────────────────┘

[💸 You owe Sam $42  Settle →] [📉 $110 over budget  View →]
[🗳 2 polls to vote  Vote →]  [📍 3 places unplotted  Plot →]      ← chips

📌 GROUP BULLETIN                                            ✎ edit
┌──────────────────────────────────────────────────────────────────────┐
│ Bring passports + JR passes. Day 3 is a big walk — pack comfy shoes.  │
│ (S) edited 2h ago · Sam                                               │
└──────────────────────────────────────────────────────────────────────┘

RECENTLY                                                       See all →
· Maya added "Meiji Jingū" to Day 2 · 10m
· Sam logged $84 group dinner · 1h
```

### B.3 The hero band (the net-new component)
One card (`--surface-card`, `--border-interactive`, `--shadow-raised`, `--radius-card`). Three live regions; **nothing on it is decorative**:

1. **Identity (left of the top row).**
   - **Trip name** — `--font-display`, large (~27px), the dominant element. Inline-editable for editors (reuse `TripNameEditor`: click → input, Enter commits, Esc cancels). Mirrors the top-bar trip name; either entry point edits the same field.
   - **Sub-line** — `Thu Oct 1 – Fri Oct 9 · 9 days · {home-base}`, `--color-muted-foreground`. Date range from the trip; day count derived; home-base label derived from the lodging booking (D3) when present, omitted otherwise.
   - **Member avatars** — the trip's members as an avatar stack (`person-N` tints, existing avatar component) + a "N going" label. Click → jumps to the Group section. This is *who's on the trip*, distinct from the top-bar **presence** stack (who's online right now).
2. **Countdown (right of the top row).** A compact stamp (`--accent-soft` fill, `--border-interactive`, `--shadow-control`): a big number + `DAYS TO GO` label. States, computed from the trip start/end vs. today (wall-clock, trip-local — no timezone math):
   - before start → `N` · `DAYS TO GO`
   - during → `N` · `DAY N OF M` (or `DAYS LEFT`)
   - after end → a calm past-tense label (e.g. `TRIP ENDED` / "wrapped Oct 9") — never a negative countdown.
   - no dates set yet → the countdown is **omitted** (its slot collapses; see empty states).
3. **Budget bar (full-width, below a dotted divider).** The planned-vs-actual readout (D7):
   - **Figures line:** `BUDGET` label + `Planned $X · Actual $Y` (+ `· $Z over` in `--color-danger` when over).
   - **Bar:** a track (`--color-muted`/paper, `--border-interactive`, `--radius-pill`, ~16px tall). Scale the track to `max(planned, actual)`. **Fill width = actual** as a proportion of that scale; **fill color** = `--color-success-soft` (< 90% of planned) → `--color-warning-soft` (≥ 90%) → `--color-danger-soft` (> planned / over). A **2px planned marker** (`--color-foreground`/ink) sits at the planned proportion (at the right edge when under budget; partway when over). It is the **same number that feeds the over-budget chip (B.4 #2) and the Money-section bar (§D.4)** — one source, three surfaces.
   - **Before D7 ships (build V2.6):** there are no estimates, so the budget band renders a quiet placeholder ("Set estimates to forecast the budget") or collapses — the hero degrades gracefully, identity + countdown still carry it.

### B.4 Attention chips (the signals, still visible)
Directly under the hero, a `flex-wrap` row of **attention chips** — `<nav aria-label="Needs attention">` of jump links. Each chip is a pill (`--surface-card`, `--border-interactive`, `--shadow-control`) carrying a **status dot** (the signal's color), an icon, a short lede, and a CTA in the status color. **Render a chip only when it is actionable** (count > 0 / condition true); a cleared signal's chip simply disappears (self-dismissing — no "0 polls" noise).

Priority order (also the render/wrap order, most urgent first):

| # | Signal | Trigger | Token | Chip text | Jumps to |
|---|--------|---------|-------|-----------|----------|
| 1 | **You owe / you're owed** | viewer has a non-zero net balance | `--color-primary` | "You owe Sam $42" · Settle → | Money → settlement |
| 2 | **Over budget** | actual > planned (sum of `estimatedCostMinor`) | `--color-danger` (over) / `--color-warning` (≥90%) | "$110 over budget" · View → | Money → budget |
| 3 | **Open polls** | poll open AND (viewer hasn't voted OR closing < 48h) | `--color-info` | "2 polls to vote" · Vote → | Ideas & Lists → polls |
| 4 | **Unplotted places** | items with `placeName` but no `lat/lng` | `--color-info` | "3 places unplotted" · Plot → | Itinerary (+ map's unplotted chips) |

Notes:
- The chips deliberately **echo, not duplicate**, the hero: #2 (over budget) restates the budget bar as a *jump link* to the Money settlement/budget; the bar shows the magnitude, the chip is the action.
- **Recent changes** is *not* a chip — it lives as the **recent-feed peek** (B.6) and the top-bar feed badge, so the chip row stays purely "things only you can clear."
- Each chip's accessible name includes the count and the action (e.g. "You owe Sam 42 dollars, go to settlement"). Status color is never the sole carrier — every chip has an icon + text (WCAG 1.4.1).
- The chip list is **designed to accept more signals later** (e.g. a D4 "unrealistic travel window" signal) without layout change — chips wrap.

### B.5 Group bulletin
A freeform, editable **pinned note** for the whole group ("Bring passports + JR passes. Day 3 is a big walk — pack comfy shoes."). Plain text only (uploads/rich text out of scope — D6). Implementation: a single trip-scoped `note`-type item pinned to the Overview (reuses the typed-item row + its edit/feed/permissions) — preferred over a bare `trip.bulletin` field so it inherits attribution + feed for free. Editable inline by editors (mirror `TripNameEditor`); read-only for viewers. Shows "edited 2h ago · Sam" (existing recently-edited attribution, PD-5), with the editor's avatar.

### B.6 Recent-feed peek
3–5 latest feed events, compact (dot · text · relative time), with a "See all →" that opens the existing **"What changed" drawer** (the drawer stays the full catch-up surface; the Overview only *peeks*). Reads from the already-loaded feed query.

### B.7 Empty states
- **Individual chip empty** → the chip is omitted.
- **All chips clear** → the chip row collapses to a single calm line: a soft check glyph + "All caught up — nothing needs you right now." (EmptyState primitive, `--color-success` icon). The hero band still renders above it.
- **No dates set** → countdown slot collapses; sub-line shows "Add dates"; the **budget band** also collapses if no estimates.
- **Bulletin empty** → editors see a dashed prompt row "📌 Pin a note for the group" (click to start editing); viewers see nothing.
- **Brand-new trip (no days, ideas, money)** → a welcoming first-run Overview: the hero shows the name (editable) + "Add dates" + a "Let's plan this trip" EmptyState with primary CTAs (Set dates · Add the first idea · Invite the group). Replaces the v1 empty-itinerary card as the front door.

### B.8 Accessibility
- Section is `<section aria-labelledby="overview-h">`. The hero is a labeled region; the budget bar is `role="img"` with an aria-label that states the full figure ("Spending $1,310 of $1,200 planned — $110 over").
- The chip row is `<nav aria-label="Needs attention">` (a list of jump links) so SR users can skim and act.
- Bulletin region is `<section aria-label="Group bulletin">`; the editable control is a labeled textarea on edit.

---

## C. Plan View v2 — the progression rail (two-line comfortable)

The Itinerary section is a stack of **day blocks**. Each day block = a **day header** + a **connected vertical rail** of rows. The rail replaces today's `DayBlock` → `SortableActivityCard` list; the existing `ActivityCard` evolves into a typed **`<ItineraryRow>`** that branches on `item.type`.

### C.1 Day header (first-class day metadata — D2)
```
┌─ Day header ──────────────────────────────────────────────────────────┐
│ ▾  Friday, October 2nd   ·  Day 2   ✎ "Shibuya & Harajuku"  🚶/🚗  ⋯  │
│    (collapse)  (date label)  (n)     (inline subtitle)  (route mode)   │
│    6 stops · ~$120 est                                                 │
└───────────────────────────────────────────────────────────────────────┘
```
- **Date label**: `formatDayLabel` → "Friday, October 2nd" (`--font-display`, ~20px; already shipped). `Day N` secondary, `--color-muted-foreground`.
- **Subtitle (D2)**: inline-editable, dotted-underline affordance with a pencil (click → input, Enter commits, Esc cancels — mirror `TripNameEditor`). Placeholder "Add a subtitle" for editors; omitted if empty for viewers. Independent per-day write (no whole-field LWW — that's why `days` is a table).
- **Route-mode toggle (D4/D2)**: walk/drive segmented pill (on = `--color-foreground` fill), `margin-left:auto`; per-day override of the trip default; drives travel-slot computation. **Hidden until routing (build V2.5).**
- **Day summary** (second line): "N stops · ~$X est" (estimated-cost subtotal from D7; the cost half hidden until D7).
- **Collapse** chevron (existing behavior; defaults to "today + days ahead").
- **Day menu (⋯)**: add stop/note/checklist, set subtitle, set route mode, (later) cover.

### C.2 Row anatomy — the two-line numbered stop
The core row. **Always two lines** (F.2): line 1 is the primary stop line; line 2 always renders (place + meta on the left, vote/comment counts on the right). The full-detail edit path is the dialog (§D.1); inline edits cover the quick changes.

```
   stamp    glyph   title (inline-edit)            cost    time
   ┌────┐
 │ │ 1  │   🍜   Lunch — Ichiran Ramen             $18   12:30pm        ← line 1
 │ └────┘        Shibuya · get there before 12 to skip…      ♥3  💬1    ← line 2 (always)
 │  🚶 8 min · 0.4 mi                  ← travel slot to the next stop (D4)
 │ ┌────┐
 │ │ 2  │   📸   Shibuya Crossing & Hachikō              2:00pm
 │ └────┘        Shibuya · the scramble + Hachikō statue       ♥1
```

Anatomy:
- **Connector spine**: a 2px vertical line (`--ink-faint`, the `--divider` family) at the left gutter threading all rows of the day — this is what makes it read as a *progression*, not a list. Number stamps sit on the spine; the first row's spine starts below its stamp, the last row's spine stops at its stamp.
- **Number stamp**: a 28px square stamp (`--radius-stamp` 6px) filled with the category-soft token, ink number, `--font-display`, `--shadow-pressed`. **This is the number that matches the map pin** (§C.6). Per-day, order-driven (1..N over the day's *numbered* rows). Plotted → solid category-soft fill; **unplotted → hollow** (paper fill, 2px **dashed** `--ink-faint` border, no shadow) to signal "numbered in the plan, but no pin on the map."
- **Category glyph**: the existing `CATEGORY_META` icon, small, tinted with the category token. (For typed rows, the glyph swaps — §D.1.)
- **Title** (line 1): inline-editable (click → text input; commits on blur/Enter), `--font-display`, ellipsis-truncated. Doubles as the **map-select trigger** when plotted (existing `selected`/`onSelect` behavior — `selected` paints a 3px `--accent` offset shadow and rings the matching pin).
- **Cost chip** (line 1, right cluster): optional `estimatedCostMinor` → "$18" as a pill (`--color-success-soft` fill, ink border). Tiered fallback ("~$$") renders muted (`--paper-bright`). Click → inline cost field. **Hidden until D7 (the chip ships in V2.3 as display+inline-edit; budget rollup is V2.6).**
- **Time** (line 1, far right): wall-clock label (`formatTimeRange` → "12:30pm", "9am – 1pm", "until 5pm"), `--color-muted-foreground`. Click → a small time popover (start/end). "all day" tag when flagged all-day; nothing when untimed.
- **Line 2 — place + meta (always present):**
  - **left, `place-line`** (ellipsis): `placeName` (bold ink) · notes hint (italic, `--color-muted-foreground`). When there is neither place nor note (rare), the line still reserves its height for rhythm, or shows a quiet "Add a place" affordance for editors.
  - **right, `foot`** (`margin-left:auto`): the **vote/comment counts inline** — ♥ count (heart in `--color-primary`) and 💬 count — collapsed from `ActivityFooter`. Clicking expands the full footer (voter avatars + comment stream) beneath the row.
  - For an **unplotted** stop, line 2 carries the explanatory note: "Not located yet — pick a spot to plot it."
- **States**: reuse existing — `flash` outline on remote edit (PD-5), `editingBy` "✦ Sam is editing…" hint, `selected` ring synced to the map. Hover/focus reveals the **drag handle** (`⠿`) and **row menu** (`⋯` → Edit details opens the full `ActivityFormDialog`; Log as expense; Move to day; Remove); essential actions are also in the menu so nothing is hover-*only*.

> **Density (F.2):** two lines is the *fixed* anatomy — every stop shows its place + meta, no adaptive collapse. The footer's full expansion (voter avatars + comments) is the only progressive-disclosure step. A 12-stop day is taller than a single-line rail would be; the index day-nav (§A.3) and Itinerary windowing (§A.4) absorb that.

### C.3 Travel slot (between consecutive stops — D4)
A thin connector segment on the spine carrying the **mode glyph + travel time (+ optional distance)** from the routing engine (Valhalla-class, per-day mode), between two consecutive *plotted* stops.
```
 │  🚶 8 min · 0.4 mi      (walk, per-day route mode)
 │  🚗 22 min              (drive)
 │  · · ·                  (no route available — see degradation)
```
- Muted text (`--color-muted-foreground`), small glyph; min-height ~26px in the two-line rhythm.
- Loading → a subtle shimmer on the segment (Skeleton-tinted) while the route resolves; never blocks the rows.
- **Hidden until routing (build V2.5)**; before then the spine is a plain connector with no slot text.

### C.4 Home-base anchor rows (derived from bookings — D3)
Each day's rail is **bookended by derived anchor rows** computed from the lodging/flight bookings (not stored, not hand-placed, not reorderable, not numbered):
```
 🏨  Shibuya Stream Hotel — start of day            BOOKING   (anchor, derived)
 │   🚶 6 min
 1   Lunch — Ichiran Ramen …
     … (the day's numbered stops + inline rows) …
 6   Dinner — izakaya (TBD) …
 │   · · ·
 🏨  Shibuya Stream Hotel — end of day              BOOKING   (derived)
```
- Anchors are visually distinct: a round anchor-mark (lodging `--cat-lodging` / flight `--color-info` glyph, ink border) on the spine + a muted body (`--paper-bright`, 2px dashed `--ink-faint`), **no number stamp**, **no drag handle**, **read-only in the rail** (edit via the booking record, §D.3). A right-aligned `BOOKING` tag.
- They supply the **route endpoints** so each day routes start→…→end automatically (the whole point of D3).
- Derived **booking entries** (hotel check-in/out at their wall-clock times; flight depart/arrive) appear as special timed rows with the booking glyph — also derived/read-in-rail, edited via the booking.
- **First day:** no "start" hotel anchor before check-in (the flight-arrival anchor bookends instead); **last day:** no "end" anchor after check-out. Derivation rules are PD-14's (`start` for `[check-in+1 … check-out]`, `end` for `[check-in … check-out−1]`).

### C.5 Inline day notes & checklists (D1/D2)
Day-level `note`/`checklist` items render **inline in the rail** as un-numbered rows (they're not map stops), on the spine with a soft-tinted anchor-mark:
- **Note row**: 📝 glyph (`--info-soft` mark), quote-styled body (italic, left `--ink-faint` rule), inline-editable. Participates in order; can be voted/commented.
- **Checklist row**: ☑ glyph (`--success-soft` mark), title (`--font-display`) + "n/m" progress pill + a compact checkable list (`text` + `done`); checks are real `<input type="checkbox">` mutations; done items strike through (`--color-muted-foreground`).
- A **day-pinned note** (D2's "pinned day-note") may later sit just under the day header rather than in the row flow — V2.1 ships inline rows now; the pinned slot is reserved.

### C.6 Numbering synced to the map pins
- The rail numbers each **numbered row** (stops; anchors/notes/checklists are unnumbered) **1..N per day in display order**.
- The map's `pins` layer (today a plain `circle`) becomes a **`symbol` layer** rendering the stop number (`text-field`) over a category-tinted marker. The same number appears in the rail stamp and on the pin.
- Numbers are a **subset on the map**: an unplotted stop keeps its rail number (hollow stamp) but has no pin — so a missing pin number reads as "this stop isn't located yet," reinforcing the unplotted signal rather than renumbering the map out of sync with the rail. The map's unplotted strip names them ("1 not on the map · ⑥ Dinner izakaya").
- Numbers **renumber live** during drag-reorder and on add/remove; the map updates from the same source order.
- Per-day numbering resets each day (Day 2 starts at 1 again), matching the per-day rail and the existing per-day map filter/focus.

### C.7 Graceful degradation (the reason it's a rail, not a clock-grid)
Because the rail is **order-driven**, these all "just work" with no special-casing:

| Case | Rail behavior |
|------|---------------|
| **Untimed** item | No time label on line 1; still numbered by order; travel slots still compute if plotted. Line 2 still shows place + meta. |
| **All-day** item | "all day" tag instead of a time; normal numbered two-line row. |
| **Overlapping** items (two at 2pm) | Two consecutive rows in author/position order; *optional* subtle "overlaps ②" hint later; **no clock collision, no stacking math.** |
| **Unplotted** stop (place, no coords) | Numbered, **hollow** stamp, no pin; line 2 carries the "Not located yet…" note; travel slots to/from it are skipped → spine shows a `· · ·` gap, not a fake time. |
| **Ideas-pool** (undated) item | **Not in the rail at all** — lives in Ideas & Lists (§D.5). The rail is dated days only. |
| **Empty day** | One thin row "Friday, May 1st · nothing planned" (existing compact empty-day treatment), still a drop target; dimmed in the index. |

### C.8 Drag-to-reorder in a rail
- Keep dnd-kit (`PointerSensor`/`TouchSensor`/`KeyboardSensor`, `verticalListSortingStrategy`) and fractional indexing (`positionBetween`) — all already in place.
- **Reading the reorder:** as a row is dragged, the **number stamps renumber in real time** (the dragged row previews its prospective number; the others shift) and the connector spine restitches — so the gesture reads as "resequence the route," not "move a card." On drop, travel slots recompute for the two affected gaps only.
- **Cross-day drag** still works (drop into another day's rail → `activity.move` with the new date+position).
- **Anchors/derived rows are not draggable** (computed); the sortable set is the day's real items only.
- **Keyboard:** retain `KeyboardSensor` + `sortableKeyboardCoordinates`; each draggable row exposes an accessible grab handle with dnd-kit announcements.
- **No drop animation** (keep `dropAnimation={null}` to avoid the snap-back glitch under optimistic `activity.move`).

### C.9 Accessibility (rail)
- Each day rail is an ordered list (`<ol>`); numbered stops carry their visible number in the accessible name ("Stop 2, Shibuya Crossing & Hachikō, 2pm").
- Travel slots are informative but not focusable: `<li aria-label="8 minute walk to the next stop">`.
- Inline-edit triggers are real buttons/inputs with labels; the full-detail path (`ActivityFormDialog`) remains for anything not inline-editable, so nothing is *only* reachable by a fine gesture.
- Checklist items are real checkboxes with labels; progress announced.
- Contrast: number-stamp ink-on-category-soft and muted travel text must clear WCAG AA 4.5:1 — the warm/dusk `--ink-soft` were already darkened for exactly this; verify the category-soft fills the same way.

---

## D. How the new item kinds surface here

All of these reuse the **same activity row** (votes/comments/feed/sync/permissions) per D1 — the `type` discriminator only swaps the **glyph + body renderer** and which inline fields show. Visuals align to the two-line rail (§C) and the hero overview (§B).

### D.1 Typed items (D1) — note / checklist / flight / lodging
| Type | Glyph | Body renderer | Numbered? | Inline fields |
|------|-------|---------------|-----------|---------------|
| `activity` | category icon | two-line stop (title + place/notes + foot) | ✅ stop | time, cost, place |
| `note` | 📝 | quote-styled body text | ❌ | body text |
| `checklist` | ☑ | title + checkable items + "n/m" | ❌ | item text, done toggles |
| `flight` | ✈️ | derived depart/arrive entries + anchors | ❌ (derived) | via booking form |
| `lodging` | 🏨 | derived check-in/out entries + day anchors | ❌ (derived) | via booking form |

- The "Add" control on a day (and the day menu) offers **Add stop / Add note / Add checklist**; flight/lodging are added through the **Bookings strip** (§D.3), not as freehand rows.
- Item creation/editing keeps a **single `ActivityFormDialog`** that adapts its fields to the chosen `type` (a type selector at the top; per-type fields below). Inline edits handle the common quick changes; the dialog handles type, place search, and per-type detail.

### D.2 First-class day metadata (D2)
Surfaced entirely in the **day header** (§C.1): inline subtitle, per-day route mode, day summary. Backed by the lazily-created `days` row keyed `(tripId, date)`; a day with no metadata simply has no row (the calendar is still derived from the trip range via `deriveDays`).

### D.3 Bookings — derived entries + anchors (D3)
A **Bookings strip** sits at the head of the Itinerary section (before Day 1):
```
ITINERARY
┌─ Bookings ───────────────────────────────────────────── + Flight  + Hotel ┐
│ ✈️  Outbound — JFK→HND  Oct 1, 11:05am → Oct 2, 3:40pm                  ⋯ │
│ 🏨  Shibuya Stream Hotel · check-in Oct 2 3pm → check-out Oct 6 11am    ⋯ │
│ 🏨  Ryokan               · check-in Oct 6 4pm → check-out Oct 9 10am    ⋯ │
│ ✈️  Return — HND→JFK  Oct 9, 6:20pm → Oct 9, 6:50pm                     ⋯ │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Enter once** (D3): hotel = place + check-in date/time + check-out date/time; flight = depart place/time + arrive place/time. **Wall-clock** times (D11), displayed verbatim.
- From each booking the app **derives** (not stored): the per-day **anchor rows** (§C.4) and the **booking entries** (check-in/out, depart/arrive) that drop into the right days at their times. Multi-day flights "just work" because arrival is a later date.
- Editing a booking re-derives its anchors/entries everywhere; the strip is the single edit surface (rail anchors are read-only).
- Booking forms reuse the place-search field from `ActivityFormDialog` and the date controls; the strip itself is a light list (`cv-card` rows). The hotel's place also feeds the hero sub-line's home-base label (§B.3).

### D.4 Per-activity cost + budget readout (D7)
- **On the row**: the cost chip (§C.2) — `estimatedCostMinor`, inline-editable, tiered fallback allowed. **Ships in V2.3** (display + inline edit); the rollup that powers budgets is V2.6.
- **Convert-to-expense**: row menu "Log as expense" opens the existing `ExpenseFormDialog` prefilled (amount = estimate, title, `expense.activityId` link) — the bridge from *planning* cost to *settled* expense.
- **Budget readout** lives in **two places, one source**:
  - the **hero band budget bar** (§B.3) on the Overview;
  - the **Money section header** bar (below), unchanged in math:
```
MONEY                                                        Budget
┌──────────────────────────────────────────────────────────────────────┐
│ Planned  $1,200   ████████████████░░░░   Actual $890  (74%)           │
│ (sum of estimates)                        (sum of expenses)            │
└──────────────────────────────────────────────────────────────────────┘
```
  Over → bar turns `--color-danger`; ≥90% → `--color-warning`. The same numbers feed the hero bar and the over-budget chip (B.4 #2). The existing settlement/per-person/per-category blocks (`ExpensesPanel`) stay below it unchanged.

### D.5 Idea lists (D10) on the Ideas & Lists section
The "Decide" section becomes **Ideas & Lists**:
```
IDEAS & LISTS                                            + List   + Idea
┌─ Food ▾ ──────────────────────────── 5 ─┐  ┌─ Day trips ▾ ──────── 2 ─┐
│  [ActivityCard]  ♥4  💬1  · Most wanted │  │  [ActivityCard] ♥2      │
│  [ActivityCard]  ♥2                     │  │  [ActivityCard]         │
└─────────────────────────────────────────┘  └─────────────────────────┘
┌─ Activities ▾ ──────────────────────── 3 ┐  ┌─ Unlisted ▾ ────────── 4 ┐
│  …                                       │  │  …                       │
└──────────────────────────────────────────┘  └──────────────────────────┘

POLLS                                                            + Poll
┌──────────────────────────────────────────────────────────────────────┐
│  Which week works?  ·  open · closes Sat   [PollCard]                  │
└──────────────────────────────────────────────────────────────────────┘
```
- **Lists** (D10): user-defined, reorderable, **one per idea**, mixed types. Each list is a collapsible group of `ActivityCard`s, vote-sorted within the list (reuse `IdeasPanel`'s sort + "Most wanted" badge). An **Unlisted** bucket holds ideas with no `listId`.
- **Assign/move**: drag an idea between lists (dnd-kit), or the card menu → "Move to list." New list via "+ List" (name + position).
- **Polls** (PD-3) sit below the lists in the same section (today's `PollsPanel`), unchanged. The open-polls signal here feeds the Overview chip (B.4 #3).
- Ideas are still *undated items*; promoting one to the itinerary = giving it a date (PD-2), which moves it out of the lists and into a day rail.

---

## E. Token/style adherence + build decomposition

### E.1 Token mapping — everything composes from the existing contract
Every new surface maps to existing semantic tokens (TD-10/11). No raw hues, no literal borders/shadows.

| New surface | Tokens used (existing) |
|-------------|------------------------|
| Index rail active/inactive | active: `--surface-card` + `--border-interactive` + `--shadow-control`; inactive: `--color-muted-foreground` → `hover:--color-foreground`; empty day `opacity-55`; count badge `--accent-soft` fill + ink border (the exact Rail/DayRail grammar today) |
| Canvas section headings | `--font-display`, `--color-foreground`; glyph-badge = `--surface-card` + `--border-interactive` + `--shadow-control` |
| Connector spine / travel slot | `--ink-faint` (the `--divider` family) via a `.cv-divider`-style border |
| Number stamp | fill = `--cat-*-soft`; ink = `--color-foreground`; `--radius-stamp`; `--shadow-pressed`; hollow variant = paper fill + 2px dashed `--ink-faint` |
| Two-line stop / typed rows | `cv-card`/`cv-control` recipes (`--border-interactive`, `--shadow-control`, `--radius-control`); category tokens for glyphs; cost chip `--color-success-soft`; foot counts `--color-muted-foreground`, heart `--color-primary` |
| Anchor rows | `--cat-lodging` / `--color-info` glyphs; `--paper-bright` body, dashed `--ink-faint` border |
| **Hero band — identity** | `--surface-card` + `--border-interactive` + `--shadow-raised` + `--radius-card`; name `--font-display`; sub-line `--color-muted-foreground`; avatars = existing `person-N` tints |
| **Hero band — countdown** | `--accent-soft` fill + `--border-interactive` + `--shadow-control` + `--radius-control`; number `--font-display`; label uppercase `--color-muted-foreground` |
| **Hero band — budget bar** | track `--color-muted` + `--border-interactive` + `--radius-pill`; fill `--color-success-soft` → `--color-warning-soft` → `--color-danger-soft`; planned marker `--color-foreground`; over-figure `--color-danger` |
| Attention chips | pill `--surface-card` + `--border-interactive` + `--shadow-control` + `--radius-pill`; status dot/CTA per signal `--color-primary/danger/warning/info`; text `--font-display` |
| Bulletin | `cv-card`; inline edit mirrors `Input`/`Textarea` primitives |
| Money budget bar | same fill/track tokens as the hero bar (one component, two mounts) |
| Map numbered pins | category tint via the same `--cat-*` values used for stamps, passed to the `symbol` layer |

**NEW tokens needed: none required.** The hero band's budget bar, countdown, and chips and the two-line rail all compose from the existing semantic contract (enumerated above) — the budget-bar fill-state mapping (`success-soft / warning-soft / danger-soft`) is a small component-level conditional, **not** a new token. Two **optional** additive readability aliases the owner may approve or skip (each is purely a rename of an existing value — it sets no new value and stays in the semantic layer of `index.css`, never in a style-pack or color-theme file, per TD-11):
1. `--rail-connector: var(--ink-faint)` — so the spine/travel-slot code reads clearly.
2. `--budget-track: var(--color-muted)` (+ optionally `--budget-over: var(--color-danger-soft)` etc.) — so the planned-vs-actual bar reads clearly across its two mounts (hero + Money).

**Map-pin caveat (one real implementation note, build V2.3):** the map currently paints pins with **raw hex** in the MapLibre paint spec (`"circle-color": "#c05621"`, cluster `#7c6b58`, stroke `#fffbf1`). MapLibre paint can't read CSS custom properties, so numbered, category-tinted pins must read the *resolved* token values in JS (e.g. `getComputedStyle` on a probe element, or a small JS token map) and feed them to the `symbol`/`circle` layers — and **re-read on theme change**. This is the one place the token contract needs a JS bridge; budget it in the V2.3 build so pins re-tint with the active theme like everything else.

### E.2 Desktop-first — what this spec is *not* designing
**Designed:** the three-column desktop frame, the index rail, the two-line rail rows, the hero Overview, all hover/inline-edit affordances at pointer scale.

**Deferred to a separate mobile review (NOT designed here):**
- How the three columns collapse — the index becomes a different surface (a jump menu / bottom sheet, not a 240px sidebar); the ambient map becomes a toggle/tab, not a persistent companion.
- Touch ergonomics of inline editing, the cost/time popovers, and drag (the `TouchSensor` exists but thumb-scale targets, long-press affordances, and reorder-vs-scroll disambiguation need their own pass). The two-line row's larger targets (F.2) are a head start.
- Bottom-nav vs. index reconciliation (today's `BottomNav` overlaps the new index concept).

**Guard-rails so we don't paint mobile into a corner:**
1. Keep the **index a standalone component** with its own data (sections + days + active id) so it can re-host as a sheet without touching the canvas.
2. Keep the **map a togglable companion**, never load-bearing for content (all stop info lives in the two-line rail; the map is ambient).
3. Keep every **inline edit also reachable via the full dialog**, so a coarse pointer is never stuck.
4. Keep **essential actions out of hover-only** (the row menu exposes them too).

### E.3 Build decomposition (mapped to plan phases)
This spec **gates the V2.2 data-model foundation** and the V2.3+ builds. The two phases this spec most directly defines are the **bookends** — V2.3 (the rail, built inside today's shell) and V2.7 (the shell that wraps it). The intervening phases (bookings, routing, money) fill in the rail's later affordances.

| Plan phase | Builds (from this spec) | Depends on |
|------------|-------------------------|-----------|
| **V2.2 — data foundation** | `type` discriminator, `days` table, `IdeaList`, `estimatedCostMinor` — schema + mutations + sync | — |
| **V2.3 — Plan View v2 (D5)** ← *built inside today's tabbed shell* | progression **rail**; **two-line `<ItineraryRow>`** (typed glyph/body + always-on line 2 + inline foot); **number stamps + numbered map pins** (symbol layer + JS token bridge); inline edit (title/time/**cost chip**); **day header** (subtitle D2, day summary, day meta); inline **note/checklist** rows (D1); idea **lists** on Ideas & Lists (D10); **drag-reorder-as-resequence** | V2.2 |
| **V2.4 — Bookings + anchors (D3)** | Bookings strip; booking forms; derived anchor rows + booking entries in the rail | V2.2/V2.3 |
| **V2.5 — Routing (D4)** | travel slots (mode glyph + time/distance); per-day route mode in the day header; route lines on the map | V2.4 (anchors = endpoints) |
| **V2.6 — Money (D7)** | cost chip → convert-to-expense; planned-vs-actual budget **rollup**; the budget bar's numbers; Overview budget/unsettled chips light up | V2.2 |
| **V2.7 — Workspace shell (D9)** ← *wraps everything above* | **three-column frame**; **left index rail + synced scrollspy** (sections + nested days, "you are here", jump, quick-jumps); **hero Overview** (identity band + countdown + budget bar + attention chips + bulletin + recent-feed peek); **mount/lazy strategy** (§A.4 / F.4); the rail becomes a section within the canvas; map persistence rule (Overview+Itinerary, release below); retire the tab rail + in-board day-jump rail | all above (it wraps them) |

> **Sequencing reality:** the **rail is built first (V2.3) inside today's tabbed shell**, then **absorbed into the continuous canvas (V2.7)**. So §C is buildable before §A/§B land. The hero Overview's full content fills in as D3/D4/D7 ship — the budget bar and over-budget chip light up at V2.6, the home-base sub-line at V2.4 — and it **degrades gracefully** before then (§B.7).

---

## Implementation Handoff Notes
- **Retire on V2.7:** today's `Rail` + `BottomNav` (mobile defers), the in-`ItineraryBoard` sticky `DayRail`, and the `View` switch in `TripWorkspace`. The feed **drawer** stays as the "What changed" catch-up surface (the Overview only *peeks*).
- **Reuse, don't reinvent:** `ActivityCard` → two-line `<ItineraryRow>` (branch on `type`); `ActivityFooter` collapsed to the inline foot, expandable; `ActivityFormDialog` gains a type selector + per-type fields; `TripNameEditor` pattern for the hero name + day subtitle; `EmptyState`/`Skeleton`/`ErrorState` for every section's empty/loading/error; `useMapSelection`/`useFocusedDay` for rail↔pin sync; `useMoney` for the budget bar/settlement; `formatDayLabel`/`formatTimeRange`/`formatMoney` as-is.
- **Map pins:** convert the `pins` layer `circle` → `symbol` with `text-field` = stop number; tint by category via the **JS token bridge** (MapLibre paint can't read CSS vars), re-read on theme change. Keep existing clustering, per-day filter, unplotted strip.
- **Scroll container:** the canvas is the single scroll region (`overflow-y-auto`), not `window`; the IntersectionObserver `root` is that container; anchors use `scroll-mt` to clear the sticky top bar.
- **z-index/overflow:** sticky index + sticky map are siblings of the scroll container (not inside it); the top bar stays above both; popovers/menus (Radix) and the feed drawer keep their existing `z-50`.
- **Motion:** smooth-scroll jumps honor `prefers-reduced-motion`; row reorder uses no drop animation; travel-slot loading is a token-tinted shimmer; the map's release/persist transition is a brief fade/slide that also honors reduced-motion.
- **a11y focus:** on index jump, move focus to the target heading (`tabindex=-1`); keep the feed-drawer focus trap; numbered rows expose their number in the accessible name; checklist items are real checkboxes; the budget bar is `role="img"` with a full-figure label.
- **Assets:** no new fonts/icons beyond `lucide-react` (booking/anchor/list glyphs all exist: `Plane`, `BedDouble`, `ListChecks`, `StickyNote`, `Footprints`/`Car`, etc.). No images (D6 deferred — no hero image, no attachments).
