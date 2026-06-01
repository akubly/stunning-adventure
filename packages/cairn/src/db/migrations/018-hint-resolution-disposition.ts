import type { Migration } from '../schema.js';

export const migration018: Migration = {
  version: 18,
  description: 'M1: add resolution_disposition column to optimization_hints',
  up(db) {
    // Guard: only add the column when optimization_hints exists. Partial-schema
    // test databases that seed schema_version at an earlier version and call
    // applyMigrations() will not have the table yet (migration 011 was skipped).
    const tableExists = (
      db.prepare(
        `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='optimization_hints'`,
      ).get() as { n: number }
    ).n > 0;

    if (!tableExists) {
      process.stderr.write(
        '[migration018] WARNING: optimization_hints table not found — skipping ALTER TABLE.' +
          ' This is expected in partial-schema test databases but indicates a schema problem on a real DB.\n',
      );
      return;
    }

    // SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so
    // check PRAGMA first to remain idempotent.
    const cols = db.pragma('table_info(optimization_hints)') as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'resolution_disposition')) return;

    db.exec(
      `ALTER TABLE optimization_hints ADD COLUMN resolution_disposition TEXT` +
        ` CHECK (resolution_disposition IN ('resolved', 'dismissed'));`,
    );
  },
};
