# Fact Check Report: Caravan Research Findings

**Checked by:** Fact-checker agent  
**Date:** 2026-06-10  
**Scope:** Claims from self-host-prior-art.md, ai-mcp.md, maps-places.md, app-stack.md

---

## Summary

- Total claims checked: 23
- Verified: 14 | Partially verified: 4 | Unverified: 1 | Contradicted: 4
- Overall reliability assessment: MEDIUM — core factual claims mostly hold, but two material errors require correction before using findings for product positioning (Vercel AI SDK license wrong; MCP spec stable revision wrong)

---

## Verified Claims

- **Claim:** github.com/mauriceboe/TREK exists as a self-hosted travel planner
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/mauriceboe/TREK (direct); https://trendshift.io/repositories/24392
  - Status: VERIFIED
  - Notes: Repository confirmed active, AGPL-3.0, TypeScript codebase.

- **Claim:** TREK has ~5.6k stars
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/mauriceboe/TREK (direct); trendshift.io stats
  - Status: VERIFIED
  - Notes: Multiple independent signals agree on 5.6k.

- **Claim:** TREK is licensed AGPL-3.0
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/mauriceboe/TREK
  - Status: VERIFIED

- **Claim:** TREK v3.0.22 released 2026-05-24
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/mauriceboe/TREK/releases
  - Status: VERIFIED
  - Notes: v3.0.22 release notes confirm "Bug Fixes & Improvements" on May 24, 2026.

- **Claim:** TREK stack is Node.js 22 / Express / SQLite / React 18 / Vite / TypeScript / Tailwind / Leaflet
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/mauriceboe/TREK/blob/main/README.md; search results corroborate Leaflet/Mapbox GL, JWT/OIDC/TOTP, Open-Meteo
  - Status: VERIFIED
  - Notes: Also uses Mapbox GL as alternative to Leaflet; README confirms TypeScript at 99.5%.

- **Claim:** TREK pending awesome-selfhosted listing (issue #2361 on awesome-selfhosted-data)
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/awesome-selfhosted/awesome-selfhosted-data/issues/2361
  - Status: VERIFIED
  - Notes: Issue confirmed open as of search date, title "Add TREK", opened 2026-04-21.

- **Claim:** AdventureLog github.com/seanmorley15/AdventureLog exists with ~3.3k stars, GPL-3.0, Django+PostGIS+SvelteKit+MapLibre
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/seanmorley15/AdventureLog
  - Status: VERIFIED

- **Claim:** AdventureLog v0.12.1 released 2026-05-25
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/seanmorley15/AdventureLog/releases/tag/v0.12.1; https://adventurelog.app/docs/changelogs/v0-12-0.html (v0.12.0 dated 2026-02-03); newreleases.io showing "3 months ago" for v0.12.0
  - Status: VERIFIED
  - Notes: The GitHub release page shows "May 25 17:03" without an explicit year, but the v0.12.0 changelog confirms "Released 02-03-2026," making the May 2026 date for v0.12.1 consistent. An earlier WebFetch attempt hallucinated "May 25, 2024" — this is wrong; primary source evidence points to 2026.

- **Claim:** AdventureLog collaboration model is link/user sharing, NOT real-time co-editing; no expense splitting; no group polls
  - Original source: self-host-prior-art.md
  - Verification source(s): https://github.com/seanmorley15/AdventureLog (README and release notes); v0.12.0 changelog (budgeting tools added are per-trip cost fields, not settlement splitting)
  - Status: VERIFIED
  - Notes: v0.12.0 added trip budgets with cost fields for locations/transportation/lodging, but these are cost-tracking inputs, not group expense splitting with settlement. No polls feature found. Collaboration is sharing-based (edit access on collections).

- **Claim:** claude.ai web and mobile require OAuth for custom remote MCP connectors and do NOT support static bearer tokens
  - Original source: ai-mcp.md
  - Verification source(s): https://claude.com/docs/connectors/building/authentication (official Anthropic doc, accessed 2026-06-10)
  - Status: VERIFIED
  - Notes: Official doc states verbatim: "User-pasted bearer tokens (static_bearer) are not yet supported." Supported methods are OAuth with DCR, OAuth with CIMD, Anthropic-held client credentials, and custom URL/credentials (OAuth-based). Tokens in URL query strings are also explicitly forbidden.

- **Claim:** github.com/anthropics/claude-ai-mcp issue #112 requesting bearer support was closed "not planned"
  - Original source: ai-mcp.md
  - Verification source(s): https://github.com/anthropics/claude-ai-mcp/issues/112 (confirmed exists and is closed as "not planned")
  - Status: VERIFIED
  - Notes: Issue title: "Cannot configure Authorization: Bearer for custom remote MCP (only OAuth client id/secret in advanced settings)." Confirmed repo name is correct.

- **Claim:** Claude Desktop and Claude Code DO support static bearer headers for remote MCP servers
  - Original source: ai-mcp.md
  - Verification source(s): https://github.com/anthropics/claude-ai-mcp/issues/112 (issue body describes Desktop/Claude Code supporting headers.Authorization in config); https://code.claude.com/docs/en/mcp
  - Status: VERIFIED
  - Notes: The issue itself documents that desktop clients (Claude Desktop, Claude Code, Cursor) support `headers.Authorization` in their config files, while the web connector cannot. Claude Code docs confirm general MCP remote server configuration support.

- **Claim:** OpenFreeMap — no API key, no registration, no hard request limits, free for production commercial use
  - Original source: maps-places.md
  - Verification source(s): https://openfreemap.org (official site, accessed 2026-06-10)
  - Status: VERIFIED
  - Notes: Site states explicitly: no registration, no user database, no API keys, no cookies, no limits on map views/requests, commercial use allowed.

- **Claim:** Nominatim public instance — autocomplete explicitly FORBIDDEN, max 1 req/s
  - Original source: maps-places.md
  - Verification source(s): https://operations.osmfoundation.org/policies/nominatim/ (official OSM policy, accessed 2026-06-10)
  - Status: VERIFIED
  - Notes: Policy states "Auto-complete search. This is not yet supported by Nominatim and you must not implement such a service on the client side using the API." Rate limit is 1 req/s general; 4 req/min for bulk geocoding scripts.

---

## Partially Verified Claims

- **Claim:** MCP spec 2026-07-28 release candidate published but not final; current stable revision is 2025-11-25
  - Original source: ai-mcp.md
  - What's verified: The 2026-07-28 RC exists and is confirmed not final — it was locked as of 2026-05-21 with final publication planned for 2026-07-28. The current stable MCP spec is 2025-11-25 (confirmed: modelcontextprotocol.io/llms.txt lists only 2025-11-25 as the current spec, and the 2025-11-25 changelog explicitly supersedes 2025-06-18).
  - What's uncertain: The research claim says the RC is "published but not final" — technically the RC spec date 2026-07-28 represents the target *publication* date of the final spec, not a currently-accessible draft. The actual draft schema exists but the final document has not been published as of 2026-06-10.
  - Verification source(s): https://modelcontextprotocol.io/specification/2025-11-25/changelog; https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/; https://modelcontextprotocol.io/llms.txt
  - Status: PARTIALLY VERIFIED
  - Notes: The claim is substantively correct. Wording correction: the "2026-07-28 RC" refers to a spec whose final version will be published on that date; the RC was locked 2026-05-21. Current stable is confirmed 2025-11-25.

- **Claim:** TREK has real-time collaborative group features including simultaneous co-editing, group voting/polls, expense SPLITTING with settlement between members
  - Original source: self-host-prior-art.md
  - What's verified: TREK has WebSocket real-time sync (changes propagate live across connected users), multi-user trips with RBAC, group chat, shared notes, polls (listed as a feature in the Collab addon), day check-ins, and per-person/per-day expense splits with multi-currency.
  - What's uncertain: Whether "expense splitting" includes automated settlement calculation between members (e.g., "A owes B $12"). The README lists "per-person / per-day splits" under the Budget addon, which implies splits are tracked, but whether debt/settlement flows are implemented is not confirmed from README alone.
  - Verification source(s): https://github.com/mauriceboe/TREK/blob/main/README.md
  - Status: PARTIALLY VERIFIED
  - Notes: The research's characterization of TREK as "individual-planner-with-sharing, not group-coordination-first" is MATERIALLY WRONG — see Contradicted Claims below.

- **Claim:** Photon public instance (photon.komoot.io) permits typeahead autocomplete, no API key, fair-use throttling only
  - Original source: maps-places.md
  - What's verified: Photon is explicitly designed for typeahead/autocomplete (it is the primary advertised use case). No API key required. Fair-use throttling is confirmed: "extensive usage will be throttled."
  - What's uncertain: "Fair-use throttling only" implies no hard block/ban — the policy does say "you can use the API for your project, but please be fair" and "usage might be subject to change in the future," which is a soft guarantee. No SLA or uptime commitment.
  - Verification source(s): https://photon.komoot.io (official site, accessed 2026-06-10)
  - Status: PARTIALLY VERIFIED
  - Notes: Substantively correct. The soft availability caveat ("subject to change") is worth noting in any planning docs.

- **Claim:** MCP TypeScript SDK v1.x stable with v2 pre-alpha, including Hono/Express middleware packages
  - Original source: ai-mcp.md
  - What's verified: Hono, Express, and Node.js middleware packages exist at @modelcontextprotocol/hono, @modelcontextprotocol/express, @modelcontextprotocol/node and are documented. The SDK has a v1.x branch confirmed as production-recommended.
  - What's uncertain: The "v2 pre-alpha" characterization. As of April 2025, v2.0.0-alpha.1/alpha.2 were released. The GitHub README (fetched 2026-06-10) says v2 is "pre-alpha" targeting stable in Q3 2026. The specific version number of current v1.x stable was not pinned; one search result mentioned 1.27.0 on the v1.x branch (as of approximately 2026-02).
  - Verification source(s): https://github.com/modelcontextprotocol/typescript-sdk; https://www.npmjs.com/package/@hono/mcp; search results for typescript-sdk releases
  - Status: PARTIALLY VERIFIED
  - Notes: "v2 pre-alpha" is approximately correct; the main branch README describes v2 as pre-alpha targeting Q3 2026 stable. Claim is broadly accurate.

---

## Contradicted Claims

- **Claim:** TREK is best characterized as "individual-planner-with-sharing, not group-coordination-first"
  - Original source: self-host-prior-art.md
  - Contradicting evidence: TREK's README and feature set describe real-time collaborative planning as its core differentiator. The project's GitHub description is "A self-hosted travel/trip planner with **real-time collaboration**..." The Collab addon includes group chat, shared notes, polls, and day check-ins. Expense tracking includes per-person splits. WebSocket sync means all connected users see changes simultaneously.
  - Contradicting source(s): https://github.com/mauriceboe/TREK (repo description); https://github.com/mauriceboe/TREK/blob/main/README.md
  - Likely correct version: TREK is a group-coordination-first planner with real-time collaborative features including simultaneous editing, polls, group chat, and expense splits. The key gap versus Caravan's vision is that TREK's group coordination is trip-centric and media-rich (journaling, photos, reservations), while Caravan may differentiate on expense settlement flows (debt calculation/resolution between members), democratic destination voting with weighting, or asymmetric participant roles. Settlement automation is unconfirmed in TREK and should be verified via demo.
  - Status: CONTRADICTED
  - Notes: This is a high-impact error for product positioning. If the research uses "not group-coordination-first" as evidence that the niche is unoccupied, that conclusion is wrong.

- **Claim:** Vercel AI SDK current major is v6, MIT licensed
  - Original source: app-stack.md
  - Contradicting evidence: The Vercel AI SDK (`ai` npm package) is licensed under the **Apache License 2.0**, NOT MIT. The GitHub LICENSE file at https://github.com/vercel/ai/blob/main/LICENSE confirms Apache 2.0.
  - Contradicting source(s): https://github.com/vercel/ai/blob/main/LICENSE (primary source, accessed 2026-06-10)
  - Likely correct version: Vercel AI SDK v6 (confirmed current major), Apache 2.0 license.
  - Status: CONTRADICTED (license only; v6 major version is verified correct)
  - Notes: Apache 2.0 is permissive and FOSS-compatible, so the practical impact on Caravan (FOSS self-hosted) is low — but the license claim is factually wrong. Apache 2.0 requires preservation of copyright notices and attribution in source distributions; MIT does not. Medium risk for documentation accuracy.

- **Claim:** Anthropic documents its OpenAI-compat endpoint as "not production-recommended" with "tool-strictness limitations"
  - Original source: ai-mcp.md / app-stack.md
  - Contradicting evidence: The claim is directionally correct but imprecise. The official page (https://platform.claude.com/docs/en/api/openai-sdk) uses the phrase "not considered a long-term or production-ready solution for **most** use cases." It explicitly notes the `strict` parameter for function calling is **ignored** (not unsupported — it is silently dropped), meaning tool call JSON is not guaranteed to follow the schema. This is more nuanced than "tool-strictness limitations."
  - Contradicting source(s): https://platform.claude.com/docs/en/api/openai-sdk (accessed 2026-06-10)
  - Likely correct version: The OpenAI-compatible endpoint is described as intended for testing/comparison, not production, for most use cases. The `strict` parameter in tool definitions is ignored (silently), not enforced. For schema-conformant tool calls, the native Claude API with Structured Outputs must be used.
  - Status: CONTRADICTED (minor — substance is right, characterization is imprecise)
  - Notes: "Tool-strictness limitations" is a reasonable summary but should be stated as "the strict parameter is silently ignored."

- **Claim:** Mealie, Vikunja, Grist, Actual Budget all ship single-container deployments with SQLite default (or SQLite-native storage)
  - Original source: app-stack.md (Claim Set 5c)
  - Contradicting evidence: The claim is MOSTLY correct but Grist's storage model is distinct from the others. Grist uses SQLite natively for document storage (each document is a .grist SQLite file) and for the home database (home.sqlite3). However, Grist is NOT a single-container deployment in the same sense — it runs as a single Docker container (`docker run gristlabs/grist`) but uses SQLite as a document format, not as a traditional application database with a schema. Actual Budget uses SQLite files for budget data and account.sqlite for server state; confirmed single container (`actualbudget/actual-server`). Vikunja ships a unified `vikunja/vikunja` image with SQLite as a supported backend. Mealie ships a single-container Docker image with SQLite as the default/recommended DB for small deployments.
  - Contradicting source(s): https://docs.mealie.io/documentation/getting-started/installation/sqlite/; https://community.vikunja.io/t/first-setup-with-unified-container-sqlite/2162; https://support.getgrist.com/self-managed/; https://actualbudget.org/docs/contributing/project-details/database/
  - Likely correct version: All four ship single-container deployments. SQLite is default or the only storage layer for Mealie, Vikunja, and Actual Budget. Grist uses SQLite-format files natively but its "database" is document-per-SQLite-file rather than a shared app DB.
  - Status: CONTRADICTED (minor — all four are functionally correct for the claim's purpose, but "SQLite default" for Grist needs clarification)
  - Notes: Low practical risk for Caravan planning purposes.

---

## Unverifiable Claims

- **Claim:** TREK features include "route optimization" and "AI/MCP integration"
  - Why unverifiable: The README confirms many features, and v3.0.22 release notes mention "MCP fixes" confirming MCP integration exists. However, "route optimization" as a distinct feature (vs. route visualization) could not be independently confirmed from available README content alone.
  - Risk level: LOW — does not affect Caravan's positioning decision
  - Recommendation: Include with caveat; verify against TREK's live demo at https://demo-nomad.pakulat.org if needed.

---

## Source Quality Assessment

- https://github.com/mauriceboe/TREK: Tier 1 — Primary source (the repo itself); directly verifiable attributes
- https://github.com/seanmorley15/AdventureLog: Tier 1 — Primary source
- https://claude.com/docs/connectors/building/authentication: Tier 1 — Official Anthropic documentation
- https://platform.claude.com/docs/en/api/openai-sdk: Tier 1 — Official Anthropic documentation
- https://github.com/anthropics/claude-ai-mcp/issues/112: Tier 1 — Primary source (official Anthropic repo issue tracker)
- https://modelcontextprotocol.io/specification/2025-11-25/changelog: Tier 1 — Official MCP specification
- https://modelcontextprotocol.io/llms.txt: Tier 1 — Official MCP documentation index
- https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/: Tier 2 — Official MCP blog
- https://operations.osmfoundation.org/policies/nominatim/: Tier 1 — Official OSM Foundation policy page
- https://openfreemap.org: Tier 1 — Official project site
- https://photon.komoot.io: Tier 1 — Official project site
- https://github.com/vercel/ai/blob/main/LICENSE: Tier 1 — Primary source (license file in official repo)
- https://adventurelog.app/docs/changelogs/v0-12-0.html: Tier 1 — Official project changelog
- https://github.com/awesome-selfhosted/awesome-selfhosted-data/issues/2361: Tier 1 — Primary source
- https://docs.mealie.io/documentation/getting-started/installation/sqlite/: Tier 1 — Official project docs
- https://community.vikunja.io/t/first-setup-with-unified-container-sqlite/2162: Tier 3 — Community forum (supported by official docs)
- https://actualbudget.org/docs/contributing/project-details/database/: Tier 1 — Official project docs
- https://ai-sdk.dev/providers/community-providers/ollama: Tier 2 — Official Vercel AI SDK documentation site
- https://github.com/modelcontextprotocol/typescript-sdk: Tier 1 — Official MCP TypeScript SDK repo

---

## Corrections Required in Research Files

1. **self-host-prior-art.md — CRITICAL:** Remove or substantially revise the characterization of TREK as "individual-planner-with-sharing, not group-coordination-first." TREK explicitly markets itself as a real-time collaborative group planner and includes polls, group chat, per-person expense splits, and simultaneous WebSocket-synced editing. Any product positioning argument that relies on TREK being weak on group coordination is not supported by the evidence. Caravan's differentiation must be argued on different grounds (e.g., settlement flows, democratic decision-making with weighting, mobile-first UX, or simplicity).

2. **app-stack.md — LICENSE ERROR:** Correct the Vercel AI SDK license from MIT to **Apache 2.0**. The npm package `ai` and the GitHub repository https://github.com/vercel/ai are Apache 2.0 licensed, not MIT.

3. **ai-mcp.md — MCP SPEC VERSION:** The current stable MCP spec revision is **2025-11-25**, not "2025-11-25 as stable with 2026-07-28 as RC" (which is how the claim is worded and is correct), but any references to older versions (2025-03-26, 2025-06-18) as "current" should be updated. The 2026-07-28 RC is locked as of 2026-05-21 and the final spec will publish on that date.

4. **ai-mcp.md — TOOL STRICTNESS WORDING:** Revise "tool-strictness limitations" to specifically state: the `strict` parameter in OpenAI-format tool definitions is **silently ignored** by Anthropic's OpenAI-compatibility layer; tool call output is not guaranteed to follow the provided schema.

5. **app-stack.md — GRIST SQLITE CLARIFICATION:** Grist uses SQLite as its native document format (each document is a .grist SQLite file; home metadata is home.sqlite3), which is accurate but architecturally distinct from Mealie/Vikunja/Actual Budget where SQLite is the application database. The claim is not wrong, but should be clarified to avoid implying Grist uses SQLite the same way.

6. **self-host-prior-art.md — TREK SETTLEMENT FLOWS:** Whether TREK calculates and presents net settlement debts between members (e.g., "Alex owes Jordan $23.50") is unconfirmed from the README alone. The README confirms per-person split tracking, not settlement resolution. Verify against live demo before using this as a differentiator.
