# Caravan

A free, open-source, self-hostable travel planner for groups of friends —
collaborative itineraries, group voting, expense splitting, and AI assistance,
run by one tech-savvy friend for their circle.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

> ⚠️ **Early development.** Caravan is under active development — the schema,
> APIs, and UI are still in flux and may change without notice, and it isn't
> ready for production use yet. You're welcome to look around, but it's **not
> open for outside contributions right now** — please hold off on issues and
> pull requests until things settle (around the first tagged release). The
> [`CONTRIBUTING`](CONTRIBUTING.md) guide is here for when that opens up.

Caravan is one container: a Hono + SQLite server that serves a React SPA. No
external database, cache, or queue — one process, one volume. Bring your own
domain and a reverse proxy and a whole friend group can plan a trip together,
live.

## Quick start

With Docker Compose (recommended) using the bundled [`compose.yml`](compose.yml):

```bash
curl -O https://raw.githubusercontent.com/Aedrand/caravan/main/compose.yml
docker compose up -d
```

…or a one-liner with `docker run`:

```bash
docker run -d --name caravan \
  -p 3000:3000 \
  -v caravan-data:/app/data \
  -e BASE_URL="https://caravan.example.com" \
  --restart unless-stopped \
  ghcr.io/aedrand/caravan:latest
```

Caravan is now on <http://localhost:3000> (`/api/health` returns `ok`). The data
volume `/app/data` holds the SQLite database and the auto-generated secret key —
back that directory up and you've backed up the whole instance.

**First run:** the first account you register becomes the instance admin, after
which registration is invite-only. To pre-seed the admin unattended instead, set
`ADMIN_EMAIL` and `ADMIN_PASSWORD` before first boot. Details in the
[install guide](docs/self-hosting/install.md#first-run-creating-the-admin).

For a real deployment behind HTTPS, set `BASE_URL` to your public URL and put a
reverse proxy in front — see the [docs](#documentation) below.

## Documentation

**Self-hosting**

- [Install & operate](docs/self-hosting/install.md) — Compose / `docker run`,
  first-run admin, volume layout, health check, upgrades & rollback.
- [Configuration reference](docs/self-hosting/configuration.md) — every
  environment variable, generated from `apps/server/src/config.ts`.
- [Reverse proxy & TLS](docs/self-hosting/reverse-proxy.md) — Caddy and Traefik
  examples (with WebSocket proxying for live sync).
- [Backups](docs/self-hosting/backups.md) — snapshots and optional Litestream
  streaming replication.

**Project**

- [`PROJECT.md`](PROJECT.md) — vision, positioning, feature arc. Start here.
- [`docs/decisions.md`](docs/decisions.md) — product + technical decision log.
- [`docs/plan.md`](docs/plan.md) — implementation plan: milestones, work tracks,
  contracts, risks.
- [`docs/product-brief.md`](docs/product-brief.md) — market landscape and feature
  detail.

**Contributing**

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, repo layout, quality gates,
  Conventional Commits, and the DCO sign-off requirement.

## License

Caravan is licensed under the [GNU AGPL-3.0](LICENSE). If you run a modified
version as a network service, the AGPL requires you to offer your users the
modified source.
