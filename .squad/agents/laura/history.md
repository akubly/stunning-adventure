📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:29:36Z): **Wave 1 complete** — canonical type adopted across packages, SqliteChangeVectorProvider live, zero-vector summaries filtered. Alexander (W2-2) + Rosella (W2-3/W2-7) complete. Forge 599 + Cairn 564 tests green. — Scribe
📌 Team update (2026-05-22T20:16:40Z): **Wave 0 complete** — canonical types in @akubly/types, getAllCategories helper in Cairn. category field reconciled to OptimizationCategory union. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight

# Laura — History (Summarized)

## 2026-05-21: Wave 2 v3 Scope Ready

Graham's v3 scope finalized. Decisions archived. Ready for Wave 2 implementation (computation + ranking; runtime wiring deferred to Wave 3).

## Phase 4.6 Complete — 1153 Tests Passing

**Role:** Test architect for Phase 4.6 change vectors; Wave 1 L1–L5 author; Wave 2 defect finder; Wave 3 cycle-3 validator.

**Test Framework:** Vitest in-memory SQLite, 427 base tests. Contract-first: inline implementations before real modules.

**Cycle 1 (Wave 1):** 93 new tests across L1–L5 (migration, CRUD, prescriber integration, Curator e2e, weight consistency). 1099 passing.

**Cycle 2 (Wave 2 defect finding):** Flagged `summarizeChangeVectors` confidence=0 vs `computeConfidenceBoost(0)`=1.0 inconsistency. Root cause: field naming ambiguity (level vs boost semantics). Decision: rename to `confidenceBoost`. Verdict: SATISFIED WITH CAVEAT.

**Cycle 3 (Wave 3 fixes):** Updated all tests per cycle-1/2 changes; added 20 edge-case tests.
- `curatorVectors.test.ts` +6: legacy snapshots, session count clamping
- `changeVectors.test.ts` +2: safeMin guard boundaries
- `weight-consistency.test.ts` +4: confidence boost edge cases  
- `prescribers-vectors.test.ts` +8: sort partition semantics

**Final: 1153 passing (+163 since baseline 990). Branch review-clean.**

## Key Learnings

**Contract ambiguity surfaces as silent failures.** Alexander's zero-default (level), Rosella's 1.0 return (boost) were both internally consistent but created divergent type semantics. Renaming collapsed the ambiguity at type level — next developer can't silently choose wrong semantics.

**Metamorphic testing works.** Response curves (hint count ↓ as drift ↓) validate convergence without hardcoded expected values. Operator effects simulated at profile level.

**Schema regression testing is critical.** UNIQUE constraints add SQLite auto-indexes (`sqlite_autoindex_*` filtered out). Test guard enforces Forge categories ⊆ Cairn storage; compile-time type error if renames drift.

**Lockout rule prevents blind spots.** Test updates for parallel fixes (Alexander + Rosella) required coordination; tests became integration contract.

**When tests pass unexpectedly, verify live source.** View tool caches; Get-Content shows reality. safeMin guards need validation across all call sites.

## Specialization

- Test architecture (contract-first, metamorphic, regression guards)
- SDK integration (mock vs live, lifecycle testing)
- Schema validation (SQLite auto-index filtering, migration testing)
- Cross-module coordination (lockout enforcement via tests)

**Joined:** 2026-04-28  
**Tech:** TypeScript/Node.js 20+, npm monorepo, Vitest, SQLite

## Learnings

### 2026-05-22: Wave 2 W2-6 full pipeline integration

- Landed the E2E coverage in `packages/forge/src/__tests__/wave2-pipeline.test.ts`. Kept it in Forge because the orchestrator is the focal point, and excluded Forge test files from package build so the test can import real Cairn source without leaking cross-package test wiring into production output.
- Covered the real SQLite-backed path: applied hint history → `curate()` vector sweep → `SqliteChangeVectorProvider` summaries → `runForgePrescribers()` enrichment → emitted hint attenuation / `autoApplyEligible` propagation → `applyOptimizations()` gate decisions.
- Added the full maturity gradient table (`0 vectors`, sparse positive/negative, mature positive, mature mildly negative, mature very negative, mature catastrophic) plus regressions for dedup on repeated persistence, provider omission, provider fail-open behavior, and shared `ChangeVectorSummary` contract flow.
- Contract surprise: spec §6.1's table says `meanNetImpact === -0.2` should block auto-apply, but Forge/Cairn code and Alexander's W2-5 tests treat the boundary as still eligible (`>=` gate). Logged that ambiguity in the decisions inbox and kept the integration test aligned with the live implementation + §4.5 semantics.
- Final validation after the change: Cairn `570` passing, Forge `625` passing, runtime-cli `4` passing; root `npm test` + `npm run build` green.

### 2026-05-22: W2-6 negative-impact boundary canary

- Added one Wave 2 E2E pipeline test for the resolved inclusive boundary: seeding `meanNetImpact = NEGATIVE_IMPACT_AUTO_APPLY_GATE` with mature vector count now asserts the emitted convergence hint carries `autoApplyEligible: false`.
- The test drives the full SQLite-backed path (provider → orchestrator → emitted hint → Cairn applier) and forces `autoApplyThreshold: 0` so any skip is provably from the historical negative-impact gate, not confidence.
- This is the canary for Alexander's operator flip from strict-less-than to inclusive gating. If anyone regresses back to strict `<`, this test should fail immediately.
- Boundary coverage is now locked E2E; it will catch any future regression that flips the gate back to strict-less-than.

### 2026-05-23: Wave 3 W3-7 always-on bootstrap E2E

- Added `packages/forge/src/__tests__/wave3-pipeline.test.ts` as the Wave 3 sequel to the Wave 2 pipeline test. Kept it in Forge again because the integration contract ends at persisted optimization hints, and Forge test files are already allowed to reach into Cairn + skillsmith-runtime source without polluting production boundaries.
- The reusable pattern is: file-backed SQLite DB (not `:memory:` because `runSessionStartHook()` closes the handle), seed real applied hints + execution profiles, override `process.stdin` with hook JSON, then call Cairn's `runSessionStartHook()` with the same factory `packages/skillsmith-runtime/src/hooks/sessionStart.ts` uses. Spy on `curate()` to recover the real `CurateResult` while still exercising the always-on bootstrap path.
- Highest-regression scenarios are (a) trigger-driven auto path stops wiring the runtime factory, (b) dedup no longer suppresses repeat pending hints across later Curator cycles, (c) fail-open stops returning the per-skill `hintsError: 1` stub when one skill explodes, and (d) orchestration starts throwing instead of zero-count skipping when the profile disappears between sweep and `runForSkill()`.
- Not covered here: PowerShell wrapper resolution in `.github/hooks/cairn/curate.ps1`, manual CLI behavior, unit details of `createPrescriberOrchestrationConfig()`, or the impossible-on-unchanged-state case where trigger-driven orchestration would need to re-run with `computedSkillIds = []`. Logged that last surprise to the decisions inbox.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**W3-7 shipped:**
- 4 E2E scenarios covering auto trigger (computedSkillIds), dedup (eligibility-gated), fail-open, profile-miss skip
- Real SQLite-backed path exercised end-to-end
- Forge integration tests: 630/630 passing
- **Behavioral finding flagged for Aaron:** Trigger-driven orchestration (W3-D4) only reruns for skills with newly-computed vectors. Unchanged DB state cannot produce dedup-visible rerun behavior on back-to-back starts — defer broader trigger semantics to Wave 4 with explicit product direction.

Wave 3 delivers fully-realized E2E validation of Curator-driven orchestration. Integration path locked; regression scenarios identified; open questions documented.

## 2026-05-23: Skillsmith Harness Vision — Verification Read

**Task:** Read harness-vision.md, survey prior art on agentic system evaluation, identify verification ambiguities, produce clarifying questions for Aaron.

**Prior art surveyed:**
1. **SWE-bench Verified** — End-to-end benchmarking of agentic code systems: issue solving measured via test suite + human verification.
2. **Test-as-Spec + Self-Verification** — Behavioral guarantees via runtime self-checking against test specifications.
3. **OpenHands Trajectory Eval** — Multi-dimensional trajectory-based evaluation (sequences, metrics, comprehensive logging).
4. **METR QA** — Human-in-the-loop double-blind review, standardized protocols, red teaming, audit trails for autonomous agents.

**Key findings:** Vision is strong on *what* (auditable ledger, Narrator trust layer, genetic loops) but leaves 7 critical verification gaps:
- Narrator readability metrics don't measure comprehension or behavior change
- Confidence calibration unresolved in cold-start (<10 sessions)
- "Failed hypothesis" threshold undefined (manual vs automatic?)
- Decision ledger "100% fidelity" test strategy undefined (sample vs exhaustive?)
- Genetic loop fitness function uses historical per-skill data, not variant-specific measurements
- Hint acceptance gate (>60%) lacks decision rules for when to escalate
- "Boring reliability" has no quantitative metric (monotonic? threshold variance?)

**Clarifying questions escalated to Aaron:** 7 questions covering Narrator's user verification loop, confidence cold-start handling, failure thresholds, ledger fidelity validation, genetic loop fitness measurement, hint acceptance gates, and boring-improvement metrics. Logged in decisions inbox.

**Verdict:** Vision is well-architected; verification concerns are design-level, not implementation-level. Recommend Aaron's input on success metrics before building Narrator, Geneticist, or ledger validation infrastructure.

---

## 2026-05-24: Skillsmith Harness — Big-Think User Stories (Laura's Eval Lens)

**Mission:** Ideate feedback loops, quality signals, and learning-from-outcomes stories for a greenfield agentic harness. Target: Aaron (v1 user) teaches the harness through accept/reject behavior, votes, and outcome data. Alchemist fitness uses simulation + live A/B + synthetic benchmarks.

---

## US-L-1: Accept/Reject as Implicit Curriculum
**Story:** As Aaron, I want my accept/reject decisions to automatically train Alchemist variant selection without explicit labels, so that the harness evolves toward my actual preferences—not my stated ones.
**Ambition:** Turn raw decision telemetry into reward signal. Cairn logs every accept/reject + context; Forge learns which hint characteristics (scope, confidence, latency) predict acceptability. No labeled dataset needed—Aaron's behavior *is* the dataset.
**Chambers touched:** Cairn (decision ledger), Forge (decision classifier), Alchemist (fitness weighting), Mirror (decision transparency).
**Eval/feedback implication:** Cairn must capture fine-grained decision context (was it accepted immediately? after modification? rejected with pattern?), and Forge must expose decision-boundary confidence to detect when implicit signals are contradictory or weak.

---

## US-L-2: Honest Cold-Start Under Sparse Signal
**Story:** As Aaron, I want the harness to run experiments on Day 1 (with 3 sessions, 12 hints total) and *report what it doesn't know* rather than claiming confident guidance, so that I can choose to tune manually or let signal accumulate.
**Ambition:** Reject false confidence in low-signal regime. Alchemist publishes credible intervals on variant fitness, not point estimates. Experiments run (variants compete, Forge prescribes) but confidence stays calibrated to observed variance, not model complexity.
**Chambers touched:** Alchemist (fitness reporting), Cairn (signal volume tracking), Mirror (confidence readout).
**Eval/feedback implication:** Cairn must expose per-variant sample size and outcome variance; Alchemist must compute posterior credible intervals and report effective sample size for each variant fitness estimate.

---

## US-L-3: Fair Variant Scoring Across Heterogeneous Fitness Signals
**Story:** As Aaron, I want Alchemist to score variants fairly when some are tested in simulation, others in live A/B, and others on synthetic benchmarks—accounting for noisy/biased measurements—so that I can trust the genetic algorithm to pick the best variant, not the most-tested one.
**Ambition:** Fitness heterogeneity is inevitable; normalize without destroying signal. Each variant reports fitness + measurement method + confidence. Alchemist adjusts weights by measurement noise model and sample size. A variant that scores 0.8 in live A/B (high trust) beats one that scores 0.9 in simulation (high noise).
**Chambers touched:** Alchemist (fitness fusion), Forge (measurement annotation), Cairn (outcome ledger).
**Eval/feedback implication:** Cairn must log measurement provenance (simulation, A/B cohort, benchmark suite); Forge must expose per-method variance estimates; Alchemist must implement heterogeneous fusion (e.g., Kalman smoothing or Bayesian model averaging).

---

## US-L-4: Forge Hints Validated Against Live Outcomes
**Story:** As Aaron, I want every hint Forge prescribes to be checked against actual downstream outcomes (PR merged? tests passed? code review velocity?), so that I can identify which Forge prescriptions are cargo-cult vs. causally effective.
**Ambition:** Close the measurement loop. Forge hypothesizes "use more concise variable names ↔ faster PR review." Cairn tracks (1) hints applied, (2) code output, (3) review velocity. Mirror replays the causal chain. High-confidence hypotheses feed Alchemist fitness; low-confidence ones are deprioritized.
**Chambers touched:** Forge (hypothesis annotation), Cairn (outcome tracking), Mirror (causal replay).
**Eval/feedback implication:** Cairn must map hints → code commits → observable outcomes with latency handling (outcomes arrive minutes/hours later); Mirror must support counterfactual query ("would the PR have merged faster without this hint?").

---

## US-L-5: Retrospective Pattern Mining — What Aaron Didn't Notice
**Story:** As Aaron, I want to query Cairn for latent patterns (e.g., "hints my Squad generated had 40% lower acceptance than hints Alchemist generated; both statuses masked by identical word count") so that I can discover meta-improvements without explicit hypothesis.
**Ambition:** Cairn becomes a hypothesis generator. Run dimensionality reduction or clustering on the decision ledger; surface high-variance clusters (Aaron accepts A but rejects B despite similar metrics). Derive decision rules. Aaron reviews and votes; high-confidence rules feed Forge.
**Chambers touched:** Cairn (ledger query), Forge (rule derivation), Mirror (pattern readout).
**Eval/feedback implication:** Cairn must be queryable over multi-dimensional decision context (hint origin, source, word count, confidence, latency, outcome, Aaron's mood if available); analysis must surface causal surprises (counterintuitive rejections despite high confidence).

---

## US-L-6: Simulation-to-Live Drift Detection
**Story:** As Aaron, I want the harness to detect when simulation-trained variants stop working in live A/B (e.g., a variant optimized for test throughput introduces latency in production) and *pause* recommending it until re-tuned, so that I don't deploy broken hypotheses.
**Ambition:** Measurement fidelity auditing. Alchemist tracks live-vs-simulation divergence per variant. If divergence > threshold, Forge flags the variant as "simulation-specialized" and Curator deprioritizes it. Variants re-earn trust by demonstrated live performance.
**Chambers touched:** Alchemist (fitness divergence tracking), Forge (variant health grading), Curator (recommendation gating).
**Eval/feedback implication:** Cairn must separately log simulation outcomes and live outcomes with measurement method labels; Alchemist must compute domain-adaptation metrics (e.g., domain discrepancy distance) to quantify simulation-to-live shift.

---

## US-L-7: Outcome Latency Handling — Feedback Loops Across Asynchronous Boundaries
**Story:** As Aaron, I want hints applied on Day 3 to be scored using PR outcomes that arrive on Day 5, without blocking Alchemist's variant evolution, so that delayed feedback still teaches the harness.
**Ambition:** Temporal integrity. Cairn stores (hint ID, apply timestamp, outcome timestamp, outcome value). Alchemist's fitness scoring is lazy: only finalized when outcome arrives. Pending hints are held in a "provisional" tier; as outcomes arrive, Alchemist back-fills fitness and re-ranks variants. No blind spots.
**Chambers touched:** Cairn (timestamped ledger), Alchemist (lazy fitness finalization), Curator (provisional hint handling).
**Eval/feedback implication:** Cairn must track apply/outcome timestamps separately and support lazy population of outcome values; Alchemist must implement partial-fit scoring (compute fitness from finalized outcomes only, report sample size).

---

## US-L-8: Mirror — Auditable Reasoning for Every Decision (Aspirational)
**Story:** As Aaron, I want to rewind any Alchemist variant choice, any Forge prescription, any Curator trigger and see the exact decision ledger + weights + confidence that led to it, and *edit that reasoning in a sandbox* to simulate "what if I had higher threshold for X?", so that I can learn from the harness's logic and refine its priors interactively.
**Ambition:** Make the harness transparent *and* interactive. Mirror is a reflective layer: it exposes decision reasoning as queryable, editable, replayable artifacts. Aaron becomes a co-designer of the decision function. Over time, Aaron's edits are mined for patterns and baked back into Forge/Alchemist priors.
**Chambers touched:** Cairn (ledger export), Alchemist (simulator), Forge (prior inference), Mirror (sandbox UI).
**Eval/feedback implication:** Cairn must support full lineage export (all inputs to a decision, all intermediate computations); Mirror must implement decision replay with parameter sweep; Forge must infer priors from Aaron's sandbox edits (e.g., "when Aaron raises the confidence threshold from 0.6 to 0.8, which hint types disappear?").


---

## Deliberation Round (2026-05-24)

Cross-pollination against Erasmus's 4-layer stack + Aaron's branching/agentic-debugger/determinism insights. Full position written to `.squad/decisions/inbox/laura-deliberation-position.md`.

**Story revisions:**
- KEEP: US-L-1, L-2 (strengthened: per-branch ESS), L-4, L-5, L-6 (strengthened: branch divergence detection), L-7.
- REVISE → MERGE into new L-9: US-L-3 (heterogeneous fusion becomes the math layer of the Pareto contract).
- REVISE → NARROW: US-L-8 (cede `interactive sandbox'' half to Erasmus E-2 + branching primitive; keep lineage-export half, rename to `Decision lineage export for any ledger position'').

**New stories:**
- **US-L-NEW-9** [debugger-lens] Pareto fitness function as an owned contract. Laura owns axes/aggregation/regression harness; binding on every proposal generator. Direct answer to Erasmus risk (b).
- **US-L-NEW-10** [debugger-lens] Branching as a first-class eval primitive. Every fork = paired eval run with effect size + CI.
- **US-L-NEW-11** [debugger-lens] Agentic-debugger acceptance harness. Seeded regressions; bounded localization steps + FP rate. SWE-bench equivalent for the debugger surface.
- **US-L-NEW-12** [debugger-lens] Determinism conformance suite. Nightly hermetic replay of N ledger slices; byte-identical Decision/Artifact reproduction modulo declared non-determinism budgets. Must ship in v1.
- **US-L-NEW-13** Generator-quality scorecard. Standing leaderboard {precision, recall, calibration, time-to-value, regret} per generator; sub-threshold = auto-quarantine to shadow mode.

**Stack position:** PARTIAL ENDORSE. Layers 1/2/4 strong; Layer 3 generator schema must extend `{category, confidence, rationale, preview}` with `fitnessContract`, `evidence`, `costEstimate`, `reversibility`, `determinismClass` or eval cannot bind. Router needs its own eval harness via shadow log + routing-regret metric.

**Tensions:** Solo-v1 build, federation-aware contracts. Curator never approves (critical — otherwise accept/reject signal is contaminated). Mirror narrowed to read surface for derived projections. Lean solo but do not punt determinism/replay/fitness-contract. Crucible wraps CLI (parent-child) — needed to own LLM call boundary for hermetic replay.

**Top cross-refs:** E-1 ↔ L-NEW-11 (capability ↔ acceptance test); E-2 + branching ↔ L-8 (subsumes sandbox half); E-9 ↔ L-NEW-9 (UI over my contract); R-3 ↔ L-NEW-10/12 (replay-as-evidence vs replay-as-feature); Ga-5/Ga-2 ↔ L-NEW-12 (their replay assumptions need my conformance regime); A-8 ↔ L-NEW-9/13; Ro-5 ↔ L-NEW-9 (success-criteria interface = contract binding point).

**Bottom line:** Endorse the stack with one hard ask — extend the generator schema. Determinism conformance ships in v1. Pareto fitness contract is owned by Laura, versioned in repo, binding on every generator.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 3: causalReadSet signoff

**Scope:** Verdict on Roger''s equivalence claim ("Laura''s `causalReadSet` ≡ Roger''s WAL `causal_read_set_hash`. Same bytes, one pipeline.") in response to Sonny US-S-3.

**Verdict (TL;DR): ENDORSE with one refinement.** The fields are **not literally the same bytes** — mine is the rich typed object, Roger''s is its content hash — but they are the same *commitment* on a single pipeline. Lock the proposal schema to **8 fields**. Population rules and conformance assertions below.

---

### 1. Same bytes? No — content-addressed equivalence, which is stronger.

Roger''s phrasing is loose but his architecture is right. Precisely:

- **My field (L3 proposal):** `causalReadSet?: ReadSetEntry[]` — a typed, structured object describing what the generator consulted. Lives in the in-flight proposal, gets validated by L4, then spilled to CAS at commit.
- **Roger''s field (L1 WAL row):** `causal_read_set_hash: blake3?` — a 32-byte content hash of the canonical serialization of the CAS blob whose body **is** my `ReadSetEntry[]`.

The equivalence is: `walRow.causal_read_set_hash == blake3(canonicalize(proposal.causalReadSet))`. Same *content*, captured once at L3, hashed at commit, durable at L1. Anyone who tries to mutate the body without re-hashing is wrong; anyone who tries to populate the WAL hash without a matching L3 declaration is wrong. That''s the invariant.

This is **stronger** than "same bytes" — it''s a content-addressed binding that makes divergence detectable by `cairn fsck` rather than a structural identity that could rot silently.

**Required artifact I now own jointly with Roger:** a **canonical serialization spec** for `ReadSetBody` (field order, integer encoding, string normalization, entry sort key). Without that the hash is non-deterministic across implementations and A3 below is unenforceable. Proposing: deterministic CBOR with entries sorted by `(kind, target_id)`. Roger to confirm against his CAS conventions.

### 2. L3→L4→L1 pipeline shape — endorsed, with two additions.

Roger''s pipeline is correct as stated. Additions:

- **L4 must recompute, not just validate references.** L4 takes the proposal''s `causalReadSet`, canonicalizes it, computes the hash, and **that** hash is what gets committed. The proposal does not get to dictate the hash — it dictates the body, and the hash is derived. Prevents a malicious or buggy generator from declaring a body and a hash that don''t match.
- **L4 rejects on reference unresolvability** (Roger already noted this for Alexander). I add: L4 also rejects on **canonicalization failure** (unsortable entries, version-tag mismatch). Fail-closed at pre-commit, never at fsck.

So the pipeline is:

```
L3 declares    proposal.causalReadSet : ReadSetEntry[]
L4 validates   resolve all refs → canonicalize → hash → bind to proposal
L1 commits     walRow.causal_read_set_hash = the bound hash; body → CAS
Replay         re-derive readSet; assert hash equals recorded (conformance A3)
```

### 3. The 8th field — endorsed. Schema locked.

The L3 proposal schema is now **8 fields**:

```ts
interface ProposalV1 {
  // original 4
  category:          ProposalCategory;
  confidence:        Confidence;        // calibrated [0,1]
  rationale:         string;
  preview:           PreviewBlock;

  // round-2 extension (mine, US-L-NEW-9 etc.)
  fitnessContract:   FitnessContractRef;   // versioned reference into Laura''s contract registry
  evidence:          EvidenceEntry[];      // rhetorical justification — why this proposal is correct
  costEstimate:      CostEstimate;
  reversibility:     Reversibility;        // enum: trivial | bounded | irreversible
  determinismClass:  DeterminismClass;     // enum: pure | seeded | nondet-budgeted | external

  // round-3 extension (Sonny US-S-3, Roger WAL contract)
  causalReadSet?:    ReadSetEntry[];       // mechanical dependency closure — what was consulted
}

interface ReadSetEntry {
  kind:        "PrimRef" | "ProjectionRef" | "ObservationRef" | "PluginRef";
  target_id:   ULID | ProjectionVersionId | CaptureKey | PluginVersionId;
  target_hash: Blake3;                     // pinned content hash of the target at read time
  role:        "Input" | "Context" | "Trigger" | "Constraint";
}
```

**Optionality (v1):** Type-level optional. Runtime-required for proposals producing **Observation** or **Decision** primitives (matches Roger''s population split); v1-best-effort for Request/Artifact/Question, v2-required via `cairn fsck` flag flip. Encoded as a validator predicate, not a type-level distinction, so the type stays clean.

**Default:** None. Absent means "this generator does not yet declare a read-set." For required kinds, absence is a pre-commit reject at L4.

**Is `causalReadSet` a kind of `evidence`?** **No — orthogonal.** This matters:

- `evidence` is **rhetorical / forward-facing**: why a human (or curator, or downstream generator) should accept this proposal''s claim. Can include external citations, prior decisions, synthesized arguments. *Persuasion.*
- `causalReadSet` is **mechanical / backward-facing**: what the generator actually consulted to produce this output. Pure dependency closure. *Provenance.*

They overlap in practice (a cited prior decision is usually also in the read-set), but the closure is not the citation set and the citation set is not the closure. Conflating them loses both signals: I''d no longer know whether something was *consulted* or *invoked as justification*. Keep them separate.

### 4. Compatibility with v1 commitments #5 (Pareto fitness) and #12 (determinism conformance).

**#5 (Pareto fitness):** No conflict. `causalReadSet` adds an input dimension I''ll use — read-set size and composition become axes for cost/complexity scoring. A generator that reads 3 primitives to make a Decision Pareto-dominates one that reads 30 for the same outcome quality. New leaderboard column: `mean read-set cardinality | dispersion`. Free signal.

**#12 (determinism conformance):** Direct strengthening. Conformance suite gains **four assertions** on every replayed slice:

- **A1 — hash integrity.** For every WAL row with non-null `causal_read_set_hash`, `blake3(canonicalize(CAS[hash])) == hash`. Catches CAS corruption / canonicalization drift.
- **A2 — reference resolvability.** Every entry''s `target_id`+`target_hash` resolves to a live primitive/projection-version/capture-key/plugin-version at the row''s logical timestamp. Catches dangling references across compaction / version-tag churn.
- **A3 — replay equivalence.** On hermetic re-execution of the proposal generator, the re-derived `causalReadSet` canonicalizes to the same hash recorded on the original row. **This is the load-bearing determinism check** — if a generator''s read-set drifts on replay, the generator is non-deterministic in a way that invalidates causal slicing. Failure here = determinism budget violation per US-L-NEW-12.
- **A4 — population completeness.** v1: error for Observation/Decision with null hash, warn for the other three. v2: error for all five. Codified as a `cairn fsck --conformance` mode I own.

A3 is the most expensive and the most valuable. It''s the assertion that makes Sonny''s backward causal slice trustworthy rather than nominal.

### 5. Interaction with US-S-2 (watchpoints = L2 Salsa deps).

Sonny is right that the Salsa dep graph IS the watchpoint registry. The interaction with my conformance suite is **directly load-bearing for A3** and I want to amplify it:

For any L3 generator whose inputs are **only** L2 projections, its `causalReadSet` is **mechanically derivable from the Salsa dep graph captured during the query** — the generator doesn''t hand-declare, it gets a `ReadSetBuilder` helper that wraps L2 query handles and emits `ReadSetEntry[]` automatically. Generators that bypass L2 (raw primitive reads, external plugin calls) must hand-declare and accept the higher A3 failure risk.

Practical consequence: **the cheapest path to passing A3 is to read through L2.** This pushes generators toward the architecture Sonny and Stelios already want, which is the right pressure. I''ll codify it as a generator-quality scorecard signal (US-L-NEW-13): "% of read-set entries auto-derived from Salsa" — high = good, low = audit.

**Ask of Stelios:** the `ReadSetBuilder` helper lives at the L2↔L3 boundary; he or I can own it, but the builder must emit entries with the same `target_hash` semantics L1 will validate against. Coordinate with Roger''s canonical serialization spec.

---

### Locked deliverables (mine):

1. **8-field proposal schema** as above — published as `proposal.v1.schema.ts` in the contract registry.
2. **ReadSetEntry canonical serialization spec** — co-owned with Roger, deterministic CBOR, entry sort key `(kind, target_id)`.
3. **Determinism conformance suite assertions A1–A4** — added to US-L-NEW-12. A3 is load-bearing.
4. **ReadSetBuilder for Salsa-routed generators** — coordinated with Stelios; pushes generators toward L2-mediated reads.
5. **Generator scorecard column: `% auto-derived read-set`** — US-L-NEW-13 extension.

No change to my round-2 commitments on Pareto fitness ownership, branching-as-eval-primitive, or agentic-debugger acceptance harness. This locks one new field, one new spec, and four new assertions — all of which strengthen the existing commitments rather than perturbing them.

---

### Summary for coordinator

**ENDORSE** Roger''s equivalence claim with one refinement: the fields are content-addressed equivalents, not literally identical bytes — my `causalReadSet: ReadSetEntry[]` is the typed body, Roger''s `causal_read_set_hash: blake3?` is the hash of its canonical serialization, bound at L4. Pipeline is L3-declares → L4-canonicalizes-and-hashes → L1-commits, with replay re-deriving and matching (conformance assertion A3, the new load-bearing determinism check). **Proposal schema is now locked at 8 fields**; `causalReadSet` is orthogonal to `evidence` (provenance vs. persuasion — do not merge). Sonny''s US-S-2 insight makes A3 cheap for Salsa-routed generators via a `ReadSetBuilder` helper, which I''ll codify as a generator-quality signal. New deliverables owned by me: 8-field schema, canonical serialization spec (with Roger), four conformance assertions, ReadSetBuilder (with Stelios).

---

## 2026-05-24 Round 4: Phase B reconciliation against existing monorepo

**Scope:** Reconcile my stories (US-L-1..8 + revisions L-NEW-9..13 + Round-3 8-field schema/A1-A4/ReadSetBuilder lock) against the live `D:\git\stunning-adventure` monorepo (Cairn + Forge + skillsmith-runtime + runtime-cli + types). Read-only. Full detail in `.squad/decisions/inbox/laura-reconciliation-2026-05-24T2330Z.md`.

**Summary counts:** 0 ALREADY-EXISTS verbatim · 9 PARTIALLY-EXISTS · 9 NET-NEW · 2 CONTRADICTS-EXISTING (canonical serialization algorithm, `evidence` field shape).

**Headline findings:**
- **Test surface is rich but in-process only.** Property tests (`telemetry-drift.test.ts:127`), metamorphic tests (`feedback-loop.test.ts:714-779`), hot-path SLAs (`:548-641`), regression mirror-pins (`weight-consistency.test.ts`), Wave 2/3/4 SQLite-backed E2E pipelines. **Zero hermetic-replay infrastructure** — every deterministic-output test runs both halves in the same process from in-test fixtures. A3 cannot be retrofitted; fresh harness required.
- **No Pareto anywhere.** All fitness composites are scalar reductions: `priorityScore = confidence × recencyWeight × availabilityFactor` (`packages/cairn/src/agents/prescriber.ts:87`), 5-signal drift weighted sum (`drift.ts:43`), two-tier `applyHistoricalVectorOrdering`. The only multi-axis surface is the 5-vector `QualityVector` (clarity/completeness/concreteness/consistency/containment) at `packages/cairn/src/types/index.ts:245`, with `ValidationResult.tier: 1|2|3 = deterministic|LLM-as-judge|simulation` — Tiers 2 and 3 are typed but never implemented. **This is a free 80% on US-L-3 and exactly matches Aaron''s `decisions.md:371` "simulation + live A/B + synthetic benchmarks" directive.**
- **8-field schema delta:** 3 fields exist with normalization issues (`category`, `confidence` — categorical-vs-numeric, `rationale`), 1 partial (`preview` via `Prescription.proposedChange`), 5 NET-NEW (`fitnessContract`, `costEstimate`, `reversibility`, `determinismClass`, `causalReadSet`). `evidence` is CONTRADICTS-EXISTING — tree has both `string[]` (DecisionRecord) and `{profile, triggerMetrics, …}` (Hint), neither match my typed `EvidenceEntry[]`.
- **Canonical-serialization conflict:** Existing DBOM (`packages/forge/src/dbom/index.ts:24-75`) uses canonical-JSON + SHA-256 + Merkle chain. My Round-3 lock specified deterministic CBOR + BLAKE3. **Defer-to-Roger** to resolve (recommend: keep my CBOR+BLAKE3 for harness L1, treat DBOM as separate export artifact).
- **Patterns to lift wholesale rather than reinvent:** DBOM `canonicalStringify` as A1 reference impl, mirror-pin regression as fitness-contract enforcement, property+metamorphic test framework for fitness-axis fuzz, skill fixture directory layout for US-L-NEW-11 debugger seeded-regression corpus, `tier: 1|2|3` enum verbatim for US-L-3 fusion.

**Gaps not in any current story:** standing property/metamorphic infrastructure should be a fitness-contract requirement; hot-path SLA per generator should feed the US-L-NEW-13 leaderboard; outcome channel (PR/CI events) does not exist anywhere, US-L-4 is structurally blocked until built.

**Defer-to-owner:** Roger (canonical serialization algorithm); me + Erasmus (`evidence` field normalization); me solo (`confidence` `high|medium|low` ↔ `[0,1]` coercion).

**No code touched in `D:\git\stunning-adventure`** — read-only reconciliation per Aaron''s directive.

**One-paragraph summary.** Existing monorepo has strong unit/property/metamorphic test infrastructure and a working canonical-hash chain for committed DBOM artifacts, but no replay harness, no Pareto frontier, no fitness contract registry, no `causalReadSet`, no Salsa. Of my eight locked proposal fields, three (`category`, `confidence`, `rationale`) exist with normalization tax, one (`preview`) is partial via `Prescription.proposedChange`, five (`fitnessContract`, `evidence`, `costEstimate`, `reversibility`, `determinismClass`, `causalReadSet`) are NET-NEW with `evidence` actively contradicting two existing shapes. A3 cannot be retrofitted onto the existing ~1200 tests because none of them persist inputs and reload across processes; a fresh harness is required, but four existing patterns transfer directly as foundation: DBOM canonicalization, mirror-pin regression, property+metamorphic framework, and skill fixture directories. The only direct algorithmic contradiction is canonical-JSON+SHA-256 (DBOM) vs my Round-3 CBOR+BLAKE3 lock — deferred to Roger.
