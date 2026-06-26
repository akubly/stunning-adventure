/**
 * FifoScheduler — Phase 0.5 walking skeleton implementation of SchedulerPort.
 *
 * Determinism is the whole point: same proposal sequence → same SchedulerDispatched
 * sequence, every time. No timers, no async, no randomness. This property is what
 * makes A-Sched-1 replay-stable: replaying the WAL re-submits proposals in the
 * original arrival order, and the emitted scheduler_dispatched stream is
 * byte-for-byte identical to the original.
 *
 * @see docs/crucible-technical-design/05-router-design.md §5.A
 */

import type {
  SchedulerPort,
  Proposal,
  SchedulerDispatched,
  SchedulerEvent,
} from '../skeleton/types.js';

export class FifoScheduler implements SchedulerPort {
  /**
   * Dispatch a proposal immediately, returning a SchedulerDispatched event.
   *
   * FifoScheduler has no queue and applies no back-pressure — every proposal
   * is dispatched synchronously on arrival. quantaConsumed is always 1;
   * queueDepthAtDispatch is always 0 (nothing buffered ahead of this proposal).
   */
  submit(proposal: Proposal): SchedulerEvent {
    const event: SchedulerDispatched = {
      subKind: 'scheduler_dispatched',
      proposalId: proposal.proposalId,
      generatorId: proposal.generatorId,
      priority: proposal.priority,
      quantaConsumed: 1,
      queueDepthAtDispatch: 0,
    };
    return event;
  }

  /**
   * Returns an empty array — FifoScheduler never buffers proposals.
   * All pending() callers (including replay verification) will see an empty queue.
   */
  pending(): readonly Proposal[] {
    return [];
  }
}
