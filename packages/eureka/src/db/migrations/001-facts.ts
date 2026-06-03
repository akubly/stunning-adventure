import type { Migration } from '../schema.js';

export const migration001: Migration = {
  version: 1,
  description: 'core fact storage',
  up(db) {
    db.exec(`
      -- Active (M8 Slice A): core fact storage
      CREATE TABLE IF NOT EXISTS facts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fact_id     TEXT    NOT NULL,
        session_id  TEXT    NOT NULL,
        content     TEXT    NOT NULL DEFAULT '',
        trust       REAL,
        -- NOTE: trust nullable + NULL=NaN sentinel. Slice B will lock writer discipline;
        -- see graham-m8-scope-proposal.md §5 Q1.
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE (fact_id, session_id)
      );

      -- Scaffold (Slice C): FTS5 full-text index — inert until BM25 query layer is wired
      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
        content,
        content='facts',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content) VALUES ('delete', old.id, old.content);
        INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END;

      -- Scaffold (Slice B): trust mutation audit log — inert until applyFeedbackById writes here
      CREATE TABLE IF NOT EXISTS trust_history (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        fact_id      TEXT    NOT NULL,
        session_id   TEXT    NOT NULL,
        trust_before REAL,
        trust_after  REAL    NOT NULL,
        -- non-nullable: a trust event MUST resolve to a known value; NaN inputs are rejected
        -- before this point. Revisit in Slice B when writers land.
        event        TEXT    NOT NULL,
        applied_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
