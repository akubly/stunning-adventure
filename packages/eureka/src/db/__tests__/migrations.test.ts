/**
 * Migration sequencing tests for the Eureka schema.
 *
 * ## Purpose
 *
 * Verify that migrations 001 and 002 apply cleanly in sequence, that the
 * attention-tier columns added by migration 002 carry correct defaults on
 * freshly-inserted rows, and that the CHECK constraint on `attention_tier`
 * rejects invalid values.
 *
 * ## Invariants locked
 *
 *   MIG-1  schema_version reaches 2 after applying both migrations
 *   MIG-2  row inserted after migration 001 and BEFORE migration 002 receives
 *          non-breaking defaults when 002 is subsequently applied:
 *          importance=0, last_accessed=NULL, attention_tier='warm'
 *   MIG-3  row inserted post-002 with only (fact_id, session_id, content, trust)
 *          carries identical defaults: importance=0, last_accessed=NULL, attention_tier='warm'
 *   MIG-4  CHECK rejects attention_tier values outside ('hot','warm','cold')
 *   MIG-5  valid non-default tier values ('hot', 'cold') are accepted
 *   MIG-6  applyMigrations is idempotent — calling twice raises no error
 *
 * All tests use :memory: databases (no disk I/O required).
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from '../schema.js';
import { migration001 } from '../migrations/001-facts.js';
import { migration002 } from '../migrations/002-facts-attention.js';
import { migration003 } from '../migrations/003-fact-relations.js';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Eureka schema migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MIG-1: schema_version reaches 2
  // ─────────────────────────────────────────────────────────────────────────

  it('MIG-1: schema_version is 3 after applying all migrations', () => {
    const row = db
      .prepare('SELECT MAX(version) AS version FROM schema_version')
      .get() as { version: number };
    expect(row.version).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MIG-2 / MIG-3: default column values on a freshly-inserted row
  //
  // Insert a row without specifying the migration-002 columns and assert that
  // SQLite's DEFAULT clauses produce exactly the values that SqliteFactStore
  // currently hard-codes in the Slice-C gap.
  // ─────────────────────────────────────────────────────────────────────────

  it('MIG-3: freshly-inserted row carries correct defaults (importance=0, last_accessed=NULL, attention_tier=warm)', () => {
    db.prepare(
      `INSERT INTO facts (fact_id, session_id, content, trust)
       VALUES ('f-defaults', 'session-1', 'hello world', 0.9)`,
    ).run();

    const row = db
      .prepare(
        `SELECT importance, last_accessed, attention_tier
         FROM facts WHERE fact_id = 'f-defaults'`,
      )
      .get() as {
      importance: number;
      last_accessed: number | null;
      attention_tier: string;
    };

    // importance=0 → compositeScore importance term = 0 (Slice-C hard-coded default)
    expect(row.importance).toBe(0);
    // last_accessed=NULL → compositeScore uses Infinity tDays → recency floors to 0.1 (F3)
    expect(row.last_accessed).toBeNull();
    // attention_tier='warm' → ATTENTION_MULTIPLIERS['warm'] = 1.0 (identity multiplier)
    expect(row.attention_tier).toBe('warm');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MIG-4: CHECK constraint rejects invalid attention_tier
  //
  // Any tier string outside ('hot','warm','cold') must be rejected at INSERT
  // time via the SQL CHECK constraint.
  // ─────────────────────────────────────────────────────────────────────────

  it('MIG-4: CHECK rejects invalid attention_tier value', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO facts (fact_id, session_id, content, trust, attention_tier)
         VALUES ('f-bad-tier', 'session-1', 'test', 0.5, 'lukewarm')`,
      ).run();
    }).toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MIG-5: valid non-default tier values are accepted
  // ─────────────────────────────────────────────────────────────────────────

  it('MIG-5: valid tiers hot and cold are accepted', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO facts (fact_id, session_id, content, trust, attention_tier)
         VALUES ('f-hot', 'session-1', 'hot fact', 0.9, 'hot')`,
      ).run();
    }).not.toThrow();

    expect(() => {
      db.prepare(
        `INSERT INTO facts (fact_id, session_id, content, trust, attention_tier)
         VALUES ('f-cold', 'session-1', 'cold fact', 0.9, 'cold')`,
      ).run();
    }).not.toThrow();

    const hot = db
      .prepare(`SELECT attention_tier FROM facts WHERE fact_id = 'f-hot'`)
      .get() as { attention_tier: string };
    const cold = db
      .prepare(`SELECT attention_tier FROM facts WHERE fact_id = 'f-cold'`)
      .get() as { attention_tier: string };

    expect(hot.attention_tier).toBe('hot');
    expect(cold.attention_tier).toBe('cold');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MIG-6: applyMigrations is idempotent
  //
  // Mirrors DB-CL-3 (fact-reader-sqlite-edges) — calling applyMigrations a
  // second time on the same DB must not throw or duplicate schema objects.
  // ─────────────────────────────────────────────────────────────────────────

  it('MIG-6: applyMigrations is idempotent — second call does not throw', () => {
    expect(() => applyMigrations(db)).not.toThrow();

    const row = db
      .prepare('SELECT MAX(version) AS version FROM schema_version')
      .get() as { version: number };
    expect(row.version).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MIG-7..MIG-12 — Migration 003 (fact_relations) substrate
  // ─────────────────────────────────────────────────────────────────────────

  // MIG-7: happy-path insert into fact_relations + DEFAULT columns surface
  it('MIG-7: fact_relations row inserted with only required columns carries weight=1.0, confidence=1.0, created_at default', () => {
    db.prepare(
      `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
       VALUES ('f-from', 'f-to', 'duplicate_of', 'session-mig7')`,
    ).run();

    const row = db
      .prepare(
        `SELECT weight, confidence, created_at
         FROM fact_relations
         WHERE from_fact_id = 'f-from' AND to_fact_id = 'f-to' AND relation_kind = 'duplicate_of' AND session_id = 'session-mig7'`,
      )
      .get() as { weight: number; confidence: number; created_at: string };

    expect(row.weight).toBe(1.0);
    expect(row.confidence).toBe(1.0);
    expect(typeof row.created_at).toBe('string');
    expect(row.created_at.length).toBeGreaterThan(0);
  });

  // MIG-8: CHECK constraint rejects unknown relation_kind
  it('MIG-8: CHECK rejects unknown relation_kind values', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
         VALUES ('a', 'b', 'related_to', 'session-mig8')`,
      ).run();
    }).toThrow();
  });

  // MIG-9: all four locked relation_kind values are accepted
  it('MIG-9: all four locked relation_kind values (duplicate_of, supersedes, contradicts, supports) are accepted', () => {
    const kinds: ReadonlyArray<string> = ['duplicate_of', 'supersedes', 'contradicts', 'supports'];
    for (const k of kinds) {
      expect(() => {
        db.prepare(
          `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
           VALUES (?, ?, ?, 'session-mig9')`,
        ).run(`from-${k}`, `to-${k}`, k);
      }).not.toThrow();
    }

    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM fact_relations WHERE session_id = 'session-mig9'`)
      .get() as { c: number };
    expect(count.c).toBe(4);
  });

  // MIG-10: UNIQUE(session_id, from_fact_id, to_fact_id, relation_kind) rejects duplicate raw INSERT
  //         (idempotency at the writer layer is via ON CONFLICT … DO NOTHING; the
  //          raw INSERT here intentionally bypasses that to verify the constraint).
  it('MIG-10: UNIQUE constraint rejects duplicate (session, from, to, kind) on raw INSERT', () => {
    db.prepare(
      `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
       VALUES ('a', 'b', 'duplicate_of', 'session-mig10')`,
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
         VALUES ('a', 'b', 'duplicate_of', 'session-mig10')`,
      ).run();
    }).toThrow();
  });

  // MIG-11: same (from, to) with different relation_kind both persist (UNIQUE includes kind)
  it('MIG-11: same (from, to) with different relation_kind both persist (UNIQUE includes kind)', () => {
    db.prepare(
      `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
       VALUES ('a', 'b', 'duplicate_of', 'session-mig11')`,
    ).run();
    expect(() => {
      db.prepare(
        `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
         VALUES ('a', 'b', 'supports', 'session-mig11')`,
      ).run();
    }).not.toThrow();

    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM fact_relations WHERE session_id = 'session-mig11'`)
      .get() as { c: number };
    expect(count.c).toBe(2);
  });

  // MIG-12: predicate indices exist (cheap 1-hop traversal in either direction)
  it('MIG-12: both predicate indices exist on fact_relations', () => {
    const indices = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND tbl_name = 'fact_relations' AND name LIKE 'idx_%'`,
      )
      .all() as Array<{ name: string }>;

    const names = indices.map(i => i.name);
    expect(names).toContain('idx_fact_relations_from');
    expect(names).toContain('idx_fact_relations_to');
  });
});

// ---------------------------------------------------------------------------
// MIG-2: existing-row default backfill
//
// Verifies the "non-breaking defaults for existing rows" claim from D2.
// The beforeEach above applies both migrations before any insert, so this
// guarantee requires a standalone test that drives migrations one at a time.
// ---------------------------------------------------------------------------

// MIG-13: migration 003 applies cleanly after 001 + 002 — standalone, mirrors MIG-2
describe('MIG-13: migration 003 applies cleanly after 001 + 002 (stepwise)', () => {
  it('MIG-13: applying 001, 002, 003 in sequence yields a usable fact_relations table', () => {
    const testDb = new Database(':memory:');
    try {
      migration001.up(testDb);
      migration002.up(testDb);
      migration003.up(testDb);

      // Smoke insert proves the table + CHECK + defaults all wired through stepwise.
      testDb
        .prepare(
          `INSERT INTO fact_relations (from_fact_id, to_fact_id, relation_kind, session_id)
           VALUES ('x', 'y', 'duplicate_of', 'session-mig13')`,
        )
        .run();

      const row = testDb
        .prepare(`SELECT relation_kind FROM fact_relations WHERE session_id = 'session-mig13'`)
        .get() as { relation_kind: string };
      expect(row.relation_kind).toBe('duplicate_of');
    } finally {
      testDb.close();
    }
  });
});

describe('MIG-2: existing-row default backfill when 002 is applied after an insert', () => {
  it('MIG-2: row inserted after 001 and before 002 receives non-breaking defaults', () => {
    const testDb = new Database(':memory:');
    try {
      // Step 1: apply only migration 001 (facts table + FTS, no attention columns).
      migration001.up(testDb);

      // Step 2: insert a row using only the columns that exist after 001.
      testDb
        .prepare(
          `INSERT INTO facts (fact_id, session_id, content, trust)
           VALUES ('pre-002', 'session-backfill', 'existing row', 0.7)`,
        )
        .run();

      // Step 3: apply migration 002 (adds importance, last_accessed, attention_tier).
      migration002.up(testDb);

      // Step 4: pre-existing row must carry the non-breaking defaults from D2.
      const row = testDb
        .prepare(
          `SELECT importance, last_accessed, attention_tier
           FROM facts WHERE fact_id = 'pre-002'`,
        )
        .get() as { importance: number; last_accessed: number | null; attention_tier: string };

      // importance=0 → compositeScore importance term = 0 (matches Slice-C hard-coded default)
      expect(row.importance).toBe(0);
      // last_accessed=NULL → tDays=Infinity → recency floors to 0.1 (F3)
      expect(row.last_accessed).toBeNull();
      // attention_tier='warm' → ATTENTION_MULTIPLIERS['warm'] = 1.0 (identity multiplier)
      expect(row.attention_tier).toBe('warm');
    } finally {
      testDb.close();
    }
  });
});
