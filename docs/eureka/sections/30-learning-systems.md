# 30. Learning Systems

**Owner:** Edgar (Learning Systems Specialist)  
**Status:** v1 implementation in progress  
**Last updated:** 2025-01-24

## Overview

This section documents Eureka's learning systems: the nine memory activities, property dynamics (trust/recency/plasticity), feedback loops, scheduling, and integration with Crucible's prescriptive loop. All specifications are at pseudocode level with concrete, measurable outcomes.

---

## 1. Memory Activities

Eureka defines ten memory activities. Eight ship in v1 (FR-4 as amended 2026-06-17 and 2026-06-24); two are deferred to v1.5 but vocabulary is reserved.

> **Vocabulary amendment history:**
> - **2026-06-17:** Split raw write (`imprint`) from cognitive orchestration (`integrate`). Activity count expanded from 7 to 8 v1.
> - **2026-06-24:** `integrate` reframed from row-insert to **post-imprint consolidation pass** (resolves §10/§30 vs PRD §3 inconsistency). `imprint` is now the public synchronous write API; `integrate` operates on already-imprinted facts and produces cross-reference edges. v1 integrate writes only `duplicate_of` edges; other edge types reserved in schema CHECK vocab for `sweep`/`meditate` (v1.5).

### 1.0 imprint (v1)

**Purpose:** Commit a new fact to durable memory. Raw mechanical write — lossless, no contextual processing, no dedup, no reconciliation. Duplicates ARE written; they are discovered later by `integrate`.

**Inputs:**
- `options: ImprintOptions` — `{ content, sessionId, trust?, importance?, attentionTier? }`

**Algorithm:**
```
function imprint(options):
  validateOptions(options)            // throws InvalidImprintError on bad input
  factId = idProvider.next()          // injected UUID seam
  createdAt = clock.now()             // injected ClockProvider
  trust         = options.trust         ?? 0.5
  importance    = options.importance    ?? 0
  attentionTier = options.attentionTier ?? 'warm'
  factWriter.write({
    factId, sessionId: options.sessionId, content: options.content.trim(),
    trust, importance, attentionTier, createdAt
  })
  // last_accessed is set to NULL by storage — load-bearing F3 semantic
  // (never-accessed → recency floor 0.1 in compositeScore).
  return factId
```

**Measurable Outcomes:**
- Facts are retrievable via `recall()` within same session.
- First-write-wins idempotency on `(factId, sessionId)`.
- Same content imprinted twice produces two distinct facts (relationship discovered later via `integrate`).

**Status:** ✅ Shipped PR #81 (2026-06-17), persona-reviewed (2026-06-21).

---

### 1.1 integrate (v1)

**Purpose:** Post-imprint consolidation pass. Reconciles already-imprinted facts within a session by discovering relationships and writing cross-reference edges. **Does NOT write new content facts** — that is `imprint`'s job.

**Inputs:**
- `options: IntegrateOptions` — `{ sessionId }`

**Algorithm:**
```
function integrate(options):
  facts = factReader.listBySession({ sessionId: options.sessionId })
  edges = []
  pairs = []
  // Exact-content pair scan, ordered by created_at (oldest first):
  for i in 0..facts.length:
    for j in i+1..facts.length:
      if facts[i].content.trim() == facts[j].content.trim():
        // Newer → older orientation
        edges.push({
          from: facts[j].factId, to: facts[i].factId,
          edge_type: 'duplicate_of',
          session_id: options.sessionId,
        })
        pairs.push({ keptFactId: facts[i].factId, duplicateFactId: facts[j].factId })
  written = relationWriter.writeEdges(edges)  // UNIQUE constraint dedupes re-runs
  return {
    sessionId: options.sessionId,
    factsScanned: facts.length,
    duplicatesFound: pairs.length,
    edgesWritten: written,
    pairs,
  }
```

**v1 Edge Semantics — only `duplicate_of`:**

| Edge type | v1 integrate writes? | Owner | Notes |
|---|---|---|---|
| `duplicate_of` | ✅ YES | integrate | Exact-content match (after `.trim()`), within `sessionId`. Orientation: newer→older by `created_at`. |
| `supersedes`, `contradicts`, `supports`, `derived_from`, `references`, `part_of`, `instance_of`, etc. | ❌ NO | reserved in CHECK vocab; written by `sweep`/`meditate` (v1.5) | Lexical-only v1 cannot honestly produce these. |

**Boundary vs. `applyFeedback('corroboration')`:**
- `applyFeedback('corroboration', factId)` (shipped) — bumps **trust** on an existing fact; recorded in `trust_history`. Property mutation. Caller asserts independent evidence.
- v1.5 `supports` edge — semantic relationship "fact A corroborates fact B" between two facts.
- These are intentionally distinct concepts; v1 ships only the property-mutation form.

**Measurable Outcomes:**
- Re-running `integrate({sessionId})` is idempotent (UNIQUE constraint on `(from_id, to_id, edge_type, session_id)`).
- No `facts` row mutation (trust, importance, attention, last_accessed unchanged).
- O(n²) pair-scan is acceptable at session scale (sessions are small in v1).

**v1 Limitations:**
- Lexical-only: no near-duplicate (case/punctuation/paraphrase) detection.
- Single-session scope only: cross-session consolidation deferred to v1.5 `sweep`/`meditate`.
- Synchronous: no background invocation in v1; caller-driven at natural pause points.

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
  session_id = getCurrentSessionId()  // From active session context
  
  // Use CuratorStore.retrieve(sessionId, query) for session-scoped retrieval (§55 §2.3)
  curator = new CuratorStore()
  candidates = curator.retrieve(session_id, query)  // BM25 lexical search with session isolation
  
  if tier_filter is provided:
    candidates = candidates.filter(f => f.tier in tier_filter)
  
  scored = []
  for fact in candidates:
    if fact.trust < trust_floor:
      continue
      
    // Compute query-time recency (FR-5)
    t = (now() - fact.last_accessed) / 86400  // days
    recency = max(0.1, (1 + t)^(-0.5))  // ACT-R power-law decay, floor 0.1
    
    // FR-2 canonical ranker formula (§30 authoritative source)
    // relevance: normalized BM25 score scaled to [0,1] via min-max normalization across candidate set
    relevance = normalizeBM25(fact.bm25_score, candidates)
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

**Scoring Formula Details:**

This is the **canonical source** for Eureka's ranker formula. All other documentation (§10, §20, §50) references this section.

**Normalized BM25:** `relevance = (bm25_score - min_score) / (max_score - min_score)` where min/max are computed across the candidate set for the given query. This ensures relevance ∈ [0,1] per query regardless of absolute BM25 magnitude.

**Formula Rationale:** See §1.2.1 "Alternatives Considered" for why additive composite over cascade filters or ML ranker.

**Measurable Outcomes:**
- BM25 relevance scoring produces stable rankings for repeated queries
- Recency decay follows Anderson's ACT-R power-law: `(1 + t)^(-0.5)` with β=1 day
- Trust floor excludes facts below 0.15
- Hot-tier facts decay importance on every recall

**Open Question:**
- What BM25 threshold below which we skip scoring entirely? (§14.2 from PRD)

---

#### 1.2.1 Alternatives Considered: Ranker Design

**Why BM25 over alternatives?**
- **TF-IDF:** BM25 includes term saturation (diminishing returns for repeated terms) and document-length normalization. Outperforms TF-IDF on recall tasks in IR literature (Robertson & Zaragoza 2009).
- **LSH (Locality-Sensitive Hashing):** Fast approximate search but requires embedding space. Deferred to v1.5 when semantic embeddings ship. BM25 is exact and deterministic for v1.
- **Semantic embeddings:** Highest recall for concept queries but requires 384+ dimensional vectors, ~4KB per fact overhead, and embedding model inference. V1.5 roadmap feature.

**Why additive composite ranker?**
- **Cascade filters** (e.g., trust > 0.5 → BM25 > 0.3 → recency sort) fail to balance dimensions; a high-trust low-relevance fact beats a high-relevance medium-trust fact. Additive composition allows dimension tradeoffs.
- **ML ranker** (LambdaMART, neural ranker) requires training data and inference latency. v1 uses deterministic formula for transparency and zero cold-start delay. ML ranking is a v1.5+ opportunity once we have scored-outcome training pairs.

**Tuning sensitivity:** Ranker weights (0.50/0.20/0.20/0.10) are heuristic-derived. A ±0.05 shift in relevance weight → ~5% ranking variance (observed in eval-set dry runs). Formal sensitivity analysis deferred to v1 production telemetry.

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
    recency = max(0.1, (1 + t)^(-0.5))
    
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
    fact.retired = true  // Mark as retired via dedicated flag
    fact.retired_at = now()
    fact.retirement_reason = reason ?? "manual"
    save(fact)
  
  emit RetirementEvent(fact_ids, reason)
  return fact_ids
```

**Measurable Outcomes:**
- Retired facts are excluded from `recall()` by default (`WHERE retired = false`)
- Facts remain in database for audit/recovery (soft delete)
- Can be retrieved with `recall({ ..., include_retired: true })` if needed
- No automatic "un-retirement" logic in v1

**Implementation Note:**
The `retired` field is a boolean flag on the `Fact` schema (§20). Default recall filter: `WHERE retired = false AND trust >= 0.15`. This is NOT trust-zeroing — `retired` is a separate dimension from trust.

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
    imprint(pattern, session_id="meditate", trust=0.5)  // synthesized pattern → raw write
    // (a subsequent integrate({sessionId='meditate'}) pass would discover
    // duplicate_of edges between newly-imprinted patterns and existing ones)
  
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
**Domain:** `[0.0, 1.0]` at storage, in memory, and in all interfaces (no storage/read distinction)

**Initial Values by Source Type:**

This is the **canonical source** for trust initialization. §10 and §20 reference this table by section number.

| Source Type | Trust | Context |
|---|---|---|
| User-confirmed/explicit | 0.9 | User explicitly verifies fact correctness |
| User-provided default | 0.6 | User writes fact via `remember()` without explicit verification |
| Agent-inferred (LLM) | 0.5 | Agent derives fact from reasoning or code analysis |
| Path 2 low-confidence | 0.4 | Forge decision record with low confidence score |
| External/API-sourced | 0.7 | Facts ingested from trusted external APIs (if used in v1) |

**Mutation Policy:**

Trust is mutable on committed facts. This is **not** a violation of fact immutability (§20) — field-level immutability applies, not row-level. Committed facts have immutable `content`, `kind`, `sources`, `provenance`, and `created_at`, but mutable `trust`, `importance`, `last_accessed`, `access_count`, and `retired`.

**Mutation Events:**

Legitimate triggers for trust mutation on committed facts:

1. **contemplate outcomes** (v1.5): ±0.05 on success, -0.10 on failure
2. **Explicit verification**: User-driven trust overrides via `setTrust(fact_id, value)` API
3. **Contradiction signals**: Tier 1 `contradicts` edge creates trust conflict (no auto-resolution in v1; manual adjudication required)
4. **Corroboration**: Multiple independent sources assert same fact → trust boost (v1.5 planned)
5. **Decay on disuse**: Rarely accessed facts decay trust over time (v1.5 planned; not in v1)

**Measurable Invariants:**
- Trust never exceeds 1.0
- Trust never falls below 0.0
- Facts with trust < 0.15 are excluded from `recall()` results (default filter)
- The 0.15 floor is a **read-time default predicate**, not a domain constraint on the field

**Extraction-Ready Design (FR-12 §6.2):**
Trust logic resides in `packages/eureka/src/learning/properties/trust.ts`. No Eureka-specific types in exports (uses plain `number` with JSDoc `@range` annotations until v1.5 branded types).

#### 2.1.1 Zombie-Fact Semantics: Trust=0 vs. Retirement

**Issue:** The trust penalty formula (`max(0.0, fact.trust - 0.10)`) can decay a fact's trust to 0.0 through repeated contradiction. With the B2 policy (trust ∈ [0,1] storage, default recall filter `WHERE retired=false AND trust>=0.15`), such a fact is **effectively invisible** (filtered by the 0.15 floor) but **formally not retired** (`retired=false`). This is a "zombie fact" — it occupies space and shows up in raw queries but never surfaces to users.

**Policy (chosen):** **Preserve the distinction.** Trust=0 means "epistemically dead" (the system has lost all confidence), but the fact is preserved for forensic analysis, replay, and future re-evaluation. Explicit retirement (`retired=true`) is reserved for deliberate lifecycle decisions: user "forget this", policy sweep, supersession, or explicit contradiction detection.

**Rationale:** Separating epistemic state (trust) from lifecycle state (retirement) provides:
1. **Audit trail:** Trust decay history (via `contemplate` outcomes) vs. explicit retirement (via `retire()` API) are distinguishable in telemetry
2. **Recovery path:** A trust=0 fact can regain trust via corroboration (v1.5) or manual correction without un-retiring
3. **Forensic value:** Operators can query "why did this fact lose trust?" by examining decision events; can't do that after deletion or conflation with retirement

**Operator Guidance:**
- Facts with trust=0.0 are filtered from default recall but retain `retired=false`
- Use `recall({ include_retired: true, min_trust: 0.0 })` in diagnostic queries to surface zombie facts
- Use `retire(fact_ids)` explicitly when a fact should be lifecycle-removed (superseded, incorrect, policy-mandated deletion)
- Trust=0 facts remain subject to `sweep()` and may be demoted or flagged for manual review

**Implementation Note:** The trust-update algorithm (in `contemplate`) applies `max(0.0, ...)` bounds-checking but does NOT set `retired=true` when trust reaches 0.0. Retirement remains a manual or policy-driven action.

---

### 2.2 Recency

**Type:** Query-time computed value (stored as `last_accessed` timestamp)  
**Formula:** ACT-R power-law decay (FR-5)

```
t = (now - last_accessed) / β
recency = max(floor, (1 + t)^(-α))

where:
  β = 86400 seconds (1 day)
  α = 0.5 (Anderson 1990 ACT-R standard exponent)
  floor = 0.1
```

**Constants Provenance:**

| Constant | Value | Derivation | Rationale |
|---|---|---|---|
| **Exponent α** | 0.5 | Anderson 1990 ACT-R literature | Standard memory-decay exponent for human declarative memory. Code-context may benefit from faster decay (α ~ 0.6–0.7) but lacks empirical calibration; defaulting to literature-grounded 0.5 for v1. |
| **Time constant β** | 1 day (86400s) | Heuristic, grounded in session intervals | Assumes agent sessions are daily; decay hits 50% at ~1 day. Tuning: if sessions are hourly, set β = 3600s; if weekly, β = 604800s. |
| **Floor** | 0.1 | Heuristic | Prevents complete irrelevance for old facts; even 100-day-old facts retain 10% recency weight. Prevents pathological zero-recency states. |

**Mutation Triggers:**
- Every `recall()` call updates `last_accessed` to `now()`
- Hot-tier facts trigger importance decay on access (FR-12 phase 1)

**Measurable Invariants:**
- Recency starts at 1.0 for newly accessed facts
- Recency approaches floor (0.1) asymptotically
- 1-day-old access: recency ≈ 0.71 (power-law with α=0.5)
- 7-day-old access: recency ≈ 0.35
- 30-day-old access: recency ≈ 0.18

**Design Rationale:**
Query-time computation avoids batch recomputation. Stored timestamps are immutable audit trail.

---

#### 2.2.1 Ranker Weights and Tier Constants Provenance

**Ranker Weights (FR-2 formula coefficients):**

| Weight | Value | Derivation | Sensitivity |
|---|---|---|---|
| Relevance | 0.50 | Heuristic, grounded in IR literature emphasis | ±0.05 shift → ~5% ranking variance. Relevance is primary signal; other dimensions are refinements. |
| Importance | 0.20 | Heuristic, balanced against trust | Equal with trust; both are intrinsic fact quality measures. |
| Trust | 0.20 | Heuristic, balanced against importance | Equal with importance; trust = provenance quality, importance = content value. |
| Recency | 0.10 | Heuristic, tuned for non-time-critical queries | Lower than others; facts don't expire rapidly in code contexts. Increase to 0.15–0.20 for time-sensitive domains (news, alerts). |

**Derivation Method:** Heuristic-derived with dry-run calibration against 10-question eval set. No formal sensitivity analysis or grid search in v1. Production telemetry (v1) will inform v1.5 tuning.

**Tier Multipliers:**

| Tier | Multiplier | Rationale |
|---|---|---|
| Hot | 1.20 | +20% boost for high-churn facts; compensates for rapid importance decay. |
| Warm | 1.00 | Baseline; no adjustment. |
| Cold | 0.80 | -20% penalty for low-activity facts; encourages tier promotion or retirement. |

**Rationale:** Multipliers provide attention budgeting — hot facts get preferential ranking even if raw score is slightly lower than warm facts. 20% delta is large enough to shift ranks (2–3 positions in top-10) but small enough to preserve within-tier quality ordering.

**Tier Thresholds:**

| Threshold | Value | Rationale | Expected Distribution |
|---|---|---|---|
| hot >= | 0.7 | High-importance facts (top ~20%) | 15–20% of facts in hot tier at steady state |
| warm >= | 0.4 | Medium-importance facts (middle ~50%) | 45–55% of facts in warm tier |
| cold < | 0.4 | Low-importance facts (bottom ~30%) | 25–35% of facts in cold tier |

**Expected Distribution:** Calibrated against Cairn's existing fact corpus (~2,500 facts in agent.db). Distribution assumes importance follows rough normal distribution; may shift if actual usage skews high-importance (e.g., narrow-domain agents).

**Trust Floor (0.15):**

**Definition of "pathological zero-trust state":** A fact with trust = 0.0 has lost all epistemic confidence (via repeated contradiction penalties). The 0.15 floor ensures facts with minimal-but-nonzero trust (e.g., 0.10–0.14 from repeated penalization) don't clutter recall results but remain in storage for audit. It's a soft-retirement threshold. See §2.1.1 for zombie-fact semantics (trust=0 vs. explicit retirement).

**Why 0.15?** Heuristic. Lower than "low-confidence Path 2" (0.4) but higher than zero. Gives facts ~3 failure-contemplate events (0.5 → 0.4 → 0.3 → 0.2) before falling below floor. Tuning: if trust floor is too high (e.g., 0.3), it prematurely excludes recoverable facts; too low (e.g., 0.05), it returns junk.

---

### 2.3 Trust Dynamics Beyond the Static Floor

**Purpose:** Event-driven trust mutation on committed facts — the mechanism by which the system learns from feedback signals at runtime.

**Activity:** `applyFeedback(options, deps)` — computes the correct clamped new trust value from an event and delegates the write to an injected `TrustUpdater` seam (§55 §1.2: storage I/O is always mocked in tests).

**Higher-level orchestrator:** `applyFeedbackById(options, deps)` — thin forwarding wrapper; delegates entirely to `applyFeedback`. Callers do not need to supply or know current trust; the atomic read-modify-write is performed inside `TrustUpdater.mutate()` by the storage layer.

**Mutation Formula:**

| Event | Formula | Clamp |
|---|---|---|
| `corroboration` | `trust + 0.10` | `min(1.0, result)` |
| `contradiction` | `trust − 0.10` | `max(0.0, result)` |
| `user_correction` | `trust + correctionDelta` | `min(1.0, max(0.0, result))` |

**Seam Interfaces:**

```typescript
// Write seam — owns the atomic read-modify-write (M7-C atomicity contract)
interface TrustUpdater {
  mutate(args: {
    factId: string;
    sessionId: SessionId;
    fn: (currentTrust: number) => number; // pure delta fn; throw to abort write
  }): Promise<void>;
}
```

**Sign Convention for User Correction:**
- `correctionDelta` is **required** for `user_correction` events — omitting it throws at runtime
- Positive delta raises trust; negative delta lowers trust
- Clamped symmetrically to `[0.0, 1.0]` domain invariant

**Guard Contracts:**
- `applyFeedback`: throws `UnhandledFeedbackEventError` for unknown event variants — pre-flight check before any I/O
- `applyFeedback`: throws `InvalidFeedbackOptionsError` if `event='user_correction'` and `correctionDelta` is `undefined`
- `applyFeedback`: throws `InvalidTrustValueError(source:'input')` if `event='user_correction'` and `correctionDelta` is non-finite (NaN, ±Infinity)
- `applyFeedbackById`: thin forwarding wrapper — all guard contracts are the same as `applyFeedback`; throws `FactNotFoundError` propagated from `TrustUpdater.mutate()` if the fact does not exist in storage
- `TrustUpdater.mutate()` (storage responsibility): throws `InvalidTrustValueError(source:'storage')` if `fn` returns non-finite or out-of-range [0,1]; write is aborted, storage unchanged

**Named Interface Types (M1–M4 pattern):**
```typescript
interface ApplyFeedbackOptions     { factId: string; sessionId: SessionId; event: FeedbackEvent; correctionDelta?: number; }
interface ApplyFeedbackDeps        { trustUpdater: TrustUpdater; }
interface ApplyFeedbackByIdOptions { factId: string; sessionId: SessionId; event: FeedbackEvent; correctionDelta?: number; }
interface ApplyFeedbackByIdDeps    { trustUpdater: TrustUpdater; }  // M7-C: factReader removed
```
No `clock` field in either deps type — clock is not consumed by the feedback path. Time injection is a concern of the recency scoring path (§2.4).

**Measurable Invariants:**
- Trust never exceeds `1.0` after any mutation
- Trust never falls below `0.0` after any mutation
- `TrustUpdater` is never called when input validation fails

**Relationship to §2.1.1 Zombie-Fact semantics:**
Repeated contradiction events can decay trust to `0.0`. The zombie-fact policy (§2.1.1) governs what happens at that floor: the fact remains in storage (`retired=false`) but is filtered by the recall `trust >= 0.15` predicate. Trust mutation and fact retirement are orthogonal dimensions.

**Implementation location:** `packages/eureka/src/activities/recall.ts` — `applyFeedback`, `applyFeedbackById`

**Test coverage:** `packages/eureka/src/activities/__tests__/recall-feedback.test.ts` — M5 (C1–C2 corroboration/contradiction) + M6-A (user-correction A1–A5 including required-delta guard) + M6-B (read-seam B1–B2)

---

### 2.4 Time Injection for Testability

**Purpose:** Enable deterministic recency tests by abstracting time source behind a mockable interface.

**Problem:** Recency formula `(now() - last_accessed) / 86400` relies on `now()`. Direct system clock calls make tests non-deterministic and time-travel scenarios (e.g., "simulate 7 days later") impossible.

**Solution:** Introduce a `ClockProvider` interface that the recency algorithm depends on. Tests inject a `MockClock` with controllable time; production code uses `SystemClock`.

**Interface Shape:**
```typescript
interface ClockProvider {
  /** Returns current Unix timestamp in seconds */
  now(): number;
}

class SystemClock implements ClockProvider {
  now(): number {
    return Date.now() / 1000;
  }
}

class MockClock implements ClockProvider {
  private _currentTime: number;
  
  constructor(initialTime: number) {
    this._currentTime = initialTime;
  }
  
  now(): number {
    return this._currentTime;
  }
  
  advance(seconds: number): void {
    this._currentTime += seconds;
  }
}
```

**Usage in Recency Calculation:**
```typescript
function computeRecency(lastAccessed: number, clock: ClockProvider): number {
  const t = (clock.now() - lastAccessed) / 86400;  // days
  return Math.max(0.1, Math.pow(1 + t, -0.5));
}
```

**Test Example:**
```typescript
it('applies 7-day recency decay', () => {
  const clock = new MockClock(1000000);
  const fact = { last_accessed: 1000000 - (7 * 86400) };
  const recency = computeRecency(fact.last_accessed, clock);
  expect(recency).toBeCloseTo(0.35);  // 7-day power-law decay with α=0.5
});
```

**Design Notes:**
- ClockProvider lives in `packages/eureka/src/learning/properties/clock.ts` (extraction-ready per FR-12).
- All time-dependent algorithms (`recall`, `rerank`, `sweep`) REQUIRE `ClockProvider` as a dependency injection parameter — no `SystemClock` default. Per §55 §1.2 and `.squad/decisions.md` M4 GREEN (2026-05-29), explicit injection prevents accidental non-determinism in production code.
- This seam is testability hygiene, not business logic. Production code never instantiates `MockClock`.

---

### 2.5 Plasticity (v1.5 — deferred)

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
5. `imprint()` captures new facts from decision outcomes (consolidation via `integrate()` runs at pause points, not per-decision)

**Feedback Signal:** Implicit (BM25 relevance, recency decay, tier multipliers)

**Measurable Cycle Time:** < 1 second per recall-decide-imprint loop

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

- **imprint:** On-demand during `remember()` calls or Path 2 ingest (raw write — always succeeds)
- **integrate:** On-demand at natural pause points (end-of-task, end-of-session); consolidation pass over already-imprinted facts in a session
- **recall:** On-demand during agent reasoning
- **rerank:** On-demand after initial recall
- **decide:** On-demand after candidate generation
- **commit:** On-demand at session-end or explicit `commitSession()` call

**Shipped SLO:**

**P95 recall latency < 500ms** — This is the sole shipped performance guarantee for v1.

**Internal Hot-Path Targets:**

These are development targets, not shipped guarantees. They guide implementation but are not customer-facing SLOs:

- imprint: < 10ms (single fact insert)
- integrate: < 50ms per session (O(n²) pair scan; sessions are small in v1)
- recall: < 100ms (BM25 query + scoring for 10 results) *(see §55 §2.1 or future perf-test cycle)*
- rerank: < 50ms (rescore 10 facts)
- decide: < 10ms (single-pass selection)
- commit: < 200ms (batch persist for typical session of 50 facts)

**M4 Load Test (Ship-Blocker):**

Load test with 1,000 facts (NFR-2 target): measure P50/P95/P99 for `recall()`. If P95 > 500ms, v1 cannot ship. Roger owns the M4 test wiring (§40).

**Production Telemetry:**

Histogram metric: `eureka_recall_latency_ms` (P50/P90/P95/P99 tracked).

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

**Measurable Sweep Time:** < 5 seconds for 10,000 facts (v1 target) *(performance assertion: see §55 §5 AC-mapping for FR-12 sweep tests or future §55 perf-test cycle)*

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

**Last updated:** 2026-05-27 (Eureka v0.1 Technical Design)

---

## 10. References

- `.squad/decisions/eureka-prd-v5-final.md` — Canonical specification (FR-1 through FR-14)
- `.squad/decisions.md` § "Crucible ↔ Eureka Cross-Project Overlap" (2026-05-27) — Crucible integration analysis, vocabulary orthogonality proof
- `.squad/decisions/learning-subpath-export-validation.md` — Extraction-ready design validation
- `.squad/agents/edgar/charter.md` — Edgar's role and authority
- `.squad/agents/edgar/history.md` — Design evolution and learnings

---

**End of Section 30**
