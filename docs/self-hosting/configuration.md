# Configuration reference

Every Caravan setting is an environment variable. The defaults are deliberately
aggressive: the only secret (`SECRET_KEY`) is auto-generated and persisted to the
data volume on first boot, so the true minimum configuration is **zero env vars**
— `docker compose up -d` just works. Behind a real domain you'll usually set only
`BASE_URL` (and maybe pre-seed an admin).

The source of truth is the Zod schema in
[`apps/server/src/config.ts`](../../apps/server/src/config.ts); this table is
generated from it. If the two ever disagree, the schema wins — open an issue.

> **Types:** `string`, `number` (positive integer unless noted), `enum` (one of
> the listed values), `url` (must parse as an absolute URL). "—" in the Default
> column means the variable is optional with no default.

## Core

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | enum: `development` \| `production` \| `test` | `development` | Runtime mode. The image sets `production`. In `production` only `BASE_URL` is a trusted auth origin; dev/test also trust the Vite origin. |
| `PORT` | number | `3000` | TCP port the server listens on. The container exposes `3000`; map it on the host as you like. |
| `DATA_DIR` | string (path) | `./data` (image: `/app/data`) | Directory holding the SQLite database (`caravan.db`), the generated `secret_key`, and future uploads. The one directory to back up. |
| `BASE_URL` | url | `http://localhost:${PORT}` | Public URL used in links/emails and as the trusted auth origin. **Set this to your real `https://…` URL behind a reverse proxy** or sign-in will reject cross-origin requests. |
| `LOG_LEVEL` | enum: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` | `info` | Pino log verbosity. |
| `SECRET_KEY` | string (min 32 chars) | auto-generated → `DATA_DIR/secret_key` | Session/JWT signing key. Leave unset and Caravan generates one on first boot and persists it (mode `600`). Set it explicitly only if you want to manage it externally. **Rotating it invalidates all sessions.** |
| `WEB_DIST` | string (path) | `../web/dist` (image: `/app/apps/web/dist`) | Location of the built SPA, served statically in production. The image sets this correctly; you should not need to change it. |
| `TRUST_PROXY` | boolean | `false` | Whether to honour the `X-Forwarded-For` header for client identity (used by the rate limiter). Set `true` **only** when behind a trusted reverse proxy so `X-Forwarded-For` is honored; leaving it on for a directly-exposed port lets clients spoof the header and dodge rate limits. |

## Admin bootstrap

Optional first-run admin. If both are set **and no users exist yet**, the account
is created at boot. Once any user exists, both are ignored. If you leave them
unset, the **first person to register becomes the instance admin** instead.
See [install.md](install.md#first-run-creating-the-admin) for the two flows.

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `ADMIN_EMAIL` | email | — | Email for the pre-seeded admin account (first boot only). |
| `ADMIN_PASSWORD` | string (min 8 chars) | — | Password for the pre-seeded admin account (first boot only). Use a strong value and rotate it after first login. |

## Rate limiting

Per-client (per-IP) request caps. Disabled automatically when `NODE_ENV=test`.
Defaults are generous enough that normal use never trips them.

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `RATE_LIMIT_WINDOW_MS` | number (ms) | `60000` | Length of the sliding rate-limit window, in milliseconds (default 1 minute). |
| `RATE_LIMIT_MAX` | number | `300` | Max requests per window per client across `/api/*`. |
| `RATE_LIMIT_AUTH_MAX` | number | `20` | Stricter per-window cap applied to credential POSTs under `/api/auth/*` (sign-in / sign-up brute-force guard). Frequent `get-session` reads fall under the general limiter, not this one. |

## Maps & geocoding

All optional — the defaults are keyless and work out of the box (Photon for
geocoding, OpenFreeMap for tiles). Add a key only to upgrade quality or move off
the shared public endpoints. See [Track C / TD-5] in the plan for the rationale.

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `GEOCODING_PROVIDER` | enum: `photon` \| `geoapify` \| `locationiq` \| `nominatim` | `photon` | Forward/reverse geocoder. Photon (default) is keyless; `geoapify` and `locationiq` need a key; `nominatim` is for reverse geocoding only. |
| `PHOTON_URL` | url | `https://photon.komoot.io` | Photon base URL. Point at a self-hosted regional Photon for heavier use instead of the donated public instance. |
| `GEOAPIFY_KEY` | string | — | Geoapify API key — the preferred keyed upgrade (≈3k req/day free). |
| `LOCATIONIQ_KEY` | string | — | LocationIQ API key (≈5k/day; attribution link required by their terms). |
| `NOMINATIM_URL` | url | `https://nominatim.openstreetmap.org` | Nominatim base URL. Only legitimate for reverse geocoding; respect OSM's usage policy if you point at the public instance. |
| `GEOCODING_LANGUAGE` | string | `en` | Preferred place-name language. Returns Latin/English names where the underlying data has them (e.g. `金龍山 浅草寺` → `Sensō-ji`), falling back to native names otherwise; results stay user-editable. Set empty to always use native names. Photon covers en/de/fr; keyed providers cover more. |
| `GEO_RATE_LIMIT_PER_MINUTE` | number | `120` | Per-deployment cap on upstream geocoder requests per minute (protects the donated providers). |
| `TILE_PROVIDER` | enum: `openfreemap` \| `maptiler` \| `stadia` | `openfreemap` | Vector tile source for the browser map. OpenFreeMap is keyless. |
| `MAPTILER_KEY` | string | — | MapTiler API key — nicer tile styles (non-commercial free tier). |
| `STADIA_KEY` | string | — | Stadia Maps API key — alternative keyed tile styles. |

## Backups (Litestream)

Opt-in continuous replication. Off by default — see
[backups.md](backups.md) for the full guide, including the AWS credential env
vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) that Litestream reads
directly.

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `LITESTREAM_REPLICA_URL` | string | — | Litestream replica target (e.g. `s3://my-bucket/caravan`). Read by the Docker entrypoint, **not** by the app process. Setting it turns on streaming backup + fresh-volume auto-restore. |

> The image also honours Litestream's own env vars at runtime
> (`LITESTREAM_CONFIG` is preset to `/etc/litestream.yml`, and the AWS
> credentials above). Those are documented in [backups.md](backups.md), not here,
> because they belong to Litestream rather than Caravan's schema.
