# Squad Decisions

## Active Decisions

### W2-1: ChangeVectorSummary Category Field (Roger)

**Scope:** Type consolidation for shared `ChangeVectorSummary` contract

**Decision:** Use stricter `OptimizationCategory` union (six-value string union from Forge) for `category` field in canonical `@akubly/types` definition.

**Rationale:** Forge already encodes the domain's real category set. Making the union canonical now ensures type safety for W2-2/W2-7 follow-on work while remaining additive (no existing duplicates switched yet).

**Impact:** Both Forge and Cairn gain shared, stricter type contract; future category additions go through Forge's enum.

### W2-7: Category Narrowing at SQLite Boundary (Rosella)

**Scope:** Cairn data layer type safety for ChangeVectorSummary contract

**Decision:** Narrow raw `optimization_hints.category` strings at Cairn's SQLite read boundary instead of widening the shared contract back to `string`.

**Implementation:** `getAllCategories()` filters DB values through the canonical `OptimizationCategory` union from `@akubly/types`. `summarizeChangeVectors()` only accepts narrowed categories. `SqliteChangeVectorProvider.getSummaries()` drops summaries where `vectorCount === 0`.

**Rationale:** DB schema remains permissive for backward compatibility, but cross-package `ChangeVectorSummary` contract is strict. Narrowing once at boundary keeps rest of Cairn aligned with Forge's canonical union without unsafe casts. Zero-vector summaries provide no historical signal and trigger Phase 4.5 fallback mode.

**Impact:** Cairn data layer now type-safe; empty summaries filtered at provider output.

### W2-5: Negative Impact Gate + autoApplyEligible Semantics (Alexander)

**Scope:** Attenuation boundary and hint eligibility signal for negative-impact vectors

**Decision:** Gate boundary is **inclusive** (`<=`) at `-0.2`. Mature negative vectors attenuate and disable auto-apply when `meanNetImpact <= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (value: `-0.2`). A summary at exactly `-0.2` triggers auto-apply disable.

**Rationale:** Safety asymmetry + FP fragility. Inclusive boundary prevents false positives at the exact threshold and provides stronger guard against brittle boundary conditions. Dual-layer testing locks behavior: unit test (alexander-2 maturity-gradient) expects gating at exactly -0.2; E2E canary (laura-1 wave2-pipeline) uses constant directly for drift-proof coverage.

**Implementation:** Gate comparison changed from `<` to `<=` in Forge prescribers and Cairn gate logic. Safety-boundary comment added at comparison site. Maturity-gradient test updated to expect gating at exactly -0.2. E2E pipeline canary uses `NEGATIVE_IMPACT_AUTO_APPLY_GATE` constant directly (prevents configuration drift).

**Impact:** Negative-impact gate boundary now locked by dual-layer testing (unit + E2E); Applier receives explicit attenuation signal for hints at and below threshold; safety margin increased. Decided by Aaron 2026-05-22.

### W2-8: Active Status Set for Optimization Hints (Rosella)

**Scope:** Deduplication logic for `(skillId, source, category)` tuples

**Decision:** Use `pending`, `accepted`, and `deferred` as the active statuses for optimization-hint dedup. Terminal statuses (`applied`, `rejected`, `expired`, `suppressed`, `failed`) do not block reinsertion of same semantic recommendation.

**Rationale:** Active set represents hints still live in operator workflow: waiting to be reviewed, explicitly approved but not yet applied, or intentionally postponed. A second hint during those states duplicates work and pollutes category history. Terminal statuses no longer represent live hints, so they should not block fresh inserts—allows operators to retry after rejection or expiration.

**Implementation:** `packages/cairn/src/db/optimizationHints.ts` encodes `ACTIVE_HINT_STATUSES` constant and uses in both `insertHintIfNew()` and `hasActiveOptimizationHint()`.

**Impact:** Deduplication now enforced at Cairn DB layer; Forge applier receives deduplicated hint stream; zero-vector summaries filtered at provider boundary.

### W2-9: Manual CLI Surface Location (Roger)

**Scope:** Composition root for Wave 2 manual orchestration

**Decision:** Created new `packages/runtime-cli/` workspace package with bin entry `forge-prescribe`. This package is the explicit composition root that can legally import both `@akubly/cairn` and `@akubly/forge`.

**Rationale:** Repo already exposes binaries from package-level `bin` entries (e.g., `@akubly/cairn`). Wave 2 needs composition root without creating package cycles. `packages/runtime-cli` keeps boundary honest and buildable. Local invocation: `npx forge-prescribe --skill <id> [--db <path>]`.

**Implementation Details:**
- Per-skill → global profile fallback: Try canonical `(granularity='per-skill', granularity_key='global')` first, then fall back to `global/global`
- Exit codes: `0` on success (including zero hints or dedup skips), `1` when no profile found, `2` for arg/DB/persistence errors
- CLI tests: 4 passing (happy path, no-profile, empty result, mixed)

**Impact:** Wave 2 has manual trigger surface independent of Curator. Wave 3 will migrate to Curator-driven automatic orchestration. Package boundary preserved for future Phase 5 cloud wiring.

### W2-6: E2E Pipeline Test Location + Spec Ambiguity Note (Laura)

**Scope:** Integration test placement and discovered spec mismatch

**Decision:** Placed Wave 2 end-to-end pipeline test in `packages/forge/src/__tests__/wave2-pipeline.test.ts`. Forge is focal point because `runForgePrescribers()` is consumer ingesting Cairn summaries and emitting final hints applier sees.

**Spec Ambiguity Discovered:** `docs/forge-phase4.6-wave2-scope.md` §6.1 says `meanNetImpact = -0.2` should yield `autoApplyEligible = false`, but live Forge/Cairn logic and Alexander's W2-5 tests treat boundary as still eligible (`meanNetImpact >= NEGATIVE_IMPACT_AUTO_APPLY_GATE`). Test kept aligned with implementation + §4.5 semantics. **Action item:** Reconcile boundary explicitly in Wave 3 (pending ADR).

**Rationale:** Forge already hosts substantive integration coverage under `packages/forge/src/__tests__/`. New test stays with existing cross-module surface instead of one-off harness. To avoid production dependency from Forge to Cairn, test imports Cairn source directly and Forge's `tsconfig.json` excludes test files from package build.

**Test Coverage:** Full maturity gradient (0 vectors → mature catastrophic), dedup regression on repeated persistence, provider omission, fail-open behavior, shared `ChangeVectorSummary` contract flow.

**Impact:** Real SQLite path fully validated; attenuation + `autoApplyEligible` propagation verified end-to-end; provider fail-open semantics confirmed.

### W3-D1: Composition Root → R2 (`@akubly/skillsmith-runtime`)

**Scope:** Where should the runtime that imports both `@akubly/cairn` and `@akubly/forge` live?

**Decision:** Adopt R2 — new `@akubly/skillsmith-runtime` library package (composition layer importing both) plus thin `@akubly/runtime-cli` wrapper.

**Rationale:** Clean separation of concerns, best test isolation, zero build-order risks, Phase 5-portable. Roger and Alexander independently converged on this architecture.

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Unblocks all Wave 3 work items

### W3-D2: Package Name → `@akubly/skillsmith-runtime`

**Scope:** What name for the new composition library package?

**Decision:** Use `@akubly/skillsmith-runtime` (domain-specific, not generic `@akubly/runtime`).

**Rationale:** Domain-specific naming (a) fits the cairn/forge metaphor, (b) describes what operates on (skills), (c) leaves room for future additions (scheduler, dashboard, policy engine).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Naming locked; packaging can proceed

### W3-D3: MCP Tool Exposure → Dropped from Wave 3

**Scope:** Should Wave 3 include an MCP tool for manual prescriber invocation?

**Decision:** No — Wave 3 ships with no MCP tool exposure. Curator hook is autonomous surface; CLI is manual surface.

**Rationale:** Proposed `run_prescriber_optimization` tool offers no net-new capability over existing CLI. Defer to later wave when concrete operator need surfaces. Removes W3-6, W3-7, ~2 MCP scenarios from W3-9 (~7 items, ~18 tests).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Wave 3 scope reduced; MCP tool re-opens only when operator need materializes

### W3-D4: Curator Hook Invocation → Always-On

**Scope:** Should Curator automatically invoke prescriber orchestration in v1?

**Decision:** Yes — automatic invocation always enabled. No opt-in flag in v1.

**Rationale:** Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) are sufficient. Opt-in flag adds config without meaningful safety benefit.

**Status:** Accepted by Aaron 2026-05-22

**Locked Design:** Hint persistence stays in orchestrator; fail-open codified; profile selection trigger-driven only (global fallback deferred to Wave 4).

**Impact:** Unlocks automatic hint flow; enables Wave 3 implementation

### W3-Impl-1: Workspace Dependencies via Existing Pattern (Roger)

**Scope:** How should `@akubly/skillsmith-runtime` declare dependencies on Cairn/Forge/Types?

**Decision:** Use existing internal dependency specifier pattern (`"*"`) instead of `workspace:*`. Root monorepo workspace glob `packages/*` covers new package; no redundant root `workspaces` entry needed.

**Rationale:** Environment npm rejects `workspace:*` with `EUNSUPPORTEDPROTOCOL`. Repository already uses `"*"` pattern consistently; new package integrates cleanly with existing convention.

**Implementation:** `skillsmith-runtime/package.json` declares `"@akubly/types": "*"`, `"@akubly/cairn": "*"`, `"@akubly/forge": "*"`. Root `tsconfig.json` references updated.

**Impact:** Workspace registration consistent across all packages; new package installs and builds cleanly.

### W3-Impl-2: Thin Runtime-CLI via Composition Migration (Roger)

**Scope:** How to refactor `runtime-cli` while preserving CLI contract?

**Decision:** Move entire `runForgePrescribe()` composition body from `runtime-cli` to `skillsmith-runtime/src/index.ts`. Reduce `runtime-cli` to thin facade: arg parsing, console formatting, exit-code mapping, top-level error reporting.

**Rationale:** Implements W3-D1 (R2 architecture) immediately instead of carrying temporary inline composition forward. Moved code is the old implementation, relocated intact — smallest behavioral risk. Avoids asking Alexander to re-migrate same code in W3-5.

**Implementation:** `skillsmith-runtime` owns `runForgePrescribe()` (profile load, vector provider, Forge invocation, dedup, persistence). `runtime-cli` owns CLI concerns only. CLI contract (`npx forge-prescribe --skill <id>`) unchanged.

**Impact:** Composition root established; CLI behavior identical; foundation ready for W3-5 Curator factory.

### W3-Impl-3: ExecutionProfile Reuse in Types (Alexander)

**Scope:** How to define `PrescriberOrchestrationConfig` and `PrescriberRunResult` in `@akubly/types`?

**Decision:** Keep `ExecutionProfile` in canonical location (`@akubly/types`); reference directly from `PrescriberOrchestrationConfig`. Keep `loadProfile` **synchronous** in Wave 3.

**Rationale:** `ExecutionProfile` already stable in `@akubly/types`; re-declaring structurally creates duplicate truth. Synchronous `loadProfile` matches current reality (Cairn SQLite-backed accessors are sync). Async deferrable to Phase 5 if cloud profile loading surfaces.

**Implementation:** Added `PrescriberOrchestrationConfig` and `PrescriberRunResult` to `packages/types/src/index.ts`. `skillsmith-runtime` re-exports canonical types. No Cairn compatibility shim required.

**Impact:** Wave 3 Curator-facing port has stable, reusable type contracts. No Cairn-to-types inversion. Foundation for W3-4 and W3-5.

### W3-Impl-4: Curate Async Transition + Trigger-Driven Skills (Alexander)

**Scope:** How should `curate()` accept and orchestrate the prescriber config?

**Decision:** 
1. `curate()` is now `async`, returns `Promise<CurateResult>`
2. Qualifying skills sourced from `ChangeVectorSweepResult.computedSkillIds` — distinct, sorted skill IDs whose vectors were newly inserted this cycle
3. Per-skill `runForSkill(skillId, minSessions)` receives `minSessions` from existing Curator chain: `changeVectorConfig?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS`

**Rationale:** `runForSkill()` is async by contract; keeping `curate()` sync would lie or drop orchestration results. `computedSkillIds` is smallest signal matching accepted trigger-driven rule. Reusing `minSessionsObserved` aligns vector-sweep and prescriber gates.

**Implementation:** All sync call sites updated to `await curate()`. Per-skill exceptions log `console.warn`, produce error-shaped `PrescriberRunResult`, do not abort cycle (fail-open).

**Impact:** Async Curator orchestration ready for W3-5/W3-6. Fail-open semantics locked. All 32 call sites updated and tested. Cairn 576/576 passing.

### W3-Impl-5: Shared Prescriber Execution Helper (Alexander)

**Scope:** How to avoid duplicating the Cairn+Forge composition pipeline between manual CLI (`runForgePrescribe`) and Curator factory?

**Decision:** Extract shared `executePrescriberRun()` helper inside `packages/skillsmith-runtime/src/index.ts` that owns the per-skill execution body:
1. Instantiate `SqliteChangeVectorProvider`
2. Call `runForgePrescribers()`
3. Persist hints via Cairn `insertHintIfNew()` dedup
4. Return generation / inserted / duplicated / error counts

`runForgePrescribe()` (manual CLI) keeps existing operator-facing result contract and global profile fallback. `createPrescriberOrchestrationConfig()` (Curator factory) adapts to Curator-facing `PrescriberRunResult` contract.

**Rationale:** Single-sourced composition body while allowing different consumers to apply different profile-selection policy and result shaping. Makes W3-6 hook wiring smaller.

**Implementation:** Extracted `executePrescriberRun()` helper. `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` both call shared helper. Cairn gains `getExecutionProfileWithDb()` convenience.

**Impact:** Composition logic centralized, no duplication. Factory ready for W3-6 hook wiring. Per-skill Curator orchestration fully realized. Skillsmith-Runtime 6/6 passing.

### W3-Impl-6: Curator Hook Wiring via Injected Config (Roger)

**Scope:** How to wire always-on Curator prescriber orchestration at session start without violating W3-D1 boundary?

**Decision:** Pick **R-Hook-A (inject config into hook)**. `packages/cairn/src/hooks/sessionStart.ts` accepts optional `PrescriberOrchestrationConfig` and forwards to `curate(undefined, prescriberOrchestrationConfig)`. Production bootstrap moved to `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, which calls Cairn's hook runner with factory that constructs `createPrescriberOrchestrationConfig({ db })` from already-open SQLite handle.

**Rationale:** Smallest change preserving W3-D1 boundary. Cairn owns hook mechanics and Curator invocation but does not import `skillsmith-runtime`, avoiding cairn ↔ skillsmith-runtime cycle. Always-on guaranteed by composition root bootstrap logic.

**Implementation:** 
- Cairn hook runner: optional `PrescriberOrchestrationConfig` parameter
- `skillsmith-runtime/src/hooks/sessionStart.ts`: production bootstrap wrapper
- `.github/hooks/cairn/curate.ps1`: updated to prefer runtime hook for both global-install and repo-checkout paths
- Tests call `runSessionStart(repoKey)` with `undefined` for backward compatibility

**Impact:** Always-on Curator orchestration wired. Composition boundary preserved. Tests and production use same hook path. Cairn 576/576 passing.

### W3-Impl-7: E2E Integration Test — Auto Trigger, Dedup, Fail-Open (Laura)

**Scope:** Validate Wave 3 end-to-end: auto trigger for computed skills, dedup confirmation, fail-open behavior, profile miss handling.

**Decision:** Place `wave3-pipeline.test.ts` in `packages/forge/src/__tests__/` covering four scenarios:
1. Auto trigger: new vectors computed → prescribers run → hints inserted
2. Dedup (trigger-driven): second pass with newly-qualified vectors → re-checked via eligibility → duplicates blocked
3. Fail-open: per-skill exception → logged, continued
4. No profile: skill skipped without error

**Rationale:** Forge is focal point (ingests Cairn summaries, emits final hints). Test location aligns with existing cross-module coverage. Real SQLite path fully validated. To avoid production dependency from Forge to Cairn, test imports Cairn source directly; Forge's `tsconfig.json` excludes test files from package build.

**Key Behavioral Finding:** Accepted W3-D4 (trigger-driven orchestration) only reruns for skills with newly-computed vectors (`computedSkillIds`). This means unchanged DB state cannot produce dedup rerun on back-to-back invocations. Test adapted to realistic scenario: second pass with newly-qualified existing vectors triggering dedup-visible behavior.

**Implementation:** 4 scenarios, bootstrap via `runSessionStart`, assertions on `PrescriberRunResult` counts and DB state. Forge 630/630 passing.

**Impact:** Wave 3 end-to-end integration validated. Dedup and auto-trigger mechanics confirmed. Real Cairn+Forge persistence path exercised.

### Crucible-TDD-1: London-School TDD Strategy for Agentic Runtime (Laura)

**Date:** 2026-05-27  
**Author:** Laura Bow (Tester)  
**Status:** DRAFT (Awaiting Aaron Review — 8 Open Questions)  
**Artifact:** `docs/crucible-tdd-strategy.md`

**Scope:** Define outside-in London-school TDD discipline for Crucible runtime, PRD-derived, firewalled from technical design.

**Decision:** Authored comprehensive TDD strategy (120KB, 12 sections, 28 pages) covering:
- **12 acceptance scenarios (A1–A12):** Session forking, hermetic replay, pre-commit hook veto, causal slicing, Aperture notifications, plugin pinning, Curator orchestration, Pareto fitness, determinism conformance, Router policy escalation, bisect, marketplace trust gradient
- **18 collaborator contract roles:** SessionBootstrapper, ObservationCaptureStore, AppendProtocol, PreCommitHookBus, ReadSetHasher, LedgerProjector, QueryExecutor, PrescriberOrchestrator, ChangeVectorProvider, ParetoFitnessEvaluator, PolicyEngine, EscalationQueue, CausalSliceEngine, BisectOrchestrator, PluginRegistry, CLIRenderer (each with defined contract test strategy)
- **5-tier test pyramid:** Unit (500–1000 tests) → Component (200–400) → Contract (30–60) → Integration (50–100) → Acceptance (12)
- **8 invariant property tests:** Append-only, hash-chain determinism, replay equivalence, fork lineage, hook verdict determinism, projection purity, trust-tier monotonicity (via fast-check)
- **5-layer mock drift defense:** Contract tests (PR-time), shared fixture builders (build-time), golden files (nightly), CI double-check (PR-time), interface stability tracking

**Rationale:** 
1. London-school (outside-in) forces explicit interface design (matches immutable primitives)
2. Tell-don't-ask interaction pattern aligns with event-ledger semantics
3. Collaborator contracts enforce L0–L5 layer boundaries (prevents accidental coupling)
4. Acceptance tests anchor user workflows (prevents over-engineering the substrate)
5. Mock drift is tractable in greenfield with contract-test discipline + fixture builders

**8 Open Questions Flagged for Aaron (§11):**
- **Q1:** Session-end hook observation capture granularity (per-tool-call vs per-primitive vs per-turn)
- **Q2:** Eureka prescriber integration path (standalone L3 vs library vs deferred to v1.5)
- **Q3:** Structural proposal approval UX (blocking modal vs Aperture notification vs separate review CLI)
- **Q4:** Plugin pinning scope (direct deps vs transitive vs full environment)
- **Q5:** Bisect test execution environment (shell out vs isolated subprocess vs in-process runner)
- **Q6:** Determinism conformance timestamp normalization (excluded vs deterministic sequence vs non-deterministic field)
- **Q7:** Mock drift detection failure threshold (zero-tolerance vs ≥3 in layer vs ≥10% total)
- **Q8:** Pareto fitness contract with missing axes (reject comparison vs zero-fill vs partial dominance)

**Recommendations:** Provided for each question (favor simplicity + v1 MVM scope).

**Testing Blockers Identified:**
- Q1 blocks A2 (hermetic replay acceptance test)
- Q2 affects test layering (separate tier vs shared orchestration)
- Q3 blocks A10 (Router policy escalation test assertions)
- Q4 affects `SessionMetadata` fixture builders
- Q5 blocks bisect integration test design
- Q6 affects determinism conformance suite implementation

**Firewall Compliance:** ✅ Zero references to CTD artifacts; PRD-only vocabulary; no implementation details (file paths, class names, function signatures).

**Impact:** TDD strategy locked for PRD scope (12 acceptance scenarios), collaborator contract inventory complete, test layering blueprint ready. Implementation awaits Aaron resolution of Q1–Q8.

**Next Steps:** 
1. Aaron reviews strategy, resolves 8 open questions
2. Laura updates strategy based on resolutions
3. Decision merges to decisions.md
4. Laura updates `.squad/agents/laura/history.md` with learnings
5. Optional: Extract `london-tdd-for-agentic-runtimes` skill if reusable pattern emerges

### Crucible-CTD-1: Technical Design Plan Decomposition + Sequencing (Graham)

**Date:** 2026-05-27 (Updated after Aaron locks blocking questions)  
**Author:** Graham Knight (Lead / Architect)  
**Status:** ACTIVE (Approved for fan-out; blocking questions resolved)  
**Artifact:** `docs/crucible-technical-design-plan.md`

**Scope:** Decompose full technical design into 19 sections, 7 team members + 2 consultants, 4 authoring phases + 1 review round (~9 working days).

**Decision:** Produced comprehensive CTD plan with resolved blocking questions:

1. **DB file placement:** ✅ FORK to `~/.crucible/crucible.db` — clean separation from Cairn (decided by Aaron 2026-05-27)
2. **Cairn/Forge coexistence:** ✅ FULL COEXIST FOREVER — independent live products with own roadmaps. Crucible greenfield alongside. No delegation, no shim packages, no absorption (decided by Aaron 2026-05-27)
3. **Eureka status:** ✅ EXTERNAL LIBRARY VIA OPTIONAL ADAPTER — not a Crucible chamber (decided by Aaron 2026-05-27)

**Fan-Out Manifest (Appendix C of plan):**
- **Phase 0 (serial):** 2 sections (Graham) — L0/L1 boundary + primitive taxonomy
- **Phase 1 (parallel):** 8 sections, 5 lanes — Roger, Rosella, Alexander, Laura, Gabriel, Graham
- **Phase 2 (parallel):** 6 sections, 6 lanes — Roger, Valanice, Graham, Laura
- **Phase 3 (parallel):** 3 sections, 2 lanes — Gabriel, Graham
- **Review round:** All 19 sections cross-reviewed per ownership map

**Section structure:** `docs/crucible-technical-design/` folder, one numbered file per section + README index, each with owner, output file, input artifacts, dependencies, acceptance criteria.

**Rationale:** Three blocking questions cleared path for team-wide fan-out without discovery looping. Architecture locked. Sequencing respects Layer dependencies (L0→L1→L2/L3→L4/L5) and authoring parallelism (some sections can proceed concurrently after their inputs are available).

**Impact:** Technical design ready for parallel authoring sprint. Team assignments clarified. Acceptance criteria explicit per section. Estimated completion: ~9 working days post-fan-out.

**Cross-Link:** Crucible-TDD-1 (Laura, parallel track) is firewalled from CTD to preserve test-design independence; TDD strategy is PRD-only, CTD is implementation-specific. Both feed Crucible delivery but remain architecturally separate.

---

## Open Questions

### W3-7 Trigger-Driven Dedup Semantics (Laura)

**Status:** FLAGGED FOR AARON'S DIRECTION

**Observation:** Wave 3's accepted trigger-driven orchestration (W3-D4) means Curator only calls prescribers for skills in `changeVectorSweep.computedSkillIds` — i.e., skills whose change vectors were newly inserted this cycle.

**Implication:** If the same skill's vectors remain unchanged across two consecutive session starts, the prescriber does not run on the second start, and no dedup-visible result is produced. This is correct by the trigger-driven design, but it differs from a "rerun on every session start" behavior.

**Question:** Should Wave 4+ introduce a broader trigger mechanism to allow reruns for skills with existing (non-new) summaries? Examples:
- Always rerun skills that have any vector summaries (regardless of new-this-cycle)
- Expose a manual scheduler or `force=true` flag for operator-initiated reruns
- Defer to Phase 5 when MCP/cloud integration allows finer control

**Current Design:** Trigger-driven only (W3-D4). This prevents unnecessary prescriber invocations and aligns with the "on new signal" principle, but it limits dedup visibility to cycles where vectors are genuinely computed.

**Recommendation:** Clarify with product whether current trigger semantics are intentional, or if dedup should be visible on *every* session start regardless of new vectors.

### Addendum (2026-05-23): Curator Observability Gap

Investigation into Laura's flagged ambiguity surfaced a deeper architectural finding worth recording for Wave 4 planning.

**Finding:** Curator (`packages/cairn/src/agents/curator.ts`) has no read surface into:

- `optimization_hints` table — Curator writes hints through the orchestrator but never reads them back. No awareness of hint state transitions (pending → applied / rejected / expired / suppressed / failed).
- Prescriber config or profile schema versioning — there is no version field tracked anywhere. If prescriber logic or category sets change, Curator has no signal.
- `execution_profiles` change history — Curator only reads "current" via `loadProfile(skillId)` inside `runForSkill`, no concept of "this profile is newer than last time I prescribed against it."

**Implication:** The trigger-driven gap Laura flagged is not just a scoping choice — it is the leading edge of a broader observability gap. Even if Wave 4 wanted to add richer triggers ("rerun when a hint gets rejected", "rerun when prescriber config bumps", "rerun stale profiles"), Curator currently cannot observe any of those signals.

**Wave 4 design options (for future planning, no decision yet):**

1. **Add new triggers as CairnEvents.** Hint state transitions and profile/config bumps become events appended to the existing CairnEvent stream Curator already processes via cursor. Smallest architectural delta — Curator's input model stays event-driven; new event types are additive.
2. **Give Curator a read surface plus "diff vs. last seen" state.** Curator gains direct queries into hint and profile tables, persists a watermark per skill of "what I last prescribed against," and recomputes on diff. More plumbing; needs a new derived state table.
3. **Externalize the trigger entirely.** A separate scheduler (cloud or local) decides which skills to re-prescribe and invokes the orchestration config directly. Curator stays leading-edge only; re-evaluation is owned elsewhere.

**Recommendation:** Option 1 aligns best with the existing architecture. Curator already loves event streams; hint state transitions are a natural fit. Defer the decision to Wave 4 — no action in Wave 3.

**Verified by:** Read of `packages/cairn/src/agents/curator.ts` lines 152–260 confirming the curate() input surface is strictly `CairnEvent` stream + `ChangeVectorConfig` + `PrescriberOrchestrationConfig`. No reads of `optimization_hints` or `execution_profiles` change history. Confirmed 2026-05-22 by Aaron + Squad.

---

## Wave 3 Research Notes

### Research: Composition Root Audit (Roger)

**Date:** 2026-05-23  
**Status:** Research input, delivered to ADR synthesis

**Scope:** Five options for where the runtime that imports both `@akubly/cairn` and `@akubly/forge` should live.

**Option Summary:**

| Option | Package Structure | Build Risk | Test Isolation | Phase 5 Portability | Recommendation |
|--------|-------------------|------------|-----------------|-------------------|-----------------|
| R1 | Forge imports Cairn | Medium | Medium | Low | Do not use |
| R2 | New runtime package | Low | High | High | ✓ Recommended |
| R3 | Optional Cairn import of Forge | Medium | Medium | Medium | Fallback |
| R4 | Runtime-cli dual-mode | Low | Medium | High | Alternative |
| R5 | New curator package | Low | High | High | Alternative |

**Recommendation:** **R2** — Separate `@akubly/runtime` (composition library) + thin `@akubly/runtime-cli` (CLI wrapper).

**Why:** Clean roles, best test isolation, zero build risks, Phase 5-ready. Library stays portable.

**Fallback:** R4 (new `@akubly/curator` package) if team prefers explicit orchestrator semantics.

**Do not use:** R3 (inject Forge into Cairn hooks). Test coupling + build-order risks unacceptable.

**Full Audit:** `docs/wave3-composition-root-audit.md`

---

### Research: Curator/MCP Integration Surface (Alexander)

**Date:** 2026-05-22  
**Status:** Research input, delivered to ADR synthesis

**Scope:** Wave 3 Curator–MCP integration requirements, architectural decisions, and open questions.

**Key Findings:**

1. **Composition Root Location:** New `@akubly/runtime` package (aligns with Roger's R2 recommendation).
2. **Invocation Strategy:** Hybrid — automatic via Curator hook + manual via MCP tool.
3. **Profile Selection (v1):** Trigger-driven only; defer global tier fallback to Wave 4.

**Secondary Decisions:**
- Eager Forge import (both packages co-deployed by assumption)
- `force=true` behavior: skip dedup (matches Wave 2 intent)
- Observable metrics: skills processed/skipped, hints generated/inserted/dedup'd, categories matched/attenuated
- Profile selection override: low-priority for v1; defer to Wave 4

**Curator API Changes:**
```typescript
export interface PrescriberOrchestrationConfig {
  runForSkill: (skillId: string, minSessions: number) 
    => Promise<{ skillId, hintsGenerated, hintsInserted, hintsDuplicated, hintsError }>;
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}

export function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
): CurateResult {
  // Signature is backward compatible (new param optional)
}
```

**MCP Tool:** `run_prescriber_optimization` (triggers orchestrator, returns structured output).

**Full Analysis:** `.squad/agents/alexander/wave3-integration-analysis.md`

---

## Harness Vision & Architecture (2026-05-24)

### User Directive: Cairn/Forge Legacy Guardrail

**Date:** 2026-05-24T06:56Z  
**By:** Aaron Kubly  
**What:** The harness-vision.md doc has substantial awareness of Cairn and Forge. Going forward, treat those systems as legacy context only — they exist, but they MUST NOT dictate the shape of the new harness. When evaluating designs, agents should ask "does this serve the harness?" not "does this match Cairn/Forge?" If a vision-doc claim is downstream of a Cairn/Forge implementation detail rather than a requirement, flag it for revisit.  
**Why:** User-stated guardrail to keep the new design honest about being greenfield, despite legacy-aware source material.

---

### Harness Vision Q&A — Round 1 (Aaron's answers)

**Date:** 2026-05-24T06:56Z  
**By:** Aaron Kubly  
**Context:** Round 1 of vision-clarification questions raised by Graham, Alexander, Valanice, Rosella, Laura. Session log: harness-vision-discovery. Three sub-questions remain open (autonomy decision scope, turn definition, tamper-evidence threat model) and are routed to lightweight follow-ups.

**Decided:**

1. **Target user at v1: Aaron only.** Personal trust-building tool. SDK surface can stay internal; Narrator can be diary-style. Does not need to be team-facing on day one.

2. **Genetic-loop fitness measurement: all three (simulation + live A/B + synthetic benchmarks).** Don't pick one — design Alchemist to support layered evaluation. Synthetic for cold-start, simulation for replay-driven evaluation, live A/B for ground truth.

3. **Cold-start behavior (before ~10 sessions of data):** The harness is active from session 1, but its early-life work is bounded: tease/report observations and emerging trends, propose micro-optimizations, and run genetic experiments in the background. Loud claims and high-confidence hints wait until data warrants them.

4. **Narrator cadence:** Hybrid push/pull. Harness accumulates notifications when something interesting happens (social-media-activity-indicator style). User can view at any time. An on-demand dashboard is also available. Do NOT interrupt session work; do NOT gate flow on Narrator output.

5. **Sub-agent execution model: flexible (persistent + parallel preferred).** Anchor reference: Copilot CLI's `task` tool — long-lived sub-agents that can run concurrently, accept follow-up messages, and be polled for results. Sequential single-active-agent is too constrained.

6. **Extensibility: fully extensible at v1.** Industry-parity functionality (custom skills, model provider plug-points, MCP, hook surfaces) is required to do anything interesting. Doesn't have to be a public marketplace — but the seams must exist from day one.

7. **Primitive schema typing: design decision, deferred.** Should be dictated by requirements. Revisit once we know what enforcement guarantees the ledger needs (replay fidelity, chamber-contract validation, migration story).

**Standing guardrail:** Cairn/Forge are legacy context, not a design template. The new harness is greenfield.

**Open (routed to follow-up agents):**
- Q2 (autonomy/approval model) — needs concrete enumeration of what Curator actually decides
- Q3 (turn definition) — Alexander to survey prior art and recommend a default
- Q4 (hash-chain tamper-evidence) — Graham to propose concrete threat models

---

**Date:** 2026-05-24T07:07Z  
**By:** Aaron Kubly  
**Context:** Follow-up clarifications on Q1 items that came back ambiguous.

**Decided:**

1. **Curator authority model (resolves Q2):** Curator has detection + proposal authority only — never approval authority. Per-category treatment:
   - ✅ auto-apply: hint prioritization only
   - 📨 auto-notify (lands in user-pull notification feed): staleness, Alchemist triggers, skill recommendations
   - ⚠️ detect & propose, require explicit user ACK/REJECT: hypothesis reversion, policy proposals
   - ❌ never auto: low-confidence hint apply, policy guardrail changes
   - The vision-doc framing of "append-then-review vs propose-then-commit" dissolves — it's per-category, and consequential decisions always stage for human gate.

2. **Turn definition (resolves Q3):** **Thick turn with intra-turn primitives, revealable on demand.** One user message → one assistant response, with sub-agents and tool calls nested inside. Reveal pattern modeled on Copilot CLI's Ctrl+E / Ctrl+T — internals are accessible but not in the user's face by default. Primitives are recorded at intra-turn granularity (each tool call, each sub-agent invocation, each decision) so replay fidelity is preserved without fragmenting the user-visible exchange.

3. **Hash-chain semantics (resolves Q4):** Keep cheap hash-linking in the ledger (self-audit value for Aaron-the-sole-user, ~1% storage cost). Defer SBOM-style witness/notary/signature infrastructure to a later wave — migration is backward-compatible. Threat model in scope: "did I really approve that 6 months ago?" Threat model out of scope: external attestation, multi-party tamper detection.

---

## Phase A Signoffs (2026-05-24 Round 3)

### Laura — causalReadSet Signoff

**Date:** 2026-05-24T23:00Z  
**Scope:** Equivalence claim: "Laura's `causalReadSet` ≡ Roger's WAL `causal_read_set_hash`. Same bytes, one pipeline."

**Verdict:** ENDORSE with one refinement. Fields are content-addressed equivalents (Laura's typed object → Roger's hash), not literal bytes. **Proposal schema locked at 8 fields** with `causalReadSet?: ReadSetEntry[]` as the 8th field. Pipeline: L3-declares `ReadSetEntry[]` → L4-canonicalizes-and-hashes → L1-commits hash to WAL, with determinism conformance suite adding 4 assertions (A1: hash integrity via CBOR canonical serialization; A2: reference resolvability; A3: replay equivalence — load-bearing for determinism; A4: population completeness).

**Impact:** `causalReadSet` orthogonal to `evidence` (provenance vs persuasion). Pareto fitness gains read-set cardinality axis. Conformance assertions strengthen W2-5 determinism contract. L2↔L3 `ReadSetBuilder` helper pushes generators toward Salsa-mediated reads (cheap A3 path).

**Read set definition locked:** 8 fields (category, confidence, rationale, preview, fitnessContract, evidence, costEstimate, reversibility, determinismClass, causalReadSet).

---

### Roger — Hook Bus Signoff (L1 verdict)

**Date:** 2026-05-24T23:00Z  
**Author:** Roger (Platform Dev, L1/Ledger owner)

**Verdict:** ENDORSE with refinements. Pre-commit hook bus **per-row, inside group-commit window, before fsync barrier** — after `causal_read_set_hash` computed, before row sealed. Pause mid-batch: **seal-and-split** (rows 1..N fsync with durable verdicts, rows N+1..end return to staging queue). Bus is load-bearing for correctness (alongside Router for safety).

**Critical refinements locked:**

1. **Property/fuzz regime (US-Ga-NEW-15):** P1 (no-observe leak), P2 (exactly-once-pause), P3 (closed enum), P4 (ordering within primitive), P5 (continue zero-cost).
2. **Replay recording:** Non-continue verdicts recorded with predicate_id+version, policy_version, candidate_hash, read_set_hash, fork_id, timestamp; `continue` verdicts uncounted per P5.
3. **Subscriber backpressure (R3):** Explicit per-verdict-type subscription, bounded queues (observe droppable, pause unbounded), sampling at bus boundary, per-subscriber budget declaration.
4. **Policy version on every verdict (R4):** Both pause and observe carry active policy version at evaluation time (predicate attribution answer: "why did we observe this?").

**WAL-first mandate:** Pause verdicts durable in WAL before bus dispatch (exactly-once-pause via crash recovery); observe may use ring buffer. If Roger says "WAL doesn't carry bus traffic," endorsement withdrawn (exactly-once degrades to at-most-once, safety collapses).

**Predicate SLA:** ≤80µs row-stage budget via pre-registration + compilation + kind-indexed dispatch + no L2 projection calls at evaluate time. Up to ~50 compiled predicates per primitive_kind stays safe. Read-set predicates first-class (pause if Decision read Observation tagged 'secret').

**WAL schema extension:** Two new fields on `WalRecord`: `hook_verdict: u8?` (0=continue, 1=observe, 2=pause; NULL if no predicate matched) and `hook_verdict_witness: blake3?` (CAS body with predicate_ids_fired + outputs; NULL if verdict=continue). Cost: +1 byte always, +32 bytes when non-continue verdict fires.

---

### Gabriel — Hook Bus Router Verdict

**Date:** 2026-05-24T23:00Z  
**Author:** Gabriel Knight (Router / observability / safety)

**Verdict:** ENDORSE WITH REFINEMENTS. Alexander's `{continue, observe, pause}` split **strengthens** Router-as-single-safety-choke-point by removing observe traffic from L4. Router still owns every pause (only verdict that mutates the world); pause is the load-bearing failure mode for safety.

**4 mandatory refinements:**

1. **Bus inherits US-Ga-NEW-15 fuzz/property regime** (P1–P5 locked per Roger).
2. **Non-continue verdicts recorded with predicate+policy versions, read-set hash** (enabling replay falsifiability and attribution).
3. **Per-verdict-type subscription with explicit opt-in and bounded queues** (Mirror/Curator do NOT get observe traffic by default; bus-side sampling only).
4. **Policy version tags pause and observe verdicts** (not continue per P5). Resolves ambiguity: predicate version (L5 registration identity) vs policy version (L4 active policy at eval time) both ride every recorded verdict.

**Router-side contract (§6):**
- L4 receives `pause` only; `observe`/`continue` is a bus bug → structured error log + drop
- L4 acks within 50ms (transit budget) — missing ack within budget is bus alarm (P2 violation)
- L4 records all bus fields + Router fields + approval outcome (approved/rejected/escalated/timeout)
- L4 emits `RouterDecision` event onto bus outbound channel (L2 subscribes, closes loop for replay)
- L4 state replayable from recorded `pause` verdict stream + policy versions alone (no hidden state, no clock dependence beyond recorded timestamps)

**What NOT yet endorsing:** (a) bus location in dependency graph pending Roger WAL verdict; (b) Mirror/Curator/Alchemist as subscribers without explicit per-verdict-type justification in writing.

---

## Phase B Reconciliations (2026-05-24 23:30Z)

Reconciliation of all 9 core agents against `D:\git\stunning-adventure` monorepo. Summary: **Crucible is greenfield architecturally**; existing repo (Cairn + Forge + skillsmith-runtime) is prefiguration of L3 (Prescribers) and partial L4 (Applier + DecisionGate) with strong post-hoc Merkle-chain DBOM substrate in spike/. No per-row WAL, no pre-commit hook bus, no replay, no branching, no Salsa-style derived layer, no investigation surface. Each reconciliation file is 14–30KB with detailed citations; below are 1–2 para summaries per author linking to original inbox path for full evidence.

### Alexander — Phase B Reconciliation

**Classification summary:** 0 ALREADY-EXISTS, 4 PARTIALLY-EXISTS (US-A-1, US-A-7, US-A-10, US-A-NEW-2), 10 NET-NEW, 1 CONTRADICTS (US-A-NEW-5 ledger-append vs current event_log).

**Headline:** `@akubly/skillsmith-runtime` (323 lines) is **not a runtime** — it is Cairn↔Forge prescriber composition root. `runtime-cli` is 9-line re-export. **Zero message-loop semantics anywhere.** No sub-agent spawn, no interactive prompt, synchronous one-shot orchestrator. The actual SDK runtime lives in `@akubly/forge/src/runtime/` (`ForgeClient` + `ForgeSession` wrapping SDK 1:1); Cairn `sessionStart` hook glues everything together via `runSessionStartHook(factory, afterCurate)` — invoked by Copilot CLI shell, not owned by this repo.

**NET-NEW axis:** Crucible-level `invoke(request, config)` multi-turn driver, SDK session ↔ Cairn session linking, cross-process primitive handoff serialization, hermetic observation capture at LLM boundary. (Full reconciliation: `.squad/decisions/inbox/alexander-reconciliation-2026-05-24T2330Z.md`)

### Erasmus — Phase B Reconciliation

**Classification summary:** 1 ALREADY-EXISTS (US-E-NEW-12), 5 PARTIALLY-EXISTS, 6 NET-NEW, 0 CONTRADICTS, 1 DEFER-TO-OWNER (rewind destructive in SDK; US-E-2 needs non-destructive fork).

**Headline:** Sessions are flat with no parentage; event log is sequential autoincrement with no parent-hash chain (SDK has `parentId` chaining upstream, Cairn discards it at boundary). **SDK `snapshot_rewind` is destructive** (removes events from session), **not non-destructive fork.** Merkle-chained provenance + decision alternatives already serialized (substrate for counterfactual); no branching primitive exists. Determinism conformance suite (A1–A4 assertions) is NET-NEW, with A3 (replay equivalence) load-bearing for hermetic validation.

**NET-NEW axis:** Preserve `parentId` chain at Cairn boundary, non-destructive fork-at-decision primitive, COW snapshot metadata schema, replay harness, bisect tooling. (Full reconciliation: `.squad/decisions/inbox/erasmus-reconciliation-2026-05-24T2330Z.md`)

### Gabriel — Phase B Reconciliation

**Classification summary:** 0 ALREADY-EXISTS, 4 PARTIALLY-EXISTS (replay-from-stream, snapshotting, Router observability, subscriber backpressure), 6 NET-NEW, 1 CONTRADICTS (ack budget 50ms vs not yet implemented).

**Headline:** No Router layer today. `HookComposer` merges observers with last-writer-wins on `permissionDecision` (tool-call boundary, not per-primitive-row). Hermetic replay boundary: capture spine exists (bridge records 22 event types, emits `CairnBridgeEvent`), but LLM-call content capture weak (beyond PAYLOAD_EXTRACTORS fields dropped) and tool-result capture absent (only `{toolCallId, success, error}` recorded, replay can't re-derive output). DBOM hash-chain (SHA-256 over canonical JSON + parent-hash) exists in spike/dbom-generator.ts but not live WAL. Five-layer Crucible entirely greenfield.

---

## Round 5 & 6 — Substrate spike + Phase B contradiction closeout (2026-05-25)

### Round 5 — Three L1 Substrate Forks Investigated

**Context:** Phase A locked the L1 substrate contract (8 WAL fields, pre-commit hook bus, group-commit + seal-and-split, ≤80µs row-stage predicate budget, replay protocol). Cairn today uses `better-sqlite3` + SQLite's native WAL. Round 5 investigation tested three forks: full custom storage (Rust redb), SQLite-native hooks (preupdate_hook + commit_hook), and a hybrid (custom append-log for L1 WAL + SQLite for derived tiers).

#### Fork (a) — Full custom storage via redb (Rust B+tree)

**Spike:** Roger audited Cairn's surface area: 188 prepared-statement call sites, 2,358 LOC in db/, 31 DB files, 16 tables, 221 SQL keywords exercised (JOINs, GROUP BY, ORDER BY, relational queries, UNIQUE indexes including partial UNIQUE for atomic backpressure). **Verdict:** REJECT. Redb + NAPI-RS bindings would be ~12–16 weeks engineering (6–8 weeks prototype, +6–8 weeks Phase A integration). Loses 100% of SQL ergonomics; gains genuine 80µs predicate budgets in Rust. Too much greenfield, too little near-term payoff for a working harness. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/roger-spike-fork-a-port-2026-05-25T0030Z.md`)

#### Fork (b) — SQLite-native hooks

**Spike:** Alexander analyzed `sqlite3_preupdate_hook` + `sqlite3_commit_hook` as the only viable hooks. **Verdict:** REJECT **as a drop-in for Phase A.** Preupdate_hook has no veto (void return); commit_hook is all-or-nothing per transaction (not per-row), and better-sqlite3's prebuilt binary is not compiled with `SQLITE_ENABLE_PREUPDATE_HOOK`. Even with a custom build, the design would be "abort-and-re-drive-one-by-one-up-to-pause," not "seal-and-split." This forces a Phase A renegotiation (drop seal-and-split, accept at-least-once-pause); Alexander's own synthesis does not survive unchanged. Fork (b) is a **re-scoping decision dressed as a storage decision**—escalation to Aaron. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/alexander-spike-fork-b-sqlite-hooks-2026-05-25T0030Z.md`)

#### Fork (c) — Hybrid (custom append-log + SQLite for derived)

**Spike:** Gabriel sketched Crucible as a **read-only observer of Cairn's event_log**, tailing via change-feed. No Crucible code between "primitive write" and "durable in Cairn." Verdict taxonomy shifts from pre-commit (pause/continue/observe) to post-commit (observe/alert/quarantine-downstream/rollback-proposal/escalate-policy-change). **Verdict:** ENDORSE-WITH-CAVEATS as a v1 → v2 stepping stone. Shippable in weeks; preserves ~7 of Sonny's 9 investigation stories cleanly or degraded; **loses primitive-level pre-commit prevention** (Aaron's real-time safety floor reverts to Cairn's tool-call-level `permissionDecision:'ask'`). **Risk:** incentive collapse—once forensic-only Crucible works, marginal payoff for (a)/(b) cutover drops. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/gabriel-spike-fork-c-parallel-ingest-2026-05-25T0030Z.md`)

---

### Aaron Locks: A.3 Hybrid (Fork (a) A.3 from Roger's spike)

**Date:** 2026-05-25T01:00Z

**Decision:** Adopt **Roger's A.3 hybrid** as the L1 substrate for Crucible/Skillsmith Harness:
- **Custom pure-TS append-only WAL** for L1 (8-field row schema: event log, read-set hash, hook bus, WAL verdict fields, all ULID-sortable)
- **Keep `better-sqlite3`** for the other 15 tables (proposals/prescriptions, approvals, drift telemetry, change vectors, DBOM artifacts, execution profiles, derived views)

**Rejected (this round):**
- Fork (a) A.1 — full Rust redb port via NAPI-RS
- Fork (a) A.2 — LMDB via Kris Zyp's node binding
- Fork (b) — SQLite-native hooks (Alexander killed his own design honestly: preupdate_hook can't veto, commit_hook is per-txn all-or-nothing, seal-and-split impossible)
- Fork (c) — Parallel-ingest / forensic observer (Gabriel's incentive-collapse risk; throwaway L4 work; degraded L5)

**Aaron's reasoning:** "I don't see us needing A.1 in the near term. If this harness proves to be something groundbreaking, we would eventually need it, but we would double down on this project with a LOT more resources at that point." A.1's anti-anchoring triggers (regulatory determinism / WASM-only / 10⁹+ rows) are not plausible within Crucible's 2-year horizon. If any one becomes plausible, re-open the spike with the "double down" resource envelope.

**v1 commitment #10: L1 Substrate Boundary**

The L1 contract (hook bus interface, append protocol, WAL row schema, replay protocol, conformance suite) is a **pure abstraction**:
- A.3 hybrid (custom append-log + SQLite for derived) is the v1 implementation behind the boundary.
- A.1 full port (pure-Rust redb via NAPI-RS) remains a future alternate implementation behind the same boundary.
- Upper layers (L2/L3/L4/L5) consume the L1 interface only. **No L2-L5 code may import storage primitives directly.**
- Migration A.3 → A.1 (if ever undertaken) becomes a substrate swap for L1, not an architecture rewrite for the rest.

This discipline is **cheap if applied from day 1, expensive to retrofit**. Cairn's 188 prepared-statement call sites are exhibit A. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/copilot-l1-substrate-decision-2026-05-25T0100Z.md`)

**v1 commitments list (updated after this decision):**
1. Pareto fitness contract (Laura)
2. Determinism conformance suite (Laura)
3. Router observability + fuzz regime (Gabriel)
4. Hermetic replay boundary (Alexander)
5. Snapshot + compaction (Roger)
6. Branch/ref metadata + cairn fsck + GC (Roger)
7. Plugin pinning at fork (Rosella)
8. Ledger-append transactional contract (Alexander)
9. 8-field extended generator/prescription schema (Laura) — causalReadSet orthogonal to evidence
10. **L1 substrate boundary (new this round)** — A.3 hybrid v1, A.1 reserved for "double down" future

---

### Phase B Contradictions — All 7 Resolved

**Date:** 2026-05-25T01:15Z–01:30Z

#### #2 — SDK `session.snapshot_rewind` reconciliation

**Decision: 2a — wrap SDK at L1; L1 owns event-log branching natively.**

Crucible never calls `snapshot_rewind` directly. The SDK becomes a session-bootstrap source (session ID + initial context). Once a session is established, Crucible drives event ingestion via L1's own append log. Branching is implemented at L1:
- New migration adding `sessions.parent_session_id` and `sessions.fork_point_event_id` (unblocks US-S-5, US-S-6, US-S-8 + US-E-2)
- `cairn fork --at <event_id>` creates a child session whose ledger logically extends from the parent's prefix without rewriting the parent

**Aaron's reasoning:** "2b's replay would be imperfect due to non-determinism. 2c is an unwanted block against a dependency." Implication: L0/L1 boundary becomes trivially load-bearing. The SDK is bootstrap-only at L0 (Bridge/Provider); nothing above L1 sees `@github/copilot-sdk` types. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/copilot-aaron-resolutions-2026-05-25T0115Z.md`)

#### #6 — `OptimizationHint.source` shape

**Decision: 6b — closed enum {builtin | plugin | user | external}, harness-stamped at generator load time.**

Field is **attribution**, not self-declaration. Plugin authors do not get to claim `'builtin'` or `'user'`. The harness stamps `source` based on loader:
- First-party bundle → `'builtin'`
- `~/.crucible/plugins/*` (signed, pinned) → `'plugin'`
- User inline (REPL, scratchpad) → `'user'`
- Anything else (network, unsigned, novel loader) → `'external'`

`'external'` is a **graceful-degradation slot**, NOT a generic extension point. Router treats `'external'` as the most restrictive default — safe by construction. This preserves Router's declarative policy power ("auto-approve builtin and user, escalate plugin, sandbox external") for the 95% case while allowing novel loaders without breaking the system. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/copilot-aaron-resolutions-2026-05-25T0115Z.md`)

#### #1 — ForgeClient hermetic L0 Provider / Bridge boundary

**Decision: Introduce `l0-provider/` directory. Hermetic types. Dependency-cruiser enforcement.**

Lock the L0/L1 boundary to a pure-data interface. SDK types live behind `l0-provider/` (only there); L1+ consumes a canonical `CrucibleEvent` stream and `BootstrapPayload` value. **What crosses L0 → L1 (up):** BootstrapPayload, CrucibleEvent (canonical JSON-serializable). **What crosses L1 → L0 (down):** OutboundPrompt, control signals (pause/resume/disconnect). **What does NOT cross:** SessionEvent, SessionConfig, ToolResultObject, any CopilotClient/CopilotSession reference, any SDK promise/iterator type. Enforcement: `.dependency-cruiser.cjs` rule set committed to CI. Migration: ~9 hours (5 production files move; 8 test files allowlisted). **Test impact:** zero functional changes; all 512 Forge tests remain passing. Public Forge API unchanged (re-exports preserved). (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/graham-opens-1-and-3-2026-05-25T0130Z.md`)

#### #3 — Narrator vs Mirror

**Decision: ONE chamber, named Mirror. Two surfaces (Notifications push, Dashboard pull), one MirrorEvent stream.**

Round-4 vocabulary table (`decisions.md:597`) already retired "Narrator"—Open #3 exists because `harness-vision.md` uses the old name. Narrator and Mirror are the same concept (pure presenter, self-reflective trust-building, shows harness's reasoning + user's work reflected back). Strike "Narrator" from canonical vocabulary.

**Mirror has two render modes:**
- **Notifications (push):** Badge/count, social-media-style activity indicator, visible in CLI prompt, flush on view
- **Dashboard (pull):** Full surface (`crucible mirror`), filterable, time-sliceable

Both surfaces share one `MirrorEvent` stream. Producers fan in from multiple layers (L1/L2/L3/L4/L5); Mirror queries the projection. No new L4.5 layer; Mirror is a derived view. Data path: all writes go through L1 append → L2 projection populates `mirror_events` → Mirror queries.

**MirrorEvent schema:** id (ULID), ts (unix ms), sessionId, producerLayer (L1–L5), category (proposal/decision/observation/investigation/system), level (info/notice/attention/urgent), title (≤80 chars), bodyMarkdown, refs (eventId, proposalId, decisionId, investigationId), state (unread/read/dismissed/actioned), payload, schemaVersion.

Notification policy (render rule, not stored): urgent → surface inline; attention → bump unread badge with category icon; notice → bump unread badge; info → dashboard only.

Honors Aaron's framing exactly: accumulates notifications when interesting, user views on-demand, social-media indicators, dashboard available. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/graham-opens-1-and-3-2026-05-25T0130Z.md`)

#### #4 — In-place UPDATE vs. backward causal slice

**Decision: 6 of 7 tables are derived; 1 is external mirror. All 6 derived stay UPDATE with `withShadowEvent()` wrapper. Drop `prescriber_state.pending_count` cache; replace with SQL view.**

The 7 tables enumerated:
1. **sessions** (lifecycle) — derived from event_log; keep UPDATE
2. **insights** (rollup) — derived; keep UPDATE (but wrap leaky sites in `withShadowEvent()`)
3. **prescriptions** (state machine) — derived; keep UPDATE with event-pair invariant
4. **prescriber_state** (pure cache) — **drop `pending_count` column; replace with `SELECT COUNT(*) FROM prescriptions WHERE status='generated'` view**
5. **curator_state** (cursor) — cursor is the canonical projection bookmark; **cursor exemption** — UPDATE stays (monotonicity guarded in SQL)
6. **optimization_hints** (state machine) — derived; **already correctly enforced** (replaceActiveHintsAtomically + emitHintTransitionEvent)
7. **managed_artifacts** (external mirror) — mirrors filesystem; **external mirror exemption** — UPDATE stays; drift-detection is correctness mechanism

**Enforcement:** `withShadowEvent(db, table, shadowEventType, payload, mutation)` helper (1h). ESLint rule banning raw `db.prepare('UPDATE')` outside db/ (2h, with cursor/mirror exemptions). CI invariant test: snapshot → replay → snapshot, assert deep-equal (6h, validates L1→L2 projection chain). Defense in depth catches all cases short of disabling lint + bypassing wrapper + editing snapshot.

**Implementation cost:** ~14 hours (2 days). Slot in first Crucible sprint before US-V-* lands. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/roger-opens-4-and-5-2026-05-25T0130Z.md`)

#### #5 — Canonical serialization algorithm

**Decision: CBOR + BLAKE3 for new L1 read-set hash. Leave DBOM's SHA-256 alone.**

Two hash algorithms in different parts of the system is correct, not a smell—they hash different things for different consumers with different lifecycle constraints. DBOM's hash is a committed artifact (long-lived, human-auditable, fits SHA-256 ubiquity expectation). L1's read-set hash is in the hot path (replay determinism, 80µs predicate budget).

**Algorithm choice:** CBOR-dcbor (RFC 8949 §4.2.1 deterministic encoding) + BLAKE3. CBOR is binary; debuggability addressed by `cairn debug read-set <event_id>` CLI (round-trip to JSON). BLAKE3 ~3.5 GB/s single-threaded; CBOR encode ~500 MB/s; for representative read-set (~200 bytes), total ~5–7µs (7% of 80µs envelope, leaves slack for Gabriel's ack budget).

**Libraries:** `cbor2` v1.x (200k weekly, MIT, ESM, dcbor mode) + `@noble/hashes/blake3` (2M weekly, audited, MIT, pure JS, ~150 MB/s).

**Canonicalization rules (CBOR deterministic encoding):** shortest integer form (no bignums); no NaN/±Infinity; map keys bytewise lexicographic; UTF-8 NFC strings (encoder asserts, throws on violation); no tags; definite-length only; no duplicate keys; standard simple values; order-preserving arrays.

**DBOM handling:** stays on SHA-256. Per-column algorithm rule in L1 contract: algorithm fixed at creation, never migrated. New columns BLAKE3; legacy columns named and frozen.

**Implementation cost:** L4 canonicalizer (CBOR + BLAKE3 + validator) 4h; A3 conformance assertion 2h; round-trip test 1h; debug CLI 2h. **Total ~9 hours / 1.5 days.** (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/roger-opens-4-and-5-2026-05-25T0130Z.md`)

#### #7 — US-A-NEW-5 vs existing `event_log` shape

**Decision: Keep both surfaces. Legacy `event_log` is demoted to a derived L2 audit projection fed by an L1 subscriber.**

US-A-NEW-5 demands a primitive ledger with properties current `event_log` lacks (group-commit boundary, per-append latency ≤1ms p99, documented durability, commitment offset exposed, pre-commit hook bus integration, causal read-set capture, native fork lineage, typed primitive payload). `event_log` is too thin to be the L1 primitive, AND too rich/established to delete (30+ call sites, ProvenanceTier audit classification, typed CairnBridgeEvent vocabulary that Curator/MCP consume).

**Resolution:** Role split—L1 WAL is the primitive ledger (Source of order, durability, commitment, hook verdicts, causal read sets, fork lineage); `event_log` (SQLite, L2) is derived **audit + telemetry projection** (typed CairnBridgeEvent stream, Curator-facing, MCP-facing, archivist-facing, Provenance-tiered). Not two ledgers—one ledger (L1), with one derived projection in `event_log`-shaped storage.

**Migration plan (post-L1 shipping):**
1. **Migration 014:** Add `event_log.source_event_offset INTEGER NULL` (backlinks to L1 WAL offset)
2. **Migration 015:** Add `event_log.provenance_tier TEXT` (promotes ProvenanceTier from runtime classification to persisted column)
3. **Migration 016:** Mark legacy `logEvent()` @deprecated; new entry point `projectFromL1(commit, projector)`
4. **L1Subscriber interface** (new): `onCommit(offset, rows[])` fires once per group-commit boundary
5. **EventLogProjector** (new, in Cairn): Implements L1Subscriber; materializes typed CairnBridgeEvent into `event_log` with source_event_offset + provenance_tier
6. **Bridge rewrite:** Stops calling `logEvent()` directly; emits L1 primitive; EventLogProjector materializes the row

**Consumer migration cost:** ~8h (Bridge rewrite 4h, stale-session shim removal 2h, tests 2h). Zero behavioral churn expected; 0h rows are existing consumers that read `event_log` (archivist, agents). US-A-NEW-5 satisfied by new L1 WAL, exclusively.

**Assumption flagged for Aaron:** `parent_session_id` / `fork_point_event_id` (Aaron decision 2a) are sufficient for fork lineage without per-row markers on L1 WAL or `event_log`. If Sonny's debugger needs per-row lineage, that's a v1.1 column on the WAL row, not on `event_log`. (Source: `.squad/decisions/inbox/archive/2026-05-25-round5-6/rosella-open-7-2026-05-25T0130Z.md`)

---

### Vocabulary Update

**Rename: Narrator → Mirror** (effective immediately per Round-4 lock; harness-vision.md to be updated next revision).
**New term: Mirror render modes** — Notifications (push, badge/count) and Dashboard (pull, full surface).
**New term: `withShadowEvent()` pattern** — canonical wrapper for derived-table UPDATEs; ensures event-source invariant.

**NET-NEW axis:** Hermetic observation capture, bisect CLI, branch metadata in schema, determinism CI conformance runner, bus fuzz regime, verdict-stream recording, policy version on verdicts. (Full reconciliation: `.squad/decisions/inbox/gabriel-reconciliation-2026-05-24T2330Z.md`)

### Graham — Phase B Reconciliation

**Classification summary:** 0 ALREADY-EXISTS, 4 PARTIALLY-EXISTS, 5 NET-NEW, 1 CONTRADICTS (closed enum ProposalGenerator vs open SDK contract), 2 WITHDRAWN.

**Headline:** ~0% of the locked 5-layer Crucible stack exists as load-bearing structure. Existing repo is **prefiguration of L3** (Prescribers via `OptimizationHint` emit) **and partial L4** (Applier + DecisionGate hooks) with strong post-hoc Merkle analog (DBOM) but no per-row content-addressing, no WAL, no group-commit, no replay, no branching, no Salsa, no investigation surface. **Crucible is greenfield architecturally**; repo gives us production-tested patterns (canonical JSON hashing, hook composition, fail-open discipline, async Curator) and a clean L3/L4 v0 to borrow.

**Impact:** Confirms greenfield framing (not incremental). Skunkworks in `packages/cairn/src/spike/` shows what was explored (SDK spikes promoted to production like dbom-generator → forge/dbom/index.ts); no spikes for forking, replay, dashboards, DAGs confirms those are NET-NEW. (Full reconciliation: `.squad/decisions/inbox/graham-reconciliation-2026-05-24T2330Z.md`)

### Laura — Phase B Reconciliation

**Classification summary:** 0 ALREADY-EXISTS, 9 PARTIALLY-EXISTS, 9 NET-NEW, 2 CONTRADICTS (canonical serialization DBOM=JSON+SHA256 vs my lock of CBOR+BLAKE3; evidence shape existing string[] vs typed EvidenceEntry[]).

**Headline:** Pareto fitness entirely absent (only scalar reductions: drift weight-sum, hint priority score, single QualityVector tier). 5-axis `QualityVector` exists (clarity/completeness/concreteness/consistency/containment, each tier {1=deterministic, 2=LLM-judge, 3=simulation}) — closest semantic match to Aaron's "simulation + live A/B + synthetic benchmarks" but tiers 2–3 unimplemented (only tier 1 runs). Determinism-test pattern exists but only intra-process (no hermetic replay harness). Conformance runner needed: persisted-input → reload → re-run → byte-compare. **No multi-objective fronts, no dominance computation, no leaderboard.**

**NET-NEW axis:** Pareto frontier, dominance computation, curriculum acceptance/rejection, sim↔live drift, branching-as-eval, debugger acceptance harness, A3 replay re-derivation assertion, five new proposal fields (fitnessContract, costEstimate, reversibility, determinismClass, causalReadSet), `ReadSetBuilder`. Canonical serialization conflict with Roger on CBOR vs JSON+SHA256. (Full reconciliation: `.squad/decisions/inbox/laura-reconciliation-2026-05-24T2330Z.md`)

### Roger — Phase B Reconciliation

**Classification summary:** 2 ALREADY-EXISTS, 6 PARTIALLY-EXISTS, 7 NET-NEW, 2 CONTRADICTS (group-commit WAL vs SQLite WAL, ledger primitives).

**Headline:** Cairn `event_log` is flat autoincrement (id, event_type, payload JSON, session_id, created_at) with single-cursor Curator polling — no primitive-kind taxonomy, no parent_seq causal chain, no Merkle root per row, no content-addressing. Merkle-chain (SHA-256 canonical JSON + parent-hash) exists only in spike/dbom-artifacts export, not live WAL. Zero snapshot tables, zero `refs` table, zero CAS blob store, zero COW snapshots, zero ledger-branch metadata. The SDK parentId-chained event log (serialized by SDK, discarded by Cairn at boundary) means substrate for replay exists upstream and is being collapsed.

**NET-NEW axis:** Fork+replay primitives, cross-session provenance walk, federation/multi-tenant (cheap: add `tenant_id NOT NULL DEFAULT 'local'` to 5 tables), snapshot/compaction cadence, WAL-first ledger semantics with group-commit + fsync barrier, observation capture. Existing backpressure-via-dedup (`ACTIVE_HINT_STATUSES` on optimization_hints) is already-exists win; pattern-mining surface real but flat. (Full reconciliation: `.squad/decisions/inbox/roger-reconciliation-2026-05-24T2330Z.md`)

### Rosella — Phase B Reconciliation

**Classification summary:** 1 ALREADY-EXISTS, 5 PARTIALLY-EXISTS, 4 NET-NEW, 0 CONTRADICTS, 1 latent-conflict risk (US-Ro-3).

**Headline:** **Real plugin host already exists — in Cairn, not Forge.** `packages/cairn/src/agents/discovery.ts` (482 lines) walks entire Copilot CLI install (user, project, plugin, marketplace), emits typed `DiscoveredArtifact` with SHA-256 checksums and owner tags, runs cross-scope conflict detection. `ArtifactType` union = {instruction, agent, skill, hook, mcp_server, plugin_manifest, command}. Plugin manifests (plugin.json) only consume `name` field today — version/integrity/dependency exist on disk but not typed. `HookComposer` is SDK hook merger (not generic bus; Phase A bus lives in WAL group-commit). Forge prescriber/model-strategy/runtime are three extension points (hardcoded today, no registry).

**Impact:** discovery.ts is huge head-start on US-Ro-NEW-3 (registry+tiers) and US-Ro-NEW-2 (plugin-pinned branching). Export pipeline (CompiledSkill with DBOM provenance in YAML) is existing hermetic-skill-emission format to reuse. SDKClient interface is Provider-swap seam (only Copilot SDK behind it today). (Full reconciliation: `.squad/decisions/inbox/rosella-reconciliation-2026-05-24T2330Z.md`)

### Sonny — Phase B Reconciliation

**Classification summary:** 0 ALREADY-EXISTS, 3 PARTIALLY-EXISTS (US-S-1, US-S-2, US-S-9), 6 NET-NEW, 1 CONTRADICTS (provenance vocabulary collision).

**Headline:** **No debugger today.** No DAP, no inspector, no REPL, no breakpoint registry, no watch, no bisect, no minimizer, no causal slice. L5 Investigation Surface greenfield cleanest sense. But substrate is better than expected: `HookComposer` + `permissionDecision` verdicts (tool-boundary, not per-primitive-row) + `event_log` cursor-based reader + DBOM hash chains + MCP tools (get_status, list_insights, search_events ≤500 limit, check_event, run_curate, list_prescriptions). **Existing surfaces:** MCP query/mutate (the only Aaron-facing debug UX today), hook composer error isolation, event log with (session_id, created_at) index, cursor-based polling.

**Gaps:** No event_log payload schema exposure, no temporal query, no causal query (no read_set column, no hook_verdict column, no causal_read_set_hash), no cross-session navigation, no fork concept, no breakpoint/step/step-into verdicts (only allow/deny/ask). Verdict enum maps 1:1 to US-S-1 (predicate breakpoint) but fires per-tool-call, not per-primitive-row-write. Vocabulary collision: "provenance" already means evidentiary tier {internal, certification, deployment}, not the concept Sonny terms provenance. (Full reconciliation: `.squad/decisions/inbox/sonny-reconciliation-2026-05-24T2330Z.md`)

### Valanice — Phase B Reconciliation

**Classification summary:** 1 ALREADY-EXISTS, 3 PARTIALLY-EXISTS, 8 NET-NEW, 2 CONTRADICTS (Mirror vs Narrator; Aaron in Copilot CLI vs Crucible as CLI shell).

**Headline:** **No UX layer resembling Mirror.** User-facing surface = ten MCP tools returning JSON text + one banner CLI (`🪨 Cairn v0.1.0`). No session/export renderer beyond SKILL.md YAML frontmatter emission (CompiledSkill with DBOM provenance). **Saved-query grammar greenfield.** Existing surfaces: `list_prescriptions` proactive_hint (max 1/session, only unviewed generated prescriptions) + `resolve_prescription` emoji replies (✅ Applied / 👍 Noted / ⏳ Deferred / ❌ Failed) + `show_growth` trend messages (observational, opinion-free). Preferences table exists; MCP mirrors none of it to UI. Harness-vision proposes **Narrator** chamber (diary-style, not team-facing v1) overlapping design space with Round-2/3 "Mirror" — collision risk flagged for Graham.

**Impact:** Confirms no existing Mirror semantics to borrow. Confidence wording exists (`high/med/low` on DecisionRecord, numeric [0,1] on hints); export path (CompiledSkill format) is reusable template. Naming collision (Mirror vs Narrator) deferred to Aaron/Graham decision. (Full reconciliation: `.squad/decisions/inbox/valanice-reconciliation-2026-05-24T2330Z.md`)

---

## Vocabulary

**Canonical terms (locked for all agents, effective Round 5 onward):**

| Canonical (use henceforth) | Replaces | Reason | Citation |
|---|---|---|---|
| **prescription** | `proposal` | `prescription` already ships in Cairn (`list_prescriptions`, `resolve_prescription`, MCP server). Adopting verbatim eliminates retitling. | Valanice Phase B; `cairn/src/mcp/server.ts:466-472,569,610` |
| **trail** | `breadcrumb` | `breadcrumb` is taken in repo: `cairn/src/db/skipBreadcrumbs.ts` = intentional skip record. Distinct concept; do not overload. | Valanice Phase B |
| **causal_read_set** / `causalReadSet` | any use of `provenance` for this concept | `provenance` is taken: evidentiary tier (`'internal' \| 'certification' \| 'deployment'`). Phase A already named the field correctly; NO ONE may rebrand it `provenance`. | Sonny Phase B; `cairn/src/types/index.ts` ProvenanceTier |
| **(rename TBD — owner: Alexander)** | `skillsmith-runtime` package name | `@akubly/skillsmith-runtime` is a 323-line Cairn↔Forge composition root, NOT a runtime. Name actively misleads every reader and poisons reconciliation. | Alexander Phase B |

**Action items:**
1. **All authors** — use `prescription` / `trail` / `causal_read_set` from Round 5 onward. Older inbox files are drift, not authority.
2. **Alexander** — propose new name for `skillsmith-runtime` in Round 5 (suggested: `@akubly/composition`, `@akubly/wiring`, or similar). Physical rename queued for eventual Crucible-monorepo merge, NOT now.
3. **Round 5 spike agents** — already prompted with these terms.

**Not in scope:** Mirror/Narrator naming (Graham + Aaron), Investigation Layer rename (L5 locked), existing DBOM/hooks/decisions module names.

1. **Curator authority model (resolves Q2):** Curator has detection + proposal authority only — never approval authority. Per-category treatment:
   - ✅ auto-apply: hint prioritization only
   - 📨 auto-notify (lands in user-pull notification feed): staleness, Alchemist triggers, skill recommendations
   - ⚠️ detect & propose, require explicit user ACK/REJECT: hypothesis reversion, policy proposals
   - ❌ never auto: low-confidence hint apply, policy guardrail changes
   - The vision-doc framing of "append-then-review vs propose-then-commit" dissolves — it's per-category, and consequential decisions always stage for human gate.

---

## Cross-PRD Coordination — Cassima Reply (Revision after Lockout, 2026-05-27)

**Status:** APPROVED by Aaron (2026-05-27). **Supersedes** Graham's prior locked-out reply (retained in ledger for audit, ~lines 1280-1500).

**Scope:** Cross-team contract freeze between Crucible (Cairn) and Eureka, narrowed by Aaron's May 26 directives (Crucible storage fork + Eureka standalone v1).

**Decision:** Freeze only three shared contracts for v1:
1. `SessionId`: one branded primitive in `@akubly/types`, representing Copilot CLI session UUID (`~/.copilot/session-state/{uuid}/`).
2. `DecisionRecord`: flat Forge audit shape used by Eureka decision adapters.
3. `@akubly/types` governance: co-owned by both teams in CODEOWNERS, no single primary owner.

**Rationale:** Aaron's directives changed which contracts cross the team boundary. Crucible now owns storage (Cairn independent from Eureka), and Eureka remains standalone for v1. The joint freeze protects the contracts that *still* touch both systems, while removing blocking scope on WAL/event consumption and prescriber core API.

**Excluded from v1 freeze (deferred):**
- WAL/session-end event consumption → deferred to v1.5+ unless new evidence makes it v1 blocker
- Prescriber API surface and Eureka-aware Forge prescriber design → deferred until implementation owner exists

**Integration recommendation (non-blocking, future):** For Crucible→Eureka use, prefer an optional Eureka-aware Forge prescriber that calls Eureka through public surface + emits normal Forge hints for Curator. Keeps both libraries independent.

**Storage boundary (locked in):** Cairn remains Crucible's operational ledger; Eureka remains standalone knowledge storage. No shared DB schema, no cross-DB foreign keys, no runtime `ATTACH`, no `LearningEvent` package needed for v1.

**Session/FR alignment:** Eureka PRD (FR-13) keeps Cairn→Eureka facts manual-only in v1 (explicit `remember()` by agent/human, no automatic promotion). FR-14 makes on-demand consumption path explicit (`eureka.ingestDecisions(...)` caller-driven, no background sweep).

**Next Steps:**
- Open CODEOWNERS PR for `@akubly/types` co-ownership
- Land `SessionId` brand commit this week
- Freeze `DecisionRecord` v0 as second shared contract
- Defer prescriber design until implementation owner surfaces

**Decided by:** Aaron Kubly  
**Communication:** Will be sent to Cassima (Eureka Coordinator) as cross-team clarification on v1 freeze scope.

2. **Turn definition (resolves Q3):** **Thick turn with intra-turn primitives, revealable on demand.** One user message → one assistant response, with sub-agents and tool calls nested inside. Reveal pattern modeled on Copilot CLI's Ctrl+E / Ctrl+T — internals are accessible but not in the user's face by default. Primitives are recorded at intra-turn granularity (each tool call, each sub-agent invocation, each decision) so replay fidelity is preserved without fragmenting the user-visible exchange.

3. **Hash-chain semantics (resolves Q4):** Keep cheap hash-linking in the ledger (self-audit value for Aaron-the-sole-user, ~1% storage cost). Defer SBOM-style witness/notary/signature infrastructure to a later wave — migration is backward-compatible. Threat model in scope: "did I really approve that 6 months ago?" Threat model out of scope: external attestation, multi-party tamper detection.

---

### Skillsmith Harness — Vocabulary (locked)

**Date:** 2026-05-24T07:25Z  
**By:** Aaron Kubly  
**Context:** First-principles naming pass complete (Graham + Valanice independent reviews + Aaron's meta-call). Theme = mixed: flavor names preferred at project level, inherited-functional names acceptable for substrate.

**Decided vocabulary (final for v1 design phase):**

| Concept | Name | Origin | Notes |
|---|---|---|---|
| CLI shell / message loop | **Crucible** | New flavor name | Upgraded from "Harness" — flavor-system coherence |
| Typed primitive ledger | **Cairn** | Inherited, deliberately chosen | Graham and Valanice both proposed "Ledger"; Aaron kept Cairn as deliberate flavor pick |
| Optimization prescriber | **Forge** | Inherited, deliberately chosen | Graham proposed "Prescriber"; Aaron kept Forge as flavor |
| Autonomous trigger layer | **Curator** | Inherited, deliberately chosen | Both agents proposed "Trigger"; Aaron noted Curator acceptable as inherited-functional, kept |
| Variant transformation loop | **Alchemist** | New flavor name | Was "Geneticist"; Aaron's instinct "Mixologist" → settled on Alchemist (transforms base material via experimentation; more storied) |
| Reflective trust-building surface | **Mirror** | New flavor name | Was "Narrator"; Mirror = self-reflective trust-building, shows harness's reasoning + user's work reflected back |

**Five primitives (kept verbatim):** Request, Artifact, Observation, Decision, Question.

**Open footnotes for design phase:**
- Graham: Artifact sub-types should be explicitly schema-typed to avoid silent divergence.
- Valanice: Question semantics should be documented operationally.

---

### Aaron's Post-Erasmus Insights

**Date:** 2026-05-24T20:55Z  
**By:** Aaron Kubly  
**Context:** Aaron's reaction to Erasmus's outside-specialist story set + 4-layer structural critique.

**Insight 1 — Branching sessions is a functional requirement:** Erasmus's US-E-2 (counterfactual replay — "what would have happened if I'd accepted that past proposal?") elevates session forking from a debug convenience to a **first-class workflow primitive**. The user must be able to fork from any ledger position and explore an alternate path. This is downstream of the hash-linked ledger commitment but is now a named, load-bearing capability — not merely an emergent property.

**Insight 2 — "Agentic debugger" is a new vision seed:** Erasmus's phrasing ("ledger is a debugger's dream") landed with Aaron as a new product/positioning angle. The harness may be (or have, as a first-class capability) an **agentic debugger** — bisect, counterfactual, time-travel, hermetic replay, observation capture. Future stories and architecture should be evaluated through this lens: if a story is doubly compelling under "this thing is also a debugger," that's a strong signal.

**Insight 3 — Determinism is now load-bearing:** Erasmus's risk #1 ("determinism is not free — replay requires observation capture + hermetic replay of external dependencies") becomes an architectural requirement, not a deferred concern.

---

### T5 Resolution: Crucible Built on Copilot SDK

**Date:** 2026-05-24T21:33Z  
**By:** Aaron  
**What:** Crucible is built on the Copilot SDK and **replaces** Copilot CLI as Aaron's daily driver. Crucible owns the top-level message loop, primitive ledger, Router, and chamber orchestration. Copilot SDK provides the model/tool substrate Crucible builds on. Not a sub-conversation of Copilot CLI; not a peer; not a plugin.  
**Why:** *"This is the only way we get the access we need to satisfy all of our requirements."* Resolves the deliberation-round split (5 parent / 3 child) in favor of parent-camp with a concrete SDK-based mechanism. Unblocks: hermetic observation capture at the LLM-call boundary, branching sessions, deterministic replay, the agentic-debugger thesis.  
**Implications:** Crucible CLI is its own shell (not Copilot's). Alexander US-A-10 (Crucible as MCP server) becomes additive, not load-bearing. The "thin shells around a runtime" architectural shape Alexander proposed still applies — runtime in the middle, Crucible CLI as one shell, MCP-server surface as another.

---

### Hiring: Sonny (Debugger Specialist)

**Date:** 2026-05-24T21:33Z  
**By:** Aaron  
**What:** Sonny (Sonny Bonds, Police Quest) joins as **Debugger Specialist** consultant. Charter parallel to Erasmus's outside-specialist role but lens-narrow: agentic-debugger UX, DAP-shaped primitives, breakpoint/watch/step/bisect semantics, observation-capture-as-debugger-substrate.  
**Why:** Alexander US-A-NEW-2 explicitly requested a debugger-lens specialist ("out of my depth on debugger UX/protocol design"). Aaron's vision-seed #2 from last round is itself a separate product direction. Universe note: Sonny is the second Sierra-cast outside-specialist (Erasmus was Quest for Glory, Sonny is Police Quest) — both fit "Sierra On-Line" assignment universe.

---

## Deliberation Round Cross-Pollination (2026-05-24)

*Nine orchestration-log entries exist in `.squad/orchestration-log/2026-05-24T2133Z-{agent}.md` for detailed agent positions. Summary: Erasmus (4-layer stack validation), Graham (architecture lead), Roger (data/scale), Rosella (extensibility), Gabriel (infra), Valanice (UX), Laura (eval), Alexander (SDK/runtime), Sonny (debugger). This section aggregates cross-cutting decisions.*

### Erasmus: 4-Layer Stack Validated

**Decision:** Accept 4-layer architecture (Conductor+Ledger merged, Derived Query Layer Salsa-style, pluggable Proposal Generators, Approval+Notification Router as single policy choke-point).

**Rationale:** Honest qualification: Mirror = view layer (renderer), not subsumed by Router. Router = policy; Mirror = view; Derived Query Layer = analysis; Cairn = storage.

**New risks surfaced:** Conway's-Law package fragmentation (cap at ~4 packages; treat chambers as modules).

**New stories:** US-E-NEW-11 (Hermetic Replay Boundary), US-E-NEW-12 (Crucible as sub-conversation, now resolved by T5).

---

### Graham: Architecture Lead Cross-Pollination

**Positions:**
- PARTIAL-ENDORSE 4-layer stack (pushback: Conductor write path must be transactional, L2 scaling caveat, Mirror remains bidirectional UX surface)
- T5 (Crucible ↔ Copilot CLI) **unresolved and blocking** (Graham position: Crucible is parent; Copilot CLI is provider)
- New tension surfaced: **Determinism vs LLM non-determinism** — replay is honest (does not re-execute LLM calls), must be explicit doctrine

**New stories:** US-G-NEW-1 (Cairn snapshotting & compaction), US-G-NEW-2 (Determinism contract: observation capture + hermetic replay).

**Five stories flagged ★ (doubly compelling under debugger):** US-G-2, US-G-6, US-G-7, US-G-NEW-1, US-G-NEW-2.

---

### Roger: Data/Scale Lens

**Positions:**
- L1 (Conductor+Ledger) endorsed; endorse per-tool-call append if no fsync-per-append (WAL2 with group-commit at decision boundaries gives ~1ms p99)
- L2 (Derived Query) endorses if snapshot caching prevents bottleneck relocation
- L3 (ProposalGenerators) strong endorse
- L4 (Router) strong endorse with single-writer invariant
- T5: sub-agent IO must flow through observation-capture or replay breaks at agent boundary
- New Tension 6 raised: capture cost vs throughput vs privacy

**Critical v1 commitments:**
- Append-only WAL, batched fsync; primitives ≤256B typical, large payloads spilled
- Snapshot at every Decision; Merkle-rooted → branching is COW, verification O(depth-diff)
- Observation-capture sibling store, 5–10× ledger volume, same content-addressing

**Story consolidation:** 8 stories depend on shared branching/replay/bisect mechanism.

---

### Rosella: Plugin Dev / Extensibility Lens

**Positions:**
- PARTIAL-ENDORSE 4-layer (L3 ProposalGenerator interface is 85% correct but has 15% structural-mutation leak)
- **Proposed dual-interface split:** DataProposalGenerator (85% of generators) + StructuralProposalGenerator (Alchemist, skill-induction cases)
- Same Router (L4), separate policy routing for structural proposals (higher-friction defaults)

**New stories:** US-Ro-NEW-1..4 (Generator SDK, branching as plugin-safe, plugin registry+tiers, structural-change proposals).

**Owns:** Determinism + model-provider hermetic boundary.

---

### Gabriel: Infrastructure / Observability Lens

**Positions:**
- Endorsed 4-layer with Router caveat (Router is THE single safety choke-point, needs observability + property testing)
- T4 (heavyweight ops) resolved: cut attestation/multi-secret, keep determinism + compaction + crash recovery
- Determinism + observation capture = load-bearing v1 invariants

**New stories:** US-Ga-NEW-11..16 (Hermetic Replay, Bisect Tooling, Branch Primitives, Snapshotting, Router Observability, Determinism Smoke Test).

**Owns:** Router observability + failure-mode testing.

---

### Valanice: UX / Product Lens

**Positions:**
- Endorsed 4-layer with UX caveat (Mirror=view model loses discoverable landing surface; propose @lobby default)
- **T3 (Mirror scope creep) RESOLVED:** Mirror is a view (query over router queue + ledger), not a chamber
- **T5 (Crucible/CLI inversion) STANCE:** Aaron stays in Copilot CLI; Crucible is ambient (MCP/slash-commands), not separate shell

**New stories:** US-V-NEW-1..6 (Branch navigation, Mirror=view, time-travel UX, one inbox, replayability badges, bisect-as-conversation).

**UX metaphor discipline:** rewind/what-if > debugger language (no step/breakpoint/frame).

---

### Laura: Eval / Feedback Lens

**Positions:**
- PARTIAL-ENDORSE 4-layer (L3 under-specified for eval)
- L3 schema extension needed: fitnessContract, evidence, costEstimate, reversibility, determinismClass
- T4: lean toward solo but keep determinism+replay+fitness (three load-bearing pieces)
- T5: sub-agent IO must flow through observation-capture or replay breaks

**New stories:** US-L-NEW-9..13 (Pareto fitness contract owned by Laura, branching as paired-eval, agentic-debugger acceptance harness, determinism conformance suite, generator-quality scorecard).

**Owns:** Pareto fitness contract + debugger acceptance test harness.

---

### Alexander: SDK / Runtime Dev Lens

**Positions:**
- PARTIAL-ENDORSE 4-layer (strong on L2/L3/L4)
- **T5 RESOLVED:** Crucible is host; Copilot CLI is one Provider (MCP IO for sub-agent invocation; Copilot SDK substrate)
- **US-A-NEW-5 (ledger-append transactional contract) is load-bearing prerequisite** before Conductor implementation

**New stories:** US-A-NEW-1..5 (Branching Sessions, Debugger Hooks, Hermetic Replay, DAG Dependency Support, Transactional Contract).

**Request:** Spawn debugger-lens specialist (out of depth on DAP/breakpoints) → Sonny hired.

**Architectural shape:** Runtime in middle; thin shells (CLI, plugin, MCP-server) around it (same pattern as skillsmith-runtime).

---

### Sonny: Debugger Specialist (Round 1)

**Engagement:** Responded to Alexander US-A-NEW-2; proposed agentic-debugger surface; contradicted two framings.

**Nine debugger stories:** US-S-1..9 (predicates-as-breakpoints, watches via L2 queries, backward causal slicing, retroactive projections, DAG step-into, cairn-bisect, dual surfaces, delta-debug, breakpoint-as-approval-request).

**Proposed Layer 5:** Investigation Surface (DAP sidecar + investigator REPL + breakpoint registry, reaching into L4 and L2).

**Three v1 invariants flagged as load-bearing:**
1. Read-set capture on every primitive write (US-S-3 backward causal slicing)
2. L2 queries are pure functions of (ledger-prefix, plugin-versions)
3. L4 verdict enum is extensible for debugger verdicts

**Highest-priority ask:** US-S-3 (backward causal slice) — "why is this primitive here?" — must lock read-set capture into L1 before implementation, impossible to retrofit.

---

## Five Tensions: Assessment Summary

### Tension #1 — Solo-v1 vs Federation

**Resolution:** Solo-v1 for build; federation-aware contracts from day one (cheap discipline now, defer expensive infrastructure).

**Impl:** Namespace/tenant_id column from day one (default `'local'`).

### Tension #2 — Curator Never Approves

**Resolution:** DISSOLVED by Router (Layer 4). Curator = detection + proposal only. Router holds approval authority + policy choke-point.

**Impl:** Single Router module (not a rename); all generators (Curator, Forge, Alchemist, etc.) flow through it symmetrically.

### Tension #3 — Mirror Scope Creep

**Resolution:** Mirror = view layer only (queries over router queue + ledger). Analysis pushed to L2 (Derived Query), editing to branching primitives.

**Impl:** Mirror is a verb (`mirror @doubts`), not a chamber. Default landing surface: @lobby (saved query).

### Tension #4 — Heavyweight Ops vs Solo User

**Resolution:** Bias hard toward solo; cut SLSA attestation, multi-secret rotation, federated Cairn. Keep determinism + ledger compaction + crash recovery.

**Impl:** Heavy capabilities (cross-session mining, federation, multi-tenant Cairn) ship as plugins, not core.

### Tension #5 — Crucible vs Copilot CLI Parent-Child

**Resolution:** **Crucible is built on Copilot SDK and replaces CLI as Aaron's daily driver.** Crucible owns trunk (runtime in middle); Copilot CLI is one Provider shell; MCP-server surface is another.

**Impl:** Runtime SDK (`@akubly/crucible-runtime`), CLI (`crucible`), plugin (`crucible-copilot-plugin`), MCP surface (optional). Copilot CLI invokes Crucible via MCP when delegating to harness.

---

## New Tension (Sonny)

### Tension #6 — Capture Cost vs Throughput vs Privacy

**Issue:** Observation-capture will eventually contain secrets. Needs: capture compression, redaction ProposalGenerator before commit, explicit policy on replay across key rotation.

**Status:** Flagged for Wave 4+ planning.

---

## Architecture Adds

### Layer 5: Investigation Surface (Sonny Proposal)

Not a new chamber; a labeled surface above L2 bundling debugger-facing concerns:
- DAP server (sidecar process)
- Native investigator REPL
- Breakpoint / watchpoint / logpoint registries
- Causal-slice engine
- Bisect orchestrator
- Delta-debug / minimization driver

**Why Layer 5 is real:** Stateful registries (lifecycle independent of any L2 query), cross-cutting authority (reaches into L4, L2, L1), two protocol surfaces (DAP + REPL), honest naming (Mirror is "seeing"; L5 is "asking why").

---

## Architectural Prerequisites (Load-Bearing)

Locked before Conductor implementation:

1. **US-A-NEW-5: Ledger-Append Transactional Contract.** SQLite WAL2, group-commit at decision boundaries, ≤1ms p99 appends, durability = ≤1 turn on crash.

2. **US-S-3: Backward Causal Slice.** Every primitive write must record read-set (set of primitives, projections, external inputs consulted). Read-set capture locked into L1 append contract; impossible to retrofit.

3. **L2 Query Purity.** L2 queries are pure functions of (ledger-prefix, plugin-versions), enabling retroactive projections (US-S-4) and determinism conformance.

4. **L4 Verdict Extensibility.** L4 Router verdict enum extendable to carry debugger verdicts (continue, step, step-into, step-out, abort, edit-and-continue) for single-pause-mechanism alignment.

---

## Crucible PRD — Round 2 Closeout (2026-05-26)

*Locks produced across Rounds 2.0–2.4. Source documents: `cassima-prd-round2-changelog.md`, `cassima-marketplace-governance.md`, `graham-task-architecture-r2.md`, `alexander-calendar-revise-r2.md`, `gabriel-marketplace-mechanics.md`, and the `*-mirror-name-r2.md` files (graham/gabriel/erasmus).*

---

### Round 2.1 — Cluster C: Mirror → Aperture (Rename Locked)

**Date:** 2026-05-26  
**Source:** `cassima-prd-round2-changelog.md` §Round 2.1; `graham-mirror-name-r2.md`; `gabriel-mirror-name-r2.md`; `erasmus-mirror-name-r2.md`

**Decision:** Cluster C reflective-trust-building surface is renamed **Mirror → Aperture**. Aaron presented a curated slate (glass / lens / scope / oculus / aperture / spectra). Graham (architect), Erasmus (storyteller), Gabriel (engineer), and Cassima (PM) **unanimously selected Aperture**. Unanimous veto: **scope** (namespace collision — debugger scope, telescope scope, project scope, lexical scope all overload the word).

**Rename lineage:** Aperture ← Mirror ← Narrator.

**Convergent rationale across four lenses:**
- Aperture is a concrete adjustable mechanism — does something you can tune, matching a surface you query at different verbosity levels.
- Natively encodes the push/pull duality in one image: open wider to receive more (notifications/push), dial to a specific view (dashboard/pull).
- CLI verbs flow from the noun: `crucible aperture watch` (tail live), `crucible aperture show` (open dashboard). Convergent @Team suggestion; final verb table is Erasmus/Valanice/Alexander discretion.
- Zero namespace collision vs all alternatives.

**Code-identifier rename:** `mirror_events` table → `aperture_events`, `MirrorEvent` → `ApertureEvent`, `MirrorProjector` → `ApertureProjector`. Sequenced with Sprint 3 Aperture Projector landing. **Owner: Rosella.** Active plan tracked in `rosella-aperture-rename-plan.md` (left in inbox — work artifact, not a decision).

**PRD update:** §6.4 added, recording team selection, unanimous Scope veto, convergent rationale, and code-migration sequencing policy.

---

### Round 2.3 — Trust-Tier Label Vocabulary Lock: `adopted`

**Date:** 2026-05-26  
**Source:** `cassima-marketplace-governance.md` §8 and §8a

**Decision:** The tier-2 trust label is **`adopted`**. Final v1 enum: `{builtin | adopted | community | external}`.

**Label history:** `verified` (initial default — rejected for security-audit baggage) → `accepted` (Aaron-coined in Round 2.2; Cassima endorsed, flagged verb/state namespace risk with the prescription triad `accept`/`reject`/`defer`) → **`adopted`** (Round 2.3, 5-voice @Team tiebreaker, unanimous).

**5/5 convergence:** Gabriel + Cassima as top pick; Graham / Erasmus / Valanice as least-objectionable. All five voices arrived at `adopted`; no dissent.

**Why `adopted` wins:**
- Vocabulary-fence audit cleared it: `crucible adopt <id>` is semantically distinct from prescription verbs (`accept`/`reject`/`defer` operate on one prescription item; `adopt` is a state-changing act of trust placement on an extension). Round 2.2 watch-out is **retired**.
- Clean register: all four tiers are state-fact nouns (`builtin`, `adopted`, `community`, `external`) — consistent grammatical shape, no mixed adjective/noun breaks.
- Gabriel: "`adopted` is a state-fact you can log honestly — 'we adopted this tool, what it does is on us.'" Erasmus: "Doesn't lie about what happened." Correct voice for a single-user system.
- Honest middle term between birthright (`builtin`) and meritocracy (`community`): names Aaron's deliberate choice without overclaiming certification.

**Runners-up rejected:** `recommended` (communication act, not state structure — wrong type-category), `curated` (mixed register — past-participle adjective doesn't pair cleanly with `community`/`external`), `endorsed` (implies constituency endorsing on someone's behalf — wrong for single-user), `inducted` (ceremonial — raises questions rather than answering them per Valanice's usability flag).

**Residual trade-off acknowledged (Valanice):** `adopted` describes inclusion without signaling *why*. Addressed at the UI layer: badge `[adopted]` paired with tooltip *"Aaron added this to your trusted set"* — the *why* lives in the gloss, not the label. Gloss is owner-discretion under the vocabulary fence (Cluster H).

**CLI verb:** `crucible adopt <id>`.

**Appendix A.I.5 consistency (Round 2.4):** Cluster I.5 trust-tier enum updated from `{builtin|plugin|user|external}` to `{builtin|adopted|community|external}` for consistency with §2.7.d.

---

### Round 2.2 — Marketplace Governance Locks (Aaron, 7 items)

**Date:** 2026-05-26  
**Source:** `cassima-marketplace-governance.md` §8; `cassima-prd-round2-changelog.md` §Round 2.2

All seven open governance questions resolved by Aaron:

1. **CoI discipline: FULL.** Gradient + `[self-authored]` UI badge + written-rationale Decision primitive on every self-promotion. Self-authored extensions cannot bypass the trust gradient to reach `adopted` directly — Aaron's own work starts at `external`, auto-promotes to `community` after 30 days/10 invocations/zero policy violations, only then becomes eligible for `adopted`. Every self-promotion captured as a Decision with `alternatives[]`. (Cassima's recommendation; Aaron accepted.)

2. **v1.5 trigger: second persona installs an extension.** The moment a non-Aaron persona invokes `crucible market install`, v1 governance is insufficient and the v1.5 panel-review model activates. (Cassima's recommendation; Aaron accepted.)

3. **Tier label → `adopted`.** See §Round 2.3 above.

4. **Revocation surface: immediate Aperture push, attention-tier.** Revocations are too consequential to batch into `@inbox`; must surface in real time. Forensic preservation: revoked extensions stay in install record (not deleted) so Sonny's investigation surface can walk what happened during their tenure. (Cassima's recommendation; Aaron accepted.)

5. **Auto-promotion thresholds: one threshold for v1, split per-category at v2.** v1 default: 30 days + 10 invocations + zero Router policy violations for `external` → `community`. Tunable as a single config knob. (Cassima's recommendation; Aaron accepted.)

6. **Catalog hosting: auto-by-recency in v1; curated catalog deferred to v1.5.** v1 catalog = everything Gabriel's mechanism has indexed, sorted by recency. Manually-maintained "extensions Aaron uses" catalog lands at v1.5 once there is a second user to publish it for. (Cassima's recommendation; Aaron accepted.)

7. **Sprint-2-exit observation-capture API spike: APPROVED.** Alexander + Roger joint 1-day spike at end of Sprint 2. Output: go/no-go on observation-capture wiring estimate for Sprint 4.5. Unlocks §2.8 Coordinator-equivalent with full replay integrity. (Alexander's request; Aaron approved.)

**Marketplace MVM included in Sprint 6:** Cassima made the editorial call (per Aaron's instruction) to fold Gabriel's Sprint-6 marketplace MVM into Appendix C with an explicit ratification flag. Final ratification: Round 2.4 (see below).

---

### Round 2.2 — §2.8 Architecture: Serial Execution + Minimal Substrate (Graham)

**Date:** 2026-05-26  
**Source:** `graham-task-architecture-r2.md`; `alexander-calendar-revise-r2.md`

**Decision: Sub-tasks execute serially in v1 (not in parallel).** "Fan out N at once" means: issue N, execute one at a time, collect N results, present as a batch. Wall-clock cost is additive; the ergonomic win is in the batched issue/collect shape, not in concurrency. True parallel agents are T2.

**Three decisions Alexander named as CLOSED (from Graham's review):**
1. **Context inheritance:** snapshot of parent's committed ledger head at spawn time. Sub-context reads from snapshot, cannot see subsequent parent writes mid-execution. Clean isolation, no aliasing risk.
2. **Error propagation:** `TaskEnd{status:'crashed'|'timed_out'|'aborted'}`. Fail-open with forensic preservation — sealed sub-stream is investigable. Matches existing Cairn fail-open pattern.
3. **Concurrency:** serial for v1, batched ergonomics (locked above).

**Net-new substrate (minimal — four additions):**

| Addition | Scope |
|---|---|
| `task_id TEXT NULL` on L1 WAL row | Additive extension to 8-field schema (v1 commitment #10); 1 field, same migration pattern as `parent_session_id` |
| `TaskStart` / `TaskEnd` kind values | New `primitive_kind` enum values on existing Request / Observation primitives — not new primitive types |
| `task-complete` sub-kind in Aperture `observation` category | Minor enum extension; no new category |
| Open-`task_id` recovery path in replay protocol | Handles crash-mid-task on session resume; synthetic `TaskEnd{status:'crashed'}` written before parent stream surfaces |

**No new hook types.** Pre-commit hook bus fires per-row; sub-task rows carry `task_id` and traverse the same bus via existing kind-indexed dispatch.

**Hard dependency: observation-capture completeness at Sprint 2 exit.** Sub-task LLM/tool calls must flow through the CAS observation-capture store or sub-tasks run without replay integrity. Sprint-2-exit Alexander+Roger 1-day spike (lock #7 above) is the named mitigation. If CAS API is inadequate at Sprint 2 exit, the gap is named explicitly and §2.8 replay integrity is either extended or formally downgraded to T2 — not silently omitted.

**Sprint 4.5 gating risk:** §2.8 cannot ship before the Aperture Projector is live (`TaskEnd` notifications require the `task-complete` sub-kind). Aperture Projector slip in Sprint 3 cascades to Sprint 4.5.

---

### Round 2.4 — Sprint-6 Marketplace MVM Ratification (Alexander + Gabriel)

**Date:** 2026-05-26  
**Source:** `gabriel-marketplace-mechanics.md` §9; `alexander-calendar-revise-r2.md` §6

**Ratified total: ~14 eng-days** (up from Cassima's rough-cut of ~10.5d).

| Owner | Estimate |
|---|---:|
| Gabriel (manifests, subprocess, Router policy, `crucible market` verbs) | ~8d |
| Rosella (elevated-capability prompt, deny-list, quarantine, Aperture push) | ~5.5d |
| Roger (per-call telemetry substrate fields) | ~0.5d |
| **Total** | **~14d** |

**Sprint structure:** Sprint 6 and Sprint 6.5 are split into discrete blocks. Marketplace MVM moves to **Sprint 6.5** (clean 2-week block). Sprint 6 retains drift prescriber + plugin pinning + dogfood prep. Sprint 7 (dogfood week) no longer blocks on marketplace MVM.

**Calendar bound unchanged:** ~2.5–3 weeks per sprint; ~13.5–16 weeks total elapsed. Sprint 6.5 adds ~0.5–1 week over the prior Round 2.2 13–15 week estimate.

**Three early-sprint dependency injections (new scope from Gabriel–Alexander sync):**
1. **Sprint 1 — Gabriel:** Amend manifest schema in `@akubly/types` to add `tier`, `capabilities[]`, `sha256`, `transitive_deps[]` (~0.5d, absorbed into Gabriel's Sprint 1 work). `sigstore_bundle` stays v2-deferred. Without this, Sprint 6.5 types PR causes mid-sprint conflicts.
2. **Sprint 2 — Roger:** Add policy-hook interface seam `(tier, capability) → allow/deny` (~0.5d stub only; implementation is Sprint 6.5). Required so the Router's admission path knows the hook exists before Gabriel retrofits it mid-sprint.
3. **Sprint 5 — Rosella:** Aperture push *delivery* path (attention-tier) must be explicit in Sprint 5 scope — not just the projector schema. Rosella's Sprint 6.5 quarantine + `capability_denied` notifications depend on it. Cannot slip to Sprint 7.

**`crucible market install/update/rollback` verb family owned by Gabriel** (~1.5d). Was unbudgeted miss in Cassima's rough-cut, surfaced in Gabriel–Alexander sync. Gabriel claims it — he designed the mechanics.

**Sigstore keyless signing deferred to v2.** v1 Aaron-only can accept manual sha256 verification in the catalog; Sigstore matters when third parties submit extensions. v1 MVM scope: signed manifests + sha256 pinning, subprocess + capability-token isolation, Router policy table + enforcement, elevated-capability confirmation prompt, deny-list fetch + daily refresh, quarantine on deny-list hit, basic Aperture push for `capability_denied` + quarantine events, transitive dep graph resolved + displayed at install.

---

## Eureka PRD Overlap Analysis — Cross-Agent Consensus (2026-05-27)

### Graham: Eureka × Crucible Architectural Overlap Matrix

**Author:** Graham Knight (Lead/Architect)  
**Date:** 2026-05-26

**Verdict:** Sequence Crucible L1 substrate first, then build Eureka against the stable L1 contract.

**Key Findings:**
- **3 HIGH-risk hard conflicts:** (1) Cairn `sessions` table restructured by Crucible; Eureka bridges target current schema; (2) `DecisionRecord` serves two masters; Eureka's adapters vs Crucible's richer Decision primitive; (3) "Forge changes nothing" is false under Crucible.
- **Shared-substrate candidates (5):** `SessionId` brand, `DecisionRecord` type evolution, SQLite patterns, bridge telemetry, CLI infrastructure.
- **Concrete sequence:** Sprint 0 (types lock), Sprints 1–3 (Crucible L1), Sprint 2+ (Eureka non-Cairn parts), Sprint 4 (bridges), Sprint 5+ (integration).

**Status:** Accepted (Graham consensus).

---

### Roger: Eureka ↔ Crucible Data Layer

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-26

**Verdict:** FORK on all 8 substrate concerns. Only `SessionId` brand is shared.

**Open Question:** Does Crucible's v14 `wal_records` live in same `~/.cairn/knowledge.db` or fork to new file? Migration-ordering dependent.

**Status:** Accepted (Roger consensus).

---

### Alexander: Eureka ↔ Crucible Runtime Integration

**Author:** Alexander (SDK/Runtime Dev)  
**Date:** 2026-05-26

**Verdict:** Recommend Shape #1 (Eureka-as-library-to-Crucible). Preserves hermetic replay.

**3 Critical Blockers:**
1. **flushHints sweep trigger:** Coordination needed.
2. **Replay-snapshot scope:** Needs explicit contract.
3. **Session-end hook:** Lifecycle contract unspecified.

**Status:** Accepted (Alexander consensus). Action: lock session-end hook in Sprint 0.

---

### Valanice: Eureka ↔ Crucible UX Overlap

**Author:** Valanice (UX / Human Factors)  
**Date:** 2026-05-27

**Verdict:** LOW aggregate UX risk; 3 collision zones require coordination.

**3 Collision Zones:**
1. Session identity shared (positive; requires vocabulary discipline).
2. Decision pathways diverge (needs ONE mental model).
3. Notification surfaces both exist (HIGH-RISK at session boundary; recommend Crucible Narrator subsumes Eureka flushHints).

**Status:** Accepted (Valanice consensus).

---

### Erasmus: Two Harnesses, One Developer — Dissenting View

**Author:** Erasmus (Specialist Consultant)  
**Date:** 2026-05-26

**Verdict:** SEQUENCE (do not merge). Question: does Eureka v1 delta over `store_memory` justify second harness?

**6 Failure Modes if Parallel Build:**
1. Interface oscillation (Cairn changes ripple).
2. Spec-driven development trap (Eureka PRD over-specified).
3. Premature abstraction (learning kernel extraction).
4. Bridges become bottleneck (seams where bugs live).
5. Circular self-reference (Eureka references Crucible implementation).
6. Attention-tier starvation (developer focus shifts).

**Status:** Dissent recorded. Recommendation: evaluate delta before sprint start. Others recommend proceeding after types lock.

---

## Five Open Questions for Aaron (Cross-Agent Consensus)

1. **Eureka v1 delta:** Is delta over `store_memory` significant enough to warrant parallel build?

2. **Database placement:** Does Crucible v14 `wal_records` live in shared DB or fork to new file?

3. **Session model under branching:** How do Eureka's flat session facts correlate when Crucible forks?

4. **Session-end hook:** Who owns flushHints sweep + Narrator attention? (Alexander blocker; Valanice recommends Narrator subsumes.)

5. **Eureka chamber status:** First-class Crucible chamber or external library?

---

*End of Eureka overlap analysis.*
