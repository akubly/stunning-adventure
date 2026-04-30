/**
 * ForgeSession — Instrumented wrapper around a CopilotSession.
 *
 * Auto-wires the event bridge (SDK events → CairnBridgeEvent) and exposes
 * dynamic hook composition via HookComposer. Each ForgeSession owns its
 * bridge subscription lifetime and cleans up on disconnect.
 *
 * @module
 */

import type { SessionEvent } from "@github/copilot-sdk";
import type { CairnBridgeEvent } from "@akubly/types";

import { bridgeEvent } from "../bridge/index.js";
import { HookComposer, type HookObserver } from "../hooks/index.js";
import type { ModelChangeRecord, ReasoningEffort } from "../session/index.js";

// ---------------------------------------------------------------------------
// ForgeSessionConfig — passed by ForgeClient at construction time
// ---------------------------------------------------------------------------

/** Configuration for creating a ForgeSession. */
export interface ForgeSessionConfig {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  workingDirectory?: string;
  /** Hook observers to compose and wire into the session. */
  observers?: HookObserver[];
}

// ---------------------------------------------------------------------------
// Minimal SDK session interface — what ForgeSession needs from the SDK
// ---------------------------------------------------------------------------

/**
 * The subset of CopilotSession that ForgeSession depends on.
 * Decouples the production code from the exact SDK type so mock sessions
 * satisfy the same interface.
 */
export interface SDKSession {
  readonly sessionId: string;
  send(params: { prompt: string }): Promise<string>;
  sendAndWait(
    params: { prompt: string },
    timeoutMs: number,
  ): Promise<SessionEvent | undefined>;
  disconnect(): Promise<void>;
  on(handler: (event: SessionEvent) => void): () => void;
}

// ---------------------------------------------------------------------------
// ForgeSession
// ---------------------------------------------------------------------------

/**
 * Wraps a CopilotSession with Forge instrumentation:
 *  - Bridge event subscription (SDK events → CairnBridgeEvent)
 *  - HookComposer access for dynamic observer add/remove
 *  - Clean disconnect with subscription teardown
 */
export class ForgeSession {
  readonly sessionId: string;
  private sdkSession: SDKSession;
  private hookComposer: HookComposer;
  private bridgeEvents: CairnBridgeEvent[] = [];
  private _modelChanges: ModelChangeRecord[] = [];
  private eventSubscriptions: Array<() => void> = [];
  private _disconnected = false;
  private _onDisconnect?: () => void;

  constructor(
    sdkSession: SDKSession,
    hookComposer: HookComposer,
    _config: ForgeSessionConfig,
    options?: { onDisconnect?: () => void; preSessionEvents?: CairnBridgeEvent[] },
  ) {
    this.sdkSession = sdkSession;
    this.sessionId = sdkSession.sessionId;
    this.hookComposer = hookComposer;
    this._onDisconnect = options?.onDisconnect;

    // Merge any events captured during session creation (onEvent bridge)
    if (options?.preSessionEvents) {
      this.bridgeEvents.push(...options.preSessionEvents);
    }

    // Auto-wire bridge event subscription
    const unsub = sdkSession.on((event: SessionEvent) => {
      if (this._disconnected) return;
      try {
        const bridged = bridgeEvent(this.sessionId, event);
        if (bridged) {
          this.bridgeEvents.push(bridged);
        }

        // Track model changes for audit trail
        if (event.type === "session.model_change") {
          const data = event.data as Record<string, unknown>;
          this._modelChanges.push({
            timestamp: event.timestamp,
            previousModel: data.previousModel as string | undefined,
            newModel: data.newModel as string,
            previousReasoningEffort: data.previousReasoningEffort as ReasoningEffort | undefined,
            newReasoningEffort: data.newReasoningEffort as ReasoningEffort | undefined,
          });
        }
      } catch (err) {
        console.warn(`[ForgeSession] bridge handler error: ${err}`);
      }
    });
    if (unsub) this.eventSubscriptions.push(unsub);
  }

  /** Send a prompt and return the message ID (fire-and-forget). */
  async send(prompt: string): Promise<string> {
    return this.sdkSession.send({ prompt });
  }

  /** Send a prompt and block until the session produces a response event. */
  async sendAndWait(
    prompt: string,
    timeoutMs = 30_000,
  ): Promise<SessionEvent | undefined> {
    return this.sdkSession.sendAndWait({ prompt }, timeoutMs);
  }

  /** Clean disconnect: unsubscribe bridge, then SDK disconnect. Idempotent. */
  async disconnect(): Promise<void> {
    if (this._disconnected) return;
    this._disconnected = true;
    for (const unsub of this.eventSubscriptions) unsub();
    this.eventSubscriptions = [];
    await this.sdkSession.disconnect();
    this._onDisconnect?.();
  }

  /** Whether this session has been disconnected. */
  get isDisconnected(): boolean {
    return this._disconnected;
  }

  /** Return a snapshot copy of all bridge events captured so far. */
  getBridgeEvents(): readonly CairnBridgeEvent[] {
    return [...this.bridgeEvents];
  }

  /** Return a snapshot copy of all model change records. */
  get modelChanges(): readonly ModelChangeRecord[] {
    return [...this._modelChanges];
  }

  /** Expose the HookComposer for dynamic observer management. */
  getHookComposer(): HookComposer {
    return this.hookComposer;
  }

  /** Add an observer to the live HookComposer. Returns a dispose function. */
  addObserver(observer: HookObserver): () => void {
    return this.hookComposer.add(observer);
  }

  /** Remove an observer from the live HookComposer. */
  removeObserver(observer: HookObserver): void {
    this.hookComposer.remove(observer);
  }
}
