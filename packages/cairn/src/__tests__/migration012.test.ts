/**
 * L1 — Migration 012 tests.
 *
 * Asserts that migration 012 (change_vectors table) applies cleanly to a fresh
 * database, creates the correct schema, and that re-running migrations is
 * idempotent.
 *
 * Pattern: mirrors the structure used for migration 011 tests in db.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { applyMigrations } from '../db/schema.js';

beforeEach(() => {
  closeDb();
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Migration 012 — apply
// ---------------------------------------------------------------------------

describe('migration 012 — apply', () => {
  it('applies cleanly to a fresh in-memory database (no error thrown)', () => {
    expect(() => getDb(':memory:')).not.toThrow();
  });

  it('schema_version table records the latest version after migration', () => {
    const db = getDb(':memory:');
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
      version: number;
    };
    expect(row.version).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Migration 012 — table structure
// ---------------------------------------------------------------------------

describe('migration 012 — change_vectors table structure', () => {
  it('table change_vectors exists in sqlite_master', () => {
    const db = getDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toContain('change_vectors');
  });

  it('change_vectors has all 10 expected columns', () => {
    const db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(change_vectors)')
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    const expected = [
      'id',
      'hint_id',
      'delta_drift',
      'delta_cost',
      'delta_success_rate',
      'delta_convergence',
      'delta_cache_hit',
      'net_impact',
      'sessions_observed',
      'computed_at',
    ];
    for (const col of expected) {
      expect(colNames).toContain(col);
    }
    expect(colNames.length).toBe(10);
  });

  it('id is the primary key (INTEGER PRIMARY KEY)', () => {
    const db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(change_vectors)')
      .all() as Array<{ name: string; pk: number; type: string }>;
    const idCol = cols.find((c) => c.name === 'id')!;
    expect(idCol).toBeDefined();
    expect(idCol.pk).toBe(1);
    expect(idCol.type.toUpperCase()).toContain('INTEGER');
  });

  it('hint_id is TEXT NOT NULL', () => {
    const db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(change_vectors)')
      .all() as Array<{ name: string; notnull: number; type: string }>;
    const hintIdCol = cols.find((c) => c.name === 'hint_id')!;
    expect(hintIdCol).toBeDefined();
    expect(hintIdCol.notnull).toBe(1);
    expect(hintIdCol.type.toUpperCase()).toContain('TEXT');
  });

  it('net_impact is REAL NOT NULL', () => {
    const db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(change_vectors)')
      .all() as Array<{ name: string; notnull: number; type: string }>;
    const col = cols.find((c) => c.name === 'net_impact')!;
    expect(col).toBeDefined();
    expect(col.notnull).toBe(1);
    expect(col.type.toUpperCase()).toContain('REAL');
  });

  it('sessions_observed is INTEGER NOT NULL', () => {
    const db = getDb(':memory:');
    const cols = db
      .prepare('PRAGMA table_info(change_vectors)')
      .all() as Array<{ name: string; notnull: number; type: string }>;
    const col = cols.find((c) => c.name === 'sessions_observed')!;
    expect(col).toBeDefined();
    expect(col.notnull).toBe(1);
    expect(col.type.toUpperCase()).toContain('INTEGER');
  });
});

// ---------------------------------------------------------------------------
// Migration 012 — indices
// ---------------------------------------------------------------------------

describe('migration 012 — indices', () => {
  it('index idx_change_vectors_impact exists on change_vectors', () => {
    const db = getDb(':memory:');
    const indices = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='change_vectors'",
      )
      .all() as Array<{ name: string }>;
    expect(indices.map((i) => i.name)).toContain('idx_change_vectors_impact');
  });

  it('exactly 1 explicit index exists on change_vectors (hint_id is covered by UNIQUE auto-index)', () => {
    const db = getDb(':memory:');
    // SQLite auto-creates indices for PRIMARY KEY and UNIQUE constraints — filter them out.
    // The UNIQUE(hint_id) constraint creates an implicit index that supersedes any
    // explicit idx_change_vectors_hint, so only idx_change_vectors_impact remains.
    const explicit = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='change_vectors' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as Array<{ name: string }>;
    expect(explicit.length).toBe(1);
    expect(explicit.map((i) => i.name)).toEqual(['idx_change_vectors_impact']);
  });

  it('UNIQUE(hint_id) auto-index covers hint_id lookups', () => {
    const db = getDb(':memory:');
    const autoIndices = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='change_vectors' AND name LIKE 'sqlite_autoindex_%'",
      )
      .all() as Array<{ name: string }>;
    expect(autoIndices.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Migration 012 — ON DELETE CASCADE on hint_id FK
// ---------------------------------------------------------------------------

describe('migration 012 — ON DELETE CASCADE on hint_id', () => {
  it('deleting an optimization_hint cascades to its change_vector', () => {
    const db = getDb(':memory:');
    db.prepare(
      `INSERT INTO optimization_hints (id, source, skill_id, category, description, recommendation, generated_at)
       VALUES ('hint-cascade-test', 'prompt-optimizer', 'skill-a', 'convergence', 'test', 'test', '2026-05-08T20:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO change_vectors (hint_id, delta_drift, delta_cost, delta_success_rate, delta_convergence, delta_cache_hit, net_impact, sessions_observed, computed_at)
       VALUES ('hint-cascade-test', 0, 0, 0, 0, 0, 0, 3, '2026-05-08T20:00:00.000Z')`,
    ).run();

    expect(() =>
      db.prepare(`DELETE FROM optimization_hints WHERE id = ?`).run('hint-cascade-test'),
    ).not.toThrow();

    const remaining = db
      .prepare('SELECT COUNT(*) as n FROM change_vectors WHERE hint_id = ?')
      .get('hint-cascade-test') as { n: number };
    expect(remaining.n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Migration 012 — UNIQUE constraint (Phase 4.6 cycle 2, Finding #4)
// ---------------------------------------------------------------------------

describe('migration 012 — UNIQUE(hint_id) constraint', () => {
  it('change_vectors enforces UNIQUE on hint_id — duplicate insert throws', () => {
    // ADR-P4.6-004: UNIQUE(hint_id) ensures at most one change vector per hint.
    // The sweep uses INSERT OR IGNORE to rely on the constraint for idempotence.
    const db = getDb(':memory:');
    // Insert a prerequisite hint so FK constraint is satisfied
    db.prepare(
      `INSERT INTO optimization_hints (id, source, skill_id, category, description, recommendation, generated_at)
       VALUES ('hint-unique-test', 'prompt-optimizer', 'skill-a', 'convergence', 'test', 'test', '2026-05-03T20:00:00.000Z')`
    ).run();
    db.prepare(
      `INSERT INTO change_vectors (hint_id, delta_drift, delta_cost, delta_success_rate, delta_convergence, delta_cache_hit, net_impact, sessions_observed, computed_at)
       VALUES ('hint-unique-test', 0, 0, 0, 0, 0, 0, 3, '2026-05-03T20:00:00.000Z')`
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO change_vectors (hint_id, delta_drift, delta_cost, delta_success_rate, delta_convergence, delta_cache_hit, net_impact, sessions_observed, computed_at)
         VALUES ('hint-unique-test', 0, 0, 0, 0, 0, 0, 5, '2026-05-03T21:00:00.000Z')`
      ).run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('INSERT OR IGNORE respects UNIQUE(hint_id) — duplicate is silently ignored', () => {
    const db = getDb(':memory:');
    db.prepare(
      `INSERT INTO optimization_hints (id, source, skill_id, category, description, recommendation, generated_at)
       VALUES ('hint-ignore-test', 'prompt-optimizer', 'skill-a', 'convergence', 'test', 'test', '2026-05-03T20:00:00.000Z')`
    ).run();
    db.prepare(
      `INSERT INTO change_vectors (hint_id, delta_drift, delta_cost, delta_success_rate, delta_convergence, delta_cache_hit, net_impact, sessions_observed, computed_at)
       VALUES ('hint-ignore-test', 0, 0, 0, 0, 0, 0, 3, '2026-05-03T20:00:00.000Z')`
    ).run();
    const result = db.prepare(
      `INSERT OR IGNORE INTO change_vectors (hint_id, delta_drift, delta_cost, delta_success_rate, delta_convergence, delta_cache_hit, net_impact, sessions_observed, computed_at)
       VALUES ('hint-ignore-test', 0, 0, 0, 0, 0, 0, 5, '2026-05-03T21:00:00.000Z')`
    ).run();
    expect(result.changes).toBe(0); // ignored, not inserted
    const rows = db.prepare('SELECT COUNT(*) as n FROM change_vectors WHERE hint_id = ?').get('hint-ignore-test') as { n: number };
    expect(rows.n).toBe(1); // only one row ever existed
  });
});

describe('migration 012 — idempotence', () => {
  it('calling applyMigrations() on an already-migrated DB does not throw', () => {
    const db = getDb(':memory:');
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it('schema_version is still latest after a second applyMigrations() call', () => {
    const db = getDb(':memory:');
    applyMigrations(db); // second call
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
      version: number;
    };
    expect(row.version).toBe(14);
  });
});
