import { getDb } from './index.js';
import { parseSqliteDateToMs } from '../utils/timestamps.js';
import type { ArtifactTopology } from '../types/index.js';

/** Default cache TTL: 5 minutes */
const DEFAULT_TTL_MS = 300_000;

/**
 * Persist an ArtifactTopology snapshot to the single-row cache table.
 * Overwrites any previous entry.
 */
export function cacheTopology(topology: ArtifactTopology): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO topology_cache (id, topology_json, scanned_at, scan_duration_ms)
     VALUES (1, ?, ?, ?)`,
  ).run(JSON.stringify(topology), topology.scannedAt, topology.scanDurationMs);
}

/**
 * Retrieve the cached topology if it exists and has not expired.
 * Returns null when there is no cached entry or the TTL has elapsed.
 */
export function getCachedTopology(ttlMs: number = DEFAULT_TTL_MS): ArtifactTopology | null {
  const db = getDb();
  const row = db
    .prepare('SELECT topology_json, scanned_at FROM topology_cache WHERE id = 1')
    .get() as { topology_json: string; scanned_at: string } | undefined;

  if (!row) return null;

  const scannedAtMs = parseSqliteDateToMs(row.scanned_at) ?? new Date(row.scanned_at).getTime();
  if (isNaN(scannedAtMs) || Date.now() - scannedAtMs > ttlMs) return null;

  return JSON.parse(row.topology_json) as ArtifactTopology;
}
