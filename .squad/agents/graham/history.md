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
