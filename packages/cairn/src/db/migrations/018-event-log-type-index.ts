import type { Migration } from '../schema.js';

export const migration018: Migration = {
  version: 18,
  description: 'M3: add idx_event_log_type index on event_log(event_type) for disposition query performance',
  up(db) {
    // Guard: only create the index when event_log exists.
    //
    // event_log is created unconditionally in migration 001 and indexed in
    // migration 004 on every real cairn database.  The ONLY scenario where it
    // is absent here is a partial-schema test database that seeds schema_version
    // to a value ≥ 18 without running the full migration chain from scratch
    // (see e.g. migration015.test.ts).  On those test DBs the skip is correct
    // and expected — the index is unnecessary because the test DB has no events.
    //
    // On a real DB this branch is unreachable: if event_log were somehow missing
    // the stderr warning below gives an observable signal for diagnosis.
    const tableExists = (
      db.prepare(
        `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='event_log'`,
      ).get() as { n: number }
    ).n > 0;

    if (!tableExists) {
      process.stderr.write(
        '[migration018] WARNING: event_log table not found — skipping CREATE INDEX.' +
          ' This is expected in partial-schema test databases but must never occur on a real DB' +
          ' (event_log is guaranteed present from migration 001).\n',
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
