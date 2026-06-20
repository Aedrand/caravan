# Maps & places (provider configuration)

Caravan's map and place search are **key-optional by default** (TD-5). A fresh
deployment needs no map account, no API key, and no registration: tiles come
from [OpenFreeMap](https://openfreemap.org) and geocoding from the public
[Photon](https://photon.komoot.io) instance. You can swap in keyed providers for
higher limits or nicer styles, or go fully self-hosted for an offline-capable,
no-third-party setup.

Everything is configured with environment variables. All are optional.

## How it works

- **Tiles load directly in the browser** from the configured tile provider's CDN
  (never proxied through Caravan — that would defeat CDN caching). The server
  only computes the *style URL* (injecting any tile key server-side) and the
  attribution string, exposed at `GET /api/geo/map-config`.
- **All geocoding flows through the server** at `GET /api/geo/search` and
  `GET /api/geo/reverse`, even keyless Photon. This keeps API keys off the
  browser, caches responses in SQLite (`geocode_cache`), enforces one
  per-deployment rate limit, and lets you swap providers without touching the
  client.

## Geocoding / place search

| Variable | Default | Notes |
|---|---|---|
| `GEOCODING_PROVIDER` | `photon` | `photon` \| `geoapify` \| `locationiq` \| `nominatim` |
| `PHOTON_URL` | `https://photon.komoot.io` | Point at a self-hosted Photon for the heavy/offline path |
| `GEOAPIFY_KEY` | — | Preferred keyed upgrade (3k req/day free) |
| `LOCATIONIQ_KEY` | — | 5k/day; LocationIQ's terms require an attribution link |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Reverse geocoding only — **autocomplete against public Nominatim is forbidden by policy** |
| `GEO_RATE_LIMIT_PER_MINUTE` | `120` | Max upstream geocoder calls per minute, per deployment |

If you set a keyed provider but omit its key, Caravan **falls back to keyless
Photon** rather than failing — so a half-configured deployment still works.

The client debounces autocomplete (≥300 ms) and skips queries under two
characters, keeping you inside Photon's ~1 req/s courtesy budget. Responses are
cached for 7 days (search) / 30 days (reverse).

## Map tiles

| Variable | Default | Notes |
|---|---|---|
| `TILE_PROVIDER` | `openfreemap` | `openfreemap` \| `maptiler` \| `stadia` |
| `MAPTILER_KEY` | — | Nicer styles; non-commercial free tier — read MapTiler's terms |
| `STADIA_KEY` | — | Alternative styles; read Stadia's terms |

A keyed tile provider without its key falls back to OpenFreeMap.

## Attribution

Attribution is **not optional** — it's a license condition of every provider
(OpenStreetMap data, OpenMapTiles styles, OpenFreeMap/MapTiler/Stadia tiles).
Caravan renders it as a visible strip beneath the map, built server-side from
the active provider. Don't remove it.

## Heavy / offline self-host mode (PMTiles + self-hosted Photon)

Public tile and geocoding instances are donation-funded with no SLA, and public
tile sources prohibit bulk caching — so they can't back an offline PWA. The
clean exit hatch is to host your own:

- **Tiles:** serve a [PMTiles](https://docs.protomaps.com/pmtiles/) basemap as a
  single static file over HTTP range requests. The full planet is ~120 GB;
  regional extracts are far smaller. Point `TILE_PROVIDER` at your PMTiles style
  (a future provider option / custom style URL) once hosted. This is also the
  only policy-clean path to **offline map tiles** for the PWA (v1.2).
- **Geocoding:** run a regional [Photon](https://github.com/komoot/photon) index
  and set `PHOTON_URL` to it. No key, no third-party calls, no rate-limit risk.

This mode trades disk and setup effort for full independence and offline
capability. It is documented, not default — most deployments are happy on the
keyless public providers.
