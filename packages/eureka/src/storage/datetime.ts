/**
 * Datetime conversion helpers for SQLite TEXT-affinity date columns.
 *
 * SQLite stores datetime as TEXT in ISO 8601 format ('YYYY-MM-DD HH:MM:SS').
 * The schema DEFAULTs use `datetime('now')` which produces this format.
 * Writers that override the DEFAULT must produce the same format.
 */

/**
 * Convert Unix epoch milliseconds to SQLite datetime TEXT format.
 *
 * @param ms  Unix epoch milliseconds (e.g. from ClockProvider.now()).
 * @returns   ISO 8601 datetime string: 'YYYY-MM-DD HH:MM:SS' (UTC, no timezone suffix).
 */
export function epochMsToSqliteDateTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}
