# Trip-page workspace — design reference (vendored)

These files are the **design deliverable** for the trip-page workspace IA/layout, pulled
from the **Caravan Design System** project on claude.ai/design
(`projectId f409b4b5-4d05-4821-a96a-d6470ef3b0d9`, `ui_kits/app/`) on 2026-06-20.

They are the response to [`../../trip-page-layout-brief.md`](../../trip-page-layout-brief.md)
(the deferred **C.4** — workspace shell + long-trip day navigation).

## What this is — and isn't

This is a **reference prototype + IA spec**, not buildable app code. The files are plain
React with inline styles, mock data, and the design-system's `window.CaravanDesignSystem`
bundle, with a *stylized parchment fake-map* standing in for the real map. Our app
(`apps/web`) is TypeScript + TanStack Router + Tailwind/shadcn + real MapLibre + the real
sync hooks. **Implementing this means translating the IA into our actual components, not
copying these files in.** The runnable/interactive version lives in the design project
(`ui_kits/app/index.html`), which depends on the remote `_ds_bundle.js`.

## Files

| File | What it specifies |
| --- | --- |
| `ui-readme.md` | The design's own note on scope (only the day-view + ambient map is designed in detail; other surfaces derive from its language). |
| `trip-page.jsx` | The **workspace shell** — top bar, desktop left rail (Plan/Decide/Money/Group), the Plan split-view (timeline + persistent map), desktop vs. mobile composition, bottom-tab nav, feed trigger. |
| `trip-shell.jsx` | Shared shell pieces — icons, the **ambient MapPane**, the **feed drawer** ("What changed"). |
| `trip-views.jsx` | The four switchable views — **Itinerary** (sticky day rail, collapsible days, compact empty-day rows, Ideas→Decide pointer), **Decisions** (ideas pool now lives here + polls + comments), **Expenses** (budget + settlement + list), **Members**. |
| `day-view.jsx` | An earlier standalone day-view exploration (timeline + map). Superseded by `trip-views.jsx`'s `ItineraryView`; kept for the card/menu/dialog/toast interaction detail. |
| `trip-data.jsx` | The mock data model the prototype assumes — useful for understanding the data shape each surface expects (`DAYS`, `IDEAS`, `POLLS`, `EXPENSES`, `SETTLEMENT`, `FEED`, …). |

## Implementation tracking

The implementation is staged on a feature branch — see `../../../plan.md` (Track C / C.4).
