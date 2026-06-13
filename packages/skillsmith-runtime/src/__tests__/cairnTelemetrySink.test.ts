/**
 * cairnTelemetrySink — London-school TDD (RED → GREEN).
 *
 * Verifies that `createCairnTelemetrySink(db)` produces a TelemetrySink
 * whose `enqueueSample` + `flush` persists rows into the `signal_samples`
 * table of a cairn DB, including null-mapping for untagged (no-skillId) samples.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as cairn from '@akubly/cairn';
import type { SignalSample } from '@akubly/types';
import { createCairnTelemetrySink } from '../telemetry.js';

// ---------------------------------------------------------------------------
// DB lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  cairn.closeDb();
  cairn.getDb(':memory:');
});

afterEach(() => {
  cairn.closeDb();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSample(overrides: Partial<SignalSample> = {}): SignalSample {
  return {
    kind: 'drift',
    sessionId: 'sess-cairo-001',
    skillId: 'skill-test',
    value: 0.42,
    metadata: { level: 'low', turnCount: 3 },
    collectedAt: '2026-06-11T23:31:14.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCairnTelemetrySink', () => {
  it('persists a single signal sample into signal_samples on flush', async () => {
    const db = cairn.getDb(':memory:');
    const sink = createCairnTelemetrySink(db);

    sink.enqueueSample(makeSample({ kind: 'token', sessionId: 'sess-t1', skillId: 'skill-a', value: 1234 }));
    await sink.flush?.();

    const count = cairn.countSignalSamples(db);
    expect(count).toBe(1);

    const rows = cairn.querySignalSamples(db, { sessionId: 'sess-t1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('token');
    expect(rows[0]!.skillId).toBe('skill-a');
    expect(rows[0]!.value).toBe(1234);
  });

  it('persists multiple samples of different kinds', async () => {
    const db = cairn.getDb(':memory:');
    const sink = createCairnTelemetrySink(db);

    sink.enqueueSample(makeSample({ kind: 'drift', sessionId: 'sess-multi' }));
    sink.enqueueSample(makeSample({ kind: 'token', sessionId: 'sess-multi' }));
    sink.enqueueSample(makeSample({ kind: 'outcome', sessionId: 'sess-multi' }));
    await sink.flush?.();

    expect(cairn.countSignalSamples(db)).toBe(3);

    const rows = cairn.querySignalSamples(db, { sessionId: 'sess-multi' });
    const kinds = new Set(rows.map((r) => r.kind));
    expect(kinds).toContain('drift');
    expect(kinds).toContain('token');
    expect(kinds).toContain('outcome');
  });

  it('maps skillId=undefined to NULL in the database (fold-to-global)', async () => {
    const db = cairn.getDb(':memory:');
    const sink = createCairnTelemetrySink(db);

    sink.enqueueSample(makeSample({ kind: 'outcome', sessionId: 'sess-no-skill', skillId: undefined }));
    await sink.flush?.();

    const rows = cairn.querySignalSamples(db, { sessionId: 'sess-no-skill' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.skillId).toBeNull();
  });
});
