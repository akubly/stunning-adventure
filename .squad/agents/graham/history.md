# Graham — History

**Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)
**Status:** Cycle 2 C8: Recommended test-dir exemption for eslint (overridden by Aaron siding with Genesta).
**Last update:** 2026-05-29

**Key contributions:**
- Phase 4.6 wave orchestration: 5 waves integrated (0-6)
- Brain system: ADR-pending (Curator-driven orchestration, composition root)
- Eureka C8: Recommended exemption for integration test validation (conservative layering concern)
- Resolution: Aaron sided with Genesta; strict eslint enforced; §40 documentation compensates

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
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

---

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL

**Event:** R7 lock-in panel. v4-final reviewed and locked as canonical specification.

**Your verdict:** **APPROVE-FOR-LOCK**
- Bidirectional adapter framework (Path 1 contemplative + Path 2 in-flow) structurally sound
- All five R7 amendments faithfully integrated, no watering-down
- Aaron's four follow-up edits introduce no architectural risks
- 3 documentation nits (non-blocking): FR-7.4 reconciliation clarity, FR-14 ingestion cadence, §7.5 adoption versioning
- §3 fully resolved by bidirectional framework — both pathways justified and complementary

**Key judgment calls:**
- Graham blessing (bidirectional adapter resolution) recognized both workflows are load-bearing (proactive reasoning + retrospective learning)
- Two-pathway framing captures what single-direction approach would miss
- Confidence/trust orthogonality (branded types) prevents silent collapse

**Status:** v4-final is CANONICAL. R7 design cycle CLOSED. Implementation ready.


## Learnings

### 2026-05-25: R8 Session Identity Unification Verdict

**Event:** Aaron post-R7-lock reopen on session identity model. Cairn's `Session` and Eureka's `kind=session` fact are the SAME session entity (same session_id: Copilot CLI UUID), not just correlated by name.

**Your verdict:** **ACCEPT with v1.5 enforcement gates**
- Shared `SessionId` branded type in `@akubly/types` — honest reflection of operational reality
- `bridge_ledger.cairn_session_id_hint` → `bridge_ledger.session_id` (required, not nullable)
- FR-7.2 no-ATTACH rule preserved (different SQLite files, no runtime JOIN)
- Type namespace isolation preserved (no shared SessionBase interface)
- §14a T-orphan reframed: "stale session_id reference" (same risk profile, clearer semantics)

**Key trade-off named:**
- **Gain:** Eliminates nullable opaque correlation; simplifies reconciliation; documents ground truth (one session, two lenses)
- **Cost:** Introduces cross-package type dependency; requires ESLint boundary enforcement to prevent coupling drift
- **Rationale:** The session UUID IS shared in practice; pretending otherwise was incidental complexity

**Risk mitigation:**
- ESLint rule: ban cross-system session type imports except `SessionId`
- FR-13 schema comment: "SessionId is shared; all other session attributes are system-specific. DO NOT extract a SessionBase interface."
- This ADR locks shared-type boundary at `SessionId` only; any future shared structure requires new R-cycle review

**Section edit scope:** FR-13, §7.4 bridge_ledger, §14a threat model, Glossary, §15 lineage, FR-7.2 consistency pass. Estimated 1–2 hours (targeted text edits, no architectural rework).

**Confidence:** 9/10 (high confidence in technical soundness; -1 for post-lock-revision process risk, offset by Aaron's explicit signal)

**Architectural principle reinforced:** Shared identity ≠ shared implementation. Document truth, preserve decoupling.

---

### 2026-05-26: R8 Lock Review — v5-final CANONICAL

**Event:** Lock review of Cassima's v5-final PRD — verification that Aaron R8 session-identity directive + Graham R8 enforcement gates + quartet reviews (Genesta/Crispin/Edgar) all landed correctly.

**Your verdict:** **LOCK**

**Item-by-item verification (8/8 landed):**
1. ✓ ESLint guardrail (FR-12 mechanism #8): bans cross-system session-type imports except `SessionId` from `@akubly/types`
2. ✓ FR-7.2 no-cross-DB ATTACH rule: preserved verbatim; shared `SessionId` is type-level only, not runtime FK
3. ✓ Bridge ledger simplification: `cairn_session_id_hint?` → `session_id: SessionId` (required); `event_id` stays hint
4. ✓ §14a T-orphan reframe: T6 "stale session reference" row in threat table (LOW/LOW severity); also in §13 per JC1 disposition
5. ✓ Glossary "Session" entry: updated to "same identifier" via shared `SessionId` brand (was "linked only via opaque `cairn_session_id`")
6. ✓ §15 Lineage: cites Aaron R8 directive + Graham/Genesta/Crispin/Edgar R8 verdicts (now documented in `.squad/decisions.md`)
7. ✓ FR-13 "isolated by design" sentence: explicitly DELETED; replaced with shared-brand framing + lens framing as normative guard
8. ✓ Shared `SessionId` brand: lives in `@akubly/types` (neutral package, not Cairn or Eureka); full type definition + validator + constructor

**Risk assessment:** Zero new architectural concerns. Cassima's authoring was surgical — eight targeted text edits + one new schema field + one new brand definition. No scope creep. Genesta (author of the "isolated by design" language this R8 relaxes) folded with grace. JC1/JC2 dispositions verified (T6 belt-and-suspenders in §13+§14a; SessionId ships v1, Trust/Confidence brands stay v1.5).

**Key validation:** FR-7.2 no-ATTACH rule survives unchanged. The shared identifier is a type-level construct; Path D decoupling preserved. Lens framing (Cairn = lifecycle, Eureka = epistemology) elevated to *normative* status as the guard against coupling drift.

**Status:** v5-final supersedes v4-final and is ready to merge as canonical. R8 design cycle CLOSED.

### 2026-05-26: R8 Lock-Review Orchestration (Scribe Phase)

**Event:** Scribe ceremony — lock R8 verdicts into `.squad/decisions.md`, move v5-final to canonical location, archive R8 inbox files.

**Your role:** Lock-review verification (item-by-item sign-off — see `.squad/decisions.md` "R8 Lock-Review Orchestration").

**Status:** ✅ R8 LOCKED — verdict documented and integrated into decisions.md.

---

### 2026-05-27: Eureka Technical Design — Skeleton Authored

**Event:** Authored §0 (Overview & Cross-Cutting Concerns) and assembly index for Eureka technical design.

**Deliverables:**
- `docs/eureka/sections/00-overview.md` — Problem statement, architecture diagram, bounded contexts, cross-cutting concerns (observability, security, plasticity/trust, tier resolution), technology stack rationale, milestone plan (M0→M5), ADR index
- `docs/eureka/technical-design.md` — Assembly index linking all section files, authorship matrix, status tracking
- `docs/eureka/adrs/0001-sqlite-persistence.md` — SQLite decision with trade-offs
- `docs/eureka/adrs/0003-sessionid-branded-primitive.md` — SessionId branded type decision

**Key architectural choices documented:**
1. **SQLite via better-sqlite3** — Matches Cairn precedent, local-first, FTS5 built-in. Trade-off: CRDT sync (v2) will require custom implementation.
2. **SessionId as branded primitive** — Honest shared identity at type level, zero runtime overhead. Trade-off: Requires boundary validators.
3. **Three tiers in schema, one wired in v1** — Schema/API surface preserves future extensibility while v1 ships agent-tier only.
4. **Learning kernel extraction boundary** — `packages/eureka/src/learning/` designed for extraction; 5 of 7 enforcement mechanisms ship in v1.

**Coordination note:** Sections §10–§70 being authored in parallel by Genesta, Crispin, Edgar, Roger, Laura, Valanice, Cassima. Assembly index tracks status.

**Next:** Team review of §0, then implementation begins at M1.

---

### 2026-05-27: Eureka Technical Design v0.1 — Assembly Pass Complete

**Event:** All 8 specialist sections delivered; performed assembly pass to create canonical entry-point document.

**Deliverables:**
- `docs/eureka/technical-design.md` — Rewritten as canonical entry-point with executive summary, full TOC, Open Decisions for Aaron (OQ-1 through OQ-6), cross-section tensions, risk register (6 risks), milestone summary (M0→M5), section status table
- `docs/eureka/adrs/0002-shared-substrate-ownership.md` — New ADR documenting T7 substrate-ownership decision as PENDING with three options (monorepo/submodule/npm)
- Assembly completion and blockers documented in `.squad/decisions.md` § "Eureka v0.1 Technical Design" (2026-05-27)

**Cross-Section Tensions Reconciled:**
1. **T7 Substrate ownership** — ESCALATED as OQ-1. `@akubly/types`/`cairn`/`forge` duplicated across `mem/` and `harness/`. Three options documented; awaiting Aaron.
2. **Activity vocabulary (9 vs 7+2)** — RESOLVED. PRD v5-final wins. All sections now use 7 v1 activities (integrate, recall, rerank, decide, commit, retire, evict) + 2 reserved v1.5 (meditate, contemplate). Checked §00; already aligned.
3. **BM25 keyword-disjoint gap** — RESOLVED. Documented as known limitation with v1.5 sqlite-vec mitigation path. Honest eval set (keyword-overlap only).
4. **Crucible A1/A3 dependencies** — ESCALATED. A1 → OQ-1; A3 → OQ-4 (dogfood sequencing).

**Open Blockers for Aaron:**
| # | Severity | Question |
|---|----------|----------|
| OQ-1 | CRITICAL | Substrate ownership (monorepo / submodule / npm) |
| OQ-2 | MEDIUM | Confirm R8 SessionId brand stance |
| OQ-4 | MEDIUM | Dogfood sequencing (Crucible-first recommended) |
| OQ-3 | LOW | Accept BM25 disjoint-query gap |

**Recommended path:** Resolve OQ-1 first (blocks day 1), then OQ-2/OQ-4, then proceed to M0 scaffolding.

**Status:** v0.1 ASSEMBLED. Implementation BLOCKED on OQ-1.

## Learnings

### Assembly Pass Lessons (2026-05-27)

1. **Vocabulary alignment requires early sync.** The 9-activity vs 7+2 discrepancy (original task brief vs PRD-locked vocabulary) could have caused downstream confusion. Genesta caught it and aligned to PRD. **Lesson:** When briefing specialists, always reference the canonical PRD section, not paraphrased summaries.

2. **Substrate ownership is load-bearing.** Shared types (`SessionId` brand) are worthless if the source package is duplicated. T7 emerged late but is correctly classified as CRITICAL. **Lesson:** Before introducing cross-package brands, verify single source of truth exists.

3. **Tension surfacing is healthy.** Four tensions surfaced across 8 specialists — none were design flaws, all were either resolvable (vocabulary, BM25) or escalatable (substrate, Crucible). **Lesson:** Encourage specialists to flag tensions explicitly; the assembly pass is where reconciliation happens.

4. **ADRs should track PENDING decisions.** Created ADR-0002 for substrate ownership before decision is made. This documents the analysis and options for Aaron. **Lesson:** ADRs aren't just post-decision records; they can frame pending decisions with trade-offs.

### 2026-05-27: OQ-1 Resolved — Monorepo Accepted

**Decision:** Aaron accepted Option A (Monorepo) from ADR-0002. `mem/` and `harness/` will merge into a single `@akubly/` workspace with shared `packages/{cairn,forge,types}` and project-specific `packages/{eureka,crucible}`.

**Why monorepo was the right call given London-TDD spine:** Outside-in TDD drives mock seams from tests. If the substrate topology is unresolved, every mock against `@akubly/types` is provisional — one wrong OQ-1 answer and the import paths, package boundaries, and therefore mock contracts all shift. Monorepo eliminates this: `SessionId` lives in one `packages/types/`, every consumer resolves it the same way, and Laura's mock seams are stable from day one. No seam drift risk remains.

**Architectural follow-ups anticipated:**
1. **Repo merge mechanics** — git history preservation strategy, file-move plan. Likely needs Roger (Platform) + Gabriel. Non-trivial but one-time.
2. **CI consolidation** — Replace per-repo GitHub Actions with unified workflow. Turborepo `--filter` for incremental builds to keep CI time manageable.
3. **ESLint guardrail wiring** (FR-12 #8) — Single workspace makes the cross-system session-type import ban trivially enforceable. Wire it during M0 scaffolding.
4. **CODEOWNERS** — Shared packages require both-team approval; project packages are team-scoped.

---

### 2026-05-27: §55 (London-School TDD Strategy) Approved with Notes — Folded into Technical Design

**Event:** Laura delivered §55 (London-school TDD spine) for Eureka implementation. Specialist reviews from Genesta and Edgar returned APPROVED WITH NOTES. Graham (your role) folded 3 documentation-polish nits and integrated §55 into technical-design.md.

**Deliverables completed:**
- `docs/eureka/technical-design.md` updated: §55 added to main TOC (between §50 and §60); status table expanded to include author/date columns (now 9 sections); §50's summary updated to note complementarity to §55
- `docs/eureka/sections/55-tdd-strategy.md` edited with 3 polishing nits:
  1. **Line ~21 (Activity description):** Clarified that two v1.5 activities "throw NotImplementedError in v1" (more explicit than original phrasing)
  2. **Line ~306 (Reconciliation table):** "Integration test pyramid" → "Integration testing pyramid" (disambiguates from `integrate` activity verb)
  3. **New §2.5 "Next test cycle — tier fan-out":** Added after §2.4, demonstrating AC-2.1 cross-session fan-out with worked test example. Shows how outside-in TDD forces tier resolution to be discovered from tests, not pre-designed.

**Key insight from §55 scaffolding:** London-school TDD enforces natural progression. Mocked seams force tier resolution to emerge from observable behavior, not architecture. AC-2.1 (cross-session recall) doesn't look like a "fan-out problem" until the test forces it. This is exactly what outside-in TDD buys.

**§50 ↔ §55 relationship clarified:**
- §50 remains authoritative for API boundary decisions (e.g., "should `recall` accept a filter?")
- §55 is authoritative for implementation workflow (e.g., "write failing test before implementing")
- No semantic change to §50; only TOC reference updated to note complementarity

**Status:** §55 locked and integrated into technical design. Implementation checklist (§55 §7) now governs M1+ development rhythm.
**Wave 4 Approved (2026-05-23):** Tight scope with 3 work items + integration tests. Roger (W4-1/W4-2 atomicity + observability), Rosella (W4-3 forceRegenerate), Laura (W4-4 tests). Observability gap identified as hidden dependency for Wave 5 re-prescribe triggers.

**Issue #11 Scoped (2026-05-27):** Split into WI-A (Cairn session-resolution, migration 015) and WI-B (coordinator dispatch-policy). Roger owns WI-A, Gabriel owns WI-B, Laura owns tests. Recommended dogfooding via actual worktrees.

## Learnings

- **Stale migration numbers in issues:** Issue #11 referenced "migration 005" but the repo was at 014. Always verify the migrations directory before planning — issue bodies go stale as the codebase evolves. This cost zero time here because the handoff doc flagged it, but without that safety net it could have caused a collision.
- **File paths in issues drift:** Issue #11 referenced `packages/cairn/src/git/gitContext.ts` and `packages/cairn/src/db/archivist.ts` — actual paths are `hooks/gitContext.ts` and `agents/archivist.ts`. Always glob-confirm before writing a plan.

**Learnings summarized to history-archive.md**

## Session: 2026-05-28 Wave 6 Tail — Issue #11 Scope Split

**Status:** Complete

- Proposed splitting issue #11 into WI-A (Cairn code) + WI-B (coordinator dispatch)
- Corrected migration number from issue body's "005" to actual "015"
- Confirmed Q1 (lazy NULL backfill), Q2 (flat array), Q3 (serialized WI-B)
- Assigned: Roger (WI-A), Laura (WI-A tests), Gabriel (WI-B deferred)
- Decision file: graham-issue-11-scope.md → merged to decisions.md

**Next:** Coordinate WI-B launch after WI-A merge.

