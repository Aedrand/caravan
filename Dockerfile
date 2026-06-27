# syntax=docker/dockerfile:1

# node:24-slim (glibc) over alpine: better-sqlite3 prebuilds apply on both
# amd64 and arm64 — no compiler toolchain needed in the image build.
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo
# manifests only — this layer caches across source changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# ---- build: full install, compile server + web ----
FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- proddeps: the server's production deps, straight from the lockfile ----
# pnpm v10 `deploy` re-resolves the dependency graph (even with --legacy),
# which breaks image reproducibility and trips the minimumReleaseAge gate.
# A filtered frozen install ships exactly the audited, locked versions.
FROM base AS proddeps
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @caravan/server

# ---- runtime: one process, one volume (TD-4) ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    WEB_DIST=/app/apps/web/dist \
    LITESTREAM_CONFIG=/etc/litestream.yml

# ---- Litestream (opt-in streaming backup, TD-4) -------------------------------
# Installed unconditionally so the binary is present, but only *used* when
# LITESTREAM_REPLICA_URL is set at runtime (see docker-entrypoint.sh). Pinned for
# reproducibility. TARGETARCH is provided by Buildx (amd64 | arm64) for the
# multi-arch image; map it to Litestream's release asset naming (x86_64 | arm64).
ARG TARGETARCH
ARG LITESTREAM_VERSION=0.5.12
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) ls_arch="x86_64" ;; \
      arm64) ls_arch="arm64" ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSL -o /tmp/litestream.tar.gz \
      "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${ls_arch}.tar.gz"; \
    tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz litestream; \
    chmod +x /usr/local/bin/litestream; \
    rm -f /tmp/litestream.tar.gz; \
    apt-get purge -y curl; \
    apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*; \
    litestream version

# Litestream config template + container entrypoint. Env vars in the config
# (${DATA_DIR}, ${LITESTREAM_REPLICA_URL}) are expanded by Litestream at runtime.
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/server
# preserve the workspace-relative layout so pnpm's node_modules symlinks resolve
COPY --from=proddeps /repo/node_modules /app/node_modules
COPY --from=proddeps /repo/apps/server/node_modules /app/apps/server/node_modules
COPY apps/server/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist /app/apps/web/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node

VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The entrypoint runs `node dist/index.js` directly when no replica is
# configured (identical to the previous default), or under Litestream when
# LITESTREAM_REPLICA_URL is set. Runs from WORKDIR /app/apps/server as `node`.
ENTRYPOINT ["docker-entrypoint.sh"]

