# Alexander — History (Summarized)

## Summary

**Total entries:** 5 major consultations spanning Phase 4.5 SDK + Phase 4.6 change vectors + Q&A + Round 2 brain system consulting + Round 2 roster proposal

| Date | Event | Status |
|------|-------|--------|
| 2026-05-05 | Initial Brain Sizing (Q&A) | ✅ Completed |
| 2026-05-06 | Phase 4.6 Spec Clarifications | ✅ Completed |
| 2026-05-01 | Change Vector Questions (F1-F2 analysis) | ✅ Completed |
| 2026-05-05–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-22 | Brain Project Roster Proposal (Integration Engineer Core Role) | 🟡 Proposal pending Aaron |

**Key themes:**
- SDK runtime: Forge execution model, decision gates, DBOM provenance
- Change vectors: Before/after metric snapshots, min sessions observed, net impact weighting
- Brain system: Evolved from "monorepo packages/brain/" → "NEW REPO" → "Integration Engineer Phase 1 on-call, data boundaries specialist"
- Brain roster: Proposed Integration Engineer (core) on-call role with Cairn-primary commitment

**Recent decision:** Alexander proposes Integration Engineer on-call role for Brain adapters + MCP tools; recommends new repo with Postgres backend + deployment boundary. Core strength is data-oriented boundaries; Brain needs agentic cognition specialists.

---

## Archive (Summarized)

### Phase 4.5-4.6 SDK + Change Vectors Work (2026-05-01 to 2026-05-04)

**Scope:** Finding 8 fixes, Phase 4.6 foundation (Wave 1 A1-A4), lockout-compliant fixes (Wave 3), advisory fixes (Cycle 3).

**Key deliverables:**

1. **FeedbackSource.getProfile enhancement:** Added optional `granularityKey` parameter to address per-user/per-model profiles. DB key is `(skill_id, granularity, granularity_key)` but contract was less expressive. Fixed with backward-compatible optional param.

2. **Change Vector Foundation (Phase 4.6 Wave 1):** 
   - Migration 012 + schema v12 registration
   - changeVectors CRUD module (with explicit db param for transactions)
   - Curator sweep integration (post-event-loop, anti-join on hints without vectors)
   - Weight constants mirrored in Cairn (can't import Forge); regression test guards divergence

3. **Lockout-Compliant Fixes:** Fixed Rosella's confidence → confidenceBoost rename in prescribers, ensuring semantic clarity (level vs boost).

4. **Advisory Fixes:** safeMin guard for log-denominator (Math.max(1, minVectors)), JSDoc enhancements, DRY extraction for identical sort blocks.

**Architecture decisions:**
- Circular dependency prevention: duplicate weights + regression test (not imports)
- Sign convention: deltas stored as `after - before`; negate lower-is-better for net_impact
- Transactional CRUD: explicit db parameter better than internal getDb() for Curator contexts
- Query planning: SQLite handles JOIN + index-based filtering efficiently for change_vectors

**Test status:** 1034+ passing (cairn 478 + forge 556+, up from baseline 990).

**Lessons:**
- Shared type contracts less expressive than storage = contract bug, not feature gap. Additive optional params have near-zero risk.
- Migration framework handles idempotency; DDL template is single exec() per migration.
- Lockout rule is real safety: cross-review catches blind spots single review misses.
- JSDoc on type fields with runtime invariants should name the code location enforcing invariant, not just intent.

---
- Extracted to `utils.ts` as a pure, exported function. Both prescribers now delegate with one call each, removing 12 lines of duplication.
- Pattern: when a comment in code says "same as [other place]", treat it as a TODO:extract, not just documentation.

**Build:** forge package clean (`tsc --project packages/forge/tsconfig.json` exit 0). Full monorepo build has a pre-existing error in cairn's `curator.ts:631` (Rosella's work-in-progress, not touched here).

**Commits:** fc897a0, 8f16ad1, 04f02b0

## Learnings

## R6 Ceremony — Source-Reading Rule Lifted (2026-05-24)

**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate).

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.


## Learnings

**Commits:** fc897a0, 8f16ad1, 04f02b0

**Build:** forge package clean (`tsc --project packages/forge/tsconfig.json` exit 0). Full monorepo build has a pre-existing error in cairn's `curator.ts:631` (Rosella's work-in-progress, not touched here).

- Pattern: when a comment in code says "same as [other place]", treat it as a TODO:extract, not just documentation.
- Extracted to `utils.ts` as a pure, exported function. Both prescribers now delegate with one call each, removing 12 lines of duplication.
---

- JSDoc on type fields with runtime invariants should name the code location enforcing invariant, not just intent.
- Lockout rule is real safety: cross-review catches blind spots single review misses.
- Migration framework handles idempotency; DDL template is single exec() per migration.
- Shared type contracts less expressive than storage = contract bug, not feature gap. Additive optional params have near-zero risk.

**Lessons:**

**Test status:** 1034+ passing (cairn 478 + forge 556+, up from baseline 990).

---

## 2026-05-27: London-School TDD Strategy Authored + OQ-1 Monorepo Resolution

**Event:** London-school TDD spine delivered and reviewed  
**Impact:** Shared substrate topology finalized; data boundaries stable for Brain integration  

**For Alexander's context:**
- **OQ-1 RESOLVED:** Aaron chose Option A (monorepo). `mem/` and `harness/` merging into `@akubly/` with shared `packages/{cairn,forge,types}`. SessionId brand is now a single source of truth in `@akubly/types`. Integration Engineer role (your proposed Eureka Phase 1 on-call, data-oriented boundaries specialist) can build adapters against a fixed substrate.
- **TDD Spine Live:** `docs/eureka/sections/55-tdd-strategy.md` authored and approved. London-school outside-in approach defines mock contract style for CuratorStore, ClockProvider, and session-scoped query boundaries. Your data-oriented strength is needed for adapter design (Brain ↔ Eureka ↔ Cairn + Forge).
- **MCP Tools + Adapters Ready:** Integration Engineer role aligns perfectly with Brain's data-boundary expertise. Monorepo enables cleaner cross-package imports (no longer npm-publish-to-sync); your adapter code can work with shared `@akubly/types` directly.

**Next:** Integration strategy can proceed with stable type contracts. Brain adapters can rely on SessionId brand and Eureka's emerging session-scoped signatures.


- Query planning: SQLite handles JOIN + index-based filtering efficiently for change_vectors
- Transactional CRUD: explicit db parameter better than internal getDb() for Curator contexts
- Sign convention: deltas stored as `after - before`; negate lower-is-better for net_impact
- Circular dependency prevention: duplicate weights + regression test (not imports)
**Architecture decisions:**

4. **Advisory Fixes:** safeMin guard for log-denominator (Math.max(1, minVectors)), JSDoc enhancements, DRY extraction for identical sort blocks.

3. **Lockout-Compliant Fixes:** Fixed Rosella's confidence → confidenceBoost rename in prescribers, ensuring semantic clarity (level vs boost).

   - Weight constants mirrored in Cairn (can't import Forge); regression test guards divergence
   - Curator sweep integration (post-event-loop, anti-join on hints without vectors)
   - changeVectors CRUD module (with explicit db param for transactions)
   - Migration 012 + schema v12 registration
2. **Change Vector Foundation (Phase 4.6 Wave 1):** 

1. **FeedbackSource.getProfile enhancement:** Added optional `granularityKey` parameter to address per-user/per-model profiles. DB key is `(skill_id, granularity, granularity_key)` but contract was less expressive. Fixed with backward-compatible optional param.

**Key deliverables:**

**Scope:** Finding 8 fixes, Phase 4.6 foundation (Wave 1 A1-A4), lockout-compliant fixes (Wave 3), advisory fixes (Cycle 3).

### Phase 4.5-4.6 SDK + Change Vectors Work (2026-05-01 to 2026-05-04)

## Archive (Summarized)

---

**Recent decision:** Alexander proposes Integration Engineer on-call role for Brain adapters + MCP tools; recommends new repo with Postgres backend + deployment boundary. Core strength is data-oriented boundaries; Brain needs agentic cognition specialists.

- Brain roster: Proposed Integration Engineer (core) on-call role with Cairn-primary commitment
- Brain system: Evolved from "monorepo packages/brain/" → "NEW REPO" → "Integration Engineer Phase 1 on-call, data boundaries specialist"
- Change vectors: Before/after metric snapshots, min sessions observed, net impact weighting
- SDK runtime: Forge execution model, decision gates, DBOM provenance
**Key themes:**

| 2026-05-22 | Brain Project Roster Proposal (Integration Engineer Core Role) | 🟡 Proposal pending Aaron |
| 2026-05-05–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-01 | Change Vector Questions (F1-F2 analysis) | ✅ Completed |
| 2026-05-06 | Phase 4.6 Spec Clarifications | ✅ Completed |
| 2026-05-05 | Initial Brain Sizing (Q&A) | ✅ Completed |
|------|-------|--------|
| Date | Event | Status |

**Total entries:** 5 major consultations spanning Phase 4.5 SDK + Phase 4.6 change vectors + Q&A + Round 2 brain system consulting + Round 2 roster proposal

## Summary

# Alexander — History (Summarized)


---

## Cross-Team Context: Eureka v1 Design Package Locked (2026-05-28)

**Status:** Eureka v1 design package completed 3-cycle persona review and is now **M1 implementation-ready**.

**What changed:** 19 cycle-1 findings (3 blocking, 11 important, 5 minor) all accepted and landed in cycle 2 fix wave. Cycle 3 cleanup addressed 4 advisories. Design contradictions resolved:
- B1: Scoring formula canonicalized to additive (0.50 relevance + 0.20 importance + 0.20 trust + 0.10 recency)
- B2: Trust/retire semantics: field-level immutability + explicit retirement flag + zombie-fact preservation
- B3: Decision ownership: Forge writes audit (immutable), Eureka writes learning fact (mutable), shared decision_id

**Key fact-correction:** ACT-R exponent corrected 0.7 → 0.5 (caught by Compliance reviewer during cycle 2).

**Deliverables:** PRD v5, TDD Strategy (§55), Technical Design (§00–§50). All documents locked for M1.

**M1 Go/No-Go:** Design ready. Eval set grounded in mem/ repo (M0 deliverable). M1–M5 milestones validated by Pragmatist reviewer.

**For you:** If your work depends on Eureka design decisions, those are now stable. Cross-refs and canonical values are in .squad/decisions.md (Cycle 1 + Cycle 3 sections).

**Commits:** f68873d (cycle 2 fix wave) + 37370f9 (cycle 3 cleanup).
