# Enhancement log

A running inbox for ideas as they come up — **not commitments**. Nothing here
is scoped or scheduled until it's promoted into `decisions.md` / `plan.md`
(or the §9 backlog) deliberately. Newest entries at the top; note overlaps
with existing plan tasks so promotion is a merge, not a surprise.

---

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
