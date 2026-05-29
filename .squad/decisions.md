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

### Phase 4 Synthesis — CTD CLOSE GREEN-FINAL (2026-05-28)

**Date:** 2026-05-28 (Synthesis Review completed 2026-05-29T072142Z)  
**Author:** Graham Knight (Lead / Architect)  
**Status:** FINAL — CTD v1 STRUCTURALLY COMPLETE  
**Artifact:** Merged from `.squad/decisions/inbox/graham-ctd-phase4-synthesis.md`

**Scope:** Final pre-close interface-coherence synthesis across the four Phase 4 authoring lanes (Graham framing §1/§6/§19; Roger CALL/RET + Scheduler WAL §3/§10; Gabriel L3.5 Scheduler §5/§5.A/§17; Laura reproducibility honesty §11.10 + §16.5/§16.7a). Two minor errata resolved inline during synthesis gate.

**Verdict:** **GREEN-FINAL — CTD is complete.** Coherence matrix: 8 CLEAN / 0 MINOR / 0 STRUCTURAL / 2 APPLIED. Final inventory: 377,794 bytes across 21 files (19 numbered sections + Phase 1/Phase 2 synthesis reviews); 19 ADRs indexed and ready for post-CTD authoring.

**Coherence Checks (All CLEAN):**
- §1.2 L3.5 row aligns with §5.A spec aligns with §17 catalog aligns with §3.3.5 WAL acceptance
- §3.3.4 CALL/RET body fields are read verbatim by §10.6.1 stack-frame reconstruction
- Trace-vs-behavioral vocabulary (§11.10 ↔ §16.7a) is identical across both sections
- Streaming `stream_open/delta/close` sub-kinds are additive per §6.5
- §19 ADR-0019 + ADR-0024 index rows are accurate one-liners
- (Two errata applied; see below)

**Errata Applied (Graham Authority):**

1. **InvocationId Canonical Lock** (§3.3.4)
   - **Decision:** `invocationId = BLAKE3(sessionId || taskId || commitOffset)`, mandatory in L0
   - **Rationale:** Hermetic-replay invariant (ADR-0008; §11.6 byte-equivalence) is non-negotiable. §10.6.1 reconstruction keys off `invocationId`. Structural-compute cost in L0 is one BLAKE3 over three small inputs at TaskStart-emit time. L0 flexibility on this field had no compelling driver against an invariant this load-bearing.
   - **Ripple:** None — change strictly strengthens existing properties. No impact to §10, §11, or other sections.

2. **§7.D Supersede Contract Amendment** (§7.D clause 6 + conformance check C-9)
   - **Decision:** Replacement proposals that the Scheduler will cancel with `reason='superseded'` MUST set `envelope.parentId` to the EventId of the obsoleted proposal
   - **Rationale:** Scheduler uses that lineage edge to populate `scheduler_cancelled.body.supersededBy` deterministically. Contract violation caught at generator boundary (§7.A C-9), not at Scheduler. Closes Gabriel's Phase 4 flag.
   - **Ripple:** None — no change to §5.A.2 body shape; §6.4 `parentId` vocabulary unchanged; §3 and §17 unaffected.

**Newly-Surfaced Ambiguity:** None — CTD is complete. One informational note (non-blocking): Laura's `stream_open` / `stream_delta` / `stream_close` Observation sub-kinds are correctly additive per §6.5 evolution rule, but the §6.3 enumeration table does not yet list them. This is the right boundary for post-CTD §6.3 housekeeping pass (Laura owns streaming sub-kind authoring in §16; table updates land at sync pass exactly per §6.5 rule).

**Impact:** This is the final architecture-design gate. Post-CTD authoring is unblocked:
- Nineteen ADR files under `docs/adr/`
- §13 CLI implementation scaffolding
- §16 test-strategy scaffolding
- Greenfield package work under `@akubly/crucible-*`

No Phase 5 spawn required. No new open question requires Aaron triage.

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

---

## Crucible TDD Strategy — Q1-Q8 Resolutions (2026-05-27)

**Date:** 2026-05-27  
**Decided by:** Aaron Kubly (interactive Decision-Point gate via coordinator)  
**Source:** `docs/crucible-tdd-strategy.md` §11 (8 open questions)  
**Status:** ALL LOCKED — Strategy doc finalized FINAL status

### Resolution Summary

All 8 open questions locked after coordinator-mediated Decision-Point sequence and Laura's dual-layer validation.

| Q | Topic | Resolution | Departure from Laura's rec? |
|---|---|---|---|
| Q1 | Observation capture & primitive scale | **Refined Option E + tool-call scale + M3 synthetic_output + bootstrap-capture invariant** | Yes — Aaron reframed from Laura's B to deeper structural-commitment model |
| Q2 | Eureka prescriber integration in v1 tests | **C (defer Eureka adapter to v1.5) + ADD generic L3 adapter conformance suite in v1** | Concur with Laura's C; Aaron added generic-adapter scope |
| Q3 | Structural proposal approval UX | **B (Aperture async notification + queue, default-not-applied until acked)** | Concur with Laura |
| Q4 | Plugin pinning scope at fork | **B (transitive dep graph)** | Concur with Laura |
| Q5 | Bisect test command execution | **D (env snapshot at bisect start + shell out)** — coordinator-proposed refinement | Departed from Laura's A; D closes mid-bisect-drift failure mode |
| Q6 | Timestamp normalization in conformance suite | **A + monotonicity invariant** — coordinator-proposed addition | Concur with Laura's A; added separate property test for timestamp monotonicity within session |
| Q7 | Mock-drift detection threshold | **A (zero-tolerance)** — Aaron-driven | Departed from Laura's B; Aaron's framing: agentic cost functions invert vs human teams |
| Q8 | Pareto fitness with non-overlapping axes | **A (incomparable → both non-dominated)** | Concur with Laura |

### Q1 — Observation capture & primitive scale (deepest decision — REFINED OPTION E)

**Lock:** The Decision primitive's commitment is a **Merkle hash over the causal-context window** — every prior ledger row visible to the LLM at the moment of commitment, regardless of primitive type.

**Details:**
- **Window bounds:** From session-bootstrap (or most recent fork point) through the row offset immediately preceding this Decision
- **Window contents:** Every primitive in that range (Requests, Artifacts, Observations, prior Decisions, Questions) in canonical row order
- **Observation primitive:** First-class L1 row type. Streams naturally; not envelope metadata on other rows
- **Pruning signal:** If the LLM's context-window manager drops content, that drop is itself an Observation primitive ("context truncated, oldest N tokens dropped at offset X")
- **Extra-ledger context** (system prompts, tool definitions, cross-session memory) MUST be captured as Observation primitives at session offset 0 — **NEW INVARIANT: Bootstrap-Capture-Completeness**
- **Primitive scale:** One L1 row per tool-call boundary. A `str_replace` that changes 50 lines is one Artifact; fifty sequential `edit` calls are fifty Artifacts
- **M3 (side-effect-only tool calls):** Always emit Artifact with synthetic output (e.g., exit code, side-effect descriptor). Keeps row-per-tool-call invariant clean

**Why better than A/B/C/D:**
- Removes agent-intent dependence — commitment is structurally computed from session lineage, not the agent's claim about which observations mattered
- M1 (orphan observations) and M2 (empty observation-set hash) dissolve under structural model
- A2 (hermetic replay) becomes EASIER ("replay prefix → compare hashes")
- A4 (causal slice) becomes STRONGER (data lineage + authorization lineage both available)
- Merkle canonicalization risk eliminated — ledger order is already canonical

**Validation:** Laura APPROVED-WITH-MODIFICATIONS on original Option E, then APPROVED outright on refinement. Verdicts treated as independent gates.

### Q2 — Eureka adapter scope + generic L3 adapter conformance suite

**v1 strategy covers:**
- Generic L3 Generator adapter contract — interface specification + property-based conformance suite that any adapter implementation can be run against
- Covers: `PrescriberOrchestrator` interface compliance, fail-open behavior, hint attribution, registration/discovery, lifecycle hooks
- Same conformance suite applies to Forge-as-L3-prescriber. Make this explicit in §3

**Deferred to v1.5:**
- Eureka-specific adapter implementation. Runs the v1 conformance suite — no new test infra needed
- Any Eureka-specific contract tests

**Why:** Honors Aaron's May-26 storage-fork directive (Crucible storage fork + Eureka standalone v1). Eureka v1 API isn't frozen; testing against moving target produces brittle contract tests. Crucible ships sooner. Future-compatible.

### Q3 — Aperture async notification for structural proposals

**v1 behavior:**
- Structural proposals (from `StructuralProposalGenerator`) surface as Aperture attention-tier notifications, queued for async user review
- **Default not auto-applied.** Aperture is the notification surface; explicit ack mutates the ledger to apply
- Approve via `crucible aperture act <id>` (or equivalent CLI affordance)
- Router refuses to act on dependent paths until structural change is acked

**Why not blocking modal:** Contradicts agentic UX premise; collapses Crucible into "human stops everything for every structural change."

### Q4 — Transitive plugin pinning at fork

**v1 behavior:**
- `SessionMetadata.pluginVersions` includes the **resolved transitive dependency graph**, not just direct deps
- Computed at install time (Gabriel Sprint 6.5 manifest schema already produces this)
- Persisted at fork; replay reads from `SessionMetadata`

**Why not direct-only:** Transitive dep update silently changes behavior; replay drifts. Provably unsafe for determinism-obsessed system.

### Q5 — Bisect execution: env snapshot at start

**v1 behavior:**
- Bisect captures `process.env` + relevant config files at bisect start
- Each bisect iteration shells out to user's shell with the **fixed snapshot env**, not the live env
- Internally consistent (iterations agree on env), not externally hermetic (re-run days later may differ)

**Why D over Laura's A:** Closes mid-bisect-drift failure mode (innocent ledger event blamed for env-drift bug).

### Q6 — Timestamp normalization + monotonicity invariant

**v1 behavior:**
- Conformance suite excludes wall-clock timestamps from byte-equality check (`normalizeTimestamps()` helper sets to 0 before compare)
- Timestamps are informational metadata, not load-bearing for replay — L1 row offsets are the structural ordering
- **NEW SEPARATE PROPERTY TEST:** `monotonicTimestampsWithinSession` asserts every row's timestamp ≥ previous row's. Orthogonal to conformance; catches clock skew, manual tampering, fork-time inheritance bugs

### Q7 — Zero-tolerance mock-drift gate

**v1 behavior:**
- Single contract test failure blocks PRs
- Mock audit is a routine agent spawn (not a sprint that pauses feature work)

**Why (Aaron's framing — captured as principle):**
- In agentic-development cost functions, drift cost = correctness compounding across agent actions (high, opaque); fix cost = near-zero (spawn agent to address)
- The human-team failure modes that make zero-tolerance brittle (context-switch tax, resentment, disabled tests) don't apply: agents don't experience context-switch tax and don't disable tests for expediency
- Late drift detection cost in agentic systems is much higher than in human-team systems because the system makes many decisions per session against the drifted model

### Q8 — Pareto incomparable → both non-dominated

**v1 behavior:**
- When two prescriptions have non-overlapping fitness axes, they are **incomparable**
- Both remain in the non-dominated set
- Router policy handles the larger candidate set (escalate, prompt user, apply tiebreaker — Router's concern, not the fitness comparator's)

**Why not zero-fill (B):** Treats absent-data as best-possible-data. Same epistemic violation as orphan observations from Q1.

### New Invariants Introduced (Integrated into §6 of Strategy Doc)

1. **Bootstrap-Capture-Completeness (Q1):** Extra-ledger context (system prompts, tool definitions, cross-session memory) is captured as Observation primitives at session offset 0. Replay drifts if violated.
2. **Monotonic-Timestamps-Within-Session (Q6):** Every L1 row's timestamp ≥ previous row's. Independent of conformance suite.

### New Contract Tests (Integrated into §5 of Strategy Doc)

1. **Generic L3 Adapter Conformance Suite (Q2):** Property-based contract tests any adapter must pass — `PrescriberOrchestrator` compliance, fail-open, hint attribution, registration/discovery, lifecycle hooks. Runs against Forge in v1, reused for Eureka v1.5+.

### Document Status

`docs/crucible-tdd-strategy.md` updated to **FINAL**:
- All 12 sections revised to reflect 8 locks
- Original 8 question subsections (§11) deleted and replaced with resolution summary
- No newly-discovered ambiguities
- Ready for Sprint 0 test-infrastructure work

---

## Appendix: Q1-Q8 Validation Trail

### Laura Bow Q1 Option E Validation (2026-05-27)

**Source:** `.squad/decisions/inbox/laura-q1-option-e-validation.md`

**Scope:** Independent validation of Aaron's locked Q1 resolution (Option E + tool-call scale)

**Verdict:** APPROVE WITH MODIFICATIONS

Option E is architecturally sound and testable. Introduces three implementation ambiguities:
- **M1:** Clarify Observation primitive lifecycle — are orphan Observations legal?
- **M2:** Define Decision-without-observations semantics — can a Decision commit with empty observation set?
- **M3:** Specify tool-call-boundary granularity for side-effect-only operations — does a tool call with no output still emit Artifact?

Three ambiguities flagged and passed to Aaron for refinement.

**Impact on acceptance scenarios:**
- **A2 (Hermetic Replay):** EASIER — simplified by structural commitment model
- **A3 (Pre-Commit Hook Veto):** NO CHANGE
- **A4 (Backward Causal Slice):** STRONGER — data lineage + authorization lineage available

### Laura Bow Q1 Refinement Validation (2026-05-27)

**Source:** `.squad/decisions/inbox/laura-q1-refinement-validation.md`

**Scope:** Second validation pass on Aaron's structural-commitment refinement (Option E evolved)

**Verdict:** APPROVE

Aaron's structural commitment model dissolves M1, M2, M3 by reframing the commitment primitive entirely:
- Shifted from observation-set commitment to causal-context window commitment
- Acknowledges that LLM doesn't distinguish between Observation primitives, prior Decisions, Artifacts, or Questions — all context is input
- Commitment is over everything visible

**Why better:**
1. **M1 (orphan Observations) disappears** — every Observation is part of some Decision's commitment window
2. **M2 (empty observation-set) disappears** — empty commitment is impossible except at offset-0 (degenerate)
3. **M3 resolved** — Aaron's synthetic_output rule means every tool call produces Artifact

**New invariant introduced:** Bootstrap-Capture-Completeness (extra-ledger context captured at offset 0).

**Test strategy impact:** POSITIVE — fixtures simpler, A2 precision improved, bootstrap-capture becomes single property test.

### Laura Bow Crucible TDD Strategy Revision (2026-05-27)

**Source:** `.squad/decisions/inbox/laura-crucible-tdd-strategy-revision.md`

**Status:** COMPLETE — Strategy doc finalized with all 8 open questions resolved

**Scope:** Revise `docs/crucible-tdd-strategy.md` to reflect every resolution. Laura integrated all 8 Q-locks across 12 sections.

**Section-by-section changes:**
- §1: Added agentic-development test discipline distinctions (structural commitment, zero-tolerance gate)
- §2: A2/A4/A6 updated per Q1/Q4
- §3: Renamed `ObservationCaptureStore` → `LedgerWindowReader`; added `GenericL3AdapterContract` (Q2); refined `BisectOrchestrator` (Q5)
- §4: Session Fork walkthrough updated with transitive-dep-graph test (Q4)
- §5: Added generic L3 adapter conformance (Q2); updated to zero-tolerance CI policy (Q7)
- §6: Context-window commitment per Q1; added two new invariants (Q1, Q6)
- §7: Zero-tolerance rationale + agentic-cost framing (Q7)
- §8-10: No changes
- §9: Added three fixture builders: `LedgerPrefixBuilder` (Q1), `TransitiveDepGraphBuilder` (Q4), `EnvSnapshotBuilder` (Q5)
- §11: All 8 question subsections deleted; resolution summary table added
- §12: No changes

**Document footer:** Updated from "DRAFT Complete" to "FINAL — 8 Open Questions Resolved 2026-05-27"

**Newly-discovered ambiguities:** None. All cascading dependencies cleanly resolved.

**Key architectural insights:**
1. **Structural-commitment model** (Q1): Merkle hash over causal-context window removes agent-intent dependence
2. **Agentic-cost-function principle** (Q7): Zero-tolerance gate justified by inverted cost functions (drift cost high/opaque, fix cost near-zero)
3. **Generic-adapter-conformance pattern** (Q2): Single property suite reused for Forge (v1), Eureka (v1.5+), marketplace plugins

---

## Crucible TDD Locks — Cross-Agent Impact Notes (2026-05-27)

Observations posted to affected agent histories:

### Roger — L1 WAL schema implications (Q1)

Observation: Decision's commitment is Merkle hash over causal-context window. Implications for Roger:
- Observation as first-class primitive type (not envelope metadata)
- Decision rows carry context-window Merkle commitment
- Primitive scale = per-tool-call boundary (governs row granularity in WAL schema)

### Alexander — bootstrap-capture invariant (Q1)

Observation: Extra-ledger context (system prompts, tool defs, cross-session memory) MUST be captured as Observation primitives at session offset 0.
- Impacts runtime execution model (what counts as "session bootstrap")
- Replay drifts if bootstrap observations missing
- New test invariant: `Bootstrap-Capture-Completeness`

### Rosella — generic L3 adapter conformance (Q2)

Observation: Generic L3 Generator adapter conformance suite is now v1 test deliverable.
- Property-based contract tests any adapter must pass (interface compliance, fail-open, hint attribution, lifecycle hooks)
- Forge adapter validation in v1 CI; Eureka-specific adapter deferred to v1.5
- No new test infra per adapter

### Valanice — Aperture approval surface (Q3)

Observation: Aperture is the locked surface for structural-proposal approval.
- Q3 = B (Aperture async notification + queue, default-not-applied until acked)
- Router refuses to act on dependent paths until structural change is acked
- No blocking modal; async user review model locked

### Gabriel — execution model & CI policy (Q5, Q7)

Observations:
- **Q5 (env snapshot at bisect start):** Locked execution model for bisect; closes mid-bisect-drift failure mode
- **Q7 (zero-tolerance mock-drift gate):** Locked CI policy; single contract test failure blocks all PRs (agentic cost functions justify this vs human-team systems)
- **Q4 (transitive-dep-graph pinning at fork):** Locked requirement (already part of Sprint 6.5 manifest schema)

### Graham — informational (TDD strategy locks may inform CTD section)

Observation: Laura's TDD strategy locks may inform Graham's CTD (Crucible Technical Design) section content.
- Firewall between docs still applies (Graham doesn't read Laura's strategy)
- Cross-team locks like Aperture (Q3), zero-tolerance (Q7), and coexistence (Eureka v1.5 defer) already in decisions.md
- Laura's architectural insights (structural commitment Q1, agentic-cost framing Q7, generic-adapter pattern Q2) may surface as principles in CTD

---

## Crucible CTD Rev. 3 — R2 Resolutions (2026-05-28)

**Date:** 2026-05-28  
**Decided by:** Aaron Kubly (interactive Decision-Point gate via coordinator)  
**Source:** `docs/crucible-technical-design-plan.md` rev. 2 §"New Open Questions Surfaced by TDD Reconciliation"  
**Status:** ALL 6 LOCKED — Graham bake-in revision COMPLETE; Phase 2 fan-out UNBLOCKED

### Lock Summary

| OQ | Topic | Resolution | Departure from Graham's default? |
|---|---|---|---|
| R2-1 | Context-window bound on Decision Merkle commitment | **B-with-A-fallback + `commitmentMethod: 'declared' \| 'fallback'` tag on Decision row** | Concur with Graham; coordinator added the tag |
| R2-2 | BootstrapPayload schema scope | **(iii) Literal payload (what L0 injected as text) + named-source manifest of queryable memory sources** | Concur with Graham |
| R2-3 | Structural-proposal queue persistence on restart | **(c) Re-derive queue from L1 ledger on every Aperture boot — projection is pure, queue is a view** | Concur with Graham |
| R2-4 | Env-snapshot hash stamp on bisect output | **Yes — per-row stamp on every result row** | Concur with Graham |
| R2-5 | Pareto incomparable UI surface | **Yes — `[incomparable-axes]` badge in UI + `nonDominatedReason: 'optimal' \| 'incomparable'` field in data model** | Concur with Graham; coordinator added the data-model field |
| R2-6 | Transitive dep resolution timing | **(A) Resolved-at-install / snapshotted-at-fork / loaded-at-session-start from snapshot** | Concur with Graham |

### R2-1 — Decision Merkle commitment window

**Lock:**
- Primary: L0 declares an explicit `causalContextWindow` slice per Decision listing which prior ledger row IDs the LLM had in context.
- Fallback: if L0 doesn't declare, L1 uses the full ledger prefix up to (excluding) the Decision row's offset.
- Decision row metadata includes `commitmentMethod: 'declared' | 'fallback'` so investigation can trace which path was taken.

**Why hybrid:**
- Pure A (full prefix) lies once LLM has pruned older content from its attended context.
- Pure B (declared only) strands L0 providers that don't surface attention metadata (today: most, including Copilot SDK first cut).
- Hybrid: B is honest when available; A is graceful degradation; tag preserves traceability.

**Edge case:** If L0 declares a window that includes rows OUTSIDE the ledger prefix, that's a Bootstrap-Capture-Completeness invariant violation (Q1) — caught by Laura's bootstrap test, not silently absorbed by the commitment hash. Failure routes to the right test.

**CTD impact:** §2 (L0/L1 Boundary) — `causalContextWindow` optional field on L0's Decision-emission contract. §3 (L1 WAL) — `commitmentMethod` tag on Decision rows. §11 (Replay) — replay protocol reads the tag and reconstructs the window accordingly.

### R2-2 — BootstrapPayload schema scope

**Lock — `BootstrapPayload` v1 shape:**
- `literalContext`:
  - `systemPrompt: string` — verbatim system prompt text
  - `toolDefinitions: ToolDefinition[]` — tool schemas/descriptions as injected
  - `injectedMemoryFragments: Array<{ sourceManifestId, content }>` — verbatim memory text the L0 provider chose to inject at bootstrap
- `memoryManifest: Array<{ id, kind, versionHash, accessSurface }>` — named memory sources queryable later (NOT injected at bootstrap)

**Boundary rule:** Capture what L0 *literally hands across* as bootstrap context. Memory sources the agent queries later via tool calls become normal Observation primitives at query time — not bootstrap concerns.

**Why not full-verbatim-dump:** Multi-MB offset-0 rows would bloat every session start.
**Why not pointers-only:** Silent replay drift when memory source content shifts.

**CTD impact:** §2 (L0/L1 Boundary) — codifies the `BootstrapPayload` shape. §10 (Session Model) — bootstrap sequencing materializes offset-0 Observations from this payload. Roger + Alexander finalize field names in their CTD sections.

### R2-3 — Structural-proposal queue persistence

**Lock:** Queue is a **pure projection over L1 events**. On Aperture boot, the queue is recomputed by scanning L1 for structural-proposal-state events (emitted, acked, rejected, expired) and presenting all with latest_state = `pending`. No separate persistent queue state.

**Why:**
- Honors L1/L2 separation (L1 = truth, L2 = view).
- No dedup gymnastics — re-emission is unnecessary because the projection is recomputed.
- Cheap — structural proposals are bounded; linear scan at boot is free.
- Forward-compatible: an "expired" L1 event from a future policy worker is just another input to the projection.

**CTD impact:** §9 (Aperture) — `StructuralApprovalQueue` is a `SELECT` over the L2 `aperture_events` projection; no write-stateful storage. §5 (Router) — pause-resume handshake reads queue state from the projection.

### R2-4 — Bisect output env-snapshot stamping

**Lock:** Every bisect result row in the report includes the env-snapshot hash (16-char abbreviation acceptable).

**Why:**
- Bisect output is long-lived (CI artifacts, PR comments, issue paste-ins) and outlives the bisect run.
- Per-row stamping preserves context when rows are sliced/grep'd/copied in isolation.
- Cost: one column, trivial.
- Honors Q5's "internally consistent, not externally hermetic" framing in user-visible surface.

**CTD impact:** §13 (Crucible CLI Shell) or §16 (Test Strategy) Tooling subsection — bisect output schema includes `envSnapshotHash` column.

### R2-5 — Pareto incomparable UI surface

**Lock — both UI and data model:**
- **Data model:** `PrescriptionResult.nonDominatedReason: 'optimal' | 'incomparable'`. Optionally `incomparableWith: string[]` listing other prescription IDs the comparison was incomparable against.
- **UI:** Leaderboard surfaces an `[incomparable-axes]` badge on prescriptions with `nonDominatedReason === 'incomparable'`.

**Why both surfaces:**
- UI alone leaves CLI/JSON consumers blind.
- Data-model field alone leaves users reading the UI unable to distinguish.
- Both = honest at both surfaces.

**Why distinguish at all:** Q8 locked "both remain non-dominated" but Q8 didn't say "treat them as equivalent." A future tool picking "the best prescription" needs to know whether "best" was actually *proved* (optimal) or *unchallenged* (incomparable).

**CTD impact:** §7 (L3 Generators) or §8 (Applier + DecisionGate) — `PrescriptionResult` schema. §9 (Aperture) — leaderboard rendering. §13 (CLI) — JSON output schema. Rosella + Valanice finalize field/affordance names in their CTD sections.

---

## Crucible CTD Phase 2 Close-out + Consultant Advisories (2026-05-28)

### Phase 2 — Roger (§10 + §15 + Phase 1 Errata)

**Scope:** Session model schema, branching protocol, coexistence boundary, shared types evolution, Phase 1 findings 2a/2b/12b/5.

**Deliverables:**
- §10 Session Model & Branching — `sessions` table schema, bootstrap protocol, fork protocol, multi-path comparison
- §15 Coexistence & Shared Types — two-product boundary, `@akubly/types` evolution table, monorepo layout, coexistence lock, R2-6 algorithm side
- Phase 1 errata applied:
  - Finding 2a: Split `Timestamp` (ms) from `TimestampNs` (ns); added type-level unit signals in §6
  - Finding 2b: Added `manifestRoot: boolean` flag to §3.3 WalRow
  - Finding 12b: Added full AppendProtocol.appendFenced specification to §3.4.1
  - Finding 5: Patched §7 `dependentPaths` from `string[]` to `EventId[]` (content-addressed); coordinated with Rosella (CONCURRED)

**Cross-Section Sync (R2-6 — Roger ↔ Rosella):** PluginVersionLock format agreed (flat dictionary, lockId footer via Blake3 over CBOR-canonical). Ownership boundary: Rosella owns install-phase algorithm; Roger owns lockfile format + fork-phase verbatim-copy rule + session-start pure-load contract.

**Status:** FINAL. All acceptance criteria satisfied. No new ambiguity surfaced.

### Phase 2 — Valanice (§9 + §13 + Phase 1 Errata 6b)

**Scope:** Aperture projection surface, CLI shell vocabulary, Router ack/reject/expire sub-kinds alignment.

**Deliverables:**
- §9 Aperture — pure L2 projection end-to-end; ApertureEvent view-shape; StructuralApprovalQueue as CREATE VIEW; notification policy (four levels, structural locked to attention); bisect output with env-snapshot header+footer; leaderboard via `PrescriptionResult.nonDominatedReason`
- §13 Crucible CLI Shell — thin REPL over `@akubly/crucible-runtime`; vocabulary covering session lifecycle, aperture verbs (watch/show/approve/reject/defer/why/bisect), data-tier decide verbs, saved queries; three render tiers (headline → body → slice)
- Phase 1 errata 6b: Surgical §5.3 patch — replaced external_input reference with dedicated `structural_proposal_{acked,rejected,expired}` sub-kind family; Router subscribes by (primitiveKind, subKind)

**Cross-Section Sync (R2-3 — Gabriel ↔ Valanice):** Aperture writes `_acked|_rejected|_expired` Observations; Router resumes via `outcome: 'resume' | 'reject'`. Payload shape preserved; subscription contract aligned.

**Consultant Pull-In:** Sonny (debugger specialist) flagged for §9.8 (investigation tools) + §13.6 (JSON schemas) review. Both sections FINAL on disk; advisory non-blocking.

**Status:** FINAL. Finding 6b closed. R2-3 CLOSED.

### Phase 2 — Graham (§14 + Finding 10 Fix)

**Scope:** Eureka integration contract, L4 layer disambiguation.

**Deliverables:**
- §14 Eureka Integration Surface — narrow contract (SHARED: SessionId, DecisionRecord via @akubly/types; PRIVATE: everything else). One v1.5-deliverable adapter (`@akubly/crucible-eureka-adapter`) must pass §7.A Generic L3 Adapter Conformance (C-1…C-8) unchanged. Eureka ↔ Cairn bridges remain Eureka's concern.
- Finding 10 fix (applied to §1): §1.2 layer table split from single L4 row to two co-tier rows — "L4 — Router (decision sub-tier)" and "L4 — Applier (enforcement sub-tier)". Added prose note after table clarifying sub-tier framing and cross-referencing §5/§8.

**Rationale (Finding 10):** §8 self-labels as L4 correctly. Sub-tier framing in §1.2 is cheaper and more honest than relabeling §8. Matches package decomposition already present in §1.4.

**Status:** FINAL. Both deliverables stand on locked decisions. No Aaron triage required.

### Phase 2 — Laura (§16 Test Strategy & Invariants)

**Scope:** CTD-side reference to authoritative TDD strategy; cross-collaborator alignment.

**Deliverables:**
- §16 Test Strategy & Invariants — declarative CTD reference (does not re-litigate or duplicate TDD content). Net-new:
  - Test-category matrix mapping categories to runners + CI stages
  - Collaborator → CTD-section alignment matrix (all 17 roles from TDD §3.1–§3.7 present)
  - One-week productivity-loop bar test
  - Tooling subsection (bisect Q5/R2-4, replay CLI §11, why/predicate debug surface)
  - Generic L3 Adapter Conformance execution spec + new-adapter opt-in flow
  - Agentic-cost framing for zero-tolerance mock-drift gate (Q7) as design constraint

**Collaborator Completeness:** All 17 roles mapped; two defer section details (QueryExecutor → L2 Derived Queries, CausalSliceEngine → L5 Investigation). Phase 3 synthesis will re-verify bindings.

**Status:** FINAL. 3-page budget honored. Cross-ref density locked. No open questions.

### Phase 2 Synthesis Review — Graham

**Scope:** Interface-coherence synthesis across 17 new + 5 modified CTD sections; erratum-verification pass.

**Verdict:** **GREEN.** Phase 3 (§17 Observability, §18 Security, §19 ADR Set) unblocked.

**Verification Summary:**
- 10 coherence checks (Appendix C "Phase 2 Synthesis") all CLEAN
- 7 Phase 1 errata verified at landing (2a, 2b, 5, 6b, 10, 12a, 12b) — all CLOSED
- Both Phase 2 sync pairs CLOSED (R2-3 Gabriel↔Valanice, R2-6 Rosella↔Roger)
- Vocabulary consistency verified across Phase 2 surface
- Phase 3 readiness confirmed: all §17/§18/§19 inputs pre-authored

**Ownership:** No fixes routed forward. Two non-blocking advisory items (Sonny consult, L2/L5 future-work stubs) routed informationally to coordinator.

**New Document:** `docs/crucible-technical-design/00-phase2-synthesis-review.md` (~13 KB, 10 coherence checks + erratum-verification pass).

**Status:** GREEN for Phase 3 entry.

### Advisory Reviews (Sonny + Erasmus)

#### Sonny — CTD Phase 2 Debugger-UX Advisory (§9 + §13)

**Authority:** ADVISORY ONLY. No decisions locked; Valanice + Aaron decide incorporation timeline.

**Verdict:** **SOLID.** Time-travel-debugging surface credible for structural proposal + bisect + causal-slice happy paths. Bisect rendering with env-snapshot header+footer is best-in-class (better than `git bisect`).

**Key Findings:**

1. **§9.8 — Investigation tools (breakpoint/watchpoint/logpoint registry)**
   - Strong: Read-only registry keeps pure-projection invariant; three-kind split matches DAP terminology; hitCount derived from row stream is correct approach
   - Gap: No explicit predicate-shape spec. Prior art converges on sandboxed expressions over primitive envelope + payload, O(µs) evaluation. Recommend §4 or §9.8 cross-ref before Phase 3.
   - Missing: Explicit behavior-level distinction between kinds (breakpoint=pause, watchpoint=change detection, logpoint=observe+template)
   - Low-priority: No hit-count conditional (`ignoreCount`, `condition: 'hitCount % 10 == 0'`); no tracepoints with bounded collection

2. **§13.1 — CLI vocabulary**
   - Gap: Missing standard debugger navigation triad (`step`, `continue`, `print`)
   - Gap: Missing high-leverage predicates (conditional, data, logpoint distinctions)
   - Current: One-hop `why` with default; needs explicit spec on which edge types traversed (causalReadSet.primitiveIds vs parentId vs causalParentId)

3. **DAP-shim viability:** MAYBE→YES. §13.6 JSON schemas already close; two small tweaks needed.

**Advisory Items (Non-Blocking):**
- Verb collision: watch vs tail — needs triage
- 16 user stories identified: US-S-10..25 (predicate spec elaboration, standard nav triad, conditional distinctions, tracepoints)
- Predicate-shape elaboration recommended before Phase 3

**Prior Art References:** rr/Pernosco omniscient query model, Chrome DevTools Logpoint (2019), LLDB/GDB conventions, OpenTelemetry causal traces.

#### Erasmus — CTD Phase 2 Architectural Review (§1 + §6 + prior art lens)

**Authority:** ADVISORY ONLY. Read-only on CTD. Decision authority with Aaron/Graham. No blocking decisions.

**Verdict:** **SOLID** (with two NEEDS-WORK areas).

Crucible closer to rr/Pernosco-for-agents than LangGraph/AutoGen-for-agents. L1 WAL as central bet is correct and rare. Content-addressing via BLAKE3+CBOR is right call. L0 isolation as hermetic boundary is unusually disciplined.

**Two NEEDS-WORK Areas:**

1. **L0/L1 boundary implicitly Copilot-SDK-shaped.** §2 prohibits SDK-native types crossing seam, but primitive vocabulary (§6) curated around what Copilot SDK emits. Multi-provider future architecturally permitted but not anticipated. (Focus 5)

2. **5-primitive taxonomy missing two kinds prior art needs.** Especially critical for scheduling, retry, recovery of sub-agents. (Focus 4)

Neither is v1 blocker. Mitigations in prior-art grounding below.

**Per-Focus Findings:**

**Focus 1 — 5-layer stack (L0→L4+Aperture):**
- Strong: L0 isolation as hermetic boundary correct and rare (Aider/OpenHands/AutoGen all leak types)
- Strong: L2 Derived Query as pure projection layer genuinely novel for agentic harnesses (LangGraph checkpoints ≠ incremental projections)
- Strong: L4 Router/Applier split with independently-testable contracts correct (Temporal Workflow/Activity separation survives mature load *because of it*)
- At risk: L3 as single contract spanning Curator/Alchemist/Forge-as-adapter doing too much work (known failure mode: Eclipse plugins, vscode contributes, Emacs hooks). Contract starts simple, ends complex (lifecycle, cancellation, partial-progress, trust-tier ack channel). Prior art warning: easy v1 contract = unbreakable v3 contract
- Slightly fudged: Aperture L5-adjacent placement reads like deference to brand. If truly never writes and is pure projection, rename to "Projection Plane" or "Investigation Plane" (not "L5-adjacent")
- Missing: No explicit Scheduler/Executor tier between L3 (proposal generation) and L4 (decision). When generators async+expensive+parallel, "which runs now, on what budget" is load-bearing. Bazel/Buck/Salsa separate "what to compute" from "when/where to compute it". **Proposed: US-E-13.**

**Focus 2 — L1 WAL as central design bet:**
- Strong: "Ledger as source of truth, projections as cache" doctrine correct and rare in agentic domain (event-sourcing works: EventStore, Axon, Kafka, Datomic)
- Strong: Content-addressing via BLAKE3+CBOR correct (Git/IPFS/Nix prior art; CBOR-canonical right over JSON)
- Recommended: Pin CBOR canonical spec by version (RFC 8949 §4.2 has ambiguous floating-point corners)
- Custom WAL over SQLite-as-WAL correct for v1 (group commit, monotonic-floor, format pinning; SQLite WAL = application WAL inside SQLite WAL)
- At risk: WAL schema evolution hardest problem in event sourcing. §6.5 covers additive-only + explicit adapter at major bumps (good, insufficient). Derived-projection schema evolution the real nightmare (Greg Young decade of discussion; LinkedIn Samza/Kafka Streams war stories). Crucible's deterministic-replay property *should* make tractable but only if L2 projections versioned + replay budgets tracked. **Suggest US-E-15.**

**Focus 3 — Coexistence with Cairn/Forge:**
- Correct: Two-product fork (share identifiers, fork storage/write pattern/plugin/CLI/migration)

**Focus 5 — SDK-shaping risk:**
- Implicit: Vocabulary curated around Copilot SDK today (no multi-provider acknowledgment in §1 or §6)
- Mitigation: Suggest §6.1 multi-provider future note + §2 SDK-boundary restatement in context

**Focus 6 — "Crucible replaces Copilot CLI" framing:**
- Highest-stakes call in doc; least prior-art-backed vs other architectural bets
- Honest paragraph needed: how Aaron will actually daily-drive this vs mental model of CLI as invocation wrapper

**Advisory Items (Non-Blocking):**
- **US-E-13 — Generator Scheduler tier.** Explicit policy for when/how-many generators run (eager/on-demand/debounced/budgeted), separated from generator contract. Mitigates L3-as-junk-drawer risk.
- **US-E-14 — Rename "Aperture L5-adjacent" to numbered or non-mystical name** (Projection Plane / Investigation Plane). Vocabulary hygiene, zero implementation cost.
- **US-E-15 — WAL schema evolution and L2 projection versioning.** Operational nightmare mitigation for derived-projection schema changes over time.
- **US-E-5 — Multi-provider future framing in §1/§2/§6.** Acknowledge Copilot SDK as v1 substrate; document multi-provider extensibility assumptions.

**Prior Art References:** rr/Pernosco (event-sourced time travel), Temporal (Workflow/Activity separation), LangGraph (checkpointing vs event sourcing), Bazel/Buck/Salsa (scheduler/executor tiers), EventStore/Axon/Datomic (event sourcing), Honeycomb/Datadog/Jaeger (observability planes), LSP (wire/internal split), Roslyn (SyntaxNode/SyntaxToken discipline), GHC API (Hsc/Tc layer separation).

### R2-6 — Transitive dep resolution timing

**Lock — three-phase separation:**
- **Install** (`crucible plugin install foo`): Plugin Registry computes full transitive dep graph; writes lockfile. Owner: `@akubly/crucible-plugin-registry` (Rosella).
- **Fork**: Lockfile contents copied verbatim into child session's `SessionMetadata.pluginVersions`. Owner: L1 WAL fork semantics (Roger).
- **Session start**: Runtime reads `SessionMetadata.pluginVersions` and loads exactly those versions. No resolution; pure load.

**Why:**
- Only timing that satisfies "pinned at fork" without making fork slow or replay brittle.
- Clean separation of concerns: install resolves (expensive, infrequent), fork copies (cheap, frequent), session-start loads (deterministic, frequent).
- Replay determinism preserved — registry content drift after fork is invisible to that session.
- Aligns Rosella ↔ Roger sync pair Graham already flagged.

**Forward-compat note:** Mid-session installs (user installs a new plugin mid-session) are a v1.5+ story with their own ceremony (a new ledger event, a re-pin). NOT part of bootstrap timing. The install/fork/load triad doesn't preclude this; it just doesn't try to handle it as a bootstrap concern.

**CTD impact:** §10 (Session Model) — `SessionMetadata.pluginVersions` field; fork semantics. §15 (Migration Plan) — install-time resolution algorithm package boundary. Rosella ↔ Roger cross-section sync pair handles the boundary during Phase 2 authoring.

### Cross-Section Sync Pairs (Coordination During Authoring, Not Pre-Decisions)

Graham flagged these in his rev. 2; they are NOT decisions but ongoing coordination touchpoints during Phase 2 authoring:

1. **Gabriel ↔ Valanice** — Aperture queue ↔ Router pause-resume handshake (Q3 mechanics). Concretely: Aperture exposes ack/reject verbs that emit L1 events; Router subscribes to those events and resumes dependent paths. Both must agree on event shape.
2. **Rosella ↔ Roger** — Plugin Registry transitive resolution timing (R2-6) — Rosella owns the install-time lockfile algorithm; Roger owns the snapshot field. Both must agree on lockfile format that copies cleanly into the WAL field.

Coordinator will provide a shared scratchpad during Phase 2 for these pairs, or co-locate them in the same fan-out wave so handshake details can converge.

### CTD Plan Rev. 3 Bake-In (2026-05-28)

**Author:** Graham (Lead / Architect)  
**Status:** COMPLETE  
**Target:** `docs/crucible-technical-design-plan.md` rev. 3 (103KB → 108KB)

Surgical bake-in pass over rev. 2 of the CTD plan. The former "New Open Questions Surfaced by TDD Reconciliation" section is now **"Resolved R2 Decisions (locked 2026-05-28)"** — a six-row lock summary table matching the coordinator drop's shape. Section detail text across §2, §3, §5, §7, §8, §9, §10, §11, §13, §15, §16, §17 is now declarative — every "if Aaron accepts the defaults," "pending OQ-R2-X resolution," and "Recommend (b) with..." hedge replaced with the locked answer in present-tense form. The two coordinator-added expansions are woven into the affected section specs: `commitmentMethod: 'declared' | 'fallback'` appears on the Decision row metadata contract (§2 emission, §3 WAL, §11 replay reconstruction), and `nonDominatedReason: 'optimal' | 'incomparable'` appears on the `PrescriptionResult` schema (§7 generator emission, §8 Applier propagation, §9 UI badge, §13 CLI JSON, §15 shared-types enumeration). Risk 6 flipped to RESOLVED. Header bumped to rev. 3. Spawn manifest acceptance criteria refreshed across §2, §3, §5, §7, §8, §9, §10, §11, §13, §15 to reference R2 locks declaratively (no structural changes to ownership, wave structure, or section count). Two cross-section sync pairs (Gabriel ↔ Valanice on R2-3 queue mechanics; Rosella ↔ Roger on R2-6 lockfile format) are explicit coordination touchpoints during Phase 2 authoring, called out in both the locks section and the affected manifest entries.

**No new open questions emerged** — This was a pure bake-in pass. Reading every locked section detail back through the section-spec lens did not surface any new R3 questions. The R2 locks were internally consistent and the two coordinator expansions slotted into existing seams (Decision row metadata, `PrescriptionResult` schema) without surfacing new design choices. Section authors writing in Phase 2 have everything they need to proceed without further Aaron-triage rounds.

**Phase 2 fan-out is unblocked.**

---

## Crucible CTD Phase 0 + Phase 1 + Synthesis Close-out (2026-05-28)

### Graham — CTD Phase 0 Foundation: §2 + §6 FINAL

**Date:** 2026-05-28  
**Author:** Graham Knight (Lead / Architect)  
**Status:** FINAL — Phase 1 fan-out unblocked

Phase 0 foundation sections delivered. §2 (L0/L1 Boundary Contract, 12KB) defines Layer 0 primitives and Layer 1 API surface. §6 (Primitive Taxonomy, 8.5KB) specifies observation type taxonomy with structural proposal sub-kinds. Both sections meet acceptance criteria and support Phase 1 downstream consumption. Amended §6 post-synthesis for `structural_proposal_*` sub-kinds per synthesis finding 12a.

**Key Design Decisions Locked:**
- Observation immutability at L0 boundary
- ChangeVector as structural type
- Structural proposal sub-kinds enumeration

**Integration Points:** L1 (Roger), L2/L3 (Rosella, Gabriel), L4 (Alexander) — all consume §2 L0 primitives and §6 taxonomy.

---

### Roger — CTD Phase 1 Lane 1: §3 (L1 WAL Substrate) + §4 (Hook Bus)

**Date:** 2026-05-28  
**Author:** Roger Wilco (Platform Dev, L1/Ledger owner)  
**Status:** FINAL — Both sections delivered to `docs/crucible-technical-design/`

**§3 — L1 WAL Substrate (FINAL, 33.6 KB):** Per-session segmented append-only WAL under `~/.crucible/wal/sessions/<id>/`, CBOR-canonical row envelopes with BLAKE3 hash-chaining, CAS-spilled bodies, single `fdatasync` per group-commit. Decision rows carry `contextWindowCommitment` + `commitmentMethod: 'declared' | 'fallback'` (R2-1 LOCK). Bootstrap-batch is atomic at offset 0. Performance envelope (≤1 ms p99 append) and storage volume projections (≈1–2 MiB WAL + 4–20 MiB CAS per 200-turn session) specified.

**§4 — Hook Bus (FINAL, 12.9 KB):** `{continue, observe, pause}` semantics against in-flight group commit. Predicates pre-registered and indexed by `primitiveKind` + optional `subKind`. Witness body shape enables replay reconstruction. Backpressure: unbounded `pause` queue, bounded droppable `observe`.

**Phase 2 Ripple Effects:**
- Per-session directory layout (`~/.crucible/wal/sessions/<id>/`)
- Cross-session hash-chain rule for fork child offsets
- `SESSION_GENESIS_HASH` constant for root-session bootstrap
- `monotonic_violation` row routing to Aperture
- Predicate registration as Observation rows
- CAS GC scope (post-snapshot dead bodies only)
- Subscriber back-of-the-bus lifecycle (§10 session-close protocol)

**No new ambiguity surfaced.**

---

### Rosella — CTD Phase 1 Lane 2: §7 (Generators L3)

**Date:** 2026-05-28  
**Author:** Rosella Dove (Plugin Dev)  
**Status:** FINAL — §7 on disk at `docs/crucible-technical-design/07-generators-l3.md`

§7 locks the `ProposalGenerator` 10-field shape (8-field Phase A core + R3 amendments `determinismClass` and `causalReadSet`). Splits into `DataProposalGenerator` / `StructuralProposalGenerator` with mandatory `dependentPaths[]` on structural variant (Q3). Defines §7.A Generic L3 Adapter Conformance Contract (8 property classes C-1…C-8). Charters Curator as detection+proposal-only. Locks trust-tier table to Round 2.3 `{builtin | adopted | community | external}` enum. Specifies no-zero-fill Pareto emission rule (Q8). Defines `PrescriptionResult.nonDominatedReason` and optional `incomparableWith` per R2-5.

**`nonDominatedReason` Field — Locked Shape for Valanice §9:**
```ts
nonDominatedReason: 'optimal' | 'incomparable'
incomparableWith?: string[]  // OPTIONAL
```
- **'optimal'** — dominates every comparable sibling on shared-axis intersection
- **'incomparable'** — non-dominated only because no sibling shares axis set
- **Set by:** `ParetoFitnessEvaluator` at evaluation time
- **Propagated by:** Applier (§8) onto `DecisionPayload.nonDominatedReason`
- **Consumed by:** Valanice §9 Aperture leaderboard for `[incomparable-axes]` badge

**Phase 2 Hand-Off (Roger §3 + §10):**
1. Manifest pinning at fork (R2-6 lockfile format in session snapshot)
2. `LedgerWindowReader` read-only handle in `AdapterContext`

**No new open question surfaced.**

---

### Alexander — CTD Phase 1 Lane 3: §12 (Copilot SDK Integration) + §8 (Applier + DecisionGate)

**Date:** 2026-05-28  
**Author:** Alexander Chen (SDK Integration Lead)  
**Status:** FINAL — Both sections delivered to `docs/crucible-technical-design/`

**§12 — Copilot SDK Integration (FINAL, 18,914 bytes, ≤3pp):** Specifies `SdkProvider` interface, registry/selection protocol pinned via `BootstrapPayload.sdkVersion`, session bootstrap sequence, Bootstrap-Capture handshake table (R2-2 LOCK). Package boundary separates `@akubly/crucible-runtime` (greenfield) from `@akubly/skillsmith-runtime` (legacy, coexist lock honored).

**CRITICAL FINDING — R2-1: Copilot SDK Attention-Metadata Reality**
- **Reality:** SDK does NOT expose per-emission attention or context-window metadata
- **Decision:** Copilot SDK provider sets `declaresCausalContextWindow: false`
- **v1 Path:** Every Applier-written Decision carries `commitmentMethod: 'fallback'` and `causalContextWindowSlice: null`
- **Forward-compat:** Door open for future providers; no §2/§6/§3/§8 changes required

**§8 — Applier + DecisionGate (FINAL, 17,455 bytes, ≤3pp):** Specifies `Applier` interface, proposed → approved → applying → applied|failed state machine with R2-3 `paused-awaiting-structural-ack` sub-state. Ledger-position fence pseudocode with bounded retry. `contextWindowCommitment` + `commitmentMethod` computation path via `LedgerWindowReader` + `ReadSetHasher`. R2-5 non-dominated tiebreak propagation onto `DecisionPayload.alternatives[]`. DecisionGate pure-policy interface with session-pinned default policy.

**Coherence Self-Review:**
- §8 Applier composition ↔ §12 runtime composition consistent
- §8 state-machine ↔ §5 Router events aligned on R2-3 lock
- §8 ↔ §9 StructuralApprovalQueue projection inputs consistent
- §12 attention metadata ↔ §8 commitment path end-to-end coherent

**No blocking new questions surfaced.**

---

### Laura — CTD Phase 1 Lane 4: §11 (Hermetic Replay)

**Date:** 2026-05-28  
**Author:** Laura Bow (Testing & Integration Specialist)  
**Status:** FINAL — §11 on disk at `docs/crucible-technical-design/11-hermetic-replay.md` (14.9 KB)

§11 specifies hermetic-replay implementation contract: capture scope mapped to §6 Observation sub-kinds, `CasStore` interface with 3–10× WAL volume projection, `ReplayDriver` re-feed loop never re-executing side effects, R2-1 context-window reconstruction protocol, Q6-locked replay-equivalence oracle with structural-vs-informational field table and `normalizeTimestamps()` helper. Five enumerated refuse-to-start conditions (bootstrap mismatch, missing transitive-dep rehydration, schema-version drift, CAS miss, source monotonicity violation). Literal A1–A4 / A9 conformance test pseudocode.

**Cross-Section Dependencies (Phase 2 coordination items):**
1. **Roger (§3):** `Observation.body` envelope for re-feed pairing must reflect §11.2 spec (`{requestHash, responseRef: CasDigest}` for `llm_response` / `tool_output` / `cross_session_memory`)
2. **Alexander (§12):** `BootstrapPayload` → offset-0 row materialization sequence must clarify write order and `memoryManifest` landing in `SessionMetadata` for replay preflight

**No new ambiguity surfaced.**

---

### Gabriel — CTD Phase 1, Lane 5: §5 (Router Design)

**Date:** 2026-05-28  
**Author:** Gabriel Knight (Infrastructure)  
**Output:** `docs/crucible-technical-design/05-router-design.md` (14,083 bytes, ≤3pp)  
**Status:** FINAL

§5 Router Design (L4) specifies versioned policy table indexed by `(primitive_kind, source_tier, predicate, action)` per Round 2.3 trust-tier vocabulary, proposal lifecycle state machine with `paused-awaiting-structural-ack` sub-state implementing R2-3 lock as pure projection, full Pareto non-dominated surface (`prescriptionCandidates[]` tagged with `nonDominatedReason` per R2-5), debugger verdict extension point, and replayability rationale forbidding live policy reload. Collaborator names align with Laura §3.5.

**CRITICAL — Aperture ↔ Router Event Shape Contract (R2-3 sync pair, for Valanice §9):**

**Events Router emits:**
- `router.paused` — hosted in Decision, carries `proposalId`, `dependentPaths`, policy/predicate info, reason, deadline
- `router.decision` — hosted in Decision, carries outcome (`'apply' | 'reject' | 'resume'`), full `prescriptionCandidates[]` with `nonDominatedReason`, `causedBy` (ack Observation EventId)

**Events Aperture emits:**
- `aperture.structural-ack-prompt` — Question with `parentId` pointing at `router.paused`
- `aperture.structural-ack` — Observation (`subKind: 'external_input'`) carrying verdict + user note

**Contract guarantees:**
1. Router emits exactly one `router.paused` per structural proposal
2. Router emits exactly one terminal `router.decision` per `router.paused`
3. Aperture MAY emit at most one terminal `aperture.structural-ack` per `pauseEventId`
4. StructuralApprovalQueue is pure projection of un-acked `router.paused` rows (honors R2-3)
5. Queue recomputed from L1 alone on Aperture boot (no persistent queue state)

**No ambiguity surfaced for Aaron.**

---

### Graham — CTD Phase 1 Lane 6: §1 (Architectural Overview)

**Date:** 2026-05-28  
**Author:** Graham Knight (Lead / Architect)  
**Output:** `docs/crucible-technical-design/01-architectural-overview.md` — FINAL

§1 serves as canonical orientation piece: 5-layer stack diagram (L0 Provider → L1 WAL → L2 Derived Query → L3 Generators → L4 Router, with Aperture as L5-adjacent investigation surface), layer responsibility table keyed to `@akubly/crucible-*` package decomposition, chamber-to-layer map pinning Crucible/Curator/Alchemist/Aperture inside runtime and explicitly marking Cairn and Forge as *independent products outside the Crucible layer taxonomy* (Forge-as-L3 adapter as single sanctioned bridge), T5-consistent coexistence stance restating no-delegation/no-shared-substrate/converge-at-types-only invariants.

**All Appendix C §1 acceptance criteria met.** No new open question surfaced.

---

### Graham — CTD Phase 1 Synthesis Review (Cross-Section Review & Errata Routing)

**Date:** 2026-05-28  
**Author:** Graham Knight (Lead / Architect)  
**Status:** FINAL — Phase 2 gate decision: YELLOW

Ran 12-check interface-coherence synthesis across all 10 Phase 0+1 CTD sections (~190 KB). **Verdict: YELLOW** (6 CLEAN / 4 MINOR / 2 STRUCTURAL / 1 APPLIED). Applied one additive vocabulary fix in §6.3 (four new Observation sub-kinds: `structural_proposal_{emitted,acked,rejected,expired}`). All 13 findings routed to Phase 2 owners; no locked decision re-litigated; no new open question for Aaron.

**Findings Summary:**

| # | Finding | Severity | Owner | Phase 2 Section |
|---|---------|----------|-------|-----------------|
| 6b | §5/§8 ack row sub-kind mismatch (external_input vs structural_proposal_*) | STRUCTURAL | Valanice | §9 |
| 12b | §8 calls `appendFenced()` but §3 unspecified | STRUCTURAL | Roger | §10 |
| 2a | Timestamp shape drift (§6 ms vs §3 ns) | MINOR | Roger | §10 |
| 2b | §3 manifest flag missing from flags enum | MINOR | Roger | §10 |
| 5 | `dependentPaths` type mismatch (string[] vs EventId[]) | MINOR | Gabriel + Rosella | §9/§10 |
| 9 | §11 body shape not pinned in §3 | MINOR | Roger | §10/§15 |
| 10 | §1 layer table vs §8 Applier placement | MINOR | Graham | Phase 3 |

**No blockers for Phase 2 fan-out. All findings addressable within Phase 2 section work.**

---

### Graham — CTD Phase 1 / TDD-Strategy Reconciliation (Prior)

**Date:** 2026-05-27  
**Author:** Graham Knight (Lead / Architect)  
**Status:** RESOLVED — All TDD Q1–Q8 locks baked into CTD plan rev. 3 and Phase 0+1 sections

Pre-fan-out reconciliation of Laura's FINAL TDD strategy against CTD plan. No irreconcilable conflicts. All six new open questions (OQ-R2-1 through OQ-R2-6) resolved by Aaron prior to Phase 0 spawn. Recommended defaults provided for all six (pending Aaron explicit locks). All phase 1 sections authored using locked R2 decisions declaratively, no conditional hedge text.

**R2 Locks Applied Across Sections:**
- **R2-1** (Decision `contextWindowCommitment` + `commitmentMethod`): §2 emission, §3 WAL, §8 Applier, §11 replay reconstruction
- **R2-2** (Bootstrap-Capture handshake): §2 boundary, §3 offset-0 batch, §12 session sequence
- **R2-3** (Paused-awaiting-structural-ack): §5 Router sub-state, §8 Applier state machine, §9 Aperture queue
- **R2-5** (`nonDominatedReason` + `incomparableWith`): §7 generator emission, §8 Applier propagation, §9 UI badge
- **R2-6** (Transitive-dep lockfile format): §7 manifest pinning, §10 snapshot field, §15 shared-types

**No new open questions emerged from Phase 1 authoring.**

---

---

## Crucible CTD Phase 4 — UIS Framing Lock + Final Amendments (2026-05-28)

**Date:** 2026-05-28  
**Decided by:** Aaron Kubly (interactive Decision-Point gate via coordinator)  
**Participants:** 8 team weigh-in agents (parallel independent jury) + 4 Phase 4 amendment authors  
**Status:** COMPLETE — CTD now structurally complete pending Graham's final synthesis review

### Summary

All 8 team members endorsed the UIS framing with 8/8 STRENGTHENS verdicts. Three agents independently flagged missing concepts; rubber-duck delivered precision reframing ("minimal typed trace algebra for replayable, accountable agentic computation," NOT "universal instruction set"). Aaron locked three coupled decisions: (1) adopt rubber-duck's reframing as canonical, (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) proceed to Phase 4 amendments immediately. All 4 amendment drops SHIPPED on schedule. CTD structural inventory now complete; final synthesis review (Graham) in flight.

### Decision 1: UIS Framing Reframed (ADR-0019)

**Aaron's Claim (Original):**
> "The 5 primitives are the universal instruction set of agentic computation."

**Rubber-Duck's Precision Reframing (8/8 STRENGTHENS Endorsed):**
> "Crucible's five primitives are the base replay/audit algebra for accountable agentic computation, with actual 'instructions' defined by sub-kinds, schemas, effects, causal edges, and runtime semantics."

**Rationale:**
- Avoids overreach (not claiming universality across all conceivable agentic computation)
- Stays bounded and defensible (Crucible-class runtimes with determinism-conformance requirements)
- Preserves architectural ambition (structural hardware parallels remain valid; demoted to Mental Models subsection)
- Enables extensibility (semantic fidelity and queryability prioritized over rhetorical universality)

**Sections Updated:**
- §1 identity claim (new lead language)
- §1.6 new subsection "Mental Models (Hardware Scaffolding, Not Load-Bearing)"
- §6 framing intro paragraph + governance principle
- §6.7 new subsection "Mental Models (Hardware Scaffolding)"
- ADR-0019 index row (Graham author)

**Team Consensus:**
- **Laura:** Framing strengthens PBT + hermetic replay for deterministic substrate; doesn't overstate I/O subsystem guarantees. Concern acknowledged: LLM is the memory-mapped peripheral, must be named explicitly.
- **Roger:** WAL already UIS-aligned (closed enum, content-addressed, hash-chained, monotonic timestamps, typed causal-read sets). Variable-size payloads create uniformity gap; Roger's prior work mitigates.
- **Graham:** Five primitives = universal ISA of **Crucible-class runtimes**. Strong bounded claim; hardware analogy not aesthetic (determinism discharge surface). Framing restatement sharpens without weakening.
- **Gabriel:** Framing enables PMU-inspired telemetry (per-primitive emission rate, statistical sampling, performance counters). Operationally cheap inheritance from decades of CPU architecture prior art.
- **Rosella, Alexander, Valanice:** Strengthen identity without breaking extensibility contracts or UX onboarding.
- **Rubber-Duck:** Recommended reframing avoids falsifiability trap; preserves architectural insight while staying humble about scope.

### Decision 2: ADOPT CALL/RET Semantics (§3.3.4, §10.6)

**Missing Concept Identified By:** Laura (testing lens) + Roger (platform lens) + Rubber-Duck (synthesis)

**Lock:**
- TaskStart / TaskEnd sub-kinds enriched with explicit invocation-frame fields:
  - invocationId: InvocationId — session-unique CALL/RET pair identifier (recommend BLAKE3(sessionId || taskId || commitOffset))
  - parentInvocationId: InvocationId | null — lexically-enclosing open frame's invocationId at emission time; null iff top-level
  - eturnTo: EventId (TaskEnd only) — content-addressed BLAKE3 EventId of matching TaskStart; zero-walk RET link for projection + replay
  - callDepth: number (optional on TaskStart) — derivable from chain; recorded for UX single-row read
  - parentInvocationId also on TaskEnd for index locality

**Semantics Pinned:**
- Re-entered taskId (fork-resume, retry) gets fresh invocationId per CALL; taskId is scope label, invocationId is frame identity
- Mis-nesting (returnTo mismatch or top-of-stack invocationId mismatch) → durable monotonic_violation projection alert (row still commits)
- parentInvocationId (lexical-stack parent) is **distinct edge** from envelope.causalParentId (causal-spawn parent, §6.4); both coexist

**Rationale:**
- **Testing:** Unlocks nested-task invariants (Laura's PBT property tests on well-bracketed call stacks)
- **Debugging:** Enables stack reconstruction + bisect targeting (Sonny's debugger use cases)
- **Replay:** Preservation law — re-fed dispatch stream includes invocation structure; callstack divergence is an explicit replay disagreement, not an implicit assumption
- **WAL Discipline:** No new row schema column (additive body fields under §6.5 additive-evolution contract); append-only discipline preserved

**Sections Amended:**
- §3.3.4 new: "CALL/RET sub-kind fields on TaskStart / TaskEnd (LOCK)"
- §3.3.5 new: "Scheduler-emitted Decision rows (substrate-readiness declaration)"
- §10.6 new: "openInvocationStack projection + reconstruction"
- §10.6.1 new: "Call-stack reconstruction algorithm"
- §10.6.2 new: "Sub-task vs sub-session distinction table"

**Author:** Roger Wilco (Platform/WAL)

### Decision 3: ADOPT Scheduler Tier Promotion (L3.5)

**Missing Concept Identified By:** Gabriel (ops lens) + Erasmus (US-E-13 Scheduler advisory) + Rubber-Duck (synthesis)

**Lock:**
- Explicit L3.5 Scheduler tier between L3 (Generators) and L4 (Router)
- **Named responsibilities:** dispatch ordering, fairness scheduling, RAW/WAR/WAW hazard analysis, back-pressure signals, replay-deterministic re-feed contract
- **Dispatch stream:** L3 → L3.5 Scheduler → L4 Router (distinct decision nodes)
- **Scheduler = CPU dispatch unit analog** (OoO execution, fairness, hazard stalls, backpressure)
- **Router = application policy** (accept/reject/pause per policy)

**Scheduler Tier Subsections:**
- §5.A new subsection "L3.5 Scheduler Tier" — responsibility, dispatch sub-kinds, budget policy, back-pressure, Hook Bus interaction, replay determinism, acceptance signals A-Sched-1/2/3
- §5.2 amendment — dispatched_pending precursor state in proposal lifecycle
- §17.1 amendment — four new scheduler event catalog rows: scheduler_dispatched, scheduler_deferred, scheduler_cancelled, scheduler_quanta_exhausted
- §17.1 scheduler perf-counter table (read-path only; zero new primitives; counters = L2 projections over catalog rows)

**Rationale:**
- **Telemetry:** Unlocks per-primitive emission-rate profiling, sampling, tracing, branch-prediction stats, all from existing WAL index (Gabriel's PMU analogy)
- **Testing:** TRAPC (assert-and-trap) primitive — invariant violations (monotonic timestamp, trust-tier monotonicity, replay equivalence) unified under one shape; single bisect target
- **Determinism:** Scheduler-emitted dispatch rows are first-class L1 WAL rows, preserved in replay (dispatch sequence never re-derived, always replayed verbatim)
- **Concurrency:** Explicit ordering + fairness layer between independent proposal generators (enables multi-agent work, fork/merge coordination)

**Scheduler ↔ Router Boundary (One Line):**
> "Scheduler decides WHICH proposal advances and IN WHAT ORDER (L3.5); Router decides WHETHER — apply/reject/pause (L4)."

**Author:** Gabriel (Infrastructure/Router/Observability)

### Phase 4 Amendment Delivery (4/4 SHIPPED)

All four amendments delivered on schedule; depth budgets respected; sections FINAL.

#### Amendment 1: Graham — CTD Framing Amendments (§1, §6, §19)

**Scope:** §1 Architectural Overview, §6 Primitive Taxonomy, §19 ADR Set Index — surgical amendments only

**§1 Amendments:**
- Identity claim reframed in lead language
- §1.1 stack: L3.5 Scheduler inset block added between L3 → L4 with ADR-0024 + §5 cross-refs
- §1.2 responsibility table: new L3.5 Scheduler row (owns dispatch ordering, fairness, hazard analysis; authors no policy, writes no ledger; package @akubly/crucible-scheduler)
- §1.6 new subsection "Mental Models (Hardware Scaffolding, Not Load-Bearing)" — cross-refs ADR-0019, §6.7, ADR-0024

**§6 Amendments:**
- Framing intro paragraph extended to include L3.5; reframed claim adopted verbatim
- New "Framing (locked, ADR-0019)" paragraph explicitly rejects "universal instruction set of agentic computation" as overreach
- New "Governance principle" paragraph names **semantic bucket inflation** as risk; **sub-kind registration with declared schema + effects + causal-edge contract + runtime semantics** as four-axis discipline
- §6.7 new subsection "Mental Models (Hardware Scaffolding)" — canonical Decision↔branch / Observation↔load / Question↔trap / Artifact↔store / Request↔args analogy table; notes "removable without touching algebra" stance; ADR-0024 as the one place hardware analogy motivated structural change

**§19 Amendments:**
- Status line updated from "17 design choices" → "19 rows (Phase 4 amendments)"
- ADR-0019 row added — "Primitives as Minimal Typed Trace Algebra (not Universal ISA)"
- ADR-0024 row added — "Explicit L3.5 Scheduler Tier"
- Closing cross-references updated

**Status:** SHIPPED (depth budgets respected: §1 ≤3pp, §6 ≤1.5pp, §19 ≤2pp)

#### Amendment 2: Roger — CTD WAL Substrate CALL/RET (§3, §10)

**Scope:** §3 L1 WAL Substrate, §10 Session Model/Branching — CALL/RET semantics + Scheduler WAL readiness

**§3 Amendments:**
- §3.3.4 new: CALL/RET sub-kind fields on TaskStart/TaskEnd (invocationId, parentInvocationId, returnTo, callDepth)
- §3.3.5 new: Scheduler-emitted Decision rows (substrate-readiness declaration; scheduler_* sub-kinds as additive Decision payload fields; no new row schema column; L1's published guarantee: substrate accepts Decision row provided §3.3 schema + §3.7 context-window-commitment contract satisfied)

**§10 Amendments:**
- §10.6 new: openInvocationStack projection + reconstruction semantics
- §10.6.1 new: Call-stack reconstruction algorithm
- §10.6.2 new: Sub-task-vs-sub-session distinction table

**Status:** SHIPPED (depth budgets respected: §3 ≤10pp, §10 ≤3pp)

#### Amendment 3: Gabriel — CTD L3.5 Scheduler Tier (§5, §17)

**Scope:** §5 Router, §17 Observability — new L3.5 Scheduler tier, dispatch events, perf counters

**§5 Amendments:**
- §5.A new subsection "L3.5 Scheduler Tier" (~1.3pp; ≤1.5pp ceiling)
- §5.2 amendment: dispatched_pending precursor state in proposal lifecycle state machine

**§17 Amendments:**
- §17.1 amendment: four new catalog rows for scheduler_dispatched / scheduler_deferred / scheduler_cancelled / scheduler_quanta_exhausted with body fields + severities
- §17.1 scheduler perf-counter table (read-path only; counters = L2 projections over catalog rows)

**Status:** SHIPPED (depth budgets respected; L3.5 tier fully specified; Router ↔ Scheduler boundary locked)

#### Amendment 4: Laura — CTD Reproducibility Honesty + Streaming (§11, §16)

**Scope:** §11 Hermetic Replay, §16 Test Strategy/Invariants — honesty discipline + streaming policy

**§11 Amendments:**
- §11.10 new: "Reproducibility Honesty: Trace vs. Behavioral"
  - **LLM IS the I/O subsystem** (first-class architectural statement; rr/Pernosco named as structural analog)
  - **Trace reproducibility** (what Crucible guarantees) — byte-equivalent replay ledger under §11.6 oracle, given captured CAS
  - **Behavioral reproducibility** (what Crucible does NOT guarantee) — enumerated drivers: model weights, sampling stochasticity, decoding-stack differences, tool/policy/prompt changes, external state drift, context construction non-determinism
  - **Replay invariant limitations** — proves audit, blame, causal-slice, bisect, harness debugging; does NOT prove model correctness, safety under perturbation, cross-version compatibility, or I/O subsystem behavior
  - **Mandatory discipline:** never quote passing replay as evidence of agent correctness; never quote A2/A9 as evidence of model behavior; never weaken §11.6 to "tolerate" behavioral drift

**§16 Amendments:**
- §16.5 new: streaming-token capture policy
  - WAL-explosion math justifies bounded triple capture, not per-token rows
  - Triple: Observation{stream_open} → Observation{stream_delta} at checkpoint boundaries (256 tokens OR 500ms) → Observation{stream_close} with finalContentRef matching non-streaming llm_response digest
  - Replay re-feeds captured delta sequence; does NOT regenerate
  - Invariant: concatenated deltas equal non-streaming digest
- §16.7a new: test tier layering (aligned with §6 governance principle for streaming sub-kinds)

**Status:** SHIPPED (depth budgets respected; honesty doctrine locked; streaming policy enables test tier layering)

### Aaron's Decision-Point Gate Outcome (2026-05-28T19-52-00Z)

**Three Coupled Decisions — ALL LOCKED:**

1. **ADOPT rubber-duck's reframing as canonical claim**
   - New §1 identity language
   - Locks: §1 lead, §6 framing intro, ADR-0019

2. **ADOPT BOTH convergent missing concepts**
   - CALL/RET semantics (Laura + Roger + rubber-duck convergence) → §3.3.4, §10.6
   - Scheduler tier promotion (Erasmus US-E-13 + rubber-duck convergence) → §1.1, §5.A, §17.1
   - Locks: Graham §1/§6/§19, Roger §3/§10, Gabriel §5/§17, Laura §11/§16

3. **Phase 4 NOW** (authoring COMPLETE)
   - All 4 amendment drops SHIPPED; CTD structurally complete pending synthesis
   - Merge → git commit → cross-agent context update

### Team Weigh-In Verdicts (8/8 STRENGTHENS)

| Agent | Lens | Verdict | Key Concern / Gap | Output Drop |
|---|---|---|---|---|
| **Laura** | Tester | STRENGTHENS + FUNDAMENTAL CONCERN | LLM-as-I/O scope (named in §11.10); missing CALL/RET (locked); missing VOLATILE (live-read primitive) | laura-uis-weigh-in.md |
| **Roger** | Platform/Substrate | STRENGTHENS + CONCERN | Variable-size payload uniformity; suggests row=fixed-width instruction, payload externalized | roger-uis-weigh-in.md |
| **Alexander** | SDK/Runtime | STRENGTHENS + ADD | Missing provider-meta primitive (launder today via Observation sub-kinds) | alexander-uis-weigh-in.md |
| **Rosella** | Plugin/Extension | STRENGTHENS | Privilege ring model is load-bearing (Decision: Applier-only; Observation: broadly emittable; structural: Aperture-only) | rosella-uis-weigh-in.md |
| **Gabriel** | Infrastructure/Ops | STRENGTHENS + GAP | Missing TRAPC (assert-and-trap on invariant violation; unifies four Observation sub-kinds) | gabriel-uis-weigh-in.md |
| **Valanice** | UX/Human Factors | STRENGTHENS | ISA vocabulary internal-only (contributor docs, not user-facing); keep two doors (ambient @inbox vs debugger why/bisect) | valanice-uis-weigh-in.md |
| **Graham** | Lead/Architect | STRENGTHENS | Five primitives = UIS of **Crucible-class runtimes** (not all agentic computation); three genuinely concern: CALL/RET (locks invocation stack from replay), provider-meta (launder today), TRAPC (unify invariants) | graham-uis-weigh-in.md |
| **Rubber-Duck** | Synthesis/Precision | STRENGTHENS REFRAME | Reframing weakens "universal ISA" → "minimal trace algebra"; preserves ambition without false universality claim | rubber-duck-uis-claim.md |

### CTD Structural Inventory

**Total Files:** 19 sections + 2 synthesis reviews = 21 files (pending Graham's Phase 4 synthesis → 22)

**Modified This Batch:**
- 01-architectural-overview.md — framing, L3.5 identity, Mental Models
- 03-l1-wal-substrate.md — CALL/RET fields, scheduler WAL readiness
- 05-router-design.md — new L3.5 Scheduler tier subsection
- 06-primitive-taxonomy.md — reframed claim, governance principle, Mental Models
- 10-session-branching.md — openInvocationStack, reconstruction, sub-task-vs-sub-session
- 11-hermetic-replay.md — §11.10 reproducibility honesty
- 16-test-strategy-invariants.md — §16.5 streaming policy, §16.7a test tiering
- 17-observability-telemetry.md — scheduler event catalog, perf counters
- 19-adr-set.md — ADR-0019, ADR-0024 index rows

**Total Size:** 376KB + Phase 4 amendments ≈ 395KB

---

### Next Cycle (Out-of-Scope)

1. **Graham's Phase 4 Synthesis Review** (in flight) — final pass + potential §20 synthesis document
2. **Phase 4.5 Kickoff** — Roger, Gabriel, Laura deliver implementation details (batch acceptance criteria, validator hooks, streaming checkpointing)
3. **v1 CTD Release** — lock all sections; archive Phase 0–4 open questions; publish

---

**Status:** Crucible CTD Phase 4 COMPLETE ✓

