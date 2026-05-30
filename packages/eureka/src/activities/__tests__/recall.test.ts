/**
 * AC-1.3: Keyword-scoped recall at ≥80% precision
 * AC-FR-2: Composite-ranker ordering
 * Source: §00 §0.5 Acceptance Criteria Index; §55 §5 PRD-to-Test Mapping
 *
 * Seed test — Eureka v1. Outside-in London-school TDD (§55 §1).
 *
 * Activity under test : recall (§10 §10.1)
 * Primary seam mocked : FactStore.search() — the storage I/O boundary (§20 §7.4)
 *
 * M2 RED phase: test fails because packages/eureka/src/activities/recall.ts
 * does not yet exist. All collaborators are mocked; the only missing piece
 * is the recall production entry point.
 *
 * M3 RED phase: test fails because recall() has no composite ranker. The
 * M2 impl returns facts in storage order; M3 asserts FR-2 descending order.
 *
 * Ranker seam decision (M3): Option (b) — inline scoring in recall(); real
 * ranker, mocked storage only.
 * Citation: §55 §1.2 "Allow real collaborators for: Pure functions (rankers,
 * filters, scorers)" + §55 §2.3 Key Lesson #3 "Real ranker — BM25 and
 * composite scorer use real implementations because algorithm correctness
 * matters more than I/O mocking."
 *
 * Mock contract discipline (§55 §3.3): every vi.fn() mock here must have a
 * corresponding contract test in packages/eureka/src/persistence/
 * fact-store.contract.test.ts (to be written in M2).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recall, compositeScore } from '../recall.js';
import type { RecallResult } from '../recall.js';
import type { SessionId } from '@akubly/types';

/**
 * M4 clock injection note:
 * ALL recall() calls now include a clock dep (ClockProvider — ms epoch).
 * FIXED_NOW_MS is used for M2/M3 stubs — a large fixed value chosen so that:
 *   - M2 facts (no lastAccessed → tDays=Infinity → recency=0.1 floor) are unaffected by clock value.
 *   - M3 facts (lastAccessed=0, EPOCH_MS) yield tDays≈20237 → recency=0.1 (floor)
 *     for any nowMs this large. Scores unchanged from M3 fixture rationale.
 * §55 §1.2 — non-deterministic inputs (timestamps) must be mocked at seam.
 * §30 §2.4 — ClockProvider seam; no optional default per §55 §1.2.
 */
const FIXED_NOW_MS = 1_748_476_800_000; // 2026-05-29 00:00 UTC — M2/M3 reference anchor
const fixedClock = { now: () => FIXED_NOW_MS };

describe('recall', () => {
  let sessionId: SessionId;

  beforeEach(() => {
    sessionId = 'session-test-001' as SessionId;
  });

  it('surfaces keyword-overlapping entries at ≥80% precision', async () => {
    // AC-1.3 (§00 §0.5 / §70): Given a FactStore returning 5 auth-relevant
    // facts above the trust floor (0.15), recall with query='authentication'
    // and k=5 must surface ≥4 entries matching 'auth', 'login', or
    // 'credential' synonyms.
    //
    // §20 §7.4 — FactStore.search() is the canonical storage seam.
    // Inline structural mock — FactStore interface will be formalised in M2.
    const factStore = {
      search: vi.fn().mockResolvedValue([
        { content: 'User authenticated with JWT token',         trust: 0.8, attentionTier: 'warm' },
        { content: 'Login endpoint validates credentials',      trust: 0.9, attentionTier: 'hot'  },
        { content: 'OAuth2 flow requires client ID',            trust: 0.7, attentionTier: 'warm' },
        { content: 'Authentication middleware checks bearer',   trust: 0.8, attentionTier: 'warm' },
        { content: 'Session expired after 1 hour of inactivity', trust: 0.6, attentionTier: 'cold' },
      ]),
    };

    // §55 §1.3: activity signature drives collaborator injection shape.
    // recall(options, deps) — deps contains FactStore at the I/O seam.
    const results = await recall(
      { query: 'authentication', sessionId, k: 5 },
      { factStore, clock: fixedClock },
    );

    // §55 §1.3: assert on observable output — returned memory content.
    // "surfaces keyword-overlapping entries at ≥80% precision" (AC-1.3)
    const relevant = results.filter(m =>
      m.content.toLowerCase().includes('auth') ||
      m.content.toLowerCase().includes('login') ||
      m.content.toLowerCase().includes('credential'),
    );

    expect(relevant.length).toBeGreaterThanOrEqual(4); // ≥80% of k=5
  });

  it('ranks results by FR-2 composite formula descending (§30 §1.2)', async () => {
    // AC-FR-2: Given facts with known relevance/importance/trust/recency/attention
    // values, recall() must return them sorted by the FR-2 formula descending:
    //
    //   rawScore    = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
    //   finalScore  = rawScore × attentionMultiplier
    //   multipliers : hot=1.20, warm=1.00, cold=0.80  (§30 §1.2)
    //   recency     = max(0.1, (1 + t)^−0.5), t = days since lastAccessed (§20 §3.3)
    //
    // Ranker seam: option (b) — scoring inline in recall(); real ranker, mocked
    // storage only. §55 §1.2 + §55 §2.3 Key Lesson #3.
    //
    // Fixture rationale:
    //   lastAccessed = 0 (Unix epoch) → t ≈ 20,440 days → recency = 0.1 (floor)
    //   for ALL facts, making ordering depend only on relevance/importance/trust/tier.
    //   All facts have trust ≥ 0.15 (clear the M2 trust floor).
    //   Storage order: A, B, C, D.
    //   Desired FR-2 order: B (0.960) > C (0.620) > D (0.440) > A (0.168).
    //   M2 impl returns storage order → test FAILS for ordering reason.
    //   Score margins: B-C=0.340, C-D=0.180, D-A=0.272 — unambiguous.

    const EPOCH_MS = 0; // lastAccessed far in past → recency floor 0.1 for all

    const factStore = {
      search: vi.fn().mockResolvedValue([
        // Fact A — stored 1st, should rank 4th
        // rawScore = 0.50×0.2 + 0.20×0.2 + 0.20×0.3 + 0.10×0.1 = 0.21
        // finalScore = 0.21 × 0.80 (cold) = 0.168
        {
          content:      'Cold low-relevance fact',
          relevance:    0.2,
          importance:   0.2,
          trust:        0.3,
          attentionTier: 'cold',
          lastAccessed: EPOCH_MS,
        },
        // Fact B — stored 2nd, should rank 1st
        // rawScore = 0.50×0.9 + 0.20×0.8 + 0.20×0.9 + 0.10×0.1 = 0.80
        // finalScore = 0.80 × 1.20 (hot) = 0.960
        {
          content:      'Hot high-relevance fact',
          relevance:    0.9,
          importance:   0.8,
          trust:        0.9,
          attentionTier: 'hot',
          lastAccessed: EPOCH_MS,
        },
        // Fact C — stored 3rd, should rank 2nd
        // rawScore = 0.50×0.7 + 0.20×0.6 + 0.20×0.7 + 0.10×0.1 = 0.62
        // finalScore = 0.62 × 1.00 (warm) = 0.620
        {
          content:      'Warm medium-high-relevance fact',
          relevance:    0.7,
          importance:   0.6,
          trust:        0.7,
          attentionTier: 'warm',
          lastAccessed: EPOCH_MS,
        },
        // Fact D — stored 4th, should rank 3rd
        // rawScore = 0.50×0.5 + 0.20×0.4 + 0.20×0.5 + 0.10×0.1 = 0.44
        // finalScore = 0.44 × 1.00 (warm) = 0.440
        {
          content:      'Warm medium-relevance fact',
          relevance:    0.5,
          importance:   0.4,
          trust:        0.5,
          attentionTier: 'warm',
          lastAccessed: EPOCH_MS,
        },
      ]),
    };

    const results = await recall(
      { query: 'ranking test', sessionId, k: 4 },
      { factStore, clock: fixedClock },
    );

    // Assert FR-2 descending order: B > C > D > A
    expect(results.map(r => r.content)).toEqual([
      'Hot high-relevance fact',          // B: finalScore 0.960
      'Warm medium-high-relevance fact',  // C: finalScore 0.620
      'Warm medium-relevance fact',       // D: finalScore 0.440
      'Cold low-relevance fact',          // A: finalScore 0.168
    ]);
  });

  // ---------------------------------------------------------------------------
  // M4 RED — ClockProvider injection for recency decay over real time (§30 §2.4)
  // ---------------------------------------------------------------------------
  //
  // Seam decision: ClockProvider is REQUIRED in RecallDeps (no optional default).
  //   §55 §1.2: "Non-deterministic inputs (timestamps)" → mock at seam.
  //   §30 §2.4: ClockProvider contract (ms in our impl; §-tension: spec uses seconds).
  //
  // Chosen behavior: same fixture at a pinned clock → FRESH fact outranks STALE.
  //   Without clock injection, recall() uses Date.now() ≈ real now (~2026). Since
  //   BASE_MS is ~25 years in the past, both facts are 8600+ days old → both hit the
  //   recency floor (0.1) → identical final scores → stable sort → storage order
  //   → [STALE, FRESH]. But the test expects [FRESH, STALE] → RED for the right reason.
  //
  //   With stub clock (nowMs = BASE_MS):
  //     FRESH: lastAccessed = BASE_MS, tDays = 0
  //            recency = max(0.1, (1+0)^−0.5) = 1.0
  //            raw  = 0.50×0.9 + 0.20×0.8 + 0.20×0.9 + 0.10×1.0 = 0.89
  //            final = 0.89 × 1.20 (hot) = 1.068
  //
  //     STALE: lastAccessed = BASE_MS − DAYS_100_MS, tDays = 100
  //            recency = max(0.1, (101)^−0.5) = max(0.1, 0.0995) = 0.1
  //            raw  = 0.50×0.9 + 0.20×0.8 + 0.20×0.9 + 0.10×0.1 = 0.80
  //            final = 0.80 × 1.20 (hot) = 0.960
  //
  //   Margin = 1.068 − 0.960 = 0.108 (maximum achievable from recency alone:
  //   weight=0.10 × Δrecency=0.90 × hot-mult=1.20 = 0.108; §-tension: ≥0.18
  //   from unambiguous-ranking-fixtures skill cannot be met with recency-only
  //   variation — flagged in laura-m4-clock-red decision drop).
  //
  //   RED failure output (expected):
  //     Expected: ['Freshly accessed fact', 'Stale accessed fact']
  //     Received: ['Stale accessed fact', 'Freshly accessed fact']
  //     (not a type/import error — an ordering failure due to missing clock use in impl)

  it('ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4)', async () => {
    const BASE_MS      = 1_000_000_000_000; // Sep 2001 — fixed anchor, far enough past
    const DAYS_100_MS  = 100 * 86_400_000;  // 100 days in ms

    const stubClock = { now: () => BASE_MS };

    const factStore = {
      search: vi.fn().mockResolvedValue([
        // STALE — stored 1st, should rank 2nd with stub clock
        // tDays = 100 → recency = max(0.1, (101)^−0.5) = 0.1  (floor)
        // raw   = 0.50×0.9 + 0.20×0.8 + 0.20×0.9 + 0.10×0.1 = 0.800
        // final = 0.800 × 1.20 (hot) = 0.960
        {
          content:       'Stale accessed fact',
          relevance:     0.9,
          importance:    0.8,
          trust:         0.9,
          attentionTier: 'hot',
          lastAccessed:  BASE_MS - DAYS_100_MS,
        },
        // FRESH — stored 2nd, should rank 1st with stub clock
        // tDays = 0 → recency = max(0.1, (1)^−0.5) = 1.0
        // raw   = 0.50×0.9 + 0.20×0.8 + 0.20×0.9 + 0.10×1.0 = 0.890
        // final = 0.890 × 1.20 (hot) = 1.068
        {
          content:       'Freshly accessed fact',
          relevance:     0.9,
          importance:    0.8,
          trust:         0.9,
          attentionTier: 'hot',
          lastAccessed:  BASE_MS,
        },
      ]),
    };

    const results = await recall(
      { query: 'recency test', sessionId, k: 2 },
      { factStore, clock: stubClock },
    );

    // With stub clock: FRESH (1.068) > STALE (0.960)
    // Without clock (Date.now() → real now ~25yr after BASE_MS):
    //   both facts → tDays≈8700 → recency=0.1 (floor) → identical scores
    //   → stable sort → storage order → [STALE, FRESH] ← RED failure
    expect(results.map(r => r.content)).toEqual([
      'Freshly accessed fact', // rank 1: finalScore 1.068 (recency = 1.0)
      'Stale accessed fact',   // rank 2: finalScore 0.960 (recency = 0.1, floor)
    ]);
  });

  // ---------------------------------------------------------------------------
  // F1 — NaN guard: future lastAccessed must not corrupt sort
  // ---------------------------------------------------------------------------
  //
  // Before fix: (nowMs - lastAccessed) could be negative → tDays < 0 →
  //   Math.pow(1 + negativeValue, -0.5) = NaN → sort corruption.
  // After fix: Math.max(0, tDays) clamps negative values → tDays = 0 →
  //   recency = 1.0 → finite score, no NaN.

  it('compositeScore returns finite value when lastAccessed is in the future (F1 — NaN guard)', () => {
    const BASE_MS   = 1_000_000_000_000;
    const FUTURE_MS = BASE_MS + 7 * 86_400_000; // 7 days ahead of nowMs

    const score = compositeScore(
      { content: 'future fact', trust: 0.8, attentionTier: 'warm', lastAccessed: FUTURE_MS },
      BASE_MS, // clock is behind lastAccessed
    );

    // FR-2: tDays clamped to 0 → recency=1.0; 0.50·0 + 0.20·0 + 0.20·0.8 + 0.10·1.0 = 0.26; 0.26 × 1.00 (warm) = 0.26
    expect(score).toBeCloseTo(0.26, 6);
  });

  it('recall with a future-dated fact produces sane ordering, not NaN-corrupted (F1)', async () => {
    const BASE_MS   = 1_000_000_000_000;
    const FUTURE_MS = BASE_MS + 7 * 86_400_000;
    const stubClock = { now: () => BASE_MS };

    const factStore = {
      search: vi.fn().mockResolvedValue([
        // Future fact: tDays clamped to 0 → recency=1.0, but lower trust → ranks second
        { content: 'Future-dated fact',  trust: 0.3, attentionTier: 'warm' as const, lastAccessed: FUTURE_MS },
        // Present fact: tDays=0 → recency=1.0, higher trust → ranks first
        { content: 'Present-dated fact', trust: 0.8, attentionTier: 'warm' as const, lastAccessed: BASE_MS  },
      ]),
    };

    const results = await recall(
      { query: 'future test', sessionId, k: 2 },
      { factStore, clock: stubClock },
    );

    // No NaN corruption: both appear, ordered by trust (since recency is equal after clamping)
    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('Present-dated fact');
    expect(results[1].content).toBe('Future-dated fact');
  });

  // ---------------------------------------------------------------------------
  // F2 — attentionTier union exhaustiveness check
  // ---------------------------------------------------------------------------
  //
  // RecallResult.attentionTier is 'hot'|'warm'|'cold' (union, not string).
  // ATTENTION_MULTIPLIERS is Record<'hot'|'warm'|'cold', number> — no ?? 1.00 fallback.
  // This runtime test verifies all three tiers produce a finite, positive score.
  // TypeScript compile-time enforcement: a fact with attentionTier='Hot' (wrong case)
  // or 'unknown' will fail to compile under the union constraint.

  it('compositeScore produces finite positive scores for all attentionTier values (F2 exhaustiveness)', () => {
    const nowMs = 1_000_000_000_000;
    const tiers = ['hot', 'warm', 'cold'] as const;

    for (const tier of tiers) {
      const score = compositeScore(
        { content: 'test', trust: 0.5, attentionTier: tier },
        nowMs,
      );
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThan(0);
    }
  });

  // ---------------------------------------------------------------------------
  // F3 — no lastAccessed → treated as very stale (Infinity), not just-accessed (0)
  // ---------------------------------------------------------------------------
  //
  // Before fix: absent lastAccessed → tDays=0 → recency=1.0 (max, same as just-accessed).
  // After fix:  absent lastAccessed → tDays=Infinity → recency=0.1 (floor, very stale).
  // A fact with no lastAccessed must rank below an identical fact with recent access.

  it('fact with no lastAccessed ranks below identical fact with recent lastAccessed (F3)', async () => {
    const BASE_MS   = 1_000_000_000_000;
    const stubClock = { now: () => BASE_MS };

    const factStore = {
      search: vi.fn().mockResolvedValue([
        // Never-accessed: absent lastAccessed → tDays=Infinity → recency=0.1 (floor)
        { content: 'Never-accessed fact',   trust: 0.8, attentionTier: 'warm' as const },
        // Recently accessed: lastAccessed=BASE_MS → tDays=0 → recency=1.0
        { content: 'Recently accessed fact', trust: 0.8, attentionTier: 'warm' as const, lastAccessed: BASE_MS },
      ]),
    };

    const results = await recall(
      { query: 'recency fallback test', sessionId, k: 2 },
      { factStore, clock: stubClock },
    );

    // Recently accessed ranks first (recency=1.0 > 0.1); never-accessed is very stale
    expect(results.map(r => r.content)).toEqual([
      'Recently accessed fact', // recency 1.0 → finalScore higher
      'Never-accessed fact',    // recency 0.1 (floor) → finalScore lower
    ]);
  });

  // ---------------------------------------------------------------------------
  // F6 — min_trust regression: FactStore.search() must receive minTrust: 0.15
  // ---------------------------------------------------------------------------
  //
  // Closes the spec-impl gap: §20 §7.4 specifies min_trust as a first-class
  // FactStore.search() predicate. The call site now passes minTrust: TRUST_FLOOR
  // so the store filters at the data layer (not just activity-layer post-filter).
  // This test asserts the mock receives the correct argument shape.

  it('passes minTrust: 0.15 to factStore.search so trust filtering happens at the data layer (F6)', async () => {
    const factStore = {
      search: vi.fn().mockResolvedValue([]),
    };

    await recall(
      { query: 'trust floor test', sessionId, k: 5 },
      { factStore, clock: fixedClock },
    );

    expect(factStore.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'trust floor test',
        sessionId,
        limit: 5,
        minTrust: 0.15,
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // C6 — Ranker-path guard: no-op ranker must produce same ordering as inline
  // ---------------------------------------------------------------------------
  //
  // Prevents silent behavioral drift from custom rankers. A Ranker that calls
  // compositeScore inline (no-op equivalent) must produce the same ordered results
  // as the inline-scoring path for identical input. If recallWithScores mutates
  // the ranker path (e.g., skips re-sort), this test catches it.

  it('no-op ranker (compositeScore inline) produces same ordering as inline scoring path (C6 — ranker guard)', async () => {
    const EPOCH_MS = 0;

    const fixture: RecallResult[] = [
      { content: 'Cold low-relevance fact',        relevance: 0.2, importance: 0.2, trust: 0.3, attentionTier: 'cold', lastAccessed: EPOCH_MS },
      { content: 'Hot high-relevance fact',         relevance: 0.9, importance: 0.8, trust: 0.9, attentionTier: 'hot',  lastAccessed: EPOCH_MS },
      { content: 'Warm medium-high-relevance fact', relevance: 0.7, importance: 0.6, trust: 0.7, attentionTier: 'warm', lastAccessed: EPOCH_MS },
      { content: 'Warm medium-relevance fact',      relevance: 0.5, importance: 0.4, trust: 0.5, attentionTier: 'warm', lastAccessed: EPOCH_MS },
    ];

    const makeStore = () => ({ search: vi.fn().mockResolvedValue([...fixture]) });

    // No-op ranker: calls compositeScore inline — semantically identical to the
    // inline path, but exercises the ranker code branch.
    const noOpRanker = (facts: RecallResult[], { nowMs }: { nowMs: number }) =>
      facts.map(f => ({ fact: f, score: compositeScore(f, nowMs) }));

    const [withRanker, withoutRanker] = await Promise.all([
      recall({ query: 'ranker guard', sessionId, k: 4 }, { factStore: makeStore(), clock: fixedClock, ranker: noOpRanker }),
      recall({ query: 'ranker guard', sessionId, k: 4 }, { factStore: makeStore(), clock: fixedClock }),
    ]);

    expect(withRanker.map(r => r.content)).toEqual(withoutRanker.map(r => r.content));
  });
});
