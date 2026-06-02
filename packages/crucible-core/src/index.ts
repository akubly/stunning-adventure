/**
 * @akubly/crucible-core — public API surface.
 *
 * Sprint 0: in-memory createSession + fork behind the acceptance contract.
 * REFACTOR: SessionManager + DB interface + ForkLineage value object extracted.
 * L1 WAL integration deferred to a future sprint (OQ-2).
 */
export type { PrimitiveKind, PrimitiveInput, Primitive, SessionMetadata, Session } from './types.js';
export { createSession, fork } from './session.js';
export { SessionManager } from './session-manager.js';
export type { DB } from './db.js';
export { ForkLineage } from './ledger/fork-lineage.js';
export { createInMemoryDB } from './in-memory-db.js';
export type { InMemoryDB } from './in-memory-db.js';
