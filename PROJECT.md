# Caravan

> Confirmed name (owner, 2026-06-11). A group traveling together.

An open-source, self-hostable collaborative travel planner for groups. One person who's handy with a server runs it; their friends use it to plan trips together — brainstorming and voting on what to do, building a shared itinerary in real time, splitting expenses, and getting AI help along the way.

## Provenance

This is a restart. A previous implementation of this idea exists at `../travel-planner`; the product vision was sound but the implementation wasn't worth keeping. This document synthesizes the vision and feature set from that project's research docs **with all implementation decisions deliberately discarded**. No stack, architecture, or library choices have been made for this version, and the old codebase should not be consulted or used as reference.

One core addition distinguishes this version: **free and open source, hostable by a tech-savvy friend for themselves and their buddies.** That positioning is now load-bearing and shapes everything below.

## The problem

Group trip planning is fragmented across a group chat, a shared doc, a map app, and a Splitwise. Existing products each solve a slice:

- **Trip trackers** (TripIt, Google Trips) consolidate reservations but treat collaboration as an afterthought — sharing is read-only, no group decision-making, no meaningful AI.
- **Collaborative itinerary builders** (Wanderlog, Plan Harmony) get closest — shared editing, voting, expense splitting — but have weak asynchronous coordination, shallow AI gated behind paywalls, and no way to bring your own AI assistant.
- **Group polling apps** (Troupe, MiTravel) nail the "where should we go" consensus phase, then stop — no itinerary construction, no in-trip support.

**The whitespace:** no product combines (a) real-time collaborative itinerary editing, (b) structured group decision workflows — voting, polls, comments, (c) deep AI augmentation at the itinerary level, (d) user-supplied personal AI assistants, and (e) solid expense/split tracking, in one coherent product. ~~And nothing in this space is self-hostable or open source.~~

> **Competitive correction (research, 2026-06-10):** the struck claim no longer holds — **TREK** (AGPL-3.0, Node+SQLite, ~5.6k★) is a self-hostable FOSS group planner with real-time co-editing, polls, and expense splits. The niche is occupied, not empty. Verified in `docs/research/raw/fact-check.md`.
>
> **Positioning decision (owner, 2026-06-11): proceed & differentiate.** Where the products actually diverge (TREK's README + fact-check):
>
> | | TREK | Caravan |
> |---|---|---|
> | Spine | Feature-maximal planner; collaboration is an addon pack (chat, notes, polls, check-ins) | Group *deciding* is the core loop: ideas pool → visible voting → poll→activity conversion → comments-as-reasons |
> | Async catch-up | Group chat (duplicates the chat the group already has) | No chat — attributed feed, "N changes since you looked," digest: the still-open market gap |
> | Presence | Not mentioned | Core from M1: avatars, editing hints |
> | Money | Splits + charts; no settlement/payments found | Settlement-complete: payments, min-transaction who-owes-whom, ghosts |
> | AI | MCP-only (no in-app assistant) | House AI (NL edits, attribution, budgets) **and** BYO MCP, independently optional, plus the AI-trust UX (per-trip write opt-in, badges, "Sam's assistant") |
> | Posture | Power-user breadth: 8 addons, weather/packing/documents/journal, 15 languages | Deliberately few concepts, opinionated flows, warm consumer design for the least-technical friend |
>
> TREK is the Jira of the niche; Caravan aims to be the Linear. Clean-room discipline applies (TREK is AGPL — no code reference).

## Who it's for

Small groups of friends or family (roughly 2–10 people) planning trips together. The host is the tech-savvy one; everyone else just gets an invite link. Not aimed at corporate retreats, destination weddings, or travel agencies.

## Product principles

1. **FOSS and self-hosted, for real.** `git clone` + one command brings it up. Multi-user within a deployment. No SaaS dependency that breaks the self-host story; prefer vendor-neutral, open components. No monetization, no paywalled tiers, no feature gating — the "Pro plan" pressure that shapes commercial competitors doesn't exist here.
2. **The group is the unit, not the user.** Every feature starts from "multiple people, simultaneously and asynchronously." Solo planning is the degenerate case, not the design center.
3. **Full trip lifecycle.** Early brainstorming and voting → itinerary construction → in-trip reference and expense settling. The app is useful at every stage, including on a phone mid-trip.
4. **BYO AI key.** There is no company paying for inference. The deployment owner supplies an API key for shared "house AI" features, and individual users can connect their own AI assistants. Provider-agnostic — never hardcode a single LLM vendor.
5. **AI augments, never gates.** Every core feature (itinerary, voting, expenses) works fully without AI configured. AI is a layer on top, not a dependency. The two AI surfaces are independently optional: a deployment can run the house AI, personal AI, both, or neither.

## Feature areas

The arc, roughly in dependency order. Phase boundaries are suggestions, not commitments — the old project's phasing worked well, but this version may slice differently.

### 1. Collaborative itinerary (the foundation)
- Create a trip workspace; invite members via shareable link; owner/editor/viewer roles
- Day-by-day itinerary: add, edit, reorder, delete activities (title, date, time, location, category, notes)
- Real-time co-editing — two people in different browsers edit the same itinerary simultaneously without conflicts
- Live presence (who's here, who's editing) and a trip dashboard (name, dates, members)

### 2. Discovery & decisions (help groups decide, not just record)
- Place search and autocomplete when adding activities; activities plotted on an always-available map view
- Voting on candidate activities; polls with freeform options ("where should we eat on Day 3?")
- Comments on individual activities for async discussion
- Activity feed so members who were offline can catch up on what changed — async coordination is the gap every competitor leaves open

### 3. Expense tracking (the money side, without leaving the app)
- Log expenses: amount, payer, category (predefined set), notes; optionally tied to a day or activity
- Split equally or with custom amounts among selected members
- Record payments between members mid-trip (partial settlement from day one)
- Settlement summary: net "who owes whom" simplified to minimum transactions; per-person totals and trip budget overview
- Single currency to start

### 4. Consumer-grade UI
- Card-based, map-forward design: the map is ambient (persistent split view), not a tab you visit
- Day-grouped timeline itinerary with drag-to-reorder; warm, aspirational travel aesthetic — not enterprise blue-gray
- Responsive: desktop for planning, mobile for in-trip reference
- Real empty states, loading states, error states; presence that feels invisible until you notice it

### 5. House AI (shared assistant, deployment owner's key)
- Trip-scoped chat panel with itinerary context
- Activity suggestions ("you have 4 free hours on Day 2 in Rome — here are 3 ideas")
- Natural-language itinerary edits ("move dinner to 8pm") that appear for all members in real time, visibly attributed to the AI
- Gap and conflict detection: overlapping times, unrealistic travel windows
- Works with whatever provider/key the deployment owner configures

### 6. Personal AI (bring your own assistant)
- Users connect their own AI client (e.g., Claude Desktop or any compatible assistant) to their account with trip-scoped, role-scoped permissions
- The app defines an explicit, auditable tool surface — read itinerary, add activity, vote, log expense — and enforces the permission boundary server-side
- Write access is opt-in per trip; AI actions are rate-limited and audit-logged
- No API keys pasted into the app; the user's assistant is a client, not a credential

### 7. Polish & reach
- Notifications for key events (invites, polls closing, new expenses) — email and/or push
- Offline read access to the itinerary for mid-trip use; installable on a phone
- Trip export (PDF itinerary, calendar files); booking via **link-outs only** (Google Flights, Booking.com, etc.) — no booking integrations, affiliate deals, or payment processing in a FOSS self-hosted app
- Full trip generation from a prompt ("plan a 5-day trip to Kyoto for 4 people, budget $3k")

## Resolved by the FOSS positioning

The old project carried open questions that the new positioning answers:

- **Monetization:** none. No tiers, no gating decisions to make.
- **AI provider strategy:** BYO key, provider-agnostic. The deployment owner picks.
- **Booking integration depth:** link-out only. Booking APIs, affiliate revenue, and payment compliance are out of scope permanently.
- **Group size targets:** small friend groups (2–10). No need to engineer for 50-person corporate retreats.

## Open questions (carried forward, still open)

- **Offline depth:** read-only itinerary access offline, or meaningful offline *editing* with sync on reconnect? Editing offline adds scope to every feature.
- **Itinerary data structure:** freeform text blocks (easy to co-edit, hard to map/query) vs. structured records (easy to display, more rigid) vs. hybrid. The core data-modeling question.
- **Concurrent-edit UX:** when two users move the same activity to different days, deterministic auto-resolution may not match expectations. Is there a "heads up, this merged" surface, or is last-write-wins fine for friends?
- **Notification surface:** email, push, in-app, or some mix — and how aggressively to notify a group that plans asynchronously.
- **Personal AI defaults:** which tools get write access by default, and can a member's personal AI modify data the whole group sees?
- **Vote/poll mechanics:** thumbs-up only vs. up/down; vote visibility (who voted vs. counts); single-choice vs. multi-select polls.
- **Self-host operational floor:** what's the minimum acceptable ops burden for the host friend — one container? A compose file with three services? This bounds every architecture choice.

## Status

- [x] Vision and feature synthesis (this document)
- [x] Brainstorm/refine scope for v1 — drafted 2026-06-10, **pending review** (`docs/decisions.md` PD-1…PD-12)
- [x] Architecture and stack decisions — drafted 2026-06-10, **pending review** (`docs/decisions.md` TD-1…TD-9; research under `docs/research/`)
- [x] End-to-end implementation plan — drafted 2026-06-10, **pending review** (`docs/plan.md`; parallel-track build)
- [x] Owner review & decision ratification — completed 2026-06-11 (all decisions ACCEPTED; TD-7 modified: OAuth 2.1 in v1.3; name confirmed)
- [x] Build started 2026-06-11 — repo public at [github.com/Aedrand/caravan](https://github.com/Aedrand/caravan); **M0 walking skeleton complete** (auth, SQLite+migrations, Docker, CI+E2E)
- [ ] M1 — collaborative itinerary core (the two-browser bar; `docs/plan.md` §6)

See [`docs/product-brief.md`](docs/product-brief.md) for the fuller market landscape and feature detail behind this summary.
