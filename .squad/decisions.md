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
