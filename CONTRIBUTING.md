# Contributing to Caravan

Thanks for your interest in Caravan! This is a self-hosted, collaborative
group-trip planner. Contributions of all kinds are welcome — bug reports, docs,
and code.

By contributing you agree that your work is licensed under the project's
[AGPL-3.0](LICENSE) and that you can certify its origin (see
[Developer Certificate of Origin](#developer-certificate-of-origin-dco) below).

## Development setup

**Prerequisites:** Node ≥ 22 and [pnpm](https://pnpm.io) 10
(`corepack enable` will provide the pinned version).

```bash
git clone https://github.com/Aedrand/caravan.git
cd caravan
pnpm install
pnpm dev          # runs server + web together (pnpm -r --parallel dev)
```

`pnpm dev` starts both apps:

| App | URL | Notes |
| --- | --- | --- |
| Web (Vite) | <http://localhost:5173> | The SPA you develop against. |
| Server (Hono) | <http://localhost:3000> | API + live-sync WebSocket. Vite proxies `/api` (including WS) here in dev. |

Open the web URL. The first account you register becomes the instance admin
(see the [install guide](docs/self-hosting/install.md#first-run-creating-the-admin)).

Want sample data? Seed a demo trip into your dev database:

```bash
cd apps/server
DATA_DIR=./data pnpm seed     # creates "Demo Trip"; safe to re-run
```

It prints a demo email/password to sign in with.

## Repository layout

Monorepo managed with pnpm workspaces:

```
apps/
  server/    Hono API + better-sqlite3 + Drizzle + Better Auth; serves the built SPA
  web/       React + Vite single-page app
packages/
  shared/    Types, Zod schemas, and the mutation registry shared by server + web
docs/
  self-hosting/   Operator docs (install, configuration, reverse-proxy, backups)
```

- The **mutation registry** in `packages/shared` is the single source of truth
  for every change to trip data — both sides validate against it.
- All writes to shared trip data flow through the server's mutation pipeline
  (`apps/server/src/core/mutations.ts`): validate → authorize → apply + feed
  event + version bump in one transaction → broadcast. New write features
  register a handler there rather than inserting directly.

## Quality gates

Run these before opening a PR — CI runs the same set, and a PR won't merge until
they're green:

```bash
pnpm -r typecheck     # tsc across every package
pnpm lint             # Biome (use `pnpm format` to auto-fix, then re-check)
pnpm -r build         # build every package
pnpm test:e2e         # Playwright end-to-end suite
```

Unit tests live alongside the code; run them with `pnpm test` (per-package
Vitest). `pnpm format` (`biome check --write .`) auto-fixes most lint issues.

## Commit style — Conventional Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
— this drives automated releases and the changelog. Use a type, an optional
scope, and a concise summary:

```
feat(web): ambient map follows the focused day
fix(server): scope auth rate limiter to credential POSTs
docs: self-hosting install/config guides
chore(deps): bump drizzle-orm
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`.
Use `feat!:` / `fix!:` (or a `BREAKING CHANGE:` footer) for breaking changes.

## Developer Certificate of Origin (DCO)

Every commit must be **signed off** to certify you have the right to submit it
under the project's license. This is the lightweight
[Developer Certificate of Origin 1.1](https://developercertificate.org/) — *not*
a CLA and *not* a GPG/cryptographic signature. You add a `Signed-off-by` line by
committing with `-s`:

```bash
git commit -s -m "feat(web): add trip cover photos"
```

That appends a trailer using your `git` `user.name` / `user.email`:

```
Signed-off-by: Jane Developer <jane@example.com>
```

Use a real name and a reachable email. By signing off you certify the DCO:

> **Developer Certificate of Origin 1.1**
>
> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the right
> to submit it under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my
> knowledge, is covered under an appropriate open source license and I have the
> right under that license to submit that work with modifications, whether
> created in whole or in part by me, under the same open source license (unless I
> am permitted to submit under a different license), as indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who
> certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are public and
> that a record of the contribution (including all personal information I submit
> with it, including my sign-off) is maintained indefinitely and may be
> redistributed consistent with this project or the open source license(s)
> involved.

A CI check ([`.github/workflows/dco.yml`](.github/workflows/dco.yml)) enforces
that every commit in a PR has a valid `Signed-off-by` line. If you forget on the
last commit:

```bash
git commit --amend -s --no-edit && git push --force-with-lease
```

To sign off a range of existing commits, rebase with
`git rebase --signoff <base>` and force-push.

## Pull requests

- Branch off `main`; keep PRs focused on one change.
- Make sure the [quality gates](#quality-gates) pass locally.
- Every commit is signed off (DCO) and follows Conventional Commits.
- Describe what changed and why; link any related issue.
- Update docs when you change behavior or configuration (the
  [configuration reference](docs/self-hosting/configuration.md) is generated from
  `apps/server/src/config.ts` — keep them in sync).
- Be kind in review. We're building this for friends to plan trips together; the
  same spirit applies here.
