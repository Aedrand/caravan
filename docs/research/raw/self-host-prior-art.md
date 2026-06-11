# R2: Self-Host Packaging, Prior Art & Licensing — research findings (2026-06-10)

> **ERRATA (2026-06-10, post fact-check — see `fact-check.md`):** This file's characterization of TREK as "individual-planner-with-sharing, not group-coordination-first" is **refuted**. TREK's own README bills it as a real-time collaborative *group* planner — WebSocket co-editing, polls, group chat, per-person expense splits, day check-ins. The "niche is genuinely open" conclusion (TL;DR and Prior Art sections below) therefore does not hold; Caravan's positioning must rest on differentiation (ops simplicity, BYO-AI depth, decision-flow UX, design), not on an empty niche. TREK's other attributes (stars, license, stack, version, awesome-selfhosted status) were all verified accurate. Packaging-norms and licensing findings are unaffected.

## TL;DR

- **Single container + SQLite is the gold-standard starting point** for small-scale self-hosted apps in 2026; Mealie, Vikunja, Grist, Actual Budget, and TREK all prove it. Add a compose with an external DB only when the workload demands it.
- **The collaborative group travel-planner niche is genuinely open.** AdventureLog (3.3 k stars, GPL-3.0, Django+SvelteKit) is the closest FOSS match but is personal-journal-first, not group-coordination-first. TREK (5.6 k stars, AGPL-3.0, Node+React+SQLite) overlaps heavily on features and should be studied carefully to differentiate Caravan.
- **AGPL-3.0 is the right license** for a self-hosted web app that the owner wants to keep perpetually free. It closes the "hosted fork" loophole, matches what Plausible, Wanderer, TREK, and Nextcloud chose, and carries FSF blessing for network-delivered software.
- **SQLite + WAL mode + Litestream** is the modern backup story for single-node self-hosted apps; no separate Postgres container means zero ops overhead for the typical user.
- **GHCR is the preferred registry** for new OSS projects; Docker Hub's rate limits have made it a second-tier mirror. Multi-arch (amd64 + arm64) is non-negotiable for Raspberry Pi / home-server audience.

---

## Packaging & Ops Norms (with named examples per pattern)

### Container layout: single vs. multi-service

- **Pattern: single container, one `docker run` or minimal compose.**
  - Mealie uses a single container (`ghcr.io/mealie-recipes/mealie`) with SQLite by default; Postgres is opt-in for NAS/multi-writer setups. Users 1–20 = SQLite.
    - Source: https://docs.mealie.io/documentation/getting-started/installation/sqlite/ (accessed 2026-06-10, official docs)
  - Vikunja (todo app, ~50 k stars) ships as a single container since v0.22, bundling API + frontend; SQLite is the default; Postgres/MySQL opt-in.
    - Source: https://deepwiki.com/go-vikunja/vikunja/6.2-docker-deployment (accessed 2026-06-10)
  - Grist (spreadsheet/DB hybrid) runs as `docker run -p 8484:8484 -v ~/grist:/persist gristlabs/grist` — truly one command, no compose required.
    - Source: https://support.getgrist.com/self-managed/ (accessed 2026-06-10, official docs)
  - Actual Budget runs as a single container (`actualbudget/actual-server`) with SQLite-backed budget files stored in a `/data` volume.
    - Source: https://actualbudget.org/docs/install/docker/ (accessed 2026-06-10, official docs)
  - **Community reward:** r/selfhosted and awesome-selfhosted consistently feature single-container apps more prominently because setup is copy-paste simple.

- **Pattern: multi-service compose (when justified by the workload).**
  - Immich (photo backup) requires 4 services: app server, machine-learning service, custom Postgres+pgvector image, and Valkey (Redis). This is accepted because ML and vector search genuinely need it, but the complexity is regularly cited as a drawback in community discussions.
    - Source: https://docs.immich.app/install/docker-compose/ (accessed 2026-06-10, official docs)
  - Karakeep (bookmarks) uses 3 services: app, Meilisearch (full-text search), headless Chrome (link screenshots). Main container idles ~200 MB; Chrome is the heavy hitter.
    - Source: https://docs.karakeep.app/installation/docker/ (accessed 2026-06-10, official docs)
  - Outline (wiki) requires app, Postgres, Redis — 3 services. Migrations run automatically on boot via the app container.
    - Source: https://docs.getoutline.com/s/hosting/doc/docker-7pfeLP5a8t (accessed 2026-06-10, official docs)
  - **Rule of thumb:** every additional service is a support burden. Community tolerance is high for 2-service (app + DB) but drops sharply beyond 3.

### SQLite vs. Postgres — prevalence and handling

- **SQLite is experiencing a renaissance in 2026** for single-node workloads. WAL mode (enabled via `PRAGMA journal_mode=WAL`) allows concurrent reads with a single writer, which is sufficient for dozens of users.
  - Source: https://pockit.tools/blog/sqlite-renaissance-turso-d1-libsql-production-guide/ (accessed 2026-06-10)
- **Mealie pattern (explicit guidance):** SQLite for 1–20 users on local/direct-attached storage; Postgres for NAS or heavy concurrent writes.
  - Source: https://docs.mealie.io/documentation/getting-started/installation/sqlite/ (accessed 2026-06-10)
- **Vikunja pattern:** SQLite is the default with no migration path to Postgres built in (export/reimport required). Acceptable for small deployments; power users know to start with Postgres.
  - Source: https://community.vikunja.io/t/first-setup-with-unified-container-sqlite/2162 (accessed 2026-06-10)
- **Grist:** The entire product is SQLite-native — documents are `.grist` files (SQLite databases); home metadata is `home.sqlite3`.
  - Source: https://community.getgrist.com/t/self-hosted-backups-of-standalone-single-container-instance/13411 (accessed 2026-06-10)

### SQLite + WAL + Litestream backup pattern

- **Litestream** (open-source) hooks into SQLite's WAL to stream page changes in real time to S3-compatible storage (Backblaze B2, MinIO, etc.). Sub-second replication lag in practice.
  - Source: https://litestream.io/ (accessed 2026-06-10, official site)
- v0.5.0 introduced the LTX format for compacted point-in-time recovery using a small number of files.
  - Source: https://algustionesa.com/litestream-v0-5-0-faster-backups-for-sqlite/ (accessed 2026-06-10)
- Deployment pattern: run Litestream as a sidecar process in the same container via a launch script (`litestream replicate & exec app`), or as a companion container in compose.
  - Source: https://litestream.io/how-it-works/ (accessed 2026-06-10)
- **Important:** Do NOT store SQLite on NFS/SMB — filesystem lock semantics cause corruption. Mealie explicitly warns against this and recommends Postgres for NAS users.
  - Source: https://docs.mealie.io/documentation/getting-started/installation/sqlite/ (accessed 2026-06-10)

### Config via environment variables

- **Universal norm:** all configuration via env vars, sane defaults for everything optional.
- Mealie minimal env vars: `BASE_URL`, `TZ`, `PUID`/`PGID`, `ALLOW_SIGNUP`. Everything else defaults.
  - Source: https://docs.mealie.io/documentation/getting-started/installation/sqlite/ (accessed 2026-06-10)
- Vikunja: every config key is available as `VIKUNJA_SECTION_KEY`; secret is `VIKUNJA_SERVICE_SECRET`; DB path defaults to `/db/vikunja.db`.
  - Source: https://vikunja.io/docs/config-options/ (accessed 2026-06-10)
- Immich: `UPLOAD_LOCATION`, `DB_PASSWORD`, `TZ`, `IMMICH_VERSION` are the four essentials; all others default.
  - Source: https://docs.immich.app/install/environment-variables/ (accessed 2026-06-10)
- Secrets handling norm: put sensitive vars (`SECRET_KEY`, `DB_PASSWORD`) in a `.env` file referenced by compose `env_file:`. Never bake secrets into the image.

### DB migrations on boot

- **Auto-migrate on startup is the current standard.** Vikunja, Outline, and Mealie all run migrations automatically when the container starts; no manual step required.
  - Vikunja: "When first started, Vikunja will set up the database and run all migrations." Source: https://vikunja.io/docs/installing/ (accessed 2026-06-10)
  - Outline: "Migrations are run automatically when the container starts." Source: https://docs.getoutline.com/s/hosting/doc/docker-7pfeLP5a8t (accessed 2026-06-10)
- **Watchtower compatibility / version pinning:** Pin image tags to semver (`image: app:v1.2.3`) rather than `latest` in production compose files. Watchtower works best with a `release` or semver tag; using `latest` causes uncontrolled upgrades. Community norm is to publish both a `latest` floating tag and versioned tags.
  - Source: https://github.com/containrrr/watchtower/issues/1595 (accessed 2026-06-10)
- **Rollback story:** Typically documented as "stop container, restore volume backup, start previous image tag." Automated rollback is rare in FOSS self-hosted apps; the expectation is that the operator takes a volume snapshot before upgrading.

### Reverse proxy / TLS norms

- **Three dominant options in 2026:** Caddy (simplest config file, auto-HTTPS, ~30 MB RAM), Nginx Proxy Manager (GUI-first, ~50 MB), Traefik (Docker-native labels, auto-discovery, ~80 MB).
  - Source: https://earezki.com/ai-news/2026-04-23-nginx-proxy-manager-vs-traefik-vs-caddy-which-reverse-proxy-should-you-pick-in-2026/ (accessed 2026-06-10)
- **Documentation norm:** Provide a sample Caddyfile and a sample Traefik labels block in the docs. AdventureLog ships a dedicated `docker-compose-traefik.yaml`.
  - Source: https://github.com/seanmorley15/AdventureLog (accessed 2026-06-10)
- **Subpath vs subdomain:** Subdomain (`app.home.local`) is far easier to implement correctly — avoids relative URL bugs. Subpath support is valued but adds complexity; most apps support it via a `BASE_URL` or `PUBLIC_URL` env var with the path prefix.
- Caddy two-liner: `app.example.com { reverse_proxy localhost:3000 }` — auto-provisions Let's Encrypt cert. This is the pattern many new self-hosters follow.
  - Source: https://www.programonaut.com/reverse-proxies-compared-traefik-vs-caddy-vs-nginx-docker/ (accessed 2026-06-10)

### Image publishing: registry, multi-arch, size

- **GHCR is the preferred primary registry** for new OSS projects in 2026. Docker Hub enforces rate limits on unauthenticated pulls (100 pulls/6 hours for anonymous); GHCR is free and unlimited for public OSS.
  - Source: https://portalzine.de/my-top-self-hosted-solutions-with-docker-for-2026/ (accessed 2026-06-10)
- Mealie: `ghcr.io/mealie-recipes/mealie`. Karakeep: `ghcr.io/karakeep-app/karakeep`. Both publish to GHCR as primary.
- **Multi-arch (linux/amd64 + linux/arm64) is non-negotiable** for the home-server/Raspberry Pi audience. GitHub Actions + Docker Buildx handles this in CI.
  - Source: https://dev.to/pradumnasaraf/publishing-multi-arch-docker-images-to-ghcr-using-buildx-and-github-actions-2k7j (accessed 2026-06-10)
- **Image size norms:** Alpine base gives ~5 MB base; distroless static is ~2 MB; a typical Node app on Alpine lands at 150–300 MB uncompressed depending on `node_modules`. Keep final image under 300 MB where possible.
  - Source: https://github.com/GoogleContainerTools/distroless (accessed 2026-06-10)
- **CI pattern:** GitHub Actions workflow on tag push → `docker/build-push-action` with `platforms: linux/amd64,linux/arm64` → push to GHCR with semver tags (`v1.2.3`, `v1.2`, `v1`, `latest`).

### Health checks, structured logs, first-run flow

- **Health checks:** Standard pattern is `HEALTHCHECK CMD curl -f http://localhost:PORT/health || exit 1` in Dockerfile, or a compose `healthcheck` block. Vikunja is adding a dedicated `vikunja healthcheck` CLI command.
  - Source: https://community.vikunja.io/t/vikunja-container-health-check/3878/2 (accessed 2026-06-10)
- **Structured logs:** JSON-formatted logs are increasingly expected for use with log aggregators (Loki/Grafana stack). Plain-text is still acceptable for small deployments.
- **First-run / admin bootstrap — two patterns seen:**
  1. *First user who registers becomes admin* (Gitea, Manifest). Simple, no extra config.
     - Source: https://github.com/go-gitea/gitea/issues/4120 (accessed 2026-06-10)
  2. *Env-var pre-seeded admin* (`ADMIN_EMAIL`, `ADMIN_PASSWORD` on first boot). Used by Mealie (`DEFAULT_EMAIL` / `DEFAULT_PASSWORD`). Preferred for fully automated deployments.
     - Source: https://docs.mealie.io/documentation/getting-started/installation/installation-checklist/ (accessed 2026-06-10)
  3. *Setup wizard on first browser visit* (Actual Budget prompts for password on first access; no env-var needed).
     - Source: https://actualbudget.org/docs/install/docker/ (accessed 2026-06-10)

### Demo instances, screenshots, README-driven adoption

- **awesome-selfhosted requires:** FOSS license, active maintenance, a working demo OR detailed screenshots. The listing format shows: name, description, demo link, source, license. Projects without screenshots rarely trend on r/selfhosted.
- AdventureLog has an official demo at `demo.adventurelog.app` and screenshots in the README — this is cited as a driver of its 3.3 k star count.
  - Source: https://adventurelog.app/ (accessed 2026-06-10)
- The TREK project shows GIF demos and a live demo URL prominently in its README — 5.6 k stars suggests this works.
  - Source: https://github.com/mauriceboe/TREK (accessed 2026-06-10)
- **TREK is awaiting addition to awesome-selfhosted** (open issue #2361 on the data repo as of 2026-06-10).
  - Source: https://github.com/awesome-selfhosted/awesome-selfhosted-data/issues/2361 (accessed 2026-06-10)

### Release cadence / versioning

- **Semver is universal.** Patch releases for bug fixes, minor for new features, major for breaking changes. Publish GitHub Releases with a CHANGELOG extracted from commit history.
- Use `semantic-release` or `release-please` to automate tagging from conventional commits.
- **CHANGELOG norm:** Keep a `CHANGELOG.md` at repo root in Keep a Changelog format; link from each GitHub Release.

---

## Recommended Self-Host Shape for Caravan

### Container layout

**Start:** single Docker container, compose optional. Ship a `docker-compose.yml` in the repo root and also document `docker run`. The compose file should be 1 service + 1 named volume.

```yaml
# docker-compose.yml (reference)
services:
  caravan:
    image: ghcr.io/owner/caravan:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - caravan-data:/app/data
    environment:
      BASE_URL: "http://localhost:3000"
      # Optional: pre-seed admin on first boot
      ADMIN_EMAIL: ""
      ADMIN_PASSWORD: ""
      # Optional: AI features
      OPENAI_API_KEY: ""
      # Optional: Litestream backup
      LITESTREAM_REPLICA_URL: ""
volumes:
  caravan-data:
```

### Database

- **SQLite + WAL mode** by default. WAL is enabled at app startup via `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`.
- Mount the DB at `/app/data/caravan.db`.
- If `LITESTREAM_REPLICA_URL` is set, run Litestream as a co-process via entrypoint script.
- **Do not add Postgres support initially.** For a group of 2–10 with one active deployment, SQLite is correct. Add Postgres later if demand exists; note that Vikunja's lack of a migration path caused community frustration, so if Postgres is added later it should include a migration utility.

### Config surface (env vars)

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Full public URL (used in links/emails) |
| `TZ` | `UTC` | Timezone for logs/cron |
| `SECRET_KEY` | (required) | JWT / session signing key |
| `ADMIN_EMAIL` | — | Pre-seed admin on first boot (optional) |
| `ADMIN_PASSWORD` | — | Pre-seed admin password (optional) |
| `OPENAI_API_KEY` | — | Enables AI features if set |
| `LITESTREAM_REPLICA_URL` | — | s3://bucket/path, enables streaming backup |
| `LOG_LEVEL` | `info` | Structured log verbosity |

- Keep mandatory vars to an absolute minimum. `SECRET_KEY` is the only truly required non-default var; auto-generate a random one on first boot if not provided (log a warning).

### Migration / backup / upgrade story

1. **Migrations run automatically on startup** using Drizzle Kit or Prisma Migrate; the app exits with a non-zero code if migration fails (never silently continue with a broken schema).
2. **Backup:** Document `docker cp` volume snapshot as the manual approach. Offer Litestream as the automated approach via env var.
3. **Upgrade:** Stop container → pull new image → start. Migrations auto-apply. Document this as a 3-command process.
4. **Rollback:** Stop container → restore volume snapshot → run previous image tag. Provide this in the docs.
5. **Version pinning:** Ship compose with `image: ghcr.io/owner/caravan:latest` but with a prominent comment recommending users pin to a specific version (e.g., `v1.2.0`) for stability.

### First-run flow

- On first boot, if no users exist in DB, set a `SETUP_REQUIRED` flag.
- If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set → auto-create admin, clear flag, log confirmation.
- If not set → the first user to reach the app and register becomes admin (Gitea-style), and subsequent registrations are disabled by default until the admin enables them.
- Display a clear banner in the UI while `SETUP_REQUIRED` is true.

### CI / image publishing

- GitHub Actions: on push to `main` (build+test), on tag `v*.*.*` (build multi-arch + push to GHCR).
- Publish tags: `ghcr.io/owner/caravan:v1.2.3`, `v1.2`, `v1`, `latest` (all pointing to same digest).
- Also mirror to Docker Hub as a secondary registry for discoverability.

---

## Prior Art Map

### AdventureLog

- **Status:** Active. v0.12.1 released 2026-05-25. 3.3 k stars, 228 forks, 1,699 commits.
  - Source: https://github.com/seanmorley15/AdventureLog (accessed 2026-06-10)
- **License:** GPL-3.0
- **Stack:** Django (Python), PostGIS/Postgres, Django REST Framework, SvelteKit, TailwindCSS, MapLibre.
- **Self-host shape:** Multi-service docker-compose (app, Postgres, nginx). Has a Traefik variant compose file.
- **Features:** Personal adventure log, world map visualization, multi-day itinerary planner (flights, checklists, notes), collaborative sharing via public links or user-to-user, regional tracking.
- **What to learn:**
  - Public demo instance + screenshots → 3.3 k stars despite Python/Postgres complexity.
  - Traefik compose variant is valued by power users.
  - Collaborative features are limited to sharing read/edit links, not real-time sync.
- **What to avoid:**
  - Django + PostGIS stack is operationally heavy (requires Postgres with spatial extensions). Heavy for a "one command" story.
  - No real-time collaboration (WebSocket). No expense splitting. No group polls.
- **Differentiation for Caravan:** AdventureLog is personal-journal-first with sharing bolted on. Caravan is group-coordination-first from day one (real-time sync, voting, expense splitting). The Postgres dependency is a barrier Caravan should avoid.
- **Verified:** 2026-06-10

### TREK

- **Status:** Active. v3.0.22 released 2026-05-24. 5.6 k stars, 554 forks, 71 releases.
  - Source: https://github.com/mauriceboe/TREK (accessed 2026-06-10)
- **License:** AGPL-3.0
- **Stack:** Node.js 22, Express, SQLite, React 18, Vite, TypeScript, Tailwind CSS, Leaflet. Real-time via WebSocket. Auth: JWT/OAuth 2.1/OIDC.
- **Self-host shape:** Single container for quick start; production compose with security hardening (read-only FS, capability dropping). Kubernetes Helm charts available.
- **Features:** Drag-and-drop trip planning, interactive maps, route optimization, weather forecasts, reservations, multi-currency budget tracking, packing lists, document management, PDF export, real-time WebSocket sync, multi-user roles, SSO/OIDC, 2FA, PWA/offline, journal, AI/MCP integration.
- **What to learn:** TREK is the closest overlap to Caravan's vision. Its star count (5.6 k, higher than AdventureLog) at comparable maturity validates the market.
- **What to avoid / differentiate:** TREK is a full-featured "enterprise-ish" planner — Caravan should be simpler and friendlier for non-technical friend groups. TREK's feature set may feel overwhelming; Caravan's "one tech-savvy friend deploys it" UX constraint is a meaningful differentiator. Also: TREK has not been listed on awesome-selfhosted yet (open issue as of 2026-06-10).
- **Warning:** Stack (Node + SQLite + TypeScript) is near-identical to what Caravan is likely to use. There is a real risk of overlap perception. Caravan must clearly articulate its group-coordination focus vs. TREK's individual-planner-with-sharing model.
- **Verified:** 2026-06-10

### Wanderer

- **Status:** Active. v0.19.2 released 2026-06-01. 3.7 k stars, AGPL-3.0. 1,401 commits.
  - Source: https://github.com/open-wanderer/wanderer (accessed 2026-06-10)
- **License:** AGPL-3.0
- **Stack:** SvelteKit (41.9%), Go (33.4%), TypeScript (23.8%).
- **Self-host shape:** Docker compose; supports Raspberry Pi.
- **Features:** GPX/TCX upload and cataloging, route planning, elevation profiles, ActivityPub federation (share trails across instances), summit logs.
- **Assessment:** Trail database / outdoor activity tracker, NOT a trip planner. Negligible overlap with Caravan's use case (group travel coordination). No expense splitting, no itinerary, no group voting.
- **What to learn:** AGPL-3.0 + ActivityPub federation + high star count is a proof point that the self-hosted community rewards ambitious, open protocols.
- **Verified:** 2026-06-10

### Awesome-selfhosted travel category

- Under **Maps and Global Positioning System (GPS)**, only two travel-adjacent apps are listed: **AdventureLog** (travel tracker/trip planner) and **AirTrail** (personal flight tracking).
  - Source: https://awesome-selfhosted.net/ (accessed 2026-06-10)
- No collaborative group travel planner exists in the list. The niche is genuinely open.

### Commercial landscape (non-FOSS, for context)

- SaaS tools in 2026 for group travel: WePlanify (free, collaborative itinerary + polls + budget), SquadTrip (payment collection focus), Wanderlog (consumer, no self-host), TripIt (itinerary parsing). All are proprietary/cloud-only.
  - Source: https://www.weplanify.com/en/alternatives/best-group-trip-planner-apps (accessed 2026-06-10)
- **The self-hosted group travel planner is an unoccupied niche.** There is no open-source, self-hostable Wanderlog equivalent with group coordination features.

### Niche conclusion

The niche is open. AdventureLog and TREK are the closest projects but both have distinct foci (personal log vs. individual planner). A group-coordination-first, self-hostable tool with real-time sync, voting, and expense splitting has no direct FOSS competition. The main risk is TREK's feature overlap; Caravan should explicitly position around the "friends deploys it for the group" UX, smaller scope, and simpler onboarding.

---

## Licensing Analysis & Recommendation

### What comparable projects chose

| Project | License | Reasoning |
|---|---|---|
| AdventureLog | GPL-3.0 | Copyleft; no explicit SaaS concern stated |
| TREK | AGPL-3.0 | Explicitly chosen to require open-source modifications when run as network service |
| Wanderer | AGPL-3.0 | Community/activist project; strong copyleft stance |
| Nextcloud | AGPL-3.0 | Protects against commercial hosting forks |
| Mastodon | AGPL-3.0 | Federated network; prevents proprietary forks |
| Plausible | AGPL-3.0 | Explicitly switched from MIT to prevent Amazon-style exploitation |
| Forgejo | GPL-3.0 | Forked from MIT Gitea; chose stronger copyleft on fork |
| Vikunja | AGPL-3.0 | Standard for self-hosted web apps wanting copyleft |
| Gitea | MIT | Permissive; contributor-friendly but allows proprietary forks |

Sources:
- https://plausible.io/blog/open-source-licenses (accessed 2026-06-10)
- https://forgejo.org/faq/ (accessed 2026-06-10)
- https://github.com/mauriceboe/TREK (accessed 2026-06-10)

### AGPL-3.0 vs GPL-3.0 vs MIT/Apache-2.0 for self-hosted web apps

**AGPL-3.0:**
- Extends GPL with a "network use is distribution" clause: anyone running a modified version as a service must publish source.
- The FSF explicitly recommends AGPL for software commonly run over a network.
- Does NOT affect: self-hosters, personal users, internal corporate use without distribution.
- DOES affect: anyone offering Caravan as a managed service with modifications; they must open-source those modifications.
- Known issue: some companies have blanket AGPL bans to avoid risk of viral contamination. For a personal friend-group tool this is irrelevant.
  - Source: https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies (accessed 2026-06-10)

**GPL-3.0:**
- Copyleft for distributed software, but the network-use loophole exists: a company can run GPL-3.0 code as a service, make modifications, and never release them.
- AdventureLog uses GPL-3.0; this means a company could theoretically fork it, improve it, run it as SaaS, and keep changes proprietary.
- Not recommended for a web app where the primary delivery mechanism is network access.

**MIT / Apache-2.0:**
- Permissive. Maximum contribution potential; no barriers.
- Apache-2.0 adds a patent grant that MIT lacks — relevant if contributors hold patents.
- No protection against SaaS forks. Amazon/Microsoft could ship "Caravan Cloud" with proprietary improvements.
- Recommended only if maximizing corporate adoption is the goal. For a personal FOSS project, this concedes too much.

### DCO vs CLA

- **DCO (Developer Certificate of Origin):** A sign-off line in git commits (`Signed-off-by:`). Lightweight; contributors assert they have rights to submit the code. OpenStack migrated from CLA to DCO in July 2025 to lower contribution barriers.
  - Source: https://governance.openstack.org/tc/resolutions/20250520-replace-the-cla-with-dco-for-all-contributions.html (accessed 2026-06-10)
- **CLA:** Formal legal agreement. Required only if the owner anticipates future relicensing or commercialization. The Linux kernel uses DCO; many Apache projects use CLAs.
- **For Caravan:** DCO is sufficient and friendlier to contributors. A CLA would be overkill for a personal/community project and would add friction that discourages contributions.
  - Source: https://tenthirtyam.org/dispatches/2026/04/08/dco-vs-cla-managing-contribution-agreements-in-open-source/ (accessed 2026-06-10)

### Recommendation

**Use AGPL-3.0 with DCO.**

Rationale:
1. The project delivers value as a network-accessed web application — this is exactly the use case AGPL was designed for.
2. All close FOSS peers (TREK, Wanderer, Plausible) chose AGPL-3.0 for the same reasons; it signals seriousness about staying FOSS.
3. The target audience (self-hosters) is completely unaffected by AGPL restrictions; there is zero friction for the intended users.
4. DCO keeps contribution friction low while providing a lightweight legal paper trail.
5. If the owner later wants to offer a managed cloud version, they can do so under AGPL as long as they keep the source open — or they can offer a dual commercial license (the "open core" model) without changing the community license.

**Note:** This is ultimately the owner's call. If maximum permissiveness and community breadth are the priority over SaaS protection, Apache-2.0 is the second-best choice. Do not choose GPL-3.0 — it is strictly worse than AGPL-3.0 for a network-delivered app.

---

## Implications for Other Decisions

- **Stack confirmation:** Node.js + TypeScript + SQLite is validated by TREK (5.6 k stars) using the exact same combination. Drizzle ORM is the 2026 community preference for TypeScript + SQLite given its SQL-native migrations and lighter runtime (Prisma 7 eliminated the Rust binary but Drizzle remains faster for edge/embedded use cases).
  - Source: https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/ (accessed 2026-06-10)
- **Real-time:** WebSocket (native Node) is sufficient for the scale (2–10 users in a trip). No need for a Redis pub/sub layer at this scale.
- **AI feature:** Environment-variable-keyed (`OPENAI_API_KEY` etc.) is the correct pattern; do not bundle API keys. Karakeep does the same with Ollama support.
- **Maps:** Leaflet (open) over Google Maps or Mapbox GL (API key/cost). TREK and AdventureLog both use Leaflet/MapLibre.
- **First listing strategy:** Submit to awesome-selfhosted early (it requires a demo instance). A live demo at `demo.caravan.app` with a few sample trips loaded is the most effective adoption driver based on AdventureLog and TREK trajectories.

---

## Open Questions / Unverified Claims

1. **TREK feature overlap is the largest competitive risk.** Need to do a deeper feature-by-feature comparison to identify genuine gaps TREK doesn't address (expense settlement, native mobile PWA quality, simpler UX). Unverified: whether TREK has expense-splitting or just budget tracking.
2. **Drizzle vs Prisma for SQLite migrations in Docker** — Drizzle Kit generates migration files that should be committed and run automatically on boot; this needs a concrete implementation pattern (e.g., `drizzle-kit migrate` as part of the container entrypoint). Not yet prototyped.
3. **AdventureLog collaborative editing** — it's unclear whether its "collaborator can edit" feature is real-time or just shared-access-to-same-itinerary. Needs direct testing.
4. **awesome-selfhosted submission criteria** — the list requires "actively maintained" (commit within ~12 months), FOSS license, and a working demo or source link. Need to check whether a working hosted demo is strictly required vs. optional at submission time.
5. **TREK licensing compliance** — TREK uses AGPL-3.0. If Caravan borrows any code patterns or architecture from TREK (even paraphrased), the AGPL does not require Caravan to be AGPL (independent creation is fine), but any direct code incorporation would. Keep implementations independent.
6. **Litestream S3 cost for typical self-hoster** — Litestream sends WAL segments continuously. For a small Caravan DB (likely <100 MB), monthly S3 cost should be negligible (<$0.05/month to Backblaze B2), but this should be documented explicitly so users aren't surprised.

---

## Sources

1. https://docs.mealie.io/documentation/getting-started/installation/sqlite/ — Mealie SQLite vs Postgres guidance, docker-compose example (official docs, accessed 2026-06-10)
2. https://docs.mealie.io/documentation/getting-started/installation/installation-checklist/ — Mealie env vars, default admin setup (official docs, accessed 2026-06-10)
3. https://github.com/seanmorley15/AdventureLog — AdventureLog stars, license, stack, features, activity (GitHub, accessed 2026-06-10)
4. https://adventurelog.app/ — AdventureLog official site, demo instance (official, accessed 2026-06-10)
5. https://github.com/mauriceboe/TREK — TREK stars, license, stack, features, activity (GitHub, accessed 2026-06-10)
6. https://github.com/awesome-selfhosted/awesome-selfhosted-data/issues/2361 — TREK awesome-selfhosted submission pending (GitHub issue, accessed 2026-06-10)
7. https://github.com/open-wanderer/wanderer — Wanderer stars, license, stack, activity (GitHub, accessed 2026-06-10)
8. https://awesome-selfhosted.net/ — Travel category: only AdventureLog and AirTrail listed under Maps/GPS (official, accessed 2026-06-10)
9. https://docs.immich.app/install/docker-compose/ — Immich multi-service compose structure, env vars (official docs, accessed 2026-06-10)
10. https://docs.immich.app/install/environment-variables/ — Immich env var patterns (official docs, accessed 2026-06-10)
11. https://docs.karakeep.app/installation/docker/ — Karakeep 3-service compose, GHCR image (official docs, accessed 2026-06-10)
12. https://deepwiki.com/go-vikunja/vikunja/6.2-docker-deployment — Vikunja single-container pattern, SQLite default (community docs, accessed 2026-06-10)
13. https://vikunja.io/docs/installing/ — Vikunja auto-migrate on boot (official docs, accessed 2026-06-10)
14. https://vikunja.io/docs/config-options/ — Vikunja env var conventions (official docs, accessed 2026-06-10)
15. https://community.vikunja.io/t/vikunja-container-health-check/3878/2 — Vikunja health check plans (community forum, accessed 2026-06-10)
16. https://support.getgrist.com/self-managed/ — Grist single-container quick start (official docs, accessed 2026-06-10)
17. https://actualbudget.org/docs/install/docker/ — Actual Budget single container, setup-wizard first run (official docs, accessed 2026-06-10)
18. https://docs.getoutline.com/s/hosting/doc/docker-7pfeLP5a8t — Outline multi-service compose, auto-migrate, env vars (official docs, accessed 2026-06-10)
19. https://litestream.io/ — Litestream SQLite streaming replication (official site, accessed 2026-06-10)
20. https://litestream.io/how-it-works/ — Litestream WAL hook mechanism, sidecar pattern (official docs, accessed 2026-06-10)
21. https://algustionesa.com/litestream-v0-5-0-faster-backups-for-sqlite/ — Litestream v0.5.0 LTX format (community blog, accessed 2026-06-10)
22. https://pockit.tools/blog/sqlite-renaissance-turso-d1-libsql-production-guide/ — SQLite renaissance in production 2026 (blog, accessed 2026-06-10)
23. https://earezki.com/ai-news/2026-04-23-nginx-proxy-manager-vs-traefik-vs-caddy-which-reverse-proxy-should-you-pick-in-2026/ — Reverse proxy comparison 2026 (blog, accessed 2026-06-10)
24. https://www.programonaut.com/reverse-proxies-compared-traefik-vs-caddy-vs-nginx-docker/ — Caddy/Traefik/Nginx resource usage comparison (blog, accessed 2026-06-10)
25. https://dev.to/pradumnasaraf/publishing-multi-arch-docker-images-to-ghcr-using-buildx-and-github-actions-2k7j — Multi-arch GHCR publishing via GitHub Actions (DEV blog, accessed 2026-06-10)
26. https://github.com/GoogleContainerTools/distroless — Distroless image sizes (GitHub, accessed 2026-06-10)
27. https://plausible.io/blog/open-source-licenses — Plausible AGPL reasoning (official blog, accessed 2026-06-10)
28. https://governance.openstack.org/tc/resolutions/20250520-replace-the-cla-with-dco-for-all-contributions.html — OpenStack CLA→DCO migration July 2025 (official governance doc, accessed 2026-06-10)
29. https://tenthirtyam.org/dispatches/2026/04/08/dco-vs-cla-managing-contribution-agreements-in-open-source/ — DCO vs CLA analysis 2026 (blog, accessed 2026-06-10)
30. https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies — AGPL corporate ban perspective (VC blog, accessed 2026-06-10)
31. https://forgejo.org/faq/ — Forgejo GPL-3.0 license choice (official FAQ, accessed 2026-06-10)
32. https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/ — Drizzle vs Prisma 2025 comparison (community guide, accessed 2026-06-10)
33. https://github.com/containrrr/watchtower/issues/1595 — Watchtower semver image pinning discussion (GitHub issue, accessed 2026-06-10)
34. https://portalzine.de/my-top-self-hosted-solutions-with-docker-for-2026/ — Docker Hub rate limits, GHCR preference (blog, accessed 2026-06-10)
35. https://www.weplanify.com/en/alternatives/best-group-trip-planner-apps — Commercial group trip planning landscape 2026 (commercial site, accessed 2026-06-10)
