# Backups

Caravan keeps everything in one SQLite database — `caravan.db` inside the data
volume (`/app/data` in the container). Backing that file up is the whole job.

There are two layers, and most people only need the first:

1. **Snapshots** — periodic copies of the database (a file you can stash
   anywhere). Good enough for a friends-and-family trip planner where losing the
   last few hours of edits is merely annoying.
2. **Litestream streaming replication** (opt-in) — continuously streams the
   database's write-ahead log to object storage so you can recover to within a
   second or so of a crash, and a brand-new container can rebuild itself from the
   replica automatically.

Litestream is **off by default**. If you do nothing, Caravan runs exactly as
before and your data lives only in the Docker volume.

> One hard rule regardless of strategy: **never put `caravan.db` on a network
> filesystem (NFS/SMB).** SQLite's locking is unreliable there and you risk
> corruption. Keep the volume on local disk.

---

## Which one do I need?

| Your situation | Recommended |
| --- | --- |
| A few friends, you snapshot the volume now and then, losing a few hours is fine | **Snapshots** (below) — skip Litestream |
| You want point-in-time recovery, or the host could die and you need a fresh box to self-heal from storage | **Litestream** to S3 / Backblaze B2 |
| Regulated / can't lose any data, many concurrent editors | Consider Postgres instead — but that's a non-goal for v1 |

If you're unsure, start with snapshots. You can turn on Litestream later without
migrating anything.

---

## Snapshots (the simple path)

A snapshot is just a consistent copy of `caravan.db`. Because Caravan runs in
WAL mode you should **not** plain-`cp` the live file (you'd miss the WAL). Use
SQLite's online-backup, which is safe while the app is running:

```bash
# From the host, against the running container. Writes a single clean .db file.
docker compose exec caravan \
  sqlite3 /app/data/caravan.db ".backup '/app/data/backup.db'"

# Copy it out of the volume to wherever you keep backups.
docker compose cp caravan:/app/data/backup.db ./caravan-$(date +%F).db
```

`VACUUM INTO` produces an equivalent, compacted copy if you prefer:

```bash
docker compose exec caravan \
  sqlite3 /app/data/caravan.db "VACUUM INTO '/app/data/backup.db'"
```

Automate it with `cron` and rotate the copies, or snapshot the whole
`caravan-data` volume with your host's backup tool while honouring the same
"don't grab a half-written WAL" caveat (stopping the container briefly is the
foolproof version).

> A one-click **"download backup"** button in the admin panel is planned (it will
> run `VACUUM INTO` server-side and stream the file to you). Until that ships,
> use the commands above.

To **restore** a snapshot, stop the container, drop the file in as
`caravan.db`, and start again:

```bash
docker compose down
docker compose cp ./caravan-2026-06-27.db caravan:/app/data/caravan.db   # see note*
docker compose up -d
```

\* If the volume is empty you may need a throwaway `docker run` with the volume
mounted to place the file, since `cp` needs a container. The cleanest approach is
to copy into the volume while the container is stopped but present.

---

## Litestream (continuous replication)

[Litestream](https://litestream.io) tails the SQLite WAL and ships changes to
object storage every second. Caravan bundles the Litestream binary in the image
and wires it up through `docker-entrypoint.sh`. You turn it on with **one
environment variable**.

### What turning it on does

- On boot, if there is **no** local `caravan.db` (fresh volume / new host),
  the entrypoint runs `litestream restore` to rebuild it from the replica. An
  empty replica (genuinely first install) is fine — the app just creates a new
  DB and migrates it.
- The app then runs **under Litestream supervision**
  (`litestream replicate -exec "node dist/index.js"`): one process supervises
  Node and streams the WAL. No extra container, no co-process to babysit.

### Setup

Set `LITESTREAM_REPLICA_URL` plus the storage credentials. Litestream reads the
standard AWS env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) directly —
they work for S3, Backblaze B2, MinIO, Tigris and other S3-compatible stores.

**Amazon S3** (`compose.yml` → `services.caravan.environment`):

```yaml
    environment:
      LITESTREAM_REPLICA_URL: "s3://my-bucket/caravan"
      AWS_ACCESS_KEY_ID: "AKIA…"
      AWS_SECRET_ACCESS_KEY: "…"
      # AWS_REGION: "us-east-1"   # optional; some setups need it
```

**Backblaze B2** (S3-compatible endpoint — note the `?endpoint=` query param and
the region in the host):

```yaml
    environment:
      LITESTREAM_REPLICA_URL: "s3://my-bucket/caravan?endpoint=s3.us-west-004.backblazeb2.com"
      AWS_ACCESS_KEY_ID: "<your B2 keyID>"
      AWS_SECRET_ACCESS_KEY: "<your B2 applicationKey>"
```

Use the endpoint and region shown in your B2 bucket's details. Create the bucket
first; Litestream writes objects under the path you give in the URL.

Then `docker compose up -d`. On the next boot you'll see entrypoint log lines
about restore (or "no existing backup") followed by Litestream's replication
output.

> Tuning lives in `litestream.yml` (baked into the image at
> `/etc/litestream.yml`): `sync-interval` controls how often WAL frames upload
> (default `1s`), and the `snapshot` block controls full-snapshot cadence and
> retention. The defaults are sensible; raise `sync-interval` to cut request
> counts on metered storage.

### Cost

For a SQLite database this small, object-storage cost is effectively a rounding
error. Storage is a few cents per GB-month and a Caravan DB is typically tens of
MB; the request count is dominated by the per-second WAL uploads, which are tiny
PUTs.

- **Backblaze B2** is the cheapest practical option (~$6/TB-month storage, and a
  generous free daily download/transaction allowance) — well under a dollar a
  month for one Caravan instance, often effectively free.
- **Amazon S3** works identically but costs more per GB and per request; still
  pennies at this scale, but B2 (or a self-hosted MinIO) is the better-value
  pick for a hobby deployment.

If request volume ever bothers you, bump `sync-interval` to `10s` — you trade a
slightly larger data-loss window for ~10× fewer uploads.

### Restore (manual)

The fresh-volume auto-restore covers disaster recovery, but you can restore by
hand too — e.g. to inspect a copy or seed a new environment. Inside a container
that has the same `LITESTREAM_REPLICA_URL` + credentials in its environment:

```bash
litestream restore -config /etc/litestream.yml -o /app/data/restored.db /app/data/caravan.db
```

Or point straight at the replica URL without the config file:

```bash
litestream restore -o ./restored.db s3://my-bucket/caravan
```

`-if-replica-exists` makes "no backups found" a success (exit 0) instead of an
error — that's the flag the entrypoint uses for the fresh-install case.

---

## Upgrade / rollback playbook

Caravan upgrades are "pull the new image, restart"; migrations run automatically
on boot and fail fast (the container exits non-zero rather than start on a broken
schema).

**Upgrade**

1. Pin a tag in `compose.yml` (e.g. `image: ghcr.io/aedrand/caravan:v1.3.0`)
   rather than `latest`, so you always know what you're running.
2. **Take a snapshot first** (above) — migrations can be one-way.
3. `docker compose pull && docker compose up -d`.
4. Watch the logs; a healthy boot runs migrations then serves on `:3000`. With
   Litestream on, replication resumes automatically.

**Rollback**

1. Set `compose.yml` back to the previous tag and `docker compose up -d`.
2. **If the new version migrated the schema**, the old binary can't read the new
   DB. Restore the pre-upgrade snapshot (or `litestream restore` to a point in
   time before the upgrade) into `caravan.db` before starting the old image. This
   is why step 2 of the upgrade matters.

**WAL / volume notes**

- The WAL (`caravan.db-wal`) and shared-memory (`caravan.db-shm`) files live
  next to the DB in the volume. When restoring a snapshot by hand, remove any
  stale `-wal`/`-shm` files so SQLite doesn't replay an old WAL over your restore.
- Litestream needs a clean shutdown to checkpoint cleanly; `docker compose down`
  (which sends SIGTERM) lets the supervised process exit gracefully. After an
  unclean crash, Litestream's restore reconstructs from the last snapshot + WAL
  in the replica — that's the whole point of running it.
