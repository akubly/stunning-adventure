import type { Migration } from '../schema.js';

export const migration001: Migration = {
  version: 1,
  description: 'core fact storage',
  up(db) {
    db.exec(`
      CREATE TABLE facts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fact_id     TEXT    NOT NULL,
        session_id  TEXT    NOT NULL,
        content     TEXT    NOT NULL DEFAULT '',
        trust       REAL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE (fact_id, session_id)
      );

      CREATE VIRTUAL TABLE facts_fts USING fts5(
        content,
        content='facts',
        content_rowid='id'
      );

      CREATE TRIGGER facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER facts_au AFTER UPDATE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content) VALUES ('delete', old.id, old.content);
        INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END;

      CREATE TABLE trust_history (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        fact_id      TEXT    NOT NULL,
        session_id   TEXT    NOT NULL,
        trust_before REAL,
        trust_after  REAL    NOT NULL,
        event        TEXT    NOT NULL,
        applied_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
