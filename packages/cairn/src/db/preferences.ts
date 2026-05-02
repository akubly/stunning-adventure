import { getDb } from './index.js';

/**
 * Get a preference value using the cascade: session → user → system.
 * Returns the first match, or undefined if not set at any level.
 */
export function getPreference(key: string, sessionId?: string): string | undefined {
  const db = getDb();

  if (sessionId) {
    const row = db
      .prepare('SELECT value FROM preferences WHERE key = ? AND scope = ? AND session_id = ?')
      .get(key, 'session', sessionId) as { value: string } | undefined;
    if (row) return row.value;
  }

  const userRow = db
    .prepare('SELECT value FROM preferences WHERE key = ? AND scope = ? AND session_id = ?')
    .get(key, 'user', '') as { value: string } | undefined;
  if (userRow) return userRow.value;

  const systemRow = db
    .prepare('SELECT value FROM preferences WHERE key = ? AND scope = ? AND session_id = ?')
    .get(key, 'system', '') as { value: string } | undefined;
  if (systemRow) return systemRow.value;

  return undefined;
}

/** Set (or upsert) a preference at the given scope. */
export function setPreference(
  key: string,
  value: string,
  scope: string,
  sessionId?: string,
): void {
  const db = getDb();
  const sid = scope === 'session' ? (sessionId ?? '') : '';
  db.prepare(
    `INSERT INTO preferences (key, value, scope, session_id, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT (key, scope, session_id) DO UPDATE SET
       value = excluded.value,
       updated_at = datetime('now')`,
  ).run(key, value, scope, sid);
}
