/**
 * Relation — the directed cross-reference primitive for the Eureka knowledge
 * graph (§20 §2.2 Cross-Reference Model).
 *
 * This is the representation layer's first inhabitant. It establishes the
 * `packages/eureka/src/representation/` directory; future Fact-shape work
 * (kind/verb taxonomy) belongs here too.
 *
 * ## v1 scope
 *
 * - The CHECK vocabulary in migration 003 locks four `RelationKind` values.
 * - The `integrate` activity (wave 2) only ever WRITES `duplicate_of`.
 * - The other three kinds are present so consumers can land additional writers
 *   later without a schema migration.
 *
 * ## Validation pattern
 *
 * Mirrors `AttentionTier` (activities/imprint.ts) — literal union + readonly
 * Set for runtime membership checks. Validators throw the typed error from
 * `errors.ts` rather than a generic Error so callers can narrow on `.code`.
 */

import type { SessionId, FactId } from '@akubly/types';
import { InvalidRelationError } from './errors.js';

/** Relation kind literal union (matches migration 003 CHECK constraint). */
export type RelationKind = 'duplicate_of' | 'supersedes' | 'contradicts' | 'supports';

/** Runtime membership set for `RelationKind` — used by the validator below. */
export const RELATION_KINDS: ReadonlySet<RelationKind> = new Set<RelationKind>([
  'duplicate_of',
  'supersedes',
  'contradicts',
  'supports',
]);

/**
 * Public edge shape used by the `integrate` activity and the locked
 * `RelationWriter.writeEdges` API (wave-2).
 *
 * Field names intentionally differ from {@link Relation}:
 *   - `from` / `to`   — activity-facing aliases for `fromFactId` / `toFactId`
 *   - `edgeType`      — activity-facing alias for `relationKind`, narrowed in
 *                       v1 to the single edge integrate actually writes.
 *
 * The vocabulary on `edgeType` is intentionally narrowed to `'duplicate_of'`
 * for v1 — `supersedes | contradicts | supports` are in the schema CHECK
 * constraint but no v1 writer emits them. Future activities widening this
 * union should follow the same Relation ↔ RelationEdge mapping.
 */
export interface RelationEdge {
  from: FactId;
  to: FactId;
  edgeType: 'duplicate_of';
  sessionId: SessionId;
}

/**
 * Directed edge between two facts within a session.
 *
 * Matches §20 §2.2 `Relation` shape. `weight` and `confidence` both default to
 * 1.0 in the schema; callers can override either independently.
 */
export interface Relation {
  /** Source fact (the edge originates here). */
  fromFactId: FactId;
  /** Target fact (the edge terminates here). */
  toFactId: FactId;
  /** One of the four locked relation kinds. */
  relationKind: RelationKind;
  /** Session scope. Cross-session relations are v1.5+. */
  sessionId: SessionId;
  /** Edge strength ∈ [0,1]. Schema default 1.0. */
  weight?: number;
  /** Assertion confidence ∈ [0,1]. Schema default 1.0. */
  confidence?: number;
}

/**
 * Map an activity-facing `RelationEdge` to the canonical internal `Relation`
 * shape. Centralises the field-name renaming (`from`/`to`/`edgeType` →
 * `fromFactId`/`toFactId`/`relationKind`) so both writer implementations
 * (sqlite + in-memory) share a single translation point — F3 DRY fix from
 * the integrate fix wave. `weight` and `confidence` are intentionally left
 * unset so the storage default (1.0, per migration 003) applies.
 */
export function edgeToRelation(e: RelationEdge): Relation {
  return {
    fromFactId: e.from,
    toFactId: e.to,
    relationKind: e.edgeType,
    sessionId: e.sessionId,
  };
}

/**
 * Validate caller-supplied relation options.
 *
 * Throws `InvalidRelationError` with a `.field` discriminator identifying the
 * first invalid input. Synchronous — runs before any await in the writer path.
 *
 * Rules:
 *   V-R1  fromFactId must be a non-empty, non-whitespace string
 *   V-R2  toFactId must be a non-empty, non-whitespace string
 *   V-R3  fromFactId !== toFactId (self-loops are rejected; v1 has no use case
 *         and they would corrupt every traversal heuristic that expects edges
 *         to connect distinct nodes)
 *   V-R4  relationKind must be one of the four locked kinds
 *   V-R5  weight, when provided, must be finite and in [0, 1]
 *   V-R6  confidence, when provided, must be finite and in [0, 1]
 *
 * sessionId is not validated for non-emptiness — it carries the SessionId
 * brand and is treated as opaque, mirroring how FactWriter.write() treats
 * sessionId today.
 */
export function validateRelation(rel: Relation): void {
  // V-R1
  if (typeof rel.fromFactId !== 'string' || (rel.fromFactId as string).trim().length === 0) {
    throw new InvalidRelationError(
      'fromFactId',
      rel.fromFactId,
      'relation: fromFactId must be a non-empty string',
    );
  }

  // V-R2
  if (typeof rel.toFactId !== 'string' || (rel.toFactId as string).trim().length === 0) {
    throw new InvalidRelationError(
      'toFactId',
      rel.toFactId,
      'relation: toFactId must be a non-empty string',
    );
  }

  // V-R3 — self-loop rejection
  if ((rel.fromFactId as string) === (rel.toFactId as string)) {
    throw new InvalidRelationError(
      'toFactId',
      rel.toFactId,
      'relation: fromFactId and toFactId must differ (self-loops are not permitted)',
    );
  }

  // V-R4
  if (!RELATION_KINDS.has(rel.relationKind)) {
    throw new InvalidRelationError(
      'relationKind',
      rel.relationKind,
      'relation: relationKind must be one of duplicate_of | supersedes | contradicts | supports',
    );
  }

  // V-R5
  if (rel.weight !== undefined) {
    if (!Number.isFinite(rel.weight) || rel.weight < 0 || rel.weight > 1) {
      throw new InvalidRelationError(
        'weight',
        rel.weight,
        'relation: weight must be a finite number in [0, 1]',
      );
    }
  }

  // V-R6
  if (rel.confidence !== undefined) {
    if (!Number.isFinite(rel.confidence) || rel.confidence < 0 || rel.confidence > 1) {
      throw new InvalidRelationError(
        'confidence',
        rel.confidence,
        'relation: confidence must be a finite number in [0, 1]',
      );
    }
  }
}
