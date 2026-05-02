import { getDb } from './index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalKind = 'drift' | 'token' | 'outcome';

export interface SignalSampleInsert {
  kind: SignalKind;
  sessionId: string;
  skillId?: string | null;
  value: number;
  metadata?: Record<string, unknown>;
  collectedAt: string;
}

export interface SignalSampleRow {
  id: number;
  kind: SignalKind;
  sessionId: string;
  skillId: string | null;
  value: number;
  metadata: Record<string, unknown>;
  collectedAt: string;
  createdAt: string;
}

export interface SignalSampleQuery {
  kind?: SignalKind;
  skillId?: string | null;
  sessionId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): SignalSampleRow {
  return {
    id: row.id as number,
    kind: row.kind as SignalKind,
    sessionId: row.session_id as string,
    skillId: (row.skill_id as string | null) ?? null,
    value: row.value as number,
    metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    collectedAt: row.collected_at as string,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Insert a single signal sample. Returns the new row id. */
export function insertSignalSample(sample: SignalSampleInsert): number {
  const db = getDb();
  const res = db.prepare(
    `INSERT INTO signal_samples
       (kind, session_id, skill_id, value, metadata, collected_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    sample.kind,
    sample.sessionId,
    sample.skillId ?? null,
    sample.value,
    JSON.stringify(sample.metadata ?? {}),
    sample.collectedAt,
  );
  return Number(res.lastInsertRowid);
}

/** Insert many samples in a single transaction. */
export function insertSignalSamples(samples: SignalSampleInsert[]): number {
  if (samples.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO signal_samples
       (kind, session_id, skill_id, value, metadata, collected_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertAll = db.transaction((rows: SignalSampleInsert[]) => {
    for (const s of rows) {
      stmt.run(
        s.kind,
        s.sessionId,
        s.skillId ?? null,
        s.value,
        JSON.stringify(s.metadata ?? {}),
        s.collectedAt,
      );
    }
    return rows.length;
  });
  return insertAll(samples);
}

/** Query signal samples by kind, skill, session, and/or time range. */
export function querySignalSamples(query: SignalSampleQuery = {}): SignalSampleRow[] {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.kind !== undefined) {
    where.push('kind = ?');
    params.push(query.kind);
  }
  if (query.skillId !== undefined) {
    if (query.skillId === null) {
      where.push('skill_id IS NULL');
    } else {
      where.push('skill_id = ?');
      params.push(query.skillId);
    }
  }
  if (query.sessionId !== undefined) {
    where.push('session_id = ?');
    params.push(query.sessionId);
  }
  if (query.since !== undefined) {
    where.push('collected_at >= ?');
    params.push(query.since);
  }
  if (query.until !== undefined) {
    where.push('collected_at <= ?');
    params.push(query.until);
  }

  let sql = 'SELECT * FROM signal_samples';
  if (where.length > 0) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY collected_at DESC, id DESC';
  if (query.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/** Total sample count. */
export function countSignalSamples(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM signal_samples').get() as { c: number };
  return row.c;
}

/**
 * TTL sweep: delete samples whose `collected_at` is strictly older than the cutoff.
 * Returns the number of rows deleted.
 */
export function sweepSignalSamples(cutoffIso: string): number {
  const db = getDb();
  const res = db.prepare('DELETE FROM signal_samples WHERE collected_at < ?').run(cutoffIso);
  return res.changes;
}

/**
 * Row cap enforcement: if total rows exceed `cap`, delete the oldest rows
 * (by `collected_at`, ties broken by `id`) until count drops to `cap`.
 * Returns the number of rows deleted.
 */
export function enforceSignalSampleCap(cap: number): number {
  if (cap < 0) throw new Error('cap must be non-negative');
  const db = getDb();
  const total = countSignalSamples();
  if (total <= cap) return 0;
  const excess = total - cap;
  const res = db.prepare(
    `DELETE FROM signal_samples
       WHERE id IN (
         SELECT id FROM signal_samples
           ORDER BY collected_at ASC, id ASC
           LIMIT ?
       )`
  ).run(excess);
  return res.changes;
}

/** Delete all samples (test/utility helper). */
export function clearSignalSamples(): number {
  const db = getDb();
  return db.prepare('DELETE FROM signal_samples').run().changes;
}
