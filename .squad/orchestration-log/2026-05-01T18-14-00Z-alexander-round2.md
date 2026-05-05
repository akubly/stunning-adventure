# Orchestration Log: Alexander — 2026-05-01T18:14:00Z, Round 2

**Agent:** alexander-brainstorm  
**Role:** SDK/Runtime Dev  
**Round:** 2 (Phase 4.5 Local Feedback Loop)  
**Status:** Completed successfully  

---

## Task Briefing

**Mandate:** Follow up on Round 1 brainstorm with focus on runtime caching, SDK cache optimization, and max detail tradeoffs for cache layer integration.

**Inputs:**
- Round 1 Session Log (runtime caching implications, SDK prefix stability, cache invalidation patterns)
- Aaron's Round 1 directives (maximum detail preferred, cold start canary, profile granularity)
- Cross-agent outcomes (Graham: ancestry roadmap, Roger: vector search + graph storage, Rosella: Karpathy wiki + caching)

---

## Work Completed

### 1. Runtime Caching Integration

**Outcome:** 4-Layer Hierarchy Mapped to Forge Runtime
- **L1 (In-Memory):** Tool result memoization in `HookComposer`. Attached to `onToolUse` hook. Fast eviction (~100ms window). Prevents redundant SDK calls within single session turn.
- **L2 (Session Store):** Persists across turns via `CairnBridgeEvent` provenance caching. Session-scoped TTL (~5 min).
- **L3 (Short-TTL):** Query result cache (ancestry chains, skill lookups). ~1 hour TTL. Reusable across sessions with matching context fingerprint.
- **L4 (Long-TTL):** Archival layer for offline analysis. ~30 day TTL before compression.

**Implementation Location:** `packages/forge/src/cache/` (new module)
- `cache.ts` — Cache manager with layer hierarchy
- `invalidation.ts` — Invalidation logic (model change, tool version, ancestry drift detection)
- `memoization.ts` — Tool result memoization decorator for hooks

**Next:** Integrate into Hook Composer; add cache metrics instrumentation (hit rate, eviction rate, layer utilization).

### 2. SDK Cache Optimization

**Outcome:** Prefix Stability Enables Cross-Session Cache Reuse

**Problem:** SDK `listModels()` output changes when models are added/deprecated. Direct model/tool IDs as cache keys break when SDK updates.

**Solution:** Prefix-based cache keys
- Model: Use `<prefix>/<model-id>` (prefix = API version + region). Same model, different region = different cache entry.
- Tool: Use `<tool-namespace>/<tool-name>@<version>`. Tool version bumps invalidate L1-L2; L3-L4 retained (semantic compatibility assumed).
- Session: Use `<session-type>/<user-id>/<timestamp-bucket>`. Group users by session type (CLI, Extension, API). Timestamp bucket = 1-hour window. Enables warm cache on similar user patterns.

**Cache Warmth:** On session start, pre-populate L2-L3 with likely-needed artifacts based on user history (same user type, same model preferences).

**Metrics:** Track L1-L4 hit rates per layer. Monitor prefix invalidation frequency (should be rare post-launch).

### 3. Max Detail Tradeoff: Capture Everything vs. Filter Upstream

**Outcome:** Downstream Filtering Confirmed as Correct Path

**My Position (Capture Everything, Filter on Read):**
- L1-L2 cache captures full event payloads (no truncation). Enables retrospective analysis if filtering rules change.
- Maximize detail available for ancestry reconstruction, pattern extraction, and future genetic programming.
- Supports Aaron's guidance: "Why would we not want as much detail as possible?"
- Mitigation: Time-based retention policies (archive at 1yr), compression, lazy loading (decompress on query).

**Roger's Counter (Upstream Filtering):**
- Filter at event bridge, store only essential data. Reduces storage footprint and query complexity.
- Risk: Lose context if filtering assumptions change.

**Aaron's Directive:** Maximum detail preferred. Implement downstream filtering; defer pruning decisions until Phase 5 with empirical storage metrics.

**Implementation:** Event provenance includes full `CairnBridgeEvent` payload. Ancestry chains capture decision IDs (lightweight), full decision records stored separately (compressible). Query layer selectively loads expanded records.

### 4. Cache Invalidation & Ancestry Integration

**Outcome:** Ancestry Chain as Cache Invalidation Trigger

**Pattern:** When prescription applied and outcomes measured:
1. Mark ancestry chain nodes with outcome metrics (success, drift, model preference shift)
2. Invalidate L3-L4 cache entries for "divergent" ancestries (different outcome class)
3. Warm cache with "converging" ancestries (similar model/tool choices, similar outcome)

**Example:** User A tried `model=gpt-4, tool=vector-search` → good outcome. User B tries `model=gpt-3.5, tool=bm25` → poor outcome. On next session, warm User B's cache with User A's model/tool choices if user profile matches.

**Ancestry Metadata:** Store in `prescriptions.ancestry_chain` (Phase 4.5 MVP):
```json
{
  "chain": [
    {"decision_id": "d1", "type": "model_selection", "value": "gpt-4", "outcome": "success"},
    {"decision_id": "d2", "type": "tool_choice", "value": "vector-search", "outcome": "success"}
  ],
  "convergence_class": "high_quality_ml",
  "last_verified": "2026-05-01T18:14:00Z"
}
```

---

## Decisions Captured

- **Cache Layer Integration:** Deferred to Phase 4.5 implementation (non-blocking for launch)
- **Prefix Stability:** Implement immediately (enables cross-session reuse)
- **Max Detail:** Confirm downstream filtering strategy. Measure storage growth Phase 4.5 → Phase 5.
- **Ancestry Integration:** Phase 4.5 MVP captures linear provenance; Phase 6+ genetic programming uses graph patterns

---

## Collaboration Notes

- **Graham (Lead):** Confirmed 4-layer hierarchy alignment. Ancestry roadmap supports cache invalidation patterns.
- **Roger (Platform Dev):** Confirmed graph storage viability for ancestry queries. Recursive CTEs enable efficient convergence detection.
- **Rosella (Plugin Dev):** Confirmed ancestry metadata structure supports Karpathy wiki navigation (ancestor → descendant links).

---

## Artifacts for Team Memory

1. **Cache Layer Integration Spec:** Formal architecture doc for Forge runtime
2. **Prefix Stability Pattern:** Reusable SDK optimization template for other teams
3. **Ancestry-Driven Cache Invalidation:** Design pattern for feedback loop optimization

---

## Sign-Off

Round 2 brainstorm complete. Runtime caching strategy finalized. SDK optimization patterns documented.

✅ **Status:** Ready for Phase 4.5 implementation kickoff.
