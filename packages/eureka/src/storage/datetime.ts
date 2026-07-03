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

/**
 * Reverse of {@link epochMsToSqliteDateTime}: parse a SQLite datetime TEXT value
 * (`'YYYY-MM-DD HH:MM:SS'`, UTC, no timezone suffix) back into Unix epoch
 * milliseconds. Used by readers (e.g. SqliteFactReader.listBySession) that need
 * to surface `createdAt` as a numeric epoch for the activity layer.
 *
 * Throws `RangeError` if the input cannot be parsed — callers should never see
 * this in practice because writers go through {@link epochMsToSqliteDateTime}
 * (or the schema DEFAULT `datetime('now')` which is the same format).
 */
export function sqliteDateTimeToEpochMs(s: string): number {
  // Append 'Z' so Date.parse treats the bare datetime as UTC, matching the
  // forward conversion which strips the trailing 'Z'.
  const ms = Date.parse(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(ms)) {
    throw new RangeError(`sqliteDateTimeToEpochMs: cannot parse "${s}"`);
  }
  return ms;
}
