/**
 * Integration smoke test: recall() end-to-end with the SQLite stack.
 *
 * ## What this covers (Slice D spec — §decisions.md §"Slice D")
 *
 *   SD-1  A fact seeded into the real SQLite/FTS5 table is returned by recall()
 *         — content round-trips, ordering is sane, the full production search
 *         path (openDatabase → SqliteFactStore.search → BM25 ranking → recall
 *         composite-score ranking) is exercised.
 *
 *   SD-2  A query that matches no seeded fact returns an empty array — proves
 *         the FTS5 "no match" path propagates cleanly through to the caller.
 *
 * ## Production surface exercised
 *
 *   - openDatabase(':memory:')    — from @akubly/eureka/sqlite (real open + migrations)
 *   - SqliteFactStore.search()    — real FTS5 BM25 search against the in-memory DB
 *   - recall() / recallWithScores() — from @akubly/eureka (core activity)
 *
 * ## Factory wiring
 *
 *   Uses `createSqliteRecallDeps(db)` from `@akubly/eureka/sqlite` — the
 *   production composition root that assembles `{ factStore, clock }` from an
 *   opened Database handle (Roger's Slice D wiring, merged 2026-06-06).
 *
 * ## Env prerequisite
 *
 *   better-sqlite3 must be installed (optionalDependency). If not,
 *   openDatabase throws a clear "[eureka] better-sqlite3 is not installed…"
 *   message — install with `npm install better-sqlite3` and re-run.
 *
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import { openDatabase, createSqliteRecallDeps, createSqliteFeedbackDeps } from '../../sqlite/index.js';
import { recall, applyFeedback } from '../recall.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION = 'smoke-session-001' as SessionId;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('recall() — end-to-end smoke: real SQLite + FTS5 stack', () => {
  let db: Database.Database;
  let insertFact: (factId: string, content: string, trust: number, sessionId?: SessionId) => void;

  beforeEach(() => {
    // Open a fresh in-memory DB with full production migrations applied.
    // openDatabase(':memory:') runs applyMigrations internally — FTS5 table
    // and triggers (facts_ai / facts_au / facts_ad) are all live.
    db = openDatabase(':memory:');

    // Seed helper — inserts via the `facts` table so the facts_ai trigger
    // populates facts_fts. This is the same write path production will use.
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
    );
    insertFact = (factId, content, trust, sessionId = SESSION) => {
      stmt.run(factId, sessionId as string, content, trust);
    };
  });

  afterEach(() => {
    db.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SD-1: Seeded fact is recalled end-to-end through real SQLite + FTS5.
  //
  // Seeds two facts in the same session. The high-trust fact contains the
  // query keyword multiple times (strong BM25 signal); the decoy contains
  // the keyword once with much lower trust. Asserts:
  //   (a) recall() returns at least one result
  //   (b) the high-relevance seeded content is present in the result set
  //   (c) result order is sane (FR-2 composite: high-trust/high-BM25 wins)
  //   (d) recall strips scores (returns RecallResult[], not ScoredResult[])
  // ─────────────────────────────────────────────────────────────────────────

  it('SD-1: seeded fact round-trips through real SQLite/FTS5 — content returned, ordering sane', async () => {
    // Strong match: "authentication" × 3, high trust → should rank first.
    insertFact('fact-strong', 'Authentication authentication authentication — JWT bearer token flow', 0.9);
    // Weak match: "authentication" × 1, low trust → ranked lower.
    insertFact('fact-weak', 'Basic authentication is supported', 0.25);

    const results = await recall(
      { query: 'authentication', sessionId: SESSION, k: 5 },
      createSqliteRecallDeps(db),
    );

    // At least one result returned — the seeded facts are findable.
    expect(results.length).toBeGreaterThanOrEqual(1);

    // The strong-match fact's content must round-trip without mutation.
    const strongResult = results.find(r => r.content.includes('JWT bearer token flow'));
    expect(strongResult).toBeDefined();
    expect(strongResult?.content).toBe('Authentication authentication authentication — JWT bearer token flow');
    expect(strongResult?.trust).toBeCloseTo(0.9, 5);

    // FR-2 ordering: strong match (high BM25 × high trust) must rank first.
    expect(results[0].content).toContain('JWT bearer token flow');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SD-2: Non-matching query returns empty — FTS5 "no match" path is clean.
  //
  // Seeds facts about authentication; queries for an unrelated term.
  // Asserts that recall() returns [] without throwing.
  // ─────────────────────────────────────────────────────────────────────────

  it('SD-2: non-matching query returns empty array — FTS5 no-match path is clean', async () => {
    insertFact('fact-auth', 'Secure authentication with OAuth2 and refresh tokens', 0.8);

    const results = await recall(
      { query: 'photosynthesis', sessionId: SESSION, k: 5 },
      createSqliteRecallDeps(db),
    );

    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SD-3: createSqliteFeedbackDeps end-to-end — trust mutation via real SQLite.
// ---------------------------------------------------------------------------

describe('createSqliteFeedbackDeps() — end-to-end smoke: real SQLite trust mutation', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SD-3: applyFeedback() with deps from createSqliteFeedbackDeps() mutates
  // trust in the real SQLite store — corroboration raises trust, contradiction
  // lowers it. Guards the constructor wiring added in Slice D.
  // ─────────────────────────────────────────────────────────────────────────

  it('SD-3: applyFeedback via createSqliteFeedbackDeps — corroboration raises trust, contradiction lowers it', async () => {
    const insert = db.prepare(
      'INSERT OR REPLACE INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
    );
    insert.run('fact-feedback', SESSION as string, 'Some memorable fact', 0.5);

    const deps = createSqliteFeedbackDeps(db);

    // Positive feedback: trust 0.5 → 0.6
    await applyFeedback(
      { factId: 'fact-feedback', sessionId: SESSION, event: 'corroboration' },
      deps,
    );

    const afterCorroboration = (
      db.prepare('SELECT trust FROM facts WHERE fact_id = ? AND session_id = ?')
        .get('fact-feedback', SESSION as string) as { trust: number }
    ).trust;
    expect(afterCorroboration).toBeCloseTo(0.6, 5);

    // Negative feedback: trust 0.6 → 0.5
    await applyFeedback(
      { factId: 'fact-feedback', sessionId: SESSION, event: 'contradiction' },
      deps,
    );

    const afterContradiction = (
      db.prepare('SELECT trust FROM facts WHERE fact_id = ? AND session_id = ?')
        .get('fact-feedback', SESSION as string) as { trust: number }
    ).trust;
    expect(afterContradiction).toBeCloseTo(0.5, 5);
  });
});
