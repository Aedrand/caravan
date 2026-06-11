# R4: AI Layer & MCP — research findings (2026-06-10)

> **ERRATA (2026-06-10, post fact-check — see `fact-check.md`):**
> 1. Vercel AI SDK license is **Apache-2.0**, not MIT (verified against `github.com/vercel/ai/blob/main/LICENSE`; corrects the TL;DR, §A1, and §A5 below). No decision impact — still FOSS-compatible; TD-6 states the corrected license.
> 2. MCP "2026-07-28 RC" wording: 2026-07-28 is the *planned final publication date* of the next revision; the RC was locked 2026-05-21. The current stable spec to build against remains **2025-11-25** (as recommended below).

## TL;DR

- **Vercel AI SDK v6 is the community default** for TypeScript LLM work in mid-2026: 3M+ weekly downloads, 24+ official providers, 30+ community providers, unified streaming/tool-call/structured-output API, MIT license. Provider swap = one import change. Ollama, OpenRouter, LM Studio all supported via community packages or the OpenAI-compat provider.
- **Do NOT use the OpenAI-compat shim as the primary abstraction**: Anthropic exposes one but documents it as "not production-recommended" — tool-call schema strictness is silently dropped, prompt caching is unavailable, and it may lag behind native API features. Use the Vercel AI SDK (or native SDKs) instead; it normalizes the surface correctly.
- **MCP is the correct bet for the BYO-assistant surface**: by mid-2026 it is a Linux Foundation standard adopted by OpenAI, Google, Microsoft, Amazon, and Anthropic. The TypeScript SDK ships first-party Express/Hono middleware, making embedding in an existing app straightforward.
- **Auth split is the critical constraint**: Claude Desktop and Claude Code accept static bearer tokens for remote MCP; **claude.ai web/mobile requires full OAuth 2.1 + PKCE** (issue #112 closed as "not planned" for bearer support). ChatGPT requires OAuth 2.1 + DCR. A plain token-in-app UX works for CLI/Desktop users but **excludes claude.ai web users** unless you implement an OAuth server.
- **v1 recommendation**: ship Streamable HTTP MCP, implement the full OAuth 2.1 server (it unlocks both Claude web and ChatGPT), and expose a plain REST+PAT fallback — the PAT endpoint is nearly free given you already have session infrastructure, and it covers every client that can't do OAuth.

---

## Part A: Provider-Agnostic LLM Layer

### A1. Vercel AI SDK — Current Status

- **Finding:** Current major line is AI SDK 6.x; v7 is on the roadmap but not released as of June 2026.
  - Source: https://www.digitalapplied.com/blog/vercel-ai-sdk-6-deep-dive-features-tool-calls-2026
  - Date: 2026
  - Type: Blog/analysis

- **Finding:** Weekly downloads grew from ~446K to 3M+ in one year; every major Next.js starter template ships with it pre-wired.
  - Source: https://releasebot.io/updates/vercel/vercel-ai
  - Date: June 2026
  - Type: Release tracker

- **Finding:** License is MIT (open source). GitHub repo at vercel/ai.
  - Source: https://github.com/vercel/ai
  - Date: Verified June 2026
  - Type: Primary/repository

- **Finding:** SDK 6 adds first-class autonomous-loop support (multi-step planning, stop conditions, tool sequencing).
  - Source: https://www.digitalapplied.com/blog/vercel-ai-sdk-6-deep-dive-features-tool-calls-2026
  - Date: 2026
  - Type: Blog

### A2. Provider Ecosystem

- **Finding:** 24+ official providers (OpenAI, Anthropic, Google, Mistral, Cohere, Groq, DeepSeek, Azure OpenAI, Amazon Bedrock, Google Vertex, xAI, ElevenLabs, etc.).
  - Source: https://ai-sdk.dev/docs/foundations/providers-and-models
  - Date: Accessed June 2026
  - Type: Official docs

- **Finding:** 30+ community providers including Ollama, OpenRouter, Cloudflare Workers AI, Portkey, Mem0.
  - Source: https://ai-sdk.dev/docs/foundations/providers-and-models
  - Date: Accessed June 2026
  - Type: Official docs

- **Finding:** Ollama community provider (`ollama-ai-provider`) supports custom baseURL override via `createOllama({ baseURL: '...' })` for remote/proxied instances.
  - Source: https://ai-sdk.dev/providers/community-providers/ollama
  - Date: Accessed June 2026
  - Type: Official docs

- **Finding:** A second community Ollama provider (`ai-sdk-ollama`) is recommended specifically when reliable tool calling is required — it includes built-in cascade repair for malformed outputs and guarantees complete responses.
  - Source: https://www.npmjs.com/package/ai-sdk-ollama
  - Date: Accessed June 2026
  - Type: npm / community docs

- **Finding:** OpenRouter provider (`@openrouter/ai-sdk-provider`) provides access to 300+ models via a single API key.
  - Source: https://openrouter.ai/docs/guides/community/vercel-ai-sdk
  - Date: Accessed June 2026
  - Type: Official OpenRouter docs

- **Finding:** The OpenAI-compat provider (`createOpenAI({ baseURL, apiKey })`) covers LM Studio, vLLM, and any OpenAI-spec endpoint.
  - Source: https://ai-sdk.dev/docs/foundations/providers-and-models
  - Date: Accessed June 2026
  - Type: Official docs

### A3. Tool Calling & Structured Output Portability

- **Finding:** Tool calling is a first-class SDK primitive; provider differences are normalized. The SDK's `generateText`/`streamText` with `tools:` param works across all official providers.
  - Source: https://ai-sdk.dev/docs/foundations/providers-and-models
  - Date: Accessed June 2026
  - Type: Official docs

- **Finding:** Structured output uses Zod schemas; `generateObject`/`streamObject` with `structuredOutputs: true` for JSON-only output. Provider includes built-in cascade repair for malformed LLM JSON.
  - Source: https://www.guvi.in/blog/vercel-ai-sdk/
  - Date: 2026
  - Type: Blog/guide

- **Finding:** Local models (Ollama, LM Studio) do NOT universally support tool calling; the `ai-sdk-ollama` package is specifically recommended when tool calling is needed with local models. Graceful degradation is application responsibility — no built-in feature-detection; catch errors and fall back to text mode.
  - Source: https://www.npmjs.com/package/ai-sdk-ollama
  - Date: Accessed June 2026
  - Type: npm/community docs

- **Finding:** The `onFinish` callback in `streamText` returns `usage.promptTokens` and `usage.completionTokens` for cost tracking — works across providers.
  - Source: https://pristren.com/blog/vercel-ai-sdk-streaming-guide/
  - Date: 2026
  - Type: Blog/guide

### A4. Why NOT the Anthropic OpenAI-Compat Shim

- **Finding:** Anthropic documents its OpenAI-compat endpoint as a test/comparison tool "not considered long-term or production-ready." Explicit limitations: tool-call schema `strict` parameter silently ignored (no guaranteed schema conformance), prompt caching unsupported, audio input stripped.
  - Source: https://docs.anthropic.com/en/api/openai-sdk
  - Date: Accessed June 2026
  - Type: Official Anthropic docs

- **Finding:** Google Gemini does NOT expose an OpenAI-compat endpoint with full tool-call parity; Gemini's tool calling must use its native API or the AI SDK's Gemini provider.
  - Source: https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide
  - Date: 2026
  - Type: Comparative blog

### A5. Alternatives Assessment

| Option | Verdict for Caravan |
|--------|-------------------|
| **Vercel AI SDK 6.x** | **Recommended.** Provider-agnostic, MIT, TypeScript-native, Ollama/OpenRouter/vLLM all supported, streaming+tools+structured output unified, 3M downloads/week. |
| **LangChain.js** | Overkill. Orchestration framework with heavy abstraction, designed for complex agent pipelines. Maintenance complexity exceeds benefit for this use case. |
| **Mastra** | TypeScript-native agent framework with workflows, memory, evals. Promising but smaller community than Vercel AI SDK. Watch for v1. |
| **LiteLLM proxy** | Extra service = anti-pattern for single-container. March 2026 supply chain attack (PyPI 1.82.7/1.82.8) exposed credential exfiltration risk. Adds operational overhead. |
| **Direct OpenAI-compat convention** | Falls short: no unified tool schema, provider-specific quirks leak through, Anthropic's own shim is documented as non-production. |
| **Native provider SDKs** | Correct for edge cases but requires per-provider branching; Vercel AI SDK is the normalization layer. |
| **TokenJS** | Not found in 2026 sources; likely niche or renamed. |

### A6. Recommended Configuration Surface (env vars the host sets)

```
AI_PROVIDER=openai|anthropic|google|ollama|openrouter|openai-compat
AI_API_KEY=sk-...
AI_BASE_URL=http://localhost:11434/api   # for Ollama / OpenRouter / vLLM / LM Studio
AI_MODEL=gpt-4o|claude-opus-4|gemini-2.0-flash|llama3.2:latest
AI_MAX_TOKENS_PER_REQUEST=4096
AI_RATE_LIMIT_RPM_PER_USER=20
AI_RATE_LIMIT_TOKENS_PER_USER_PER_DAY=100000
AI_RATE_LIMIT_TOKENS_PER_TRIP_PER_DAY=500000
```

If `AI_PROVIDER` is unset / `AI_API_KEY` is empty → House AI features are hidden; core trip features work normally. No LLM call is ever gated on core functionality.

### A7. Server-Side Agent Loop for NL Itinerary Edits

- **Pattern:** `streamText` with app-defined tools (`readItinerary`, `updateActivity`, `moveTiming`, `detectConflicts`). The model emits tool calls; the server executes them against SQLite; results are fed back in a loop. `maxSteps` config guards against runaway loops (suggested: 5).
  - Source: https://www.digitalapplied.com/blog/vercel-ai-sdk-6-deep-dive-features-tool-calls-2026
  - Date: 2026
  - Type: Blog/analysis

- **Pattern:** For write operations, buffer the proposed changes and surface a confirmation step before committing. AI attribution row written to activity table on every LLM-applied change.
  - Source: Design implication from general agentic patterns; no single source.

- **Finding:** Tool calling with local models (Ollama etc.) is unreliable for weaker models; design for graceful degradation: if `finishReason === 'error'` or no tool calls returned, fall back to free-text suggestion displayed in chat without auto-applying to data.
  - Source: https://www.npmjs.com/package/ai-sdk-ollama
  - Date: Accessed June 2026
  - Type: Community docs

### A8. Gap/Conflict Detection: Code vs. LLM

| Check | Approach | Rationale |
|-------|----------|-----------|
| Overlapping time slots | Deterministic code | Pure datetime arithmetic; 100% reliable, zero tokens |
| Duplicate activity names | Deterministic code | String match |
| Missing return transport | Deterministic code | Check for gap > threshold on final day |
| "Unrealistic travel window" (e.g., 20 min LAX→downtown) | LLM or travel-time API | Requires geo knowledge; LLM can flag, travel-time API (e.g., Google Maps, OpenTripPlanner) can validate |
| "This doesn't fit the group's stated preferences" | LLM only | Requires semantic understanding of preference context |
| Budget overrun | Deterministic code | Simple sum vs. budget field |

- **Finding:** Academic research (LLM-Modulo framework) shows deterministic validators correct 100% of temporal inconsistency errors in LLM itineraries. LLMs alone produce temporally invalid outputs at high rates, especially for complex schedules.
  - Source: https://arxiv.org/html/2405.20625v1
  - Date: May 2024 (pre-2026 but foundational)
  - Type: Academic paper

---

## Part B: MCP for BYO Assistant

### B1. Spec Status Mid-2026

- **Finding:** MCP is now under the Linux Foundation's Agentic AI Foundation (AAIF) as a vendor-neutral standard; adopted by OpenAI, Google, Microsoft, Amazon.
  - Source: https://chatforest.com/guides/mcp-across-ai-platforms/
  - Date: 2026
  - Type: Community guide

- **Finding:** The current production spec is **2025-11-25**. A release candidate for a **2026-07-28** revision is published but NOT yet final as of June 2026. The RC introduces: stateless protocol core, Extensions framework, Tasks, MCP Apps, authorization hardening, formal deprecation policy, `Mcp-Method`/`Mcp-Name` headers required on Streamable HTTP, cache TTL fields.
  - Source: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
  - Date: 2026
  - Type: Official MCP blog

- **Finding:** Streamable HTTP transport is the current standard for remote MCP servers (replaced SSE+HTTP); single HTTPS endpoint handles both POST (JSON-RPC) and optional GET (streaming). Now REQUIRES `Mcp-Method` and `Mcp-Name` headers in the RC.
  - Source: https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026
  - Date: 2026
  - Type: WorkOS blog

- **Finding:** OAuth 2.1 with PKCE is the auth standard for remote MCP. Dynamic Client Registration (DCR/RFC7591) is **optional (MAY)** in the 2025-11-25 spec; Client ID Metadata Documents (CIMD) are now the preferred registration method (SHOULD). DCR is deprecated in the RC but retained for backwards compat.
  - Source: https://mcp.directory/blog/oauth-21-for-remote-mcp-servers-streamable-http-explained-2026
  - Date: 2026
  - Type: MCP directory blog

### B2. Client Auth Support Matrix (DECISION-CRITICAL — verified June 2026)

| Client | Remote MCP | Auth Required | Bearer Token (static) | Full OAuth 2.1 |
|--------|-----------|--------------|----------------------|----------------|
| **Claude Desktop** | ✓ | Optional | ✓ Yes (via `headers.Authorization`) | ✓ Yes |
| **Claude Code / CLI** | ✓ | Optional | ✓ Yes (`--header "Authorization: Bearer ..."`) | ✓ Yes |
| **claude.ai web** | ✓ | OAuth REQUIRED | ✗ **No** (issue #112 closed not-planned) | ✓ Required |
| **claude.ai mobile** | ✓ | OAuth REQUIRED | ✗ **No** | ✓ Required |
| **Anthropic API (mcp-client-2025-11-20)** | ✓ | Optional | ✓ Yes (`authorization_token` field) | ✓ Yes |
| **ChatGPT web** | ✓ | OAuth REQUIRED | ✗ No | ✓ Required + DCR |
| **ChatGPT API (Responses)** | ✓ | Optional | Likely ✓ | ✓ Yes |
| **Gemini CLI** | ✓ | Flexible | Env vars | Google IAM/OAuth |
| **Microsoft Copilot Studio** | ✓ | Flexible | ✓ API key supported | ✓ OAuth 2.1 |
| **VS Code Copilot** | ✓ | Via env vars | ✓ | ✓ |
| **Amazon Q CLI** | ✓ | Via env vars | ✓ | ✓ IAM |

**Key evidence for the claude.ai web finding:**
- GitHub issue #112 (`anthropics/claude-ai-mcp`): "Cannot configure Authorization: Bearer for custom remote MCP (only OAuth client id/secret in advanced settings)" — **closed as "not planned"**
  - Source: https://github.com/anthropics/claude-ai-mcp/issues/112
  - Date: Accessed June 2026
  - Type: Primary/official GitHub issue

- claude.ai web connector settings only expose OAuth client ID + client secret fields; no bearer token field exists.
  - Source: https://sunpeak.ai/blogs/claude-connector-oauth-authentication/
  - Date: May 2026
  - Type: Blog (verified against UI behavior)

- ChatGPT: "OAuth 2.1 and Dynamic Client Registration are both mandatory. Bearer tokens are not accepted."
  - Source: https://auth0.com/blog/add-remote-mcp-server-chatgpt/
  - Date: 2026
  - Type: Auth0 blog / integration guide

**Architectural implication:** A "user generates token in-app" UX works for Claude Desktop/Code users but **blocks claude.ai web users** and all ChatGPT users. If claude.ai web user adoption matters, you MUST implement an OAuth 2.1 authorization server.

### B3. TypeScript Server Implementation

- **Finding:** MCP TypeScript SDK (`modelcontextprotocol/typescript-sdk`): v1.x is stable/production-recommended; v2 is pre-alpha on `main`, anticipated Q3 2026. v1.x will receive security fixes for ≥6 months post v2 launch.
  - Source: https://github.com/modelcontextprotocol/typescript-sdk
  - Date: Accessed June 2026
  - Type: Primary/repository

- **Finding:** SDK ships split packages in v2: `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, plus optional middleware: `@modelcontextprotocol/express`, `@modelcontextprotocol/hono`, `@modelcontextprotocol/node` (Streamable HTTP wrapper).
  - Source: https://github.com/modelcontextprotocol/typescript-sdk
  - Date: Accessed June 2026
  - Type: Primary/repository

- **Finding:** `@modelcontextprotocol/hono` provides Hono helpers (app defaults, JSON body parsing hook, Host header validation) enabling MCP endpoint to be mounted inside an existing Hono app at a path (e.g., `/mcp`). No separate service needed.
  - Source: https://github.com/mhart/mcp-hono-stateless
  - Date: 2026
  - Type: Reference implementation

- **Finding:** `StreamableHttpServerTransport` is the correct class for remote HTTP servers; pairs with HTTP framework and handles sessions via `Mcp-Session-Id` header.
  - Source: https://deepwiki.com/modelcontextprotocol/typescript-sdk/3.5-streamable-http-server-transport
  - Date: 2026
  - Type: DeepWiki SDK docs

- **Finding:** Tool and prompt schemas use Standard Schema (Zod v4, Valibot, ArkType compatible), aligning with Vercel AI SDK's Zod-based tool definitions.
  - Source: https://github.com/modelcontextprotocol/typescript-sdk
  - Date: Accessed June 2026
  - Type: Primary/repository

### B4. Security: Multi-User MCP

- **Finding:** Confused deputy is the primary multi-user MCP risk: an agent acting for User A could inadvertently access User B's trip data if the MCP server doesn't scope tokens strictly to the authenticated user.
  - Source: https://christian-schneider.net/blog/securing-mcp-defense-first-architecture/
  - Date: 2026
  - Type: Security blog

- **Finding:** Coalition for Secure AI guidance: for downstream calls, MCP server should perform RFC 8693 token exchange rather than forwarding user tokens. The user token authorizes the user to invoke the MCP server; a scoped token is minted for downstream service access.
  - Source: https://www.coalitionforsecureai.org/after-rsac-2026-the-mcp-security-question-everyone-kept-asking/
  - Date: 2026
  - Type: Security organization blog

- **Finding:** Per-user token registry: maintain a registry mapping `client_id → user_id` checked before authorizing any third-party OAuth flow. Prevent one user's MCP connection from accessing another user's resources.
  - Source: https://www.solo.io/blog/mcp-authorization-patterns-for-upstream-api-calls
  - Date: 2026
  - Type: Solo.io blog

- **Finding:** MCP spec security best practices: execute actions with user-level permissions only (no elevated server privileges), scope tokens to minimum required, rate limit per connection.
  - Source: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
  - Date: Accessed June 2026
  - Type: Official MCP docs

- **Finding:** All MCP tool actions that modify shared trip data should be audit-logged with: timestamp, user_id, tool name, input params (sanitized), trip_id, result status. This is both a security and collaborative trust requirement ("AI acted as the user visibly attributed").
  - Source: Design implication from security best practices sources.

### B5. Reality Check: MCP vs. Alternatives

- **Finding:** OpenAI's Agents SDK has adopted MCP as its primary tool protocol (MCPServerStdio, MCPServerSse, MCPServerStreamableHttp classes). "MCP is now the de facto standard for how AI agents connect to the outside world."
  - Source: https://openai.github.io/openai-agents-python/mcp/
  - Date: 2026
  - Type: Official OpenAI docs

- **Finding:** The MCP server registry had 9,400+ servers as of mid-2026, signaling irreversible ecosystem momentum.
  - Source: https://natoma.ai/blog/how-to-enabling-mcp-in-claude-desktop
  - Date: 2026
  - Type: Blog

- **Finding:** A plain REST API + Personal Access Token (PAT) is a valid lowest-common-denominator. Any HTTP client can hit it; zero protocol overhead; no client support matrix concerns. Recommended as a companion to MCP, not a replacement.
  - Source: Derived from client support matrix analysis; no single source.

### B6. Recommended v1 Shape

**Transport:** Streamable HTTP (spec 2025-11-25), single endpoint at `/mcp` mounted inside the existing Hono app via `@modelcontextprotocol/hono`.

**Auth flow:**
1. User navigates to trip settings → "Connect your AI assistant" → generates a PAT (opaque token, 256-bit random, stored as bcrypt hash).
2. **For Claude Desktop / Claude Code / API users:** paste token directly. Server validates `Authorization: Bearer <token>` against the PAT table. No OAuth server needed for these clients.
3. **For claude.ai web / ChatGPT users:** implement OAuth 2.1 auth server (PKCE required, client_credentials not supported by claude.ai). Recommended library: `@node-oauth/oauth2-server` or `oslo` (Oslo auth). The PAT can serve as the access token issued after the OAuth consent step — keeps the DB model simple.

**Tool list (v1):**
| Tool | Access | Default | Notes |
|------|--------|---------|-------|
| `get_itinerary` | Read | On | Returns trip days + activities scoped to user's trip membership |
| `get_activity` | Read | On | Single activity detail |
| `search_places` | Read | On | Calls internal place search; no external API key exposed to client |
| `add_activity` | Write | **Off** | Requires per-trip opt-in |
| `update_activity` | Write | **Off** | Requires per-trip opt-in |
| `move_activity` | Write | **Off** | Requires per-trip opt-in |
| `create_poll` | Write | **Off** | |
| `vote_poll` | Write | **Off** | |
| `log_expense` | Write | **Off** | |
| `get_expense_summary` | Read | On | Aggregate only, no other users' details |

**Permission model:**
- Permissions inherit from the user's trip role (viewer = read-only always; member = can opt-in write; admin = can opt-in write + manage connections).
- Write access is opt-in per trip, default off, toggled in trip settings.
- All tool invocations rate-limited: 60 calls/hour/token, 200 tokens budget/call.
- All invocations audit-logged: `{ts, user_id, trip_id, tool, input_hash, result_status, ip}`.

---

## Cost-Control & Safety Patterns

- **Finding:** Practical per-user token budgets: track `(user_id, date, tokens_used)` in a `ai_usage` table; check before each LLM call; reject with 429 if over limit; expose current usage in UI.
  - Source: https://zuplo.com/learning-center/token-based-rate-limiting-ai-agents
  - Date: 2026
  - Type: Learning center / blog

- **Finding:** Token estimation before the request: use tiktoken (for OpenAI-family), provider SDKs' `countTokens` methods, or heuristic (4 chars ≈ 1 token) to pre-check against budgets before sending. Exact counts from `onFinish` for post-request accounting.
  - Source: https://portkey.ai/blog/rate-limiting-for-llm-applications/
  - Date: 2026
  - Type: Portkey blog

- **Finding:** Track four dimensions: prompt tokens (cost input), completion tokens (cost output), total per request, cumulative per user per day. Expose these to the deployment owner via an admin dashboard.
  - Source: https://oneuptime.com/blog/post/2026-01-30-llm-rate-limiting/view
  - Date: January 2026
  - Type: Blog

- **Finding:** Per-trip budget cap: when a trip exhausts its AI budget, subsequent AI calls return a "budget exhausted" message rather than a hard error. Core itinerary features remain fully functional.
  - Source: Derived from pattern; no single source.

- **Finding:** `maxSteps` in Vercel AI SDK's `streamText` limits agentic loop iterations (recommended ≤ 5 for NL edits) to bound runaway token consumption.
  - Source: https://www.digitalapplied.com/blog/vercel-ai-sdk-6-deep-dive-features-tool-calls-2026
  - Date: 2026
  - Type: Blog

- **Safety:** Never expose raw API keys to the frontend. All LLM calls are server-side only. The House AI `AI_API_KEY` env var is server-only.

---

## Implications for Other Decisions

### API Design
- The MCP tool list defines the public mutation surface for AI clients. The REST API for human clients should expose the same operations at the same semantic level — avoids two divergent permission models.
- PAT table is a prerequisite for both MCP bearer auth and future REST API auth (same infrastructure).

### Audit Log Schema
Minimum schema for `ai_audit_log`:
```sql
id          TEXT PRIMARY KEY,
ts          INTEGER NOT NULL,          -- unix ms
user_id     TEXT NOT NULL,
trip_id     TEXT NOT NULL,
surface     TEXT NOT NULL,             -- 'house_ai' | 'mcp'
tool        TEXT,                      -- null for house_ai free-form
input_hash  TEXT,                      -- sha256 of sanitized input
output_type TEXT,                      -- 'success' | 'error' | 'rate_limited'
tokens_used INTEGER,
client_hint TEXT                       -- user-agent / MCP client identifier
```

### Rate Limiting Infrastructure
- For a single-container SQLite app, an in-process sliding window counter (e.g., `ioredis`-less, SQLite-backed) is sufficient at small scale.
- Schema: `ai_usage(user_id, trip_id, window_start, tokens_used, request_count)` with 1-minute and 1-day windows.
- If the deployment grows: drop in Redis for the rate-limit layer only; app logic unchanged.

### OAuth Server Requirement
- Implementing OAuth 2.1 (even minimal) is non-trivial. For v1, consider: ship bearer-token-only first (covers Claude Desktop/Code/API users), document OAuth as a v1.1 milestone. Gate the "Add to claude.ai web" marketing on OAuth completion.

---

## Open Questions / Unverified Claims

1. **claude.ai mobile MCP support parity with web** — sunpeak.ai blog states it behaves identically to web (OAuth required), but this was not verified against Anthropic's official mobile documentation as of June 2026.

2. **ChatGPT "DCR mandatory" claim** — auth0.com blog states DCR is mandatory for ChatGPT MCP connectors. This conflicts with the MCP spec which says DCR is optional (MAY). Needs verification against OpenAI's current connector docs before building ChatGPT support.

3. **Vercel AI SDK v7 timeline** — stated as "on the roadmap" but no concrete date found. If v7 introduces breaking provider API changes before Caravan ships, migration effort is unknown.

4. **MCP TypeScript SDK v2 stability** — v2 is pre-alpha as of June 2026. The v1.x `StreamableHttpServerTransport` API may differ from v2. Build on v1.x, pin version, test upgrade path before RC of 2026-07-28 spec ships.

5. **Token counting cross-provider normalization** — Vercel AI SDK GitHub issue #9921 ("V3 Spec Proposal: Token Usage Normalization") suggests token counting APIs are not fully normalized across providers. Needs review for accuracy of per-provider cost tracking.
  - Source: https://github.com/vercel/ai/issues/9921

6. **Ollama tool-calling reliability** — "ai-sdk-ollama includes cascade repair for malformed tool outputs" is from npm docs; not independently benchmarked. Local model tool-call reliability varies significantly by model size. Application must treat tool calls from local models as advisory and validate all returned structured data before committing to DB.

7. **Is the 2026-07-28 spec RC additive or breaking for auth?** — "authorization hardening" in the RC could require changes to a server built against 2025-11-25. Build against 2025-11-25 spec for v1 but structure the auth middleware to be swappable.

---

## Sources

1. https://www.digitalapplied.com/blog/vercel-ai-sdk-6-deep-dive-features-tool-calls-2026 — Vercel AI SDK 6 features, tool calls, agent loop — 2026
2. https://ai-sdk.dev/docs/foundations/providers-and-models — Official AI SDK providers list, OpenAI-compat, custom baseURL — accessed June 2026
3. https://github.com/vercel/ai — AI SDK repo, license, version — accessed June 2026
4. https://releasebot.io/updates/vercel/vercel-ai — AI SDK download growth, June 2026 updates — June 2026
5. https://ai-sdk.dev/providers/community-providers/ollama — Ollama community provider docs — accessed June 2026
6. https://www.npmjs.com/package/ai-sdk-ollama — ai-sdk-ollama tool calling, cascade repair — accessed June 2026
7. https://openrouter.ai/docs/guides/community/vercel-ai-sdk — OpenRouter AI SDK integration — accessed June 2026
8. https://docs.anthropic.com/en/api/openai-sdk — Anthropic OpenAI compat endpoint limitations — accessed June 2026
9. https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide — Framework comparison — 2026
10. https://arxiv.org/html/2405.20625v1 — LLM-Modulo travel planning, deterministic validation — May 2024
11. https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/ — MCP 2026-07-28 RC announcement — 2026
12. https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026 — MCP Streamable HTTP, Linux Foundation adoption — 2026
13. https://mcp.directory/blog/oauth-21-for-remote-mcp-servers-streamable-http-explained-2026 — MCP OAuth 2.1, DCR optional status — 2026
14. https://platform.claude.com/docs/en/agents-and-tools/mcp-connector — Anthropic MCP connector API, `authorization_token` field — accessed June 2026
15. https://github.com/anthropics/claude-ai-mcp/issues/112 — Claude.ai web bearer token issue, closed not-planned — accessed June 2026
16. https://sunpeak.ai/blogs/claude-connector-oauth-authentication/ — Claude connector OAuth required for web/mobile — May 2026
17. https://auth0.com/blog/add-remote-mcp-server-chatgpt/ — ChatGPT OAuth 2.1 + DCR mandatory — 2026
18. https://chatforest.com/guides/mcp-across-ai-platforms/ — MCP client support matrix — 2026
19. https://github.com/modelcontextprotocol/typescript-sdk — MCP TS SDK v1/v2 status, middleware packages — accessed June 2026
20. https://deepwiki.com/modelcontextprotocol/typescript-sdk/3.5-streamable-http-server-transport — StreamableHttpServerTransport docs — 2026
21. https://github.com/mhart/mcp-hono-stateless — Hono stateless MCP server example — 2026
22. https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices — MCP security best practices — accessed June 2026
23. https://christian-schneider.net/blog/securing-mcp-defense-first-architecture/ — Confused deputy, MCP security — 2026
24. https://www.coalitionforsecureai.org/after-rsac-2026-the-mcp-security-question-everyone-kept-asking/ — RFC 8693 token exchange recommendation — 2026
25. https://www.solo.io/blog/mcp-authorization-patterns-for-upstream-api-calls — Per-user token registry pattern — 2026
26. https://openai.github.io/openai-agents-python/mcp/ — OpenAI Agents SDK MCP adoption — accessed June 2026
27. https://zuplo.com/learning-center/token-based-rate-limiting-ai-agents — Token-based rate limiting patterns — 2026
28. https://portkey.ai/blog/rate-limiting-for-llm-applications/ — Token estimation, pre-request budget checks — 2026
29. https://github.com/vercel/ai/issues/9921 — Token usage normalization open issue — accessed June 2026
30. https://medium.com/@yagmur.sahin/remote-mcp-in-the-real-world-oauth-2-1-9d149de6e475 — Real-world MCP OAuth 2.1, PKCE, CIMD — 2026
