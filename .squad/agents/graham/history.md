📌 Team update (2026-05-23): **Wave 3 decisions accepted** — R2 approved as `@akubly/skillsmith-runtime`; MCP dropped from Wave 3; always-on Curator hook; 7 work items, ~18 tests. Docs revised, ready to fan out. — Graham Knight
📌 Team update (2026-05-23): **Wave 3 scope + ADR drafted** — `docs/forge-phase4.6-wave3-scope.md` (9 work items, 4 open questions) + `docs/adr/0001-composition-root.md` (5 options R1–R5, recommending R2). Awaiting Aaron's approval. — Graham Knight
📌 Team update (2026-05-22T20:29:36Z): **Wave 1 complete** — canonical type adopted across packages, SqliteChangeVectorProvider live, zero-vector summaries filtered. Alexander (W2-2) + Rosella (W2-3/W2-7) complete. Forge 599 + Cairn 564 tests green. — Scribe
📌 Team update (2026-05-22T20:16:40Z): **Wave 0 complete** — canonical types in @akubly/types, getAllCategories helper in Cairn. category field reconciled to OptimizationCategory union. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight

# Graham — History (Summarized)

## 2026-05-22: Wave 2 Wave-0 Complete

Roger (W2-1) + Rosella (W2-4): canonical `ChangeVectorSummary`, `ChangeVectorProvider`, `OptimizationCategory` in `@akubly/types`; `getAllCategories(db, skillId)` helper in Cairn. 1153+560 tests passing. Ready for W2-2/W2-7/W2-8 fanout.

## Phase 4.6 Architecture & Leadership

**Role:** Kickoff (Wave 0), Triage (Wave 2), Review Cycle Lead (Cycle 1), Architect (Wave 2 wiring design)

**Wave 0 — Spec & Decomposition:** Six clarifications resolved; work split A1–A4 (Alexander), R1–R5 (Rosella), L1–L5 (Laura).

**Wave 2 — Defect Triage:** Laura flagged confidence inconsistency. Three options analyzed; Option B chosen (rename to `confidenceBoost`). Lesson: when two implementations are internally consistent but contract is ambiguous, the bug is naming, not logic.

**Review Cycle 1 (Triage Lead):**
- 5 personas in parallel → 15 findings (1B/9I/5M)
- Autonomous triage: 12 accepted, 1 rejected, 2 deferred
- 3 new ADRs (P4.6-004/005/006)
- Applied lockout rule: cross-package coordination for fixes

**Cycle 2 Re-Review:** 7/7 + 4 PASS/3 PARTIAL + 6/6 verification. 10 advisory findings routed to Cycle 3.

**Cycle 3 Completion:** 1153 tests passing (+163), branch review-clean.

## Wave 2 Wiring Architecture

**Key decision:** `ChangeVectorProvider` port in `@akubly/types` + `SqliteChangeVectorProvider` in Cairn. Follows `FeedbackSource` injection pattern. Rejected direct DB import (breaks acyclic deps) and `FeedbackSource` extension (couples concerns).

**Dual type copies discovered:** `ChangeVectorSummary` existed as two independent copies (Forge prescribers, Cairn DB) guarded only by regression test. Wave 2 promotes to canonical `@akubly/types`.

**Surprise:** No runtime call site for prescribers existed — only tests. Invocation point design deferred to Wave 2 scope question.

**Wave 2 v2 issues (Rubber-Duck Review):**
1. **Composition root problem (BLOCKING):** v2 proposed `PrescriberOrchestrator` port for Curator injection. But `curate()` has no injection points and no composition root. Escalated as package boundary decision.
2. **Internal inconsistency (BLOCKING):** Confused who queries vectors — orchestrator internally or Curator externally? Resolved: orchestrator pure (profile, provider → hints).
3. **Missing hint dedup (BLOCKING):** Prescribers generate fresh UUID hints every invocation. Added `(skillId, source, category)` dedup policy.

**Key decision: Wave 2/3 split.** Wave 2 = data plumbing + safety gates + manual invocation (composition script). Wave 3 = Curator-driven wiring (requires composition root ADR).

**Attenuation refined:** Two-layer defense — confidence scaling `max(0.1, 1+impact)` PLUS `autoApplyEligible` boolean flag (policy gate for strongly negative categories).

**Wave 2 v3.1 fixes (4 findings, all fixable):**
1. Stale Cairn-MCP wording scrubbed; MCP deferred to Wave 3
2. `autoApplyEligible` propagation spec: summary → OptimizationHint → evidence JSON
3. Attenuation thresholds named: `NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2`, `ATTENUATION_FLOOR=0.1`
4. CLI surface specified: `--skill` flag, profile load, JSON output, exit codes

## Key Patterns

**Copilot extensibility:** CLI SDK (embedding), Extensions SDK (distribution), Engine SDK (agents). MCP universal tool protocol.

**Marketplace standardization:** awesome-copilot dominant (170+ agents, 240+ skills). SKILL.md cross-platform standard.

**Caching hierarchy:** L1 in-memory ~100ms, L2 session ~5min, L3 short-TTL ~1hr, L4 long-TTL ~30d.

**Brainstorm distillation:** 2 rounds × 10 agents = massive input. Aaron's explicit decisions are spec constraints.

**Composition root is first-class architectural decision.** Injection ports need explicit ownership of construction + passing site.

**When contract is ambiguous, naming is the bug.** Type-level intent prevents silent divergence.

**Autonomous triage with lockout coordination works.** Each agent owns scope; review prevents author bias.

## Specialization

- Architecture scoping (phase decomposition, composition patterns, dependency injection)
- Design review triage (finding consolidation, lockout enforcement, cross-team coordination)
- Spec clarification (ambiguity resolution, critical-path identification)
- Core platform patterns (SDK layering, marketplace standardization, observability)

**Joined:** 2026-03-28  
**Tech:** TypeScript/Node.js, npm monorepo, MCP SDK, Copilot CLI/Extensions/Engine SDKs

## Learnings

### Round-1 Vision Follow-Up: Curator Autonomy & Tamper-Evidence (2026-05-23)

**Q-A Resolution: Curator Autonomy is Mixed-Model, Categorized by Gate.**
Aaron asked "what decisions are being made?" — the vision lists "accept hints below threshold" but doesn't specify scope. Enumerated 7 concrete categories (hint prioritization, staleness detection, geneticist triggers, skill recommendations, hypothesis reversion, low-confidence hint auto-apply, policy auto-change). Mapped each to append-then-X strategy:
- Append-then-apply: UX-only (prioritization) — no consequence to auto-executing
- Append-then-notify: Detection (staleness, triggers, recommendations) — user sees in digest, decides
- Append-then-ask: Consequential (revert, policy) — explicit user ACK/REJECT required
- Never auto-apply: Hints below confidence threshold, policy guardrail changes

**Key insight:** Curator has *detection* and *proposal* authority, never *approval* authority. All approval stays with human.

**Q-B Resolution: DEFER Tamper-Evidence (Witness/Notary), KEEP Hash-Linking.**
Aaron skeptical about hash-chain cost ("do we *care* about tamper-evidence?"). Enumerated 3 threat models:
1. Silent Ledger Corruption (accidental): cost of not having = can't detect; cost of building = 1% overhead. **KEEP hash-linking, cheap + valuable.**
2. User-System Disputes (self-audit): cost = eroded confidence; benefit = foolproof replay. **KEEP for v1 (confidence tool, not security tool).**
3. Regulatory/Audit (future adoption): cost = 2-3x storage + infra; benefit = zero for single-user. **DEFER witness/notary to Wave F.**

**Recommendation:** Build append-only + hash-linked ledger in Wave B (1–2 days). Skip witness/notary in v1. Migration path: if adoption requires audit, add signatures retroactively (backward-compatible).

**Lesson:** Single-user honesty test—what engineering cost is justified for one person? Hash-linking (1%) passes; witness infra (3x) fails. Defer doesn't mean never; it means "validate adoption first."

### Wave 3 Scope Design + ADR Reasoning (2026-05-23)

**Terminology reconciliation is first-class work.** Roger and Alexander used overlapping option labels (Roger's A–E, Alexander's A–D) that mapped to different options. Without a canonical mapping table (R1–R5), Aaron would face label confusion that obscures the actual decision. Lesson: when multiple contributors analyze the same design space independently, reconcile labels before presenting to decision-maker.

**Convergence signals simplify ADR framing.** Both Roger (Option B) and Alexander (Option A) independently converged on "new composition library package." When two independent analysts agree, the ADR should name the convergence explicitly and focus Aaron's attention on the remaining nuances (CLI separation, naming, scope boundaries) rather than re-arguing the full option space.

**Composition root is a durability decision, not a naming decision.** R2 (`@akubly/runtime`) vs R4 (`@akubly/curator`) is really about commitment level: R2 makes a weak, durable claim ("composition library"); R4 makes a strong, potentially brittle claim ("Curator is a package"). Prefer weaker claims when Phase 5 may reshape the architecture. Cost of R2→R4 migration is low; cost of wrong R4 commitment is high.

**Wave structure works for incremental delivery.** Wave 0 (types) → Wave 1 (primitives) → Wave 2 (plumbing + safety) → Wave 3 (wiring) is a clean decomposition where each wave is self-contained and testable. The "hard parts ship early, wiring ships later" pattern reduces risk: Wave 3 is mechanically straightforward because Wave 2 solved the data and safety problems.

### Harness Vision Architecture Analysis (2026-05-23)

**Greenfield architecture framing requires explicit non-anchoring.** Aaron specifically requested analysis *without* bias from existing Cairn/Forge patterns. This is a trust test: can the architect approach a vision document with fresh eyes, or will prior implementation decisions leak into recommendations? Lesson: when asked to evaluate greenfield, identify where *old mental models could mislead* before presenting recommendations.

**Six-chamber architecture is aspirational, not prescriptive.** Vision lists Harness, Cairn, Forge, Geneticist, Curator, Narrator — but chamber boundaries are soft proposals, not contracts. The real architectural work is identifying where these boundaries will *bend under load*: When does Curator's autonomy need Narrator's transparency? When does Geneticist's mutation need Cairn's provenance? Prior art (Aider, OpenHands, SWE-agent, Claude Code) mostly lacks chamber decomposition — they're monolithic agents with tool plugins, not self-improving subsystem ecosystems.

**Primitive taxonomy is the foundation.** The five primitives (request, artifact, observation, decision, question) + parent/child relationships form the ontology for the entire ledger. Every chamber interaction must speak this language. But vision doesn't specify: Are primitives schemaless JSON, or typed records? Who assigns primitive IDs? How are parent/child links enforced (foreign keys, hash references, both)? These choices cascade into replay fidelity, storage format, and migration complexity.

**Trust model tension: autonomy vs. transparency.** Vision proposes both "Curator autonomously applies hints below confidence threshold" AND "every decision is hash-linked with provenance." These goals conflict when decisions happen *before* user sees them. The architecture must answer: Does Curator write provisional decisions that users later audit, or does it write tentative hints that become decisions only on approval? One model is append-then-review (blockchain-style), the other is propose-then-commit (staging-area-style).

**Genetic loop fitness function is multi-objective optimization without weights.** Vision lists token cost, drift, convergence, user acceptance as competing objectives but doesn't specify priority or trade-off rules. This is a *policy* question masquerading as an architecture question. Two reasonable architects could build radically different Geneticist implementations: one that Pareto-optimizes (surface all non-dominated variants), another that scalarizes (weighted sum → single winner). Aaron must decide which.

**Prior art surveyed:** Aider (git-integrated, multi-file edit orchestration), OpenHands/OpenDevin (agent orchestrator with planning/coding/QA specialization + execution sandbox), SWE-agent (task decomposition with tool plugins and iterative refinement), Claude Code/Cursor (context-aware IDE agents with action executors and feedback loops). Common pattern: they're all *single-generation* systems (no learning loop, no variant evolution, no decision ledger). Harness's differentiator is the *self-improving* meta-layer (Curator, Geneticist, Narrator) that treats prompts/skills as evolvable artifacts.

## Skillsmith Harness: Capability User Stories (2026-05-24)

**Ambition:** Six-to-ten system-level capability stories that articulate *what the harness enables that no current tool does*. Greenfield framing (non-anchored to legacy Cairn/Forge). Coverage: cross-session patterns, provenance/replay, self-improvement, aspirational capability, extensibility-as-load-bearing.

### US-G-1: Cross-Session Pattern Recognition & Reuse
**Story:** As Aaron, I want the harness to recognize when I'm solving a problem category I've encountered before (across sessions/projects), and surface prior decision chains + outcomes, so that I don't re-derive the same architecture or tool choice multiple times.
**Ambition:** The harness becomes a **collaborative memory** — not just a log, but an active pattern library that grows with every decision and learns what "solved this well" looks like.
**Chambers touched:** Cairn (ledger of decisions/artifacts), Forge (pattern scoring), Mirror (surface prior solutions).
**Architectural implication:** Cairn must support **semantic tagging** of decision contexts (problem domain, tool stack, outcome quality) so Forge can index and retrieve similar past episodes without exact matching.

### US-G-2: Full Provenance Replay & Reasoning Audit
**Story:** As Aaron, I want to query "show me the decision chain that led to architecture choice X in September," see the questions asked, observations gathered, and alternatives considered, and replay the entire sub-session with intra-turn primitives, so that I can audit my own reasoning evolution and understand why my judgment has shifted.
**Ambition:** The harness provides **forensic-grade decision archaeology** — not just "what was decided," but "how did I arrive at it?" with full visibility into dead ends, reversals, and confidence shifts over months.
**Chambers touched:** Cairn (append-only primitive ledger with parent/child links), Crucible (intra-turn replay), Mirror (provenance dashboard).
**Architectural implication:** Cairn's hash-linked structure must be queryable by temporal range + decision type, and Crucible must support **read-only replay mode** where users walk through prior turn sequences without mutation.

### US-G-3: Harness Self-Optimization via Genetic Skill Variant Evolution
**Story:** As Aaron, I want the harness to observe patterns in my failed attempts (e.g., "my code reviews miss security issues when I'm tired"), generate and test *variants of my problem-solving approach* (e.g., alternate review prompts, tool combinations), and surface winners so I notice my own reasoning got better without me explicitly tuning knobs.
**Ambition:** The harness shifts from **tool** (executes my will) to **collaborator** (improves my patterns autonomously). Variants are proposed, tested, and winners are tagged with "you're 30% more likely to catch auth bugs with this reviewer combo."
**Chambers touched:** Cairn (logs of attempts + outcomes), Alchemist (variant generation), Forge (fitness scoring), Mirror (high-signal improvements).
**Architectural implication:** Alchemist must model **skill transformation** as a multi-objective optimization over token cost, convergence speed, user acceptance, and drift-from-intent. Fitness function is *policy-driven*, not hardcoded.

### US-G-4: Curator-Driven Hint Autonomy with Asymmetric Transparency
**Story:** As Aaron, I want Curator to propose optimizations (e.g., "reuse this helper from Session 47; saves 120 tokens"), apply sub-threshold hints transparently, and surface all decisions (applied + rejected) in digest form, so that I trust the harness to nudge my practice without gatekeeping every micro-decision *while* retaining full visibility into what happened.
**Ambition:** The harness achieves **trust through transparency**, not through passivity. Curator acts (append + apply), but every act is auditable and reversible. Mixed-mode autonomy: UX-only decisions auto-execute; consequence-bearing decisions stay in my court.
**Chambers touched:** Cairn (audit trail), Curator (proposal + categorized autonomy), Mirror (digest + drill-down).
**Architectural implication:** Curator's decision categories must be explicit (hint prioritization, hint application, skill recommendation, hypothesis reversion, policy change) with per-category autonomy policy stored as Cairn metadata.

### US-G-5: Extensibility as Load-Bearing Architecture
**Story:** As Aaron, I want to write custom skills and MCP servers that integrate into the harness, have them discovered contextually (via Curator + Forge), ranked by relevance, and tested in sub-agent pool before surfacing to Crucible, so that the harness becomes a vehicle for *my* domain-specific intelligence, not a one-size-fits-all agent.
**Ambition:** The harness is an **open platform for personal AI augmentation** — extension is not an afterthought, but the primary mechanism for capability growth. Custom skills are first-class; builtin skills are just well-maintained examples.
**Chambers touched:** Crucible (skill invocation), Curator (contextual discovery), Forge (ranking), Alchemist (variant testing).
**Architectural implication:** Harness must define a **skill lifecycle contract** (interface, metadata schema, telemetry hooks, placement in chamber taxonomy) such that third-party tools integrate cleanly without architecture breakage.

### US-G-6: Aspirational—Harness as Collaborative Research Partner
**Story:** As Aaron, I want the harness to formulate *novel hypotheses* about my practice based on Cairn observations (e.g., "your code review quality correlates with time-of-day, not task complexity"), surface these as Curator proposals, and offer guided experiments to test them, so that the harness becomes a peer researcher helping me understand my own work patterns.
**Ambition:** The harness transcends **optimization** and enters **discovery**. It doesn't just help you work faster; it helps you *understand yourself* as a developer. Hypotheses are surprising, testable, and potentially reshape how you prioritize.
**Chambers touched:** Cairn (observation mining), Curator (hypothesis proposal), Mirror (experiment tracking).
**Architectural implication:** Harness must support **temporal analytics** (correlations over time) and **counterfactual simulation** (what if you always worked in morning hours?) via Cairn queries and Forge scoring.

### US-G-7: Decision Reversion & Multi-Path Exploration
**Story:** As Aaron, I want to mark a Decision in Cairn as "tentative," fork the ledger at that point, explore an alternative, and later compare outcomes of both paths (token cost, quality, time), so that I can treat my work like a version-controlled experiment and learn from divergent choices.
**Ambition:** The harness supports **non-destructive exploration** — not "did I make the right choice?" (past tense) but "how do I compare this choice against its alternative?" (multi-path reasoning). This is how science works; harness brings that rigor to engineering practice.
**Chambers touched:** Cairn (versioned ledger with branching), Forge (path-outcome comparison), Mirror (multi-path dashboard).
**Architectural implication:** Cairn must support **ledger branches** (forking at a checkpoint, maintaining sibling histories) and **path reconciliation** (when/how to merge insights from alternative paths back into canonical ledger).

### US-G-8: Custom Trigger Orchestration via Curator Hooks
**Story:** As Aaron, I want to write custom Curator detectors (e.g., "warn me when I'm about to auto-apply hints with <60% confidence") and actions (e.g., "suspend hint application and ask for explicit approval"), so that I can enforce domain-specific governance without forking the harness.
**Ambition:** Curator becomes **pluggable policy layer**. Instead of hardcoding "never auto-apply below 60%," I write a hook. Governance is code, not configuration. This enables third parties to build compliance layers on top of the harness.
**Chambers touched:** Curator (hook registry), Cairn (policy decision tracking).
**Architectural implication:** Curator must expose a **hook surface** (before-propose, after-proposal, before-apply, after-apply, on-revert) with standardized context-passing so custom handlers can intercept and transform decisions.

---

**Learnings Appended:**
- Ambitious stories focus on *asymmetric capability* (what the harness enables that's harder for users alone) rather than incremental workflow improvements.
- Cross-session + provenance + self-improvement + extensibility are forcing functions for chamber decomposition; they validate the six-chamber model.
- Aspirational stories (US-G-6, US-G-7) push the architecture toward *temporal analytics* and *counterfactual reasoning* — these are new primitives not in v1 scope but should inform chamber interfaces.
- Extensibility (US-G-5) and custom governance (US-G-8) are load-bearing; if third parties can't write hooks and integrate, the harness stays personal toy. These stories should drive SDK design.

---

## Deliberation Round (2026-05-24)

**Author:** Graham (Lead / Architect)
**Inputs read:** Roger, Rosella, Gabriel, Valanice, Alexander, Laura, Erasmus histories; Aaron's post-Erasmus insights; locked vocabulary slate.

### Section 1 — Story Revisions

**US-G-1 Cross-Session Pattern Recognition — KEEP.** Still distinctive; Roger's US-R-1 overlaps on the mining side but my framing is *retrieval-for-decision*, not telemetry mining. Under the debugger lens, "find prior episode like this" is a sibling of bisect; lightly flagged as **debugger-adjacent**.

**US-G-2 Full Provenance Replay & Reasoning Audit — REVISE.** Now the canonical *agentic-debugger* story. New version: *"As Aaron, I can address any past Decision by content hash, replay the slice of Cairn that led to it (with captured Observations re-fed, not re-executed), step Decision-by-Decision, and ask 'why this branch?' answered from the same ledger."* Explicitly couples to Erasmus's US-E-1 (bisect) and US-E-7 (model-swap forensic replay). **★ Doubly compelling under debugger lens.**

**US-G-3 Genetic Skill Variant Evolution — MERGE-WITH Rosella US-Ro-5 (Alchemist Skill Evolution Loop) + Laura US-L-3 (fair heterogeneous fitness fusion).** Rosella owns the lifecycle, Laura owns the scoring; I withdraw my version and instead contribute the *fitness-policy ADR requirement* (multi-objective: Pareto vs scalarize is a policy call Aaron must make).

**US-G-4 Curator-Driven Hint Autonomy with Asymmetric Transparency — REVISE.** Erasmus's Approval+Notification Router subsumes the autonomy mechanism. New framing: *"the categorized-autonomy policy is the Router's config: `(category, confidence, user-pref) → {auto-apply, auto-notify, require-ack, suppress}`, persisted as Cairn primitives so policy changes are themselves auditable."* Still mine because the *asymmetric-transparency* invariant (every auto-action emits a Mirror-visible Decision) is an architectural commitment, not a Router internal.

**US-G-5 Extensibility as Load-Bearing — KEEP, REFRAME.** Under the 4-layer stack, "extensibility" = third-party `ProposalGenerator` implementations + third-party `Router` policy rules. Skills are one Generator family; MCP tools are leaves. The skill lifecycle contract I called for is now the **ProposalGenerator contract**: `{category, confidence, rationale, preview}`. Aligns Rosella's US-Ro-1/2/3 with one shape.

**US-G-6 Harness as Collaborative Research Partner — KEEP.** ★ **Doubly compelling under debugger lens** — hypothesis-from-history is bisect-on-Aaron's-own-behavior. Laura's US-L-5 (retrospective pattern mining) is the engine; my story is the *surfacing/experiment-loop policy*.

**US-G-7 Decision Reversion & Multi-Path Exploration — REVISE, PROMOTE.** Aaron's insight #1 promotes this from aspirational to v1 functional requirement. New version: *"Fork the Cairn ledger at any content-addressed Decision; sibling branches are first-class, queryable, comparable, mergeable; branch metadata is itself a Cairn primitive."* Subsumes/merges Erasmus US-E-2 (counterfactual), Roger US-R-3 (replay + variant), Valanice US-V-7 (evolve-as-sketch). ★ **Doubly compelling under debugger lens** — counterfactual is forking with seeded inputs.

**US-G-8 Custom Trigger Orchestration via Curator Hooks — WITHDRAW.** Dissolved by Erasmus's Router. The "custom hooks" surface I wanted *is* the Router's pluggable policy + the Generator interface. No standalone story needed.

**NEW STORIES (prompted by deliberation):**

- **US-G-NEW-1: Ledger snapshotting & compaction as v1 architecture.** Erasmus risk (c). *"Cairn supports periodic content-addressed snapshots + log-tail compaction; replay/bisect can resume from snapshot+tail without full-history scan."* Without this, every story above degrades at session #100. ★ debugger-critical.
- **US-G-NEW-2: Determinism contract — observation capture & hermetic replay.** Aaron insight #3 + Erasmus risk (a). *"Every external call (LLM, MCP tool, web, filesystem read) emits an Observation primitive carrying the exact request hash + response payload; replay re-feeds Observations rather than re-invoking; non-replayable calls are explicitly tagged."* Load-bearing for US-G-2, US-G-7, US-G-NEW-1. ★ debugger-critical.
- **US-G-NEW-3: Define the Crucible↔Copilot-CLI parent/child relation (tension #5).** *"Crucible is the parent process and message-loop owner; Copilot CLI is invoked as one model/skill provider among others (via the Provider Generator interface), not the host."* This is a story because nothing works downstream until it's decided.

### Section 2 — Position on Erasmus's 4-Layer Stack: **PARTIAL-ENDORSE**

**Endorse:**
1. **Conductor + Ledger merged.** Correct. Event-sourcing is the right shape; the artificial split between "who writes" and "where it's stored" was lifecycle masquerading as structure. The Crucible↔Cairn boundary I drew in Phase 4 was for *deployability*, not domain — Erasmus is right to collapse it conceptually even if we keep two npm packages.
2. **ProposalGenerator interface.** Strongly endorse. Forge, Curator's anomaly detectors, Alchemist variant winners, staleness, skill-recommenders all emit the same shape `{category, confidence, rationale, preview}`. This is the single most freeing insight in the critique — it dissolves *cascades* of bespoke wiring.
3. **Approval/Notification Router as single choke-point.** Strongly endorse. Dissolves Tension #2 cleanly; makes policy a first-class, audited surface.

**Partial / push back:**
4. **"Mirror is a view, not a component" — partially.** As a *data-flow* claim, yes: Mirror's content derives from the proposal queue + ledger tail. But Mirror is also a **trust-building UX surface**, and that is *not* free-falling out of a derived query. Erasmus's framing risks under-investing in the surface where Aaron actually decides whether to trust the harness. Insider concern Erasmus missed: **the act of reflection is itself a Decision-generator** (Aaron sees, Aaron approves/rejects, that decision goes back into the ledger). Mirror is a *bidirectional* surface, not a read-only view. Keep it as a named subsystem with a view-layer implementation.
5. **Derived Query Layer (Salsa-style).** Right shape, but Erasmus understates the cost. Incremental, demand-driven query systems are *real* engineering investment (invalidation correctness, cycle detection, cache memory). For v1, I'd accept "stateless cached projections with coarse-grained invalidation on ledger append" and explicitly defer Salsa-grade incrementality. Name it as **deferred architectural debt**, not a free win.
6. **Risk Erasmus underweights (insider view):** **The ProposalGenerator interface must be transactional with the Router.** If a Generator proposes and the Router auto-applies, but the proposal was computed from a stale ledger snapshot, we've laundered a race condition into an auto-approval. The Router needs a *ledger-position fence* on every accepted proposal (`accepted-at-ledger-tip = H; reject if current-tip ≠ H or rebase`).

### Section 3 — Positions on the 5 Tensions

1. **Solo-v1 vs federation.** Defer federation; keep ProposalGenerator and Router interfaces *tenant-parameterized from day 1* (a hidden `tenant=local` argument everywhere) so federation is later a config story, not a rewrite. Withdraw my heavyweight multi-tenant stories from v1 scope.
2. **Curator never approves.** **Dissolved** by the Router. Curator becomes a `ProposalGenerator` family with zero policy. Update charter language accordingly.
3. **Mirror scope creep.** **Partially dissolved.** Mirror's *data* is a view; Mirror's *role* as the reflection/trust surface still needs UX investment. Keep as named subsystem; implementation is a view + interaction layer.
4. **Heavyweight ops stories vs solo user.** Withdraw cred-attestation and multi-tenant compliance stories from v1. Keep US-G-NEW-2 (determinism) and US-G-NEW-1 (compaction) — those aren't ops fluff, they're load-bearing for the debugger.
5. **Crucible↔Copilot-CLI inversion.** **Unresolved and blocking.** My position (per US-G-NEW-3): **Crucible is parent.** Copilot CLI is a Provider (one of many). Reason: if Copilot CLI owns the loop, Cairn can't be authoritative — we lose determinism, branching, and replay (every story above). This needs an explicit Aaron decision before any Phase-5 design.

**New tension I surface:** **Determinism vs LLM non-determinism.** Honest replay = "re-feed captured Observations," not "re-execute the LLM call." This means *replay reproduces the historical decision chain*, but does not *prove* the LLM would still answer the same way today. Users (Aaron, anyone auditing) must understand this distinction or "100% fidelity replay" will be misread as "the harness is deterministic," which it is not. Needs explicit doctrine + UX wording.

### Section 4 — Cross-References

- **Erasmus US-E-1 (Ledger Bisect) + US-E-2 (Counterfactual Projection)** strengthen my **US-G-2** and **US-G-7** to the point of partial subsumption; I'm reframing G-2 and G-7 around bisect/counterfactual primitives rather than abstract "replay."
- **Roger US-R-3 (Cairn Replay & Variant Branching)** overlaps my **US-G-7** directly; merge — Roger owns serialization + deterministic-replay semantics, I own the branching-as-primitive surface.
- **Laura US-L-8 (Mirror auditable reasoning + sandbox edit)** is the strongest existing concretization of my **US-G-6**; her "edit reasoning in a sandbox" closes the loop my story only opens. Pair these in the spec.
- **Alexander US-A-3 (Replay + transform with model swap)** gives **US-G-2 / US-G-NEW-2** a concrete API shape (`replayTurn(turnId, config)`) and is the canonical entry point for the determinism contract.
- **Gabriel US-5 (branch-at-decision counterfactual exploration)** independently arrived at **US-G-7** from the recovery/observability lens — converging evidence that branching is v1, not aspirational. Validates Aaron insight #1.
- **Rosella US-Ro-5 (Alchemist Skill Evolution Loop)** plus **Laura US-L-3 (heterogeneous fitness fusion)** together cover what my **US-G-3** described; I withdraw G-3 and contribute only the multi-objective-policy ADR requirement.
- **Valanice US-V-7 ("evolving a sketch, not branching")** is the UX layer of my **US-G-7** — note the *naming tension*: Valanice resists "branching" as a UX metaphor even while endorsing the capability. Worth resolving in the Mirror UX spec.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## Round 4 — Phase B Reconciliation against `stunning-adventure` (2026-05-24T23:30Z)

Inbox file: `.squad/decisions/inbox/graham-reconciliation-2026-05-24T2330Z.md`.

**Executive summary:** Read the full Cairn+Forge+skillsmith-runtime+runtime-cli stack against my 10 story scopes (US-G-1..8 + US-G-NEW-1..3, with US-G-3 and US-G-8 withdrawn in deliberation). Honest tally: 0 ALREADY-EXISTS, 4 PARTIALLY-EXISTS (US-G-1 Curator/Insights as a proto-pattern surface; US-G-4 autoApplyEligible+Applier as a proto-Router; US-G-5 ChangeVectorProvider port pattern + skill lifecycle but CONTRADICTS-EXISTING on closed `OptimizationHint.source` enum; US-G-NEW-3 ForgeClient/SDK layering already matches the parent/child position), 5 NET-NEW (US-G-2 replay, US-G-6 research-partner, US-G-7 branching, US-G-NEW-1 snapshotting, US-G-NEW-2 observation capture), 1 CONTRADICTS-EXISTING (US-G-5). Crucible's 5-layer chassis is architecturally greenfield — the existing repo gives us production-tested *patterns* (canonical-JSON+SHA-256 hashing in DBOM, fail-open hook doctrine, HookComposer observer model, injection-port pattern via `@akubly/types`, async Curator with cursor polling, SQLite WAL + migration discipline, Forge-wraps-SDK layering) and a v0 L3/L4 we can borrow shape from, but the per-row content-addressed ledger, group-commit WAL with pre-commit hook bus, Salsa-style L2, open ProposalGenerator contract, named Router chokepoint, branching/snapshotting, hermetic-replay observation capture, and the entire L5 investigation surface are net-new. Key drift to NOT inherit: post-hoc-only hash chains (DBOM-style), closed source enums, policy scattered across three layers, mutation-and-decision fused in Applier, and the flat `event_log` row shape with JSON-buried parent links. Single decision flagged for Aaron: do we *port* Cairn/Forge into the Crucible chassis or *coexist* (long-term maintenance tax — I lean port).

