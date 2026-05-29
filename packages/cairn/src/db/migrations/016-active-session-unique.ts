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

    // UNIQUE partial indexes: prevent future duplicate active user sessions.
    //
    // Two indexes are required because SQLite treats each NULL as distinct in a
    // UNIQUE index — a single index on (repo_key, workdir) would allow multiple
    // NULL-workdir rows for the same repo_key to coexist.
    //
    // Index 1: non-NULL workdir — unique per (repo_key, workdir) pair.
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_nonnull
        ON sessions (repo_key, workdir)
        WHERE status = 'active' AND session_kind = 'user' AND workdir IS NOT NULL;
    `);
    // Index 2: NULL workdir — at most one legacy active session per repo_key.
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_null
        ON sessions (repo_key)
        WHERE status = 'active' AND session_kind = 'user' AND workdir IS NULL;
    `);
  },
};
