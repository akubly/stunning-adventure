/**
 * @akubly/crucible-core — public API surface.
 *
 * Sprint 0: in-memory createSession + fork behind the acceptance contract.
 * REFACTOR: SessionManager + DB interface + ForkLineage value object extracted.
 * L1 WAL integration deferred to a future sprint (OQ-2).
 */
export type { PrimitiveKind, PrimitiveInput, Primitive, SessionMetadata, Session } from './types.js';
export { createSession, fork } from './session.js';
// Test isolation only — do not call from production code.
export { resetInMemoryDb } from './session.js';
export { SessionManager } from './session-manager.js';
export type { DB } from './db.js';
export { ForkLineage } from './ledger/fork-lineage.js';
// Ledger — createLedger factory (Walkthrough B GREEN) + seam types.
export { createLedger } from './ledger/ledger-impl.js';
export type {
  HookVerdict,
  HookContext,
  HookMetadata,
  HookResult,
  HookPredicate,
  HookRegistrationOpts,
  HookBusPort,
} from './ledger/hook-bus.js';
export type {
  Ledger,
  LedgerEvent,
  LedgerQueryOpts,
  LedgerFactoryOptions,
  CreateLedger,
  WalBackend,
} from './ledger/ledger.js';
export { createInMemoryDB } from './in-memory-db.js';
export type { InMemoryDB } from './in-memory-db.js';
export { createSQLiteDB } from './sqlite-db.js';
export { SCHEMA_V1_SQL } from './schema.js';
