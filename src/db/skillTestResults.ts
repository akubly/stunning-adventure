import { getDb } from './index.js';

/** Shape for inserting a test result. */
export interface SkillTestResultInsert {
  skillPath: string;
  skillName?: string;
  scenarioName?: string;
  vector: string;
  tier: number;
  rule: string;
  score: number;
  passed: boolean;
  message?: string;
  evidence?: string[];
  sessionId?: string;
}

/** Shape returned when reading a test result row. */
export interface SkillTestResultRow {
  id: number;
  skillPath: string;
  skillName: string | null;
  scenarioName: string | null;
  vector: string;
  tier: number;
  rule: string;
  score: number;
  passed: boolean;
  message: string | null;
  evidence: string[];
  sessionId: string | null;
  runAt: string;
}

function mapRow(row: Record<string, unknown>): SkillTestResultRow {
  const raw = row.evidence as string | null;
  return {
    id: row.id as number,
    skillPath: row.skill_path as string,
    skillName: (row.skill_name as string | null) ?? null,
    scenarioName: (row.scenario_name as string | null) ?? null,
    vector: row.vector as string,
    tier: row.tier as number,
    rule: row.rule as string,
    score: row.score as number,
    passed: (row.passed as number) === 1,
    message: (row.message as string | null) ?? null,
    evidence: raw ? (JSON.parse(raw) as string[]) : [],
    sessionId: (row.session_id as string | null) ?? null,
    runAt: row.run_at as string,
  };
}

/** Insert a single test result. Returns the new row id. */
export function insertTestResult(result: SkillTestResultInsert): number {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO skill_test_results
       (skill_path, skill_name, scenario_name, vector, tier, rule, score, passed, message, evidence, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const res = stmt.run(
    result.skillPath,
    result.skillName ?? null,
    result.scenarioName ?? null,
    result.vector,
    result.tier,
    result.rule,
    result.score,
    result.passed ? 1 : 0,
    result.message ?? null,
    result.evidence ? JSON.stringify(result.evidence) : null,
    result.sessionId ?? null,
  );
  return Number(res.lastInsertRowid);
}

/** Insert multiple test results in a transaction. Returns row ids. */
export function insertTestResults(results: SkillTestResultInsert[]): number[] {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO skill_test_results
       (skill_path, skill_name, scenario_name, vector, tier, rule, score, passed, message, evidence, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const ids: number[] = [];
  const insertAll = db.transaction(() => {
    for (const r of results) {
      const res = stmt.run(
        r.skillPath,
        r.skillName ?? null,
        r.scenarioName ?? null,
        r.vector,
        r.tier,
        r.rule,
        r.score,
        r.passed ? 1 : 0,
        r.message ?? null,
        r.evidence ? JSON.stringify(r.evidence) : null,
        r.sessionId ?? null,
      );
      ids.push(Number(res.lastInsertRowid));
    }
  });
  insertAll();
  return ids;
}

/** Get test results for a specific skill path, ordered by most recent. */
export function getTestResults(skillPath: string, limit?: number): SkillTestResultRow[] {
  const db = getDb();
  const sql = limit
    ? `SELECT * FROM skill_test_results WHERE skill_path = ? ORDER BY run_at DESC, id DESC LIMIT ?`
    : `SELECT * FROM skill_test_results WHERE skill_path = ? ORDER BY run_at DESC, id DESC`;
  const rows = (limit ? db.prepare(sql).all(skillPath, limit) : db.prepare(sql).all(skillPath)) as Array<
    Record<string, unknown>
  >;
  return rows.map(mapRow);
}

/** Get test history across all skills for a specific vector. */
export function getTestHistory(vector: string, limit?: number): SkillTestResultRow[] {
  const db = getDb();
  const sql = limit
    ? `SELECT * FROM skill_test_results WHERE vector = ? ORDER BY run_at DESC, id DESC LIMIT ?`
    : `SELECT * FROM skill_test_results WHERE vector = ? ORDER BY run_at DESC, id DESC`;
  const rows = (limit ? db.prepare(sql).all(vector, limit) : db.prepare(sql).all(vector)) as Array<
    Record<string, unknown>
  >;
  return rows.map(mapRow);
}

/**
 * Get the most recent test run for a skill (all results from the same run_at).
 * Note: groups by run_at at second precision. Two runs within the same second
 * would merge — acceptable for current interactive usage patterns.
 */
export function getLatestTestRun(skillPath: string): SkillTestResultRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM skill_test_results
       WHERE skill_path = ? AND run_at = (
         SELECT MAX(run_at) FROM skill_test_results WHERE skill_path = ?
       )
       ORDER BY id ASC`,
    )
    .all(skillPath, skillPath) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}
