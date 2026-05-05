# Roger — History

## Learnings (Phase 4.5 telemetry — 2026-05-02)

**Architecture decisions made:**
- `FeedbackSource` is the first new shared type in `@akubly/types` since Phase 2. It is the read-side complement to `TelemetrySink` (write side). To make it actually shareable I also moved `ProfileGranularity` and `ExecutionProfile` into `@akubly/types`, with `forge/telemetry/types.ts` re-exporting them so forge code keeps a single import surface.
- `OptimizationHint` and `StrategyParameters` are open-shaped (`[key: string]: unknown`) in `@akubly/types`. Concrete prescribers extend the shape without forcing a churn-prone shared schema. Preserves the ADR-P4-005 instinct while still enabling cross-package wiring.
- `LocalDBOMSink.emit()` is intentionally a no-op. The bridge event stream is consumed by collectors (HookObserver pattern, ADR-P4.5-001); only derived `SignalSample`s are worth persisting. Callers push samples via `enqueueSample()`. `emit()` exists only to satisfy the `TelemetrySink` contract.
- Auto-flush on buffer full + fail-open on persistence error are both load-bearing. Telemetry must never kill a session.

**Spec deviations worth knowing:**
- The spec accesses `event.payload?.toolName` directly, but `CairnBridgeEvent.payload` is a JSON string (see `@akubly/types` and `packages/forge/src/dbom/index.ts:276`). I added a `parsePayload()` helper that JSON-parses lazily and tolerates malformed input. Same pattern Curator and DBOM already use.
- The spec convergence formula `convergedTurn / turnCount` is degenerate when `session_completed` arrives at the last turn (always 1.0 = max drift). I followed the spec literally but the GREEN-classification test now constructs a scenario with extra turns *after* completion to actually exercise the GREEN branch. Worth raising with Graham before Phase 5.
- Spec §9.4 lists event types (`tool_call_started`, `usage_reported`, `turn_completed`, `session_completed`, `tool_call_failed`) that don't appear in the bridge `EVENT_MAP` (which uses `tool_use`, `model_call`, `turn_end`, `session_end`, etc.). Collectors are coded to the spec strings; wiring will need a thin remapper or an `EVENT_MAP` extension.

**Patterns to remember:**
- Test infra: vitest, files in `packages/forge/src/__tests__/`, ending in `.test.ts`. No setup/teardown — pure unit tests.
- Property + metamorphic tests scale well: e.g. "replaying the same usage N times scales totals by N" catches a class of off-by-N bugs without enumerating cases.
- Determinism > token cost is encoded in `DRIFT_WEIGHTS` (convergence 0.30 + toolEntropy 0.25 + promptStability 0.15 = 0.70 vs cost 0.30). Added a test asserting that inequality so any future tweak forces a conscious decision.

**Key file paths:**
- `packages/forge/src/telemetry/{types,drift,collectors,aggregator,sink,index}.ts` — the whole module
- `packages/forge/src/__tests__/telemetry-{drift,collectors,aggregator}.test.ts` — 56 tests
- `packages/types/src/index.ts` — extended with FeedbackSource + ExecutionProfile + ProfileGranularity + OptimizationHint + StrategyParameters
- `packages/forge/src/index.ts` — barrel updated to re-export telemetry surface
- Build: `npm run build`. Forge tests: `cd packages/forge; npm test`. Repo: `npm test --workspaces --if-present`. Baseline 826 → 954 (forge 476 + cairn 478).



## Learnings (2026-05-01 — Persona Review F1/F2/F4/F5/F6a/F7/F11 fixes)

Fixed 7 persona review findings on the telemetry module. All landed in one session, build green, 1012 tests passing (cairn 478 + forge 534, +24 from new collector tests + new bridge contract test).

**F1 — Aggregator overwrite bug.** `meanFromMeta()` averaged only the new batch, dropping prior history every aggregation. Replaced with a single `weightedMean(prevMean, prevCount, newSum, newCount, sessionCount)` helper applied uniformly to `meanInputTokens`, `meanOutputTokens`, `meanCacheHitRate`, `meanConvergenceTurns`, `toolErrorRate`, and the new per-signal means. Mirrors the existing `successRate` pattern. When the new batch contributes no samples for a signal, the prior mean is preserved (no deflation toward zero).

**F2 — Convergence floor of 1.0.** The old code set `convergedTurn = turnCount` at `session_completed`, guaranteeing `convergence = 1.0`. Replaced with Aaron's Option A: `convergedTurn` is set on the FIRST occurrence of either a `tool_result` event with `success === true` OR a `plan_changed` event (whichever comes first). Both come from the bridge's EVENT_MAP. If neither fires, convergence stays at 1.0 — which is now legitimately "this session never showed early progress" rather than a phantom floor. Documented the semantics in the collector docstring.

**F4 — Event-name drift between bridge and collectors.** Spec §9.4 strings (`tool_call_started`, `usage_reported`, etc.) never matched bridge EVENT_MAP keys (`tool_use`, `model_call`, `turn_end`, `session_end`, `tool_result`, `context_window`, `plan_changed`). Collectors received zero signal in production. Fixed by:
1. Introducing exported `COLLECTOR_BRIDGE_EVENTS` const that names every Cairn event the collectors react to.
2. Updating all `event.eventType` checks to use those names.
3. Splitting the old `usage_reported` handling: token counts come from `model_call`, context window comes from `context_window`. Tool errors come from `tool_result` with `success === false` rather than a phantom `tool_call_failed`.
4. New contract test `telemetry-bridge-contract.test.ts` enumerates `COLLECTOR_BRIDGE_EVENTS` and asserts every value is also a value in bridge `EVENT_MAP` — a future drift on either side fails CI fast.
5. Updated `feedback-loop.test.ts` and `telemetry-collectors.test.ts` fixtures to emit bridge-shaped events with the correct payload field names (`currentTokens`/`tokenLimit`, `totalNanoAiu` instead of `costNanoAiu`, `success` boolean).

**F5 — Per-batch percentiles.** Old p50/p95 came from sorting only the latest batch. Implemented a streaming sketch: a 100-bucket histogram of the [0,1] drift range stored on `ExecutionProfile.drift.sketch` (optional field, backward compatible). `aggregateSignals` clones+updates the sketch each call and derives p50/p95 by walking cumulative counts. Bucket midpoint precision = ±0.005, well below any threshold the prescribers care about. Sketch is omitted from the profile until the first drift sample lands so empty profiles stay clean.

**F6a — Surface signal components.** Added `signals?: ProfileSignals` to `ExecutionProfile` in `@akubly/types` (optional → backward compat with older persisted rows). Aggregator pulls `metadata.signals` from each drift sample, sums each component (`convergence`, `tokenPressure`, `toolEntropy`, `contextBloat`, `promptStability`), and folds via the same `weightedMean` helper. Prescribers can now target a specific signal instead of only the composite drift score.

**F7 — Silent error swallowing in sink.** Replaced empty catch with `console.warn` matching the bridge's `EventBridge` log format, and added `droppedCount` to the `LocalDBOMSink` interface so monitors can detect rising drop rates. Existing fail-open behavior preserved.

**F11 — typeof guards on payloads.** Added a `typeof payload.toolName === "string"` guard in the drift collector (was using truthiness + String(...)). Token collector's numeric extractor now also guards with `Number.isFinite` to reject `NaN`/`Infinity`. Added a regression test asserting non-string `toolName` payloads are silently ignored rather than recorded as `[object Object]` in tool counts.

**Patterns to remember:**
- When the collector contract spans two modules (bridge → collectors), enumerate the shared symbols in a const + a contract test. Type-level coupling alone is not enough when one side reads JSON-encoded strings.
- Streaming quantile sketches are simple when the input range is bounded — a fixed histogram beats t-digest complexity for [0,1]-valued metrics.
- `weightedMean(prev, prevCount, newSum, newCount, totalCount)` returning `prevMean` when `newCount === 0` prevents the "deflation toward zero" failure mode that bit the original `successRate` code path's siblings.

**Key file paths touched:**
- `packages/types/src/index.ts` — added `DriftSketch`, `ProfileSignals`, optional `drift.sketch` and `signals` on `ExecutionProfile`
- `packages/forge/src/telemetry/aggregator.ts` — full rewrite of mean math + sketch + signal aggregation
- `packages/forge/src/telemetry/collectors.ts` — `COLLECTOR_BRIDGE_EVENTS`, F2 convergence rewrite, F11 guards, bridge event-name updates
- `packages/forge/src/telemetry/sink.ts` — `droppedCount` + `console.warn`
- `packages/forge/src/__tests__/telemetry-bridge-contract.test.ts` — NEW
- `packages/forge/src/__tests__/telemetry-collectors.test.ts` — rewritten for bridge events
- `packages/forge/src/__tests__/feedback-loop.test.ts` — fixtures rewritten for bridge events


## 2026-05-02: Phase 4.5 Persona Review — Telemetry Module Hardening

**Findings Fixed:** F1 (weighted means), F2 (convergence), F4 (event contract), F5 (sketch), F6a (signals), F7 (sink droppedCount), F11 (typeof guards).

**Key Outputs:**
- Single source of truth for collector → bridge event mapping: COLLECTOR_BRIDGE_EVENTS const
- Contract test enforcing alignment: 	elemetry-bridge-contract.test.ts
- Per-signal component means in ExecutionProfile.signals for prescriber targeting
- 100-bucket histogram sketch for streaming quantile estimation
- Early convergence semantics: convergedTurn fires on first successful outcome signal

**Tests:** +24 new tests → Forge telemetry: 534 passing

**Downstream:** Prescribers now have signal-level granularity for targeting specific drift drivers (e.g., toolEntropy vs contextBloat).


