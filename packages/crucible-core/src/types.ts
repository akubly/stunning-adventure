/**
 * Crucible primitive types — Sprint 0 public surface.
 *
 * Primitive vocabulary is the five-kind algebra from §6 of the Crucible
 * Technical Design. This file exposes the minimal subset needed for the
 * Sprint 0 acceptance test; fuller envelope fields (id, trustTier, hooks,
 * schemaVersion, etc.) are deferred to future sprints.
 */

/** The five Crucible primitive kinds per §6.1. */
export type PrimitiveKind =
  | 'request'
  | 'artifact'
  | 'observation'
  | 'decision'
  | 'question';

/** Closed set of attention tiers used in EventMetadata.level. */
export type EventLevel = 'urgent' | 'attention' | 'notice' | 'info';

/**
 * Optional caller-supplied event metadata.
 * Carries tier/level and any other caller-supplied fields.
 */
export interface EventMetadata {
  /** Attention tier. Closed set — use EventLevel for exhaustive matching. */
  level?: EventLevel;
  [key: string]: unknown;
}

/** Input shape for appending a primitive to a session ledger. */
export interface PrimitiveInput {
  primitiveKind: PrimitiveKind;
  primitivePayload: unknown;
  causalReadSet: string[];
  /** Optional event metadata — carries tier/level and caller-supplied fields. */
  metadata?: EventMetadata;
}

/**
 * A committed primitive — PrimitiveInput plus its logical offset in the
 * session. Offset is 0-indexed; query range is inclusive on both ends.
 */
export interface Primitive extends PrimitiveInput {
  offset: number;
}

/**
 * Fork-lineage and creation metadata for a session.
 *
 * Invariant: `parentSessionId` and `forkPointEventId` are BOTH null (root
 * session) OR BOTH non-null (forked session). Mixed states are illegal.
 * TypeScript discriminated union deferred — see ForkLineage for invariant
 * enforcement.
 */
export interface SessionMetadata {
  parentSessionId: string | null;
  forkPointEventId: number | null;
  createdAt: number;
}

/** Runtime session object returned by createSession() and fork(). */
export interface Session {
  id: string;
  metadata: SessionMetadata;
  /**
   * Append a primitive to this session.
   * Assigned offset = forkPointEventId + 1 + ownEventCount for child sessions,
   * or simply ownEventCount for root sessions.
   */
  append(p: PrimitiveInput): Promise<void>;
  /**
   * Query primitives in the inclusive-inclusive offset range [a, b].
   * Returns up to b - a + 1 primitives.
   * For child sessions, offsets ≤ forkPointEventId delegate to the parent's
   * event store (logical prefix — parent events are never physically copied).
   *
   * The `range` tuple is `[startOffset, endOffset]` — both endpoints inclusive.
   * Example: `range: [0, 46]` returns offsets 0 through 46 (47 events max).
   * A named-field API (`{startOffset, endOffset}`) is under consideration for
   * a future sprint; tuple is kept for Sprint 0 to minimise API churn.
   */
  query(opts: { range: [number, number] }): Promise<Primitive[]>;
}
