/**
 * Unit tests — FifoScheduler stub (A-Sched-1).
 *
 * Test scope     : §5.A L3.5 Scheduler tier, Phase 0.5 FifoScheduler stub.
 * CTD reference  : docs/crucible-technical-design/05-router-design.md §5.A
 * TDD strategy   : §3.5 SchedulerDispatcher collaborator; A-Sched-1 acceptance signal
 * Contract owner : Gabriel (T3 — skeleton/fifo-scheduler.ts)
 *
 * This file is TDD-RED: the FifoScheduler implementation does not yet exist.
 * Expected initial failure: "Cannot find module '../../skeleton/fifo-scheduler.js'"
 * Once T3 (Gabriel) lands, this file must pass with zero implementation changes.
 *
 * Invariants exercised (A-Sched-1):
 *   1. submit() returns a SchedulerDispatched event synchronously and immediately.
 *   2. The returned event always has subKind === 'scheduler_dispatched'.
 *   3. proposalId and generatorId from the Proposal are echoed on the event.
 *   4. quantaConsumed === 1 for every dispatch (FifoScheduler stub constant).
 *   5. queueDepthAtDispatch === 0 for every dispatch (no internal buffering).
 *   6. priority hint is echoed on the dispatched event (carries forward for Router).
 *   7. pending() always returns an empty array (FifoScheduler never buffers).
 *   8. Dispatch order matches submission order (FIFO) for N proposals in sequence.
 *   9. FIFO order holds regardless of priority hint value (FifoScheduler ignores priority for ordering).
 *  10. Each submit() call produces exactly one scheduler_dispatched event (no duplication).
 *
 * ⚠️  AMBIGUITY for T3 (Gabriel): The FifoScheduler may be a class (new FifoScheduler())
 *     or a factory function (createFifoScheduler()). Tests below assume class instantiation.
 *     If Gabriel chooses a factory, update the two constructor calls below.
 */

import { describe, it, expect } from 'vitest';

// T3 (Gabriel) — RED until packages/crucible-core/src/skeleton/fifo-scheduler.ts is created.
// ⚠️ AMBIGUITY: Class vs factory — adjust if Gabriel uses createFifoScheduler() instead.
import { FifoScheduler } from '../../skeleton/fifo-scheduler.js';

import type {
  SchedulerPort,
  SchedulerDispatched,
  Proposal,
} from '../../skeleton/index.js';

import type { PrimitiveInput } from '../../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload(): PrimitiveInput {
  return {
    primitiveKind: 'observation',
    primitivePayload: { subKind: 'llm_response', body: {} },
    causalReadSet: [],
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 1,
    generatorId: 'gen-default',
    priority: 0,
    payload: makePayload(),
    ...overrides,
  };
}

// ─── FifoScheduler unit suite ─────────────────────────────────────────────────

describe('FifoScheduler — A-Sched-1 FIFO dispatch', () => {
  it('Unit: satisfies the SchedulerPort interface', () => {
    const scheduler: SchedulerPort = new FifoScheduler();
    expect(scheduler).toBeDefined();
    expect(typeof scheduler.submit).toBe('function');
    expect(typeof scheduler.pending).toBe('function');
  });

  it('Unit: submit() returns a scheduler_dispatched event immediately (synchronous)', () => {
    const scheduler = new FifoScheduler();
    const event = scheduler.submit(makeProposal({ proposalId: 42, generatorId: 'gen-x' }));
    // Synchronous return — no await, no Promise
    expect(event).toBeDefined();
    expect(event.subKind).toBe('scheduler_dispatched');
  });

  it('Unit: dispatched event echoes proposalId from the submitted proposal', () => {
    const scheduler = new FifoScheduler();
    const event = scheduler.submit(makeProposal({ proposalId: 99 }));
    expect(event.proposalId).toBe(99);
  });

  it('Unit: dispatched event echoes generatorId from the submitted proposal', () => {
    const scheduler = new FifoScheduler();
    const event = scheduler.submit(makeProposal({ generatorId: 'codegen-v1', proposalId: 7 }));
    expect(event.generatorId).toBe('codegen-v1');
  });

  it('Unit: dispatched event carries quantaConsumed === 1 (FifoScheduler constant)', () => {
    const scheduler = new FifoScheduler();
    const event = scheduler.submit(makeProposal({ proposalId: 1 })) as SchedulerDispatched;
    expect(event.quantaConsumed).toBe(1);
  });

  it('Unit: dispatched event carries queueDepthAtDispatch === 0 (no buffering)', () => {
    const scheduler = new FifoScheduler();
    const event = scheduler.submit(makeProposal({ proposalId: 1 })) as SchedulerDispatched;
    expect(event.queueDepthAtDispatch).toBe(0);
  });

  it('Unit: dispatched event echoes priority hint from the submitted proposal', () => {
    const scheduler = new FifoScheduler();
    const event = scheduler.submit(makeProposal({ proposalId: 5, priority: 88 }));
    expect(event.priority).toBe(88);
  });

  it('Unit: pending() always returns empty — FifoScheduler does not buffer', () => {
    const scheduler = new FifoScheduler();
    expect(scheduler.pending()).toHaveLength(0);
    scheduler.submit(makeProposal({ proposalId: 1 }));
    scheduler.submit(makeProposal({ proposalId: 2 }));
    expect(scheduler.pending()).toHaveLength(0);
  });

  it('Unit: each submit() produces exactly one scheduler_dispatched event', () => {
    const scheduler = new FifoScheduler();
    const events: ReturnType<typeof scheduler.submit>[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(scheduler.submit(makeProposal({ proposalId: i })));
    }
    expect(events).toHaveLength(5);
    expect(events.every(e => e.subKind === 'scheduler_dispatched')).toBe(true);
  });

  it('[A-Sched-1] dispatch order matches submission order (FIFO) for a sequence of proposals', () => {
    // A-Sched-1: on replay, the sequence of scheduler_dispatched.proposalId values
    // matches the live run. FifoScheduler satisfies this because dispatch order ==
    // submission order (trivially FIFO — no reordering, no priority-based advancement).
    const scheduler = new FifoScheduler();
    const proposalIds = [10, 20, 30, 40, 50];
    const events = proposalIds.map(id =>
      scheduler.submit(makeProposal({ proposalId: id, generatorId: `gen-${id}` })),
    );
    expect(events.map(e => e.proposalId)).toEqual(proposalIds);
  });

  it('[A-Sched-1] FIFO order is preserved regardless of priority hint values', () => {
    // FifoScheduler ignores priority for ordering — dispatch is strictly submit-order.
    // Priority hint is carried on the event (Router may use it) but never changes order.
    const scheduler = new FifoScheduler();
    const submissions = [
      makeProposal({ proposalId: 1, priority: 5 }),
      makeProposal({ proposalId: 2, priority: 100 }),   // higher priority — must NOT jump
      makeProposal({ proposalId: 3, priority: 1 }),
    ];
    const events = submissions.map(p => scheduler.submit(p));
    expect(events.map(e => e.proposalId)).toEqual([1, 2, 3]);
  });

  it('[A-Sched-1] independent FifoScheduler instances are independent (no shared state)', () => {
    const a = new FifoScheduler();
    const b = new FifoScheduler();
    a.submit(makeProposal({ proposalId: 100 }));
    a.submit(makeProposal({ proposalId: 101 }));
    const bEvent = b.submit(makeProposal({ proposalId: 1 }));
    // b started fresh — its first dispatch has queueDepthAtDispatch 0
    expect((bEvent as SchedulerDispatched).queueDepthAtDispatch).toBe(0);
    expect(b.pending()).toHaveLength(0);
  });
});
