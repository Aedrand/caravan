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
    WEB_DIST=/app/apps/web/dist

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

CMD ["node", "dist/index.js"]
