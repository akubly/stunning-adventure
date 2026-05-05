/**
 * Hook Composer — Merges multiple hook observers into a single handler.
 *
 * The SDK's `registerHooks()` REPLACES the current hooks object; it does not
 * stack. When multiple subsystems (telemetry, decision gates, audit logging)
 * each need to observe hook events, we compose their handlers into one
 * SessionHooks object that the SDK sees as a single registration.
 *
 * Merge semantics:
 *   - Pre-tool hooks: outputs are shallow-merged in order; last writer wins
 *     for conflicting keys (e.g., permissionDecision).
 *   - Post-tool hooks: outputs are shallow-merged in order.
 *   - Lifecycle hooks (session start/end, prompt, error): all observers are
 *     called in order; return values are ignored (the SDK doesn't use them).
 *
 * Error isolation:
 *   Each observer call is wrapped in try/catch. If one observer throws,
 *   subsequent observers still run. Errors are logged via console.warn
 *   but never propagate — a buggy telemetry observer must not kill a
 *   decision gate observer.
 *
 * @module
 */

import type {
  SessionHooks,
  PreToolUseInput,
  PreToolUseOutput,
  PostToolUseInput,
  PostToolUseOutput,
  SessionStartInput,
  SessionEndInput,
  UserPromptInput,
  ErrorInput,
  HookInvocation,
} from "../types.js";

// ---------------------------------------------------------------------------
// Hook observer — the unit of composition
// ---------------------------------------------------------------------------

/**
 * A partial set of hooks. Observers only implement the hooks they care about.
 * This is the type consumers provide to the composer.
 */
export type HookObserver = Partial<SessionHooks>;

// ---------------------------------------------------------------------------
// HookComposer — dynamic add/remove with a single composed output
// ---------------------------------------------------------------------------

/**
 * Manages a set of hook observers and produces a single composed SessionHooks
 * object. Observers can be added and removed dynamically; the composed hooks
 * reflect the current set at call time (no need to re-register with the SDK
 * unless using the static `composeHooks()` helper).
 */
export class HookComposer {
  private readonly observers: Set<HookObserver> = new Set();

  /** Add an observer. Returns a dispose function that removes it. */
  add(observer: HookObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  /** Remove a previously-added observer. */
  remove(observer: HookObserver): void {
    this.observers.delete(observer);
  }

  /** Number of registered observers. */
  get size(): number {
    return this.observers.size;
  }

  /**
   * Produce the composed SessionHooks object.
   * The returned object captures a live reference to `this.observers`,
   * so adding/removing observers after calling `compose()` takes effect
   * on the next hook invocation without needing to re-compose.
   *
   * Design note: Observers are invoked sequentially (not via Promise.all)
   * because pre-tool hooks use shallow-merge semantics where order matters
   * (last writer wins). Sequential execution guarantees deterministic merge
   * order and allows earlier observers' outputs to inform later ones.
   */
  compose(): SessionHooks {
    return {
      onPreToolUse: async (
        input: PreToolUseInput,
        invocation: HookInvocation,
      ): Promise<PreToolUseOutput> => {
        let merged: PreToolUseOutput = {};
        const snapshot = [...this.observers];
        for (const obs of snapshot) {
          if (obs.onPreToolUse) {
            try {
              const result = await (obs.onPreToolUse as (
                input: PreToolUseInput,
                invocation: HookInvocation,
              ) => Promise<PreToolUseOutput>)(input, invocation);
              if (result) merged = { ...merged, ...result };
            } catch (err) {
              console.warn(
                `[HookComposer] onPreToolUse observer threw (session=${invocation.sessionId}, tool=${input.toolName}):`,
                err,
              );
            }
          }
        }
        return merged;
      },

      onPostToolUse: async (
        input: PostToolUseInput,
        invocation: HookInvocation,
      ): Promise<PostToolUseOutput> => {
        let merged: PostToolUseOutput = {};
        const snapshot = [...this.observers];
        for (const obs of snapshot) {
          if (obs.onPostToolUse) {
            try {
              const result = await (obs.onPostToolUse as (
                input: PostToolUseInput,
                invocation: HookInvocation,
              ) => Promise<PostToolUseOutput>)(input, invocation);
              if (result) merged = { ...merged, ...result };
            } catch (err) {
              console.warn(
                `[HookComposer] onPostToolUse observer threw (session=${invocation.sessionId}, tool=${input.toolName}):`,
                err,
              );
            }
          }
        }
        return merged;
      },

      onSessionStart: async (
        input: SessionStartInput,
        invocation: HookInvocation,
      ) => {
        const snapshot = [...this.observers];
        for (const obs of snapshot) {
          if (obs.onSessionStart) {
            try {
              await (obs.onSessionStart as (
                input: SessionStartInput,
                invocation: HookInvocation,
              ) => Promise<Record<string, never>>)(input, invocation);
            } catch (err) {
              console.warn(
                `[HookComposer] onSessionStart observer threw (session=${invocation.sessionId}):`,
                err,
              );
            }
          }
        }
        return {};
      },

      onSessionEnd: async (
        input: SessionEndInput,
        invocation: HookInvocation,
      ) => {
        const snapshot = [...this.observers];
        for (const obs of snapshot) {
          if (obs.onSessionEnd) {
            try {
              await (obs.onSessionEnd as (
                input: SessionEndInput,
                invocation: HookInvocation,
              ) => Promise<Record<string, never>>)(input, invocation);
            } catch (err) {
              console.warn(
                `[HookComposer] onSessionEnd observer threw (session=${invocation.sessionId}):`,
                err,
              );
            }
          }
        }
        return {};
      },

      onUserPromptSubmitted: async (
        input: UserPromptInput,
        invocation: HookInvocation,
      ) => {
        const snapshot = [...this.observers];
        for (const obs of snapshot) {
          if (obs.onUserPromptSubmitted) {
            try {
              await (obs.onUserPromptSubmitted as (
                input: UserPromptInput,
                invocation: HookInvocation,
              ) => Promise<Record<string, never>>)(input, invocation);
            } catch (err) {
              console.warn(
                `[HookComposer] onUserPromptSubmitted observer threw (session=${invocation.sessionId}):`,
                err,
              );
            }
          }
        }
        return {};
      },

      onErrorOccurred: async (
        input: ErrorInput,
        invocation: HookInvocation,
      ) => {
        const snapshot = [...this.observers];
        for (const obs of snapshot) {
          if (obs.onErrorOccurred) {
            try {
              await (obs.onErrorOccurred as (
                input: ErrorInput,
                invocation: HookInvocation,
              ) => Promise<Record<string, never>>)(input, invocation);
            } catch (err) {
              console.warn(
                `[HookComposer] onErrorOccurred observer threw (session=${invocation.sessionId}):`,
                err,
              );
            }
          }
        }
        return {};
      },
    } as SessionHooks;
  }
}

// ---------------------------------------------------------------------------
// Static helper — one-shot composition for simple cases
// ---------------------------------------------------------------------------

/**
 * Compose multiple hook sets into a single SessionHooks object.
 * For static composition where the observer list doesn't change.
 * For dynamic add/remove, use `HookComposer` instead.
 */
export function composeHooks(...observers: HookObserver[]): SessionHooks {
  const composer = new HookComposer();
  for (const obs of observers) {
    composer.add(obs);
  }
  return composer.compose();
}
