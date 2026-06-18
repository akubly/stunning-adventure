/**
 * FactWriter contract test suite — SqliteFactWriter wiring.
 *
 * ## Design
 *
 * This file wires SqliteFactWriter into the shared FactWriter contract suite.
 * The helper definition (runFactWriterContract + FactWriterHarness) lives in:
 *   ./fact-writer-contract.helper.ts
 *
 * Each call to runFactWriterContract adds 25 tests (IM-1..IM-14 + parameterized cases).
 * SqliteFactWriter wired below → 25 contract tests.
 *
 * ## Harness design
 *
 * - SqliteFactWriter and SqliteFactStore share the same `db` handle → same underlying data.
 * - readFact uses a direct prepared SELECT (side-channel bypasses the activity layer entirely).
 * - cleanup closes the db handle after each test (fresh :memory: db per test).
 * - idProvider uses a closure counter (resets to 0 on every makeHarness() call).
 *
 * ## RED status
 *
 * This file will fail to load until Crispin creates:
 *   - src/activities/imprint.ts      (imported transitively via the contract helper)
 *   - src/storage/fact-writer-sqlite.ts (imported directly below as SqliteFactWriter)
 *
 * That failure is expected and correct — it is the RED signal for this phase.
 */

import Database from 'better-sqlite3';
// RED: ../../activities/imprint.ts does not exist until Crispin's GREEN phase.
// (Imported transitively via fact-writer-contract.helper.ts — listed here for clarity.)
import type { FactId, IdProvider, ImprintOptions, AttentionTier } from '../../activities/imprint.js';
import { imprint as imprintActivity } from '../../activities/imprint.js';
import type { SessionId } from '@akubly/types';
// RED: ../fact-writer-sqlite.ts does not exist until Crispin's GREEN phase.
import { SqliteFactWriter } from '../fact-writer-sqlite.js';
import { SqliteFactStore, applyMigrations } from '../../sqlite/index.js';
import {
  runFactWriterContract,
  type FactWriterHarness,
  type StoredFact,
} from './fact-writer-contract.helper.js';

// ---------------------------------------------------------------------------
// SqliteFactWriter harness factory
// ---------------------------------------------------------------------------
//
// SqliteFactWriter writes to the `facts` table via `INSERT OR IGNORE`.
// SqliteFactStore reads from the same table via FTS5 search.
// Both share the same `db` handle, guaranteeing they see the same data.
//
// readFact is a direct SQL SELECT — a side-channel that bypasses the activity
// layer entirely and reflects exactly what is stored in the database.

type FactRow = {
  fact_id: string;
  session_id: string;
  content: string;
  trust: number;
  importance: number;
  attention_tier: string;
  last_accessed: number | null;
  created_at: string;
};

function makeSqliteFactWriterHarness(): FactWriterHarness {
  const db = new Database(':memory:');
  applyMigrations(db);

  const writer = new SqliteFactWriter(db);
  const factStore = new SqliteFactStore(db);

  let counter = 0;
  const idProvider: IdProvider = {
    next: () => `fw-test-${String(++counter).padStart(4, '0')}` as FactId,
  };
  const clock = { now: () => 1_000_000 };

  const readFactStmt = db.prepare<[string, string], FactRow>(
    `SELECT fact_id, session_id, content, trust, importance, attention_tier, last_accessed, created_at
     FROM facts WHERE fact_id = ? AND session_id = ?`,
  );

  return {
    imprint: (options: ImprintOptions) =>
      imprintActivity(options, { factWriter: writer, clock, idProvider }),

    readFact: async (factId: FactId, sessionId: SessionId): Promise<StoredFact | null> => {
      const row = readFactStmt.get(factId as string, sessionId as string);
      if (!row) return null;
      return {
        factId: row.fact_id as FactId,
        sessionId: row.session_id as SessionId,
        content: row.content,
        trust: row.trust,
        importance: row.importance,
        attentionTier: row.attention_tier as AttentionTier,
        lastAccessed: row.last_accessed,
        createdAt: row.created_at,
      };
    },

    factStore,
    factWriter: writer,
    cleanup: () => db.close(),
  };
}

// ---------------------------------------------------------------------------
// Wire contract suite to SqliteFactWriter
// ---------------------------------------------------------------------------

runFactWriterContract('SqliteFactWriter', makeSqliteFactWriterHarness);
