/**
 * InMemoryRelationReader — in-memory counterpart to SqliteRelationReader.
 *
 * Backed by a shared `InMemoryRelationWriter` so an imprint → integrate →
 * recall pipeline sees a single source of truth without any copying.
 * Mirrors the shared-store pattern from `InMemoryFactReader`.
 *
 * Structural conformance to `RelationReader` makes it a drop-in stub for
 * tests that don't need the full SQLite stack.
 */

import type { SessionId, FactId } from '@akubly/types';
import type { RelationReader } from './relation-reader.types.js';
import type { InMemoryRelationWriter } from './relation-writer.js';

export class InMemoryRelationReader implements RelationReader {
  private readonly writer: InMemoryRelationWriter;

  constructor(writer: InMemoryRelationWriter) {
    this.writer = writer;
  }

  async listDuplicateOf(
    args: { sessionId: SessionId; candidateIds?: ReadonlyArray<FactId> },
  ): Promise<ReadonlyArray<{ from: FactId; to: FactId }>> {
    const all = await this.writer.listBySession(args.sessionId);
    const dupEdges = all
      .filter(r => r.relationKind === 'duplicate_of')
      .map(r => ({ from: r.fromFactId as FactId, to: r.toFactId as FactId }));

    if (args.candidateIds !== undefined) {
      // candidateIds provided (even if empty) → restrict to that set.
      // Empty array → no edges possible (no candidates to be non-canonical). Return [].
      if (args.candidateIds.length === 0) return [];
      const candidateSet = new Set<string>(args.candidateIds as unknown as string[]);
      return dupEdges.filter(e => candidateSet.has(e.from as string));
    }
    return dupEdges;
  }
}
