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
- **Guidance (updated §3.7 per I1):** L0 providers SHOULD declare `causalContextWindow` when attention metadata is available; MAY omit only if attention metadata is unavailable. Fallback exists for graceful degradation, not as the preferred path.

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

---

## Crucible Design Panel Review — Phase 1–3 Consolidation (2026-05-30)

### 2026-05-29T23:40:38Z: User directive — D1 (tool capture scope)

**By:** Aaron Kubly (via Copilot)

**What:** Crucible captures only `tool_result` (LLM-visible content), not raw `tool_output`. "(a) is really all we need for replay." This resolves the §11.2/§11.3/§12.6 ambiguity Alexander flagged — the L0 capture boundary sits AFTER any SDK truncation/filtering, not before. Pre-filter content is out of scope for v1 replay.

**Why:** Replay fidelity does not require raw pre-filter content; the LLM only acted on the filtered result. Capturing pre-filter material would create a data-controller obligation for content the LLM never saw.

**Implication for §11:** Alexander to update §11.2/§11.3/§12.6 to make `tool_result` (post-filter) explicit; remove `tool_output` (pre-filter) language where ambiguous.

**Status:** RESOLVED. Alexander's doc edits incorporated into Phase 4 work.

---

### 2026-05-29T23:40:38Z: User directive — Tiered recording fidelity (future consideration)

**By:** Aaron Kubly (via Copilot)

**What:** Different Crucible scenarios target different parts of the agentic flow and likely have different recording-fidelity requirements. Possible tiers: (1) capture call only → replay live (introduces tool/env dependency for replay), (2) capture call + result (D1=(a), current direction), (3) capture call + full output (maximum fidelity). Not a v1 commitment — capture for v1.5+ design consideration.

**Why:** Different use cases (audit vs investigation vs reproduction) imply different acceptable fidelity/cost tradeoffs.

**Status:** Future consideration. Do NOT implement in v1. Revisit when post-v1 scenarios are defined.

---

### 2026-05-29T23:42:23Z: E3 resolution — PII/secret handling in WAL

**By:** Aaron Kubly (via Copilot) — after deliberation with Graham/Gabriel/Alexander

**What:** v1 stance on secrets/PII potentially appearing in captured `tool_result` content:

1. **D1=(a) reduces surface** — Crucible captures LLM-visible content only, not raw pre-filter `tool_output`. Everything captured was already round-tripped to the cloud LLM provider.
2. **No redaction subsystem in v1.** Aaron explicitly: "(b) [regex redaction] feels like a tall order, and overkill."
3. **Mitigation toolkit (v1):** `crucible session delete --purge` (the remediation primitive) + retention ceiling per Gabriel's I7 work (soft-warn 500MiB, hard-limit 2GiB / 90-day) + honest §18 documentation of the data-controller posture.
4. **OPEN — v1.5+ question:** Aaron's devil's advocate stands: Crucible-as-storage is a distinct data controller with retention/exposure obligations independent of upstream cloud egress. The v1 stance acknowledges this gap honestly rather than papering over it. Revisit in v1.5+, likely alongside tiered recording fidelity (separate directive).

**Implication for §18:** Gabriel authors a "Known limits — v1" subsection naming the gap explicitly: captured content reflects boundary already crossed to cloud LLM; Crucible adds local-disk retention surface; v1 mitigation is `crucible session delete` + retention ceiling + operator hygiene; redaction at capture/projection is deferred to v1.5+.

**Status:** v1 = ship with (c) posture. v1.5+ = OPEN.

---

### Phase 2–3 Summary: Team Triage & Escalation Resolution

**Participants:** 6 specialist triage agents (Graham, Gabriel, Alexander, Laura, Roger, Rosella) + Aaron

**Consolidated Findings:** 21 findings from 5-persona design panel consolidated and triaged

**Escalations to Aaron:** 4 findings escalated and resolved:
- **E1 (B1 Scheduler):** KEEP in v1 — Laura adds §16.3 row + A13 + ci:components; ADR-0024 added to Phase 1 gate
- **E2 (B2 substrate):** Accept ADR-0002 as-is — Graham writes "Why not SQLite WAL-mode" body section  
- **E3 (I4 secrets):** v1=(c) honest doc + `crucible session delete` + retention ceiling; NO redaction; v1.5+ OPEN
- **E4 (I5 plugin artifacts):** (b) doc honesty caveat in §11.10 + §15.5

**Work Dispatch:** All 21 findings resolved with specific doc edits across 14 files (plan + ADR + 02/03/04/10/11/12/13/15/16/17/18/19). One new ADR authored: ADR-0018 (Pareto-incomparable observability classification, Rosella).

**Status:** All findings addressed. Phase 4 work complete. Ready for Phase 5 implementation sprint.


---

## Pass A Inbox Merge (2026-05-30)

Merged from 22 inbox files capturing triage decisions and escalations from Pass A review cycle.


### alexander-b3-boundary-faithful-coordinate

# B3 Coordination — Boundary-Faithful vs Prompt-Faithful Replay

**Author:** Alexander  
**Date:** 2026-05-29  
**Status:** Coordination request for Graham (§11.10.1)  
**Context:** Design Panel finding B3 — hermetic replay boundary-faithful honesty

---

## SDK Reality (Alexander's Domain — §12.7)

**Authoritative statement added to §12.7:**

> v1 hermetic replay is **boundary-faithful** (proves L0↔L1 capture completeness — that every input crossing the §2 boundary is in the ledger or CAS) but not **prompt-faithful** (cannot prove the SDK didn't inject hidden system context, safety constraints, retrieval augmentation, or tool-schema rewrites that never surfaced to L0).

**Why this matters:** Copilot SDK does NOT expose:
- Hidden system prompts (e.g., safety constraints, moderation filters)
- SDK-internal tool-schema rewrites (e.g., parameter validation, deprecation shims)
- Retrieval context injected by the SDK layer (e.g., code-index augmentation, memory recall)
- Attention metadata showing what the model actually "saw"

L0 captures what crosses the §2 boundary; it cannot capture what the SDK injects **below** that boundary. A passing A2/A9 replay proves the ledger is complete at the captured boundary, but does not prove the LLM saw only the literal `system_prompt` and `tool_definitions` we recorded.

**Implication for architectural claims:** Replay integrity holds at the L0/L1 interface. It does NOT prove end-to-end prompt integrity from "what the model was asked" to "what the model executed against."

---

## Graham's Domain — §11.10.1 Architectural Claim Language

Graham owns §11.10 "Reproducibility Honesty" (you authored this section per CTD). The B3 finding asks for a degraded-mode statement distinguishing boundary-faithful vs prompt-faithful replay.

**Request:** Add a §11.10.1 subsection (or amend §11.10) that:
1. Defines **boundary-faithful replay** (L0↔L1 capture completeness proven; hermetic at the captured boundary)
2. Defines **prompt-faithful replay** (end-to-end from user intent → LLM execution context; requires SDK to expose full prompt provenance including hidden augmentation)
3. States that **v1 Copilot SDK is boundary-faithful only** (per §12.7 reality check)
4. Notes that future providers with full attention metadata MAY upgrade to prompt-faithful (forward-compat door remains open)

**Why this split matters (Skeptic's concern):**
- If we claim "hermetic replay" without the boundary-faithful qualifier, readers may interpret it as "proves the LLM execution context" — which we cannot prove.
- If future audits discover the SDK injected hidden safety prompts, we need the documented distinction so the claim doesn't retrospectively become a lie.
- The boundary-faithful framing is **honest but still strong**: it proves capture completeness at the interface we control (L0/L1), which is sufficient for the v1 use case (session debugging, fork-from-good-state, investigation).

**Coordinate:** Alexander owns §12.7 SDK reality; Graham owns §11.10 architectural honesty doctrine. Both sections should reference each other so readers see the full picture.

---

## Validation Plan (Shared)

**Test (Alexander to implement, Graham to review):**
- Unit test: Mock SDK adapter that injects a hidden system prompt NOT in `BootstrapPayload.literalContext.systemPrompt`.
- Assert: Replay passes (boundary-faithful — we re-feed what we captured at L0).
- Document: Test comment states "This test proves boundary-faithful replay, NOT prompt-faithful. Hidden SDK context below L0 is not validated."

**Acceptance:** Test lands in `packages/crucible-l0-copilot/test/` with explicit comment. Graham's §11.10.1 references this test as evidence of the boundary-faithful distinction.

---

## Decision Log

- **2026-05-29:** B3 finding accepted by Aaron. Alexander adds §12.7 clarification. Graham to author §11.10.1.


### alexander-d1-tool-capture-boundary

# D1 — Tool Capture Boundary (Post-Filter LLM-Visible Result Only)

**Author:** Alexander  
**Date:** 2026-05-29  
**Status:** LOCKED (Aaron ruling)  
**Context:** E3 secret-redaction exposure surface analysis

---

## Problem Statement

CTD was ambiguous on what "tool output" means at the L0/L1 capture boundary:
- **(a) Tool result** — LLM-visible content (post-SDK-truncation/filter/sanitization) that crosses back to harness for next LLM prompt
- **(b) Tool output** — Raw pre-filter source bytes (full file, full HTTP body, full stdout) before SDK truncation
- **(c) Both** — Full output in CAS, LLM-visible result as separate pointer
- **(d) Adapter-specific** — Protocol allows either; SDK provider chooses

**Why it matters (Frame 2 — data-controller obligation):**
- If (a): Content already round-tripped to cloud LLM; Frame 2 obligations largely collapse (LLM provider is primary data controller).
- If (b): Pre-filter bytes never egressed to cloud; Crucible becomes data controller for net-new content exposure (longer retention, broader inclusion, simpler local exfil).

**CTD ambiguity evidence:**
- §11.2 line 28: "MCP / tool call **result**" (implies LLM-visible) but sub-kind `tool_output` with "output bytes in CAS" (implies full)
- §11.2 line 34: `responseRef` points to CAS digest but doesn't specify pre-filter vs post-filter
- §12.6 lines 203-205: "SDK returns the file; provider emits matching `Artifact{tool_output}`" — doesn't say if SDK truncates before or after L0 emission
- §2 L0/L1 boundary contract: No explicit "capture boundary sits after SDK filtering" statement

---

## Aaron's Ruling (D1)

**Lock: (a) — Tool result (LLM-visible, post-SDK-filter) only.**

**Rationale (Aaron):** "(a) is really all we need for replay." Hermetic replay (§11.4) re-feeds captured content to reconstruct Decision context; what matters is what the LLM saw when making the Decision, not the raw tool source bytes. Pre-filter content adds data-controller burden (Frame 2) without replay value.

**Implications:**
1. **Round-trip parity holds** for tool results (cloud LLM already saw this content; Crucible's ledger doesn't add new exposure surface, only retention delta).
2. **Frame 2 obligations** (data-controller burden) apply to retention policy (v1: user manages `~/.crucible/` pruning) but NOT to "we're storing content that never left the machine."
3. **v1.5+ redaction** (§18.4 Tension #6) scopes to LLM-visible content only; no need to redact pre-filter bytes that never crossed L0→L1.
4. **Boundary-faithful replay** (B3) proves L0↔L1 capture completeness at the post-filter boundary; does NOT prove "we captured everything the tool emitted."

---

## CTD Changes (Implemented 2026-05-29)

1. **§2.3** (`02-l0-l1-boundary-contract.md`) — Added authoritative capture-boundary rule: "L0/L1 boundary sits **after** SDK-side content filtering. L0 emits post-filter LLM-visible results, not raw pre-filter source bytes."

2. **§11.2** (`11-hermetic-replay.md`) — Updated capture-scope table row 6: "MCP / tool call **result** (D1)" with body location "**LLM-visible result bytes in CAS** (post-SDK-truncation; see §2.3 D1 note)". Added D1 clarification to line 34 noting `responseRef` points to post-filter content only.

3. **§11.4** (`11-hermetic-replay.md`) — Added D1 note to re-feed loop: "For tool calls, the re-fed payload is the LLM-visible result (post-SDK-filter), not the raw tool source output; replay proves boundary-faithfulness at the L0↔L1 interface."

4. **§12.6** (`12-copilot-sdk-integration.md`) — Added explicit paragraph "Tool result capture boundary (D1 ruling)" documenting that SDK truncation/filtering happens before L0 emission; `Artifact{tool_output}` carries post-filter content only. Cross-referenced Aaron's rationale.

---

## Forward-Compat Note

If future use cases require pre-filter tool output capture (e.g., debugging tool misbehavior, audit trail for file-read operations), the architecture allows:
- New sub-kind `Observation{tool_output_raw}` emitted alongside `tool_output` (LLM-visible)
- Router policy (§18.2) can gate `tool_output_raw` capture per trust tier (e.g., `external` tier never captures raw; `builtin` tier captures conditionally)
- Replay (§11.4) re-feeds only `tool_output` (LLM-visible), not `tool_output_raw` (debugging artifact)

This is additive; no breaking change to §2 boundary contract. v1 ships without `tool_output_raw`; v1.5+ can add it if replay-independent debugging needs justify the data-controller burden.

---

## Acceptance Test

**Test (to implement in `packages/crucible-l0-copilot/test/`):**
- Mock SDK that reads a 10 MB file, truncates to first 100 KB for LLM context
- Assert: `Artifact{tool_output}` CAS payload is 100 KB (LLM-visible), not 10 MB (raw source)
- Assert: Replay re-feeds the 100 KB; replay-equivalence oracle passes
- Document: Test comment states "D1 ruling — we capture post-filter LLM-visible result, not raw tool source bytes. This proves boundary-faithful replay at L0↔L1 without data-controller burden for pre-filter content."

---

## Decision Log

- **2026-05-29:** E3 analysis surfaced CTD ambiguity (Alexander's triage answer: "CTD is ambiguous, needs design decision").
- **2026-05-29:** Aaron ruled D1=(a) — capture LLM-visible result only.
- **2026-05-29:** Alexander implemented CTD clarifications across §2, §11, §12.


### alexander-eureka-crucible-runtime-overlap

# Eureka-Crucible Runtime Overlap Analysis

**Author:** Alexander (SDK/Runtime Dev)  
**Date:** 2026-05-26  
**Context:** Aaron requested SDK/runtime overlap analysis between Eureka PRD (mem repo) and Crucible architecture (harness repo) to identify conflicts before simultaneous implementation.

---

## Executive Summary

**Eureka's relationship to the SDK:** Eureka is an **SDK-agnostic** knowledge retention system. It does NOT consume the Copilot SDK directly. Eureka operates as a library/MCP-server that agents (including Crucible) call for memory operations (`integrate`, `recall`, `decide`). The SDK session lifecycle remains owned by Crucible's L0 boundary; Eureka receives the `SessionId` brand as a correlation token only.

**Recommended integration shape:** **Eureka-as-library-to-Crucible** (Integration Shape #1 below). Crucible's message loop calls Eureka's memory primitives as first-class operations alongside Cairn/Forge. Eureka runs in-process with Crucible, shares the `SessionId` brand for cross-system correlation, but maintains its own storage tier (`~/.copilot/eureka/agent.db`) with no runtime cross-DB queries. Hermetic replay boundary preserved: Eureka calls are recorded as L1 primitives; replay re-invokes Eureka with the same inputs.

**Critical conflicts identified:** 4 concrete breaks if both ship as written (see §5). Most severe: session-model coupling (both own "session" differently), model-selection ownership ambiguity, and lifecycle coordination (who starts Eureka's sweep when Crucible ends a session?).

---

## 1. Eureka's Relationship to the SDK

Eureka does **not** consume `@github/copilot-sdk` directly. Per Eureka PRD §7.1 (Boundary Policy), Eureka is a **peer system** to Cairn/Forge, not a layer inside Crucible's SDK abstraction.

**What Eureka receives from the SDK world:**
- `SessionId` brand (from `@akubly/types`) — the shared Copilot CLI session UUID that both Cairn and Eureka reference
- Nothing else. Eureka does not call `CopilotClient`, does not manage `CopilotSession`, does not invoke LLMs directly.

**What Eureka provides:**
- Memory primitives (`integrate`, `recall`, `rerank`, `decide`, `commit`, `retire`, `evict`)
- Invokable as library functions (TypeScript API) or via MCP tools (v1.5)
- Storage-backed (`~/.copilot/eureka/*.db`) with BM25 recall (v1) and eventual semantic similarity (v1.5)

**The SDK relationship is mediated through Crucible:** Crucible's L0 boundary (`l0-provider/`) wraps the SDK; Crucible's message loop calls Eureka when an agent needs memory; Crucible's L1 ledger records Eureka invocations as primitives. The SDK never sees Eureka types; Eureka never sees SDK types.

---

## 2. Integration Shape Options

| Shape | What it means | Cost | Preserves hermetic replay? | What it breaks |
|-------|---------------|------|------------------------------|----------------|
| **#1: Eureka-as-library-to-Crucible** | Crucible imports `@akubly/eureka` and calls memory primitives directly in-process. Eureka operations become L1 primitives recorded by Crucible's WAL. | **Low** — add dependency, wire primitives | ✅ **YES** — Eureka calls recorded as primitives with inputs/outputs; replay re-invokes Eureka deterministically | None (recommended) |
| **#2: Eureka-as-MCP-server-of-Crucible** | Crucible launches Eureka as an MCP server (via `stdio` transport). Eureka's memory ops become MCP tool calls visible to the LLM. | **Medium** — MCP transport, session lifecycle coupling | ⚠️ **DEGRADED** — MCP tool calls cross process boundary; replay depends on Eureka server being available and behaving identically | Session lifecycle: Crucible must start/stop Eureka server; failure modes: Eureka crashes mid-session |
| **#3: Eureka-as-peer-shell** | Eureka runs as an independent CLI shell (like Crucible). Agent chooses which to invoke per task. | **High** — duplicate session management, no shared primitives | ❌ **NO** — two separate ledgers, no unified replay | Everything: session identity diverges, no cross-system primitive recording, agent must coordinate manually |
| **#4: Eureka-as-Crucible-sub-conversation** | Eureka is a Crucible sub-agent spawned via `task` tool. Memory ops become sub-agent turns. | **High** — sub-agent protocol, context inheritance | ⚠️ **DEGRADED** — sub-agent turns are opaque to parent; Eureka state not directly replayable at parent level | Latency: every memory op spawns a sub-agent; context: Eureka sub-agent inherits full parent context (wasteful) |
| **#5: Eureka-as-independent-process (daemon)** | Eureka runs as a long-lived background daemon. Crucible and agents connect via IPC/RPC. | **Very High** — daemon lifecycle, IPC protocol, failure recovery | ❌ **NO** — out-of-process means no L1 primitive recording; replay cannot reconstruct Eureka state | Hermetic boundary: Eureka state lives outside Crucible's ledger; session crashes lose Eureka state; no replay fidelity |

**Recommendation:** **#1 (Eureka-as-library-to-Crucible)**. Lowest cost, preserves hermetic replay, no session lifecycle conflicts. Eureka primitives (`recall`, `integrate`, `decide`) become first-class Crucible operations recorded at L1 like Cairn/Forge calls.

---

## 3. Session Model Overlap

**Crucible session model (from decisions.md §Phase B Reconciliations):**
- SDK session wrapped at L0 boundary (`l0-provider/`)
- Cairn `sessions` table: operational lifecycle (`id: SessionId`, `repo_key`, `branch`, `started_at`, `ended_at`, `status`)
- L1 WAL appends events tagged with `session_id`
- Branching: `sessions.parent_session_id` + `fork_point_event_id` (non-destructive fork)

**Eureka session model (from PRD FR-13):**
- Session is a `kind=session` **fact** in Eureka's fact store
- Schema: `{id: FactId, kind: 'session', session_id: SessionId, content: string (caller-supplied summary), trust, importance, attention_tier, ...}`
- One CLI session can produce **many** `kind=session` facts (start, mid-session checkpoints, end, multi-process observers)
- Session-facts are **epistemological** (what was learned), not operational (lifecycle)

**Overlap:**
- Both reference the same `SessionId` brand (shared identifier from `@akubly/types`)
- Both use "session" nomenclature intentionally (different lenses: Cairn = lifecycle, Eureka = epistemology)
- **No shared `SessionBase` interface, no runtime traversal API** — correlation is type-level only (FR-13)

**Integration implications:**
1. **Shared identity, separate storage:** Crucible's L1 ledger and Cairn's `sessions` table own lifecycle; Eureka's `kind=session` facts own epistemology. Both reference the same `session_id` UUID.
2. **No cross-DB queries at runtime:** Eureka FR-7.2 explicitly forbids `ATTACH` queries. Reconciliation is offline-only via `eureka reconcile` CLI.
3. **Session-fact creation trigger:** Eureka PRD §FR-13 says "manual only via explicit `remember()` call" in v1. No automatic promotion from Cairn session-start to Eureka session-fact. Crucible must decide **when** to call `eureka.createSessionFact(session_id, summary)`.

**Conflict risk:** **MEDIUM**. If Crucible does not invoke `remember()` or `eureka.session.flushHints()` before session ends, Eureka US-2 (cross-session continuity) fails. Eureka PRD AC-2.5 acknowledges this as "caller-cooperation contract" with telemetry counter for tracking. Crucible's always-on Curator hook (W3-D4) could be augmented to call Eureka's flush helper.

---

## 4. Message Loop Ownership

**Crucible message loop (from decisions.md §Phase B Reconciliations + Alexander's history):**
- Crucible owns the **top-level message loop** (replaces Copilot CLI as Aaron's daily driver)
- Thick turn model: one user message → one assistant response, with sub-agents/tool-calls nested inside (revealable on demand)
- L1 WAL records intra-turn primitives at fine granularity
- Sub-agent spawning via `task` tool; sub-agent results aggregated into parent turn

**Eureka message loop:**
- **None.** Eureka is a library, not a shell. It does not own a message loop.
- Eureka's `decide` operation (FR-10, contemplative path) is a **synchronous function call**, not a turn-based exchange.

**Integration implication:**
- **No conflict.** Eureka runs **inside** Crucible's message loop as a library call.
- When an agent invokes `eureka.recall(query)` or `eureka.decide(payload)`, it's a synchronous primitive recorded by Crucible's L1 ledger.
- Eureka does NOT spawn a sub-conversation or sub-agent; it returns results inline.

---

## 5. Tool / Primitive Surface Overlap

**Crucible tool surface (from decisions.md):**
- L3 (Generators/Prescribers): Forge prescribers, Curator orchestration
- L4 (Router): safety choke-point, pause/observe/continue verdicts
- L5 (Predicates): policy evaluation, per-primitive-row budget (≤80µs)
- Primitives recorded at L1 WAL: 8-field row schema (event log, read-set hash, hook bus fields)

**Eureka tool surface (from PRD §4, FR-4):**
- Activities: `integrate`, `recall`, `rerank`, `decide`, `commit`, `retire`, `evict` (v1)
- `meditate`, `contemplate` reserved (v1.5)
- No LLM calls inside Eureka — it is a **data layer**, not an agentic layer

**Where do Eureka capabilities enter Crucible?**

**Option A: As Crucible L3 primitives (recommended)**
- Eureka operations become first-class primitives alongside Cairn/Forge calls
- L1 WAL records: `primitive_type: 'eureka_recall'`, `inputs: {query, k, trust_floor}`, `outputs: {facts: [...], latency_ms}`
- L4 Router sees Eureka calls and can apply policies (e.g., "pause on `eureka.evict` if fact.trust > 0.8")
- L5 predicates can inspect Eureka calls in the pre-commit hook bus

**Option B: As MCP tools (v1.5)**
- Eureka exposes `mcp_recall`, `mcp_integrate`, etc. via MCP server
- LLM sees Eureka as tool calls in its tool manifest
- Crucible records MCP tool invocations as L1 primitives (like any other tool)
- **Drawback:** MCP transport overhead; Eureka server lifecycle coupling; replay depends on server availability

**Option C: Hybrid (recommended for v1)**
- v1: Eureka-as-library (Option A). Fast, in-process, hermetic replay.
- v1.5: **Also** expose Eureka as MCP server for external agents (non-Crucible consumers like IDE assistants). Crucible continues using library path.

**Tool overlap risk:** **LOW**. Eureka's operations are distinct (memory-scoped) from Crucible's existing L3 primitives (prescription-scoped). No naming conflicts. Eureka `decide` vs. Forge `DecisionRecord` are complementary (Path 1 vs. Path 2 per Eureka PRD §7.2).

---

## 6. Replay / Hermetic Boundary Impact

**Crucible hermetic replay (from decisions.md v1 commitment #4):**
- L0/L1 boundary is load-bearing: SDK types do not leak above L1
- L1 WAL records primitives with full inputs/outputs
- Replay re-drives L1 event stream deterministically
- Hermetic boundary assumes **all side effects** flow through recorded primitives

**Eureka's impact on hermetic replay:**

**✅ Preserves hermetic boundary IF integrated as library (Shape #1):**
- Eureka calls (`recall`, `integrate`, `decide`) are recorded as L1 primitives
- Inputs: query string, fact payloads, decision payloads (all serializable)
- Outputs: retrieved facts, insertion confirmations, decision results (all serializable)
- Replay: re-invoke Eureka library with same inputs → deterministic outputs (BM25 scoring is deterministic; no LLM calls inside Eureka)
- **Eureka storage state (`~/.copilot/eureka/agent.db`) must be snapshotted alongside Cairn DB for full replay fidelity**

**❌ Breaks hermetic boundary IF integrated as MCP server (Shape #2) or daemon (Shape #5):**
- Eureka state lives outside Crucible's L1 ledger
- Replay cannot reconstruct Eureka's fact store from L1 WAL alone
- Side-channel LLM calls: if Eureka (hypothetically) called an LLM internally, those calls would not flow through Crucible's L0 boundary → replay would miss them
  - **Current Eureka PRD has NO LLM calls inside Eureka** → safe for now
  - **Future risk:** if Eureka v1.5 `contemplate` or `meditate` call LLMs, those must flow through Crucible's L0 boundary or be recorded separately

**Conflict:** **MEDIUM-HIGH** if integrated as out-of-process (Shape #2, #5). **NONE** if integrated as library (Shape #1, recommended).

**Mitigation for library integration:**
1. Record Eureka calls as L1 primitives: `{type: 'eureka_recall', inputs: {...}, outputs: {...}, latency_ms, session_id}`
2. Snapshot Eureka's DB (`~/.copilot/eureka/agent.db`) alongside Cairn's `knowledge.db` during Crucible snapshot/fork operations
3. Document in Crucible's snapshot contract: "Full replay requires both Cairn + Eureka DBs from the snapshot point"

---

## 7. Model Selection Conflicts

**Crucible model selection (from Alexander's US-A-1, US-A-8):**
- Crucible owns model selection / quota
- Forge owns `ForgeClient` wrapping SDK session (L0 boundary)
- Configurability: multi-provider, multi-skill experimentation (US-A-8)
- Replay implications: model choice must be recorded per turn for deterministic replay

**Eureka model selection (from PRD):**
- **Eureka makes NO LLM calls** in v1 or v1.5 (per PRD §1, §4, §12 non-goal #11)
- `decide` (FR-10 contemplative path) does NOT call an LLM — it is a structured ranking/deliberation over Eureka's fact graph, returning a recommendation
- Future `contemplate` / `meditate` (v1.5) MAY involve LLM calls for reflection — **PRD does not specify**

**Integration implication:**
- **v1: No conflict.** Eureka doesn't pick models because Eureka doesn't call LLMs.
- **v1.5 risk:** If `contemplate` / `meditate` call LLMs, **who picks the model?**
  - **Option A:** Eureka receives model handle as input from caller (Crucible). Crucible retains model selection authority.
  - **Option B:** Eureka picks its own model internally. **Conflict:** two model-selection authorities; quota ambiguity; replay non-determinism if Eureka's choice differs across replays.
  - **Recommendation:** Option A. Eureka should NEVER own model selection. If Eureka needs LLM calls, caller (Crucible) supplies a model handle or callback.

**Conflict risk:** **LOW for v1 (none), MEDIUM for v1.5 (must be resolved in Eureka v1.5 design)**.

---

## 8. Lifecycle / Process Model

**Crucible lifecycle (from decisions.md):**
- Crucible is the **shell** (replaces Copilot CLI as daily driver)
- Crucible spawns sub-agents via `task` tool
- Crucible owns session start/end hooks (Cairn `sessionStart.ts`)
- Crucible's L1 WAL lifecycle: append-only, snapshot/fork, GC

**Eureka lifecycle (from PRD FR-12 Sweep):**
- Sweep triggers: end-of-session, first-query-of-day
- Sweep operations: importance decay, tier demotions, Tier 2 edge population, stale flags, edge weight reconciliation
- Sweep is **caller-driven** in v1 (no automatic background process)
- v1.5 may consume Cairn session-end events as authoritative trigger (per Edgar R8 §2)

**Integration questions:**
1. **Same process?** YES (if library integration, Shape #1). Eureka library runs in-process with Crucible.
2. **Sibling processes?** NO (unless MCP server integration, Shape #2, not recommended).
3. **Crucible-spawns-Eureka?** NO (library import, not process spawn).
4. **Lifecycle coordination:**
   - **Session start:** Crucible calls `eureka.session.start(session_id)` (explicit) OR Eureka infers first interaction (implicit, current PRD default)
   - **Session end:** Crucible calls `eureka.session.end(session_id)` to trigger sweep OR Cairn session-end event triggers Eureka sweep (v1.5)
   - **Conflict:** Eureka PRD says sweep is "heuristic" (caller-driven `end()` or next-query catch-up) in v1. Crucible has **authoritative** session-end signal (Cairn `sessions.ended_at`). These should be wired together.

**Conflict:** **MEDIUM**. Eureka's sweep trigger is heuristic; Crucible's session lifecycle is authoritative. Mismatch risk: Crucible ends session, Eureka never sweeps because no one called `eureka.session.end()`.

**Mitigation:**
- Wire Crucible's session-end hook (`sessionStart.ts`) to call `eureka.session.end(session_id)` explicitly
- OR: Implement Eureka v1.5 early (Cairn session-end event subscription) — but this adds runtime coupling and violates Eureka PRD Path D (ship standalone, no new Cairn coupling in v1)
- **Recommended:** Crucible's session-end hook calls Eureka library's `flushHints()` + `sweep()` synchronously before marking Cairn session `ended_at`.

---

## 9. Concrete Conflicts if Both Ship As Written

### Conflict #1: Session-Fact Creation Trigger (BLOCKER for US-2 continuity)
**Eureka PRD:** AC-2.5 says cross-session continuity depends on caller invoking `remember()` or `flushHints()`. No automatic session-fact creation.

**Crucible today:** No call to Eureka anywhere. Cairn `sessionStart.ts` hook runs Curator orchestration (W3-D4 always-on) but does not touch Eureka.

**Break:** If Crucible ships without wiring Eureka session-fact creation, Eureka US-2 (cross-session continuity) fails for 100% of Crucible sessions. Telemetry counter `eureka_sessions_ended_without_flush_total` increments but behavior is broken.

**Citation:** Eureka PRD AC-2.5 (PRD line 87), Crucible `sessionStart.ts` (Cairn package), Alexander history W3-D4 (always-on orchestration does not include Eureka).

---

### Conflict #2: Sweep Trigger Authority (Operational correctness)
**Eureka PRD:** Sweep triggers heuristically (end-of-session inferred from caller `end()` or next-query catch-up). v1.5 may consume Cairn session-end events (Edgar R8 §2), but v1 does not.

**Crucible:** Authoritative session lifecycle in Cairn `sessions` table (`ended_at` timestamp, `status` enum). Session-end hook runs Curator orchestration but does not notify Eureka.

**Break:** Eureka sweep may never fire (if no one calls `eureka.session.end()` explicitly) OR may fire late (first-query-of-next-session catch-up), causing stale importance/trust scores.

**Citation:** Eureka PRD FR-12 (sweep triggers), Crucible Cairn `sessionStart.ts` (hook ownership), decisions.md Phase B Reconciliation (Cairn owns lifecycle).

---

### Conflict #3: Hermetic Replay Snapshot Scope (Replay fidelity)
**Eureka PRD:** Eureka storage lives at `~/.copilot/eureka/agent.db` (FR-7.2). No cross-DB ATTACH. Offline reconciliation only.

**Crucible:** Hermetic replay boundary (v1 commitment #4) assumes snapshot/fork captures all state needed for deterministic replay. Today: Cairn `knowledge.db` only.

**Break:** If Crucible snapshot/fork does NOT include Eureka's `agent.db`, replay of a turn involving `eureka.recall()` will fail (facts missing) or produce non-deterministic results (different fact set).

**Citation:** Eureka PRD FR-7.2 (storage paths), NFR-6 (backup/restore independence), Crucible decisions.md v1 commitment #4 (hermetic replay), decisions.md Round 5 Aaron lock (L1 substrate).

---

### Conflict #4: Decision Pathway Adapter Wiring (Path 1 & Path 2 integration)
**Eureka PRD:** Path 1 (`decide` → Forge via `toDecisionRecord()`), Path 2 (Forge → Eureka via `fromDecisionRecord()`). Bidirectional adapters live in `packages/eureka/src/interop/`.

**Crucible/Forge:** Forge today has `DecisionRecord` type in `@akubly/types` (used for prescriber audit), but no caller of `toDecisionRecord()` or `fromDecisionRecord()`.

**Break:** Eureka's Path 1 and Path 2 adapters are dead code if Crucible does not wire them. Path 1 deliberative decisions stay in Eureka, never reach Forge audit stream. Path 2 in-flow decisions stay in Forge, never become Eureka learning material.

**Citation:** Eureka PRD FR-10 (Path 1 adapter), FR-14 (Path 2 adapter), §7.2 (bidirectional pathways), Forge `packages/types/src/index.ts:47` (`DecisionRecord`), no Crucible call sites for adapters.

---

## 10. Open Questions for Aaron

### Q1: Eureka Sweep Trigger — Crucible Hook or Cairn Event?
Eureka's sweep needs an authoritative session-end signal. Two options:
- **A:** Crucible's session-end hook (`sessionStart.ts`) calls `eureka.session.flushHints() + sweep()` synchronously (immediate, simple, no new coupling).
- **B:** Implement Eureka v1.5 early: Cairn emits session-end events, Eureka subscribes (deferred, async, but honors Path D decoupling).

**Trade-off:** A is faster to ship and guarantees sweep fires; B preserves Eureka's "no Cairn coupling in v1" design but adds event-listener infrastructure. Which do you prefer for v1?

---

### Q2: Hermetic Replay Snapshot — Eureka DB Inclusion?
Crucible snapshot/fork must capture Eureka's `agent.db` for replay fidelity. Two sub-questions:
- Should Crucible snapshot **automatically** copy `~/.copilot/eureka/agent.db` alongside Cairn's `knowledge.db`?
- Or: Should Eureka snapshot be **opt-in** (operator decision), documented as "for full replay fidelity, snapshot both DBs"?

**Trade-off:** Automatic inclusion is foolproof but increases snapshot size and couples Crucible to Eureka's storage layout. Opt-in is flexible but shifts burden to operator. Your call?

---

### Q3: Eureka v1.5 `contemplate` / `meditate` — LLM Call Authority?
Eureka PRD defers `contemplate` / `meditate` to v1.5 and does not specify if they call LLMs. If they do, who picks the model?
- **A:** Eureka receives model handle from Crucible (Crucible retains selection authority).
- **B:** Eureka picks its own model (violates Crucible's model ownership).

**Recommendation:** A (Eureka NEVER owns model selection). Should this be locked in Eureka PRD now or deferred to v1.5 design?

---

## Appendix: Alexander's Learnings (to be added to history.md)

### Learning: Eureka-Crucible SDK Relationship
Eureka does NOT consume the Copilot SDK directly. Eureka is SDK-agnostic; it receives `SessionId` as a correlation token only. The SDK relationship is mediated through Crucible: Crucible's L0 boundary wraps SDK, Crucible's message loop calls Eureka as a library, Crucible's L1 ledger records Eureka invocations as primitives. Integration shape: **Eureka-as-library-to-Crucible** (Shape #1). Lowest cost, preserves hermetic replay, no session lifecycle conflicts.

### Learning: Session Model Dual Lenses
Both Crucible and Eureka own "session" but through different lenses: Cairn = operational lifecycle (when, where, status), Eureka = epistemological (what was learned, continuity). Both reference the same `SessionId` brand (shared identifier from `@akubly/types`), but storage/schema remain independent. No runtime cross-DB queries (Eureka FR-7.2 hard rule). Reconciliation is offline-only via `eureka reconcile` CLI. Integration risk: Crucible must explicitly call `eureka.session.flushHints()` before session-end or Eureka US-2 (cross-session continuity) fails.

### Learning: Hermetic Replay Extension
Crucible's hermetic replay boundary extends to Eureka IF integrated as library. Eureka calls recorded as L1 primitives; replay re-invokes Eureka library with same inputs. **BUT:** Eureka storage state (`~/.copilot/eureka/agent.db`) must be snapshotted alongside Cairn's `knowledge.db` for full fidelity. Snapshot contract must document: "Replay requires both DBs from snapshot point." Out-of-process integration (MCP server, daemon) breaks hermetic boundary (side-channel state outside L1 WAL).

### Learning: Sweep Lifecycle Coupling
Eureka's sweep (importance decay, tier demotion, edge population) is caller-driven in v1. Crucible owns authoritative session lifecycle (Cairn `sessions.ended_at`). Mismatch risk: Crucible ends session, Eureka never sweeps. Mitigation: Wire Crucible's session-end hook (`sessionStart.ts`) to call `eureka.session.end(session_id)` + `sweep()` explicitly. v1.5 may subscribe to Cairn session-end events (Eureka PRD Edgar R8 §2), but that adds runtime coupling and violates Path D (ship standalone). Synchronous hook call is simpler for v1.



### cassima-prd-r2-thesis-resolution

# Cassima → Aaron — round-2 thesis resolution

**Date:** 2026-05-26
**From:** Cassima (PM)
**Re:** Item #6 from your round-2 feedback — bootstrap loop vs single-agent v1 scope. My recommendation, the alternatives I considered, and what I changed (and didn't change) in §0/§5 of the PRD.

---

## The tension, restated

You wrote:

> The whole "use Crucible to improve Crucible" goal is somewhat at odds with the choice to target single-agent for v1. Crucible is actively being designed and built *by a squad*, which is inherently multi-agent.

You're right. The round-1 bar said: *"Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible."* The literal reading of "every improvement" can't be true while:

- v1 ships single-agent (Cluster B lock).
- The squad-of-9 that builds Crucible is inherently multi-agent (Cassima writing the PRD with Graham consulting; Roger + Laura coordinating on the conformance kit; the persona-review panels that look at every artifact before it leaves).
- The genuinely interesting Crucible improvements — the cross-author triage, the multi-persona synthesis, the architectural deliberations — *are* multi-agent work by construction.

If we ship v1 with the original bar unchanged, one of two things happens at end of dogfood week:
- **Bar fails honestly,** because every improvement that landed required squad work outside Crucible's session container. The thesis isn't disproven; we just couldn't test it at v1 scope.
- **Bar passes dishonestly,** because Aaron interpreted "every improvement" loosely to keep the project alive. We learn nothing about whether the loop actually closes.

Neither outcome is what the falsifiable bar was supposed to produce.

## The four options I considered

### (a) Relax the bar — "every improvement *that a single agent could reasonably author*"

- **Pro:** Minimal scope change. v1 ships as planned.
- **Con:** "Could reasonably author" is squishy. It hands Aaron the call at end of dogfood week, and the call is biased toward "yes it could have" because the project's continuation depends on the answer. Weakens falsifiability to the point of unfalsifiability.
- **Verdict:** Rejected. Falsifiability is the whole point of the bar.

### (b) Promote multi-agent INTO v1

- **Pro:** Honors the literal thesis. Aaron's stated workflow priority (multi-agent is load-bearing for normal work) gets reflected in v1.
- **Con:** Calendar reopener. Cluster B locked "Option 2 spawn seam reserved" as +2–3 eng-days; promoting basic spawn (one parent, N children, sequential collection) is closer to +2–4 weeks elapsed for the squad. It pulls in: sub-agent runtime API (Alexander), `parent_session_id` propagation through Mirror events and WAL (Roger), pause/resume semantics across the child boundary (Gabriel), Provider `spawnChild()` implementation (Rosella). The testing surface ~doubles (concurrency, hierarchical state, child lifecycle).
- **Verdict:** Reserved as Aaron's call. *Do not promote unilaterally.* If you authorize this, the PRD §3 non-goal #1 ("one agent at a time") comes off, Cluster B reopens, and Graham needs to redo the calendar arithmetic in Appendix C.

### (c) Reframe the bar around "in the loop"

- "Crucible is *in the loop* for every improvement" — recorded the work, generated at least one prescription, hosted the investigation, or applied the change. Even if the work happened outside a Crucible session.
- **Pro:** Lets squad work continue unmodified.
- **Con:** Unfalsifiable. "Recorded the work" is satisfied trivially if Aaron exports a transcript into Cairn after the fact. "In the loop" doesn't tell us whether the substrate is *load-bearing*; only whether it's *touched*.
- **Verdict:** Rejected. Same failure mode as (a) but in a different costume.

### (d) Two falsifiable bars — split honestly between v1 and T2 ⭐ recommended

- **Bar A (v1 falsifiable test):** Aaron's *solo single-agent* daily-driver work runs through Crucible for a week; Crucible is load-bearing for every improvement *that originates inside a Crucible session*. Squad-orchestrated work is *explicitly outside* this bar.
- **Bar B (T2-and-beyond, named here):** Squad-orchestrated improvements come into the loop via multi-agent execution on the reserved seam.
- **Pro:** Honest about the v1/T2 split. Bar A is genuinely falsifiable — it has a binary outcome at end of dogfood week. The original thesis stays intact, just staged across two tiers. Lets the squad keep working the way it works today, without pretending Crucible owns that work yet.
- **Con:** The v1 thesis test is *narrower* than the original framing suggested. A clean Bar A pass doesn't validate the full thesis; it validates the solo half.
- **Crucial guardrail.** A *too-easy* Bar A pass is a warning sign, not a success. If at end-of-week Aaron concludes the genuinely interesting Crucible improvements all required squad coordination — meaning the single-agent slice is too narrow to validate the thesis at all — that is the explicit signal to authorize (b) and promote multi-agent into T1.5. This guardrail is named in §5.2 (the "Squad-work-leakage signal" supporting indicator).
- **Verdict:** Recommended.

## Why (d) over (b)

(b) is the thesis-honoring answer if calendar weren't a constraint. The reason I'm not recommending it unilaterally:

1. **The reserved seam exists for a reason.** Cluster B explicitly traded multi-agent for "prove the single-agent loop closes first." Promoting multi-agent before single-agent is validated double-bets the calendar against an unproven substrate. If single-agent dogfood reveals the L1/L4/Mirror substrate doesn't actually hold up under daily-driver load, we will have spent the multi-agent investment on a foundation we then have to rework.
2. **The (d) framing surfaces (b) as data.** With Bar A's supporting indicators explicitly tracking *"which improvements that week required squad coordination,"* dogfood week itself becomes the evidence base for whether (b) is the right T1.5 move. We don't have to guess in advance; we have a designed measurement.
3. **(b) is still on the table, just gated.** If you want to authorize it now — based on your existing knowledge that multi-agent is load-bearing — say so and I'll re-frame the PRD around it. But I'd rather have you make that call with one week of dogfood data than make it on speculation.

## What I changed in the PRD

- **§0 "Why does it exist?"** — softened "v1 bar is literally every improvement" to "v1 bar is the solo half" with a forward pointer to §5 and this sidecar.
- **§5** — replaced the single-bar formulation with two bars (5.1) plus four supporting indicators (5.2), including the explicit "squad-work-leakage signal" that watches for the (b) trigger condition.
- **§3 (non-goals)** — non-goal #1 ("one agent at a time") *stays*. Bar B in §5 names the multi-agent extension as T2 follow-on, so the non-goal is consistent with the recommended option.
- **Appendix C calendar** — unchanged. (d) doesn't move the calendar; only (b) would.
- **Appendix B.1 (T2 stories)** — unchanged. The "first multi-agent (N≥2) story PROMOTED from original triage" entry is already first; it now also carries Bar B's weight.

## What I need from you

1. **Confirm (d) is the right call** (or tell me to swap to a different option). If (b), I reopen Cluster B and pull Graham in for the calendar redo *before* Graham hears about this from any other source.
2. **Validate the Bar A formulation.** "Originates inside a Crucible session" is the qualifier doing the load-bearing work. If your intent is narrower or wider, the wording in §5.1 needs to match.
3. **Sign off on the squad-work-leakage indicator.** It's the mechanism that turns "did Bar A close?" into actionable signal about whether (b) becomes the T1.5 move. If you don't want that mechanism, say so and I'll cut it.

No action needed from Graham or any other author until you've answered (1).


### cassima-prd-rebuild-vocabulary-fence-notes

# Cassima → Graham (+ squad) — PRD rebuild vocabulary/framing notes

**Date:** 2026-05-26
**From:** Cassima (PM)
**Re:** `cassima-prd-v1-DRAFT.md` rebuild — flagging framing decisions that touch architecture vocabulary

Aaron rejected the 2026-05-25 draft for readability; I rebuilt the body reader-first and pushed the engineering surface into appendices. Below are the framing choices I made in Part 1 that touch vocabulary you (Graham) or other authors care about. None of these change a locked decision — they change *how the PRD body refers to it for a cold reader*. Flag back if any feel wrong.

## 1. Layer numbers (L0–L5) are mentioned once and de-emphasized in the body.

§1 Vocabulary names L0–L5 with one-sentence each and explicitly tells the reader *"most readers can ignore the numbers."* §2 capability areas avoid "L4 Router" / "L1 WAL" framings entirely; they say "the gate that every prescription passes through" and "the append-only log."

**Why:** A new reader meeting "L4 admission gate" before knowing what a prescription is gets stuck. The numbers are correct internal vocabulary; they're not a useful onboarding handle.

**Implication for owners:** Appendix A (story inventory) and Appendix C (sprint plan) still use L0–L5 / Phase A / Phase B / cluster IDs as before. The body does not. If a future reviewer needs to cite the PRD for a cluster lock, link the appendix section, not the body.

## 2. "Narrator" is fully retired in the body; "Mirror" is used throughout.

§1 names Mirror as the locked term and parenthetically notes *"replaces the older name Narrator."* No further mention of Narrator in the body. Appendix A still references `bootstrap` category and `mirror_events` table by their canonical names.

**Why:** Vocabulary lock is already in `decisions.md:755-772`; surfacing the rename history would confuse a cold reader more than it would help.

## 3. The hook-bus verdict triple `{continue | observe | pause}` is introduced in plain English first, then named.

§1 introduces hooks as *"returns one of three verdicts: keep going, just observe, or pause and ask"* and then names the enum (`continue`/`observe`/`pause`) so the body can use the precise terms in §2.5. I considered renaming the enum entirely; concluded the cost (every owner has to relearn) outweighs the benefit (one paragraph of clarity).

**No action.** Just flagging that the plain-English ordering ("keep going / just observe / pause and ask") is now load-bearing for new-reader onboarding. If the enum order changes in code, the PRD prose changes with it.

## 4. The five primitives are introduced briefly in §1 vocabulary but NOT given their own section.

The harness-vision doc has §5 "Session Primitives" — 30-line treatment of Request / Artifact / Observation / Decision / Question. My PRD body gives one row each in the §1 vocabulary table. The detail in `harness-vision.md` §5 stays canonical; the PRD body assumes a reader who wants more goes there.

**Why:** §2 capability areas don't need primitive-by-primitive treatment — they need verb-by-verb treatment. The primitives belong in vocabulary, not in the capability sections.

## 5. "Causal read-set" is the term I kept; "provenance" remains banned.

Per `decisions.md` vocabulary lock, `provenance` is taken (evidentiary tier). I kept `causal_read_set` / `read-set` and introduced it in §1 as *"the set of inputs (prior events, files, observations) that a decision actually consulted."* §2.2 reuses "read-set" without re-defining.

**No action.** Just confirming I held the vocabulary fence.

## 6. The body never uses cluster lock IDs (Cluster A, I.7, D′.1.a, Phase B #4, etc.).

These are tracking artifacts, not requirements. Appendix A–E keeps every citation; the body keeps none. If you want to add a "see Appendix X" pointer in any specific spot, flag it and I'll add it — I deliberately erred toward zero pointers to keep the body legible.

## 7. The body never uses story IDs (US-G-4, T1-D2, etc.).

Same reasoning. Appendix A is the canonical story-ID home. If you want story-ID anchors in §2 for cross-referencing, flag specifics.

## 8. Six capability areas in §2 vs Aaron's proposed six.

Aaron's task spec proposed "Daily coding loop / Causal recall / Branching and forks / Pause and resume / Self-improvement loop / Inherits from Cairn/Forge." I shipped "Have a normal daily coding session / Be remembered, faithfully / Branch, fork, and recover / Watch Crucible improve itself / Investigate what happened / Inherit what already works." Two substantive deltas:

- **"Pause and resume" is folded into §2.5 Investigation.** In v1, pause only supports `continue`, so the user-visible surface is debugging-shaped, not workflow-shaped. Pause as a workflow primitive lights up in T2 (H.5 verdict-enum extension).
- **"Self-improvement loop" → "Watch Crucible improve itself."** Active verb matches the bootstrap-loop framing of §0 and the falsifiable bar of §5.

Flag back if either of these reads wrong from your seat.

---

**No decisions requested.** Reply only if any of the above conflicts with how you'd want a cold reader to meet the architecture.


### cassima-prd-v1-discovery

# Cassima — v1 PRD Discovery (running doc)

**Author:** Cassima (PM, Crucible)
**Started:** 2026-05-25 (turn 1)
**Status:** Pre-draft. Walking the opens with Aaron before authoring the PRD.

This doc is updated each turn. No fragmentation across files.

---

## 1. Where things stand (turn 1)

I have absorbed: charter, the 10 v1 commitments + A.3 hybrid + Phase A schema + Phase B closeouts in `decisions.md`, and all 9 author triage outputs from 2026-05-25T0200Z.

**The squad has converged remarkably hard.** Across 9 independent triages, three primitives are named T1 by ≥3 authors each:

- **Mirror chamber** (push notifications + pull dashboard, one `MirrorEvent` stream, all producers via Rosella's L1Subscriber pattern). Rosella, Graham, Valanice, Sonny, Erasmus.
- **Hermetic replay** (record-path interceptor at the LLM boundary; replay-re-feeds Observations; conformance kit asserts byte-equivalence). Graham (US-G-NEW-2), Alexander (US-A-1 + US-A-NEW-3 fused), Laura (A1+A3+A4 in T1).
- **`crucible fork` at HEAD** (verb, not just schema). Erasmus, Graham (US-G-7 split), Roger (US-R-3 slice).

Two more T1 things are unanimous because they're already locked: Router as named L4 chokepoint (Gabriel §6 + Graham US-G-4), and the 8-field proposal schema as runtime validator at the L4 commit gate (Laura + Graham).

**Real tensions that won't dissolve by themselves** (in order of leverage):

1. **The strong vs weak reading of "by Crucible."** Laura flags it explicitly. The reading swings A3 (replay equivalence) in/out of T1, swings Router auto-apply scope, and determines what counts as "an improvement." Single highest-leverage answer in the whole opens pile.
2. **Single-agent T1 vs Aaron's vision-Q5 "persistent + parallel like Copilot CLI."** Alexander's T1 loop is deliberately single-agent (sub-agents T3). Aaron's Q5 answer says flexible/persistent/parallel preferred. This is a real conflict, not a misread.
3. **Mirror render surface ownership.** Schema is clear (Graham #3), projector pattern is clear (Rosella), producers are clear — but *who renders the badge* in the CLI prompt is unowned. Web UI? TUI? CLI prompt-injection in Crucible binary? Rosella, Valanice, and Alexander all point at each other.
4. **Pause-verdict tier.** Alexander's fork-b spike killed seal-and-split on SQLite; A.3 hybrid restored pre-commit pause in principle, but Alexander's T1 explicitly ships `continue`/`observe` only and asks for `pause` to be T2. Sonny's T1 breakpoint primitive (T1-D2) *uses* pause. Direct collision.
5. **Package rename — `@akubly/skillsmith-runtime` → `@akubly/skillsmith-prescriber`.** Alexander's ask, low-cost mechanical, needed to free `crucible-runtime` for the actual T1 trunk SDK. Logistically blocking; not a product call but it lands in the PRD as a v1 housekeeping line.

**Things I'm explicitly *not* re-litigating:** the 10 v1 commitments, A.3 hybrid, Phase A 8-field schema, Phase B closeouts (#1–#7), Aaron's vision-Q1 round-1 decisions, the L0/L1 hermetic boundary, the L1Subscriber pattern, Mirror's existence as one chamber/two modes, the closed `source` enum, CBOR+BLAKE3 for the L1 read-set hash, DBOM stays SHA-256, vocabulary locks (prescription/trail/causal_read_set, Narrator→Mirror).

**Things the coordinator already resolved that I just need to communicate (not re-debate):** Gabriel's "Mirror input contract" Q2 is closed by Rosella's L1Subscriber rule + commitment #10. I will say so in the PRD.

---

## 2. Clustered open-question agenda

~45 atomic questions across 9 authors, clustered into 8 themes. Cluster I is mostly design — routed to Graham, not Aaron.

| # | Cluster | What hinges on it | Authors |
|---|---|---|---|
| **A** | **"By Crucible" — strong vs weak read** | A3 in T1 or T2; Router auto-apply scope; what counts as an improvement; the metric for "loop closed"; whether scorecard is user-facing in v1. | Laura Q1–Q4; Graham Q1, Q3 |
| **B** | **Single-agent vs multi-agent T1 loop** | Whether Alexander's T1 message loop ships single-agent, or whether sub-agent spawn (Copilot-CLI-as-Provider) must show up in T1 to honor Aaron's vision-Q5. | Alexander Q6; Graham US-G-NEW-3 / Q5; Aaron vision-Q5 |
| **C** | **Mirror — render surface ownership & L5 emission path** | Who renders the badge in the CLI prompt; whether L5 emits MirrorEvents directly or round-trips through L1; the priority/ordering authority for `@inbox`; cross-session scope in T1; DecisionRecord.alternatives wiring. | Rosella Q1, Q3, Q6; Valanice Q1, Q2, Q5; Erasmus Q3; Sonny Q6 |
| **D** | **Conformance scope & pause-verdict tier** | A1+A3+A4 enforced in T1 vs A1 smoke + spec only; pause verdict tier (T1 with Sonny breakpoints or T2 with substrate spike); conformance suite enumeration. | Laura Q1; Gabriel Q4; Alexander Q2, Q5 |
| **E** | **Fork verb scope** | HEAD-only vs `--at-last-decision`; checkout owner; merge/adopt semantics; snapshot CLI surface; template tier. | Erasmus Q1, Q2, Q7; Roger Q4, Q5; Graham Q3 |
| **F** | **Package rename & timing** | When `skillsmith-runtime` → `skillsmith-prescriber` lands; whether T1 binary lives in `crucible-runtime` or split with `crucible-cli`; MCP-tool extensibility ceiling. | Alexander rename, Q3, Q4; Sonny Q6 |
| **G** | **Cross-session scope & cheap insurance** | Cross-session retrieval (US-G-1) needed for week-one bar?; `tenant_id` floor in T1; explicit acknowledgement stories for inherited Cairn surfaces. | Graham Q2; Roger Q3, Q6; Rosella Q3 |
| **H** | **Vocabulary fence & approval routing** | Where the gdb-speak fence is enforced; whether L5 pauses get a typed `category: investigation`; whether US-S-9 is fully absorbed; verdict-enum extension as a cross-team story. | Valanice Q1, Q4; Sonny Q2, Q3 |
| **I** | **Architect-routed micro-questions** (NOT for Aaron) | Router process placement inline vs co-process; policy hot-swap fence; archivist crash-detect urgency; Provider home; plugin manifest package location; MirrorEvent↔event_log join key; per-row lineage on WAL; hook-bus WASM ABI seam in T1; signal_samples capture bounding; change_vectors generalization. | Gabriel Q1, Q3, Q5; Rosella Q4, Q5, Q6, Q7; Roger Q1, Q2, Q7 |

---

## 3. Recommended walking order

1. **A** — cascades into B/D/E. Answer this first or every other answer is conditional.
2. **B** — real tension with vision-Q5; Alexander's T1 sizing depends on it.
3. **E** — gives the productivity-loop its concrete user shape (`crucible fork` is the verb that makes "Crucible improves Crucible" *actionable*).
4. **C** — Mirror is the only observability surface in T1; render-ownership unblocks Rosella's and Valanice's sprint planning.
5. **D** — conformance scope and pause-tier are tightly coupled to A's answer; revisit after A.
6. **G** — cheap insurance + scope quantifier; quick yes/no items.
7. **H** — vocabulary fence (Valanice flags as pre-output blocker) + L4 routing nits.
8. **F** — rename + binary ownership; mechanical, do last so we don't bikeshed early.
9. **I** — route to Graham as a single architect-batch after Aaron-facing clusters land.

---

## 4. First cluster posed — **Cluster A: "by Crucible" strong vs weak read**

This is the single highest-leverage question in the whole opens pile. Laura asks it explicitly (Q1) and her A3-in-T1 call depends on it. Graham's Q1 is the same question from the Router angle ("autonomously applied" vs "proposed + Aaron approves"). Laura's Q2–Q4 (what counts as an improvement, how many in a week, scorecard user-facing?) are downstream sizing once we pick a reading.

### The question

The falsifiable bar is *"Aaron can run a one-week productivity loop where every improvement to Crucible is made **by** Crucible."*

What does "by Crucible" require? Two coherent readings:

- **Strong read:** Crucible **proposes** the improvement, Crucible **replay-investigates** the prior decisions that led to it, Crucible **applies** the change (Router auto-apply where policy permits), Crucible **records the outcome** into the scorecard. Aaron is a reviewer/approver in the loop, not the executor.
- **Weak read:** Crucible **proposes** the improvement (with rationale, alternatives, fitness signal). Aaron approves and applies manually using normal tools (editor, git, npm). Crucible records the accept/reject signal.

### What hinges on the answer

| Decision | Strong read → | Weak read → |
|---|---|---|
| **A3 (replay equivalence)** tier | **T1, non-negotiable** (Laura). Without A3, Crucible cannot trust its own causal slice when next-week Crucible references this-week Crucible. | T2 (Laura). Conformance kit shrinks to A1 + A4 in T1. |
| **Router (US-G-4)** T1 scope | Per-category auto-apply policy table persisted in WAL; Mirror surfaces every auto-action. | Ack-required-everywhere; Router is a *gate*, not an *actor*. Materially cheaper T1. |
| **What counts as an improvement** (Laura Q2) | At least one generator per improvement category (code / prompt / fitness-weight / plugin-pin / schema). | A single end-to-end slice on any one path is sufficient. |
| **Scorecard (US-L-NEW-13-MIN)** | User-facing in Mirror Dashboard so Aaron can see week-over-week trend. | Internal eval artifact only; no presentation in T1. |
| **Hermetic replay record path** | Must record *every* primitive (LLM call, tool call, hook verdict, decision). | Record-only of the orchestration spine is enough; deep content capture defers. |
| **Bootstrap-loop falsifiability** | Aaron at end-of-week can point to a list of changes Crucible authored, executed, and validated. | Aaron at end-of-week can point to a list of changes Crucible authored and Aaron approved. |

### My recommendation

**Strong read — but bounded.** Specifically:

- "By Crucible" means **propose + replay-investigate + apply + record outcome.** Router auto-applies in the small set of categories where the existing safety rails (negative-impact gate, hint dedup, fail-open, attribution-stamped `source`) already give us defensible confidence — i.e., the `auto-apply` row of Aaron's Curator authority model (`decisions.md:398-403`). Everything else still stages for explicit ACK via Mirror.
- **A3 stays in T1.** Laura is right that A3 is the rigor mechanism that lets next-week's loop reference this-week's loop. Without it the loop is theatre.
- **Improvement = any one of {code change, prompt change, fitness-weight change, plugin pin bump}.** Schema migrations stay out of v1 scope. The scorecard partitions by improvement-type from day one (Laura's free-multiplier on the closed `source` enum).
- **Scorecard is user-facing in Mirror Dashboard.** One T1 view, no authoring. Hardcoded `@today`/`@inbox`/`@lobby` per Valanice NEW-2a already give us the render slot.

**Reasoning:** the weak read makes the bar trivially satisfiable and doesn't actually validate the thesis. Aaron has already approved code with Copilot CLI for years; "Crucible proposes, Aaron applies" is incrementally better tooling, not a thesis test. The whole point of the v1 framework Aaron locked is to find out whether the harness substrate (replay, fork, hook bus, Mirror, Router, conformance) is worth the engineering cost. That answer requires Crucible to actually *close the loop*, including the apply step, at least within the auto-apply category Aaron has already endorsed.

The cost of the strong read is bounded: A3 is ~1 week of focused work on top of the substrate Roger and Alexander are already shipping (read-set hash is locked, replay harness is in Alexander's T1, conformance carrier is in Laura's T1). The cost of the weak read is *invisible* — we'd ship a prettier Cairn + Forge and not know if the substrate was worth it.

**If Aaron picks the weak read:** I'll re-tier A3 → T2, shrink Router T1 to gate-only, drop the scorecard from Mirror in T1, and let Alexander defer the deep capture path. PRD shape stays coherent.

---

### Cluster A — turn 1 follow-up (Aaron asked for substance, not just framing)

Aaron's response: *"I need more context here to understand the levers we're pulling and the tradeoffs."* He wants the concrete implementation deltas, eng-time, a real scenario, and an honest naming of what each read costs and risks. Unpacking below.

#### 4.1 What ships in T1 under each read (concrete inventory)

| Component | Weak T1 | Strong-bounded T1 |
|---|---|---|
| **Generators (L3)** | 1 family wired: Forge prescribers (Cairn already ships; Roger US-R-4 = enabled-for-free Drift generator). | Same 1 family. (No new generators; the read difference is downstream of L3, not at it.) |
| **Router (L4)** | Pure gate. Every prescription → `attention` Mirror notification → Aaron acks/rejects. No persisted policy table, no auto-apply path wired. | Persisted policy table (`router_policies` row per `(category, source, confidence-band) → verdict`). Auto-apply verdict path wired *only* for `category=hint-prioritization` (the one row of Aaron's Curator authority model labeled ✅ auto-apply, `decisions.md:399`). Every auto-apply emits an `attention`-tier Mirror event carrying `policy_version` + `causal_read_set_hash` (Gabriel R4 substrate already shipping in WAL). |
| **Applier (L4 → disk)** | Aaron's editor. Crucible writes nothing to source files. | Crucible's Applier (Forge already has it — `forge/src/applier`) wired through Router. Inside the one auto-apply category, Crucible writes the change (a `change_vectors` row reordering hint priorities — *not* a code file edit). All code-file edits still stage for ACK. |
| **Hermetic capture (L0/L1)** | Record path on, same as strong (substrate ships either way per Alexander). | Same. Record path is T1 in both reads. |
| **A3 (replay equivalence)** | Conformance test exists as a *spec*, not enforced in CI. Failures are warnings. | Conformance test runs in CI on every PR. Failures break the build. One canonical recorded session + assertion that replay produces byte-equal final state (Gabriel NEW-16a) + Laura's A3 assertion on every recorded session in the corpus. |
| **Mirror Dashboard** | `@inbox` + `@today` + `@lobby` (Valanice NEW-2a). No scorecard view. | Same three views + a 4th hardcoded view `@scorecard` rendering Laura's US-L-NEW-13-MIN (per-generator: acceptance rate, A3 pass rate, `source` attribution). Plus `category: bootstrap` MirrorEvent class (Erasmus surprise #4) so "Crucible just modified Crucible" is a named, filterable event. |
| **`crucible fork`** | T1 either way (Erasmus). | T1 either way. Under strong, `crucible fork --at-last-decision` gets promoted (Erasmus Q1) so a misfired auto-apply is one verb away from reverted. |
| **What Aaron literally types** | `crucible` (start) → prompt → reads `@inbox` → `crucible accept <pid>` → opens editor → types/saves → `git add` → loop. | `crucible` (start) → prompt → reads `@inbox` → for non-auto categories: `crucible accept <pid>` (Crucible's Applier writes the file) → for auto categories: nothing, Crucible already applied and Mirror told him → optional `crucible replay <session>` to verify bit-equality → optional `crucible fork --at-last-decision` to revert. |

#### 4.2 Eng-time delta (pulled from triages)

Baseline T1 (everything in *both* reads): Gabriel estimates ~4–6 weeks FTE for the safety + productivity-loop T1 he owns; Roger's substrate runs in parallel; Alexander's loop is ~3–4 weeks; Rosella's projectors ~50–60h plus plugin-pinning 1–2 weeks; Valanice/Sonny/Laura T1 surfaces ~1–2 weeks each interleaved. Realistic T1 calendar: **~8–10 weeks elapsed** with the work parallelized across the squad.

**Delta the strong read adds, on top of the baseline both reads ship:**

| Strong-only lever | Source estimate | Realistic add |
|---|---|---|
| A3 conformance enforced in CI (fresh harness per Laura; Gabriel's NEW-16a smoke = 1 sprint) | Laura: "fresh harness required"; Gabriel: sprint 4 | **5–8 engineering days** |
| Router auto-apply path wired for the one endorsed category (policy row, verdict eval, applier call) | Graham US-G-4 T1 full; existing `NEGATIVE_IMPACT_AUTO_APPLY_GATE` substrate | **5–7 engineering days** |
| Applier wiring (Crucible-driven write into `change_vectors` for hint-prioritization category) | Forge Applier already exists | **2–3 engineering days** |
| `@scorecard` Mirror view + `category: bootstrap` event class + DecisionRecord.alternatives wire-up | Erasmus T1.E.2 (~2h); Laura US-L-NEW-13-MIN; new Dashboard view template | **3–5 engineering days** |
| `crucible fork --at-last-decision` (Erasmus Q1 — degenerate special case of HEAD-fork) | Erasmus: "1-line variant" | **1 engineering day** |

**Total strong-vs-weak T1 delta: ~16–24 engineering days = ~2–3 calendar weeks** (parallelized across Laura+Gabriel for A3, Graham+Alexander for Router/Applier, Rosella+Valanice for scorecard view). That makes T1 calendar **~10–12 weeks instead of ~8–10 weeks** for the strong read. ~25–30% T1 expansion.

#### 4.3 Concrete week-one narrative

**Setup (both reads):** Aaron starts the week. Crucible is running. He's working in `D:\git\harness\` on Cairn's `optimizationHints.ts` — the dedup logic.

**Monday morning, both reads:** Aaron asks Crucible to help him understand why `hasActiveOptimizationHint` is slower than expected. Crucible runs the session, the Drift generator (Roger US-R-4) notices `change_vectors` shows the function's calls have been growing in latency over the last 20 sessions. It emits a prescription: "reorder the hint-priority weights so cheaper hints fire first" (category=`hint-prioritization`, confidence=0.84, source=`builtin`).

**Monday afternoon — divergence point:**
- **Weak:** Mirror's `@inbox` shows the prescription with rationale + alternatives + `↻` replayability badge. Aaron reads the alternatives, decides he likes the reasoning, runs `crucible accept <pid>`. Crucible logs the accept. Aaron then opens `optimizationHints.ts`, manually changes the weights, runs tests, commits.
- **Strong:** Mirror's `@inbox` shows the prescription. Confidence 0.84 + category=`hint-prioritization` + source=`builtin` matches Aaron's auto-apply policy row. Router emits verdict=`auto-apply`. Crucible's Applier writes the new weights into the `change_vectors` table (not the source file — this category mutates *data*, not code). An `attention`-tier MirrorEvent fires: `"Crucible auto-applied hint-prioritization change. Reason: drift in hasActiveOptimizationHint. Reversible via crucible fork --at-last-decision."` Aaron sees the badge.

**Tuesday–Thursday:** Aaron continues working. 4 more prescriptions land: 2 are auto-apply (more hint reorderings); 2 are code changes to a Forge prescriber (NOT in the auto-apply category — both reads still require Aaron's ACK and Crucible-Applier writes the file). Under weak, Aaron edits manually. Under strong, Aaron acks and Crucible writes.

**Friday afternoon — bar evaluation:**
- **Weak:** Aaron looks at `@inbox`. 5 prescriptions accepted, 2 rejected. He says: "Crucible's suggestions were useful — felt like a smart pair-programmer." But: he can't show that the substrate (replay, fork, hook bus, conformance, scorecard) was *load-bearing* for that experience. The same week could have been delivered by a polished Copilot CLI with a prescription queue. **The thesis is unfalsified — and untested.**
- **Strong:** Aaron runs `crucible @scorecard --week`. Sees: Drift generator 5 prescriptions / 4 accepted / 1 rejected / 5 A3-passing on replay. He runs `crucible replay <monday-session>` — produces byte-equal final state. Confidence grows. Then on Friday: Crucible's Drift generator emits a *bad* hint reorder (the failure mode below). Router auto-applies it. An `attention` Mirror event surfaces. Aaron runs `crucible fork --at-last-decision`, reverts, and now has *two sessions on disk* — the apply branch and the revert branch — both replay-clean. He posts a 1-line `crucible why <bad-pid>` and gets the read-set that produced the bad recommendation. **The thesis is tested: substrate paid for itself in catch-time and reversal-cost.**

#### 4.4 What we'd miss under weak (the falsifiability gap)

The harness thesis is: *the substrate (replay + fork + hook bus + Mirror + Router + conformance) is worth ~10 weeks of engineering because it produces something Copilot-CLI-plus-prescriptions cannot.* The weak read doesn't test this. Under weak, every "improvement" passes through Aaron's hands before touching disk — which means **the WAL records Aaron's actions, not Crucible's.** Replay's value collapses (you're replaying Aaron-and-Crucible, not Crucible-alone). Conformance is a spec without a load-bearing consumer. Router is a queue. Scorecard is a log. We ship in ~8–10 weeks, learn that prescriptions are nice, and still haven't answered the question Aaron wrote the framework to answer.

Concretely unvalidated under weak:
- Whether replay's bit-equality guarantee buys real reproducibility (no auto-apply → no Crucible-authored-and-applied event chain to replay against).
- Whether Router's policy table + verdict-stream recording is worth the schema cost (no verdicts ever fire `auto-apply`; the table is decoration).
- Whether the scorecard surfaces a useful trust signal (no auto-applies → only Aaron-curated accepts → scorecard collapses to acceptance rate, which the existing `Prescription.status` already gives us in Cairn today).
- Whether `crucible fork --at-last-decision` is the right reversal primitive (no auto-applies → never exercised in anger).

The weak read is the "we built a really nice substrate; we'll find out next quarter whether it was worth it" read. T2 then becomes the actual thesis test, and we've spent a quarter building substrate we haven't validated.

#### 4.5 What we'd risk under strong (the misfire failure mode)

The category Aaron has endorsed for auto-apply is `hint-prioritization` (`decisions.md:399`). It's the safest possible category by construction: it reorders weights inside `change_vectors`; it touches no source code; the Forge applier reads it and adjusts which hints fire first. The blast radius of a misfire is "the next prescription cycle emits a suboptimal hint."

**Failure scenarios and catches:**

| Failure mode | Existing catch | New catch from strong T1 |
|---|---|---|
| Crucible auto-applies a hint reorder that causes net-negative drift | `NEGATIVE_IMPACT_AUTO_APPLY_GATE = -0.2` inclusive (`decisions.md:31`) — Forge gates auto-apply at the boundary. Hint dedup (`ACTIVE_HINT_STATUSES`) prevents re-firing the same recommendation. Fail-open semantics (`W3-Impl-4`). | Router verdict carries `policy_version` + `causal_read_set_hash` (Gabriel R4 substrate). Aaron can run `crucible why <bad-event>` → see exactly which read-set produced the recommendation, audit the policy version, revert via `crucible fork --at-last-decision` (1 verb, ~1 sec). |
| Crucible auto-applies and silently corrupts the WAL | `withShadowEvent` wrapper + replay-invariant CI test (`decisions.md` Open #4) — caught at next CI run. | A3 in CI catches divergence on the *next* replay of any session, immediately. Without strong T1, A3 is unenforced and the corruption ships. |
| Router auto-applies in a category it shouldn't (policy table bug) | None today. | Mirror notifies at `attention` tier on every auto-apply (visible badge); `@scorecard` shows a per-category count; if `code-change` count > 0 in week one, Aaron sees it immediately and revokes the policy row. |
| Aaron disagrees with a series of auto-applied changes | `Prescription.status='rejected'` reverses one. | `crucible fork --at-last-decision` reverses the *session*. Persisted policy table can be edited to remove the category from auto-apply for any future session. |

**Net risk assessment:** the misfire surface is small, the blast radius is bounded to data not code, the existing safety rails already gate it, and the strong-T1 additions (A3 in CI + Mirror attention badges + `--at-last-decision` fork + scorecard) are the catches we'd build anyway in T2. We'd just be building them on a substrate we've already validated, instead of building them speculatively.

#### 4.6 Recommendation (sharpened, unchanged)

**Strong-bounded read.** Auto-apply is permitted only for `category=hint-prioritization` in T1. Every auto-apply emits an `attention`-tier MirrorEvent carrying `policy_version` + `causal_read_set_hash`. A3 is enforced in CI. Scorecard ships as the 4th hardcoded Mirror view. `crucible fork --at-last-decision` is promoted to T1.

**The trade:** ~2–3 calendar weeks of additional T1 engineering (~25–30% T1 expansion) buys a v1 that **actually tests the thesis** instead of postponing the test to T2.

**Reversibility:** if at the end of week one Aaron decides auto-apply was a mistake, he revokes the policy row, Crucible reverts to weak-mode behaviorally (no policy matches → no auto-apply verdicts → every prescription stages for ACK), and the strong-T1 investment in A3/scorecard/fork-at-last-decision still benefits T2. So the strong read isn't a one-way door.

---

## Next turn — Cluster B (single-agent vs multi-agent T1 loop)

### Cluster A — LOCKED (2026-05-25)

**Aaron's call:** Strong-bounded read. Reversibility was the deciding factor.

**Downstream impacts now locked in the PRD:**
- A3 (replay equivalence) enforced in CI from T1.
- Router auto-apply path wired in T1 for `category=hint-prioritization` only; every auto-apply emits `attention` MirrorEvent with `policy_version` + `causal_read_set_hash`.
- Crucible's Applier wired through Router for the one auto-apply category (data write to `change_vectors`, never source files in T1).
- `@scorecard` is the 4th hardcoded Mirror Dashboard view in T1 (per-generator: acceptance, A3 pass rate, source attribution).
- `category: bootstrap` MirrorEvent class (Erasmus surprise #4) ships in T1.
- `DecisionRecord.alternatives` wired into Mirror (Erasmus T1.E.2).
- `crucible fork --at-last-decision` promoted to T1 (Erasmus Q1) as the reversal primitive for misfired auto-applies.
- "An improvement" in v1 = {code change, prompt change, fitness-weight change, plugin pin bump}. Schema migrations explicitly out of v1.
- T1 calendar shifts ~8–10 weeks → ~10–12 weeks parallelized.

### Cluster-agenda restructuring after A locked

Cluster D ("conformance scope & pause-verdict tier") is mostly resolved by A: A3 in T1 is locked; A1+A3+A4 is the kit (A2 still T2). What remains in D = pause-verdict tier (Alexander Q2) + conformance enumeration (Alexander Q5). Demoted to a small follow-up; will roll into Cluster D′ after B.

Cluster E ("fork verb scope") is partially resolved by A: `crucible fork --at-last-decision` is in T1. Remaining E items (checkout owner, merge/adopt semantics, snapshot CLI surface, template tier) are smaller and roll into a single mop-up cluster later.

New walking order:

1. ✅ A — locked.
2. **B — single-agent vs multi-agent T1 loop** (next; below). Real tension with Aaron's vision-Q5; Alexander's T1 sizing depends on it; cascades into Cluster C (Mirror render under parallel sessions), Gabriel US-1/US-2 (sub-agent isolation), Valanice US-V-5 (multi-session UX).
3. C — Mirror render-surface ownership & L5 emission path (post-B; sub-agent answer constrains the render shape).
4. E′ — fork-verb mop-up (checkout, merge/adopt, snapshot CLI, templates).
5. D′ — pause-verdict tier + conformance enumeration.
6. G — cross-session scope & cheap insurance.
7. H — vocabulary fence + L4 routing.
8. F — package rename + binary ownership.
9. I — architect-routed micro-questions (single batch to Graham).

---

## Cluster B — Single-agent vs multi-agent T1 loop

### The tension (real, not papered)

- **Aaron's vision-Q5 (LOCKED 2026-05-24, `decisions.md:377`):** *"Sub-agent execution model: flexible (persistent + parallel preferred). Anchor reference: Copilot CLI's `task` tool — long-lived sub-agents that can run concurrently, accept follow-up messages, and be polled for results. **Sequential single-active-agent is too constrained.**"*
- **Alexander's T1 triage (2026-05-25):** T1 message loop is single-agent. Multi-turn driver wraps `ForgeSession.sendAndWait`. *"No multi-agent conducting in T1."* Sub-agents → T3 (US-A-2 + US-A-NEW-4 + Gabriel US-1/US-2 + Valanice US-V-5 cluster). Asks Q6: confirm single-agent T1 acceptable.

These contradict each other directly. Q5's "too constrained" is the strongest preference language anywhere in Aaron's locked decisions; Alexander's T1 deliberately ships exactly that constrained shape. We have to resolve it explicitly or the PRD lies.

### Four coherent options

| # | Option | T1 spawn surface | Concurrency | Eng-time delta vs Option 1 | Honors vision-Q5? |
|---|---|---|---|---|---|
| **1** | Strict single-agent T1 | None. No spawn API exists. | N/A | baseline | **No.** Ships the exact shape Q5 calls "too constrained." |
| **2** | Single-agent T1, **spawn seam reserved** | Spawn API surface declared with stub implementation that throws `NotImplementedInT1`. Loop, hook table, primitive-append seam all factored so a real implementation drops in without rewriting them. | N/A in T1 | +2–3 days (interface design discipline; Alexander already reserves a hook-table slot the same way) | **Partially.** Q5's shape is unbuilt but unblocked for T2. |
| **3** | T1 ships **degenerate one-sub-agent spawn** | `crucible.spawn(prompt, {parent_session_id}) → child_session_id`. Crucible can spawn exactly one Copilot-CLI-as-Provider sub-agent at a time. Parent polls child for status/results. No DAG, no scheduling, no N≥2 parallelism, no fitness allocation. | One parent + at most one live child | +1–2 calendar weeks (spawn API + session linking via existing parent_session_id schema + minimal IPC + Mirror render for two concurrent sessions + Provider abstraction must support spawning, not just connection) | **Largely.** Q5's "long-lived, follow-up messages, poll for results" all exercisable at N=1. Doesn't prove N≥2 but the seam is real and used. |
| **4** | Full multi-agent T1 | Spawn + DAG + scheduling + parallel coordination. Gabriel US-1/US-2 (isolation, crash recovery), Valanice US-V-5 (multi-terminal UX), Alexander US-A-NEW-4 (sub-agent DAG) all pulled forward. | N parallel children, DAG-scheduled | +4–6 calendar weeks (Alexander+Erasmus+Gabriel+Valanice all add T1 work; existing T3 cluster collapses into T1) | **Yes, literally.** |

### What hinges on the answer

| Decision | Opt 1 | Opt 2 | Opt 3 | Opt 4 |
|---|---|---|---|---|
| Alexander's T1 message-loop scope | as-triaged | +interface discipline | +spawn API + session linking + Provider-supports-spawn | full DAG runtime |
| Mirror render | one session at a time | one | **must render two concurrent sessions** (parent + child events interleaved or split-view) | N concurrent sessions |
| Provider abstraction (Round 6 #1) | connection only | connection only | connection + spawn | connection + spawn + lifecycle |
| Gabriel US-1/US-2 (sub-agent isolation, crash recovery) | T3 | T3 | T2 (degenerate case lives without full isolation; child crash = surface in Mirror, parent continues) | T1 |
| Valanice US-V-5 (multi-terminal UX) | T5 | T5 | T2-ish (one extra session, single-terminal still works) | T1 |
| Erasmus US-E-8 (sub-agent topology ingest) | T4 | T4 | T2 (one parent/child link is the minimum case) | T1 |
| T1 calendar (cumulative with A) | ~10–12 wk | ~10–12 wk | ~11–14 wk | ~14–18 wk |
| Honors locked vision-Q5 | violates | softens | yes, minimally | yes, literally |

### My recommendation: **Option 2**, with a documented path to Option 3 mid-T1 if dogfood demands it

**Recommendation: Option 2 — single-agent T1 with the spawn seam reserved and discipline-enforced.**

**Reasoning:**

1. **The week-one falsifiable bar is single-agent by construction.** Aaron is one human at one terminal improving one harness. Parallel sub-agents would let Crucible delegate investigation while Aaron works on something else — useful, but not load-bearing for the bar. The strong-bounded thesis test (Cluster A) is fully exercised single-agent: Crucible auto-applies hint-priority changes, Aaron replays, scorecard accumulates, fork-at-last-decision reverses. None of that requires N≥2.

2. **Vision-Q5's "too constrained" is an architectural preference, not a T1 ship requirement.** "Preferred" + "too constrained" together say: *don't bake single-agent assumptions into the substrate*. Option 2 honors that exactly. The loop is single-agent in *behavior* but multi-agent in *shape* — the same discipline Alexander already applies to the hook-table slot (registered, empty) and to `pause` verdict reservation. This is the cheapest possible vision-Q5-compliant T1.

3. **Option 3 sounds tempting but smuggles real risk into T1.** A degenerate one-child spawn forces: (a) the Provider abstraction to support process spawning (not just connection), (b) the Mirror render to handle interleaved parent/child event streams (Cluster C grows materially), (c) at least minimal sub-agent isolation so a child crash doesn't kill the parent (Gabriel work pulled forward), (d) the WAL projector to handle two concurrent session writers. That's +1–2 calendar weeks of T1, *and* it's the most-likely-to-overrun chunk because it touches L0/L1/L2/L5 simultaneously. We risk destabilizing the substrate-validation work that Cluster A just made the v1 thesis.

4. **Option 2 is reversible in-flight; Option 3 isn't.** If Aaron starts dogfooding at week 6 of T1 under Option 2 and immediately wants to delegate, we can drop the Option 3 implementation in behind the reserved seam in 1–2 weeks of focused work — slipping T1 ship by that much, not destabilizing what's already built. The seam IS the path. Whereas if we ship Option 3 and it doesn't work right, we've burned 1–2 weeks AND have a destabilized substrate to debug.

5. **Option 4 is a non-starter for v1.** +4–6 weeks for a feature whose first real exercise is Aaron + one harness is throwing engineering at a problem that doesn't exist yet. Defer to T3 per Alexander's triage.

**Concrete T1 seam discipline under Option 2:**

- Alexander declares `crucible.spawn(prompt, parent_session_id) → Promise<SessionHandle>` in the trunk SDK. T1 implementation throws `NotImplementedInT1('sub-agent spawn deferred to T2; see decisions.md')`.
- Primitive-append seam in the message loop accepts an optional `parent_session_id` field on every primitive (already in the WAL row per Aaron decision 2a). T1 always writes `null`.
- Mirror Projector schema includes `parent_session_id` in MirrorEvent payload (zero-cost; already on WAL row).
- Provider abstraction (Round 6 #1) declares a `spawnChild()` method that throws in T1. SDK adapter satisfies the interface trivially.
- Dependency-cruiser rule ensures no T1 caller invokes `spawn()` — caught at lint time, not test time.

**Cost of seam discipline:** ~2–3 engineering days (interface design, lint rule, doc). Negligible vs T1 budget.

**Fallback trigger:** if Aaron's first week of dogfood (T1 sprint 1–2 user testing) surfaces a concrete delegation use case ("I want Crucible to investigate this in the background while I keep working"), we promote Option 3 mid-T1 with a documented +1–2 week slip. The seam is the path; we don't rewrite, we fill in.

**What I'm NOT recommending and why:**

- Not Option 1: violates a locked vision decision.
- Not Option 3 unprompted: too much T1 risk for a capability the week-one bar doesn't require.
- Not Option 4: defers correctly to T3 per Alexander, already triaged.

---

## Cluster B — LOCKED (2026-05-25)

**Decision:** Option 2 — single-agent T1 in behavior, multi-agent in shape (spawn seam reserved).

**Aaron's words verbatim:** *"Option 2 - noting, multi-agent is a critical part of my normal workflow. Doesn't mean we need it in T1 but it will be limiting"*

**Locked T1 surface:**
- `crucible.spawn(prompt, parent_session_id) → SessionHandle` declared in trunk SDK; throws `NotImplementedInT1`.
- Primitive-append seam accepts optional `parent_session_id` (already on WAL row per Aaron 2a); T1 always writes `null`.
- MirrorEvent payload includes `parent_session_id` (zero-cost, on WAL).
- Provider abstraction declares `spawnChild()`; throws in T1; SDK adapter satisfies trivially.
- Dependency-cruiser rule: no T1 caller invokes `spawn()`.
- T1 calendar: **~10.5–12.5 weeks** (Cluster A baseline + ~2–3 eng-days for Option 2 discipline).

**Aaron's constraint flag (captured for downstream):** multi-agent is load-bearing in his day-to-day workflow. T1 single-agent shape will be **felt** during week-one dogfood, not just tolerated. Two PRD-level implications:

1. **§3 (Scope boundaries / non-goals) must explicitly call out single-agent as a known T1 constraint.** The v1 success-metrics framing has to anticipate "this would be faster if I could fan out" complaints during dogfood and pre-classify them as *expected friction*, not *thesis failure*. Otherwise the constraint will read as a bar miss when it's a deliberate-and-named trade.

2. **Tier-prioritization input for Cluster H (sequencing):** the post-T1 tier that first lights up real multi-agent (N≥2) should be **promoted in priority** relative to the original 9-author triage. Original triage put sub-agent DAG in T3 (Alexander US-A-NEW-4, Erasmus US-E-8 scheduler half) and multi-terminal UX in T5 (Valanice US-V-5). Aaron's constraint pushes the first-N≥2 lighting story up the post-T1 queue. **Capture this as input; don't decide T2/T3/T5 sequencing yet — that's Cluster H.**

---

## Cluster C — Mirror in T1 (render ownership + scope + L5 emission)

The Mirror schema is locked (Graham #3). The producer pattern is locked (Rosella L1Subscriber + commitment #10). What is **not** locked, and what Cluster A's strong-bounded read just made urgent, is **how Mirror actually looks and behaves from Aaron's seat in week-one dogfood.**

Three coupled sub-questions:

- **C1 — Who renders the push notification badge in the CLI prompt?** (Rosella Q1; Sonny Q6 related)
- **C2 — Single-session or cross-session dashboard in T1?** (Rosella Q3; Valanice US-V-NEW-4a)
- **C3 — Do L5 outputs (bisect verdicts, `why-one` results, breakpoint registrations) emit MirrorEvents directly, or round-trip through L1?** (Valanice Q2)

I'm posing them as one cluster because the answers constrain each other and all three need to be resolved before Rosella, Valanice, or Alexander can size sprint 1.

### Concrete week-one narrative

**Setup:** Aaron is at his terminal Monday morning. Crucible is running. He's worked in three sessions so far this week (Mon, Tue, Wed) on different parts of the harness.

**Scenario 1 — Push notification during work.** Wednesday at 14:32, Crucible's Drift generator emits a prescription (the Cluster A scenario). It auto-applies. An `attention`-tier MirrorEvent is committed.

- **Who shows Aaron the badge?** Aaron is mid-typing in the Crucible prompt: `crucible> investigate the slow path in dedup_`. The next time the prompt re-renders (next keystroke, or after Crucible's response completes), does `[🔔1]` appear inline, or is the badge invisible until Aaron types `crucible mirror`?

**Scenario 2 — Friday scorecard review.** Aaron runs `crucible @scorecard --week`. Cluster A locked this view as showing per-generator week-over-week trend.

- **Does this aggregate across Mon/Tue/Wed sessions, or only the active session?** A single-session scorecard renders an empty `@scorecard` Monday, a sparse one Tuesday, and only on Friday in the *last* session does it show full data. That defeats the trend purpose.

**Scenario 3 — Investigation output.** Tuesday at 11:00, Aaron suspects a regression. Runs `crucible why event:0193abc` (Sonny T1-D4). Gets back a 4-row read-set as a tool response.

- **Does this also create a MirrorEvent that shows up in `@inbox` later?** Aaron at 17:00 wants to find that result again — is it in `@inbox`, or does he have to re-run the query? And if it IS in `@inbox` automatically, does every `crucible_walk_events` page also pollute `@inbox`?

These are three concrete moments. Each has a different right answer; each forces a different T1 build.

### Options table

#### C1 — Push notification render ownership

| # | Owner | Mechanism | Pros | Cons |
|---|---|---|---|---|
| **C1.a** | **Crucible CLI process (Alexander's binary)** | Mirror Projector exposes `getUnreadCount({session_id?, level_min?, since_ts?})`. CLI calls it on every prompt re-render; prepends `[🔔N]` if N>0. Click/typing/`mirror` command dismisses + marks read. | Matches Aaron's vision-Q4 verbatim (*"social-media-style activity indicator, visible in CLI prompt"*). Single integration point. Reuses Alexander's prompt-rendering loop. | Couples Crucible CLI binary to Mirror schema (small surface — one query method). |
| **C1.b** | **Mirror as separate binary/pane** | Aaron runs `crucible mirror` as a separate process; CLI doesn't render badges. | Cleanest separation; Mirror is fully self-contained. | Violates vision-Q4 (no inline indicator). Aaron must context-switch to see notifications. Defeats the "don't interrupt session work" framing. |
| **C1.c** | **Thin shim in `runtime-cli`** | A middleware layer between Alexander's binary and the prompt-render call. | Avoids direct Crucible-CLI-to-Mirror coupling. | Splits ownership across two packages for one feature; doesn't render any differently from C1.a; introduces an indirection without product value. |

#### C2 — Single-session or cross-session in T1

| # | Scope | Implication |
|---|---|---|
| **C2.a** | **Single-session dashboard.** `@inbox`/`@today`/`@lobby`/`@scorecard` scoped to active session. Cross-session views deferred to T2 (Valanice US-V-NEW-* full). | Simpler queries. **Breaks Cluster A's scorecard purpose** — week-over-week trend isn't visible until the entire week is in one session, which never happens. |
| **C2.b** | **Cross-session dashboard from T1.** Views aggregate across all sessions by default; `@today` filters by date, `@active` filters by session if Aaron wants that. | Matches Valanice's NEW-4a recommended T1 ("multi-source `@inbox` absorbing Forge prescriptions + Curator insights + L5 pauses"). Required by Cluster A's scorecard. Slightly more SQL on the projection side. |

#### C3 — L5 output emission path

| # | Pattern | Implication |
|---|---|---|
| **C3.a** | **All L5 outputs emit MirrorEvents via L1 round-trip.** Every `why-one` query, every `walk_events` page, every bisect step writes a primitive → projector materializes a MirrorEvent. | Pure: everything is auditable, replay reproduces queries. **Pollutes `@inbox`** — read queries are not findings; the noise floor swamps signal. Defeats the inbox as an action surface. |
| **C3.b** | **All L5 outputs emit MirrorEvents directly, bypassing L1.** Derived views write derived events. | Clean separation: L1 = primitives, L2 = views including investigation. **Violates decision #10** (L2–L5 don't write to L1, but Mirror IS an L2 projection of L1 commits — direct writes break the projector pattern). Replay can't reproduce L5 outputs. |
| **C3.c** | **Hybrid: L5 *findings Aaron explicitly marks* go through L1 → MirrorEvent; L5 *one-shot query responses* return to caller and don't auto-emit.** Aaron can `crucible pin <event_id> "this is the regression introducer"` and *that* becomes a primitive + MirrorEvent. `crucible why <id>` just returns the read-set; no MirrorEvent fires. | Honors decision #10 (only primitives go through L1). Replay reproduces marks because they're primitives. Read queries stay read-only. `@inbox` shows actions and intentions, not query exhaust. |

### My recommendation

**C1.a** + **C2.b** + **C3.c**.

#### C1.a — Crucible CLI owns prompt-render of the badge

Aaron's vision-Q4 (locked, `decisions.md:375`) already specified the shape: *"hybrid push/pull. Harness accumulates notifications when something interesting happens (social-media-activity-indicator style). User can view at any time."* The CLI prompt badge IS the push surface. C1.b violates the vision; C1.c is C1.a with extra steps.

**Ownership:** Alexander's `crucible-runtime` calls `MirrorProjector.getUnreadCount(...)` (Rosella's surface) on every prompt re-render. Render formula is a 5-line function. Dismissal happens when Aaron types `mirror`, `@inbox`, or the badge auto-flushes when he views any Mirror surface. Mirror Projector owns the read/unread state column.

**Cost:** ~1 engineering day on Alexander's side + Rosella's projector already exposes the query (planned). Negligible add to the Cluster B–adjusted T1 calendar.

#### C2.b — Cross-session dashboard from T1

Cluster A locked `@scorecard` as a week-over-week trend view. That's inherently cross-session. C2.a would render it nearly empty most of the week, defeating the purpose. Valanice's NEW-4a triage already wants multi-source `@inbox` in T1 (Forge prescriptions + Curator insights + L5 pauses absorbed into one surface) — cross-session falls out of that for free.

**Implication for Rosella:** Mirror Projector materializes `mirror_events` rows keyed by `(session_id, event_id)`; cross-session views are SQL `WHERE created_at >= ?` queries with no session filter. Cost: ~zero beyond the projector that already ships.

**Implication for Valanice:** The four hardcoded T1 views are `@inbox` (cross-session, all unread/actionable), `@today` (cross-session, today only), `@scorecard` (cross-session, week-over-week aggregates), `@lobby` (cross-session, last-N high-signal events). Single-session filter available via `@active` as a 5th view if Aaron asks for it during dogfood — cheap to add behind the same query primitive.

#### C3.c — Hybrid emission: marks through L1, queries return-only

Decision #10 is the constraint: L2–L5 don't write directly to L1 storage; the only path into L1 is the substrate's append. But MirrorEvents are *not* L1 writes — they're L2 projections fed by L1Subscriber. Two coherent paths into Mirror:

- A primitive lands in L1 → Mirror Projector emits a MirrorEvent (the existing pattern).
- An L5 action *creates* a primitive (e.g., `crucible pin`, `crucible breakpoint register`, `crucible bisect mark-bad`) → L1 writes → Mirror Projector emits.

Read-only L5 queries (`why-one`, `walk_events`, scorecard renders) **don't create primitives** and **don't emit MirrorEvents**. They return data to the caller. If Aaron wants to remember a finding, he marks it via a verb that IS a primitive.

This honors decision #10, makes replay correct (marks reproduce because they're primitives; queries reproduce because they're idempotent over the WAL), and keeps `@inbox` an action surface instead of query exhaust.

**Sonny consequence:** his T1-D1 (logpoint), T1-D2 (breakpoint pause), and T1-D4 (`why-one`) split cleanly. T1-D1 logpoint *firing* IS a primitive (the literal observation matched) → MirrorEvent. T1-D2 breakpoint *pausing* IS a primitive (the verdict bus emits a pause) → MirrorEvent. T1-D4 `why-one` is a read query → return-only, no MirrorEvent. Aligns exactly with C3.c.

### Coupling between sub-questions

- C1.a + C2.b: the badge counts unread events across all sessions (matches vision-Q4's "social media indicator" semantics — your phone doesn't show a per-app badge per-chat-thread; it aggregates).
- C2.b + C3.c: cross-session `@inbox` only stays useful if read-query exhaust doesn't pollute it. Picking C3.a would force a per-session `@inbox` (C2.a) just to keep it readable — a regression on Cluster A's scorecard requirement.
- C1.a + C3.c: badge fires only on actionable events (auto-apply notifications, breakpoint pauses, marked findings, prescriptions needing ACK). Read queries don't bump the badge. Aaron's prompt isn't a slot machine.

### What I'm explicitly NOT recommending and why

- Not C1.b (separate Mirror binary): violates vision-Q4.
- Not C2.a (single-session in T1): breaks Cluster A's locked scorecard.
- Not C3.a (everything via L1): turns `@inbox` into query exhaust; replay overhead on read queries is wasted compute.
- Not C3.b (direct emission): violates the L1Subscriber projector pattern; replay can't reproduce L5 outputs.

### Cost summary

- C1.a: ~1 eng-day Alexander (prompt-render hook) + Rosella's query method (already planned).
- C2.b: ~0 incremental over Valanice's NEW-4a T1 plan.
- C3.c: ~0 incremental — defines what existing verbs do/don't, not new code.

**No change to Cluster B-adjusted T1 calendar (~10.5–12.5 weeks).**

## Cluster C — LOCKED (2026-05-25)

**Decision:** bundle C1.a + C2.b + C3.c accepted as-recommended. No commentary.

**Locked T1 surface:**
- **C1.a:** Crucible CLI prepends `[🔔N]` to prompt on each re-render via `MirrorProjector.getUnreadCount({level_min, since_ts, ...})`. Dismissal happens on view of any Mirror surface (`mirror`, `@inbox`, `@today`, `@scorecard`, `@lobby`).
- **C2.b:** Cross-session dashboard from T1. Four hardcoded views: `@inbox` (cross-session unread/actionable), `@today` (date-scoped), `@scorecard` (week-over-week aggregates per Cluster A), `@lobby` (last-N high-signal). `@active` (single-session filter) reserved as 5th view, ships if dogfood demands it.
- **C3.c:** Hybrid emission. L5 verbs Aaron explicitly invokes that create primitives (`crucible pin`, `crucible breakpoint register`, `crucible bisect mark-bad`) round-trip through L1 → Mirror Projector → MirrorEvent. Read-only L5 queries (`crucible why`, `crucible walk-events`, `@scorecard` render) return data to caller, no MirrorEvent. Honors decision #10.

**Owner deltas:**
- Alexander: +1 eng-day (prompt-render hook call).
- Rosella: ~0 incremental (the `getUnreadCount` query method was already in her Mirror Projector plan).
- Valanice: ~0 incremental (four hardcoded views matches her NEW-2a + NEW-4a T1 plan).
- Sonny: T1-D1 / T1-D2 / T1-D4 split cleanly under C3.c — logpoint firing and breakpoint pause are primitives (MirrorEvent), `why-one` is return-only.

**T1 calendar unchanged: ~10.5–12.5 weeks.**

---

## Cluster E′ — Fork verb mop-up + adjacent T1 scope questions

Cluster A locked `crucible fork --at-last-decision` as the reversal primitive. Six smaller open items remain across Erasmus and Roger triages that haven't been settled but each carries a single concrete decision. Batching as one cluster — recommended defaults below; Aaron can accept-as-bundle or kick any single item for deeper unpacking.

### Concrete week-one narrative

**Setup:** Aaron is mid-dogfood, week-one. Tuesday afternoon. He's just used `crucible fork --at-last-decision` to revert Crucible's bad auto-apply (the Cluster A failure scenario). He now has two sessions on disk: the bad branch and the revert branch.

**Moment 1 — switching branches.** Aaron wants to keep working on the revert branch. He types... what? `crucible checkout <session_id>`? `crucible switch`? `crucible use`? Whose chamber owns this verb?

**Moment 2 — keeping the good work.** Aaron likes most of Wednesday's auto-applies (4 of 5) and wants those carried into Thursday's session. The 5th was the bad one he reverted. Does he `crucible adopt` the good ones into the revert branch? Or does he live with branch-soup and never merge?

**Moment 3 — Friday replay.** Aaron runs `crucible replay <monday-session>` (Cluster A scorecard scenario). Does he get a CLI he can drive, or only a primitive API that Alexander's harness exercises in CI?

**Moment 4 — Thursday template.** Aaron likes his Tuesday session shape — set of generators loaded, plugin pins, Mirror filters. He wants to start Thursday from that shape. Does Crucible let him `crucible session-from-template <tuesday-id>`, or does he hand-recreate it?

**Moment 5 — counterfactual curiosity.** Aaron wonders: *"what if Crucible had used a different model for Wednesday's prescription?"* Auto-replay-with-variant. Does T1 expose this verb? T4? Parking?

**Moment 6 — naming hygiene.** DBOM already implements the Merkle-chain idiom (canonical-JSON + SHA-256 + parent-hash). L1 implements its own content-addressing (CBOR + BLAKE3). Erasmus suggests naming them as instances of the same pattern in PRD vocabulary. Doc-only.

### Six items + recommended defaults

| # | Item | Source | Options | **My recommendation** | Reasoning |
|---|---|---|---|---|---|
| **E′.1** | Checkout verb owner | Erasmus Q2 | (a) Erasmus's fork-verb story (T1.E.1) owns `crucible checkout` end-to-end. (b) Sonny's debugger chamber owns it as a navigation primitive. | **(a) Erasmus owns.** | `crucible checkout` is half of the fork-verb pair — without it, fork creates orphan sessions Aaron can't return to. Keeping the fork/checkout duo in one story keeps the user model coherent. Sonny's debugger consumes `checkout`; doesn't need to own it. **T1.** |
| **E′.2** | Merge/adopt semantics | Erasmus Q7 | (a) **Parking** confirmed — "Crucible is not git," forks resolve by *choosing* which session to keep. (b) Ship `crucible adopt <session_id>` in T1 — replay child events onto another session. (c) Ship `adopt` in T2 once Aaron has dogfood data. | **(c) — defer to T2 explicitly, not Parking.** | Aaron *will* hit this in dogfood: he'll auto-apply 5 things, revert one via fork, and want the other 4 carried into his working branch. Pure Parking is wrong because the use case is concrete. T1 is wrong because `adopt` requires replay-onto-target semantics (event re-anchoring + read-set re-validation), which is real engineering. T2 with the dogfood signal sized correctly. **T1 workaround:** Aaron manually re-runs the prescriptions on the revert branch — Crucible will re-suggest them in seconds because the drift signal is still present. |
| **E′.3** | Snapshot CLI surface in T1 | Roger Q4 | (a) Primitive-only — `createSnapshot(walOffset) → snapshotId` as library call; no CLI verb. (b) Primitive + CLI — `crucible snapshot create/restore/list`. | **(b) primitive + CLI.** | Aaron replays daily during dogfood (Cluster A scorecard implies this). Replay-from-snapshot beats replay-from-offset-0 by day three. Without the CLI verb, Aaron has to write a script to trigger snapshots — exactly the friction the harness exists to eliminate. CLI cost on top of the primitive is ~3–5 eng-hours (Roger's surface in `cairn/src/cli`). **T1.** |
| **E′.4** | US-R-9 templates tier | Roger Q5 | (a) T3 default (Roger's triage). (b) T4 if Aaron will use templates in week one. | **(a) T3 confirmed.** | Bootstrap loop runs fresh sessions. Aaron is *finding* the right session shape during dogfood, not re-instantiating a known good one. Templates become valuable in month 2+ when patterns stabilize. Snapshot-as-template (US-R-9) is also gated on US-R-3 fork (T1 ✓) and US-Ro-NEW-1 snapshot (now E′.3 T1 ✓), so the substrate is ready when T3 lands. **T3.** |
| **E′.5** | US-E-2c counterfactual auto-replay (`crucible replay --with-model X`) | Erasmus Q5 | (a) T4 (Erasmus default). (b) Parking. | **(a) T4 confirmed.** | This is a power-user verb with high engineering depth (variant strategy + hermetic replay + branch creation). The bar is met without it. Aaron's curiosity about "what if a different model" is real, but T4 is fine because by then we have multi-provider experimentation infrastructure (Alexander US-A-8′ T3) feeding it. Aaron can dogfood-revisit Parking later if he never reaches for it. **T4.** |
| **E′.6** | DBOM Merkle naming-only promotion | Erasmus Q4 | (a) Promote naming in PRD vocabulary — "DBOM is an instance of the L1 content-addressing pattern." Zero code. (b) Leave naming as-is; revisit at T2 when DBOM evolves. | **(a) promote naming in PRD §7 Glossary.** | Costs nothing, eliminates a class of "wait, are these two systems?" PR-review questions, sets up future consolidation discipline. **T1 doc-only.** |

### Bundled recommendation (six items, all in one breath)

1. **E′.1:** Erasmus owns `crucible checkout` — T1, paired with `fork`.
2. **E′.2:** `crucible adopt` deferred to **T2** (not Parking — concrete dogfood use case). T1 workaround: re-run prescriptions on revert branch.
3. **E′.3:** Snapshot CLI ships in T1 (`crucible snapshot create/restore/list`) on top of Roger's primitive. ~3–5 eng-hours.
4. **E′.4:** US-R-9 templates stays **T3** as Roger triaged.
5. **E′.5:** US-E-2c counterfactual auto-replay stays **T4** as Erasmus triaged.
6. **E′.6:** DBOM and L1 content-addressing named as instances of one pattern in PRD §7 Glossary. Doc-only.

### Tradeoffs named

- **E′.2 is the only item with real risk if I'm wrong.** If Aaron's dogfood week generates a lot of fork-revert-but-keep-the-good-stuff scenarios, deferring `adopt` to T2 forces hand-replay friction that erodes trust. Mitigation: if dogfood produces >3 such scenarios in week one, promote `adopt` from T2-first to T1.5 with a documented mid-T1 add. The seam already exists (replay harness in Alexander's T1 + fork lineage in WAL); `adopt` is a verb on top.
- **E′.3 costs ~3–5 eng-hours and is the cheapest T1 add of any cluster so far** — recommending it because the cost is negligible and the friction it prevents is daily.
- **E′.5 vs Parking is genuinely uncertain.** I'm going with Erasmus's T4 read because Aaron is in the loop weekly and we can re-tier if he never reaches for it; pure Parking would require an unparking decision later that costs more attention than just leaving it tiered.

**Cost impact:** ~3–5 eng-hours total (E′.3) on top of E′.1 which was already in scope under Cluster A. **T1 calendar unchanged: ~10.5–12.5 weeks.**

## Cluster E′ — LOCKED (2026-05-25)

**Decision:** 6-item bundle accepted as-recommended. Aaron took T2 default on `adopt` (no T1.5 promotion).

**Locked T1/T2/T3/T4 surface:**
- **E′.1:** `crucible checkout` — Erasmus owns, T1, paired with `fork`. Sonny's debugger consumes.
- **E′.2:** `crucible adopt` (replay child events onto another session) — **T2.** T1 workaround: Aaron re-runs the prescriptions on the revert branch; Crucible re-suggests within seconds because the drift signal is still present.
- **E′.3:** `crucible snapshot create/restore/list` — **T1**, ~3–5 eng-hours on Roger's primitive (`cairn/src/cli` surface).
- **E′.4:** US-R-9 templates — **T3** confirmed. Substrate ready (fork ✓, snapshot ✓) when T3 lands.
- **E′.5:** US-E-2c counterfactual replay (`crucible replay --with-model X`) — **T4** confirmed. Naturally fed by Alexander US-A-8′ T3 multi-provider experimentation.
- **E′.6:** DBOM Merkle and L1 content-addressing named as instances of one pattern in **PRD §7 Glossary**. Doc-only.

**T1 calendar unchanged: ~10.5–12.5 weeks.**

---

## Cluster D′ — Pause-verdict tier + conformance enumeration

Cluster A locked A1+A3+A4 conformance enforced in CI. Two real residuals remain from the original Cluster D scope:

- **D′.1 — pause-verdict in T1?** Alexander's Q2 asks whether the third hook-bus verdict (`pause`, alongside `continue` and `observe`) ships in T1, citing his fork-b spike as a substrate concern. Sonny's T1-D2 (literal breakpoint) depends on pause being real in T1.
- **D′.2 — conformance corpus shape.** What is A3 actually asserted against in CI? Alexander's Q5 asks for an enumeration. Gabriel's Q4 split the question as smoke-only vs full matrix.

Posing as one cluster because they're tightly coupled: A3 in CI (locked by Cluster A) needs a corpus to replay; pause is the third verdict that lets the corpus include user-in-the-loop scenarios meaningfully.

### Concrete week-one moments

**Moment 1 — Wednesday breakpoint.** Aaron is refactoring `optimizationHints.ts`. He sets a literal breakpoint: *"pause before any write to `packages/forge/src/prescribers/**`."* Crucible spawns a Forge prescriber that tries to write a `change_vectors` row touching that path. **Does Crucible actually stop, surface a Mirror pause, and wait for Aaron's verdict — or does Crucible just observe-and-log because pause is T2?**

**Moment 2 — Friday CI run.** A PR lands modifying L1's WAL canonicalization. CI runs the conformance suite. **What does it actually assert against?** A single canonical "hello world" session committed to the repo? Aaron's whole dogfood corpus? Every recorded session from the last N days?

**Moment 3 — Sonny's T1 budget.** Sonny triaged T1-D1 (logpoint), T1-D2 (breakpoint), T1-D3 (walker), T1-D4 (why-one) as a 4-primitive set totaling 3–5 eng-days. If pause is T2, **T1-D2 collapses to T2** and Sonny T1 = 3 primitives, 2–3 eng-days — but Aaron loses pre-commit interactive debugging during the very week the bar most depends on it.

### Sub-question options

#### D′.1 — Pause verdict in T1?

| # | Option | Implication | Cost |
|---|---|---|---|
| **D′.1.a** | **Pause ships in T1.** Full Phase A verdict triple (`continue`/`observe`/`pause`). Sonny T1-D2 ships. L5 subscribes to bus for pause verdicts on breakpoint predicates; surfaces Mirror attention-tier event; awaits Aaron's `continue` verdict (only verdict supported in T1; `step`/`edit` deferred to T2 per Sonny). | Full hook bus. Sonny T1-D2 lands. Aaron has pre-commit breakpoints during dogfood. | +3–5 eng-days (L5 subscriber wiring + Mirror pause-render reuse + verdict-resume path). Substrate is built (Roger's seal-and-split signoff `decisions.md:431`); this is consumer wiring. |
| D′.1.b | Pause deferred to T2 (Alexander's Q2 ask) | T1 ships `continue`/`observe` only. Sonny T1-D2 → T2; T1-D1 (logpoint) still ships. Aaron has watch-and-log debugging in T1, not pause-and-inspect. | 0 add. But Sonny T1 shrinks to 3 primitives. Aaron loses the interactive-debug primitive during the dogfood week the strong-bounded thesis needs most. |

#### D′.2 — Conformance corpus shape

| # | Option | What CI asserts against | Pros | Cons |
|---|---|---|---|---|
| D′.2.a | One canonical "hello world" session committed to repo. CI replays it on every PR. | 1 session, ~50 events | Cheap; deterministic; runs in seconds | Trivial — passes even on broken implementations that don't exercise edge cases |
| **D′.2.b** | **Canonical hello-world + a growing dogfood corpus** (sessions Aaron curates from dogfood week, added to repo as `tests/conformance/sessions/*.wal`). | 1 + N curated sessions (N grows from 0 to maybe 5–10 during dogfood) | Catches real divergence; corpus grows with the surface; Aaron's actual workflows become the test bed | Aaron curates ~30 min/week to keep corpus fresh |
| D′.2.c | Every recorded session, last N days, replayed nightly. | Hundreds of sessions | Maximum coverage | Slow; flaky; CI minutes explode; sessions referencing deleted plugins/models break replay non-meaningfully |

### My recommendation

**D′.1.a — pause ships in T1.** **D′.2.b — canonical session + curated dogfood corpus.**

#### Why D′.1.a (pause in T1)

Four reasons:

1. **A.3 was locked specifically to enable seal-and-split / pause.** Aaron rejected fork-b precisely because it couldn't support pause (`decisions.md:531`). A.3's reason for existing is to enable the third verdict. Shipping T1 without pause means we paid A.3's engineering cost (custom append-log + 188 prepared-statement boundary discipline) for a capability we don't use. Alexander's Q2 cites his fork-b spike, but A.3 is not fork-b — the concern doesn't apply. **Roger's signoff (`decisions.md:431`) explicitly confirms seal-and-split is in the substrate.**

2. **Pre-commit breakpoint is the highest-leverage debugger primitive for self-modification work.** Aaron is editing the harness in the harness. "Pause before any write to `packages/forge/src/**`" is the single primitive that prevents Crucible from silently writing bad code into itself between the moment a prescription is emitted and the moment Aaron notices. Without pause, Aaron's safety net is "auto-apply category is narrow AND I notice the badge AND I revert via fork." With pause, Aaron pre-commits a guard that catches the unsafe write *before* it lands. Strong-bounded read (Cluster A) makes this catch material, not theoretical.

3. **Marginal cost vs trust dividend.** +3–5 eng-days against a ~12-week T1 = ~5% of budget for the verdict that lets the bus do its job. Sonny's T1-D2 is one of his four primitives; preserving the full 4-primitive set keeps his "minimum investigation surface" promise intact.

4. **The L5 subscriber wiring is small and reuses Mirror's pause-render that ships either way for ACK-required prescriptions.** Under Cluster A, Mirror already renders attention-tier badges and supports a verdict-resume path (Aaron's ACK on a prescription). Pause-on-breakpoint reuses the same render + verdict-resume path with a different event source.

#### Why D′.2.b (canonical + curated dogfood corpus)

- **D′.2.a is trivially passable.** A single hello-world session catches catastrophic regressions (broken serialization, dropped events) but won't catch subtle divergence (a fork-b-style edge case in seal-and-split, a CBOR canonicalization corner). The conformance suite exists to catch the subtle stuff or it isn't paying for itself.
- **D′.2.c is operationally hostile.** Replaying hundreds of sessions per PR turns CI into a slow flaky resource sink. Plugin/model references go stale; replays fail for reasons unrelated to the PR. Builds get ignored; signal collapses.
- **D′.2.b grows with the surface.** Week-one dogfood produces ~5–10 sessions worth curating into the corpus — the auto-apply scenario, the fork-revert scenario, the breakpoint-pause scenario, the multi-session scorecard scenario. Each becomes a permanent regression guard. Aaron's ~30 min/week curation cost is paid in catching real bugs.
- **Composes with Laura's commitment.** Laura's US-L-NEW-12 ships the conformance runner; corpus is what the runner runs against. Mechanism + corpus = a working assertion regime.

### Tradeoffs named

- **D′.1.a risk:** pause-render UX must work end-to-end in T1, including Aaron's verdict-resume path. If the resume verdict path has a subtle bug, breakpoints become "Crucible just hangs" — worse than not having them. **Mitigation:** pause path gets explicit property-test coverage in Gabriel's NEW-15 P1–P5 regime (already in T1 sprint 1 per Gabriel's triage). The fast-check harness toehold catches resume bugs before dogfood.
- **D′.2.b risk:** Aaron's 30-min/week curation cost competes with dogfood time. If he skips curation, corpus stays at 1 session = degrades to D′.2.a. **Mitigation:** `crucible session export-for-conformance <session-id>` verb (~2 eng-hours, ships under E′.3's snapshot CLI work) — makes curation a one-line operation Aaron can do mid-flow.
- **D′.1.b would shrink Sonny T1 by 1 primitive, gain ~5% T1 budget back.** Not enough to justify losing the pre-commit catch given Cluster A's auto-apply reliance on Aaron-noticing.

### Cost summary

- D′.1.a: +3–5 eng-days (Alexander/Sonny shared — L5 subscriber wiring + Mirror pause-render reuse + verdict-resume path + Gabriel property-test coverage).
- D′.2.b: +2 eng-hours for `export-for-conformance` verb. Corpus content cost = Aaron's ~30 min/week curation (not engineering time).

**Net T1 calendar: ~11–13 weeks** (Cluster B baseline 10.5–12.5 + ~3–5 days for pause + ~2 hours for export verb).

## Cluster D′ — LOCKED (2026-05-25)

**Decision:** D′.1.a + D′.2.b bundle accepted as-recommended.

**Locked T1 surface:**
- **D′.1.a:** Pause-verdict ships in T1. Full Phase A verdict triple (`continue`/`observe`/`pause`). Sonny T1-D2 lands. L5 subscribes to bus for pause verdicts on breakpoint predicates; surfaces Mirror attention-tier event; awaits Aaron's `continue` verdict (`step`/`edit` deferred to T2 per Sonny). **+3–5 eng-days** (Alexander/Sonny shared). Gabriel NEW-15 P1–P5 property tests cover the resume path in sprint 1.
- **D′.2.b:** Conformance corpus = canonical "hello world" .wal + curated dogfood corpus (5–10 sessions by end of dogfood week, added to `tests/conformance/sessions/*.wal`). `crucible session export-for-conformance <session-id>` verb (+2 eng-hrs) makes curation a one-liner. Composes with Laura US-L-NEW-12 conformance runner.

**Net T1 calendar: ~11–13 weeks** (Cluster B baseline 10.5–12.5 + ~3–5 days for pause).

---

## Cluster G — Cross-session scope + cheap insurance + inherited-surface acknowledgment

Three small items remain in the original Cluster G scope. Cluster C already resolved cross-session Mirror dashboard scope (C2.b) — what's left is the *application-level* cross-session question (does Crucible retrieve and use prior-session patterns?) plus two zero-cost-now / huge-cost-later disciplines that the squad will accidentally skip if the PRD doesn't name them.

### Concrete week-one moments

**Moment 1 — Thursday pattern reuse.** Aaron is editing `optimizationHints.ts`. Crucible's Drift generator notices the function. Does Crucible say: *"You edited this Monday too; here's the proposal you rejected then with the reason"*? Or does it propose afresh each session because cross-session retrieval is T2?

**Moment 2 — Six months later (or sooner) cheap-insurance bill.** Future-Aaron (or a future contributor) wants to add `tenant_id` to the 5–6 core tables. He discovers it would have been a 1-hour migration in week one of T1, and is now a multi-week refactor across populated WALs, projections, and CI fixtures.

**Moment 3 — T2 sprint rebuilds the linter.** A future contributor's T2 sprint thinks *"Crucible should have a skill linter"* and builds a parallel one because Cairn's existing `skillLinter` (5-vector × 3-tier validator) is not named anywhere in the PRD. We just shipped two linters; the second one will quietly drift from the first.

### Three items + recommended defaults

| # | Item | Source | Options | **My recommendation** | Reasoning |
|---|---|---|---|---|---|
| **G.1** | Cross-session pattern retrieval (US-G-1) in T1? | Graham Q2 | (a) T2 (Graham's default — "one-week loop runs in a single repo; cross-session helpful but not load-bearing"). (b) T1 if Aaron's dogfood crosses repos (harness + sibling). | **(a) T2 confirmed.** | Aaron's dogfood is single-repo (`D:\git\harness\`) per Cluster A scenario. Curator's existing flat-stream stats produce *some* improvement signal in T1 — enough to close the loop. US-G-5 ProposalGenerator already ships the "episode primitive" half free under L1 WAL row schema. Retrieval-by-similarity (the actual cross-session UX) is genuine engineering and lights up cleanly in T2 when Aaron has 4+ weeks of dogfood data worth retrieving from. **Promoting to T1 would force premature retrieval-ranking work with ~0 weeks of corpus to validate against.** |
| **G.2** | `tenant_id TEXT NOT NULL DEFAULT 'local'` migration | Roger Q3 | (a) T1 — ship migration now (~1 hour) on the 5–6 tables that would otherwise be expensive to retrofit at federation time. (b) Skip; reopen when federation is plausible. | **(a) T1 — ship the migration.** | Pattern from W3-D2 naming discipline and Aaron's own L1 substrate boundary discipline (`decisions.md:545`): *"cheap if applied from day 1, expensive to retrofit."* Cairn's 188 prepared-statement boundary sites are exhibit A. Federation is correctly T5/Parking (vision-Q1 #1: Aaron-only v1), but the insurance is so cheap relative to the alternative that paying it is rational regardless of when federation becomes plausible. **Adds a column with default; touches no read paths in T1; saves multi-week refactor if Aaron's "this is groundbreaking, double down" lottery ticket (`decisions.md:535`) cashes.** |
| **G.3** | Explicit "Crucible inherits X unchanged" acknowledgment stories | Roger Q6 | (a) Ship as PRD §2 subsection enumerating inherited surfaces. Doc-only. (b) Skip; future contributors will figure it out. | **(a) ship the enumeration in PRD §2 "Inherited from Cairn/Forge".** | Real prior precedent: US-A-NEW-5 almost rebuilt Cairn's `event_log` before Round 6 #7 caught it. Without explicit enumeration, the next T2 sprint will rebuild `skillLinter`, the T3 sprint will rebuild `execution_profiles`, the T4 sprint will rebuild `topology_cache`. **Doc-only cost, prevents a class of accidental-rebuild PRs we have demonstrated we're vulnerable to.** Surfaces to enumerate (non-exhaustive, Graham to finalize the list): SkillFrontmatterInput + 5-vector×3-tier `skillLinter` (Cairn), `getExecutionProfileWithDb` (Cairn), `discovery.ts/scanTopology` (Cairn), 5+ Forge prescribers, Forge Applier, DBOM canonical-JSON serializer, NEGATIVE_IMPACT_AUTO_APPLY_GATE, ACTIVE_HINT_STATUSES dedup, HookComposer fail-open pattern. |

### Bundled recommendation (three items)

1. **G.1:** US-G-1 cross-session retrieval = **T2** (Graham's default). Single-repo dogfood doesn't need it in week one.
2. **G.2:** `tenant_id` migration ships in **T1** (~1 hour). Cheap insurance against federation refactor.
3. **G.3:** PRD §2 "Inherited from Cairn/Forge" subsection enumerates inherited surfaces. **T1 doc-only.**

### Tradeoffs named

- **G.1 risk:** if Aaron's dogfood actually does cross repos (e.g., he toggles between `D:\git\harness\` and a sibling sandbox), cross-session retrieval becomes load-bearing for the loop closure. **Mitigation question for Aaron embedded below** — confirm dogfood is single-repo, or change recommendation.
- **G.2 risk:** none material. Migration ships on the v14 cut alongside Roger's substrate; default `'local'` is invisible to all T1 read paths.
- **G.3 risk:** enumeration goes stale as Cairn/Forge evolve. **Mitigation:** Graham owns the §2 enumeration; updated only when a new T1 PR explicitly inherits or supersedes an enumerated surface. Not a living document beyond v1 PRD ship.

### Cost summary

- G.1: 0 (deferred to T2).
- G.2: ~1 eng-hour (one migration row on 5–6 tables).
- G.3: ~1–2 hours doc work (Graham, in PRD §2).

**T1 calendar unchanged: ~11–13 weeks.**

### One question embedded in the bundle

Before locking G.1 at T2: **is your dogfood week single-repo (`D:\git\harness\` only) or cross-repo?** If single-repo, T2 is correct. If you'll be toggling between harness and a sibling sandbox repo for real work, US-G-1 cross-session retrieval gets promoted to T1 (~1 week add) so Crucible can carry pattern context across the boundary.

## Cluster G — LOCKED (2026-05-25)

**Decision:** bundle accepted as-recommended. Aaron confirmed dogfood is single-repo (`D:\git\harness\` only).

**Locked T1 surface:**
- **G.1:** US-G-1 cross-session pattern retrieval — **T2.** T1 dogfood relies on Curator flat-stream stats for improvement signal.
- **G.2:** `tenant_id TEXT NOT NULL DEFAULT 'local'` migration — **T1**, ~1 eng-hour. Cheap insurance against future federation refactor. Default invisible to T1 read paths.
- **G.3:** "Crucible inherits X unchanged" enumeration as PRD **§2 subsection** — T1 doc-only, **Graham**, ~1–2 hrs. Surfaces: SkillFrontmatterInput + `skillLinter`, `getExecutionProfileWithDb`, `scanTopology`, 5+ Forge prescribers, Forge Applier, DBOM canonical-JSON serializer, NEGATIVE_IMPACT_AUTO_APPLY_GATE, ACTIVE_HINT_STATUSES dedup, HookComposer fail-open. Updated only when a T1 PR explicitly inherits or supersedes a listed surface; not a living doc beyond PRD ship.
- **Single-repo dogfood constraint locked.** PRD **§3 (Scope boundaries / non-goals)** captures two named T1 constraints the falsifiable bar acknowledges:
  - Single-agent execution (Cluster B constraint).
  - Single-repo dogfood (Cluster G constraint).
  Both are deliberate trades. Dogfood friction along either axis is *expected*, not thesis failure.

**T1 calendar unchanged: ~11–13 weeks.**

---

## Cluster H — Vocabulary fence + L4 routing micros (5-item bundle)

Five small items remaining across Valanice and Sonny triages. All concern how the Router routes / how Mirror renders / how vocabulary stays clean. Bundle-style; recommend accept-as-bundle.

### Concrete week-one moments

**Moment 1 — Wednesday breakpoint pause.** D′.1.a locked pause in T1. Sonny's breakpoint fires. Mirror surfaces an attention-tier event. **What verbs does Aaron see?** `accept | reject | defer` (the prescription triad) is wrong for a debugger pause; he needs `continue` (and later `step | edit`). Does Router stamp a typed category so Mirror picks the right render?

**Moment 2 — Mirror banner text.** Sonny ships a logpoint MirrorEvent: `"Logpoint fired: stepped over breakpoint at session_id=abc"`. That's gdb-speak. Valanice's US-V-NEW-3 vocabulary fence is supposed to stop this. **Where does the fence enforce?** Lint on the source file before runtime, or admission-time check at the Router?

**Moment 3 — Crowded inbox.** Aaron opens `@inbox` Friday. There are 12 items: 5 prescriptions, 3 pauses, 2 Curator insights, 2 logpoint fires. **What order?** Most recent? Most urgent? Most actionable? Who decides — the Router (policy authority) or Mirror (presentation authority)?

**Moment 4 — Sonny's US-S-9 lingering.** Sonny's original US-S-9 ("breakpoint is an L4 approval") was the alignment principle for "pauses route through the verdict bus." That principle is now absorbed by Graham R6 + Cluster D′.1.a. Should US-S-9 stay on the backlog as a placeholder, or strike?

**Moment 5 — T2 debugger lands and the verdict bus surprises Alexander.** When full debugger (T2) ships, it needs `step / step-into / step-out / edit-and-continue` verdicts added to the bus. That's L1/L4 work (Alexander/Roger), not L5 (Sonny). If it's not an explicit story, it's surprise scope on whoever's sprinting L1/L4 when T2 starts.

### Five items + recommendations

| # | Item | Source | Options | **My recommendation** | Reasoning |
|---|---|---|---|---|---|
| **H.1** | L5 pause typed `category: investigation` so Mirror renders correct verbs | Valanice Q1 | (a) Yes — Router stamps `category: investigation` on L5 pause events; Mirror renders `continue` (T1) instead of `accept/reject/defer`. (b) No — Mirror sniffs payload to decide verbs. | **(a) typed category, T1.** | Mirror render-shape should not depend on payload-sniffing. Category is the right axis; it's how Graham's MirrorEvent schema is already structured (Graham #3 schema: `category`/`level`). Adding `investigation` to the existing enum {proposal, decision, observation, system} is doc-only on the schema side; verb-render switch in the renderer is ~1 hour. **Cost: ~1 eng-hour.** |
| **H.2** | Vocabulary fence enforcement venue | Valanice Q4 | (a) Router admission-time check (every MirrorEvent.title/bodyMarkdown passes banned-word filter). (b) CI lint on `*/copy.ts` files. (c) Both. | **(c) both — defense in depth.** | (a) alone misses author-time intent (Aaron sees clean Mirror events but contributor confusion lives in source). (b) alone misses runtime-composed strings (template literals, payload interpolation). Together: CI lint catches static copy at author time; Router admission check catches dynamic composition at runtime. Banned-word list ships once in the runtime, referenced by both. **Cost: ~3–5 eng-hours total (lint config + Router check + shared word list). T1.** |
| **H.3** | `@inbox` ordering authority | Valanice Q5 | (a) Router stamps `priority_hint`; Mirror's default `@inbox` view sorts by it. Aaron can override per-view. (b) Mirror owns ordering as a presentation concern. | **(a) Router `priority_hint`, Mirror honors by default.** | Router has the policy context (category, source, confidence-band, user-pref) to compute priority. Mirror has display context (filter, view, what's currently visible). Splitting authority: policy at admission (Router stamps), presentation at render (Mirror sorts; Aaron overrides via `--sort recency` / `--filter category:proposal`). Matches Valanice's lean. **Cost: ~2 eng-hours (Router stamp + Mirror default sort).** |
| **H.4** | US-S-9 absorbed by Graham R6 + D′.1.a? | Sonny Q2 | (a) Yes — strike from backlog. (b) Keep as placeholder. | **(a) strike — fully absorbed.** | Pause→Mirror surfacing is implicit in Graham R6 Mirror schema + Cluster D′.1.a pause verdict. Sonny's original alignment principle is captured in three other locked decisions. Leaving US-S-9 on the backlog creates the impression of unresolved scope; striking clears the noise. **Cost: ~0; sprint backlog hygiene.** |
| **H.5** | Verdict-enum extension (`step`/`step-into`/`step-out`/`edit-and-continue`) as cross-team story | Sonny Q3 | (a) Explicit T2 story owned by Alexander/Roger (L1/L4 substrate evolution), Sonny named consumer. (b) Implicit "tax on L1/L4 levied by T2 debugger work." | **(a) explicit T2 story.** | Sonny's lean is correct: implicit tax becomes surprise scope. Better to file the story now (PRD §4 Capability Tier 2 line item: "extend hook-bus verdict enum to support debugger stepping; substrate change with API impact"). Owner: Alexander (L1 verdict-bus shape) + Roger (WAL schema). Consumer: Sonny. **Cost: 0 for T1; story-shape lock prevents T2 sprint surprise.** |

### Bundled recommendation

1. **H.1:** L5 pause = typed `category: investigation`. T1, ~1 eng-hour.
2. **H.2:** Vocabulary fence at both layers (CI lint + Router admission). T1, ~3–5 eng-hours.
3. **H.3:** Router stamps `priority_hint`; Mirror honors by default; Aaron overrides per-view. T1, ~2 eng-hours.
4. **H.4:** US-S-9 struck from backlog as absorbed.
5. **H.5:** Verdict-enum extension filed as **explicit T2 story** (Alexander + Roger owners, Sonny consumer).

### Tradeoffs named

- **H.2 — defense in depth or over-engineered?** Could ship (b) CI-only and add (a) runtime check if dynamic-composition drift surfaces. **Mitigation if Aaron prefers cheaper:** ship CI lint only in T1, add Router admission check in T2. Saves ~2 hours. The cost difference is small enough I'm recommending the full version, but flagging.
- **H.3 — Router stamping ordering is a policy commitment** that's slightly heavier than a pure-presentation choice. If Aaron's actual `@inbox` use pattern is "I scan it chronologically anyway," `priority_hint` is wasted work. **Mitigation:** Router stamps it but ships with a no-op default; Mirror sorts by recency unless Aaron toggles `--sort priority`. Falls back gracefully.
- **H.5 — filing a T2 story now risks scope-locking it before we know what the debugger needs.** Step semantics for an event-stream debugger are not obviously the same as gdb-style step. **Mitigation:** the story is a placeholder/contract ("L1/L4 extend verdict enum to support N debugger verdicts, exact verb set TBD by Sonny in T2 design"), not a frozen spec.

### Cost summary

- H.1: ~1 eng-hour
- H.2: ~3–5 eng-hours (or ~1 if CI-lint only; defer Router check to T2)
- H.3: ~2 eng-hours
- H.4: ~0 (backlog hygiene)
- H.5: ~0 (story shape locked; no T1 implementation)

**Total: ~6–8 eng-hours. T1 calendar unchanged: ~11–13 weeks.**

### Question for Aaron — locked

H bundle accepted as-recommended including H.2 full. See "Cluster H — LOCKED" below.

---

## Cluster H — LOCKED (2026-05-25)

**Decision:** 5-item bundle accepted as-recommended, including H.2 full version.

**Locked T1 surface:**
- **H.1:** L5 pause events stamped with typed `category: investigation`. Mirror render branches on category, not payload. T1, ~1 hr.
- **H.2:** Vocabulary fence — **CI lint on source files** + **Router admission-time check** on dynamic-composed strings. Shared banned-word list. T1, ~3–5 hrs.
- **H.3:** Router stamps `priority_hint`; Mirror's default `@inbox` sorts by recency unless Aaron toggles `--sort priority`. T1, ~2 hrs.
- **H.4:** US-S-9 struck (fully absorbed by Graham R6 + D′.1.a).
- **H.5:** T2 story filed — verdict-enum extension for debugger verbs (`step`/`step-into`/`step-out`/`edit-and-continue` TBD). Owners: **Alexander** (L1 verdict-bus) + **Roger** (WAL schema). Consumer: **Sonny**. Placeholder contract; exact verb set TBD in T2 design.

**Cluster H total: ~6–8 eng-hours. T1 calendar unchanged: ~11–13 weeks.**

---

## Cluster F — Package rename + binary ownership + MCP location (4-item bundle)

Last Aaron-facing cluster (Cluster I goes to Graham, not Aaron). Four small naming/structure choices that block sprint-1 starts.

### Concrete week-one moments

1. **Sprint 1 starts; two "runtime" packages.** Alexander wants `@akubly/crucible-runtime` for the T1 trunk SDK. `@akubly/skillsmith-runtime` (323-line Cairn↔Forge prescriber composition root — *not* a runtime) is squatting on the word. Disambiguate now or pay forever.
2. **`crucible` binary first invocation.** Aaron types `crucible` Monday. **What package owns argv/TTY/prompt-render? What owns loop/seam/hermetic?**
3. **MCP catalog.** Aaron's MCP client sees one server (~13 tools) or two (Cairn + Crucible-L5)?
4. **External consumers.** `stunning-adventure` imports `@akubly/skillsmith-runtime`. Rename before T1, parallel, or bundled in first T1 PR?

### Four items

| # | Item | **Recommendation** | Reasoning |
|---|---|---|---|
| **F.1** | Rename `@akubly/skillsmith-runtime` | **(a) → `@akubly/skillsmith-prescriber`.** Deprecated re-export shim for one minor version. | Current name lies. T1 trunk genuinely needs the "runtime" word. Two adjacent "runtime" packages is the worst outcome. ~3 eng-hrs (mechanical + CI/dep-cruiser). |
| **F.2** | Rename timing | **(a) before T1 sprint 1.** | Mechanical, no T1 risk, eliminates ambiguity early. ~1 calendar day with `stunning-adventure` consumer coordination. Delaying = every T1 PR carries the disambiguation cost. |
| **F.3** | CLI binary ownership | **(a) thin `@akubly/crucible-cli` (Valanice) + fat `@akubly/crucible-runtime` (Alexander).** | Matches existing `runtime-cli` shell + `skillsmith-runtime` lib pattern. Valanice already owns UX surfaces (Mirror Dashboard, badge prompt-render per C1.a) → consistent that she owns CLI shell too. Alexander owns SDK substrate. **Naming-only split, 0 incremental cost.** |
| **F.4** | MCP server location | **(a) stay in `cairn/src/mcp/server.ts` for T1; re-tier in T2.** | 13 tools is fine in one server. Carving second binary in T1 = process-boundary coordination overhead for 0 T1 benefit. Re-tier in T2 if catalog grows past ~20 or per-domain split becomes useful. **Flag: most design-tilted item; route to Graham if Aaron prefers.** |

### Tradeoffs

- **F.1 risk:** rename ripples to `stunning-adventure`. **Mitigation:** deprecated re-export shim gives one minor version to migrate.
- **F.2 risk:** rename PR slip → T1 sprint 1 starts ambiguous. **Mitigation:** lock PR shape + assignment now; Alexander/Roger land in ~1 day.
- **F.3 risk:** none material.
- **F.4 risk:** if T1 dogfood floods L5 MCP tool requests, single-server ages quickly. **Mitigation:** L5 tools cluster naturally → T2 carve is clean, not a retrofit.

### Cost summary

F.1 ~3 hrs · F.2 ~1 day pre-sprint coordination · F.3 0 · F.4 0. **Total ~3 eng-hours + 1 calendar day. T1 calendar unchanged: ~11–13 weeks.**

### Question for Aaron

**Bundle: F.1 + F.2 + F.3 + F.4 as recommended.** Accept-as-bundle, or modify?

The one I'd flag: **F.4** (MCP server location). Most design-tilted of the four. I recommend "stay in cairn for T1, re-tier T2." If you'd rather route this to Graham/Rosella for architecture tie-break, I'll batch it into Cluster I instead.

**This is the last Aaron-facing cluster.** After F locks: Cluster I (architect-routed micros) goes to Graham as a single batch; then I draft the PRD.

---

## Cluster F — LOCKED (2026-05-25)

**Decision:** 4-item bundle accepted as-recommended (Aaron: `bundle_accept`, no modifications).

**Locked T1 surface:**
- **F.1:** Rename `@akubly/skillsmith-runtime` → `@akubly/skillsmith-prescriber` with deprecated re-export shim for one minor version. ~3 eng-hrs (mechanical + CI/dep-cruiser).
- **F.2:** Rename lands **before T1 sprint 1**. ~1 calendar day with `stunning-adventure` consumer coordination.
- **F.3:** CLI binary split — thin `@akubly/crucible-cli` (Valanice owns, consistent with her Mirror Dashboard + C1.a badge prompt-render ownership) + fat `@akubly/crucible-runtime` (Alexander owns, SDK substrate). Naming-only split, 0 incremental cost.
- **F.4:** MCP server stays in `cairn/src/mcp/server.ts` for T1; re-tier in T2 if catalog grows past ~20 tools or per-domain split becomes useful.

**Cluster F total: ~3 eng-hrs + 1 calendar day pre-sprint coordination. T1 calendar unchanged: ~11–13 weeks.**

**Status:** All 8 Aaron-facing clusters (A, B, C, D′, E′, F, G, H) LOCKED. Cluster I (architect-routed micros) routed to Graham next. PRD drafting begins after Graham returns.



### copilot-directive-2026-05-26T0734Z

### 2026-05-26T07:34Z: User directive — (d) acceptance conditional on Solo Coordinator playbook
**By:** Aaron (via Copilot Coordinator)
**What:** Aaron will accept Cassima's recommended option (d) (two falsifiable bars: solo Bar A for v1, squad Bar B for T2) on the condition that the Squad and Coordinator co-author a **single-agent equivalent** of the multi-agent orchestration patterns the Squad uses today — a playbook/skill that lets one Crucible v1 agent execute decompose → fan-out (sequential) → persona-review → synthesize → decision-capture without subagent spawn. The bootstrap thesis becomes: use Crucible v1 driving this playbook to build multi-agent support, at which point the playbook's sequential steps collapse into parallel subagents.
**Why:** User request — resolves the "squad work leaks outside Crucible" risk Cassima flagged in §5.2 by bringing squad-style work INSIDE Crucible's session via the playbook. Makes Bar A genuinely achievable AND makes the path to Bar B the very thing v1 is dogfooded against.


### erasmus-triage-2026-05-25T0200Z

# Erasmus — Round 7 v1 Tier Triage

**Date:** 2026-05-25T02:00Z
**Author:** Erasmus (outside voice; no allegiance to existing solutions)
**Scope:** All 12 stories I authored (US-E-1..10, US-E-NEW-11, US-E-NEW-12), triaged against Aaron's v1 framework and the locked 2a SDK boundary.
**Falsifiable bar (Aaron-locked):** *"Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible."*
**My tier:** T3 — branching robustness.

---

## TL;DR (opinionated)

1. **Branching is not just T3.** A *minimal* branching verb — **fork-at-HEAD** — must ship in T1 or the falsifiable bar cannot be met. There is no other way to safely apply a Crucible-generated improvement to Crucible without losing the parent conversation. The full COW + fork-at-arbitrary-event semantics stay T3.
2. **Two of my stories should be promoted into T1** that insiders are likely to underweight: (a) `crucible fork` as a *user-facing verb*, not just a DB capability; (b) wiring the already-shipped `DecisionRecord.alternatives` field into Mirror so the loop is *observable* to Aaron. Both are cheap; both are load-bearing for the one-week bar.
3. **US-E-NEW-12 stays withdrawn.** US-E-5 stays withdrawn. US-E-6 stays merged into Roger. Nothing has changed those calls.
4. **US-E-NEW-11 (hermetic replay) is now Alexander's** per v1 commitment #4 (round 5/6). I keep advisory interest; don't double-count.

---

## Triage table

| ID | Story | Tier | Rationale | Split / Drop / Merge |
|---|---|---|---|---|
| **US-E-2a** | **Branching: fork-at-HEAD verb** *(split off from US-E-2)* | **T1** | Without a non-destructive "try this change" verb, Aaron cannot dogfood Crucible improving Crucible. 2a already gives us `parent_session_id` + `fork_point_event_id` natively at L1; the verb is a thin CLI/MCP wrapper. Falsifiable-bar load-bearing. | **Split from US-E-2.** New scope: `crucible fork` (no `--at`; HEAD only) + active-session pointer. |
| **US-E-2b** | **Branching: fork-at-arbitrary-event + COW lineage** | **T3** | Full semantics — fork at any event, COW snapshot validation, ancestor-walk queries, `cairn fork --at <event_id>`. T3 is the right home; this is the robustness story, not the unlock. | Remainder of US-E-2. |
| **US-E-2c** | **Branching: counterfactual projection (auto-replay forks under variant prompts/models)** | **T4** | Real "what if" semantics layered on top of T3 fork + Alexander's hermetic replay (US-E-NEW-11). Without hermetic, replay is just rerun. Defer behind Alexander. | Spin-off; depends on US-E-NEW-11 + US-E-2b + Laura's determinism conformance. |
| US-E-1 | Ledger Bisect 🐞 | **T3** | Bisect is "branching as evaluation": each midpoint is implicitly a fork over parent's prefix. Native fit under T3 once US-E-2b lands. Sonny's debugger chamber will want to consume this. | Keep. Reframe as `crucible bisect` over the L1 chain. Prerequisite: parentId preserved at L2 ingest. |
| US-E-3 | Fitness-Driven Sub-Agent Allocation | **T4** | Half-shipped (model strategy). The remaining work — bridge `subagent.selected/deselected` + wire fitness signal to routing — is small but not falsifiable-bar load-bearing. Drift-tunable runtime is T4 territory. | **Shrink** as previously flagged. Hand the bridge-mapping piece to Alexander as a 1-hour starter. |
| US-E-4 | Prompt Lineage Diffing | **T4** | Substrate exists (DBOM Merkle, DriftSketch). Lineage tree + diff UI is genuine net-new but a *legibility* tool, not a productivity-loop unlock. Real value emerges once Aaron has run 50+ Crucible-on-Crucible iterations and wants to see what worked. | Keep. **Drop** the "phylogenetic tree" framing for v1 — flat parent/child diff is sufficient. |
| US-E-5 | Autonomous Dead-Code Proposal | **Parking** | Withdrawn round 2. No team echo. No relevance to falsifiable bar. | **Drop** for v1. Park indefinitely. |
| US-E-6 | Skill Recommendation from Pattern Mining | **Parking** | Merged into Roger US-R-1 round 2. Not my surface anymore. | **Drop** (already merged). |
| US-E-7 | Ledger-Auditable Model Provider Swap 🐞 | **T4** | Depends on US-E-NEW-11 (hermetic) + US-E-2b (branching). Once both land, this is a thin CLI verb. Strict cost-honest: not load-bearing for the one-week bar. | Keep, defer. Trim story scope to "rerun fork with `--model <id>`" — no separate provider plumbing. |
| US-E-8 | Sub-Agent Dependency DAG | **T5 / Parking** | Aaron's solo-v1 honesty test. With one user and one Crucible instance, true parallel sub-agent scheduling is a future concern. Start by *reading* SDK `subagent.*` telemetry into Cairn; defer scheduler. | **Split:** (a) "ingest sub-agent topology" — T4 (1h work, unlocks observation). (b) "topological scheduler" — Parking until Aaron actually wants parallel agents. |
| US-E-9 | Live Simulation Dashboard | **T2** | Already merged into Mirror (round 2). My contribution narrows to the **fitness/credible-interval rendering contract** Mirror's Dashboard render-mode needs. T2 because Mirror is the notification surface for the bootstrap loop (Graham round 6). | **Merge** into Mirror (Valanice owns); I contribute the visual contract as advisory input, not a separate story. |
| US-E-10 | Single-User Fork + Export + Self-Pair | **T3** | Pure dependent of US-E-2b. Export format is the federation insurance from tension #1. Real but post-branching. | Keep. **Drop** "self-pair" framing — that's a workflow, not a primitive. Story is just "export a Crucible session slice to a portable bundle." |
| US-E-NEW-11 | Hermetic Replay Boundary 🐞 | **T2** (owned by Alexander) | Promoted to v1 commitment #4. Not my story to tier anymore. Half-shipped (DBOM content-addressing). My advisory interest: extend the canonical-JSON+SHA-256+parentHash idiom rather than design a new scheme. | **Hand off** to Alexander. Erasmus retains observer status. |
| US-E-NEW-12 | Crucible as sub-conversation of Copilot CLI | **Withdrawn** | Aaron's round-3 ruling: Crucible *replaces* Copilot CLI as daily driver. I owe Aaron this reversal already. | **Drop.** |

---

## Recommended T1 set (Erasmus deliverables only)

T1 from my chamber is small and surgical. Two items:

### T1.E.1 — `crucible fork` at HEAD (user-facing verb)

**Story:** "From the active Crucible session, Aaron runs `crucible fork` (no arguments). A new child session is created with `parent_session_id = active`, `fork_point_event_id = last_committed_event`. The active session pointer switches to the child. The parent session is untouched and resumable via `crucible checkout <session_id>`."

**Why T1:** This is the *minimum* primitive that lets Aaron safely apply a Crucible-generated change to Crucible. Without it, every Crucible-on-Crucible iteration is destructive to the parent thread, and Aaron cannot bisect or back out. The one-week productivity loop requires *cheap, reversible experimentation*; that is exactly what fork-at-HEAD provides and nothing else does.

**Why fork-at-HEAD is sufficient for T1 (and fork-at-arbitrary-event is *not* needed in T1):**
- HEAD is where Aaron *is*. The 90% case for "I want to try Crucible's suggestion" is "try it from right here, right now."
- Mid-history forking (`--at <event_id>`) is a *debugger* affordance, not a productivity-loop affordance. It belongs to Sonny's chamber and to US-E-2b/T3.
- COW snapshot validation, lineage trees, ancestor-walk queries — none required to make a one-week loop work. Aaron just needs "did this fork improve things or not? merge or discard."
- 2a's L1 schema already supports arbitrary-event forking; we just don't *expose* the `--at` flag yet. **Zero schema cost; pure verb-surface restraint.**

**Scope discipline for T1:**
- IN: `crucible fork` (HEAD only), `crucible checkout <session_id>`, `crucible sessions list` showing parent links.
- OUT: COW snapshot validation, fork-at-arbitrary-event, lineage rendering, ancestor walks, replay, counterfactual auto-projection.

**Dependencies:** 2a schema migration (`parent_session_id` + `fork_point_event_id` columns on `sessions`). Already in Roger's queue per round-6 resolution #7.

### T1.E.2 — Wire `DecisionRecord.alternatives` into Mirror notifications

**Story:** "Every Crucible decision already serializes its alternatives (`packages/forge/src/decisions/index.ts:40-60`). When Mirror surfaces a decision-related MirrorEvent (per Graham round-6 schema), include `alternatives[]` so Aaron can see the road not taken inline."

**Why T1:** The bootstrap loop's signal-to-noise problem is *legibility*, not capability. If Aaron sees "Crucible decided X" without seeing "...over Y and Z because <reason>", he cannot trust the loop and will not give it the week. The data is already shipping; the wire-up is two fields and a render template.

**Why this is mine and not Valanice's:** Valanice owns the Mirror chamber. I own the *insight* that `DecisionRecord.alternatives` is the latent counterfactual substrate (round 4 surprises). Valanice may not know the field exists. The story is mine to file; Valanice will own implementation.

**Scope:** trivial. ~2 hours of plumbing. The leverage is enormous.

---

## Branching minimum for T1 (sub-list, explicit)

Aaron asked me to be opinionated. Here is the *exact* minimum branching surface for T1:

| Item | In T1? | Why |
|---|---|---|
| `sessions.parent_session_id` column | YES | 2a-locked. Roger ships in round-6 migration. |
| `sessions.fork_point_event_id` column | YES | 2a-locked. Same migration. |
| `crucible fork` (HEAD only) verb | **YES — T1.E.1** | The user-facing unlock. Without this, the schema is dead weight. |
| `crucible checkout <session_id>` | YES | Required to *use* the fork. Trivial sibling of `fork`. |
| `crucible sessions list` with parent column | YES | Aaron has to *see* the fork tree to navigate it. |
| `cairn fork --at <event_id>` | **NO — T3 (US-E-2b)** | Mid-history fork is debugger affordance. Not load-bearing for productivity loop. |
| COW snapshot validation | **NO — T3** | Performance/correctness robustness. Not load-bearing for v1 functional correctness. |
| Ancestor-walk queries / lineage rendering | **NO — T3 (US-E-2b)** + **T4 (US-E-4)** | Legibility for power use, not unlock. |
| Counterfactual auto-replay | **NO — T4 (US-E-2c)** | Requires hermetic + variant strategy. T4 minimum. |
| Bisect over forked branches | **NO — T3 (US-E-1)** | Debugger affordance. Needs full lineage first. |
| Branch GC / fork pruning | **NO — T3/T4** | Aaron will have ≤50 forks in week one. Defer compaction. |
| Merge / squash semantics | **NO — Parking** | Crucible is not git. Forks resolve by *choosing* which session to keep; no three-way merge. |

**Headline:** T1 ships *fork-at-HEAD as a verb*. That's it. Five lines of CLI, two migrations Roger already plans, and we have the falsifiable-bar unlock.

---

## First-principles surprises — what insiders may have missed

These are things I would promote to T1 that the team likely won't, because they're too close to their existing artifacts.

### 1. `DecisionRecord.alternatives` is the legibility unlock — and nobody has wired it

Already covered in T1.E.2 above. Restating for emphasis: **the most powerful trust-building affordance in the repo is shipping with no consumer.** Insiders see "DecisionRecord schema, fine." Outsider sees: "every decision already records why it was made and what the runner-up was — wire it to Mirror, you've doubled trust in the loop for two hours of work." This is the single highest-leverage T1 item I see.

### 2. `crucible fork` as a *verb*, not a *capability*

The team has talked about branching as a schema (`parent_session_id`) and as a future CLI (`cairn fork --at <event_id>`). The insider reflex is to ship the *full* primitive once the schema is ready. **The outside view says: ship the simplest verb that exercises the schema, in T1.** No flags, no options, no `--at`. Just `crucible fork`. The verb's existence *forces* the rest of the pipeline (active-session pointer, sessions list, checkout) to materialize, and those are the load-bearing pieces for the productivity loop. The "rich" branching API can land in T3 against a working verb.

### 3. The `parentId` chain at the Cairn → event_log boundary

Already in my round-4 recommendations and round-6 has now resolved the underlying L1 substrate (resolution #7 demotes `event_log` to a derived L2 audit projection). **But the per-event `parentId` chain is still load-bearing for bisect and causal-slice**, and I don't see it explicitly named as a T1 invariant for the L2 EventLogProjector. If the projector flattens parentId again, we re-create the round-4 bug at a new layer. **I would promote "EventLogProjector must materialize parentId" to a T1 invariant** so it's not lost in implementation. Owner: Rosella or Roger.

### 4. Mirror as bootstrap-loop signal, not just notification

Graham round-6 lands Mirror as the notification surface. **I want to call out that Mirror is also the *only* mechanism by which Aaron will know the loop is closing.** "Crucible just made an improvement to Crucible" is a `MirrorEvent` category that should exist by name in T1, not be invented in T2. This is Valanice's surface but my framing: without a `category: bootstrap` event class in T1, the falsifiable bar is unobservable. Flag for Valanice.

### 5. Stop treating fork-at-arbitrary-event as the headline

Insiders (including me, round 1-3) treated `cairn fork --at <event_id>` as *the* branching story. After round 5/6's L1 ledger work, that's the easy part — the schema does it. **The hard part is the user model: when does Aaron fork? what does the active pointer look like? how does he navigate the tree?** Those are the T1 questions, and they don't require any of the robustness work (COW, ancestor-walk, lineage diff) that lives in T3. *Promote the user-model questions; demote the schema-flag question.*

---

## Open questions for Cassima

1. **Is fork-at-HEAD sufficient for the one-week falsifiable bar, or does Aaron also need fork-at-last-decision in T1?** My read: HEAD is enough — but "fork at the last `DecisionRecord` boundary" is a 1-line variant of HEAD-fork and would let Aaron say "undo to before Crucible decided X, then try again differently." If you think Aaron will reach for that in week one, promote it to T1 as `crucible fork --at-last-decision` (a degenerate special case, not the full `--at <event_id>`).

2. **Who owns the "active session pointer" verb — Erasmus (semantic) or Sonny (debugger seat)?** `crucible checkout <session_id>` is a debugger affordance *and* a productivity-loop affordance. I'd take it under T1.E.1 to keep the fork-verb story whole, but defer to Sonny if he wants it.

3. **Is T1.E.2 (DecisionRecord.alternatives → Mirror) mine or Valanice's?** I'm proposing it; Valanice owns the surface. Need a clean split. My preference: I file the story citing the in-tree substrate; Valanice owns implementation under the Mirror tier.

4. **Should the DBOM Merkle chain be promoted to a named L1 primitive in T1, or stays inside DBOM until T2?** Round-6 resolution #5 keeps DBOM on SHA-256 + leaves L1's new hash on CBOR+BLAKE3. That's correct for hash choice. But the *Merkle-chain idiom* is still hiding inside DBOM — I'd promote naming-only ("DBOM is an instance of the L1 content-addressing pattern") in T1, with no code movement. Cheap.

5. **US-E-2c (counterfactual auto-replay) — T4 or Parking?** I tiered it T4 because it falls out naturally from US-E-2b + Alexander's hermetic replay. But if Aaron doesn't reach for it in the dogfood week, it's a Parking candidate. Defer the call until we see how often Aaron forks in T1.

6. **US-E-8 split — is the "ingest sub-agent topology" half (T4) actually a T3 item?** SDK already emits the events; one bridge mapping plus a `subagent_topology` projection table. If Sonny's debugger needs sub-agent lineage to chase bugs, this might be T3 alongside branching. Defer to Sonny.

7. **Fork-merge semantics: confirmed Parking?** I'm calling it Parking on the basis of "Crucible is not git." But if Aaron expects to "merge a successful Crucible-improvement-fork back into the parent session," we need at least a `crucible adopt <session_id>` verb (replay child events onto parent). Want explicit confirmation before I commit Parking.

---

## What I am *not* changing

- US-E-NEW-12 stays withdrawn. Round-3 decision.
- US-E-5 stays withdrawn. Round-2 decision.
- US-E-6 stays merged into Roger US-R-1. Round-2 decision.
- US-E-NEW-11 stays Alexander's. v1 commitment #4 (round 5/6).
- The 2a SDK boundary is locked; I am not re-litigating it.

---

## Closing — the outsider read

The insiders built a serious substrate. After round 5/6, the L1 ledger, the SDK boundary, the Mirror surface, the hermetic replay commitment, and the canonical-JSON-Merkle pattern are all locked. The question for v1 is not "what capability do we add" but **"what is the smallest verb-surface that closes the productivity loop?"**

My answer, opinionated:

> **`crucible fork` at HEAD + `crucible checkout` + Mirror surfacing `DecisionRecord.alternatives`.** That is the entirety of my T1 ask. Everything else in my chamber waits for T3 or later. The bar is met.

If we add more to T1 we slow the dogfood loop. If we ship less, Aaron can't safely try Crucible's improvements to Crucible. This is the minimum, and I'd bet the week on it.

—Erasmus


### erasmus-two-harnesses-one-repo

# Two Harnesses, One Repo, One Developer — Honest Assessment

**Author:** Erasmus (Specialist Consultant)
**Date:** 2026-05-26
**Requested by:** Aaron Kubly
**Scope:** Functional comparison of Eureka and Crucible; verdict on building both simultaneously.

---

## Eureka — Functional Description

Eureka is a **durable knowledge store for LLM-based coding agents**. It persists facts (code conventions, architectural decisions, session context, aspirations) in a SQLite database with BM25 keyword retrieval, composite ranking (relevance × importance × trust × recency × attention-tier), and a graph of typed relationships between facts. Agents `integrate` knowledge during sessions and `recall` it in future sessions instead of re-reading source code. Facts have trust scores (provenance reliability, 0–1, event-driven mutation) and attention tiers (hot/warm/cold) that decay over time via ACT-R power-law dynamics. Two bidirectional adapters bridge to Forge's audit layer: contemplative decisions (Eureka→Forge via `toDecisionRecord`) and observed in-flow decisions (Forge→Eureka via `fromDecisionRecord`). An opportunistic sweep maintains fact health. Sessions are modeled as facts, not tables, sharing a branded `SessionId` type with Cairn. The v1 retrieval is keyword-scoped (BM25); semantic similarity is deferred to v1.5 (sqlite-vec).

**What it owns:** Durable agent memory. Trust tracking. Knowledge retrieval. Deliberative decision support. Cross-session continuity.

**What it does NOT own:** Runtime execution. Event capture. Pattern detection. Prescriptions. Agent orchestration. Tool dispatch.

## Crucible — Functional Description

Crucible is a **self-improving agentic runtime** — a coding harness that replaces Copilot CLI as Aaron's daily driver, built on the Copilot SDK. It has a 5-layer stack: (1) **Cairn** — an immutable event ledger that records sessions, tool calls, errors, and guardrail skips, with cursor-based processing and secret scrubbing; (2) **Curator** — a pattern-detection layer that sweeps the event stream for recurring errors, error-sequence correlations, and skip frequencies; (3) **Prescriber** — converts detected patterns into prioritized improvement suggestions with an 8-state lifecycle (generated → accepted → applied, with auto-suppression, session-aware deferral, and rollback); (4) **Forge** — an optimization/audit layer with DBOM Merkle chain for decision provenance, model strategies, drift-sketch telemetry aggregation, and change-vector learning; (5) **Mirror** — the rendering/UX surface. Plus `skillsmith-runtime` (the agent execution loop) and `runtime-cli` (the CLI shell).

**What it owns:** Agent execution. Event capture. Pattern detection. Self-improvement prescriptions. Audit provenance. Runtime orchestration. The daily-driver developer experience.

**What it does NOT own:** Durable cross-session knowledge. Trust-weighted retrieval. Deliberative decision-making. Knowledge graph.

---

## Prior-Art Analogs

### Eureka ≈

| Prior Art | Match Quality | Notes |
|-----------|--------------|-------|
| **Mem0** (agent memory layer) | High | Same pitch: durable memory for agents, trust/importance scoring, cross-session persistence. Mem0 uses embeddings from day 1; Eureka defers to v1.5. |
| **Zep** (long-term memory for LLM apps) | High | Structured fact store, temporal awareness, retrieval with ranking. |
| **Copilot CLI `store_memory`** | Medium-High | Already ships: durable cross-session memory, upvote/downvote, used by Aaron daily. Less structured, no graph, no trust scores — but the *same problem*. |
| **LangMem** (LangChain memory) | Medium | Memory management for agent frameworks. Less opinionated about trust/attention. |
| **Aider `.aider` repo map** | Low-Medium | Caches codebase understanding across sessions but is repo-map-scoped, not general knowledge. |

### Crucible ≈

| Prior Art | Match Quality | Notes |
|-----------|--------------|-------|
| **SWE-agent** (agent harness + environment) | High | Agent runtime with environment management, tool dispatch, session tracking. SWE-agent is benchmark-oriented; Crucible is daily-driver-oriented. |
| **Devin** (autonomous coding agent) | Medium-High | Self-contained runtime, session management, tool orchestration. Devin is product; Crucible is personal harness. |
| **Aider** (iterative coding agent) | Medium | Terminal-based coding agent with git integration, iterative improvement loop. Less structured observability. |
| **LangGraph** (stateful agent orchestration) | Medium | Stateful agent graphs with persistence and checkpointing. More general; Crucible is coding-specific. |
| **OpenHands** (coding agent platform) | Medium | Agent runtime with workspace management. Less self-improvement loop. |

---

## Functional Comparison

### These are genuinely different tools.

Eureka and Crucible address different concerns:

- **Crucible** answers: *"What is happening? What went wrong? How do I improve my process?"*
- **Eureka** answers: *"What do I know? What should I decide? What did I learn last time?"*

This maps to a real distinction in the industry: **runtime harness** vs **knowledge layer**. No shipping agentic system I'm aware of has cleanly separated these two concerns into peer packages — but the *reason* no one has done it is instructive (see below).

### But the overlap is significant and already leaking.

| Overlap Point | Crucible Side | Eureka Side | Coupling Artifact |
|---------------|--------------|-------------|-------------------|
| Sessions | `sessions` table (lifecycle) | `kind=session` facts (epistemology) | Shared `SessionId` brand in `@akubly/types` |
| Decisions | `DecisionRecord` (audit) | `DecisionPayload` (deliberation) | Bidirectional adapters `toDecisionRecord` / `fromDecisionRecord` |
| Sweep/ranking | Curator sweep → Prescriber priority | Fact sweep → composite ranker | "Same pattern, different domains" (PRD §7.4) |
| Storage engine | SQLite `better-sqlite3` | SQLite `better-sqlite3` | Shared precedent, same driver |
| Shared types | `@akubly/types` | `@akubly/types` | Package dependency |
| Learning kernel | Cairn may adopt Eureka's sweep/rank | Eureka designs for extraction | Premature abstraction pressure |

The Eureka PRD explicitly acknowledges these overlaps as "substrate kinship" and designs elaborate guardrails (8 enforcement mechanisms, ESLint import bans, branded types, offline-only reconciliation CLI) to manage coupling. This is a warning sign: **the volume of coupling-prevention infrastructure is proportional to the coupling pressure.**

---

## Prior Art: What Happens When Teams Build Two Overlapping Harnesses

### LangChain → LangGraph split
LangChain started as a monolith agent framework. When stateful orchestration needs diverged from the chain-of-tools model, LangGraph was extracted as a separate package. Result: shared types, versioning coordination overhead, user confusion about "which one do I use?", and eventually LangGraph subsuming most of LangChain's value. **The split was technically justified but created sustained coordination tax.**

### AutoGPT → Auto-GPT Forge → AutoGen
The Auto-GPT ecosystem fractured into multiple overlapping agent frameworks. Forge was supposed to be the "serious" harness; AutoGen came from a different team with overlapping goals. Result: fragmented community, duplicated effort, no clear winner. **Multiple harnesses from the same community diluted impact.**

### IDE-agent vs CLI-agent (Cursor vs Aider vs Claude Code)
These are genuinely separate tools from separate teams. They don't share a repo. The lesson: when tools have different interaction paradigms (IDE vs terminal), full separation works. **But Eureka and Crucible share the same interaction paradigm (library consumed by the same agent process).**

### The telling counter-example: nobody else has done it
Aider embeds its memory (repo map, chat history) directly in its runtime. Cursor embeds its codebase index in its IDE. Claude Code keeps session context inline. Devin keeps everything in one system. **No shipping agentic tool has separated "knowledge layer" from "runtime" into peer packages.** They all keep memory as a module within the runtime, not a peer system with its own PRD, schema, adapters, and reconciliation CLI.

---

## Honest Verdict: **Sequence Them**

### Why not "merge them"
They do address different concerns. Eureka's trust-weighted knowledge graph is genuinely different from Cairn's event stream. Forcing them into one schema would muddy both.

### Why not "they're orthogonal — proceed"
They're not orthogonal. They share session identity, decision types, sweep patterns, storage engines, and a planned learning-kernel extraction path. The PRD devotes ~200 lines to managing their coupling. Orthogonal systems don't need 8 enforcement mechanisms to stay apart.

### Why not "isolate them harder"
The coupling is *intentional* — bidirectional decision adapters, shared `SessionId`, learning-kernel extraction. Isolating harder contradicts the stated design intent and removes the "substrate kinship" that makes both systems coherent.

### Why "sequence them"
1. **Crucible is further along.** It has shipping code (Cairn, Forge, runtime, CLI). Eureka has an 849-line PRD and zero implementation.
2. **Crucible is the runtime.** Without a runtime, Eureka has no consumer. Eureka is a library — it needs a caller.
3. **Aaron already has Eureka v0.** Copilot CLI's `store_memory` tool is durable cross-session memory with upvote/downvote. Aaron uses it daily. It's not as sophisticated as Eureka, but it's *shipping and working right now*.
4. **The PRD is over-specified for what v1 actually ships.** Eureka v1 is: SQLite + BM25 keyword search + trust/importance/recency scoring + attention tiers + session facts + bidirectional decision adapters. That's maybe 1,500 LOC of implementation behind 849 lines of specification. The spec-to-code ratio is inverted.
5. **Building Crucible first reveals what memory actually needs to do.** Right now, Eureka's design is speculative — the PRD anticipates needs ("agents re-read codebases," "token budgets spent on rediscovery") that may or may not materialize as Crucible's primary pain points. Build the runtime; instrument it; observe the actual rediscovery tax; then build the memory layer to address *measured* needs, not *hypothesized* ones.
6. **One developer cannot context-switch between two ambitious systems without losing depth.** This is the most important failure mode. Every hour spent on Eureka adapter invariants is an hour not spent making Crucible's self-improvement loop actually work. Industry lesson: solo developers ship one thing well, not two things adequately.

---

## Failure Modes If Aaron Proceeds With Parallel Build

1. **Interface oscillation.** Changes to Cairn's session schema ripple into Eureka's `SessionId` usage and adapter code. Changes to Forge's `DecisionRecord` ripple into both adapters. With one developer making all changes, these ripples are "just refactoring" — but they consume disproportionate calendar time relative to value delivered.

2. **Spec-driven development trap.** The Eureka PRD is at v5-final with 8 review rounds, 14 functional requirements, a security threat model, and a 7-mechanism extraction-readiness enforcement framework. This spec has accreted more design review than most *shipped products*. The risk: implementation becomes an exercise in satisfying spec requirements rather than solving user problems. The spec becomes the product; the code becomes the test suite for the spec.

3. **Premature abstraction via the learning kernel.** Eureka's `packages/eureka/src/learning/` is designed for extraction to `packages/learning-kernel/` (§7.5). This creates abstraction pressure *before the first consumer exists*. The ESLint import bans, subpath exports, and interface-segregation rules all exist to serve a hypothetical future extraction. Premature abstraction is the #1 cause of over-engineered code in my experience with compiler and build-system projects.

4. **The bridge becomes the bottleneck.** Bidirectional adapters (`toDecisionRecord`, `fromDecisionRecord`), bridge telemetry, bridge reliability contracts, bridge ledger tables, offline reconciliation CLI — the PRD devotes enormous energy to the *seams* between systems. Seams are where bugs live. With two systems being built by one person, the seams don't get the adversarial testing they need.

5. **Circular self-reference.** If Eureka works, Crucible's agents will store facts about Crucible's own code in Eureka. Eureka's sweep will rank and decay knowledge about its own implementation. Debugging becomes recursive: "Eureka recalled a stale fact about Cairn's session schema, which caused Crucible to make a wrong decision about how to record Eureka's session." This is either brilliant or a nightmare.

6. **Attention-tier starvation.** The developer has their own attention tiers. Crucible is "hot" (it's the daily driver, it has shipping code). Eureka is "warm" (it has a spec, no code). The attention economics that Eureka models for agents apply to the developer building it — and they predict that Eureka will decay to "cold" once Crucible's immediate demands absorb available cycles.

---

## One Contrarian Observation

**Eureka's actual shipped v1 functionality is a subset of what Copilot CLI's `store_memory` tool already does — and Aaron already uses that tool every day.**

`store_memory` persists facts durably across sessions. It has upvote/downvote (a binary trust mechanism). It has subject tagging (a lightweight kind discriminator). It has citation tracking (a lightweight source provenance). It surfaces memories in context.

Eureka v1 adds: composite ranking formula, attention tiers, graph-ready edge schema, ACT-R decay, decision adapters, sweep maintenance, BM25 retrieval, and a 3-tier storage architecture (only one tier wired in v1).

The question Aaron should sit with: **Is the delta between `store_memory` and Eureka v1 worth a second harness?** Or would the highest-leverage move be to build Crucible to completion, use `store_memory` as the memory layer, and let Eureka emerge organically when (if) `store_memory` proves insufficient?

Prior art says: the memory layers that succeed are the ones extracted from working systems, not designed in advance. Git's object store was extracted from BitKeeper workflows. Bazel's action cache was extracted from Google's build needs. React's state management was extracted from Facebook's rendering needs. **The best infrastructure is discovered, not designed.**

---

## If Both Must Ship: Cleanest Architecture

If Aaron is committed to parallel development, the cleanest pattern from prior art is **monorepo with layered dependency, not peer packages**:

```
@akubly/types          ← shared branded primitives (SessionId, DecisionRecord)
@akubly/eureka         ← knowledge layer (facts, recall, trust, sweep) — NO dependency on cairn/forge
@akubly/cairn          ← event ledger — MAY depend on eureka (for learning kernel, when extracted)
@akubly/forge          ← audit/optimization — imports types only
@akubly/skillsmith-runtime  ← agent loop — imports cairn + eureka as peer libraries
@akubly/runtime-cli    ← CLI shell — imports skillsmith-runtime
```

**Key discipline:** Eureka is a leaf dependency. It imports nothing from Cairn or Forge. The bidirectional decision adapters live in a *separate* `@akubly/bridges` package (or in `skillsmith-runtime`), NOT in Eureka itself. This inverts the current design where adapters live at `packages/eureka/src/interop/` — which makes Eureka depend on Forge's types.

Prior art: the Roslyn compiler keeps its syntax layer (`Microsoft.CodeAnalysis`), semantic layer (`Microsoft.CodeAnalysis.CSharp`), and workspace layer (`Microsoft.CodeAnalysis.Workspaces`) in strict layered dependency. The lower layers know nothing about higher ones. Build systems (Bazel, Buck) similarly keep the content-addressable store independent of the scheduling/execution engine. **The knowledge store should not know about the runtime. The runtime should know about the knowledge store.**

---

*Erasmus — Outside-the-walls specialist. Opinions are my own and deliberately uncalibrated to internal team vocabulary.*


### gabriel-ctd-phase3

# Gabriel — CTD Phase 3 Decision Drop (§17, §18)

**Author:** Gabriel (Infrastructure)
**Date:** Phase 3 fan-out wave
**Sections:** §17 Observability/Telemetry, §18 Security & Permissions
**Status:** Both FINAL.

## §17 — Observability / Telemetry (FINAL, 10066 bytes, ≤1pp)

Authored as a thin cross-cutting catalog that harvests emission surfaces from every prior section rather than introducing new vocabulary. The 18-row event catalog enumerates every observability-bearing emission across L1 (WAL events, hook verdicts, monotonic-violation, fork_origin, predicate_timeout), L3 (adapter lifecycle errors), L4 (RouterPaused, RouterDecision, structural_proposal_*, applier state transitions, compensating reverts, capability-denied), and the tooling sidebands (replay-equivalence divergence, CI gate failures). Severity assignment is hard-coded by §9.3 projector — no emitter chooses its own attention level, which preserves the R2-3 / TDD-Q3 no-`urgent`-for-structural lock. Trace correlation is the `(sessionId, EventId)` tuple plus `parentId` + `causalReadSet` lineage; no separate trace ID, no external store. The v1 lock is "Aperture IS observability" — zero outbound telemetry, no OTLP, no Prometheus; CI gates are a sibling channel that emit into the merge-target session's WAL. v1.5+ expansion (OTLP exporter, retention policy, operator inbox) is documented as additive so v1 contracts remain stable.

## §18 — Security & Permissions (FINAL, 11954 bytes, ≤1pp)

Authored against the single-user / self-audit posture explicitly. Threat model is accident-containment, not adversarial — 8 in-scope threats (T1 destructive proposal, T2 garbage spam, T3 tier self-promotion, T4 silent structural change, T5 predicate runaway, T6 hidden control-plane drift, T7 forged tier attribution, T8 revert conflation) and 6 explicitly-deferred out-of-scope items (multi-user authz, secret redaction, Sigstore attestation, marketplace governance, cross-session memory ACLs, network egress policy). Policy defaults table ships 4 tier rows × 3 columns (data / structural / hook-bus floor) with default-deny + Round 2.3 most-restrictive ordering, plus the §7.4 tier-promotion path through explicit `crucible plugin adopt`. Plugin sandboxing in v1 is process-boundary + capability-passing through the `ProposalGeneratorBase.start(ctx)` surface (only `ReadSetBuilder`, `LedgerWindowReader`, `logger` — no fs/network/spawn); v1.5+ OS-process isolation is shaped to be additive. Tension #6 deferral is documented with three explicit additive paths (redaction L3 generator, marketplace governance off the tier promotion path, replay-across-key-rotation policy via §11 oracle) so deferring the work does not foreclose it.

## Confirmation

- **§17 FINAL.** `docs/crucible-technical-design/17-observability-telemetry.md`, 10066 bytes, ≤1pp depth budget.
- **§18 FINAL.** `docs/crucible-technical-design/18-security-permissions.md`, 11954 bytes, ≤1pp depth budget.
- No locked decisions are re-litigated.
- No new vocabulary introduced; both sections consume §3/§4/§5/§6/§7/§8/§9/§11 verbatim.

## Synthesis Flags for Phase 3 Close-Out

None of these are blocking for v1 ship; surfaced for Graham's Phase 3 synthesis triage:

1. **§17 catalog row "CI gate failure" introduces `ci_gate_failure` Observation sub-kind** — not currently enumerated in §6.3. If §16 (Test Strategy) does not own this sub-kind by the time §16 is FINAL, §6 needs an additive enum entry (forward-compat under §6.5 evolution rule). Owner: whoever finalises §16; if §16 lands first, fold the sub-kind into §6.3 in the same pass.

2. **§18.2 default-policy row for `external` tier mentions "confidence < 0.9"** — `confidence` is a field on the `DataProposalGenerator` shape (§7.1) that I am taking on faith from the locked §7. If Rosella's §7 final does not expose `confidence` as a first-class field, the §18.2 row needs a one-line patch to reference whatever field she actually shipped (or drop the threshold clause and let the predicate registry handle it). Flag for Graham's read-through.

3. **No urgent severity in v1.** §17 catalog deliberately uses no `urgent` rows; §9.3 already locks `urgent` to "human-pulls-the-plug" semantics. Worth double-checking with Valanice that §9 final doesn't quietly add an `urgent` emitter that §17 would then need to catalog. Mechanical check.

4. **Tension #6 v1 UX warning** (§18.4 final paragraph) — I state that the v1 CLI help / README MUST warn the user that captured Observations are not redacted. This is a documentation-shape obligation on Valanice's §13 CLI and on the v1 README that I am specifying from §18 but not owning the writing of. If this gets dropped in Phase 3 close-out, the v1 ship would be technically secure-by-disclosure-failure. Flag for Graham's release-readiness checklist.

No Aaron-triage required. All four flags are mechanical synthesis-pass items, not new open questions.


### graham-b3-sdk-validation-hook

# B3 — §12.7 Boundary-Faithful Replay Validation Hook

**From:** Graham (Lead / Architect)
**To:** Alexander (§12 Copilot SDK Integration owner)
**Date:** 2026-05-29
**Priority:** Post-CTD authoring — should land alongside or shortly after
ADR-0011 body.

---

## Context

Design Panel finding B3 (Skeptic, BLOCKING) identified that hermetic replay
is boundary-faithful only — the SDK may inject hidden system prompts, safety
context, or tool-schema rewrites between the L0 boundary and the model API
call. Graham authored §11.10.1 (boundary-faithful vs prompt-faithful replay)
as the replay-side framing. This inbox item requests the SDK-side complement.

## Requested Change

Add a paragraph to §12.7 (Optional `causalContextWindow` — Copilot SDK
Reality) documenting the **validation hook** for future prompt-faithful
replay:

1. **Acknowledge the gap:** when the SDK injects content below L0, the
   captured Observation does not reflect the model's actual input. This is
   a known, documented limitation — not a bug.

2. **Forward-compat validation plan:** when the Copilot SDK (or a future
   provider) exposes raw request traces (outbound HTTP payloads, token-level
   prompt construction), the `SdkProvider` adapter should:
   - Capture the raw request trace as an additional CAS artifact alongside
     the boundary Observation.
   - Enable Aperture to diff boundary Observations against raw traces,
     surfacing a `boundary_prompt_gap` metric.

3. **Cross-reference §11.10.1** as the replay-side complement that defines
   the degraded-mode semantics.

## Owner

Alexander authors; Graham reviews.

## Cross-references

- §11.10.1 (boundary-faithful vs prompt-faithful replay — Graham, just authored)
- §12.5 (bootstrap-capture field sourcing)
- §12.7 (causalContextWindow SDK reality)
- Design Panel finding B3 (Skeptic)


### graham-cluster-i-2026-05-25

# Graham — Cluster I: Architect-Routed Micros (10 items)

**Date:** 2026-05-25
**Author:** Graham (Lead / Architect)
**Scope:** Cassima's 9th cluster — 10 design-tilted questions routed to me rather than Aaron. Sourced from Gabriel Q1/Q3/Q5, Rosella Q4/Q5/Q6/Q7, Roger Q1/Q2/Q7. Triage files: `gabriel-triage-2026-05-25T0200Z.md`, `rosella-triage-2026-05-25T0200Z.md`, `roger-triage-2026-05-25T0200Z.md`.

**Operating frame:** All locks from Clusters A, B, C, D′, E′, F, G, H are binding. A.3 hybrid substrate, 8-field L1 WAL row, seal-and-split pause in T1 (D′.1.a), Mirror via L1Subscriber projector, Router ≤50ms ack, single-agent T1 (B), single-repo dogfood (G), `tenant_id` migration (G.2), `l0-provider/` boundary (`decisions.md:587-591`). Anything I propose that contradicts these means I've misread; everything below is checked against the ledger.

**Output convention:** Recommendation first, reasoning after, alternative named, cost flagged. No hedging.

---

## I.1 — Gabriel Q1: Router process placement (inline vs co-process)

**Question:** On A.3 the L1 WAL writer is a single TS process owning group-commit. Does the Router run **inline** in that process, or as a **co-process** with IPC ack?

**Recommendation:** **Inline in the L1 writer process. T1. Structural — no separate tier line item.**

**Reasoning:** The ≤50ms ack budget (Phase A R1, Gabriel §6.2) was sized assuming the Router can read predicate state and emit a verdict inside the group-commit critical section. Co-process IPC eats 5–20ms of the budget on transit alone, leaving the Router's own work squeezed against a fence it has no slack to absorb. **Rejected:** co-process for "L4 crash can't corrupt L1." That isolation is fake — under A.3, the group-commit fence is held by the writer; an L4 crash inside the critical section already poisons the in-flight transaction whether L4 is inline or peer (the fence releases on process death either way). What co-process buys is **L4 crash doesn't take L1 down outside the critical section**, which is a real but T2-grade survivability concern (Router restart is the productivity-loop hit, not L1 integrity). The boundary stays clean — `Router` is a typed module with a single entrypoint (`evaluate(walRow) → Verdict`) and no shared mutable state with the WAL writer beyond the predicate registry — so v2 can hoist it to a co-process by changing the call site, not the contract. This is the same pattern Roger's `withShadowEvent` uses: enforce the boundary at the type layer, defer the process boundary until it pays for itself.

**Cost:** 0 incremental (this is the default Roger and Gabriel were already assuming). Boundary discipline (dep-cruiser rule: nothing outside `router/` may import L1 internals; `router/` exports only `evaluate()`) adds ~2 hrs in sprint 1.

---

## I.2 — Gabriel Q3: Policy hot-swap fence

**Question:** Verdicts carry policy version at emission. Is hot-swap allowed mid-group-commit, or fenced on group-commit boundaries?

**Recommendation:** **Fence at group-commit boundary. T1. Structural — folds into Roger's group-commit driver work.**

**Reasoning:** Phase A R4 + Round-4 reco lock `policy_version` on every recorded verdict (`decisions.md:436-444`). The whole point of recording policy version is replay falsifiability: given the same WAL row + same policy version, replay reproduces the verdict. **Mid-group-commit swap shatters this** — two rows in the same commit can witness different policies, replay sees the post-swap policy applied to both, divergence is silent and non-debuggable. Fencing at the group-commit boundary is a one-line guard in Roger's commit driver: `policyRegistry.lockForCommit()` at fence-open, `unlock()` at fence-close; hot-swap requests during a held lock queue and apply at the next fence open. **Rejected:** allow-mid-flight with "best-effort consistency." That's the silently-non-deterministic story Laura's A1/A3 conformance assertions exist to prevent — they'd start flapping in CI within the first dogfood week. Cheap-now-vs-impossible-later: same logic that drove G.2 `tenant_id`.

**Cost:** ~2 eng-hours (Roger), folded into commit-driver work in sprint 1. Zero T1 calendar impact.

---

## I.3 — Gabriel Q5: `archivist` crash-detect replacement urgency

**Question:** Replace session-row-absence heuristic with WAL-replay crash detection — T1 or T2?

**Recommendation:** **T2. Document the known-unsafe edge case as a §3 PRD non-goal for v1.**

**Reasoning:** Gabriel's own framing: the existing heuristic is unsafe specifically for L4 crash-mid-pause; under Cluster B's locked single-agent T1 + Cluster G's single-repo dogfood, the at-risk failure mode is "Router crashes between pause-emitted and Aaron-acknowledged." Concrete probability over a one-week solo dogfood: low. **More importantly:** the consequence under D′.1.a (pause in T1) is recoverable — on Crucible restart, the WAL has the pause-verdict row durably committed (locked Phase A: pause is recorded *before* fsync), Aaron's ACK is the unblocking action, no silent commit can occur because the pre-commit fence already held. So the worst case is "Aaron's pause looks lost; he re-issues the operation" — annoying, not unsafe. **Rejected:** T1 promotion. ~3–5 eng-days against an 11–13 week T1 to harden a failure mode whose blast radius is "one productivity-loop hiccup" is the wrong trade when Gabriel NEW-15 P1–P5 fuzz coverage of the Router itself is fighting for the same sprint budget. **The fuzz regime is the right place to spend safety budget in T1**, because it catches the class of bugs (not just the one symptom). T2 hardening lands once incident-corpus from dogfood shows the failure mode is real-frequency.

**Cost:** 0 in T1. ~3–5 eng-days in T2 (Roger + Gabriel shared, replay-based crash-detect). PRD §3 line: *"archivist crash-detect at v1 relies on existing session-row-absence heuristic; WAL-replay hardening deferred to T2. Known limitation: Router crash mid-pause requires Aaron to re-issue the operation. Acceptable for single-agent / single-repo dogfood."*

---

## I.4 — Rosella Q4: US-Ro-3 Provider home (Crucible vs Forge)

**Question:** Does Crucible own the Provider interface (a), or does Forge export it (b)?

**Recommendation:** **(a) Crucible owns the Provider interface. T1. Folds into the `l0-provider/` migration already locked at `decisions.md:587-591`.**

**Reasoning:** The locked decision is unambiguous: *"Introduce `l0-provider/` directory. Hermetic types. Dependency-cruiser enforcement... SDK types live behind `l0-provider/` (only there); L1+ consumes a canonical `CrucibleEvent` stream and `BootstrapPayload` value."* That literally is option (a) — the Provider seam is owned at the L0 boundary, which sits inside the Crucible substrate stack, with Forge SDKClient as **one implementation** behind the interface. Forge can't own the Provider abstraction without re-exporting types upward into L1, which is exactly what the dep-cruiser rule prohibits. **Rejected:** (b) Forge exports the seam. That reintroduces the leakage the Open#1 migration was specifically built to eliminate. The package layout to lock: `@akubly/crucible-runtime` declares `Provider` interface + `CrucibleEvent` + `BootstrapPayload` (canonical types); `@akubly/forge` ships `SdkProvider implements Provider`, depending on `@akubly/crucible-runtime` — not the other way around. **This also resolves Cluster F.3** consistently: Alexander's `crucible-runtime` owns the contract, Forge becomes a Provider plugin from the runtime's perspective. Single Provider implementation in T1 (Copilot SDK via Forge); replay-fixture Provider in T3 (Rosella US-Ro-3 T3 slice); third-party Providers in T4.

**Cost:** 0 incremental — already inside the locked 9-hour `l0-provider/` migration. Doc clarification: PRD §2 (Inherited surfaces) and §4 should state explicitly *"Provider interface owned by `@akubly/crucible-runtime`; Forge ships one implementation."*

---

## I.5 — Rosella Q5: Plugin manifest package location

**Question:** Extended `plugin.json` schema (`version`, `dependencies`, `integrity`) — `@akubly/types`, Cairn, or new `@akubly/plugin-spec`?

**Recommendation:** **`@akubly/types`. T1. Structural.**

**Reasoning:** Three consumers need the shape: Cairn's discovery scanner (US-Ro-NEW-2 pin manifest), Router's trust-tier admission (US-Ro-NEW-3 T1 slice — `source` enum lives here too), and the Mirror Projector's payload typing for `category: system` plugin-install events. All three already depend on `@akubly/types` (it's the canonical types home; see `decisions.md:138,156-160` for the Wave-3 precedent — `ExecutionProfile` lives there exactly because multi-chamber types belong in the canonical location). **Rejected — `@akubly/plugin-spec` new package:** premature carving. We have one plugin spec consumer triangle and zero second-system requirements; new package = boilerplate (build, publish, dep-cruiser rule, README) for ~6 type declarations. Promote to its own package in T4 if/when third-party plugin signing infra makes the spec a real public contract (Rosella US-Ro-NEW-3 T4 slice). **Rejected — Cairn:** storage-adjacent placement creates the same upward-leakage hazard as putting Provider in Forge — Router shouldn't have to import from Cairn to validate manifests. Same principle as I.4.

**Cost:** ~2 eng-hours to declare types in `@akubly/types` + update Cairn discovery to import from canonical location. No new package.

---

## I.6 — Rosella Q6: MirrorEvent ↔ event_log join key confirmation

**Question:** Is `source_event_offset` the canonical join key between the two L2 projections?

**Recommendation:** **Yes. `source_event_offset` (Migration 014) is the canonical join key. T1 doc-only — confirm in PRD §2 Glossary.**

**Reasoning:** Rosella already correctly identified this in her triage's free-multiplier section. Mirror Projector and EventLogProjector are peer L1Subscribers; both materialize from the same L1 WAL row; both must carry the source offset for idempotency (replay-without-double-write). Using the same column as the join key is *required*, not a choice — if we picked anything else, the two projections could disagree about which L1 row they're projecting, which breaks Laura's A1/A3 conformance assertions (same row → identical derived state across re-runs). The column name is locked by Migration 014 (`source_event_offset`), the type is `BIGINT NOT NULL`, and indexes already exist on both projection tables. **Rejected:** synthesizing a separate "correlation id" because "offset feels like an implementation detail." Offsets in A.3 are ULID-sortable, monotonically assigned by the WAL writer, and durable — they ARE the canonical identity of an L1 row. Adding a parallel correlation id duplicates truth and creates a divergence mode. **Sonny + Laura cross-consume:** Sonny's `crucible why <event_id>` accepts `event_id` as either an `event_log.id` or a WAL offset — the projector keeps them joined.

**Cost:** 0 implementation. ~30 min doc — PRD §2 (Inherited surfaces) or §7 (Glossary): *"`source_event_offset` is the canonical L1↔L2 join key across all projections (event_log, mirror_events, future Laura conformance / Sonny investigation projections)."*

---

## I.7 — Rosella Q7: Per-row lineage on WAL (Sonny debugger concern)

**Question:** Are `sessions.parent_session_id` / `sessions.fork_point_event_id` (Aaron decision 2a) sufficient, or does Sonny's debugger need per-row lineage markers on the L1 WAL?

**Recommendation:** **Session-level lineage (Aaron 2a) is sufficient for T1. No per-row WAL lineage column. T1 — confirm; revisit only if T2 debugger work surfaces a concrete need.**

**Reasoning:** Session-level + `cairn fork --at <event_id>` (locked, `decisions.md:567-573`) plus the existing `causal_read_set_hash` on every WAL row gives the debugger everything it needs to reconstruct a per-row provenance chain *by traversal*: given any row, its session's `fork_point_event_id` plus the read-set hash chain identifies the unique ancestor. Per-row `parent_event_id` would be redundant denormalization with measurable cost (32+ bytes per WAL row — the row layout is already 8 fields, every byte added pays in throughput and compaction pressure). **Sonny's T1-D4 (`why-one`)** can resolve provenance via session metadata + read-set hash traversal in O(depth) hops — fine for T1 single-agent depths. **Rejected:** add per-row `parent_event_id` as cheap insurance. Unlike G.2 `tenant_id` (one column, default value, zero read-path cost), per-row lineage participates in *every* hot-path: WAL append, replay, projection, conformance hashing. Cost is not symmetric to benefit. **Re-trigger condition:** if T2 sub-agent execution model (Cluster B post-T1 promotion) introduces concurrent-write per-session lineage that session-level can't represent, we add the column then with a single migration. Schema evolution is cheap on A.3 because Roger's migration framework already handles WAL row format versioning.

**Cost:** 0 in T1. Schema migration ~4 eng-hours in T2 *if* sub-agent execution surfaces the need. **Flag for Sonny:** confirm `why-one` walks session metadata, not row-internal pointers. If his T1 design assumed per-row pointers, we adjust now; otherwise we ship session-level and revisit.

---

## I.8 — Roger Q1: `signal_samples`-style rolling buffer for observation capture bounding

**Question:** Should the TTL+cap pattern (`migrations/011-telemetry-feedback.ts:9-23` — 7-day TTL, 10K-row cap) be an explicit T1 sub-story for capture-store bounding, or absorbed into US-Ro-NEW-1 compaction silently?

**Recommendation:** **Explicit T1 sub-story under US-Ro-NEW-2. Bound is contractual. T1.**

**Reasoning:** Roger's own framing nails the reasoning — observation capture is the largest data-volume implication in v1 (5–10× ledger), and the bound has cross-team implications (Laura's conformance corpus reads from it; Gabriel's replay driver depends on it being there). Silent absorption into Ro-NEW-1 compaction defers the bound discipline until Ro-NEW-1's T5 slice lands, which is exactly when it's most painful to add — Aaron's already mid-dogfood and the WAL has unbounded capture-store growth. **The TTL+cap pattern is already in the codebase** (`signal_samples` migration 011) and proven safe under Curator-enforced sweep; lifting the pattern to a CAS bound is **substrate-shaped** work that belongs in the substrate sub-tier. Bounds: 7-day TTL on capture rows (matches the dogfood week window), 100K-row cap (10× the `signal_samples` cap because per-row payload is bigger but call-rate is similar), Curator sweep on existing schedule. **Rejected:** silent absorption. The "contract or it doesn't exist" rule — Gabriel's R3a bounded-queue argument applies identically here. An unbounded surface ships as a slogan, then DoSes the first week of dogfood when Aaron's LLM call rate exceeds expectations.

**Cost:** ~4 eng-hours (Roger): CAS bound enforcement + Curator sweep registration. Folds inside US-Ro-NEW-2's existing T1 scope; no separate calendar add. T1 calendar unchanged.

---

## I.9 — Roger Q2: `change_vectors` generalization to all proposals

**Question:** Generalize `change_vectors` (currently hint-scoped, migration 012) to all proposals as L2 primitive for post-commit outcome attachment — co-author T1 with Laura, or T2?

**Recommendation:** **T2. Roger + Laura co-authored story, filed now, sized in T2 sprint planning. T1 ships unchanged hint-scoped surface.**

**Reasoning:** The cross-team binding makes this look load-bearing for v1, but it isn't — the productivity loop (Cluster A strong-bounded) closes on hint-scoped change_vectors because Aaron's week-one improvement signal is dominated by Drift + Curator hints, both of which already write change_vectors via migration 012. Laura's lazy-finalization (US-L-7) wants generalization across *all* proposal types, but in T1 the non-hint proposal types Aaron actually exercises are sparse (Forge prescriber outputs, which Alexander auto-attaches outcomes for via the existing applier path). **Rejected:** T1 generalization. Net add ~1 sprint of schema migration + projector rewrite + Laura conformance assertion extension + every proposal generator getting an outcome-attachment hook. Against the locked 11–13 week T1, that's ~5–8% budget to generalize a primitive whose generalization payoff doesn't arrive until T2 (when Alchemist US-Ro-5 starts emitting structural-proposal outcomes). **The story-shape lock matters** — same logic as H.5 verdict-enum extension: filing it explicitly prevents T2 surprise scope. Owners: Roger (L2 primitive shape + migration), Laura (conformance assertion extension). Consumer: Alchemist (T3) + any T2 proposal generators.

**Cost:** 0 in T1 (hint-scoped surface unchanged). T2 estimate: ~1 sprint (Roger 3-4 eng-days schema + projector; Laura 2 eng-days conformance extension).

---

## I.10 — Roger Q7: Hook bus WASM ABI seam in T1

**Question:** T1 ships JS-only predicates + WASM T2, or T1 includes the WASM ABI seam so T2 upgrade is non-breaking?

**Recommendation:** **Ship the WASM ABI seam in T1; defer the WASM runtime to T2. T1 structural (~1 eng-day).**

**Reasoning:** Roger's own lean is correct and the precedent is everywhere — the cheap-seam-now-vs-breaking-change-later trade is the same one driving Cluster B (Option 2 spawn seam reserved), G.2 (tenant_id migration), and Aaron's locked decision on `l0-provider/`. The hook bus predicate-runner has exactly one consumer-visible surface: `evaluate(predicateId, walRow) → Verdict | Promise<Verdict>`. Making that surface ABI-shaped from day one — predicate registration returns an opaque handle, evaluator dispatches via the handle to whatever runtime registered it — costs ~1 eng-day of interface discipline in T1 and means T2 WASM lands as a new registration path without changing the bus or its callers. **Rejected:** JS-only with hard contract that breaks on WASM addition. That's the "we'll generalize when we need it" antipattern that bit US-A-NEW-5 (almost rebuilt event_log) — the cost of generalization-after-the-fact on a load-bearing safety chokepoint is exactly the kind of thing that turns into a multi-sprint reshape. **The 80µs budget Roger flagged from Round 5** is the explicit T2 trigger: when a JS predicate blows the budget, WASM is the answer, and we want the seam waiting for it, not a refactor. Property-test coverage (Gabriel NEW-15 P1–P5) tests the seam shape in T1 against the JS-only implementation; T2 plugs in the WASM runtime against the same property suite.

**Cost:** ~1 eng-day in T1 (Roger): interface design + dep-cruiser rule that bus dispatcher doesn't import JS-runtime specifics. T2 WASM runtime: ~1 sprint when triggered.

---

## Summary table

| Q | Topic | Tier | Cost |
|---|---|---|---|
| I.1 | Router process placement (inline) | T1 structural | 0 incremental + ~2 hrs boundary |
| I.2 | Policy hot-swap fence (group-commit boundary) | T1 structural | ~2 eng-hrs |
| I.3 | archivist crash-detect replacement | **T2** | 0 in T1 (PRD §3 non-goal) |
| I.4 | US-Ro-3 Provider home (Crucible owns) | T1 structural | 0 (inside `l0-provider/` lock) |
| I.5 | Plugin manifest in `@akubly/types` | T1 structural | ~2 eng-hrs |
| I.6 | MirrorEvent↔event_log join key confirmed | T1 doc-only | ~30 min |
| I.7 | Session-level lineage sufficient (no per-row WAL) | T1 confirm | 0 in T1 |
| I.8 | Observation capture TTL+cap (explicit) | T1 sub-story under US-Ro-NEW-2 | ~4 eng-hrs (inside Ro-NEW-2 scope) |
| I.9 | change_vectors generalization | **T2** | 0 in T1; story filed |
| I.10 | Hook bus WASM ABI seam (T1) | T1 structural | ~1 eng-day |

**Verdict count:** 10/10 decided. 8 T1, 2 T2.

## Aggregate T1 calendar delta

Net T1 add from Cluster I: **~2 eng-days** (~16 eng-hours) of discipline-and-seam work, all of it absorbable inside existing T1 sprint scope (Roger's substrate sprint absorbs I.2/I.5/I.8/I.10; Alexander's runtime sprint absorbs I.1/I.4; doc work for I.6/I.7 is hours, not days; I.3/I.9 are explicitly T2).

**T1 calendar: ~11–13 weeks** (unchanged from Cluster H lock). Cluster I does not move the bar.

## Items flagged for Aaron's attention

**Two items only** — both are confirmations, not asks:

1. **I.3 (archivist T2 + PRD §3 non-goal):** I'm explicitly accepting "Router crash mid-pause requires Aaron to re-issue the operation" as a *named* T1 limitation. This is the only one of the 10 with a user-visible failure mode in week-one dogfood, so Cassima should make sure it lands in PRD §3 as a deliberate non-goal, not as silent risk. **Aaron should glance** that this is the acceptable shape; if his single-week dogfood expects zero re-issue-on-crash, escalate I.3 to T1.

2. **I.7 (no per-row WAL lineage):** Sonny's T1 debugger design (T1-D4 `why-one`) needs to confirm it walks session metadata + read-set hash chain, not per-row pointers. If his design assumed per-row, we need a 4-hour migration *now*; if he's session-walking, we ship as-is. **Cassima to surface to Sonny this week** as a single yes/no check before sprint 1.

Everything else is structural — my call, locked.

— Graham


### graham-ctd-phase3-adr

# Decision Drop — Graham — CTD Phase 3 §19 ADR Set

**From:** Graham (Lead / Architect)
**Date:** Phase 3 fan-out
**Status:** FINAL

## Summary

§19 (ADR Set Index) authored at `docs/crucible-technical-design/19-adr-set.md`.

- **Count:** 17 ADRs indexed (ADR-0002 through ADR-0018), matching plan rev. 3 ("grew from 9 to 17").
- **Shape:** Single index table — `# | Title | Decision (one line) | CTD anchor | Author | Status` — plus authoring/lifecycle rules.
- **Status convention:** Every row carries `Accepted (CTD-locked) — pending authoring`; rows flip to `Accepted — <date> by Aaron` when the per-ADR file lands in `docs/adr/`.
- **Authorship:** Section owner authors the ADR file (Roger×4, Laura×4, Graham×3, Rosella×3, Alexander×1, Valanice×1, Gabriel×1).
- **Depth budget:** ≤1 page — table is the page; lifecycle rules add ~10 lines of declarative prose, no ADR content bleeds in.

## Confirmation

§19 is **FINAL**. ADR index is the deliverable; ADR bodies are post-CTD work governed by the lifecycle rules in §19.3. No new ambiguities surfaced.


### graham-eureka-crucible-overlap

# Eureka × Crucible Overlap Analysis

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-26  
**Inbox:** `.squad/decisions/inbox/graham-eureka-crucible-overlap.md`  
**Inputs:** Eureka PRD v5-final (`mem/.squad/decisions/eureka-prd-v5-final.md`), Crucible PRD (via `.squad/decisions.md` + `.squad/agents/graham/history.md`), all locked decisions through Round 2.4.

---

## 1. Functional Summary of Eureka

In my own words, not Eureka's marketing:

- **Eureka is a durable fact store with trust-weighted retrieval for agentic sessions.** It stores facts (not events), ranks them via BM25 + composite scoring (trust × importance × recency × attention tier), and returns lightweight handles. It is a library, not a runtime.
- **It has two decision pathways.** Path 1 (contemplative): agent calls `decide()`, Eureka reasons over its graph, emits a lossy `DecisionRecord` to Forge for audit. Path 2 (in-flow): Forge captures a decision during normal LLM exchange, Eureka ingests it via `fromDecisionRecord()` for learning. Both adapters live in Eureka; Forge changes nothing.
- **It shares session identity with Cairn via a `SessionId` brand in `@akubly/types`.** Sessions are `kind=session` facts, not a sibling table. Cairn owns operational lifecycle; Eureka owns epistemological artifact. No cross-DB joins at runtime.
- **It has a learning kernel designed for extraction.** `packages/eureka/src/learning/` is extraction-ready to `packages/learning-kernel/` in v1.5+ if Cairn chooses to adopt. 5 of 7 enforcement mechanisms ship in v1.
- **v1 is narrow:** agent-tier only, BM25 lexical retrieval, no semantic similarity, no meditate/contemplate, manual-only session-fact creation, on-demand-only Path 2 ingestion.

---

## 2. Overlap Matrix

| Component | Crucible Position | Eureka Position | Relationship | Risk |
|---|---|---|---|---|
| **Session model** | L1 WAL row + `sessions` table with `parent_session_id`, `fork_point_event_id`; sessions branch/fork; Crucible owns lifecycle. | `kind=session` facts in SQLite; `session_id: SessionId` brand shared with Cairn's `sessions` table; no branching concept. | **CONFLICTING** | **HIGH** — Eureka's FR-13 assumes Cairn's flat `sessions` table. Crucible replaces that table with a WAL-based branching model. `SessionId` semantics diverge (Eureka: 1 UUID = 1 flat session; Crucible: 1 UUID = root of a fork tree). |
| **Decision primitives** | First-class primitive in 5-type taxonomy (Request, Artifact, Observation, **Decision**, Question); content-addressed, hash-linked in L1 WAL; causal_read_set captured. | `kind=decision` facts; `DecisionPayload` with `input_trust_min`, `reasoning_confidence`; lossy bridges to/from Forge's `DecisionRecord`. | **CONFLICTING** | **HIGH** — Crucible's Decision primitive is richer (causal read set, hash-linked provenance, hook-bus verdicts). Eureka's adapters target today's flat `DecisionRecord` in `@akubly/types`. When Crucible ships, the Decision shape changes upstream of Eureka's bridges. |
| **Event log / Ledger** | Custom TS append-only WAL (L1) with group-commit, pre-commit hook bus, per-row content addressing. Replaces Cairn's `event_log`. | No event log — Eureka has a `facts` table. But bridges observe Cairn's event stream for session correlation and reconciliation. | **LAYERED but fragile** | **MEDIUM** — Eureka doesn't consume the event log directly at runtime. But the offline `eureka reconcile` CLI (FR-7.4) opens Cairn's `knowledge.db` and cross-references `bridge_ledger` entries against Cairn's event stream. If Crucible restructures that stream into a WAL, reconciliation breaks. |
| **Sweep pattern** | Curator is an L3 ProposalGenerator; sweeps events via cursor-based polling. | FR-12 opportunistic sweep over facts (5 atomic phases: importance decay, tier demotions, edge population, stale flags, edge reconciliation). | **INDEPENDENT** | **LOW** — Acknowledged as "substrate overlap as feature" in Eureka §7.4. Different data models (events vs facts), same *pattern*. No runtime coupling in v1. |
| **Trust / Confidence** | Confidence is Cairn-domain (0..1 on prescriptions). | Trust is Eureka-domain (0..1 on facts). Explicitly orthogonal per Eureka §7.4. Branded types deferred to v1.5. | **INDEPENDENT** | **LOW** — Already de-risked by explicit orthogonality framing + branded types plan. |
| **`@akubly/types` shared package** | Crucible extends with L1 WAL types, 5-primitive schema, extended `OptimizationHint.source` enum (`{builtin\|adopted\|community\|external}`). | Eureka extends with `SessionId` brand, `DecisionPayload`, session fact types. | **SHARED SUBSTRATE** | **HIGH** — Both projects need to extend `@akubly/types` simultaneously. Merge conflicts guaranteed. `DecisionRecord` is load-bearing for both: Eureka's bridges depend on its current shape; Crucible's L3 generators may need to evolve it. |
| **`skillsmith-runtime`** | Crucible's runtime (`@akubly/crucible-runtime`) replaces the message loop. `skillsmith-runtime` is a 323-line composition root for legacy Cairn↔Forge; flagged for rename (Alexander Phase B). | Eureka §7.3 references `skillsmith-runtime` as a production harness that does NOT invoke `ingestDecisions` by default. | **CONFLICTING** | **MEDIUM** — Eureka's production wiring assumptions reference a package Crucible will likely absorb or deprecate. |
| **CLI shell** | Crucible IS the CLI shell (`crucible` command), replaces Copilot CLI as Aaron's daily driver. | Eureka is a library; also has `eureka` CLI for reconciliation/ingestion/stats. | **LAYERED** | **LOW** — Clean layering: Crucible is the shell, Eureka is a library Crucible can call. But: who wires Eureka into Crucible's session lifecycle? Unspecified in both PRDs. |
| **Forge interop** | Forge becomes an L3 ProposalGenerator. Forge's internal structure (prescribers, model strategy, runtime) stays but serves a different master. | Eureka's Path 1/Path 2 adapters target Forge's `DecisionRecord`. "Forge changes nothing" (Eureka §7.2). | **CONFLICTING** | **HIGH** — Eureka's explicit promise that "Forge changes nothing" collides with Crucible's restructuring of Forge into an L3 generator. If Forge's `DecisionRecord` shape evolves for Crucible, Eureka's adapters silently drift. |
| **Cairn package** | Cairn is being restructured: L1 WAL replaces flat event_log; `sessions` gains branching; migration-013+ may add schema changes. | Eureka treats Cairn as a stable peer: observes but does not mutate; bridges reference Cairn's current schema. | **CONFLICTING** | **HIGH** — Eureka's entire bridge architecture (FR-7.4, FR-13, FR-14) is designed against *today's* Cairn. Crucible restructures Cairn. Simultaneous development means Eureka builds bridges to a moving target. |
| **Hook bus** | Pre-commit hook bus on L1 WAL (per-row, `{continue, observe, pause}` verdicts). Load-bearing for Router safety. | No hook bus concept. Eureka sweep fires on end-of-session / first-query-of-day triggers. | **INDEPENDENT** | **LOW** — Different mechanisms, different purposes. |
| **Branching / forking** | First-class: `cairn fork --at <event_id>`, `parent_session_id`, `fork_point_event_id`, COW snapshots. | No branching concept. Session facts are flat (one `session_id` per fact). | **INDEPENDENT but scope-creep risk** | **MEDIUM** — Eureka's session model has no concept of forked sessions. If Crucible forks a session, Eureka sees facts from both branches under the same root `session_id` without understanding the relationship. Recall results may mix pre-fork and post-fork knowledge silently. |
| **Replay / determinism** | Load-bearing v1 invariant. Hermetic observation capture, re-feed (not re-execute). Determinism conformance suite (A1-A4). | No replay concept. Eureka is a store/retrieve system. | **INDEPENDENT** | **LOW** |
| **Learning kernel** | §7.5 Cairn Adoption Playbook describes Cairn optionally adopting Eureka's learning primitives (Ranker, SweepConfig, TrustTracker interfaces). | `packages/eureka/src/learning/` extraction-ready. 7 enforcement mechanisms. | **LAYERED** | **LOW** — Clean dependency direction: Eureka publishes interfaces, Cairn optionally adopts. Crucible doesn't change this. |
| **Aperture (Mirror)** | L5-adjacent view layer. `ApertureEvent` stream from all layers. Push (notifications) + pull (dashboard). | No equivalent. Eureka facts are not surfaced through Aperture. | **INDEPENDENT** | **LOW** — But a v1.5 opportunity exists: Aperture could display Eureka recall/trust metrics. Not a conflict; just uncoordinated. |

---

## 3. Hard Conflicts (things that WILL break if both ship as written)

1. **Cairn's `sessions` table is load-bearing for both and will be restructured by Crucible.** Eureka FR-13 specifies `session_id: SessionId` correlating to Cairn's `sessions.id`. Crucible adds `parent_session_id` and `fork_point_event_id` to that table and changes session semantics from flat to tree-structured. Eureka's session-fact model, the `eureka reconcile` CLI, and the v1.5 sweep-trigger (consuming Cairn session-end events) all assume the current flat schema. If Crucible lands first, these Eureka surfaces break at implementation time. If Eureka lands first, Crucible's migration changes the table underneath Eureka's assumptions.

2. **`DecisionRecord` in `@akubly/types` serves two masters.** Eureka's bidirectional adapters (`toDecisionRecord`, `fromDecisionRecord`) are schema-tolerant but invariant-enforced (FR-10 invariant #2: exhaustive switch on `DecisionSource`; FR-14 invariant #1: idempotency keyed by `DecisionRecord.id`). Crucible's 5-primitive Decision type is structurally richer (causal read set, hash provenance, hook verdict witness). If Crucible evolves `DecisionRecord` to carry these new fields, Eureka's "unknown fields ignored" tolerance handles forward-compat, but if Crucible *removes* or *renames* existing fields, Eureka's adapters fail. The CI integration test (Eureka §7.6) catches this — but only if both packages are in the same repo and the test is wired. **During simultaneous development, the test doesn't exist yet.**

3. **"Forge changes nothing" (Eureka §7.2) is false under Crucible.** Eureka's architecture assumes Forge is a stable peer that captures `DecisionRecord`s during normal LLM exchange (Path 2). Under Crucible, Forge becomes an L3 ProposalGenerator — its internal structure persists but its external role changes. The `DecisionRecord` emission path may move from Forge's runtime to Crucible's L1 WAL. Eureka's Path 2 ingestion (`eureka ingest-decisions --since <ts>`) reads from Forge's audit stream — if that stream's location or format changes, ingestion breaks silently.

4. **`@akubly/types` will have merge conflicts.** Eureka adds `SessionId` brand, `DecisionPayload`, FR-14 adapter types. Crucible adds the 5-primitive schema, extended trust-tier enum, WAL row types, Router verdict types. Both target the same `packages/types/src/index.ts`. Without explicit coordination, the two feature branches will conflict on every PR that touches this file.

5. **`skillsmith-runtime` identity crisis.** Eureka §7.3 names `skillsmith-runtime` as a production harness for wiring policy. Crucible replaces the runtime with `@akubly/crucible-runtime`. If Crucible deprecates `skillsmith-runtime` before Eureka has alternate wiring, Eureka's production path has no home.

---

## 4. Shared-Substrate Candidates (things that should be ONE implementation)

1. **`SessionId` brand in `@akubly/types`.** Both need it. Eureka has already specified it (FR-13, §14 citation register). Crucible's session model needs the same identifier. **Ship once, in `@akubly/types`, before either PRD's implementation begins.** But: Crucible's branching model needs the brand to survive fork semantics — a `SessionId` must still identify the *root* session even after forks. Eureka's current spec assumes this (one `session_id`, many `kind=session` facts). Validate that the semantics are compatible before locking.

2. **`DecisionRecord` type evolution.** Currently in `@akubly/types`. Both systems depend on it. Eureka has invested heavily in schema-tolerance contracts (§7.6). Crucible may need to extend it. **One shared type, versioned with a `schemaVersion` field, is the right answer.** Eureka's existing forward-compat (ignore unknown fields) + backward-compat (defaults for missing fields) already handles this — but it must be tested before either ships.

3. **SQLite storage patterns.** Both use `better-sqlite3`, WAL mode, migration discipline. Crucible adds a custom TS append-log for L1 but keeps SQLite for derived tiers. Eureka uses SQLite throughout. **Share the migration infrastructure and `better-sqlite3` configuration patterns** (connection pooling, WAL checkpoint policy, journal_size_limit). Don't build two migration frameworks.

4. **Bridge telemetry pattern.** Eureka's FR-7.3 defines structured logs for bridge operations (`bridge.ingest.decision`, `bridge.adapter.error`). Crucible's Aperture has a `MirrorEvent` / `ApertureEvent` stream. **These should converge on a single structured-telemetry schema** for cross-system bridge operations, so Aperture can display Eureka bridge health alongside Crucible's own telemetry.

5. **CLI infrastructure.** Crucible ships a `crucible` CLI. Eureka ships a `eureka` CLI. Both are in the same repo. **Consider `crucible eureka recall` as a subcommand** rather than a separate binary — reduces discoverability friction and lets Crucible's session context flow naturally into Eureka calls.

---

## 5. Scope-Creep Risk

- **Eureka quietly assumes Cairn stability.** The entire bridge architecture (FR-7.4, FR-13, FR-14) is built against Cairn's current schema. The Eureka PRD never mentions Crucible by name — it treats Cairn/Forge as stable peers (§7.1 "Path D"). But Crucible restructures Cairn. This isn't a conflict Eureka *chose*; it's one Eureka doesn't know about. Every Eureka bridge spec needs a "what if Cairn's schema changes?" answer, and currently none of them have one.

- **Crucible quietly assumes it can restructure Cairn unilaterally.** The Crucible decisions (Phase B contradictions, L1 substrate lock) treat Cairn as a system Crucible inherits and restructures. But Eureka has invested bridge contracts against Cairn's current schema. Crucible's restructuring has an undocumented downstream consumer.

- **Eureka's learning-kernel extraction path assumes Cairn's *optional* adoption.** But under Crucible, Cairn's sweep/ranker patterns are restructured into L3 ProposalGenerators. If Cairn's sweep is absorbed into Crucible's architecture, the "Cairn Adoption Playbook" (§7.5) targets a system that no longer exists in its current form.

- **Both PRDs extend `@akubly/types` without acknowledging the other's additions.** Eureka adds `SessionId`, `DecisionPayload`. Crucible adds primitive types, trust-tier enum, WAL types. Neither PRD's type inventory includes the other's additions.

---

## 6. Recommendation: **(d) Sequence Crucible L1 substrate first, then build Eureka against the stable contract**

### The options evaluated:

**(a) Merge PRDs.**  
- Pro: Single source of truth, no coordination overhead.  
- Con: The PRDs serve fundamentally different purposes. Crucible is a runtime/shell; Eureka is a memory library. Merging them produces a 200-page monster PRD that no one reads. The architectural concerns (5-layer stack, hook bus, Router) are orthogonal to Eureka's fact-store concerns. **Reject.**

**(b) Hard-isolate with versioned contract.**  
- Pro: Both teams move independently.  
- Con: The shared surface (`@akubly/types`, `SessionId`, `DecisionRecord`, Cairn schema) is too large for true isolation. You'd spend more time maintaining the contract boundary than building features. **Reject for v1; revisit if the team grows.**

**(c) Shared substrate + thin upper layers.**  
- Pro: One `SessionId`, one `DecisionRecord`, one migration framework, one CLI. Correct long-term shape.  
- Con: Requires both PRDs to be designed against the shared substrate simultaneously. Neither currently is — Eureka targets legacy Cairn, Crucible targets a restructured Cairn. You'd need a reconciliation pass on both PRDs before implementation begins. **Right destination, wrong starting point.**

**(d) Sequence Crucible L1 first → Eureka builds against the stable L1 contract.**  
- Pro: Crucible's L1 substrate lock (v1 commitment #10) defines the contract everything else builds on. Once L1 is stable (WAL schema, session model with branching, Decision primitive shape), Eureka can build its bridges against the *actual* schema rather than a legacy one that's about to change. Eureka's v1 scope is deliberately narrow (agent-tier, BM25, manual-only session facts, on-demand ingestion) — it can ship in a compressed sprint after L1 stabilizes. Avoids building bridges twice.  
- Con: Eureka implementation starts later. But Eureka's v1 is ~4-6 weeks of library work (no runtime, no CLI shell, no hook bus). Crucible's L1 substrate is the load-bearing prerequisite anyway — nothing in Eureka's bridge layer makes sense until Cairn's new schema exists.

### Trade-off I'm naming explicitly:

Sequencing means Eureka's killer demos (US-1 codebase familiarization, US-2 cross-session continuity) ship later. But shipping them against a Cairn schema that's about to be restructured means shipping them *wrong* — the bridges would target a schema with a 3-month shelf life. The cost of building Eureka bridges twice (once against legacy Cairn, once against Crucible-Cairn) exceeds the cost of a 4-6 week delay.

### Concrete sequence I'd propose:

1. **Sprint 0 (shared, ~2 days):** Land `SessionId` brand in `@akubly/types`. Land `DecisionRecord` schema-version field. Lock the `@akubly/types` extension protocol (both PRDs declare their type additions in a shared manifest; CI enforces no unannounced additions).
2. **Sprints 1-3 (Crucible):** L1 substrate, WAL schema, session model with branching, Decision primitive. L1 contract stabilizes.
3. **Sprint 2 onward (Eureka, overlapping):** `packages/eureka/` scaffolding, `facts` table, `learning/` kernel, recall (BM25), sweep, trust tracking — all the parts that DON'T touch Cairn bridges. This is ~60% of Eureka's v1 surface.
4. **Sprint 4 (Eureka bridges):** `toDecisionRecord`, `fromDecisionRecord`, session-fact correlation, `bridge_ledger`, `eureka reconcile` — built against Crucible-Cairn's stable schema.
5. **Sprint 5+ (integration):** Eureka wired into Crucible's session lifecycle. `crucible eureka` subcommand. Aperture displays Eureka bridge health.

---

## 7. Open Questions for Aaron

1. **Does Eureka target legacy Cairn or Crucible-Cairn?** The Eureka PRD was written assuming Cairn's current schema. Crucible restructures that schema. Aaron must decide: does Eureka build bridges against the pre-Crucible Cairn (accepting they'll be rewritten when Crucible lands) or does it wait for Crucible's L1 to stabilize? My recommendation is wait — but it's Aaron's calendar.

2. **Who owns `@akubly/types` extension protocol?** Both PRDs need to extend the shared types package. Today there's no gating mechanism. Should we add a manifest file (e.g., `packages/types/EXTENSIONS.md`) that both PRDs maintain, with CI enforcement against unannounced additions? Or is informal coordination sufficient?

3. **Is `SessionId` still valid after a fork?** Crucible's forking model creates child sessions with `parent_session_id`. Eureka assumes `session_id` is a flat grouping key. After a fork, are Eureka facts from the child session tagged with the child's `session_id` or the root's? This has recall implications — "what did I learn during session X?" may cross fork boundaries.

4. **Does Eureka become a first-class Crucible chamber?** Eureka is designed as a standalone library (Path D). But Crucible's 6-chamber model (Crucible/Cairn/Forge/Curator/Alchemist/Aperture) doesn't include a memory chamber. Should Eureka be a 7th chamber? A named L2 subsystem? Or remain external? This affects wiring, lifecycle, and where Eureka's sweep triggers come from.

5. **What happens to "Forge changes nothing"?** Eureka §7.2 explicitly promises that Forge's role is unchanged by Eureka. But Crucible restructures Forge into an L3 ProposalGenerator. Does Eureka's promise hold against Crucible-Forge, or does it need revision? If revision, the Eureka PRD's lock status (v5-final, awaiting R8 lock ceremony) should acknowledge the dependency.

---

*End of analysis.*


### graham-i11-threat-model-expansion

# I11 — Threat Model Credibility + Sufficiency Expansion

**From:** Graham (Lead / Architect)
**To:** Alexander (§18 secondary — Gabriel owns §18, but Alexander is the
security-review secondary per CTD ownership map)
**Date:** 2026-05-29
**Priority:** Post-CTD authoring — not blocking Phase 1, but should land
before implementation of any T-row mitigation.

---

## Request

The Design Panel (I11 finding, Compliance persona) flagged that §18.1's
threat-model T-rows have **What** and **Mitigation** columns but are missing
**Why-credible** and **Why-sufficient** rationale. For a single-user v1 this
is low operational risk, but the threat model is the document future reviewers
will audit — and bare mitigations without credibility statements look like
hand-waving.

## Requested Change

Expand the §18.1 threat table with two additional columns:

| Column | Purpose | Example (T1) |
|---|---|---|
| **Credibility** | Why the mitigation is believable — what mechanism enforces it, what happens if the mechanism fails | "Hook Bus `pause` verdict is evaluated synchronously in the group-commit path (§4.3); bypass requires modifying the WAL append codepath itself. Fail-open with `predicate_timeout` Observation means a missing predicate is observable, not silent." |
| **Sufficiency** | Why the mitigation is enough for v1's single-user, self-audit threat model — and what would make it insufficient | "Sufficient for solo-user because the user is the policy author and the only principal. Insufficient if: (a) multiple principals share a ledger, (b) plugins gain write access to the policy table, or (c) the hook bus gains async verdicts that race with commit." |

Apply this pattern to all 8 T-rows (T1–T8).

## Owner

Gabriel is §18 primary owner. Gabriel authors the expansion; Graham reviews.

## Cross-references

- §18.1 (threat model table)
- §4.3 (hook bus predicate timeout)
- §5.1 (Router default-deny)
- §7.4 (trust-tier attribution)
- Design Panel finding I11 (Compliance persona)


### graham-i12-adr0018-rationale

# I12 — ADR-0018 Pareto-Incomparable Rationale Section

**From:** Graham (Lead / Architect)
**To:** Rosella (ADR-0018 author per §19 ownership)
**Date:** 2026-05-29
**Priority:** Required before ADR-0018 body lands — gate on ADR authoring,
not on Phase 1 implementation.

---

## Request

The Design Panel (I12 finding, Compliance + Skeptic) flagged that
ADR-0018's decision — "when two prescriptions are Pareto-incomparable,
both surface as non-dominated" — is stated as a label, not justified as a
choice. The CTD §7/§8 specify the mechanics; the ADR body must argue
**why** this is the right resolution.

## Required ADR-0018 Section

When authoring `docs/adr/0018-pareto-incomparable-prescriptions.md`,
include a **Rationale** section (per the ADR body shape in §19.3) that
covers:

1. **Why surface both rather than tiebreak.** Tiebreaking Pareto-
   incomparable options requires a scalarization function (weighted sum,
   lexicographic order, or utility function) that imposes preferences the
   system does not have evidence for in v1. Surfacing both preserves
   information for the human operator — the operator IS the tiebreaker.

2. **Why not a refinement gate.** A refinement gate (ask the model to
   choose between incomparable options) re-enters the LLM as a decision-
   maker about its own proposals — a recursive trust pattern that v1
   deliberately avoids (Router owns policy, generators do not). Deferring
   refinement to v1.5+ when the trust model is richer is safer.

3. **Why not escalation.** Escalation (push to Aperture `attention` tier)
   is additive and compatible — but escalation without surfacing WHAT is
   incomparable forces the operator to re-derive the Pareto frontier.
   Surfacing both with `nonDominatedReason: 'incomparable'` IS the
   escalation content.

4. **v1 cost bound.** With 3 generators in v1 (Curator, Forge, Alchemist),
   the maximum incomparable-pair count per decision cycle is bounded by
   generator count × prescription count — practically ≤2 options shown.
   This is tractable for a human operator. The bound should be revisited
   if generator count exceeds 5.

5. **Re-evaluation trigger.** The decision should be revisited when:
   (a) generator count exceeds the v1 bound (>5), making incomparable
   pairs combinatorially expensive to review; (b) operator feedback
   data accumulates enough to train a scalarization function; or
   (c) a refinement gate lands with appropriate trust-tier guardrails.

## Cross-references

- §7.5 (PrescriptionResult shape)
- §8.5 (Applier nonDominatedReason propagation)
- §9 (Aperture `[incomparable-axes]` badge)
- §19 ADR-0018 index row
- Design Panel finding I12 (Compliance + Skeptic)


### graham-pa-adr-body-cluster

# PA ADR-body cluster — Roger (ADR-0007) + Valanice (ADR-0013)

**From:** Graham (Lead / Architect)
**To:** Roger (ADR-0007 author), Valanice (ADR-0013 author)
**Date:** 2026-05-29
**Priority:** Gate 1.5 blocker — Phase 1 implementation is gated on these
ADR bodies landing.

---

## Context

Design Panel Pass A flagged that ADR-0007 (Session Branching) and ADR-0013
(Queue Projection) are still index-only in §19. Gate 1.5 (added in the
prior triage round) requires authored ADR bodies before Phase 1
implementation begins.

Graham has authored ADR-0002 (`docs/adr/0002-l1-wal-substrate.md`),
ADR-0006 (`docs/adr/0006-router-policy-chokepoint.md`), and ADR-0011
(`docs/adr/0011-observation-commitment.md`). The remaining gated ADRs
need their owners.

## Requested Deliverables

### Roger — ADR-0007: Session Branching Model

Create `docs/adr/0007-session-branching.md`. Requirements:

- Follow §19.3 body shape (Context, Options Considered, Decision, Rationale,
  What Changes, Consequences, **Security Implications**, Resolved Questions).
- **Options Considered MUST include ≥1 rejected alternative** — e.g., "copy
  parent segments at fork" (rejected because of storage cost + hash-chain
  break) or "shallow fork with lazy segment reads" (rejected or accepted).
- **Security Implications:** fork-point integrity (can a forked session claim
  a parent it didn't fork from?), cross-session read authorization.
- CTD anchor: §10.

### Valanice — ADR-0013: Structural-Proposal Queue as L1-Derived Projection

Create `docs/adr/0013-structural-proposal-queue.md`. Requirements:

- Follow §19.3 body shape.
- **Options Considered MUST include ≥1 rejected alternative** — e.g.,
  "write-stateful queue table" (rejected because of state-drift gap between
  queue and L1 on restart) or "Redis-backed queue" (rejected as overweight
  for single-user).
- **Security Implications:** notification-spoofing (can a plugin emit a fake
  `structural-proposal-pending` ApertureEvent?). Per PA finding: subsystem-
  specific threat surfaces must be named even if briefly.
- CTD anchor: §9.

## Template Reference

See ADR-0002 (`docs/adr/0002-l1-wal-substrate.md`) for the updated body
shape including Security Implications and rejected alternatives.

## Cross-references

- §19.3 (updated body shape — now requires Security Implications + ≥1
  rejected alternative)
- Gate 1.5 (plan §5 — ADR-body gate)
- Design Panel Pass A: ADR-body cluster finding + subsystem threat stubs


### roger-eureka-crucible-data-overlap

# Eureka ↔ Crucible Data Layer Overlap Analysis

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-26  
**Context:** Aaron preparing simultaneous Eureka + Crucible implementation in `D:\git\harness`  
**Input:** `D:\git\mem\.squad\decisions\eureka-prd-v5-final.md`  
**Baseline:** Crucible L1 substrate (A.3 hybrid append-log, content-addressed per-row WAL, group-commit); existing Cairn SQLite `event_log` + DBOM Merkle chain

---

## Executive Summary

**TL;DR:** Eureka and Crucible are **architectural siblings with non-overlapping persistence needs**. They should **fork storage entirely** — Eureka's three-tier SQLite model (agent/user/project) and Crucible's L1 WAL substrate serve different write patterns, different query patterns, and different lifecycle contracts. Sharing would force premature convergence on an event-log primitive that neither system actually needs in v1.

**One load-bearing collision:** Both will use `~/.cairn/` vs `~/.copilot/eureka/` — manageable, but needs env-var coordination. No schema, port, or migration-order collisions.

**Open question for Aaron:** Crucible's v14 migration introduces `wal_records` alongside `event_log` (Roger Round 4 inbox). Does that table live in the same `~/.cairn/knowledge.db` as Cairn's existing tables, or does Crucible fork to a new DB file (`~/.cairn/crucible.db`)? If same-DB, we need a migration-ordering story for Cairn v13→Eureka v1→Crucible v14.

---

## 1. Eureka's Data Shape

From PRD §FR-7.1, §FR-7.2, §FR-1, §FR-9:

1. **Three independent SQLite databases** (via `better-sqlite3`):
   - `~/.copilot/eureka/agent.db` (scoped to `$AGENT_NAME`)
   - `~/.copilot/eureka/user.db`
   - `<repo>/.eureka/project.db`
   - Only `agent.db` fully wired in v1; user/project throw `NotImplementedError` on writes.

2. **Schema (per-tier DB):**
   - `facts` table: `id TEXT PRIMARY KEY` (UUID v4 FactId), `kind TEXT` (discriminator: 'session', 'decision', 'aspiration', caller-defined), `session_id TEXT` (shared SessionId brand from `@akubly/types`, nullable except on `kind='session'`), `content TEXT`, `sources TEXT[]`, `trust REAL` (0..1), `importance REAL` (0..1), `attention_tier TEXT` ('hot'/'warm'/'cold'), `committed INTEGER` (bool), `embedding_vector BLOB` (nullable, unpopulated in v1 — forward-compat for v1.5 sqlite-vec), `created_at TEXT`, `updated_at TEXT`, `metadata TEXT` (JSON blob for adapter versioning, source_record_id for Path 2 idempotency).
   - `relations` table: `from_id TEXT`, `to_id TEXT`, `edge_type TEXT`, `weight REAL`, `confidence REAL`, `created_at TEXT`. Tier 1 edges (eager): `derived_from, references, contradicts, supersedes, part_of, instance_of, precedes, defined_in, decided_by, committed_in, originated_in, modified_in, referenced_in`. Tier 2 (sweep): `similar_to, co_accessed_with, recalled_in`.
   - `facts_fts` FTS5 virtual table (BM25 lexical similarity, `porter unicode61` tokenizer, triggers keep it in sync with `facts.content`).
   - `bridge_ledger` table: `id INTEGER PRIMARY KEY`, `direction TEXT` ('emit'/'ingest'), `eureka_fact_id TEXT`, `session_id TEXT NOT NULL` (shared SessionId), `cairn_event_id_hint TEXT`, `attempted_at TEXT`, `outcome TEXT` ('success'/'retry'/'permanent_failure'/'skipped_duplicate'), `error_msg TEXT`. Append-only ledger for cross-system reconciliation.
   - No FKs to Cairn or Forge; **no cross-DB `ATTACH` queries at runtime** (FR-7.2).

3. **Write pattern:** CRUD on facts + edges, sweep-driven Tier 2 edge population, trust/importance mutation on events (verification, contradiction, `contemplate` outcomes). No append-only WAL requirement. FTS5 triggers maintain `facts_fts` on every fact write.

4. **Query pattern:** BM25 recall (keyword-scoped, not semantic in v1), composite ranker (0.5·relevance + 0.2·importance + 0.2·trust + 0.1·recency) × attention multiplier, trust floor exclusion (< 0.15), sequential fan-out across tiers (agent → user → project), edge traversal via `relations` table, session-fact lookup by exact-match `session_id` filter.

5. **Lifecycle:** SQLite WAL mode, no group-commit window, no per-row pre-fsync hooks, no content-addressed row hashing. Sweep is opportunistic (end-of-session, first-query-of-day), not event-driven.

---

## 2. Share-or-Fork Recommendations

| Substrate Concern | Crucible L1 Shape | Eureka Shape | Verdict | Reasoning |
|---|---|---|---|---|
| **Event log / append-only WAL** | A.3 hybrid: custom append-only WAL file (pure TS, L1 only) OR `wal_records` table in SQLite (v14 migration) with per-row `causal_read_set_hash` + `hook_verdict` columns. Group-commit window with 80µs-row-stage budget for pre-commit hook bus. | None — Eureka has no append-only log; `facts` table is CRUD with FTS5 triggers. No group-commit, no per-row hooks. | **FORK** | Eureka's write pattern (fact CRUD + sweep-driven edge updates) is fundamentally incompatible with append-only semantics. Eureka does not need a WAL; Crucible's L1 WAL is designed for deterministic replay and pre-commit hook insertion — capabilities Eureka does not require. Forcing convergence would mean Eureka pays the cost of append-only + hook bus for no gain, or Crucible compromises on replay determinism to accommodate CRUD. |
| **Session model** | Cairn `sessions` table: `id TEXT PRIMARY KEY` (session UUID), `repo_key TEXT`, `branch TEXT`, `started_at TEXT`, `ended_at TEXT`, `status TEXT`. Lifecycle observability. | `kind='session'` facts in `facts` table with `session_id TEXT` (shared SessionId brand). Epistemological artifact: what was learned. | **FORK (tables), SHARE (identifier only)** | Both reference the same session UUID via the shared `SessionId` brand from `@akubly/types` (Eureka PRD §FR-13, v5-final R8). The two tables serve orthogonal purposes (Cairn = lifecycle, Eureka = knowledge) and live in separate DBs. No runtime FK; `SessionId` is a type-level construct, not a runtime join key. Per Eureka FR-7.2, "NO cross-database `ATTACH` queries at runtime" — this is enforced even though the identifier is shared. The shared brand enables offline reconciliation but not runtime coupling. |
| **Config store / key-value** | Cairn `preferences` table (user/repo-scoped key-value for feature flags, thresholds). | None — Eureka has no config store beyond its own schema. Sweep cadence is code-constant, not DB-tuned. | **FORK (N/A for Eureka)** | No overlap. Eureka's tuning knobs (sweep trigger cadence, trust floor, ranker weights) are code constants, not persisted config. |
| **Key-value / metadata storage** | DBOM tables (`dbom_artifacts`, `dbom_decisions`) — Merkle-like hash chain over Decision events. Content-addressed with SHA-256 + JSON (Roger Round 6: legacy hash, frozen, not migrated to BLAKE3). | None — Eureka stores decision metadata in `facts` table rows with `kind='decision'`, not in a CAS-style KV store. No hashing of decision payloads. | **FORK** | DBOM is audit-oriented (Merkle chain for tamper detection); Eureka facts are learning-oriented (trust-weighted retrieval, no tamper-detection requirement). Converging these would mean either DBOM loses its tamper-detection property or Eureka pays content-addressing cost for no retrieval benefit. |
| **Graph / relations** | None in Crucible L1 or existing Cairn — Crucible replay is linear (seq-ordered), not graph-based. Provenance tracking planned for Crucible via `causal_read_set_hash` (what-was-read), but not a graph traversal surface. | `relations` table: `(from_id, to_id, edge_type, weight, confidence)`. Tier 1 (eager) + Tier 2 (sweep-populated). Graph-ready schema for v2 edge traversal API. | **FORK** | Eureka's graph is epistemological (facts linked by `derived_from`, `contradicts`, `originated_in` edges); Crucible's read-set is causal (event A read the output of event B). The two graph semantics do not align. No value in forcing convergence. |
| **Migrations** | Cairn at v12 (migration 012-change-vectors.ts); Crucible v14+ planned (Roger Round 4: v14=`wal_records`, v15=CAS blob store, v16=snapshots+refs, v17=observation_capture, v18=tenant_id). Linear integer-versioned, transaction-wrapped. | Eureka v1 schema (no migration numbers in PRD, but `facts`/`relations`/`facts_fts`/`bridge_ledger` are the v1 baseline). Likely starts at v1 or v001. | **FORK (ordering only)** | If Crucible's `wal_records` table lands in the same `~/.cairn/knowledge.db` as Cairn tables, the migration-ordering story becomes load-bearing. Recommendation: Crucible migrations start at v100 to avoid collision with Cairn's v01-v99 range, OR Crucible forks to its own DB file (`~/.cairn/crucible.db`). See Open Question #1. |
| **FTS / full-text search** | None in existing Cairn or Crucible L1. | `facts_fts` FTS5 virtual table (BM25 lexical similarity, `porter unicode61` tokenizer). Triggers maintain sync with `facts.content`. | **FORK (N/A for Crucible)** | Crucible does not need FTS; its replay is seq-ordered, not keyword-searched. No overlap. |
| **Snapshot / compaction** | Crucible Ro-NEW-1 T1 slice: minimum-viable snapshot (Roger Round 7 T1 triage). Snapshot is a point-in-time export of L1 WAL + L2 projections, used for replay bootstrap (truncate log up to snapshot position). | None in Eureka v1 — no compaction, no snapshot. `facts` table grows unbounded; `evict` is explicit-only. v1.5 may add sweep-driven cold-tier eviction, but PRD §12 non-goals explicitly excludes "automated eviction beyond explicit `evict`". | **FORK** | Crucible snapshots are replay-oriented (deterministic state at seq N); Eureka has no replay requirement. Eviction semantics are unrelated. |

---

## 3. Schema / Path / Port Collision List

### Schema Collisions (tables, columns, indexes)
**NONE.** Eureka and Cairn/Crucible live in separate DB files:
- Cairn: `~/.cairn/knowledge.db` (current)
- Eureka: `~/.copilot/eureka/agent.db` (v1), `~/.copilot/eureka/user.db` (v1.5+), `<repo>/.eureka/project.db` (v1.5+)
- Crucible: TBD — either `~/.cairn/knowledge.db` (same DB as Cairn, requires migration-ordering discipline) OR `~/.cairn/crucible.db` (new DB file, avoids collision).

**Only shared schema construct:** `SessionId` brand from `@akubly/types` (TypeScript type-level construct, not a DB table). Both Cairn `sessions.id TEXT` and Eureka `facts.session_id TEXT` store the same session UUID value, but there is no FK constraint and no runtime cross-DB join. Offline reconciliation only via `eureka reconcile` CLI.

### Path Collisions
| Path | Claimed By | Conflict? | Mitigation |
|---|---|---|---|
| `~/.cairn/` | Cairn (existing) | No | Cairn owns `~/.cairn/knowledge.db`, `~/.cairn/config.json`, `~/.cairn/plugins/`. |
| `~/.copilot/` | Copilot CLI (session state at `~/.copilot/session-state/{uuid}/`) | No | Eureka uses `~/.copilot/eureka/` subdirectory. |
| `~/.copilot/eureka/` | Eureka (v1) | No | Eureka-exclusive. |
| `<repo>/.eureka/` | Eureka (v1.5+ project-tier) | No | Eureka-exclusive. |
| `~/.cairn/knowledge.db` | Cairn (current) + possibly Crucible (v14+) | **Maybe** | If Crucible's `wal_records` table lands in same DB, we have a shared-DB situation (see Open Question #1). Not a collision per se, but requires migration-ordering discipline. If Crucible forks to `~/.cairn/crucible.db`, no collision. |

**Env var / config key collisions:**
- `CAIRN_DB_PATH` (hypothetical override for Cairn's DB path) — not currently exported, but if Crucible needs a separate DB, it would want `CRUCIBLE_DB_PATH`.
- `AGENT_NAME` (Eureka agent-tier DB scoping, PRD §FR-7.2) — not in Cairn or Crucible scope.
- No other env var overlap spotted.

### Port Collisions
**NONE.** Neither Eureka nor Crucible exposes an HTTP/IPC surface in v1.
- Eureka: library-only in v1 (`@akubly/eureka` package import); MCP server wrapper deferred to v1.5 (PRD §10 roadmap line 684).
- Crucible: L1 substrate is not an HTTP service; it's a storage layer. No port allocation.
- Cairn: no HTTP surface (CLI-only).

### CLI Command Collisions
| Command | Claimed By | Conflict? | Mitigation |
|---|---|---|---|
| `eureka` | Eureka (v1 CLI) | No | Eureka-exclusive namespace. |
| `cairn` | Cairn (existing CLI) | No | Cairn-exclusive. |
| `crucible` | (hypothetical Crucible CLI) | No | Not in current Cairn CLI namespace. |
| `forge-prescribe` | Forge (Wave 2 W2-9, existing) | No | Forge-exclusive. |
| `eureka reconcile` | Eureka (offline reconciliation CLI, FR-7.4) | No | Reads Cairn DB read-only; not a collision, but a cross-system dependency. |
| `eureka ingest-decisions` | Eureka (FR-14 Path 2 ingestion) | No | Reads Forge decision audit; not a collision. |

**Lock file collisions:**
- SQLite WAL mode uses `.db-wal` and `.db-shm` files. If Crucible and Cairn share `~/.cairn/knowledge.db`, they share the same WAL. This is **safe** (SQLite WAL is designed for concurrent writers), but means Crucible's group-commit semantics must be implemented at the application layer (staging buffer before `db.transaction().immediate()`) rather than relying on SQLite's native WAL journal-mode group-commit. Roger flagged this in Round 4 reconciliation inbox: "does Crucible v1 ride Cairn's SQLite store (transaction-batched semantics) or stand up a custom storage engine (80us/row envelope achievable)?"

---

## 4. Migration Ordering Recommendation

**Scenario A: Crucible shares `~/.cairn/knowledge.db` with Cairn**

Migration sequence:
1. **Cairn v01-v12** (existing, shipped)
2. **Eureka v1** (new `~/.copilot/eureka/agent.db`, no touch to Cairn DB)
3. **Crucible v14** (adds `wal_records` table to `~/.cairn/knowledge.db`)
4. **Crucible v15-v18** (CAS blob store, snapshots, observation_capture, tenant_id)

**No ordering conflict** in this scenario — Eureka and Cairn/Crucible DBs are independent files. Crucible's v14 migration runs against `~/.cairn/knowledge.db` after Cairn's v12; the two migration sequences do not interleave.

**Risk:** If Cairn ships new migrations (v13, v14, ...) before Crucible v14, Crucible's migration numbering collides. **Mitigation:** Crucible migrations start at v100 to avoid collision with Cairn's v01-v99 range, OR Crucible adopts a prefixed naming scheme (`crucible-001-wal-records.ts` vs `cairn-013-next-feature.ts`).

**Scenario B: Crucible forks to `~/.cairn/crucible.db`**

Migration sequence:
1. **Cairn v01-v12** (existing, shipped) in `~/.cairn/knowledge.db`
2. **Eureka v1** (new `~/.copilot/eureka/agent.db`)
3. **Crucible v001-v00N** (new `~/.cairn/crucible.db`, starts at v001)

**No ordering conflict** — three independent DB files. Crucible can use its own migration numbering without collision risk. Backup story is simpler (three files, independently restorable).

**Recommendation:** **Scenario B** unless there is a compelling operational reason to share the DB (e.g., ATTACH-based offline analysis that spans Cairn + Crucible events — but FR-7.2 explicitly forbids runtime ATTACH, so this use case is niche).

---

## 5. API Surface Overlap

**NONE in v1.**

- **Eureka:** Library-only (`@akubly/eureka` package exports `integrate, recall, decide, commit, retire, evict` activities). MCP server wrapper deferred to v1.5.
- **Crucible:** L1 substrate is not an API; it's a storage layer. No HTTP/IPC surface. Hook bus is app-internal (pre-commit predicate evaluation inside the group-commit window).
- **Cairn:** CLI-only; no HTTP/IPC server.

**v1.5 risk:** Eureka MCP server (port TBD) could collide with a future Crucible MCP surface if both are added. Mitigation: use different ports, or namespace MCP tools under different server names (`eureka-mcp` vs `crucible-mcp`).

---

## 6. Open Questions for Aaron

### OQ #1: Crucible DB placement — share or fork?
Does Crucible's L1 WAL (v14 `wal_records` table + subsequent v15-v18 tables) live in the same `~/.cairn/knowledge.db` as Cairn's existing tables, or does Crucible fork to a new DB file (`~/.cairn/crucible.db`)?

**Trade-offs:**
- **Same-DB:**
  - Pro: Single backup target, single WAL file, simpler operator story ("one DB for everything").
  - Con: Migration numbering collision risk (Cairn v13+ vs Crucible v14+). Requires migration-ordering discipline or prefixed naming.
  - Con: Crucible's group-commit semantics must be transaction-batched (app-layer staging buffer) rather than native WAL-level, because SQLite WAL mode does not expose a per-row pre-fsync hook. Roger's 80µs-row-stage budget becomes harder to honor in practice.
- **Fork-DB:**
  - Pro: Independent migration numbering, independent backup/restore, clean separation of concerns.
  - Pro: Crucible can choose a custom storage engine (A.1 pure-Rust edb, A.2 lmdb with pre-commit hook, A.3 hybrid) without being locked to SQLite.
  - Con: Two backup targets, two WAL files, more operator cognitive load.

**My recommendation:** **Fork to `~/.cairn/crucible.db`** unless there is a concrete operational requirement for same-DB ATTACH queries (and FR-7.2 says no runtime ATTACH, so this seems unlikely). The fork preserves Crucible's A.3 hybrid design freedom and avoids migration-numbering collision.

### OQ #2: Crucible's A.3 hybrid — how much SQLite stays?
Roger's Round 5 spike (inbox `roger-spike-fork-a-port-2026-05-25T0030Z.md`) recommended **A.3 hybrid: custom append-only WAL file in pure TS for L1 only, keep better-sqlite3 for the other 15 tables and all derived views**. Does Crucible v1 still follow that path, or has the design shifted to full-SQLite (transaction-batched semantics, no 80µs-row-stage budget)?

**Why it matters for Eureka overlap:** If Crucible stays full-SQLite, it shares `better-sqlite3` as a dependency with both Cairn and Eureka. If Crucible goes hybrid, it has a custom L1 layer that Eureka never touches (clean separation). The shared-dependency case is fine (all three use `better-sqlite3` v9.x), but the hybrid case makes the "fork vs share" verdict even clearer — Eureka would be sharing nothing with Crucible's L1.

### OQ #3: SessionId brand — does Crucible need it?
Eureka's `kind='session'` facts carry `session_id: SessionId` (shared brand from `@akubly/types`, Eureka PRD v5-final R8). Cairn's `sessions.id TEXT` already stores the session UUID (from `~/.copilot/session-state/{uuid}/`). Does Crucible's L1 WAL rows carry a `session_id` column (for session-scoped replay, audit, or filtering)?

**If yes:** All three systems (Cairn, Eureka, Crucible) share the same `SessionId` brand and can be correlated offline by session UUID. Offline reconciliation becomes `eureka reconcile` + `crucible reconcile` (both reading Cairn's session lifecycle).

**If no:** Crucible is session-agnostic (events are pure seq-ordered, no session grouping at L1). Cross-system correlation is via event timestamps or external metadata only. Still fine; just means Crucible replay cannot be scoped to "all events for session X" without a higher-layer index.

**My guess:** Crucible L1 rows will carry `session_id TEXT` for operational filtering and audit. If so, it should import the shared `SessionId` brand from `@akubly/types` to match Cairn + Eureka. This is a type-level construct (no runtime FK), so it adds no coupling — just makes the three systems' offline correlation honest.

---

## 7. Verdict Summary

| Concern | Verdict |
|---|---|
| **Event log / WAL** | FORK — Eureka CRUD + FTS5 vs Crucible append-only + group-commit are incompatible write patterns. |
| **Session model** | FORK tables, SHARE identifier only — both use `SessionId` brand from `@akubly/types`, no runtime FK. |
| **Config / KV store** | FORK — no overlap (Eureka has no config store). |
| **Graph / relations** | FORK — epistemological graph (Eureka) vs causal read-set (Crucible) are different semantics. |
| **Migrations** | FORK numbering — Crucible v100+ OR prefixed naming OR separate DB file. |
| **FTS** | FORK — Eureka-exclusive (Crucible has no FTS requirement). |
| **Snapshot** | FORK — Crucible replay-oriented, Eureka has none in v1. |
| **Schema collisions** | NONE — separate DB files (Cairn `~/.cairn/knowledge.db`, Eureka `~/.copilot/eureka/*.db`, Crucible TBD). |
| **Path collisions** | NONE — Eureka uses `~/.copilot/eureka/`, Cairn uses `~/.cairn/`, Crucible uses `~/.cairn/` (same parent, different files). |
| **Port collisions** | NONE — no HTTP/IPC surfaces in v1. |
| **CLI collisions** | NONE — `eureka` vs `cairn` vs (hypothetical) `crucible` namespaces are distinct. |
| **API surface overlap** | NONE — Eureka library-only, Crucible is a substrate layer, Cairn is CLI-only. |

**Single biggest collision risk:** If Crucible shares `~/.cairn/knowledge.db` with Cairn, the migration-numbering story needs discipline (v100+ or prefixed naming). Otherwise, clean separation.

---

## 8. Recommendations

1. **Fork storage entirely.** Eureka's three-tier SQLite model and Crucible's L1 WAL substrate serve different write patterns and lifecycle contracts. Forcing convergence buys nothing and costs flexibility.

2. **Crucible DB placement: fork to `~/.cairn/crucible.db`.** Independent migration numbering, independent backup story, preserves A.3 hybrid design freedom.

3. **SessionId brand: adopt in Crucible L1 if rows carry session_id.** All three systems (Cairn, Eureka, Crucible) can then be correlated offline via the shared `SessionId` brand from `@akubly/types`. Type-level construct only; no runtime FK.

4. **Migration numbering: Crucible starts at v100.** If Crucible must share `~/.cairn/knowledge.db` with Cairn, migrations should start at v100 to avoid collision with Cairn's v01-v99 range. Alternatively, use prefixed filenames (`crucible-001-wal-records.ts`).

5. **No shared substrate primitives.** Eureka and Crucible do not share an event log, a session store, a config store, a graph schema, or a migration sequence. The only shared construct is the `SessionId` brand (type-level, no runtime coupling). This is the right boundary.

6. **Backup story: document three stateful directories.** `~/.cairn/` (Cairn + possibly Crucible), `~/.copilot/eureka/` (Eureka agent/user DBs), `<repo>/.eureka/` (Eureka project DB, v1.5+). Operator guidance: back up all three for full state recovery.

7. **v1.5 MCP collision avoidance.** When Eureka ships MCP server wrapper (v1.5), use a distinct port or server name (`eureka-mcp`) to avoid future collision with Crucible MCP surface (if any).

---

## 9. Appendix: Eureka PRD Citations

All cross-references below are to `D:\git\mem\.squad\decisions\eureka-prd-v5-final.md`:

- **Three-tier SQLite:** §FR-7.2 "Paths (Eureka-owned, federated from Cairn)"
- **Schema (facts, relations, bridge_ledger):** §FR-1 "Knowledge Storage", §FR-9 "Graph-Ready Relations Schema", §FR-7.4 "Bridge Reliability Contract"
- **FTS5 BM25:** §FR-2 "Semantic Retrieval (`recall`)", §FR-7.1 "Engine"
- **SessionId brand:** §FR-13 "Session Model" (v5-final R8), lines 373-449
- **No cross-DB ATTACH:** §FR-7.2 "No cross-database `ATTACH` queries at runtime."
- **MCP server wrapper:** §10 "Roadmap" line 684 (v1.5)
- **Offline reconciliation CLI:** §FR-7.4 "Offline reconciliation CLI" lines 223-229
- **Migration-free v1:** Eureka v1 is the baseline schema; no prior migrations to reconcile.

---

## 10. Appendix: Crucible Substrate Citations

All cross-references below are to Roger's history (`D:\git\harness\.squad\agents\roger\history.md`):

- **A.3 hybrid append-log:** Round 5 spike (lines 572-576), "ENDORSE-WITH-CAVEATS A.3 ... custom append-only WAL file in pure TS for L1 only, keep better-sqlite3 for the other 15 tables"
- **Content-addressed per-row WAL:** Round 6 Open #5 (line 22), "CBOR-dcbor + BLAKE3 for the new L1 read-set hash"
- **Group-commit + 80µs-row-stage budget:** Round 3 hook bus signoff (lines 380-559), "per-row, inside the group-commit window, before the fsync barrier"
- **v14-v18 migration plan:** Round 4 reconciliation (line 565), "v14 introduces `wal_records` alongside legacy `event_log`, v15 stands up a CAS blob store, v16 snapshots+refs, v17 observation_capture, v18 tenant namespacing"
- **Cairn at v12:** Round 4 reconciliation (line 565), "migration 012-change-vectors.ts"
- **Cairn event_log as source of truth:** Round 6 Open #4 (line 20), "classified 6 as derived projections of `event_log`"

---

**End of analysis.**


### rosella-aperture-rename-plan

# Mirror → Aperture: Code Identifier Rename Plan

**Owner:** Rosella  
**Status:** Sprint 3 Planning  
**Sequencing:** Zero-migration (use Aperture names from day one; no refactor needed)

---

## Rename Map

| Current Identifier | Aperture Replacement | Surface Type | Scope |
|---|---|---|---|
| `mirror_events` (table) | `aperture_events` | Public | DB schema, durable artifact |
| `MirrorEvent` (type) | `ApertureEvent` | Internal | Class/type definition |
| `MirrorProjector` (class) | `ApertureProjector` | Internal | Component hierarchy |
| "Mirror Projector" (narrative) | "Aperture Projector" | Public | Sprint plan, PR titles, docs |
| `Valanice (Mirror UX)` | `Valanice (Aperture UX)` | Public | Sprint ownership label |
| `mirror_events` (column ref in queries) | `aperture_events` | Public | SQL, logs, API introspection |
| `category: bootstrap` MirrorEvent | `category: bootstrap` ApertureEvent | Internal | Enum variant (no rename needed) |
| `@inbox`, `@today`, `@scorecard`, `@lobby` | (unchanged) | Public | View names — agnostic to surface name |

---

## Surface Classification

**Public** (breaking if renamed mid-flight):
- `aperture_events` table name — ships in migrations, persisted on disk
- "Aperture Projector" — Sprint 3 deliverable narrative, PR titles, UI labels
- `Valanice (Aperture UX)` — sprint assignment, ownership

**Internal** (no migration cost, refactor-safe):
- `ApertureEvent` — type/class definition, only live in-memory
- `ApertureProjector` — component class, no external dependency
- Variable names, test fixtures — scoped to this module

---

## Sequencing Recommendation

**No legacy to migrate.** Sprint 3 code does not exist yet.

- ✅ Use `aperture_*` identifiers from the first commit in Sprint 3
- ✅ No need to preserve `mirror_*` anywhere — this is greenfield
- ⚠️ **One watch:** Migration scripts must name the table `aperture_events` from 001-*, not `mirror_events` retroactively renamed in 002-*. Durable schema names that ship before Sprint 3 is live could break if we rename post-creation.

---

## Open Questions

1. **Migration numbering**: Should the `aperture_events` table creation land in Sprint 3 (as part of Rosella's Mirror Projector deliverable), or does it pre-land in an earlier sprint as part of the L1 schema? *→ Needs Alexander/Graham decision.*
2. **Event bus naming**: Does the event bus itself (`L1Subscriber` → event stream) have a user-facing name, or is `aperture_events` only the persistent projection? *→ Check with Graham (R6 schema owner).*
3. **CLI verb**: Confirm `crucible aperture watch` / `crucible aperture show` are the final verb names (not `crucible aperture-watch` or similar). *→ Valanice owns CLI.*

---

## Acceptance Criteria

"Rename complete" for Sprint 3 PR review:

- [ ] All code identifiers use `Aperture*` (class names, types, variables)
- [ ] All DB schema uses `aperture_events` table name + columns
- [ ] Sprint plan, PR title, and docs consistently say "Aperture Projector" (not "Mirror Projector")
- [ ] Valanice's ownership label reads `Valanice (Aperture UX)` in sprint assignments
- [ ] CI lint enforces vocabulary fence: `mirror_*` identifiers blocked in new code (warn/error on PR)
- [ ] Cassima's PRD Part 2 footnote remains (signals that historical artifacts preserve "Mirror" for traceability)

---

## Notes

The magic mirror showed me the path; I'm already walking it. Since no code ships until Sprint 3, we have zero technical debt on the old name. Day one: write `aperture_*`. No refactor, no migration shim, no dual-naming. The bridge is built before we cross it.



### sonny-triage-2026-05-25T0200Z

# Sonny — Round 7 Triage (Debugger Stories vs v1 Tiers)

**Author:** Sonny (Debugger Specialist)
**Date:** 2026-05-25T02:00Z
**Scope:** Tier-classify every US-S-* story I authored, plus the L5 layer
proposal, against the v1 framework Aaron locked 2026-05-25.
**v1 falsifiable bar:** *"Aaron can run a one-week productivity loop where
every improvement to Crucible is made by Crucible."*
**My home tier:** T2 (investigation depth).
**Constraints honored:**
- Mirror is the notification surface (Graham Round 6).
- L5 reads via L1 subscriber pattern, non-destructive (Rosella Round 6).
- Trail is canonical; `breadcrumb` is taken.
- `causal_read_set` is canonical; `provenance` is taken (= ProvenanceTier).
- Triage only — no design.

---

## Headline

**The full debugger (DAP sidecar + REPL + match-spec + watch + bisect +
minimizer) is T2 — exactly where Aaron put my tier.** But the bootstrap
loop dies on day one without a *minimum* investigation surface, because
Aaron will use Crucible to fix Crucible and he needs to see what tripped a
pause and walk what happened. **Four primitives are T1**, the rest of US-S-*
is T2 or T3.

The four T1 primitives are *deliberately not a "mini-debugger"* — they are
the smallest surface that lets the productivity loop close. Match-spec
DSLs, DAP transport, step semantics, bisect, minimizer all stay T2/T3.

---

## Triage table

Tier semantics I'm using (consistent with Aaron-locked framework):
**T1** = MVP must-have for productivity loop. **T2** = investigation depth
(my home — full debugger UX). **T3** = enrichment after T2 ships.
**Parking** = blocked on substrate not yet committed for v1.

| Story | Original framing | Tier | Split? | Rationale |
|---|---|---|---|---|
| **US-S-1** Predicate breakpoints (match-spec) | One story | **Split T1 + T2** | T1: *literal* logpoints + breakpoints on hook bus (equality on event_type, path-prefix on subject paths) — no DSL. T2: full match-spec predicate language. | Bootstrap loop needs "stop when an Artifact write touches `packages/crucible/**`" today. Match-spec compiler is real engineering and the wrong thing to gate v1 on. The hook bus already exists (Phase A + Round 5/6 commits); riding it with literal predicates is a small extension. |
| **US-S-2** Watch as L2 query | One story | **Parking → T3** | Move to Parking until L2 ships; promote to T3 the moment L2 lands. | L2 (Salsa-style incremental query) does not exist in repo, is not in v1 commitments. Story is correct but unbuildable without its substrate. Don't drag L2 into v1 to satisfy it. |
| **US-S-3** Backward causal slice ("why?") ⭐ | One story | **Split: substrate (LOCKED) + T1-lite + T2** | Substrate (`causal_read_set_hash` capture on every L1 write) is **already a v1 commitment** post Round 5/6 — not a story. T1: single-hop `crucible why <event_id>` (parent only, no closure). T2: full transitive causal subgraph + Mirror DAG view. | Aaron will hit "why did this Decision land?" on day one of the bootstrap loop. Single-hop is cheap once capture is in place; transitive closure is real work. Keep the closure story T2 where it belongs. |
| **US-S-4** Retroactive projections | One story | **Parking → T3** | Same blocker as US-S-2: needs L2 query language. | Replay-the-stream-with-a-new-projection is genuinely powerful but inert without L2 syntax. Park. |
| **US-S-5** Step-into DAG of sub-agents | One story | **T3** | Keep whole. | Requires `parent_session_id` + parent/child Request edges (Rosella Round 6 committed `parent_session_id`; per-row lineage is v1.1 per her note). Step semantics over a DAG are real UX work and zero of it is needed to fix a Crucible bug. T3. |
| **US-S-6** Cairn-bisect | One story | **T3** | Keep whole. | Depends on cheap fork (commitment #1) + replay-to-point (commitment #2). Both are NET-NEW in v1 commitments but not "implemented" — bisect rides on top. Powerful, but you don't need bisect to close the bootstrap loop; you need a walker. |
| **US-S-7** Two surfaces (DAP + native REPL) | One story | **Split T1 + T2 + T2** | T1: extend MCP server with 3 investigation tools (see "Recommended T1 set"). T2: native investigator REPL (`crucible investigate`). T2: DAP sidecar binary (`crucible debug-adapter`). | MCP is *already* Aaron's debug UX today. Three new MCP tools is the cheapest possible T1 extension and reuses every transport, auth, and serialization decision already made. DAP and REPL are real binaries — T2. |
| **US-S-8** Delta-debug minimizer | One story | **T3** | Keep whole. | Depends on US-S-6 (cheap fork) + US-S-1 T2 (predicate language for the shrink oracle). Late T3 — comes after bisect. |
| **US-S-9** Breakpoint is an L4 approval | "Story" but really an alignment principle | **Principle (LOCKED) + T1 surface bit** | The alignment ("pauses route through the verdict bus") is *already absorbed* by the Round 5/6 hook-bus + Mirror-as-notification-surface decisions. Verdict-enum extensions (`step / step-into / step-out / edit-and-continue`) are L1/L4 work (Alexander/Roger), not L5. T1 surface: when a pause fires, it shows up in Mirror as an attention-tier notification. | Treating US-S-9 as a separate story double-counts decisions already in `decisions.md`. The only story-shaped artifact left is "pause → Mirror notification," which is so small it merges into the T1 set. |
| **L5 Investigation Surface (layer)** | Net-new layer | **Layer label, not a story — Valanice owns** | Layer scaffolding is Valanice's. My contribution is the debugger-primitive contents (US-S-1, 3, 5, 6, 7, 8 surfaces) that live inside L5. | Don't claim primacy on L5. Layer ownership is hers per Aaron's framing. |

---

## Recommended T1 set — the minimum debugger primitives for the bootstrap loop

These four are the *minimum* surface for "Aaron uses Crucible to improve
Crucible." Each is small, each reuses substrate already committed for v1,
and each closes a concrete bootstrap-loop failure mode.

### T1-D1 — Literal logpoints on the hook bus

**What:** Register a logpoint that fires when a pre-commit hook sees an event matching a *literal* filter — `event_type == "Decision"`, `subject.path startsWith "packages/crucible/"`, or both ANDed. No DSL, no regex, no predicate compiler. The fire emits a Mirror notification at `attention` tier; it does **not** pause the loop.

**Why T1:** When Aaron's working on Crucible-in-Crucible, he needs "tell me when the harness writes a Decision about its own source." Without this he is grepping the event log post-hoc, which is exactly the workflow v1 must obsolete.

**Substrate already committed:** hook bus (Round 5/6), Mirror notification surface (Graham Round 6), typed primitive payloads (Alexander L0→L1).

### T1-D2 — Literal breakpoints (pause variant of T1-D1)

**What:** Same predicate shape as T1-D1, but emits a `Question` and pauses via the existing verdict-bus `ask` path. Resume = user verdict (`continue` only in T1; `step/edit` are T2).

**Why T1:** "Pause before any write to `packages/forge/src/**`" is the single highest-leverage interactive-debug primitive for self-modification work. Without it Aaron has to discover Crucible's bad rewrites *after* they land. Pause-before-write is the difference between trust-building and trust-burning.

**Substrate already committed:** verdict bus already has `ask` (Phase A); Mirror surfaces the pause; user verdict comes through the same path the SDK permission handler uses today.

### T1-D3 — Session walker via L1 subscriber (`crucible_walk_events`)

**What:** New MCP tool that reads from the canonical event log via Rosella's L1 subscriber pattern (non-destructive). Args: `session_id`, `cursor`, optional `filter` (same literal shape as T1-D1). Returns ≤N events with typed payloads, parent pointers, and `causal_read_set_hash`. Cursor-based pagination.

**Why T1:** "Open a session and walk what happened" is the *base case* of all investigation. Today Aaron uses `search_events` (LIKE pattern, ≤500, no typed payload) — strictly worse than what's needed. This is a 1-day extension to `cairn/src/mcp/server.ts`.

**Substrate already committed:** L1 subscriber pattern (Rosella Round 6), typed payloads (Alexander), event log already cursor-friendly (`getUnprocessedEvents`).

### T1-D4 — Single-hop "why" (`crucible_why_one`)

**What:** New MCP tool. Given an `event_id`, return the immediate parent(s) via `causal_read_set_hash` lookup. **No transitive closure.** No graph rendering. Just "what was consulted to produce this one event."

**Why T1:** The causal-read-set capture invariant is locked in for v1, but the *consumer* of it has to exist or the capture pays no dividends. Single-hop is the smallest possible consumer. Aaron asks "why did this Decision land?" → he gets back the events the generator read. He can then call again on each parent — manual graph walk, but a graph walk that is **possible**, which is the v1 bar.

**Substrate already committed:** `causal_read_set_hash` on every L1 write (Round 5/6 commitment #10 + Phase A hook bus).

### Explicitly *not* in T1

- Match-spec / regex / predicate DSL (T2 — US-S-1 full)
- DAP sidecar / debug-adapter binary (T2 — US-S-7 split)
- Native investigator REPL (T2 — US-S-7 split)
- Step / step-into / step-out / edit-and-continue verdicts (T2 — US-S-9 enum extension)
- Transitive causal subgraph + DAG view (T2 — US-S-3 full)
- Watch over L2 queries (Parking — US-S-2, blocked on L2)
- Retroactive projections (Parking — US-S-4, blocked on L2)
- Cairn-bisect (T3 — US-S-6)
- Delta-debug minimizer (T3 — US-S-8)
- Step-into DAG of sub-agents (T3 — US-S-5)

**Opinion:** The four T1 primitives total maybe 3–5 engineering days on
substrate that's largely committed. They are *enough.* If we ship a fifth
T1 debugger primitive we're stealing budget from L1/L4/Mirror, which is
worse for the bootstrap loop than leaving T2 features in T2.

---

## Overlap with Valanice — explicit merge candidates for Cassima

Valanice owns L5 overall and the Mirror/UX surface. There WILL be overlap.
I am flagging, not claiming. **Recommend Cassima merge each pair below
into a single story authored by whichever of us is more naturally
load-bearing on it.**

| My story | Likely-overlapping Valanice surface | Suggested merge | Recommended primary owner |
|---|---|---|---|
| **US-S-1** logpoint/breakpoint registry | Valanice's "saved-query grammar" / Mirror notification policy | One "investigation triggers" story covering literal predicates + saved queries + which notification tier fires | **Sonny** primary on predicate shape; **Valanice** primary on saved-query persistence + render |
| **US-S-7 T1 split** (MCP tool extensions) | Valanice's L5 surface scaffolding | One "L5 MCP tool catalog" story enumerating the canonical investigation tools | **Valanice** primary (L5 scaffolding); **Sonny** contributes the debugger-tool list |
| **US-S-7 T2 split** (native REPL) | Valanice's investigator-surface UX story | One "investigator REPL" story | **Valanice** primary on UX shape; **Sonny** primary on tool semantics |
| **US-S-9** pause→Mirror notification | Graham Round 6 Mirror notification policy + Valanice's pause-render | This is *already absorbed* by Graham's decision — no separate Sonny/Valanice story needed | **No-op:** drop from both authors' backlogs; cite Graham R6 |
| **US-S-3** causal-slice query surface | Valanice's "why did the harness do this?" UX | One "causal investigation surface" story | **Sonny** primary on query mechanics; **Valanice** primary on Mirror rendering of the DAG |
| **L5 layer ownership** | Valanice's L5 overall | No merge — clean handoff | **Valanice** owns layer label and scaffolding; **Sonny** owns debugger-primitive contents |

I am explicitly **not** disputing layer ownership. If Valanice's triage
puts L5 entirely in her column, I endorse that — my debugger primitives
live inside her layer and that is the right shape.

---

## Open questions for Cassima

1. **Story-doc authorship for merged stories** — for the six merge
   candidates above, do we want one author with the other as reviewer, or
   co-authored docs? My instinct: single author per the table above,
   other as named reviewer, so the merged story has a single voice and a
   single point of accountability.

2. **Is US-S-9 fully absorbed by Graham R6 + the verdict-bus decisions?**
   I think yes — keeping it as a separate story is double-counting. Want
   ratification before I drop it from my backlog entirely.

3. **Where does the verdict-enum extension live as a story?** The
   debugger needs `step / step-into / step-out / edit-and-continue` added
   to the verdict bus. That's L1/L4 work (Alexander/Roger), not L5
   (Sonny/Valanice). Should there be an explicit cross-team story owned
   by Alexander or Roger, with me as named consumer? Or do we treat it
   as a "tax on L1/L4 levied by T2 debugger work" and let it fall out of
   T2 sequencing? I lean toward explicit story so it isn't surprise
   work for Alexander when T2 starts.

4. **Parking vs T3 for L2-blocked stories (US-S-2, US-S-4):** is
   "Parking" a real tier in the framework or shorthand for "deferred"?
   If real, US-S-2 and US-S-4 are unambiguously Parking. If shorthand,
   they're T3-pending-L2. Aaron's framework lists Parking; I'm using it
   as such, but flagging.

5. **Bootstrap-loop sufficiency check on the T1 set.** I claim four T1
   primitives are enough to close the loop. The way to falsify this is:
   *can Aaron actually fix a real Crucible bug using only T1-D1..D4?* I
   think yes (logpoint to detect, breakpoint to pause before bad write,
   walker to investigate, single-hop why to trace). Want this challenged
   in the Round 7 discussion before T1 freezes.

6. **MCP-tool extensibility ceiling.** Cairn's MCP server is already at
   ~10 tools. Adding 3 (T1-D3, T1-D4, plus T1-D1's logpoint
   register/list) takes us to 13. Is there a ceiling? Should L5 carve
   out its own MCP server binary, or stay inside `cairn/src/mcp/server.ts`?
   This is a Graham/Rosella question more than mine but it lands on me
   first if T1 ships in `cairn`.

---

— Sonny

---

## I.7 Verdict — T1-D4 `why-one` lineage compatibility

**Verdict: A — session metadata + read-set hash chain.** T1-D4 did not require per-row WAL lineage pointers; my own spec says `crucible_why_one(event_id)` returns immediate parents via `causal_read_set_hash`, not via `parent_event_id`. The walk is: load the target WAL row and its `sessions` metadata; use `session_id`, `parent_session_id`, and `fork_point_event_id` to define the visible ledger prefix for that row; fetch/decode the canonical read-set body addressed by `causal_read_set_hash`; resolve each `ReadSetEntry` to the consulted primitive/event within that visible prefix (crossing to the parent session only up to the fork point); return those resolved immediate inputs. Repeating the same call on each returned parent gives the manual hash-chain walk promised for T1. No WAL column, index, or projection migration is needed; eng cost remains 0 in T1, with Graham's ~4-hour per-row lineage migration reserved only for a later T2 concurrent sub-agent model that session-level lineage cannot represent.

— Sonny


### valanice-eureka-crucible-ux-overlap

# Eureka–Crucible UX Overlap Analysis

**Author:** Valanice (UX / Human Factors)  
**Date:** 2026-05-27  
**Context:** Aaron R8 directive to assess UX overlap between two simultaneously-built tools: Eureka (knowledge retention system, being built in `mem` repo) and Crucible (agentic harness, being built in this `harness` repo). Both will be implemented and shipped in the same delivery cycle, touching Aaron's daily workflow.

---

## Executive Summary

**Verdict:** **LOW aggregate UX risk, but THREE specific collision zones require coordination.**

Eureka is primarily **library-consumed by agents** (programmatic API + MCP tools). Crucible is **Aaron's ambient runtime** (CLI hooks, slash commands, ledger, Mirror views). The two tools occupy different **attention altitudes**: Eureka surfaces indirectly (agents recall knowledge, decisions strengthen over time), while Crucible surfaces directly (turn boundaries, Ctrl+E primitives, `@inbox` notifications).

However:
1. **Session identity is now shared** (Aaron R8 directive: `SessionId` brand in `@akubly/types`) — both tools reference the same Copilot CLI session UUID. This is a **positive** overlap (enables cross-system continuity without runtime coupling), but vocabulary discipline is load-bearing.
2. **Decision-making has two pathways** — Crucible primitives include `Decision`, while Eureka has `decide()` (Path 1 contemplative) and `fromDecisionRecord()` ingestion (Path 2 in-flow). Aaron needs ONE mental model for "I made a choice"; the surface should clarify which pathway is active.
3. **Notification/approval surfaces both exist** — Crucible has the Approval Router (`@inbox`), Eureka has `flushHints()` prompts and `commit/retire` rituals. Both want Aaron's approval attention at the same session boundaries (end-of-session sweep triggers).

**No vocabulary collision.** Crucible chambers (Ledger, Forge, Narrator, Conductor, Mirror) do NOT overlap Eureka's vocabulary (integrate, recall, decide, commit, retire, trust, attention tiers). "Session" and "Decision" are the only shared terms, and both are intentionally shared (same entity, different lenses).

**Recommendation:** Design the **integrated experience as "Eureka makes agents smarter invisibly; Crucible makes Aaron's thinking auditable."** One tool is the memory layer; the other is the orchestration layer. The handoff is at the session boundary.

---

## 1. Eureka's Human Surfaces

Eureka is agent-facing by design, but Aaron sees five human touchpoints:

1. **MCP tools** (indirect — agents invoke, Aaron sees results in conversation):
   - `eureka.integrate(fact)` — store a fact
   - `eureka.recall(query)` — retrieve knowledge
   - `eureka.decide(payload)` — deliberate structured decision
   - `eureka.commit(fact_id)` — hot-pin a fact
   - `eureka.retire(fact_id)` — release a commitment

2. **CLI commands** (direct — Aaron invokes manually):
   - `eureka stats` — fact counts per tier, sweep timings, adapter error rates
   - `eureka ingest-decisions --since <ts>` — ingest Forge decisions for learning
   - `eureka ingest-decisions --session <uuid>` — ingest decisions for one session (v5 new)
   - `eureka reconcile --against <cairn-db-path>` — offline cross-DB diff (operator-only)
   - `eureka export --format=json` — backup/portability

3. **End-of-session prompt** (indirect — agent-driven, Aaron approves):
   - `eureka.session.flushHints()` — agent extracts suggested facts from recent activity, prompts Aaron to commit. This is a **caller-cooperation contract**: continuity only works if the agent (or Aaron) explicitly remembers to flush.

4. **Trust/importance signals** (indirect — visible in `recall` output):
   - Facts carry `trust` (0..1, floor 0.15) and `importance` (0..1) scores. Aaron sees these when agents render recall results in conversation.

5. **No GUI, no dashboard.** Eureka is file-backed SQLite (`~/.copilot/eureka/agent.db`, `~/.copilot/eureka/user.db`, `<repo>/.eureka/project.db`). Visibility is via CLI stats or agents' conversational rendering.

**Key UX property:** Eureka's primary human surface is **absence of friction**. The second session's token usage drops ≥50% (US-1 killer demo). Aaron "feels" Eureka through faster agent responses and fewer redundant file reads, not through a UI he stares at.

---

## 2. Attention-Conflict Matrix

| **Moment in Aaron's day** | **Crucible surface** | **Eureka surface** | **Aggregate friction risk** |
|---|---|---|---|
| **Session start** | Conductor spins up ledger, Curator loads change-vector state | Eureka sweep (first-query-of-day trigger) runs opportunistic maintenance | **LOW** — both are silent background operations. Latency: Crucible < 500ms (session restore), Eureka sweep < 3s (bounded). No modal prompts. |
| **Mid-turn reasoning** | Crucible primitives (Request, Observation, Decision, Question) recorded to ledger; visible via Ctrl+E | Agent invokes `eureka.recall(query)` programmatically to page in knowledge | **NONE** — Eureka is invisible to Aaron unless the agent renders recall results in its response. Crucible's Ctrl+E is opt-in (Aaron presses it to see primitives). |
| **Turn boundary (agent makes a decision)** | Crucible captures `Decision` primitive, ledger records provenance chain | (Path 2) Forge captures `DecisionRecord`, Eureka ingests on next sweep via `fromDecisionRecord()` | **LOW** — Crucible records immediately; Eureka ingests async. No double-prompt. Aaron sees ONE "you made a decision" signal (Crucible's ledger), not two. |
| **End of session** | Narrator might emit a session digest; Approval Router surfaces `@inbox` (prescriptions, sub-agent proposals, drift alerts) | `eureka.session.flushHints()` prompts "should I remember X from this session?" | **HIGH RISK** — two approval surfaces at the same lifecycle boundary. Both want Aaron's attention right when he's context-switching away. **This is the only hard collision.** |
| **Next session resume** | Aaron invokes `:rewind` or `@today` (Mirror view) to see recent ledger tail | Agent invokes `eureka.recall("what was I working on?")` to surface session-facts | **NONE** — different surfaces for different consumers. Aaron uses Mirror; agent uses recall. Both use shared `SessionId` for continuity (R8 directive). |
| **Approval flow** | `@inbox` view (Router queue): see proposals, `resolve_prescription`, dismiss/snooze/categorize | No Eureka-specific approval surface; `commit/retire` are explicit CLI verbs, not a queue | **LOW** — Crucible owns the approval UX. Eureka's `commit` is a manual CLI action (not a flow). If agents suggest facts via `flushHints()`, that prompt is conversational (not a queue). |
| **Review past decisions** | `@decisions` (Mirror saved query over ledger Decision primitives), bisect, counterfactual replay | `eureka.recall(query)` for `kind=decision` facts; no human-facing GUI for graph traversal in v1 | **LOW** — Crucible is the review surface. Eureka is the recall substrate. Aaron uses Crucible views; agents use Eureka facts. No competition for attention. |
| **Opaque background sweep** | Curator sweep (event-log pattern detection, change-vector updates, 3s soft cap, stateful cursor) | Eureka sweep (importance decay, tier demotions, Tier 2 edge population, stale flags, end-of-session or first-query-of-day) | **NONE** — both sweeps are async, non-blocking, silent unless they produce alerts. Crucible sweep feeds Prescriber → Router → `@inbox`. Eureka sweep updates fact metadata (no human surface until `recall` uses it). |

**Aggregate friction score: 1 HIGH, 6 LOW, 2 NONE.** The HIGH is the session-end dual-prompt problem.

---

## 3. Vocabulary / Metaphor Collision List

| **Term** | **Crucible meaning** | **Eureka meaning** | **Collision risk** | **Mitigation** |
|---|---|---|---|---|
| **Session** | Copilot CLI session UUID; ledger scope; operational lifecycle (Cairn `sessions` table) | Copilot CLI session UUID; epistemological artifact (`kind=session` facts); what was learned | **LOW — INTENTIONAL OVERLAP** | Aaron R8 directive: shared `SessionId` brand in `@akubly/types`. Both systems reference the same entity (the Copilot CLI session), but Cairn owns "what happened" (lifecycle, timing, repo, branch) and Eureka owns "what I learned" (continuity, checkpoints, trust). Lens framing documented in FR-13. ESLint guardrail bans cross-system session-type imports except for the shared `SessionId`. **This is a positive overlap — enables continuity without runtime coupling.** |
| **Decision** | Primitive in Crucible ledger (`Request → Observation → Decision → Artifact`); visible via Ctrl+E, rewindable, bisectable | `decide()` activity (Path 1 contemplative) OR `kind=decision` fact (Path 2 ingested from Forge) | **MEDIUM** | Two pathways (FR-10 + FR-14). Crucible's `Decision` primitive feeds Forge's `DecisionRecord` → Eureka ingests via `fromDecisionRecord()`. Path 1 (Eureka's deliberate `decide()`) emits back to Forge via `toDecisionRecord()`. Aaron needs to know: "Did I decide using Crucible primitives (ledger-recorded) or Eureka deliberation (graph-assisted)?" The answer: **most decisions are Crucible primitives** (normal flow); **Eureka's `decide()` is opt-in for high-stakes structured deliberation**. Surface: Crucible `@decisions` view shows ALL decisions (both pathways); Eureka's `decide()` is conversational ("let me reason through this with my knowledge graph"). No collision if Crucible is the source of truth for "what decisions were made" and Eureka is "how should I decide using past knowledge." |
| **Trust** | No Crucible usage of this term | Eureka fact provenance scalar (0..1); floor 0.15; orthogonal to Cairn's `confidence` | **NONE** | Crucible does not use "trust." Cairn (observability sibling to Crucible) uses `confidence` on prescriptions. Eureka's glossary explicitly states: `confidence` (epistemic strength of a recommendation) and `trust` (provenance reliability of a fact) are orthogonal. FR-12 enforcement mechanism #7: TypeScript branded types prevent cross-domain confusion. |
| **Commit** | No Crucible usage | Eureka's `commit(fact_id)` — hot-pin a fact to guarantee surfacing in `recall` | **NONE** | Crucible does not use "commit" as a verb in its vocabulary. Git's `commit` is ubiquitous, so no namespace collision beyond Aaron's muscle memory. |
| **Recall** | No Crucible usage | Eureka's `recall(query)` — retrieve facts by composite ranker | **NONE** | Crucible uses "rewind" (temporal navigation of ledger) and Mirror "views" (saved queries over ledger). "Recall" is Eureka-exclusive. |
| **Mirror** | Crucible's reflective view layer (saved queries over ledger, rendered via MCP into Copilot CLI) | No Eureka usage | **NONE** | Eureka does not use "Mirror." This is Crucible-exclusive. |
| **Ledger** | Crucible's immutable append-only decision/observation log (equivalent to Cairn's knowledge base) | No Eureka usage (Eureka has `facts` table, not "ledger") | **NONE** | Eureka's substrate is `facts` (mutable trust/importance/tier, Tier 2 edges added by sweep). Crucible's ledger is immutable primitives. Different shapes, different names. |
| **Sweep** | Curator sweep (Cairn event-log pattern detection, change-vector updates, prescription generation) | Eureka sweep (fact maintenance: importance decay, tier demotion, Tier 2 edge population, stale flags) | **LOW — SAME PATTERN, DIFFERENT DATA** | Eureka PRD glossary explicitly notes: "Same *pattern* as Cairn's sweep but different data model. No runtime coupling in v1." Both are opportunistic background maintenance. The word "sweep" appears in both vocabularies BY DESIGN (substrate kin per Aaron R6 signal (c)), but the mechanics are distinct. No Aaron-facing collision — he never invokes "sweep" directly. |

**Vocabulary verdict: NO dangerous collisions.** "Session" and "Decision" are the only shared terms, and both are intentionally shared (same entity, two lenses). The shared `SessionId` brand enforces compile-time safety on the identifier.

---

## 4. Friction-Budget Overlap

Crucible's `/skip` philosophy (from Valanice history): "Rejection easier than acceptance. Accept requires reading a preview (two-step). Reject/defer is one word. Max 1 proactive hint per session." This is the **calibrated friction load** for prescriptions.

**Eureka's friction points:**
1. **End-of-session `flushHints()` prompt:** Agent asks "should I remember X?" Aaron must approve/reject each suggested fact. This is Eureka's ONLY proactive human interrupt in v1.
2. **Manual `commit/retire`:** Aaron (or agent on Aaron's behalf) explicitly invokes `eureka.commit(fact_id)` or `eureka.retire(fact_id)`. These are pull-only (no proactive prompts).
3. **No friction during `recall`:** Agents invoke `recall` programmatically; Aaron never sees the query unless the agent renders it.

**Where friction overlaps:**
- **End-of-session moment:** Crucible's Narrator might emit a digest + `@inbox` surfaces pending approvals. Eureka's `flushHints()` prompts "commit these facts?" **Both want Aaron's approval attention at session-end.**

**Friction load at session-end (worst case):**
1. Crucible Narrator: "Session summary: 3 decisions, 7 observations, 2 sub-agents completed."
2. Crucible `@inbox`: "5 pending prescriptions (1 auto-applied, 4 awaiting approval)."
3. Eureka `flushHints()`: "Suggested facts from this session: [list]. Commit? (y/n/skip)"

Aaron sees THREE surfaces before he can close his laptop.

**Mitigation:**
- **Option A (aggressive):** Crucible's Approval Router subsumes Eureka's `flushHints()`. The Router queue shows BOTH Forge prescriptions AND Eureka suggested-facts. One `@inbox`, one approval surface. Eureka's `flushHints()` becomes a Router generator (not a conversational prompt).
- **Option B (conservative):** Eureka's `flushHints()` is opt-in only (agent must explicitly call it; not automatic). Crucible's `@inbox` is the default approval surface. Eureka facts are committed manually via CLI when Aaron wants (not prompted).
- **Option C (hybrid — RECOMMENDED):** Crucible's session-end digest includes a ONE-LINE Eureka continuity check: "`eureka` has 3 uncommitted facts from this session. Review? (type `:facts` or skip)". Aaron can batch-review in `@inbox` (if Eureka plugs into Router) or skip entirely. **Single attention interrupt, multiple backends.**

**Recommended stance:** **Option C.** Crucible's Narrator owns the session-end summary. Eureka continuity is a one-line footnote, not a separate modal. If Aaron wants to review, he types `:facts` (Mirror saved query over uncommitted Eureka facts). Otherwise he skips.

---

## 5. Mental-Model Collision Assessment

**Crucible's mental model (from Valanice Round 2 deliberation):**
- Aaron lives in **Copilot CLI** (not a new shell).
- Crucible is **ambient** — MCP tools, slash commands, saved views (Mirror), hooks.
- Chambers are **capabilities added to the CLI Aaron already uses**, not a separate TUI/REPL.
- Primitives (Request, Observation, Decision, Question, Artifact) are **what gets recorded**.
- Ledger is **"Git for reasoning"** — Aaron can rewind, bisect, replay counterfactuals.
- Mirror views (`@inbox`, `@today`, `@decisions`, `@doubts`) are **saved queries over the ledger**.
- Ctrl+E is the **"explode a turn into primitives"** affordance.
- Approval Router is the **single inbox** for all proposals (prescriptions, sub-agent results, drift alerts).

**Eureka's mental model (from PRD):**
- Eureka is the **cognitive memory layer** for agents.
- Agents store facts (`integrate`), retrieve knowledge (`recall`), and deliberate (`decide`) as part of normal task execution.
- Facts have `trust` (provenance reliability) and `importance` (attention weight).
- Attention tiers (hot/warm/cold) drive recall ranking.
- Sessions are **epistemological artifacts** (`kind=session` facts) — "what did I learn during session X?"
- Sweep is **opportunistic maintenance** (decay, demotions, edge population) — silent unless it produces alerts.
- Path 1 (contemplative) vs Path 2 (in-flow) decision pathways — agents choose based on context.

**Where models collide:**
1. **"Session" means two things** — BUT the R8 directive makes this a feature, not a bug. Crucible/Cairn own "what happened" (operational lifecycle). Eureka owns "what I learned" (knowledge retention). Same identifier (`SessionId`), different lenses. **This is the Jungian integration lens from Eureka's vision statement.**
2. **"Decision" spans two systems** — Crucible records the primitive; Eureka learns from it (Path 2) OR assists reasoning (Path 1). Aaron needs to know: most decisions are Crucible primitives; Eureka's `decide()` is opt-in for structured deliberation. **Unified view: Crucible's `@decisions` Mirror query shows all decisions (both pathways).**
3. **Two "review" surfaces** — Crucible's Mirror views (`:rewind`, `@decisions`, bisect) vs. Eureka's `recall` (agent-invoked). BUT: Mirror is for AARON; `recall` is for AGENTS. Aaron uses Mirror to see what happened; agents use `recall` to decide what to do next. **No competition if the personas are clear.**

**Mental-model verdict: NO dangerous collision.** The two tools occupy different **cognitive altitudes**:
- **Crucible = "I want to understand what I did and why"** (retrospective, audit, rewind, replay).
- **Eureka = "I want agents to remember what I taught them"** (prospective, knowledge retention, continuity).

Aaron's mental model: **"Crucible shows me my reasoning; Eureka makes agents smarter without me asking."**

---

## 6. Personalization / Preference Storage Overlap

**Crucible preferences** (not yet spec'd in detail, but implied by UX stories):
- Notification thresholds (when does Router surface an approval vs. auto-apply?).
- Mirror view customization (which saved queries are pinned? Default `@lobby` layout?).
- Ctrl+E trigger frequency / verbosity.
- Narrator digest verbosity (one-line summary vs. full turn breakdown).
- Sub-agent parallelism defaults.

**Eureka preferences** (from PRD):
- Trust floor (default 0.15, configurable).
- Recall result count `k` (default 10).
- Tier demotion hysteresis (N/M tunable).
- Sweep trigger cadence (end-of-session + first-query-of-day are defaults).
- Agent/user/project tier write enable (v1 = agent only; user/project deferred to v1.5).

**Storage overlap:**
- Crucible: likely `~/.copilot/crucible/preferences.json` or similar.
- Eureka: preferences embedded in each tier DB (SQLite `config` table) OR `~/.copilot/eureka/config.json`.

**Risk:** Two separate config surfaces for Aaron to manage.

**Mitigation:**
- **Option A:** Unified `~/.copilot/preferences.json` with namespaced keys (`crucible.*`, `eureka.*`). Both tools read from the same file.
- **Option B (current implied path):** Separate configs. Crucible's CLI surfaces its prefs via `crucible config`. Eureka's prefs are in its SQLite schema or a separate file.
- **Recommended:** **Option A IF both tools ship in the same delivery cycle.** Aaron should type `copilot config` (or a unified CLI entrypoint) and see ALL preferences. Namespace pollution is low (< 20 keys total across both tools).

**Onboarding overlap:** If Aaron installs both tools fresh:
1. Crucible first-run: Conductor initializes ledger, Mirror shows `@lobby` default view, Router is empty.
2. Eureka first-run: Creates `~/.copilot/eureka/agent.db` on first `integrate` or `recall`, empty fact store.

**No onboarding conflict.** Both are silent-by-default. First session with both tools: Aaron sees Crucible's Mirror (ledger is empty but views are present), agents invisibly use Eureka (no facts yet, `recall` returns empty).

**First-run UX verdict: NO collision.** Both tools are "pay-as-you-go" — no upfront setup ceremony beyond installation.

---

## 7. Single Integrated-UX Recommendation

**The combined experience should feel like:**

> **"Eureka makes agents smarter invisibly. Crucible makes Aaron's thinking auditable."**

More specifically:

- **Aaron never thinks "am I using Crucible or Eureka right now?"** He uses **Copilot CLI as always**. Crucible surfaces (Mirror views, Ctrl+E, `@inbox`) are CLI-native. Eureka surfaces (agent recalls, decision deliberation) happen inside agent responses.
- **Session boundaries are the handoff point.** At session-end, Crucible's Narrator summarizes "what you did" (ledger tail), and optionally mentions "Eureka has uncommitted facts" (one line, not a modal). Aaron types `:facts` to review or skips.
- **Decisions are unified.** Crucible's `@decisions` Mirror view shows ALL decisions (Crucible primitives + Eureka Path 1 deliberations). The underlying data comes from both ledger and Eureka facts, but Aaron sees one timeline.
- **Approval happens in one place.** Crucible's `@inbox` (Approval Router) is the single queue. If Eureka suggests facts via `flushHints()`, those suggestions feed into `@inbox` as a distinct category (not a separate conversational prompt).
- **"Session" is one concept with two lenses.** When Aaron types `:sessions` (hypothetical Mirror query), he sees a list of Copilot CLI sessions with TWO columns: "Duration / decisions / observations" (Crucible/Cairn data) and "Facts learned / trust avg" (Eureka data). Same `SessionId`, two perspectives.
- **Trust is Eureka's; confidence is Cairn's.** Aaron never sees them in the same sentence. If a prescription has `confidence=0.8`, that's Cairn. If a recalled fact has `trust=0.7`, that's Eureka. No implicit conversion; no conflation.

**Design principle: Eureka is the substrate; Crucible is the surface.**

Agents use Eureka to page in knowledge and commit facts. Aaron uses Crucible to see what happened and what's pending. The two tools compose at the session boundary (shared `SessionId`) and decision boundary (Forge `DecisionRecord` bridges both).

---

## 8. Open Questions for Aaron

1. **Session-end approval consolidation:** Should Eureka's `flushHints()` feed into Crucible's `@inbox` as a distinct approval category, or remain a separate conversational prompt? (Recommendation: consolidate into `@inbox` to reduce attention interrupts.)

2. **First-class decision pathway signaling:** When Aaron reviews `@decisions` in Mirror, should he see a column indicating "Crucible primitive" vs. "Eureka deliberation" (Path 1), or is the distinction irrelevant to him? (Hypothesis: irrelevant — Aaron cares *that* a decision was made, not *which system recorded it*.)

3. **Unified preferences surface:** Should `copilot config` show both Crucible and Eureka preferences in one namespace, or is it acceptable for Aaron to manage two separate config surfaces (`crucible config` and `eureka stats`)? (Recommendation: unified if both ship in same cycle; separate is acceptable if staggered.)

---

## 9. Learnings

1. **Shared session identity is a UX win.** The R8 directive to use `SessionId` brand from `@akubly/types` enables cross-system continuity without runtime coupling. Aaron can query "what did I do in session X?" (Crucible) and "what did agents learn in session X?" (Eureka) using the same identifier. This is **Jungian integration** in action — one entity, two lenses.

2. **Attention-budget collision is ONLY at session-end.** Both tools want Aaron's approval attention when he's context-switching away. Mitigation: Crucible's Narrator owns the session-end summary; Eureka continuity is a one-line footnote.

3. **Vocabulary collision risk is LOW because the tools occupy different cognitive altitudes.** Crucible is retrospective (audit, rewind, replay). Eureka is prospective (memory, continuity, learning). Aaron uses Crucible to understand past reasoning; agents use Eureka to inform future decisions.

4. **"Decision" is the only term that spans both systems actively.** Crucible records `Decision` primitives; Eureka ingests them (Path 2) OR assists deliberation (Path 1). Unified view: Crucible's `@decisions` shows all; Eureka's `decide()` is opt-in for high-stakes structured reasoning.

5. **Friction calibration is load-bearing.** Crucible already has a `/skip` philosophy (rejection easier than acceptance, max 1 proactive per session). Eureka's `flushHints()` must respect that budget. Recommendation: Eureka continuity prompts are opt-in OR batched into Crucible's `@inbox` (not a separate modal).

6. **"Eureka is the substrate; Crucible is the surface"** is the right framing. Agents consume Eureka programmatically; Aaron interacts with Crucible conversationally. The handoff is at the session boundary (shared `SessionId`) and decision boundary (Forge `DecisionRecord`).

---

*End of UX overlap analysis.*


### valanice-triage-2026-05-25T0200Z

# Valanice — Round 7 v1 Triage (Mirror / L5-surface stories)

**Date:** 2026-05-25T02:00Z
**Author:** Valanice (L5 Investigation Layer lead, Mirror UX owner)
**Framework:** Aaron-locked v1 (2026-05-25). Falsifiable bar: *Aaron can run a
one-week productivity loop where every improvement to Crucible is made by
Crucible.*
**Scope:** Every user story I have authored across rounds 1–6 — original
US-V-1..8 and the Round-2/3 US-V-NEW-1..6. Triage only; no design.

**Surface dependency reminders (locked, not re-litigated):**
- **Mirror** is the L5/UX notification + view surface (Round-6 #3 resolution:
  Mirror = one chamber, two render modes — Notifications push + Dashboard pull,
  one `MirrorEvent` stream, producers fan in from L1–L5).
- **L5 reads from `event_log`** via Rosella's L1Subscriber pattern (Round-6 #7).
  Non-destructive. No L5 writes to the WAL except via well-typed fork primitives.
- **Trail** (not breadcrumb) is the canonical name for branch-position indicators
  (Vocab cleanup — `skip_breadcrumbs` keeps its meaning in the DB schema).

---

## Triage table

Tier legend: **T1** = bootstrap-loop must-have · **T2** = investigation depth
(my tier) · **T3** = branching · **T4** = plugin · **T5** = scale · **T6** =
CLI parity · **Park** = not v1.

| Story | Round-7 verdict | Tier | One-line rationale |
|---|---|---|---|
| **US-V-1** Rewind to yesterday's intent | **SPLIT** → 1a / 1b | 1a = T1, 1b = T2 | 1a = "render the prior decision's recorded reasoning text from `event_log`" (pure read). 1b = counterfactual replay ("what if I had said no?") — needs L5 fork + replay engine. |
| **US-V-2** Ctrl+E explode the turn | **SPLIT** → 2a / 2b | 2a = T2, 2b = T6 | 2a = the *view* (`@turn:<id> → primitives`). Needs derived-query layer + `turn` primitive defined. 2b = the **Ctrl+E binding** — pure CLI parity; defer. |
| **US-V-3** Show me why you think you're wrong | **SPLIT** → 3a / 3b | 3a = T1, 3b = T2 | 3a = surface existing `confidence: low/med/high` in Mirror rows (substrate shipped — `confidenceToWords`). 3b = `@doubts` view rendering *defended* alternates — requires Forge to record rejected hypotheses (new substrate). |
| **US-V-4** Notifications that respect | **DROP (dissolved)** | — | Dissolved in Round 2 → US-V-NEW-4. Round-6 Mirror notification mode + Router make this redundant. Strike from the list. |
| **US-V-5** Three agents without three terminals | **DEFER** | T5 | Multi-agent orchestration surface is a scale concern. The one-week bootstrap loop is Aaron + Crucible — not Aaron + Crucible + N peer agents. |
| **US-V-6** Catch me trying the same thing twice | **KEEP** | T2 | Curator substrate exists; surfacing UX is investigation-flavored. High ROI, but not load-bearing for week-1 loop. |
| **US-V-7** Variants feel like evolving a sketch | **DROP (merged)** | — | Already merged into US-V-NEW-1 in Round 2. Strike. |
| **US-V-8** This tool is mine now (preferences) | **DEFER** | Park | Substrate (preferences table, cascading scopes) ships at v1 by side-effect. Closing the personalization loop (Forge fits Aaron's distribution from accept/reject telemetry) is post-v1. Bootstrap does not need it. |
| **US-V-NEW-1** Navigating the branch tree (trail) | **KEEP** | T3 | Depends on branch primitives. Trail-rendering is cheap *once branches exist*. Belongs to the branching tier, not bootstrap. |
| **US-V-NEW-2** Mirror as a view, not a place | **SPLIT** → 2a / 2b | 2a = T1, 2b = T4 | 2a = ship 3 hardcoded default views: `@lobby`, `@inbox`, `@today`. View *registry* table; no authoring UI. 2b = user-authored `@`-views (Aaron defines his own) — plugin-flavored, defer. |
| **US-V-NEW-3** Time-travel without the debugger smell | **KEEP** | T1 | Free. It's a translation table + lint convention + PR-template ask. Must land *before* any L5 text ships. Pre-output blocker for Sonny. |
| **US-V-NEW-4** One inbox, many filters | **SPLIT** → 4a / 4b | 4a = T1, 4b = T2 | 4a = expand `list_prescriptions` shape into multi-source `@inbox` (Forge prescriptions + Curator insights-needing-ack + **L5 pauses from Sonny US-S-9**). 4b = "preview what dismiss/snooze would do" + per-filter saved chip-sets — deeper UX polish. |
| **US-V-NEW-5** ↻/~ replayability badge | **SPLIT** → 5a / 5b | 5a = T1, 5b = T2 | 5a = `↻` badge reads DBOM `root_hash` presence — substrate already shipped (`compiler.ts:89-94`). Trivially renderable. 5b = `~` "best-effort, external call wasn't captured" — needs primitive-level hermetic-gap tainting; Sonny + Erasmus owe a typed flag. |
| **US-V-NEW-6** Bisect-as-conversation | **SPLIT** → 6a / 6b | 6a = T1, 6b = T2 | 6a = `bisect` MCP tool wrapping git-style binary search across two refs with one-question-at-a-time prompts. Trivial. 6b = causal-slice-integrated bisect + minimization probes (Sonny US-S-8) — full investigation depth. |

---

## Recommended T1 set (the minimum L5/Mirror subset that makes the bootstrap loop usable)

To meet the falsifiable bar, Aaron must, in one week, **edit Crucible and use
Crucible to diagnose what his edit did.** Without any L5 in T1, he falls back
to grep/git/console.log — and the bar is failed by construction. So T1 needs
exactly enough investigation to answer two questions:

1. *Why is this broken?* → **backward causal slice** (one hop).
2. *What change introduced it?* → **trivial bisect**.

…and exactly enough Mirror to surface both.

| # | T1 deliverable | Source story | Why it's load-bearing for the bar |
|--:|---|---|---|
| 1 | **`@lobby` + `@inbox` + `@today`** — three hardcoded default views; view-registry table; no authoring UI | NEW-2a | No surface = nothing to interrogate. These three are the discoverable landing surface (the Round-2 `@lobby` caveat that bought us Mirror-as-view). |
| 2 | **Multi-source `@inbox`** — `list_prescriptions` generalized to absorb Curator insights-needing-ack + L5 pauses (US-S-9) | NEW-4a | The triad `accept/reject/defer` is the one proven UX in the repo; `proactive_hint` cadence already encodes anti-fan-out. This is the *single* action surface for the bootstrap loop. |
| 3 | **Render prior reasoning** — Mirror row for any decision/prescription shows the recorded `confidence_level` + the captured reasoning text from `event_log` | 1a + 3a | Lets Aaron answer "why did past-Crucible decide X?" without inventing a new substrate. Pure read. |
| 4 | **`@why:<pid>` backward causal slice — one hop** — MCP tool: given a primitive id, return the immediate read-set rows (from Sonny's US-S-3 read-set-on-commit invariant), rendered as a Mirror view | 1a (deepened) + half of Sonny's US-S-? | This is the *minimum* investigation primitive. One hop only; Aaron re-queries to walk further. Doesn't need transitive closure, watches, registries, or retroactive projection. |
| 5 | **`bisect` MCP tool, trivial form** — binary search between two refs (commits or session_ids) with one-question-at-a-time conversational prompts | NEW-6a | The other half of the interrogation kit. Crucible's git history is the most common regression source in the bootstrap loop. |
| 6 | **`↻` replayability badge** — reads DBOM `root_hash` presence and renders on hermetically-replayable rows | NEW-5a | Free (substrate shipped). Builds trust in #4 and #5 — Aaron sees *which* rows the investigation primitives can speak honestly about. |
| 7 | **Vocabulary fence** — gdb-speak ↔ Aaron-speak translation table; convention "Aaron-facing strings live in `*/copy.ts`"; PR-template ask | NEW-3 | Pre-output blocker. Must land before Sonny ships any L5 text or the agentic-debugger metaphor leaks into the surface and we lose the trust property we've been buying. |

**Three things this set deliberately does NOT include** (and why this is the
right cut):

- **No forward causal slice.** Forward = "what does this affect?" — useful for
  *prospective* change-impact analysis. The bootstrap loop is *retrospective*
  ("I already changed it; why is it broken?"). Forward defers to T2.
- **No watch/breakpoint registries, no retroactive projection, no
  minimization.** All require stateful L5 services with their own lifecycle.
  T2.
- **No counterfactual replay** ("what if past-me had clicked reject?"). Needs
  fork + replay + branch UX. Drags in T3. Defer.

---

## T2 vs T1 boundary — explicit reasoning

The tiering question isn't "which stories" — it's "which **depth-of-feature
within a story** stays at T1 vs defers to T2." My principle:

> **T1 = read-only, single-hop, stateless. T2 = transitive, stateful, or
> requires new substrate.**

Concretely, for each split story:

| Capability | T1 cut | T2 cut | Why the cut is here |
|---|---|---|---|
| **Causal slice** (story 1a / NEW-6) | One hop backward, on-demand | Multi-hop transitive closure, forward direction, retroactive projection installer, persistent watches | One-hop backward is a pure SQL query over Sonny's `causal_read_set` column. Anything more either needs a stateful index (watches), traverses graphs (transitive), or asks "what if?" (forward simulation). The one-hop case answers *"what produced this state?"* — the literal investigation discipline ask. |
| **Bisect** (NEW-6) | Trivial git-style binary search with conversational prompt wrapper | Causal-slice-integrated bisect ("bisect over decisions, not commits"); automatic minimization probes (Sonny US-S-8) | Trivial bisect is ~200 lines wrapping `git bisect` semantics over a ref-range. The integrated forms require the slice engine (above) and a probe-fork primitive — both T2-and-up substrate. |
| **Mirror view registry** (NEW-2) | 3 hardcoded default views; views table holds (name, query_template, default_args); no authoring | User-authored views; view composition; view sharing; per-Aaron view persistence | The bootstrap loop needs *a* surface, not a *configurable* surface. Hardcoded defaults are a 1-day deliverable; an authoring grammar is a multi-week design problem and rightly T4. |
| **Replayability badge** (NEW-5) | `↻` for rows with valid DBOM `root_hash` | `~` for rows touched by non-hermetic primitives — requires a typed `hermetic_gap` flag on primitives (new substrate, Erasmus+Sonny owe) | `↻` is `SELECT root_hash IS NOT NULL`. `~` requires a primitive-level taint system that does not yet exist in the schema. |
| **Inbox** (NEW-4) | Multi-source list (Forge prescriptions + Curator insights + L5 pauses) with `accept/reject/defer` triad + proactive_hint cadence | Per-source filter chip-sets; "preview what dismiss/snooze would do"; bulk operations; saved filter combos | The triad + cadence is *the* proven UX pattern in the repo (Phase B reconciliation). Multi-source adoption is a generalization that doesn't change the core handler. Polish above that is post-bootstrap. |
| **Why-you're-wrong** (US-V-3) | Render existing `confidence: low/med/high` label on every Mirror row | `@doubts` view showing the *rejected alternative hypothesis* the agent considered | Confidence label exists in code and ships free. Defended alternatives require Forge to *record* rejected hypotheses — a new substrate ask, T2. |

**The single most important boundary call:** backward-slice-one-hop is T1.
This may look like cheating ("isn't slice the heart of L5?"). It isn't — the
heart of L5 is the **causal read-set invariant** (Sonny US-S-3), and *that*
is L1 work. Given that invariant, a one-hop backward query is a four-line
SELECT. The expensive engines (transitive closure, watch registries,
retroactive projection, minimization) are what make L5 a *layer* — but the
single one-hop SELECT is what makes Crucible *usable to debug Crucible* in
week one. Hold the line on that distinction.

---

## Open questions for Cassima (Router / L4)

If Cassima owns the Approval + Notification Router (Erasmus Layer 4):

1. **L5 pause routing.** Sonny's US-S-9 (debugger pauses surface as L4 approval
   items) is the mechanism by which `@inbox` absorbs investigation pauses for
   free. Does the Router treat an L5 pause as just another approval-needing
   item, or does it need a typed `category: investigation` so Mirror can
   render it with the right verbs (probably `step | continue | abort`, not
   `accept | reject | defer`)? My lean: typed category, render-time triad
   override. Need confirmation.
2. **MirrorEvent emission contract for L5.** Round-6 #3 says producers fan
   into `mirror_events` via L1 → L2 projection. Does L5 emit MirrorEvents
   *directly* (bypassing L1, since slice/bisect outputs are derived views,
   not new primitives) or does every L5 surface-able output go round-trip
   through the WAL? The non-destructive constraint argues for direct
   emission; the audit story argues for round-trip. Cassima + Rosella own
   this call.
3. **Backward-slice render channel.** Is `@why:<pid>` a one-shot MCP tool
   response (request/response), or does invoking it *materialize* a
   `MirrorEvent` that persists in `@inbox` for later reference? My lean:
   one-shot for v1, persistence in T2. Confirm doesn't conflict with
   Router's queue model.
4. **Vocabulary-fence enforcement venue.** US-V-NEW-3 (the gdb-speak fence)
   is a cross-cutting policy. Does the Router own the lint hook (every
   `MirrorEvent.title/bodyMarkdown` passes a banned-word check before
   admission to the stream), or is this a Vocab/CI-side concern? My lean:
   admission-time check at the Router — same place we already enforce
   cadence (one `proactive_hint` per session).
5. **`@inbox` ordering authority.** Today `list_prescriptions` orders by
   status-then-recency. In a multi-source inbox (Forge + Curator + L5
   pauses), who decides ordering? Cassima as Router (policy), or Mirror as
   view (presentation)? My lean: Cassima emits with a `priority_hint`,
   Mirror's default `@inbox` view honors it but Aaron can override
   per-view. Need agreement that `priority_hint` is a Router-side field.

---

## Brutal one-liner

The thing that makes this triage *honest* against the falsifiable bar is
admitting that **the heart of L5 — one-hop backward slice + trivial bisect —
is small enough to ship at T1 because Sonny's read-set-on-commit invariant
did the expensive work upstream.** Everything else my tier is famous for —
watches, retroactive projection, minimization, counterfactual replay,
forward slicing, branch authoring — defers without breaking the loop. The
risk isn't scoping investigation too tightly; it's letting the
agentic-debugger vision metastasize gdb vocabulary into the surface before
US-V-NEW-3's fence lands. Ship the fence in week one or pay forever.

---

## Pass A Execution Complete — Crucible CTD Design Review (2026-05-30)

### PA-V1: Valanice §9 Aperture Edits (4/4 Complete)

**Date:** 2026-05-30  
**Author:** Valanice  
**Status:** DONE

Executed all four Pass A items from CTD Aperture chapter:

1. **PA-B5 Defer Paradox (§9.4):** Removed `defer` from resolution lifecycle examples. Added explicit disclosure: `defer` is local-only (no L1 write), therefore does NOT resolve events. Path chosen: explicit disclosure rather than adding `aperture_deferred` sub-kind (which would falsely suggest L1 durability).

2. **Cache Invalidation Model (§9.2):** Rewrote cache-validity rule from strict content-addressed manifest to **prefix-compatible model**. Allows cache to survive append-only L1 growth without invalidation — projector incrementally projects new rows from `cacheHead+1` to `currentHead`.

3. **Defer Volatility Disclosure (§9.9, §13.1, §13.5):** Added explicit warnings about `defer`'s local-only behavior in three locations. Includes `⚠️ local-only` badge UX guidance and cross-ref to §13.5 UX principles.

4. **ApertureNotifier Phase 0.5 Stub (§9.11, §8.1):** Added Phase 0.5 section describing console-only `ApertureNotifier` stub (logs to console, no projection/queue). Unblocks Applier integration tests without requiring full §9 projection layer.

**Files:** `09-aperture.md`, `08-applier-decision-gate.md`, `13-crucible-cli-shell.md`

---

### PA-G1: Gabriel Applier/Infrastructure Edits (3/3 Complete)

**Date:** 2026-05-30  
**Author:** Gabriel  
**Status:** DONE

Executed all three Pass A items from Applier/Infrastructure cluster:

1. **PA-B6 Fence-Violation Retry Counter (§8.3) [BLOCKER RESOLVED]:** Added explicit `retriesRemaining` parameter to `applyWithFence()`. Implemented jittered exponential backoff: `2^retryAttempt ms × (1 + 0.3 * random)`, max 5 retries. Added two telemetry signals: `crucible.applier.fence_violation` (notice) and `crucible.applier.fence_exhausted` (attention). Roger now has all concrete parameters for implementation.

2. **Back-Pressure Projection Staleness (§5.A.4):** Specified staleness detection threshold (`projectionLastSeenOffset < ledgerHead - 100` events), synchronous catch-up budget (50ms max blocking), and recovery semantics. Defers all proposals with reason `projection_stale` until `observation{subKind:'projection_recovered'}` emitted.

3. **Subsystem-Specific Threat-Model Stubs (4 chapters):** Added lightweight threat-model subsections to §3.15.1 (L1 WAL), §5.9 (Router policy), §11.10.2 (Observation commitment), §17.3.2 (Pareto-incomparable). Each cites authoritative ADR (ADR-0002, ADR-0006, ADR-0011, ADR-0018) and extracts 3-5 key security implications.

**Files:** `08-applier-decision-gate.md`, `05-router-design.md`, `03-l1-wal-substrate.md`, `11-hermetic-replay.md`, `17-observability-telemetry.md`

---

### PA-R1: Roger CLI Verb Edits (2/2 Complete)

**Date:** 2026-05-30  
**Author:** Roger  
**Status:** DONE

Executed both Pass A items from CLI surface:

1. **`crucible perf [top]` Registration (§13.1):** Added as standalone verb in §13.1 verb table with `[--json]` option. Sorted by dispatch latency when `[top]` variant invoked. Rationale: §17 explicitly references both `crucible perf` and `crucible perf top` as separate affordances; verb-specific sorting places it alongside diagnostic verbs (`status`, `fsck`, `gc`), not query-driven reads.

2. **`defer` Help Text Alignment (§13.1 ↔ §9.9):** Updated §13.1 entry for `crucible aperture defer` to embed Valanice's expected substring: "Local snooze; no L1 write. Re-renders entry with `deferred` annotation." Coordinates with Valanice's §9.9 full disclosure.

**Files:** `13-crucible-cli-shell.md`

---

### PA-L1: Laura Test Strategy + ADR Template (2/2 Complete)

**Date:** 2026-05-30  
**Author:** Laura  
**Status:** DONE

Executed both Pass A items:

1. **C-9 Conformance Threading in §16.9:** Added explicit C-9 acceptance signal to §7.A Generic L3 Adapter Conformance entry: "Conformance suite rejects generators that emit supersede-replacement proposals without valid `parentId` lineage." Forward-compatible with Rosella's PA-B4 execution; C-9 contract itself is stable even if ancestry-read API shifts.

2. **ADR Body Template with Acceptance Signals Subsection:** Created `docs/adr/adr-template.md` with mandatory "Acceptance Signals" subsection. Five-tier signal taxonomy: contract-tier (property tests), component-tier (boundary tests), acceptance-tier (E2E scenarios), invariant-tier (math properties), countersignals (failure modes if violated). Bridges ADR "What Changes" (implementation) → test strategy (verification).

**Files:** `16-test-strategy-invariants.md`, `docs/adr/adr-template.md` (new)

---

### PA-R2: Rosella Generators + Branching Cluster (7/7 Complete + 2 Options Docs)

**Date:** 2026-05-30  
**Author:** Rosella  
**Status:** DONE

Executed all seven Pass A items; two escalated as options docs pending Aaron ruling:

**Phase 1 — Blockers escalated to Aaron:**

1. **PA-B4 Ancestry/Replay Divergence:** Options doc at `docs/crucible-technical-design/decisions/pa-b4-ancestry-replay-options.md`. Question: unify ancestry-aware read APIs (Option A recommended) or split APIs with Router escalation (Option B)? Rosella recommends Option A (replay correctness + low v1 cost + acceptable ergonomics).

2. **childSid Collision:** Options doc at `docs/crucible-technical-design/decisions/childsid-collision-options.md`. Question: timestamp in preimage (Option A recommended), protocol-error semantics (Option B), or resume-aborted-session idempotent retry (Option C)? Rosella recommends Option A (lowest cost, transparent UX, collision-free).

**Phase 2 — Landed in §7/§10 chapters:**

3. **Trust-Tier Promotion Persistence (§7.4.1):** Derived `plugin_trust_history` table keyed on `manifestSha256`. Tracks 30-day + 10-invocation + 0-violation promotion clock, rebuildable from L1 audit trail.

4. **Conformance Suite C-8 → C-9 (§7.A):** Extended from 8 to 9 property classes. C-9 = supersede-replacement contract: generators emitting replacements MUST set `envelope.parentId` to obsoleted proposal's EventId. Applies to both `StructuralProposalGenerator` and `DataProposalGenerator`.

5. **Pareto Eval Perf Budget (§7.5.1):** Concrete budget: ≤5ms p99 latency for 50 concurrent proposals, ≤10 MiB heap, 20ms timeout with fail-open. Laura owns §16 perf conformance suite (`pareto-eval-latency` test runner).

6. **`alternatives[]` Unbounded (§7.5.2):** Bounded `incomparableWith[]` to top-K=10 inline + CAS spill for pathological case (50 proposals). Payload ceiling: 672 bytes max per Decision even in worst case.

7. **Invocation-Stack O(N) Reconstruction (§10.6.1.1):** Optional L2 cache table `invocation_stack_cache` (session_id, checkpoint_offset, stack_json). Cache at 100-row intervals (~1 KiB per checkpoint). v1 optional, mandatory in v1.5 for debugger. Rejected event-sourced stack delta (too much duplication).

**Files:** `07-generators-l3.md`, `10-session-branching.md`, plus 2 options docs (non-inbox)

---

### PA-G2: Graham L3.5 Scheduler Phase 0.5 Stub (4/4 Complete)

**Date:** 2026-05-30  
**Author:** Graham  
**Ruling:** Aaron Kubly (2026-05-30)  
**Status:** DONE

Implemented Aaron's ruling on L3.5 Scheduler Phase 0.5:

**Decision:** YES — FifoScheduler stub in Phase 0.5 is acceptable. Validates L3.5 tier boundary and satisfies A-Sched-1 (dispatch ordering) without complexity. Phase 1 upgrades to WeightedRoundRobinScheduler for A-Sched-2 (back-pressure) + A-Sched-3 (quanta exhaustion).

**Implementation:**
1. Updated `docs/crucible-technical-design-plan.md` to include FifoScheduler stub in Phase 0.5 walking skeleton (6 items, was 5)
2. Updated §5.A.7 acceptance signals: A-Sched-1 satisfied by Phase 0.5 stub; A-Sched-2/A-Sched-3 are Phase 1 graduation criteria
3. Updated §16.3 SchedulerDispatcher collaborator row with Phase 0.5 stub vs Phase 1 full impl note
4. Gabriel added as Phase 0.5 FifoScheduler stub owner

**Rationale:** Stub proves tier boundary exists and satisfies core replay-ordering invariant before Phase 1 invests in fair dispatch, back-pressure, and quanta budgeting. Validates ADR-0024 architecture early.

**Files:** `docs/crucible-technical-design-plan.md`, `05-router-design.md`, `16-test-strategy-invariants.md`

---

---

## Closed Decisions (This Session)

### PA-B4: Ancestry-Aware Reads (CLOSED 2026-05-30)

**Date:** 2026-05-30  
**Author:** Rosella  
**Ruling:** Aaron Kubly  
**Status:** LANDED

**Decision:** Option A — Unify ancestry-aware reads under one API (`.ancestry()` method on ReadSetBuilder).

**Rationale:** Single, explicit API eliminates fork-scoped vs. ancestry-scoped ambiguity. Failure mode (missing parent data) is visible, not silent. Replay protocol clarified to re-feed ancestry reads via stitched-view logic.

**Implementation:**
- Added `ancestry(ancestorSid, includeTransitiveParents)` method to §7.3 ReadSetBuilder
- Extended §6.1 ReadSetRef schema with `ancestryRefs[]`
- Clarified §11.4 replay protocol (LedgerWindowReader.readAncestry())
- Added property **C-6b (ancestry-read completeness)** to §7.A conformance suite
- Documented Eureka v1.5 forward reference (future adapters MUST call `.ancestry()` if analyzing multi-fork data)

**Files:** §7.3, §6.1, §11.4, §7.A, §7.F

**Impact:** Ancestry reads now captured and replayed deterministically. C-6b property test validates completeness.

---

### childSid Collision: Hybrid Always-Prompt Design (CLOSED 2026-05-30)

**Date:** 2026-05-30  
**Author:** Aaron Kubly (synthesis of 4-persona review)  
**Status:** LANDED — ADR-0019 created

**Decision:** Hybrid fork-or-resume design with always-prompt UX, no automatic heuristics. User chooses via TTY prompt; explicit flags (--new, --resume) available for CI/automation.

**Key Rulings:**

1. **Drop wall-clock heuristic entirely** — Replay-determinism violation discovered by Graham (Architect) + Laura (Tester) independent convergence. Offsets are architectural primitives; wall-clock time is informational only.

2. **Naming: "Fresh" → "New"** — Parallel structure with "Resume" (Valanice UX finding). Clearer natural language.

3. **Always-prompt UX** — TTY detection: show `[N]ew / [R]esume / [C]ancel`. No auto-timeout; require explicit key press. Relative time ("3 days ago") as primary recency signal (tired-engineer persona).

4. **Non-TTY behavior** — Exit code 2 + error message requiring explicit flag (protects CI/automation from silent data loss).

5. **Flags:** `--new` (force timestamp-variant preimage), `--resume` (continue aborted session), `--no-interactive` (suppress prompt), `--label` (optional annotation). Drop `--disambiguator` (redundant).

6. **Determinism:** Decision row in PARENT ledger captures user choice (fresh vs. resume). Replay follows recorded choice, not re-prompting.

7. **`fork_resume` Observation sub-kind** — Records resume point when session is resumed after abort.

8. **Keep both flag + verb** — `crucible fork --resume` + separate `crucible session resume <childSid>` (orthogonal workflows).

9. **Closed-session metadata append clarification** — Closed sessions refuse work-session appends (tool calls, LLM responses) but accept metadata appends (fork Decisions, GC records, retention updates). Clarifies "closed ≠ sealed."

**ADR:** `docs/adr/0019-childsid-collision-hybrid.md` (14.8 KB, 315 lines)

**Files edited:** §10.4 (fork protocol), §10.1 (session state machine), §6.3 (observation taxonomy), §13.1 (CLI verbs), §16.9 (acceptance signals + 8 A-Fork-* scenarios), 2 options docs marked SUPERSEDED

**Cross-persona convergence:** Graham (Architect) + Valanice (UX) + Laura (Tester) + Roger (CLI) + Rosella (Plugin Dev) all APPROVE-WITH-CONDITIONS. Independent Graham/Laura convergence on wall-clock determinism bug elevated blocker from "nice-to-have" to "non-negotiable drop."

**Skill captured:** "cross-persona-review-yields-replay-bug-catch" — Multi-persona review with distinct lenses surfaces correctness bugs (replay-determinism violation) that single-reviewer design or unit tests alone would miss.

---

## Next Session Pickup

**Status:** Crucible CTD design review is COMPLETE. Original Pass (21 findings) + Pass A (25 findings) + childSid Round 2 (ADR-0019 landed) all closed.

**Next phase:** Implement childSid collision hybrid (CLI + tests) and PA-B4 (ancestry reads). ADR-0019 is the capstone design artifact for v1 fork protocol.

