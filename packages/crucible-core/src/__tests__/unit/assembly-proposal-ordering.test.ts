/**
 * Unit tests — assembly proposal construction (SK-6 ordering invariance).
 *
 * Test scope: Verifies that the Proposal submitted to the FifoScheduler always
 *   references the Decision primitive by kind discriminator, not by position.
 *   A provider that returns [decision, observation] must yield the same correct
 *   proposalId as one that returns [observation, decision].
 *
 * CTD reference: §5.A Proposal (SK-6); assembly.ts SK-6 comment block.
 *
 * Regression for Copilot review comment on PR #80:
 *   "The scheduler proposal assumes the last committed turn primitive is the
 *    Decision row. TurnResult.primitives doesn't guarantee ordering."
 */

import { describe, it, expect } from 'vitest';

import { createSkeletonSession } from '../../skeleton/assembly.js';

import type {
  SdkProvider,
  BootstrapOptions,
  BootstrapPayload,
  TurnResult,
} from '../../skeleton/types.js';
import type { PrimitiveInput } from '../../types.js';

// ─── Minimal stub primitives ─────────────────────────────────────────────────

const OBSERVATION_PRIM: PrimitiveInput = {
  primitiveKind: 'observation',
  primitivePayload: { source: 'test', content: 'response' },
  causalReadSet: [],
};

const DECISION_PRIM: PrimitiveInput = {
  primitiveKind: 'decision',
  primitivePayload: { source: 'test', action: 'passthrough' },
  causalReadSet: [],
};

// ─── Minimal inline SdkProvider ──────────────────────────────────────────────

function makeProvider(primitives: PrimitiveInput[]): SdkProvider {
  return {
    id: 'test-ordering-provider@1',
    sdkVersion: '0.0.0-test',

    async bootstrap(opts: BootstrapOptions): Promise<BootstrapPayload> {
      return {
        sessionId: opts.sessionId,
        sdkVersion: '0.0.0-test',
        schemaVersion: 1,
        literalContext: {
          systemPrompt: opts.systemPrompt,
          toolDefinitions: opts.toolDefinitions,
          injectedMemoryFragments: opts.injectedMemoryFragments ?? [],
        },
        memoryManifest: [],
      };
    },

    async completeTurn(_prompt: string): Promise<TurnResult> {
      return { responsePayload: 'test-response', primitives };
    },

    async shutdown(_reason: string): Promise<void> {
      /* no-op */
    },
  };
}

// ─── Helper: resolve the expected decision offset ────────────────────────────
//
// Given committedOffsets (all bootstrap + turn offsets) and the turn primitives
// in provider-returned order, compute the offset that was assigned to the first
// decision primitive.  This is:
//   committedOffsets[bootstrapCount + decisionIndex]
// where bootstrapCount = committedOffsets.length - turnPrimitives.length
//       decisionIndex  = index of first 'decision' in turnPrimitives

function expectedDecisionOffset(
  committedOffsets: number[],
  turnPrimitives: PrimitiveInput[],
): number {
  const bootstrapCount = committedOffsets.length - turnPrimitives.length;
  const decisionIndex = turnPrimitives.findIndex(p => p.primitiveKind === 'decision');
  if (decisionIndex === -1) throw new Error('No decision primitive in turn');
  return committedOffsets[bootstrapCount + decisionIndex]!;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('assembly — SK-6 proposal references decision by kind, not position', () => {
  it('proposalId targets the decision row when provider returns [observation, decision]', async () => {
    const order: PrimitiveInput[] = [OBSERVATION_PRIM, DECISION_PRIM];
    const session = createSkeletonSession({ provider: makeProvider(order) });
    const result = await session.run('test prompt');

    const want = expectedDecisionOffset(result.committedOffsets, order);
    expect(result.schedulerEvent.proposalId).toBe(want);
    // proposalId must point to the decision — not merely the last row
    expect(result.schedulerEvent.proposalId).not.toBe(
      result.committedOffsets[result.committedOffsets.length - 2]!,  // the observation's offset
    );
  });

  it('proposalId targets the decision row when provider returns [decision, observation]', async () => {
    const order: PrimitiveInput[] = [DECISION_PRIM, OBSERVATION_PRIM];
    const session = createSkeletonSession({ provider: makeProvider(order) });
    const result = await session.run('test prompt');

    const want = expectedDecisionOffset(result.committedOffsets, order);
    expect(result.schedulerEvent.proposalId).toBe(want);
    // decision is first turn primitive — its offset is NOT the last committed offset
    const lastOffset = result.committedOffsets[result.committedOffsets.length - 1]!;
    expect(result.schedulerEvent.proposalId).not.toBe(lastOffset);
  });

  it('both orderings yield the same relative offset distance from bootstrap boundary', async () => {
    // [observation, decision]: decision is 2nd turn prim → relative index 1
    // [decision, observation]: decision is 1st turn prim → relative index 0
    // The proposalId difference should equal (observationFirst - decisionFirst) = 1.
    const obsFirst = [OBSERVATION_PRIM, DECISION_PRIM];
    const decFirst = [DECISION_PRIM, OBSERVATION_PRIM];

    const [r1, r2] = await Promise.all([
      createSkeletonSession({ provider: makeProvider(obsFirst) }).run('p'),
      createSkeletonSession({ provider: makeProvider(decFirst) }).run('p'),
    ]);

    const bootstrapCount1 = r1.committedOffsets.length - obsFirst.length;
    const bootstrapCount2 = r2.committedOffsets.length - decFirst.length;

    // proposalId relative to bootstrap boundary
    const rel1 = r1.schedulerEvent.proposalId - r1.committedOffsets[bootstrapCount1 - 1]! - 1;
    const rel2 = r2.schedulerEvent.proposalId - r2.committedOffsets[bootstrapCount2 - 1]! - 1;

    // [obs, dec] → decision is at relative offset 1 (second turn prim committed)
    expect(rel1).toBe(1);
    // [dec, obs] → decision is at relative offset 0 (first turn prim committed)
    expect(rel2).toBe(0);
  });

  it('run() throws a clear error when TurnResult has no decision primitive', async () => {
    const noDecision: PrimitiveInput[] = [OBSERVATION_PRIM];
    const session = createSkeletonSession({ provider: makeProvider(noDecision) });
    await expect(session.run('test prompt')).rejects.toThrow(
      /no 'decision' primitive/,
    );
  });
});
