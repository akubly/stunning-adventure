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
  let normalized = sqliteDatetime.trim();
  // SQLite datetime('now') uses a space separator; convert to ISO-8601 'T'
  if (normalized.includes(' ')) {
    normalized = normalized.replace(' ', 'T');
  }
  // Only append 'Z' when there is no explicit timezone indicator
  const hasExplicitTimezone =
    /[Zz]$/.test(normalized) || /[+-]\d{2}(:?\d{2})?$/.test(normalized);
  if (!hasExplicitTimezone) {
    normalized += 'Z';
  }
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}
