# Install & operate

Caravan ships as a single container: one process, one SQLite database, one
volume. There is no separate database server, cache, or queue to run. This guide
covers a from-scratch install, first-run admin setup, and day-2 operations
(health checks, upgrades, rollback).

- **Configuration reference:** [configuration.md](configuration.md)
- **Reverse proxy / TLS:** [reverse-proxy.md](reverse-proxy.md)
- **Backups & restore:** [backups.md](backups.md)

## Prerequisites

- A Linux host (anything that runs Docker; a 1 GB VPS is plenty for a group of
  friends).
- **Docker** with the **Compose** plugin (`docker compose …`). Compose is the
  recommended path; a plain `docker run` alternative is below.
- A domain + reverse proxy if you want HTTPS and a real URL (recommended for
  anything but local testing — see [reverse-proxy.md](reverse-proxy.md)).
- Local disk for the data volume. **Never** place the database on NFS/SMB —
  SQLite's locking is unreliable there (see [backups.md](backups.md)).

The image is published to GitHub Container Registry as
`ghcr.io/aedrand/caravan`. Pin a version tag (e.g. `:v1.2.3`) for stable
deployments; `latest` floats.

## Quick start (Docker Compose)

The repo ships a ready [`compose.yml`](../../compose.yml). The shortest path:

```bash
# Grab just the compose file (or clone the repo)
curl -O https://raw.githubusercontent.com/Aedrand/caravan/main/compose.yml

docker compose up -d
```

Caravan is now on <http://localhost:3000>. Check it:

```bash
curl http://localhost:3000/api/health      # {"status":"ok","service":"caravan"}
```

The bundled compose file uses the named volume `caravan-data` mounted at
`/app/data`, restarts unless stopped, and sets `BASE_URL` to
`http://localhost:3000`. For a real deployment, edit it:

```yaml
services:
  caravan:
    image: ghcr.io/aedrand/caravan:v1.2.3   # pin a tag
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - caravan-data:/app/data
    environment:
      BASE_URL: "https://caravan.example.com"   # your real URL (see reverse-proxy.md)
      # Optional first-run admin (see "First run" below):
      # ADMIN_EMAIL: "you@example.com"
      # ADMIN_PASSWORD: "a-strong-password"

volumes:
  caravan-data:
```

Then `docker compose up -d` again to apply.

> Behind a reverse proxy you typically **don't** publish port 3000 to the world —
> bind it to localhost (`"127.0.0.1:3000:3000"`) and let the proxy reach it. See
> [reverse-proxy.md](reverse-proxy.md).

## Alternative: `docker run`

No Compose? One command, one named volume:

```bash
docker run -d --name caravan \
  -p 3000:3000 \
  -v caravan-data:/app/data \
  -e BASE_URL="https://caravan.example.com" \
  --restart unless-stopped \
  ghcr.io/aedrand/caravan:latest
```

Add `-e ADMIN_EMAIL=… -e ADMIN_PASSWORD=…` to pre-seed the admin on first boot,
or `-e LITESTREAM_REPLICA_URL=… -e AWS_ACCESS_KEY_ID=… -e AWS_SECRET_ACCESS_KEY=…`
to turn on streaming backups ([backups.md](backups.md)).

## First run: creating the admin

Caravan is invite-only by design (PD-10): after the instance has its admin, new
accounts arrive through trip invite links, not an open registration page. There
are two ways to get that first admin:

1. **Pre-seed from env (unattended).** Set `ADMIN_EMAIL` **and**
   `ADMIN_PASSWORD` before the first boot. If no users exist yet, the admin
   account is created automatically at startup. Both vars are ignored once any
   user exists, so it's safe to leave them in your compose file. Log in, then
   rotate the password.
2. **First registration becomes admin (interactive).** Leave the admin env vars
   unset. Open the app, register the very first account — that user is
   automatically the instance admin. Registration then closes for everyone else.

Either way, the admin manages the instance from the **`/admin`** panel (instance
settings, member/trip overview, and a one-click `VACUUM INTO` backup download).
The admin can re-open public registration there if they ever want to.

## Data & volume layout

Everything lives under `DATA_DIR` (the volume mounted at `/app/data` in the
container):

| Path | What it is |
| --- | --- |
| `/app/data/caravan.db` | The SQLite database — all trips, members, activities, polls, expenses, sessions. |
| `/app/data/caravan.db-wal`, `…-shm` | SQLite write-ahead log and shared-memory files (WAL mode). They live next to the DB; don't copy the `.db` without them while the app runs — see [backups.md](backups.md). |
| `/app/data/secret_key` | Auto-generated session signing key (mode `600`), created on first boot if `SECRET_KEY` is unset. |

Back up the **whole `/app/data` directory** (or use the SQLite online-backup /
Litestream methods in [backups.md](backups.md)). That single directory is your
entire instance.

## Health check

The server exposes an unauthenticated liveness endpoint:

```
GET /api/health  →  200 {"status":"ok","service":"caravan"}
```

The container has a built-in Docker `HEALTHCHECK` that polls it every 30s, so
`docker ps` shows `healthy`/`unhealthy` and orchestrators can gate on it. Point
external uptime monitors at the same URL.

## Loading demo data (optional)

To populate a fresh instance with a sample trip (a few members, a dated
itinerary with real places, an idea, and a poll), run the seed script against the
same `DATA_DIR`. It's safe to re-run — it skips if a trip named "Demo Trip"
already exists.

From a checkout of the repo (see [CONTRIBUTING.md](../../CONTRIBUTING.md) for dev
setup):

```bash
cd apps/server
DATA_DIR=./data pnpm seed
```

It prints the demo admin's email and password to sign in with. This is meant for
demos and local development, not production instances.

## Upgrading

Upgrades are "pull the new image, restart." Migrations run automatically on boot
and **fail fast** — the container exits non-zero rather than start on a broken
schema.

```bash
# 1. Pin the new tag in compose.yml, e.g. image: ghcr.io/aedrand/caravan:v1.3.0
# 2. ALWAYS take a backup first — migrations can be one-way:
docker compose exec caravan \
  sqlite3 /app/data/caravan.db "VACUUM INTO '/app/data/backup.db'"
docker compose cp caravan:/app/data/backup.db ./caravan-$(date +%F).db
# 3. Pull + restart:
docker compose pull && docker compose up -d
# 4. Watch the logs; a healthy boot runs migrations then serves on :3000.
docker compose logs -f caravan
```

With Litestream enabled, replication resumes automatically after the restart.

## Rollback

If a new version misbehaves, set `compose.yml` back to the previous tag and
`docker compose up -d`. **Caveat:** if the new version migrated the schema, the
old binary can't read the new database — restore the pre-upgrade backup into
`caravan.db` before starting the old image. The full upgrade/rollback playbook,
including WAL-file handling and Litestream point-in-time restore, is in
[backups.md](backups.md#upgrade--rollback-playbook).
