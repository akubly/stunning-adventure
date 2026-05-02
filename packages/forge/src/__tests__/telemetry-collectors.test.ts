/**
 * Telemetry collectors — unit + metamorphic tests.
 *
 * Verifies:
 *   - Each collector ignores irrelevant events
 *   - flush() returns a well-formed sample with computed metadata
 *   - JSON-encoded payload (the real on-the-wire format) is parsed correctly
 *   - Malformed payloads do not throw
 *   - Drift collector's incremental score is consistent with a final flush
 *   - Metamorphic: replaying the same event N times scales counts linearly
 *
 * Event names match the bridge's EVENT_MAP (see telemetry-bridge-contract.test.ts):
 *   tool_use, tool_result, turn_end, model_call, context_window,
 *   session_end, plan_changed.
 */

import { describe, it, expect } from "vitest";
import type { CairnBridgeEvent } from "@akubly/types";
import {
  createDriftCollector,
  createTokenCollector,
  createOutcomeCollector,
} from "../telemetry/collectors.js";

function evt(eventType: string, payload: Record<string, unknown> = {}): CairnBridgeEvent {
  return {
    sessionId: "sess-001",
    eventType,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
    provenanceTier: "internal",
  };
}

// ---------------------------------------------------------------------------
// Drift collector
// ---------------------------------------------------------------------------

describe("createDriftCollector", () => {
  it("returns null from collect() (drift emits on flush)", () => {
    const c = createDriftCollector();
    expect(c.collect(evt("turn_end"))).toBeNull();
  });

  it("returns null from flush() when no turns have been seen", () => {
    const c = createDriftCollector();
    expect(c.flush("sess-1")).toBeNull();
  });

  it("emits a well-formed sample after at least one turn", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("session_end"));
    const s = c.flush("sess-1");
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("drift");
    expect(s!.sessionId).toBe("sess-1");
    expect(typeof s!.value).toBe("number");
    expect(s!.metadata).toMatchObject({
      level: expect.any(String),
      turnCount: 1,
      toolsUsed: 0,
    });
    expect(s!.metadata.signals).toBeDefined();
  });

  it("tracks tool entropy across multiple distinct tools", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("tool_use", { toolName: "edit" }));
    c.collect(evt("tool_use", { toolName: "view" }));
    c.collect(evt("tool_use", { toolName: "grep" }));
    const s = c.flush("sess-1")!;
    expect(s.metadata.toolsUsed).toBe(3);
    const signals = s.metadata.signals as { toolEntropy: number };
    expect(signals.toolEntropy).toBeGreaterThan(0);
    expect(signals.toolEntropy).toBeLessThanOrEqual(1);
  });

  it("uses uniform tools to drive entropy near 1.0", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    for (const tool of ["a", "b", "c", "d"]) {
      c.collect(evt("tool_use", { toolName: tool }));
    }
    const s = c.flush("sess-1")!;
    const { toolEntropy } = s.metadata.signals as { toolEntropy: number };
    expect(toolEntropy).toBeCloseTo(1, 5);
  });

  it("treats a single-tool session as zero entropy", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("tool_use", { toolName: "edit" }));
    c.collect(evt("tool_use", { toolName: "edit" }));
    const s = c.flush("sess-1")!;
    const { toolEntropy } = s.metadata.signals as { toolEntropy: number };
    expect(toolEntropy).toBe(0);
  });

  it("ignores tool_use payloads whose toolName isn't a string (typeof guard)", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("tool_use", { toolName: 42 }));
    c.collect(evt("tool_use", { toolName: { name: "edit" } }));
    const s = c.flush("sess-1")!;
    expect(s.metadata.toolsUsed).toBe(0);
  });

  it("computes contextBloat from peak / limit (context_window event)", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("context_window", { currentTokens: 500, tokenLimit: 1000 }));
    c.collect(evt("context_window", { currentTokens: 800, tokenLimit: 1000 }));
    c.collect(evt("context_window", { currentTokens: 400, tokenLimit: 1000 }));
    const s = c.flush("sess-1")!;
    const sig = s.metadata.signals as { contextBloat: number; tokenPressure: number };
    expect(sig.contextBloat).toBeCloseTo(0.8, 5);
    expect(sig.tokenPressure).toBeCloseTo(0.4, 5);
  });

  it("converges on first successful tool_result (F2 — meaningful early progress)", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("tool_result", { success: true }));
    for (let i = 0; i < 9; i++) c.collect(evt("turn_end"));
    c.collect(evt("context_window", { currentTokens: 50, tokenLimit: 1000 }));
    const s = c.flush("sess-1")!;
    expect(s.metadata.level).toBe("GREEN");
  });

  it("converges on plan_changed when no successful tool_result fires", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("plan_changed", {}));
    for (let i = 0; i < 9; i++) c.collect(evt("turn_end"));
    c.collect(evt("context_window", { currentTokens: 50, tokenLimit: 1000 }));
    const s = c.flush("sess-1")!;
    expect(s.metadata.level).toBe("GREEN");
  });

  it("ignores failed tool_result for convergence (success=false)", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("tool_result", { success: false }));
    c.collect(evt("context_window", { currentTokens: 1000, tokenLimit: 1000 }));
    const s = c.flush("sess-1")!;
    const sig = s.metadata.signals as { convergence: number };
    expect(sig.convergence).toBe(1);
    expect(s.metadata.level).toBe("RED");
  });

  it("classifies a never-converged, full-context session as RED", () => {
    const c = createDriftCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("context_window", { currentTokens: 1000, tokenLimit: 1000 }));
    const s = c.flush("sess-1")!;
    expect(s.metadata.level).toBe("RED");
  });

  it("currentScore tracks incrementally with each event", () => {
    const c = createDriftCollector();
    expect(c.currentScore).toBeNull();
    c.collect(evt("turn_end"));
    expect(c.currentScore).not.toBeNull();
    const before = c.currentScore!.score;
    c.collect(evt("context_window", { currentTokens: 999, tokenLimit: 1000 }));
    expect(c.currentScore!.score).toBeGreaterThan(before);
  });

  it("tolerates malformed payloads without throwing", () => {
    const bad: CairnBridgeEvent = {
      sessionId: "x",
      eventType: "tool_use",
      payload: "not-json",
      createdAt: new Date().toISOString(),
      provenanceTier: "internal",
    };
    const c = createDriftCollector();
    expect(() => c.collect(bad)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Token collector
// ---------------------------------------------------------------------------

describe("createTokenCollector", () => {
  it("returns null on flush when no model_call events were seen", () => {
    const c = createTokenCollector();
    c.collect(evt("turn_end"));
    expect(c.flush("sess-1")).toBeNull();
  });

  it("ignores non-model_call events", () => {
    const c = createTokenCollector();
    c.collect(evt("tool_use", { toolName: "x" }));
    c.collect(evt("turn_end"));
    expect(c.flush("sess-1")).toBeNull();
  });

  it("accumulates input/output/cache/cost across model_call events", () => {
    const c = createTokenCollector();
    c.collect(
      evt("model_call", {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 30,
        cacheWriteTokens: 20,
        totalNanoAiu: 1000,
      }),
    );
    c.collect(
      evt("model_call", {
        inputTokens: 200,
        outputTokens: 100,
        cacheReadTokens: 60,
        cacheWriteTokens: 40,
        totalNanoAiu: 2000,
      }),
    );
    const s = c.flush("sess-1")!;
    expect(s.kind).toBe("token");
    expect(s.value).toBe(3000);
    expect(s.metadata).toMatchObject({
      totalInput: 300,
      totalOutput: 150,
      totalCacheRead: 90,
      totalCacheWrite: 60,
      callCount: 2,
      costNanoAiu: 3000,
    });
    expect(s.metadata.cacheHitRate).toBeCloseTo(90 / 450, 6);
  });

  it("accepts the legacy costNanoAiu field as a fallback for totalNanoAiu", () => {
    const c = createTokenCollector();
    c.collect(evt("model_call", { inputTokens: 1, outputTokens: 1, costNanoAiu: 999 }));
    expect(c.flush("sess-1")!.value).toBe(999);
  });

  it("metamorphic: replaying the same usage N times scales totals by N", () => {
    const oneShot = createTokenCollector();
    oneShot.collect(
      evt("model_call", { inputTokens: 10, outputTokens: 5, totalNanoAiu: 100 }),
    );
    const single = oneShot.flush("s")!;

    const multi = createTokenCollector();
    for (let i = 0; i < 7; i++) {
      multi.collect(
        evt("model_call", { inputTokens: 10, outputTokens: 5, totalNanoAiu: 100 }),
      );
    }
    const seven = multi.flush("s")!;

    expect(seven.value).toBe(7 * single.value);
    expect((seven.metadata.totalInput as number)).toBe(7 * (single.metadata.totalInput as number));
    expect((seven.metadata.callCount as number)).toBe(7 * (single.metadata.callCount as number));
  });
});

// ---------------------------------------------------------------------------
// Outcome collector
// ---------------------------------------------------------------------------

describe("createOutcomeCollector", () => {
  it("emits succeeded=false when no session_end event seen", () => {
    const c = createOutcomeCollector();
    c.collect(evt("turn_end"));
    c.collect(evt("tool_use"));
    const s = c.flush("sess-1")!;
    expect(s.value).toBe(0);
    expect(s.metadata.succeeded).toBe(false);
  });

  it("emits succeeded=true when session_end seen", () => {
    const c = createOutcomeCollector();
    c.collect(evt("session_end"));
    const s = c.flush("sess-1")!;
    expect(s.value).toBe(1);
    expect(s.metadata.succeeded).toBe(true);
  });

  it("computes toolErrorRate from failed tool_result events", () => {
    const c = createOutcomeCollector();
    for (let i = 0; i < 10; i++) c.collect(evt("tool_use"));
    for (let i = 0; i < 3; i++) c.collect(evt("tool_result", { success: false }));
    const s = c.flush("sess-1")!;
    expect(s.metadata.toolErrorRate).toBeCloseTo(0.3, 6);
  });

  it("does not count successful tool_result events as errors", () => {
    const c = createOutcomeCollector();
    for (let i = 0; i < 5; i++) c.collect(evt("tool_use"));
    for (let i = 0; i < 5; i++) c.collect(evt("tool_result", { success: true }));
    const s = c.flush("sess-1")!;
    expect(s.metadata.toolErrorRate).toBe(0);
  });

  it("toolErrorRate is 0 (not NaN) when no tool calls seen", () => {
    const c = createOutcomeCollector();
    const s = c.flush("sess-1")!;
    expect(s.metadata.toolErrorRate).toBe(0);
    expect(Number.isNaN(s.metadata.toolErrorRate)).toBe(false);
  });
});
