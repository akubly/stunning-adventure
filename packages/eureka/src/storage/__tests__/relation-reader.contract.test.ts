/**
 * RelationReader candidateIds contract tests.
 *
 * ## Spec
 *
 * `RelationReader.listDuplicateOf` MUST respect `candidateIds` as follows:
 *
 *   RR-CIDS-1  candidateIds=undefined → full session scan (backward compat)
 *   RR-CIDS-2  candidateIds=[]        → return [] immediately (no edges possible)
 *   RR-CIDS-3  candidateIds=[match]   → only edges where `from` ∈ candidateIds
 *   RR-CIDS-4  candidateIds=[no-match] → return [] (no matching edges)
 *   RR-CIDS-5  session isolation      → edges from other session NOT returned
 *
 * Tested for both InMemoryRelationReader and SqliteRelationReader.
 *
 * @internal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SessionId, FactId } from '@akubly/types';
import { InMemoryRelationWriter } from '../relation-writer.js';
import { InMemoryRelationReader } from '../relation-reader-inmemory.js';
import { SqliteRelationReader } from '../relation-reader-sqlite.js';
import { openDatabase } from '../../db/openDatabase.js';
import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Shared test matrix — run against both implementations
// ---------------------------------------------------------------------------

type ReaderHarness = {
  listDuplicateOf: (args: {
    sessionId: SessionId;
    candidateIds?: ReadonlyArray<FactId>;
  }) => Promise<ReadonlyArray<{ from: FactId; to: FactId }>>;
  seedEdge: (sessionId: SessionId, from: FactId, to: FactId) => Promise<void>;
};

function runReaderContract(implName: string, make: () => Promise<ReaderHarness>): void {
  describe(`RelationReader candidateIds contract — ${implName}`, () => {
    let h: ReaderHarness;

    beforeEach(async () => { h = await make(); });

    const SESSION_A = 'rr-session-A' as SessionId;
    const SESSION_B = 'rr-session-B' as SessionId;
    const FROM_1   = 'rr-from-1'   as FactId;
    const FROM_2   = 'rr-from-2'   as FactId;
    const TO_1     = 'rr-to-1'     as FactId;

    it('RR-CIDS-1: candidateIds=undefined returns all session edges', async () => {
      await h.seedEdge(SESSION_A, FROM_1, TO_1);
      await h.seedEdge(SESSION_A, FROM_2, TO_1);

      const edges = await h.listDuplicateOf({ sessionId: SESSION_A });
      const froms = edges.map(e => e.from as string);
      expect(froms).toContain(FROM_1 as string);
      expect(froms).toContain(FROM_2 as string);
    });

    it('RR-CIDS-2: candidateIds=[] returns [] (no candidates to restrict to)', async () => {
      await h.seedEdge(SESSION_A, FROM_1, TO_1);

      const edges = await h.listDuplicateOf({ sessionId: SESSION_A, candidateIds: [] });
      expect(edges).toHaveLength(0);
    });

    it('RR-CIDS-3: candidateIds=[matching] returns only edges whose from is in the set', async () => {
      await h.seedEdge(SESSION_A, FROM_1, TO_1);
      await h.seedEdge(SESSION_A, FROM_2, TO_1);

      const edges = await h.listDuplicateOf({ sessionId: SESSION_A, candidateIds: [FROM_1] });
      expect(edges).toHaveLength(1);
      expect(edges[0].from).toBe(FROM_1);
    });

    it('RR-CIDS-4: candidateIds=[non-matching] returns []', async () => {
      await h.seedEdge(SESSION_A, FROM_1, TO_1);

      const edges = await h.listDuplicateOf({
        sessionId: SESSION_A,
        candidateIds: ['rr-unrelated' as FactId],
      });
      expect(edges).toHaveLength(0);
    });

    it('RR-CIDS-5: session isolation — edges from SESSION_B not returned for SESSION_A', async () => {
      await h.seedEdge(SESSION_B, FROM_1, TO_1); // different session

      const edges = await h.listDuplicateOf({ sessionId: SESSION_A });
      expect(edges).toHaveLength(0);
    });
  });
}

// ---------------------------------------------------------------------------
// InMemoryRelationReader wiring
// ---------------------------------------------------------------------------

runReaderContract('InMemoryRelationReader', async () => {
  const writer = new InMemoryRelationWriter(() => 1_700_000_000_000);
  const reader = new InMemoryRelationReader(writer);
  return {
    listDuplicateOf: (args) => reader.listDuplicateOf(args),
    seedEdge: async (sessionId, from, to) => {
      await writer.link({
        fromFactId: from,
        toFactId:   to,
        relationKind: 'duplicate_of',
        sessionId,
      });
    },
  };
});

// ---------------------------------------------------------------------------
// SqliteRelationReader wiring
// ---------------------------------------------------------------------------

describe('RelationReader candidateIds contract — SqliteRelationReader', () => {
  let db: Database.Database;

  beforeEach(() => { db = openDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  runReaderContract('SqliteRelationReader (inline)', async () => {
    const reader = new SqliteRelationReader(db);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO fact_relations (session_id, from_fact_id, to_fact_id, relation_kind) VALUES (?, ?, ?, 'duplicate_of')",
    );
    return {
      listDuplicateOf: (args) => reader.listDuplicateOf(args),
      seedEdge: async (sessionId, from, to) => {
        insert.run(sessionId as string, from as string, to as string);
      },
    };
  });
});
