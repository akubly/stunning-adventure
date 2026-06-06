# graham — History Archive

Entries archived 2026-06-05 (older than 30 days).

---

---

**Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)
**Status:** M0/M1 dogfood scope in flight. M0 shipped; M1 PR #40 open (not merged).
**Last update:** 2026-05-31
**Status:** M5+M6 branch prep complete. Feature branch `eureka/m5-m6-trust-feedback` ready for review-cycle.
**Last update:** 2026-05-30

**Key contributions:**
- Phase 4.6 wave orchestration: 5 waves integrated (0-6)
- Brain system: ADR-pending (Curator-driven orchestration, composition root)
- M0/M1/M2 dogfood scope delivered: 3 strategic synthesis passes (turns G1/G2/G3)

## Dogfood Scope Synthesis (2026-05-31, 3 turns)

**Summary:** After PR #32 shipped, Aaron asked "what's next for Forge?" → Graham completed 3-pass synthesis. Aaron set priority: packaging + dogfooding first.

**Turn G1 (Synthesis: strategic next moves):**
- Forge Phase 4.6 surface fully implemented (9 work items shipped)
- Eureka v1 landing `recall` with injectable `FactStore` seam
- Next fork: (a) Eureka-pull integration or (b) dogfood packaging
- Consensus emerging toward dogfood-first (real signal > further design)

**Turn G2 (Backlog inventory):**
- 6 hard-designed items (FactStore adapter, forge→Eureka wiring, trustFloor seam, etc.)
- 5 soft-designed items (GP-tournament, Meta-optimization, etc.)
- 5 aspirational (long-term vision)
- **Conclusion:** Phase 4.6 surface closure confirmed — no missing load-bearing pieces

**Turn G3 (Dogfood scope post-priority-reset):**
- Aaron directive: "Packaging + installability + dogfooding is priority #1"
- Aaron directive: "Defer aggressive Eureka-pull integration moves until Eureka stabilizes"
- Aaron directive: "GP-tournament + Meta-optimization noted as compelling-but-deferred"
- **Deliverable:** M0/M1/M2 plan:
  - **M0** (alexander): forge-mcp registration in plugin + copilot configs → PR #36 ✅ shipped b22c8e7
  - **M1** (roger): hint consumption MCP tools (cairn MCP expand recall hints → decision hints) → PR #40 ✅ open
  - **M2** (gabriel): bash hooks + README (install forge-mcp, shell init integration)

**M1 Status (2026-05-31):** Roger dispatched M1 PR #40 (list_optimization_hints + resolve_optimization_hint). Migration 017 (resolution_note column). +15 tests → 708 total. Build clean. Orchestration log: 2026-05-31T19-19-47Z.

---

## Eureka C8: Recommended test-dir exemption for eslint (overridden by Aaron siding with Genesta)

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
## 📋 SUMMARY (as of 2026-05-31)

**Current Focus:** Crucible CTD final review + post-CTD ADR authoring  
**Latest Major Work:** PR #33 cloud-review-cycle round 5 — 3 Copilot findings addressed (fork_resume schema, ADR-0019 payloads, predicate timing honesty); Scribe merged and staged  
**Key Architectural Contributions:** Replay-determinism bug finding, childSid hybrid protocol review, L3.5 Scheduler Phase 0.5 stub acceptance, sub-kind governance completeness  

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

**Learnings summarized to history-archive.md**

---

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

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



---

# Graham — History Archive

Archived: 2026-06-01

---

**Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)
**Status:** M0/M1 dogfood scope in flight. M0 shipped; M1 PR #40 open (not merged).
**Last update:** 2026-05-31
**Status:** M5+M6 branch prep complete. Feature branch `eureka/m5-m6-trust-feedback` ready for review-cycle.
**Last update:** 2026-05-30

**Key contributions:**
- Phase 4.6 wave orchestration: 5 waves integrated (0-6)
- Brain system: ADR-pending (Curator-driven orchestration, composition root)
- M0/M1/M2 dogfood scope delivered: 3 strategic synthesis passes (turns G1/G2/G3)

## Dogfood Scope Synthesis (2026-05-31, 3 turns)

**Summary:** After PR #32 shipped, Aaron asked "what's next for Forge?" → Graham completed 3-pass synthesis. Aaron set priority: packaging + dogfooding first.

**Turn G1 (Synthesis: strategic next moves):**
- Forge Phase 4.6 surface fully implemented (9 work items shipped)
- Eureka v1 landing `recall` with injectable `FactStore` seam
- Next fork: (a) Eureka-pull integration or (b) dogfood packaging
- Consensus emerging toward dogfood-first (real signal > further design)

**Turn G2 (Backlog inventory):**
- 6 hard-designed items (FactStore adapter, forge→Eureka wiring, trustFloor seam, etc.)
- 5 soft-designed items (GP-tournament, Meta-optimization, etc.)
- 5 aspirational (long-term vision)
- **Conclusion:** Phase 4.6 surface closure confirmed — no missing load-bearing pieces

**Turn G3 (Dogfood scope post-priority-reset):**
- Aaron directive: "Packaging + installability + dogfooding is priority #1"
- Aaron directive: "Defer aggressive Eureka-pull integration moves until Eureka stabilizes"
- Aaron directive: "GP-tournament + Meta-optimization noted as compelling-but-deferred"
- **Deliverable:** M0/M1/M2 plan:
  - **M0** (alexander): forge-mcp registration in plugin + copilot configs → PR #36 ✅ shipped b22c8e7
  - **M1** (roger): hint consumption MCP tools (cairn MCP expand recall hints → decision hints) → PR #40 ✅ open
  - **M2** (gabriel): bash hooks + README (install forge-mcp, shell init integration)

**M1 Status (2026-05-31):** Roger dispatched M1 PR #40 (list_optimization_hints + resolve_optimization_hint). Migration 017 (resolution_note column). +15 tests → 708 total. Build clean. Orchestration log: 2026-05-31T19-19-47Z.

---

## Eureka C8: Recommended test-dir exemption for eslint (overridden by Aaron siding with Genesta)

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
## 📋 SUMMARY (as of 2026-05-31)

**Current Focus:** Crucible CTD final review + post-CTD ADR authoring  
**Latest Major Work:** PR #33 cloud-review-cycle round 5 — 3 Copilot findings addressed (fork_resume schema, ADR-0019 payloads, predicate timing honesty); Scribe merged and staged  
**Key Architectural Contributions:** Replay-determinism bug finding, childSid hybrid protocol review, L3.5 Scheduler Phase 0.5 stub acceptance, sub-kind governance completeness  

---

📌 **PR #33 Cloud-Review-Cycle Round 5 COMPLETE** (2026-05-31T22:55Z): Graham addressed 3 Copilot findings. (1) Fork resume schema: Added authoritative payload schema for `fork_resume` sub-kind in §6.3, completing registry-level governance alongside `fork_origin` and `fork.collision_choice`. (2) ADR-0019 acceptance signal: Updated concrete examples to use actual `fork.collision_choice` payload shape (chosenOption/existingChildSid/resultingChildSid) instead of generic placeholders. (3) Predicate timing honesty: Reframed v1 Hook Bus predicate timing as cooperative measurement with post-hoc telemetry + retry-budget quarantine, not hard preemption (v1.5+ worker/process isolation). Sub-kind governance completeness + watchdog honesty patterns now captured. Build + tests passing. Decision merged to decisions.md; branch staged for Copilot re-review. — Scribe

📌 **PR #33 Cloud-Review-Cycle Round 2 COMPLETE** (2026-05-31T06:15:00Z): Graham addressed all 11 Copilot review threads on Crucible CTD ADRs. Fixes applied: ADR-0002 summary clarity, ADR-0006 PA-B3 ownership, ADR-0018 Security section, ADR-0011/0019 accepted-date stamps, ADR-0020 renumbering. Decision captured: graham-adr-number-stability.md. Build + tests passing. — Scribe

📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): Wall-clock replay-determinism bug finding (independent convergence with Laura) elevated heuristic drop from "nice-to-have" to "non-negotiable." Architectural finding: offsets are load-bearing primitives; wall-clock time is informational metadata. This discovery directly led to Aaron's decision to implement always-prompt UX without automatic nudges. — Scribe

# Graham — Key Learnings (Recent)

## 2026-06-01T22:34:34-07:00: PR #33 Cloud Review Cycle 6 — Trivial-Fix Sweep Close-Out

- Closed the cycle 6 duplicate Copilot sweep with three one-time doc fixes: aligned observability capture wording to post-filter tool results, marked the dependency-cruiser snippet as proposed/M1 scaffolding, and removed the stale ADR-0006 Shell suffix.

## 2026-05-31: PR #33 Cloud Review Cycle 5 — Sub-Kind Schema Governance + Watchdog Honesty

**Sub-kind schema completeness:**
- Sub-kind registration requires payload schema, not just enum membership. Future §6.3 additions must declare authoritative payload shape, effects, causal-edge contract, and runtime semantics. Conformance tests cannot validate enum-only vocabulary.

**Predicate timing honesty:**
- `Promise.race()` is not a sandboxing primitive for synchronous code. For v1, synchronous predicate timing is convention/cooperative measurement plus post-hoc telemetry and retry-budget quarantine. Hard preemption belongs in v1.5+ worker/process isolation.

**Pattern for governance clarifications:**
- When Copilot flags an overstated capability or missing specification, trace the root: incomplete registration? conflated with future capabilities? missing supporting artifact? Address the root, not just the surface claim.

## 2026-05-31: PR #33 Cloud Review Cycle 4 Replay Result Capture

**Status:** 3 fixes applied in commit a0db370; decision merged; Scribe session logged.

- Record results, not just choices, when results are not deterministically recoverable from inputs. ADR-0019's `--new` fork path now records `resultingChildSid`. Replay consumes recorded value; no recomputation needed.
- Pattern: For any Decision whose result depends on environment-specific state (wall-clock, random allocation), record the final identifier in payload. Generalizes beyond fork collisions.

## 2026-05-30: childSid Collision Hybrid Review

**Verdict:** APPROVE-WITH-CONDITIONS (3 conditions below).

**Key architectural insights:**
1. Parent-ledger mutation (fork Decision) is idiomatic. Structured identically to existing Question/Decision pattern. No ADR needed if framed as RFC (Request for Choice).
2. Replay correctness is clean. Decision records `chosenOption` + optional `existingChildSid`. No ambiguity or hidden complexity.
3. Scheduler is unaffected. Fork creation (L1 protocol) happens before session starts. Scheduler operates on proposals within session only.
4. Time-aware nudge needs principled basis. Wall-clock comparison inappropriate in offset-based replay system. Better heuristic: child's last-write offset + parent growth since fork point. Or drop heuristic, always prompt.

**Conditions:**
1. Parent-ledger append ADR if Aaron wants explicit coverage (alternative: frame as RFC+Decision, no ADR needed)
2. Replay test coverage (A-Fork-Collision: fork → choose fresh/resume → close → fork again → replay parent)
3. Scheduler invariant check (verify scheduler sees correct order of proposals from resumed child)

## 2026-05-30: ADR Status and Numbering Hygiene

- Accepted ADR files need concrete stamps. Accepted — <date> by Aaron is not polish; it is the lifecycle boundary.
- Landed ADR numbers are stable. Colliding pending row is renumbered, not the landed artifact. Safer review/reference continuity.
- Accepted ADRs cannot carry load-bearing open questions. Either resolve ownership in ADR or demote status.

---

## Archive

Context: PR #34 review (Copilot threads 8, 9, 10) flagged `.squad/orchestration-log/` (34 files), `.squad/log/` (1 file), and `test_results.txt` as committed despite being gitignored.

**Lesson 1 — gitignore does NOT untrack, only blocks new adds.**  
Once a file is committed, `.gitignore` has no effect on it. The only way to untrack it:
```
git rm -r --cached <path>   # removes from index, preserves local files (runtime state safe)
git rm <path>               # removes from index AND from disk (for junk files)
```
Then commit the staged deletions. After the commit, `.gitignore` will prevent re-adds.

**Lesson 2 — Coordinator spawn-prompt error that caused this.**  
My spawn instructions to Scribe listed `orchestration-log/` and `log/` as allowed Scribe-write paths that should be committed. They are gitignored runtime state and must NOT be committed. The correct allowed-paths list for Scribe:
- `decisions.md`, `decisions-archive.md`
- `agents/{name}/history.md`, `agents/{name}/history-archive.md`
- `identity/now.md`

Any other `.squad/` paths (log, orchestration-log, sessions, decisions/inbox/, .scratch/) are runtime state — gitignored, local-only.

**Lesson 3 — `test_results.txt` as tracked artifact.**  
Local test captures with ANSI codes and machine-specific paths (D:/git/...) are never source artifacts. Add to `.gitignore` under `# Local test capture artifacts` and delete from disk.


### 2026-05-29: WI-B Scoping Complete (Recovered from ae62558)

**Event:** Pre-implementation scoping decision made on cycle 4 findings.

**WI-B Scope Confirmation:** Make the coordinator CREATE worktrees per-issue instead of dispatching agents into shared main. Pre-Spawn documentation (lines 697–742) was aspirational; Gabriel to implement.

**Opt-in vs default-on decision:** Option A (Opt-in via SQUAD_WORKTREES=1) recommended for v1. Zero behavior change unless explicitly enabled. Minimal complexity — one if check. Risk is low (worst case: feature unused, status quo maintained).

**Key risk flags codified:**
- File-deletion mystery event: WI-B mitigates via isolation
- 
node_modules re-install: cleanup flow handles junction removal before git worktree remove
- Pre-Spawn documentation-only: add ACTIVE status + enforcement language
- Parallel dispatch guard: warning-only for v1
- Template drift: atomic updates across all three files

**Status:** Scoping locked. Ready for Gabriel implementation.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe

### 2026-05-30: Forge Roadmap Synthesis

**Context:** Aaron asked "what's next for forge?" after Eureka v1 (`ef06238`) and PR #32 type-tightening (`aae18ae`) landed same day.

**State as of 2026-05-30:** Forge has a full prescription pipeline — profile loading (4-tier), telemetry aggregation, `ForgePrescriberOrchestrator` with historical `ChangeVectorSummary` context, staleness attenuation, `forge_prescribe` MCP + `forge-metrics` CLI. Types are now clean (`LoadedProfileSource`, `ProfileStalenessReason`, `normalizeProfileSource`). Eureka v1 ships `recall` with composite ranker and injectable `FactStore`/`ClockProvider` seams — but the SQLite FactStore adapter is not yet built.

**Top 3 moves identified:**
1. **Eureka SQLite FactStore adapter** (M) — prerequisite for all Eureka integration; unlocks `recall` in production.
2. **Wire `recall` into ForgePrescriberOrchestrator** (S-M) — optional `factStore?` dep alongside existing `provider?`, fail-open semantics; enriches prescriber context with episodic facts.
3. **`trustFloor` RecallOptions override** (S) — small Eureka plumbing; forge will need configurable floor (>0.15 default) for high-confidence prescriptions.

**Key deferral reasoning:** Issue #17 async-IO sweep effectively closed by Alexander's T3 fix in cycle 2 — formal issue close is the right action, not implementation. Eureka `commit` activity is v1.5+ work; don't design it until FactStore adapter and recall wiring are proven.

**Coupling note:** `FactStore` interface lives in `@akubly/eureka`; forge should import type only (not impl) to keep the seam injectable — consistent with existing `ChangeVectorProvider` pattern from `@akubly/types`.

**Addendum (2026-05-30): Designed-but-unbuilt audit**

Aaron asked specifically for the designed-but-unimplemented backlog. Findings:

*Hard-designed, forge-core:*
- `AppInsightsSink` — Phase 5 cloud sink. TypeScript contract is in forge-phase5-roadmap.md §2.3. LocalDBOMSink is the placeholder. Blocked on Azure infra/budget.
- `deployment` provenance tier wiring — `ProvenanceTier` in types includes 'deployment' but `DecisionRecord` is narrowed to `'internal' | 'certification'` only. Wires in when AppInsightsSink lands.
- DAG prescription ancestry (`prescription_graph` table) — Phase 5 §2.3 illustrative schema exists. Currently linear (`parent_prescription_id`). Deferred pending change-vector population.

*Hard-designed, Eureka/forge-adjacent (prescriber loop critical path):*
- `lastAccessedAt`/`accessCount` side effects in `recall` — §55 §2.6 spec, explicit "Not yet implemented" in recall.ts:154. M2 target in London-TDD cascade.
- Trust score updates from feedback — §30 §2.3 spec, M5 target. Requires commit activity + outcome-feedback loop.
- Per-call `trustFloor` in `RecallOptions` — exact change described in recall.ts:84 TODO, F12 deferral. S-size.

*Soft-designed (Phase 5 backlog):* GP/tournament selection, meta-optimization DBOM on prescriptions, per-user/per-model change vectors, event log compaction, I10 Curator system-event handling.

*Aspirational (no design):* sqlite-vec, knowledge graph, plugin bundles, Karpathy SKILL.md, auto-scheduler.

**Key finding:** Forge's Phase 4.6 designed surface is fully implemented. Everything remaining is Phase 5+ or Eureka v1.5+. The queue is not empty but it's all explicitly future-phased, not accidentally overlooked.

**Addendum (2026-05-30): Packaging / dogfood readiness audit**

Aaron's priority reset: defer Eureka moves; get forge installable and dogfoodable first.

*Current install/run shape:* Three binaries (`forge-prescribe`, `forge-metrics`, `forge-mcp`) defined in workspace packages. Cairn DB self-initializes on first `getDb()` call — no init command needed. The `curate.ps1` hook resolves to `skillsmith-runtime/dist/hooks/sessionStart.js` at session start, auto-running the forge prescriber (Windows only). Nothing is npm-published; install path is clone → build → use.

*Critical blockers found:*
1. **`forge-mcp` not registered anywhere** — `.github/plugin/.mcp.json` and `.copilot/mcp-config.json` both only list `cairn`. The `forge_prescribe` MCP tool is completely unreachable from Copilot. Highest-priority fix.
2. **No hint consumption surface** — `optimization_hints` table has no MCP tool reader. `list_prescriptions`/`get_prescription` operate on the OLD `prescriptions` table, not forge's output. `get_status` emits a proactive "N new suggestions" count but shows no content. Aaron can't act on forge's output without direct SQLite access.
3. **Hooks are PowerShell-only** — `curate.ps1` and `record.ps1`, no bash equivalent. Auto-prescribe never fires on macOS/Linux.

*Smoothness gaps:* README has zero forge documentation; no `--list-skills` discovery command; plugin.json and plugin metadata are all labeled "cairn" (plugin identity diverged from actual scope).

*Recommended sequence:* (1) Register `forge-mcp` in `.github/plugin/.mcp.json` + `.copilot/mcp-config.json` — S, Alexander; (2) Add `list_optimization_hints` + `resolve_optimization_hint` to cairn MCP — M, Alexander + Beatrix; (3) Bash hook equivalent — M, infrastructure; (4) README forge section — S, anyone, last (write after loop is testable).
Older detailed history (before 2026-05-30) archived to `history-archive.md`.


## M2 Completion — Bash Shell Init Hooks (2026-06-01)

**Scribe note (2026-06-01):** Gabriel completed M2 (squad/m2-forge-mcp-bash-hooks, PR #44). Delivered 3 shell scripts (init/install/uninstall), README install section, and skill extraction. Design focused on idempotency and co-location with existing PowerShell hooks. All tests passing (49/49), build clean. Ready for review.

**M0/M1/M2 Dogfood Scope Status:**
- M0 (Alexander, PR #36): ✅ Shipped — forge-mcp registration + plugin config
- M1 (Roger, PR #40): ✅ Open — hint consumption MCP tools (list_optimization_hints, resolve_optimization_hint)
- M2 (Gabriel, PR #44): ✅ Open — bash shell-init hooks + install README




# Graham — History

📌 **Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)  
📌 **Last update:** 2026-06-02

## Current Status

**M0/M1/M2 Dogfood Scope:**
- M0 (Alexander, PR #36): ✅ Shipped — forge-mcp registration + plugin config
- M1 (Roger, PR #40): ✅ Open — hint consumption MCP tools (list_optimization_hints, resolve_optimization_hint)
- M2 (Gabriel, PR #44): ✅ Review-Complete (2-cycle + doc sweep) — bash shell-init hooks + install README; ready to merge

**Recent Major Work:**
- PR #33 Cloud-Review-Cycle round 6 — Crucible CTD ADR final fixes (cycle 2–6 complete)
- PR #34 gitignore hygiene findings — .squad/ committed artifacts should not be tracked
- Designed-but-unbuilt audit — Forge Phase 4.6 surface fully implemented; Phase 5+ deferred
- Packaging/dogfood readiness audit — Blockers identified: forge-mcp registration, hint consumption tools, bash hooks

**Eureka Status:**
- v1 PRD locked; v3 PRD reconciled against Cairn/Forge substrate
- R6 source-reading unblocked; trio (Genesta/Crispin/Edgar) aligned
- M5+M6 branch prep complete (eureka/m5-m6-trust-feedback ready for review)

## Key Learnings (Recent)

1. **Sub-kind schema governance:** Payload schema + effects + causal-edge contract required, not just enum membership.
2. **Predicate timing honesty:** Promise.race() is not a sandboxing primitive. v1 uses cooperative measurement + telemetry + retry-budget quarantine; hard preemption belongs in v1.5+.
3. **Replay-determinism pattern:** Record results, not just choices, when results depend on environment state.
4. **Gitignore hygiene:** .gitignore blocks new adds only; committed files must be untracked with git rm --cached.

---

## Eureka C8: Recommended test-dir exemption for eslint (overridden by Aaron siding with Genesta)

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
## 📋 SUMMARY (as of 2026-05-31)

**Current Focus:** Crucible CTD final review + post-CTD ADR authoring  
**Latest Major Work:** PR #33 cloud-review-cycle round 5 — 3 Copilot findings addressed (fork_resume schema, ADR-0019 payloads, predicate timing honesty); Scribe merged and staged  
**Key Architectural Contributions:** Replay-determinism bug finding, childSid hybrid protocol review, L3.5 Scheduler Phase 0.5 stub acceptance, sub-kind governance completeness  

---

📌 **Crucible Sprint 0 — First GREEN CYCLE COMPLETE** (2026-06-02T06:26:54Z): Roger's implementation landed; RED→GREEN complete. Acceptance scenario A1 passing (all 4 invariants GREEN). Packages scaffolded: `@akubly/crucible-core` (NEW), `@akubly/crucible-cli` (updated). Types finalized: PrimitiveKind (5-union), PrimitiveInput, Session, SessionMetadata. Range convention: inclusive-inclusive. Parent-registry approach: in-memory, logical delegation, no physical copy. Contract anchor (Laura's RED test) unchanged. Inbox decision merged; decisions archived (7-day rule); orchestration + session logs written. Sprint 0 first cycle complete. REFACTOR phase next. — Scribe

📌 **PR #33 Cloud-Review-Cycle Round 5 COMPLETE** (2026-05-31T22:55Z): Graham addressed 3 Copilot findings. (1) Fork resume schema: Added authoritative payload schema for `fork_resume` sub-kind in §6.3, completing registry-level governance alongside `fork_origin` and `fork.collision_choice`. (2) ADR-0019 acceptance signal: Updated concrete examples to use actual `fork.collision_choice` payload shape (chosenOption/existingChildSid/resultingChildSid) instead of generic placeholders. (3) Predicate timing honesty: Reframed v1 Hook Bus predicate timing as cooperative measurement with post-hoc telemetry + retry-budget quarantine, not hard preemption (v1.5+ worker/process isolation). Sub-kind governance completeness + watchdog honesty patterns now captured. Build + tests passing. Decision merged to decisions.md; branch staged for Copilot re-review. — Scribe

📌 **PR #33 Cloud-Review-Cycle Round 2 COMPLETE** (2026-05-31T06:15:00Z): Graham addressed all 11 Copilot review threads on Crucible CTD ADRs. Fixes applied: ADR-0002 summary clarity, ADR-0006 PA-B3 ownership, ADR-0018 Security section, ADR-0011/0019 accepted-date stamps, ADR-0020 renumbering. Decision captured: graham-adr-number-stability.md. Build + tests passing. — Scribe

📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): Wall-clock replay-determinism bug finding (independent convergence with Laura) elevated heuristic drop from "nice-to-have" to "non-negotiable." Architectural finding: offsets are load-bearing primitives; wall-clock time is informational metadata. This discovery directly led to Aaron's decision to implement always-prompt UX without automatic nudges. — Scribe

# Graham — Key Learnings (Recent)

## 2026-06-06: Refactor 3 GREEN Review — APPROVE

**Verdict:** ✅ APPROVE — Roger's `createSQLiteDB` implementation reviewed and approved.

**Checklist summary:**
1. **FEDERATE invariant:** PASS — zero Cairn imports in `sqlite-db.ts`; comment reference only. ESLint clean on the new file.
2. **Oracle parity:** PASS — `ledgerSize` formula, inclusive-inclusive `queryEvents` range, fork lineage storage, and all 5 InMemoryDB extensions match `in-memory-db.ts` semantics exactly. FK-safe `clear()` order (events first, then sessions). No off-by-one issues.
3. **SQL safety:** PASS — all prepared statements, no string interpolation.
4. **Resource handling:** PASS — fresh `:memory:` instance per `createSQLiteDB` call = perfect test isolation. WAL harmless on in-memory.
5. **Lint claim verified:** PASS — the single ESLint `import/named` error is in Laura's `test-db.ts` (untracked, created in RED phase), not in Roger's `sqlite-db.ts` (zero errors). Claim confirmed accurate.
6. **Tests:** 8/8 green — 6/6 crucible-core unit, 1/1 acceptance, 7/7 integration (A1-1…A1-4, B1, B2, B3). Zero regressions.

**Non-blocking nits:** WAL pragma no-op on `:memory:` (harmless intent signal); `?? null` redundant on typed `string | null`; stale `@ts-expect-error` in Laura's test-db.ts (her cleanup item).

**Architectural note:** Port-and-adapter boundary clean. `SessionManager`/`session.ts` unchanged — the `InMemoryDB` seam absorbs the Map→SQLite swap completely. FEDERATE boundary solid; foundation for file-backed Refactor 4.

## 2026-06-06: OQ-2 Event-Substrate Topology — Decision Brief Filed

📌 **OQ-2 BRIEF DELIVERED** (2026-06-06): Filed `graham-oq2-substrate-brief.md` in decisions inbox. Recommendation: Option B (FEDERATE). Key reasoning: (1) Replay determinism is non-negotiable — append-only + hash-chain + content-addressing is incompatible with CRUD semantics; merging destroys `fsck` and hermetic replay. (2) §15 already locks FEDERATE in substance across three FINAL sections; MERGE would require relitigating §3/§14/§15 at weeks of cost. (3) Reversibility is asymmetric — B→A is moderate effort, A→B risks permanent replay-determinism loss. (4) Refactor 3 proceeds as planned under B with minimal rework; under A, the DB interface, integration test, and schema all change.

**Learnings:**
- **Storage-semantics incompatibility as a first-order decision driver:** When two systems have fundamentally different write patterns (append-only vs CRUD), substrate merging doesn't save complexity — it forces one system to simulate the other's semantics, creating a fragile abstraction. The right test: can both systems' invariants survive in a shared substrate without either losing load-bearing properties?
- **Reversibility asymmetry matters more than initial cost:** When one direction of reversal risks permanent data-fidelity loss (hash-chain corruption from CRUD operations on what was an append-only log), the safe default is the more reversible option, even if it has higher ongoing tax.

## 2026-06-02: Crucible Sprint 0 Kickoff — MERGED (Session Logger)

📌 **INBOX MERGED** (2026-06-02T06:13:21Z): Graham's Crucible Sprint 0 Kickoff decision merged to `.squad/decisions.md`. Inbox file deleted. Orchestration log created: `.squad/orchestration-log/2026-06-02T06-13-21Z-graham.md`. Session log: `.squad/log/2026-06-02T06-13-21Z-crucible-first-red.md`.

**Sprint 0 scope:** Walkthrough A first RED cycle (§4.1). One acceptance test in `crucible-cli` asserting session-fork creates child with inherited ledger prefix. Mocked collaborators; no L1 substrate.

**Package decision:** Scaffold both `crucible-cli` AND `crucible-core` upfront. Cost is trivial (~10 min mechanical scaffolding via `scaffold-eureka-package-tdd` skill). Benefit: uninterrupted RED→GREEN flow — the GREEN phase immediately descends into `crucible-core` (SessionManager). Scaffolding `crucible-core` with only `export {}` is infrastructure, not implementation.

**Minimal types surface for RED:**
- `SessionId` already in `@akubly/types` — only shared brand needed.
- `PrimitiveKind` (5-member union), `PrimitiveInput` (kind/payload/causalReadSet), `Session` (id/metadata/append/query), `SessionMetadata` (parentSessionId/forkPointEventId) — all Crucible-only, live in `crucible-core` per §15 coexistence ("share identifiers, fork everything else"). NOT promoted to `@akubly/types` yet.
- `createSession()` and `fork()` — API functions from `crucible-core`.

**OQ-2 safe:** First RED test uses mocked collaborators. No WAL, no SQLite, no `~/.crucible/`. Federate-vs-merge is pre-sprint-2.

**Pattern observed:** The `scaffold-eureka-package-tdd` skill generalizes cleanly to Crucible packages. Same `package.json` shape, same vitest config, same tsconfig with `composite: true`. The skill could be renamed to something monorepo-generic.
## 2026-06-01: M8 Scope Drafted

Produced `graham-m8-scope-proposal.md` in the decisions inbox. Four slices defined (A: SqliteFactReader, B: SqliteTrustUpdater atomic mutate, C: FactStore.search() SQLite + FTS5, D: production wiring). Migration idiom proposed following Cairn's `applyMigrations` pattern. `FactStore.search()` interface locked with optional cursor pagination. Three open questions for Aaron: trust_history scope, pagination shape preference, Eureka DB lifecycle ownership.

## 2026-06-01T22:34:34-07:00: PR #33 Cloud Review Cycle 6 — Trivial-Fix Sweep Close-Out

- Closed the cycle 6 duplicate Copilot sweep with three one-time doc fixes: aligned observability capture wording to post-filter tool results, marked the dependency-cruiser snippet as proposed/M1 scaffolding, and removed the stale ADR-0006 Shell suffix.

## 2026-05-31: PR #33 Cloud Review Cycle 5 — Sub-Kind Schema Governance + Watchdog Honesty

**Sub-kind schema completeness:**
- Sub-kind registration requires payload schema, not just enum membership. Future §6.3 additions must declare authoritative payload shape, effects, causal-edge contract, and runtime semantics. Conformance tests cannot validate enum-only vocabulary.

**Predicate timing honesty:**
- `Promise.race()` is not a sandboxing primitive for synchronous code. For v1, synchronous predicate timing is convention/cooperative measurement plus post-hoc telemetry and retry-budget quarantine. Hard preemption belongs in v1.5+ worker/process isolation.

**Pattern for governance clarifications:**
- When Copilot flags an overstated capability or missing specification, trace the root: incomplete registration? conflated with future capabilities? missing supporting artifact? Address the root, not just the surface claim.

## 2026-05-31: PR #33 Cloud Review Cycle 4 Replay Result Capture

**Status:** 3 fixes applied in commit a0db370; decision merged; Scribe session logged.

- Record results, not just choices, when results are not deterministically recoverable from inputs. ADR-0019's `--new` fork path now records `resultingChildSid`. Replay consumes recorded value; no recomputation needed.
- Pattern: For any Decision whose result depends on environment-specific state (wall-clock, random allocation), record the final identifier in payload. Generalizes beyond fork collisions.

## 2026-05-30: childSid Collision Hybrid Review

**Verdict:** APPROVE-WITH-CONDITIONS (3 conditions below).

**Key architectural insights:**
1. Parent-ledger mutation (fork Decision) is idiomatic. Structured identically to existing Question/Decision pattern. No ADR needed if framed as RFC (Request for Choice).
2. Replay correctness is clean. Decision records `chosenOption` + optional `existingChildSid`. No ambiguity or hidden complexity.
3. Scheduler is unaffected. Fork creation (L1 protocol) happens before session starts. Scheduler operates on proposals within session only.
4. Time-aware nudge needs principled basis. Wall-clock comparison inappropriate in offset-based replay system. Better heuristic: child's last-write offset + parent growth since fork point. Or drop heuristic, always prompt.

**Conditions:**
1. Parent-ledger append ADR if Aaron wants explicit coverage (alternative: frame as RFC+Decision, no ADR needed)
2. Replay test coverage (A-Fork-Collision: fork → choose fresh/resume → close → fork again → replay parent)
3. Scheduler invariant check (verify scheduler sees correct order of proposals from resumed child)

## 2026-05-30: ADR Status and Numbering Hygiene

- Accepted ADR files need concrete stamps. Accepted — <date> by Aaron is not polish; it is the lifecycle boundary.
- Landed ADR numbers are stable. Colliding pending row is renumbered, not the landed artifact. Safer review/reference continuity.
- Accepted ADRs cannot carry load-bearing open questions. Either resolve ownership in ADR or demote status.

---

## Archive

Context: PR #34 review (Copilot threads 8, 9, 10) flagged `.squad/orchestration-log/` (34 files), `.squad/log/` (1 file), and `test_results.txt` as committed despite being gitignored.

**Lesson 1 — gitignore does NOT untrack, only blocks new adds.**  
Once a file is committed, `.gitignore` has no effect on it. The only way to untrack it:
```
git rm -r --cached <path>   # removes from index, preserves local files (runtime state safe)
git rm <path>               # removes from index AND from disk (for junk files)
```
Then commit the staged deletions. After the commit, `.gitignore` will prevent re-adds.

**Lesson 2 — Coordinator spawn-prompt error that caused this.**  
My spawn instructions to Scribe listed `orchestration-log/` and `log/` as allowed Scribe-write paths that should be committed. They are gitignored runtime state and must NOT be committed. The correct allowed-paths list for Scribe:
- `decisions.md`, `decisions-archive.md`
- `agents/{name}/history.md`, `agents/{name}/history-archive.md`
- `identity/now.md`

Any other `.squad/` paths (log, orchestration-log, sessions, decisions/inbox/, .scratch/) are runtime state — gitignored, local-only.

**Lesson 3 — `test_results.txt` as tracked artifact.**  
Local test captures with ANSI codes and machine-specific paths (D:/git/...) are never source artifacts. Add to `.gitignore` under `# Local test capture artifacts` and delete from disk.


### 2026-05-29: WI-B Scoping Complete (Recovered from ae62558)

**Event:** Pre-implementation scoping decision made on cycle 4 findings.

**WI-B Scope Confirmation:** Make the coordinator CREATE worktrees per-issue instead of dispatching agents into shared main. Pre-Spawn documentation (lines 697–742) was aspirational; Gabriel to implement.

**Opt-in vs default-on decision:** Option A (Opt-in via SQUAD_WORKTREES=1) recommended for v1. Zero behavior change unless explicitly enabled. Minimal complexity — one if check. Risk is low (worst case: feature unused, status quo maintained).

**Key risk flags codified:**
- File-deletion mystery event: WI-B mitigates via isolation
- 
ode_modules re-install: cleanup flow handles junction removal before git worktree remove
- Pre-Spawn documentation-only: add ACTIVE status + enforcement language
- Parallel dispatch guard: warning-only for v1
- Template drift: atomic updates across all three files

**Status:** Scoping locked. Ready for Gabriel implementation.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe

### 2026-05-30: Forge Roadmap Synthesis

**Context:** Aaron asked "what's next for forge?" after Eureka v1 (`ef06238`) and PR #32 type-tightening (`aae18ae`) landed same day.

**State as of 2026-05-30:** Forge has a full prescription pipeline — profile loading (4-tier), telemetry aggregation, `ForgePrescriberOrchestrator` with historical `ChangeVectorSummary` context, staleness attenuation, `forge_prescribe` MCP + `forge-metrics` CLI. Types are now clean (`LoadedProfileSource`, `ProfileStalenessReason`, `normalizeProfileSource`). Eureka v1 ships `recall` with composite ranker and injectable `FactStore`/`ClockProvider` seams — but the SQLite FactStore adapter is not yet built.

**Top 3 moves identified:**
1. **Eureka SQLite FactStore adapter** (M) — prerequisite for all Eureka integration; unlocks `recall` in production.
2. **Wire `recall` into ForgePrescriberOrchestrator** (S-M) — optional `factStore?` dep alongside existing `provider?`, fail-open semantics; enriches prescriber context with episodic facts.
3. **`trustFloor` RecallOptions override** (S) — small Eureka plumbing; forge will need configurable floor (>0.15 default) for high-confidence prescriptions.

**Key deferral reasoning:** Issue #17 async-IO sweep effectively closed by Alexander's T3 fix in cycle 2 — formal issue close is the right action, not implementation. Eureka `commit` activity is v1.5+ work; don't design it until FactStore adapter and recall wiring are proven.

**Coupling note:** `FactStore` interface lives in `@akubly/eureka`; forge should import type only (not impl) to keep the seam injectable — consistent with existing `ChangeVectorProvider` pattern from `@akubly/types`.

**Addendum (2026-05-30): Designed-but-unbuilt audit**

Aaron asked specifically for the designed-but-unimplemented backlog. Findings:

*Hard-designed, forge-core:*
- `AppInsightsSink` — Phase 5 cloud sink. TypeScript contract is in forge-phase5-roadmap.md §2.3. LocalDBOMSink is the placeholder. Blocked on Azure infra/budget.
- `deployment` provenance tier wiring — `ProvenanceTier` in types includes 'deployment' but `DecisionRecord` is narrowed to `'internal' | 'certification'` only. Wires in when AppInsightsSink lands.
- DAG prescription ancestry (`prescription_graph` table) — Phase 5 §2.3 illustrative schema exists. Currently linear (`parent_prescription_id`). Deferred pending change-vector population.

*Hard-designed, Eureka/forge-adjacent (prescriber loop critical path):*
- `lastAccessedAt`/`accessCount` side effects in `recall` — §55 §2.6 spec, explicit "Not yet implemented" in recall.ts:154. M2 target in London-TDD cascade.
- Trust score updates from feedback — §30 §2.3 spec, M5 target. Requires commit activity + outcome-feedback loop.
- Per-call `trustFloor` in `RecallOptions` — exact change described in recall.ts:84 TODO, F12 deferral. S-size.

*Soft-designed (Phase 5 backlog):* GP/tournament selection, meta-optimization DBOM on prescriptions, per-user/per-model change vectors, event log compaction, I10 Curator system-event handling.

*Aspirational (no design):* sqlite-vec, knowledge graph, plugin bundles, Karpathy SKILL.md, auto-scheduler.

**Key finding:** Forge's Phase 4.6 designed surface is fully implemented. Everything remaining is Phase 5+ or Eureka v1.5+. The queue is not empty but it's all explicitly future-phased, not accidentally overlooked.

**Addendum (2026-05-30): Packaging / dogfood readiness audit**

Aaron's priority reset: defer Eureka moves; get forge installable and dogfoodable first.

*Current install/run shape:* Three binaries (`forge-prescribe`, `forge-metrics`, `forge-mcp`) defined in workspace packages. Cairn DB self-initializes on first `getDb()` call — no init command needed. The `curate.ps1` hook resolves to `skillsmith-runtime/dist/hooks/sessionStart.js` at session start, auto-running the forge prescriber (Windows only). Nothing is npm-published; install path is clone → build → use.

*Critical blockers found:*
1. **`forge-mcp` not registered anywhere** — `.github/plugin/.mcp.json` and `.copilot/mcp-config.json` both only list `cairn`. The `forge_prescribe` MCP tool is completely unreachable from Copilot. Highest-priority fix.
2. **No hint consumption surface** — `optimization_hints` table has no MCP tool reader. `list_prescriptions`/`get_prescription` operate on the OLD `prescriptions` table, not forge's output. `get_status` emits a proactive "N new suggestions" count but shows no content. Aaron can't act on forge's output without direct SQLite access.
3. **Hooks are PowerShell-only** — `curate.ps1` and `record.ps1`, no bash equivalent. Auto-prescribe never fires on macOS/Linux.

*Smoothness gaps:* README has zero forge documentation; no `--list-skills` discovery command; plugin.json and plugin metadata are all labeled "cairn" (plugin identity diverged from actual scope).

*Recommended sequence:* (1) Register `forge-mcp` in `.github/plugin/.mcp.json` + `.copilot/mcp-config.json` — S, Alexander; (2) Add `list_optimization_hints` + `resolve_optimization_hint` to cairn MCP — M, Alexander + Beatrix; (3) Bash hook equivalent — M, infrastructure; (4) README forge section — S, anyone, last (write after loop is testable).
Older detailed history (before 2026-05-30) archived to `history-archive.md`.


## Learnings

### 2026-06-05: Cycle 2 Advisory Polish (N1, N2, N3)

**N3 — fork() JSDoc ≤ → < (ACCEPT):**
Most important of the three — active doc/behavior drift. `session.ts` fork() JSDoc said `offset ≤ ledger size` but `session-manager.ts` enforces strict `<` (line 24: `forkOffset >= parent.ledgerSize`). Fixed the docstring to match post-B1 behavior. Misleading docs on invariant boundaries are correctness bugs.

**N1 — Barrel test-only marker (ACCEPT):**
`resetInMemoryDb` sat on the same export line as `createSession`/`fork` in `index.ts` with no test-only signal at the barrel. The JSDoc in `session.ts` is invisible to barrel readers. Split onto its own export line with a `// Test isolation only` comment. Trivial, good hygiene.

**N2 — clear() on InMemoryDB interface (DEFER):**
Real design concern — `clear()` obligates all future `InMemoryDB` impls to a test-only method. However, `InMemoryDB` is explicitly documented as internal (not part of the public `DB` contract), and Sprint 0 will only ever have one impl. The refactor (moving `clear()` off the interface to a private helper) is clean but adds churn for zero current benefit. Logged to decision inbox for backlog consideration when Refactor 3 (SQLite adapter) lands.

### 2026-06-02: Cycle 1 Persona Review Fixes (I4, I2, M1)

**I4 — ForkLineage.root() removal (YAGNI):**
Chose option (a): remove `ForkLineage.root()` rather than widen the constructor. Rationale: zero callers, and the sentinel it produced (`forkPointEventId = 0`) conflicted with the `session.ts` convention where `forkPointEventId === null` marks root sessions. Widening the constructor to accept `null` for `forkPointEventId` would have rippled into the guard clause (`forkPointEventId < 0` doesn't cover `null`) and `isRoot()` logic. YAGNI wins — when a real caller exists, we design root() with full knowledge of the null convention.

**I2 — InMemoryDB coupling documentation:**
Added a 5-line NOTE block to the `session.ts` file-header JSDoc, positioned between the existing Sprint 0 deferral note and the closing `*/`. Placement chosen to avoid merge conflicts with Roger's concurrent changes (imports, runtime logic below line 20). The comment explicitly names the four extended methods (getOwnEvents, getMetadata, insertRootSession, pushEvent) and frames the Refactor 3 decision: either the SQLite adapter satisfies InMemoryDB's surface or session.ts restructures to use DB.queryEvents.

**M1 — SKILL doc drift annotation:**
Chose option (b): annotated `london-tdd-first-green/SKILL.md` as "Sprint 0 variant" rather than updating the strategy doc. The strategy doc (`docs/crucible-tdd-strategy.md` §4.1) is the canonical reference showing full outside-in mocked-Ledger descent. The SKILL reflects our conscious Sprint 0 simplification (real in-memory, no mocks in GREEN). The annotation explains the divergence is intentional and when the full approach applies (Sprint 1+ when acceptance surface exceeds single-module reach).

