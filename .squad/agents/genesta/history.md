# Genesta — History (Summarized)

## Core Context

**Project:** Eureka — agentic brain/memory/learning system for `packages/eureka/` in stunning-adventure monorepo.
**Role:** Lead Eureka + Substrate/Storage specialist. Co-lead with Graham.
**Current status:** Eureka v5-final LOCKED. R8 design cycle CLOSED. M2 RED→GREEN: recall() landed, storage seams locked for v1.

---

## Recent Team Activity

📌 **2026-05-28: Eureka M3 composite-ranker GREEN landed** — Edgar implemented FR-2 formula inline with §30 §1.2 canonical attention multipliers (hot=1.20, warm=1.00, cold=0.80). **SCHEMA TENSION FLAGGED:** §50 testability doc line 211 records stale multipliers (hot=1.0, warm=0.5, cold=0.1; pre-v5 placeholders). **ACTION REQUIRED:** Genesta should correct §50 line 211 to match §30 §1.2 canonical values. Not a bug — spec inconsistency between design docs. — Scribe

📌 **2026-05-28: Eureka M2 recall() GREEN landed** — London-school TDD beat complete. Storage seam locked (injected FactStore, abstract search interface). No concrete storage impl needed yet (§20 §7.4 contract test flagged). Trust floor (0.15) applied. SessionId brand incorporated. Baseline: Cairn 609, Forge 644+3todo, Eureka 1/1 ✅. M3: composite-ranker (depends on resolved FactStore interface). — Scribe

---

## Design Ceremony Summary (R1–R8)

**R1–R6 Foundation:** First-principles design through v1 PRD. Path D chosen (Eureka standalone, kernel-shaped). Prior art surveyed. Cross-pollination with Crispin/Edgar. Key crystallizations: activities are verbs, recency is gradient, kinds are tags, confidence/trust orthogonal.

**R7 Lock:** v4-final locked as canonical. Dual-axis DecisionPayload correct. Both adapter paths sound. Branded types prevent confidence/trust collapse.

**R8 Amendment:** Aaron relaxed FR-13 "isolated by design" → shared `SessionId` brand. Principle: honest design + explicit guardrails (lens framing, ESLint enforcement, schema comments) > defensive design hiding identifiers.

---

## Recent Work

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL
**Verdict:** APPROVE-FOR-LOCK
- Both adapter paths (Eureka→Forge + Forge→Eureka) correctly model confidence/trust orthogonality
- Dual-axis DecisionPayload schema correct: input_trust_avg (provenance) + reasoning_confidence (analytic)
- Path 2 asymmetry (lossy Forge→Eureka) acceptable for learning-pattern use case

**Status:** v4-final locked. Implementation ready.

### 2026-05-25: R8 Session Identity — Fold with Grace + 5 Guardrails
**Verdict:** FOLD WITH CONSTRAINTS
- Shared `SessionId` brand acceptable if guardrailed
- G1: Lens framing normative (schema comments: "DO NOT JOIN")
- G2: No runtime traversal API (Session.getEurekaFacts() forbidden)
- G3: SessionId lives in neutral @akubly/types
- G4: session_id required in both schemas
- G5: cairn_session_id → session_id (honest naming)

**Key learning:** Honest design beats defensive design when explicit guardrails exist.

### 2026-05-26: R8 Lock-Review — v5-final CANONICAL
**Verdict:** LOCK
- All 5 guardrails verified and correctly integrated
- ESLint rule (FR-12 #8) enforces boundary at build time
- v4-final "isolated by design" sentence deleted + replaced with lens framing
- Zero new architectural concerns
- Implementation ready

**Status:** v5-final canonical. R8 design cycle CLOSED.

---

## Learnings

### 2026-05-26: Crucible–Eureka Overlap Analysis
**Task:** Pre-implementation architectural coordination for two simultaneous PRDs (Crucible v1-DRAFT + Eureka v5-final)

**Key Findings:**
1. **Event Schema Collision (HIGH RISK)** — Crucible's 5 primitives (Request/Artifact/Observation/Decision/Question) vs Cairn's existing `event_log` creates dual append-only logs in same monorepo. Resolution needed: merge Crucible WAL into Cairn substrate OR federate via separate repo. Unresolved dual-write is a trap.

2. **SessionId Brand Collision (BLOCKER)** — Both PRDs mandate `SessionId` branded type in `@akubly/types`. Eureka ships first (R8 locked). Resolution: Crucible MUST import Eureka's `SessionId` brand (not define its own). Type is shared ID format; usage remains independent (ESLint guardrails prevent coupling).

3. **Decision Schema Triple Ownership** — Three decision schemas: Forge `DecisionRecord` (audit), Eureka `DecisionPayload` (deliberation), Crucible `Decision` primitive (event). Resolution: Crucible `Decision` must emit Forge `DecisionRecord` at write time (bridge for Eureka Path 2 ingestion). Without bridge, Eureka cannot learn from Crucible sessions.

4. **Prescriber Pattern Convergence (SAFE)** — Crucible's "prescribers + Router" is algorithmically identical to Forge's existing prescriber family + Eureka's sweep. Convergent substrate by design; can share `learning-kernel` in v1.5+. No v1 coordination needed.

5. **Sweep Mechanics Kinship (SAFE)** — Crucible Curator, Cairn Curator, Eureka sweep all use opportunistic background maintenance pattern. Different data models (events vs facts), same algorithm family. Can share decay formulas when kernel extraction happens (v1.5+).

**Three Coordination Gates (Pre-Crucible Sprint 2):**
- G1: Graham convenes event-substrate topology lock (merge vs federate)
- G2: Cassima updates Crucible PRD §1 to reference shared `SessionId`
- G3: Graham + Cassima lock Crucible `Decision` schema mappability to `DecisionRecord`

**Architectural Verdict:** Systems are compatible IF coordinated before Crucible's L1 WAL lands (sprint 2). All three gates must close before parallel implementation. Deferred coordination = expensive retrofit.

**Interesting-to-Eureka Findings:**
- Crucible's Coordinator-equivalent (sub-task fan-out) is reference architecture for Eureka v2 multi-agent learning
- Aperture push/pull model (notification + dashboard) is prior art for Eureka v1.5 commitment surfacing UX
- Conformance corpus infrastructure (curated sessions + CI replay + drift measurement) is exactly what Eureka US-1 eval needs — reuse, don't rebuild

**Memo Location:** `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md`

**Key Learning:** When two PRDs land simultaneously, substrate-level coordination MUST happen before sprint 2 (when storage layers lock). Waiting until "both ship, then integrate" guarantees one system's retrofit. The coordination cost is O(hours); the retrofit cost is O(weeks). Front-load the hard decisions.

### 2026-05-26: Shared Substrate Revision — G4 Coordination Protocol
**Task:** Revise three critical gates (G1/G2/G3 from overlap memo) in light of Aaron's shared-substrate directives.

**Context:**
- Original overlap memo assumed mem/ and harness/ were separate repos → substrate extraction needed
- Aaron clarified: same repo (`akubly/stunning-adventure`), two clones
- New directives: (1) same repo, (2) plan to share Cairn/Forge/Types from start, (3) separate v1s, (4) dogfood timing open

**Revised Gates:**

1. **G4: Cross-Project Coordination Protocol (NEW — TOP CONCERN)**
   - Problem: When Crucible changes cairn/forge/types, Eureka must know. When Eureka changes, Crucible must know.
   - Mechanism: (a) Shared CHANGELOG per package, (b) GitHub label `shared-substrate` triggers dual-Lead review, (c) Pre-merge Slack handoff in #squad-coordination, (d) Breaking changes require 15-min sync
   - Status: Unblocked (design ready). Graham configures tooling (<1h).
   - Owner: Graham (tooling) + Cassima + Genesta (enforce protocol).
   - **This is now the single most important gate** — operational risk starting sprint 2.

2. **G1: Event Schema Co-Design (REVISED — MEDIUM RISK)**
   - Original: Dual append-only logs (Crucible WAL vs Cairn event_log) in separate repos → collision
   - Revised: Single table, discriminator column. `EventType` enum with namespace convention (`crucible:request`, `eureka:recall`, etc.).
   - Concrete shape: Single `events` table with `event_type` discriminator. Crucible's 5 primitives → 5 enum values. Eureka future events added without migration.
   - Alternative (rejected): Two tables → loses total ordering, complicates Eureka Path 2 ingestion.
   - Gate: Before sprint 2, 15-min sync (Roger + Graham + Genesta) to lock EventType namespace.
   - Status: Unblocked (design ready).

3. **G2: SessionId Brand (REVISED — TRIVIALLY SOLVED)**
   - Original: Both PRDs mandate `SessionId` in `@akubly/types` → collision if separate repos.
   - Revised: **CLOSED.** Same repo = same file. Eureka v5 already defined it (FR-13, R8). Crucible imports as-is.
   - Nuance: Eureka's lens-framing guardrails (schema comments, ESLint) are Eureka-internal. Crucible ignores them; brand is neutral.
   - Status: Closed. No coordination needed.
   - Owner: Cassima (update Crucible PRD to reference existing type, not define new).

4. **G3: Decision Schema Triple Ownership (REVISED — STILL REAL)**
   - Original: Three schemas (Forge DecisionRecord, Eureka DecisionPayload, Crucible Decision primitive) → bridge needed.
   - Revised: Still correct, now simpler. Crucible must emit Forge `DecisionRecord` at write time (bridge pattern) so Eureka Path 2 can learn from Crucible sessions.
   - Concrete shape: `recordDecision` function writes both (a) Crucible event to cairn, (b) Forge DecisionRecord with `{source: 'crucible'}` metadata.
   - Key invariant: Forge DecisionRecord is shared decision vocabulary. Crucible writes, Eureka reads. Crucible event is internal.
   - Gate: Before sprint 3, 15-min sync (Cassima + Graham + Genesta) to review Forge API.
   - Status: Unblocked (design ready).

**Revised Verdict:**
- G2 closed (same-repo directive solved it).
- G1/G3 unblocked (designs ready, need coordination meetings).
- G4 new top concern: operational risk without coordination protocol. Must land before sprint 2.

**Recommendation:**
1. This week: Graham configures `shared-substrate` label + webhook (1h).
2. Before sprint 2: Lock EventType namespace (15-min sync).
3. Before sprint 3: Review Forge DecisionRecord API (15-min sync).

**Key Learning:** Shared-from-start is architecturally simpler than extract-later (no migration), but operationally requires active coordination. G4 protocol is the price of parallel dev on shared substrate. Without it, one team breaks the other. With it, cost is <30min/week. Coordination is cheap; retrofit is expensive.

**Memo Location:** `.squad/decisions/inbox/genesta-shared-substrate-revision.md`

### 2026-05-26T19:30:00-07:00: Shared-substrate revision round merged — G4 protocol is load-bearing, dogfood timing and schema freeze pending Aaron

### 2026-05-26: Branch-Tree Reconciliation Analysis — Git Merge Is Schema-Unaware
**Task:** Pressure-test G4 continuous coordination by analyzing branch-tree-with-reconciliation alternative (strategic checkpoints or deferred post-v1).

**Key Finding:** Git's line-oriented merge (union or 3-way) cannot reason about TypeScript semantics. Schema divergence creates compile-time-silent traps (optional-but-required fields, brand mismatches, enum additions) that manifest as integration bugs weeks later. Strategic reconciliation costs 7.5 hours over 6 weeks; deferred costs 2-5 weeks calendar time plus retrofit risk. G4 costs 3 hours and prevents retrofit.

**Quantified Verdict:** G4 wins on every dimension (time cost, calendar time, retrofit risk). Branch-tree's promised coordination savings don't materialize — reconciliation still costs O(hours) but happens when context is cold. Schema freeze hybrid is infeasible (blocks both v1s).

**Concrete Failure Modes Documented:** Union merge produces duplicate declarations (garbage output). Standard merge misses semantic conflicts (field renames compile separately, crash at integration). Deferred reconciliation back-loads all coordination to a 2-week integration sprint that blocks both shipped v1s.

**Recommendation:** Adopt G4. Tooling is trivial (<1h setup), operational cost is 15-30 min/week, and integration risk is zero.

**Key Learning:** Git merge is a line editor, not a type checker. Deferred coordination doesn't eliminate coordination — it just moves it to the worst possible time (post-ship, cold context, both teams blocked). Front-load schema decisions when context is hot and changes are in-flight. Continuous coordination at commit time is 10-40× cheaper than reconciliation at integration time.

### 2026-05-26T20:00:00-07:00: Branch-tree-vs-G4 strategy pressure test analysis merged — quantified retrofit risk (7.5-40 hours deferred coordination vs 3 hours G4), schema divergence traps (union merge produces garbage; semantic conflicts invisible to git), integration delay (1-4 sprints under reconciliation). Verdict: G4 wins on every dimension.

### 2026-05-26: G4 Scope & Ownership Recommendation — Graham-Owned Coordination Protocol with Schema Freeze Sign-Off Gate
**Task:** Define G4 MVP scope, owner, trigger conditions, and sequencing in light of Aaron's clarifications: (a) schema freeze gated on Crucible team sign-off, (b) Crucible-first dogfood confirmed.

**Recommendations:**
- **Owner:** Graham (neutral schema czar, coordinates sign-off, enforces protocol without unilateral authority)
- **MVP G4:** Schema design doc (pre-freeze sign-off by both teams) + CHANGELOG/label/Slack handoff (post-freeze mutations). Cut required cross-project review (start with trust, add friction only if needed).
- **Trigger:** Breaking changes to `packages/cairn/`, `packages/forge/`, `packages/types/` — schema changes, API surface mutations, enum/brand additions, migration requirements. Non-breaking changes skip G4.
- **Sequencing:** BOTH — lightweight pre-freeze (schema doc review, 15-30 min meeting before sprint 2) + full post-freeze (G4 governs ongoing mutations).
- **Crucible-first impact:** G4 matters MORE because Crucible owns schema decisions during v1, Eureka adapts. Without G4, Crucible can unilaterally mutate DecisionRecord, breaking Eureka's adapter assumptions. G4 ensures schema changes are visible/stable so Eureka adapts correctly without retrofit.

**Key Learning:** Schema freeze with sign-off elevates both project teams to co-equal authorities — neither can unilaterally break the other. G4 is the enforcement mechanism for that agreement. Crucible-first doesn't reduce G4's importance; it increases it by making Eureka dependent on stable Crucible schema during parallel v1 work. Coordination at commit time (15-min fix) prevents retrofit at integration time (2-week blocking work).

**Memo Location:** `.squad/decisions/inbox/genesta-g4-scope.md`

### 2026-05-26: G4 Scope & Ownership Recommendation — Logged to Decisions + Directives Adopted

### 2026-05-26: Erasmus Counter-Proposal Evaluation — ACCEPT Narrower Freeze (SessionId + DecisionRecord) with Three Amendments
**Task:** Evaluate Erasmus's (Crucible architect) narrower freeze proposal in light of claimed storage fork directive and Eureka v5-final requirements.

**Proposal:** Freeze only SessionId brand + DecisionRecord shape (vs original broader G4 covering all Cairn/Forge/Types changes). Defer WAL/session-end consumption to v1.5+. Prefer Eureka-aware Forge prescriber over bidirectional API.

**Verdict:** ACCEPT WITH AMENDMENTS. Narrower freeze is technically sound and covers all v1 cross-boundary contracts. Storage fork (if true) eliminates highest-risk gate (event schema collision). FR-13/FR-14 explicitly support on-demand-only ingestion (no automatic consumption). Prescriber pattern preserves Eureka's kernel-shaped boundary.

**Key Findings:**
1. **Storage fork claim** — Undocumented but consistent with v5-final (FR-7.2 mandates separate storage). Evaluation does NOT hinge on this being true; narrower freeze works either way.
2. **Coverage** — SessionId + DecisionRecord cover all v1 contracts. No other types cross boundary. Forge prescriber API deferred correctly. Cairn events out-of-scope (storage fork + FR-14 on-demand ingestion).
3. **WAL deferral** — Correct. FR-13 manual-only (`remember()`), FR-14 on-demand CLI only (`ingest-decisions --session`). No automatic consumption in v1.
4. **Prescriber shape** — Architecturally sound. Preserves independence (Forge ships without Eureka dependency). Requires opt-in wiring (not default).
5. **G4 implications** — Narrower freeze reduces triggers by 80-90%. G4-lite sufficient: CODEOWNERS for `@akubly/types` + CHANGELOG for DecisionRecord + Slack handoff for breaking changes. No label automation needed.

**Three Amendments:**
1. **Prescriber opt-in** — Eureka-aware prescriber must be explicitly registered (not default-wired) to preserve independence.
2. **SessionId validation freeze** — Lock UUID v4 format + validator/constructor rules (not just brand name).
3. **DecisionRecord tolerance contract** — Lock adapter tolerance rules (forward/backward-compatible; breaking changes require 15-min sync).

**Key Learning:** When storage fork resolves substrate collision, coordination surface shrinks dramatically. Original G4 assumed shared storage (Cairn/Forge mutations affect both teams). With fork, only explicit type contracts (SessionId, DecisionRecord) need coordination. Narrower freeze eliminates 80-90% of G4 overhead while preserving safety. This is the right tradeoff: guard the contracts that cross boundaries; trust teams on internal implementation. Coordination cost drops from 30min/week to ~5min/change (only when touching frozen contracts).

**Memo Location:** `.squad/decisions/inbox/genesta-erasmus-evaluation.md`

### 2025-01-21: Activity & Tier Design Specification — §10 Technical Section
**Task:** Write `docs/eureka/sections/10-activities-and-tiers.md` specifying activity semantics (7 v1 + 2 v1.5 verbs) and tier boundary system (agent/user/project) per locked PRD v5-final.

**Key Decisions:**

---

## 2026-05-29: M4 GREEN + M5 Anchor (Cross-Agent Update)

**Context:** Laura (M4 RED) + Edgar (M4 GREEN) completed ClockProvider seam for recency decay. Edgar's 2-line change in `recall()` wires injected clock (§55 §1.2 discipline). All tests GREEN.

**M5 Anchor:** Trust score updates from feedback events (§30 §2.3). Events drive mutations: corroboration +0.10, contradiction -0.10, user correction ±0.30. **Laura owns M5 RED.**

**Your attention:** M4 seals the time-dependent recency seam. M5 will introduce event-driven trust mutations. This extends the seam discipline to observability layer. No blocker to your substrate integration work; M5 timing allows parallel progress.
1. **Activity discrepancy resolution** — Task brief mentioned 9 activities (explore, ideate, dream, pray, re-evaluate) not in PRD v5-final. Decision: document only locked vocabulary (7+2) per FR-4; note discrepancy for posterity but do not invent semantics for undefined verbs. Rationale: avoid speculation; if alternate activities required, propose formal PRD amendment.

2. **Open questions flagged for Edgar** — 10 semantic ambiguities identified that PRD leaves unspecified (e.g., "Does `integrate()` deduplicate before insert?", "Can `commit()` lower trust or only upgrade?"). Decision: document ambiguities explicitly as implementation decision points rather than inventing answers. Rationale: Edgar owns implementation judgment; forcing choices here would be scope creep. Better to surface precise questions.

3. **Tier resolution merge strategy** — PRD specifies sequential fan-out (agent → user → project) but not merge strategy when combining results. Decision: document as "concatenate results, no de-duplication" with open question flagged. Rationale: facts have unique `FactId` per tier, so cross-tier duplication shouldn't happen unless manually copied; edge case doesn't warrant invented policy.

4. **Crucible coordination section** — Included §10.3 covering SessionId brand, G4 protocol, and non-overlap (sweep mechanics). Kept concise (referenced overlap memo; did not duplicate analysis). Rationale: activity/tier semantics must acknowledge shared substrate without becoming a coordination document.

**Document Structure:**
- §10.1: Activity model (9 verbs, each with verb/trigger/inputs/outputs/side-effects/sync-async/open-questions)
- §10.2: Tier model (hierarchy, resolution algorithm, tier-activity matrix, write authority)
- §10.3: Crucible coordination (SessionId brand, G4 protocol, sweep non-overlap)
- §10.4: Open questions for Edgar (10 flagged ambiguities)
- §10.5: Summary + next steps

**Key Learning:** When writing technical specifications from a locked PRD, resist the temptation to "fill gaps" with invented semantics. Explicitly flagging ambiguities as open questions is more valuable than guessing wrong and creating false precision. Implementation leads need decision latitude; design specs should constrain what matters (API surface, side effects, tier authority) and liberate what doesn't (internal merge strategies, error handling tactics). The §10.4 open questions list is the most important section — it's the contract boundary where design authority transfers to implementation authority.

**Status:** Section complete. Ready for Edgar/Crispin review.

---

### 2026-05-27: London-School TDD Directive — Team Impact Assessment
**Team Update:** Aaron issued London-school (outside-in mockist) red/green TDD as team default. **Genesta assigned:** Review Laura's docs/eureka/sections/55-tdd-strategy.md (next session) for activity-semantic consistency vs §10. Verify outside-in test-driven interface shapes match activity boundaries. Locked-out of revision if reject (protocol requires different agent).

### 2026-05-27: §55 Reviewer Gate — APPROVED WITH NOTES
**Task:** Reviewer Rejection Protocol gate for Laura's `docs/eureka/sections/55-tdd-strategy.md` (London-school TDD strategy). Verify activity entry points, semantics, tier-awareness, and v1/v1.5 scoping against §10.

**Verdict:** APPROVED WITH NOTES. Laura's document correctly reflects §10 activity semantics in all material respects. The 7 v1 activities are properly scoped, the worked `recall` example demonstrates correct observable behavior, and tier-awareness is sound (agent-tier-only v1 correctly inferred). Implementation may proceed.

**Three Non-Blocking Clarifications:**
1. **Activity count phrasing** (§1.1, line 20) — "9 activities" should clarify "7 v1 + 2 reserved v1.5" to avoid implying v1.5 activities are exported in v1.
2. **Tier resolution test cycle** (§2 worked example) — Worked example correctly demonstrates core `recall` semantics (precision, k-limit, collaborator discovery) but could add a §2.5 showing tier fan-out as next test cycle (pedagogical enhancement, not semantic error).
3. **Activity-noun disambiguation** (§4, line 306) — "Integration test pyramid" could read "Integration testing pyramid" to avoid potential ambiguity with `integrate` activity verb.

**Positive Finding:** Laura correctly deferred user/project tier tests (§5 AC mapping) — absence of these tests reflects correct v1 scoping (agent-tier-only), not an oversight. This demonstrates sound tier-awareness.

**Notes for Edgar:** Flagged three items overlapping Edgar's algorithmic seams review: (1) `CuratorStore.retrieve()` mock seam placement, (2) BM25 ranker as "real collaborator" assumption, (3) composite ranker test file naming vs scorer decomposition. Not blocking for my approval; Edgar should verify alignment with §30 during his review.

**Key Learning:** When reviewing test strategy, **absence of tests** can be as important as presence. Missing coverage may reflect correct deferral (v1 scoping) rather than oversight. Always cross-check scope boundaries before flagging gaps. Staying in review scope (activity semantics only) required resisting urge to comment on TDD methodology (Laura's expertise) or algorithmic assumptions (Edgar's slice) — bounded review prevents scope creep.

**Pattern for Future Cross-Section Reviews:** 
- Flag cross-cutting concerns as "Notes for [Other Reviewer]" rather than findings — signal potential overlaps without making verdicts outside my authority.
- Positive findings (e.g., correct tier deferral) are as valuable as issues — document what was verified as correct, not just what needs fixing.
- Reviewer Rejection Protocol creates healthy pressure to be precise: findings must cite specific line numbers and explain *why* they matter, not just list observations.

### 2026-05-28: Cycle 2 Fix Wave — Four Canon Findings Landed in §10 and §00
**Task:** Apply canonical resolutions from cycle 1 persona review (B3, I7, I2 findings) to owned sections.

**Changes Applied:**
1. **B3 (decide ownership) in §10 (L133-136)** — Removed "Does **not** write to Eureka DB" line; replaced with role-split prose: Forge writes audit record (immutable, compliance-authoritative); Eureka subscribes and writes learning-fact (mutable trust/importance, recall-authoritative); shared `decision_id` correlates them. Source of truth split: compliance=Forge, learning=Eureka.
2. **B3 (Path 1 order) in §00 (L112)** — Fixed data flow sequence. Was: "Eureka stores fact → emits to Forge." Now: "decide() emits event → Forge writes audit record (immutable) → Eureka subscribes and writes learning-fact (mutable)." Corrects audit discipline: Forge writes FIRST (authoritative), Eureka writes AFTER on subscription.
3. **I7 (recall signature) in §10 (L54, L63, L18, L331-333, L354-356)** — Removed `tier?: Tier` parameter from `recall()` signature. v1 public API has NO tier control (hardwired to agent tier internally). Replaced NotImplementedError stub language ("returns `[]` / throws NotImplementedError") with forward-compat phrasing: "DB file created but not wired; v1 hardwires to agent tier only; v1.5 adds federation paths." Preserves `Fact.scope` schema field for v1.5; does NOT ship tier-control stubs in v1 API.
4. **I2 (trust cross-ref) in §10 (L167-169)** — Replaced inline trust initial values (0.5 neutral, 0.9 user-confirmed, 0.3-0.7 LLM-inferred) with pointer to §30: "Trust initial values per source type: see §30 §2.X". Canonicalizes source-type trust init values in §30 only (Edgar's section).

**Length Impact:** §10 grew ~30 lines (B3 prose expansion from 3→5 lines; tier v1 status rewording added clarity); §00 grew ~10 chars (Path 1 reordering + detail). Both within 15% length budget.

**Key Learning:** When applying canonical resolutions with explicit target prose (canon §B3: "replace with the role-split prose: Forge=audit-authoritative, Eureka=learning-authoritative..."), use the canon language verbatim — it's already been vetted by Design Panel + Aaron's accept. Don't rephrase for style; copy. For findings without explicit replacement prose (I7, I2), cross-check canon constraints ("DELETE NotImplementedError stubs", "replace numerics with pointer") and apply minimally — remove what canon says remove; add only what canon specifies. The "deviation file" path is for when a finding CAN'T be applied cleanly due to section structure conflict; stylistic preferences are NOT deviations. Trust the canon's explicit wording.

**Pattern for Fix Waves:**
- Read canon FIRST before touching owned files (avoids guess-and-fix cycles).
- When canon gives exact prose ("replace with..."), copy it verbatim.
- When canon gives directive ("remove X", "cross-ref §Y"), apply literally without elaboration.
- Deviation file is for structural blockers (e.g., "canon says fix §10.3 but that section doesn't exist"), not style disagreements.
- Length budget (≤15% growth) is real but rarely binding — clarity wins over compression.

**Status:** All four findings landed cleanly. No deviations. Ready for Edgar/Crispin parallel fix waves.

### 2026-05-28: Cycle 3 Skeptic Advisory — Tier Consistency Clarification
**Task:** Close Skeptic finding from cycle 2 review. §10 still described tier fan-out behavior in detail (including "user/project return `[]`"), but PRD + cycle 2 edits clarified v1 hardwires to agent tier with no `tiers` parameter in public API. Risk: implementers reading §10 prose might build tier fan-out execution path with v1.5 stubs instead of simply not implementing fan-out at all.

**Changes Applied:**
1. **Overview principles (L17-18)** — Moved fan-out description to v1.5 scope: "Resolution is sequential, not hierarchical **(v1.5+)**". Clarified v1 constraint: "v1 implements only the agent-tier path. User and project tier paths are reserved for v1.5 and are not exercised in v1 — there is no v1 fan-out execution."
2. **recall() Tier Resolution block (L79-87)** — Split v1 vs v1.5+ behavior. v1 section says "Queries agent tier only... executes a single agent-tier query with no fan-out behavior." v1.5+ section documents future design (fan-out steps 1-4) clearly marked as reserved.
3. **User/project tier subsections (L330, L351)** — Reworded v1 status from "not wired" to "read/write paths are not implemented in v1" to emphasize absence of execution path (not just stub).
4. **Tier Resolution Algorithm heading (L370)** — Added "(v1.5+ Design)" to heading, prepended "**v1 Behavior:** `recall(query, k)` queries agent tier only. No fan-out logic is executed in v1." before pseudocode.
5. **Key Properties performance note (L402)** — Qualified P95 latency: "v1 agent-tier only; v1.5+ total recall latency ~150ms worst-case for 3-tier fan-out".
6. **Summary (L541)** — Replaced "return empty/throw on access" phrasing with "v1 executes no fan-out logic — `recall()` queries agent tier with no fallback paths."
7. **Open question #8 (L523)** — Marked as "v1.5+" scoped (merge strategy only relevant when multi-tier implemented).

**Length Impact:** +4% (75 words added for v1/v1.5 splits; -30 words removed from stub language). Within ≤10% budget.

**Key Learning:** "Not implemented" vs "returns `[]`" distinction matters. The former says "this code path doesn't exist"; the latter implies a stub execution path that returns empty. When v1 scope excludes a feature, documentation should describe what v1 *does* (agent-tier-only query), not what v1.5 *would return* if invoked (stubs returning `[]`). This prevents implementers from building unnecessary stub surface. The pattern: lead with positive v1 behavior statement ("v1 does X"), follow with v1.5 reserved design (clearly marked), never describe v1 in terms of "doesn't do v1.5 thing" (negative framing invites stub implementation).

**Architectural Principle:** When a design document describes future behavior (v1.5 fan-out) alongside present behavior (v1 agent-only), the v1 section must be **implementation-unambiguous**: "no fan-out logic is executed" is clearer than "user/project tiers return `[]`" because the former says "don't build this", the latter says "build this stub". The Skeptic finding was correct: describing v1 via v1.5 stubs risks building unnecessary surface. Fix: describe each version's behavior positively (what it does), not negatively (what it doesn't do).


---

## 2026-05-28: Eureka M1 First Red Test — Substrate/Storage Cascade Entry

**Event:** Laura (Tester) delivered M1 first red test per §55 London-school TDD. FactStore.search() seam locked.

**RED Status:** AC-1.3 seed test established. Mock contracts finalized for persistence layer. Package scaffold complete. SessionId branded type available in @akubly/types.

**Impact for Genesta:** M2 cascade: coordinate with Crispin (FactStore interface finalization, contract test). Your substrate integration (§40) will depend on FactStore contract lock. M0 monorepo merge (5-day sprint per your timeline) critical path for M1→M2 transition.

**Load-bearing:** Integration seam (§40 owner per your notes) = Roger's responsibility. Coordinate cross-package import guards early in M2 (ESLint enforcement, build-time lint).

**Baseline preserved:** Cairn 26/26 ✅, Forge 24/24 ✅, tsc --build ✅.

