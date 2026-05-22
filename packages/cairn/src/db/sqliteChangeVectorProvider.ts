import type Database from 'better-sqlite3';
import type { ChangeVectorProvider, ChangeVectorSummary } from '@akubly/types';
import { getAllCategories, summarizeChangeVectors } from './changeVectors.js';

/** SQLite-backed ChangeVectorProvider adapter for local Cairn data. */
export class SqliteChangeVectorProvider implements ChangeVectorProvider {
  constructor(private readonly db: Database.Database) {}

  async getSummaries(skillId: string): Promise<ChangeVectorSummary[]> {
    return getAllCategories(this.db, skillId)
      .map((category) => summarizeChangeVectors(this.db, category, skillId))
      .filter((summary) => summary.vectorCount > 0);
  }
}
