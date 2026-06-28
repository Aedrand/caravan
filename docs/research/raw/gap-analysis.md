# Gap Analysis — planning docs review (2026-06-10)

Produced by a gap-analysis review agent over the full doc set (vision docs, decisions.md, plan.md, brief, raw research, fact-check); recorded here by the orchestrator with the disposition of each finding. Overall verdict: **core architecture sound and well-researched; correction pass required before owner review** — that pass is complete (statuses below).

## Critical

| # | Finding | Disposition |
|---|---|---|
| 1 | Vercel AI SDK license stated as MIT in `ai-mcp.md` (TL;DR, §A1, §A5); actually **Apache-2.0**. TD-6 was already corrected; raw file contradicted it. | ✅ Fixed — errata banner on `ai-mcp.md`; TD-6 states Apache-2.0 |
| 2 | Competitor A mischaracterized in `self-host-prior-art.md` ("individual-planner-with-sharing"); fact-check refuted — it is group-coordination-first with real-time co-editing, polls, expense splits. "Open niche" conclusion fails; PROJECT.md whitespace claim needs amending; differentiation decision needed. | ✅ Fixed — errata banner on `self-host-prior-art.md`; brief + plan §8/§10 corrected; PROJECT.md/product-brief.md amended with competitive-correction notes; decision flagged as plan §10 item 1 |
| 3 | MCP "2026-07-28 RC" wording imprecise (that's the target *final publication* date; RC locked 2026-05-21). | ✅ Fixed — TD-7 + ai-mcp.md errata |

## Important

| # | Finding | Disposition |
|---|---|---|
| 4 | Feature→task coverage not explicit; a few items unowned (booking link-outs; explicit member-leave/remove). | ✅ Fixed — traceability table added at plan §6.0; link-outs added to schema + task 1.7; leave/remove added to task 1.5 |
| 5 | Croner used by Track A (poll auto-close) and Track D (digests) with no shared bootstrap → parallel-track collision risk. | ✅ Fixed — new M0 task 0.9 (job-registry bootstrap in `core/`); A.2/D.2 note the dependency |
| 6 | C.4 ↔ Track E layout ownership ambiguous. | ✅ Fixed — C.4 owns map split-view/bottom-sheet; E.3 owns general mobile shell, excludes map specifics |
| 7 | Two-browser M1 gate test lacked concrete acceptance checklist. | ✅ Fixed — task 1.11 now enumerates the 7 acceptance scenarios |
| 8 | Admin panel (D.3) scope underspecified. | ✅ Fixed — acceptance criteria added |
| 9 | Fact-check corrections not propagated into raw files. | ✅ Fixed via errata banners (provenance preserved; raw text left as found) |

## Minor

| # | Finding | Disposition |
|---|---|---|
| 10 | No account-deletion/data-retention consideration (self-host hygiene). | ✅ Risk row + backlog item added |
| 11 | Litestream "when to enable" guidance missing. | ✅ D.4 docs scope extended |
| 12 | CORS/Origin validation for the MCP endpoint unstated. | ✅ Added to M9 (Streamable HTTP requires Origin validation) |
| 13 | "Warm aesthetic" not operationally defined. | Accepted as-is — task E.1 exists to define it |

## Questions only the owner can answer

Identical to plan.md §10 (Competitor A stance, TD-1/TD-7/TD-8 ratification, vote-culture fit, v1.0 boundary, name, repo hosting).
