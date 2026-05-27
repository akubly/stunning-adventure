📌 Team update (2026-05-25): **Cycle 2 fixes shipped** (f096c20) — N1: package-lock resync + CHANGELOG; N2: `allowGlobalFallback` boolean → `FallbackPolicy` string-literal union (`'per-skill-only'` | `'full-chain'`); N3: telemetry now shows chain/skipped/selected. All 26 runtime tests green, 4 suites passing. Decision rationale in `graham-n2-fallback-policy.md`. — Graham Knight
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

### Wave 5 Review Cycle 1 Triage (2026-05-25)

Triaged 14 persona review findings on `phase-4.6/wave-5-integration` (ea02cce). Accepted 10, rejected 3, deferred 2. All fixes committed as b695fff.

**Key triage decisions:**

- **I1 (global fallback regression) — ACCEPTED.** Most important finding. `createPrescriberOrchestrationConfig` silently gained global fallback behavior when `loadExecutionProfile`'s default `fallbackContext = {}` always included `global` in the chain. Fix: `allowGlobalFallback` flag on `TierFallbackContext`, default `false`. `runForgePrescribe` explicitly opts in. This is the kind of bug that would silently degrade Curator precision — prescribers seeing aggregate global profiles instead of returning null when no per-skill data exists.

- **I2 (stale per-model vs fresh per-user) — REJECTED design change, ACCEPTED test.** The tier fallback spec explicitly decided staleness does NOT trigger fallback. A stale per-model profile is still more model-specific than a fresh per-user profile. Added interaction test proving attenuation works correctly in this scenario.

- **I7, I8 — REJECTED (pre-existing).** Both findings flag conventions that predate Wave 5. The concrete `Database.Database` type leak in runtime opts (I7) and mixed injection patterns (I8) are real but were not introduced by Wave 5. Scope creep to fix them here risks destabilizing the integration branch.

- **I9 (extract sessionFallback) — ACCEPTED.** Policy/transport separation is a clean improvement. Moved `getUserSessionForMcpFallback` to its own module. Small change, big testability win.

**Architectural pattern confirmed:** The `allowGlobalFallback` flag pattern establishes a precedent for opt-in behavior expansion in the fallback chain. Future tiers or strategies can be gated behind similar flags without changing the default behavior of existing callers. This is the "progressive enhancement" principle from the tier fallback spec made concrete.

### Wave 4 Scope Approved (2026-05-23)

Aaron approved Wave 4 scope with both design decisions resolved. Decision inbox entry filed at `.squad/decisions/inbox/graham-wave4-ratified.md`. Scope is tight and foundational: three work items (insertHintIfNew atomicity, CairnEvent extensions, forceRegenerate knob) plus integration tests. Team ownership assigned (Roger: W4-1/W4-2; Rosella: W4-3; Laura: W4-4). Branch `phase-4.6/wave-4` created and ready for team execution.

**D1 Resolved — CairnEvent Observability = Option 1**

Option 1 (additive CairnEvents) wins on principle: smallest delta, fully backward-compatible, establishes foundation for Wave 5 triggers without committing to richer alternatives. Trade-off accepted: Options 2 (dedicated channel) and 3 (unified refactor) deferred. Why now? Observability gap is blocking. Without hint state transitions and profile changes observable, Wave 5 re-prescribe triggers (on rejection, on profile bump, on staleness) cannot be built. Wave 4 solves the blocker; Wave 5 solves the polish.

**D2 Resolved — forceRegenerate = CLI Only**

CLI surface for operator escape hatch (force override prescriber dedup). Trade-off accepted: MCP generalization deferred to Wave 5. Why now? Operator need is urgent (recovery/retry when hint rejection cascades). CLI closes the gap immediately. MCP can generalize later with full Phase 5 scope clarity. Keeps Wave 4 tight; unblocks Wave 5 architecture design.

**Leadership insight: Deferred items form coherent Wave 5 scope.** Global tier fallback (cross-granularity design), staleness check (UX design), dashboard (product clarity), DB convention standardization (repo-wide question). None are blockers for Wave 4. Each requires cross-cutting design input that doesn't fit Wave 4's tight window. Wave 5 can address them together once Phase 5 clarity settles.

### Wave 3 Shipped (2026-05-23 ~21:08Z)

PR #21 merged as f27a537 on main. 1219 tests passing. 7 work items delivered end-to-end: composition root R2 (`@akubly/skillsmith-runtime`), Curator hook wiring, per-skill orchestration, E2E tests, Phase 5-ready acyclic boundaries. 14 Copilot findings addressed across 4 review cycles. 1 deferral approved: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE) → Wave 4. Wave 4 scope being drafted by Graham.

### Wave 3 Scope Design + ADR Reasoning (2026-05-23)

**Terminology reconciliation is first-class work.** Roger and Alexander used overlapping option labels (Roger's A–E, Alexander's A–D) that mapped to different options. Without a canonical mapping table (R1–R5), Aaron would face label confusion that obscures the actual decision. Lesson: when multiple contributors analyze the same design space independently, reconcile labels before presenting to decision-maker.

**Convergence signals simplify ADR framing.** Both Roger (Option B) and Alexander (Option A) independently converged on "new composition library package." When two independent analysts agree, the ADR should name the convergence explicitly and focus Aaron's attention on the remaining nuances (CLI separation, naming, scope boundaries) rather than re-arguing the full option space.

**Composition root is a durability decision, not a naming decision.** R2 (`@akubly/runtime`) vs R4 (`@akubly/curator`) is really about commitment level: R2 makes a weak, durable claim ("composition library"); R4 makes a strong, potentially brittle claim ("Curator is a package"). Prefer weaker claims when Phase 5 may reshape the architecture. Cost of R2→R4 migration is low; cost of wrong R4 commitment is high.

**Wave structure works for incremental delivery.** Wave 0 (types) → Wave 1 (primitives) → Wave 2 (plumbing + safety) → Wave 3 (wiring) is a clean decomposition where each wave is self-contained and testable. The "hard parts ship early, wiring ships later" pattern reduces risk: Wave 3 is mechanically straightforward because Wave 2 solved the data and safety problems.

### Wave 3 Ship + Wave 4 Triage (2026-05-23)

**Wave 3 shipped clean.** PR #21 (squash f27a537) merged after four cloud-review cycles processing 14 Copilot findings. One finding explicitly deferred: `insertHintIfNew()` atomicity race under concurrent writers. The deferred thread cites a partial UNIQUE index on `optimization_hints (skill_id, source, category) WHERE status IN ('pending','accepted','deferred')` plus `BEGIN IMMEDIATE` transaction wrap as the planned fix.

**Wave 4 proposal prioritizes foundation over features.** Seven documented follow-ups on the table. Recommended tight Wave 4 (3 work items): (1) insertHintIfNew atomicity (publicly committed), (2) Curator observability gap via CairnEvent extensions (architectural foundation for future re-prescribe triggers), (3) force-overwrite knob (operator need, simple API). Deferred: global tier fallback (cross-granularity design needed), staleness check (UX design required), dashboard (product clarity needed), DB convention standardization (repo-wide question).

**Observability gap is the hidden dependency.** Investigation of Laura's Wave 3 trigger ambiguity surfaced a deeper architectural gap: Curator has no read surface into hint state transitions, profile schema versioning, or profile change history. Without observability instrumentation, Wave 5+ re-prescribe triggers (on hint rejection, on profile bump, on staleness) are unimplementable. Solving the atomicity race plus the observability gap in Wave 4 unblocks richer operator workflows in Wave 5.

### Wave 3 Capability Check-In (2026-05-23)

Wave 3 capability check-in produced for Aaron before transition to Wave 4. Documented: (1) concrete user-observable capabilities across session telemetry, change tracking, prescriber-driven optimization, DBOM export; (2) plumbing-only flows not yet user-reachable (e.g., new event types defined but no consumer); (3) capability gaps blocking user/operator scenarios (Wave 4 deferrals: atomicity, observability, force-overwrite; Phase 5: cloud PGO, full graph, MCP exposure). Delivered as scannable prose inventory (~500-700 words) to frame Wave 4 session context.

### Forge Use-Cases & User Stories (2026-05-23)

Produced Forge use-cases & user stories for Aaron pre-Wave 4. Grounded analysis in actual user roles vs. theoretical personas. Five personas identified from code/docs: Skill Author (iterative refinement), Skill Operator (reliability/observability), Autonomous Curator (background optimization), Platform Developer (system evolution), Agent Builder (composition). Strongest maturity gradient is Skill Operator → Autonomous Curator (Session Start Hook delivers end-to-end auto path). Highest-leverage gaps: (1) force-regenerate (operator recovery), (2) Curator observability (debugging prescriber outcomes), (3) stale-profile detection (confidence in automation). Format: proper user-story structure with ✅/🚧/❌ maturity markers. ~650 words, scannable for Wave 4 prioritization input.

### Skillsmith Harness Vision (2026-05-23)

Drafted comprehensive project vision document (`docs/harness-vision.md`) for Aaron — foundational artifact pre-PRD. Aaron's user story specified CLI harness that records session primitives (requests, artifacts, observations, decisions, questions), maintains auditable decision ledger ("block-chain"), enables genetic engineering of prompts/skills/agents, and builds trust through self-awareness. Vision frames six chambers: Harness (new CLI shell), Cairn (refactor for primitive ledger), Forge (exists), Geneticist (Phase 5 selection loops), Curator (expand from narrow trigger to recommendation engine), Narrator (trust-building communication layer). Document follows Aaron's exact 14-section outline: one-liner, trust gap analysis, North Star (12-18 month maturity), chamber architecture, 5 typed primitives, hash-linked ledger model, genetic loop (selection via change vectors), self-improving chamber composition, 5 trust-building behaviors, 8 non-goals, 6-wave phasing sketch, 7 success criteria (quantitative + qualitative), 10 open questions for PRD, 11-term glossary. 3,200+ words. Surfaced hardest open questions: agent decision authority model, genetic loop fitness weighting, deficiency awareness UX. Flagged scope ambiguity: "learning runtime" vs. "CLI shell" boundary needs sharpening in PRD (is Harness chamber just message loop + primitives, or does it include slash commands, agent loading, model routing?). Working name "Skillsmith Harness" pending Aaron's approval.
