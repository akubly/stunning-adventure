/**
 * Migration 015 — workdir-sessions
 *
 * PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
 * Until 015-workdir-sessions.ts migration exists, these tests will fail.
 *
 * Verifies that migration 015:
 *   - adds a nullable TEXT workdir column to the sessions table
 *   - retains NULL workdir for pre-existing rows (lazy backfill policy)
 *   - records version 15 in schema_version
 *   - is idempotent when applyMigrations() is called twice
 *
 * Pattern mirrors migration012.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getDb, closeDb } from '../db/index.js';
import { applyMigrations } from '../db/schema.js';

let db: ReturnType<typeof getDb>;

beforeEach(() => {
  closeDb();
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Migration 015 — apply
// ---------------------------------------------------------------------------

describe('migration 015 — apply', () => {
  it('applies cleanly to a fresh in-memory database (no error thrown)', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    expect(() => getDb(':memory:')).not.toThrow();
  });

  it('schema_version includes version 15', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    db = getDb(':memory:');
    const row = db.prepare('SELECT version FROM schema_version WHERE version = 15').get() as {
      version: number;
    } | undefined;
    expect(row?.version).toBe(15);
  });

  it('migration 015 description is recorded in schema_version', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    db = getDb(':memory:');
    const row = db
      .prepare('SELECT description FROM schema_version WHERE version = 15')
      .get() as { description: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.description).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Migration 015 — sessions.workdir column structure
// ---------------------------------------------------------------------------

describe('migration 015 — sessions.workdir column', () => {
  it('sessions table has a workdir column', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(sessions)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('workdir');
  });

  it('workdir column is nullable TEXT (notnull = 0)', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    // Nullable is required by the lazy-backfill policy: existing sessions keep NULL.
    db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(sessions)')
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const col = cols.find((c) => c.name === 'workdir')!;
    expect(col).toBeDefined();
    expect(col.type.toUpperCase()).toContain('TEXT');
    expect(col.notnull).toBe(0);
  });

  it('workdir column has no default expression (defaults to NULL)', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(sessions)')
      .all() as Array<{ name: string; dflt_value: string | null }>;
    const col = cols.find((c) => c.name === 'workdir')!;
    expect(col).toBeDefined();
    expect(col.dflt_value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Migration 015 — lazy NULL backfill
// ---------------------------------------------------------------------------

describe('migration 015 — lazy NULL backfill', () => {
  it('pre-migration rows retain workdir = NULL after upgrade', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    //
    // Decision: lazy backfill — existing sessions keep workdir = NULL.
    // Reproduces a v014 database, seeds two sessions, then upgrades.
    // Both rows must retain NULL (no retroactive population).
    const rawDb = new Database(':memory:');
    try {
      rawDb.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now')),
          description TEXT
        );
        INSERT INTO schema_version (version, description) VALUES (14, 'pre-015 test schema');
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          repo_key TEXT NOT NULL,
          branch TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          ended_at TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          session_kind TEXT NOT NULL DEFAULT 'user'
        );
        INSERT INTO sessions (id, repo_key, branch, session_kind)
          VALUES ('legacy-a', 'org/repo', 'main', 'user');
        INSERT INTO sessions (id, repo_key, branch, session_kind)
          VALUES ('legacy-b', 'org/repo', 'feat', 'user');
      `);

      applyMigrations(rawDb);

      const rows = rawDb
        .prepare('SELECT id, workdir FROM sessions ORDER BY id')
        .all() as Array<{ id: string; workdir: string | null }>;
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.workdir).toBeNull();
      }
    } finally {
      rawDb.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Migration 015 — idempotence
// ---------------------------------------------------------------------------

describe('migration 015 — idempotence', () => {
  it('calling applyMigrations() on an already-migrated DB does not throw', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    db = getDb(':memory:');
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it('schema_version still includes version 15 after a second applyMigrations() call', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    db = getDb(':memory:');
    applyMigrations(db);
    const row = db.prepare('SELECT version FROM schema_version WHERE version = 15').get() as {
      version: number;
    } | undefined;
    expect(row?.version).toBe(15);
  });
});
