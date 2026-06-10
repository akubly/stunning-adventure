/**
 * Unit tests for sealAndSplit (§3.5 — pure batch-walk logic).
 *
 * RED cycle: these fail with "Cannot find module" until seal-and-split.ts exists.
 */

import { describe, it, expect } from 'vitest';
import { sealAndSplit } from '../../ledger/wal/seal-and-split.js';
import type { SealVerdict } from '../../ledger/wal/seal-and-split.js';

type R = { id: number };

function rows(n: number): R[] {
  return Array.from({ length: n }, (_, i) => ({ id: i }));
}

function v(...vs: SealVerdict[]): SealVerdict[] {
  return vs;
}

describe('sealAndSplit (§3.5 — pure batch walk)', () => {
  it('Unit: WAL sealAndSplit empty staged → both outputs empty', () => {
    const { committed, restaged } = sealAndSplit([], []);
    expect(committed).toHaveLength(0);
    expect(restaged).toHaveLength(0);
  });

  it('Unit: WAL sealAndSplit all-COMMIT → all committed, restaged empty', () => {
    const rs = rows(3);
    const { committed, restaged } = sealAndSplit(rs, v('COMMIT', 'COMMIT', 'COMMIT'));
    expect(committed).toHaveLength(3);
    expect(restaged).toHaveLength(0);
    expect(committed.map(c => c.verdict)).toEqual(['COMMIT', 'COMMIT', 'COMMIT']);
    expect(committed.map(c => c.row)).toEqual(rs);
  });

  it('Unit: WAL sealAndSplit all-OBSERVE → all committed, restaged empty', () => {
    const rs = rows(3);
    const { committed, restaged } = sealAndSplit(rs, v('OBSERVE', 'OBSERVE', 'OBSERVE'));
    expect(committed).toHaveLength(3);
    expect(restaged).toHaveLength(0);
  });

  it('Unit: WAL sealAndSplit PAUSE at index 0 → row 0 committed with PAUSE, rows 1..N restaged', () => {
    const rs = rows(4);
    const { committed, restaged } = sealAndSplit(rs, v('PAUSE', 'COMMIT', 'COMMIT', 'OBSERVE'));
    expect(committed).toHaveLength(1);
    expect(committed[0].row).toBe(rs[0]);
    expect(committed[0].verdict).toBe('PAUSE');
    expect(restaged).toHaveLength(3);
    expect(restaged.map(r => r.row)).toEqual([rs[1], rs[2], rs[3]]);
    expect(restaged.every(r => r.pauseBatchIndex === 0)).toBe(true);
  });

  it('Unit: WAL sealAndSplit PAUSE at last index → all committed (last=PAUSE), restaged empty', () => {
    const rs = rows(3);
    const { committed, restaged } = sealAndSplit(rs, v('COMMIT', 'OBSERVE', 'PAUSE'));
    expect(committed).toHaveLength(3);
    expect(committed[2].verdict).toBe('PAUSE');
    expect(restaged).toHaveLength(0);
  });

  it('Unit: WAL sealAndSplit PAUSE at middle → rows 0..i committed, rows i+1..N restaged', () => {
    const rs = rows(5);
    const { committed, restaged } = sealAndSplit(rs, v('COMMIT', 'OBSERVE', 'PAUSE', 'COMMIT', 'OBSERVE'));
    expect(committed).toHaveLength(3);           // rows 0..2
    expect(committed[2].verdict).toBe('PAUSE');
    expect(restaged).toHaveLength(2);            // rows 3..4
    expect(restaged[0].row).toBe(rs[3]);
    expect(restaged[1].row).toBe(rs[4]);
    expect(restaged[0].pauseBatchIndex).toBe(2);
    expect(restaged[1].pauseBatchIndex).toBe(2);
  });

  it('Unit: WAL sealAndSplit multiple PAUSEs → first wins; all subsequent rows restaged', () => {
    const rs = rows(5);
    const { committed, restaged } = sealAndSplit(rs, v('COMMIT', 'PAUSE', 'PAUSE', 'COMMIT', 'PAUSE'));
    expect(committed).toHaveLength(2);           // rows 0..1
    expect(committed[1].verdict).toBe('PAUSE');
    expect(restaged).toHaveLength(3);            // rows 2..4
    expect(restaged.every(r => r.pauseBatchIndex === 1)).toBe(true);
  });

  it('Unit: WAL sealAndSplit mixed COMMIT/OBSERVE before PAUSE carries verdicts correctly', () => {
    const rs = rows(4);
    const { committed, restaged } = sealAndSplit(rs, v('OBSERVE', 'COMMIT', 'PAUSE', 'COMMIT'));
    expect(committed).toHaveLength(3);
    expect(committed[0].verdict).toBe('OBSERVE');
    expect(committed[1].verdict).toBe('COMMIT');
    expect(committed[2].verdict).toBe('PAUSE');
    expect(restaged).toHaveLength(1);
    expect(restaged[0].pauseBatchIndex).toBe(2);
  });

  it('Unit: WAL sealAndSplit throws when staged/verdicts lengths differ', () => {
    expect(() => sealAndSplit([{ id: 0 }], [])).toThrow();
  });
});
