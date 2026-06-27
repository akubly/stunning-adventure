/**
 * Integrate contract test helper — shared suite definition.
 *
 * ## Purpose
 *
 * `runIntegrateContract` is a shared test suite. Any wiring of the
 * `integrate` activity (InMemory + SQLite) is verified by calling it
 * with a harness factory. Mirrors the FactWriter / FactReader / FactStore
 * / TrustUpdater contract-helper pattern in `src/storage/__tests__/`.
 *
 * ## Activity under test (Option B — consolidation reframe, LOCKED 2026-06-25)
 *
 *   integrate({ sessionId }, deps) → IntegrationReport
 *
 * `integrate` is a POST-imprint consolidation pass. It does NOT write
 * content facts; it scans an already-imprinted session and writes
 * idempotent `duplicate_of` edges via a `RelationWriter` seam into a new
 * `fact_relations` table (migration 003 — Crispin wave-2 GREEN).
 *
 * Locked types (verbatim from Genesta's wave-2 contract):
 * ```ts
 * interface IntegrateOptions { sessionId: SessionId; }
 * interface RelationEdge     { from: FactId; to: FactId; edgeType: 'duplicate_of'; sessionId: SessionId; }
 * interface RelationWriterBatch  { writeEdges(edges: RelationEdge[]): Promise<number>; } // count actually written
 * interface SessionFactLister    { listBySession(args: { sessionId }): Promise<ReadonlyArray<{ factId; content; createdAt }>>; }
 * interface IntegrateDeps        { factReader: SessionFactLister; relationWriter: RelationWriterBatch; }
 * interface DuplicatePair    { keptFactId: FactId; duplicateFactId: FactId; }
 * interface IntegrationReport {
 *   sessionId: SessionId; factsScanned: number; duplicatesFound: number;
 *   edgesWritten: number; pairs: DuplicatePair[];
 * }
 * ```
 *
 * `keptFactId` is the OLDER (canonical) fact; `duplicateFactId` is the NEWER.
 * Edge orientation in `RelationEdge`: `from = newer (duplicate)`, `to = older (kept)`.
 *
 * ## Contract invariants covered (IT-1..IT-15)
 *
 * IT-1   Empty session                        — zero report
 * IT-2   Single fact                          — zero report (no pair to form)
 * IT-3   Two distinct-content facts           — zero edges (no duplicates)
 * IT-4   Two identical-content facts          — exactly one duplicate_of pair,
 *                                               keptFactId = older
 * IT-5   Three identical-content facts        — STAR-TO-CANONICAL topology:
 *                                               all pairs share keptFactId = oldest,
 *                                               no pair has keptFactId = middle (no chain)
 * IT-6   Idempotent                           — second integrate has edgesWritten=0,
 *                                               pairs identical to first run
 * IT-7   Session isolation                    — identical content in sessionA + sessionB
 *                                               are NOT linked
 * IT-8   Imprint lossless                     — both duplicates still recallable
 *                                               via FactStore.search post-integrate
 * IT-9   Trimmed-content equality             — "hello" matches "  hello  "
 * IT-10  No internal-whitespace collapse      — "hello world" ≠ "hello  world"
 * IT-11  Report.pairs ordering determinism    — stable across two runs
 * IT-12  Invalid sessionId rejection          — throws InvalidIntegrateError,
 *                                               no seam touched
 * IT-13  FactReader.listBySession error       — propagates unwrapped
 * IT-14  RelationWriter.writeEdges error      — propagates unwrapped, no partial state
 * IT-15  Imprint NOT regressed                — imprint still creates distinct factIds
 *                                               for identical content (negative)
 *
 * @internal
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SessionId, FactId } from '@akubly/types';

import type { ImprintOptions } from '../imprint.js';
import type { FactStore, SessionFactLister } from '../recall.js';

import {
  type IntegrateOptions,
  type IntegrationReport,
  type DuplicatePair,
  type RelationWriterBatch,
  type IntegrateDeps,
} from '../integrate.js';
import type { RelationEdge } from '../../representation/relation.js';
import { InvalidIntegrateError } from '../errors.js';

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

/**
 * Test harness for the integrate contract suite.
 *
 * `imprint`         — Pre-wired imprint, sequential idProvider, harness-advanceable clock.
 * `integrate`       — Pre-wired integrate using the harness's FactReader + RelationWriter.
 *                     `overrides` lets a single test swap a seam for spies/error injection.
 * `factStore`       — Same backing store as the FactWriter behind imprint
 *                     (for IT-8 round-trip + IT-15 negative regression).
 * `factReader`      — Direct seam (for IT-12 spy + IT-13 error-injection).
 * `relationWriter`  — Direct seam (for IT-12 spy + IT-14 error-injection).
 * `advanceClock`    — Step the injected clock forward by `deltaMs` ms (for ordered imprints).
 * `cleanup`         — Optional teardown (e.g. db.close() for SQLite).
 *
 * NOTE: No `listEdges` side-channel. Per the locked v1 contract there is no
 * relation reader. Assertions go through the returned `IntegrationReport`
 * (edgesWritten, duplicatesFound, pairs) and through `factStore.search`
 * (lossless invariant). SQLite-only belt-and-suspenders SELECT COUNT lives
 * in the SQLite wiring file, outside `runIntegrateContract`.
 */
export interface IntegrateHarness {
  imprint: (options: ImprintOptions) => Promise<FactId>;
  integrate: (
    options: IntegrateOptions,
    overrides?: Partial<IntegrateDeps>,
  ) => Promise<IntegrationReport>;
  factStore: FactStore;
  factReader: SessionFactLister;
  relationWriter: RelationWriterBatch;
  advanceClock: (deltaMs: number) => void;
  cleanup?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Suite-level constants
// ---------------------------------------------------------------------------

const SESSION_A = 'integrate-contract-session-A' as SessionId;
const SESSION_B = 'integrate-contract-session-B' as SessionId;

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

/**
 * Run the full integrate contract suite against a given implementation.
 *
 * @param implName    Human-readable label shown in test output.
 * @param makeHarness Factory called per test (via beforeEach) — must return
 *                    a fresh, isolated harness. May be async.
 *
 * @internal
 */
export function runIntegrateContract(
  implName: string,
  makeHarness: () => IntegrateHarness | Promise<IntegrateHarness>,
): void {
  describe(`integrate contract — ${implName}`, () => {
    let harness: IntegrateHarness;

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await harness?.cleanup?.();
    });

    // -----------------------------------------------------------------------
    // IT-1 — Empty session: nothing scanned, nothing paired, nothing written.
    // -----------------------------------------------------------------------

    it('IT-1: empty session returns a zero report', async () => {
      const report = await harness.integrate({ sessionId: SESSION_A });

      expect(report.sessionId).toBe(SESSION_A);
      expect(report.factsScanned).toBe(0);
      expect(report.duplicatesFound).toBe(0);
      expect(report.edgesWritten).toBe(0);
      expect(report.pairs).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // IT-2 — Single fact: nothing to pair against.
    // -----------------------------------------------------------------------

    it('IT-2: single-fact session writes no edges (no pair to form)', async () => {
      await harness.imprint({ content: 'solitary fact', sessionId: SESSION_A });

      const report = await harness.integrate({ sessionId: SESSION_A });

      expect(report.sessionId).toBe(SESSION_A);
      expect(report.factsScanned).toBe(1);
      expect(report.duplicatesFound).toBe(0);
      expect(report.edgesWritten).toBe(0);
      expect(report.pairs).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // IT-3 — Two distinct-content facts: no duplicates.
    // -----------------------------------------------------------------------

    it('IT-3: two distinct-content facts produce no duplicate edges', async () => {
      await harness.imprint({ content: 'TypeScript uses structural typing', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      await harness.imprint({ content: 'Rust uses ownership and borrowing', sessionId: SESSION_A });

      const report = await harness.integrate({ sessionId: SESSION_A });

      expect(report.factsScanned).toBe(2);
      expect(report.duplicatesFound).toBe(0);
      expect(report.edgesWritten).toBe(0);
      expect(report.pairs).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // IT-4 — Two identical facts: exactly one duplicate pair. kept = older,
    //        duplicate = newer. edgesWritten = 1.
    // -----------------------------------------------------------------------

    it('IT-4: two identical-content facts produce one duplicate pair (kept = older)', async () => {
      const olderId = await harness.imprint({ content: 'same observation', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      const newerId = await harness.imprint({ content: 'same observation', sessionId: SESSION_A });

      const report = await harness.integrate({ sessionId: SESSION_A });

      expect(report.sessionId).toBe(SESSION_A);
      expect(report.factsScanned).toBe(2);
      expect(report.duplicatesFound).toBe(1);
      expect(report.edgesWritten).toBe(1);
      expect(report.pairs).toHaveLength(1);

      const pair = report.pairs[0]!;
      expect(pair.keptFactId).toBe(olderId);       // older = canonical
      expect(pair.duplicateFactId).toBe(newerId);  // newer = duplicate
    });

    // -----------------------------------------------------------------------
    // IT-5 — Three identical facts: STAR-TO-CANONICAL topology.
    //
    //   T0  ← T1   (T1 is duplicate of T0)
    //   T0  ← T2   (T2 is duplicate of T0)
    //
    // NOT a chain (T0 ← T1 ← T2). Rationale: "find all duplicates of X" is
    // a single 1-hop query; chains would require transitive closure. Star
    // is also idempotent under late-arrival duplicates (T3 attaches to T0
    // unambiguously).
    //
    // Negative assertion enforces no-chain: NO pair has keptFactId === t1Id.
    // -----------------------------------------------------------------------

    it('IT-5: three identical facts form a STAR to the oldest (canonical), not a chain', async () => {
      const t0Id = await harness.imprint({ content: 'repeated observation', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      const t1Id = await harness.imprint({ content: 'repeated observation', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      const t2Id = await harness.imprint({ content: 'repeated observation', sessionId: SESSION_A });

      const report = await harness.integrate({ sessionId: SESSION_A });

      expect(report.factsScanned).toBe(3);
      expect(report.duplicatesFound).toBe(2);
      expect(report.edgesWritten).toBe(2);
      expect(report.pairs).toHaveLength(2);

      // Locked pair ordering: kept createdAt ASC, then duplicate createdAt ASC.
      // Both pairs share kept=t0Id; ordered by duplicate (t1 before t2).
      expect(report.pairs).toEqual<DuplicatePair[]>([
        { keptFactId: t0Id, duplicateFactId: t1Id },
        { keptFactId: t0Id, duplicateFactId: t2Id },
      ]);

      // Star: every pair points to t0 as canonical.
      for (const pair of report.pairs) {
        expect(pair.keptFactId).toBe(t0Id);
      }

      // Negative no-chain assertion: NO pair treats t1 as the kept/canonical
      // (which would be the case if T2 were paired against T1 chain-style).
      const chainPair = report.pairs.find((p) => p.keptFactId === t1Id);
      expect(chainPair).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // IT-6 — Idempotency. Re-running integrate on the same session:
    //          * detects the same duplicates (pairs identical),
    //          * writes ZERO new edges (RelationWriter.writeEdges returns 0
    //            because the UNIQUE constraint suppresses re-insertion),
    //          * report.factsScanned / duplicatesFound stay constant.
    // -----------------------------------------------------------------------

    it('IT-6: second integrate writes zero new edges; report.pairs are stable', async () => {
      await harness.imprint({ content: 'twice-imprinted', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      await harness.imprint({ content: 'twice-imprinted', sessionId: SESSION_A });

      const first = await harness.integrate({ sessionId: SESSION_A });
      const second = await harness.integrate({ sessionId: SESSION_A });

      // Pair set + scan count stable.
      expect(second.pairs).toEqual(first.pairs);
      expect(second.duplicatesFound).toBe(first.duplicatesFound);
      expect(second.factsScanned).toBe(first.factsScanned);
      expect(second.sessionId).toBe(SESSION_A);

      // Idempotent re-run inserts no new edges.
      expect(first.edgesWritten).toBe(1);
      expect(second.edgesWritten).toBe(0);
    });

    // -----------------------------------------------------------------------
    // IT-7 — Session isolation: identical content in two different sessions
    //        is NOT paired. Each session's integrate sees only its own facts.
    // -----------------------------------------------------------------------

    it('IT-7: identical content in different sessions is not linked', async () => {
      await harness.imprint({ content: 'cross-session content', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      await harness.imprint({ content: 'cross-session content', sessionId: SESSION_B });

      const reportA = await harness.integrate({ sessionId: SESSION_A });
      const reportB = await harness.integrate({ sessionId: SESSION_B });

      expect(reportA.factsScanned).toBe(1);
      expect(reportA.duplicatesFound).toBe(0);
      expect(reportA.edgesWritten).toBe(0);
      expect(reportA.pairs).toEqual([]);

      expect(reportB.factsScanned).toBe(1);
      expect(reportB.duplicatesFound).toBe(0);
      expect(reportB.edgesWritten).toBe(0);
      expect(reportB.pairs).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // IT-8 — Imprint LOSSLESS: after integrate marks a duplicate, BOTH facts
    //        remain present and recallable via FactStore.search. integrate
    //        only writes RELATIONS — it never deletes, retires, or mutates
    //        the underlying facts.
    // -----------------------------------------------------------------------

    it('IT-8: integrate is lossless — both duplicate facts remain recallable', async () => {
      await harness.imprint({
        content: 'lossless eureka observation',
        sessionId: SESSION_A,
      });
      harness.advanceClock(1_000);
      await harness.imprint({
        content: 'lossless eureka observation',
        sessionId: SESSION_A,
      });

      const before = await harness.factStore.search({
        query: 'lossless eureka observation',
        sessionId: SESSION_A,
        limit: 100,
      });
      expect(before.results).toHaveLength(2);

      const report = await harness.integrate({ sessionId: SESSION_A });
      expect(report.edgesWritten).toBe(1); // sanity: integrate did its work

      // After integrate: BOTH facts still present (lossless).
      const after = await harness.factStore.search({
        query: 'lossless eureka observation',
        sessionId: SESSION_A,
        limit: 100,
      });
      expect(after.results).toHaveLength(2);
    });

    // -----------------------------------------------------------------------
    // IT-9 — Trimmed-content equality: integrate uses the same normalization
    //        as imprint (.trim() — see imprint.ts:166). Two facts that differ
    //        only in leading/trailing whitespace ARE considered duplicates.
    // -----------------------------------------------------------------------

    it('IT-9: trimmed-content equality — "hello" matches "  hello  "', async () => {
      const olderId = await harness.imprint({ content: 'hello', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      const newerId = await harness.imprint({ content: '  hello  ', sessionId: SESSION_A });

      const report = await harness.integrate({ sessionId: SESSION_A });

      expect(report.duplicatesFound).toBe(1);
      expect(report.edgesWritten).toBe(1);
      expect(report.pairs).toEqual<DuplicatePair[]>([
        { keptFactId: olderId, duplicateFactId: newerId },
      ]);
    });

    // -----------------------------------------------------------------------
    // IT-10 — NO internal-whitespace collapse: "hello world" and
    //         "hello  world" (double space) are NOT duplicates. Locks the
    //         normalization boundary at imprint's .trim() — any future
    //         whitespace collapse / case fold / NFC normalization is a
    //         separate decision and would break THIS test loudly.
    // -----------------------------------------------------------------------

    it('IT-10: internal whitespace differences are NOT collapsed', async () => {
      await harness.imprint({ content: 'hello world', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      await harness.imprint({ content: 'hello  world', sessionId: SESSION_A }); // double space

      const report = await harness.integrate({ sessionId: SESSION_A });

      expect(report.factsScanned).toBe(2);
      expect(report.duplicatesFound).toBe(0);
      expect(report.edgesWritten).toBe(0);
      expect(report.pairs).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // IT-11 — Report.pairs ordering determinism: three pairs across distinct
    //         duplicate sets must come back in a stable, documented order
    //         (kept createdAt ASC, then duplicate createdAt ASC).
    //         Run twice — pair order must be byte-equal.
    // -----------------------------------------------------------------------

    it('IT-11: report.pairs ordering is deterministic across runs', async () => {
      const kept0 = await harness.imprint({ content: 'alpha alpha', sessionId: SESSION_A });
      harness.advanceClock(50);
      const dup0 = await harness.imprint({ content: 'alpha alpha', sessionId: SESSION_A });

      harness.advanceClock(50);
      const kept1 = await harness.imprint({ content: 'beta beta', sessionId: SESSION_A });
      harness.advanceClock(50);
      const dup1 = await harness.imprint({ content: 'beta beta', sessionId: SESSION_A });

      harness.advanceClock(50);
      const kept2 = await harness.imprint({ content: 'gamma gamma', sessionId: SESSION_A });
      harness.advanceClock(50);
      const dup2 = await harness.imprint({ content: 'gamma gamma', sessionId: SESSION_A });

      const r1 = await harness.integrate({ sessionId: SESSION_A });
      const r2 = await harness.integrate({ sessionId: SESSION_A });

      expect(r1.pairs).toEqual<DuplicatePair[]>([
        { keptFactId: kept0, duplicateFactId: dup0 },
        { keptFactId: kept1, duplicateFactId: dup1 },
        { keptFactId: kept2, duplicateFactId: dup2 },
      ]);
      // Stable across runs (idempotent re-run does not reorder).
      expect(r2.pairs).toEqual(r1.pairs);
    });

    // -----------------------------------------------------------------------
    // IT-12 — Invalid sessionId: blank/whitespace sessionId throws
    //         InvalidIntegrateError synchronously, BEFORE any seam is
    //         touched. Mirrors imprint's InvalidImprintError shape.
    // -----------------------------------------------------------------------

    it('IT-12: blank sessionId throws InvalidIntegrateError; no seam touched', async () => {
      const listSpy = vi.spyOn(harness.factReader, 'listBySession');
      const writeSpy = vi.spyOn(harness.relationWriter, 'writeEdges');

      await expect(
        harness.integrate({ sessionId: '   ' as SessionId }),
      ).rejects.toMatchObject({
        name: 'InvalidIntegrateError',
        code: 'INVALID_INTEGRATE',
        field: 'sessionId',
      });
      await expect(
        harness.integrate({ sessionId: '   ' as SessionId }),
      ).rejects.toBeInstanceOf(InvalidIntegrateError);

      // Synchronous validation: neither seam touched on the failing call.
      expect(listSpy).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // IT-13 — FactReader.listBySession error propagates unwrapped (no
    //         swallow into an "empty session" success).
    // -----------------------------------------------------------------------

    it('IT-13: FactReader.listBySession errors propagate unwrapped', async () => {
      const boom = new Error('storage offline');
      vi.spyOn(harness.factReader, 'listBySession').mockRejectedValueOnce(boom);
      const writeSpy = vi.spyOn(harness.relationWriter, 'writeEdges');

      await expect(harness.integrate({ sessionId: SESSION_A })).rejects.toBe(boom);
      expect(writeSpy).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // IT-14 — RelationWriter.writeEdges error propagates unwrapped. The
    //         activity must NOT return a partial IntegrationReport on a
    //         write failure.
    // -----------------------------------------------------------------------

    it('IT-14: RelationWriter.writeEdges errors propagate; no partial report returned', async () => {
      await harness.imprint({ content: 'paired observation', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      await harness.imprint({ content: 'paired observation', sessionId: SESSION_A });

      const boom = new Error('relations table locked');
      vi.spyOn(harness.relationWriter, 'writeEdges').mockRejectedValueOnce(boom);

      await expect(harness.integrate({ sessionId: SESSION_A })).rejects.toBe(boom);
    });

    // -----------------------------------------------------------------------
    // IT-15 — Imprint NOT regressed: imprint still writes two distinct rows
    //         for identical content (negative assertion — proves we did NOT
    //         sneak dedup into imprint). The LOSSLESS half of Option B.
    // -----------------------------------------------------------------------

    it('IT-15: imprint remains lossless — identical content yields two distinct FactIds', async () => {
      const id1 = await harness.imprint({ content: 'unregressed imprint', sessionId: SESSION_A });
      harness.advanceClock(1_000);
      const id2 = await harness.imprint({ content: 'unregressed imprint', sessionId: SESSION_A });

      expect(id1).not.toBe(id2);

      const { results } = await harness.factStore.search({
        query: 'unregressed imprint',
        sessionId: SESSION_A,
        limit: 100,
      });
      expect(results).toHaveLength(2);
    });
  });
}

// ---------------------------------------------------------------------------
// Re-exports for wiring files
// ---------------------------------------------------------------------------

export type { RelationEdge, IntegrateDeps };
