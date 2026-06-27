/**
 * SQLite-specific edge-case regression tests for SqliteFactReader.
 *
 * ## Purpose
 *
 * These tests cover failure modes unique to SQLite storage that the
 * cross-impl contract suite (fact-reader.contract.test.ts) cannot cover:
 * disk persistence, schema constraint enforcement, migration idempotence,
 * WAL checkpoint behavior, and boundary values that BM25/REAL can mishandle.
 *
 * ## Invariants locked
 *
 *   DB-CL-1  NaN round-trip through disk  (close+reopen, cold-read asserts NaN)
 *   DB-CL-2  UNIQUE(fact_id, session_id)  (raw INSERT of duplicate must throw)
 *   DB-CL-3  applyMigrations idempotence  (calling twice must not duplicate schema)
 *   DB-CL-4  WAL persistence              (fact survives db.close() + reopen)
 *   DB-CL-5  Boundary values              (empty content + trust=0 round-trip cleanly)
 *   DB-CL-6  Concurrent first-open race   (two handles, applyMigrations twice → schema_version=1, no error)
 *   DB-CL-7  M3 seed-twice (INSERT OR REPLACE)  (seed same (fact_id, session_id) twice must not throw)
 *
 * Each test uses a unique on-disk temp file (not :memory:) via os.tmpdir().
 * afterEach cleans up .db, .db-shm, and .db-wal files.
 */

import { describe, it, afterEach, expect } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { rmSync, existsSync } from 'node:fs';
import type { SessionId } from '@akubly/types';
import { applyMigrations } from '../../db/schema.js';
import { SqliteFactReader } from '../fact-reader-sqlite.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unique on-disk path for a test DB. Registered for afterEach cleanup. */
function tempDbPath(registry: string[]): string {
  const p = join(tmpdir(), `eureka-edges-${randomBytes(6).toString('hex')}.db`);
  registry.push(p);
  return p;
}

/** Open a DB with WAL mode (mirrors openDatabase.ts). */
function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  applyMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SqliteFactReader — SQLite-specific edge cases', () => {
  const dbPaths: string[] = [];

  afterEach(() => {
    for (const p of dbPaths) {
      for (const suffix of ['', '-shm', '-wal']) {
        const candidate = p + suffix;
        if (existsSync(candidate)) rmSync(candidate);
      }
    }
    dbPaths.length = 0;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DB-CL-1: NaN round-trip through disk
  //
  // Write a fact whose trust is NULL (the SQLite sentinel for NaN), close the
  // DB to flush the WAL, reopen a cold connection, read the fact back.
  // Assert Number.isNaN(result.trust).
  //
  // This is the disk-persistence complement to CL-4. CL-4 verifies the
  // in-session write/read cycle; DB-CL-1 verifies that the NULL→NaN
  // re-hydration path in SqliteFactReader works on a cold-open connection —
  // ruling out any warm-connection caching that would mask a missing re-hydration.
  //
  // We insert NULL directly (bypassing the NaN→null conversion in the seed
  // helper) so the test does not depend on the write path being correct.
  // ─────────────────────────────────────────────────────────────────────────
  it('DB-CL-1: NaN trust round-trips through disk — NULL persists and is re-hydrated as NaN on cold open', async () => {
    const dbPath = tempDbPath(dbPaths);
    const sessionId = 'session-nan-disk' as SessionId;

    // Write phase: insert NULL sentinel, then close (WAL checkpoint).
    {
      const db = openDb(dbPath);
      db.prepare(
        'INSERT INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
      ).run('fact-nan-disk', sessionId, 'nan-content', null);
      db.close();
    }

    // Read phase: cold-open, no shared state with write phase.
    {
      const db = openDb(dbPath);
      const reader = new SqliteFactReader(db);
      const result = await reader.read({ factId: 'fact-nan-disk', sessionId });
      expect(result).not.toBeNull();
      expect(Number.isNaN(result!.trust)).toBe(true);
      db.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DB-CL-2: UNIQUE(fact_id, session_id) constraint is enforced
  //
  // Insert the same (fact_id, session_id) pair twice via raw SQL.
  // The second INSERT must throw a UNIQUE constraint violation.
  // Confirms the constraint from migration 001 is actually present —
  // a migration bug that omitted it would let duplicates accumulate silently,
  // making reader.read() return arbitrary rows.
  // ─────────────────────────────────────────────────────────────────────────
  it('DB-CL-2: UNIQUE(fact_id, session_id) violation — inserting duplicate pair via raw INSERT throws', () => {
    const dbPath = tempDbPath(dbPaths);
    const db = openDb(dbPath);

    const insert = db.prepare(
      'INSERT INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
    );
    insert.run('fact-dup', 'session-a', 'first-content', 0.5);

    expect(() => insert.run('fact-dup', 'session-a', 'second-content', 0.7)).toThrow(
      /UNIQUE constraint failed/i,
    );

    db.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DB-CL-3: applyMigrations is idempotent
  //
  // Call applyMigrations twice on the same DB. Neither call may throw.
  // MAX(schema_version.version) must equal 1 — migration 001 was recorded
  // exactly once, not twice. The `facts` table must appear exactly once in
  // sqlite_master. This locks the "apply on every open" usage pattern:
  // openDatabase.ts calls applyMigrations each time it opens a DB handle.
  // ─────────────────────────────────────────────────────────────────────────
  it('DB-CL-3: applyMigrations is idempotent — calling twice does not throw or duplicate schema', () => {
    const dbPath = tempDbPath(dbPaths);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // First call: creates schema_version, runs migrations 001 + 002 + 003.
    expect(() => applyMigrations(db)).not.toThrow();

    // Second call: all migrations have version ≤ MAX(version), must be a no-op.
    expect(() => applyMigrations(db)).not.toThrow();

    const vRow = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
      v: number;
    };
    expect(vRow.v).toBe(3);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facts'")
      .all();
    expect(tables).toHaveLength(1);

    db.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DB-CL-4: WAL persistence — fact survives close + reopen
  //
  // Write a fact, close the DB (triggering WAL checkpoint), reopen with a
  // fresh Database() handle, read the fact back. Must still be present.
  // Confirms SqliteFactReader does not accidentally use :memory: and that
  // WAL checkpoint behavior does not lose data between sessions.
  // ─────────────────────────────────────────────────────────────────────────
  it('DB-CL-4: WAL persistence — fact written before db.close() is readable after reopen', async () => {
    const dbPath = tempDbPath(dbPaths);
    const sessionId = 'session-wal-persist' as SessionId;

    // Write + close.
    {
      const db = openDb(dbPath);
      db.prepare(
        'INSERT INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
      ).run('fact-wal', sessionId, 'wal-content', 0.6);
      db.close();
    }

    // Cold reopen — independent connection, no shared in-memory state.
    {
      const db = openDb(dbPath);
      const reader = new SqliteFactReader(db);
      const result = await reader.read({ factId: 'fact-wal', sessionId });
      expect(result).not.toBeNull();
      expect(result!.trust).toBeCloseTo(0.6);
      db.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DB-CL-5: Boundary values — empty content and trust=0
  //
  // SQLite REAL and BM25/FTS5 can behave unexpectedly at zero/empty boundaries:
  //   - trust=0: implementations that guard `if (row.trust)` instead of
  //     `if (row.trust !== null)` will map 0 → NaN silently. This test
  //     distinguishes trust=0 from NULL.
  //   - content='': a valid empty string that the FTS5 index must accept
  //     without error (empty token set, not a NULL violation).
  //
  // Locking these values now prevents Slice C (FTS5 BM25 integration) from
  // encountering surprising behavior when zero-trust or empty-content facts
  // are already in the store.
  // ─────────────────────────────────────────────────────────────────────────
  it('DB-CL-5: empty content and trust=0 boundary values round-trip without corruption', async () => {
    const dbPath = tempDbPath(dbPaths);
    const sessionId = 'session-boundary' as SessionId;

    const db = openDb(dbPath);
    db.prepare(
      'INSERT INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
    ).run('fact-zero', sessionId, '', 0);

    const reader = new SqliteFactReader(db);
    const result = await reader.read({ factId: 'fact-zero', sessionId });

    expect(result).not.toBeNull();
    // trust=0 must NOT be treated as NULL/falsy → NaN.
    expect(result!.trust).toBe(0);
    expect(Number.isNaN(result!.trust)).toBe(false);

    db.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DB-CL-6: Concurrent first-open race
  //
  // Open two Database handles to the same file and call applyMigrations on
  // each in sequence. The second call must not throw and must not insert a
  // duplicate schema_version row.
  //
  // In a single-threaded process, better-sqlite3 serializes the two
  // .immediate() transactions sequentially. The first wins the IMMEDIATE
  // lock, applies migration 001, and records schema_version=1. The second
  // reads currentVersion=1 and finds no pending migrations (1 > 1 is false),
  // so it exits cleanly. Result: schema_version has exactly one row (version=1).
  //
  // This locks the IMMEDIATE + IF NOT EXISTS fix (I5) against the migration
  // race described in the Architect findings.
  // ─────────────────────────────────────────────────────────────────────────
  it('DB-CL-6: concurrent first-open race — two handles + applyMigrations twice yields schema_version=1 and no error', () => {
    const dbPath = tempDbPath(dbPaths);

    const db1 = new Database(dbPath);
    db1.pragma('journal_mode = WAL');

    const db2 = new Database(dbPath);
    db2.pragma('journal_mode = WAL');

    // First open: creates schema_version table and applies migrations 001 + 002.
    // First open: creates schema_version table and applies migrations 001 + 002 + 003.
    expect(() => applyMigrations(db1)).not.toThrow();

    // Second open (simulates the losing racer): reads version=3, no-ops.
    expect(() => applyMigrations(db2)).not.toThrow();

    // schema_version must have exactly three rows — one per migration, never duplicated.
    const count = db1.prepare('SELECT COUNT(*) AS c FROM schema_version').get() as { c: number };
    expect(count.c).toBe(3);

    const vRow = db1.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
      v: number;
    };
    expect(vRow.v).toBe(3);

    db1.close();
    db2.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DB-CL-7 (M3): harness seed-twice — INSERT OR REPLACE semantics
  //
  // The SQLite contract harness uses INSERT OR REPLACE so that seeding the
  // same (fact_id, session_id) twice is an upsert, not an error. This matches
  // InMemoryFactReader's seed() semantics (M3 finding fix).
  //
  // Calling seed twice with the same pair must NOT throw; the second call
  // overwrites the first. The reader returns the most-recently-seeded trust.
  // ─────────────────────────────────────────────────────────────────────────
  it('DB-CL-7 (M3): seeding same (fact_id, session_id) twice via INSERT OR REPLACE does not throw and last value wins', async () => {
    const db = new Database(':memory:');
    applyMigrations(db);

    const insertStmt = db.prepare(
      'INSERT OR REPLACE INTO facts (fact_id, session_id, trust) VALUES (?, ?, ?)',
    );
    const sessionId = 'session-seed-twice' as SessionId;

    expect(() => insertStmt.run('fact-m3', sessionId, 0.3)).not.toThrow();
    expect(() => insertStmt.run('fact-m3', sessionId, 0.7)).not.toThrow();

    const reader = new SqliteFactReader(db);
    const result = await reader.read({ factId: 'fact-m3', sessionId });
    expect(result).not.toBeNull();
    expect(result!.trust).toBeCloseTo(0.7);

    db.close();
  });
});
