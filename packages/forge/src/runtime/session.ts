/**
 * ForgeSession — Instrumented wrapper around a CopilotSession.
 *
 * Auto-wires the event bridge (SDK events → CairnBridgeEvent) and exposes
 * dynamic hook composition via HookComposer. Each ForgeSession owns its
 * bridge subscription lifetime and cleans up on disconnect.
 *
 * @module
 */

import type { PermissionHandler, SessionEvent } from "@github/copilot-sdk";
import type { CairnBridgeEvent, SignalSampleSink } from "@akubly/types";

import { bridgeEvent } from "../bridge/index.js";
import { HookComposer, type HookObserver } from "../hooks/index.js";
import type { ModelChangeRecord, ReasoningEffort } from "../session/index.js";
import {
  createDriftCollector,
  createTokenCollector,
  createOutcomeCollector,
  type TelemetryCollector,
} from "../telemetry/collectors.js";

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
  /** Skill identifier forwarded to all three collector factories. */
  skillId?: string;
  /** Sink that receives flushed SignalSamples at session disconnect. */
  telemetrySink?: SignalSampleSink;
  /** SDK permission handler. Runner composition roots decide policy defaults. */
  onPermissionRequest?: PermissionHandler;
  /** Optional observer for disconnect/flush ordering verification. */
  onTelemetryTiming?: (event: TelemetryTimingEvent) => void;
}

export type TelemetryTimingPhase =
  // Event-stream observation: recorded when SDK events bridge to Cairn events.
  | "session_end_observed"
  // Disconnect lifecycle observations: recorded inside ForgeSession.disconnect().
  | "sdk_disconnect_start"
  | "sdk_disconnect_end"
  | "sdk_disconnect_error"
  | "telemetry_flush_start"
  | "telemetry_flush_end"
  | "telemetry_flush_error";

const DEFAULT_TERMINAL_EVENT_DRAIN_MS = 25;
let terminalEventDrainMsOverrideForTests: number | undefined;

/** @internal Test-only seam; not re-exported from the public runtime barrel. */
export function __setTerminalEventDrainMsForTesting(value: number | undefined): void {
  terminalEventDrainMsOverrideForTests = value;
}

export interface TelemetryTimingEvent {
  sessionId: string;
  phase: TelemetryTimingPhase;
  timestamp: string;
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
  private _collectors: TelemetryCollector[] | null = null;
  private _telemetrySink: SignalSampleSink | null = null;
  private _telemetryTimings: TelemetryTimingEvent[] = [];
  private _onTelemetryTiming?: (event: TelemetryTimingEvent) => void;
  private _disconnectPromise: Promise<void> | null = null;
  private _telemetryFlushed = false;
  private readonly terminalEventDrainMs: number;
  private _terminalEventObserved = false;
  /** Pending terminal-event drain waiters resolved when session.shutdown bridges to session_end. */
  private _terminalEventResolvers = new Set<() => void>();

  constructor(
    sdkSession: SDKSession,
    hookComposer: HookComposer,
    config: ForgeSessionConfig,
    options?: {
      onDisconnect?: () => void;
      preSessionEvents?: CairnBridgeEvent[];
    },
  ) {
    this.sdkSession = sdkSession;
    this.sessionId = sdkSession.sessionId;
    this.hookComposer = hookComposer;
    this._onDisconnect = options?.onDisconnect;
    this._onTelemetryTiming = config.onTelemetryTiming;
    this.terminalEventDrainMs =
      terminalEventDrainMsOverrideForTests ?? DEFAULT_TERMINAL_EVENT_DRAIN_MS;

    // Wire telemetry collectors if a sink was provided.
    if (config.telemetrySink) {
      this._collectors = [
        createDriftCollector(config.skillId),
        createTokenCollector(config.skillId),
        createOutcomeCollector(config.skillId),
      ];
      this._telemetrySink = config.telemetrySink;
    }

    // Merge any events captured during session creation (onEvent bridge)
    if (options?.preSessionEvents) {
      this.bridgeEvents.push(...options.preSessionEvents);
      // Replay through collectors so early events (e.g. session_end emitted
      // before on() was wired) are not lost from the telemetry pipeline.
      for (const event of options.preSessionEvents) {
        if (event.eventType === "session_end") {
          this.recordTelemetryTiming("session_end_observed");
          this.signalTerminalEventObserved();
        }
      }
      if (this._collectors) {
        for (const event of options.preSessionEvents) {
          for (const c of this._collectors) {
            try {
              c.collect(event);
            } catch (err) {
              console.warn('[ForgeSession] preSessionEvent collector error', err);
            }
          }
        }
      }
    }

    // Auto-wire bridge event subscription
    const unsub = sdkSession.on((event: SessionEvent) => {
      if (this._disconnected) return;
      try {
        const bridged = bridgeEvent(this.sessionId, event);
        if (bridged) {
          this.bridgeEvents.push(bridged);
          if (bridged.eventType === "session_end") {
            this.recordTelemetryTiming("session_end_observed");
            this.signalTerminalEventObserved();
          }
          if (this._collectors) {
            for (const c of this._collectors) {
              try {
                c.collect(bridged);
              } catch (err) {
                console.warn('[ForgeSession] collector error', err);
              }
            }
          }
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
        console.warn('[ForgeSession] bridge handler error', err);
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

  /** Clean disconnect: SDK disconnect, bounded terminal-event drain, then telemetry flush. Idempotent. */
  async disconnect(): Promise<void> {
    if (this._disconnectPromise) return this._disconnectPromise;
    this._disconnectPromise = this.disconnectOnce();
    return this._disconnectPromise;
  }

  private async disconnectOnce(): Promise<void> {
    if (this._disconnected) return;
    let disconnectError: Error | null = null;

    // Keep the SDK event subscription live while disconnecting. This preserves
    // terminal events if an SDK runner emits them during sdkSession.disconnect().
    this.recordTelemetryTiming("sdk_disconnect_start");
    try {
      await this.sdkSession.disconnect();
    } catch (err) {
      disconnectError = err instanceof Error ? err : new Error(String(err));
      this.recordTelemetryTiming("sdk_disconnect_error");
    } finally {
      this.recordTelemetryTiming("sdk_disconnect_end");
    }

    await this.drainTerminalEvents();

    // Flush after SDK disconnect so terminal events emitted during disconnect
    // are observed before outcome samples are computed.
    if (!this._telemetryFlushed && this._collectors && this._telemetrySink) {
      // Collectors are non-replayable, so retrying disconnect must not flush them twice.
      this._telemetryFlushed = true;
      try {
        this.recordTelemetryTiming("telemetry_flush_start");
        for (const c of this._collectors) {
          try {
            const sample = c.flush(this.sessionId);
            if (sample) this._telemetrySink.enqueueSample(sample);
          } catch (err) {
            console.warn('[ForgeSession] collector flush error', err);
          }
        }
        await this._telemetrySink.flush?.();
        this.recordTelemetryTiming("telemetry_flush_end");
      } catch (err) {
        this.recordTelemetryTiming("telemetry_flush_error");
        console.warn('[ForgeSession] sink flush error', err);
      }
    }

    if (disconnectError) {
      this._disconnectPromise = null;
      throw disconnectError;
    }

    for (const unsub of this.eventSubscriptions) {
      try {
        unsub();
      } catch (err) {
        console.warn('[ForgeSession] unsubscribe error', err);
      }
    }
    this.eventSubscriptions = [];

    // Mark disconnected only after SDK disconnect succeeds. A failed SDK
    // disconnect leaves the session tracked so callers can retry or stop() can
    // perform best-effort cleanup without losing ownership of the SDK resource.
    this._disconnected = true;
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

  /** Return disconnect/flush ordering observations captured for this session. */
  getTelemetryTimings(): readonly TelemetryTimingEvent[] {
    return [...this._telemetryTimings];
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

  private async drainTerminalEvents(): Promise<void> {
    if (this.terminalEventDrainMs <= 0) return;
    if (this._terminalEventObserved) return;

    const terminalEvent = this.waitForTerminalEvent();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        terminalEvent.promise,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, this.terminalEventDrainMs);
        }),
      ]);
    } finally {
      terminalEvent.cancel();
      if (timeout) clearTimeout(timeout);
    }
  }

  private waitForTerminalEvent(): { promise: Promise<void>; cancel: () => void } {
    if (this._terminalEventObserved) {
      return { promise: Promise.resolve(), cancel: () => undefined };
    }

    let resolvePromise: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
      this._terminalEventResolvers.add(resolvePromise);
    });
    return {
      promise,
      cancel: () => {
        this._terminalEventResolvers.delete(resolvePromise);
        resolvePromise();
      },
    };
  }

  private signalTerminalEventObserved(): void {
    this._terminalEventObserved = true;
    for (const resolve of this._terminalEventResolvers) {
      resolve();
    }
    this._terminalEventResolvers.clear();
  }

  private recordTelemetryTiming(phase: TelemetryTimingPhase): void {
    const event: TelemetryTimingEvent = {
      sessionId: this.sessionId,
      phase,
      timestamp: new Date().toISOString(),
    };
    this._telemetryTimings.push(event);
    try {
      this._onTelemetryTiming?.(event);
    } catch (err) {
      console.warn('[ForgeSession] telemetry timing observer error', err);
    }
  }
}
