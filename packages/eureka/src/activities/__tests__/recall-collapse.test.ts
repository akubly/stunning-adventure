/**
 * recall-collapse.test.ts — duplicate_of edge consumption at the recall layer.
 *
 * Activity under test : recall (§10 §10.1)
 * Seam                : RecallDeps.relationReader (RelationReader — optional)
 *                       listDuplicateOf({ sessionId }) → ReadonlyArray<{ from, to }>
 * Implementation      : packages/eureka/src/activities/recall.ts (Edgar — landed)
 * Seam type           : packages/eureka/src/representation/relation.ts
 *
 * ## Contract
 *
 * When `deps.relationReader` is present, `recallWithScores` MUST:
 *   1. Call `listDuplicateOf({ sessionId })` exactly once per invocation.
 *   2. Build the dup-id set from the returned `from` fields.
 *   3. Remove any scored candidate whose `factId` is in the dup-id set
 *      (non-canonical / duplicate suppression).
 *   4. Keep facts that appear only as `to` (canonical) or in no edge at all.
 *   5. Apply the removal AFTER trust-filtering, BEFORE scoring/ranking and
 *      `slice(0, k)`, so the overfetch budget can still fill k results after
 *      dups are collapsed.
 *
 * When `deps.relationReader` is ABSENT the existing pipeline is unchanged —
 * no edges are consulted, no facts suppressed (backward compat).
 *
 * ## Test IDs
 *
 *   RC-1  Canonical kept; its duplicate suppressed
 *   RC-2  N-way star collapse (3 dups all → canonical; all dropped)
 *   RC-3  RelationReader returns no edges → pass-through; seam IS called once
 *   RC-4  Absent relationReader dep → no collapse, full backward compat
 *   RC-5  k results returned after collapse via overfetch budget
 *   RC-6  Dup below trust floor: doubly excluded; canonical NOT suppressed
 *   RC-7  FR-2 composite ordering preserved among non-dup survivors
 */

import { describe, it, expect, vi } from 'vitest';
import { recall } from '../recall.js';
import type { RecallResult, RecallDeps } from '../recall.js';
import type { RelationReader } from '../../representation/relation.js';
import type { FactId, SessionId } from '@akubly/types';

// ---------------------------------------------------------------------------
// Shared fixture constants
// ---------------------------------------------------------------------------

/**
 * Fixed clock anchor.
 *
 * Chosen far enough in the past that `lastAccessed = BASE_MS - DAYS_30_MS`
 * yields tDays = 30 → recency = (31)^−0.5 ≈ 0.180 for every fact in this suite.
 * Ordering is therefore determined by relevance / trust / attentionTier alone —
 * no fact gets an accidentally-high recency bonus. The stub clock is REQUIRED
 * per §55 §1.2 (non-deterministic inputs must be mocked at seam).
 */
const BASE_MS = 1_000_000_000_000; // Sep 2001 — stable anchor

/** 30 days in ms — applied as `lastAccessed = BASE_MS - DAYS_30_MS`. */
const DAYS_30_MS = 30 * 86_400_000;

/** Recency value all test facts share: max(0.1, (1 + 30)^-0.5) ≈ 0.18. */
// Used only in the scoring commentary; not referenced in code.
// const _RECENCY_30 = Math.max(0.1, Math.pow(31, -0.5)); // ≈ 0.17961

/** Pinned clock used in all tests (§30 §2.4 — ClockProvider seam). */
const clock = { now: () => BASE_MS };

/** Session scope for all collapse tests. */
const SESSION = 'session-recall-collapse-001' as SessionId;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal RecallResult that clears the trust floor (0.15) and parks
 * recency at the ~0.18 level so composite ordering is relevance/trust/tier-driven.
 *
 * @param id      Short suffix — becomes factId (`rc-<id>`) and content (`content-<id>`).
 * @param overrides  Any RecallResult fields to override; applied after defaults.
 */
function mkFact(id: string, overrides: Partial<RecallResult> = {}): RecallResult {
  return {
    factId:       `rc-${id}` as FactId,
    content:      `content-${id}`,
    trust:        0.8,
    attentionTier: 'warm',
    relevance:    0.5,
    importance:   0.0,
    lastAccessed: BASE_MS - DAYS_30_MS,   // 30 days ago → recency ≈ 0.18
    ...overrides,
  };
}

/** Minimal FactStore stub returning a fixed list of results. */
function makeStore(results: RecallResult[]) {
  return { search: vi.fn().mockResolvedValue({ results }) };
}

/** RelationReader stub returning a fixed list of duplicate_of edges. */
function makeReader(edges: ReadonlyArray<{ from: FactId; to: FactId }>) {
  return { listDuplicateOf: vi.fn().mockResolvedValue(edges) };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('recall duplicate_of collapse via RelationReader seam (RC)', () => {

  // -------------------------------------------------------------------------
  // RC-1 — Canonical kept; duplicate suppressed
  // -------------------------------------------------------------------------
  //
  // Simplest two-fact scenario. The RelationReader signals that `dup` is a
  // duplicate of `canonical`. After collapse, only `canonical` must survive.
  //
  // Composite scores (tDays=30, recency≈0.180, tier=warm):
  //   canonical: raw = 0.5×0.8 + 0.2×0.0 + 0.2×0.9 + 0.1×0.180 ≈ 0.598  (warm × 1.0 = 0.598)
  //   dup:       raw = 0.5×0.6 + 0.2×0.0 + 0.2×0.7 + 0.1×0.180 ≈ 0.458  (warm × 1.0 = 0.458)
  //
  // Without collapse, slice(0, k=2) returns both. RED failure: length=2 ≠ 1.

  it('RC-1: keeps canonical fact and suppresses its duplicate when a duplicate_of edge exists', async () => {
    const canonical = mkFact('canonical-01', { trust: 0.9, relevance: 0.8 });
    const dup       = mkFact('dup-01',       { trust: 0.7, relevance: 0.6 });

    const reader    = makeReader([{ from: dup.factId, to: canonical.factId }]);
    const factStore = makeStore([canonical, dup]);

    const results = await recall(
      { query: 'collapse-rc1', sessionId: SESSION, k: 2 },
      { factStore, clock, relationReader: reader },
    );

    const ids = results.map(r => r.factId);
    expect(ids).toContain(canonical.factId);
    expect(ids).not.toContain(dup.factId);
    expect(results).toHaveLength(1);

    // Seam must be consulted exactly once with the session under query.
    expect(reader.listDuplicateOf).toHaveBeenCalledOnce();
    expect(reader.listDuplicateOf).toHaveBeenCalledWith({ sessionId: SESSION });
  });

  // -------------------------------------------------------------------------
  // RC-2 — N-way star collapse
  // -------------------------------------------------------------------------
  //
  // integrate writes a STAR-TO-CANONICAL topology: all newer duplicates point
  // to the single oldest (canonical) — NOT a chain. All three dups must be
  // dropped; canonical must survive.
  //
  // Without collapse, slice(0, k=4) returns all four facts. RED failure on the
  // `not.toContain` assertions for dup1/dup2/dup3.

  it('RC-2: all duplicates suppressed in a star topology (3 dups → 1 canonical survives)', async () => {
    const canonical = mkFact('star-canonical', { trust: 0.9, relevance: 0.9 });
    const dup1      = mkFact('star-dup-1',     { trust: 0.8, relevance: 0.8 });
    const dup2      = mkFact('star-dup-2',     { trust: 0.8, relevance: 0.8 });
    const dup3      = mkFact('star-dup-3',     { trust: 0.7, relevance: 0.7 });

    const reader = makeReader([
      { from: dup1.factId, to: canonical.factId },
      { from: dup2.factId, to: canonical.factId },
      { from: dup3.factId, to: canonical.factId },
    ]);
    const factStore = makeStore([canonical, dup1, dup2, dup3]);

    const results = await recall(
      { query: 'collapse-rc2', sessionId: SESSION, k: 4 },
      { factStore, clock, relationReader: reader },
    );

    const ids = results.map(r => r.factId);
    expect(ids).toContain(canonical.factId);
    expect(ids).not.toContain(dup1.factId);
    expect(ids).not.toContain(dup2.factId);
    expect(ids).not.toContain(dup3.factId);
    expect(results).toHaveLength(1);

    expect(reader.listDuplicateOf).toHaveBeenCalledOnce();
    expect(reader.listDuplicateOf).toHaveBeenCalledWith({ sessionId: SESSION });
  });

  // -------------------------------------------------------------------------
  // RC-3 — No edges returned → behavior unchanged; listDuplicateOf IS called
  // -------------------------------------------------------------------------
  //
  // When the RelationReader returns an empty edge list, the collapse step is a
  // no-op: all facts pass through unchanged. The seam MUST still be called once
  // so the implementation cannot short-circuit by skipping the query entirely.
  //
  // Without the seam wired in, `listDuplicateOf` is never invoked. RED failure
  // on `toHaveBeenCalledOnce()`.

  it('RC-3: when RelationReader returns no edges all facts pass through; listDuplicateOf is still called once', async () => {
    const factA = mkFact('no-edge-A', { trust: 0.9, relevance: 0.9, attentionTier: 'hot'  });
    const factB = mkFact('no-edge-B', { trust: 0.7, relevance: 0.7, attentionTier: 'warm' });
    const factC = mkFact('no-edge-C', { trust: 0.5, relevance: 0.5, attentionTier: 'cold' });

    const reader    = makeReader([]); // no duplicate_of edges for this session
    const factStore = makeStore([factA, factB, factC]);

    const results = await recall(
      { query: 'collapse-rc3', sessionId: SESSION, k: 3 },
      { factStore, clock, relationReader: reader },
    );

    const ids = results.map(r => r.factId);
    expect(ids).toContain(factA.factId);
    expect(ids).toContain(factB.factId);
    expect(ids).toContain(factC.factId);
    expect(results).toHaveLength(3);

    // The seam must be consulted even when it returns no edges.
    expect(reader.listDuplicateOf).toHaveBeenCalledOnce();
    expect(reader.listDuplicateOf).toHaveBeenCalledWith({ sessionId: SESSION });
  });

  // -------------------------------------------------------------------------
  // RC-4 — Absent relationReader dep → no collapse (backward compat)
  // -------------------------------------------------------------------------
  //
  // Adding the optional seam MUST NOT change recall behavior for callers that
  // do not provide `relationReader`. Both canonical and dup appear in the output.
  //
  // This is a GREEN GUARD: it passes before and after Edgar's PR. It captures
  // the backward-compat invariant in the test suite so regressions are caught.

  it('RC-4: omitting relationReader leaves behavior unchanged — dups are NOT suppressed (backward compat)', async () => {
    const canonical = mkFact('no-reader-canonical', { trust: 0.9, relevance: 0.8 });
    const dup       = mkFact('no-reader-dup',       { trust: 0.7, relevance: 0.6 });

    // Standard RecallDeps — no cast needed; no relationReader field.
    const results = await recall(
      { query: 'collapse-rc4', sessionId: SESSION, k: 2 },
      { factStore: makeStore([canonical, dup]), clock },
    );

    const ids = results.map(r => r.factId);
    expect(ids).toContain(canonical.factId);
    expect(ids).toContain(dup.factId);
    expect(results).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // RC-5 — k results returned after collapse via overfetch budget
  // -------------------------------------------------------------------------
  //
  // k=2, RANKER_OVERFETCH_FACTOR=3 → factStore is queried with limit=6.
  // FactStore returns 5 candidates; 3 are dups with HIGHER individual scores
  // than canonical2 so that, without collapse, slice(0,2) would return
  // [canonical1, dup1] — missing canonical2.
  //
  // Composite scores (tier=warm, importance=0, recency≈0.180):
  //   canonical1: rel=0.9, trust=0.9  → raw≈0.648  (1st)
  //   dup1:       rel=0.8, trust=0.8  → raw≈0.578  (2nd  ← beats canonical2)
  //   dup2:       rel=0.7, trust=0.7  → raw≈0.508  (3rd)
  //   dup3:       rel=0.6, trust=0.6  → raw≈0.438  (4th)
  //   canonical2: rel=0.3, trust=0.3  → raw≈0.228  (5th)
  //
  // Without collapse, slice(0,2) = [canonical1, dup1]. RC-5 is RED on both the
  // `toContain(canonical2)` and `not.toContain(dup1)` assertions.
  //
  // After collapse (dup1/dup2/dup3 removed):
  //   [canonical1(0.648), canonical2(0.228)] → slice(0,2) → exactly k=2 results.

  it('RC-5: k results returned after dup collapse because overfetch budget absorbs removed dups', async () => {
    const canonical1 = mkFact('over-canonical-1', { trust: 0.9, relevance: 0.9 });
    const canonical2 = mkFact('over-canonical-2', { trust: 0.3, relevance: 0.3 }); // low score, below dups
    const dup1       = mkFact('over-dup-1',       { trust: 0.8, relevance: 0.8 });
    const dup2       = mkFact('over-dup-2',       { trust: 0.7, relevance: 0.7 });
    const dup3       = mkFact('over-dup-3',       { trust: 0.6, relevance: 0.6 });

    // All three dups point to canonical1 (star topology for dup1/dup2;
    // dup3 points to canonical2 — two separate stars).
    const reader = makeReader([
      { from: dup1.factId, to: canonical1.factId },
      { from: dup2.factId, to: canonical1.factId },
      { from: dup3.factId, to: canonical2.factId },
    ]);
    const factStore = makeStore([canonical1, dup1, dup2, dup3, canonical2]);

    const results = await recall(
      { query: 'collapse-rc5', sessionId: SESSION, k: 2 },
      { factStore, clock, relationReader: reader },
    );

    // Exactly k=2: both canonicals survive (dups absorbed by overfetch).
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.factId);
    expect(ids).toContain(canonical1.factId);
    expect(ids).toContain(canonical2.factId);
    expect(ids).not.toContain(dup1.factId);
    expect(ids).not.toContain(dup2.factId);
    expect(ids).not.toContain(dup3.factId);

    expect(reader.listDuplicateOf).toHaveBeenCalledOnce();
    expect(reader.listDuplicateOf).toHaveBeenCalledWith({ sessionId: SESSION });
  });

  // -------------------------------------------------------------------------
  // RC-6 — Dup below trust floor is doubly excluded; canonical NOT suppressed
  // -------------------------------------------------------------------------
  //
  // The dup (trust=0.10) sits below TRUST_FLOOR (0.15) so it is already removed
  // by the existing trust-guard before collapse runs. The RelationReader also
  // names it as a dup. The test confirms:
  //   a) canonical is NOT mistakenly suppressed (it appears as `to` in the edge),
  //   b) dup is absent (double-excluded: trust floor AND edge collapse),
  //   c) the seam is still consulted — the implementation must not skip
  //      `listDuplicateOf` just because the trust-filter already caught all dups.
  //
  // Without the seam, `listDuplicateOf` is never called. RED on `toHaveBeenCalledOnce`.

  it('RC-6: dup below trust floor is doubly excluded; canonical (above floor) is kept', async () => {
    // dup.trust = 0.10 < TRUST_FLOOR (0.15) — already eliminated by trust guard.
    const canonical = mkFact('low-trust-canonical', { trust: 0.9, relevance: 0.8 });
    const dup       = mkFact('low-trust-dup',       { trust: 0.10, relevance: 0.9 });

    const reader    = makeReader([{ from: dup.factId, to: canonical.factId }]);
    const factStore = makeStore([canonical, dup]);

    const results = await recall(
      { query: 'collapse-rc6', sessionId: SESSION, k: 2 },
      { factStore, clock, relationReader: reader },
    );

    const ids = results.map(r => r.factId);
    // canonical is NOT mistakenly treated as a dup just because it appears in an edge.
    expect(ids).toContain(canonical.factId);
    // dup absent regardless of which mechanism removes it.
    expect(ids).not.toContain(dup.factId);
    expect(results).toHaveLength(1);

    // Seam must be consulted even when trust-floor already cleared the dup.
    expect(reader.listDuplicateOf).toHaveBeenCalledOnce();
    expect(reader.listDuplicateOf).toHaveBeenCalledWith({ sessionId: SESSION });
  });

  // -------------------------------------------------------------------------
  // RC-7 — Deterministic FR-2 ordering preserved among surviving facts
  // -------------------------------------------------------------------------
  //
  // Verifies that after removing dups the remaining facts maintain their
  // FR-2 composite score descending order. Two high-scoring facts are dups
  // (suppressed) and two mid-range facts survive — the survivors must be
  // ordered by composite score, NOT by their position in the FactStore result.
  //
  // Composite scores (tier as noted, importance as noted, recency≈0.180):
  //
  //   dupA (suppressed): rel=0.95, imp=0.9,  trust=0.95, tier=hot
  //     raw  ≈ 0.5×0.95 + 0.2×0.9 + 0.2×0.95 + 0.1×0.180 = 0.863
  //     final = 0.863 × 1.20 ≈ 1.036  ← highest, but suppressed
  //
  //   factB (survives, rank 1): rel=0.9, imp=0.8, trust=0.9, tier=hot
  //     raw  ≈ 0.5×0.9 + 0.2×0.8 + 0.2×0.9 + 0.1×0.180 = 0.808
  //     final = 0.808 × 1.20 ≈ 0.970
  //
  //   factC (survives, rank 2): rel=0.5, imp=0.4, trust=0.5, tier=warm
  //     raw  ≈ 0.5×0.5 + 0.2×0.4 + 0.2×0.5 + 0.1×0.180 = 0.448
  //     final = 0.448 × 1.00 ≈ 0.448  (margin vs factB = 0.522 — unambiguous)
  //
  //   dupD (suppressed): rel=0.2, imp=0.1, trust=0.3, tier=cold
  //     raw  ≈ 0.5×0.2 + 0.2×0.1 + 0.2×0.3 + 0.1×0.180 = 0.198
  //     final = 0.198 × 0.80 ≈ 0.158  ← lowest, suppressed
  //
  // FactStore returns facts in arbitrary order [dupD, factC, dupA, factB].
  // After scoring + collapse → [factB, factC] (FR-2 descending, dups absent).
  //
  // Without collapse, scoring returns [dupA, factB, factC, dupD] and the
  // test fails because dupA is at index 0 (≠ factB) and dupD is in the results.

  it('RC-7: FR-2 composite ordering is preserved among non-dup survivors after collapse', async () => {
    const dupA  = mkFact('ord-dupA',  { trust: 0.95, relevance: 0.95, importance: 0.9, attentionTier: 'hot'  });
    const factB = mkFact('ord-factB', { trust: 0.9,  relevance: 0.9,  importance: 0.8, attentionTier: 'hot'  });
    const factC = mkFact('ord-factC', { trust: 0.5,  relevance: 0.5,  importance: 0.4, attentionTier: 'warm' });
    const dupD  = mkFact('ord-dupD',  { trust: 0.3,  relevance: 0.2,  importance: 0.1, attentionTier: 'cold' });

    const reader = makeReader([
      { from: dupA.factId, to: factB.factId }, // dupA is a dup of factB (factB is canonical)
      { from: dupD.factId, to: factC.factId }, // dupD is a dup of factC (factC is canonical)
    ]);

    // Storage order is intentionally scrambled — ranker must impose FR-2 order.
    const factStore = makeStore([dupD, factC, dupA, factB]);

    const results = await recall(
      { query: 'collapse-rc7', sessionId: SESSION, k: 4 },
      { factStore, clock, relationReader: reader },
    );

    // Exactly 2 survivors: dupA (score≈1.036) and dupD (score≈0.158) both suppressed.
    expect(results).toHaveLength(2);

    // factB (≈0.970) must precede factC (≈0.448) — FR-2 descending order intact.
    expect(results[0].factId).toBe(factB.factId);
    expect(results[1].factId).toBe(factC.factId);

    expect(reader.listDuplicateOf).toHaveBeenCalledOnce();
    expect(reader.listDuplicateOf).toHaveBeenCalledWith({ sessionId: SESSION });
  });
});
