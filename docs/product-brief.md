# Product Brief: Caravan — Collaborative Group Travel Planner

Synthesized 2026-06-10 from the research docs of the prior `travel-planner` project (briefs dated 2026-03-03 through 2026-03-04), with implementation decisions stripped out and the FOSS/self-host positioning added. This is the durable product context; `../PROJECT.md` is the summary.

## Problem statement

A web application that serves as a one-stop-shop for groups planning trips together. Unlike solo-focused apps (TripIt) or map-centric tools (Wanderlog), it centers the *group coordination problem*: multiple people simultaneously and asynchronously building a shared itinerary, voting on destinations and activities, splitting expenses, and receiving AI-generated suggestions — all in a single collaborative workspace. It must handle the full trip lifecycle: early brainstorming and voting, mid-planning itinerary construction, and in-trip reference and expense tracking.

This version adds a positioning constraint the original lacked: **free, open source, and self-hostable.** Distribution is `git clone` + one command, run by a tech-savvy friend for their circle. There is no business model, which removes the paywall pressure that deforms every commercial competitor's feature set.

## Market landscape

The market splits into camps, none satisfying:

| Camp | Examples | Strength | Gap |
|---|---|---|---|
| Trip trackers | TripIt, Google Trips | Ingest confirmation emails, consolidate reservations | Collaboration is read-only afterthought; no group decisions; no real AI |
| Collaborative builders | Wanderlog, Plan Harmony | Shared editing, voting, expense splits, maps | Weak async contribution; shallow AI behind paywall ($40/yr); no BYO AI; no double-booking detection |
| Group polling | Troupe, MiTravel | Destination/date voting, group chat | Stops after "where should we go" — no itinerary, no expenses |

**Whitespace:** no product combines real-time collaborative itinerary editing, structured group decision workflows (voting/polls/comments), deep itinerary-level AI, user-supplied personal AI assistants, and solid expense tracking. ~~Nothing in the space is self-hostable.~~ *(Correction 2026-06-10: TREK — a self-hostable FOSS group planner with real-time collaboration, polls, and expense splits — has since emerged; see `research/raw/fact-check.md`. Differentiation, not first-mover, is the positioning basis.)*

A recurring gap across *all* competitors: **asynchronous contribution.** Group members rarely plan at the same time. Surfacing "Sam added 3 activities to Day 2 while you were offline" — via activity feeds and notifications — is underserved everywhere and should be a strength here.

## Feature detail

### Collaborative itinerary (foundation)

- Trip workspaces with owner/editor/viewer roles; members join via shareable invite link.
- Day-by-day itinerary builder: add, edit, reorder, delete activities. Activity fields: title, date, start time, location, category, notes — location optionally backed by a real place (coordinates) for mapping, with freeform fallback.
- Real-time collaborative editing: the bar is two people in different browsers editing the same itinerary simultaneously without conflicts or lost edits.
- Live presence: who's viewing/editing right now, Google-Docs-style avatars. Collaboration should feel invisible until you notice it.
- Trip dashboard: name, dates, destination, member list.

### Discovery & decisions

- Place search with autocomplete when adding activities; results carry name, address, coordinates.
- Map view of all activities. Design direction: the map is *ambient* — a persistent pane beside the itinerary, not a tab you visit. Clicking an activity highlights its pin; clicking a pin scrolls to the activity. Activities without coordinates simply show as unplotted.
- Voting on activities — lightweight consensus on candidates before they're locked in.
- Polls with freeform options for open questions ("where should we eat on Day 3?").
- Comments on individual activities for asynchronous discussion.
- Activity feed: a per-trip log of who changed what, so offline members can catch up.

### Expense tracking

Goal: handle the money side without leaving the app — no Splitwise side-channel, no spreadsheet.

- Log an expense: amount, description, who paid, category (predefined: food, transport, accommodation, activities, shopping, other), notes; optionally attached to a day or activity.
- Split among selected members — equal split as the default (covers most real expenses), exact custom amounts as the alternative. Percentage/shares-based splits are a later nicety.
- Record payments between members ("Alice paid Bob $50") as first-class entries, distinct from expenses — partial in-trip settling must work from day one.
- Settlement summary: net who-owes-whom, simplified to the minimum number of transactions. This is the highest-value view — it answers "how do we settle up?"
- Per-person breakdown (paid, owes, net) and a trip total / budget overview.
- Expense creators can edit/delete their own entries; trip owners can delete any.
- Single currency per trip initially; multi-currency deferred.

### UI & design direction

The product-level lessons from studying Wanderlog, TripIt, and Google Travel:

- **Card-based content** — every activity, expense, poll, comment is a scannable card.
- **Map-forward split view** as the core workspace layout: itinerary panel alongside a persistent map. Collapses to single-panel with a map toggle/bottom-sheet on mobile.
- **Day-grouped timeline** with clear day headers ("Day 1 — Mon, Mar 4"), collapsible sections, drag-to-reorder.
- **Clear action hierarchy** — one warm, high-contrast primary action per screen; secondary actions recede. Avoid the wall-of-buttons problem.
- **Progressive disclosure** — trip workspaces get dense; collapse and tab rather than showing everything.
- **Warm, aspirational palette** — travel apps should not feel like enterprise software.
- Real empty states (with a clear call to action), loading skeletons, error states.
- Responsive: laptop for planning sessions, phone for in-trip reference. The in-trip mobile experience is a primary use case, not an afterthought.

### House AI (shared assistant)

Powered by an API key the *deployment owner* configures — provider-agnostic, never hardcoded to one vendor. Available to all members of the deployment once configured; everything works without it.

- Trip-scoped chat panel that knows the itinerary, dates, destination, and group size.
- Activity suggestions, including gap-aware ones ("you have 4 free hours on Day 2 in Rome").
- Natural-language itinerary edits ("move dinner to 8pm", "add a morning hike on Day 3") — applied to the shared itinerary so every member sees the change in real time.
- AI edits are visibly attributed to the assistant (badge/distinct author), never disguised as a human member.
- Itinerary gap and conflict detection: overlapping times, unrealistic travel windows between activities.
- AI-powered place recommendations beyond raw map-API results.
- Cost controls matter more in a self-hosted context: per-user/per-trip rate limits so one enthusiastic friend can't burn the host's API budget. AI should be enableable per trip.
- Stretch: full trip generation from a prompt ("plan a 5-day trip to Kyoto for 4 people, budget $3k").

### Personal AI (bring your own assistant)

The original project's most distinctive idea, kept intact: instead of pasting API keys into the app, users connect their *own* AI client (Claude Desktop or any compatible assistant) to the app.

- The app exposes an explicit, auditable tool surface — read itinerary, add/update activity, create poll, vote, log expense, get expense summary, search places. The user's assistant can only do what the tools allow.
- Permissions inherit from the user's trip role; **write access is opt-in per trip** (default off).
- Connection via a token the user generates in the app; no third-party keys stored.
- All personal-AI actions are rate-limited and audit-logged.
- Open product question: can a member's personal AI modify shared data everyone sees, or is it limited to reads + personal annotations until the group trusts it?

### Polish & reach

- Notifications for key events: invites, polls closing, new expenses, "N activities added while you were away." Surface (email/push/in-app digest) is an open question.
- Offline read access to the itinerary (mid-trip, roaming, airplane mode); installable on a phone.
- Trip export: PDF itinerary, calendar (.ics).
- Booking: **link-outs only** (Google Flights, Booking.com, Viator). In-app booking, affiliate integrations, and payment processing are permanently out of scope — wrong fit for FOSS self-hosting, and they drag in compliance scope.

## What the FOSS positioning changes

Beyond resolving old open questions (monetization: none; AI provider: BYO; booking: link-out; audience: small friend groups), the positioning imposes standing constraints:

1. **One-command self-host story.** Whatever the stack ends up being, a tech-savvy friend must bring it up with `git clone` + one command and keep it running without babysitting. Every architecture decision is bounded by this.
2. **Vendor-neutral components.** No dependency on a proprietary managed service that can't be run locally or swapped. (The prior implementation's reliance on a managed backend platform is part of what this restart leaves behind.)
3. **Multi-user within a deployment, small scale.** Design for one host serving a handful of trips among friends — not multi-tenant SaaS scale, and not single-user either.
4. **Costs land on the host.** AI usage, map/places API usage, storage — all paid by the deployment owner. Features that consume metered external APIs need visible controls and graceful degradation when unconfigured.
5. **No telemetry, no accounts with the project.** Standard FOSS hygiene.

## Explicitly discarded

The prior project's docs are dense with implementation decisions — sync architecture, backend platform, state-management libraries, component libraries, API choices, schema designs. **All of it is discarded.** This restart inherits the product vision above and nothing else. When architecture work begins, decisions should be made fresh against the FOSS/self-host constraints and recorded in a `docs/decisions.md` log.

## Open questions for brainstorming

Carried forward from the original research, still genuinely open:

1. **Offline depth** — read-only offline itinerary vs. full offline editing with sync-on-reconnect. Editing offline adds scope to every feature; decide before data modeling.
2. **Itinerary data structure** — freeform text (easy collaboration, hard to map/query) vs. structured records vs. hybrid. The core data-modeling question.
3. **Concurrent-edit UX** — automatic merge is deterministic but not always expectation-matching. Does v1 need a "this got merged" surface, or is silent resolution fine among friends?
4. **Notification strategy** — email vs. push vs. in-app digest; how to serve async planners without spamming the group chat's job.
5. **Vote mechanics** — thumbs-up only (positive-sum, simpler) vs. up/down (honest signal); show voters or just counts; single-choice vs. multi-select polls.
6. **Personal AI write scope** — defaults, per-trip opt-in granularity, and whether personal AI can touch group-visible data.
7. **Self-host operational floor** — how many moving parts is the host friend willing to run? This is effectively a new question the FOSS positioning introduces, and it bounds everything.
8. **Trip lifecycle edges** — archiving past trips, duplicating a trip as a template, leaving/removing members mid-trip. (Lightly covered in the original docs; worth a pass.)
