/**
 * ForgeClient — Instrumented wrapper around CopilotClient (ADR-P3-001).
 *
 * Provides session lifecycle management with automatic Forge instrumentation:
 * hook composition, bridge wiring, and session tracking. All SDK interactions
 * are delegated 1:1 to the underlying CopilotClient so that SDK churn is
 * absorbed here rather than leaking into downstream code.
 *
 * @module
 */

import type { SessionConfig, SessionEvent } from "@github/copilot-sdk";
import { HookComposer, type HookObserver } from "../hooks/index.js";
import { bridgeEvent } from "../bridge/index.js";
import { ForgeSession, type ForgeSessionConfig, type SDKSession } from "./session.js";
import type { CairnBridgeEvent } from "@akubly/types";

// ---------------------------------------------------------------------------
// Minimal SDK client interface — what ForgeClient needs from the SDK
// ---------------------------------------------------------------------------

/**
 * The subset of CopilotClient that ForgeClient depends on.
 * Decouples production code from the exact SDK class so mock clients
 * satisfy the same interface.
 */
export interface SDKClient {
  createSession(config: Partial<SessionConfig>): Promise<SDKSession>;
  resumeSession(config: { sessionId: string; hooks?: unknown }): Promise<SDKSession>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// ForgeClientOptions
// ---------------------------------------------------------------------------

/** Options for creating a ForgeClient. */
export interface ForgeClientOptions {
  /** Underlying SDK client (injectable for testing). */
  sdkClient: SDKClient;
  /** Optional client name for identification. */
  clientName?: string;
}

// ---------------------------------------------------------------------------
// ForgeClient
// ---------------------------------------------------------------------------

/**
 * Wraps CopilotClient 1:1 with Forge instrumentation.
 *
 * - `createSession()` wires HookComposer + bridge into a new ForgeSession
 * - `resumeSession()` re-attaches instrumentation to an existing session
 * - `stop()` disconnects all tracked sessions then stops the SDK client
 */
export class ForgeClient {
  private client: SDKClient;
  private clientName: string;
  private sessions = new Map<string, ForgeSession>();

  constructor(opts: ForgeClientOptions) {
    this.client = opts.sdkClient;
    this.clientName = opts.clientName ?? "forge";
  }

  /** Create a new instrumented session. */
  async createSession(config: ForgeSessionConfig = {}): Promise<ForgeSession> {
    const hookComposer = new HookComposer();
    for (const obs of config.observers ?? []) {
      hookComposer.add(obs);
    }

    // Capture events emitted during session creation (before on() is wired).
    // Once ForgeSession attaches its bridge via session.on(), this path is
    // disabled to prevent duplicate events (ADR-P3-005 dedup guard).
    const preSessionEvents: CairnBridgeEvent[] = [];
    let bridgeAttached = false;
    const onEvent = (event: SessionEvent) => {
      if (bridgeAttached) return;
      const bridged = bridgeEvent("pending", event);
      if (bridged) preSessionEvents.push(bridged);
    };

    const sdkSession = await this.client.createSession({
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      workingDirectory: config.workingDirectory,
      hooks: hookComposer.compose(),
      clientName: this.clientName,
      onEvent,
    } as Partial<SessionConfig>);

    // Patch pre-session events with the real sessionId
    for (const evt of preSessionEvents) {
      (evt as { sessionId: string }).sessionId = sdkSession.sessionId;
    }

    // Disconnect any existing session with the same ID before overwriting
    const existing = this.sessions.get(sdkSession.sessionId);
    if (existing && !existing.isDisconnected) {
      try { await existing.disconnect(); } catch { /* best effort */ }
    }

    // Disable onEvent path — ForgeSession's constructor wires session.on()
    bridgeAttached = true;

    const forgeSession = new ForgeSession(sdkSession, hookComposer, config, {
      preSessionEvents,
      onDisconnect: () => this.sessions.delete(sdkSession.sessionId),
    });
    this.sessions.set(sdkSession.sessionId, forgeSession);
    return forgeSession;
  }

  /** Resume an existing session with fresh instrumentation. */
  async resumeSession(
    sessionId: string,
    config: ForgeSessionConfig = {},
  ): Promise<ForgeSession> {
    const hookComposer = new HookComposer();
    for (const obs of config.observers ?? []) {
      hookComposer.add(obs);
    }

    // No onEvent capture needed — resumeSession does not accept onEvent
    // and constructor on() wiring is synchronous within the JS event loop.
    const sdkSession = await this.client.resumeSession({
      sessionId,
      hooks: hookComposer.compose(),
    });

    // Disconnect any existing session with the same ID before overwriting
    const existing = this.sessions.get(sdkSession.sessionId);
    if (existing && !existing.isDisconnected) {
      try { await existing.disconnect(); } catch { /* best effort */ }
    }

    const forgeSession = new ForgeSession(sdkSession, hookComposer, config, {
      onDisconnect: () => this.sessions.delete(sdkSession.sessionId),
    });
    this.sessions.set(sdkSession.sessionId, forgeSession);
    return forgeSession;
  }

  /** Look up a tracked session by ID. */
  getSession(sessionId: string): ForgeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Number of tracked sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Disconnect all sessions and stop the underlying SDK client. */
  async stop(): Promise<void> {
    const errors: Error[] = [];
    for (const session of this.sessions.values()) {
      try {
        await session.disconnect();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    this.sessions.clear();
    await this.client.stop();
    if (errors.length > 0) {
      console.warn(`[ForgeClient] ${errors.length} session(s) failed to disconnect:`, errors);
    }
  }
}
