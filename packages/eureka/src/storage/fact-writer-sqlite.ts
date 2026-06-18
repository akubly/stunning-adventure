/**
 * SqliteFactWriter — SQLite-backed FactWriter implementation for `@akubly/eureka`.
 *
 * Writes facts to the `facts` table with explicit `created_at` / `updated_at`
 * (overriding schema DEFAULTs). Uses INSERT OR IGNORE on the UNIQUE(fact_id, session_id)
 * constraint to achieve first-write-wins idempotency.
 *
 * ## Idempotency mechanism
 *
 * `INSERT OR IGNORE` is used rather than `INSERT ... ON CONFLICT DO NOTHING`
 * because both are equivalent for a UNIQUE constraint violation and the former
 * is more concise. The result: if a row with the same (fact_id, session_id)
 * already exists, the INSERT is silently skipped — first write wins, no upsert.
 *
 * ## FTS5 sync
 *
 * The `facts_ai` trigger (migration 001) fires on INSERT into `facts`, adding
 * the content to the `facts_fts` virtual table. Since INSERT OR IGNORE does not
 * fire triggers when the row is ignored, FTS stays consistent.
 *
 * ## last_accessed
 *
 * Always written as NULL (never-accessed fact — F3 compositeScore semantics:
 * tDays=Infinity → recency floors to 0.1).
 *
 * ## DB lifecycle
 *
 * Caller injects an already-opened Database handle. This class does not
 * open or close the database.
 */

import type Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import type { FactWriter, FactId, AttentionTier } from '../activities/imprint.js';

export class SqliteFactWriter implements FactWriter {
  private readonly stmt: Database.Statement<{
    fact_id: string;
    session_id: string;
    content: string;
    trust: number;
    importance: number;
    attention_tier: string;
    created_at: string;
    updated_at: string;
  }>;

  constructor(db: Database.Database) {
    this.stmt = db.prepare(`
      INSERT OR IGNORE INTO facts
        (fact_id, session_id, content, trust, importance, attention_tier, last_accessed, created_at, updated_at)
      VALUES
        ($fact_id, $session_id, $content, $trust, $importance, $attention_tier, NULL, $created_at, $updated_at)
    `);
  }

  async write(args: {
    factId: FactId;
    sessionId: SessionId;
    content: string;
    trust: number;
    importance: number;
    attentionTier: AttentionTier;
    createdAt: number;
  }): Promise<void> {
    // Convert createdAt (epoch ms) to ISO 8601 datetime string for TEXT column
    const dt = new Date(args.createdAt).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);

    this.stmt.run({
      fact_id: args.factId as string,
      session_id: args.sessionId as string,
      content: args.content,
      trust: args.trust,
      importance: args.importance,
      attention_tier: args.attentionTier,
      created_at: dt,
      updated_at: dt,
    });
  }
}
