📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe

📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §8 (Applier + DecisionGate) + §12 (Copilot SDK Integration) FINAL. **CRITICAL FINDING:** Copilot SDK does NOT expose attention metadata; v1 ships `commitmentMethod: 'fallback'` exclusively. Forward-compat door locked for future providers. Phase 2 coordination: Roger (appendFenced surface). Synthesis review: YELLOW, 2 findings routed (12b to Roger §10, 6b to Valanice §9). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) L0/L1 `causalContextWindow` declaration contract (R2-1 hybrid, B-with-A-fallback); (2) `BootstrapPayload.literalContext` extraction at session bootstrap (R2-2). Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:16:40Z): **Wave 0 complete** — canonical types in @akubly/types, getAllCategories helper in Cairn. category field reconciled to OptimizationCategory union. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Alexander — History

## Learnings (2026-05-26: Eureka-Crucible Runtime Overlap Analysis)

### Eureka SDK Relationship & Integration Shape
Eureka does NOT consume the Copilot SDK directly. Eureka is SDK-agnostic; it receives `SessionId` as a correlation token only. The SDK relationship is mediated through Crucible: Crucible's L0 boundary wraps SDK, Crucible's message loop calls Eureka as a library, Crucible's L1 ledger records Eureka invocations as primitives. **Recommended integration shape: Eureka-as-library-to-Crucible** (lowest cost, preserves hermetic replay, no session lifecycle conflicts). Out-of-process shapes (MCP server, daemon) break hermetic boundary because Eureka state lives outside L1 WAL.

### Session Model Dual Lenses & Correlation
Both Crucible and Eureka own "session" but through different lenses: Cairn = operational lifecycle (when, where, status), Eureka = epistemological (what was learned, continuity). Both reference the same `SessionId` brand (shared identifier from `@akubly/types`), but storage/schema remain independent. No runtime cross-DB queries (Eureka FR-7.2 hard rule). Reconciliation is offline-only via `eureka reconcile` CLI. **Critical integration gap:** Crucible must explicitly call `eureka.session.flushHints()` before session-end or Eureka US-2 (cross-session continuity) fails for 100% of sessions (Eureka AC-2.5 caller-cooperation contract).

### Hermetic Replay Extension to Eureka
Crucible's hermetic replay boundary (v1 commitment #4) extends to Eureka IF integrated as library. Eureka calls recorded as L1 primitives with full inputs/outputs; replay re-invokes Eureka library deterministically (BM25 scoring is deterministic, no LLM calls in Eureka v1). **Snapshot contract extension required:** Eureka storage state (`~/.copilot/eureka/agent.db`) must be snapshotted alongside Cairn's `knowledge.db` for full replay fidelity. Document in Crucible snapshot contract: "Replay requires both DBs from snapshot point."

### Sweep Lifecycle Coupling & Trigger Authority
Eureka's sweep (importance decay, tier demotion, edge population) is caller-driven in v1 (heuristic: end-of-session inferred from `end()` call or first-query-of-next-session catch-up). Crucible owns authoritative session lifecycle (Cairn `sessions.ended_at`). **Mismatch risk:** Crucible ends session, Eureka never sweeps because no one called `eureka.session.end()`. **Mitigation:** Wire Crucible's session-end hook (`sessionStart.ts`) to call `eureka.session.end(session_id)` + `sweep()` synchronously. v1.5 may subscribe to Cairn session-end events (Eureka PRD Edgar R8 §2), but that adds runtime coupling and violates Eureka Path D (ship standalone, defer Cairn coupling). Synchronous hook call is simpler and guarantees sweep fires.

---

## 2026-05-23: Skillsmith Harness — User Stories (v1 ideation)

**Mission:** Big-think programmatic/SDK-first stories for Crucible + runtime-as-platform. Target: Aaron only (v1). Lens: What does agentic harness enable when driveable, embeddable, and composable?

### User Stories

## US-A-1: Drive Crucible from CI/scripting (Programmatic invocation)
**Story:** As Aaron, I want to invoke Crucible harness as a library from Python/Node/Go scripts and CI pipelines, so that agentic workflows integrate into existing automation without requiring interactive shell.
**Ambition:** Turn the harness from a CLI tool into an embedded SDK—callable from anywhere, with full control over model selection, skill loading, and artifact routing.
**Chambers touched:** Crucible (message API), Cairn (primitive export), extensibility hook surface
**Runtime/SDK implication:** Crucible must expose a synchronous/async procedural API (`invoke(request, config)`) in addition to CLI; primitives must be serializable for cross-process/cross-language handoff.

## US-A-2: Crucible as multi-agent conductor (Orchestration & delegation)
**Story:** As Aaron, I want Crucible to launch, wire, and coordinate Copilot CLI agents, MCP servers, and custom sub-tasks concurrently, with turn-level visibility into each sub-agent's state, so that I can decompose complex work across specialized agents without manual coordination.
**Ambition:** Make Crucible the control plane—not just a single agent, but a runtime that spawns, monitors, and re-wires other agents mid-turn based on Observations and Decisions.
**Chambers touched:** Crucible (sub-agent lifecycle), Cairn (shared primitives across agents), Mirror (agent state reflection)
**Runtime/SDK implication:** Sub-agent spawning must be first-class: persistent handles, non-blocking wait, mid-turn handoff of Requests/Observations; Cairn must support cross-agent primitive references.

## US-A-3: Replay + transform — Re-run recorded turns with new models/skills (Turn replay & experimentation)
**Story:** As Aaron, I want to select a recorded turn from Cairn, re-run it with a different LLM provider or different skill set, and compare outcomes side-by-side without replaying the whole context, so that I can A/B test models and optimizations iteratively.
**Ambition:** Turn Cairn into a replay surface—recorded turns become immutable experiments that can be remixed and reinterpreted.
**Chambers touched:** Cairn (thick turn storage + replay index), Crucible (replay driver), Forge (model selection + skill binding)
**Runtime/SDK implication:** Cairn must store turn provenance (model, skills, parameters); Crucible must expose `replayTurn(turnId, config: ModelConfig | SkillSet)` to re-run with alternate bindings; decision/artifact output must be queryable for comparison.

## US-A-4: Alchemist experiments as background + integration (Long-running async + foreground sync)
**Story:** As Aaron, I want to spawn long-running Alchemist variant experiments (e.g., multi-model tournaments, refactoring trials) in the background while continuing to work in the foreground, and pull in results/observations when ready, so that slow compute doesn't block interactive flow.
**Ambition:** Decouple experiment cycle time from user interaction—experiments run autonomously, Cairn collects observations, Crucible foreground polls results non-intrusively.
**Chambers touched:** Alchemist (variant generator), Cairn (observation accumulation), Curator (background trigger), Crucible (result polling API)
**Runtime/SDK implication:** Alchemist must expose non-blocking spawn with return handle; Cairn must support background observation writes; Crucible must provide `pollResults(experimentId)` and `whenReady(experimentId)` for foreground/background sync.

## US-A-5: Compose harnesses — Chain, nest, run concurrently across projects (Composability)
**Story:** As Aaron, I want to chain multiple Crucible harnesses together (output of one feeds input to next), nest them (harness calls harness), or run them concurrently across different codebases, with shared Cairn observations and unified artifact lineage, so that multi-project workflows feel like a single composed system.
**Ambition:** Treat harnesses as composable primitives—not monolithic, but pluggable into larger orchestrations.
**Chambers touched:** Crucible (composition entry point), Cairn (distributed ledger mode), Mirror (cross-harness introspection)
**Runtime/SDK implication:** Crucible must support hierarchical invocation with lexical scoping of Cairn; artifact routing must trace lineage across harness boundaries; Cairn must support federated observation collection.

## US-A-6: Mirror-driven workflow introspection + trust building (Reflective visibility & debugging)
**Story:** As Aaron, I want Mirror to surface the full decision tree of a turn—what Observations triggered which Decisions, why Forge ranked options that way, which skills were evaluated and rejected—so that I can audit harness reasoning, build trust in recommendations, and debug unexpected behaviors.
**Ambition:** Make harness reasoning transparent and queryable—not a black box, but an inspectable artifact.
**Chambers touched:** Mirror (decision tree surface), Cairn (decision provenance storage), Crucible (introspection API)
**Runtime/SDK implication:** Every Decision and Observation must be stored with full provenance chain (source, inputs, confidence); Mirror must expose graph query API (`decisions(filter)`, `whyRejected(option)`) for interactive inspection.

## US-A-7: Curator as event-driven automation (Triggering from external signals)
**Story:** As Aaron, I want Curator to listen for external signals (git webhooks, file watchers, scheduled events, Slack messages) and autonomously invoke Crucible workflows in response—e.g., "when PR opens, analyze code; when test fails, debug"—so that agentic work happens without explicit manual invocation.
**Ambition:** Make the harness reactive—not just request/response, but event-driven and autonomous.
**Chambers touched:** Curator (signal listener + routing), Crucible (async trigger invocation), Cairn (event provenance)
**Runtime/SDK implication:** Curator must expose plugin/hook API for external signal adapters; Crucible must support async fire-and-forget invocation with correlation tracking.

## US-A-8: Multi-provider, multi-skill experimentation workspace (Optimization + A/B testing)
**Story:** As Aaron, I want Forge to generate and manage a suite of model/skill combinations (Claude 3.5 + ReflectSkill, GPT-5 + SecurityReview, Llama + TaskPlanner), run Crucible in parallel against each variant for the same task, and report performance/quality deltas, so that I can empirically validate which combination works best for a given workflow.
**Ambition:** Make the harness a tuning laboratory—not fixed to one model or skill configuration, but an experimentation workbench.
**Chambers touched:** Forge (variant generation + ranking), Crucible (multi-config parallel invoke), Cairn (comparative metrics)
**Runtime/SDK implication:** Crucible must support batch invoke with variant configs; Cairn must expose metrics query (tokens used, latency, success rate, quality score) for comparative analysis.

## US-A-9: Artifact routing + transformation pipelines (Composable artifact flows)
**Story:** As Aaron, I want to define artifact routing rules (e.g., "Decisions → code-review skill", "Questions → research agent", "Observations → Cairn + Slack + email") and transformation pipelines (e.g., "artifact → format for MCP → call remote service"), so that harness outputs flow autonomously to the right downstream systems.
**Ambition:** Turn artifacts into first-class flows—not just terminal output, but routable, transformable, and composable.
**Chambers touched:** Crucible (artifact routing root), Cairn (routing rule storage), Curator (executor), extensibility hook surface
**Runtime/SDK implication:** Primitives must be strongly typed and declaratively routable; Crucible must expose routing DSL or plugin API; artifact transformers must be chainable and composable.

## US-A-10: Harness-as-MCP-server (Crucible drives external tools, external tools drive Crucible)
**Story:** As Aaron, I want Crucible to expose itself as an MCP server (so other clients can invoke it, query Cairn, subscribe to events) and simultaneously act as an MCP client (calling remote resources, integrating external tools seamlessly), so that the harness becomes a first-class peer in a larger MCP ecosystem.
**Ambition:** Break down the boundary between Crucible and the broader agent ecosystem—true bidirectional integration.
**Chambers touched:** Crucible (MCP server surface), MCP client integration, Cairn (remote primitive access), extensibility hook surface
**Runtime/SDK implication:** Crucible must implement MCP protocol for resources (Primitives), tools (invoke, replay, compose), and notifications (state changes); MCP client calls must be transparently logged to Cairn.

---

# Alexander — History

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to `.squad/decisions.md`. Key scope decisions:
- **ChangeVectorProvider** port with async return type for Phase 5 cloud readiness
- **Wave 2/3 split:** Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3 (requires composition-root decision)
- **Hint deduplication** via `(skillId, source, category)` key with active-status filter
- **Two-layer negative-impact attenuation:** Confidence scaling + eligibility flag (`autoApplyEligible`)

Decisions archived; all decisions.md > 20KB now. Ready for implementation on Wave 2 primitives (computation + ranking only; runtime wiring follows in Wave 3).

---

## Core Context


**Role:** SDK/Runtime Dev  
**Joined:** 2026-04-28  
**Specialization:** Monorepo migration patterns, circular dependency resolution, migration framework expertise, prescriber CRUD integration

**Key Patterns Mastered:**
- Migration framework: single `migration.up(db)` with all DDL, versioning tied to filename, idempotent re-runs via `schema_version` table
- Circular dependency management: Cairn↔Forge import constraint solved via mirror + regression test guard (Laura L5)
- CRUD patterns: explicit `db` parameter for transactional control vs internal getDb() calls; anti-join for compute-once guards
- Type field naming: encode semantic space (confidence level vs confidenceBoost multiplier) to prevent latent traps
- Two-tier sort partition (matched vs unmatched) for correct ranking when optional keys diverge negative
- Lockout-routing pattern: cross-assignment fixes prevent author bias; each agent fixes other's code per review

**Recent Work (Phase 4.6 W1–3):**
- Wave 1: A1–A4 completed (migration 012, schema v12, changeVectors CRUD, Curator sweep integration); weight constants decision: mirror in cairn + L5 guard
- Wave 3: Lockout-fixed Rosella's prescriber code (confidence → confidenceBoost); extracted duplicate sort to utils.ts; 3 advisory fixes (safeMin guard, JSDoc, DRY)
- Current: Wave 2 owner for @akubly/types — promote ChangeVectorSummary, define ChangeVectorProvider port, implement SqliteChangeVectorProvider in Cairn

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — @akubly/types Port + Cairn Adapter

Wave 2 scope amended: `docs/forge-phase4.6-wave2-scope.md` updated with PrescriberOrchestrator port + negative-impact attenuation. New ADR merged to `.squad/decisions.md`. Invocation point: `Curator.curate()` post-vector-sweep. Attenuation: when `meanNetImpact < 0`, `confidenceBoost` ≤ 1.0 (minimum 0.3), preventing auto-apply of harmful prescriptions.

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — @akubly/types Port + Cairn Adapter

---

## 2026-05-01: Finding 8 — FeedbackSource.getProfile granularityKey

**Problem:** `FeedbackSource.getProfile(skillId, granularity?)` couldn't address per-user / per-model profiles. DB key is `(skill_id, granularity, granularity_key)`.

**Fix:** Added optional `granularityKey?: string` third parameter. Updated JSDoc with per-tier semantics (user id for per-user, model id for per-model, 'global' default).

**Verification:** `npm run build` clean; `npm test` 512/512 passing. No call sites changed (optional, additive).

**Lesson:** Treat unexpressive shared contracts as bugs, not feature gaps — additive optional parameters carry low risk.

---

## 2026-05-03–04: Phase 4.6 Waves 1 & 3 Summary

**Wave 1 (Foundation):** A1–A4 completed. Decision: mirror weight constants in cairn + Laura L5 regression test to guard against drift. Curator sweep integration: post-event-loop call, not per-batch, keeps transaction model clean.

**Wave 3 (Lockout Fixes):** Fixed Rosella's prescriber code—renamed `confidence` → `confidenceBoost` (semantic distinction: level vs multiplier). Extracted 8-line duplicate sort block from both prescribers to `utils.ts` (12 lines removed, one call each).

**Key Lesson:** Advisory findings surface edge cases (null checks, boundary behavior) that happy-path code misses. Cycle 3's `safeMin` guard (`minVectors=0` → denominator `Math.log(1) = 0`) is exactly this.

**Build status:** 1153 tests passing (baseline 990 + 163 new). Branch review-clean, all cycles complete.

---

## 2026-05-22: Wave 3 Integration Analysis — Curator–MCP Wiring Mapped

Completed comprehensive integration surface analysis for Wave 3 Curator-driven orchestration. All five requested sections delivered:

**1. Curator surface today:**
- `curate(changeVectorConfig?)` exports from `packages/cairn/src/agents/curator.ts`; returns `CurateResult` with `changeVectorSweep` metadata
- Call sites: `sessionStart.ts:68` and `mcp/server.ts:327` (both read-only in Wave 2)
- Vector sweep identifies skills with newly computed categories; invocation hook for Wave 3 injector

**2. Profile selection strategy (three independent dimensions):**
- **Trigger set:** Trigger-driven (skills with new vectors) vs. global vs. hybrid batching. **Recommended:** Trigger-driven for v1.
- **Granularity tier:** Per-skill only vs. all tiers. **Recommended:** Per-skill only (matches vector computation scope).
- **Skip conditions:** No profile, immature sessionCount, stale profile. **Recommended:** v1 skips on no-profile or `sessionCount < minSessions`.
- Operators observe: skills processed, skipped, hint volume, dedup stats.

**3. MCP tool shape:** `run_prescriber_optimization(force?: boolean)` with output: success, skills processed, hints (generated/inserted/dedup'd), vector applicability, next steps.

**4. Curator config surface:** Backward-compatible signature addition: `curate(changeVectorConfig?, prescriberOrchestrationConfig?)`. Orchestrator is an injectable dependency (`runForSkill` function + optional profile loader). Composition root constructs and passes it.

**5. ADR blockers identified:**
- Composition root choice (A–D from Roger's track) gates implementation
- Hook vs. MCP tool vs. both (invocation model)
- Eager vs. lazy Forge import (startup cost, optional dependency handling)
- Profile expansion (explicit skill list, global tier fallback, staleness) deferred to Wave 4

Analysis is **mechanical once composition root is decided**. Hard parts (data plumbing, attenuation, dedup) already in Wave 2. Full report: `.squad/agents/alexander/wave3-integration-analysis.md`.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Clean separation, best test isolation, Phase 5-ready. Unblocks all Wave 3 work items.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool exposure in Wave 3. Curator hook is autonomous surface; `forge-prescribe` CLI is manual surface. `run_prescriber_optimization` MCP tool deferred to later wave when concrete operator need surfaces. Removes ~7 items, ~18 tests from Wave 3 scope.
- **W3-D4: Curator Hook → Always-On** — Automatic prescriber orchestration invocation enabled always. No opt-in flag in v1. Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) sufficient. Profile selection trigger-driven only; global tier fallback deferred to Wave 4.

## Learnings (2026-05-22: Wave 3 Integration Analysis — Curator–MCP Wiring Mapped)
- Keeping Forge's local `OptimizationCategory` union in place is safe for W2-2 because Roger canonized the shared union to match Forge's stricter category set; the barrel contract stays structurally compatible in both directions.
- Added `packages/forge/src/prescribers/types.contract.test.ts` with two guards: barrel-vs-canonical type assignability and a prompt-prescriber regression using a canonical summary carrying `autoApplyEligible`. Validation passed with `npm run build` from repo root and `npm test --workspace=@akubly/forge` (599 passed, 3 todo).
- `runForgePrescribers()` now lives in `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts`, queries an optional `ChangeVectorProvider`, and returns the combined prompt/token hint list without dedup or persistence.
- Forge attenuation semantics are now: mature vectors with `meanNetImpact <= -0.2` attenuate confidence to `max(0.1, 1 + meanNetImpact)` and force `autoApplyEligible = false`; sparse negatives or mature negatives above `-0.2` stay neutral at `confidenceBoost = 1.0`.
- `autoApplyEligible` is stored on matched hints both as a top-level field and in `hint.evidence.autoApplyEligible`; unmatched hints omit the field so Phase 4.5 callers still read absence as eligible.
- Added `packages/forge/src/prescribers/forgePrescriberOrchestrator.test.ts` with ten cases (nine maturity-gradient scenarios plus provider-failure fallback); validation passed with `npm test --workspace=@akubly/forge` (609 passed, 3 todo), root `npm test`, and root `npm run build`.
- Negative-impact auto-apply gating is now inclusive at `<= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (`-0.2`), keeping exact-boundary cases on the manual-review side because the safety asymmetry favors false positives over false negatives.
- Wave 3 integration is **injection-based**: Curator accepts an optional orchestrator config (not a direct Forge import). This preserves the acyclic dependency boundary and allows composition root to wire both packages independently. The orchestrator is a simple function pointer (`runForSkill`), not a class — keeps it lightweight and testable.

## Learnings (2026-05-23 — W3-3 Prescriber orchestration types)
- `ExecutionProfile` was already canonized in `@akubly/types`, so W3-3 should extend that package in place instead of duplicating or structurally mirroring the shape from Cairn. That keeps the dependency boundary acyclic and avoids type drift between Curator, Forge, and the composition root.
- `loadProfile` stays **synchronous** for Wave 3 because today's loader shape (`FeedbackSource.getProfile()` and Cairn DB accessors) is synchronous. If Phase 5 cloud/profile fetching makes this async later, evolve the shared contract then rather than widening early without a caller.
- `packages/skillsmith-runtime/src/index.ts` now re-exports the canonical `PrescriberOrchestrationConfig` / `PrescriberRunResult` types from `@akubly/types`; W3-5 can wire real implementations against those exports without changing the scaffold API.
- W3-4 should consume `PrescriberOrchestrationConfig.loadProfile()` as an optional sync hook and treat null as a skip path; W3-5 should return `PrescriberRunResult` counts aligned with Forge's raw hint generation and Cairn dedup/persistence outcomes.

## Learnings (2026-05-23 — W3-5 Prescriber orchestration factory)
- Extracted a shared `executePrescriberRun()` helper in `packages/skillsmith-runtime/src/index.ts` so both `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` reuse the same provider → Forge prescriber → dedup/persist pipeline. The CLI keeps its Wave 2 result contract and global fallback behavior, while the Curator-facing factory stays a thin adapter.
- Factory profile loading is **per-skill only** and `runForSkill()` calls the exact same `loadProfile` closure it exposes. Missing profile or `sessionCount < minSessions` returns a zero-count `PrescriberRunResult` as the skip semantic; W3-6 does not need an extra skip flag.
- `CreatePrescriberOrchestrationConfigOpts` now accepts either an owned SQLite handle (`db`) or `dbPath`; local row loading avoids Cairn singleton coupling when the caller already has a DB connection.

## Learnings (2026-05-23 — W3-4 curate() signature extension)
- `curate()` had to become `async` because `PrescriberOrchestrationConfig.runForSkill()` is async. That propagated to every live sync consumer: `packages/cairn/src/hooks/sessionStart.ts`, `packages/cairn/src/mcp/server.ts`, Cairn curate tests, and Forge's `wave2-pipeline` integration test now all `await` the Curator result.
- The smallest viable trigger signal is a distinct `computedSkillIds` array on `ChangeVectorSweepResult`, populated only when a new change vector row is inserted this sweep. That keeps W3-4 trigger-driven without re-querying history or inventing a second notion of eligibility.
- `minSessions` should come from the existing `ChangeVectorConfig.minSessionsObserved` fallback chain (`DEFAULT_MIN_SESSIONS`), and Curator should pass that same value into `runForSkill(skillId, minSessions)` so vector gating and prescriber gating stay aligned. Curator itself should not pre-filter via `loadProfile()`; skip semantics stay inside the orchestrator closure.
- The qualifying-skill list should be sorted before orchestration/tests consume it. SQLite's natural row order is not a contract, so sorting `computedSkillIds` prevents flaky call-order assertions and keeps operator output stable.
- Fail-open needs to be visible in two places: `console.warn` for operators and an inline `PrescriberRunResult` error row (`hintsGenerated/Inserted/Duplicated = 0`, `hintsError = 1`) so W3-5/W3-6 can surface partial-success counts without special-case plumbing.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**W3-3, W3-4, W3-5 shipped:**
- W3-3: `PrescriberOrchestrationConfig` + `PrescriberRunResult` types canonized in `@akubly/types`
- W3-4: `curate()` async, trigger-driven orchestration loop, fail-open semantics, 4 new + 32 updated tests
- W3-5: Shared `executePrescriberRun()` helper extracted; `createPrescriberOrchestrationConfig()` factory wired; Cairn `getExecutionProfileWithDb()` convenience added

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Skillsmith-Runtime: 6/6 passing

Wave 3 delivers fully-realized Curator-driven orchestration. Type contracts locked in `@akubly/types`. Per-skill execution pipeline centralized. Factory ready for W3-6 hook wiring.

---

## Learnings (2026-05-23 — Harness Vision Runtime Analysis)
- Vision defines six chambers (Harness, Cairn, Forge, Geneticist, Curator, Narrator) but doesn't specify runtime execution model for the Harness chamber itself. Turn structure, tool invocation loop, model routing, and sub-agent spawning are orthogonal to chamber responsibilities — these are runtime execution concerns.
- Prior art (ReAct, OpenHands, LangGraph, AutoGen, Aider, Claude Computer Use SDK) converges on common patterns: (1) ReAct-style thought→action→observation loops with history-based reasoning, (2) explicit state persistence across turns, (3) structured turn management with message passing, (4) conditional sub-agent spawning based on state, (5) approval gates embedded in execution loop before risky actions, (6) model routing policies (rule-based or context-driven).
- Core unresolved execution tensions: (a) Single persistent loop vs. ephemeral sub-agent spawns, (b) Tool selection authority (LLM decides vs. orchestrator routes), (c) Primitive recording timing (pre-execution vs. post-execution vs. both), (d) Decision ledger write-ahead vs. write-behind semantics, (e) Sub-agent context inheritance (isolated vs. full parent state), (f) Approval gate blocking semantics (user prompt vs. queue-and-continue), (g) Model routing trigger conditions (per-turn vs. per-skill vs. capability-based).
- Key questions emerge around turn atomicity (what's the unit of replay?), state shape (what gets serialized between turns?), tool execution ownership (inline vs. delegated to sub-agents), and primitive recording hooks (orchestrator vs. model middleware).

---

## 2026-05-24: Turn Definition Survey — Prior Art & Recommendation for Harness

**Requested by:** Aaron Kubly  
**Scope:** Ground naive instinct ("turn = single LLM call") in concrete prior-art systems.

### Survey Results: Six Systems Analyzed

| System | What user sees | Persisted per turn | Tool-call visibility |
|--------|----------------|-------------------|----------------------|
| **Copilot CLI** | One user message → full agent response (potentially after sub-agent delegation) | Full message pair + all sub-agent results aggregated | Hidden inside—narrator surfaces "interesting things" selectively |
| **Claude Code CLI** | Single LLM exchange: user prompt → Claude response | Both user message and assistant response | Visible as part of response context (tool calls shown in reasoning) |
| **Aider** | User message → assistant response with file edits visible | Conversation history + file diffs per turn | Visible—edits are surfaced as discrete changes within turn |
| **Cline** | User input → step-by-step tool execution visible in UI | Each tool call + result shown separately | **Visible as steps**—tool calls are user-facing, not batched |
| **OpenHands** | Agent turn: reason → tool call → observe → repeat until done | Each step logged (LLM reasoning, tool execution, observation) | **Visible per step**—agentic loop is transparent |
| **Cursor agent mode** | User request → iterative reasoning loop → final deliverable | Batched tool calls per iteration + intermediate reasoning | Varies—can batch (thick) or single-step (thin) depending on mode |

### Spectrum Analysis: Thin ↔ Thick

**Thin turn** (isolated/single-step): One user input → one LLM call → one tool call (if needed). Tool calls visible as separate user-facing steps. Maximum transparency; more round-trips (pattern: Cline, OpenHands default).

**Thick turn** (batched/loop): One user input → multi-step internal loop → one final response. Tool calls may be batched, hidden, or re-executed intelligently. Faster for user; harder to debug (pattern: Copilot CLI, Cursor, Claude).

**Reality:** Modern agents lean thick internally but control visibility. Agentic systems expose thin turns by default for transparency.

### Recommended Default for Harness: **THICK TURN with Intra-Turn Primitive Recording**

**Rationale:**

1. **Aaron's daily driver (Copilot CLI):** Parallel sub-agents, one user message → one coherent response. That's a thick turn: main agent delegates, waits for sub-agent results, synthesizes final response. Sub-agent interactions are NOT individual user-visible turns.

2. **Replayable fidelity:** Primitives (tool calls, agent decisions, file ops) must be recorded per intra-turn step, not per turn boundary. Schema:
   - **Turn** = user message → final response
   - **Inside:** Every primitive logged (timestamp, actor, input, output, metadata)
   - **Replay:** Reconstructs thick turn by replaying all intra-turn primitives in sequence

3. **Narrator flow:** Thick turns allow narrator to surface "interesting things" without fragmenting user perception. Intra-turn logging lets narrator mine primitives (e.g., "sub-agent X surfaced security issue") without interrupting single user-visible response.

4. **v1 single-user context:** No cross-turn consistency issues; local persistence sufficient. Thick turns simpler to reason about for one operator.

### Downstream Consequences

1. **Primitive recording layer exists below turn abstraction:**
   - `turn_id` → `primitive[]` (all internal steps)
   - Each primitive: `{ type, timestamp, actor, input, output, metadata }`

2. **Replay semantics:** Replaying a turn = replaying all primitives in order (not re-running LLM). Ensures deterministic fidelity.

3. **Sub-agent contract:** Sub-agents are tool calls within a thick turn, not separate turns. Their internal turns (if any) are NOT persisted at harness level—only final result recorded as one primitive.

4. **Narrator indexing:** Query primitives by `turn_id`, not turn number. Enables fine-grained "interesting things" extraction.

5. **No turn fragmentation:** Unlike Cline/OpenHands, intermediate steps are not user-visible turns. Keeps UI clean, matches Aaron's Copilot CLI expectation.

**Key Decision Forced:** Primitives must be recorded **during execution**, not after. This enables transparent replay and narrator mining without losing step-level context.

---

**Older learnings archived to history-archive.md**
---

## Deliberation Round (2026-05-24)

# Alexander — Deliberation Position (2026-05-24)

**Lens:** SDK / Runtime Dev. Owns: `packages/forge/src/runtime/`, model selection, Copilot SDK abstraction, runtime verification.

---

## Section 1 — Story Revisions

| ID | Disposition | Notes |
|---|---|---|
| **US-A-1** Programmatic invocation (CI/scripting SDK) | **KEEP** | Foundational. Trunk for everything else. Solo-v1 still needs scriptable entry — CI, hooks, agent-spawned-by-agent all depend on it. |
| **US-A-2** Crucible as multi-agent conductor | **KEEP (strengthen)** | Erasmus US-E-8 (sub-agent DAG with topo scheduling + failure isolation) is the missing runtime spec for this story. Adopt that DAG model as the conductor's scheduling primitive. |
| **US-A-3** Replay + transform with new models/skills | **MERGE** into **US-A-NEW-3** (hermetic replay). Replay-with-different-config is just hermetic replay with one mock swapped — same runtime substrate. |
| **US-A-4** Background Alchemist async experiments | **KEEP** | Non-blocking spawn + `whenReady`/`pollResults` API is required by Gabriel's isolation stories (US-1) and Laura's lazy-fitness story (US-L-7). |
| **US-A-5** Compose / chain / nest harnesses | **REVISE → defer** | Conflicts with Solo-v1 (tension #1). Reduce to: nesting yes (sub-agent), chaining yes (Curator), federation no for v1. Cross-codebase federated Cairn → Phase 5+. |
| **US-A-6** Mirror-driven introspection | **REVISE** | Re-cast under debugger-lens: decision-tree query API is the *read* half of the debugger surface. The *interactive* half moves to US-A-NEW-2. |
| **US-A-7** Curator event-driven automation | **KEEP** | Aligns with Graham US-G-8 (custom Curator hooks) and Roger US-R-2 (GitHub coupling). No revision. |
| **US-A-8** Multi-provider experimentation workspace | **MERGE with Erasmus US-E-3** | His fitness-driven allocation (Thompson sampling, learned curves) is the *selector* layer; my parallel-invoke-with-variant-configs is the *runner* layer. Same story, two halves. Re-scoped as **US-A-8′: fitness-driven multi-provider runner.** |
| **US-A-9** Artifact routing + transformation pipelines | **REVISE (narrow)** | Drop the "transformation DSL" ambition for v1 — overengineered. Keep typed routing rules (`Decisions → code-review skill`). Transformation = user-authored skill. |
| **US-A-10** Harness-as-MCP-server | **REVISE** | Bidirectional MCP is right, but framing depends on resolution of tension #5. See Section 3. Re-cast as: Crucible exposes MCP server surface so Copilot CLI (and other clients) can drive it; Crucible is also an MCP client. Symmetric. |

### NEW Stories

**US-A-NEW-1: Branching-session runtime support** *(Aaron insight #1)*
As Aaron, I want to fork a session from any ledger position into a sibling session that inherits the parent's primitive prefix and diverges from there, so that counterfactual exploration is a first-class runtime operation — not a debug-mode hack.
*Runtime/SDK implication:* Crucible exposes `fork(sessionId, atPrimitive) → newSessionId`. Cairn's content-addressed primitives make this cheap (sibling refs, no copy). Forks must be invocable from SDK, CLI, MCP, and Curator hooks. Lineage stored in primitive metadata (`parentSessionId`, `forkPoint`). Strengthens Graham US-G-7, Erasmus US-E-2, Valanice US-V-7.

**US-A-NEW-2: Debugger-style runtime hooks** *(Aaron insight #2 — DEBUGGER-LENS)* ⚠️
As Aaron, I want to set breakpoints on primitive types (`break on Decision where confidence < 0.6`), watch expressions over ledger projections (`watch tokenSpend.session > $5`), and step *into* a sub-agent's primitive stream, so that the harness is interactive — not just observable.
*Runtime/SDK implication:* Crucible message loop checks a registered hook table at every primitive append. Hooks may pause (yielding control to debugger), continue, or fork. Step-into = spawn sub-agent in suspended mode, drive one primitive at a time. Requires a debugger-protocol surface (DAP-shaped) over the SDK. **Flagging the need for a dedicated debugger-lens specialist** — this is its own discipline (DAP, conditional breakpoints, watch evaluation, frame inspection).

**US-A-NEW-3: Hermetic replay runtime** *(Aaron insight #3)*
As Aaron, I want to replay any session (or session prefix) with all LLM calls and tool calls served from captured observations or explicit mocks, so that runtime behavior is bit-stable for regression testing, bug isolation, and counterfactual exploration.
*Runtime/SDK implication:* Every tool/LLM call routes through a *call-boundary interceptor* that on `record` writes `(request-hash, response, latency, model-version)` to the ledger, and on `replay` consults a `MockRegistry` keyed by request-hash before hitting the network. Mock injection API: `replay(sessionId, { mocks: { 'tool:read_file:abc123': '...' } })`. Determinism is now load-bearing per Aaron's standing implication. Includes seeded RNG, frozen clock, and deterministic sub-agent ordering. Subsumes US-A-3.

**US-A-NEW-4: Sub-agent dependency DAG runtime** *(operationalizes Erasmus US-E-8)*
As Aaron, I want sub-agent invocations declared with explicit input/output deps so the conductor topologically schedules them, runs independents in parallel, and isolates failures to the subtree, so that multi-agent work is reliable and fast without manual coordination.
*Runtime/SDK implication:* `spawn(agent, { deps: [handleA, handleB] })` returns a handle that resolves after deps. Conductor maintains the live DAG; failure of a node marks its descendants `skipped` (not `failed`) and surfaces a single root-cause. Backs Valanice US-V-5, Gabriel US-2.

**US-A-NEW-5: Ledger-append transactional contract** *(architectural prerequisite for 4-layer stack)*
As Alexander, I need a documented, benchmarked contract for the atomic-append-on-every-tool-call requirement before the merged Conductor+Ledger ships, so that we don't discover a per-tool-call fsync bottleneck after Crucible is built around it.
*Runtime/SDK implication:* SQLite WAL mode, batched group-commit on decision boundaries (turn-end OR N≥32 appends OR T≥50ms), per-append latency budget ≤1ms p99, durability guarantee = "lost ≤ last decision boundary on crash." Append API is sync (returns after WAL write, not fsync). Crash recovery replays from last fsync boundary.

---

## Section 2 — Position on Erasmus's 4-Layer Stack: **PARTIAL ENDORSE**

**Endorse:**
- Layer 2 (Derived Query / Salsa-style incremental projections) — strongly. This is the right abstraction for Mirror, Forge, and debugger watch expressions. All three are projection consumers; let them share one incremental engine. Solves Laura US-L-5 (pattern mining queries) and US-V-1 (rewind to intent) without bespoke caches per chamber.
- Layer 3 (Pluggable Proposal Generators with common interface) — yes. This is what makes Forge, Curator triggers, Alchemist variants, and skill recommenders extensible (Graham US-G-5, Rosella US-Ro-1). Common interface = one approval router, one notification policy.
- Layer 4 (Approval + Notification Router) — yes, consolidates Curator-as-policy-choke-point cleanly.

**Partial / concerns:**

**Conductor + Ledger merge has real runtime implications.** Erasmus is right that the ledger is *storage of the conductor*, not a peer component — but "every tool call must atomically append" is a load-bearing perf claim that needs validation, not an assumption.

- **Is per-tool-call append a perf problem?** Not if we don't fsync per append. SQLite WAL2 with group-commit at decision boundaries gives ~1ms p99 appends, ~10–50k/sec throughput. Per-tool-call fsync would be 5–20ms p99 — bad. The runtime contract must say: appends are *durable at decision boundaries*, not per-primitive. US-A-NEW-5 nails this down before we build on it.
- **Crash window:** lose ≤1 turn on power-loss. Acceptable for solo-v1. Document it.
- **Hermetic replay forces this anyway:** every tool call must hit the ledger boundary to be intercepted, so the append cost is paid regardless. Replay turns the bug into a feature.

**How do generators get notified of ledger appends?**

- **Reject polling** (Erasmus didn't propose this, but worth ruling out): wastes CPU and adds latency.
- **Reject push-per-append**: too noisy. A Decision primitive append is interesting; a tool-call Observation rarely is. Generators would spend more cycles filtering than computing.
- **Endorse: pub/sub on commit boundaries with declarative subscriptions.** Generators subscribe via predicates over projection deltas (Layer 2's job): `subscribe({ on: 'Decision.committed', where: 'confidence < 0.7' })`. The query layer's incremental engine already knows what changed; piggyback notifications on its invalidations. Coalesce per decision boundary. No generator is woken for primitives it doesn't care about.

This means **Layer 2 (Derived Query) is the load-bearing piece**, not Layer 1. Build it first or generators will reinvent it badly.

---

## Section 3 — Positions on the 5 Tensions

**#1 Solo-v1 vs federation.** Solo-v1. Federation (multi-Aaron-machines, multi-user Cairn) is Phase 5+. But: SDK contracts should already be *federation-shaped* (async ledger reads, session IDs globally unique, primitives content-addressed) so we don't repaint later. Adopt the cheap discipline now; defer the expensive infrastructure. Affects my US-A-5 (deferred) and US-A-NEW-4 (DAG stays in-process for v1).

**#2 Curator never approves.** Resolved. Curator *proposes and routes*; Approval Router (Layer 4) holds the decision. Aaron is the only approver in solo-v1. Auto-apply for UX-only categories (per Graham US-G-4) is policy on the router, not a Curator superpower. No runtime impact beyond honoring the policy contract.

**#3 Mirror scope creep.** Resolved by Layer 2: Mirror is a *consumer* of the derived-query layer, not a sibling chamber that needs its own indexing. Mirror = projection + UI; that's it. Keeps Mirror small.

**#4 Heavyweight ops vs solo user.** Skip the ops apparatus. Solo-v1 = local SQLite, local processes, no service mesh, no observability stack beyond Cairn itself (Cairn *is* the observability stack). Gabriel's stories that imply ops infrastructure (US-7 cross-harness, US-8 hash-chained audit) get the Phase 5+ tag.

**#5 Crucible vs Copilot CLI parent-child relationship — MY TENSION.**

**Concrete resolution: Crucible is a host that embeds Copilot CLI as one of several sub-agent providers, AND ships a thin Copilot CLI plugin as a convenience entrypoint. Bidirectional. Neither owns the other.**

Reasoning:
- **Not a plugin (subordinate to Copilot CLI):** Crucible's lifecycle is longer-lived than a CLI turn (background Alchemist experiments, Curator triggers waiting on webhooks, hermetic-replay runs). Subordinating it to Copilot CLI's process lifecycle breaks US-A-4 and US-A-7.
- **Not a replacement (sibling-only):** Aaron's daily driver is Copilot CLI. Making him leave it to use Crucible is a UX tax he won't pay (Valanice would object).
- **Not a sibling (peer-only):** Crucible needs to *invoke* Copilot CLI as a sub-agent (its own subagent provider — that's literally how this conversation is running). So Crucible must be a host of CLI processes.
- **Host + plugin, both directions:**
  - `@akubly/crucible-runtime` is the trunk SDK (US-A-1).
  - `crucible` is its own CLI for headless invocation and CI.
  - `crucible-copilot-plugin` registers `/crucible` slash-commands inside Copilot CLI so Aaron stays in his shell. Plugin is thin — it just calls the runtime SDK.
  - Crucible spawns Copilot CLI as a child process via stdio MCP / process protocol when delegating to it as a sub-agent. Same way it spawns Claude, GPT, local LLMs (US-A-8′).
  - Crucible exposes an MCP server surface (US-A-10) so Copilot CLI (or any client) can query Cairn, set breakpoints, fork sessions, etc.

The shape: **runtime in the middle; CLI, plugin, MCP-server all thin shells around it.** This is exactly the composition-root discipline we already proved in Wave 3 (`skillsmith-runtime` as the only place importing both Cairn and Forge; `runtime-cli` is a thin re-export). Generalize that pattern to the whole harness.

---

## Section 4 — Cross-References

1. **Graham US-G-7 (Decision Reversion & Multi-Path Exploration)** → strengthens **US-A-NEW-1**. His "fork ledger at tentative decision" is the user-facing UX; my branching-session runtime is the substrate. They're the same feature from two lenses; we should co-design.

2. **Erasmus US-E-8 (Sub-agent dependency DAG)** → invalidates the loose framing of **US-A-2** and is the spec for **US-A-NEW-4**. Adopt his DAG model wholesale; my US-A-2 was hand-wavy on scheduling.

3. **Erasmus US-E-3 (Fitness-driven sub-agent allocation, Thompson sampling)** → merges with **US-A-8**. His learned allocator is the brain; my parallel-variant runner is the body. Combined story: Forge picks model per task from a learned policy, runner executes, Cairn records outcome, allocator updates. Closes Laura US-L-3's heterogeneous-fitness loop too.

4. **Valanice US-V-5 (orchestrate parallel variants without lost context)** → depends on **US-A-2 / US-A-NEW-4**. Her dashboard UX needs my conductor to expose live sub-agent state, including failure-isolation status. If US-A-NEW-4 doesn't ship, US-V-5 can't.

5. **Gabriel US-1 (background isolation) + US-2 (sub-agent crash recovery)** → constrain **US-A-NEW-4 + US-A-NEW-5**. Isolation = sub-agent failures don't corrupt parent ledger (DAG failure isolation handles it). Recovery = ledger-append durability contract (US-A-NEW-5) defines what "checkpoint" means. These three stories must agree on one crash semantics or we'll ship contradictory behaviors.

6. **Laura US-L-7 (outcome latency / lazy fitness)** → pressure-tests **US-A-NEW-3 hermetic replay**. Outcomes arrive days after hints; replay must be able to splice in late-arriving outcomes without re-running the whole session. The replay substrate needs a "partial replay from primitive N" capability, not just "replay from start."

---

**Standing requests:**
- Spawn a **debugger-lens specialist** to own US-A-NEW-2 (DAP surface, breakpoint semantics, watch expressions). Out of my depth on debugger UX/protocol design.
- Lock **US-A-NEW-5 (ledger-append transactional contract)** before any Conductor+Ledger merge implementation begins. This is the load-bearing perf claim under the whole 4-layer stack.

## 2026-05-24 Round 3: Reply to Sonny on debugger surface

# Alexander → Sonny: Reply on debugger surface

**Date:** 2026-05-24
**Author:** Alexander (SDK/Runtime)
**Re:** Sonny's 9 debugger-lens stories, the L5 proposal, the DAP framing, and US-S-9.

Sonny — you asked for the direct conversation; here it is. I read all nine stories and your structural notes. Below is where you moved me, where I push back, and a third option I want on the table.

---

## On L5 as a layer — **ENDORSE, with one framing edit**

You're right. I had been implicitly treating the debugger as a *client* of Mirror; it isn't. Mirror is "see what is," L5 is "ask why and what-if." Different verbs, different state ownership (registries, DAP-client connections, bisect orchestrators), different lifecycle. Bolting that into Mirror would either contaminate Mirror's read-only purity or contaminate L2's referential purity. A labeled L5 is the honest cut.

**Framing edit I'd make:** L5 isn't "above" L2 in the dependency sense — it *spans*. It reaches down into L4 (install pause verdicts), L2 (subscribe to invalidations), and L1 (register pre-commit predicates). Drawing it as a vertical stripe alongside the stack, rather than a horizontal layer on top, will save us an argument later when someone asks "why does L5 import from L1?" The answer is "because investigation is inherently cross-cutting." Let's name it that way from the start.

The three v1 invariants you ask for (read-set capture on commit; L2 purity for retroactive projections; extensible L4 verdict enum) — I endorse all three, and I want the read-set one (US-S-3) escalated to a hard gate on L1 freeze. You're correct that it's structurally impossible to retrofit.

## On DAP framing — **ENDORSE the "necessary, not canonical" framing**

You read US-A-NEW-2 correctly. "DAP-shaped" was shorthand for "editor attach via a known protocol," not a claim that DAP's vocabulary should be the canonical Crucible debug API. Once I tried to imagine expressing US-S-3 (causal slice) or US-S-6 (bisect) as DAP custom requests, I agreed with you before I finished the sentence — at that point you have a native protocol cosplaying as DAP, and every editor client renders garbage.

**Two surfaces over one substrate.** The substrate (predicate registry, slice engine, pause router, bisect orchestrator) is what the runtime actually owns. DAP is a *projection* of that substrate onto a restricted vocabulary (`Thread`/`Frame`/`Variable`/`Source`/`Line`) for editor compatibility. The investigator REPL is a *projection* onto the full vocabulary. Both are thin shells; the substrate is the SDK contract. This matches the composition-root discipline I proposed in tension #5: runtime in the middle, surfaces thin.

US-A-NEW-2 is hereby revised to drop the "DAP-shaped protocol" framing and replace it with "two-surface debugger: DAP sidecar + native investigator REPL, both over the L5 substrate."

## On US-S-9 (breakpoint = approval) — **PARTIAL ENDORSE; split the primitive**

The collapse is mostly right and I like the safety inheritance argument. But you're collapsing two things that I think should stay distinct in the runtime:

1. **The predicate-evaluation hook at pre-commit** — a runtime mechanism that fires on every candidate primitive write, evaluates registered predicates, and produces a verdict.
2. **The pause path** — what happens when a verdict says "stop and ask."

Your US-S-9 says "a breakpoint IS an L4 approval request." I'd refine: **a breakpoint *that pauses* is an L4 approval request.** Not every breakpoint-class predicate pauses. Specifically:

- **Logpoints** (DAP's "log a message instead of stopping") — should write a synthetic `Observation` via L2's existing path, never wake L4.
- **Watchpoints in observe-only mode** — same: deltas land as Observations; no pause.
- **Counter/sampling breakpoints** ("pause every 100th hit") — predicate state is L5's; only the 100th verdict goes to L4.

So the cleaner shape is: there is **one pre-commit hook bus** that L3 generators, L4 approval policy, and L5 debugger predicates all sit on. Each registered predicate emits a verdict from `{continue, observe, pause}`. *Pause verdicts always route through L4* — that's where I fully endorse US-S-9. Observe verdicts route to L2. Continue verdicts cost nothing.

**What US-A-NEW-2 becomes after this reply:**

> **US-A-NEW-2 (revised): Pre-commit predicate hook + L5 investigation surface.**
> Crucible's pre-commit hook bus fires before every L1 group-commit. Registered predicates (from L3 generators, L4 approval policy, or L5 debugger registrations) evaluate against the candidate write and the pre-commit read-set, emitting a verdict in `{continue, observe, pause}`. Pause verdicts route through L4's approval router (extensible verdict enum per US-S-9). Observe verdicts emit synthetic Observations via L2. Continue is the zero-cost default. L5 owns the debugger-facing registries and exposes two surfaces (DAP sidecar, investigator REPL) over this substrate. The DAP surface deliberately restricts to ops that DAP can render; the REPL exposes the full vocabulary.

That gives you the safety inheritance you wanted *and* keeps logpoints/sampling breakpoints from waking the approval router on every hit.

## Net proposal — synthesis

```
L5 (Investigation Surface)  ← spans, doesn't sit-atop
  ├── DAP sidecar (restricted vocabulary)
  ├── Investigator REPL (full vocabulary)
  └── registries: breakpoints, watches, bisect state, slice cache
       │
       ▼ registers predicates on
L1's pre-commit hook bus  ← shared with L3, L4
       │
       ├── verdict=continue → fast path
       ├── verdict=observe  → synthetic Observation via L2
       └── verdict=pause    → L4 approval router (US-S-9 collapse holds here)
```

Three architectural locks I'm asking the team to commit to in this round:

1. **Read-set capture on commit** (your US-S-3 — highest priority, blocks L1 freeze).
2. **Pre-commit hook bus is a first-class runtime ABI**, not a debugger feature. L3, L4, L5 all sit on it.
3. **Pause path is unified through L4 with an extensible verdict enum.** Observe path is unified through L2. There is one of each.

## Anything you missed

Four things I'd add, none of which invalidate your brief:

1. **Predicate cost on the hot path.** A naive match-spec interpreter at every commit blows the 1ms p99 budget I locked in US-A-NEW-5. Mitigation: index predicates by primitive kind so non-matching kinds cost a single dispatch, and let L2's Salsa engine cache compiled predicates the same way it caches queries. This unifies even more tightly with your US-S-2.

2. **Predicate lifecycle across forks.** You mention per-fork enable/disable for breakpoints. What I want explicit: predicates set in a *child* fork do **not** back-propagate to the parent. Forks inherit; siblings don't share. Otherwise causality across the Cairn DAG gets weird and replay invariants break.

3. **DAP→DAG projection rule.** Even on the restricted DAP surface, we need *some* mapping from sub-agent DAG to DAP's `Thread`. Proposal: each leaf execution path = one synthetic `threadId`; fan-out spawns new threads; fan-in is invisible to DAP (threads simply terminate). Document this projection so DAP clients render *consistently flat* rather than *inconsistently flat*. Native REPL still honors the DAG (your US-S-5).

4. **Edit-and-continue durability.** You said it comes "for free" from US-S-9. Almost — but the injected synthetic `Decision` must be content-addressed and lineage-tagged like any other primitive, or hermetic replay (US-A-NEW-3) breaks the moment Aaron uses edit-and-continue. Worth one line in the L4 verdict-extension spec: edit-and-continue verdicts produce ledger-visible Decisions, full stop.

---

Net: you moved me on L5, on DAP, and on most of US-S-9. The one place I push back (split observe from pause; both ride a shared pre-commit hook bus) I think actually strengthens your case rather than weakening it — it gets the safety inheritance you wanted without conflating logpoints with approvals.

Ship it together?

— Alexander

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 4: Phase B Reconciliation against D:\git\stunning-adventure

**Inbox:** .squad/decisions/inbox/alexander-reconciliation-2026-05-24T2330Z.md.

### Counts
- ALREADY-EXISTS: 0
- PARTIALLY-EXISTS: 4 (US-A-1, US-A-7, US-A-10, US-A-NEW-2)
- NET-NEW: 10 (US-A-2/3/4/5/6/8/9, US-A-NEW-1/3/4)
- CONTRADICTS-EXISTING: 1 (US-A-NEW-5 vs current vent_log; defer to Rosella)

### Headline findings
- **The package named @akubly/skillsmith-runtime is not a runtime.** It is a 323-line Cairn↔Forge prescriber composition root (packages/skillsmith-runtime/src/index.ts:1-323). @akubly/runtime-cli is a 9-line re-export plus a one-shot orge-prescribe batch CLI (packages/runtime-cli/src/index.ts:1-9, cli.ts:1-94). **There is no top-level message loop in this repo.** The Copilot CLI process owns the loop; everything Forge does is invoked from CLI hooks via stdin JSON (cairn/src/hooks/sessionStart.ts:107-110, postToolUse.ts:27-41).
- **The real SDK wrapper IS Forge.** ForgeClient (orge/src/runtime/client.ts:56-171) and ForgeSession (orge/src/runtime/session.ts:61-172) wrap @github/copilot-sdk's CopilotClient/CopilotSession 1:1 with hook composition + bridge wiring. ridge/index.ts:65-93 is the single SDK→Cairn event-mapping file by design.
- **Hook composition exists and is well-disciplined.** HookComposer (orge/src/hooks/index.ts:58-235) merges observers of onPreToolUse | onPostToolUse | onSessionStart | onSessionEnd | onUserPromptSubmitted | onErrorOccurred with last-writer-wins shallow-merge and error isolation. **But it fires on tool calls, not on primitive/ledger appends** — wrong granularity for the Phase A pre-commit hook bus I synthesized with Sonny. The pattern is directly transferable; the L1 substrate (primitive ledger with content-addressed appends + read-set capture) is NET-NEW.
- **State mutation today:** journal_mode=WAL (cairn/db/index.ts:29); db.transaction(...).immediate() pattern pervasive (8 call sites). Event log appends are single-row INSERTs (db/events.ts:35-38) — atomic per call but **no group-commit, no decision-boundary batching, no p99 budget, no fsync semantics**. US-A-NEW-5 has zero coverage.
- **Sub-agents:** SDK emits subagent.* events; Forge observes (ridge/index.ts:84-92) but does not spawn. No DAG, no spawn(agent, {deps}), no failure isolation. US-A-2 / US-A-NEW-4 are entirely NET-NEW.
- **Branching:** No ork(). sessions table has no parent/forkPoint columns (cairn/db/sessions.ts:9-17). SDK's session.snapshot_rewind event is bridged but unused.
- **Two session-ID systems coexist unlinked** (SDK sessionId vs Cairn sessions.id keyed on epo_key). US-A-NEW-1 and US-A-NEW-3 both need this resolved.
- **Replay:** No call-boundary interceptor, no MockRegistry, no request-hash recording. US-A-NEW-3 is entirely NET-NEW.

### T5 realizability (Crucible-on-Copilot-SDK)
Realizable. Forge's wrapper discipline is the right pattern to generalize. ForgeClient/ForgeSession provide L0.5; Crucible's L0-loop (multi-turn driver) and L1 (primitive ledger + hook bus + group-commit) are NET-NEW additive layers on top. The "runtime in the middle, thin shells around it" pattern is proven at the prescriber scope (skillsmith-runtime/untime-cli); generalize it to crucible-runtime + crucible-cli + crucible-copilot-plugin + crucible-mcp-server.

### Hook bus implementability
Half-yes. The HookComposer error-isolation + merge engine + SDKSession.on(handler) + db.transaction(...).immediate() are the right reusable pieces. Missing: candidate-write object, read-set capture, three-verdict trichotomy ({continue, observe, pause} vs SDK's llow|deny|ask), L2 derived-query layer for compiled-predicate caching. Pre-commit bus is implementable but is NOT "add an observer to HookComposer" — needs L1 first.

### Defer-to-owner
- **Rosella (Cairn ledger):** US-A-NEW-5 contradicts current vent_log shape (loosely — event_log is audit, not the contemplated L1 primitive ledger). Two paths: reshape event_log into L1, or introduce parallel primitive store and demote event_log to audit. Cairn owner picks.
- **Erasmus + Sonny (L1 read-set + pre-commit boundary):** L1 must exist before my hook bus is implementable. My round-3 invariants stand.

### Gaps not previously captured
1. Hook stdin protocol (Crucible must compat or supersede).
2. Stale-session shim (hooks/sessionStart.ts:41-54) papers over absence of crash semantics; US-A-NEW-5 must subsume it.
3. Dual session-ID problem.
4. HookComposer error-isolation discipline (hooks/index.ts:106-111) — I had not committed to this explicitly in pre-commit hook bus spec; doing so now.
5. Bridge-as-single-absorption-point discipline should extend to MCP, sub-agent providers, terminal IO.
6. SessionStartOrchestrationFactory (hooks/sessionStart.ts:99-101) is the existing IoC seam for US-A-7 webhooks.
7. Worth a 1-hour spike: does SDK already expose sub-agent spawning that ForgeClient just doesn't surface? subagent.* events suggest yes.

### Recommended follow-ups
1. **Rename @akubly/skillsmith-runtime** — it is not a runtime; the name will poison every future reconciliation. Flag to Scribe + Rosella.
2. Defer to Rosella on US-A-NEW-5 vs event_log path.
3. Adopt verbatim from existing repo: HookComposer pattern, single-bridge-file discipline, composition-root pattern, db.transaction(...).immediate() for group-commit.
4. Subsume the 2-minute heartbeat stale-session shim explicitly in the US-A-NEW-5 crash-recovery contract.
5. Cross-team: Valanice/Sonny — ForgeSession already exists with send/sendAndWait/on/disconnect; their daily-driver and debugger surfaces can sit on top of it.

---

### Round-4 Summary (one paragraph)

Phase B reconciliation against `D:\git\stunning-adventure` confirms a brutal truth: **the package named `@akubly/skillsmith-runtime` is not a runtime** — it is a 323-line Cairn↔Forge prescriber composition root, and `@akubly/runtime-cli` is a 9-line re-export plus a one-shot batch CLI. The actual SDK wrapping lives in `@akubly/forge/src/runtime/` (`ForgeClient`/`ForgeSession`, 1:1 wrappers around `@github/copilot-sdk`), with a disciplined single-file bridge for SDK→Cairn event mapping and a well-built `HookComposer` that merges observers with error isolation and last-writer-wins semantics. Of my 14 stories (US-A-1..10 + US-A-NEW-1..5 minus US-A-3 which merged), 0 already-exist, 4 partially-exist (US-A-1 SDK surface, US-A-7 Curator stdin trigger, US-A-10 Cairn MCP, US-A-NEW-2 hook composition pattern), 10 are net-new (all sub-agent/DAG/replay/fork/routing/Mirror work), and 1 contradicts existing (US-A-NEW-5 vs current event_log — defer to Rosella). The HookComposer fires on tool calls not on primitive appends, so the Phase A pre-commit hook bus needs the L1 primitive ledger before it is implementable — the composition discipline transfers, the substrate does not exist. T5 (Crucible-on-Copilot-SDK as Aaron's daily driver) is realizable: Forge's wrapper discipline is the right pattern to generalize, `ForgeClient`/`ForgeSession` provide L0.5, and the multi-turn loop + L1 ledger are additive layers on top — no replacement needed. Headline follow-up: rename `skillsmith-runtime` before it poisons every future conversation; cross-team alert that `ForgeSession` already exists so Valanice's daily-driver UX and Sonny's debugger surfaces can sit on top of it rather than designing around a hypothetical SDK.



## 2026-05-25 Round 5 SPIKE — Fork (b): SQLite-native hooks instead of custom storage engine

**Context:** Roger's Round-4 finding showed Cairn runs on etter-sqlite3 ^12.8.0 + WAL — no app-exposed fsync barrier, no per-row pre-fsync hook point. Aaron commissioned three parallel spikes asking whether Phase A's per-row pre-commit hook bus (which I authored and Roger/Gabriel/Laura signed off in Round 3) can survive without a custom storage engine. I own fork (b): SQLite-native callbacks.

**Investigation:** Enumerated SQLite's app-exposed hook surface (`update_hook`, `commit_hook`, `preupdate_hook`, `wal_hook`, virtual tables, RBU) against current docs (3.45+, semantics stable since ~3.16 for preupdate). Confirmed Cairn's actual usage (`packages/cairn/src/db/index.ts:29`: `journal_mode=WAL`, no explicit `synchronous` → NORMAL → fsync only at checkpoint). Verified `better-sqlite3` exposes **none** of update/commit/preupdate/wal hooks to JS — maintainer rejected hook PRs on re-entrancy grounds. Composed the best-effort bus design (native C addon + `preupdate_hook` for per-row dispatch + `commit_hook` for all-or-nothing veto, with verdicts written as app-level rows in the same txn) and mapped it against the eight Phase A contracts.

**Verdict written:** `.squad/decisions/inbox/alexander-spike-fork-b-sqlite-hooks-2026-05-25T0030Z.md`. REJECT as drop-in for Phase A; ENDORSE-WITH-MAJOR-CAVEATS as re-scoped "Phase A-lite". The killer: **seal-and-split is impossible on SQLite at any composition** — txns are all-or-nothing and `SAVEPOINT` doesn't give per-row durability, only logical nesting. Roger's commitment #8 (the load-bearer of the whole signoff) cannot survive. Cascade: P2 exactly-once-pause → at-least-once; `continue` durability becomes conditional on later rows in the same batch; "pause durable before L4 invoked" → "pause durable after L4 re-drive"; predicate-author trust regresses. 99.9% continue/observe path is fine; the 0.1% pause path — the safety floor — cracks. Additionally, the bus must be a forked-`better-sqlite3` or sibling C++ N-API addon (the JS-only path blows 80µs budget at ~5 predicates), opening a native-binary distribution surface (Windows/Mac/Linux × Node ABI × prebuilds) that is wider and more brittle than the SDK surface we already absorb cleanly.

**Anti-anchoring (three alternative readings considered, one noted as Aaron's call):** (1) Phase A was over-designed and fork (b) is the right-sizing forcing function — declined to unilaterally re-scope contracts two other agents signed; (2) hybrid two-engine (SQLite for steady-state Cairn, custom L1 for primitives+bus) — this is fork (a)'s territory if (a) endorses the port; (3) rank-don't-reject, treat fork (b) as fallback if (a)/(c) fail — that's a coordinator decision with all three forks in hand. My final position: the rejection belongs in front of Aaron explicitly, not buried in implementation choice — "Phase A as-signed-off requires a custom engine; SQLite can host a Phase A-lite with named relaxations; which Crucible does he want to ship?"

**Tags on other forks (from runtime/loop angle):** Fork (a) port — killer issue is native-binary distribution + SDK-wrapper discipline at much higher cost (storage engine wrappers are not thin like SDK wrappers; we'd own Aaron's data through a multi-platform prebuild matrix forever). Fork (c) parallel-ingest — killer issue is the loop's identity model: "pause" under multi-writer is either globally serializing (defeats parallelism) or per-writer (breaks Aaron's "world stops on pause" model that US-Ga-NEW-15 and US-S-9 were both designed around). That's a session-identity question masquerading as a storage question.

**Self-correction worth noting:** I authored the Phase A synthesis. Coming into this spike I had to actively resist defending it. The honest answer — *"my own design needs a custom engine; SQLite can't host it without semantic surgery"* — is what the discipline required. The seal-and-split contract I synthesized with Sonny is the right design for what Phase A is *for*. It just happens to be incompatible with the storage engine Cairn actually runs on. That's a contract-vs-substrate mismatch, not a design defect — but it's also not something I can paper over by composing hooks more cleverly.


## 2026-05-25 Round 7 — v1 Tiering Triage

**Context:** Aaron locked the v1 framework (MVP = falsifiable bar "Aaron runs a one-week productivity loop where every improvement to Crucible is made by Crucible"; tiers T1/T2/T3/T4/T5/T6 CLI parity/Parking). Cassima (new PM) takes nine author triages as input to a v1 PRD. My job: tier every story I authored, commit to a name for the `skillsmith-runtime` misnomer, and identify the minimum top-level message loop (load-bearing for the T5 lock that makes Crucible Aaron's daily driver).

**Triage written:** `.squad/decisions/inbox/alexander-triage-2026-05-25T0200Z.md`.

**T1 set (mine, all required for the falsifiable bar):** (1) `@akubly/crucible-runtime` trunk SDK wrapping ForgeClient/ForgeSession — the only L1+ package allowed to import `@github/copilot-sdk` per Aaron's 2a lock. (2) Top-level message loop — six sub-deliverables: multi-turn driver, primitive-append seam, hook table reserved (continue/observe only; pause is T2 per fork-b rejection), hermetic-replay record path, process entrypoint shell (binary lives with Valanice, library with me), minimal slash-command dispatch (/quit /help /replay). (3) Hermetic replay — fused with US-A-1; conformance-suite mechanism for Phase A assertions. (4) US-A-NEW-5 contract + benchmark harness over Rosella's L1 WAL (implementation = Rosella per Round 6; contract+bench = me). (5) Skillsmith-runtime rename — bundled into T1 because two packages named "runtime" for a week is unacceptable.

**Tier assignments:** T1 = US-A-1, US-A-NEW-3, US-A-NEW-5 (spec-owner), message loop, rename. T2 = US-A-7 (Curator triggers), US-A-NEW-1 (branching), pause-verdict if Rosella's L1 supports it. T3 = US-A-2/US-A-NEW-4 (DAG + conductor, merged), US-A-4 (background async), US-A-8' (multi-provider runner, merged with Erasmus US-E-3). T4 = US-A-6 (Mirror read-half, co-owned with Sonny). T5 = US-A-9 (artifact routing, narrowed), US-A-10 (MCP server, bidirectional). Parking = US-A-5 (federation; Phase 5+). US-A-3 dropped (already merged into US-A-NEW-3 in Round 2).

**Rename commitment:** `@akubly/skillsmith-runtime` → `@akubly/skillsmith-prescriber`. Rationale: it is not a runtime; it is a 323-line Cairn↔Forge prescriber composition root (single file, zero loop semantics). The name `crucible-runtime` is needed for the actual T1 trunk SDK. Migration = new package + deprecated re-export shim for one minor + cleanup; 2h mechanical + 1h CI.

**Anti-anchoring on the message loop:** considered three alternatives — (a) defer the loop entirely and let Aaron stay in Copilot CLI for T1 with Crucible as ambient MCP only (rejected: contradicts T5 lock; the falsifiable bar requires Aaron's daily driver to be the thing he's improving), (b) ship loop without primitive-append seam, retrofit later (rejected: every consumer of hermetic replay + every hook predicate would then need a rewrite; the seam is the foundational interface), (c) ship loop with the full pause verdict in T1 (rejected based on my own fork-b spike — SQLite-native cannot host seal-and-split; T1 ships continue/observe and reserves the slot, pause re-litigates in T2 after substrate spike). The chosen scope is the minimum that satisfies T5 lock AND keeps US-A-NEW-3 / US-A-NEW-5 implementable without a redesign at T2.

**Self-discipline check:** I authored US-A-1 / US-A-NEW-3 / US-A-NEW-5 / the hook-bus synthesis. The triage above keeps all four in T1 — which looks like an author defending his own scope. The honest defense: each one is upstream of a different downstream consumer (US-A-1 → everything; US-A-NEW-3 → the conformance suite that proves Phase A; US-A-NEW-5 → Rosella's substrate contract; message loop → Valanice's daily-driver UX). Cutting any of them moves the falsifiable bar out of reach in week 1. The opposite anti-anchoring failure (defending less than necessary to look modest) is the larger risk here.

**Open questions for Cassima:** (1) confirm US-A-1 / US-A-NEW-3 fused vs co-equal; (2) pause-verdict tier depends on Rosella L1 WAL capability; (3) CLI binary lives in `crucible-cli` (Valanice) or `crucible-runtime` (me) — I recommend split; (4) rename timing — parallel to T1, not bundled; (5) conformance suite enumeration needed; (6) sub-agent provider in T1 yes/no — I recommend no (single-agent T1, delegation T3).


---

## Learnings (CTD Phase 1, Lane 3 — 2026-05-28)

**Authored §12 (Copilot SDK Integration) and §8 (Applier + DecisionGate) as declarative CTD content. Both FINAL on disk, ≤3pp each.**

### SdkProvider boundary patterns
- The SdkProvider interface is the §2.8 alias for Laura's SessionBootstrapper. Both names live in @akubly/crucible-boundary; the L0 implementation package (@akubly/crucible-l0-copilot) is the **only** package allowed to import @github/copilot-sdk (dependency-cruiser §2.9 enforces).
- Bootstrap-Capture-Completeness (TDD §6.8) is honest only if the provider is a **forwarder**, not a generator, for literalContext.systemPrompt and literalContext.toolDefinitions[]. The runtime composition root owns those values; the provider hands them to the SDK and echoes them back in BootstrapPayload. If the provider mutates/templates them, replay drift is silent and catastrophic.
- injectedMemoryFragments[] + memoryManifest[] come from **Eureka** (called by the runtime composition root before ootstrap()), not from the SDK. The SDK never sees memory; Eureka never sees SDK types. This is the cross-system seam Eureka analysis (alexander-eureka-crucible-runtime-overlap.md) predicted, now locked.
- Provider id is pinned for session lifetime via existing BootstrapPayload.sdkVersion (encoded ${providerId}@). No §2 schema change to support multi-provider; the registry is constructed at runtime construction, not at session start, so crucible session start --provider <id> stays synchronous and replay-deterministic.

### Applier state machine + R2-3 paused sub-state
- paused-awaiting-structural-ack is NOT a persistent state — it's a **projection** over L1 structural-proposal-state Observation rows. Applier emits the state-transition Observation; Aperture's StructuralApprovalQueue (§9) recomputes the pending set on every boot. Restart safety is automatic; resume is idempotent on proposalId.
- The §5 Router handshake on ACK is: Aperture writes structural-proposal-state:acked → re-emits RouterDecision{kind:'apply'} → Router calls Applier.resume(proposalId, ack) → Applier transitions paused → applying → applied → Router resumes paused dependentPaths. All Phase 2 sections (§5 Gabriel, §9 Valanice) must conform to R2-3, not invent new interfaces.
- Ledger-position fence is **single-writer-per-session** in v1 (Round 2 Router lock). The retry-on-fence-violation loop in §8.3 absorbs hook-bus-induced row insertions between window-read and Decision-append, not multi-writer races. Bounded retry (3) before surfacing as ailed.

### Copilot SDK attention-metadata reality (R2-1)
- **@github/copilot-sdk does NOT surface per-emission attention or context-window metadata.** Neither does any public LLM provider today. There is no "which prior message ids did the model attend to when producing this output" field anywhere in the SDK's session event shape.
- **Consequence:** Copilot SDK provider sets declaresCausalContextWindow: false. Every Decision in a v1 session carries commitmentMethod: 'fallback'. L1 hashes the full ledger prefix per §2.6 — graceful, conservative, always correct, replay-equivalent.
- **This is the v1 path, not a degradation.** The 'declared' path exists in the boundary spec for forward-compat with future providers (or future SDK versions) that surface attention. Laura's property tests should exercise both paths via mock providers; production v1 only ever hits fallback. Aperture / CLI should treat fallback as the normal case.
- **Forward-compat door is open:** SdkProviderCapabilities.declaresCausalContextWindow is a capability bit. A future provider flips it, includes the optional field on Decision-bearing events, and L1 takes the 'declared' path with no above-L0 code changes. The boundary contract absorbs the churn — which was the whole design goal.

### Coordination flags for Phase 2
- §6.3 Observation subKind enum should add structural_proposal_{emitted,acked,rejected,expired} during Phase 2 (additive per §6.5 — not blocking).
- §8.3 references AppendProtocol.appendFenced({ expectedHead, row }); Roger's §3 final spelling may differ — sync during Phase 2.
- Decision drop at .squad/decisions/inbox/alexander-ctd-phase1-lane3.md.

📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.
# Alexander — History

**Role:** Implementation Specialist (Forge prescriber orchestration, change-vector platform)
**Status:** M0/PR 1 (forge-mcp registration) shipped 2026-05-31. Cycle 2 findings processed.
**Status:** W2-2 + W2-3 complete. Cycle 2 findings processed.
**Last update:** 2026-05-31

**Key milestones:**
- Wave 0-2: Canonical types in @akubly/types, SqliteChangeVectorProvider, Forge test growth
- ForgePrescriberOrchestrator: Attenuation + autoApplyEligible propagation live
- Phase 4.6: 1199+ tests passing, 9 work items landed
- M0 (PR #36): forge-mcp registration in plugin + copilot configs, shipped 2026-05-31 as b22c8e7

## M0/PR 1 — forge-mcp Registration (2026-05-31, PR #36)

**PR:** https://github.com/akubly/stunning-adventure/pull/36
**Branch:** `squad/35-forge-mcp-registration`
**Build:** green (`tsc --build` exit 0)
**Tests:** Baseline maintained (Cairn 609, Forge 644+3, Eureka 3/3)
**Status:** ✅ MERGED as b22c8e7

**Deliverables:**
- Forge prescriber MCP registered in `.github/plugin/.mcp.json`
- Forge prescriber MCP registered in `.copilot/mcp-config.json`
- Issue #35 tracking registration + dogfood integration plan

**CI Events:**
- Commit 85d49b8 (turn alexander-8): Fixed eslint unused-variable error (`originalWrite` from cycle-2 stderr test). Root cause: `npm run lint` fails on Windows (glob expansion broken). Issue #37 filed for permanent fix. Workaround: use `npm run lint --workspace=<name>` for package modifications.

**Rebase (turn alexander-9):**
- Scribe commit d1a953f landed post-PR-open, creating merge conflict
- Clean rebase via `merge=union` driver (both scribe + PR changes retained)
- New HEAD: 3b88f1d
- Force-with-lease push; PR #36 ready for merge

**Post-merge (turn alexander-10, in flight):**
- Worktree cleanup executing
- Branch reset to main
## Rebase Cycle (2026-05-31 — PR #36 mergeability)

**PR:** #36 | **Branch:** `squad/35-register-forge-mcp` | **Worktree:** D:\git\stunning-adventure-35

**Situation:** PR #36 showed `mergeStateStatus: DIRTY, mergeable: CONFLICTING` after scribe commit (`d1a953f`) landed on main earlier this session. This was the same scenario as PR #32 cycle 1 — GitHub's 3-way merge check doesn't honor `.gitattributes merge=union` directive for `.squad/*` files, so union-file overlaps are incorrectly flagged as conflicts.

**Action:** Rebased `squad/35-register-forge-mcp` onto latest `origin/main` (a5b89a2). Rebase auto-resolved all `.squad/*` conflicts via the `merge=union` driver:
- `.squad/decisions.md`: auto-union merged ✓
- `.squad/agents/alexander/history.md`: auto-union merged ✓

**Commit dropped:** Fix for `runtime-cli` (85d49b8) was already upstream in main, so rebase dropped it.

**Validation:** Build ✓, `npm test --workspace=@akubly/runtime-cli` (26/26 tests) ✓, pushed with `--force-with-lease`.

**Result:** PR #36 now shows `mergeable: MERGEABLE` ✓. New HEAD: `2ac5b61` (was `d251e29`).

---

## Learnings (2026-05-31 — Issue #35, PR #36: forge-mcp manifest registration)

**Issue:** #35 | **PR:** https://github.com/akubly/stunning-adventure/pull/36 | **Branch:** `squad/35-register-forge-mcp`

**What was done:** Added `forge` entry to both MCP manifests (`.github/plugin/.mcp.json` and `.copilot/mcp-config.json`). No source changes — registration only.

**Cairn manifest pattern observed:**
- `.github/plugin/.mcp.json`: uses `npx -y --package @akubly/cairn cairn-mcp` (package install + bin invocation). Args are split — `--package` and `@akubly/cairn` are separate array elements, NOT `--package=@akubly/cairn`. Mirrored exactly for `forge`: `npx -y --package @akubly/skillsmith-runtime forge-mcp`.
- `.copilot/mcp-config.json`: cairn uses bare `node dist/mcp/server.js` with no `cwd` field. This is the local-dev config. Since there's only one server entry per config and cairn's path is relative (presumably resolved from the cairn package dir), the forge entry uses a root-relative path `packages/skillsmith-runtime/dist/mcp/server.js` instead of mirroring bare `dist/mcp/server.js` (which would be ambiguous from the repo root).

**Surprising observations:**
1. `squad:alexander` label does not exist in the repo. The available squad labels are: graham, gabriel, roger, rosella, ralph, valanice. Used `squad` (base label) only.
2. The `forge-mcp` server already had its `bin` field declared in `package.json` and the server was fully implemented (stdio transport, `forge_prescribe` registered, DB bootstrap via `cairn.getDb()`). This was purely a missing registration — zero source changes needed.
3. Smoke test (stdio MCP server): exits 0 with empty stderr when stdin is closed immediately. This is correct behavior — the server initializes, connects the transport, and exits cleanly when the input stream closes. "Didn't crash" is confirmed.

**Build/test:** `npm run build --workspace=@akubly/skillsmith-runtime` exit 0; 49/49 tests pass.

---

## Issue #25 — Wave 6 R6 Type-Tightening Polish (2026-05-30, PR #32)

**Branch:** `squad/25-type-tightening-polish`
**PR:** https://github.com/akubly/stunning-adventure/pull/32
**Build:** green (`tsc --build` exit 0)
**Tests:** 24/24 runtime-cli tests passing

Four type-only changes, all carryover from PR #24 cloud-review:

**R6-T1 — Test stub completeness (`forgeMetrics.test.ts:381`):**
The I4 round-trip prescriber stub was returning a partial object missing `exitCode`, `skillId`, `dbPath`, `hints`, and `totalPersisted`. Tightened to the full `ForgePrescribeSuccessResult` contract.

**R6-T2 — `SkillMetricsProfileInfo.tier` (`metrics/types.ts:5`):**
Was `string`, now `LoadedProfileSource` (`'per-skill' | 'per-model' | 'per-user' | 'global'`).
Source of truth: `packages/skillsmith-runtime/src/runtime.ts:21`.

**R6-T3 — `SkillMetricsStaleness.reason` (`metrics/types.ts:25`):**
Was `string | null`, now `'count' | 'age' | 'count+age' | null`.
Source of truth: `ProfileStalenessReason` in `packages/types/src/index.ts:163`. The `annotateProfileStaleness` function in skillsmith-runtime produces exactly these 4 values.

**R6-T4 — `SkillMetricsPrescriberRun.profileSource` (`metrics/types.ts:43`):**
Was `string | null`, now `LoadedProfileSource | null`.
Required a co-change to `loadMetrics.ts`'s JSON-parse annotation (also `string | null`) to remain type-safe without a cast. The event payload is written by `handler.ts` which already typed this as `LoadedProfileSource | null`, so the tightening is semantically correct.

**Key lesson:** When tightening a type on a reader interface, always trace back to the JSON-parse cast in the reader and tighten the parse annotation simultaneously — otherwise TSC will reject the assignment.



**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
**T1 (unused code):** Deleted `resolveRepoKey` function in loadMetrics.ts:28-34 — zero callers found. Only `resolveActiveRepoKey` is used.

**T2 (semantic correctness — IMPORTANT LESSON):** Reverted cycle-2's `json_valid(payload)` guard from the sentinel query (loadMetrics.ts:77). **Lesson: presence-check semantics ≠ quality-check semantics.** The sentinel query answers "is the prescriber_run event type deployed in this database?" (feature-presence), NOT "are all rows parseable?" (data-quality). Adding `json_valid` to the sentinel made the function conflate the two: if all rows were malformed, the sentinel would return false (no rows found) and the function would signal "W5-5 not landed" (wrong!) instead of "W5-5 landed, skill has zero valid runs" (correct). Sentinel is now `WHERE event_type = 'prescriber_run'` only. The main query retains `json_valid()` to skip corrupt rows during json_extract. Test expectations unchanged — the I3 test already asserted the correct behavior (non-null on malformed-only dataset); updated test comment to clarify sentinel semantics.

**T3 (doc sync):** Updated docs/issue-17-async-io-sweep-findings.md:170-174 to reflect both W5-5 async-IO test gaps are now CLOSED: (1) fail-open guarding landed (handler.ts:100-127 try/catch around logEvent), (2) structural no-fs test landed (forgePrescribeMcp.test.ts I5).

**T4 (schema doc correction):** Updated .squad/decisions.md:1167-1181 to reflect the SHIPPED payload schema uses camelCase keys (`skillId`, `triggeredBy`, `sessionId`, `profileSource`, `totalHints`), not the originally documented snake_case. Added a correction addendum explaining the cycle-1 fix realigned to codebase convention. See handler.ts:102-118 for canonical payload construction.

**T5, T6 (gitignore bypass cleanup):** Untracked two gitignored files that were force-added: `.squad/orchestration-log/2026-05-26-wave-6-integration.md` (gitignored by .gitignore:50) and `.squad/log/2026-05-26-wave-6-kickoff.md` (gitignored by .gitignore:51). **Lesson: force-adding gitignored files is an anti-pattern, especially for runtime state files.** These files should have stayed local-only; untracking them restores the .gitignore contract without deleting the local copies.

**Verification:** Build + tests passed cleanly:
- `npm run build` from root: exit 0
- `npm test --workspace=@akubly/runtime-cli`: 24/24 passing
- `npm test --workspace=@akubly/skillsmith-runtime`: 48/48 passing

---

## Issue #25 — Cycle-1 Persona Review Wave (2026-05-30, commit d2ef6d1)

**Trigger:** Persona panel (4 personas: Correctness, Craft, Skeptic, Scope) ran on commits 45f8186 + 5571b3c.

**F1 — JSON.parse boundary narrowing (IMPORTANT, ACCEPTED):**
The `as { profileSource?: LoadedProfileSource | null }` cast on `JSON.parse(row.payload)` was a type lie — the TEXT column contains unchecked runtime data. Any legacy or hand-edited row with `profileSource: 'per-org'` would silently flow through as a typed value. Fixed by:
1. Typing all JSON.parse fields as `unknown`.
2. Adding `normalizeProfileSource(value: unknown): LoadedProfileSource | null` backed by a `ReadonlySet<string>` initialised from the 4 `LoadedProfileSource` members.
3. Exporting the helper `@internal` for direct unit testing.
4. Adding 4 unit tests (valid/unrecognised-string/non-string) + 1 integration test (bad value in DB → null in result).

**Key lesson:** `JSON.parse` returns `any`. Casting the result directly to a typed interface is a type lie — the safety is imaginary. Always type parse output as `unknown` (or a record of `unknown` fields) and narrow each field before use. This is especially important for string enums that live in DB TEXT columns — the DB makes no enum contract.

**F2 — ProfileStalenessReason deduplication (IMPORTANT, ACCEPTED):**
`SkillMetricsStaleness.reason` had an inline literal union that was a hand-copy of `ProfileStalenessReason` from `@akubly/types`. Swapped to the canonical import. JSDoc updated to semantic-only form with `{@link}`.

**Key lesson:** When a union is already defined as a named type in a shared package, always import it — inline copies are drift bombs.

**F3 — history.md scope (REJECTED):** Persona panel Skeptic flagged history.md commits as out-of-scope for a type-tightening PR. Team convention explicitly accepts this (`merge=union` in `.gitattributes`, squad workflow policy). No change made.

**F4 — squad:alexander label:** Label not present in repo; skipped per instructions.

**Build + tests after cycle-1:** `npm run build` exit 0, `npm test --workspace=@akubly/runtime-cli` 28/28 (4 new tests).

**Key takeaway:** The T2 lesson is foundational: when adding defensive guards (like `json_valid`), distinguish between **presence checks** (sentinel queries for feature deployment) and **quality checks** (row-level filters for parseability). Don't conflate them — the semantics diverge when all data is corrupt.

---

## Learnings (2026-05-26 — Wave 6 Cycle-1 Fix Wave)

### Findings Addressed
All 8 accepted findings fixed in 4 commits:
- **B1 (BLOCKING)**: `prescriber_run` payload schema mismatch — handler wrote snake_case (`skill_id`, `profile_used`, `total_hints`); reader queried camelCase (`skillId`, `profileSource`, `totalHints`). SQL filter `json_extract(payload, '$.skillId')` never matched → `forge-metrics` CLI always returned empty prescriber runs in production.
- **I1**: `triggeredBy` field was never set by handler; reader defaults to 'unknown'. Added `triggeredBy: 'mcp:forge_prescribe'` to interface + payload.
- **I2**: Fail-open tests verified tool result was ok but never asserted stderr write happened. Added `vi.spyOn(process.stderr, 'write')` + assertions.
- **I3**: Monolithic try/catch in `queryPrescriberRuns` returned null on ANY error (including SQLite throwing on malformed JSON in json_extract WHERE clause). Added `json_valid(payload)` guard to SQL + per-row JS try/catch for defense-in-depth.
- **I4**: No handler→reader integration test — root cause of why B1 shipped. Added round-trip test calling real `forgePrescribeHandler` then `loadMetrics`.
- **M1**: Duplicate `closeDb()` removed from `.catch()` in forge-metrics.ts.
- **M2**: Vacuous force-flag assertions guarded by `if (inserted > 0)` restructured to unconditional relational contracts.
- **M3**: "serial proof" language in mcp-async-io.test.ts and issue-17 findings doc replaced with "sync IO bounded and guarded"; added clarifying sentence about concurrent-handler serialization.

### Root Cause
Schema contract drift between W5-5 writer (handler.ts, Rosella) and W5-6 reader (loadMetrics.ts, Roger). Each package's test suite was internally consistent but neither tested the cross-package round-trip. The handler tests only verified that a payload was written; the reader tests only verified that a correctly-shaped payload was read. Nobody checked that the shapes matched.

### The Lesson
**Cross-deliverable contracts need at least one round-trip test.** When a writer and reader live in different packages and are developed in separate waves, the integration surface is invisible to unit tests on either side. The I4 round-trip test (forgePrescribeHandler writes → loadMetrics reads) is the test that *would have caught B1 before it shipped*. Going forward: any new event/payload pair that crosses a package boundary must have a round-trip test in the consuming package that imports the writer directly.

### Collateral Discovery
SQLite 3.47.x (bundled by better-sqlite3) throws `malformed JSON` from `json_extract()` when the payload column contains invalid JSON — even in the WHERE clause evaluation. The documented behavior (return NULL for invalid JSON) does not match actual behavior at this version. Added `json_valid(payload)` guard upstream of `json_extract()` to prevent the throw and skip invalid rows gracefully.



## Issue #25 — Cycle-2 Polish Wave Closeout (2026-05-30, commit a51f504)

**Branch:** `squad/25-type-tightening-polish`  
**PR:** https://github.com/akubly/stunning-adventure/pull/32  
**Trigger:** 5 cycle-2 findings accepted by Aaron from the Cycle-1 persona review panel.  
**Build:** green (`tsc --build` exit 0)  
**Tests:** 26/26 runtime-cli tests passing (28 → 26: removed 3 unit tests on unexported helper, added 1 stderr-warning integration test)

### C2-1 — VALID_PROFILE_SOURCES drift guard
Added `_PROFILE_SOURCE_EXHAUSTIVENESS as const satisfies Record<LoadedProfileSource, true>` and derived `VALID_PROFILE_SOURCES` via `Object.keys()`. If `LoadedProfileSource` gains a new member upstream, the build fails at the `satisfies` constraint before any silent runtime regression can occur.

### C2-2 — stderr warning for unknown profileSource values
Added warning at the `queryPrescriberRuns` call site: when `normalizeProfileSource` returns null for a non-empty string, emit `[loadMetrics] prescriber_run row has unknown profileSource "…" — coerced to null\n` to stderr. Mirrors the existing malformed-row warning. New integration test verifies warning fires on `'per-org'` and is silent for `null`/`undefined`/missing.

### C2-3 — normalizeProfileSource unexported (Path A chosen)
**Path A chosen: unexport the helper.** Removed `export` keyword and deleted the 3 unit tests that relied on direct access. Integration coverage (rejection path + round-trip) is adequate. Reasoning: Path A makes privacy real rather than aspirational — a `@internal` comment without enforcement is a lie. Path B (drop the comment) would leave the function on the public surface without a mechanism to enforce against downstream callers importing it via deep-path. Shrinking the test surface to what the public API actually guarantees is the cleaner outcome.

### C2-4 — Comment explaining ReadonlySet<string> widening
Added two-line comment above `VALID_PROFILE_SOURCES` explaining why the annotation is wider than the initializer: `.has(value)` must accept arbitrary strings at the validation site without requiring a cast on every call.

### C2-5 — PR #32 body updated
Updated via `gh pr edit 32 --body-file`. Added "Review cycles" section summarising cycle-1 (F1+F2) and cycle-2 (C2-1..C2-5). Test count updated to 26/26. Acceptance checks updated to reflect current state.

---

## 2026-05-26: Wave 6 Kickoff Summary

Scribe orchestration complete: Graham's v3 scope finalized and merged to `.squad/decisions.md`. Key scope decisions:
- **ChangeVectorProvider** port with async return type for Phase 5 cloud readiness
- **Wave 2/3 split:** Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3 (requires composition-root decision)
- **Hint deduplication** via `(skillId, source, category)` key with active-status filter
- **Two-layer negative-impact attenuation:** Confidence scaling + eligibility flag (`autoApplyEligible`)

Decisions archived; all decisions.md > 20KB now. Ready for implementation on Wave 2 primitives (computation + ranking only; runtime wiring follows in Wave 3).

---

## Core Context


**Role:** SDK/Runtime Dev  
**Joined:** 2026-04-28  
**Specialization:** Monorepo migration patterns, circular dependency resolution, migration framework expertise, prescriber CRUD integration

**Key Patterns Mastered:**
- Migration framework: single `migration.up(db)` with all DDL, versioning tied to filename, idempotent re-runs via `schema_version` table
- Circular dependency management: Cairn↔Forge import constraint solved via mirror + regression test guard (Laura L5)
- CRUD patterns: explicit `db` parameter for transactional control vs internal getDb() calls; anti-join for compute-once guards
- Type field naming: encode semantic space (confidence level vs confidenceBoost multiplier) to prevent latent traps
- Two-tier sort partition (matched vs unmatched) for correct ranking when optional keys diverge negative
- Lockout-routing pattern: cross-assignment fixes prevent author bias; each agent fixes other's code per review

**Recent Work (Phase 4.6 W1–3):**
- Wave 1: A1–A4 completed (migration 012, schema v12, changeVectors CRUD, Curator sweep integration); weight constants decision: mirror in cairn + L5 guard
- Wave 3: Lockout-fixed Rosella's prescriber code (confidence → confidenceBoost); extracted duplicate sort to utils.ts; 3 advisory fixes (safeMin guard, JSDoc, DRY)
- Current: Wave 2 owner for @akubly/types — promote ChangeVectorSummary, define ChangeVectorProvider port, implement SqliteChangeVectorProvider in Cairn

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — @akubly/types Port + Cairn Adapter

Wave 2 scope amended: `docs/forge-phase4.6-wave2-scope.md` updated with PrescriberOrchestrator port + negative-impact attenuation. New ADR merged to `.squad/decisions.md`. Invocation point: `Curator.curate()` post-vector-sweep. Attenuation: when `meanNetImpact < 0`, `confidenceBoost` ≤ 1.0 (minimum 0.3), preventing auto-apply of harmful prescriptions.

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — @akubly/types Port + Cairn Adapter

---

## Summary

**Total entries:** 5 major consultations spanning Phase 4.5 SDK + Phase 4.6 change vectors + Q&A + Round 2 brain system consulting + Round 2 roster proposal

| Date | Event | Status |
|------|-------|--------|
| 2026-05-05 | Initial Brain Sizing (Q&A) | ✅ Completed |
| 2026-05-06 | Phase 4.6 Spec Clarifications | ✅ Completed |
| 2026-05-01 | Change Vector Questions (F1-F2 analysis) | ✅ Completed |
| 2026-05-05–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-22 | Brain Project Roster Proposal (Integration Engineer Core Role) | 🟡 Proposal pending Aaron |

**Key themes:**
- SDK runtime: Forge execution model, decision gates, DBOM provenance
- Change vectors: Before/after metric snapshots, min sessions observed, net impact weighting
- Brain system: Evolved from "monorepo packages/brain/" → "NEW REPO" → "Integration Engineer Phase 1 on-call, data boundaries specialist"
- Brain roster: Proposed Integration Engineer (core) on-call role with Cairn-primary commitment

**Recent decision:** Alexander proposes Integration Engineer on-call role for Brain adapters + MCP tools; recommends new repo with Postgres backend + deployment boundary. Core strength is data-oriented boundaries; Brain needs agentic cognition specialists.

---

## Archive (Summarized)

### Phase 4.5-4.6 SDK + Change Vectors Work (2026-05-01 to 2026-05-04)

**Scope:** Finding 8 fixes, Phase 4.6 foundation (Wave 1 A1-A4), lockout-compliant fixes (Wave 3), advisory fixes (Cycle 3).

**Key deliverables:**

1. **FeedbackSource.getProfile enhancement:** Added optional `granularityKey` parameter to address per-user/per-model profiles. DB key is `(skill_id, granularity, granularity_key)` but contract was less expressive. Fixed with backward-compatible optional param.

2. **Change Vector Foundation (Phase 4.6 Wave 1):** 
   - Migration 012 + schema v12 registration
   - changeVectors CRUD module (with explicit db param for transactions)
   - Curator sweep integration (post-event-loop, anti-join on hints without vectors)
   - Weight constants mirrored in Cairn (can't import Forge); regression test guards divergence

3. **Lockout-Compliant Fixes:** Fixed Rosella's confidence → confidenceBoost rename in prescribers, ensuring semantic clarity (level vs boost).

4. **Advisory Fixes:** safeMin guard for log-denominator (Math.max(1, minVectors)), JSDoc enhancements, DRY extraction for identical sort blocks.

**Architecture decisions:**
- Circular dependency prevention: duplicate weights + regression test (not imports)
- Sign convention: deltas stored as `after - before`; negate lower-is-better for net_impact
- Transactional CRUD: explicit db parameter better than internal getDb() for Curator contexts
- Query planning: SQLite handles JOIN + index-based filtering efficiently for change_vectors

**Test status:** 1034+ passing (cairn 478 + forge 556+, up from baseline 990).

**Lessons:**
- Shared type contracts less expressive than storage = contract bug, not feature gap. Additive optional params have near-zero risk.
- Migration framework handles idempotency; DDL template is single exec() per migration.
- Lockout rule is real safety: cross-review catches blind spots single review misses.
- JSDoc on type fields with runtime invariants should name the code location enforcing invariant, not just intent.

---
- Extracted to `utils.ts` as a pure, exported function. Both prescribers now delegate with one call each, removing 12 lines of duplication.
- Pattern: when a comment in code says "same as [other place]", treat it as a TODO:extract, not just documentation.
**Problem:** `FeedbackSource.getProfile(skillId, granularity?)` couldn't address per-user / per-model profiles. DB key is `(skill_id, granularity, granularity_key)`.

**Fix:** Added optional `granularityKey?: string` third parameter. Updated JSDoc with per-tier semantics (user id for per-user, model id for per-model, 'global' default).

**Verification:** `npm run build` clean; `npm test` 512/512 passing. No call sites changed (optional, additive).

**Lesson:** Treat unexpressive shared contracts as bugs, not feature gaps — additive optional parameters carry low risk.

---

## 2026-05-03–04: Phase 4.6 Waves 1 & 3 Summary

**Wave 1 (Foundation):** A1–A4 completed. Decision: mirror weight constants in cairn + Laura L5 regression test to guard against drift. Curator sweep integration: post-event-loop call, not per-batch, keeps transaction model clean.

**Wave 3 (Lockout Fixes):** Fixed Rosella's prescriber code—renamed `confidence` → `confidenceBoost` (semantic distinction: level vs multiplier). Extracted 8-line duplicate sort block from both prescribers to `utils.ts` (12 lines removed, one call each).

**Key Lesson:** Advisory findings surface edge cases (null checks, boundary behavior) that happy-path code misses. Cycle 3's `safeMin` guard (`minVectors=0` → denominator `Math.log(1) = 0`) is exactly this.

**Build status:** 1153 tests passing (baseline 990 + 163 new). Branch review-clean, all cycles complete.

---

## 2026-05-22: Wave 3 Integration Analysis — Curator–MCP Wiring Mapped

Completed comprehensive integration surface analysis for Wave 3 Curator-driven orchestration. All five requested sections delivered:

**1. Curator surface today:**
- `curate(changeVectorConfig?)` exports from `packages/cairn/src/agents/curator.ts`; returns `CurateResult` with `changeVectorSweep` metadata
- Call sites: `sessionStart.ts:68` and `mcp/server.ts:327` (both read-only in Wave 2)
- Vector sweep identifies skills with newly computed categories; invocation hook for Wave 3 injector

**2. Profile selection strategy (three independent dimensions):**
- **Trigger set:** Trigger-driven (skills with new vectors) vs. global vs. hybrid batching. **Recommended:** Trigger-driven for v1.
- **Granularity tier:** Per-skill only vs. all tiers. **Recommended:** Per-skill only (matches vector computation scope).
- **Skip conditions:** No profile, immature sessionCount, stale profile. **Recommended:** v1 skips on no-profile or `sessionCount < minSessions`.
- Operators observe: skills processed, skipped, hint volume, dedup stats.

**3. MCP tool shape:** `run_prescriber_optimization(force?: boolean)` with output: success, skills processed, hints (generated/inserted/dedup'd), vector applicability, next steps.

**4. Curator config surface:** Backward-compatible signature addition: `curate(changeVectorConfig?, prescriberOrchestrationConfig?)`. Orchestrator is an injectable dependency (`runForSkill` function + optional profile loader). Composition root constructs and passes it.

**5. ADR blockers identified:**
- Composition root choice (A–D from Roger's track) gates implementation
- Hook vs. MCP tool vs. both (invocation model)
- Eager vs. lazy Forge import (startup cost, optional dependency handling)
- Profile expansion (explicit skill list, global tier fallback, staleness) deferred to Wave 4

Analysis is **mechanical once composition root is decided**. Hard parts (data plumbing, attenuation, dedup) already in Wave 2. Full report: `.squad/agents/alexander/wave3-integration-analysis.md`.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Clean separation, best test isolation, Phase 5-ready. Unblocks all Wave 3 work items.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool exposure in Wave 3. Curator hook is autonomous surface; `forge-prescribe` CLI is manual surface. `run_prescriber_optimization` MCP tool deferred to later wave when concrete operator need surfaces. Removes ~7 items, ~18 tests from Wave 3 scope.
- **W3-D4: Curator Hook → Always-On** — Automatic prescriber orchestration invocation enabled always. No opt-in flag in v1. Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) sufficient. Profile selection trigger-driven only; global tier fallback deferred to Wave 4.

## Learnings (2026-05-22: Wave 3 Integration Analysis — Curator–MCP Wiring Mapped)
- Keeping Forge's local `OptimizationCategory` union in place is safe for W2-2 because Roger canonized the shared union to match Forge's stricter category set; the barrel contract stays structurally compatible in both directions.
- Added `packages/forge/src/prescribers/types.contract.test.ts` with two guards: barrel-vs-canonical type assignability and a prompt-prescriber regression using a canonical summary carrying `autoApplyEligible`. Validation passed with `npm run build` from repo root and `npm test --workspace=@akubly/forge` (599 passed, 3 todo).
- `runForgePrescribers()` now lives in `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts`, queries an optional `ChangeVectorProvider`, and returns the combined prompt/token hint list without dedup or persistence.
- Forge attenuation semantics are now: mature vectors with `meanNetImpact <= -0.2` attenuate confidence to `max(0.1, 1 + meanNetImpact)` and force `autoApplyEligible = false`; sparse negatives or mature negatives above `-0.2` stay neutral at `confidenceBoost = 1.0`.
- `autoApplyEligible` is stored on matched hints both as a top-level field and in `hint.evidence.autoApplyEligible`; unmatched hints omit the field so Phase 4.5 callers still read absence as eligible.
- Added `packages/forge/src/prescribers/forgePrescriberOrchestrator.test.ts` with ten cases (nine maturity-gradient scenarios plus provider-failure fallback); validation passed with `npm test --workspace=@akubly/forge` (609 passed, 3 todo), root `npm test`, and root `npm run build`.
- Negative-impact auto-apply gating is now inclusive at `<= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (`-0.2`), keeping exact-boundary cases on the manual-review side because the safety asymmetry favors false positives over false negatives.
- Wave 3 integration is **injection-based**: Curator accepts an optional orchestrator config (not a direct Forge import). This preserves the acyclic dependency boundary and allows composition root to wire both packages independently. The orchestrator is a simple function pointer (`runForSkill`), not a class — keeps it lightweight and testable.

## Learnings (2026-05-23 — W3-3 Prescriber orchestration types)
- `ExecutionProfile` was already canonized in `@akubly/types`, so W3-3 should extend that package in place instead of duplicating or structurally mirroring the shape from Cairn. That keeps the dependency boundary acyclic and avoids type drift between Curator, Forge, and the composition root.
- `loadProfile` stays **synchronous** for Wave 3 because today's loader shape (`FeedbackSource.getProfile()` and Cairn DB accessors) is synchronous. If Phase 5 cloud/profile fetching makes this async later, evolve the shared contract then rather than widening early without a caller.
- `packages/skillsmith-runtime/src/index.ts` now re-exports the canonical `PrescriberOrchestrationConfig` / `PrescriberRunResult` types from `@akubly/types`; W3-5 can wire real implementations against those exports without changing the scaffold API.
- W3-4 should consume `PrescriberOrchestrationConfig.loadProfile()` as an optional sync hook and treat null as a skip path; W3-5 should return `PrescriberRunResult` counts aligned with Forge's raw hint generation and Cairn dedup/persistence outcomes.

## Learnings (2026-05-23 — W3-5 Prescriber orchestration factory)
- Extracted a shared `executePrescriberRun()` helper in `packages/skillsmith-runtime/src/index.ts` so both `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` reuse the same provider → Forge prescriber → dedup/persist pipeline. The CLI keeps its Wave 2 result contract and global fallback behavior, while the Curator-facing factory stays a thin adapter.
- Factory profile loading is **per-skill only** and `runForSkill()` calls the exact same `loadProfile` closure it exposes. Missing profile or `sessionCount < minSessions` returns a zero-count `PrescriberRunResult` as the skip semantic; W3-6 does not need an extra skip flag.
- `CreatePrescriberOrchestrationConfigOpts` now accepts either an owned SQLite handle (`db`) or `dbPath`; local row loading avoids Cairn singleton coupling when the caller already has a DB connection.

## Learnings (2026-05-23 — W3-4 curate() signature extension)
- `curate()` had to become `async` because `PrescriberOrchestrationConfig.runForSkill()` is async. That propagated to every live sync consumer: `packages/cairn/src/hooks/sessionStart.ts`, `packages/cairn/src/mcp/server.ts`, Cairn curate tests, and Forge's `wave2-pipeline` integration test now all `await` the Curator result.
- The smallest viable trigger signal is a distinct `computedSkillIds` array on `ChangeVectorSweepResult`, populated only when a new change vector row is inserted this sweep. That keeps W3-4 trigger-driven without re-querying history or inventing a second notion of eligibility.
- `minSessions` should come from the existing `ChangeVectorConfig.minSessionsObserved` fallback chain (`DEFAULT_MIN_SESSIONS`), and Curator should pass that same value into `runForSkill(skillId, minSessions)` so vector gating and prescriber gating stay aligned. Curator itself should not pre-filter via `loadProfile()`; skip semantics stay inside the orchestrator closure.
- The qualifying-skill list should be sorted before orchestration/tests consume it. SQLite's natural row order is not a contract, so sorting `computedSkillIds` prevents flaky call-order assertions and keeps operator output stable.
- Fail-open needs to be visible in two places: `console.warn` for operators and an inline `PrescriberRunResult` error row (`hintsGenerated/Inserted/Duplicated = 0`, `hintsError = 1`) so W3-5/W3-6 can surface partial-success counts without special-case plumbing.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**W3-3, W3-4, W3-5 shipped:**
- W3-3: `PrescriberOrchestrationConfig` + `PrescriberRunResult` types canonized in `@akubly/types`
- W3-4: `curate()` async, trigger-driven orchestration loop, fail-open semantics, 4 new + 32 updated tests
- W3-5: Shared `executePrescriberRun()` helper extracted; `createPrescriberOrchestrationConfig()` factory wired; Cairn `getExecutionProfileWithDb()` convenience added

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Skillsmith-Runtime: 6/6 passing

Wave 3 delivers fully-realized Curator-driven orchestration. Type contracts locked in `@akubly/types`. Per-skill execution pipeline centralized. Factory ready for W3-6 hook wiring.

## Learnings

## R6 Ceremony — Source-Reading Rule Lifted (2026-05-24)

**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate).

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.
### Wave 3 Shipped (2026-05-23 ~21:08Z)

PR #21 merged as f27a537 on main. 1219 tests passing. 7 work items delivered end-to-end: composition root R2 (`@akubly/skillsmith-runtime`), Curator hook wiring, per-skill orchestration, E2E tests, Phase 5-ready acyclic boundaries. 14 Copilot findings addressed across 4 review cycles. 1 deferral approved: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE) → Wave 4.

## Learnings

**Commits:** fc897a0, 8f16ad1, 04f02b0

**Build:** forge package clean (`tsc --project packages/forge/tsconfig.json` exit 0). Full monorepo build has a pre-existing error in cairn's `curator.ts:631` (Rosella's work-in-progress, not touched here).

- Pattern: when a comment in code says "same as [other place]", treat it as a TODO:extract, not just documentation.
- Extracted to `utils.ts` as a pure, exported function. Both prescribers now delegate with one call each, removing 12 lines of duplication.
---

- JSDoc on type fields with runtime invariants should name the code location enforcing invariant, not just intent.
- Lockout rule is real safety: cross-review catches blind spots single review misses.
- Migration framework handles idempotency; DDL template is single exec() per migration.
- Shared type contracts less expressive than storage = contract bug, not feature gap. Additive optional params have near-zero risk.

**Lessons:**

**Test status:** 1034+ passing (cairn 478 + forge 556+, up from baseline 990).

---

## 2026-05-27: London-School TDD Strategy Authored + OQ-1 Monorepo Resolution

**Event:** London-school TDD spine delivered and reviewed  
**Impact:** Shared substrate topology finalized; data boundaries stable for Brain integration  

**For Alexander's context:**
- **OQ-1 RESOLVED:** Aaron chose Option A (monorepo). `mem/` and `harness/` merging into `@akubly/` with shared `packages/{cairn,forge,types}`. SessionId brand is now a single source of truth in `@akubly/types`. Integration Engineer role (your proposed Eureka Phase 1 on-call, data-oriented boundaries specialist) can build adapters against a fixed substrate.
- **TDD Spine Live:** `docs/eureka/sections/55-tdd-strategy.md` authored and approved. London-school outside-in approach defines mock contract style for CuratorStore, ClockProvider, and session-scoped query boundaries. Your data-oriented strength is needed for adapter design (Brain ↔ Eureka ↔ Cairn + Forge).
- **MCP Tools + Adapters Ready:** Integration Engineer role aligns perfectly with Brain's data-boundary expertise. Monorepo enables cleaner cross-package imports (no longer npm-publish-to-sync); your adapter code can work with shared `@akubly/types` directly.

**Next:** Integration strategy can proceed with stable type contracts. Brain adapters can rely on SessionId brand and Eureka's emerging session-scoped signatures.
---

**Older learnings archived to history-archive.md**
### 2026-05-27 — PR #24 Cloud Review Round 2 (8662579)

- Query planning: SQLite handles JOIN + index-based filtering efficiently for change_vectors
- Transactional CRUD: explicit db parameter better than internal getDb() for Curator contexts
- Sign convention: deltas stored as `after - before`; negate lower-is-better for net_impact
- Circular dependency prevention: duplicate weights + regression test (not imports)
**Architecture decisions:**

4. **Advisory Fixes:** safeMin guard for log-denominator (Math.max(1, minVectors)), JSDoc enhancements, DRY extraction for identical sort blocks.

3. **Lockout-Compliant Fixes:** Fixed Rosella's confidence → confidenceBoost rename in prescribers, ensuring semantic clarity (level vs boost).

   - Weight constants mirrored in Cairn (can't import Forge); regression test guards divergence
   - Curator sweep integration (post-event-loop, anti-join on hints without vectors)
   - changeVectors CRUD module (with explicit db param for transactions)
   - Migration 012 + schema v12 registration
2. **Change Vector Foundation (Phase 4.6 Wave 1):** 

1. **FeedbackSource.getProfile enhancement:** Added optional `granularityKey` parameter to address per-user/per-model profiles. DB key is `(skill_id, granularity, granularity_key)` but contract was less expressive. Fixed with backward-compatible optional param.

**Key deliverables:**

**Scope:** Finding 8 fixes, Phase 4.6 foundation (Wave 1 A1-A4), lockout-compliant fixes (Wave 3), advisory fixes (Cycle 3).

### Phase 4.5-4.6 SDK + Change Vectors Work (2026-05-01 to 2026-05-04)

## Archive (Summarized)
**R2-T1: Constant deduplication** — ATTENUATION_FLOOR had a local duplicate in runtime-cli/src/metrics/loadMetrics.ts. Canonical source is @akubly/types/src/index.ts:246. Import from there; added @akubly/types to runtime-cli deps.

**R2-T2: Clock skew resilience** — daysBetween() can return negative when updatedAt is greater than now. Clamp to >= 0 at caller (line 150 in loadMetrics.ts): Math.max(0, daysBetween(...)). Mirrors sessionsSinceUpdate pattern. No test added (review accepted existing pattern).

**R2-T3: Circular import resolution** — mcp/handler.ts imported runForgePrescribe and loadExecutionProfile from ../index.js, while index.ts re-exported forgePrescribeHandler from handler. **Solution:** extracted core runtime logic to new runtime.ts module. Both handler.ts and index.ts now import from runtime.ts. index.ts maintains public API via re-exports. Pattern: when barrel (index.ts) and module create cycle, extract shared logic to third module.

**R2-T4: MCP tool annotations** — forge_prescribe mutates state (inserts hints). Added annotations: { readOnlyHint: false } per Cairn MCP convention (see cairn/src/mcp/server.ts:323 for write tools, vs :112 for read tools). This is part of the MCP tool contract — signals mutation to clients/runtime.

**Learnings:**
- Shared constants belong in @akubly/types, not duplicated per package
- Clamp time-delta computations to handle clock skew (NTP drift, VM suspend/resume)
- Circular imports between barrel and impl → extract to third module
- MCP readOnlyHint is a semantic contract, not optional metadata

---

**Recent decision:** Alexander proposes Integration Engineer on-call role for Brain adapters + MCP tools; recommends new repo with Postgres backend + deployment boundary. Core strength is data-oriented boundaries; Brain needs agentic cognition specialists.

- Brain roster: Proposed Integration Engineer (core) on-call role with Cairn-primary commitment
- Brain system: Evolved from "monorepo packages/brain/" → "NEW REPO" → "Integration Engineer Phase 1 on-call, data boundaries specialist"
- Change vectors: Before/after metric snapshots, min sessions observed, net impact weighting
- SDK runtime: Forge execution model, decision gates, DBOM provenance
**Key themes:**

| 2026-05-22 | Brain Project Roster Proposal (Integration Engineer Core Role) | 🟡 Proposal pending Aaron |
| 2026-05-05–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-01 | Change Vector Questions (F1-F2 analysis) | ✅ Completed |
| 2026-05-06 | Phase 4.6 Spec Clarifications | ✅ Completed |
| 2026-05-05 | Initial Brain Sizing (Q&A) | ✅ Completed |
|------|-------|--------|
| Date | Event | Status |

**Total entries:** 5 major consultations spanning Phase 4.5 SDK + Phase 4.6 change vectors + Q&A + Round 2 brain system consulting + Round 2 roster proposal

## Summary

# Alexander — History (Summarized)


---

## Cross-Team Context: Eureka v1 Design Package Locked (2026-05-28)

**Status:** Eureka v1 design package completed 3-cycle persona review and is now **M1 implementation-ready**.

**What changed:** 19 cycle-1 findings (3 blocking, 11 important, 5 minor) all accepted and landed in cycle 2 fix wave. Cycle 3 cleanup addressed 4 advisories. Design contradictions resolved:
- B1: Scoring formula canonicalized to additive (0.50 relevance + 0.20 importance + 0.20 trust + 0.10 recency)
- B2: Trust/retire semantics: field-level immutability + explicit retirement flag + zombie-fact preservation
- B3: Decision ownership: Forge writes audit (immutable), Eureka writes learning fact (mutable), shared decision_id

**Key fact-correction:** ACT-R exponent corrected 0.7 → 0.5 (caught by Compliance reviewer during cycle 2).

**Deliverables:** PRD v5, TDD Strategy (§55), Technical Design (§00–§50). All documents locked for M1.

**M1 Go/No-Go:** Design ready. Eval set grounded in mem/ repo (M0 deliverable). M1–M5 milestones validated by Pragmatist reviewer.

**For you:** If your work depends on Eureka design decisions, those are now stable. Cross-refs and canonical values are in .squad/decisions.md (Cycle 1 + Cycle 3 sections).

**Commits:** f68873d (cycle 2 fix wave) + 37370f9 (cycle 3 cleanup).

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**2026-05-30 rebase:** Rebased squad/25-type-tightening-polish onto origin/main (ef06238, Eureka v1 PR #30). Old base: 53cd645. New HEAD: 65a88de. Rebase was clean — merge=union driver auto-resolved all .squad/ history conflicts. Build required npm install to refresh node_modules junctions (worktree had stale junctions pointing to pre-Eureka main repo; ef06238 added SessionId to @akubly/types). 26/26 runtime-cli tests green. Force-with-lease pushed; PR #32 mergeStateStatus cleared to MERGEABLE.

## Learnings (2026-05-30 — Post-merge cleanup, PR #32)
**2026-05-30 cleanup:** PR #32 merged to main as commit aae18ae. Post-merge teardown completed per WI-B cleanup recipe: node_modules confirmed real (not junction), removed recursively; worktree D:\git\stunning-adventure-25 removed cleanly; local branch squad/25-type-tightening-polish deleted (forced after merge detection lag); remote branch deleted via `git push origin --delete`. Main's node_modules/@akubly survived intact. All verification checks passed. Recipe worked as documented; WI-B incident guard (strict cleanup ordering to prevent junction traversal during worktree remove) validated.

📌 Team update (2026-05-30T23:05:00Z): **PR #32 / issue #25 shipped** as commit aae18ae. The runtime-cli metrics types are now backed by canonical unions (LoadedProfileSource, ProfileStalenessReason) with runtime-validated payload narrowing at the JSON.parse boundary. Lessons: (1) JSON.parse → unknown + boundary validation + stderr warning + drift-guard (2) @internal helpers prefer unexport (Path A) over convention promise (3) agent history.md commits in PRs are in-scope per merge=union pattern. — Scribe

**2026-05-31 cleanup:** PR #36 merged to main as commit b22c8e7. Post-merge teardown completed per WI-B cleanup recipe: node_modules confirmed real (not junction), removed recursively; worktree D:\git\stunning-adventure-35 removed cleanly; local branch squad/35-register-forge-mcp deleted (force after merge detection); main's node_modules/@akubly survived intact. All verification checks passed.
## Lint Error Fix (2026-05-31 — PR #36 CI Blocker)

**Issue:** CI build #20 on PR #36 failed with @typescript-eslint/no-unused-vars on orgeMetrics.test.ts:346: originalWrite was captured but never used.

**Root cause:** Latent bug from PR #32 cycle-2 stderr-warning test. The test captured process.stderr.write to restore it later, but the restoration never happened (dead code). Root 
pm run lint (eslint packages/*/src/) fails silently on Windows, so this only surfaced in Linux CI.

**Fix:** Option B (delete unused capture). The afterEach hook already calls i.restoreAllMocks(), so manual restoration was unnecessary. Commit 85d49b8, bundled into PR #36.

**Validation:** ✅ 
px eslint packages/runtime-cli/src/__tests__/forgeMetrics.test.ts (exit 0) ✅ 
pm test --workspace=@akubly/runtime-cli (26/26 green) ✅ 
pm run build --workspace=@akubly/runtime-cli (exit 0)

**Lesson learned:** Windows agents must use workspace-scoped lint (
pm run lint --workspace=<name>) rather than relying on root lint. The glob slint packages/*/src/ doesn't work in PowerShell; follow-up issue filed to fix root lint permanently.

**Follow-up:** Opened issue #XX for root 
pm run lint Windows failure — issue #37 opened (squad/gabriel tag).

