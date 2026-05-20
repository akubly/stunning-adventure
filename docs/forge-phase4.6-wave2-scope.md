# Phase 4.6 Wave 2 — Wire Curator Change Vectors → Prescriber `historicalVectors`

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-05  
**Status:** Scoping — approved for implementation  
**Depends on:** Phase 4.6 Wave 1 merged (computation primitives + prescriber ranking)

---

## 1. The Gap

Wave 1 shipped two halves that don't talk to each other:

| Side | What exists | Where |
|------|------------|-------|
| **Producer** | `sweepChangeVectors()` computes change vectors for applied hints. `summarizeChangeVectors(db, category, skillId)` aggregates them into `ChangeVectorSummary` objects. | `cairn/src/agents/curator.ts`, `cairn/src/db/changeVectors.ts` |
| **Consumer** | `analyzePromptOptimizations(profile, config?, historicalVectors?)` and `analyzeTokenOptimizations(...)` accept an optional `ChangeVectorSummary[]` to boost confidence and rank by predicted impact. | `forge/src/prescribers/promptOptimizer.ts`, `tokenOptimizer.ts` |

**What does NOT exist:** No runtime code path queries `summarizeChangeVectors` and passes the result as the `historicalVectors` argument. The prescribers are always called with `historicalVectors` omitted — they run in Phase 4.5 mode at runtime.

The missing piece is an **orchestration adapter** that:
1. Accepts a skill ID (and optionally a category list)
2. Queries the Cairn DB for all relevant change vector summaries
3. Returns `ChangeVectorSummary[]` in the shape Forge prescribers expect
4. Is callable from the site(s) that invoke prescribers

---

## 2. Wiring Shape — Architectural Decision

### Option A: Direct DB query inside the applier/prescriber call site

The caller (wherever prescribers are invoked) imports `summarizeChangeVectors` from Cairn and calls it inline before passing results to the prescriber.

| Pro | Con |
|-----|-----|
| Simplest. No new abstractions. | **Violates "Forge never imports Cairn" constraint.** The call site is in Forge or in a runtime orchestrator that links both. Direct coupling. |
| Zero new code. | Cannot unit-test the prescriber call site without a real Cairn DB. |

**Verdict:** Ruled out — breaks the acyclic dependency constraint.

### Option B: `ChangeVectorProvider` port in `@akubly/types` + Cairn adapter

Define a new interface in `@akubly/types`:

```typescript
export interface ChangeVectorProvider {
  getSummaries(skillId: string): ChangeVectorSummary[];
}
```

Cairn implements this interface (adapter around `summarizeChangeVectors`). Forge's prescriber call site receives the provider via injection and calls it before invoking prescribers.

| Pro | Con |
|-----|-----|
| Respects acyclic deps — Forge depends on `@akubly/types`, Cairn implements. | Requires `ChangeVectorSummary` to move to (or be re-exported from) `@akubly/types`. |
| Testable: Forge tests inject a mock provider. | One more interface in the shared contract (but it's small). |
| Natural extension of `FeedbackSource` pattern (already in `@akubly/types`). | Slightly more wiring. |

**Verdict:** ✅ Recommended.

### Option C: Extend `FeedbackSource` with a `getChangeVectorSummaries` method

Add the method directly to the existing `FeedbackSource` interface rather than creating a new port.

| Pro | Con |
|-----|-----|
| No new interface — extends existing cross-package contract. | `FeedbackSource` is already 3 methods; adding a 4th keeps it cohesive (all are "read historical data for prescribing") but couples vector wiring to the same lifecycle. |
| Cairn already implements `FeedbackSource` (or will). | Harder to make optional — existing `FeedbackSource` implementations must add the method or it becomes optional with `?`. |
| Single injection point. | Less composable if vectors need to be sourced from a different provider in Phase 5. |

**Verdict:** Viable, but Option B is better. `FeedbackSource` answers "what happened?" while `ChangeVectorProvider` answers "what do we predict?" — different concerns. Separate ports keep them independently evolvable for Phase 5 (cloud vectors from a different source).

### ✅ Decision: Option B — `ChangeVectorProvider` port

**Reasoning:** Follows the established injection pattern (Forge never imports Cairn). Small contract surface. Composable — Phase 5 can add a `CloudChangeVectorProvider` without touching `FeedbackSource`. The `ChangeVectorSummary` type needs to move to `@akubly/types` anyway (it's the cross-package contract shape).

---

## 3. Work Decomposition

> **Note:** This section reflects the initial decomposition. After resolving Q3 (attenuation) and Q4 (call site), the authoritative decomposition is in **§6.4** which adds `PrescriberOrchestrator`, attenuation, and updates ownership.
>
> **Total: 10 items, ~27 tests. Critical path: W2-1/1b → W2-2/W2-3/W2-5 → W2-6 → W2-8.**

---

## 4. Boundary Watch

### Cross-package type movement

`ChangeVectorSummary` currently exists as **two independent copies** with identical shapes:
- `forge/src/prescribers/types.ts` (lines 18-30)
- `cairn/src/db/changeVectors.ts` (lines 90-101)

Laura's L5 regression test guards shape consistency, but this is the wrong long-term answer. Wave 2 must promote the canonical shape to `@akubly/types` and have both packages import from there.

### "Forge never imports Cairn" rule

**Not violated.** The `ChangeVectorProvider` interface lives in `@akubly/types`. Forge imports the interface; Cairn implements it. The runtime caller injects the Cairn adapter at the composition root (wherever the session lifecycle wires dependencies). This is the same pattern used for `FeedbackSource`.

### New shared type in `@akubly/types`

Two additions:
1. `ChangeVectorSummary` (type — promoted from forge/cairn duplicates)
2. `ChangeVectorProvider` (interface — new port)

Minimal surface. No breaking changes to existing exports.

---

## 5. Test Strategy

### Integration test scenario (W2-6)

```
Given: A Cairn DB with:
  - 1 skill ("skill-alpha") with execution profile (sessionCount=20)
  - 3 applied optimization_hints (categories: convergence, prompt-structure, cache-optimization)
  - Change vectors computed by sweepChangeVectors (sessionCount > minSessions)

When: The runtime prescriber orchestration runs:
  1. SqliteChangeVectorProvider.getSummaries("skill-alpha") returns 3 ChangeVectorSummary objects
  2. analyzePromptOptimizations(profile, config, summaries) is called
  3. analyzeTokenOptimizations(profile, config, summaries) is called

Then:
  - Hints with matching category+skillId have predictedImpact set
  - Hints with matching category+skillId have confidence boosted (> baseline)
  - Hints are sorted by predicted impact (matched first, unmatched after)
  - With no vectors: behavior identical to Phase 4.5 (backward compat)
  - With sparse vectors (< minSessions): confidenceBoost = 1.0 (no penalty)
```

### Negative/edge test scenarios

| Scenario | Expected |
|----------|----------|
| No change vectors in DB | Provider returns `[]`, prescribers run in Phase 4.5 mode |
| All vectors have negative net_impact | predictedImpact is negative, hints sort lower, **confidence attenuated below baseline** (Wave 2 attenuation) |
| Legacy snapshots (no sessionCount) | deltaCost = 0 in vectors; summaries still computed from remaining deltas |
| Unknown skill ID | Provider returns `[]` |
| Provider injection omitted (optional) | Prescribers called without historicalVectors — no regression |

---

## 6. Architectural Decision: Prescriber Invocation Point

### 6.1 Plan Check — What the Specs Actually Say

The Phase 4.5 spec (§9.3, §ADR-P4.5-006) defines the trigger model:

> "FeedbackSource is the read-side complement to TelemetrySink. The Forge runtime
> consults it **at session start** to load the latest profile and apply any
> pending optimizations. In Forge, the loop trigger is **manual** (Aaron's
> decision). In Cairn, the Curator can trigger optimization cycles automatically."

The spec also says (§1 data flow diagram): Curator aggregates → prescribers analyze → hints stored → applier patches SKILL.md. And the applier comment (line 1072): "Loop trigger: Manual in Forge, Curator-driven in Cairn."

**What the spec designed:** A two-path trigger model. The *prescriber* is explicitly designed as an intentional analysis step that runs on demand — not as a hook-driven automatic process. The spec imagined manual invocation in Forge (developer says "optimize this skill") and Curator-driven invocation in Cairn (the Curator's sweep triggers prescribers after aggregating enough data).

**What was NOT designed:** The spec never specified *which function or lifecycle event* triggers prescriber invocation. It describes the data flow (`profiles → prescribers → hints → applier`) but stops short of defining the call site. The prescriber functions were shipped as pure functions with well-typed inputs, exported from the barrel, but no orchestrator calls them.

**Honest assessment:** We are improvising the invocation point now. The primitives were designed intentionally — the trigger wiring was deferred. ADR-P4.6-006 made this explicit: "ship primitives only, defer runtime wiring to Wave 2." Wave 2 IS the design task for the invocation point.

### 6.2 Hookable Event Surfaces in Forge

The following are concrete event/lifecycle surfaces in Forge today:

| # | Surface | File | Events/Method | When it fires |
|---|---------|------|--------------|---------------|
| 1 | **HookComposer `onSessionEnd`** | `forge/src/hooks/index.ts:165` | SDK `session.shutdown` → composed `onSessionEnd` | End of every session. All observers called sequentially. |
| 2 | **HookComposer `onSessionStart`** | `forge/src/hooks/index.ts:142` | SDK `session.start` → composed `onSessionStart` | Start of every session. |
| 3 | **HookComposer `onPostToolUse`** | `forge/src/hooks/index.ts:117` | After every tool execution. | Per-tool (too frequent for prescribers). |
| 4 | **HookComposer `onUserPromptSubmitted`** | `forge/src/hooks/index.ts:188` | On each user message. | Per-prompt (too frequent). |
| 5 | **Bridge event stream** | `forge/src/bridge/index.ts:169` | All 22 mapped SDK event types. | Continuous — collectors already consume this. |
| 6 | **Collector `flush()`** | `forge/src/telemetry/collectors.ts:51` | Called at session end to produce final signal samples. | End of session. |
| 7 | **`LocalDBOMSink.flush()`** | `forge/src/telemetry/sink.ts` | Drains buffered samples to SQLite. | On buffer full or explicit call. |
| 8 | **`ForgeSession.disconnect()`** | `forge/src/runtime/session.ts:128` | Session teardown. | End of session lifecycle. |
| 9 | **`ForgeClient.stop()`** | `forge/src/runtime/client.ts:156` | Disconnects all sessions and stops the SDK client. | Client shutdown. |
| 10 | **Curator `curate()` sweep** | `cairn/src/agents/curator.ts:130+` | Cursor-based event processing + change vector sweep. | Cairn-driven (periodic/on-demand). |

### 6.3 Recommended Invocation Point

**For the Cairn path (automatic):** The Curator's `curate()` function already runs `sweepChangeVectors()` at line 210. This is the natural point to add prescriber invocation — after vectors are computed, call `summarizeChangeVectors` → feed to prescribers → store resulting hints. But this means Cairn calls Forge prescriber functions, which **violates the dependency direction** (Cairn cannot import Forge).

**Resolution: Prescriber Orchestrator as a new port.**

The prescriber functions are pure: `(profile, config?, vectors?) → hints`. The Cairn Curator needs to invoke this logic but can't import it. Two options:

**Option A — PrescriberOrchestrator port in `@akubly/types`:**

```typescript
export interface PrescriberOrchestrator {
  runPrescribers(
    profile: ExecutionProfile,
    historicalVectors?: ChangeVectorSummary[],
  ): OptimizationHint[];
}
```

Forge implements this (wraps `analyzePromptOptimizations` + `analyzeTokenOptimizations`). Cairn receives it via injection. The Curator calls `orchestrator.runPrescribers(profile, summaries)` after the vector sweep.

**Option B — Manual/CLI invocation in Forge only (defer Cairn-side):**

Ship a `forge optimize <skillId>` command or an MCP tool that runs prescribers manually, querying `ChangeVectorProvider` for summaries. The Cairn-driven path is deferred to later.

**✅ Recommendation: Option A for Cairn-driven, with Forge-side CLI/MCP as a follow-up.**

The spec says Cairn is the autonomous trigger. The prescriber primitives live in Forge. The `PrescriberOrchestrator` port in `@akubly/types` resolves the dependency direction cleanly — same pattern as `FeedbackSource` and `ExportQualityGate`. Forge implements, Cairn consumes via injection.

For Forge's manual trigger path (the developer-facing side), a CLI command or MCP tool can call the same orchestrator directly. This is lower priority — the Cairn autonomous path is the primary production invocation.

**Trade-off named:** Option A adds a second port to `@akubly/types` (alongside `ChangeVectorProvider`). Two new interfaces in one wave is more than Phase 4 added, but both are small (one method each) and both follow the established pattern. The alternative — having Forge export prescribers as library functions that Cairn somehow calls — is exactly what the acyclic dep constraint exists to prevent.

### 6.4 Updated Work Decomposition

This decision adds one work item and modifies W2-5:

| # | Item | Owner | Est. Tests | Depends On | Parallel? |
|---|------|-------|-----------|------------|-----------|
| W2-1 | Add `ChangeVectorSummary` type + `ChangeVectorProvider` interface to `@akubly/types` | Roger | 0 (type-only) | — | Yes |
| W2-1b | Add `PrescriberOrchestrator` interface to `@akubly/types` | Roger | 0 (type-only) | — | Yes (same PR as W2-1) |
| W2-2 | Update Forge's `ChangeVectorSummary` in prescribers/types.ts to re-export from `@akubly/types` (or alias) | Alexander | 2 (contract tests) | W2-1 | Yes (after W2-1) |
| W2-3 | Implement `SqliteChangeVectorProvider` in Cairn — adapter around `summarizeChangeVectors` that implements the `@akubly/types` port | Rosella | 4 (unit) | W2-1 | Yes (after W2-1) |
| W2-4 | Add `getAllCategories()` helper to Cairn's changeVectors CRUD — returns distinct categories for a skill | Rosella | 3 (empty, single, multi) | — | Yes |
| W2-5 | Implement `ForgePrescriberOrchestrator` in Forge — wraps both prescribers, implements the `@akubly/types` port | Alexander | 4 (both prescribers called, vector passthrough, no vectors fallback, empty profile) | W2-1b, W2-2 | Yes (after W2-1b) |
| W2-6 | Wire orchestrator into Curator's `curate()` — after `sweepChangeVectors`, query provider, call orchestrator, store hints | Rosella | 4 (with vectors, without vectors, no profile, no orchestrator injected) | W2-3, W2-4, W2-5 | No (serial) |
| W2-7 | Negative-impact attenuation — `confidenceBoost < 1.0` when `meanNetImpact < 0` in both Forge (`computeConfidenceBoost`) and Cairn (`summarizeChangeVectors`) | Alexander (forge) + Rosella (cairn) | 4 (negative attenuation, zero vectors unchanged, positive boost unchanged, boundary case) | W2-2 | Yes |
| W2-8 | Integration test: end-to-end scenario from applied hint → sweep → summarize → prescribe with vector-boosted confidence | Laura | 5 (happy path, no vectors, sparse vectors, negative impact attenuated, legacy snapshot) | W2-6, W2-7 | No (serial) |
| W2-9 | Update Cairn's `ChangeVectorSummary` to import from `@akubly/types` (remove duplicate type) | Rosella | 1 (regression) | W2-1 | Yes (after W2-1) |

**Total: 10 items, ~27 tests. Critical path: W2-1/1b → W2-2/W2-3/W2-5 → W2-6 → W2-8.**

---

## 7. Resolved Questions

| # | Question | Resolution |
|---|----------|-----------|
| Q1 | Category enumeration strategy | Data-driven: `getAllCategories()` queries distinct categories from `optimization_hints`. W2-4 stands. |
| Q2 | Performance budget | Ship 6 per-category queries. Optimize only if profiling demands. |
| Q3 | Negative-impact attenuation | **Do it now.** See §7.1 below. |
| Q4 | Call site location | `PrescriberOrchestrator` port in `@akubly/types`, Forge implements, Curator calls via injection after vector sweep. See §6. |

### 7.1 Q3 Resolution: Negative-Impact Attenuation — Do It Now

**Recommendation: Yes, implement attenuation in Wave 2.** Three reasons:

1. **Without attenuation, wiring produces actively bad behavior.** When a category has negative `meanNetImpact`, the current code assigns `predictedImpact = negative` (good — sorts it lower) but leaves `confidenceBoost ≥ 1.0` (bad — confidence stays at or above Phase 4.5 baseline). The applier's `autoApplyThreshold` checks confidence, not predictedImpact. So a hint that historically made things *worse* can still pass the auto-apply gate and get applied. That's not "no data" behavior — it's "ignoring data we have" behavior.

2. **The change is small.** Attenuation is ~5 lines in `computeConfidenceBoost` (forge) and `summarizeChangeVectors` (cairn), plus ~4 tests. Scope: when `meanNetImpact < 0`, multiply the confidence boost by a dampening factor — e.g., `Math.max(0.3, 1.0 + meanNetImpact)` — so that historically harmful prescriptions get reduced confidence proportional to how harmful they were. Clamped to 0.3 so we never completely zero out a category (allows recovery if conditions change).

3. **Deferring creates a known-bad state we'd have to document.** If we ship wiring without attenuation, we'd need a warning: "the system may auto-apply prescriptions it knows have historically degraded performance." That's a worse trade-off than 5 extra lines of code.

**Wave 1 policy context:** Aaron's original deferral was "positive boost only" in the context of shipping primitives without runtime wiring. The attenuation was safe to defer when vectors weren't consumed at runtime. Now that we're wiring them, the deferral no longer holds — the context that justified it has changed.

---

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Type promotion to `@akubly/types` breaks existing test imports | Roger/Alexander coordinate — Forge and Cairn tests update imports in the same PR |
| Two new ports in `@akubly/types` (`ChangeVectorProvider` + `PrescriberOrchestrator`) | Both are single-method interfaces, both follow established pattern. Combined surface smaller than `FeedbackSource`. |
| Curator injection of `PrescriberOrchestrator` requires a new composition root | Cairn's `curate()` is a module-level function; inject via config parameter (same pattern as `ChangeVectorConfig`). |
| Performance regression from 6 extra DB queries + prescriber analysis at sweep time | Prescribers are O(1) per category. 6 summary queries ~6ms on SQLite. Benchmark as part of W2-8. |

---

*This scoping document is approved for implementation. All open questions are resolved.*
