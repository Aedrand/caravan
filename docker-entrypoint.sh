#!/bin/sh
#
# Caravan container entrypoint (TD-4).
#
# Litestream streaming backup is STRICTLY OPT-IN. When LITESTREAM_REPLICA_URL is
# unset the app boots exactly as it always has: `node dist/index.js`, no extra
# process, no behaviour change. Setting LITESTREAM_REPLICA_URL turns on
# continuous replication of the SQLite database to object storage and wraps the
# app in Litestream's process supervisor.
#
# See docs/self-hosting/backups.md for setup, restore, and upgrade guidance.

set -eu

# DATA_DIR is set in the Dockerfile (/app/data) but default defensively so the
# script is also runnable outside the image.
DATA_DIR="${DATA_DIR:-/app/data}"
DB_PATH="${DATA_DIR}/caravan.db"
LITESTREAM_CONFIG="${LITESTREAM_CONFIG:-/etc/litestream.yml}"

log() {
  # ISO-8601 UTC timestamp; one line to stdout so it interleaves with app logs.
  printf '%s entrypoint: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# ---------------------------------------------------------------------------
# Default path: no replica configured, or Litestream not installed → run as-is.
# ---------------------------------------------------------------------------
if [ -z "${LITESTREAM_REPLICA_URL:-}" ]; then
  log "LITESTREAM_REPLICA_URL not set — starting without backup replication."
  exec node dist/index.js
fi

if ! command -v litestream >/dev/null 2>&1; then
  # Opt-in was requested but the binary is missing (e.g. a stripped image).
  # Fail loud rather than silently dropping the backup the operator asked for.
  log "ERROR: LITESTREAM_REPLICA_URL is set but the 'litestream' binary was not found."
  log "ERROR: refusing to start without the requested backup replication."
  exit 1
fi

log "LITESTREAM_REPLICA_URL is set — backup replication enabled."

# ---------------------------------------------------------------------------
# Restore-on-empty: if there is no local database yet (fresh volume / new
# container) try to pull the latest snapshot from the replica before boot.
# ---------------------------------------------------------------------------
if [ ! -f "${DB_PATH}" ]; then
  log "No local database at ${DB_PATH} — attempting restore from replica."
  # -if-db-not-exists : exit 0 (skip) if the DB appeared in the meantime.
  # -if-replica-exists: exit 0 (and log "no matching backups") when the replica
  #                     is empty — i.e. a genuinely fresh install. The app then
  #                     creates and migrates a new DB on boot.
  if litestream restore \
      -config "${LITESTREAM_CONFIG}" \
      -if-db-not-exists \
      -if-replica-exists \
      "${DB_PATH}"; then
    if [ -f "${DB_PATH}" ]; then
      log "Restore complete — recovered database from replica."
    else
      log "No existing backup in replica — starting fresh; app will migrate a new DB."
    fi
  else
    # A real failure (bad credentials, unreachable bucket, corrupt snapshot).
    # Surface it instead of booting against a half-restored / empty DB.
    log "ERROR: litestream restore failed (network/credentials/corruption?)."
    exit 1
  fi
else
  log "Existing database found at ${DB_PATH} — skipping restore."
fi

# ---------------------------------------------------------------------------
# Run the app under Litestream supervision. `replicate -exec` starts the app,
# streams WAL frames to the replica, and exits when the app exits (and forwards
# signals), so the container lifecycle stays tied to the Node process.
# ---------------------------------------------------------------------------
log "Starting app under Litestream supervision."
exec litestream replicate \
  -config "${LITESTREAM_CONFIG}" \
  -exec "node dist/index.js"
