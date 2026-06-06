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
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 RED — Roger must implement `createSQLiteDB` to make integration tests GREEN.
 *
 * What Roger must provide:
 *
 *   File:      packages/crucible-core/src/sqlite-db.ts
 *   Export:    export function createSQLiteDB(path: ':memory:' | string): InMemoryDB
 *   Barrel:    add `export { createSQLiteDB } from './sqlite-db.js'` to
 *              packages/crucible-core/src/index.ts
 *
 * Required schema (Crucible-owned — NOT Cairn event_log):
 *
 *   CREATE TABLE IF NOT EXISTS sessions (
 *     id                  TEXT    PRIMARY KEY,
 *     parent_session_id   TEXT,                   -- NULL for root sessions
 *     fork_point_event_id INTEGER,                -- NULL for root sessions
 *     plugin_versions     TEXT,                   -- JSON blob | NULL
 *     created_at          INTEGER NOT NULL
 *   );
 *
 *   CREATE TABLE IF NOT EXISTS events (
 *     session_id          TEXT    NOT NULL REFERENCES sessions(id),
 *     "offset"            INTEGER NOT NULL,
 *     primitive_kind      TEXT    NOT NULL,
 *     primitive_payload   TEXT    NOT NULL,        -- JSON blob
 *     causal_read_set     TEXT    NOT NULL,        -- JSON blob
 *     PRIMARY KEY (session_id, "offset")
 *   );
 *
 * Interface contract createSQLiteDB must satisfy (InMemoryDB from crucible-core):
 *
 *   DB base interface (all async):
 *     getSession(id): Promise<{ id, ledgerSize, pluginVersions? } | null>
 *       ledgerSize = forkPointEventId === null
 *         ? COUNT(own events)
 *         : forkPointEventId + 1 + COUNT(own events)
 *     insertSession({ id, parentSessionId, forkPointEventId, pluginVersions?, createdAt }): Promise<void>
 *     queryEvents(id, { range: [a, b] }): Promise<Primitive[]>
 *       Inclusive-inclusive [a, b] range. Returns OWN events in that range
 *       (parent-prefix delegation is session.ts's responsibility, NOT the DB layer).
 *
 *   InMemoryDB extensions (synchronous — better-sqlite3 is a synchronous API):
 *     insertRootSession(id: string, createdAt: number): void
 *     pushEvent(sessionId: string, event: Primitive): void
 *     getOwnEvents(sessionId: string): Primitive[]
 *     getMetadata(sessionId: string): { parentSessionId, forkPointEventId, createdAt } | null
 *     clear(): void   -- DELETE FROM events; DELETE FROM sessions; (test isolation only)
 *
 * devDependency note for Roger:
 *   Add to packages/crucible-cli devDependencies (and/or packages/crucible-core):
 *     "better-sqlite3": "^12.8.0"
 *     "@types/better-sqlite3": "^7.6.13"
 *   (These versions already exist in packages/cairn and packages/eureka;
 *    using the same versions keeps workspace hoisting consistent.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { InMemoryDB } from '@akubly/crucible-core';

// 🔴 RED: `createSQLiteDB` is not yet exported from @akubly/crucible-core.
// When Roger adds it, this import resolves and the integration tests go GREEN.
// @ts-expect-error — intentional: createSQLiteDB does not exist yet (Refactor 3 RED phase)
import { createSQLiteDB } from '@akubly/crucible-core';

/**
 * Creates an isolated in-memory SQLite database for integration testing.
 *
 * Each call returns a new database instance with a clean, migrated schema.
 * Use one instance per test (no shared state between tests).
 *
 * Throws `TypeError: createSQLiteDB is not a function` until Roger implements
 * packages/crucible-core/src/sqlite-db.ts and exports it from the barrel.
 */
export function createTestDatabase(): InMemoryDB {
  // Cast required because TypeScript sees `createSQLiteDB` as `unknown` via @ts-expect-error above.
  // Roger's impl must return an InMemoryDB — this cast is a contract assertion, not defensive.
  return (createSQLiteDB as (path: string) => InMemoryDB)(':memory:');
}
