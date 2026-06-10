/**
 * sealAndSplit — §3.5 group-commit batch walk.
 *
 * Pure function: routes staged rows left-to-right to `committed` or `restaged`
 * based on their hook verdicts. No I/O, no side effects.
 *
 * Rules:
 *   COMMIT | OBSERVE  → row joins committed (verdict preserved on the row).
 *   PAUSE at index i  → rows 0..i join committed; the pause row carries the
 *                        durable PAUSE verdict (exactly-once-pause); rows
 *                        i+1..end join restaged with a pauseBatchIndex annotation.
 *                        First PAUSE wins — subsequent PAUSEs in the same batch
 *                        never reach the walk (they are restaged).
 *
 * VETO is handled pre-WAL by the Ledger layer and is never present in the
 * verdicts array passed here.
 */

import type { HookVerdict } from '../hook-bus.js';

/** Verdict subset visible to the WAL layer (VETO intercepted before the batch). */
export type SealVerdict = Exclude<HookVerdict, 'VETO'>;

/** A row that was accepted into the committed sequence. */
export interface CommittedRow<T> {
  row:     T;
  verdict: SealVerdict;
}

/**
 * A row that was deferred past the split point.
 * `pauseBatchIndex` is the index (within the original staged array) of the
 * PAUSE row that caused the split. The backend enriches this with the actual
 * commit offset once hash-chaining has assigned it.
 */
export interface RestagedRow<T> {
  row:             T;
  pauseBatchIndex: number;
}

export interface SealAndSplitResult<T> {
  committed: CommittedRow<T>[];
  restaged:  RestagedRow<T>[];
}

export function sealAndSplit<T>(
  staged:   readonly T[],
  verdicts: readonly SealVerdict[],
): SealAndSplitResult<T> {
  if (staged.length !== verdicts.length) {
    throw new Error(
      `sealAndSplit: staged.length (${staged.length}) !== verdicts.length (${verdicts.length})`,
    );
  }

  const committed: CommittedRow<T>[] = [];
  const restaged:  RestagedRow<T>[]  = [];
  let   pauseAt:   number | null      = null;

  for (let i = 0; i < staged.length; i++) {
    if (pauseAt !== null) {
      restaged.push({ row: staged[i], pauseBatchIndex: pauseAt });
    } else if (verdicts[i] === 'PAUSE') {
      committed.push({ row: staged[i], verdict: 'PAUSE' });
      pauseAt = i;
    } else {
      committed.push({ row: staged[i], verdict: verdicts[i] });
    }
  }

  return { committed, restaged };
}
