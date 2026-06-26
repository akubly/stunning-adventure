/**
 * RelationWriter contract test helper — shared suite definition.
 *
 * ## Purpose
 *
 * `runRelationWriterContract` is a shared test helper. Any RelationWriter
 * implementation can be verified by calling it with a factory that produces a
 * fresh harness per test. Adding a new implementation requires only one new
 * call — no test duplication.
 *
 * ## Pattern
 *
 * Mirrors `fact-writer-contract.helper.ts`. Non-test file (no `.test.ts`);
 * vitest does not auto-pick it up. `@internal` exports.
 *
 * ## Contract invariants covered (RW-*)
 *
 * RW-1   Happy path                 — link() resolves; relation surfaces via readRelation
 * RW-2   Default weight             — omitted weight stored as 1.0
 * RW-3   Default confidence         — omitted confidence stored as 1.0
 * RW-4   Custom weight/confidence   — explicit values stored verbatim
 * RW-5   Empty fromFactId           — throws InvalidRelationError(field:'fromFactId')
 * RW-6   Empty toFactId             — throws InvalidRelationError(field:'toFactId')
 * RW-7   Self-loop                  — throws InvalidRelationError(field:'toFactId')
 * RW-8   Invalid relationKind ×3    — throws InvalidRelationError(field:'relationKind')
 * RW-9   Invalid weight ×5          — throws InvalidRelationError(field:'weight')
 * RW-10  Invalid confidence ×5      — throws InvalidRelationError(field:'confidence')
 * RW-11  Session isolation          — relation in sessionA invisible in sessionB
 * RW-12  Idempotent re-link         — same composite key is a no-op; first-write-wins on weight/confidence
 * RW-13  Distinct kind not deduped  — same (from, to) with different relationKind both persist
 * RW-14  Reverse direction not deduped — same (kind, session) with from/to swapped both persist
 *
 * ## Test count
 *
 * Singular tests: RW-1, RW-2, RW-3, RW-4, RW-5, RW-6, RW-7, RW-11, RW-12, RW-13, RW-14 = 11
 * Parameterized:  RW-8 ×3, RW-9 ×5, RW-10 ×5 = 13
 * Total per wiring: 24
 *
 * @internal — monorepo-internal until a `@akubly/eureka/testing` subpath is established.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SessionId } from '@akubly/types';
import type { FactId } from '../../activities/imprint.js';
import type { RelationWriter } from '../relation-writer.types.js';
import type { Relation, RelationKind } from '../../representation/relation.js';
import type { StoredRelation } from '../relation-writer.js';

// ---------------------------------------------------------------------------
// Harness type
// ---------------------------------------------------------------------------

/**
 * Test harness for RelationWriter contract tests.
 *
 * `writer`        — the RelationWriter under test
 * `readRelation`  — side-channel: read a stored relation by composite key
 * `listBySession` — side-channel: enumerate relations in a session
 * `cleanup`       — optional native-handle teardown (db.close() for SQLite)
 *
 * @internal
 */
export interface RelationWriterHarness {
  writer: RelationWriter;
  readRelation: (args: {
    fromFactId: string;
    toFactId: string;
    relationKind: RelationKind;
    sessionId: SessionId;
  }) => Promise<StoredRelation | null>;
  listBySession: (sessionId: SessionId) => Promise<StoredRelation[]>;
  cleanup?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Suite-level constants
// ---------------------------------------------------------------------------

const SESSION_A = 'rw-contract-session-A' as SessionId;
const SESSION_B = 'rw-contract-session-B' as SessionId;
const FROM = 'rw-from-fact' as FactId;
const TO = 'rw-to-fact' as FactId;
const OTHER = 'rw-other-fact' as FactId;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

/**
 * Run the full RelationWriter contract suite against a given implementation factory.
 *
 * Each call adds 24 tests.
 *
 * @internal
 */
export function runRelationWriterContract(
  implName: string,
  makeHarness: () => RelationWriterHarness | Promise<RelationWriterHarness>,
): void {
  describe(`RelationWriter contract — ${implName}`, () => {
    let harness: RelationWriterHarness;

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(async () => {
      await harness?.cleanup?.();
    });

    // -----------------------------------------------------------------------
    // RW-1 — Happy path
    // -----------------------------------------------------------------------

    it('RW-1: happy path — link() persists a relation visible via readRelation', async () => {
      const rel: Relation = {
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'duplicate_of',
        sessionId: SESSION_A,
      };

      await harness.writer.link(rel);

      const stored = await harness.readRelation({
        fromFactId: FROM as string,
        toFactId: TO as string,
        relationKind: 'duplicate_of',
        sessionId: SESSION_A,
      });
      expect(stored).not.toBeNull();
      expect(stored!.fromFactId).toBe(FROM);
      expect(stored!.toFactId).toBe(TO);
      expect(stored!.relationKind).toBe('duplicate_of');
      expect(stored!.sessionId).toBe(SESSION_A);
    });

    // -----------------------------------------------------------------------
    // RW-2 — Default weight 1.0
    // -----------------------------------------------------------------------

    it('RW-2: default weight is 1.0 when weight is omitted', async () => {
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'supports',
        sessionId: SESSION_A,
      });
      const stored = await harness.readRelation({
        fromFactId: FROM as string,
        toFactId: TO as string,
        relationKind: 'supports',
        sessionId: SESSION_A,
      });
      expect(stored).not.toBeNull();
      expect(stored!.weight).toBeCloseTo(1.0, 5);
    });

    // -----------------------------------------------------------------------
    // RW-3 — Default confidence 1.0
    // -----------------------------------------------------------------------

    it('RW-3: default confidence is 1.0 when confidence is omitted', async () => {
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'contradicts',
        sessionId: SESSION_A,
      });
      const stored = await harness.readRelation({
        fromFactId: FROM as string,
        toFactId: TO as string,
        relationKind: 'contradicts',
        sessionId: SESSION_A,
      });
      expect(stored).not.toBeNull();
      expect(stored!.confidence).toBeCloseTo(1.0, 5);
    });

    // -----------------------------------------------------------------------
    // RW-4 — Custom weight + confidence stored verbatim
    // -----------------------------------------------------------------------

    it('RW-4: explicit weight and confidence are stored verbatim', async () => {
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'supersedes',
        sessionId: SESSION_A,
        weight: 0.42,
        confidence: 0.73,
      });
      const stored = await harness.readRelation({
        fromFactId: FROM as string,
        toFactId: TO as string,
        relationKind: 'supersedes',
        sessionId: SESSION_A,
      });
      expect(stored).not.toBeNull();
      expect(stored!.weight).toBeCloseTo(0.42, 5);
      expect(stored!.confidence).toBeCloseTo(0.73, 5);
    });

    // -----------------------------------------------------------------------
    // RW-5 — Empty fromFactId rejected pre-write
    // -----------------------------------------------------------------------

    it('RW-5: empty fromFactId throws InvalidRelationError(field=fromFactId), no write', async () => {
      await expect(
        harness.writer.link({
          fromFactId: '' as FactId,
          toFactId: TO,
          relationKind: 'duplicate_of',
          sessionId: SESSION_A,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_RELATION', field: 'fromFactId' });

      const all = await harness.listBySession(SESSION_A);
      expect(all).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // RW-6 — Empty toFactId rejected pre-write
    // -----------------------------------------------------------------------

    it('RW-6: empty toFactId throws InvalidRelationError(field=toFactId), no write', async () => {
      await expect(
        harness.writer.link({
          fromFactId: FROM,
          toFactId: '   ' as FactId,
          relationKind: 'duplicate_of',
          sessionId: SESSION_A,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_RELATION', field: 'toFactId' });

      const all = await harness.listBySession(SESSION_A);
      expect(all).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // RW-7 — Self-loop rejected
    // -----------------------------------------------------------------------

    it('RW-7: self-loop (fromFactId === toFactId) throws InvalidRelationError', async () => {
      await expect(
        harness.writer.link({
          fromFactId: FROM,
          toFactId: FROM,
          relationKind: 'duplicate_of',
          sessionId: SESSION_A,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_RELATION', field: 'toFactId' });

      const all = await harness.listBySession(SESSION_A);
      expect(all).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // RW-8 — Invalid relationKind rejected (parameterized)
    // -----------------------------------------------------------------------

    it.each(['related_to', 'DUPLICATE_OF', ''])(
      'RW-8: relationKind=%j throws InvalidRelationError(field=relationKind)',
      async (badKind) => {
        await expect(
          harness.writer.link({
            fromFactId: FROM,
            toFactId: TO,
            relationKind: badKind as unknown as RelationKind,
            sessionId: SESSION_A,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_RELATION', field: 'relationKind' });

        const all = await harness.listBySession(SESSION_A);
        expect(all).toHaveLength(0);
      },
    );

    // -----------------------------------------------------------------------
    // RW-9 — Invalid weight rejected (parameterized)
    // -----------------------------------------------------------------------

    it.each([1.5, -0.1, NaN, Infinity, -Infinity])(
      'RW-9: weight=%s throws InvalidRelationError(field=weight)',
      async (badWeight) => {
        await expect(
          harness.writer.link({
            fromFactId: FROM,
            toFactId: TO,
            relationKind: 'duplicate_of',
            sessionId: SESSION_A,
            weight: badWeight,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_RELATION', field: 'weight' });

        const all = await harness.listBySession(SESSION_A);
        expect(all).toHaveLength(0);
      },
    );

    // -----------------------------------------------------------------------
    // RW-10 — Invalid confidence rejected (parameterized)
    // -----------------------------------------------------------------------

    it.each([2.0, -0.5, NaN, Infinity, -Infinity])(
      'RW-10: confidence=%s throws InvalidRelationError(field=confidence)',
      async (badConfidence) => {
        await expect(
          harness.writer.link({
            fromFactId: FROM,
            toFactId: TO,
            relationKind: 'duplicate_of',
            sessionId: SESSION_A,
            confidence: badConfidence,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_RELATION', field: 'confidence' });

        const all = await harness.listBySession(SESSION_A);
        expect(all).toHaveLength(0);
      },
    );

    // -----------------------------------------------------------------------
    // RW-11 — Session isolation
    // -----------------------------------------------------------------------

    it('RW-11: session isolation — relation in sessionA invisible to sessionB', async () => {
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'duplicate_of',
        sessionId: SESSION_A,
      });

      const inB = await harness.readRelation({
        fromFactId: FROM as string,
        toFactId: TO as string,
        relationKind: 'duplicate_of',
        sessionId: SESSION_B,
      });
      expect(inB).toBeNull();

      const allB = await harness.listBySession(SESSION_B);
      expect(allB).toHaveLength(0);

      const allA = await harness.listBySession(SESSION_A);
      expect(allA).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // RW-12 — Idempotent re-link (first-write-wins on weight/confidence)
    // -----------------------------------------------------------------------

    it('RW-12: idempotent re-link — same composite key is a no-op; first write wins', async () => {
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'duplicate_of',
        sessionId: SESSION_A,
        weight: 0.3,
        confidence: 0.4,
      });

      // Second link with different weight/confidence — must NOT throw, must NOT overwrite.
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'duplicate_of',
        sessionId: SESSION_A,
        weight: 0.9,
        confidence: 0.95,
      });

      const stored = await harness.readRelation({
        fromFactId: FROM as string,
        toFactId: TO as string,
        relationKind: 'duplicate_of',
        sessionId: SESSION_A,
      });
      expect(stored).not.toBeNull();
      expect(stored!.weight).toBeCloseTo(0.3, 5);
      expect(stored!.confidence).toBeCloseTo(0.4, 5);

      const all = await harness.listBySession(SESSION_A);
      expect(all).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // RW-13 — Different relationKind for same (from, to) is a distinct row
    //
    // (from, to, 'duplicate_of') and (from, to, 'supports') must both persist.
    // The UNIQUE key includes relation_kind, so they are different rows.
    // -----------------------------------------------------------------------

    it('RW-13: same (from, to) with different relationKind both persist (UNIQUE includes kind)', async () => {
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'duplicate_of',
        sessionId: SESSION_A,
      });
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: TO,
        relationKind: 'supports',
        sessionId: SESSION_A,
      });

      const all = await harness.listBySession(SESSION_A);
      expect(all).toHaveLength(2);
      const kinds = all.map(r => r.relationKind).sort();
      expect(kinds).toEqual(['duplicate_of', 'supports']);
    });

    // -----------------------------------------------------------------------
    // RW-14 — Reverse direction is a distinct row
    //
    // (from, to, kind) and (to, from, kind) must both persist — relations are
    // directed, so the reverse edge is a distinct row.
    // -----------------------------------------------------------------------

    it('RW-14: reverse direction (to, from) is a distinct row from (from, to)', async () => {
      await harness.writer.link({
        fromFactId: FROM,
        toFactId: OTHER,
        relationKind: 'supersedes',
        sessionId: SESSION_A,
      });
      await harness.writer.link({
        fromFactId: OTHER,
        toFactId: FROM,
        relationKind: 'supersedes',
        sessionId: SESSION_A,
      });

      const all = await harness.listBySession(SESSION_A);
      expect(all).toHaveLength(2);
    });
  });
}
