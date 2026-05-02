/**
 * Hook composer tests — Verifying multi-observer composition at runtime.
 *
 * The SDK's registerHooks() REPLACES hooks (doesn't append), so Forge must
 * compose multiple observers into a single handler. These tests verify the
 * production HookComposer class and composeHooks helper from
 * packages/forge/src/hooks/index.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { composeHooks, HookComposer } from '../hooks/index.js';
import type { HookObserver } from '../hooks/index.js';
import type {
  PreToolUseInput,
  PreToolUseOutput,
  PostToolUseInput,
  PostToolUseOutput,
  HookInvocation,
} from '../types.js';
import type { ToolResultObject } from '@github/copilot-sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INVOCATION: HookInvocation = { sessionId: 'sess-001' };

function makePreInput(toolName = 'edit'): PreToolUseInput {
  return { timestamp: Date.now(), cwd: '/repo', toolName, toolArgs: {} };
}

function makeToolResult(): ToolResultObject {
  return { type: 'text', title: 'result', content: 'ok' } as unknown as ToolResultObject;
}

function makePostInput(toolName = 'edit'): PostToolUseInput {
  return { timestamp: Date.now(), cwd: '/repo', toolName, toolArgs: {}, toolResult: makeToolResult() };
}

// ---------------------------------------------------------------------------
// Multi-observer composition
// ---------------------------------------------------------------------------

describe('composeHooks — multi-observer composition', () => {
  it('calls ALL observers, not just the last registered', async () => {
    const calls: string[] = [];

    const observer1: HookObserver = {
      onPreToolUse: async () => { calls.push('observer1'); return {}; },
    };
    const observer2: HookObserver = {
      onPreToolUse: async () => { calls.push('observer2'); return {}; },
    };
    const observer3: HookObserver = {
      onPreToolUse: async () => { calls.push('observer3'); return {}; },
    };

    const composed = composeHooks(observer1, observer2, observer3);
    await composed.onPreToolUse!(makePreInput(), INVOCATION);

    expect(calls).toEqual(['observer1', 'observer2', 'observer3']);
  });

  it('calls observers in registration order', async () => {
    const order: number[] = [];

    const hooks = Array.from({ length: 5 }, (_, i) => ({
      onPreToolUse: async () => { order.push(i); return {}; },
    }));

    const composed = composeHooks(...hooks);
    await composed.onPreToolUse!(makePreInput(), INVOCATION);

    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('merges pre-tool results with last-writer-wins', async () => {
    const hooks1: HookObserver = {
      onPreToolUse: async () => ({
        permissionDecision: 'allow' as const,
        additionalContext: 'from hooks1',
      }),
    };
    const hooks2: HookObserver = {
      onPreToolUse: async () => ({
        permissionDecision: 'deny' as const,
        permissionDecisionReason: 'blocked by gate',
      }),
    };

    const composed = composeHooks(hooks1, hooks2);
    const result = await composed.onPreToolUse!(makePreInput(), INVOCATION);

    expect(result!.permissionDecision).toBe('deny');
    expect(result!.permissionDecisionReason).toBe('blocked by gate');
    expect(result!.additionalContext).toBe('from hooks1');
  });

  it('merges post-tool results shallowly', async () => {
    const hooks1: HookObserver = {
      onPostToolUse: async () => ({
        additionalContext: 'telemetry logged',
      }),
    };
    const hooks2: HookObserver = {
      onPostToolUse: async () => ({
        suppressOutput: true,
      }),
    };

    const composed = composeHooks(hooks1, hooks2);
    const result = await composed.onPostToolUse!(makePostInput(), INVOCATION);

    expect(result!.additionalContext).toBe('telemetry logged');
    expect(result!.suppressOutput).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Independent hook type composition
// ---------------------------------------------------------------------------

describe('composeHooks — independent hook types', () => {
  it('composes onPreToolUse independently from onPostToolUse', async () => {
    const preCalls: string[] = [];
    const postCalls: string[] = [];

    const observer: HookObserver = {
      onPreToolUse: async () => { preCalls.push('pre'); return {}; },
      onPostToolUse: async () => { postCalls.push('post'); return {}; },
    };

    const composed = composeHooks(observer);

    await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(preCalls).toEqual(['pre']);
    expect(postCalls).toEqual([]);

    await composed.onPostToolUse!(makePostInput(), INVOCATION);
    expect(postCalls).toEqual(['post']);
  });

  it('composes onSessionStart independently', async () => {
    const calls: string[] = [];

    const hooks1: HookObserver = {
      onSessionStart: async () => { calls.push('h1'); return {}; },
    };
    const hooks2: HookObserver = {
      onSessionStart: async () => { calls.push('h2'); return {}; },
    };

    const composed = composeHooks(hooks1, hooks2);
    await composed.onSessionStart!(
      { timestamp: Date.now(), cwd: '/repo', source: 'startup' },
      INVOCATION,
    );

    expect(calls).toEqual(['h1', 'h2']);
  });

  it('composes onSessionEnd independently', async () => {
    const calls: string[] = [];

    const hooks1: HookObserver = {
      onSessionEnd: async () => { calls.push('h1'); return {}; },
    };
    const hooks2: HookObserver = {
      onSessionEnd: async () => { calls.push('h2'); return {}; },
    };

    const composed = composeHooks(hooks1, hooks2);
    await composed.onSessionEnd!(
      { timestamp: Date.now(), cwd: '/repo', reason: 'user_exit' },
      INVOCATION,
    );

    expect(calls).toEqual(['h1', 'h2']);
  });

  it('composes onUserPromptSubmitted independently', async () => {
    const calls: string[] = [];

    const hooks: HookObserver = {
      onUserPromptSubmitted: async () => { calls.push('prompt'); return {}; },
    };

    const composed = composeHooks(hooks);
    await composed.onUserPromptSubmitted!(
      { timestamp: Date.now(), cwd: '/repo', prompt: 'Fix the bug' },
      INVOCATION,
    );

    expect(calls).toEqual(['prompt']);
  });

  it('composes onErrorOccurred independently', async () => {
    const errors: string[] = [];

    const hooks: HookObserver = {
      onErrorOccurred: async (input) => { errors.push(input.error); return {}; },
    };

    const composed = composeHooks(hooks);
    await composed.onErrorOccurred!(
      { timestamp: Date.now(), cwd: '/repo', error: 'timeout', errorContext: 'tool_execution', recoverable: true },
      INVOCATION,
    );

    expect(errors).toEqual(['timeout']);
  });
});

// ---------------------------------------------------------------------------
// Observers that only implement some hooks
// ---------------------------------------------------------------------------

describe('composeHooks — partial observers', () => {
  it('handles observers with only onPreToolUse', async () => {
    const observer: HookObserver = {
      onPreToolUse: async () => ({ permissionDecision: 'allow' as const }),
    };

    const composed = composeHooks(observer);

    const preResult = await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(preResult!.permissionDecision).toBe('allow');

    const postResult = await composed.onPostToolUse!(makePostInput(), INVOCATION);
    expect(postResult).toEqual({});
  });

  it('handles mix of partial and full observers', async () => {
    const calls: string[] = [];

    const preOnly: HookObserver = {
      onPreToolUse: async () => { calls.push('pre-only'); return {}; },
    };
    const postOnly: HookObserver = {
      onPostToolUse: async () => { calls.push('post-only'); return {}; },
    };
    const full: HookObserver = {
      onPreToolUse: async () => { calls.push('full-pre'); return {}; },
      onPostToolUse: async () => { calls.push('full-post'); return {}; },
    };

    const composed = composeHooks(preOnly, postOnly, full);

    await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(calls).toEqual(['pre-only', 'full-pre']);

    calls.length = 0;
    await composed.onPostToolUse!(makePostInput(), INVOCATION);
    expect(calls).toEqual(['post-only', 'full-post']);
  });

  it('handles empty hooks set', async () => {
    const composed = composeHooks({}, {}, {});

    const preResult = await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(preResult).toEqual({});

    const postResult = await composed.onPostToolUse!(makePostInput(), INVOCATION);
    expect(postResult).toEqual({});
  });

  it('handles no hooks at all', async () => {
    const composed = composeHooks();

    const result = await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Error isolation
// ---------------------------------------------------------------------------

describe('composeHooks — error isolation', () => {
  it('one observer throwing does not kill others', async () => {
    const calls: string[] = [];

    const good1: HookObserver = {
      onPreToolUse: async () => { calls.push('good1'); return {}; },
    };
    const bad: HookObserver = {
      onPreToolUse: async () => { throw new Error('observer crashed'); },
    };
    const good2: HookObserver = {
      onPreToolUse: async () => { calls.push('good2'); return {}; },
    };

    const composed = composeHooks(good1, bad, good2);
    await composed.onPreToolUse!(makePreInput(), INVOCATION);

    expect(calls).toEqual(['good1', 'good2']);
  });

  it('error isolation works for onPostToolUse too', async () => {
    const calls: string[] = [];

    const good: HookObserver = {
      onPostToolUse: async () => { calls.push('good'); return {}; },
    };
    const bad: HookObserver = {
      onPostToolUse: async () => { throw new Error('post-hook boom'); },
    };

    const composed = composeHooks(bad, good);
    await composed.onPostToolUse!(makePostInput(), INVOCATION);

    expect(calls).toEqual(['good']);
  });

  it('error in lifecycle hooks does not kill others', async () => {
    const calls: string[] = [];

    const good: HookObserver = {
      onSessionStart: async () => { calls.push('good-start'); return {}; },
    };
    const bad: HookObserver = {
      onSessionStart: async () => { throw new Error('start boom'); },
    };

    const composed = composeHooks(bad, good);
    await composed.onSessionStart!(
      { timestamp: Date.now(), cwd: '/repo', source: 'startup' },
      INVOCATION,
    );

    expect(calls).toEqual(['good-start']);
  });

  it('logs warnings for observer errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const bad: HookObserver = {
      onPreToolUse: async () => { throw new Error('test-error'); },
    };

    const composed = composeHooks(bad);
    await composed.onPreToolUse!(makePreInput(), INVOCATION);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('[HookComposer]');
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Hook invocation context
// ---------------------------------------------------------------------------

describe('composeHooks — invocation context', () => {
  it('passes sessionId to all observers', async () => {
    const receivedIds: string[] = [];

    const hooks1: HookObserver = {
      onPreToolUse: async (_input, inv) => {
        receivedIds.push(inv.sessionId);
        return {};
      },
    };
    const hooks2: HookObserver = {
      onPreToolUse: async (_input, inv) => {
        receivedIds.push(inv.sessionId);
        return {};
      },
    };

    const composed = composeHooks(hooks1, hooks2);
    await composed.onPreToolUse!(makePreInput(), { sessionId: 'sess-xyz' });

    expect(receivedIds).toEqual(['sess-xyz', 'sess-xyz']);
  });

  it('passes tool input to all observers', async () => {
    const receivedTools: string[] = [];

    const hooks1: HookObserver = {
      onPreToolUse: async (input) => {
        receivedTools.push(input.toolName);
        return {};
      },
    };
    const hooks2: HookObserver = {
      onPreToolUse: async (input) => {
        receivedTools.push(input.toolName);
        return {};
      },
    };

    const composed = composeHooks(hooks1, hooks2);
    await composed.onPreToolUse!(makePreInput('powershell'), INVOCATION);

    expect(receivedTools).toEqual(['powershell', 'powershell']);
  });
});

// ---------------------------------------------------------------------------
// Decision gate via hooks
// ---------------------------------------------------------------------------

describe('decision gate pattern', () => {
  function createGateHooks(
    shouldBlock: (toolName: string) => boolean,
    reason = 'Blocked by gate',
  ): HookObserver {
    return {
      onPreToolUse: async (input: PreToolUseInput): Promise<PreToolUseOutput> => {
        if (shouldBlock(input.toolName)) {
          return { permissionDecision: 'deny', permissionDecisionReason: reason };
        }
        return { permissionDecision: 'allow' };
      },
    };
  }

  it('blocks dangerous tools via deny decision', async () => {
    const gate = createGateHooks((name) => name === 'powershell');
    const result = await gate.onPreToolUse!(makePreInput('powershell'), INVOCATION);
    expect(result!.permissionDecision).toBe('deny');
  });

  it('allows safe tools', async () => {
    const gate = createGateHooks((name) => name === 'powershell');
    const result = await gate.onPreToolUse!(makePreInput('view'), INVOCATION);
    expect(result!.permissionDecision).toBe('allow');
  });

  it('gate composes with observation hooks', async () => {
    const telemetry: string[] = [];

    const observer: HookObserver = {
      onPreToolUse: async (input) => {
        telemetry.push(input.toolName);
        return {};
      },
    };
    const gate = createGateHooks((name) => name === 'bash');

    const composed = composeHooks(observer, gate);
    const result = await composed.onPreToolUse!(makePreInput('bash'), INVOCATION);

    expect(telemetry).toEqual(['bash']);
    expect(result!.permissionDecision).toBe('deny');
  });
});

// ---------------------------------------------------------------------------
// HookComposer class — dynamic add/remove
// ---------------------------------------------------------------------------

describe('HookComposer', () => {
  it('starts with zero observers', () => {
    const composer = new HookComposer();
    expect(composer.size).toBe(0);
  });

  it('add() increases size', () => {
    const composer = new HookComposer();
    composer.add({ onPreToolUse: async () => ({}) });
    expect(composer.size).toBe(1);
    composer.add({ onPostToolUse: async () => ({}) });
    expect(composer.size).toBe(2);
  });

  it('add() returns a dispose function that removes the observer', () => {
    const composer = new HookComposer();
    const dispose = composer.add({ onPreToolUse: async () => ({}) });
    expect(composer.size).toBe(1);

    dispose();
    expect(composer.size).toBe(0);
  });

  it('remove() removes a specific observer', () => {
    const composer = new HookComposer();
    const obs: HookObserver = { onPreToolUse: async () => ({}) };
    composer.add(obs);
    expect(composer.size).toBe(1);

    composer.remove(obs);
    expect(composer.size).toBe(0);
  });

  it('remove() is a no-op for unknown observers', () => {
    const composer = new HookComposer();
    composer.add({ onPreToolUse: async () => ({}) });
    composer.remove({ onPostToolUse: async () => ({}) });
    expect(composer.size).toBe(1);
  });

  it('compose() returns a live-reference SessionHooks object', async () => {
    const composer = new HookComposer();
    const composed = composer.compose();
    const calls: string[] = [];

    // Add observer AFTER compose() — should still be called
    composer.add({
      onPreToolUse: async () => { calls.push('late-add'); return {}; },
    });

    await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(calls).toEqual(['late-add']);
  });

  it('observers removed after compose() are not called', async () => {
    const composer = new HookComposer();
    const calls: string[] = [];

    const obs: HookObserver = {
      onPreToolUse: async () => { calls.push('removed'); return {}; },
    };
    const dispose = composer.add(obs);
    const composed = composer.compose();

    dispose();
    await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(calls).toEqual([]);
  });

  it('compose() reflects dynamic changes without re-composing', async () => {
    const composer = new HookComposer();
    const composed = composer.compose();
    const calls: string[] = [];

    const obs1: HookObserver = {
      onPreToolUse: async () => { calls.push('obs1'); return {}; },
    };
    const obs2: HookObserver = {
      onPreToolUse: async () => { calls.push('obs2'); return {}; },
    };

    const dispose1 = composer.add(obs1);
    composer.add(obs2);

    await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(calls).toEqual(['obs1', 'obs2']);

    calls.length = 0;
    dispose1();

    await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(calls).toEqual(['obs2']);
  });

  it('duplicate add of same observer is idempotent', () => {
    const composer = new HookComposer();
    const obs: HookObserver = { onPreToolUse: async () => ({}) };

    composer.add(obs);
    composer.add(obs);
    expect(composer.size).toBe(1);
  });

  it('compose() with no observers produces valid no-op hooks', async () => {
    const composer = new HookComposer();
    const composed = composer.compose();

    const result = await composed.onPreToolUse!(makePreInput(), INVOCATION);
    expect(result).toEqual({});
  });
});
