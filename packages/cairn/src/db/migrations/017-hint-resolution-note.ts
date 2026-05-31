import type { Migration } from '../schema.js';

export const migration017: Migration = {
  version: 17,
  description: 'M1: add resolution_note column to optimization_hints for MCP resolve tool',
  up(db) {
    // Guard: only add the column when optimization_hints exists. Partial-schema
    // test databases that seed schema_version at v14 and call applyMigrations()
    // will not have the table yet (migration 011 was skipped).
    const tableExists = (
      db.prepare(
        `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='optimization_hints'`,
      ).get() as { n: number }
    ).n > 0;

    if (!tableExists) return;

    // SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so
    // check PRAGMA first to remain idempotent.
    const cols = db.pragma('table_info(optimization_hints)') as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'resolution_note')) return;

    db.exec(`ALTER TABLE optimization_hints ADD COLUMN resolution_note TEXT;`);
  },
};
