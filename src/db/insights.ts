import { getDb } from './index.js';
import type { Insight, PatternType, InsightStatus } from '../types/index.js';

/** Maximum number of event IDs retained in an insight's evidence array. */
const MAX_EVIDENCE_IDS = 50;

/** Safely parse a JSON evidence column into a number array. */
function parseEvidence(raw: unknown): number[] {
  if (typeof raw !== 'string') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is number => typeof v === 'number');
}

/** Create a new insight. Returns the new insight id. */
export function createInsight(
  patternType: PatternType,
  title: string,
  description: string,
  evidence: number[],
  confidence: number,
  prescription?: string,
): number {
  const db = getDb();
  const cappedEvidence = evidence.slice(-MAX_EVIDENCE_IDS);
  const result = db
    .prepare(
      `INSERT INTO insights (pattern_type, title, description, evidence, confidence, prescription)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(patternType, title, description, JSON.stringify(cappedEvidence), confidence, prescription ?? null);
  return Number(result.lastInsertRowid);
}

/** Update an existing insight with new evidence and bump occurrence count. */
export function reinforceInsight(
  insightId: number,
  newEvidence: number[],
  confidence: number,
): void {
  const db = getDb();
  const existing = db
    .prepare('SELECT evidence FROM insights WHERE id = ?')
    .get(insightId) as { evidence: string } | undefined;

  if (!existing) return;

  const prior = parseEvidence(existing.evidence);
  // Keep most recent IDs to prevent unbounded growth
  const merged = [...prior, ...newEvidence].slice(-MAX_EVIDENCE_IDS);

  db.prepare(
    `UPDATE insights
     SET evidence = ?,
         confidence = ?,
         occurrence_count = occurrence_count + 1,
         last_seen_at = datetime('now')
     WHERE id = ?`,
  ).run(JSON.stringify(merged), confidence, insightId);
}

/** Find an existing insight by pattern type and title (for deduplication). */
export function getInsightByPattern(patternType: PatternType, title: string): Insight | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM insights WHERE pattern_type = ? AND title = ?')
    .get(patternType, title) as Record<string, unknown> | undefined;

  return row ? mapRow(row) : undefined;
}

/** Get all insights, optionally filtered by status. Returns all statuses when omitted. */
export function getInsights(status?: InsightStatus): Insight[] {
  const db = getDb();
  const query = status
    ? 'SELECT * FROM insights WHERE status = ? ORDER BY last_seen_at DESC'
    : 'SELECT * FROM insights ORDER BY last_seen_at DESC';
  const rows = (status ? db.prepare(query).all(status) : db.prepare(query).all()) as Array<
    Record<string, unknown>
  >;
  return rows.map(mapRow);
}

/** Count insights grouped by status. Uses SQL aggregation — does not load rows. */
export function countInsightsByStatus(): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare('SELECT status, COUNT(*) as count FROM insights GROUP BY status')
    .all() as Array<{ status: string; count: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.status] = row.count;
  }
  return result;
}

/** Mark insights as stale if they haven't been reinforced since the given date. */
export function markStaleInsights(olderThan: string): number {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE insights SET status = 'stale'
       WHERE status = 'active' AND last_seen_at < ?`,
    )
    .run(olderThan);
  return result.changes;
}

/** Permanently remove insights that have been marked as pruned. */
export function deletePrunedInsights(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM insights WHERE status = 'pruned'").run();
  return result.changes;
}

/** Update an insight's status. */
export function setInsightStatus(insightId: number, status: InsightStatus): void {
  const db = getDb();
  db.prepare('UPDATE insights SET status = ? WHERE id = ?').run(status, insightId);
}

function mapRow(row: Record<string, unknown>): Insight {
  return {
    id: row.id as number,
    patternType: row.pattern_type as PatternType,
    title: row.title as string,
    description: row.description as string,
    evidence: parseEvidence(row.evidence),
    confidence: row.confidence as number,
    status: row.status as InsightStatus,
    occurrenceCount: row.occurrence_count as number,
    firstSeenAt: row.first_seen_at as string,
    lastSeenAt: row.last_seen_at as string,
    prescription: (row.prescription as string) ?? undefined,
  };
}
