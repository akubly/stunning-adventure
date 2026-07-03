/**
 * SqliteFactWriter — SQLite-backed FactWriter implementation for `@akubly/eureka`.
 *
 * Writes facts to the `facts` table with explicit `created_at` / `updated_at`
 * (overriding schema DEFAULTs). Uses `ON CONFLICT(fact_id, session_id) DO NOTHING`
 * to achieve first-write-wins idempotency scoped to the UNIQUE constraint only.
 *
 * ## Idempotency mechanism
 *
 * `ON CONFLICT(fact_id, session_id) DO NOTHING` targets only the UNIQUE constraint.
 * Other constraint violations (CHECK on attention_tier, NOT NULL on content, etc.)
 * still throw — unlike `INSERT OR IGNORE` which suppresses ALL constraint errors.
 *
 * ## FTS5 sync
 *
 * The `facts_ai` trigger (migration 001) fires on INSERT into `facts`, adding
 * the content to the `facts_fts` virtual table. ON CONFLICT DO NOTHING does not
 * fire triggers when the row is skipped, so FTS stays consistent.
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
import type { SessionId, FactId } from '@akubly/types';
import type { FactWriter, AttentionTier } from '../activities/imprint.js';
import { epochMsToSqliteDateTime } from './datetime.js';

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
      INSERT INTO facts
        (fact_id, session_id, content, trust, importance, attention_tier, last_accessed, created_at, updated_at)
      VALUES
        ($fact_id, $session_id, $content, $trust, $importance, $attention_tier, NULL, $created_at, $updated_at)
      ON CONFLICT(fact_id, session_id) DO NOTHING
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
    const dt = epochMsToSqliteDateTime(args.createdAt);

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
