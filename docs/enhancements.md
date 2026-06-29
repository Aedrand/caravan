# Enhancement log

A running inbox for ideas as they come up — **not commitments**. Nothing here
is scoped or scheduled until it's promoted into `decisions.md` / `plan.md`
(or the §9 backlog) deliberately. Newest entries at the top; note overlaps
with existing plan tasks so promotion is a merge, not a surprise.

---

## 2026-06-29 — Bookings section: more booking types beyond flight + lodging (owner)

**Context:** V2.7 promotes **Bookings** from a strip into its own top-level workspace
section, internally grouped by category (**Transport** / **Lodging**). For V2.7 the
section is populated only by the existing two booking types — flights (→ Transport)
and hotels (→ Lodging) — and the category structure is built to grow. The owner
explicitly wants the section to **accommodate more booking types in the future**.

**Idea (open, not scoped):** add further first-class booking types so the categories
fill out, e.g.:

- **Transport:** trains (Shinkansen!), ferries, rental car / car transfers, private
  drivers. (Note: this is *manual booking entry* — confirmation, date/time, cost —
  and is **independent** of the deferred public-transit *routing* question; you can
  log a train booking without any transit-routing engine.)
- **Lodging:** already covered by the hotel type; could extend to ryokan / rental /
  hostel sub-kinds if useful.
- **New category — Tickets / Reservations:** event tickets, attraction passes,
  restaurant reservations (e.g. a museum slot, a teamLab ticket, a dinner booking).

**Cost when promoted:** each new type is a data-model addition (an enum value on the
activities table + per-type form fields) plus a row renderer + the category it slots
into — the section's grouping and the in-day shim references are already designed to
absorb them. No shell rework. Smallest first slice is probably a generic **train**
transport type for the Japan trip.

**Cross-ref:** the deferred *public-transit routing* revisit (the 2026-06-29 routing
entry below) is a **different** thing — that's live transit *directions/times*; this
is just *recording a booking you already made*. Keep them distinct when promoting.

## 2026-06-29 — Routing provider swap + public-transit decision (owner)

**Routing default is DOWN — swap to keyless OSRM (near-term fix, not just an idea).** The FOSSGIS Valhalla default (`valhalla1.openstreetmap.de`) is unreachable from every network tried — confirmed it's the **host**, not a code bug (the proxy + graceful-off behave correctly, so walk/drive legs just render blank). **Fix:** add a keyless **OSRM** adapter targeting FOSSGIS `routing.openstreetmap.de` (separate `routed-foot` / `routed-car` profiles — both confirmed up, response shape captured) and make it the default provider; keep `ROUTING_PROVIDER` + `ROUTING_URL` (own Valhalla/OSRM) + key-optional ORS as alternatives. Promote to a near-term task. _Caveat: OSRM public is also a no-SLA donated host — the durable answer is the `ROUTING_URL` escape hatch or a keyed provider; "keyless default that works on `git clone`" is just the immediate priority._

**Public transit — DECIDED out of scope for now; revisit at the end.** In-app routing stays **walking/driving only**; the transit story is the existing **Google Maps link-out** (keyless, compliant, no second map). Now baked into `plan.md` as a deferred post-v1.0 revisit ("Public transit — deferred revisit") with three options: (1) Google Maps **Embed API** iframe panel [cheapest, no second renderer], (2) an **open transit provider** in-app (Transitous/MOTIS → self-host) [coverage gaps], (3) a **separate Google renderer** [full ~2× map cost]. Rationale: worldwide transit-with-schedules is effectively Google-only data; open engines cover only EU / US-metros / Tokyo (blank for Kansai/Shinkansen/Seoul) and self-hosting can't fix missing data; Google's terms block drawing its transit on our OSM map.

## 2026-06-29 — Self-hosting / privacy: a "no third-party egress" deployment posture (owner ask — look into later)

> **Update 2026-06-29 (investigated with owner).** Untangled the two motivations conflated here:
> - **Reliability is *not* a reason to self-host.** The fix when a public host dies (as `valhalla1.openstreetmap.de` just did) is a **provider swap** (→ keyless FOSSGIS OSRM) + the existing `ROUTING_URL` escape hatch — not running our own Valhalla. "Public keyless = no SLA" is the real lesson.
> - **Privacy / air-gap / data-residency** is the *only* justification for full zero-egress, and stays an **open** posture for the M6 security pass (do not close).
> - One concrete code gap: tiles can target named providers but **not an arbitrary self-hosted tile server** — there's no `TILE_STYLE_URL`/custom-style override (routing & geocoding already have URL overrides). Small, well-scoped M6 add.
> - Transit egress is moot — public transit is out of scope (link-out only); see the 2026-06-29 routing/transit entry above + `plan.md`.

**Potential self-hosting requirement to investigate.** Caravan's geo features call **public third-party OpenStreetMap services by default**, so a default deployment sends data off-box:
- **Routing** (V2.5) → FOSSGIS **Valhalla** (`valhalla1.openstreetmap.de`): the server proxy sends day **waypoint coordinates + mode**.
- **Geocoding** (TD-5) → **Photon**: place-name search queries.
- **Map tiles** → **OpenFreeMap**: viewport tile requests (reveal where you're looking).

No user identity/trip data leaves (it's the server's IP + bare coords/queries), and routing degrades gracefully — but for **privacy-sensitive, data-residency-bound, or air-gapped** deployments this off-box egress may be a **hard requirement to eliminate**, not just a nice-to-have.

**The building blocks already exist** — each is swappable to a self-hosted instance via env: `ROUTING_URL` (own Valhalla container + regional OSM extract), `PHOTON_URL` (own Photon), `TILE_PROVIDER`/tile config (own tile server). So this is mostly a **documentation + supported-posture** task, not new code.

**Look into (later):**
- A documented **"fully self-contained / zero third-party egress" deployment profile** in `docs/self-hosting/` — compose file wiring own Valhalla + Photon + tiles, the env overrides, and resource/sizing notes (OSM extracts, container footprint).
- An exact **"what leaves the box per feature"** table (egress audit) so operators can reason about it; optionally a startup log/warning when any geo URL points at a public host.
- Whether to surface a privacy note in the admin/self-host docs (and whether some deployments should default to geo-off until self-hosted endpoints are configured).
- Folds naturally into the **M6 security pass** (`plan.md` §M6) and the self-host docs cluster (Track D).

_Not a commitment — a flagged consideration for when self-hosting hardening gets attention._

## 2026-06-29 — V2.6 money: one decision to confirm (orchestrator, owner away)

- [ ] **BUDGET-PLANNED-SEMANTICS** — the planned-vs-actual `BudgetBar` is built as a **comparison**: **Planned** = Σ all activity estimates on the itinerary (dated items, all types); **Actual** = Σ all logged expenses. A converted item counts in BOTH (its estimate in Planned, its expense in Actual) — i.e. "we planned $1,200, we've spent $1,310." **Confirm this is the intended reading**, vs the alternative "remaining budget" view where converting an estimate *removes* it from Planned (so the bar shows only estimates for items not yet expensed). It's a **one-line flip** in the pure `apps/web/src/lib/expenses/budget.ts` `plannedMinor` selector (filter out activities that already have a linked expense) — no schema/UI rework. Also low-stakes: there's no hard "one expense per activity" constraint (a deposit + final payment can both link to one activity); flag if you want uniqueness enforced.

## 2026-06-29 — V2.5 routing build: deferred review items (orchestrator, owner away)

Surfaced while building V2.4/V2.5 autonomously; flagged for owner review (not commitments).

- [ ] **MAP-PIN-DAY-COLOR** — V2.5 ships **day-colored route lines** while **pins keep their category tint** (V2.3). Now that routes are day-colored, decide whether to also color **pins by day** (the owner's earlier "color pins by day" ask): replace category coloring outright, or keep category as a secondary cue (glyph/icon in the pin) with day as the fill. `pin-tint.ts`'s `pinColorExpression` is already swappable — a ~20-line change once decided. _Best reviewed by looking at the map with route lines in context._
- [ ] **ROUTING-PERF-LAZY-LOAD** — a day route is fetched per day; a 30-day trip fires up to ~30 `/api/route` calls on first load (capped by the server 24h `route_cache` + the rate limiter; self-host Valhalla has no concern). If the public FOSSGIS instance throttles bursts, lazy-load each day's route on scroll (`IntersectionObserver` gating `useRouteForDay`'s `enabled`) — a single-file change in the `RoutingProvider`/`DayRouteSubscriber`.
- [ ] **TRIP-SETTINGS-DIALOG** — there is no trip settings/edit dialog (currency is set at creation; the only post-create `trip.update` is the inline rename). The new **trip-default route mode** toggle was placed in the Plan toolbar as a result; relocate it (and surface currency, etc.) when a real trip-settings dialog lands.
- [ ] **FLIGHT-COST-FIELD** — the V2.4 flight booking form has no cost field (the spec's flight field list omitted it; `estimatedCostMinor` is schema-supported on any type). Add it if flight cost should roll into the day/trip budget.

## 2026-06-28 (later) — Trip Workspace v2 review-session notes (owner)

Captured live during a hands-on review of the V2.3 build — not yet triaged.

**Map**

- [ ] **Color map pins by the day they belong to, not the activity category.**
  V2.3 polish shipped category-tint pins (food/sights/… color), but the owner
  wants color to encode **which day** a pin is, so a glance at the map
  immediately groups pins by day. Pairs naturally with the V2.5 day route lines
  (a day's pins + its route share one color). *Reconsiders the just-shipped
  category-tint:* open question whether category coloring drops entirely or
  survives as a secondary cue (e.g. a glyph/icon inside the pin) with **day** as
  the fill. Candidate day palette: reuse the existing member/join-order color
  ramp, or a dedicated day ramp. _Promotion path: fold into V2.5
  routing/map-legibility (it's noted on that plan row)._

---

## 2026-06-28 — Manual-testing notes (owner)

Quick, unstructured jots from a hands-on pass — drop a line as things come up;
we'll expand / promote the keepers later. Grouped by surface for triage; every
item is the owner's verbatim note.

> **✅ TRIAGED 2026-06-28 → [`docs/design/trip-workspace-v2-brief.md`](design/trip-workspace-v2-brief.md).**
> All 21 notes were walked through with the owner and promoted into design
> decisions (D1–D11): typed freeform items, first-class days, enter-once
> bookings that anchor each day, real auto-routing, Plan View v2 (a connected
> progression rail), a continuous-scroll workspace shell + synced index +
> overview, idea lists, activity cost estimates, and a keyless `lang=en`
> place-name fix. Deferred: the upload subsystem (hero image, image-ideas, file
> attachments). Out of scope: full UI localization. The raw notes are kept
> below for provenance; the brief is the source of truth, and its §6 lists the
> `decisions.md` amendments still to apply.

**Plan / itinerary view**

- [ ] More compact activities (currently takes up too much space in plan view, can only see about 3 on screen)
- [ ] Allow more inline editing of activities. Pop up is too much of a barrier
- [ ] "Added by" tags for activities in plan view, show which user added it
- [ ] Make the planning view more of a vertical timeline view than a collection of cards, indicate progression
- [ ] Allow notes directly in a day's timeline independent of an activity
- [ ] Allow attaching files to activities
- [ ] Allow adding cost to activities _(bridges → money)_
- [ ] Add distance between each subsequent activity within a day, and link to directions between the two (in between activities in plan view) _(bridges → map)_

**Days (model & labeling)**

- [ ] Have days be labeled as "Friday, May 1st" instead of "Day 1"
- [ ] Allow customizable subtitles for each day (IE Day 1 - Arrive in Tokyo)
- [ ] Allow separate entry for Flights and Hotel bookings, with each being synced the relevant days automatically (flights at the relevant times, hotels at start and end of each relevant day. Check in-out time is important for this on hotels)
- [ ] Fix days top bar UI bug

**Map**

- [ ] Number activities within a day and propagate these numbers to the pins on the map so it's more apparent which pin is which _(bridges → itinerary)_
- [ ] Add route lines to the map showing the route users will take throughout the day
- [ ] Map layers for each day? (unsure)
- [ ] Look into either a Google Maps API or a translation. Foreign places (Japan for example) show up in just Japanese at the moment, not useful for English speakers

**Ideas / Decide**

- [ ] Ideas should be a bit more freeform. They could be an activity like they are now, or a freeform note, or a checklist, or even an image with a caption. Ideas are welcome here. The key thing is it's an easy freeform place to throw things in that can then easily have a poll created off it for actioning
- [ ] Ideas should also be able to have freeform sections users can add. Like "Food" or "Activities" or "Day Trips". Less restrictive than the existing categories, more freeform lists

**Overview / front page (net-new surface)**

- [ ] Add a top-level overview section that contains a short sort of "front page" for the trip. What needs attention, a freeform bulletin board, etc.
- [ ] Customizable hero image for front page

**Navigation**

- [ ] Allow infinite scroll between plan / decide / money / group tabs

**Cross-refs (for when these get promoted, not decisions):**

- _Front page + hero image_ relate to the 2026-06-11 "Admin console & instance
  identity" entry below, but at a different scope: those are **per-instance**
  branding (name, theme, logo), whereas these are **per-trip** (this trip's
  overview, this trip's hero). Distinct surfaces — promote separately.
- _Add cost to activities_ links itinerary ↔ expenses (Feature area 3); decide
  whether it auto-creates / links an `expense` or is just a display field.
- _Google Maps API or translation_ is a provider/i18n decision, not just a
  feature — it intersects the keyless-map choice (`docs/maps-and-places.md`,
  Photon / TD-5) and the pending Japan geocode task. Latin-script display of
  Japanese place names may be solvable without leaving Photon (name
  localization) before reaching for Google.
- Several plan-view items (compact cards, inline edit, vertical timeline,
  "added by") are squarely itinerary-UI / Track E territory.

## 2026-06-11 — Admin console & instance identity (owner)

> **Partially promoted (2026-06-11):** per-instance theming is now **TD-10**
> (semantic token contract; themes as data) — E.1 defines the contract +
> default theme, D.3 ships the admin picker. Still living here: instance
> icon/logo upload, login-page welcome copy.

Make a self-hosted instance feel like *the group's own*: this isn't a SaaS,
so the admin should be able to brand and shape it.

- **Custom instance name** — shown in the header, page titles, invite/join
  pages ("Join the Riggs Family Caravan"). *Overlap: plan D.3 already lists
  "instance name" as a writable admin setting; this extends it into the UI
  surfaces.*
- **Color palette / theming** — let the admin pick or tune the palette
  (presets and/or a primary-hue picker). *Net-new (Track E defines THE design
  language, not per-instance theming).* Natural implementation: theme tokens
  already live as CSS custom properties (warm OKLCH set), so an
  `instance_settings`-backed theme + a `<style>`/attribute override at the
  shell is cheap; dark mode could ride the same mechanism.
- **Admin console as a real surface** — D.3's scope is utilitarian
  (registration toggle, read-only stats, backup button). The aspiration here
  is a proper "make it yours" console: identity + theme + defaults (e.g.
  default currency) in one place.
- Possible extras when promoted: instance icon/logo upload (favicon + header),
  login-page welcome copy.

**Promotion path:** extend D.3's task definition (Track D) + a small Track E
hook for theme-token overrides; no new milestone needed.
