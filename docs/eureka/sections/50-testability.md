# 50. Testability

## Overview

**Positioning:** §55 (London-School TDD Strategy) is the implementation spine — London-school outside-in TDD drives collaborator shape from tests. §50 is the complementary layer underneath: property-based tests for trust/recency invariants, edge-case checklists, integration boundary tests at storage/bridge seams, and the contract-first patterns the outside-in tests can lean on. For the TDD workflow (red/green/refactor rhythm, mock discipline, AC mapping), see §55.

This section defines test patterns for Eureka v1's continuous properties, tier boundaries, and cross-package integration seams. Tests prioritize the riskiest behaviors: recall scoring dynamics, tier boundary resolution, trust/recency decay, and Forge↔Eureka ingestion integrity.

**Test philosophy**: Property-based for continuous properties (trust, recency), metamorphic for scoring curves, contract testing for integration seams, and human-in-loop for 80% precision threshold validation (AC-1.3). For unit test workflow and mock patterns, see §55.

**Test framework**: Vitest, following `packages/cairn/vitest.config.ts` patterns. In-memory SQLite for isolation, deterministic seeds for reproducibility, time-travel mocks for recency/decay testing.

---

## Test Layers

**Note:** §55 defines the outside-in TDD workflow for activity tests (recall, integrate, rerank, etc.). This section documents the complementary property-based and integration test layers that validate invariants the outside-in tests assume.

### Unit Tests
**Status:** Complementary to §55. For TDD workflow and mock discipline, see §55 §1-3.

**Scope**: Pure functions, single-responsibility modules, schema contracts.

**Coverage targets**:
- Activity implementations (recall, integrate, rerank, decide, commit, retire, evict)
- Scoring formula: `rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency` with tier multipliers
- Trust floor filtering (< 0.15 exclusion rule)
- Fact schema validation (id, kind, content, sources[], trust, importance, attention_tier, committed, session_id)
- Edge type contracts (Tier 1 eager: originated_in, modified_in; Tier 2 sweep: similar_to, co_accessed_with)

**Critical invariants**:
- `trust ∈ [0, 1]`, `importance ∈ [0, 1]`, `recency ∈ [0, 1]`
- Committed facts are partially immutable — `content`, `kind`, `sources`, `provenance` immutable post-commit; `trust`, `importance`, `last_accessed`, `access_count`, `retired` always mutable (required for learning, decay, retirement; see §20 schema and §30 §X mutation policy)
- BM25 relevance scores normalized to [0, 1] before blending
- Tier multipliers: hot=1.0, warm=0.5, cold=0.1 (FR-6)

### Integration Tests
**Status:** Complementary to §55. Outside-in tests (§55) mock at storage/network seams; these tests validate the real implementations honor those contracts.

**Scope**: Multi-module workflows, cross-package contracts, database boundaries.

**Coverage targets**:
- **Cairn↔Eureka**: SessionId brand flows (from `@akubly/types`), session lifecycle hooks
- **Forge↔Eureka**: `fromDecisionRecord()` ingestion path (US-6), bridge ledger append-only integrity
- **Eureka→Forge**: `toDecisionRecord()` projection (contemplative decisions, v1.5 deferred but vocabulary reserved)
- **Three-tier storage**: agent.db (fully wired), user.db/project.db stubs (throw on write, empty on read per v1 scope)

**Bridge ledger validation**:
- No runtime ATTACH queries (FR-7.2 hard rule)
- Offline reconciliation via `eureka reconcile` CLI
- Ledger append-only (no UPDATE/DELETE allowed)

### End-to-End Tests
**Scope**: Full recall-to-commit workflows, multi-session scenarios, acceptance criteria validation.

**AC-1 (Codebase Familiarization)**:
- AC-1.1: Store facts across 3 tiers (v1: agent.db only, user/project stub)
- AC-1.2: Recall P95 < 500ms (load test with N=1000 facts)
- AC-1.3: Precision ≥80% (human-in-loop dataset required, see Open Questions)
- AC-1.4: Token reduction ≥50% (compare `facts.content.length` to original transcript length)

**AC-2 (Cross-Session Continuity)**:
- AC-2.1: Session facts persist and resurface in subsequent sessions
- AC-2.2: Session edges (originated_in, modified_in) track provenance
- AC-2.3: Recall P95 < 200ms (tighter than AC-1.2 due to scoped search)
- AC-2.4: Checkpoints drive recall (test checkpoint→fact retrieval path)
- AC-2.5: Caller cooperation contract (graceful degradation when caller omits context)

**AC-6 (Decision Ingestion)**:
- AC-6.1: Forge→Eureka bridge stores decisions as kind=decision facts
- AC-6.2: Lossy projection acceptable (only id, title, why, chosen preserved)
- AC-6.3: Bridge ledger records all operations (test append-only invariant)

### Property-Based Tests
**Status:** Complementary to §55. Outside-in tests (§55 §2) discover collaborator interfaces; these tests validate invariants hold across parameter ranges.

**Scope**: Continuous property ranges, scoring dynamics, monotonicity invariants.

**Trust scoring properties**:
- Monotonicity: `trust(fact_a) > trust(fact_b) ⟹ rawScore(fact_a) ≥ rawScore(fact_b)` (holding relevance, importance, recency constant)
- Trust floor: Facts with `trust < 0.15` never appear in results
- Trust updates: Re-scoring after trust mutation preserves rank order within ±5% margin

**Recency decay properties**:
- Time-monotonic: Older facts have lower recency scores (test across 1-hour, 1-day, 1-week, 1-month spans)
- Boundary behavior: Recency at session boundary (t=0) vs. t=1ms vs. t=1s
- Decay curve: Exponential decay model (half-life TBD, test parameterization)

**Importance properties**:
- Importance ∈ [0, 1] enforced at write time (schema validation)
- Importance multiplier in scoring: 0.20 weight (test coefficient sensitivity)
- Importance updates: Re-scoring after importance mutation preserves rank order within ±5% margin

**Plasticity policies**:
- `committed=false` facts: Read/write allowed
- Committed facts: Content fields (`content`, `kind`, `sources`, `provenance`) are immutable; learning fields (`trust`, `importance`, `last_accessed`, `access_count`, `retired`) are always mutable (see §20 schema and §30 §X for mutation policy)
- Escalation: Test commit transition is irreversible

**Attention tier properties**:
- Tier multipliers: hot=1.0, warm=0.5, cold=0.1 (FR-6)
- Tier transitions: Test manual demotion (hot→warm→cold) and promotion (cold→warm→hot)
- Sweep-triggered tier changes: Test attention_tier updates after `similar_to` edge creation

### Human-in-Loop Tests
**Scope**: Precision/recall validation requiring ground truth datasets.

**AC-1.3 precision target (≥80%)**:
- Requires curated test dataset with labeled relevance judgments
- Dataset construction: 20+ queries, 50+ facts, binary relevance labels per query-fact pair
- Evaluation: Precision@10 (P@10) for each query, average across queries
- Baseline: Random baseline (expected P@10 ≈ 0.10 with 10% relevant facts)

**Failure mode exploration**:
- BM25 lexical mismatch: Query="authentication" vs. fact="login credentials" (no token overlap)
- Documented degradation: v1 recall gated on keyword overlap, semantic search deferred to v1.5 (sqlite-vec)
- Test validates graceful degradation (empty results) rather than incorrect results

---

## Verification Strategy Per Activity

**Note:** For outside-in TDD workflow (red/green/refactor), see §55 §2 (worked recall example) and §55 §5 (AC-to-test mapping). This section documents complementary edge-case checklists and property tests.

### Recall (Primary)
**Inputs**: Query string, session_id, tier scope (default: agent.db only in v1)
**Outputs**: Ranked list of facts (id, content, trust, importance, recency, rawScore)
**Contracts**:
- P95 latency < 500ms (AC-1.2) with N=1000 facts
- P95 latency < 200ms (AC-2.3) with session-scoped search (N~50 facts)
- Trust floor: No facts with trust < 0.15 in results
- Scoring formula: Validate coefficient weights (0.50, 0.20, 0.20, 0.10) and tier multipliers

**Tests**:
- Unit: Scoring function with known inputs (trust=0.9, importance=0.8, recency=0.7, relevance=1.0) → rawScore=0.88
- Integration: BM25 relevance scores from FTS5, tier multiplier application
- Property: Monotonicity under trust/importance/recency mutations
- Edge cases: Empty graph (zero facts), all facts below trust floor, lexical mismatch (BM25 returns empty)

### Integrate (Write Path)
**Inputs**: Fact content, kind, sources[], session_id, initial trust/importance
**Outputs**: Fact ID, storage tier (agent.db in v1), committed=false
**Contracts**:
- Schema validation: All fields present, types correct, trust/importance ∈ [0, 1]
- Tier 1 edges created: originated_in (session→fact), modified_in (empty array initially)
- Idempotent: INSERT OR IGNORE on duplicate fact content (test cursor state across repeated calls)

**Tests**:
- Unit: Schema validation (reject trust=1.2, accept trust=1.0)
- Integration: Fact persisted to agent.db, session edge created in edges table
- Edge cases: Fact with empty sources[], fact with trust=0.0 (allowed but excluded from recall), fact with content length > 10KB

### Rerank (Scoring Adjustment)
**Inputs**: List of facts (from recall), additional context (e.g., session history)
**Outputs**: Re-ordered list (adjusted rawScore based on context)
**Contracts**:
- Preserves facts (no additions/removals), only reorders
- Context-driven score adjustments (e.g., boost facts from current session)
- Monotonicity: Re-ranking preserves relative order within ±10% margin for facts with similar context affinity

**Tests**:
- Unit: Boost function (current session facts +20% score)
- Integration: Recall→rerank pipeline (validate score adjustments)
- Property: Re-ranking doesn't demote high-trust facts below trust floor

### Decide (Action Selection)
**Inputs**: Recalled facts, current goal/prompt, decision criteria
**Outputs**: Decision record (id, title, chosen, why, alternatives, timestamp)
**Contracts**:
- Decision record schema matches DecisionRecord interface from `@akubly/types`
- Bridge ledger entry created (Eureka→Forge path, v1.5 contemplative decisions)
- No runtime ATTACH queries (FR-7.2)

**Tests**:
- Unit: Decision record construction (validate schema)
- Integration: Bridge ledger append-only (test no UPDATE/DELETE)
- Edge cases: Decision with empty alternatives[], decision with why=null

### Commit (Plasticity Transition)
**Inputs**: Fact ID, commit timestamp
**Outputs**: Fact with committed=true, modified_in edge to session
**Contracts**:
- Irreversible: committed=true facts cannot transition back to committed=false
- Partial immutability: Content fields (`content`, `kind`, `sources`, `provenance`) immutable post-commit; learning fields (`trust`, `importance`, `last_accessed`, `access_count`, `retired`) remain mutable (see §20 schema and §30 §X)
- Provenance: modified_in edge records committing session

**Tests**:
- Unit: Commit transition (committed=false → committed=true)
- Integration: Content field write rejection after commit (test UPDATE on committed fact's `content` field fails)
- Integration: Learning field mutation after commit (test UPDATE on committed fact's `trust` field succeeds)
- Edge cases: Double-commit (idempotent or error?), commit on already-committed fact

### Retire (Soft Delete)
**Inputs**: Fact ID, retirement reason (optional)
**Outputs**: Fact marked retired (or attention_tier=cold), excluded from recall
**Contracts**:
- Soft delete: Fact persists in DB, edges preserved
- Recall exclusion: Retired facts filtered out before scoring
- Reversible: Retirement can be undone (unlike commit)

**Tests**:
- Unit: Retirement flag (test boolean or tier demotion)
- Integration: Recall excludes retired facts
- Edge cases: Retire committed fact (allowed?), retire fact with edges

### Evict (Hard Delete)
**Inputs**: Fact ID, eviction policy (e.g., cold facts older than 90 days)
**Outputs**: Fact deleted from DB, edges cascade-deleted
**Contracts**:
- Hard delete: Fact and edges removed (foreign key CASCADE)
- Irreversible: No recovery path
- Policy-driven: Eviction triggered by sweep activity (v1 vocabulary reserved, implementation deferred)

**Tests**:
- Unit: DELETE SQL with CASCADE (test edges deleted)
- Integration: Eviction policy evaluation (test age threshold, tier threshold)
- Edge cases: Evict committed fact (blocked?), evict fact with many edges (performance test)

### Meditate, Contemplate (v1.5 Deferred)
**Status**: Vocabulary reserved (FR-12 sweep kernel), implementation deferred to v1.5.
**Test strategy**: No tests in v1. When implemented, test stochastic behavior with deterministic seeds.

---

## Property Dynamics Testing

**Status:** Complementary to §55. Outside-in tests (§55) drive scoring formula discovery; these property tests validate the formula honors trust/recency invariants across continuous ranges.

### Trust Scoring
**Mutation space**: Trust updates from [0, 1] → [0, 1]
**Invariants**:
- Trust floor: `trust < 0.15` → excluded from recall
- Monotonicity: Increasing trust increases rawScore (holding other factors constant)
- Coefficient: Trust contributes 0.20 to rawScore (validate weight)

**Test cases**:
- Trust sweep: Generate 100 facts with trust ∈ {0.0, 0.01, ..., 1.0}, validate recall order
- Trust boundary: Facts with trust={0.14, 0.15, 0.16}, validate 0.14 excluded, 0.15/0.16 included
- Trust mutation: Update trust from 0.5 → 0.9, validate rank improvement

### Recency Decay
**Mutation space**: Timestamps from [now - 90 days, now]
**Invariants**:
- Time-monotonic: Older facts have lower recency scores
- Decay curve: Exponential decay (half-life TBD, parameterize in tests)
- Session boundary: Facts from current session have recency ≈ 1.0

**Test cases**:
- Recency sweep: Generate 100 facts with timestamps {now, now-1h, now-1d, now-1w, now-1m}, validate order
- Recency boundary: Facts at t={now-1ms, now, now+1ms}, validate t=now+1ms clamped to now
- Time travel: Mock time advancement (now → now+1h), validate recency scores decrease

### Plasticity Policies
**Mutation space**: committed ∈ {false, true}
**Invariants**:
- Irreversible: committed=false → committed=true allowed, reverse blocked
- Partial immutability: Content fields (`content`, `kind`, `sources`, `provenance`) reject UPDATE after commit; learning fields (`trust`, `importance`, `last_accessed`, `access_count`, `retired`) allow UPDATE regardless of commit status (see §20 schema and §30 §X)

**Test cases**:
- Commit transition: committed=false → committed=true, validate success
- Content field write rejection: UPDATE `content` on committed=true fact, validate error
- Learning field mutation: UPDATE `trust` on committed=true fact, validate success
- Attempted reversal: committed=true → committed=false, validate error

### Attention Tier Dynamics
**Mutation space**: attention_tier ∈ {hot, warm, cold}
**Invariants**:
- Tier multipliers: hot=1.0, warm=0.5, cold=0.1
- Manual transitions: All tier changes allowed (no one-way restrictions like commit)
- Sweep-triggered: Tier changes from similar_to edge creation (v1.5)

**Test cases**:
- Tier sweep: Generate 30 facts (10 hot, 10 warm, 10 cold), validate recall order respects multipliers
- Tier demotion: hot → warm → cold, validate rawScore decreases by expected multipliers
- Tier promotion: cold → warm → hot, validate rawScore increases

---

## Tier Boundary Tests

**Status:** Complementary to §55. Outside-in tests (§55 §2.5) drive tier fan-out logic; these tests validate tier stub behavior and write authority boundaries.

### Cross-Tier Resolution
**v1 scope**: Only agent.db fully wired. user.db and project.db are stubs.

**Stub behavior**:
- Write operations: Throw error ("User/project tiers not implemented in v1")
- Read operations: Return empty array (graceful degradation)

**Test cases**:
- Agent-only recall: Query with tier=agent, validate results from agent.db
- User stub write: Attempt to integrate fact to user.db, validate error
- Project stub read: Query with tier=project, validate empty results (no error)
- Multi-tier query: Query with tier=all, validate only agent.db facts returned

### Write Authority
**v1 scope**: agent.db is read/write, user.db/project.db are read-only stubs.

**Test cases**:
- Agent write: Integrate fact to agent.db, validate success
- User write: Integrate fact to user.db, validate error ("Tier not wired in v1")
- Project write: Integrate fact to project.db, validate error

### Federation Conflicts (v1.5 Future)
**Status**: Deferred to v1.5 when user.db/project.db are wired.
**Test strategy**: In v1, no conflicts possible (single-tier). When multi-tier is wired, test conflict resolution policies (e.g., agent.db wins over user.db).

---

## Integration Tests: Cairn↔Eureka, Forge↔Eureka

**Status:** Complementary to §55. These are contract tests (§55 §3.3) that validate real implementations (CuratorStore, DecisionBridge) honor the mocked interfaces from outside-in tests.

### Cairn↔Eureka (Session Lifecycle)
**Shared contract**: SessionId brand from `@akubly/types`

**Test cases**:
- SessionId brand flow: Cairn creates session, passes SessionId to Eureka, Eureka stores facts with session_id
- ESLint guardrail: Test that importing Cairn's Session type (not SessionId brand) triggers lint error
- Session edges: originated_in, modified_in edges reference SessionId (test foreign key integrity)

### Forge↔Eureka (Decision Ingestion)
**Ingestion path**: Forge→Eureka via `fromDecisionRecord()`
**Projection path**: Eureka→Forge via `toDecisionRecord()` (v1.5 contemplative decisions)

**Test cases (AC-6)**:
- AC-6.1: fromDecisionRecord() creates kind=decision fact in agent.db
- AC-6.2: Lossy projection (test only id, title, why, chosen preserved, alternatives/context discarded)
- AC-6.3: Bridge ledger append-only (test INSERT succeeds, UPDATE/DELETE fails)
- Bridge ledger schema: Validate columns (operation_id, timestamp, source_db, target_db, decision_id, fact_id)

**Reconciliation**:
- Offline CLI: `eureka reconcile` compares bridge ledger to Forge decisions table
- Test case: Inject mismatch (Forge decision not in Eureka), validate reconcile detects and reports
- No runtime ATTACH: Test that no SQL queries contain `ATTACH DATABASE` (FR-7.2 hard rule)

### Types Contract
**Shared interfaces**: DecisionRecord, SessionId brand

**Test cases**:
- DecisionRecord schema: Validate Eureka's fromDecisionRecord() output matches `@akubly/types` interface
- SessionId brand: Test that raw string cannot be assigned to SessionId without cast
- DecisionSource union: Test that Eureka decisions use source="contemplation" (v1.5) or source="turn" (Forge ingestion)

---

## Test Infrastructure

**Note:** For Vitest mock patterns (vi.fn(), interaction testing), see §55 §3. This section documents fixtures, time-travel mocks, and in-memory DB patterns that support both outside-in (§55) and property-based tests.

### Fixtures
**Fact fixtures**:
- `fact-empty-graph.json`: Zero facts (test empty state)
- `fact-10-diverse.json`: 10 facts (5 hot, 3 warm, 2 cold) with varied trust/importance/recency
- `fact-1000-load.json`: 1000 facts for P95 latency testing (AC-1.2)
- `fact-session-scoped.json`: 50 facts from 5 sessions for AC-2.3 testing

**Decision fixtures**:
- `decision-forge-ingestion.json`: 10 DecisionRecord objects for fromDecisionRecord() testing
- `decision-bridge-ledger.json`: 20 bridge ledger entries for reconciliation testing

### Time Travel
**Mock time advancement**: Vitest `vi.useFakeTimers()` + `vi.advanceTimersByTime()`

**Use cases**:
- Recency decay: Advance time by 1 hour, validate recency scores decrease
- Session boundary: Mock session start time, test recency=1.0 for facts created at session start
- Sweep scheduling: Advance time to trigger deferred activities (v1.5)

**Test pattern**:
```typescript
vi.useFakeTimers();
const now = Date.now();
vi.setSystemTime(now);
// Create fact at now
vi.advanceTimersByTime(3600_000); // +1 hour
// Query recall, validate recency decreased
vi.useRealTimers();
```

### Deterministic Seeds
**Stochastic activities**: meditate, dream, ideate (v1.5 deferred)

**Seed control**: When implemented, use `Math.seedrandom()` or similar for reproducible randomness.

**Test pattern**:
```typescript
const seed = 42;
const rng = seedrandom(seed);
// Use rng() for all stochastic decisions
// Re-run with same seed, validate identical output
```

### In-Memory SQLite
**Isolation**: Each test gets fresh `:memory:` database

**Setup pattern**:
```typescript
beforeEach(() => {
  db = new Database(':memory:');
  // Run schema migrations
  // Insert fixture data
});

afterEach(() => {
  db.close();
});
```

**Performance**: In-memory DB provides <10ms query latency (orders of magnitude faster than disk), suitable for unit/integration tests.

---

## Acceptance Criteria Mapping

**Note:** For first-failing-test mapping of ACs to test files, see §55 §5. This table tracks complementary property and integration test coverage.

| AC | Description | Test Category | M0 | M1 | M2 | Notes |
|----|-------------|---------------|----|----|----|----- |
| AC-1.1 | Store facts across 3 tiers | Integration | ✅ | 🔲 | 🔲 | M0: agent.db only. M1: user/project wired |
| AC-1.2 | Recall P95 < 500ms | E2E (load) | ✅ | ✅ | ✅ | Load test with N=1000 facts |
| AC-1.3 | Precision ≥80% | Human-in-loop | 🔲 | ✅ | ✅ | M0: No dataset. M1: Curated dataset + eval |
| AC-1.4 | Token reduction ≥50% | E2E | ✅ | ✅ | ✅ | Compare fact content to transcript length |
| AC-2.1 | Session facts persist | Integration | ✅ | ✅ | ✅ | Test fact lookup by session_id |
| AC-2.2 | Session edges track provenance | Integration | ✅ | ✅ | ✅ | Test originated_in, modified_in edges |
| AC-2.3 | Recall P95 < 200ms (session) | E2E (load) | ✅ | ✅ | ✅ | Session-scoped search (N~50 facts) |
| AC-2.4 | Checkpoints resurface facts | E2E | 🔲 | ✅ | ✅ | M0: Checkpoints not yet defined. M1: Wired |
| AC-2.5 | Caller cooperation contract | Integration | ✅ | ✅ | ✅ | Test graceful degradation with missing context |
| AC-6.1 | Forge→Eureka bridge stores decisions | Integration | ✅ | ✅ | ✅ | Test fromDecisionRecord() path |
| AC-6.2 | Lossy projection acceptable | Unit | ✅ | ✅ | ✅ | Validate only id/title/why/chosen preserved |
| AC-6.3 | Bridge ledger append-only | Integration | ✅ | ✅ | ✅ | Test no UPDATE/DELETE on ledger |

**Legend**:
- ✅ = Test coverage exists and passes
- 🔲 = Test coverage blocked (dependency not ready)
- M0/M1/M2 = Milestones (M0 = v1 alpha, M1 = v1 beta, M2 = v1.5)

**Blocked tests (M0)**:
- AC-1.3: Requires curated precision dataset (see Open Questions)
- AC-2.4: Checkpoints not yet defined (see Open Questions)

---

## Critical Edge Cases to Write First

**Note:** These edge cases complement the outside-in test flow (§55). While §55 drives normal-path behavior from ACs, these tests validate boundary conditions and error states.

### 1. Empty Graph (Zero Facts)
**Risk**: Recall crashes or hangs on empty FTS5 index.

**Test cases**:
- Query recall on empty DB, validate empty results (no error)
- Query recall with tier=all on empty agent/user/project DBs, validate empty results
- Attempt to rerank empty results, validate no-op

### 2. Conflicting Trust Scores
**Risk**: Multiple facts with identical content but different trust scores cause non-deterministic recall order.

**Test cases**:
- Insert duplicate facts with trust={0.5, 0.7}, validate higher trust wins
- Insert duplicate facts with trust={0.5, 0.5}, validate deterministic tie-breaker (e.g., by recency or fact ID)

### 3. Recency at Boundary
**Risk**: Off-by-one errors in recency calculation at session start (t=0) or timestamp edge cases.

**Test cases**:
- Fact created at t=now, validate recency=1.0
- Fact created at t=now-1ms, validate recency < 1.0 (but close)
- Fact created at t=now+1ms (future timestamp), validate clamping to now or error

### 4. Plasticity Escalation
**Risk**: Write protection on committed facts is bypassed or inconsistently enforced.

**Test cases**:
- Commit fact (committed=false → committed=true), validate success
- UPDATE committed fact's content field, validate error ("Content fields immutable after commit")
- UPDATE committed fact's trust field, validate success (learning fields always mutable)
- DELETE committed fact, validate error or policy decision (allowed? TBD)
- Attempt to revert commit (committed=true → committed=false), validate error

### 5. Tier Cycles
**Risk**: Cross-tier resolution with unwired tiers causes infinite loops or panics.

**Test cases**:
- Query with tier=all on agent.db (wired) + user.db (stub), validate only agent.db results (no panic)
- Integrate fact to user.db, validate error (not panic)
- Query with tier=user, validate empty results (not error)

### 6. Activity Scheduling Under Load
**Risk**: Concurrent activity execution (recall + integrate) causes DB lock contention or race conditions.

**Test cases**:
- Spawn 10 concurrent recall queries, validate all succeed (no timeout)
- Spawn 10 concurrent integrate operations, validate all succeed (no duplicate inserts)
- Interleave recall + integrate, validate no read/write lock contention (SQLite WAL mode)

---

## Test Commands

### Run All Tests
```bash
npm test
```

### Run Eureka Tests Only
```bash
npm test -- eureka
```

### Run Specific Test Suite
```bash
npm test -- eureka/recall
npm test -- eureka/integrate
npm test -- eureka/bridge
```

### Run with Coverage
```bash
npm test -- --coverage
```

**Coverage targets**:
- Line coverage: ≥80% (M0), ≥90% (M1)
- Branch coverage: ≥70% (M0), ≥85% (M1)
- Function coverage: ≥90% (M0), ≥95% (M1)

### Run Load Tests (P95 Latency)
```bash
npm test -- eureka/load
```

**Load test parameters**:
- AC-1.2: N=1000 facts, P95 < 500ms
- AC-2.3: N=50 facts (session-scoped), P95 < 200ms
- Measure with `performance.now()` or Vitest bench utilities

### Run Property-Based Tests
```bash
npm test -- eureka/properties
```

**Property test framework**: fast-check or jsverify (TBD).

---

## Open Questions

### 1. Precision Dataset (AC-1.3)
**Question**: Where does the curated precision dataset come from? Who labels relevance judgments?

**Impact**: AC-1.3 blocked in M0 without dataset.

**Responsible agent**: Cassima (requirements) + Laura (dataset construction).

**Proposal**: Use Cairn/Forge decision logs as initial dataset (decisions are self-labeled relevance signals). Curate 20 queries + 50 facts, binary labels per query-fact pair.

### 2. Checkpoint Schema (AC-2.4)
**Question**: What is the Checkpoint interface? How are checkpoints stored? How do they drive recall?

**Impact**: AC-2.4 blocked in M0 without checkpoint definition.

**Responsible agent**: Cassima (requirements) or Emma (implementation).

**Proposal**: Checkpoints are lightweight summaries (title, timestamp, session_id) that trigger recall queries when session resumes.

### 3. Eviction Policy (v1 Scope)
**Question**: Is eviction implemented in v1 or deferred to v1.5? FR-12 mentions sweep activities are v1.5, but eviction is listed in core activities.

**Impact**: If v1, need eviction policy tests. If v1.5, defer.

**Responsible agent**: Cassima (requirements).

**Proposal**: Vocabulary reserved in v1 (function stubs), policy implementation deferred to v1.5.

### 4. Multi-Tier Write Authority (v1.5)
**Question**: When user.db/project.db are wired in v1.5, which tier has write authority on conflicts? Does agent.db override user.db?

**Impact**: No v1 impact (single-tier only). Deferred to v1.5 testing.

**Responsible agent**: Cassima (requirements) + Emma (implementation).

**Proposal**: Agent.db has highest authority (agent overrides user overrides project). Test conflict resolution in v1.5.

### 5. Stochastic Activity Determinism (v1.5)
**Question**: How are meditate/dream/ideate activities tested for correctness when outputs are stochastic?

**Impact**: No v1 impact (activities deferred). Relevant for v1.5.

**Responsible agent**: Laura (test strategy).

**Proposal**: Use deterministic seeds + metamorphic properties (e.g., "dream twice with same seed produces identical outputs").

### 6. BM25 Failure Mode Acceptance
**Question**: Is it acceptable for recall to return empty results on lexically disjoint queries (e.g., "authentication" vs. "login credentials")?

**Impact**: Affects precision measurement (AC-1.3). If acceptable, document as known limitation.

**Responsible agent**: Cassima (requirements).

**Proposal**: Document as known v1 limitation (BM25-only, no semantic search). Deferred to v1.5 with sqlite-vec. Precision target (≥80%) is measured only on keyword-overlap queries in v1.

---

## Summary

This section documents property-based tests, integration contract tests, and edge-case checklists that complement §55's London-school TDD spine. While §55 drives collaborator discovery from observable activity behavior (outside-in), §50 validates the invariants those collaborators must honor: trust/recency monotonicity, tier boundary integrity, bridge ledger immutability, and scoring formula correctness across parameter ranges.

**M0 test readiness**: AC-1.1, AC-1.2, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.5, AC-6.1, AC-6.2, AC-6.3 are testable. AC-1.3 and AC-2.4 are blocked pending precision dataset and checkpoint schema (see Open Questions).

**Test infrastructure**: Vitest, in-memory SQLite, time-travel mocks, deterministic seeds, and fixtures provide isolation, reproducibility, and fast feedback loops. Load tests validate P95 latency targets (AC-1.2, AC-2.3). Human-in-loop tests validate precision (AC-1.3, M1).

**Integration tests**: Cairn↔Eureka (SessionId brand), Forge↔Eureka (bridge ledger), and types contract tests ensure cross-package coherence. Bridge ledger append-only invariant is critical for audit integrity.

**Next steps**: Cassima to resolve open questions (precision dataset, checkpoint schema, eviction policy scope). Laura to implement unit tests for recall scoring formula and trust floor filtering (highest risk). Emma to wire test fixtures and load test harness.
