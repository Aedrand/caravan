# Trip Workspace v2 — design brief

**Status:** DESIGN / owner-ratified direction (decisions made with the owner in a
2026-06-28 walkthrough). Not yet broken into `plan.md` milestones, and the
formal decision-log deltas in §7 are **not yet applied** to `docs/decisions.md`.

**Provenance:** triage of the owner's 2026-06-28 manual-testing notes
(`docs/enhancements.md`). All 21 notes are accounted for here — each maps to a
decision below, a build phase (§8), or a deliberate defer / out-of-scope (§6).

**Posture:** there is **no release timeline**; we are architecting for quality
and correctness first, not for a minimal slice (see memory
`caravan-architect-for-quality`). Where a *simple* behaviour is the *correct*
model (e.g. wall-clock times), we keep it — but with an extensible schema.

---

## 1. The through-line

The 21 notes aren't 21 unrelated tweaks. They share one direction: **evolve the
planning surface from rigid activity-CRUD into a flexible, continuous "trip
canvas."** Concretely that means typed freeform items, first-class days,
bookings that anchor each day, in-app auto-routing with real travel times, and a
single continuously-scrolling workspace with a synced index and an overview at
the head. Everything below serves that arc.

---

## 2. Decisions

Each decision has a stable label (D1…D11) used by the build plan (§8) and the
decision-log deltas (§7).

### D1 — Item model: one row, typed discriminator
Add a `type` discriminator to the existing activity/item entity
(`activity | note | checklist | flight | lodging`; `image` later). Per-type
optional fields. **Reuses** the row's existing voting / comments / attributed
feed / real-time sync / fractional-index positioning / role permissions, and
keeps ideas ↔ itinerary unified (an idea is still just an undated item).
- **Now:** `note` + `checklist`. **Deferred:** `image` (needs the upload
  subsystem, D6). `flight` / `lodging` are bookings (D3).
- **Rejected:** separate entities per type (re-implements all the collaborative
  machinery per type); a generic JSON-content blob (loses the queryable
  `lat/lng` the map needs).
- **Source notes:** "notes in a day independent of an activity"; "ideas more
  freeform (note / checklist / image)".

### D2 — Days are first-class
Introduce a `days` table keyed by `(tripId, date)` holding per-day metadata
(subtitle now; room for cover image / pinned day-note / per-day route mode
later). Rows created **lazily** (only days that carry metadata); the calendar is
still drawn by derivation from the trip's date range. Each day edits
independently — no whole-field last-write-wins clobber.
- **Rejected:** a `daySubtitles` JSON map on the trip (concurrent edits to
  different days clobber each other — cuts against real-time collab).
- **Note:** "Friday, May 1st" date labels are a free formatting change and don't
  depend on this table.
- **Source notes:** "customizable day subtitles"; "label days as a date, not
  Day 1".

### D3 — Bookings: enter-once, derive entries + day anchors
Flights and hotels are item types (D1) entered **once**, from which the app
**derives** both timeline entries and each day's home-base location.
- **Hotel (`lodging`):** entered as place + check-in date/time + check-out
  date/time. Derives: a **Check-in** entry on the arrival day at check-in time
  and a **Check-out** entry on the departure day at check-out time; plus per-day
  **anchors** — every day **starts** at the hotel for `[check-in+1 … check-out]`
  and **ends** at the hotel for `[check-in … check-out−1]` (you wake there every
  morning after the first night; you sleep there every night except the last).
- **Flight (`flight`):** entered as depart place/time + arrive place/time.
  Derives entries on the departure day (at departure) and, when arrival is a
  later date, the arrival day (at arrival); flights also serve as the
  arrival/departure anchors that bookend the hotel chain.
- **Times are wall-clock** (D11): you enter the time printed on the
  ticket/confirmation; we display it verbatim. Multi-day flights "just work"
  because the arrival date is a later day. **No timezone machinery** — but store
  as `enteredLocalTime + place` so the schema is timezone-*ready*.
- **Purpose:** the anchors give every day a known start/end point so daily
  **routes** (D4) build automatically without re-entering where each day begins
  and ends.
- **Source notes:** "separate entry for flights and hotel bookings, synced to
  the relevant days".

### D4 — Real routing, now
Draw each day's route with a **real routing engine** (actual paths + travel
times), not crow-flies lines.
- **Architecture:** a routing proxy mirroring the existing geo proxy
  (`core/geo.ts`) — defaults to a **keyless public instance**, stays
  **provider-configurable** (self-host or keyed), and **caches** routes by the
  ordered waypoint set + mode. Same "works keyless, upgrade if you want" posture
  as geocoding (and the same no-SLA caveat on the default, TD-5).
- **Engine:** **multi-modal** (one dataset does walk + drive), i.e.
  Valhalla-class — not single-profile OSRM.
- **Mode:** a trip-level default mode (walk/drive) with a **per-day override**
  (stored on the `days` table, D2).
- **Feeds:** travel-time labels between stops on the day rail (D5); later, gap /
  unrealistic-window detection.
- **Out of reach:** schedule-based public-transit routing (needs a separate GTFS
  engine) — explicitly not in scope.
- **Source notes:** "route lines on the map"; "distance + directions between
  consecutive stops".

### D5 — Plan View v2: a connected progression rail
The plan view becomes an **order-driven vertical rail**, not today's chunky card
stack and not a clock-grid: `🏨 start → ① stop → (🚶 22 min) → ② stop → … → 🏨
end`, with compact rows, inline editing, per-stop **numbering synced to the map
pins**, **travel-times** between stops (D4), day **home-base anchors** (D3), and
day-level **notes/checklists** (D1) inline. Because it's driven by order, it
degrades gracefully for untimed / overlapping / all-day items.
- **Rejected:** a true clock-grid timeline (rigid; untimed/overlapping/all-day
  become edge-case swamps; fights drag-to-reorder).
- **Absorbs these notes wholesale:** compact cards; inline editing; "added by"
  tags; per-stop numbering; vertical-timeline / progression. To be **specced
  with the design agent** before building.

### D6 — File/image storage: documented, deferred
Target architecture when we build it: a storage interface defaulting to the
**local filesystem** on the data volume (next to the SQLite DB + `secret_key`),
with **optional S3/MinIO**, and server-side **image processing** (resize,
re-encode, strip EXIF, cap size). Build the **image pipeline first** (hero +
image-ideas), arbitrary **file attachments** (size quotas + malware-scan story)
later on the same backend.
- **Deferred** for now (most complexity for least core value). This parks: trip
  **hero image**, **image-type ideas** (D1), and **file attachments on
  activities**.
- **Backup caveat to document:** Litestream (D.4) replicates the SQLite DB, not
  a files directory — the uploads dir must join the host's backup routine. (If
  unified backup ever matters more than DB size, revisit "small images as SQLite
  BLOBs.")
- **Source notes:** "attach files to activities"; "customizable hero image";
  the image arm of "freeform ideas".

### D7 — Activity cost: estimate + convert-to-expense
Items carry a per-activity **estimated cost** (a planning/budget figure,
distinct from a logged expense), and there is a flow to **convert an estimate
into a real split expense** when money actually changes hands. The trip gets a
**budget forecast**: planned (sum of estimates) vs. actual (sum of expenses).
- **Why not display-only:** summing linked expenses conflates planning with
  settlement and forces a full split-expense just to note a price. Planned cost
  and actual expense are genuinely different things.
- **Reuses:** expenses already link to an item (`expense.activityId`); single
  currency per trip (existing money model).
- **Feeds:** the overview's "what needs attention" (e.g. *over budget*).
- **Source note:** "add cost to activities".

### D8 — Place-name language: instance default `en`, keyless
Pass a configurable geocoding **language (default `en`)** to the providers —
verified that Photon's keyless `lang=en` returns Latin/English OSM names where
they exist (`金龍山 浅草寺` → `Sensō-ji, Tokyo`; Fushimi Inari → `Fushimi Inari
Shrine, Kyoto`). Apply to forward + reverse and to the keyed providers'
language params.
- **No provider switch, no Google, no translation pipeline** — the current proxy
  simply doesn't send `lang` today.
- **Honest limit:** Photon's `lang` covers `en/de/fr` and only returns English
  where OSM has a `name:en` tag; obscure spots stay local (user-editable). The
  keyed providers (Geoapify/LocationIQ, already wired) cover more languages for
  hosts who want it.
- **Set by:** the deployment (instance default), not per-user. **Full UI
  localization is out of scope** (§6).
- **Also improves** the pending Japan geocode — geocode with `lang=en` so stored
  names are Latin from the start.
- **Source note:** "Google Maps API or translation for foreign place names".

### D9 — Workspace shell: one continuous scroll + synced index + overview
The trip workspace becomes **one continuously-scrolling canvas**: you scroll
from the overview down through Itinerary (the days) → Ideas/Lists → Money →
Group as a single document, with a **synced index** (table-of-contents /
scrollspy) that highlights where you are and lets you jump. The current vertical
tab rail **and** the day-jump rail unify into this one index. The **overview /
front page** ("what needs attention" — open polls, unsettled expenses, unplotted
places, over-budget, recent feed — plus a freeform bulletin) sits at the head.
- **Absorbs two notes into one surface:** the trip "overview / front page" and
  "infinite scroll between tabs" (which meant *vertical* continuous scroll, not
  horizontal swipe).
- **Scope:** **desktop-first**; **mobile is its own design review later** — do
  not build mobile gestures now. To be **specced with the design agent**
  together with D5 (same surface).
- **Impl note for the spec:** continuous scroll means deciding mount/lazy-load
  of sections (the feed, expenses, ideas all live) — a real perf choice handled
  in design.
- **House-style:** describe this in our own terms; **do not name competitors**
  in product or docs (clean-room posture, per PROJECT.md).

### D10 — Idea lists: first-class, one per idea
User-creatable, reorderable trip-level **lists** (e.g. Food / Activities / Day
Trips) to organize the idea inbox — looser than the fixed categories. Each idea
is assigned to at most **one** list; lists hold **mixed** idea types
(activity / note / checklist). Distinct from itinerary days (days group *dated*
items; lists group the *idea inbox*).
- **Rejected:** multi-list membership (M2M + dedup everywhere, for a marginal
  case — extensible later); making the shared type-tint categories editable
  (messy double-duty with the itinerary).
- **Source note:** "ideas freeform sections/lists".

### D11 — Wall-clock times (affirmed)
Booking and activity times are entered and displayed as **wall-clock** local
times (the number on the ticket), stored as `enteredLocalTime + place` so the
schema is timezone-ready without timezone machinery. Re-examined under the
quality lens and kept — it's the *correct* model, not a shortcut. True
timezone-aware datetimes remain a clean future extension.

---

## 3. Resolved with no separate work

- **Day-bar UI bug** ("days top bar"): the per-day top bar is **replaced** by the
  workspace shell + synced index (D9), so there's nothing to fix in isolation —
  verify it's gone when v2 lands.
- **Map day-layer toggle** (show/hide a given day's pins): a small, independent
  map win — each pin already carries its `date`; add a filter expression + a
  toggle control. Folded in as a quick win.

---

## 4. Data model (design-level)

Refined during build; names align with the current schema where known.

- **Item** (today's `activity` entity):
  - `type: 'activity' | 'note' | 'checklist' | 'flight' | 'lodging'` (+ `image`
    later). Keep `title`, `date?`, `startTime?`, `endTime?`, `category`,
    `placeName?`, `address?`, `lat?`, `lng?`, `notes?`, `linkUrl?`, `position`,
    `createdBy`.
  - Per-type: `note` → body text; `checklist` → `items: {text, done}[]`;
    `lodging` → check-in/out date+time + place; `flight` → depart/arrive
    place + date/time. Booking times are wall-clock (D11).
  - `estimatedCostMinor?` (D7); optional link to the converted `expense`.
  - `listId?` → idea list (D10).
- **Day** (new, D2): `(tripId, date)` + `subtitle?` + `routeMode?` (D4) + room
  to grow (cover, pinned note). Lazy-created.
- **IdeaList** (new, D10): `id, tripId, name, position, createdBy`.
- **Routing:** route cache keyed by ordered waypoints + mode (no first-class
  entity required); `trip.defaultRouteMode`; `day.routeMode` override.
- **Budget:** `item.estimatedCostMinor` rolls up to a planned total; existing
  `expense` rolls up to actual; convert links the two.
- **Geocoding:** instance config `geocodingLanguage` (default `en`), passed to
  providers forward + reverse (D8).

Derived (not stored): bookend booking entries and per-day start/end anchors
(D3) are computed from the booking items, not persisted as separate rows.

---

## 5. Out-of-scope / deferred

- **Upload subsystem** (D6) → hero image, image-ideas, file attachments —
  deferred; local-FS+S3 architecture recorded for when we build it.
- **Full UI localization / i18n** — out of scope (a whole separate effort);
  geocoding language (D8) is the only localization we take on.
- **Mobile UX** — its own design review later; no mobile gestures now (D9).
- **Public-transit routing** (GTFS/OpenTripPlanner) — out of scope (D4).
- **Multi-list idea membership** (D10), **true timezone handling** (D11),
  **clock-grid timeline** (D5) — explicitly not now; clean future extensions.

---

## 6. Decision-log deltas (to apply to `docs/decisions.md`)

These **amend ratified decisions** and should be recorded as new dated entries
with SUPERSEDED links, per the log's discipline. **Not yet applied** — pending
owner go-ahead.

- **PD-1** ("days are *derived*; there is no Day entity"; "hybrid block-document
  … rejected for v1") → **amended** by **D2** (first-class `days` table for
  per-day metadata) and **D1** (typed freeform items: note/checklist). The
  structured-records core of PD-1 still holds; the "no Day entity" and "no richer
  day content" clauses are superseded.
- **PD-2** ("an activity is either Ideas-pool or itinerary; idea = undated
  activity") → **extended** by **D1** (idea can also be a note/checklist) and
  **D10** (idea lists). The undated-vs-dated spine is preserved.
- **Booking posture** ("link-outs are the only booking story", noted on the
  activity schema / PROJECT.md §7) → **superseded** by **D3** (first-class
  flight/lodging bookings with derived entries + anchors). Link-outs remain for
  *external* booking sites; in-app booking *records* are now in scope.
- **TD-5 / maps** (`docs/maps-and-places.md`, keyless Photon) → **extended** by
  **D8** (send `lang`) and **D4** (a parallel keyless-default routing proxy).
- New **TD** for the routing proxy + engine choice (D4) and a new **PD** for the
  trip-canvas workspace shell (D9) are worth first-class log entries.

---

## 7. Sequenced build plan

Dependency- and value-ordered; quality-first; phases are a sequence, not a
schedule. Design specs (D5 + D9) precede their builds.

0. **Independent quick wins** (no deps):
   - **D8** geocoding `lang=en` — also unblocks the pending **Japan geocode**.
   - **D2 (labels only)** "Friday, May 1st" day labels.
   - Map **day-layer toggle** (§3).
1. **Design pass** (ui-interface-designer): **D5** Plan View v2 + **D9**
   workspace shell + overview, specced together (same surface).
2. **Data-model foundation:** **D1** typed items, **D2** days table, **D10**
   idea lists, **D7** `estimatedCostMinor` — schema + mutations + sync wiring.
   (Gates most of the rest.)
3. **Plan View v2 build (D5):** rail, compact rows, inline edit, numbering +
   numbered pins, "added by", day notes/checklists, day subtitles; idea lists +
   freeform idea types (D1/D10) on the Decide surface.
4. **Bookings + day anchors (D3):** wall-clock flight/lodging entry, derived
   bookend entries + per-day anchors.
5. **Routing (D4):** routing proxy + engine, route lines, travel-times, modes —
   consumes the D3 anchors as day endpoints.
6. **Money (D7):** convert-estimate-to-expense + budget forecast; surface
   "needs attention" signals in the overview.
7. **Workspace shell (D9):** continuous scroll + synced index wrapping it all
   (Plan View v2 becomes a section within it).
- **Deferred track:** upload subsystem (D6) → hero / image-ideas / attachments;
  mobile design review.

---

## 8. Open items / next steps

1. Apply the §6 decision-log deltas to `docs/decisions.md` (new dated PD/TD
   entries + SUPERSEDED links) — **owner go-ahead needed**.
2. Promote §7 phases into `plan.md` milestones (deliberate).
3. Produce the design specs (D5 + D9) before their builds.
4. `docs/enhancements.md` 2026-06-28 section is marked triaged and points here.
