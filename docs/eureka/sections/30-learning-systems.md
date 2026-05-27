# 30. Learning Systems

**Owner:** Edgar (Learning Systems Specialist)  
**Status:** v1 implementation in progress  
**Last updated:** 2025-01-24

## Overview

This section documents Eureka's learning systems: the nine memory activities, property dynamics (trust/recency/plasticity), feedback loops, scheduling, and integration with Crucible's prescriptive loop. All specifications are at pseudocode level with concrete, measurable outcomes.

---

## 1. Memory Activities

Eureka defines nine memory activities. Seven ship in v1 (FR-4); two are deferred to v1.5 but vocabulary is reserved.

### 1.1 integrate

**Purpose:** Ingest new facts into memory with initial property values.

**Inputs:**
- `payload: FactPayload` — content, category, source, importance (optional)
- `session_id: SessionId` — originating session
- `trust_hint?: number` — optional override for trust assignment

**Algorithm:**
```
function integrate(payload, session_id, trust_hint):
  fact = new Fact()
  fact.id = generateUuid()
  fact.content = payload.content
  fact.category = payload.category
  fact.source = payload.source
  fact.session_id = session_id
  fact.created_at = now()
  fact.last_accessed = now()
  fact.importance = payload.importance ?? inferImportance(payload)
  fact.tier = determineTier(fact.importance)  // hot >= 0.7, warm >= 0.4, else cold
  
  // Trust assignment (FR-3)
  if trust_hint is provided:
    fact.trust = clamp(trust_hint, 0.0, 1.0)
  else if payload.source == "explicit_write":
    fact.trust = 0.6
  else if payload.source == "derived":
    fact.trust = 0.5
  else if payload.source == "path2_high":
    fact.trust = 0.8
  else if payload.source == "path2_medium":
    fact.trust = 0.6
  else if payload.source == "path2_low":
    fact.trust = 0.4
  else:
    fact.trust = 0.5  // default

  insert fact into database
  emit IntegrationEvent(fact.id, fact.tier, fact.trust)
  return fact.id
```

**Measurable Outcomes:**
- Facts are retrievable via `recall()` within same session
- Trust values match FR-3 source-based assignment rules
- Facts land in correct tier based on importance threshold

**v1 Limitations:**
- No semantic embedding; lexical BM25 indexing only
- No automatic session-fact promotion from Cairn; requires manual `remember()` calls

---

### 1.2 recall

**Purpose:** Retrieve relevant facts from memory using query-time scoring.

**Inputs:**
- `query: string` — search text
- `limit: number` — max results (default 10)
- `tier_filter?: Tier[]` — constrain to specific tiers
- `trust_floor?: number` — minimum trust (default 0.15 per FR-3)

**Algorithm:**
```
function recall(query, limit, tier_filter, trust_floor):
  trust_floor = trust_floor ?? 0.15
  candidates = searchBM25(query)  // BM25 lexical search
  
  if tier_filter is provided:
    candidates = candidates.filter(f => f.tier in tier_filter)
  
  scored = []
  for fact in candidates:
    if fact.trust < trust_floor:
      continue
      
    // Compute query-time recency (FR-5)
    t = (now() - fact.last_accessed) / 86400  // days
    recency = max(0.1, (1 + t)^(-0.7))  // power-law decay, floor 0.1
    
    // FR-2 ranker formula
    relevance = fact.bm25_score  // normalized 0..1
    rawScore = 0.50·relevance + 0.20·fact.importance + 0.20·fact.trust + 0.10·recency
    
    // Attention multiplier
    multiplier = getAttentionMultiplier(fact.tier)  // hot=1.20, warm=1.00, cold=0.80
    finalScore = rawScore × multiplier
    
    scored.append((fact, finalScore))
  
  // Update access timestamps (triggers importance decay in hot tier)
  for (fact, score) in scored:
    fact.last_accessed = now()
    if fact.tier == "hot":
      applyImportanceDecay(fact)  // FR-12 phase 1
  
  sorted = scored.sortBy(score, descending).take(limit)
  emit RecallEvent(query, sorted.map(f => f.id))
  return sorted
```

**Measurable Outcomes:**
- BM25 relevance scoring produces stable rankings for repeated queries
- Recency decay follows ACT-R power-law: `(1 + t)^(-0.7)` with β=1 day
- Trust floor excludes facts below 0.15
- Hot-tier facts decay importance on every recall

**Open Question:**
- What BM25 threshold below which we skip scoring entirely? (§14.2 from PRD)

---

### 1.3 rerank

**Purpose:** Re-score a candidate set using updated context or user feedback.

**Inputs:**
- `fact_ids: FactId[]` — facts to rescore
- `context?: string` — additional query context
- `feedback?: Map<FactId, number>` — explicit relevance scores (-1..1)

**Algorithm:**
```
function rerank(fact_ids, context, feedback):
  facts = loadFacts(fact_ids)
  scored = []
  
  for fact in facts:
    // Recompute recency
    t = (now() - fact.last_accessed) / 86400
    recency = max(0.1, (1 + t)^(-0.7))
    
    // Base score
    relevance = fact.cached_bm25 ?? 0.5  // fallback if no BM25
    rawScore = 0.50·relevance + 0.20·fact.importance + 0.20·fact.trust + 0.10·recency
    
    // Apply feedback boost
    if feedback contains fact.id:
      boost = feedback[fact.id] × 0.3  // ±30% max adjustment
      rawScore = clamp(rawScore + boost, 0.0, 1.0)
    
    // Tier multiplier
    multiplier = getAttentionMultiplier(fact.tier)
    finalScore = rawScore × multiplier
    
    scored.append((fact, finalScore))
  
  sorted = scored.sortBy(score, descending)
  return sorted
```

**Measurable Outcomes:**
- Feedback scores shift rankings by up to ±30%
- Rerank preserves trust/importance but updates recency

---

### 1.4 decide

**Purpose:** Select a single fact or action from a candidate set using decision criteria.

**Inputs:**
- `candidates: Fact[]` — options to choose from
- `criteria: DecisionCriteria` — selection logic (e.g., highest trust, most recent, most important)

**Algorithm:**
```
function decide(candidates, criteria):
  if candidates.isEmpty():
    return null
  
  if criteria.mode == "highest_trust":
    winner = candidates.maxBy(f => f.trust)
  else if criteria.mode == "most_recent":
    winner = candidates.maxBy(f => f.last_accessed)
  else if criteria.mode == "highest_importance":
    winner = candidates.maxBy(f => f.importance)
  else if criteria.mode == "composite_score":
    scored = rerank(candidates.map(f => f.id), null, null)
    winner = scored[0]
  else:
    throw "Unknown criteria mode"
  
  emit DecisionEvent(winner.id, criteria.mode)
  return winner
```

**Measurable Outcomes:**
- Decision deterministically selects the same fact for the same input set + criteria
- Emits decision event for downstream learning

**R4 Arbitration Note:**
This activity was preserved despite overlap with `recall` because Genesta's prescriber semantics require explicit "choose one" operations (e.g., selecting which persona to invoke). `recall` returns ranked lists; `decide` returns a single choice.

---

### 1.5 commit

**Purpose:** Persist session-scoped facts to long-term memory (agent.db tier).

**Inputs:**
- `session_id: SessionId` — session containing facts to commit
- `commit_filter?: (Fact) => boolean` — optional selector

**Algorithm:**
```
function commit(session_id, commit_filter):
  session_facts = loadFactsBySession(session_id)
  
  if commit_filter is provided:
    session_facts = session_facts.filter(commit_filter)
  
  committed = []
  for fact in session_facts:
    // Promote from session-scoped to agent-tier long-term
    fact.committed_at = now()
    fact.tier = max(fact.tier, "warm")  // commit lifts tier floor to warm
    markAsCommitted(fact.id)
    committed.append(fact.id)
  
  emit CommitEvent(session_id, committed)
  return committed
```

**Measurable Outcomes:**
- Committed facts persist across sessions
- Tier floor raised to "warm" to prevent immediate cold-tier demotion

**Open Question (§14.6):**
Should there be a `commit_floor` — a minimum trust/importance threshold for auto-commit? Currently opt-in semantics only.

---

### 1.6 retire

**Purpose:** Mark facts as deprecated without deletion.

**Inputs:**
- `fact_ids: FactId[]` — facts to retire
- `reason?: string` — optional retirement rationale

**Algorithm:**
```
function retire(fact_ids, reason):
  for id in fact_ids:
    fact = loadFact(id)
    fact.retired_at = now()
    fact.retirement_reason = reason ?? "manual"
    fact.trust = 0.0  // zero trust on retirement
    save(fact)
  
  emit RetirementEvent(fact_ids, reason)
  return fact_ids
```

**Measurable Outcomes:**
- Retired facts are not returned by `recall()` due to trust floor (0.15)
- Facts remain in database for audit/recovery
- No automatic "un-retirement" logic in v1

---

### 1.7 evict

**Purpose:** Permanently delete facts from memory.

**Inputs:**
- `fact_ids: FactId[]` — facts to delete
- `cascade?: boolean` — delete dependent edges (default true)

**Algorithm:**
```
function evict(fact_ids, cascade):
  cascade = cascade ?? true
  
  for id in fact_ids:
    if cascade:
      deleteEdges(where: source_id == id OR target_id == id)
    
    deleteFact(id)
  
  emit EvictionEvent(fact_ids, cascade)
  return fact_ids
```

**Measurable Outcomes:**
- Facts are irrecoverably deleted
- Dependent Tier 1 and Tier 2 edges are removed if cascade=true
- Orphaned edges are left if cascade=false (v1.5 may add edge reconciliation sweep)

---

### 1.8 meditate (v1.5 — deferred)

**Purpose:** Background reflection on patterns across committed facts.

**Status:** Vocabulary reserved in FR-4 but not exported in v1. Implementation deferred to v1.5.

**Planned Algorithm (strawman):**
```
function meditate():
  // Identify clusters of co-accessed facts
  clusters = detectClusters(threshold=0.7)
  
  for cluster in clusters:
    // Synthesize emergent pattern
    pattern = synthesizePattern(cluster.facts)
    integrate(pattern, session_id="meditate", trust=0.5)
  
  emit MeditateEvent(clusters.length)
```

**Open Question (§14.4):**
What distinguishes `meditate` from `contemplate`? Current hypothesis: meditate = unsupervised pattern detection; contemplate = supervised outcome-driven updates.

---

### 1.9 contemplate (v1.5 — deferred)

**Purpose:** Outcome-driven trust/importance updates based on decision results.

**Status:** Vocabulary reserved in FR-4 but not exported in v1. Implementation deferred to v1.5.

**Planned Algorithm (strawman):**
```
function contemplate(decision_id, outcome):
  decision = loadDecision(decision_id)
  fact_ids = decision.selected_facts
  
  if outcome == "success":
    for id in fact_ids:
      fact = loadFact(id)
      fact.trust = min(1.0, fact.trust + 0.05)  // boost trust
      fact.importance = min(1.0, fact.importance + 0.02)
      save(fact)
  else if outcome == "failure":
    for id in fact_ids:
      fact = loadFact(id)
      fact.trust = max(0.0, fact.trust - 0.10)  // penalize trust
      save(fact)
  
  emit ContemplateEvent(decision_id, outcome, fact_ids)
```

**Measurable Outcomes (planned):**
- Trust mutations are event-driven, not automatic
- Success/failure signals come from Crucible scorecard outcomes
- Max trust boost per outcome: +0.05; max penalty: -0.10

---

## 2. Property Dynamics

Three properties govern memory evolution: trust, recency, and plasticity.

### 2.1 Trust

**Type:** Scalar `0..1`  
**Mutation:** Event-driven only (no automatic decay in v1)  
**Floor:** 0.15 for retrieval (FR-3)

**Initial Values:**
- Explicit writes: `0.6`
- Derived facts: `0.5`
- Path 2 ingestion: high→`0.8`, medium→`0.6`, low→`0.4`

**Mutation Triggers:**
1. **contemplate outcomes** (v1.5): ±0.05 on success, -0.10 on failure
2. **Explicit verification**: User-driven trust overrides via API
3. **Contradiction signals**: Tier 1 `contradicts` edge creates trust conflict (no auto-resolution in v1)
4. **Explicit writes**: New facts with `source="explicit"` get 0.6

**Measurable Invariants:**
- Trust never exceeds 1.0
- Trust never falls below 0.0
- Facts with trust < 0.15 are excluded from `recall()` results

**Extraction-Ready Design (FR-12 §6.2):**
Trust logic resides in `packages/eureka/src/learning/properties/trust.ts`. No Eureka-specific types in exports (uses plain `number` with JSDoc `@range` annotations until v1.5 branded types).

---

### 2.2 Recency

**Type:** Query-time computed value (stored as `last_accessed` timestamp)  
**Formula:** ACT-R power-law decay (FR-5)

```
t = (now - last_accessed) / β
recency = max(floor, (1 + t)^(-α))

where:
  β = 86400 seconds (1 day)
  α = 0.7 (Ebbinghaus/Wixted grounded)
  floor = 0.1
```

**Mutation Triggers:**
- Every `recall()` call updates `last_accessed` to `now()`
- Hot-tier facts trigger importance decay on access (FR-12 phase 1)

**Measurable Invariants:**
- Recency starts at 1.0 for newly accessed facts
- Recency approaches floor (0.1) asymptotically
- 1-day-old access: recency ≈ 0.50
- 7-day-old access: recency ≈ 0.27
- 30-day-old access: recency ≈ 0.14

**Design Rationale:**
Query-time computation avoids batch recomputation. Stored timestamps are immutable audit trail.

---

### 2.3 Plasticity (v1.5 — deferred)

**Type:** Scalar `0..1` (planned)  
**Purpose:** Control learning rate for trust/importance updates

**Status:** Not in v1 exports per FR-4. Vocabulary reserved.

**Planned Semantics (strawman):**
- High plasticity (0.8–1.0): Fast trust/importance adaptation
- Low plasticity (0.0–0.3): Stable, resistant to single-event updates
- Default: 0.5

**Mutation (planned):**
- Decreases with fact age: `plasticity = initial × e^(-λt)` where λ is tunable decay rate
- Increases on explicit review/verification events

**Open Question:**
How does plasticity interact with contemplate's fixed ±0.05/±0.10 deltas? Should contemplate scale deltas by plasticity?

---

## 3. Feedback Loops

Eureka's learning operates through two complementary loops:

### 3.1 Short Loop: Intra-Session Adaptation

**Duration:** Milliseconds to minutes (within single session)

**Components:**
1. `recall()` retrieves facts
2. Agent uses facts in reasoning
3. `rerank()` adjusts based on immediate feedback
4. `decide()` selects action
5. `integrate()` captures new facts from decision outcomes

**Feedback Signal:** Implicit (BM25 relevance, recency decay, tier multipliers)

**Measurable Cycle Time:** < 1 second per recall-decide-integrate loop

---

### 3.2 Long Loop: Cross-Session Consolidation

**Duration:** Hours to days (across multiple sessions)

**Components:**
1. `commit()` persists session facts to agent.db tier
2. Sweep algorithm (FR-12) runs at session-end or first-query-of-day
3. Importance decay, tier demotions, Tier 2 edge population
4. Stale flags emit (`stale_aspiration`, `stale_trust`)
5. Path 2 ingestion pulls Forge decision records (FR-14)

**Feedback Signal:** Event-driven (sweep triggers, Path 2 ingest, contemplate outcomes in v1.5)

**Measurable Cycle Time:** 1–7 days for tier demotions; on-demand for Path 2 ingest

---

### 3.3 Crucible-Eureka Feedback Substrate

**Key Insight:** Crucible's recorded sessions are Eureka's training goldmine (from `edgar-crucible-learning-overlap.md`).

**Complementary Loops:**
- **Crucible loop:** Prescriber → Review-Gate → Apply/Inbox → Scorecard (minutes–hours, per-session)
- **Eureka loop:** Recall → Integrate → Sweep → Trust mutations (days–weeks, cross-session)

**Not Redundant:** Crucible optimizes behavior (personas, pre-commit gates); Eureka optimizes knowledge (fact relevance, trust evolution).

**Integration Points:**
1. **Prescriber ownership transition:** When prescriber generates a persona prescription (e.g., "invoke Design Panel"), should that be `integrated` as a Eureka fact? Decision: Yes, but requires shared SessionId (v1.5 dependency on Cairn migration per §14.1).
2. **Dogfood sequencing:** Eureka can't learn from Crucible until Crucible itself uses Eureka-backed personas. Chicken-egg resolved by Path 2 manual ingest for cold-start.
3. **Feedback substrate wiring:** Scorecard outcomes (success/failure) feed `contemplate()` trust updates (v1.5).

**Open Question:**
Who owns the transition moment when prescriber logic migrates from hard-coded to Eureka-recalled? (Genesta decides prescriber semantics; Edgar implements recall mechanics; Crispin provides schema.)

---

## 4. Activity Scheduling

Activities trigger on different cadences:

### 4.1 Synchronous (Request-Driven)

- **integrate:** On-demand during `remember()` calls or Path 2 ingest
- **recall:** On-demand during agent reasoning
- **rerank:** On-demand after initial recall
- **decide:** On-demand after candidate generation
- **commit:** On-demand at session-end or explicit `commitSession()` call

**Measurable Latency:**
- integrate: < 10ms (single fact insert)
- recall: < 100ms (BM25 query + scoring for 10 results)
- rerank: < 50ms (rescore 10 facts)
- decide: < 10ms (single-pass selection)
- commit: < 500ms (batch persist for typical session of 50 facts)

---

### 4.2 Asynchronous (Sweep-Driven)

- **retire:** Typically manual, but sweep can trigger on stale flags
- **evict:** Manual only (no auto-eviction in v1)

**Sweep Triggers (FR-12):**
1. End-of-session (heuristic in v1: 5 minutes idle)
2. First-query-of-day (detects day boundary in `last_sweep_time`)

**v1.5 Opportunity:** Cairn session-end events with shared SessionId provide authoritative sweep trigger.

**Sweep Phases (5 atomic phases):**
1. **Importance decay:** Hot tier on every access; warm/cold on sweep
2. **Tier demotions:** Session-count hysteresis (N accesses in M sessions, tunable)
3. **Tier 2 edge population:** `similar_to`, `co_accessed_with`, `recalled_in`
4. **Stale flag emission:** `stale_aspiration`, `stale_trust`
5. **Edge weight reconciliation:** Adjust weights against new evidence (no fact mutation)

**Measurable Sweep Time:** < 5 seconds for 10,000 facts (v1 target)

---

### 4.3 Background (Deferred to v1.5)

- **meditate:** Periodic (e.g., daily) unsupervised pattern detection
- **contemplate:** Event-driven on decision outcome signals

**Planned Triggers:**
- meditate: Daily at 02:00 local time (low-usage window)
- contemplate: On scorecard event from Crucible (requires event subscription)

---

## 5. Measurable Outcomes

### 5.1 Precision/Recall Metrics

**Recall Precision:** Fraction of returned facts that are relevant (human-judged)  
**Recall Recall:** Fraction of relevant facts in corpus that are returned

**v1 Baseline (BM25 lexical):**
- Precision target: > 0.6 for top-10 results
- Recall target: > 0.4 for keyword-scoped queries

**v1.5 Goal (with embeddings):**
- Precision target: > 0.75
- Recall target: > 0.6 for concept-scoped queries

**Measurement Method:** Human-labeled eval set of 50 representative queries against known-good corpus.

---

### 5.2 Trust Calibration

**Metric:** Correlation between fact trust and outcome success rate

**v1 Baseline:** Not measurable (contemplate deferred to v1.5)

**v1.5 Goal:** Trust ≥ 0.7 facts should predict > 70% decision success rate

**Measurement Method:** Retrospective analysis of Crucible scorecard outcomes correlated with trust of facts used in decision.

---

### 5.3 Sweep Performance

**Metric:** Sweep execution time vs corpus size

**v1 Target:**
- 1,000 facts: < 1 second
- 10,000 facts: < 5 seconds
- 100,000 facts: < 30 seconds (v1.5 goal)

**Measurement Method:** Instrumented sweep timer with corpus size buckets.

---

### 5.4 Path 2 Ingest Latency

**Metric:** Time from Forge decision record creation to Eureka fact availability

**v1 Target (on-demand CLI):**
- Ingest 100 decision records: < 10 seconds
- Ingest 1,000 decision records: < 2 minutes

**v1.5 Goal (automatic subscription):**
- Background ingest latency: < 30 seconds from decision commit

**Measurement Method:** Timestamp delta between Forge record `created_at` and Eureka fact `created_at`.

---

## 6. R4 Arbitrations

During R4 design review, three activity overlaps were identified and resolved:

### 6.1 recall vs rerank

**Concern:** Both rank facts; is `rerank` redundant?

**Resolution:** `recall` is the primary retrieval path (BM25 + FR-2 scoring). `rerank` is a secondary refinement using additional context or explicit feedback. Both preserved.

**Rationale:** Genesta's prescriber may need iterative refinement after initial recall (e.g., user says "not that one, try again"). `rerank` avoids full BM25 re-query.

---

### 6.2 decide vs recall

**Concern:** Both select facts; is `decide` redundant?

**Resolution:** `recall` returns ranked lists (top-K). `decide` returns a single choice using explicit criteria. Both preserved.

**Rationale:** Genesta's prescriber semantics require explicit "choose one" operations (e.g., selecting which persona to invoke). `recall` is insufficient.

---

### 6.3 retire vs evict

**Concern:** Both remove facts; is `retire` redundant?

**Resolution:** `retire` is soft delete (zero trust, audit trail remains). `evict` is hard delete (irrecoverable). Both preserved.

**Rationale:** GDPR compliance may require `evict` for PII. Operational safety prefers `retire` to preserve learning history.

---

## 7. Crucible Overlap

From `edgar-crucible-learning-overlap.md`:

### 7.1 Self-Improvement Loops Are Complementary

- **Crucible optimizes behavior:** Persona selection, pre-commit review gates, scorecard outcomes
- **Eureka optimizes knowledge:** Fact relevance, trust evolution, cross-session consolidation

**Not redundant:** Crucible operates on per-session decisions; Eureka operates on cross-session memory.

---

### 7.2 Trust vs Confidence: Orthogonal Properties

**Trust (Eureka):** Backward-looking — "How much evidence supports this fact's validity?"  
**Confidence (Crucible):** Forward-looking — "How certain am I this decision will succeed?"

**No semantic collision:** Trust is a property of facts. Confidence is a property of decisions.

---

### 7.3 Recency vs Drift: Orthogonal Timescales

**Recency (Eureka):** Memory access decay (days–weeks)  
**Drift (Crucible):** Behavior adaptation decay (minutes–hours)

**No collision:** Recency governs fact retrieval; drift governs persona plasticity.

---

### 7.4 Three Open Decision Gates

1. **Prescriber ownership transition:** When prescriber logic migrates from hard-coded to Eureka-recalled, who designs the boundary? (Genesta + Edgar co-decision)
2. **Dogfood sequencing:** Crucible can't learn from its own sessions until it uses Eureka-backed personas. Cold-start via Path 2 manual ingest.
3. **Feedback substrate wiring:** Scorecard → contemplate trust updates requires event subscription. Deferred to v1.5 pending Cairn migration (§14.1).

---

## 8. Open Questions

Documented in PRD §14:

### 8.1 Cairn Migration Timing (§14.1)

**Question:** When does Cairn migrate to Eureka-backed session storage?

**Impact:** Authoritative sweep triggers, shared SessionId for Crucible-Eureka integration, automatic session-fact promotion.

**Status:** Blocked on Cairn v2 planning (Graham's charter).

---

### 8.2 BM25 Threshold Tuning (§14.2)

**Question:** What BM25 score threshold should we use to skip low-relevance facts entirely?

**Impact:** Query performance vs recall completeness tradeoff.

**Status:** Requires production telemetry from v1 usage.

---

### 8.3 Subpath Export Topology at Scale (§14.3)

**Question:** Will `packages/eureka/src/learning/` subpath export scale to 10+ learning-kernel consumers?

**Impact:** NPM package management, version conflicts, bundle size.

**Status:** Design validated by `learning-subpath-export-validation.md`; production validation pending v1 usage.

---

### 8.4 contemplate vs meditate Boundary (§14.4)

**Question:** What distinguishes contemplate (supervised updates) from meditate (unsupervised pattern detection)?

**Impact:** Activity surface clarity, implementation complexity.

**Status:** Strawman hypothesis documented in §1.8 and §1.9; deferred to v1.5 for empirical validation.

---

### 8.5 MCP Server Wrapper Shape (§14.5)

**Question:** Should Eureka export an MCP server wrapper for external tool integrations in v1.5?

**Impact:** Extensibility, third-party integrations.

**Status:** Deferred to v1.5 pending MCP protocol stability.

---

### 8.6 commit_floor Semantics (§14.6)

**Question:** Should `commit()` enforce a minimum trust/importance threshold for auto-commit?

**Impact:** Prevents garbage facts from cluttering long-term memory.

**Status:** v1 uses opt-in semantics only; threshold gating deferred to v1.5.

---

### 8.7 Cross-Machine Sync CRDT (§14.7)

**Question:** How should Eureka handle multi-device sync for shared agent.db state?

**Impact:** Cloud sync, conflict resolution, CRDT design.

**Status:** Deferred to v2; v1 assumes single-device usage.

---

## 9. Implementation Status

**Current State (2025-01-24):**
- FR-1 through FR-14 specified and locked post-R8
- 7 v1 activities exported via FR-4
- Trust/recency properties implemented
- Sweep algorithm 5-phase design complete
- Path 2 ingest adapter stubbed
- BM25 indexing via better-sqlite3 FTS5
- Extraction-ready design validated

**Next Steps:**
1. Implement contemplate/meditate stubs for v1.5 vocabulary reservation
2. Wire Cairn session-end events for authoritative sweep triggers (pending Cairn v2)
3. Build production telemetry for BM25 threshold tuning
4. Add branded types for Trust/Confidence in v1.5 (FR-12 mechanism #7)

---

## 10. References

- `.squad/decisions/eureka-prd-v5-final.md` — Canonical specification (FR-1 through FR-14)
- `.squad/decisions/inbox/edgar-crucible-learning-overlap.md` — Crucible integration analysis
- `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` — Vocabulary orthogonality proof
- `.squad/decisions/learning-subpath-export-validation.md` — Extraction-ready design validation
- `.squad/agents/edgar/charter.md` — Edgar's role and authority
- `.squad/agents/edgar/history.md` — Design evolution and learnings

---

**End of Section 30**
