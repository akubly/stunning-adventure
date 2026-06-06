/**
 * FactReader contract test suite — implementation wirings.
 *
 * ## Design
 *
 * This file wires concrete implementations into the shared contract helper.
 * The helper definition (runFactReaderContract + FactReaderHarness) lives in:
 *   ./fact-reader-contract.helper.ts
 *
 * Each call to runFactReaderContract adds 5 tests (CL-1 through CL-5).
 * InMemoryFactReader wired below → 5 contract tests.
 * SqliteFactReader wired below   → 5 contract tests.
 * Total: 10
 */

import Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import { InMemoryFactReader } from '../fact-reader.js';
import { SqliteFactReader, applyMigrations } from '../../sqlite/index.js';
import { runFactReaderContract } from './fact-reader-contract.helper.js';

// ---------------------------------------------------------------------------
// Wire contract suite to InMemoryFactReader
// ---------------------------------------------------------------------------

// Wires InMemoryFactReader (production module) into the shared contract suite for parity with SqliteFactReader.
runFactReaderContract('InMemoryFactReader', () => {
  const impl = new InMemoryFactReader();
  return {
    reader: impl,
    seed: async (factId, sessionId, trust) => {
      impl.seed(factId, sessionId, trust);
    },
  };
});

// ---------------------------------------------------------------------------
// Wire contract suite to SqliteFactReader
// ---------------------------------------------------------------------------

runFactReaderContract('SqliteFactReader', () => {
  const db = new Database(':memory:');
  applyMigrations(db);
  const insertStmt = db.prepare(
    // INSERT OR REPLACE matches InMemoryFactReader's upsert seed semantics (M3).
    'INSERT OR REPLACE INTO facts (fact_id, session_id, trust) VALUES (?, ?, ?)',
  );
  const reader = new SqliteFactReader(db);
  return {
    reader,
    seed: async (factId: string, sessionId: SessionId, trust: number) => {
      // Map NaN → NULL for storage (CL-4 round-trip: NULL re-hydrates as NaN on read).
      const stored = Number.isNaN(trust) ? null : trust;
      // content omitted — defaults to '' per schema; FactReader.read() does not surface content
      insertStmt.run(factId, sessionId, stored);
    },
    cleanup: () => db.close(),
  };
});

