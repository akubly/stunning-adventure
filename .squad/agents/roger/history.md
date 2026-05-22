# Roger — History

## Summary

**Total entries:** 3 major consultations spanning Phase 4.5 telemetry + Phase 4.6 change vectors + Round 2 brain system consulting

| Date | Event | Status |
|------|-------|--------|
| 2026-05-02 | Phase 4.5 Telemetry Learnings | ✅ Completed |
| 2026-05-01 | Persona Review Fixes (F1-F7) | ✅ Completed |
| 2026-05-22 | Brain System Consulting (Round 2) | 🟡 Deliberation |

**Key themes:**
- Telemetry aggregation: meanFromMeta() fix, convergence floor, signal component surface
- Bridge event contracts: EVENT_MAP alignment, COLLECTOR_BRIDGE_EVENTS constant, contract test
- Brain system: Flipped from "extend Curator" to "NEW PACKAGE in monorepo" (pragmatic approach)

**Recent decision:** Roger recommends packages/mem/ as pragmatic new package; can extract to separate repo later if org-tier backend service is needed.

---
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


## 2026-05-03: Curator Overlap Analysis — Agentic Brain System

**Context:** Aaron considering whether a new "agentic brain/memory/thinking/learning system" belongs in Cairn repo vs separate repo. Asked me to analyze overlap with Curator.

**What I discovered:**
- The Curator is already 70% of what Aaron describes — it's a pattern-detection → insight-generation → prescription → feedback learning pipeline
- Phase 4.6 (just landed) added change_vectors — the Curator already **learns from feedback** by computing metric deltas for applied prescriptions and using those to scale future confidence
- The "missing 30%" is LLM-augmented reasoning, cross-session correlations, and contextual prescription generation — these are **extensions** of existing Curator capabilities, not a separate system
- The boundary between Curator and a new "agentic brain" is not clean:
  - Same event stream (`event_log`)
  - Same insight storage (`insights` table)
  - Same prescription contract (8-state lifecycle, human-in-the-loop, Apply Engine)
  - Same learning feedback (`change_vectors`, `execution_profiles`)
- Forking creates two competing knowledge stores with overlapping lifecycles — concept drift, user confusion, maintenance burden, learning fragmentation

**My position:** The new system belongs HERE, extending the Curator pipeline.

**Recommended path:**
- Add LLM reasoning as a fourth detector in `curator.ts` (alongside recurring errors, sequences, skip frequency)
- Trigger LLM when static detectors produce low-confidence insights or when correlations suggest causality
- Store reasoning traces in `insights.reasoning_trace` (optional JSON column, migration 013)
- Extend Prescriber with LLM-generated advice (fallback to static templates when unavailable)
- Reuse change_vectors for learning feedback — works uniformly regardless of detection method

**Phase plan suggestion:**
- Phase 8: LLM-augmented pattern detection (extend Curator)
- Phase 9: Contextual prescription generation (extend Prescriber)
- Phase 10: Cross-session reasoning + long-term memory consolidation (new Consolidator agent, same `insights` table)

**Key insight:** The Curator is not "just" a static rule engine. Phase 4.6 already made it a learning system (observe → measure → adapt). The fork/extend decision is really "do we believe pattern detection and agentic reasoning are the same problem?" I do. Extend, don't fork.

**File written:** `.squad/decisions/inbox/roger-curator-overlap-analysis.md` (detailed 10-section analysis)

**Key file paths reviewed:**
- `packages/cairn/src/agents/curator.ts` — 550-line pipeline, cursor-based, transactional, 3 pattern detectors + change vector sweep
- `packages/cairn/src/agents/prescriber.ts` — closes observe→act loop, 8-state prescription lifecycle
- `packages/cairn/src/db/changeVectors.ts` — CRUD for learning feedback (Phase 4.6)
- `packages/cairn/src/db/insights.ts` — pattern storage with evidence + confidence + lifecycle
- `packages/cairn/src/mcp/server.ts` — 10 tools exposing knowledge base to conversations


## 2026-05-03: Agentic Brain System — Position Reversal

**Context:** Aaron provided brain dump for new "agentic brain/memory/thinking/learning system" with TIERS (agent/subagent, organizational, project, user), KINDS (practical, semantic, syntactic, linguistic, symbolic, philosophical), PROPERTIES (recency, trustworthiness, plasticity), ACTIVITIES (recall, integrate, meditate, explore, ideate, dream, decide, pray, re-evaluate), REPRESENTATION (graph, cross-ref, markdown), and ACQUISITION (codebase exploration, periodic discovery, journaling).

**My prior position (2026-05-03 morning):** Extend the Curator — argued it's "already 70% of what Aaron describes" based on pattern-detection pipeline overlap.

**My revised position (2026-05-03 afternoon):** **NEW PACKAGE (`packages/mem`) in this repo.**

**Why I flipped:**

1. **TIERS problem:** Curator is project-scoped (one tier). The new system spans agent/organizational/project/user tiers (multi-scope). Extending Curator to multi-tier turns it into a universal memory router — different package.

2. **KINDS problem:** Curator's `insights` table is optimized for event-triggered practical patterns (recurring errors, sequences, skip frequency). Aaron's KINDS include linguistic (phrasing patterns), symbolic (call graphs), philosophical (judgment guidelines) — these require different evidence types (corpus stats, AST diffs, guideline text vs event IDs). Schema conflict → polyglot knowledge store → different package.

3. **ACTIVITIES problem:** Curator is a reactive event processor (cursor-based batch processing on hook triggers). Aaron's ACTIVITIES include dream/meditate/ideate/pray — proactive agents that run on schedules or prompts, reason over aggregated state. Architectural mismatch → new agentic runtime → different package.

4. **User-memory tier:** Curator is per-project. User memory is cross-project, cwd-aware. Separate concern → lives in `packages/mem/src/tiers/user.ts`, Cairn becomes project-tier delegate.

**What I got wrong in my prior analysis:**
- Conflated "pattern detection" (one slice) with "universal memory" (six-dimensional system).
- Assumed single-tier scope (project-only) when Aaron meant multi-tier (agent/organizational/project/user).
- Underestimated KINDS heterogeneity (practical vs linguistic vs symbolic vs philosophical have different evidence/consumers/lifecycles).
- Missed proactive vs reactive distinction (dream/meditate aren't event-triggered, they're scheduled/prompt-driven).

**Recommended architecture:**
- **NEW PACKAGE:** `packages/mem` in this repo (monorepo benefits, shared build/types).
- **Tier delegation:** `packages/mem/src/tiers/project.ts` wraps Cairn Curator (reads insights, surfaces via multi-tier router). Cairn stays unchanged.
- **Kinds federation:** Practical/syntactic patterns delegate to Cairn. Semantic/linguistic/symbolic/philosophical live natively in `packages/mem`.
- **Activities runtime:** Reactive activities (recall, re-evaluate) hook into Cairn's event stream. Proactive activities (dream, meditate, ideate, explore) run on schedules/prompts in new agentic runtime (`packages/mem/src/activities/index.ts`).

**Key insight:** Curator is **one specialized agent** within a broader memory system, not the system itself. Extending it to ALL tiers + ALL kinds + ALL activities breaks package boundaries. The new system is a **meta-layer** that federates Cairn (project-tier practical patterns) along with other tiers/kinds/activities.

**File written:** `.squad/decisions/inbox/roger-brain-refined.md` (detailed 8-section analysis with architecture options, Q&A on Aaron's four specific questions, and appendix on what I got wrong).

**Next steps if Aaron accepts:**
- Phase 8: Create `packages/mem` structure (tiers/kinds/activities/properties/representation/acquisition).
- Phase 8.1: Implement project-tier delegation (wrap Cairn Curator).
- Phase 8.2: Implement user-tier memory (cwd-aware routing).
- Phase 9: Implement semantic/linguistic KINDS (corpus analysis).
- Phase 10: Implement meditate/dream ACTIVITIES (proactive consolidation + speculative reasoning).

**Lesson learned:** When Aaron says "brain dump," he's describing a **system architecture**, not a feature request. My job is to map that architecture to packages/repos, not force-fit it into the nearest existing code. Bottom-up analysis (what does Curator do today?) misses top-down constraints (what does the full system require?).



## Consultation: Brain/Memory System Repo Placement (Round 2)

**Date:** 2026-05-22  
**Session:** Refined recommendation following Aaron's brain dump clarification  
**Artifact:** .squad/orchestration-log/2026-05-22T20-25-51-roger-*.md  
**Merged into:** .squad/decisions.md as "Open Question: Brain/Memory/Learning System"

### Summary

Participated in Round 2 consulting on repo placement for new agentic brain/memory/learning system. Analyzed Aaron's five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) and refined position from Round 1.

**Outcome:** Recommendation documented in .squad/orchestration-log/2026-05-22T20-25-51-roger-brain-refined.md. All deliberation merged to decisions.md for Aaron's consideration.


