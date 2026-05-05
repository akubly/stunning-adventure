/**
 * Aggregator tests — incremental fold semantics + LocalDBOMSink behaviour.
 *
 * Properties exercised:
 *   - First aggregation (existing=null) starts a profile
 *   - sessionCount grows monotonically with new sample sessions
 *   - Aggregator returns sensible numbers when only some signal kinds present
 *   - Drift trend is "improving" when later values are lower
 *   - LocalDBOMSink buffers + auto-flushes at threshold
 *   - LocalDBOMSink swallows persistence errors (fail-open)
 *   - close() prevents further enqueues
 */

import { describe, it, expect } from "vitest";
import { aggregateSignals } from "../telemetry/aggregator.js";
import { createLocalDBOMSink } from "../telemetry/sink.js";
import type { SignalSample } from "../telemetry/types.js";

function drift(sessionId: string, value: number, skillId = "skill-A"): SignalSample {
  return {
    kind: "drift",
    sessionId,
    skillId,
    value,
    metadata: { level: "GREEN" },
    collectedAt: new Date().toISOString(),
  };
}

function token(
  sessionId: string,
  totals: { totalInput?: number; totalOutput?: number; cacheHitRate?: number; costNanoAiu?: number },
  skillId = "skill-A",
): SignalSample {
  return {
    kind: "token",
    sessionId,
    skillId,
    value: totals.costNanoAiu ?? 0,
    metadata: {
      totalInput: totals.totalInput ?? 0,
      totalOutput: totals.totalOutput ?? 0,
      cacheHitRate: totals.cacheHitRate ?? 0,
      costNanoAiu: totals.costNanoAiu ?? 0,
    },
    collectedAt: new Date().toISOString(),
  };
}

function outcome(
  sessionId: string,
  meta: { succeeded?: boolean; turnCount?: number; toolErrorRate?: number },
  skillId = "skill-A",
): SignalSample {
  return {
    kind: "outcome",
    sessionId,
    skillId,
    value: meta.succeeded ? 1 : 0,
    metadata: {
      succeeded: meta.succeeded ?? false,
      turnCount: meta.turnCount ?? 0,
      toolErrorRate: meta.toolErrorRate ?? 0,
    },
    collectedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

describe("aggregateSignals — first aggregation", () => {
  it("creates a profile with the supplied granularity + key", () => {
    const r = aggregateSignals(null, [drift("s1", 0.2)], "per-skill", "skill-A");
    expect(r.profile.skillId).toBe("skill-A");
    expect(r.profile.granularity).toBe("per-skill");
    expect(r.profile.granularityKey).toBe("skill-A");
    expect(r.profile.sessionCount).toBe(1);
    expect(r.profile.drift.mean).toBeCloseTo(0.2, 6);
  });

  it("returns samplesConsumed equal to the input batch size", () => {
    const samples = [
      drift("s1", 0.1),
      token("s1", { costNanoAiu: 500 }),
      outcome("s1", { succeeded: true, turnCount: 4 }),
    ];
    const r = aggregateSignals(null, samples, "global", "global");
    expect(r.samplesConsumed).toBe(3);
    expect(r.profile.sessionCount).toBe(1); // one unique sessionId
  });

  it("falls back to skillId='unknown' when no samples and no existing profile", () => {
    const r = aggregateSignals(null, [], "global", "global");
    expect(r.profile.skillId).toBe("unknown");
    expect(r.profile.sessionCount).toBe(0);
  });
});

describe("aggregateSignals — incremental update", () => {
  it("adds new sessionIds to sessionCount", () => {
    const first = aggregateSignals(null, [drift("s1", 0.1)], "per-skill", "skill-A");
    const second = aggregateSignals(
      first.profile,
      [drift("s2", 0.2), drift("s3", 0.3)],
      "per-skill",
      "skill-A",
    );
    expect(second.profile.sessionCount).toBe(3);
  });

  it("running drift mean approaches the underlying average", () => {
    let p = aggregateSignals(null, [drift("s1", 0.4)], "per-skill", "k").profile;
    p = aggregateSignals(p, [drift("s2", 0.4)], "per-skill", "k").profile;
    p = aggregateSignals(p, [drift("s3", 0.4)], "per-skill", "k").profile;
    expect(p.drift.mean).toBeCloseTo(0.4, 6);
  });

  it("trend is 'improving' when drift values decrease across the batch", () => {
    const r = aggregateSignals(
      null,
      [drift("s1", 0.5), drift("s2", 0.3), drift("s3", 0.1)],
      "per-skill",
      "k",
    );
    expect(r.profile.drift.trend).toBe("improving");
  });

  it("trend is 'degrading' when drift values increase", () => {
    const r = aggregateSignals(
      null,
      [drift("s1", 0.1), drift("s2", 0.5)],
      "per-skill",
      "k",
    );
    expect(r.profile.drift.trend).toBe("degrading");
  });

  it("totalCostNanoAiu accumulates across batches", () => {
    const first = aggregateSignals(
      null,
      [token("s1", { costNanoAiu: 1000 })],
      "per-skill",
      "k",
    );
    const second = aggregateSignals(
      first.profile,
      [token("s2", { costNanoAiu: 2000 })],
      "per-skill",
      "k",
    );
    expect(second.profile.tokens.totalCostNanoAiu).toBe(3000);
  });

  it("successRate folds prior successes with new ones", () => {
    const first = aggregateSignals(
      null,
      [
        outcome("s1", { succeeded: true }),
        outcome("s2", { succeeded: true }),
      ],
      "per-skill",
      "k",
    );
    expect(first.profile.outcomes.successRate).toBe(1);

    const second = aggregateSignals(
      first.profile,
      [outcome("s3", { succeeded: false }), outcome("s4", { succeeded: false })],
      "per-skill",
      "k",
    );
    expect(second.profile.sessionCount).toBe(4);
    expect(second.profile.outcomes.successRate).toBeCloseTo(0.5, 6);
  });
});

describe("aggregateSignals — partial signal kinds", () => {
  it("handles a drift-only batch without crashing on token/outcome means", () => {
    const r = aggregateSignals(null, [drift("s1", 0.2)], "per-skill", "k");
    expect(r.profile.tokens.meanInputTokens).toBe(0);
    expect(r.profile.outcomes.successRate).toBe(0);
  });

  it("preserves existing token means when the new batch has no token samples", () => {
    const seeded = aggregateSignals(
      null,
      [token("s1", { totalInput: 100, totalOutput: 50 })],
      "per-skill",
      "k",
    );
    const next = aggregateSignals(
      seeded.profile,
      [drift("s2", 0.1)],
      "per-skill",
      "k",
    );
    expect(next.profile.tokens.meanInputTokens).toBe(100);
    expect(next.profile.tokens.meanOutputTokens).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// LocalDBOMSink
// ---------------------------------------------------------------------------

describe("createLocalDBOMSink", () => {
  it("buffers samples and exposes bufferedCount", () => {
    const persisted: SignalSample[] = [];
    const sink = createLocalDBOMSink({
      persistSample: (s) => persisted.push(s),
      bufferSize: 100,
    });
    sink.enqueueSample(drift("s1", 0.1));
    sink.enqueueSample(drift("s2", 0.2));
    expect(sink.bufferedCount).toBe(2);
    expect(persisted.length).toBe(0);
  });

  it("auto-flushes when bufferSize is reached", () => {
    const persisted: SignalSample[] = [];
    const sink = createLocalDBOMSink({
      persistSample: (s) => persisted.push(s),
      bufferSize: 3,
    });
    sink.enqueueSample(drift("s1", 0.1));
    sink.enqueueSample(drift("s2", 0.2));
    expect(persisted.length).toBe(0);
    sink.enqueueSample(drift("s3", 0.3));
    expect(persisted.length).toBe(3);
    expect(sink.bufferedCount).toBe(0);
  });

  it("flush() drains the buffer", async () => {
    const persisted: SignalSample[] = [];
    const sink = createLocalDBOMSink({ persistSample: (s) => persisted.push(s) });
    sink.enqueueSample(drift("s1", 0.1));
    sink.enqueueSample(drift("s2", 0.2));
    await sink.flush!();
    expect(persisted.length).toBe(2);
    expect(sink.bufferedCount).toBe(0);
  });

  it("close() drains and rejects further enqueues", async () => {
    const persisted: SignalSample[] = [];
    const sink = createLocalDBOMSink({ persistSample: (s) => persisted.push(s) });
    sink.enqueueSample(drift("s1", 0.1));
    await sink.close!();
    expect(sink.isClosed).toBe(true);
    sink.enqueueSample(drift("s2", 0.2));
    expect(persisted.length).toBe(1);
  });

  it("fails open when persistSample throws", async () => {
    const sink = createLocalDBOMSink({
      persistSample: () => {
        throw new Error("disk full");
      },
    });
    sink.enqueueSample(drift("s1", 0.1));
    sink.enqueueSample(drift("s2", 0.2));
    await expect(sink.flush!()).resolves.toBeUndefined();
    expect(sink.bufferedCount).toBe(0);
  });

  it("emit() is a no-op (collectors handle the bridge stream)", () => {
    const sink = createLocalDBOMSink({ persistSample: () => undefined });
    expect(() =>
      sink.emit({
        sessionId: "s",
        eventType: "tool_use",
        payload: "{}",
        createdAt: new Date().toISOString(),
        provenanceTier: "internal",
      }),
    ).not.toThrow();
    expect(sink.bufferedCount).toBe(0);
  });
});
