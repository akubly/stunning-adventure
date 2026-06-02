/**
 * ForkLineage — value object capturing a session's fork ancestry.
 *
 * parentSessionId is typed string | null (not just string) so that
 * ForkLineage.root() can produce a valid sentinel without a non-null
 * assertion. Root sessions carry parentSessionId === null; all forked
 * sessions carry the id of the session they branched from.
 */
export class ForkLineage {
  constructor(
    public readonly parentSessionId: string | null,
    public readonly forkPointEventId: number,
  ) {
    if (forkPointEventId < 0) {
      throw new Error('Fork point must be non-negative');
    }
  }

  /** Sentinel lineage for root (non-forked) sessions. */
  static root(): ForkLineage {
    return new ForkLineage(null, 0);
  }

  isRoot(): boolean {
    return this.parentSessionId === null;
  }
}
