import { ForkLineage } from './ledger/fork-lineage.js';
import type { DB } from './db.js';

export class SessionManager {
  constructor(private readonly db: DB) {}

  /**
   * Fork an existing session at the given logical offset.
   *
   * Validation order:
   *   1. Parent must exist in DB.
   *   2. forkOffset must not exceed parent ledger size.
   *   3. forkOffset must be non-negative (enforced by ForkLineage constructor).
   *
   * Returns the new child session id.
   */
  async forkSession(parentId: string, forkOffset: number): Promise<string> {
    const parent = await this.db.getSession(parentId);
    if (!parent) {
      throw new Error(`Parent session ${parentId} not found`);
    }

    if (forkOffset > parent.ledgerSize) {
      throw new Error(
        `Fork point ${forkOffset} exceeds parent ledger size ${parent.ledgerSize}`,
      );
    }

    // ForkLineage constructor enforces the non-negative invariant.
    const lineage = new ForkLineage(parentId, forkOffset);

    const childId = crypto.randomUUID();
    await this.db.insertSession({
      id: childId,
      parentSessionId: lineage.parentSessionId,
      forkPointEventId: lineage.forkPointEventId,
      pluginVersions: parent.pluginVersions,
      createdAt: Date.now(),
    });

    return childId;
  }
}
