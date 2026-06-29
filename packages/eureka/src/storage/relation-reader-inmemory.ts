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
import type { RelationReader } from '../representation/relation.js';
import type { InMemoryRelationWriter } from './relation-writer.js';

export class InMemoryRelationReader implements RelationReader {
  private readonly writer: InMemoryRelationWriter;

  constructor(writer: InMemoryRelationWriter) {
    this.writer = writer;
  }

  async listDuplicateOf(
    args: { sessionId: SessionId },
  ): Promise<ReadonlyArray<{ from: FactId; to: FactId }>> {
    const all = await this.writer.listBySession(args.sessionId);
    return all
      .filter(r => r.relationKind === 'duplicate_of')
      .map(r => ({ from: r.fromFactId as FactId, to: r.toFactId as FactId }));
  }
}
