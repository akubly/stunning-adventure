import { getDb } from './index.js';

/** Get the last processed event id (cursor position). */
export function getLastProcessedEventId(): number {
  const db = getDb();
  const row = db
    .prepare('SELECT last_processed_event_id FROM curator_state WHERE id = 1')
    .get() as { last_processed_event_id: number } | undefined;

  if (!row) {
    db.prepare(
      'INSERT OR IGNORE INTO curator_state (id, last_processed_event_id) VALUES (1, 0)',
    ).run();
    return 0;
  }
  return row.last_processed_event_id;
}

/** Advance the cursor after processing events. Only moves forward, never backward. */
export function advanceCursor(eventId: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE curator_state
     SET last_processed_event_id = ?, updated_at = datetime('now')
     WHERE id = 1 AND last_processed_event_id < ?`,
  ).run(eventId, eventId);
}
