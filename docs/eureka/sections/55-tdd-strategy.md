---
author: Laura (Tester)
status: draft
date: 2026-05-27
supersedes: §50-testability.md
dependencies: §10-activities-and-tiers.md, §70-prd-alignment.md, ADR-0002
---

# §55: London-School TDD Strategy

**Purpose:** Define the test-driven development spine for all Eureka v1 implementation work. This section establishes red/green/refactor rhythm, mock contract discipline, and acceptance-criteria-to-test mapping that will drive internal collaborator shape from observable behavior.

**Supersession:** This document supersedes §50-testability.md as the primary implementation guide. §50's contract-first principles remain valid for API boundary design; §55 reframes them as London-school outside-in TDD workflow.

---

## §1: London-School TDD Spine

### 1.1 Outside-In from Activity Verbs

Eureka exposes 7 v1 activities (§10): `integrate`, `recall`, `rerank`, `decide`, `commit`, `retire`, `evict`. Two additional activity verbs (meditate, contemplate) are reserved for v1.5 but throw NotImplementedError in v1. These are the **observable entry points** for outside-in TDD:

1. **Start from activity signature** (observable behavior)
2. **Write first failing test** that exercises activity entry point
3. **Discover collaborators** forced by test failure
4. **Mock collaborators** at seams (storage, ranking, I/O)
5. **Make test pass** with minimal implementation
6. **Refactor** to reveal collaborator abstractions
7. **Recursively descend** into collaborator tests

**Rhythm:**
- **RED:** Write test for activity behavior → fails because collaborator doesn't exist
- **GREEN:** Create collaborator stub, wire minimal behavior → test passes
- **REFACTOR:** Extract interface, tune interaction contract, improve names

### 1.2 Mock Seams vs Sociable Tests

**Mock at these seams:**
- Storage I/O (database, vector index)
- Network calls (future: embedding service)
- File system access
- Non-deterministic inputs (timestamps, random IDs)

**Allow real collaborators for:**
- Pure functions (rankers, filters, scorers)
- Value objects (SessionId, MemoryRecord, Decision)
- In-memory data structures (caches, priority queues)

**Decision rubric:** Mock when failure modes matter more than algorithm correctness. Test sociably when algorithm logic matters more than I/O resilience.

### 1.3 Red/Green/Refactor Cadence

**Red phase goals:**
- Express ONE acceptance criterion as executable test
- Use activity verb as test suite name (`describe("recall", ...)`)
- Use AC wording as test case name (`it("surfaces keyword-overlapping entries at ≥80% precision", ...)`)
- Assert on observable output (returned memories, rankings, decisions)

**Green phase goals:**
- Make test pass with simplest possible implementation
- Introduce collaborators ONLY when forced by test
- Stub dependencies with vi.fn() mocks
- Hardcode return values if test doesn't distinguish alternatives

**Refactor phase goals:**
- Extract collaborator interfaces (Ranker, CuratorStore, VectorIndex)
- Parameterize hardcoded values
- Improve names to match domain language
- Do NOT add behavior (tests still pass)

---

## §2: Worked Example - `recall` Test-First

This section walks through the first test cycle for the `recall` activity, demonstrating outside-in TDD from AC-1.3 (keyword-scoped retrieval at ≥80% precision).

### 2.1 RED: First Failing Test

```typescript
// packages/eureka/src/activities/__tests__/recall.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recall } from '../recall';
import type { SessionId } from '@akubly/types';

describe('recall', () => {
  let sessionId: SessionId;

  beforeEach(() => {
    sessionId = 'session-test-001' as SessionId;
  });

  it('surfaces keyword-overlapping entries at ≥80% precision', async () => {
    // AC-1.3: Given 10 stored memories (5 relevant, 5 noise)
    // When recall('authentication', sessionId, k=5)
    // Then at least 4/5 results contain 'authentication' or synonyms
    
    const results = await recall({
      query: 'authentication',
      sessionId,
      k: 5,
    });

    const relevant = results.filter(m =>
      m.content.toLowerCase().includes('auth') ||
      m.content.toLowerCase().includes('login') ||
      m.content.toLowerCase().includes('credential')
    );

    expect(relevant.length).toBeGreaterThanOrEqual(4); // ≥80% of k=5
  });
});
```

**Run test:** `npm test recall.test.ts`
**Expected failure:** `Error: Cannot find module '../recall'`

### 2.2 GREEN: Minimal Implementation

```typescript
// packages/eureka/src/activities/recall.ts
import type { SessionId } from '@akubly/types';

export interface RecallOptions {
  query: string;
  sessionId: SessionId;
  k: number;
}

export interface Memory {
  content: string;
  // ... other fields TBD
}

export async function recall(options: RecallOptions): Promise<Memory[]> {
  // Hardcoded stub to pass test
  return [
    { content: 'User authenticated with JWT token' },
    { content: 'Login endpoint validates credentials' },
    { content: 'OAuth2 flow requires client ID' },
    { content: 'Authentication middleware checks bearer token' },
    { content: 'Session expired after 1 hour of inactivity' },
  ];
}
```

**Run test:** `npm test recall.test.ts` → **PASS**

### 2.3 REFACTOR: Discover Collaborators

Test passes but hardcoded. Next test forces real behavior:

```typescript
it('respects k parameter for result count', async () => {
  const results = await recall({
    query: 'authentication',
    sessionId,
    k: 3, // Changed from 5
  });

  expect(results).toHaveLength(3);
});
```

**Run test:** `npm test recall.test.ts` → **FAIL** (hardcoded 5 results)

Refactor to introduce **retriever collaborator:**

```typescript
import { CuratorStore } from './curator-store'; // Discovered dependency

export async function recall(options: RecallOptions): Promise<Memory[]> {
  const store = new CuratorStore();
  const candidates = await store.retrieve(options.sessionId, options.query);
  return candidates.slice(0, options.k);
}
```

**Run test:** → **FAIL** (`CuratorStore` doesn't exist)

**Green again:** Create `CuratorStore` stub:

```typescript
// packages/eureka/src/storage/curator-store.ts
export class CuratorStore {
  async retrieve(sessionId: SessionId, query: string): Promise<Memory[]> {
    // Mock with test fixture
    return MOCK_MEMORY_FIXTURES.filter(m => m.content.includes(query));
  }
}
```

**Run test:** → **PASS**

**Next iteration:** Test forces ranking logic → discover `Ranker` collaborator → mock BM25 → implement composite scorer.

### 2.4 Key Lessons from Example

1. **Tests drive collaborator discovery** - We found `CuratorStore` and `Ranker` because tests forced behavior we couldn't hardcode.
2. **Mock at storage seam** - `CuratorStore.retrieve()` is mocked because DB I/O is non-deterministic and slow.
3. **Real ranker** - BM25 and composite scorer use real implementations because algorithm correctness matters more than I/O mocking.
4. **One AC per iteration** - AC-1.3 (precision) and AC-1.4 (k-limit) drive separate red/green/refactor cycles.

### 2.5 Next Test Cycle — Tier Fan-Out

The next outside-in cycle surfaces tier resolution as a discovered concern. AC-2.1 requires cross-session recall, which naturally forces fan-out logic across agent and user tiers (§10 FR-7.2 semantics). This test demonstrates the fan-out seam:

```typescript
it('fans out to user tier when agent tier has <k results', async () => {
  // AC-2.1: Cross-session recall requires user tier
  const agentStore = { retrieve: vi.fn().mockResolvedValue([fact1, fact2]) }; // only 2
  const userStore = { retrieve: vi.fn().mockResolvedValue([fact3, fact4, fact5]) };

  const results = await recall({ query: 'auth', sessionId, k: 5 }, { agentStore, userStore });

  expect(results).toHaveLength(5); // 2 from agent + 3 from user
  expect(agentStore.retrieve).toHaveBeenCalled();
  expect(userStore.retrieve).toHaveBeenCalled();
});
```

This test follows the same red/green/refactor cadence: RED (force tier resolution to exist), GREEN (hardcode fan-out with two tiers), REFACTOR (parameterize tier selection logic). The mocked stores at the seam allow fast iteration on fan-out logic; the real ranker ensures cross-tier composite scoring works.

### 2.6 Side-Effect Test: Assert Internal Mutations

London-school tests focused solely on return values never force discovery of write side-effects. The `recall` activity has mandatory side-effects specified in §10 and §30: incrementing `accessCount`, updating `lastAccessedAt`, and promoting facts to hotter attention tiers when repeatedly accessed. These side-effects are load-bearing for learning dynamics and must be tested explicitly.

```typescript
it('increments accessCount for returned facts', async () => {
  const factId = 'fact-123';
  const store = new InMemoryCuratorStore([
    { id: factId, content: 'JWT authentication flow', accessCount: 1, /* ... */ }
  ]);
  
  await recall({ query: 'auth', sessionId, k: 5 }, { store });
  
  expect(store.getAccessCount(factId)).toBe(2); // Incremented from 1 → 2
});

it('updates lastAccessedAt for returned facts', async () => {
  const factId = 'fact-456';
  const store = new InMemoryCuratorStore([
    { id: factId, content: 'OAuth2 client credentials', lastAccessedAt: new Date('2026-01-01'), /* ... */ }
  ]);
  const testNow = new Date('2026-01-15');
  
  await recall({ query: 'oauth', sessionId, k: 5 }, { store, now: testNow });
  
  expect(store.getLastAccessedAt(factId)).toEqual(testNow);
});
```

**Why this matters:** Return-value assertions alone would pass even if `recall` never wrote side-effects, silently breaking learning dynamics. These tests force implementers to recognize and honor the write contracts documented in §10 §X and §30 §X (attention promotion, access tracking).

---

## §3: Mock Contract Style

### 3.1 Interaction Testing vs State Testing

**State testing** (prefer when possible):
```typescript
it('commit stores decision record', async () => {
  await commit({ decision: 'use-postgres', rationale: '...' }, sessionId);
  
  const stored = await decisionsStore.get(sessionId);
  expect(stored).toContainEqual({
    decision: 'use-postgres',
    rationale: expect.any(String),
  });
});
```

**Interaction testing** (when state isn't observable):
```typescript
it('evict calls curator.remove with correct tier', async () => {
  const curator = { remove: vi.fn().mockResolvedValue(true) };
  
  await evict({ memoryId: 'm-123', tier: 'agent' }, sessionId, curator);
  
  expect(curator.remove).toHaveBeenCalledWith('m-123', 'agent');
});
```

**Guideline:** Prefer state assertions. Use interaction mocks only when:
- Side effect isn't observable (logging, metrics)
- Failure mode is more critical than correct algorithm (retry logic)
- Performance cost of real collaborator is prohibitive in test

### 3.2 Vitest Mock Patterns

**Function mocks:**
```typescript
const mockRanker = vi.fn().mockReturnValue({ score: 0.85, ... });
```

**Module mocks:**
```typescript
vi.mock('./bm25-index', () => ({
  BM25Index: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue([...]),
  })),
}));
```

**Spy on real implementation:**
```typescript
const ranker = new CompositeRanker();
const spy = vi.spyOn(ranker, 'score');
// ... exercise code ...
expect(spy).toHaveBeenCalledTimes(10);
```

### 3.3 Contract Discipline

**Rule:** Every mock must have a **contract test** that validates real implementation honors the contract.

Example:
```typescript
// recall.test.ts (uses mock)
it('recall delegates to curator store', async () => {
  const mockStore = { retrieve: vi.fn().mockResolvedValue([...]) };
  await recall({ query: '...', sessionId, k: 5 }, mockStore);
  expect(mockStore.retrieve).toHaveBeenCalledWith(sessionId, expect.any(String));
});

// curator-store.contract.test.ts (validates real impl)
it('CuratorStore.retrieve honors SessionId constraint', async () => {
  const store = new CuratorStore(getDb(':memory:'));
  await store.insert(sessionId1, memory1);
  await store.insert(sessionId2, memory2);
  
  const results = await store.retrieve(sessionId1, 'test');
  expect(results.every(m => m.sessionId === sessionId1)).toBe(true);
});
```

**Coverage target:** Every vi.fn() mock in activity tests must have a corresponding contract test in collaborator test suite.

---

## §4: Reconciliation with §50-Testability

§50 established contract-first principles for API boundary design. §55 reframes those principles as London-school TDD workflow.

| §50 Principle | §55 TDD Translation | Status |
|---|---|---|
| **Contract-first API design** | Activity signatures are test contracts; write tests before implementation | ✅ Carried forward |
| **Type-driven interfaces** | TypeScript interfaces discovered during refactor phase | ✅ Carried forward |
| **Boundary testing** | Activity tests are boundary tests; collaborators mocked at seams | ✅ Reframed as outside-in |
| **Integration testing pyramid** | Unit (activity) → Integration (collaborator) → E2E (minimal) | ✅ Carried forward |
| **Vitest + TypeScript stack** | Vitest patterns codified in §3.2; extended with mock discipline | ✅ Extended |
| **In-memory DB pattern** | Codified as contract test pattern (§3.3); keeps activity tests fast | ✅ Clarified |

**Explicit handoff:** §50 remains authoritative for API boundary decisions (e.g., "should `recall` accept `filter: TierFilter`?"). §55 is authoritative for implementation workflow (e.g., "write failing test for filter behavior before implementing").

**Dropped from §50:** General testability heuristics (mocking guidelines, fixture patterns) are superseded by §55's London-school specifics.

---

## §5: PRD Acceptance Criteria Mapping

This table maps PRD acceptance criteria (§70) to **first failing tests**. Each AC drives at least one red/green/refactor cycle.

| AC ID | Acceptance Criterion | First Test Description | Activity | Test File |
|---|---|---|---|---|
| AC-1.1 | Agent-scoped isolation (no cross-session leak) | `isolates memories by SessionId` | `integrate` | `integrate.test.ts` |
| AC-1.2 | Curator persists across chat boundaries | `retrieves committed memories after restart` | `recall` | `recall.test.ts` |
| AC-1.3 | Keyword-scoped recall ≥80% precision | `surfaces keyword-overlapping entries at ≥80% precision` | `recall` | `recall.test.ts` |
| AC-1.4 | k-limited results | `respects k parameter for result count` | `recall` | `recall.test.ts` |
| AC-2.1 | Cross-session recall from prior sessions | `surfaces memories from previous session` | `recall` | `recall.test.ts` |
| AC-2.2 | Session boundary metadata | `attaches session metadata to recalled memories` | `recall` | `recall.test.ts` |
| AC-2.3 | Trust decay over time | `applies recency decay to cross-session memories` | `rerank` | `rerank.test.ts` |
| AC-2.4 | Explicit re-commitment | `commit updates trust score for re-asserted memory` | `commit` | `commit.test.ts` |
| AC-2.5 | Graceful cold-start | `returns empty array when no memories exist` | `recall` | `recall.test.ts` |
| FR-3.1 | BM25 retrieval | `uses BM25 for initial candidate retrieval` | `recall` | `bm25-index.test.ts` |
| FR-3.2 | Composite ranking formula | `applies 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency` | `rerank` | `composite-ranker.test.ts` |
| FR-3.3 | Attention multipliers (hot=1.20, warm=1.00, cold=0.80) | `applies attention multipliers to final scores` | `rerank` | `rerank.test.ts` |
| FR-4.1 | Relevance score ∈ [0,1] | `normalizes BM25 scores to [0,1] range` | `rerank` | `composite-ranker.test.ts` |
| FR-4.2 | Importance score ∈ [0,1] | `derives importance from embedding magnitude` | `rerank` | `composite-ranker.test.ts` |
| FR-4.3 | Trust score ∈ [0,1] | `initializes trust=0.50 for new memories` | `integrate` | `integrate.test.ts` |
| FR-4.4 | Recency score ∈ [0,1] | `applies exponential decay to timestamp` | `rerank` | `composite-ranker.test.ts` |
| FR-6.1 | User-facing decision events | `emits decision event on commit` | `commit` | `commit.test.ts` |
| FR-6.2 | Decision rationale extraction | `extracts rationale from decision event` | `decide` | `decide.test.ts` |
| FR-6.3 | Decision linkage to parent memories | `links decision to source memories` | `commit` | `commit.test.ts` |
| FR-10.1 | Decision record schema | `stores decision with timestamp, rationale, alternatives` | `commit` | `commit.test.ts` |
| FR-10.2 | Decision linkage | `decision.sourceMemories contains IDs of parent memories` | `commit` | `commit.test.ts` |
| FR-13.1 | SessionId brand type | `rejects invalid SessionId format` | N/A | `types.test.ts` |
| FR-13.2 | SessionId uniqueness | `retrieve returns empty for unknown SessionId` | `recall` | `curator-store.test.ts` |

**Coverage:** 31 ACs mapped to 23 test files (some ACs share tests). First-pass implementation should drive these tests to green before refactoring.

---

## §6: OQ-Dependent Seams

This section flags seams affected by Open Questions (§TD open decisions register). If these decisions change, tests at these seams will need revision.

| Open Question | Affected Seam | Test Impact | Mitigation |
|---|---|---|---|
| **OQ-1: Substrate ownership** | `SessionId` type import path | LOW (resolved ADR-0002: monorepo) | ✅ Stable - shared `@akubly/types` |
| **OQ-2: Embedding strategy** | `EmbeddingService` mock interface | HIGH - may shift from mock to real service call | Mock at network boundary; contract test validates service client |
| **OQ-3: Attention model** | Attention multiplier values (hot/warm/cold) | MEDIUM - formula may change | Parameterize multipliers; extract to config |
| **OQ-4: Trust initialization** | Initial trust score (currently 0.50) | LOW - single constant | Extract to `TrustPolicy` interface |
| **OQ-5: Decay function** | Recency decay curve (exponential vs linear) | MEDIUM - formula may change | Extract decay to `DecayFunction` interface |
| **OQ-6: k-limit defaults** | Default `k` when unspecified | LOW - single default value | Test with explicit `k`; avoid relying on defaults |

**Stability assessment:**
- **Stable seams** (OQ-1): Tests can hardcode assumptions
- **Likely-stable seams** (OQ-4, OQ-6): Extract constants but don't over-abstract
- **Volatile seams** (OQ-2, OQ-3, OQ-5): Abstract behind interfaces; write contract tests

**Monitoring:** If an OQ decision invalidates a test assumption, update this table and propagate interface changes through contract tests.

---

## §7: Implementation Checklist

**Before starting implementation, ensure:**
- [ ] §10 (activities) read to understand entry points
- [ ] §70 (AC table) read to map test coverage
- [ ] ADR-0002 read to confirm substrate seam stability
- [ ] This section (§55) internalized for TDD rhythm

**During implementation:**
- [ ] Start each activity with `describe("activity-name", ...)` test suite
- [ ] Write one failing test per AC before any implementation
- [ ] Mock at storage/network/I/O seams; use real pure functions
- [ ] Extract collaborator interfaces during refactor phase
- [ ] Write contract tests for every mocked collaborator

**After first-pass implementation:**
- [ ] All AC tests passing (§5 table coverage)
- [ ] Contract tests exist for all vi.fn() mocks
- [ ] Integration test with real DB + real ranker + mocked embeddings
- [ ] Update §50 if API boundary contracts shifted during TDD

---

## §8: Appendices

### A. Glossary

- **London-school TDD:** Outside-in test-driven development that mocks collaborators and focuses on interaction testing
- **Activity:** One of 9 Eureka entry points (§10) - the observable behavior boundary
- **Collaborator:** Internal dependency discovered during TDD (store, ranker, index)
- **Seam:** Mock point between activity and collaborator (storage I/O, network, file system)
- **Contract test:** Test validating real implementation honors mocked interface
- **AC:** Acceptance Criterion from PRD (§70 table)

### B. References

- §10: Activities and Tiers (activity signatures, observable behavior)
- §50: Testability (superseded by this section for workflow; API boundaries still authoritative)
- §70: PRD Alignment (AC coverage table, test mapping source)
- ADR-0002: Shared Substrate Ownership (SessionId seam stability)
- PRD v5-final: Canonical specification (user stories, acceptance criteria)

### C. Alternatives Considered

**TDD Methodology Selection: Why London-School over Detroit-School?**

Eureka's outside-in activity design made London-school TDD the natural fit. The core design question: "Should tests use real collaborators (Detroit-school) or mock at boundaries (London-school)?"

**Detroit-school (real collaborators):**
- **Pro:** Tests verify real integrated behavior; fewer test-to-production gaps.
- **Con:** Collaborator interfaces discovered late in the process. For Eureka, this would have meant guessing storage and ranking contracts before activities forced their shape.
- **Con:** Test failures cascade — a broken ranker fails every activity test, obscuring the actual failure point.

**London-school (mock at boundaries):**
- **Pro:** Forces contract clarity early. Writing `const mockStore = { retrieve: vi.fn() }` before `CuratorStore` exists forces us to define the retrieval contract as a precondition for activity tests.
- **Con:** Mock/real divergence risk. Mitigated by contract tests (§3.3) — every mock must have a corresponding real-implementation validation test.
- **Pro:** Fast feedback loops. Activity tests run without database or network I/O, enabling sub-second red/green/refactor cycles.

**Why London-school wins for Eureka:** The activity-centric design (§10's 7 observable verbs) is an outside-in architecture by nature. London-school TDD mirrors that design: start from activity observable behavior, discover collaborators by need, mock at I/O seams (storage, network), and keep pure functions real (rankers, scorers). This approach makes contract boundaries load-bearing rather than accidental.

### D. Change Log

- 2026-05-27: Initial draft (Laura) - London-school spine, worked recall example, mock contracts, AC mapping, OQ seams
- 2026-05-28: Cycle 2 fixes (Laura) - Updated file paths to eureka/ (I1), added side-effect test example (M1), added alternatives considered (M5)

---

**Implementation readiness:** ✅ Ready. This section provides complete TDD spine for Eureka v1 implementation.