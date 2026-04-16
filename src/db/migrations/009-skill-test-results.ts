import type { Migration } from '../schema.js';

export const migration009: Migration = {
  version: 9,
  description: 'Skill test results table for quality validation history',
  up(db) {
    db.exec(`
      CREATE TABLE skill_test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_path TEXT NOT NULL,
        skill_name TEXT,
        scenario_name TEXT,
        vector TEXT NOT NULL CHECK (vector IN ('clarity', 'completeness', 'concreteness', 'consistency', 'containment')),
        tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
        rule TEXT NOT NULL,
        score REAL NOT NULL CHECK (score >= 0.0 AND score <= 1.0),
        passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
        message TEXT,
        evidence TEXT,
        session_id TEXT REFERENCES sessions(id),
        run_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_skill_test_results_path ON skill_test_results(skill_path);
      CREATE INDEX idx_skill_test_results_vector ON skill_test_results(vector);
      CREATE INDEX idx_skill_test_results_run ON skill_test_results(run_at);
    `);
  },
};
