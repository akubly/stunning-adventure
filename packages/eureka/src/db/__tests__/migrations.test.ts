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

  it('MIG-1: schema_version is 2 after applying both migrations', () => {
    const row = db
      .prepare('SELECT MAX(version) AS version FROM schema_version')
      .get() as { version: number };
    expect(row.version).toBe(2);
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
    expect(row.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// MIG-2: existing-row default backfill
//
// Verifies the "non-breaking defaults for existing rows" claim from D2.
// The beforeEach above applies both migrations before any insert, so this
// guarantee requires a standalone test that drives migrations one at a time.
// ---------------------------------------------------------------------------

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
