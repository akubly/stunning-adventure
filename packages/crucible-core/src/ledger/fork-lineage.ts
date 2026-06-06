/**
 * ForkLineage — value object capturing a session's fork ancestry.
 *
 * parentSessionId is typed string | null (not just string) so that
 * root sessions can carry parentSessionId === null; all forked
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

  // root() factory removed (YAGNI): zero callers, and its sentinel
  // (forkPointEventId = 0) conflicts with session.ts convention where
  // forkPointEventId === null marks root sessions. Re-introduce with
  // consistent null semantics when a caller actually needs it.

  isRoot(): boolean {
    return this.parentSessionId === null;
  }
}
