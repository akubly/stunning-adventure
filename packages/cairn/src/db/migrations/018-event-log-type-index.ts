import type { Migration } from '../schema.js';

export const migration018: Migration = {
  version: 18,
  description: 'M3: add idx_event_log_type index on event_log(event_type) for disposition query performance',
  up(db) {
    // Guard: only create the index when event_log exists.  Partial-schema test
    // databases that seed schema_version at a version before 001/004 will not
    // have the table yet; applying migrations from that baseline must not fail.
    const tableExists = (
      db.prepare(
        `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='event_log'`,
      ).get() as { n: number }
    ).n > 0;

    if (!tableExists) {
      process.stderr.write(
        '[migration018] WARNING: event_log table not found — skipping CREATE INDEX.' +
          ' This is expected in partial-schema test databases but indicates a schema problem on a real DB.\n',
      );
      return;
    }

    // CREATE INDEX IF NOT EXISTS is natively idempotent in SQLite — safe to re-run.
    // The SqliteHintDispositionProvider WHERE clause filters on event_type first;
    // without this index every prescriber run pays O(all events) for the json_extract scan.
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);`,
    );
  },
};
