/**
 * @akubly/crucible-core — public API surface.
 *
 * Sprint 0: in-memory createSession + fork behind the acceptance contract.
 * REFACTOR: SessionManager + DB interface + ForkLineage value object extracted.
 * L1 WAL integration deferred to a future sprint (OQ-2).
 */
export type { PrimitiveKind, EventLevel, PrimitiveInput, EventMetadata, Primitive, SessionMetadata, Session } from './types.js';
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
  LedgerSubscriber,
  LedgerQueryOpts,
  LedgerFactoryOptions,
  CreateLedger,
  WalBackend,
} from './ledger/ledger.js';
// Aperture projector — post-commit projection for attention-tier events (§4.3 Walkthrough C).
export { ApertureProjector } from './projectors/aperture-projector.js';
export type {
  NotificationService,
  ApertureEvent,
  ApertureQueryOpts,
} from './projectors/aperture-projector.js';
export { NotificationPolicy, isQuarantine } from './projectors/notification-policy.js';
// Durable WAL backend — file-system substrate (§3.2 on-disk layout).
export {
  createFileSystemWalBackend,
  WriteLockHeldError,
  ReadOnlyWalBackendError,
  CorruptSegmentError,
  CasMissError,
  UnsupportedSchemaVersionError,
} from './ledger/wal-backend-fs.js';
export type { FileSystemWalBackendOptions } from './ledger/wal-backend-fs.js';
// WAL encoding errors — exported so consumers can catch by type.
export { UnsupportedCborTypeError } from './ledger/wal/cbor.js';
export { InvalidMagicError, InvalidRecordLengthError, InvalidVerdictByteError } from './ledger/wal/codec.js';
export { createInMemoryDB } from './in-memory-db.js';
export type { InMemoryDB } from './in-memory-db.js';
export { createSQLiteDB } from './sqlite-db.js';
export { SCHEMA_V1_SQL } from './schema.js';
