# Session Log: 2026-05-01T18:14:00Z — Phase 4.5 Local Feedback Loop, Round 2

**Participants:**
- graham-brainstorm (Lead, Round 2) — Caching architecture + ancestry graph + intermediate steps
- roger-brainstorm (Platform Dev, Round 2) — Vector search, graph storage, caching at data layer
- alexander-brainstorm (SDK/Runtime Dev, Round 2) — Runtime caching, SDK cache optimization
- rosella-brainstorm (Plugin Dev, Round 2) — Karpathy wiki, knowledge graphs, ancestry integration, caching layers

**Topic:** Phase 4.5 Local Feedback Loop brainstorm — follow-up on caching strategy, advanced storage patterns (vector search, graph, Karpathy wiki), ancestry tracking, and max detail tradeoffs.

---

## Key Outcomes

### Caching: 4-Layer Hierarchy

Consensus on cache architecture:
- **L1 (In-Memory):** Session-scoped, fast eviction, ~100ms window
- **L2 (Session Store):** Persistent across turns, medium TTL (~5 min)
- **L3 (Short-TTL):** ~1 hour, semantic fingerprinting for cache hits
- **L4 (Long-TTL):** ~30 days, archival layer for ancestry and pattern extraction

**Implementation notes:**
- Tool memoization at L1 prevents redundant SDK calls within a turn
- SDK prefix stability enables cross-session cache reuse (deterministic model/tool state)
- Cache invalidation: explicit (model change, tool version update) + time-based

### Vector Search: sqlite-vec Integration

Roger's platform proposal:
- Embed session logs, tool invocations, decision records into vectors
- Use `sqlite-vec` extension for semantic pattern matching
- Skill retrieval by embedding query (user intent → skill recommendations)
- **Tradeoff:** ~5-10 MB per 1K embedded artifacts; schema migration needed for Cairn's DBOM layer

**Validation:** sqlite-vec works with better-sqlite3; no blocking issues.

### Graph Storage: Adjacency Lists + Recursive CTEs

Alexander's runtime proposal:
- Store knowledge graph as edges in `knowledge_graph_edges` table (source_id, target_id, relation_type, weight)
- Query ancestry via recursive CTEs (`WITH RECURSIVE ancestors AS ...`)
- **Tradeoff:** 1-2ms per recursive query for graphs <10K nodes; BFS/DFS traversal CPU-bound
- Cross-phase ancestry links (Phase 3 decision → Phase 4 cache layer → Phase 5 prediction) traceable in single query

**Validation:** CTEs tested; baseline performance acceptable.

### Ancestry Tracking: 3-Phase Roadmap

Rosella's long-term vision:
1. **Phase 4.5 (MVP, ~200 LOC):** Linear provenance chain (which decisions led to which prescriptions)
2. **Phase 5 (Advanced):** Change vectors (quantify drift when prescriptions are applied)
3. **Phase 6+ (Genetic Programming):** Graph math for intelligent exploration of metric space

**MVP scope:** Capture prescription ancestry in `prescriptions.ancestry_chain` (JSON array of IDs), reconstruct decision path on read.

### Max Detail Tradeoff: Tension Between Upstream Filtering vs. Downstream Filtering

**Roger's stance (Platform Dev):** "Filter upstream"
- Fewer artifacts to store = simpler queries, lower storage costs, faster retrieval
- Risk: Discarding potentially relevant context; harder to backfill if filtering rules change

**Alexander's stance (SDK/Runtime Dev):** "Capture everything, filter on read"
- Maximize detail available for future analysis (ancestry, pattern extraction, genetic programming)
- Risk: Unbounded storage growth; Aaron's prior guidance: "Why would we not want as much detail as possible?"
- Mitigation: Time-based retention policies (archive at 1yr), compression, async filtering

**Resolution:** Aaron's directive confirmed maximum detail as preferred. Tradeoffs to be articulated explicitly before any future pruning decisions. Archive strategy deferred to Phase 5 if storage becomes a bottleneck.

### Wild Cards (Future Backlog, All Approved)

1. **Time-Travel Debugging** (Rosella) — Rewind state to any decision point, replay with different model/parameters
2. **Predictive Cache Warming** (Rosella) — Pre-fetch likely-needed artifacts before user requests them
3. **Self-Annealing Prescriptions** (Graham) — Feedback loop automatically re-ranks prescriptions based on outcomes
4. **Genetic Programming Ancestry** (Alexander) — Crossover + mutation of decision graphs to escape local optima
5. **Karpathy Wiki Integration** (Rosella) — Encode knowledge graph as an executable wiki for interactive exploration
6. **Adaptive Skill Ranking** (Roger) — Vector-based skill retrieval with user feedback loop

---

## Decisions Deferred to Aaron

All Aaron directives captured in `.squad/decisions/inbox/copilot-directive-2026-05-01T18-14.md`:
- Loop trigger model (Forge: manual, Cairn: automatic)
- Profile granularity (all four levels viable: skill, user, model, global)
- Cold start strategy (canary bootstrap confirmed)
- Ancestry graph optimization exploration
- Feedback loop frequency (maximum detail preferred)
- Wild card backlog (all six approved)

---

## Artifacts Produced

- Session log (this file): `.squad/log/2026-05-01T18-14-00Z-brainstorm-round2.md`
- Orchestration logs (4 agents): `.squad/orchestration-log/2026-05-01T18-14-00Z-{graham|roger|alexander|rosella}-round2.md`
- Decision logs: Merged to `.squad/decisions.md`
- Agent history updates: `.squad/agents/{agent}/history.md` (Round 2 learnings appended)

---

## Next Steps

1. **Phase 4.5 Implementation Planning:** Rosella to draft MVP ancestry tracking spec (200 LOC target)
2. **Cache Layer Migration:** Alexander to integrate L1-L4 hierarchy into Forge runtime
3. **Vector Search Spike:** Roger to prototype sqlite-vec integration in Cairn
4. **Graph Storage Validation:** Alexander to add recursive CTE tests for ancestry queries
5. **Storage Retention Policy:** Graham to propose time-based archival strategy (Phase 5 kickoff)
