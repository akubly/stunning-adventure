/**
 * RelationReader — read seam for duplicate_of edges (storage seam, symmetric with
 * RelationWriter in relation-writer.types.ts).
 *
 * Previously lived in representation/relation.ts; moved here so both read and write
 * seam ports reside in the storage layer (E finding, persona-review fix wave).
 * Re-exported from representation/relation.ts for backward compatibility.
 *
 * v1 scope: only `duplicate_of` edges are readable here; other relation kinds are
 * write-only until a recall consumer for them is defined.
 *
 * Used by `recallWithScores` (activity layer) to suppress non-canonical duplicates
 * without touching FactStore.search SQL (D-INT-9 append-only invariant preserved —
 * storage stays lossless).
 */

import type { SessionId, FactId } from '@akubly/types';

export interface RelationReader {
  /**
   * Return `duplicate_of` edges for a session, optionally scoped to a set of
   * candidate fact IDs (from-side only).
   *
   * When `candidateIds` is provided, implementations SHOULD restrict results to
   * edges where `from` is in the candidate set — this avoids a full-session edge
   * scan (O(E)) when only a small candidate page is live (D fix, persona-review
   * fix wave).
   *
   * Each edge: `from` is the non-canonical duplicate; `to` is the canonical.
   * Returns an empty array when no edges exist (never null).
   */
  listDuplicateOf(args: {
    sessionId: SessionId;
    candidateIds?: ReadonlyArray<FactId>;
  }): Promise<ReadonlyArray<{ from: FactId; to: FactId }>>;
}
