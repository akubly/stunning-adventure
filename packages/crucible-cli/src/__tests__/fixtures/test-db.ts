/**
 * createTestDatabase — integration-test fixture for Crucible SQLite tests.
 *
 * Returns a real SQLite :memory: DB that satisfies the InMemoryDB interface
 * (Crucible's own two-table schema: sessions + events). Backed by better-sqlite3;
 * each call returns a fresh, isolated instance.
 *
 * OQ-2 FEDERATE (locked 2026-06-06): Crucible owns its own schema, independent
 * of Cairn's event_log. This fixture MUST NOT import anything from @akubly/cairn.
 *
 * Schema is defined canonically in @akubly/crucible-core (SCHEMA_V1_SQL).
 * Interface contract is InMemoryDB from @akubly/crucible-core.
 */

import { createSQLiteDB } from '@akubly/crucible-core';
import type { InMemoryDB } from '@akubly/crucible-core';

/**
 * Creates an isolated in-memory SQLite database for integration testing.
 *
 * Each call returns a new database instance with a clean, migrated schema.
 * Use one instance per test (no shared state between tests).
 */
export function createTestDatabase(): InMemoryDB {
  return createSQLiteDB(':memory:');
}
