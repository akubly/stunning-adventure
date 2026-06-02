# Squad Decisions Archive

Archived: 2026-06-01 (entries older than 7 days)

### 2026-05-25: Eureka PRD v4-final LOCKED — R7 8-Reviewer Lock-In Panel

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-25  
**Locked By:** 8-reviewer panel (4 Squad domain + 4 persona-review Design Panel personas)  
**Lock Status:** DO NOT EDIT — implementation phase begins

**Decision:** Eureka PRD v4-final is ratified as canonical, shippable specification after R7 lock-in. All 4 blockers resolved. All 9 important findings synthesized. Ready for implementation phase. R7 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (555 lines, 69.5 KB) — canonical stable location
- **Lineage:** v3 (R5) → v3.1 patches (R6) → v4-final (R7 amendments + Aaron finalization) → v4-final rev-2 (4 blockers + 9 importants resolved)
- **Panel:** Graham Knight (Architect), Genesta (Storage), Crispin (Schema), Edgar (Enforcement), + 4 persona-review personas (Architect, Skeptic, Pragmatist, Compliance)

**Blockers Resolved:**
1. **B1** — DecisionSource adapter mapping (verified against packages/types/src/index.ts:47) ✅ RESOLVED
2. **B2** — FR-14 Path 2 cadence, idempotency, dedup, initial trust ✅ RESOLVED
3. **B3** — FR-7.4 ↔ FR-7.2 contradiction (bridge_ledger + offline CLI coexistence) ✅ RESOLVED
4. **B4** — Security Threat Model (§14a added with attack vectors + mitigations) ✅ RESOLVED

**Important Findings (I1–I9):**
- Scope rightsize across 5 v1 + 2 v1.5 mechanisms
- Sequential fan-out specification
- US-2 flush helper scoping
- Agent-tier-only wiring constraints
- Production opt-in policy
- Citation + decision-log registers
- input_trust_avg → input_trust_min analysis
- Confidence/trust orthogonality enforcement (branded types)
- Extraction-readiness mechanism verification (7 mechanisms, not 5)

**Reviewer Verdicts:**
- **Graham Knight (Architect):** APPROVE-FOR-LOCK — bidirectional adapter framework structurally sound, all R7 amendments integrated, 3 documentation nits (non-blocking)
- **Genesta (Storage/Substrate):** APPROVE-FOR-LOCK — dual-axis schema (input_trust_avg + reasoning_confidence) correct, adapter lossy contracts justified
- **Crispin (Schema):** APPROVE-FOR-LOCK — all 5 R7 schema risks mitigated, branded-type enforcement adequate to prevent confidence/trust collapse
- **Edgar (Enforcement):** APPROVE-WITH-MINOR-NITS — all 5 R7 mechanisms integrated + 2 additions (branded types, DESIGN.md), Path D preserved via manual-only triggers
- **Persona Architect:** Found B1 (DecisionSource mapping)
- **Persona Skeptic:** Found B2 (FR-14 gaps) + multiple I-findings
- **Persona Pragmatist:** Found B3 (FR-7 contradiction) + feasibility I-findings
- **Persona Compliance:** Found B4 (missing security model) + compliance I-findings

**Key Architectural Decisions Locked:**

1. **Bidirectional Adapter Framework** (resolves Aaron's R7 directive):
   - **Path 1 (Eureka → Forge):** Contemplative decisions. Agent uses Eureka facts/edges to reason, decision stored as `kind=decision` fact AND emitted to Forge via `toDecisionRecord()` for audit trail.
   - **Path 2 (Forge → Eureka):** In-flow decisions. Agent decides during normal LLM exchange, Forge captures `DecisionRecord`, Eureka ingests via `fromDecisionRecord()` to learn decision patterns.
   - **Both are load-bearing:** Eureka-assisted reasoning needs Path 1. Retrospective learning from observed decisions needs Path 2. No circular dependency (contexts non-overlapping).

2. **Confidence/Trust Orthogonality:**
   - `Confidence` (Cairn): epistemic strength of derived conclusions
   - `Trust` (Eureka): provenance reliability of stored facts
   - NOT interchangeable — TypeScript branded types enforce separation at compile time
   - Composition explicit and documented when needed

3. **Extraction-Readiness Enforcement (7 mechanisms, FR-12):**
   1. TypeScript subpath export (`./learning` firewall)
   2. Folder layout enforcement (no parent imports)
   3. Interface ban on domain types (signatures only primitives/shared vocab)
   4. Plain-data test pattern
   5. Lint + CI enforcement (`no-restricted-imports` + canary test)
   6. DESIGN.md living architectural contract
   7. Branded types for `Confidence` and `Trust`

4. **Boundary Discipline (no FK, no JOIN):**
   - Eureka and Cairn are peer systems with complementary purposes
   - Session namespace isolation: Eureka has `kind=session` facts, Cairn owns `sessions` table
   - Correlation via opaque `cairn_session_id` only (one-way reference, not FK)
   - Each system authoritative for own domain (sweep/ranker/trust → Eureka; observability → Cairn)

5. **Path D Preservation (Kernel Extraction Ready):**
   - Eureka ships standalone in v1 with no new dependencies on Cairn
   - Manual-only Cairn→Eureka session triggers (via explicit `remember()` call)
   - Auto-promotion heuristics deferred to v1.5+ pending usage patterns
   - Three-phase adoption playbook for Cairn if/when it adopts learning modules

**User Directives Locked (from Aaron Kubly):**
- **2026-05-24T23:43Z:** v4-final revision #2 scope — resolve ALL 4 persona blockers AND consensus-strength important findings
- **2026-05-25T05:48:00Z:** Eureka↔Forge decision flow is bidirectional by design (contemplative path + in-flow path, both load-bearing)

**Why This Approach:**
- Panel-first design prevented implementation surprises (dual-panel caught issues Squad-only missed)
- Persona review augmented domain expertise with cross-cutting risk/feasibility/compliance analysis
- Bidirectional adapter framework resolved architectural disagreement while honoring both workflows
- Branded types + seven-mechanism extraction-readiness provide concrete enforcement, not aspirational promises
- Boundary discipline between Eureka/Cairn preserves each system's autonomy while enabling collaboration

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v4-final.md` (stable location, do not edit)
- **Lock-in Orchestration:** `.squad/orchestration-log/2026-05-25T06-54-22Z-*` (9 entries: Cassima revision + 4 Squad reviewers + 4 personas)
- **Session Log:** `.squad/log/2026-05-25T06-54-22Z-r7-eureka-v4-final-lock.md`
- **Reviewer Verdicts:** Graham blessing + all four lock-in verdicts at `.squad/orchestration-log/2026-05-25T06-54-22Z-*-lock-verdict.md`

**Implementation Readiness:**
- PRD is self-contained (no external doc required for implementation)
- All [v4: <reason>] annotations mark deltas from v3 for lineage traceability
- Three lock-in nits (FR-7.4 reconciliation query, FR-14 ingestion cadence, §7.5 kernel versioning) are documentation polish, addressable during v1 implementation or v1.1 pass
- No architectural risks identified

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms as specified
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface)
- Path D Extraction: Kernel extraction readiness enforced from Day 1, extraction happens post-v1 pending org-scale federation needs

---

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

### PR #33 Cycle 5: Fork Resume Schema + Predicate Timing Honesty (Graham)

**Date:** 2026-05-31
**Author:** Graham Knight (Architecture Lead)
**Status:** APPROVED (Merged in commit 40d39d3)
**Scope:** Address three Copilot findings from PR #33 cycle 5 review round

**Status:** Inbox — Scribe merge pending

## Decision

PR #33 cycle 5 applies two governance clarifications:

1. §6.3 sub-kind registration is incomplete unless the sub-kind has an authoritative payload schema. `fork_resume` now has the same registry-level schema treatment as `fork_origin` and `fork.collision_choice`.
2. v1 Hook Bus predicate timing is cooperative measurement, not hard preemption. `PredicateRegistration.evaluate` remains synchronous; over-budget predicates produce post-hoc telemetry and retry-budget quarantine for future rows. True hard preemption is deferred to v1.5+ worker/process isolation or an async cancellable predicate API.

## Rationale

The first clarification prevents conformance tests from accepting enum-only vocabulary with no payload contract. The second prevents §18 from overstating `Promise.race()` as a sandboxing primitive for CPU-bound synchronous JavaScript.

## Files touched

- `docs/crucible-technical-design/04-hook-bus.md`
- `docs/crucible-technical-design/06-primitive-taxonomy.md`
- `docs/crucible-technical-design/10-session-branching.md`
- `docs/crucible-technical-design/18-security-permissions.md`
- `docs/adr/0019-childsid-collision-hybrid.md`

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


# [ARCHIVED SECTIONS BEFORE 2026-05-24]

Entries from 2026-05-23 and 2026-05-22 have been archived to decisions/archive/archive-2026-05-23.md


**Area 5 — MCP surfaces** (`worktreeMcp.test.ts`):
- `get_status` handler returns `sessions:` key (flat array shape, not `session:`)
- No `primary:` / `siblings:` shape (locked decision: flat array only)
- `get_session` identity matches `(repo_key, workdir)` pair
- `get_session` with mismatched workdir returns not-found
- No `console.log` leak in server.ts
- Structural source-reading tests as shape tripwires

**Migration 015** (`migration015.test.ts`):
- `workdir` column exists after migration
- Column is nullable TEXT with no default value
- Existing sessions are backfilled with `workdir = NULL` (lazy NULL backfill)
- Schema version advances to 15
- Migration is idempotent (double-apply is safe)

---

## Flag for Roger: No-Workdir Backcompat Behavior

The locked decision says: `getActiveSession(repoKey)` with NO workdir "must still match NULL rows for backcompat."

Roger's implementation interprets this as **"no filter = returns most recent any-workdir"** — i.e., `getActiveSessionWithDb` adds no `workdir IS NULL` clause. Old callers get the most-recent active session regardless of its workdir value.

This means: an old caller that never passes workdir will now potentially see a worktree session's ID returned. This is a trade-off, not a bug. I've documented it in the test and in my history.

If the intent was stricter — old callers ONLY see NULL-workdir sessions — then `getActiveSessionWithDb` should add `AND workdir IS NULL`. That would be a change to Roger's implementation. I'm flagging it; Aaron should adjudicate if the current behavior is the wrong interpretation.

Current test `'getActiveSession without workdir arg returns most recent active session (no workdir filter applied)'` asserts the current (no-filter) behavior. If the decision flips to strict-NULL behavior, that test assertion changes from `toBeDefined()` to `toBeUndefined()` (for a workdir-populated session).

---

## Notes

- All tests written against Roger's actual implementation (which landed before tests were complete — convergence scenario)
- Structural tests in `worktreeMcp.test.ts` read `server.ts` source to assert shape contracts as tripwires
- One test showed a flaky full-suite failure (passes consistently in isolation and on repeated full-suite runs). Not a real defect — non-deterministic OS scheduling of vitest VM forks.


---

# Roger → Laura: WI-A API Shapes (Issue #11)

**Date:** 2026-05-27  
**From:** Roger  
**To:** Laura  

## What shipped in WI-A source files

### `db/sessions.ts` — new/changed exports

```typescript
// Updated signature — workdir is 4th optional arg (branch is 3rd)
export function createSession(
  db: Database.Database,
  repoKey: string,
  branch?: string,
  workdir?: string,  // NEW — NULL when omitted
): string

// Updated signature — workdir scopes the lookup
// When workdir is omitted: no workdir filter (returns most recent active session)
// When workdir is provided: adds `AND workdir IS ?` (IS handles both NULL and string)
export function getActiveSession(
  db: Database.Database,
  repoKey: string,
  workdir?: string,  // NEW
): Session | undefined

// NEW — returns all active user sessions for the repo (used by get_status flat array)
export function listActiveSessionsForRepo(
  db: Database.Database,
  repoKey: string,
): Session[]
```

### `hooks/gitContext.ts` — new export

```typescript
// NEW — git rev-parse --show-toplevel in cwd; returns undefined on failure
export function getWorkdir(cwd?: string): string | undefined
```

### `types/index.ts` — Session type

```typescript
export interface Session {
  // ... existing fields ...
  workdir?: string;  // NEW — undefined for NULL rows
}
```

### `agents/archivist.ts` — updated signatures

```typescript
// workdir threaded through — session_start and session_resume payloads now include workdir
export function startSession(repoRemoteOrKey: string, branch?: string, workdir?: string): string
export function catchUpPreviousSession(repoKey: string, workdir?: string): { recovered: boolean; sessionId?: string }

// tool_use payload now includes workdir field (null when unknown)
export function recordToolUse(
  sessionId: string,
  toolName: string,
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
  workdir?: string,  // NEW
): number
```

### `hooks/sessionStart.ts` — updated signature

```typescript
// workdir added as 4th optional param (after existing afterCurate callback)
export async function runSessionStart(
  repoKey: string,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
  afterCurate?: (curateResult: CurateResult) => void,
  workdir?: string,  // NEW
): Promise<{ fastPath: boolean }>
```

### `agents/sessionState.ts` — SessionSummary type

```typescript
export interface SessionSummary {
  // ... existing fields ...
  workdir?: string;  // NEW — undefined for NULL rows
}
```

### MCP `get_status` shape (BREAKING)

Old: `{ session: Session | null, curator: CuratorStatus }`  
New: `{ sessions: Session[], curator: CuratorStatus }`

New input params:
- `repo_key?: string` (unchanged)
- `workdir?: string` (NEW — filters to specific worktree when provided)

### MCP `get_session` shape

Old input: `{ session_id: string }` (required)  
New input: 
- `session_id?: string` (now optional)
- `repo_key?: string` (NEW — alternative lookup)
- `workdir?: string` (NEW — used with repo_key for (repo_key, workdir) identity lookup)

At least one of `session_id` OR `repo_key` must be provided.

## Note on `getActiveSession` behavior

After back-and-forth with your updated test, the final semantic is:
- No workdir arg → no workdir filter (returns most recent active session regardless of workdir)  
- Workdir string arg → `AND workdir IS ?` filter (exact worktree match)

Your test `"getActiveSession without workdir arg returns most recent active session"` captures this correctly.

The `getActiveSessionByWorkdir` internal helper exists for when you need `IS NULL` matching explicitly (not exported, used internally for the workdir-scoped path).


---

# WI-A Implementation Summary — Issue #11

**Author:** Roger  
**Date:** 2026-05-27  
**Branch:** `squad/11-worktree-aware-sessions`  
**Status:** Complete — build green, 647/647 tests passing

## What Shipped

### Migration

**Number:** 015 (as locked by Graham — issue body is stale at "005")  
**File:** `packages/cairn/src/db/migrations/015-workdir-sessions.ts`  
**Changes:**
- Adds `workdir TEXT` column to `sessions` table (NULL-tolerant, no DEFAULT needed)  
- Creates partial index `idx_sessions_repo_workdir ON sessions (repo_key, workdir) WHERE status = 'active'` to support `getActiveSession` and `listActiveSessionsForRepo` efficiently
- Wired into `packages/cairn/src/db/schema.ts` alongside migration014

**Schema version:** 14 → 15

### DB API (`packages/cairn/src/db/sessions.ts`)

```typescript
createSession(db, repoKey, branch?, workdir?)  // workdir 4th optional arg
getActiveSession(db, repoKey, workdir?)         // updated: when workdir provided, adds `AND workdir IS ?`
listActiveSessionsForRepo(db, repoKey)          // NEW: all active user sessions for repo
```

**`getActiveSession` semantics (final — Aaron-confirmed Q1 locked decision):**
- No workdir arg → `AND workdir IS NULL` → only NULL-workdir rows (backcompat; old callers cannot pick up worktree sessions)
- Workdir string arg → `AND workdir IS workdir` → exact worktree match  

> **Correction applied 2026-05-27:** The initial WI-A commit used "no filter" for the no-arg path (per Laura's reconciled test). Aaron confirmed the correct semantic per the locked Q1 decision is `AND workdir IS NULL`. Fixed in commit `ea9ab58` — `getActiveSession` now delegates to `getActiveSessionByWorkdir(db, repoKey, null)` when workdir is `undefined`. `worktreeSessions.test.ts` updated accordingly (18 tests all green).

Internal helper `getActiveSessionByWorkdir(db, repoKey, workdir: string | null)` added for explicit IS-NULL matching.

`listActiveSessionsForRepo` returns only `session_kind = 'user'` sessions ordered by `started_at DESC`.

### `getWorkdir()` (`packages/cairn/src/hooks/gitContext.ts`)

New export — `git rev-parse --show-toplevel` via execSync, same stdio/timeout pattern as `getRepoKey()`. Returns `undefined` on failure (non-git dirs, bare repos, git not on PATH).

### Workdir Threading

- **`archivist.ts`**: `startSession(remote, branch?, workdir?)` + `catchUpPreviousSession(repoKey, workdir?)` + `recordToolUse(sessionId, tool, args?, result?, workdir?)`
- `session_start` event payload: includes `workdir` field (null when unknown)
- `session_resume` event payload: includes `workdir` field
- `tool_use` event payload: includes `workdir` field
- **`postToolUse.ts`**: resolves workdir via `getWorkdir(hookData.cwd)`, threads through
- **`sessionStart.ts`**: `runSessionStart(repoKey, config?, afterCurate?, workdir?)` — workdir is 4th optional param so existing callers pass unchanged

### Types

`Session.workdir?: string` added to `packages/cairn/src/types/index.ts`  
`SessionSummary.workdir?: string` added to `packages/cairn/src/agents/sessionState.ts`  
`getSessionSummary` queries `workdir` from sessions table

### MCP (`packages/cairn/src/mcp/server.ts`)

**`get_status` (BREAKING — Aaron-approved):**
- Old: `{ session: Session | null, curator: ... }`
- New: `{ sessions: Session[], curator: ... }` — flat array always
- New input: `workdir?: string` added alongside `repo_key`
- With workdir: filters to single worktree session (still in array)
- Without workdir: `listActiveSessionsForRepo` — all active user sessions
- `readOnlyHint: true` preserved

**`get_session`:**
- Old: `{ session_id: string }` (required)
- New: `{ session_id?: string, repo_key?: string, workdir?: string }`
- Either `session_id` OR `repo_key` must be provided; error if neither
- Workdir-based lookup via `getActiveSession(db, repo_key, workdir)`
- `readOnlyHint: true` preserved

**stdio rule compliance:** No `console.log/info/debug` in any code reachable from `get_status` or `get_session` handlers.

### Test Updates (existing tests broken by v15)

Updated schema version assertions from 14 → 15 in:
- `src/__tests__/db.test.ts` (3 assertions)
- `src/__tests__/discovery.test.ts` (1 assertion)
- `src/__tests__/migration012.test.ts` (2 assertions)
- `src/__tests__/prescriptions.test.ts` (1 assertion)

## Validation

- `npm run build --workspace=@akubly/cairn`: ✅ clean  
- `npm test --workspace=@akubly/cairn` (direct vitest run): ✅ 647/647 passed  
- `@akubly/types` untouched (no shared types changed; `Session` is cairn-internal)

## Coordination

- API shapes summary written to `.squad/decisions/inbox/roger-issue-11-api.md` for Laura
- WI-B (Gabriel, coordinator dispatch policy) holds until this branch merges





## laura-m5-trust-feedback-red
# Decision Drop: M5 RED — Trust Feedback Mutation Contract

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M5 RED — trust mutation from feedback event  
**Next owner:** Edgar — M5 GREEN  
**Status:** LANDED — RED  

---

## Contract Under Test

§30 §2.3 specifies event-driven trust mutation:

| Event | Formula |
|---|---|
| Corroboration | `trust = min(1.0, trust + 0.10)` |
| Contradiction | `trust = max(0.0, trust - 0.10)` |
| User correction | `trust = min(1.0, trust ± 0.30)` |

**Test file:** `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`

**Failure observed (correct RED):**
```
TypeError: (0 , applyFeedback) is not a function
```
All 4 M5 tests fail for this reason. All 18 M1–M4 tests pass.

---

## Collaborator Shape Chosen

### Seam Driven: `TrustUpdater`

Inline structural mock (London-school pattern; contract test for real impl deferred to Crispin):

```typescript
const trustUpdater = {
  update: vi.fn().mockResolvedValue(undefined),
};
```

**Interface shape (Edgar to formalize in GREEN):**
```typescript
interface TrustUpdater {
  update(args: {
    factId:    string;
    sessionId: SessionId;
    trust:     number;   // new trust value, already clamped to [0.0, 1.0]
  }): Promise<void>;
}
```

### Activity Signature (Edgar to implement in GREEN)

```typescript
async function applyFeedback(
  options: {
    factId:       string;
    sessionId:    SessionId;
    event:        'corroboration' | 'contradiction' | 'user_correction';
    currentTrust: number;
    /** Required when event is 'user_correction'. Sign indicates direction (+0.30 or -0.30). */
    correctionDelta?: number;
  },
  deps: {
    trustUpdater: TrustUpdater;
    clock:        ClockProvider;   // REQUIRED per §55 §1.2 (no optional default)
  },
): Promise<void>
```

### Design Rationale

1. **`applyFeedback` is separate from `recall()`** — trust mutation is a write operation; recall is read-only. Separation of concerns.
2. **`currentTrust` is caller-provided** — keeps the M5 RED focused on the trust-write seam only. A read-seam (FactStore or FactReader) will be needed for round-trip use cases but is separate scope.
3. **`clock` is required in deps** — consistent with M1–M4 pattern (§55 §1.2); the implementation may timestamp when feedback was applied.
4. **TrustUpdater receives the computed new trust value** (not the delta) — the activity owns delta computation; the updater owns persistence. Clean separation.

---

## §-Level Ambiguities

### Ambiguity 1: §30 §2.3 does not exist as a section (SPEC GAP)

**Issue:** decisions.md cites "§30 §2.3 'Trust Dynamics Beyond the Static Floor'" as the contract source, but this section does NOT exist in `docs/eureka/sections/30-learning-systems.md`. Section numbering jumps from `2.2 Recency` directly to `2.4 Time Injection for Testability`.

**Resolution chosen:** decisions.md Named M5 Target is authoritative for delta values (+0.10, -0.10, ±0.30). The spec gap should be escalated to Edgar/Cassima to add the missing §2.3 section.

**Action item:** Request Cassima (or Edgar) add §30 §2.3 to the learning-systems spec.

### Ambiguity 2: user_correction ± sign source (DEFERRED)

**Issue:** "trust = min(1.0, trust ± 0.30)" — the ± means correction can increase or decrease trust. The sign must come from somewhere. Options:
- (a) Separate event types: `'user_correction_positive'` / `'user_correction_negative'`
- (b) Caller-provided signed delta: `correctionDelta: +0.30 | -0.30`
- (c) Single magnitude, direction inferred from context (e.g., "was the correction toward truth?")

**Resolution chosen for RED:** Option (b) — `correctionDelta` in options. Test for user_correction deferred to M5 GREEN; Edgar confirms interface shape.

**Deferred test (for Edgar's GREEN):**
```typescript
it('applies user-correction delta (+0.30) clamped to 1.0 ceiling (§30 §2.3)', async () => {
  // currentTrust=0.80, correctionDelta=+0.30 → min(1.0, 0.80 + 0.30) = 1.0
  await applyFeedback(
    { factId: 'fact-001', sessionId, event: 'user_correction', currentTrust: 0.80, correctionDelta: +0.30 },
    { trustUpdater, clock: fixedClock },
  );
  expect(trustUpdater.update).toHaveBeenCalledWith(expect.objectContaining({ trust: 1.0 }));
});
```

### Ambiguity 3: where does currentTrust come from in production? (DEFERRED)

**Issue:** The test provides `currentTrust` as an option. In production, the caller must read the current trust before calling `applyFeedback`. This requires either:
- (a) Extending `FactStore` with a `read(factId)` method
- (b) A separate `FactReader` interface
- (c) Callers always have `currentTrust` in context (e.g., from a preceding `recall()`)

**Resolution chosen for RED:** Caller-provided `currentTrust`. M5 GREEN can resolve the read-seam question.

---

## Tests Written (M5 RED)

| Test | Event | currentTrust | Expected new trust | Clamped? |
|---|---|---|---|---|
| M5-C1 corroboration | `'corroboration'` | 0.60 | 0.70 | No |
| M5-C1 ceiling clamp | `'corroboration'` | 0.95 | 1.00 | Yes (min 1.0) |
| M5-C2 contradiction | `'contradiction'` | 0.50 | 0.40 | No |
| M5-C2 floor clamp   | `'contradiction'` | 0.05 | 0.00 | Yes (max 0.0) |

---

## What Edgar Implements (M5 GREEN)

1. Export `applyFeedback` from `packages/eureka/src/activities/recall.ts`
2. Export `TrustUpdater` interface from same file
3. Implement delta computation:
   - `'corroboration'`: `Math.min(1.0, currentTrust + 0.10)`
   - `'contradiction'`: `Math.max(0.0, currentTrust - 0.10)`
   - `'user_correction'`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))` (clamp both ends)
4. Call `deps.trustUpdater.update({ factId, sessionId, trust: newTrust })`
5. Confirm user_correction interface shape and write the deferred test (or hand back to Laura)
6. Verify: all 4 M5 RED tests pass; all 18 M1–M4 tests still pass

---

## Related

- Named M5 Target: decisions.md line ~276
- Team Norm TDD Ownership: decisions.md line ~295
- Contract: `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`
- §30 §2.1 domain invariants (trust ∈ [0.0, 1.0]; zombie-fact semantics at trust=0.0)
- Backlog: Crispin needs TrustUpdater contract test when real implementation ships

---

## edgar-m5-green
# Decision Drop: M5 GREEN — Trust Feedback Mutation Implementation

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M5 GREEN — `applyFeedback` + `TrustUpdater` landed in `recall.ts`  
**Status:** COMPLETE  

---

## What Landed

### Implementation

- **`TrustUpdater` interface** exported from `packages/eureka/src/activities/recall.ts`
  - Shape: `update(args: { factId: string; sessionId: SessionId; trust: number }): Promise<void>`
  - `trust` is the already-clamped new value — activity owns delta math, seam owns persistence

- **`applyFeedback` activity** exported from same file
  - Signature matches Laura's M5 RED spec exactly
  - Delta computation:
    - `corroboration`: `Math.min(1.0, currentTrust + 0.10)`
    - `contradiction`: `Math.max(0.0, currentTrust - 0.10)`
    - `user_correction`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))`
  - `clock` dep: REQUIRED, consistent with M1–M4 pattern (§55 §1.2). Not called yet — reserved for future feedback timestamping.

### Test Counts

| Suite | Tests | Status |
|---|---|---|
| `recall-feedback.test.ts` (M5) | 4 | ✅ GREEN |
| `recall.test.ts` (M1–M4) | 18 | ✅ still GREEN |
| **Total** | **22** | **✅ all pass** |

Build: `tsc` clean, exit 0.

---

## Decisions Made

### user_correction Interface (Ambiguity 2)

**Confirmed: Option (b) — caller-provided signed `correctionDelta`.**

Rationale:
- Avoids event-type proliferation (`user_correction_positive` / `user_correction_negative`)
- Caller has precise magnitude control
- Sign encodes direction cleanly — no inference needed
- Consistent with Laura's test design in the decision drop

### Read-Seam Question (Ambiguity 3) — DEFERRED

The question of where `currentTrust` comes from in production (FactStore read vs. FactReader vs. caller-has-it-from-recall) does **not affect this beat**. `applyFeedback` is a pure write activity; `currentTrust` is caller-provided. Deferring this keeps M5 focused.

**Disposition:** Deferred. Named as next RED target below.

### §30 §2.3 Spec Gap

Laura flagged that §30 §2.3 ("Trust Dynamics Beyond the Static Floor") was cited in decisions.md but did not exist in the doc. I wrote it directly (it was fully derivable from decisions.md Named M5 Target). No Cassima escalation needed — scope-appropriate for Edgar to close.

Section added to `docs/eureka/sections/30-learning-systems.md` between §2.2.1 and §2.4, covering:
- Event-delta table (corroboration / contradiction / user_correction)
- Domain invariant (trust ∈ [0.0, 1.0])
- Interface contract (applyFeedback, TrustUpdater, caller-provided currentTrust)
- User correction sign convention (Option b, signed delta)
- Measurable outcomes (the 4 M5 test fixtures documented as spec evidence)

---

## Named Next RED Targets

### M6-A: `user_correction` event test (deferred from M5)

**Beat:** user_correction delta with ceiling clamp  
**Owner:** Laura (RED)  
**Contract:** `applyFeedback` with `event: 'user_correction'`, `currentTrust: 0.80`, `correctionDelta: +0.30` → `trust: 1.0`  
**Also needed:** floor-clamp case (e.g., `currentTrust: 0.05`, `correctionDelta: -0.30` → `trust: 0.0`)  
**Note:** The activity implementation already handles `user_correction` correctly — these tests verify the shape is wired and clamped at both ends.

### M6-B: Read-seam (currentTrust source in production)

**Beat:** How does a caller obtain `currentTrust` before calling `applyFeedback`?  
**Owner:** Laura (RED) — after design decision  
**Decision needed first:** Option (a) extend FactStore.read(), (b) FactReader interface, or (c) callers always have it from recall()  
**Recommendation:** Option (c) first — callers that just ran recall() already have the trust value. Extend FactStore only when a non-recall pathway (e.g., scheduled trust decay) needs it.

---

## Backlog Items

- **Crispin:** Contract test for real `TrustUpdater` implementation when it ships (M5+ backlog, per Laura's RED decision drop)
- **Future:** Timestamp feedback application via `clock` dep in `applyFeedback` (dep slot reserved)
- **Future:** Per-call `trustFloor` override via `RecallOptions` (existing TODO in recall.ts, separate track)

---

## edgar-pr30-cycle2-runtime-tier-guard
# Decision: Runtime attentionTier Guard — Compile-time Union Strictness + Runtime Stderr-Warning Fallback

**Date:** 2026-05-29
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 2, Thread PRRT_kwDORy1V9M6F2hAP
**Status:** Resolved — implemented option (a)

---

## Context

`compositeScore()` in `recall.ts` looks up `ATTENTION_MULTIPLIERS[fact.attentionTier]`. The
lookup is keyed on the TypeScript union `'hot' | 'warm' | 'cold'`. TypeScript narrows
compile-time callers correctly, but `RecallResult` values are produced by `FactStore.search()`
whose runtime origin is SQLite. A row with an unrecognised tier string (legacy casing like
`'Hot'`, a future migration value, or a malformed row) causes the lookup to return `undefined`,
which propagates as `NaN` into the sort comparator — the same failure mode as the F1 negative-
tDays guard.

**Cycle 1 / F2 context:** F2 deliberately removed the `?? 1.00` silent fallback because Skeptic
correctly argued it hid typo drift at the TypeScript boundary. That decision was right for
compile-time callers. Copilot's Cycle 2 finding is that runtime data from SQLite bypasses TS
narrowing entirely — a separate concern.

---

## Decision

**Option (a) chosen:** Default unknown tiers to `1.0` multiplier at the `compositeScore()`
call site, with a `console.warn` to stderr.

**Option (b) deferred:** Validating the tier at the FactStore boundary is architecturally
correct (belt-and-suspenders) but requires a concrete FactStore implementation that does not yet
exist (Crispin's domain). Option (a) is self-contained and survives any future FactStore impl.

### Rationale

- Compile-time strictness (no `?? 1.00` on the type-safe path) and runtime defensiveness (warn
  + default on the SQLite-origin path) are complementary, not contradictory. They operate at
  different seams.
- `console.warn` (stderr) preserves MCP stdio compatibility — MCP transport uses stdout for
  JSON-RPC frames; stdout noise corrupts the protocol. All eureka activity diagnostics must use
  stderr.
- The 1.0 default is the warm-tier identity value — the most conservative safe default (no
  amplification, no suppression).

---

## Implementation

- `recall.ts` `compositeScore()`: `let multiplier = ATTENTION_MULTIPLIERS[fact.attentionTier];`
  followed by `if (multiplier === undefined) { console.warn(...); multiplier = 1.0; }`.
- `recall.test.ts`: two new regression tests in `describe('runtime attentionTier guard (F7)')`:
  1. `compositeScore` unit test with `'Hot' as any` — verifies finite score + warn emitted once.
  2. `recall()` integration test — verifies non-NaN ordering and warn fires once.
  Both use `vi.spyOn(console, 'warn')` restored in `afterEach`.

---

## Note for Crispin

When the concrete `FactStore` implementation lands, add boundary validation that rejects (or
normalises) unrecognised `attention_tier` values before they surface as `RecallResult`. The
option (a) guard in `compositeScore()` remains as defense-in-depth; option (b) adds belt-and-
suspenders at the seam where data crosses from SQLite into the activity layer.

---

## edgar-pr30-cloud-review-threads-2-3-4
# Decision Drop — PR #30 Copilot Cloud Review (Threads 2, 3, 4)

**Agent:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-29
**Branch:** eureka/v1-m1-m4
**Commit:** a28f1f3
**PR:** #30

---

## Decision 1 — Activity-layer types use camelCase (Thread 3)

**Context:** `RecallResult` had mixed naming: `attentionTier` and `lastAccessed` were
originally spelled `attention_tier` and `last_accessed` (snake_case), mirroring DB column
names. However, `RecallResult` is the activity-layer return type — not a row mapper — and
the rest of the workspace consistently uses camelCase for TypeScript types.

**Decision:** Activity-layer types use camelCase. The FactStore storage seam is responsible
for snake↔camel mapping at the data boundary (one mapping point, not spread across activity
code and tests).

**Norm established:** `RecallResult.attentionTier` and `RecallResult.lastAccessed` are the
canonical field names. Any concrete FactStore implementation (Crispin's concern) must map
from DB column names to this camelCase shape before returning results to the activity layer.

**Files changed:** `recall.ts`, `recall.test.ts`

---

## Decision 2 — Ranker BM25-truncation constraint documented, overfetch deferred (Thread 2)

**Context:** `recallWithScores` passes `limit: k` to `factStore.search()`, so a custom
`Ranker` only receives at most `k` BM25-pre-ranked candidates. It cannot surface facts the
storage layer ranked at positions k+1..k+m. This is a real constraint for non-trivial rankers
(recency-weighted, attention-tier-aware, etc.).

**Decision:** Document the constraint on the `Ranker` JSDoc rather than implementing
overfetch. No production `Ranker` consumer exists yet; overfetching now would be speculative.
If a future `Ranker` needs broader candidate visibility, the fix is `limit: k * overfetchFactor`
in `recallWithScores` when a ranker is injected. Tracked as future work in the JSDoc.

---

## Decision 3 — Remove fragile §50 line-number citation from source (Thread 4)

**Context:** The `ATTENTION_MULTIPLIERS` JSDoc contained: *"§50 line 211 contains incorrect
values — §30 §1.2 is the authoritative source."* Embedding external document line-number
claims in production source is fragile: the document will be edited, the line number will
shift, and the comment becomes misleading.

**Decision:** Trim to cite only the authoritative source: *"Authoritative source: §30 §1.2."*
The §50 inconsistency is tracked in decisions.md from Cycle 1 (the tension Laura flagged at
M3). It does not need to be re-litigated in production source code.

**Anti-pattern named:** Fragile-doc-cite — embedding external document line-number assertions
in source comments.

---

## edgar-pr30-cycle3-c1-c4
# Decision Drop: PR #30 Cycle 3 — C1 Warn Dedupe + C2 Ranker Order Trust + C3 Overfetch + C4 k Validation

**Date:** 2026-05-30
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 3
**Threads:** PRRT_kwDORy1V9M6F2kGT (C1), PRRT_kwDORy1V9M6F2kGW (C2), PRRT_kwDORy1V9M6F2kGY (C3), PRRT_kwDORy1V9M6F2kGa (C4)
**Status:** Resolved — all four implemented in a single commit on eureka/v1-m1-m4

---

## C1 — Warn Dedupe via Per-Call Set

### Problem
`compositeScore` emitted one `console.warn` per fact with an unrecognised `attentionTier`. A recall
call returning k=10 facts with a legacy tier string produced 10 identical log lines per query. This
is noise amplification — a single bad row's tier multiplies into k lines per call.

### Decision
Move warn emission out of `compositeScore` entirely. `compositeScore` now silently defaults unknown
tiers to `1.0` (warm-tier identity) via `?? 1.0`. `recallWithScores` collects unknown tier strings
into a `Set<string>` during its pre-scoring iteration over `trusted` candidates, then emits ONE
`console.warn` at the end of the call if the set is non-empty. Message format:

> `[eureka.recall] Unknown attention_tier values encountered: Hot. Defaulted to 1.0 multiplier. Validate at FactStore boundary.`

The Set naturally deduplicates repeated instances of the same bad tier across multiple facts.

### Rationale
- Diagnostic emission belongs at the call boundary, not in a per-item pure function.
- `compositeScore` is now a pure function (no side effects) — easier to test, no spy required.
- The warn still fires even on the ranker path (Set is populated before the ranker/inline fork).

### Test impact
- `compositeScore` F7 test: removed `warnSpy` setup and warn assertions (function is now pure).
- `recall()` F7 test: spy still verifies `toHaveBeenCalledOnce()` + message contains tier value.

---

## C2 — Ranker Order Trust (no re-sort after ranker)

### Problem
`recallWithScores` always re-sorted the result of `ranker(trusted, { nowMs })` by score descending.
This silently defeated any deliberate non-score-monotonic ordering a Ranker might express (diversity
reranking, MMR, explicit position weighting). The JSDoc contradicted itself on this point.

### Decision
**Option (b) chosen**: when a Ranker is injected, trust its returned order — do NOT re-sort.
Only the inline path (no ranker) sorts. Code shape:

```typescript
const scored = ranker
  ? ranker(trusted, { nowMs })                                        // trust ranker's order
  : trusted.map(f => ({ fact: f, score: compositeScore(f, nowMs) }))
           .sort((a, b) => b.score - a.score);
```

The Ranker JSDoc was rewritten to be unambiguous: the Ranker owns final ordering; if it wants
score-monotonic output, it sorts internally. `recallWithScores` only slices to k.

### Rationale
- Option (a) (document-only) was rejected: the contradiction in the JSDoc was a bug waiting to
  happen in any real diversity ranker.
- Option (b) is a one-line structural change with a clear contract: Ranker = final authority on order.
- The C6 guard test was updated: the no-op ranker now sorts internally, remaining a valid equivalence
  test between the ranker and inline paths.

### Test impact
- C6 no-op ranker: updated `noOpRanker` to include `.sort((a, b) => b.score - a.score)`.
- New C2 regression test: reverse-order Ranker; verify recall() preserves ascending order (not re-sorted).

---

## C3 — Overfetch Factor (F6 Arc Closed)

### Problem
`recallWithScores` called `FactStore.search({ limit: k })`. The composite ranker (or any custom
Ranker) could only reorder within the BM25-truncated top-k. Tier and trust components of FR-2 were
largely cosmetic relative to BM25 — the ranker had no visibility beyond the k facts BM25 surfaced.

This was the open residual from the F6 escalation: Cassima+Crispin chose to push trust filtering to
the store (F6 resolution); the BM25-truncation aspect (ranker candidate starvation) remained open.

### Decision
Add `const RANKER_OVERFETCH_FACTOR = 3` and change the search call to `limit: k * RANKER_OVERFETCH_FACTOR`.
The final `scored.slice(0, k)` still trims to k — overfetch is internal-only; the caller contract is
unchanged.

**Why 3?** Small constant. Conservative: 3× gives the ranker meaningful surface without excessive
storage load. Can be revisited when concrete FactStore performance data is available. Named const makes
the intent clear and makes future tuning a one-line change.

### Rationale
This closes the F6 arc entirely:
- F6 (Cassima/Crispin): trust floor at data layer → resolved in Cycle 2
- F6 residual (ranker candidate starvation): `limit: k` → resolved here with `limit: k * 3`

### Test impact
- F6 regression test (Laura's): `limit: 5` updated to `limit: 15` (k=5 × RANKER_OVERFETCH_FACTOR=3).
- New C3 test: verifies `factStore.search` receives `limit: 15` when k=5.

---

## C4 — k Input Validation

### Problem
`RecallOptions.k` had no validation. Negative, zero, fractional, NaN, or Infinity values were passed
directly to `factStore.search({ limit: k })` and `slice(0, k)`. The SQLite `LIMIT` behavior for
these values is implementation-defined; JavaScript's `Array.prototype.slice(0, NaN)` returns `[]`
silently, hiding the bug.

### Decision
Validate at the entry point of `recallWithScores` before any I/O:

- `k === 0`: valid — return `[]` immediately without calling factStore. Avoids `LIMIT 0` edge cases.
- `!Number.isFinite(k)`: throws `TypeError` (handles NaN, +Infinity, -Infinity).
- `!Number.isInteger(k)`: throws `TypeError` (handles 1.5, etc.).
- `k < 0`: throws `TypeError`.

Since `recall()` is a thin wrapper delegating to `recallWithScores`, validation in `recallWithScores`
suffices for both entry points.

### Rationale
- Fail-fast at the boundary: the error appears at the call site, not buried in SQLite or a silent
  empty result.
- `k === 0 → []` is the right semantic: "give me zero results" is a valid (if unusual) request.
- `k < 0` and non-integers are programming errors; TypeError is the appropriate JS error type.

### Test impact
Five new tests in `describe('k input validation (C4)')`:
- `k = 0` → `[]`, factStore.search NOT called.
- `k = -1` → TypeError.
- `k = 1.5` → TypeError.
- `k = NaN` → TypeError.
- `k = Infinity` → TypeError.

---

## Summary

| Finding | Change | Behaviour preserved |
|---------|--------|---------------------|
| C1 | `compositeScore` pure; `recallWithScores` emits ONE Set-deduped warn | 1.0 fallback for unknown tiers unchanged |
| C2 | Ranker path skips re-sort; Ranker owns final order | Inline path still sorts descending |
| C3 | `limit: k * 3` overfetch; caller still gets k results | trust floor (`minTrust: 0.15`) unchanged |
| C4 | k validated at entry; `k=0 → []`; invalid → TypeError | Valid positive-integer k unchanged |

**Test count:** 11 → 18 (7 new regression tests added across C2, C3, C4; F7 compositeScore test simplified).
**Commit:** bde6416 on eureka/v1-m1-m4

---

## roger-issue-11-implementation
# WI-A Implementation Log — Issue #11: Worktree-aware sessions

**Author:** Roger (Platform Dev)  
**Branch:** `squad/11-worktree-aware-sessions`  
**Worktree:** `D:\git\stunning-adventure-11`  
**Status:** Cloud review cycle 5 applied — ready for push

---

## Cloud Review Cycle 1 Fixes (commits 8537f48, 13080af)

### F1 — `get_session` error message clarity (commit 8537f48)

Old message: `'Provide either session_id or repo_key (with optional workdir).'`
was misleading because `workdir` is required (not optional) when using `repo_key`.

Changed to: `'Provide either session_id, or both repo_key and workdir.'`

`workdir` inputSchema description was already correct from cycle 2:
`'Required when using repo_key. Optional when using session_id.'`

Updated `worktreeMcp.test.ts` assertion to match the new message.

### F2 — Rejected (no change)

Reviewer suggested collapsing the `repo_key`-without-`workdir` branch into the
no-input branch. Decision: keep the two branches separate — they represent
distinct caller mistakes (no input vs. partial input) and deserve distinct,
actionable error messages.

### F3 — Atomic `startSession` + UNIQUE partial index (commit 13080af)

**F3a — Immediate transaction in `archivist.startSession()`:**

The find-or-create sequence (`getActiveSession → claimLegacyActiveSession →
createSession`) is now wrapped in `db.transaction(fn).immediate()`. Using
`IMMEDIATE` acquires the write lock at transaction start, preventing two
concurrent callers from both observing "no active session" and both INSERTing
a new row.

Note: `fn.immediate()` calls the function and returns its result directly.
A draft with `fn.immediate()()` would have tried to call the return value
as a function — corrected before committing.

**F3b — Migration 016: dedup + UNIQUE partial index:**

New migration `016-active-session-unique.ts`:

1. **Dedup pass**: For each `(repo_key, workdir)` group with >1 active user
   session, keep the most-recently started row, complete the rest. Runs
   before index creation to avoid constraint violation on pre-existing data.

2. **UNIQUE partial index**:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir
     ON sessions (repo_key, workdir)
     WHERE status = 'active' AND session_kind = 'user';
   ```
   Partial index covers only active user sessions; completed/system sessions
   are unaffected.

Schema version bumped to 16. Version assertions in `db.test.ts`,
`migration012.test.ts`, `prescriptions.test.ts`, and `discovery.test.ts`
updated 15 → 16. `migration015.test.ts` assertions changed to check
`WHERE version = 15` (presence) rather than `MAX(version)` so they remain
stable as more migrations are added.

---

## Cloud Review Cycle 2 Fix (commit cd47409)

### G1 — `normalizeWorkdir` applies transforms to untrimmed input

`normalizeWorkdir` checked `input.trim()` for emptiness but then passed the
original (untrimmed) `input` to all subsequent transforms. A path like `' /'`
would slip past the empty guard and produce `' '` (a whitespace-only string)
instead of `'/'`.

Fix: assign `const trimmed = input.trim()` first, return `undefined` if it is
empty, then base all path transforms on `trimmed`.

Regression tests added:
- `normalizeWorkdir(' /')` → `'/'`
- `normalizeWorkdir('  D:/proj  ')` → `'D:/proj'`
- `normalizeWorkdir('\t')` → `undefined`

---

## Cloud Review Cycle 3 Fixes (commit e4002c1)

### H1 — Migration 016 UNIQUE index doesn't cover NULL-workdir case

SQLite UNIQUE indexes treat each NULL as distinct — a single index on
`(repo_key, workdir)` allows multiple rows with `workdir = NULL` to coexist
for the same `repo_key`. The original migration 016 index was therefore
ineffective at preventing duplicate active NULL-workdir sessions.

Fix: Replace the single index with two separate partial indexes:

```sql
-- Non-NULL workdir: unique per (repo_key, workdir) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_nonnull
  ON sessions (repo_key, workdir)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NOT NULL;

-- NULL workdir: at most one legacy active session per repo_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_null
  ON sessions (repo_key)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NULL;
```

The dedup pass (`GROUP BY repo_key, workdir`) was already correct — SQLite
groups NULLs together in `GROUP BY`, so no change was needed there.

Test changes:
- Removed two `claimLegacyActiveSession` orphan-cleanup tests that relied
  on inserting duplicate NULL-workdir sessions (now DB-prevented; the scenario
  they tested is handled at migration time by the dedup pass)
- Added "UNIQUE index rejects duplicate active NULL-workdir sessions" test
- Added Area 10b: migration 016 dedup test using a synthetic pre-016 DB to
  verify the NULL-workdir dedup pass correctly keeps the most-recent row

### H2 — `@internal` helpers exported from `index.ts`

`claimLegacyActiveSession` was exported from `packages/cairn/src/index.ts`
(line 52) despite being tagged `@internal`. It is an implementation detail of
the session start hook and must not be part of the public package API.

Fix: Removed `claimLegacyActiveSession` from the `sessions.js` export block
in `index.ts`.

Audit of other `@internal` symbols: `normalizeWorkdir` and
`getSkillToolWorkdir` (both in `utils/workdir.ts`) were not exported from
`index.ts` — no change needed.

Tests use deep imports (`from '../db/sessions.js'`) throughout — no test
changes required for H2.

---

## Summary

Makes Cairn's session resolution workdir-aware so concurrent worktrees on the
same repo don't collide on a single active session.

Core mechanism: `(repo_key, workdir)` session identity pair stored in a new
`workdir TEXT` column (migration 015). NULL workdir = legacy/pre-worktree
sessions. `getActiveSession(db, repoKey, workdir?)` uses `AND workdir IS ?`
(NULL-IS semantics) so NULL is a first-class identity value.

---

## Cycle 3 Skeptic Fixes (commit 19deef2)

### Item 1a — `getSkillToolWorkdir()` helper

`normalizeWorkdir(process.env.CAIRN_WORKDIR)` was inlined at all three
skill-tool call sites in `server.ts`. Centralised into `getSkillToolWorkdir()`
in `utils/workdir.ts` — env-var name and normalisation live in one place.

### Item 1b — Multi-session ambiguity warning

`getUserSessionForMcpFallback` gained an optional `source: 'env-var' | 'explicit'`
parameter. When `source === 'env-var'` and `workdir` is absent but the repo has
multiple active sessions, a `process.stderr.write` warning is emitted. All
three skill-tool call sites pass `'env-var'`.

### Item 2 — Safe orphan cleanup with 5-minute grace window

The old Step 3 in `claimLegacyActiveSession` used a single bulk `UPDATE` to
complete all other NULL-workdir orphans. Replaced with a per-session loop:

1. Fetch orphan candidates (SELECT with id != winner).
2. For each: `getLastEventTime` (falls back to `started_at`).
3. If idle < 5 min → skip + `process.stderr.write` warning.
4. If idle ≥ 5 min → `UPDATE status = 'completed'`.

SQLite timestamps (`YYYY-MM-DD HH:MM:SS` UTC) are converted to ISO-8601 with
`'Z'` suffix before `new Date()` parsing to avoid host-timezone errors.

Test updated: orphan timestamp changed from `-2 seconds` to `-10 minutes`.
New test added: orphan within grace window is preserved.

---

## Key Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| `getActiveSession` no-arg → NULL-only | `AND workdir IS NULL` | Matches only sessions without a workdir; not "most recent regardless" |
| Orphan grace window | 5 minutes | Conservative enough to protect live concurrent archivist startups |
| UTC parsing of SQLite timestamps | `.replace(' ', 'T') + 'Z'` | SQLite `datetime()` is always UTC; JS `new Date()` needs explicit Z |
| Skill-tool env-var source tag | `'env-var'` literal | Lets sessionFallback distinguish orchestrator-injected vs caller-supplied workdirs |

| `fn.immediate()` call pattern | Call without extra `()` | `db.transaction(fn).immediate()` calls fn and returns its result; `().()` would try to call the return value |

---

## Test Coverage

- 1405/1405 tests green (60 test files)
- New Area 10 tests: race regression (two startSession calls → one session),
  UNIQUE constraint enforcement, completed-session allows new active session

---

## Cloud Review Cycle 5 Fixes (commit 469b741)

### J1 — Remove unused `randomUUID` import

`worktreeSessions.test.ts` had `import { randomUUID } from 'node:crypto'` left
over from orphan-cleanup tests removed in cycle-3 H1. Dropped the import;
ESLint `no-unused-vars` now clean.

### J2 — Tighten `claimLegacyActiveSession` CAS UPDATE predicate

The outer `UPDATE` in the CAS step only guarded `AND workdir IS NULL`, leaving
a theoretical race where a session that changed status or kind between the
SELECT and the UPDATE would still have its workdir overwritten.

Added `AND status = 'active' AND session_kind = 'user'` to the outer UPDATE so
the CAS is self-contained: the guard predicates match exactly the conditions
used to select the candidate.

Regression test added in Area 7: creates a NULL-workdir session, completes it
between selection and claim, asserts claim returns `undefined` and the row's
`status` remains `'completed'` with `workdir` still NULL.

**Status:** Cloud review cycle 5 applied — ready for push


When `workdir !== undefined` is passed but `normalizeWorkdir(workdir)` returns
`undefined` (e.g. `'   '` or `'\t'`), the old code silently fell through to
`listActiveSessionsForRepo`, returning the all-sessions list — wrong shape
and wrong semantics.

Fix: after normalization, if `nwd === undefined` return `isError` with message:
`'Invalid workdir: empty or whitespace-only string. Omit workdir to list all sessions, or provide a non-empty path.'`

Added Area 5f regression test in `worktreeMcp.test.ts` asserting the guard
and message text are present in the `get_status` handler body.

### I2 — Over-indented error payload in `get_session`

In the `!repo_key` early-return block, the `error:` line inside
`JSON.stringify({ error: '...' })` had extra indentation vs sibling blocks.
Cosmetic fix only.

### I3 — `getActiveSession` JSDoc missing user-sessions-only note

Added `@remarks` tag to the JSDoc: "Returns ONLY user sessions
(`session_kind = 'user'`). System sessions are excluded. For system-session
lookup, use a dedicated helper."

---

---

## WI-B Decisions Merge (2026-05-30T12:26:16Z)


