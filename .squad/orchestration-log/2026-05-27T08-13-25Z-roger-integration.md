# Orchestration Log: roger-integration

**Agent:** Roger (Integration / Search Specialist)  
**Model:** claude-sonnet-4.5  
**Mode:** Parallel (Round 1)  
**Session:** Eureka v0.1 Technical Design — Round 1  
**Date:** 2026-05-27 08:13:25Z  

## Files Produced

| File | Status | Size (KB) | Purpose |
|------|--------|-----------|---------|
| `docs/eureka/sections/40-integration.md` | ✅ Created | 26.7 | §40: Search architecture, BM25 ranker, recall fan-out, Path 1/Path 2 decision ingestion |

**Total authorship:** ~26.7KB (section)

## Key Outcomes

1. **BM25 ranker fully specified for v1** — §40 defines:
   - **Search index:** FTS5 on fact `content` field (markdown/JSON/plain text)
   - **Ranking formula:** BM25-like (TF-IDF variant with term frequency saturation)
   - **Multiplicative trust boost:** Base BM25 score × (0.15 + 0.85×trust) (trust acts as confidence floor, not penalty)
   - **Attention tier penalty:** Results from cold tier (project-scope) get 20% down-weight in recall ordering
   - **Recall defaults:** k=10 results, fan-out agent → user → project (early exit if k satisfied in earlier tier)

2. **Path 1 (Forge integration) specified** — §40 defines:
   - **Invocation:** CLI `eureka ingest-decisions --session <uuid>` (user-driven, not background)
   - **Adapter:** `fromDecisionRecord()` maps Forge flat audit shape to Eureka's `kind=decision` fact
   - **Idempotent:** Safe to re-ingest same decision (dedup by origin_decision_id)
   - **v1 scope:** Manual ingestion only; no background listener (deferred to v1.5)
   - **Handshake:** Forge prescriber publishes DecisionRecords to session facts; Eureka adapter consumes at user's discretion

3. **Path 2 (Bridge ledger) deferred with placeholder** — §40 specifies:
   - **v1:** `bridge_ledger` table schema defined (empty, for future extension)
   - **v1.5+:** Automated reconciliation (Cairn session end → Eureka sweep → bridge mutation logging)
   - **Design principle:** Bridge ledger is an audit trail, not a runtime FK (isolation-by-design, FR-7.2)

4. **Search query patterns documented** — §40 specifies:
   - **Simple recall:** `eureka recall "pattern name"`
   - **Tier-scoped recall:** `eureka recall --tier agent "private snippet"`
   - **Trust-filtered recall:** `eureka recall --min-trust 0.5 "fact"`
   - **Verbose mode:** `eureka recall --verbose` shows `Searched: [tiers]` and per-tier result counts

## Tensions Raised

1. **BM25 keyword-disjoint gap (UNRESOLVED)** — §40 flags a fundamental keyword-search limitation:
   - **Problem:** BM25 excels at term-matching but struggles with semantic disjunction (e.g., query="database" should match fact containing "storage" or "persistence", but BM25 won't unless those words appear in the fact)
   - **Current solution:** Trust multiplier acts as a "confidence gate" — high-trust facts rise even with lower BM25 scores
   - **v1.5+ opportunity:** Semantic embeddings (BLAKE3-addressed content, embedding_vector column) can bridge the gap, but requires:
     - Eureka v2 content-addressing (coordinate with Crucible's BLAKE3 CAS strategy)
     - Embedding generation (LLM-based or retrieval model)
     - Vector similarity search (sqlite-vec or alternative, not in v1 scope)
   - **v1 impact:** Queries must be term-aware; users discover facts via vocabulary match, not semantic similarity
   - **Recommendation:** Document this limitation in DESIGN.md; highlight as v1.5 research spike

2. **Crucible Forge location mismatch (BLOCKER)** — §40 discovers architectural inconsistency:
   - **Eureka assumption:** Forge lives in `mem/packages/forge/` (shared with Cairn, types)
   - **Crucible assumption:** Crucible fork assumes Forge in `harness/packages/forge/`
   - **Reality:** Both repos have separate Forge packages (duplication or divergence unknown)
   - **Impact:** Path 1 decision ingestion depends on Forge DecisionRecord shape. If Forge diverges between repos, adapters must be repo-aware or re-implemented.
   - **Action required:** Aaron resolves repository topology (Option A=monorepo, B=submodule, C=npm packages) before Eureka implementation starts
   - **Blocked by:** Cassima's substrate ownership memo (same root cause: shared packages ownership unresolved)

3. **Recall early-exit heuristic (k=10) needs validation** — §40 proposes early-exit at k=10 results:
   - **Rationale:** Reduce Tier 2/3 search cost if Tier 1 satisfies user need
   - **Risk:** If user is looking for project-scope facts, early exit at Tier 1 may hide relevant results
   - **v1 validation:** Instrument recall with telemetry counter `eureka_recall_early_exit_total`; track post-hoc whether early-exit facts would have been relevant
   - **v1.5 friction gate:** Valanice's memo proposes "show Searched: [tiers] by default" — this partly addresses visibility of early-exit decisions

## Cross-Section Dependencies

- Depends on: 
  - **§00 (Graham)** for M1 timeline (search is core M1 deliverable)
  - **§10 (Genesta)** for tier semantics (recall fan-out strategy)
  - **§20 (Crispin)** for schema stability (FTS5 indexing on content field)
  - **§30 (Edgar)** for sweep algorithm (used in ranking phase)
  - **Cassima (§70)** for Forge substrate ownership decision

- Enables:
  - **Laura (§50)** — recall and ingest-decisions APIs locked; acceptance criteria for search can be specified
  - **Cassima (§70)** — PRD alignment can reference search + integration specifics

- Blocks: **Substrate ownership decision (Cassima memo) — cannot finalize Forge adapter without repo topology clarity**

## Liaison Notes

- **BM25 ranker locked for v1:** FTS5-based, term-aware search with trust multiplier as confidence floor
- **Keyword-disjoint gap identified:** Semantic search deferred to v1.5+ as research spike (vector embeddings + sqlite-vec)
- **Path 1 decision ingestion specified:** Manual CLI-driven, idempotent adapter (fromDecisionRecord)
- **Path 2 bridge ledger deferred:** Schema placeholder, reconciliation logic v1.5+
- **Crucible Forge location mismatch flagged:** Repo topology decision required before Eureka implementation (blocked on Cassima substrate memo)
- **Recall early-exit heuristic proposed:** k=10 default, needs telemetry validation during Aaron dogfood

---

**Signed:** Roger  
**Confidence:** HIGH on §40 search design; HIGH on Path 1 specification; MEDIUM on keyword-disjoint mitigation (trust multiplier is pragmatic but incomplete); BLOCKED on repository topology (Cassima memo)  
**Next step:** Round 2 assembly (parallel) + await Aaron's decision on repository topology (Option A/B/C) + coordinate with Laura on acceptance criteria for search+integration
