# Orchestration Log: edgar-learning-systems

**Agent:** Edgar (Learning Systems / Sweep Specialist)  
**Model:** claude-sonnet-4.5  
**Mode:** Parallel (Round 1)  
**Session:** Eureka v0.1 Technical Design — Round 1  
**Date:** 2026-05-27 08:13:25Z  

## Files Produced

| File | Status | Size (KB) | Purpose |
|------|--------|-----------|---------|
| `docs/eureka/sections/30-learning-systems.md` | ✅ Created | 25.8 | §30: Sweep algorithm, trust/importance mutation, contemplation patterns, tier-1 sweep specification |
| `.squad/decisions/inbox/edgar-crucible-learning-overlap.md` | ✅ Created | ~8.5 | Learning systems overlap analysis: sweep kinship, contemplate vs drift measurement, trust vs determinism |

**Total authorship:** ~34.3KB (section + decision memo)

## Key Outcomes

1. **Sweep algorithm fully specified** — §30 defines:
   - **Tier 1 sweep (v1):** Cadence-based (not session-end triggered; requires M3+ for session closure hooks)
   - **Five sweep phases:** collection, ranking, mutation, retention, finalization
   - **Collection phase:** DFS graph traversal from facts in current sweep window (default: 7-day window)
   - **Ranking phase:** BM25-like relevance + trust-weighted score (tied to recall usage patterns)
   - **Mutation phase:** Trust/importance updates (event-driven confidence changes, deprecation signals)
   - **Retention phase:** Importance-based survival thresholds; facts below importance floor → candidate for eviction
   - **Finalization phase:** Commit mutations to DB; log sweep metadata (completion_ts, facts_affected, mutations_count)

2. **Trust and importance orthogonality locked** — §30 clarifies semantic distinction:
   - **Trust:** 0..1 confidence/reliability of fact content (factuality, accuracy)
   - **Importance:** 0..1 salience/utility of fact for future work (relevance to user's work patterns)
   - **Orthogonal mutations:** Trust changes via confirmation/contradiction/verification; importance changes via recall usage, age decay, explicit demotion
   - **No automatic trust decay:** Importance decays (v1 cadence: -0.02/week); trust is event-driven only

3. **Contemplation deferred** — §30 specifies contemplation scope:
   - **v1.5+ only** (not in M2, deferred to M3 or later)
   - Narrow, deep reflection on high-value facts
   - Possible integration with Crucible's drift-prescriber pattern (v1.5+ design)
   - No background trigger in v1; on-demand invocation only
   - **Note:** Valanice's friction gates (separate memo) gate v1.5 contemplation visibility on dogfood evidence

4. **Eureka-Crucible learning kinship analyzed** — §30 identifies:
   - **Sweep mechanics kinship:** Crucible's Curator pattern (stateful orchestration of prescribers) mirrors Eureka's sweep algorithm (stateless observation → ranking → mutation). Same algorithm family, different data.
   - **Drift vs trust orthogonality:** Crucible's drift measurement (replay divergence) is orthogonal to Eureka's trust (content reliability). No automatic conversion between them; drift → Crucible policy, trust → Eureka ranker multiplier.
   - **Prescriber pattern convergence:** Both systems can leverage Forge's prescriber family (shared substrate opportunity).
   - **WAL consumption path (v1.5+ alignment):** Crucible's L1 WAL (once topology locked) and Eureka's fact store can be bridged via `SessionId` shared primitive. No collision if storage is forked (Crucible-only Cairn for v1).

5. **Path 2 ingestion (on-demand) validated** — §30 confirms:
   - Forge DecisionRecords consumed via CLI `eureka ingest-decisions --since <ts>` (user-driven, not background)
   - Adapter (`fromDecisionRecord()`) is idempotent (safe to re-ingest same decision)
   - v1.5+ may add background listener for session-end triggers; not in v1

## Tensions Raised

1. **Sweep timing relative to sessions (M2 vs M3)** — §30 specifies tier-1 sweep uses cadence-based triggers (default: daily), not session-end triggers:
   - **v1 design:** Sweep runs on fixed cadence (cron-like, independent of session lifecycle)
   - **v1.5 design:** May add session-end hooks for immediate sweep (requires M3 session schema first)
   - **Coordination needed:** If M3 (sessions) must come before M2 (sweep), milestone ordering changes. If sweep can use cadence alone in v1, M2 and M3 can parallelize.
   - **Current decision:** Cadence-based sweep is v1 path (no dependency on session-end). M2 and M3 can parallelize if needed.

2. **Contemplation visibility (v1.5 friction gate)** — §30 defers contemplation activity to v1.5+, but visibility decision is gated by dogfood evidence:
   - Valanice's friction gates (separate memo) propose: contemplate defaults to silent, opt-in via `--verbose`
   - Evidence gate: ≥10 dogfood sessions required before locking visibility default
   - **Action:** Coordinate with Aaron's dogfood roadmap to ensure contemplation instrumentation is ready for v1.5 lock gate

3. **Trust/importance balance in ranker** — §30 proposes BM25-like relevance + trust-weighted score, but exact weighting is deferred to v1 tuning:
   - Default: trust multiplier on BM25 base score (trust = 0.5 → 50% of max score, regardless of BM25 rank)
   - **v1 validation:** Actual weight balance determined empirically during Aaron dogfood
   - **Recommendation:** Instrument ranker with telemetry counters (BM25 score distribution, trust-weighted deltas, recall usage patterns) to inform v1.5 tuning

4. **Crucible drift → Eureka trust bridge (v1.5+)** — §30 notes that Crucible's drift-prescriber may eventually propose "reduce trust for high-drift sessions":
   - Currently orthogonal (drift is Crucible policy, trust is Eureka content reliability)
   - **Danger:** If Crucible prescriber auto-mutates Eureka trust, the boundary becomes implicit
   - **Recommendation:** Keep drift and trust namespaces isolated in v1. Any v1.5+ bridge requires explicit design (not auto-conversion)

## Cross-Section Dependencies

- Depends on: 
  - **§00 (Graham)** for milestone boundaries (M2 timing validated)
  - **§10 (Genesta)** for tier-1 recall semantics (used in sweep ranking phase)
  - **§20 (Crispin)** for edge traversal (sweep collection phase uses edges)
  - **Crucible PRD analysis** (cross-project, not cross-section)

- Enables:
  - **Roger (§40)** — BM25 ranker specification confirmed; integration pathway for decision ingestion
  - **Laura (§50)** — sweep algorithm locked; testability scope includes sweep simulation
  - **Cassima (§70)** — PRD acceptance criteria US-3 (sweep mechanics) can reference §30

- Blocks: None (ready for team feedback)

## Liaison Notes

- **Sweep algorithm locked:** Cadence-based (v1), no session-end dependency → M2 and M3 can parallelize
- **Trust/importance orthogonality confirmed:** Event-driven mutations, no automatic decay for trust
- **Contemplation deferred to v1.5+:** Friction gates and visibility decision require Aaron dogfood evidence
- **Crucible kinship identified:** Curator pattern mirrors sweep; namespace isolation critical for drift vs trust
- **Path 2 on-demand validated:** Forge DecisionRecord ingestion is idempotent and user-driven (no background listener v1)

---

**Signed:** Edgar  
**Confidence:** HIGH on §30 algorithm; MEDIUM on v1.5 contemplation timing (depends on dogfood schedule); HIGH on M2/M3 parallelization feasibility  
**Next step:** Round 2 assembly (parallel) + coordinate with Valanice on contemplation friction gates + Aaron on dogfood telemetry instrumentation
