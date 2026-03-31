/**
 * Shared timestamp utilities for normalizing SQLite datetime strings.
 *
 * SQLite's `datetime('now')` produces `'YYYY-MM-DD HH:MM:SS'` (no 'T', no 'Z'),
 * which some JS engines reject or parse incorrectly via `new Date(...)`.
 * These helpers normalise to ISO-8601 UTC before parsing.
 */

/**
 * Parse a SQLite datetime string into epoch milliseconds.
 * Handles both SQLite format (`YYYY-MM-DD HH:MM:SS`) and ISO-8601.
 * Returns `null` on failure (empty input, unparseable string, NaN result).
 */
export function parseSqliteDateToMs(sqliteDatetime: string | undefined | null): number | null {
  if (!sqliteDatetime) return null;
  // SQLite datetime('now') → 'YYYY-MM-DD HH:MM:SS'; normalise to ISO-8601 UTC
  const normalized =
    sqliteDatetime.includes('T') || sqliteDatetime.endsWith('Z')
      ? sqliteDatetime
      : sqliteDatetime.replace(' ', 'T') + 'Z';
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}
