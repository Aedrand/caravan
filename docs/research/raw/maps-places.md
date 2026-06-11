# R3: Maps, Geocoding & Places — research findings (2026-06-10)

## TL;DR

- **MapLibre GL JS** is the correct renderer choice: stable at v5.24.0 (June 2026), v6 pre-release underway (ESM + WebGL2 only), governed by OpenJS Foundation with Amazon/Meta/Microsoft backing; use `@vis.gl/react-maplibre` (v1.x) for React — it is the dedicated MapLibre fork of react-map-gl, spun off because API divergence from Mapbox made a unified package untenable.
- **OpenFreeMap** is the correct $0 default tile source: genuinely no key, no registration, no hard limits, survived 100k req/s stress test; attribution required; funded by ~$500/mo donations with Cloudflare sponsorship — sustainable but with no SLA. Self-hosting via OSS code is also possible.
- **Photon (komoot)** is the correct $0 default geocoder/autocomplete: explicitly supports typeahead, no stated hard rate limit (throttles on "extensive use"), no API key; public instance at `photon.komoot.io`. Nominatim public instance **explicitly forbids autocomplete** client-side — not usable for autocomplete in any form.
- **The geocoding zero-config answer**: debounced Photon at 300–500 ms, search-on-enter also calling Photon; with an optional key env var, upgrade to Geoapify (3,000 req/day free, autocomplete + geocode) or LocationIQ (5,000 req/day free).
- **Google Maps / Mapbox are non-starters for default config** (API key required, vendor lock-in, proprietary license for Mapbox GL JS v2+); they can be supported as optional providers for users who already have keys.

---

## Map Rendering & React Integration

### MapLibre GL JS

- **Finding:** Current stable version is v5.24.0 as of June 2026 (released ~April 2026).
  - Source: https://www.npmjs.com/package/maplibre-gl
  - Date: Verified 2026-06-10
  - Type: npm package page

- **Finding:** v6.0.0 pre-release series active (latest pre: v6.0.0-13 as of May 2026). Breaking changes: drops WebGL1 (WebGL2 only), migrates from CommonJS to ESM, removes `#pragma mapbox` in shaders. Stable v6 expected "shortly" — no firm date.
  - Source: https://maplibre.org/news/2026-05-02-maplibre-newsletter-april-2026/
  - Date: 2026-05-02
  - Type: Official newsletter

- **Finding:** v5.24.0 is described as "the final releases for version 5" — v5 branch is now in maintenance/freeze mode.
  - Source: https://maplibre.org/news/2026-05-02-maplibre-newsletter-april-2026/
  - Date: 2026-05-02
  - Type: Official newsletter

- **Finding:** Governed by OpenJS Foundation, funded by consortium including Amazon, Meta, Microsoft, Stadia Maps, Elastic. Monthly community calls held. Active contributor base (12+ named contributors per monthly newsletter).
  - Source: https://radar.com/blog/mapbox-alternatives-competitors (references governance)
  - Date: 2026
  - Type: Industry blog referencing public governance docs

- **Finding:** MapLibre forked from Mapbox GL JS v1 (BSD license) after Mapbox relicensed to proprietary in December 2020. APIs are similar but have diverged significantly as of 2026.
  - Source: https://www.maptiler.com/news/2021/01/maplibre-mapbox-gl-open-source-fork/
  - Date: 2021 (fork origin), confirmed current by 2026 searches
  - Type: Industry article

### React Integration

- **Finding:** `@vis.gl/react-maplibre` is a dedicated React wrapper for MapLibre, spun off from react-map-gl because the two libraries' APIs diverged enough to make a shared codebase impractical. Maintained by vis.gl (OpenJS Foundation). Current version v1.x, requires maplibre-gl >= 4.0.0.
  - Source: https://visgl.github.io/react-maplibre/docs
  - Date: Verified 2026-06-10
  - Type: Official docs

- **Finding:** `react-map-gl` v8.1.1 (last published ~May 2026) also supports MapLibre via the `react-map-gl/maplibre` import path; this is the same vis.gl team. The split into a separate package means `react-maplibre` will receive more MapLibre-specific features.
  - Source: https://www.npmjs.com/package/react-map-gl
  - Date: Verified 2026-06-10
  - Type: npm package page

- **Finding:** For purely MapLibre-only apps, `@vis.gl/react-maplibre` is the recommended choice in 2026; `react-map-gl/maplibre` is a viable alternative if you want to potentially support both Mapbox and MapLibre providers behind the same component API.
  - Source: https://github.com/visgl/react-maplibre
  - Date: 2026
  - Type: Official GitHub repo

- **Finding:** Marker and Popup patterns: MapLibre GL JS provides `Marker` and `Popup` classes natively. Both react-maplibre and react-map-gl expose `<Marker>` and `<Popup>` React components. Clustering is done natively via MapLibre's GeoJSON source with `cluster: true, clusterMaxZoom: 14, clusterRadius: 50` — no separate library needed for basic clustering.
  - Source: https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/
  - Date: Verified 2026-06-10
  - Type: Official docs example

---

## Tile Sources

### OpenFreeMap

- **Status:** Active, production-viable as of June 2026. Survived 3 billion requests/215 TB bandwidth in 24 hours in a viral stress test (~100k req/s peak) with 96% success rate.
  - Source: https://blog.hyperknot.com/p/openfreemap-survived-100000-requests
  - Date: ~2025 (post published, stress test incident)
  - Type: Founder blog post

- **Policy:** No API key, no registration, no user database, no cookies. No hard request limits. Rate-limiting by referrer at very high threshold (~100M req/24h per referrer). Attribution required: `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`. Auto-applied if using MapLibre.
  - Source: https://openfreemap.org/
  - Date: Verified 2026-06-10
  - Type: Official website

- **Sustainability:** Runs on ~$500/month in donations + Cloudflare bandwidth sponsorship. No SLA. No personalized support. Pro plan hinted at future possibility. Without Cloudflare sponsorship, comparable commercial hosting would cost millions per month.
  - Source: https://blog.hyperknot.com/p/openfreemap-survived-100000-requests, https://openfreemap.org/
  - Date: 2026-06-10
  - Type: Official website + founder blog

- **Self-hosting option:** Full stack is open source (MIT license). Can deploy own instance using provided code.
  - Source: https://github.com/hyperknot/openfreemap
  - Date: 2026-06-10
  - Type: Official GitHub

- **Fit for Caravan:** Excellent. Default tile source for all deployments. Zero config, zero cost. Attribution auto-handled by MapLibre. Risk: no SLA, single-maintainer project relying on donations — operator should be aware.

### Protomaps / PMTiles (Self-Hosted)

- **Finding:** Planet .pmtiles file is ~120 GB (zoom 0–15). Regional extracts are smaller (e.g., Europe ~30–50 GB).
  - Source: https://docs.protomaps.com/basemaps/downloads
  - Date: Verified 2026-06-10
  - Type: Official docs

- **Finding:** Builds are generated **daily** and published. Past week's builds retained plus latest per patch version. Hosted on Source Cooperative (AWS us-west-2 mirror).
  - Source: https://docs.protomaps.com/basemaps/downloads
  - Date: Verified 2026-06-10
  - Type: Official docs

- **Finding:** Serving: any HTTP server supporting Range Requests works. Single static file on S3 / compatible storage. PMTiles JS reader fetches only tiles needed via HTTP Range. Zero server-side processing needed.
  - Source: https://docs.protomaps.com/pmtiles/
  - Date: Verified 2026-06-10
  - Type: Official docs

- **Finding:** License: Open Database License (ODbL) as a Produced Work — requires OpenStreetMap attribution.
  - Source: https://docs.protomaps.com/basemaps/downloads
  - Date: 2026-06-10
  - Type: Official docs

- **Finding:** Self-hosting total storage requirement: ~130 GB (planet + fonts + sprites + styles).
  - Source: https://medium.com/@vsvipul10/how-to-use-free-maps-for-any-app-replacing-google-maps-apis-b26f70ca5724 (corroborating)
  - Date: 2026
  - Type: Blog post

- **Fit for Caravan:** Good opt-in for "heavy self-hosters" — config option `TILE_SOURCE=pmtiles` pointing at a local or S3-hosted .pmtiles file. Not suitable as default (120 GB download barrier). Excellent for operators who want full offline/no-external-dependency operation.

### MapTiler (Key-Required Free Tier)

- **Finding:** Free tier: 100,000 API requests/month, 5,000 sessions/month, 100 MB storage, 1 file. Non-commercial use only. MapTiler logo required on map. No overages — service pauses if quota exceeded.
  - Source: https://www.maptiler.com/cloud/pricing/
  - Date: Verified 2026-06-10
  - Type: Official pricing page

- **Finding:** Includes vector and raster tiles, geocoding/search on free plan. API key required (account signup needed).
  - Source: https://www.maptiler.com/cloud/pricing/
  - Date: 2026-06-10
  - Type: Official pricing page

- **Fit for Caravan:** Optional upgrade path (`MAPTILER_KEY=xxx`). Non-commercial restriction is a concern for community/group deployments — users should read terms. Useful for operators who want a polished style or satellite imagery.

### Stadia Maps (Key-Required Free Tier)

- **Finding:** Free tier: 200,000 credits/month, no credit card required. Tile costs 1 credit each (raster/vector standard). Geocoding API v1 costs 20 credits/request. Autocomplete v1 costs 20 credits/request. **Commercial use not allowed on free tier.**
  - Source: https://stadiamaps.com/pricing/
  - Date: Verified 2026-06-10
  - Type: Official pricing page

- **Finding:** Localhost/dev access works **without** an API key (free, keyless, subject to strict rate limits). For production, API key required.
  - Source: https://docs.stadiamaps.com/authentication/
  - Date: Verified 2026-06-10
  - Type: Official docs

- **Finding:** Domain-based authentication available — `Origin`/`Referer` header validation, no extra app code needed. Good for browser-only apps.
  - Source: https://docs.stadiamaps.com/authentication/
  - Date: 2026-06-10
  - Type: Official docs

- **Fit for Caravan:** Non-commercial restriction on free tier is problematic — Caravan may run as a "service" even if non-commercial. Usable only for dev/testing without a key. API key upgrade valid if operator has a key.

### Raw OSM Raster Tiles (tile.openstreetmap.org)

- **Finding:** Explicitly **NOT for production apps**. Policy states these are for map editors, funded by OSM Foundation donations. Commercial services and those seeking donations should be "especially aware that access may be withdrawn at any point."
  - Source: https://operations.osmfoundation.org/policies/tiles/
  - Date: Verified 2026-06-10
  - Type: Official OSMF policy page

- **Finding:** Bulk downloading, offline caching, and pre-seeding tiles are forbidden. Interactive use only. No SLA. HTTPS required.
  - Source: https://operations.osmfoundation.org/policies/tiles/
  - Date: 2026-06-10
  - Type: Official OSMF policy page

- **Finding:** Attribution `© OpenStreetMap contributors` required with link to OpenStreetMap.org.
  - Source: https://operations.osmfoundation.org/policies/tiles/
  - Date: 2026-06-10
  - Type: Official OSMF policy page

- **Fit for Caravan:** Do not use. Policy prohibits app usage. Vector tiles preferred anyway (OpenFreeMap uses vector).

---

## Geocoding & Autocomplete

### Nominatim Public Instance

- **Finding:** **Autocomplete is explicitly forbidden.** Policy states: "Auto-complete search is not yet supported by Nominatim and you must not implement such a service on the client side using the API." This is a banned use.
  - Source: https://operations.osmfoundation.org/policies/nominatim/
  - Date: Verified 2026-06-10
  - Type: Official OSMF policy page

- **Finding:** Rate limit: absolute maximum 1 request per second. Requires valid HTTP Referer or User-Agent identifying the app. Results must be cached. "Apps must make sure they can switch the service at our request at any time."
  - Source: https://operations.osmfoundation.org/policies/nominatim/
  - Date: 2026-06-10
  - Type: Official OSMF policy page

- **Finding:** Forbidden: systematic queries, scraping, reselling results, using as primary service function, bulk geocoding beyond small one-time tasks.
  - Source: https://operations.osmfoundation.org/policies/nominatim/
  - Date: 2026-06-10
  - Type: Official OSMF policy page

- **Fit for Caravan:** Search-on-Enter reverse geocoding only (click map → address). Cannot be used for autocomplete at all. Suitable for infrequent reverse geocoding (user clicks a pin once). Not suitable for place search autocomplete.

### Photon (komoot)

- **Finding:** Public API at `https://photon.komoot.io`. Explicitly supports **typeahead/autocomplete** as a primary feature. No specific rate limit published — "extensive usage will be throttled or completely banned." Recommends max 1 req/sec.
  - Source: https://photon.komoot.io/
  - Date: Verified 2026-06-10
  - Type: Official API endpoint page

- **Finding:** No API key required. No registration. No stated daily quota. GeoJSON output. Multilingual results. Minutely OSM data updates. Supports forward geocoding and reverse geocoding.
  - Source: https://photon.komoot.io/
  - Date: 2026-06-10
  - Type: Official API endpoint

- **Finding:** Policy: "You can use the API for your project, but please be fair — extensive usage will be throttled." No SLA. "We do not guarantee for the availability and usage might be subject of change in the future."
  - Source: https://photon.komoot.io/
  - Date: 2026-06-10
  - Type: Official policy statement on API page

- **Finding (Self-hosting):** Planet-wide index requires ~95 GB disk space and 64 GB RAM minimum. Requires SSDs (NVMe preferred). Updates need 2x the DB size temporarily. Large extracts not recommended inside Docker; planet builds require dedicated infrastructure. Built on Elasticsearch/OpenSearch.
  - Source: https://github.com/komoot/photon (README)
  - Date: 2026
  - Type: Official GitHub README

- **Fit for Caravan:** **Primary zero-config geocoder.** Use debounced autocomplete at 300–500ms. Also handles reverse geocoding. Risk: no SLA, komoot can throttle without notice.

### Geoapify (Key-Required Free Tier)

- **Finding:** Free tier: 3,000 requests/day (~90,000/month). 1 credit per geocoding, reverse geocoding, or autocomplete request. API key required (free account).
  - Source: https://www.geoapify.com/pricing/
  - Date: Verified via search 2026-06-10
  - Type: Official pricing page (via search result)

- **Finding:** Supports autocomplete endpoint specifically. Provides GeoJSON responses. Commercial use appears allowed on free tier (not explicitly restricted in search results).
  - Source: https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
  - Date: 2026
  - Type: Official API docs

- **Fit for Caravan:** Best key-based free tier for small deployments. `GEOAPIFY_KEY=xxx` env var → 3,000 geocoding ops/day, covers a small friend group trivially.

### LocationIQ (Key-Required Free Tier)

- **Finding:** Free tier: 5,000 requests/day, 2 req/sec rate limit. Includes autocomplete endpoint. Commercial use allowed on free tier with attribution/link requirement.
  - Source: https://locationiq.com/pricing (via search result)
  - Date: Verified via search 2026-06-10
  - Type: Pricing page

- **Fit for Caravan:** Alternative key-based option. More daily requests than Geoapify but requires attribution link in UI.

### OpenCage (Key-Required Free Tier)

- **Finding:** Free trial: 2,500 requests/day, 1 req/sec. Autocomplete via separate "geosearch" service (not the main geocoding API endpoint). Free trial (implies it may convert to paid).
  - Source: https://opencagedata.com/pricing (via search result)
  - Date: Verified via search 2026-06-10
  - Type: Pricing page

- **Fit for Caravan:** Lowest daily quota of the key-based options; less preferred.

### Stadia Maps Geocoding (Key-Required)

- **Finding:** 200,000 credits/month free; geocoding API v1 costs 20 credits/request → ~10,000 geocoding requests/month on free tier. Autocomplete v1 also 20 credits/request → same effective limit. **Non-commercial only on free tier.**
  - Source: https://stadiamaps.com/pricing/
  - Date: 2026-06-10
  - Type: Official pricing

- **Fit for Caravan:** Non-commercial restriction limits suitability; skip as default recommendation.

### Pelias (Self-Hosted)

- **Finding:** Docker deployment requires 4 CPUs, 12 GB RAM minimum. Full planet build is impractical in Docker; interpolation build alone takes 6+ days single-threaded. Recommended to skip interpolation for first setup. Large extracts (>1 US state) not recommended in Docker.
  - Source: https://github.com/pelias/docker
  - Date: 2026
  - Type: Official GitHub repo

- **Fit for Caravan:** Not viable for a "tech-savvy friend with a server" deployment. Too much resource overhead for a small personal app. Not recommended.

### Zero-Config Degradation Pattern (Recommendation)

- **Default (no keys):** Autocomplete via debounced Photon (`photon.komoot.io`) at 300–500ms debounce, 1 req/sec max. Reverse geocoding (click → address) via Nominatim (`nominatim.openstreetmap.org`) on single click event (not continuous). Display attribution for both.
- **With `GEOAPIFY_KEY`:** Switch autocomplete and geocoding to Geoapify (3,000/day, more reliable, no rate-limit anxiety).
- **With `LOCATIONIQ_KEY`:** LocationIQ (5,000/day, commercial allowed with attribution).
- **Heavy self-host:** Run own Photon instance with regional extract (e.g., Europe ~20–40 GB index). No external dependencies.

---

## Places / POI Quick Assessment

### Overture Maps Places

- **Finding:** 64+ million POIs globally. Latest release: 2026-05-20. Distributed as GeoParquet on S3 and Azure. New provider BrightQuery added May 2026 (+250k US places). License: open, free.
  - Source: https://docs.overturemaps.org/blog/2026/05/20/release-notes/
  - Date: 2026-05-20
  - Type: Official release notes

- **Finding:** Not designed for real-time search. Download and query offline is possible but requires DuckDB or similar columnar query engine. No single planet file — partitioned by theme/type on cloud storage. Not practical for an embedded, lightweight self-hosted app.
  - Source: https://docs.overturemaps.org/guides/places/
  - Date: 2026-06-10
  - Type: Official docs

### Foursquare OS Places

- **Finding:** 100M+ global POIs under Apache 2.0 license. Updated monthly. Available on Hugging Face as Parquet (latest: `dt=2026-05-14`) and via Places Portal with Iceberg catalog. Free for commercial use.
  - Source: https://opensource.foursquare.com/os-places/
  - Date: Verified 2026-06-10
  - Type: Official page

- **Finding:** Like Overture, designed for bulk download and offline analysis, not real-time query. No embedded search API. Requires infrastructure to ingest and serve.
  - Source: https://foursquare.com/resources/blog/products/foursquare-open-source-places-a-new-foundational-dataset-for-the-geospatial-community/
  - Date: 2024 (launch)
  - Type: Official blog

### Assessment

Local/offline POI search from either Overture or FSQ OS Places is not practical for Caravan in its target deployment profile. Both datasets require columnar query engines and significant infrastructure. **Recommendation:** Leave POI discovery to geocoding search (Photon covers POIs + addresses) and to user-added activities. AI link-outs or external search links (Google Maps, OSM) can supplement. Do not attempt to bundle a POI database.

---

## Recommended Default + Upgrade Matrix

| Mode | Tiles | Geocoding / Autocomplete | Notes |
|---|---|---|---|
| Zero-config (no keys) | OpenFreeMap public | Photon (komoot) — debounced autocomplete | No key, no cost, works out of box |
| `MAPTILER_KEY` set | MapTiler tiles | Photon or MapTiler geocoding | MapTiler non-commercial only; check terms |
| `GEOAPIFY_KEY` set | OpenFreeMap tiles | Geoapify geocoding + autocomplete | 3k/day, most permissive free tier |
| `LOCATIONIQ_KEY` set | OpenFreeMap tiles | LocationIQ geocoding + autocomplete | 5k/day, attribution link required |
| Heavy self-host (PMTiles) | Self-hosted PMTiles (~120 GB) | Self-hosted Photon (region extract) | Full offline, no external deps |

---

## Implications for Other Decisions

### Caching / Proxying Through App Server

- **Nominatim requires caching** (policy). App server proxy should cache geocoding responses for repeated queries (e.g., same city name → same lat/lng).
- **Photon does not require caching per policy** but doing so would reduce load on their public instance and improve responsiveness. Redis or in-memory LRU cache for autocomplete results recommended.
- **Tiles**: OpenFreeMap tiles are served via Cloudflare CDN — no proxy needed. Self-hosted PMTiles serves via static HTTP — no proxy needed.
- **Do NOT proxy tile traffic through the app server** — defeats CDN caching, unnecessary bandwidth cost.

### Config Surface

- Needed env vars: `TILE_PROVIDER` (default: `openfreemap`), `GEOCODING_PROVIDER` (default: `photon`), `MAPTILER_KEY`, `GEOAPIFY_KEY`, `LOCATIONIQ_KEY`.
- Optional: `PHOTON_URL` (override to self-hosted instance), `PMTILES_PATH` (local pmtiles file path or URL).
- Never expose API keys to browser — geocoding requests should proxy through the app's own backend endpoint if key is present.

### Offline Map Tiles for PWA

- OSM raster tiles: offline prohibited by policy.
- OpenFreeMap: no offline bulk download provision.
- PMTiles: **designed for offline** — a complete .pmtiles file can be served from a local HTTP server with zero external requests. This is the correct path for offline PWA mode.
- React/browser: MapLibre GL JS supports `pmtiles://` protocol via the `pmtiles` JS library — serve tiles from local pmtiles file in offline mode.

### Vector vs Raster

- OpenFreeMap serves **vector tiles** — smaller payloads, client-side rendering, style is customizable, scales cleanly at any DPI. This is the right choice.
- Raster tiles are simpler to implement but heavier, non-customizable, and the OSM public instance prohibits app use.

---

## Open Questions / Unverified Claims

1. **OpenFreeMap long-term sustainability**: Project runs on $500/mo donations + Cloudflare sponsorship. No confirmed successor plan if maintainer (hyperknot) steps away. Should document this risk for users.

2. **Photon public instance reliability**: No SLA, no documented uptime history found. Community reports suggest it is generally reliable for low-volume use but may throttle unexpectedly. No way to verify current uptime SLA.

3. **Stadia Maps free tier — "non-commercial" definition**: Does running a self-hosted app for a friend group constitute "commercial use"? Not explicitly defined. Needs legal review or direct clarification if Stadia is used.

4. **MapTiler free tier — non-commercial restriction**: Same ambiguity. The Caravan deployment (even self-hosted, non-monetized) may technically be a "service."

5. **react-maplibre v1 stability**: Spun off from react-map-gl; GitHub activity appears healthy but the package is relatively new as a standalone. Watch for issues with MapLibre GL JS v6 compatibility when v6 goes stable.

6. **Photon self-host regional index sizes**: The 95 GB figure is for planet; no reliable current figure found for regional extracts (e.g., Western Europe, US). Planet doubles in size during updates (need 190 GB temporarily).

7. **MapLibre v6 release timing**: Expected "shortly" per April 2026 newsletter. Pre-release v6.0.0-13 active. No firm date. react-maplibre v1 targets maplibre-gl >= 4.0 — compatibility with v6 needs verification when released.

8. **Geoapify commercial use**: Free tier commercial use allowance was inferred from search results describing it as suitable for apps — not verified from the pricing page's exact terms language.

---

## Sources

1. https://www.npmjs.com/package/maplibre-gl — MapLibre GL JS current version (v5.24.0) — accessed 2026-06-10
2. https://maplibre.org/news/2026-05-02-maplibre-newsletter-april-2026/ — MapLibre v5 final, v6 pre-release status — accessed 2026-06-10
3. https://github.com/maplibre/maplibre-gl-js/issues/6427 — MapLibre v6 breaking changes tracking — accessed 2026-06-10
4. https://visgl.github.io/react-maplibre/docs — @vis.gl/react-maplibre official docs — accessed 2026-06-10
5. https://github.com/visgl/react-maplibre — react-maplibre GitHub (spin-off rationale) — accessed 2026-06-10
6. https://www.npmjs.com/package/react-map-gl — react-map-gl v8.1.1 maintenance status — accessed 2026-06-10
7. https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/ — MapLibre clustering example — accessed 2026-06-10
8. https://openfreemap.org/ — OpenFreeMap usage policy, no-key/no-limit claim — accessed 2026-06-10
9. https://blog.hyperknot.com/p/openfreemap-survived-100000-requests — OpenFreeMap stress test & sustainability — accessed 2026-06-10
10. https://github.com/hyperknot/openfreemap — OpenFreeMap self-hosting OSS code — accessed 2026-06-10
11. https://docs.protomaps.com/basemaps/downloads — PMTiles planet file 120 GB, daily builds — accessed 2026-06-10
12. https://docs.protomaps.com/pmtiles/ — PMTiles serving via HTTP Range requests — accessed 2026-06-10
13. https://www.maptiler.com/cloud/pricing/ — MapTiler free tier: 100k req/mo, non-commercial — accessed 2026-06-10
14. https://stadiamaps.com/pricing/ — Stadia Maps 200k credits/mo, non-commercial restriction — accessed 2026-06-10
15. https://docs.stadiamaps.com/authentication/ — Stadia localhost no-key policy — accessed 2026-06-10
16. https://docs.stadiamaps.com/limits/ — Stadia Maps service limits — accessed 2026-06-10
17. https://operations.osmfoundation.org/policies/tiles/ — OSM raster tile usage policy (no prod apps) — accessed 2026-06-10
18. https://operations.osmfoundation.org/policies/nominatim/ — Nominatim policy (autocomplete forbidden, 1 req/s max) — accessed 2026-06-10
19. https://photon.komoot.io/ — Photon geocoder usage policy & autocomplete support — accessed 2026-06-10
20. https://github.com/komoot/photon — Photon self-hosting: 95 GB planet, 64 GB RAM — accessed 2026-06-10
21. https://www.geoapify.com/pricing/ — Geoapify 3,000 req/day free tier — accessed 2026-06-10
22. https://locationiq.com/pricing — LocationIQ 5,000 req/day free tier — accessed 2026-06-10
23. https://opencagedata.com/pricing — OpenCage 2,500 req/day free trial — accessed 2026-06-10
24. https://docs.overturemaps.org/blog/2026/05/20/release-notes/ — Overture Maps May 2026 release notes — accessed 2026-06-10
25. https://opensource.foursquare.com/os-places/ — Foursquare OS Places dataset — accessed 2026-06-10
26. https://github.com/pelias/docker — Pelias self-host requirements — accessed 2026-06-10
27. https://mapsplatform.google.com/pricing/ — Google Maps Platform pricing, $200 credit removed — accessed 2026-06-10
28. https://www.mapbox.com/pricing — Mapbox free tier: 50k map loads/mo — accessed 2026-06-10
29. https://www.maptiler.com/news/2021/01/maplibre-mapbox-gl-open-source-fork/ — MapLibre/Mapbox fork history — accessed 2026-06-10
30. https://wiki.openstreetmap.org/wiki/Nominatim_usage_policy — OSM wiki Nominatim policy corroboration — accessed 2026-06-10
