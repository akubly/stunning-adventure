/**
 * PreCommitHookBus — minimal implementation of HookBusPort (§4 / seam §4.2).
 *
 * GREEN phase (Walkthrough B): satisfies the VETO invariant from
 * graham-ledger-seam.md §2. Hooks fire in FIFO registration order;
 * aggregate verdict precedence: VETO > PAUSE > OBSERVE > COMMIT.
 *
 * Full §4 PreCommitHookBus (kind-indexed dispatch, subscriber policy, CAS
 * hookVerdictWitness writes) is deferred — no RED test drives it yet.
 */

import type {
  HookBusPort,
  HookContext,
  HookPredicate,
  HookRegistrationOpts,
  HookResult,
  HookVerdict,
} from './hook-bus.js';

const VERDICT_WEIGHT: Record<HookVerdict, number> = {
  COMMIT:  0,
  OBSERVE: 1,
  PAUSE:   2,
  VETO:    3,
};

type Registration = { predicate: HookPredicate; opts: HookRegistrationOpts };

export class PreCommitHookBus implements HookBusPort {
  private readonly hooks = new Map<string, Registration>();

  async register(id: string, predicate: HookPredicate, opts: HookRegistrationOpts): Promise<void> {
    this.hooks.set(id, { predicate, opts });
  }

  async unregister(id: string): Promise<void> {
    this.hooks.delete(id);
  }

  async fire(ctx: HookContext): Promise<HookResult & { hookId: string | null }> {
    if (this.hooks.size === 0) {
      return { verdict: 'COMMIT', hookId: null };
    }

    let aggVerdict: HookVerdict = 'COMMIT';
    let aggHookId: string | null = null;
    let aggReason: string | undefined;
    let matchedHookId: string | null = null;

    for (const [id, { predicate }] of this.hooks) {
      const result = await predicate(ctx);
      matchedHookId ??= id;
      if (VERDICT_WEIGHT[result.verdict] > VERDICT_WEIGHT[aggVerdict]) {
        aggVerdict = result.verdict;
        aggHookId  = id;
        aggReason  = result.reason;
      }
      // VETO short-circuits: no need to fire remaining hooks
      if (aggVerdict === 'VETO') break;
    }

    return {
      verdict: aggVerdict,
      hookId: aggHookId ?? matchedHookId,
      reason: aggReason,
    };
  }
}
