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
import { InMemoryFactReader } from '../fact-reader-inmemory.js';
import { SqliteFactReader, applyMigrations } from '../../sqlite/index.js';
import { runFactReaderContract } from './fact-reader-contract.helper.js';
import { epochMsToSqliteDateTime } from '../datetime.js';

// ---------------------------------------------------------------------------
// Wire contract suite to InMemoryFactReader
// ---------------------------------------------------------------------------

// Wires InMemoryFactReader (production module) into the shared contract suite for parity with SqliteFactReader.
runFactReaderContract('InMemoryFactReader', () => {
  const impl = new InMemoryFactReader();
  return {
    reader: impl,
    seed: async (factId, sessionId, trust, content, createdAt) => {
      impl.seed(factId, sessionId, trust, content, createdAt);
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
    // Wave-2: created_at is explicit so CL-7 can assert on a specific epoch ms.
    'INSERT OR REPLACE INTO facts (fact_id, session_id, trust, content, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const reader = new SqliteFactReader(db);
  return {
    reader,
    seed: async (factId: string, sessionId: SessionId, trust: number, content?: string, createdAt?: number) => {
      // Map NaN → NULL for storage (CL-4 round-trip: NULL re-hydrates as NaN on read).
      const stored = Number.isNaN(trust) ? null : trust;
      const createdAtTxt =
        createdAt !== undefined
          ? epochMsToSqliteDateTime(createdAt)
          : epochMsToSqliteDateTime(Date.now());
      insertStmt.run(factId, sessionId, stored, content ?? '', createdAtTxt);
    },
    cleanup: () => db.close(),
  };
});

