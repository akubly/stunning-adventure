/**
 * Integrate contract test suite — SQLite wiring.
 *
 * Wires:
 *   - SqliteFactWriter (imprint slice, shipped) — for fact creation.
 *   - SqliteFactStore   (M8, shipped)            — for IT-8 round-trip + IT-15 negative.
 *   - SqliteFactReader  (NEW listBySession in wave-2).
 *   - SqliteRelationWriter (NEW in wave-2)       — writes to `fact_relations`
 *                                                  introduced by migration 003.
 *
 * Migration 003 (Crispin wave-2) MUST land before this file goes GREEN:
 *   - CREATE TABLE fact_relations(from_fact_id, to_fact_id, session_id,
 *                                 relation_kind CHECK IN ('duplicate_of'),
 *                                 created_at, ...)
 *   - UNIQUE (session_id, from_fact_id, to_fact_id, relation_kind)
 *
 * Note: TS `RelationEdge.edgeType` ↔ DB column `relation_kind`.
 *
 * ## RED status
 *
 * Fails at module load until wave-2 GREEN delivers:
 *   - src/activities/integrate.ts                    (activity + types + seams)
 *   - src/activities/errors.ts InvalidIntegrateError
 *   - src/db/migrations/003-fact-relations.ts        (registered via applyMigrations)
 *   - src/storage/fact-reader-sqlite.ts              SqliteFactReader.listBySession
 *   - src/storage/relation-writer-sqlite.ts          SqliteRelationWriter
 *
 * That failure is the correct RED signal.
 *
 * ## Belt-and-suspenders SQLite-only test
 *
 * The shared contract suite asserts idempotency via `report.edgesWritten === 0`
 * on a second integrate. The SQLite wiring adds ONE extra test that selects
 * COUNT(*) from `fact_relations` directly — proves no second-insert escaped
 * the activity layer (catches a bug where the activity counts correctly but
 * still issues duplicate INSERTs that the UNIQUE constraint silently rejects
 * outside the count).
 *
 * @see ./integrate-contract.helper.ts for assertion-level documentation.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import type { FactId, IdProvider, ImprintOptions } from '../imprint.js';
import { imprint as imprintActivity } from '../imprint.js';

// RED: ../integrate.ts and its types do not exist until wave-2 GREEN.
import {
  integrate as integrateActivity,
  type IntegrateOptions,
  type IntegrationReport,
  type IntegrateDeps,
} from '../integrate.js';

// Shipped (imprint slice).
import { SqliteFactWriter } from '../../storage/fact-writer-sqlite.js';
// RED: SqliteFactReader currently exposes read-by-id only; listBySession is wave-2.
import { SqliteFactReader } from '../../storage/fact-reader-sqlite.js';
// RED: SqliteRelationWriter is new in wave-2.
import { SqliteRelationWriter } from '../../storage/relation-writer-sqlite.js';
import { SqliteFactStore, applyMigrations } from '../../sqlite/index.js';

import { runIntegrateContract, type IntegrateHarness } from './integrate-contract.helper.js';

// ---------------------------------------------------------------------------
// SQLite harness factory
// ---------------------------------------------------------------------------

function makeSqliteIntegrateHarness(): IntegrateHarness {
  const db = new Database(':memory:');
  applyMigrations(db); // wave-2: must include migration 003 fact_relations

  const factWriter = new SqliteFactWriter(db);
  const factReader = new SqliteFactReader(db);
  const relationWriter = new SqliteRelationWriter(db);
  const factStore = new SqliteFactStore(db);

  let counter = 0;
  const idProvider: IdProvider = {
    next: () => `it-sqlite-${String(++counter).padStart(4, '0')}` as FactId,
  };

  let currentMs = 1_000_000;
  const clock = { now: () => currentMs };

  return {
    imprint: (options: ImprintOptions) =>
      imprintActivity(options, { factWriter, clock, idProvider }),

    integrate: (
      options: IntegrateOptions,
      overrides?: Partial<IntegrateDeps>,
    ): Promise<IntegrationReport> => {
      const baseDeps: IntegrateDeps = {
        factReader,
        relationWriter,
        clock,
      };
      return integrateActivity(options, { ...baseDeps, ...overrides });
    },

    factStore,
    factReader,
    relationWriter,

    advanceClock: (deltaMs: number) => {
      currentMs += deltaMs;
    },

    cleanup: () => db.close(),
  };
}

// ---------------------------------------------------------------------------
// Wire shared contract suite (15 RED tests)
// ---------------------------------------------------------------------------

runIntegrateContract('Sqlite (integrate)', makeSqliteIntegrateHarness);

// ---------------------------------------------------------------------------
// SQLite-only belt-and-suspenders: idempotent re-integrate writes nothing to
// the fact_relations table (verified by direct SELECT COUNT, independent of
// the activity's reported edgesWritten).
// ---------------------------------------------------------------------------

describe('integrate SQLite — fact_relations table belt-and-suspenders', () => {
  it('IT-S1: a second integrate leaves COUNT(*) of fact_relations unchanged', async () => {
    const db = new Database(':memory:');
    try {
      applyMigrations(db);

      const factWriter = new SqliteFactWriter(db);
      const factReader = new SqliteFactReader(db);
      const relationWriter = new SqliteRelationWriter(db);

      let counter = 0;
      const idProvider: IdProvider = {
        next: () => `it-belt-${String(++counter).padStart(4, '0')}` as FactId,
      };
      let currentMs = 1_000_000;
      const clock = { now: () => currentMs };

      const SESSION = 'integrate-sqlite-belt' as SessionId;

      await imprintActivity(
        { content: 'belt observation', sessionId: SESSION },
        { factWriter, clock, idProvider },
      );
      currentMs += 1_000;
      await imprintActivity(
        { content: 'belt observation', sessionId: SESSION },
        { factWriter, clock, idProvider },
      );

      const deps: IntegrateDeps = { factReader, relationWriter, clock };
      await integrateActivity({ sessionId: SESSION }, deps);
      const countAfterFirst = (
        db
          .prepare<[], { c: number }>(
            "SELECT COUNT(*) as c FROM fact_relations WHERE relation_kind = 'duplicate_of'",
          )
          .get() ?? { c: -1 }
      ).c;

      await integrateActivity({ sessionId: SESSION }, deps);
      const countAfterSecond = (
        db
          .prepare<[], { c: number }>(
            "SELECT COUNT(*) as c FROM fact_relations WHERE relation_kind = 'duplicate_of'",
          )
          .get() ?? { c: -1 }
      ).c;

      expect(countAfterFirst).toBe(1);
      expect(countAfterSecond).toBe(1); // UNIQUE constraint absorbed the re-insert
    } finally {
      db.close();
    }
  });
});
