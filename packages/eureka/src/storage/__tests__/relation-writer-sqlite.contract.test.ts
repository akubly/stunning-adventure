/**
 * RelationWriter contract test suite — SqliteRelationWriter wiring.
 *
 * Adds 24 tests via runRelationWriterContract. Uses :memory: SQLite per test
 * with migrations applied (matches the SqliteFactWriter wiring pattern).
 */

import Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import type { RelationKind } from '../../representation/relation.js';
import { SqliteRelationWriter } from '../relation-writer-sqlite.js';
import { applyMigrations } from '../../sqlite/index.js';
import {
  runRelationWriterContract,
  type RelationWriterHarness,
} from './relation-writer-contract.helper.js';
import type { StoredRelation } from '../relation-writer.js';

type RelationRow = {
  from_fact_id: string;
  to_fact_id: string;
  relation_kind: string;
  session_id: string;
  weight: number;
  confidence: number;
  created_at: string;
};

function rowToStored(row: RelationRow): StoredRelation {
  return {
    fromFactId: row.from_fact_id,
    toFactId: row.to_fact_id,
    relationKind: row.relation_kind as RelationKind,
    sessionId: row.session_id,
    weight: row.weight,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

function makeSqliteRelationWriterHarness(): RelationWriterHarness {
  const db = new Database(':memory:');
  applyMigrations(db);

  const writer = new SqliteRelationWriter(db);

  const readStmt = db.prepare<[string, string, string, string], RelationRow>(
    `SELECT from_fact_id, to_fact_id, relation_kind, session_id, weight, confidence, created_at
     FROM fact_relations
     WHERE from_fact_id = ? AND to_fact_id = ? AND relation_kind = ? AND session_id = ?`,
  );

  const listStmt = db.prepare<[string], RelationRow>(
    `SELECT from_fact_id, to_fact_id, relation_kind, session_id, weight, confidence, created_at
     FROM fact_relations
     WHERE session_id = ?
     ORDER BY id ASC`,
  );

  return {
    writer,
    readRelation: async (args) => {
      const row = readStmt.get(
        args.fromFactId,
        args.toFactId,
        args.relationKind,
        args.sessionId as string,
      );
      return row ? rowToStored(row) : null;
    },
    listBySession: async (sessionId: SessionId) =>
      listStmt.all(sessionId as string).map(rowToStored),
    cleanup: () => db.close(),
  };
}

runRelationWriterContract('SqliteRelationWriter', makeSqliteRelationWriterHarness);
