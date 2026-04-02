import type { Migration } from '../schema.js';

export const migration004: Migration = {
  version: 4,
  description: 'Index on event_log(session_id, created_at) for getLastEventTime',
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_event_log_session_created
        ON event_log (session_id, created_at)
    `);
  },
};
