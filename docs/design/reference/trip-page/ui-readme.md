# Caravan app UI kit

The core product surface: the **itinerary day view** with the ambient map alongside.

- `index.html` — interactive recreation. Switch days, hover map pins ↔ activity cards (they highlight each other), vote on ideas-pool chips, open a card's ⋮ menu, remove an activity (confirmation dialog → toast).
- Composes the published components (`ActivityCard`, `DayTabs`, `IdeaChip`, `MapPin`, `PresencePill`, `Menu`, `Dialog`, `Toast`, `Avatar`, `Button`) from `_ds_bundle.js` — nothing re-implemented.
- The map is a stylized parchment panel (no real tiles); in production it would be a real map styled to match (`guidelines` in readme.md → VISUAL FOUNDATIONS → Maps).

Other product surfaces (expenses/settlement, activity feed, trip list) are **not designed yet** — they should be derived from this view's language when needed.
