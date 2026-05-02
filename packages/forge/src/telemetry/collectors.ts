/**
 * Telemetry collectors — observe a CairnBridgeEvent stream and extract
 * signal samples at session flush. Collectors are designed to be O(1) per
 * event so they can sit on the hot path alongside decision gates.
 *
 * Note on payload handling: `CairnBridgeEvent.payload` is a JSON string
 * (see @akubly/types). Collectors parse it lazily and tolerate malformed
 * payloads — telemetry must never kill a session.
 *
 * Event-name contract: collectors consume the *Cairn* event types produced
 * by `EVENT_MAP` in `packages/forge/src/bridge/index.ts`. The mapping in use
 * here is enumerated by {@link COLLECTOR_BRIDGE_EVENTS} so contract tests can
 * verify the collectors stay in sync with the bridge.
 */

import type { CairnBridgeEvent } from "@akubly/types";
import type { SignalSample, SignalKind } from "./types.js";
import { computeDriftScore, type DriftScore, type DriftSignals } from "./drift.js";

/**
 * The Cairn event types that collectors react to. Any event listed here
 * MUST also appear as a value in `EVENT_MAP` in
 * `packages/forge/src/bridge/index.ts`. The contract test in
 * `__tests__/telemetry-bridge-contract.test.ts` enforces this — adding a
 * name here without a corresponding bridge mapping fails CI rather than
 * silently dropping signal at runtime.
 */
export const COLLECTOR_BRIDGE_EVENTS = Object.freeze({
  /** Bridge: `tool.execution_start` → `tool_use`. Carries `toolName`. */
  toolStart: "tool_use",
  /** Bridge: `tool.execution_complete` → `tool_result`. Carries `success`. */
  toolResult: "tool_result",
  /** Bridge: `assistant.turn_end` → `turn_end`. Boundary marker. */
  turnEnd: "turn_end",
  /** Bridge: `assistant.usage` → `model_call`. Carries token counts + cost. */
  modelCall: "model_call",
  /** Bridge: `session.usage_info` → `context_window`. Carries token limits. */
  contextWindow: "context_window",
  /** Bridge: `session.shutdown` → `session_end`. Clean-shutdown marker. */
  sessionEnd: "session_end",
  /** Bridge: `session.plan_changed` → `plan_changed`. Decision-point marker. */
  planChanged: "plan_changed",
} as const);

/** Base collector interface — all collectors share this shape. */
export interface TelemetryCollector {
  readonly kind: SignalKind;
  /** Ingest a bridge event. Returns a sample if the event is relevant. */
  collect(event: CairnBridgeEvent): SignalSample | null;
  /** Flush any buffered state into a final sample at session end. */
  flush(sessionId: string): SignalSample | null;
}

/** Parse `event.payload` (a JSON string) into a record. Returns {} on failure. */
function parsePayload(event: CairnBridgeEvent): Record<string, unknown> {
  if (!event.payload) return {};
  if (typeof event.payload !== "string") {
    return event.payload as unknown as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(event.payload) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

// --- Drift Collector ---------------------------------------------------------

export interface DriftCollector extends TelemetryCollector {
  readonly kind: "drift";
  /** Current drift score (updated incrementally). */
  readonly currentScore: DriftScore | null;
}

/**
 * Create a drift collector that tracks convergence, tool entropy,
 * context bloat, and prompt stability across a session.
 *
 * Convergence semantics (F2): `convergedTurn` is set on the **first**
 * meaningful early-progress event — either a successful `tool_result` or a
 * `plan_changed` event. If neither ever fires, convergence stays at 1.0
 * (the legitimate "this session never showed early convergence" reading).
 * The earlier in the session the marker fires relative to the total turn
 * count, the lower the convergence drift contribution.
 */
export function createDriftCollector(): DriftCollector {
  const toolCounts = new Map<string, number>();
  const promptHashes = new Set<string>();
  let turnCount = 0;
  let convergedTurn: number | null = null;
  let maxContextTokens = 0;
  let lastContextTokens = 0;
  let contextLimit = 0;
  let currentScore: DriftScore | null = null;

  function updateSignals(): DriftSignals {
    const totalToolCalls = Array.from(toolCounts.values()).reduce((a, b) => a + b, 0);
    const uniqueTools = toolCounts.size;

    // Tool entropy: normalized Shannon entropy
    let entropy = 0;
    if (totalToolCalls > 0 && uniqueTools > 1) {
      for (const count of toolCounts.values()) {
        const p = count / totalToolCalls;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      entropy /= Math.log2(uniqueTools); // normalize to [0, 1]
    }

    return {
      convergence:
        convergedTurn !== null
          ? Math.min(1, convergedTurn / Math.max(turnCount, 1))
          : 1, // never converged = max drift
      tokenPressure: contextLimit > 0 ? lastContextTokens / contextLimit : 0,
      toolEntropy: Math.min(1, entropy),
      contextBloat: contextLimit > 0 ? maxContextTokens / contextLimit : 0,
      promptStability:
        promptHashes.size > 0
          ? Math.min(1, (promptHashes.size - 1) / Math.max(turnCount, 1))
          : 0,
    };
  }

  return {
    kind: "drift",
    get currentScore() {
      return currentScore;
    },

    collect(event: CairnBridgeEvent): SignalSample | null {
      const payload = parsePayload(event);

      // Track tool usage for entropy.
      if (event.eventType === COLLECTOR_BRIDGE_EVENTS.toolStart) {
        if (typeof payload.toolName === "string") {
          const name = payload.toolName;
          toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
        }
      }

      // Track turns.
      if (event.eventType === COLLECTOR_BRIDGE_EVENTS.turnEnd) {
        turnCount++;
      }

      // Track prompt template fingerprint (per turn).
      if (typeof payload.promptHash === "string") {
        promptHashes.add(payload.promptHash);
      }

      // Track context window — bridge `session.usage_info` → `context_window`,
      // payload carries `currentTokens` + `tokenLimit`.
      if (event.eventType === COLLECTOR_BRIDGE_EVENTS.contextWindow) {
        const tokens =
          typeof payload.currentTokens === "number" ? payload.currentTokens : 0;
        const limit =
          typeof payload.tokenLimit === "number" ? payload.tokenLimit : 0;
        if (tokens > maxContextTokens) maxContextTokens = tokens;
        lastContextTokens = tokens;
        if (limit > 0) contextLimit = limit;
      }

      // F2: track first meaningful early-progress event for convergence.
      // Either: a successful tool result, OR a plan-changed (decision point).
      if (convergedTurn === null) {
        if (
          event.eventType === COLLECTOR_BRIDGE_EVENTS.toolResult &&
          payload.success === true
        ) {
          convergedTurn = Math.max(turnCount, 1);
        } else if (event.eventType === COLLECTOR_BRIDGE_EVENTS.planChanged) {
          convergedTurn = Math.max(turnCount, 1);
        }
      }

      // Compute incremental drift score
      currentScore = computeDriftScore(updateSignals());

      return null; // Drift emits on flush, not per-event
    },

    flush(sessionId: string): SignalSample | null {
      if (turnCount === 0) return null;

      currentScore = computeDriftScore(updateSignals());

      return {
        kind: "drift",
        sessionId,
        value: currentScore.score,
        metadata: {
          signals: currentScore.signals,
          level: currentScore.level,
          turnCount,
          toolsUsed: toolCounts.size,
        },
        collectedAt: new Date().toISOString(),
      };
    },
  };
}

// --- Token Collector ---------------------------------------------------------

export interface TokenCollector extends TelemetryCollector {
  readonly kind: "token";
}

/**
 * Create a token collector that tracks per-model token usage,
 * cache hit rates, and cost accumulation.
 *
 * Reads from the bridged `model_call` event (SDK `assistant.usage`). The
 * bridge extractor projects `inputTokens`, `outputTokens`, `cacheReadTokens`,
 * `cacheWriteTokens`, `cost`, and `totalNanoAiu`. We accept either
 * `totalNanoAiu` or the legacy `costNanoAiu` field for compatibility with
 * pre-bridge fixtures.
 */
export function createTokenCollector(): TokenCollector {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCostNanoAiu = 0;
  let callCount = 0;

  return {
    kind: "token",

    collect(event: CairnBridgeEvent): SignalSample | null {
      if (event.eventType !== COLLECTOR_BRIDGE_EVENTS.modelCall) return null;
      const payload = parsePayload(event);

      const num = (k: string): number => {
        const v = payload[k];
        return typeof v === "number" && Number.isFinite(v) ? v : 0;
      };

      totalInput += num("inputTokens");
      totalOutput += num("outputTokens");
      totalCacheRead += num("cacheReadTokens");
      totalCacheWrite += num("cacheWriteTokens");
      totalCostNanoAiu += num("totalNanoAiu") || num("costNanoAiu");
      callCount++;

      return null; // Token emits on flush
    },

    flush(sessionId: string): SignalSample | null {
      if (callCount === 0) return null;

      const totalTokens = totalInput + totalOutput;
      const cacheHitRate = totalTokens > 0 ? totalCacheRead / totalTokens : 0;

      return {
        kind: "token",
        sessionId,
        value: totalCostNanoAiu,
        metadata: {
          totalInput,
          totalOutput,
          totalCacheRead,
          totalCacheWrite,
          cacheHitRate,
          callCount,
          costNanoAiu: totalCostNanoAiu,
        },
        collectedAt: new Date().toISOString(),
      };
    },
  };
}

// --- Outcome Collector -------------------------------------------------------

export interface OutcomeCollector extends TelemetryCollector {
  readonly kind: "outcome";
}

/**
 * Create an outcome collector that tracks session success/failure,
 * convergence turns, and tool error rates.
 *
 * "Succeeded" means the session reached `session_end` (clean shutdown via
 * SDK `session.shutdown`). Tool failures are derived from `tool_result`
 * events whose extracted payload has `success === false`.
 */
export function createOutcomeCollector(): OutcomeCollector {
  let toolCalls = 0;
  let toolErrors = 0;
  let turnCount = 0;
  let succeeded = false;

  return {
    kind: "outcome",

    collect(event: CairnBridgeEvent): SignalSample | null {
      if (event.eventType === COLLECTOR_BRIDGE_EVENTS.toolStart) {
        toolCalls++;
      }
      if (event.eventType === COLLECTOR_BRIDGE_EVENTS.toolResult) {
        const payload = parsePayload(event);
        if (payload.success === false) toolErrors++;
      }
      if (event.eventType === COLLECTOR_BRIDGE_EVENTS.turnEnd) turnCount++;
      if (event.eventType === COLLECTOR_BRIDGE_EVENTS.sessionEnd) succeeded = true;

      return null; // Outcome emits on flush
    },

    flush(sessionId: string): SignalSample | null {
      return {
        kind: "outcome",
        sessionId,
        value: succeeded ? 1 : 0,
        metadata: {
          succeeded,
          turnCount,
          toolCalls,
          toolErrors,
          toolErrorRate: toolCalls > 0 ? toolErrors / toolCalls : 0,
        },
        collectedAt: new Date().toISOString(),
      };
    },
  };
}
