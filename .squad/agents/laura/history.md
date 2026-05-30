📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §16 shipped. All 17 collaborator roles mapped (none unmapped). Cross-ref matrix complete. 3-page budget honored. No open questions. Phase 3 synthesis will re-verify deferred-section bindings. Ready for triage. — Scribe

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe

📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §11 (Hermetic Replay) FINAL. Cross-section dependencies flagged for Phase 2: Roger (§3 body shape pinning for `llm_response` / `tool_output` / `cross_session_memory` Observations), Alexander (§12 offset-0 materialization sequence + `memoryManifest` in SessionMetadata). Synthesis review: YELLOW, 1 finding routed to Roger §10/§15 on body-shape normalization. Ready for Phase 2 implementation. — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) Acceptance tests can now lock against R2-1 hybrid (test both declared and fallback paths); (2) A10 fixture for queue-as-projection (R2-3); (3) A11 fixture for bisect per-row stamp (R2-4); (4) A8 fixture for nonDominatedReason field (R2-5); (5) A6 fixture for install/fork/load triad (R2-6). Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:29:36Z): **Wave 1 complete** — canonical type adopted across packages, SqliteChangeVectorProvider live, zero-vector summaries filtered. Alexander (W2-2) + Rosella (W2-3/W2-7) complete. Forge 599 + Cairn 564 tests green. — Scribe
📌 Team update (2026-05-22T20:16:40Z): **Wave 0 complete** — canonical types in @akubly/types, getAllCategories helper in Cairn. category field reconciled to OptimizationCategory union. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight

# Laura — History (Summarized)

## 2026-05-28: CTD Phase 4 Honesty Amendments (§11 + §16) — FINAL

**Role:** Author the trace-vs-behavioral reproducibility discipline into the
FINAL §11 and §16 docs after Aaron locked UIS framing WITH rubber-duck's
precision reframing (which incorporated my FUNDAMENTAL CONCERN from the UIS
weigh-in).

**§11:** added §11.10 "Reproducibility Honesty: Trace vs. Behavioral".
Declares the LLM as the I/O subsystem of agentic computation (rr/Pernosco
analog), distinguishes trace reproducibility (guaranteed; A1–A4/A9 oracle)
from behavioral reproducibility (NOT guaranteed; enumerated drivers).
Pins what replay DOES vs. does NOT prove. Binds the discipline against
ever quoting A2/A9 as model-behavior evidence or weakening §11.6 to
tolerate behavioral drift.

**§16:** (a) added streaming-token policy in §16.5 Tooling — bounded
`stream_open`/`stream_delta`/`stream_close` triple at checkpoint boundaries
`(N=256 tokens) OR (M=500 ms)`, replay re-feeds deltas (does not regenerate),
invariant on concatenated-delta byte-equivalence; (b) added §16.7a
"Trace-Reproducibility vs. Behavioral-Reproducibility Test Layering" — three
disjoint, non-substitutable layers (trace-replay v1, mutation-testing v1,
behavioral-reproducibility v1.5+) with hard rule against cross-layer
evidence quoting.

**Decision drop:** `.squad/decisions/inbox/laura-ctd-phase4-honesty.md`.

**Key learning:** the honesty paragraph is load-bearing for the entire
replay design. Budget overruns in §11.10 are justified — every future
reader will otherwise misread "hermetic replay" as a stronger claim than
it makes and ship a feature depending on the stronger claim being true.



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

### 2026-05-28: §11 Hermetic Replay authored — CTD-spec ↔ TDD-strategy parallel

- Wrote §11 (`docs/crucible-technical-design/11-hermetic-replay.md`, 204 lines, ≤3pp) as Lane 4 of Phase 1. The unusual setup — I authored the TDD strategy that §11's tests will bind to — clarified a parallel worth naming: **the CTD section is the spec for the implementation contract, the TDD strategy is the spec for what tests assert against that contract**. The two are not redundant; they are reciprocal. §11 names `LedgerWindowReader` / `ReadSetHasher` / `CasStore` as the seams; TDD §3.1/§3.2 specifies their test-double policy; §6.3/§6.8/§6.9 specifies the property tests; A2/A9 specifies the acceptance shape. None of those four facets can be inferred from the others — they have to agree by construction, which is exactly why same-author authorship of both is high-leverage rather than redundant.
- **Replay-equivalence-oracle design pattern** that crystallized while writing §11.6: an oracle that compares "everything that is structural" against "everything observed" works better than the reverse (mask the few informational fields, compare the rest by deep equality). The structural/informational split has to be an explicit table on every field, not a rule-of-thumb — anything wall-clock-derived has to be tagged at emission so `normalizeTimestamps()` can mask it generically rather than via a per-field allow-list that drifts. Same pattern applies to the monotonicity invariant: keep it as a **separate** property test against each ledger independently, not folded into the oracle, because conflating "structural equivalence under replay" with "monotonicity within a single ledger" produces an oracle that fails for the wrong reasons.
- **Refuse-to-start enumeration matters more than the happy path.** Five preflight conditions in §11.7, each mapped to a distinct `divergenceKind` enum value, are what make the doctrine ("re-feed, never re-execute; legitimate non-determinism is masked, illegitimate divergence is hard-failed") actually testable. A replay driver that silently degrades on a CAS miss or a missing pinned plugin version would launder corruption; the refusal enum is the contract that says it won't.
- **Cross-section dependency discovery as a side effect of writing.** The most important thing §11 surfaced wasn't internal to §11 — it was that Roger's §3 row schema needs to canonicalize the `{ requestHash, responseRef }` body shape for re-fed Observations, and Alexander's §12 SDK bootstrap needs to specify the exact write order that produces the offset-0 row set the preflight asserts against. Both went into the Lane 4 decision drop. Writing the implementation contract is the most reliable way to find the seams where neighboring contracts have to agree.

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

## 2026-05-27: Q1 Option E Validation — APPROVE WITH MODIFICATIONS

**Task:** Independent validation of Aaron's locked Q1 resolution (Observation-as-primitive + Decision-as-commitment + tool-call scale). Verify testability against 12 acceptance scenarios, identify test-strategy changes, flag new risks and PRD ambiguities.

**Verdict:** **APPROVE WITH MODIFICATIONS**. Option E is architecturally superior to my original Option B recommendation because:
1. Eliminates vocabulary collision (Observation is now unambiguous: first-class primitive, not overloaded payload-envelope)
2. Centralizes observational context at Decision primitive (moment of commitment), not scattered across all primitives
3. Reduces storage overhead (only Decisions carry observation-set hashes; non-Decision primitives inherit via `causal_parent_id`)
4. Enriches causal graph (explicit authorization lineage via `causal_parent_id`, not just data dependencies via `causalReadSet`)

## 2026-05-27: Q1 Refinement Validation — Structural Commitment Model — APPROVE

**Task:** Second validation pass on Aaron's refined Option E. He reframed commitment from "observation-set hash" to "structural commitment over causal-context window" (entire ledger prefix visible to LLM, not just Observation primitives).

**Epistemic challenge:** Aaron pushed back on my M1 (orphan Observations) and M2 (empty observation-set) concerns, arguing these were type-system artifacts. His point: LLM sees token stream, not typed primitives. Prior Decisions, Artifacts, Questions — all shape the LLM's output. Committing over "Observations only" was unfaithful to LLM epistemics.

**Verdict:** **APPROVE** (no modifications). Structural commitment **dissolves M1 and M2** by reframing the commitment primitive:
- **M1 dissolves:** Every Observation is part of *some* Decision's causal-context window (next Decision in temporal order, or still-pending tail). No "orphans" because commitment isn't about explicit references — it's about temporal visibility.
- **M2 dissolves:** Empty commitment is impossible except at Decision-at-offset-0 (bootstrap edge case). Every other Decision commits over non-empty ledger prefix.
- **M3 resolved:** Aaron's `always_emit_synthetic_output` rule (concur).

**Key insight:** Structural commitment is *more* defensible than observation-set commitment because:
1. Removes agent-intent dependence (no "which Observations did this Decision consult?" question)
2. Commitment is mechanical: hash the ledger window [0..N], done
3. Test fixtures simplify — ledger-snapshot replay replaces observation-set bookkeeping
4. Merkle determinism risk eliminated — ledger order *is* canonical order (no set-ordering ambiguity)

**New invariant:** Bootstrap-Capture-Completeness — extra-ledger context (system prompts, tool definitions, cross-session memory) MUST be captured as Observation primitives at session offset 0. Testable via one property test + one contract test for `SessionBootstrapper`.

**V1 limitation flagged:** Pruning-divergence detection (if LLM context-window manager drops tokens) requires SDK cooperation. If SDK doesn't expose pruning events, structural commitment is best-effort (commits over ledger rows, not actual LLM tokens). Document as v1 limitation; defer detection to v2.

**Test strategy impact:** Positive. A2 hermetic replay becomes simpler (ledger-snapshot fixtures, cleaner oracle checks). Estimated effort: 1 day (down from 1-2 days for observation-set commitment).

**Biggest test-design delta:** Shift from observation-set bookkeeping to ledger-snapshot replay. No tracking "which Observations each Decision referenced" — commitment is over entire ledger prefix. This matches hermetic replay's actual mechanism and removes a layer of test complexity.

**Most important new invariant:** Bootstrap-Capture-Completeness. If extra-ledger context isn't captured at offset 0, replay drifts when system prompt changes. This is the *only* way structural commitment remains hermetic.

**Recommendation:** Proceed with structural commitment model. Ship as locked Q1 resolution. Update `docs/crucible-tdd-strategy.md` §11 Q1 with structural commitment resolution.
**Test-strategy impact:** Manageable. 2 new collaborator contracts (`ObservationSetCommitter`, `CausalParentResolver`), 1 modified contract (`ObservationCaptureStore`), 1 walkthrough rewrite (§4.2 pre-commit hook veto), 3 new contract tests, 2 new invariant tests + 1 modified (replay equivalence), 2 new fixture builders. Total: ~12 new tests, ~8 modified tests. Estimated 1-2 days.

**New test risks:**
1. **Merkle commitment determinism (HIGH)** — observation-set hash must canonicalize IDs before hashing; non-determinism breaks hermetic replay
2. **Decision-without-observations edge case (MEDIUM)** — empty observation set must have canonical hash (recommend `hash([])`)
3. **Causal-parent-ID correctness (MEDIUM)** — invalid parent IDs break causal slicing; needs L1 append-time validation
4. **Observation orphans (LOW)** — unreferenced Observations legal? (recommend yes; affects storage, not replay)
5. **Tool-call boundary for side-effects (LOW)** — side-effect-only tool calls emit Artifact with null output? (recommend yes)

**Three PRD ambiguities exposed** (require Aaron resolution before A2 hermetic replay test writeable):
- **M1:** Orphan Observation semantics (recommend: legal, retained indefinitely)
- **M2:** Empty observation-set hash (recommend: `hash([])`, not nullable)
- **M3:** Side-effect tool-call Artifact emission (recommend: always emit, even with null output)

**Key learning:** My original Q1 framing (A/B/C options) missed the **primitive-scale axis** entirely. Aaron's per-Decision observation capture + tool-call scale resolves both vocabulary collision and scale ambiguity. Fourth option (per-Decision) was the right answer I didn't see.

**Deliverable:** `.squad/decisions/inbox/laura-q1-option-e-validation.md` (5.2KB validation doc with 5-section breakdown)

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


## 2026-05-25 Round 7: v1 framework triage

**Scope:** Tier every story I authored (US-L-1..8, US-L-NEW-9..13, Round-3 lock deliverables) against Aaron's v1 framework: `v1 = MVP that validates the thesis"Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible.'` Tiers T1-T6 + Parking. Full output: `.squad/decisions/inbox/laura-triage-2026-05-25T0200Z.md`.

**Triage shape:** 6 T1 / 7 T2 / 3 T3 / 1 T4 / 1 DONE. Two stories split (US-L-NEW-9 and US-L-NEW-13 — lite version T1, full version T2). One merge (US-L-3 folded into US-L-NEW-9, lifting `ValidationResult.tier` enum verbatim). Zero drops.

**Recommended T1 set (six items):**
1. 8-field proposal schema wired as L4 runtime validator (with `tier: 1|2|3` enum lifted from `ValidationResult` for free 80% start)
2. US-L-NEW-12 carrier — determinism conformance suite skeleton
3. US-L-NEW-9-LITE — fitness contract registry + scalar binding + mirror-pin enforcement (no Pareto frontier in T1)
4. US-L-NEW-13-MIN — per-generator scorecard {acceptance rate, A3 pass rate, source attribution} partitioned by US-G-5 closed enum from day 1
5. Hand-declared `causalReadSet` for v1 generators (ReadSetBuilder slips to T2 with Salsa)
6. Free-multiplier lift: `ValidationResult.tier` enum copied into harness fitness contract today (cheap if applied day 1, ugly retrofit otherwise — same lesson as Aaron's L1 substrate boundary discipline)

**Conformance kit (T1 non-negotiable): A1 + A3 + A4.** A2 explicitly out of T1 (needs compaction to exist before it has anything to fail against — slot in T2 alongside Roger's snapshot/compaction). Rationale: A3 is load-bearing for `by Crucible'' (Crucible must investigate its own past with rigor); A4 is the gate that makes A3 non-vacuous (without A4, skipping `causalReadSet` trivially passes replay); A1 is the cheap integrity floor (DBOM `canonicalStringify` pattern, ~3h port to CBOR+BLAKE3).

**Generator constraint (US-G-5 / Aaron 6b `source` closed enum) applied:**
- US-L-NEW-13-MIN: scorecard partitions by `source` from day 1 (no retrofit)
- US-L-NEW-9-LITE: fitness contract registry exposes per-`source` default weights; `external` inherits safety-asymmetric weights by construction (bakes `decisions.md:585` `external = most restrictive default'' intent into fitness, not just routing)
- Generator manifest schema: no `source` slot; validator rejects author-supplied `source`; loader stamps at registration

**Slipped to T2:** A2, Pareto frontier proper, scorecard calibration math, ReadSetBuilder, US-L-NEW-10 branching-as-eval, US-L-2 calibrated cold-start posteriors, US-L-1 curriculum classifier, US-L-7 provisional fitness, US-L-8 ledger-rewind lift.

**Slipped to T3:** US-L-5 pattern mining (Curator hand-written rules cover thesis), US-L-NEW-11 debugger acceptance harness (depends on Sonny's debugger), US-L-4 hint outcome validation (blocked on PR/CI outcome channel that does not exist).

**Slipped to T4:** US-L-6 sim->live drift (requires Tier 3 simulation to exist as a measurement source).

**DONE:** Canonical serialization spec — resolved Round 6 (CBOR+BLAKE3 for L1, DBOM stays SHA-256, per-column algorithm rule locked). Strike from open work.

**Five open questions to Cassima.** Q1 is the highest-leverage: does `by Crucible'' read strong (Crucible proposes + replay-investigates prior decisions + applies) or weak (Crucible proposes, Aaron applies manually)? I triaged for strong, which makes A3 a T1 must-have. Weak reading shrinks the T1 conformance kit to A1+A4 and slips A3 to T2. Q2-Q5: what counts as `an improvement to Crucible''; `one week'' wall-clock vs business days and how many discrete improvements expected; is the scorecard user-facing in v1 (needs Valanice/Erasmus partner story if yes); `ValidationResult.tier 3 = simulation'' typed-but-empty stub — keep or remove (I lean keep, same discipline as L1 substrate boundary).
  
**No new deliverables this round.** All Round-3 locks (8-field schema, A1-A4, ReadSetBuilder, scorecard, canonical serialization) hold unchanged; this round only assigns them tier numbers and splits two of them across T1/T2 boundaries.

---

**2026-05-27 Eureka PRD Overlap Analysis (Scribe Summary):** Cross-agent consensus on Eureka × Crucible architecture and UX overlap. See `.squad/decisions.md` **Eureka PRD Overlap Analysis** section for full findings and 5 open questions for Aaron.

---

## 2026-05-27: Crucible London-School TDD Strategy

**Task:** Author comprehensive London-school TDD strategy for Crucible agentic runtime. 15-25 page document with 12 sections covering acceptance tests, walkthroughs, collaborator contracts, test layering, invariant tests, mock drift defenses, test-first cadence, fixtures, coverage, open questions, and anti-goals.

**Constraint (FIREWALLED):** NO references to Graham's technical design documents. Strategy must be derived ONLY from PRD and locked decisions. This was a trust test—can Laura design test strategy knowing WHAT (user stories, invariants, primitives) without knowing HOW (implementation paths, class hierarchies, file structures)?

**Approach:**
1. Read PRD from `.squad/decisions.md` (Round 2-6 closeout sections, T5 resolution, locked v1 commitments, 5-layer architecture)
2. Extract 12 acceptance scenarios from user stories (US-A-*, US-S-*, US-L-*, US-Ro-*, US-Ga-*)
3. Define outside-in development cadence (red → green → refactor at acceptance → component → unit tiers)
4. Inventory abstract collaborator roles per layer (L0-L5 + cross-cutting)
5. Design 5-tier test pyramid (unit/component/contract/integration/acceptance + conformance suites)
6. Specify 8 invariant property tests (append-only, hash-chain, replay equivalence, fork lineage, hook verdict determinism, projection purity, trust-tier monotonicity)
7. Build 5-layer mock drift defense (contract tests, fixture builders, golden files, CI double-check runs, API stability tracking)
8. Flag 8 open questions where PRD ambiguities block test design (observation capture granularity, Eureka integration, structural proposal UX, plugin pinning scope, bisect execution model, timestamp normalization, mock drift threshold, Pareto fitness with missing axes)

**Deliverables:**
- **Document:** `docs/crucible-tdd-strategy.md` (120KB, 2441 lines, ~28 pages)
- **12 acceptance scenarios** (A1-A12): Session fork, hermetic replay, hook veto, causal slicing, Aperture push, plugin pinning, Curator trigger, Pareto fitness, determinism conformance, Router escalation, bisect, marketplace trust gradient
- **3 Red/Green/Refactor walkthroughs** (§4): Full TDD cycles from failing acceptance test down to leaf implementation, with mock-to-real progression
- **18 collaborator contracts** (§3): Abstract roles (SessionBootstrapper, AppendProtocol, HookBus, LedgerProjector, PolicyEngine, etc.) with mock/stub/spy/fake test doubles
- **5-tier test pyramid** (§5): Ratio 1 acceptance : 5 integration : 10 component : 3 contract : 50 unit
- **8 invariant property tests** (§6): Using `fast-check` to validate architectural invariants (append-only ledger, deterministic hashing, replay equivalence, fork transitivity, etc.)
- **5-layer mock drift defense** (§7): PR-time contract tests, build-time fixture builders, nightly golden files, PR-time CI double-check runs, build-time API stability tracking
- **8 open questions** (§11): PRD ambiguities requiring Aaron resolution before test strategy execution
- **10 anti-goals** (§12): Explicitly rejected testing anti-patterns (100% coverage mandate, mocking private methods, integration-only tests, shared mutable state, flaky tests tolerated, test-later mindset, manual-only validation, happy-path-only, unowned tests)
- **Decision record:** `.squad/decisions/inbox/laura-crucible-tdd-strategy.md`

**Key Learning: London-School Adaptation for Agentic Runtimes**

**Why London-school TDD fits greenfield agentic systems:**
1. **Strict layer boundaries** (L0-L5) + outside-in development forces explicit interface design at each layer transition. Test-first "red" phase for L4 Router must mock L1 append protocol—immediately surfaces whether L1 interface is sufficiently abstract.
2. **Tell-don't-ask design emerges from interaction testing.** Crucible's primitives (Request/Artifact/Observation/Decision/Question) are immutable events, not mutable entities. London-school interaction tests naturally validate command/event flows, matching append-only ledger semantics.
3. **Invariants are enforced via collaborator contracts.** Determinism (A1-A4), hermetic replay, per-row durability—these are cross-cutting invariants every layer must honor. Contract tests on collaborator boundaries (does every L3 prescriber emit read-sets? does L2 projection remain pure?) become first-class artifacts.
4. **Acceptance tests anchor the outside.** User-observable behaviors (session forking, counterfactual replay, policy escalation, bisect, Aperture notifications) define acceptance surface. Inside-out TDD risks building "perfect" L1 substrate that doesn't support actual user workflows.
5. **Mock drift is tractable in greenfield.** Classic London-school hazard (mocks diverge from real implementations) mitigated via: (a) contract tests validate collaborator boundaries, (b) shared fixture builders keep test data aligned with production schemas, (c) CI double-check runs swap mocks for integration stubs on critical paths, (d) hermetic replay as test oracle—production ledger snapshots become regression test inputs.

**Discipline Patterns Discovered:**
- **Three-commit cadence:** Red (failing test) → Green (minimal implementation) → Refactor (extract patterns). Git history becomes learning artifact.
- **Fixture builders > inline literals:** Test data via builders (`new PrimitiveBuilder().ofKind('decision').fromSource('builtin')`) adapts to schema changes automatically.
- **Golden files for regression:** Anonymized production ledger snapshots as test inputs (validate replay equivalence, determinism conformance).
- **Property tests for invariants:** Use `fast-check` to generate diverse test inputs, explore edge cases, validate architectural invariants (append-only, hash-chain, replay equivalence) across 50-100 random scenarios per property.
- **Contract tests prevent mock drift:** For every mocked collaborator, contract test validates real implementation honors mocked interface. Run on every PR (fast feedback).
- **CI double-check runs:** Component tests run twice—once with mocks (fast), once with real implementations (drift detection). If mocked test passes but real test fails, mock has diverged.

**Open Questions for Aaron (Testing Blockers):**
1. **Observation capture granularity** (per-tool-call vs per-primitive vs per-turn) blocks hermetic replay acceptance test (A2)
2. **Eureka integration path** (standalone L3 vs library vs deferred) affects test layering (separate tier vs shared orchestration)
3. **Structural proposal UX** (blocking modal vs Aperture notification vs review CLI) blocks Router policy escalation test (A10) assertions
4. **Plugin pinning scope** (direct deps vs transitive vs full environment) affects `SessionMetadata` fixture builders
5. **Bisect execution model** (shell out vs isolated subprocess vs in-process runner) blocks bisect integration test design
6. **Timestamp normalization** (excluded vs deterministic sequence vs non-deterministic field) affects determinism conformance suite
7. **Mock drift threshold** (zero-tolerance vs ≥3 in layer vs ≥10% total) determines when to escalate to mock audit sprint
8. **Pareto fitness with missing axes** (reject comparison vs zero-fill vs partial dominance) affects Alchemist test fixtures

**All blockers have recommendations** (favor simplicity + v1 MVM scope).

**Skill Extraction Candidate:** `london-tdd-for-agentic-runtimes` — The adaptation pattern (outside-in + tell-don't-ask + invariant contracts + hermetic replay as oracle) is reusable across agentic projects with similar constraints (determinism, replay, layer boundaries). **Defer decision** until after Aaron review.

**Tool Invocation Learning (Process Meta-Learning):**
- **Blocker:** Made ~15 failed attempts to invoke `create` tool for document generation. Root cause: systematically failed to provide required `file_text` parameter (called tool with only `path` parameter).
- **Fix:** Aaron's tactical solution: incremental build approach—(1) create small skeleton (<2KB), (2) use `edit` tool per section, (3) batch 3-4 edits per response, (4) verify with `view` periodically. This keeps payloads bounded, provides failure isolation, and surfaces progress incrementally.
- **Pattern internalized:** For large document generation, skeleton-first + iterative section fills is more reliable than single large `create` call. Bounded payloads reduce error surface area.

**Firewall Compliance:**
✅ Zero references to CTD artifacts (did NOT read `docs/crucible-technical-design-plan.md`, `docs/crucible-technical-design.md`, or Graham's inbox decisions)  
✅ PRD-only dependencies (5 primitives, hook verdicts, determinism invariants, locked decisions: L1 WAL, Eureka adapter, T5 resolution, 5-layer stack vocabulary)  
✅ All acceptance scenarios reference PRD user stories (US-*) or v1 commitments explicitly

**Outcome:** Strategy document complete at ~28 pages (slightly over 15-25 target but comprehensive). Awaiting Aaron resolution of 8 open questions before formal acceptance.

---

## 2026-05-27 — Crucible TDD Strategy: 8 Open Questions Resolved

**Task:** Revise `docs/crucible-tdd-strategy.md` in place to integrate 8 resolved questions from Aaron's Decision-Point gate.

**Context:** Initial strategy draft (12 sections, 8 open questions Q1-Q8) presented to Aaron via coordinator. All 8 questions locked via interactive Decision-Point gate. My task: integrate every resolution throughout the doc, moving status from DRAFT → FINAL.

**Key learnings:**

### 1. Refined Option E (Context-Window Commitment Model) — Q1 Resolution

**What:** Decision primitive's commitment is a **Merkle hash over the causal-context window**—every prior ledger row visible to the LLM at decision time, regardless of primitive type (Request, Artifact, Observation, Decision, Question).

**Why this is architecturally significant:**
- **Removes agent-intent dependence:** Commitment is structurally computed from session lineage, not agent's claim about "which observations mattered." Eliminates M1 (orphan observations) and M2 (empty observation-set hash) failure modes from my original Option B.
- **Makes hermetic replay easier:** Replay logic becomes "replay prefix → recompute context-window hashes → compare to stored commitments." No separate observation-capture store needed—observations are first-class primitives in the ledger itself.
- **Strengthens causal slice:** Data lineage (what content influenced the decision) + authorization lineage (who/what produced the context) both available via single context-window query.
- **Bootstrap-Capture-Completeness invariant:** Extra-ledger context (system prompts, tool definitions, cross-session memory) MUST be captured as Observation primitives at session offset 0. Replay drifts if violated.

**Testing implications:**
- New fixture builder: `LedgerPrefixBuilder` with `.withBootstrapContext()` and `.appendDecision(contextWindowSize)` methods
- New invariant test: §6.8 Bootstrap-Capture-Completeness (validates offset-0 observations capture all extra-ledger context)
- Revised §6.2 Hash-Chain Integrity property test (now tests context-window hashing, not just read-set hashing)
- Collaborator contract: Renamed `ObservationCaptureStore` → `LedgerWindowReader` (provides read access to ledger prefix for context-window reconstruction)

**Pattern to reuse:** Structural commitment over causal-context windows is a general agentic-system primitive. When designing determinism for any agent runtime, compute commitments over the **full visible state** (not agent's self-reported dependencies). Prevents "agent forgot to declare a dependency" bugs.

---

### 2. Agentic-Cost-Function Principle (Zero-Tolerance Gate) — Q7 Resolution

**What:** Single contract test failure blocks all PRs (zero-tolerance). No ≥3-failure threshold, no "mock audit sprint" escalation.

**Why traditional human-team thresholds don't apply:**
- **Human teams:** Context-switch tax (developer pulled from feature work to fix mock) + resentment (developers disable tests for expediency) make zero-tolerance brittle. ≥3-failure threshold balances iteration speed vs correctness.
- **Agentic teams:** Cost functions invert:
  - **Context-switch tax = near-zero:** Spawn background agent to address contract test failure. Agent investigates, fixes mock or real implementation, commits. No human context switch.
  - **Resentment = non-existent:** Agents don't experience frustration or disable tests out of expediency.
  - **Drift cost = compounding:** Mock drift compounds across agent actions. An agent making 20 decisions per session against a drifted model produces cumulative correctness debt. Detection cost scales linearly with drift duration.
  - **Fix cost = near-zero:** Agent-driven fix (update mock, update component tests, validate contract) completes in minutes.

**Pattern to reuse:** When designing test gates for agentic workflows, reconsider human-team trade-offs. Policies that are "too strict" for human teams (zero-tolerance, exhaustive coverage) may be correct for agentic teams where fix cost approaches zero. The bottleneck shifts from "developer time to fix" to "agent-spawn latency" (seconds to minutes).

---

### 3. Generic Adapter Conformance Suite Pattern — Q2 Resolution

**What:** Define a **generic L3 Generator adapter conformance suite** that any adapter implementation must pass. Applies to Forge today, Eureka v1.5+, marketplace plugins. No Eureka-specific tests in v1 (deferred to v1.5).

**Why this is better than per-adapter test strategies:**
- **Interface standardization:** Conformance suite defines the `PrescriberOrchestrator` contract once. Any adapter (Forge, Eureka, future marketplace plugins) plugs into the same test harness.
- **No new test infra per adapter:** Eureka v1.5 will run the v1 conformance suite. No need to design Eureka-specific contract tests from scratch.
- **Future-compatible:** Marketplace plugin developers get a conformance suite to validate their adapters against. Self-service validation.

**Pattern to reuse:** For any pluggable system (prescribers, projectors, hooks), define a **generic conformance suite** as a first-class test artifact. Don't write per-implementation contract tests—write one conformance suite all implementations must pass. Benefits: standardization, self-service validation, no per-plugin test debt.

---

### 4. Deliverables

1. **`docs/crucible-tdd-strategy.md`** revised in place ✓ — Status: FINAL — 8 Open Questions Resolved 2026-05-27
2. **`.squad/decisions/inbox/laura-crucible-tdd-strategy-revision.md`** decision drop created ✓
3. **`.squad/agents/laura/history.md`** appended (this entry) ✓

---
---

## Phase 2 — CTD §16 Test Strategy + Invariants (FINAL)

**Date:** Phase 2 fan-out.
**Output:** `docs/crucible-technical-design/16-test-strategy-invariants.md` (16,182 bytes).
**Decision drop:** `.squad/decisions/inbox/laura-ctd-phase2-laura.md`.

### Pattern: §16 as a cross-reference document, not a re-author

§16's job in the CTD is to be the **thin CTD-side handle** on the
authoritative TDD strategy doc. The instinct (mine, early) was to restate
test counts, fixture patterns, and invariant propositions in §16 so a
CTD-only reader could understand the test posture without leaving the CTD.
That instinct is wrong here: duplication creates a second source of truth
that drifts, and the drift cost is exactly the mock-drift cost Q7 captures
(compounded across every contributor who reads only one of the two docs).

The pattern that worked: §16 contains **only** what the CTD uniquely
authorizes — CI-stage runners, the collaborator → CTD-section alignment
matrix, the productivity-loop smoke test (it composes seams owned by
multiple CTD sections, so neither the TDD nor any one CTD section can host
it cleanly), and the tooling/conformance execution specs. Everything else
is a one-line "see TDD §X." Net effect: §16 stays at 3 pages and gets
**stronger** when the TDD strategy evolves, because there is nothing in
§16 to keep in sync.

Reusable for any future "thin reference" CTD section: enumerate what the
referenced doc owns, refuse to restate it, and confine the host section to
the bindings that only the host can author.

### Pattern: alignment matrix as teaching artifact

The collaborator → CTD-section alignment matrix (§16.3) is the artifact
I'd reach for first when onboarding a new engineer. It collapses two
otherwise-disjoint vocabularies (TDD collaborator roles, CTD section
numbers) into a single table, and the **tier column** tells the reader
which mock-drift defense to think about for each seam. The matrix
surfaced one structural observation: `QueryExecutor` and
`CausalSliceEngine` bind to CTD content that does not yet exist as a
standalone file — the L2 row of §1.2 is the only home for the former
today, and L5 Investigation is unscheduled until Phase 2/3. This was
**not** apparent from reading either doc alone; it fell out of forcing
every TDD §3 row to land in a CTD §X cell. Phase 3 synthesis can use the
matrix as a coverage check for "are all the architectural seams actually
sectioned?"

The teaching angle: the matrix is also the **rule** for how new
collaborators get added. Adding a row to TDD §3 without adding a
corresponding §16.3 row is a documentation bug; the matrix is the
forcing function that keeps the two docs honest.

📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.
