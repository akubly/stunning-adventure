import { getDb } from './index.js';
import type { DBOMArtifact, DBOMDecisionEntry } from '@akubly/types';

// ---------------------------------------------------------------------------
// Insert types
// ---------------------------------------------------------------------------

export interface DBOMArtifactInsert {
  sessionId: string;
  version: string;
  rootHash: string;
  stats: {
    totalDecisions: number;
    humanGatedDecisions: number;
    machineDecisions: number;
    aiRecommendedDecisions: number;
    decisionTypes: Record<string, number>;
    chainDepth: number;
    chainRoots: number;
  };
  generatedAt: string;
  decisions: DBOMDecisionEntry[];
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface DBOMArtifactRow {
  id: number;
  sessionId: string;
  version: string;
  rootHash: string;
  totalDecisions: number;
  humanGatedDecisions: number;
  machineDecisions: number;
  aiRecommendedDecisions: number;
  chainDepth: number;
  chainRoots: number;
  decisionTypes: Record<string, number>;
  generatedAt: string;
  createdAt: string;
}

export interface DBOMDecisionRow {
  id: number;
  dbomId: number;
  seq: number;
  hash: string;
  parentHash: string | null;
  eventType: string;
  timestamp: string;
  source: string;
  summary: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapArtifactRow(row: Record<string, unknown>): DBOMArtifactRow {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    version: row.version as string,
    rootHash: row.root_hash as string,
    totalDecisions: row.total_decisions as number,
    humanGatedDecisions: row.human_gated_decisions as number,
    machineDecisions: row.machine_decisions as number,
    aiRecommendedDecisions: row.ai_recommended_decisions as number,
    chainDepth: row.chain_depth as number,
    chainRoots: row.chain_roots as number,
    decisionTypes: JSON.parse(row.decision_types as string) as Record<string, number>,
    generatedAt: row.generated_at as string,
    createdAt: row.created_at as string,
  };
}

function mapDecisionRow(row: Record<string, unknown>): DBOMDecisionRow {
  return {
    id: row.id as number,
    dbomId: row.dbom_id as number,
    seq: row.seq as number,
    hash: row.hash as string,
    parentHash: (row.parent_hash as string | null) ?? null,
    eventType: row.event_type as string,
    timestamp: row.timestamp as string,
    source: row.source as string,
    summary: row.summary as string,
    details: JSON.parse(row.details as string) as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Persist a DBOM artifact. Replaces any existing DBOM for the session. */
export function upsertDBOM(artifact: DBOMArtifactInsert): number {
  const db = getDb();

  const upsertAll = db.transaction(() => {
    // Delete existing DBOM for this session (cascade deletes decisions)
    db.prepare('DELETE FROM dbom_artifacts WHERE session_id = ?')
      .run(artifact.sessionId);

    // Insert artifact
    const res = db.prepare(
      `INSERT INTO dbom_artifacts
         (session_id, version, root_hash, total_decisions, human_gated_decisions,
          machine_decisions, ai_recommended_decisions, chain_depth, chain_roots,
          decision_types, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      artifact.sessionId,
      artifact.version,
      artifact.rootHash,
      artifact.stats.totalDecisions,
      artifact.stats.humanGatedDecisions,
      artifact.stats.machineDecisions,
      artifact.stats.aiRecommendedDecisions,
      artifact.stats.chainDepth,
      artifact.stats.chainRoots,
      JSON.stringify(artifact.stats.decisionTypes),
      artifact.generatedAt,
    );

    const dbomId = Number(res.lastInsertRowid);

    // Insert decisions
    const decStmt = db.prepare(
      `INSERT INTO dbom_decisions
         (dbom_id, seq, hash, parent_hash, event_type, timestamp, source, summary, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (let i = 0; i < artifact.decisions.length; i++) {
      const d = artifact.decisions[i];
      decStmt.run(
        dbomId, i, d.hash, d.parentHash, d.eventType,
        d.timestamp, d.source, d.summary, JSON.stringify(d.details ?? {}),
      );
    }

    return dbomId;
  });

  return upsertAll();
}

/** Get the DBOM artifact for a session. Returns null if none exists. */
export function getDBOM(sessionId: string): DBOMArtifactRow | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM dbom_artifacts WHERE session_id = ?'
  ).get(sessionId) as Record<string, unknown> | undefined;
  return row ? mapArtifactRow(row) : null;
}

/** Get the decision entries for a DBOM, ordered by sequence. */
export function getDBOMDecisions(dbomId: number): DBOMDecisionRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM dbom_decisions WHERE dbom_id = ? ORDER BY seq'
  ).all(dbomId) as Array<Record<string, unknown>>;
  return rows.map(mapDecisionRow);
}

/** Reconstruct a full DBOMArtifact from DB rows. */
export function loadDBOMArtifact(sessionId: string): DBOMArtifact | null {
  const artifact = getDBOM(sessionId);
  if (!artifact) return null;

  const decisionRows = getDBOMDecisions(artifact.id);

  return {
    version: artifact.version as '0.1.0',
    sessionId: artifact.sessionId,
    generatedAt: artifact.generatedAt,
    rootHash: artifact.rootHash,
    stats: {
      totalDecisions: artifact.totalDecisions,
      humanGatedDecisions: artifact.humanGatedDecisions,
      machineDecisions: artifact.machineDecisions,
      aiRecommendedDecisions: artifact.aiRecommendedDecisions,
      decisionTypes: artifact.decisionTypes,
      chainDepth: artifact.chainDepth,
      chainRoots: artifact.chainRoots,
    },
    decisions: decisionRows.map((r) => ({
      hash: r.hash,
      parentHash: r.parentHash,
      eventType: r.eventType,
      timestamp: r.timestamp,
      source: r.source as 'human' | 'automated_rule' | 'ai_recommendation',
      summary: r.summary,
      details: r.details,
    })),
  };
}

/** Delete the DBOM for a session. Returns true if a row was deleted. */
export function deleteDBOM(sessionId: string): boolean {
  const db = getDb();
  const res = db.prepare(
    'DELETE FROM dbom_artifacts WHERE session_id = ?'
  ).run(sessionId);
  return res.changes > 0;
}

/** List all DBOM artifacts, most recent first. */
export function listDBOMs(limit?: number): DBOMArtifactRow[] {
  const db = getDb();
  const sql = limit
    ? 'SELECT * FROM dbom_artifacts ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM dbom_artifacts ORDER BY created_at DESC';
  const rows = (limit
    ? db.prepare(sql).all(limit)
    : db.prepare(sql).all()
  ) as Array<Record<string, unknown>>;
  return rows.map(mapArtifactRow);
}
