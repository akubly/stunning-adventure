import type { Migration } from '../schema.js';

export const migration016: Migration = {
  version: 16,
  description: 'Wave 7.2: unique active user session per (repo_key, workdir)',
  up(db) {
    // Dedup: for each (repo_key, workdir) group with more than one active user
    // session, keep the most-recently started row and complete the rest. This
    // must run before the UNIQUE index is created so the CREATE INDEX doesn't
    // abort on pre-existing duplicates.
    const groups = db
      .prepare(
        `SELECT repo_key, workdir
         FROM sessions
         WHERE status = 'active' AND session_kind = 'user'
         GROUP BY repo_key, workdir
         HAVING COUNT(*) > 1`,
      )
      .all() as { repo_key: string; workdir: string | null }[];

    const completeOlderStmt = db.prepare(
      `UPDATE sessions
       SET status = 'completed', ended_at = datetime('now')
       WHERE repo_key = ?
         AND workdir IS ?
         AND session_kind = 'user'
         AND status = 'active'
         AND id != (
           SELECT id FROM sessions
           WHERE repo_key = ? AND workdir IS ? AND session_kind = 'user' AND status = 'active'
           ORDER BY started_at DESC
           LIMIT 1
         )`,
    );

    for (const { repo_key, workdir } of groups) {
      completeOlderStmt.run(repo_key, workdir, repo_key, workdir);
    }

    // UNIQUE partial index: prevents future duplicate active user sessions for
    // the same (repo_key, workdir) pair at the database level.
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir
        ON sessions (repo_key, workdir)
        WHERE status = 'active' AND session_kind = 'user';
    `);
  },
};
