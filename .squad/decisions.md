# Squad Decisions

## Open Decisions

### 2026-05-26: Crucible ↔ Eureka Cross-Project Overlap — Architectural Coordination Required

**Status:** ⏳ AWAITING AARON DECISION  
**Date:** 2026-05-26  
**Initiated By:** Cross-project overlap analysis (Genesta, Crispin, Edgar, Cassima)  
**Urgency:** BLOCKER — both projects ship v1 in parallel  

**Decision Needed:** Aaron must lock repository ownership, schema collision resolution, and prescriber/substrate wiring before Crucible sprint 2 and Eureka v1 implementation phase begin.

---

## Executive Summary

**Convergent Finding:** Crucible (v1-DRAFT) and Eureka (v5-final) both depend on shared substrate (Cairn, Forge, types) and both define overlapping session/decision/improvement semantics. The dependency direction is backwards: Crucible assumes Forge exists in `harness` repo but Forge actually lives in `mem` repo. The overlap is NOT accidental — Eureka is Crucible's future memory layer — but the shared-code surface is brittle without explicit coordination.

**Three critical blockers identified:**

1. **Undeclared Repository Dependency (BLOCKER — Cassima)** — Crucible cannot ship v1 without either duplicating Forge or depending on the `mem` repo. Neither is currently acknowledged in either PRD. Must resolve before sprint 2.

2. **Event Schema Collision (HIGH RISK — Genesta)** — Crucible's 5 primitives + L1 WAL vs Cairn's existing `event_log` creates dual-write trap. Must merge or federate before L1 substrate lands.

3. **Decision/SessionId Schema Dual Ownership (CRITICAL — Crispin, Genesta)** — Both PRDs mandate `SessionId` branded type + Decision schema overlap (Decision primitive ≠ DecisionRecord audit ≠ DecisionPayload learning). Requires namespace discipline + possible renames in Crucible.

**Two safe convergences identified (Edgar, Genesta):**

4. **Prescriber Pattern Convergence** — Crucible's Router mirrors Forge's existing prescriber family; can share substrate. Both teams should annotate convergence points.

5. **Learning-Loop Feedback Substrate** — Crucible's recorded sessions ARE Eureka's training data. Path 2 ingestion wiring enables productive relationship between self-improvement loops (not competitive).

---

## Three Strategic Questions for Aaron (Cassima)

**Q1: Which repo owns Cairn and Forge?**
- If `mem`: Crucible has undeclared dependency on this repo; merge or link must happen before Crucible ships.
- If `harness`: Eureka loses its substrate; Cairn must be forked/mirrored.
- If duplicated: drift is guaranteed.

**Recommendation:** Lock repository topology NOW. Genesta suggests Option A (merge Crucible into `mem` at v2 stage, maintaining federation boundary for isolated dogfood in `harness` repo).

**Q2: Is Eureka a v1 Crucible feature or separate v2+ integration?**
- Crucible promises "local-first sovereignty + record everything + self-improve" (§0).
- Eureka promises "durable, addressable, progressively disclosed knowledge" (§2).
- 80% mission overlap.

**Recommendation:** Clarify v1 scope. If Eureka is Crucible's built-in memory backend at v1, sequencing/dogfood changes. If separate v2+ integration, acknowledge delayed feedback substrate.

**Q3: Who gets Aaron's time when both projects hit the same blocker?**
- Both assume Aaron is sole dogfooder.
- Eureka v1 killer demos (US-1, US-2) require multi-session coding work.
- Crucible v1 success bar requires building v2 inside v1.
- Single-threaded resource bottleneck risk.

**Recommendation:** Sequence dogfood phases OR delegate one project's dogfood to external user.

---

## Technical Findings (Cross-Referenced)

### Finding 1: Repository Dependency (Cassima)
**Full analysis:** `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` §1.2 (undeclared dependency), §4 (resourcing)

- Crucible PRD §1 vocabulary, §2.4, §2.6, Appendix D assume Forge prescribers in `harness`.
- Actual location: `D:\git\mem\packages\forge`.
- Neither PRD acknowledges the cross-repo dependency.

**Recommendation:** Stagger projects OR establish explicit dependency + versioning contract.

### Finding 2: Event Schema Collision (Genesta)
**Full analysis:** `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md` § Finding 1 + 2 + 5

- Crucible §1: 5 typed events (Request, Artifact, Observation, Decision, Question)
- Cairn today: `event_log` with existing `eventType` vocabulary
- Eureka v5: Sessions are `kind=session` facts in Eureka's fact store
- **Dual-write trap:** Which is authoritative for replay?

**Recommendation Option A (Merge):** Crucible's 5 primitives become `eventType` values in Cairn's `event_log`. Crucible's "primitives" are typed façade over Cairn's polymorphic stream.

**Recommendation Option B (Federate):** Crucible ships in `harness` repo (separate). When merged to `stunning-adventure` at v2 stage, federation boundary explicit. Cairn observes Crucible sessions via MCP bridge.

**Gate:** Before Crucible sprint 2 (L1 substrate), convene Graham + Roger + Genesta to lock event-substrate topology.

### Finding 3: SessionId Brand + Decision Schema Collision (Crispin, Genesta)
**Full analysis:** `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` § 1 + 5, `genesta-...` § Finding 2

**Collision 1 — SessionId Brand (BLOCKER):**
- Eureka v5 (FR-13): `SessionId` branded type in `@akubly/types` (Aaron R8 directive).
- Crucible PRD: Implicitly assumes session identity but doesn't specify the type.
- **Both mandate the same brand; Crucible's requirements differ.**

**Recommendation:** Design `SessionId` for both Crucible + Eureka from day 1. Current design (UUID + validator) is sufficient for both.

**Collision 2 — "Decision" Naming (CRITICAL):**
- Crucible `Decision` primitive (§1): "any recorded choice by human or agent" — event-like primitive.
- Forge `DecisionRecord` (audit): Structured audit trail of agent decisions.
- Eureka `DecisionPayload` (fact): Contemplative structured deliberation with explicit options + rationale.
- Same word, three structurally different types.

**Recommendation (Crispin):** Crucible rename `Decision` → `ChoiceEvent` or `DecisionEvent`. ESLint ban on cross-system `Decision*` imports.

**Collision 3 — "Artifact" Semantic Drift (HIGH):**
- Crucible: "any reviewable content — inputs AND outputs" (PRD, patch, screenshot, transcript, upload, diff).
- Eureka: Informal usage only; "epistemological artifact" = learned memory representation.
- Risk at storage layer if both use content-addressed store.

**Recommendation (Crispin):** Crucible rename to `ContentBlob` / `CapturedContent`. Eureka avoid "artifact" in public types.

### Finding 4: Learning-Loop Feedback Substrate (Edgar)
**Full analysis:** `.squad/decisions/inbox/edgar-crucible-learning-overlap.md` § 1–4

- **Crucible's loop:** Prescriber → Review-Gate → Apply/Inbox → Scorecard (minutes to hours per-session).
- **Eureka's loop:** Sweep → Ranker → Trust/Confidence mutations (hours to days across sessions).
- **Complementary, not redundant.** Different time horizons, different improvement targets.

**Judgment: CRUCIBLE IS EUREKA'S EVIDENCE GOLDMINE.**
- Crucible records everything — every decision, every alternative, every tool call, every file read.
- This is exactly the evidence Eureka needs for learning patterns.

**Current wiring (v5-final):** Path 2 ingestion exists but is on-demand only. Manual `eureka ingest-decisions --session <uuid>` after each session won't survive dogfood.

**Recommendation (Edgar):** Wire automatic ingestion before dogfood starts.

**Option 1 (Simplest):** Add Crucible post-session hook: `on_session_end → eureka ingest-decisions --session $SESSION_ID`. Opt-in via `.cruciblerc` flag.

**Option 2 (Event-driven):** Cairn already emits session-end events. Eureka sweep subscribes; on `session_end` (carries `session_id`), ingests Forge DecisionRecord stream. *v1.5 scope per current PRDs.*

**Option 3 (Prescriber ownership transition):** Forge prescribers move to Crucible; Eureka's extraction-ready design enables Crucible to eventually adopt learning kernel.

---

## Recommendations Summary

**Immediate (Pre-Implementation):**
1. Aaron locks repository ownership (mem vs harness vs federation).
2. Graham + Genesta + Roger design event-substrate topology (merge vs federate).
3. Crispin confirms Decision/Artifact renames in Crucible PRD v1.1-DRAFT.
4. Cassima sequences dogfood phases or delegates external user.

**v1 Blockers (Before Sprint 2):**
5. ESLint guardrail (already in Eureka v5-final FR-12 #8) extended to Decision/Artifact cross-system imports.
6. `SessionId` brand finalized in `@akubly/types` (ships v1, both projects).
7. Crucible L1 substrate locked to Cairn's `event_log` (Option A) or isolated to `harness` repo (Option B).

**v1 Opportunity (Nice-to-Have Before Dogfood):**
8. Crucible post-session hook wired for Eureka ingestion (Option 1, simplest).

**v1.5+ (Path D Kernel Extraction):**
9. Prescriber ownership transition (Forge → Crucible).
10. Sweep-trigger unification (Cairn session-end → Eureka sweep).
11. Confidence/trust branded types (orthogonality compiler-enforced).

---

## Source Artifacts (Decision Inbox)

All findings preserved in inbox for detailed review:

- `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md` (20.9 KB, 216 lines) — Architectural findings: 5 overlaps (3 high-risk, 2 safe).
- `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` (24.5 KB, 136 lines) — KR findings: 2 critical collisions, 1 integration opportunity.
- `.squad/decisions/inbox/edgar-crucible-learning-overlap.md` (25.6 KB, 202 lines) — Learning-loop findings: parallel loops, feedback substrate, prescriber transition.
- `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` (25.0 KB, 200 lines) — PM findings: undeclared dependency, 3 strategic questions, resourcing risk.

---

## Closed Decisions

### 2026-05-26: Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-26  
**Locked By:** 4-reviewer panel (Graham Knight, Genesta, Crispin, Edgar) — unanimous LOCK, zero revisions  
**Lock Status:** DO NOT EDIT — canonical specification; v4-final superseded

**Decision:** Eureka PRD v5-final is ratified as canonical, shippable specification after R8 post-lock amendment. Aaron R8 session-identity directive: Cairn `Session` and Eureka `kind=session` fact share one identifier (Copilot CLI session UUID) via shared `SessionId` brand in `@akubly/types`, with normative lens framing as guard. All R8 changes landed correctly. R8 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v5-final.md` (617 lines, 86.4 KB) — canonical stable location; supersedes v4-final
- **Lineage:** v4-final (R7, 555 lines) → v5-final (R8 amendments, +62 lines) — all R8 deltas annotated `[v5: <reason>]`
- **Panel:** Graham Knight (Architect), Genesta (Cognitive Systems), Crispin (Knowledge Representation), Edgar (Learning Systems) — unanimous verdict: LOCK

**R8 Amendment Scope (Judgment Calls + Enforcement Deltas):**

1. **Session Identity Unification:** Cairn `Session` and Eureka `kind=session` facts are the same entity (one CLI session UUID). Shared `SessionId` branded type in `@akubly/types`.
2. **Bridge Ledger Simplification:** `cairn_session_id_hint?` (optional) → `session_id: SessionId` (required). Eliminates nullable opaque correlation.
3. **FR-13 Amendment:** "Isolated by design" language deleted. Replaced with: "SessionId is shared; all other session attributes are system-specific. Lens framing (Cairn = lifecycle, Eureka = epistemology) is the normative guard against coupling drift."
4. **FR-7.2 Preserved:** No-cross-DB-ATTACH rule unchanged. Shared identifier is type-level only; runtime decoupling remains intact.
5. **§14a T-orphan Reframed:** "Dangling `cairn_session_id`" → "Stale `session_id` reference" (severity unchanged: LOW/LOW). Threat table entries in both §13 + §14a (belt-and-suspenders per JC1 disposition).
6. **FR-12 Mechanism #8 (NEW):** ESLint `no-restricted-imports` guardrail bans Cairn ↔ Eureka session-type imports except `SessionId` from `@akubly/types`.
7. **JC1 Disposition (T6 Row Placement):** Verified in both §13 + §14a threat tables.
8. **JC2 Disposition (v1 ship scope):** SessionId brand ships v1 (FR-12 #8); Trust/Confidence brands stay v1.5 (FR-12 #7).

**Reviewer Verdicts:**
- **Graham Knight (Architect):** LOCK — 8/8 enforcement items landed correctly; no new architectural concerns; v5-final surgical pass, no scope creep
- **Genesta (Cognitive Systems):** LOCK — all 5 guardrails from R8 fold verified (lens framing normative, neutral brand, no runtime traversal, ESLint boundary, Glossary updated)
- **Crispin (Knowledge Representation):** LOCK — all 6 spec items from R8 KR verdict verified (SessionId brand mechanics, kind=session schema, no identity collision, fact vs. filter clarity, edge schema tightening, session-fact integrity)
- **Edgar (Learning Systems):** LOCK — all 3 precision-gain items verified (sweep cadence v1.5 opportunity, `--session <uuid>` CLI v1 ship, AC-2.5 telemetry counter); zero new learning-systems risks

**Key Technical Deltas (Summary):**
- `@akubly/types/src/session.ts` (NEW): `SessionId` branded type + UUID validator + constructor
- `bridge_ledger.session_id` (NEW): `TEXT NOT NULL` replaces `cairn_session_id_hint? TEXT` 
- FR-13 text: "isolated by design" deletion + shared brand framing + lens elevation to normative
- FR-7.2: no-ATTACH rule consistency pass + type-level-only clarification
- §14a: T-orphan reframe (same severity, clearer semantics)
- FR-12 mechanism #8: ESLint guardrail (ships v1)
- Glossary + §15: Lineage citations + Aaron R8 directive + Graham/Genesta/Crispin/Edgar verdicts

**Why This Approach:**
- Aaron's post-lock signal clarified operational reality: the session UUID IS shared; pretending otherwise was incidental complexity
- Shared `SessionId` brand documents ground truth without introducing runtime coupling (type-level construct, not runtime FK)
- Lens framing elevated to normative guard — "two systems, one entity" is the design principle, not apology
- Guardrails (ESLint + schema comments + ADR lock) prevent future coupling drift
- All R8 changes preserve R7 achievements (bidirectional adapter framework, confidence/trust orthogonality, 7-mechanism extraction-readiness)

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v5-final.md` (stable location, do not edit; supersedes v4-final)
- **R8 Design Panel Verdicts:** `.squad/decisions/inbox/graham-r8-session-identity.md`, `genesta-r8-session-identity.md`, `crispin-r8-session-identity.md`, `edgar-r8-session-identity.md` (all ACCEPT/FOLD verdicts)
- **Aaron R8 Directive:** `.squad/decisions/inbox/copilot-directive-r8-session-identity.md`
- **R8 Lock Panel Verdicts:** `.squad/decisions/inbox/graham-r8-lock-verdict.md`, `genesta-r8-lock-verdict.md`, `crispin-r8-lock-verdict.md`, `edgar-r8-lock-verdict.md` (all LOCK, unanimous)
- **Superseded Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (historical reference; see header banner for migration note)

**Implementation Readiness:**
- v5-final is self-contained (no external doc required for implementation)
- All `[v5: <reason>]` + `[v4: <reason>]` annotations trace lineage back to R7/R5 origins
- No new architectural risks; all changes additive + simplifying
- R8 amendment window now closed; v5-final canonical until v1 implementation phase reveals needs for v1.1

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms + shared `SessionId` brand (FR-12 #8) + ESLint guardrail
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface) + precision gains (sweep cadence, Cairn session-end triggers, confidence/trust branded types)
- Path D Extraction: Kernel extraction readiness enforced from Day 1; extraction happens post-v1 pending org-scale federation needs

---

### 2026-05-25: Eureka PRD v4-final LOCKED — R7 8-Reviewer Lock-In Panel

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-25  
**Locked By:** 8-reviewer panel (4 Squad domain + 4 persona-review Design Panel personas)  
**Lock Status:** DO NOT EDIT — implementation phase begins

**Decision:** Eureka PRD v4-final is ratified as canonical, shippable specification after R7 lock-in. All 4 blockers resolved. All 9 important findings synthesized. Ready for implementation phase. R7 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (555 lines, 69.5 KB) — canonical stable location
- **Lineage:** v3 (R5) → v3.1 patches (R6) → v4-final (R7 amendments + Aaron finalization) → v4-final rev-2 (4 blockers + 9 importants resolved)
- **Panel:** Graham Knight (Architect), Genesta (Storage), Crispin (Schema), Edgar (Enforcement), + 4 persona-review personas (Architect, Skeptic, Pragmatist, Compliance)

**Blockers Resolved:**
1. **B1** — DecisionSource adapter mapping (verified against packages/types/src/index.ts:47) ✅ RESOLVED
2. **B2** — FR-14 Path 2 cadence, idempotency, dedup, initial trust ✅ RESOLVED
3. **B3** — FR-7.4 ↔ FR-7.2 contradiction (bridge_ledger + offline CLI coexistence) ✅ RESOLVED
4. **B4** — Security Threat Model (§14a added with attack vectors + mitigations) ✅ RESOLVED

**Important Findings (I1–I9):**
- Scope rightsize across 5 v1 + 2 v1.5 mechanisms
- Sequential fan-out specification
- US-2 flush helper scoping
- Agent-tier-only wiring constraints
- Production opt-in policy
- Citation + decision-log registers
- input_trust_avg → input_trust_min analysis
- Confidence/trust orthogonality enforcement (branded types)
- Extraction-readiness mechanism verification (7 mechanisms, not 5)

**Reviewer Verdicts:**
- **Graham Knight (Architect):** APPROVE-FOR-LOCK — bidirectional adapter framework structurally sound, all R7 amendments integrated, 3 documentation nits (non-blocking)
- **Genesta (Storage/Substrate):** APPROVE-FOR-LOCK — dual-axis schema (input_trust_avg + reasoning_confidence) correct, adapter lossy contracts justified
- **Crispin (Schema):** APPROVE-FOR-LOCK — all 5 R7 schema risks mitigated, branded-type enforcement adequate to prevent confidence/trust collapse
- **Edgar (Enforcement):** APPROVE-WITH-MINOR-NITS — all 5 R7 mechanisms integrated + 2 additions (branded types, DESIGN.md), Path D preserved via manual-only triggers
- **Persona Architect:** Found B1 (DecisionSource mapping)
- **Persona Skeptic:** Found B2 (FR-14 gaps) + multiple I-findings
- **Persona Pragmatist:** Found B3 (FR-7 contradiction) + feasibility I-findings
- **Persona Compliance:** Found B4 (missing security model) + compliance I-findings

**Key Architectural Decisions Locked:**

1. **Bidirectional Adapter Framework** (resolves Aaron's R7 directive):
   - **Path 1 (Eureka → Forge):** Contemplative decisions. Agent uses Eureka facts/edges to reason, decision stored as `kind=decision` fact AND emitted to Forge via `toDecisionRecord()` for audit trail.
   - **Path 2 (Forge → Eureka):** In-flow decisions. Agent decides during normal LLM exchange, Forge captures `DecisionRecord`, Eureka ingests via `fromDecisionRecord()` to learn decision patterns.
   - **Both are load-bearing:** Eureka-assisted reasoning needs Path 1. Retrospective learning from observed decisions needs Path 2. No circular dependency (contexts non-overlapping).

2. **Confidence/Trust Orthogonality:**
   - `Confidence` (Cairn): epistemic strength of derived conclusions
   - `Trust` (Eureka): provenance reliability of stored facts
   - NOT interchangeable — TypeScript branded types enforce separation at compile time
   - Composition explicit and documented when needed

3. **Extraction-Readiness Enforcement (7 mechanisms, FR-12):**
   1. TypeScript subpath export (`./learning` firewall)
   2. Folder layout enforcement (no parent imports)
   3. Interface ban on domain types (signatures only primitives/shared vocab)
   4. Plain-data test pattern
   5. Lint + CI enforcement (`no-restricted-imports` + canary test)
   6. DESIGN.md living architectural contract
   7. Branded types for `Confidence` and `Trust`

4. **Boundary Discipline (no FK, no JOIN):**
   - Eureka and Cairn are peer systems with complementary purposes
   - Session namespace isolation: Eureka has `kind=session` facts, Cairn owns `sessions` table
   - Correlation via opaque `cairn_session_id` only (one-way reference, not FK)
   - Each system authoritative for own domain (sweep/ranker/trust → Eureka; observability → Cairn)

5. **Path D Preservation (Kernel Extraction Ready):**
   - Eureka ships standalone in v1 with no new dependencies on Cairn
   - Manual-only Cairn→Eureka session triggers (via explicit `remember()` call)
   - Auto-promotion heuristics deferred to v1.5+ pending usage patterns
   - Three-phase adoption playbook for Cairn if/when it adopts learning modules

**User Directives Locked (from Aaron Kubly):**
- **2026-05-24T23:43Z:** v4-final revision #2 scope — resolve ALL 4 persona blockers AND consensus-strength important findings
- **2026-05-25T05:48:00Z:** Eureka↔Forge decision flow is bidirectional by design (contemplative path + in-flow path, both load-bearing)

**Why This Approach:**
- Panel-first design prevented implementation surprises (dual-panel caught issues Squad-only missed)
- Persona review augmented domain expertise with cross-cutting risk/feasibility/compliance analysis
- Bidirectional adapter framework resolved architectural disagreement while honoring both workflows
- Branded types + seven-mechanism extraction-readiness provide concrete enforcement, not aspirational promises
- Boundary discipline between Eureka/Cairn preserves each system's autonomy while enabling collaboration

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v4-final.md` (stable location, do not edit)
- **Lock-in Orchestration:** `.squad/orchestration-log/2026-05-25T06-54-22Z-*` (9 entries: Cassima revision + 4 Squad reviewers + 4 personas)
- **Session Log:** `.squad/log/2026-05-25T06-54-22Z-r7-eureka-v4-final-lock.md`
- **Reviewer Verdicts:** Graham blessing + all four lock-in verdicts at `.squad/orchestration-log/2026-05-25T06-54-22Z-*-lock-verdict.md`

**Implementation Readiness:**
- PRD is self-contained (no external doc required for implementation)
- All [v4: <reason>] annotations mark deltas from v3 for lineage traceability
- Three lock-in nits (FR-7.4 reconciliation query, FR-14 ingestion cadence, §7.5 kernel versioning) are documentation polish, addressable during v1 implementation or v1.1 pass
- No architectural risks identified

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms as specified
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface)
- Path D Extraction: Kernel extraction readiness enforced from Day 1, extraction happens post-v1 pending org-scale federation needs

---

### 2026-05-22: Eureka Project Kickoff — Name + Repo Placement Decided

**Status:** ✅ CLOSED (Aaron decided)  
**Date:** 2026-05-22  
**Decision:** Project named **Eureka**; built in `packages/eureka/` (monorepo); 3 specialists hired into existing squad

**What Was Decided:**
1. The agentic brain/memory/thinking/learning system is named **Eureka**
2. Location: `packages/eureka/` in this monorepo (not separate repo)
3. New squad members: Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)
4. Existing squad continues Cairn/Forge; Valanice shifts 60% to Eureka UX

**Why:**
- User decision after 4 rounds of deliberation (Rounds 1–2: repo placement; Round 3: squad fit assessment)
- Cross-repo coordination overhead exceeded bounded-context benefit at this scale (3 new hires, solo orchestrator)
- Package-level boundary is sufficient enforcement; can extract to separate repo in Phase 5+ if org-tier federation needs backend service
- New specialists bring epistemology/cognitive systems expertise that current squad lacked

**Key insight from Round 3 (Squad Fit):**
- Current squad (Graham, Roger, Alexander, Valanice) correctly identified expertise gaps: cognitive science, knowledge graphs, agentic learning loops, epistemology
- Recommendation: Hire domain specialists (✅ DONE) rather than stretch current platform team
- Existing squad continues advisory roles on boundaries/UX (Graham 2-3 hrs/week, Valanice 40% Cairn)

**Artifacts:**
- Orchestration log: `.squad/orchestration-log/2026-05-22T20-49-46-onboarding-eureka-hires.md`
- Session log: `.squad/log/2026-05-22T20-49-46-eureka-hires.md`
- Decision directive: `.squad/decisions/inbox/copilot-directive-eureka-name.md` (merged here)
- New agent folders: `.squad/agents/{genesta,crispin,edgar}/` with charters + history
- Team roster updated: 14 members (was 11)

---

## Active Decisions

# Open Question: Brain/Memory/Learning System — Repo Placement

**Status:** Deliberation (Round 2 consulting, no final decision)  
**Date:** 2026-05-22  
**Requestor:** Aaron  
**Consulting Agents:** Graham Knight (Lead), Roger Wilco (Platform), Alexander (SDK/Runtime), Valanice (UX)

---

## The Question

Should a new agentic brain/memory/thinking/learning system be:
1. **NEW REPO** (@akubly/cortex, @akubly/synapse, etc.) — standalone product with independent release cadence
2. **NEW PACKAGE in this repo** (packages/mem/) — satellite package alongside Cairn/Forge
3. **EXTEND CAIRN** (same package) — Curator extension for pattern learning

---

## Agent Recommendations (Round 2, Refined)

### Graham Knight — NEW REPO (High conviction)

**Key insight:** Five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) confirms system boundary shift.

**Why:**
- User-memory tier is cross-repo infrastructure (cwd-aware hooks outside this monorepo)
- Brain is a **runtime** with control loops (meditate, dream, pray), not a library
- KINDS are ontological (practical, semantic, linguistic, symbolic, philosophical) — no overlap with Cairn's types
- PROPERTIES (recency, trustworthiness, plasticity) are learning primitives, not event signals
- REPRESENTATION (graph + versioning) differs from Cairn's SQLite + event log

**Verdict:** This isn't a Cairn extension. It's a product with zero hard dependencies on Cairn/Forge.

---

### Roger Wilco — NEW PACKAGE in Monorepo (Medium conviction, pragmatic)

**Key insight:** FLIPPED from "extend Curator." Multi-tier + polyglot system can't fit in Curator, but can fit as separate package.

**Why:**
- Monorepo velocity (shared build, shared types, single test suite)
- Cairn stays focused (project-level knowledge, not multi-scope router)
- Clean delegation: packages/mem/src/tiers/project.ts wraps Cairn Curator
- Tier/kind federation avoids schema conflicts and package boundary violations

**Trade-off:** Org-tier federation (multi-writer shared memory) still wants backend service later, but Phase 1-3 can use SQLite + Git.

**Verdict:** NEW PACKAGE as pragmatic step; extract to separate repo in Phase 5+ if org-tier backend service is needed.

---

### Alexander — NEW REPO (High conviction)

**Key insight:** FLIPPED from monorepo. Q3 (org-tier federation) reveals backend/deployment boundary.

**Why:**
- **Q1 (Runtime coupling):** Brain is Forge sibling, not layer on Forge — separate repo avoids confusion
- **Q2 (User-tier distribution):** CAN work from monorepo via npm, BUT separate repo enforces "no accidental Forge deps"
- **Q3 (Org-tier federation):** Wants Postgres + Azure Functions as separate deployment unit — this is the decisive factor

**Key argument:** The 5-dimension expansion is 10x scope increase. Original analysis (monorepo works) was correct for narrow scope; Graham's position is correct for expanded scope.

**Verdict:** If brain's org tier needs Postgres + backend service, it's a separate system boundary. Matches deployment boundaries, not just code boundaries.

---

### Valanice — NEW REPO with Phased Extraction (Medium conviction)

**Key insight:** Infrastructure positioning determines repo choice; mental model boundaries matter for discoverability.

**Why:**
- Brain is **infrastructure** (like Git, Redis) that follows the user globally and hooks per-repo
- Installation story: 
pm install -g @akubly/brain (not embedded in Cairn)
- Branding independence signals "infrastructure for any agentic system," not "Cairn feature"
- UX principle: Mental model boundaries should match repo boundaries

**Phased approach:**
- **MVP (Prototype in monorepo):** xperiments/brain/ or packages/brain/
- **Extract when:** Brain has independent CLI, MCP server, test suite, branding decision
- **Branding options:** Synapse, Mneme, Cortex, Engram

**Verdict:** Lean toward separate repo, but prototype in monorepo first to validate scope.

---

## Summary of Positions

| Agent | Position | Conviction | Reasoning Core |
|-------|----------|-----------|-----------------|
| **Graham** | NEW REPO | 🟢 High | System boundary (5 dimensions) |
| **Roger** | NEW PACKAGE | 🟡 Medium | Pragmatic: monorepo velocity, can extract later |
| **Alexander** | NEW REPO | 🟢 High | Org-tier backend service = deployment boundary |
| **Valanice** | NEW REPO (phased) | 🟡 Medium | Infrastructure positioning + phased extraction |

**Consensus:** 3 agents recommend NEW REPO (Graham, Alexander, Valanice); 1 recommends NEW PACKAGE (Roger, pragmatic compromise).

---

## Open Questions for Aaron

1. **Is brain Cairn/Forge-exclusive, or infrastructure for any agentic system?**
   - If exclusive: NEW PACKAGE makes sense; Roger's approach is solid
   - If infrastructure: NEW REPO makes sense; Graham + Alexander + Valanice alignment is strong

2. **What's the MVP scope?**
   - If 2-week prototype: Keep in xperiments/brain/ for now
   - If 2-month full system: Decide repo placement before implementation

3. **Who is the primary user?**
   - If agents (LX-first): Infrastructure positioning → NEW REPO
   - If humans (UX-first): Could be either, but tooling/discovery favors NEW REPO

4. **How soon is org-tier federation needed?**
   - If Phase 1-2 MVP: SQLite + Git works, monorepo packaging is OK (Roger path)
   - If Phase 3+ scaling: Postgres + backend needed, repo boundary matters (Alexander path)

5. **Backend service story?**
   - If Postgres + sync service: Separate repo is cleaner (deployment boundary)
   - If stay local (SQLite + cwd-aware hooks): Either repo works

---

## Impact Analysis

### If NEW REPO
- **Coordination:** Separate squad, separate release cadence
- **Squad changes:** Forge + Types must publish to npm; Cairn depends on Brain
- **Timeline:** Phase 0-4 for brain squad (parallel to Phase 5 PGO)
- **Risk:** Version skew between Cairn and Brain

### If NEW PACKAGE in Monorepo
- **Coordination:** Same squad, shared build/test/types
- **Squad changes:** Create packages/mem/, implement tier delegation to Cairn
- **Timeline:** Integrate into main roadmap (maybe Phase 5 stretch goal)
- **Risk:** Org-tier federation later wants backend service (deployment boundary mismatch)

### If Extend Cairn
- **Rejected by all agents** — violates single responsibility, schema conflicts, architectural mismatch

---

## Session Log

See .squad/log/2026-05-22T20-25-51-brain-repo-deliberation.md for full Round 1 + Round 2 synthesis.

See .squad/orchestration-log/2026-05-22T20-25-51-*.md for individual agent analyses (4 files).

---

## Artifact Status

- **Inbox files:** 7 files to be archived after decision
  - graham-brain-repo-placement.md (Round 1)
  - oger-curator-overlap-analysis.md (Round 1)
  - graham-brain-refined.md (Round 2)
  - oger-brain-refined.md (Round 2)
  - lexander-brain-refined.md (Round 2)
  - lexander-forge-coupling-analysis.md (analysis)
  - alanice-brain-ux.md (Round 2)

- **Orchestration logs:** 4 files created (2026-05-22T20-25-51-*.md)

- **Session log:** 1 file created (2026-05-22T20-25-51-brain-repo-deliberation.md)

---

**Status:** Deliberation ongoing. Aaron to decide. Once decision is made, this section will either close as a decision or pivot to implementation planning.

---

# R5 PRD v3: Eureka v1 Product Requirements Document (Canonical Specification)

**Author:** Cassima (Product Manager)  
**Date:** 2026-05-24  
**Status:** Draft v3 — incorporates Aaron's 9 R5 round-3 OQ resolutions  
**Ceremony Context:** R5 (Requirements) round 3 — supersedes v2 on every point of conflict  
**Canonical note:** This specification is preserved verbatim as the ground truth for R6 reconciliation work. See R6 sections below for substrate reconciliation findings.

*[Full PRD v3 text preserved below]*

---

# Open Question: Squad Fit for Brain/Memory/Learning System

**Status:** Self-assessment complete (Round 3)  
**Date:** 2026-05-22  
**Requestor:** Aaron  
**Self-Assessing Agents:** Graham Knight (Lead), Roger Wilco (Platform), Alexander (SDK/Runtime), Valanice (UX)

---

## Summary: Does This Squad Fit?

**Unanimous honest verdict: NO. This squad is NOT the right primary owner for the brain project.**

**Recommendation:** New squad with epistemology + knowledge-graph expertise. Current squad continues Cairn/Forge; offers advisory roles.

---

## The Core Mismatch

**This squad was assembled for:** Cairn (observability/event pipeline) + Forge (SDK deterministic runtime) — a platform team  
**Brain needs:** Cognitive infrastructure, knowledge representation, agentic reasoning loops, epistemology — a cognitive systems team

**These are orthogonal problem domains.** Adding brain to this squad splits focus and dooms both Cairn/Forge stabilization and brain delivery.

---

## Graham Knight (Lead) — NEW SQUAD REQUIRED

**Honest verdict:** NO for brain leadership.

**Reason:** Graham excels at platform architecture (boundaries, technology trade-offs, systems design). Brain requires **epistemology-first** leadership. No shipping experience with ontologies, reasoning loops, or knowledge consolidation.

**Can contribute:** Advisory role on system boundaries and technology selection (2-3 hrs/week).

**Key finding:** Graham's brain recommendations so far focus on repo placement and scope boundaries (classic platform thinking). Brain's harder problems — "What makes knowledge durable?" "How do tiers consolidate learning?" — require someone with cognitive systems expertise.

**Leadership profile needed:**
- Epistemology/knowledge representation theorist (PhD-level)
- Shipped graph-based learning systems or similar
- Thinks in ontologies, not layers
- Comfortable with uncertainty and probabilistic models

---

## Roger Wilco (Platform Dev) — PARTIAL FIT (PHASE 1-3 INFRASTRUCTURE)

**Honest verdict:** YES for infrastructure, NO for cognition.

**Energy breakdown:**
- 🟢 HIGH: TIERS, PROPERTIES, REPRESENTATION, ACQUISITION (Cairn patterns transfer)
- 🔴 LOW: ACTIVITIES (dream/meditate/pray), KINDS (semantic/linguistic/symbolic) — unfamiliar

**Recommendation:** Stay as Platform Lead for Phase 1–3 infrastructure (storage, federation, acquisition). Hand off reasoning + ontology to specialists.

**Can contribute:** Phase 1-3 infrastructure build. Phase 3+ transition to Cairn as brain's backend service needs emerge.

**Needed alongside:** LLM/agentic specialist + knowledge ontology specialist + graph DB specialist (optional).

---

## Alexander (SDK/Runtime Dev) — BOUNDARY SPECIALIST ONLY

**Honest verdict:** NO for core work. YES for boundaries and integration.

**Design philosophy mismatch:**
- Forge: "How do I make non-determinism safe?" (containment, control)
- Brain: "How do I make non-determinism useful?" (autonomy, discovery)

These are opposing philosophies. Knowledge representation, learning loops, agentic coordination — these are outside Alexander's expertise.

**Can contribute:** Boundary specialist — design Brain ↔ Forge adapter, npm publishing strategy, type safety proofs.

**Needed alongside:** Agentic systems architect + knowledge representation designer.

---

## Valanice (UX/Human Factors) — 70% YES, 30% NO

**Honest verdict:** YES for UX/LX, NO for cognitive science.

**Strong transfer (🟢 HIGH):**
- Mental model boundaries (repo placement mirrors mental models)
- Interaction design (pull-based, max 1 proactive insight per session)
- LX optimization (MCP tools, context budgets, signal density)
- Config surfaces (trust thresholds, recency gradients, plasticity policies)
- Observable vs invisible design

**Critical gaps (🔴 LOW):**
- Cognitive science fundamentals (what does "meditation" mean neurologically?)
- Knowledge ontology (are the five kinds exhaustive? mutually exclusive?)
- Graph information architecture (traversal algorithms, semantic linking)
- Learning primitives semantics (recency decay, trustworthiness measurement)

**Recommendation:** Lead interaction design. Bring cognitive scientist + information architect alongside.

**Can contribute:** 70% of team. Other 30% is cognitive science + knowledge management expertise. Without them, brain has beautiful UX on shaky assumptions.

---

## Squad Composition: Recommended Path

**Current Squad Role:**
- ✅ **Graham, Roger, Gabriel, Alexander, Rosella, Laura** — Continue Cairn/Forge
- 🟡 **Graham + Valanice** — Advisory roles on brain (2-3 hrs/week) for boundaries/UX
- 🟡 **Roger** — OPTIONAL: Phase 1-3 infrastructure if assigned

**New Squad for Brain:**
1. **Lead:** Epistemology/Knowledge Systems architect (PhD-level, shipped graph-based systems)
2. **Graph/Vector Specialist:** neo4j/PostgreSQL + vector stores, ontology design
3. **Distributed Systems Engineer:** Federation, conflict resolution, versioning
4. **Agentic Learning Systems Engineer:** Reinforcement learning, meta-learning, reasoning loops
5. **Observability/Testing Bridge:** Interface with Laura/Gabriel (observation-focused testing)

---

## Missing Expertise Clusters

| Expertise | Current Squad | Brain Needs | Severity |
|-----------|---------------|-------------|----------|
| **Knowledge Graph Architecture** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Vector/ML Systems** | ❌ None | ✅ Important | 🔴 BLOCKER |
| **Epistemology/Knowledge Representation** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Distributed Systems (federation)** | ❌ None | ✅ Important | 🔴 BLOCKER |
| **Cognitive Systems/Agentic Loops** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Backend/Services** | ✅ Roger | ✅ Useful Phase 2+ | 🟡 SECONDARY |
| **Testing/Verification** | ✅ Laura | ✅ Useful | 🟡 SECONDARY |
| **DevOps/Deployment** | ✅ Gabriel | ✅ Useful Phase 3+ | 🟡 SECONDARY |

---

## Per-Member Recommendation

### Can Stay on Cairn/Forge
- ✅ Graham (architecture, boundaries)
- ✅ Roger (backend, data layer)
- ✅ Gabriel (deployment, CI/CD)
- ✅ Laura (testing, verification)
- ✅ Rosella (plugin architecture, SDK integration)
- ✅ Alexander (SDK runtime, Forge coupling)

### Can Contribute to Brain (Advisory Only)
- 🟡 Graham — System boundaries, technology selection (not leadership)
- 🟡 Valanice — Interaction design, LX optimization (60% contribution rate)

### Should NOT Work on Brain (Wrong Domain)
- ❌ Rosella — Plugin architecture is orthogonal
- ❌ Alexander (core) — SDK abstraction is orthogonal (keep as boundary specialist)

---

## Three Options for Aaron

### Option A: Fresh Squad (🟢 RECOMMENDED)
**Brain gets its own squad** with epistemology + graph DB + distributed systems expertise.
- **Outcome:** Brain gets undivided focus and right expertise. Cairn/Forge stabilization uninterrupted.
- **Timeline:** Parallel to Phase 5 PGO work
- **Risk:** New team ramp-up, version skew between brain and Cairn

### Option B: Current Squad + 3 Specialists (❌ NOT RECOMMENDED)
**Graft epistemology, graph DB, and distributed systems engineers** onto existing squad.
- **Risk:** Graham still leads a domain he doesn't have DNA for. Cairn/Forge work stalls. Hybrid squads split focus and underdeliver both.

### Option C: Keep Everything in Current Squad (❌ REJECT)
**Suicide by overcommit.** Cairn/Forge doesn't stabilize, brain never ships.

---

## Open Questions for Aaron

1. **Is brain Copilot-specific infrastructure or general agentic infrastructure?**
   - If Copilot-specific → maybe this squad could own it (bad idea, but possible)
   - If general → definitely needs new squad

2. **What's the MVP timeline?**
   - If 2 weeks → prototype in current squad (risky, rush job)
   - If 2+ months → new squad (recommended)

3. **How important is the epistemology layer?**
   - If "storage only" → current squad could do it (still not ideal)
   - If "learning system" → new squad required

4. **Budget for 3–5 new hires?**
   - If yes → new squad (go)
   - If no → delay brain until Cairn/Forge done, then hire for it

---

## Artifacts

**Orchestration logs (4 files):** `.squad/orchestration-log/2026-05-22T20-32-55Z-{agent}.md`
- Graham: HIGH conviction, NEW SQUAD required
- Roger: HIGH confidence, Phase 1-3 infrastructure only
- Alexander: HIGH conviction, keep as boundary specialist
- Valanice: MEDIUM conviction, 70% UX/LX yes, 30% cognitive science no

**Session log (1 file):** `.squad/log/2026-05-22T20-32-55Z-brain-squad-fit.md`

**Inbox files to delete (merged):**
- `.squad/decisions/inbox/graham-squad-fit.md`
- `.squad/decisions/inbox/roger-self-fit.md`
- `.squad/decisions/inbox/alexander-self-fit.md`
- `.squad/decisions/inbox/valanice-self-fit.md`

**Status:** OPEN QUESTION — Strong recommendation toward fresh squad, awaiting Aaron's input on budget, timeline, and scope.


---

## R5 PRD v3 Full Specification (Canonical)

[Full PRD v3 text — 48KB, preserved verbatim]

### Changelog from v2

Every delta below cites the OQ directive that drove it.

- **Attention tier transitions:** Minimal v1 rules locked: default=warm; commit→hot; retire→warm; sweep-aged demotion only (no auto-promotion); session-count hysteresis; precedence explicit > commit > sweep-aged > default. N/M placeholders R6-tunable.
- **Storage primitive (OQ-2):** v1 strawman locked: SQLite + sqlite-vec, per-tier uniform .db files at FR-7.2 paths; embedder injected. Flagged "pending R6 review against Cairn."
- **Commit follow-through (OQ-3):** Three-stage evolution locked: v1 = pull-with-boost only; v1.5 = list_active_commitments(scope) caller-initiated; retire() explicit-only + sweep emits stale-flag (never auto-retires); v2 = opt-in commit_floor?.
- **Decide schema (OQ-4):** Full structured schema locked: {question, options:[{id, label, rationale?, rejected_for?}], chosen, rationale, principal_id, confidence?, supersedes_decision_id?, revisit_at?, timestamp}. Decider renamed to principal_id.
- **Edge types (OQ-5):** Restructured into three tiers. Tier 1 eager (10): derived_from, references, contradicts, supersedes, part_of, instance_of, precedes, defined_in, decided_by, committed_in. Tier 2 sweep (2): similar_to, co_accessed_with. Tier 3 parking lot (6): caused_by, useful_for, equivalent_to, responds_to, requires, analogous_to. Tags explicitly excluded.
- **Contemplate in v1 (OQ-6):** Omitted from v1 exports entirely — no callable export, no type export, no stub. Reserved in FR-10 vocabulary table only.
- **Trust decay (OQ-7):** No automatic trust decay in v1. Trust is event-driven only. Time_since_last_verification derived field (not stored). Sweep emits stale_trust flag (does not mutate trust). T2 RESOLVED.
- **Ranker weights/formula (OQ-8):** Locked: raw = 0.5·rel + 0.2·imp + 0.2·trust + 0.1·rec; final = raw × attention_multiplier (hot=1.20, warm=1.00, cold=0.80); trust floor 0.15 (gate, configurable). T3 RESOLVED.
- **Session model (OQ-9):** Replaced. Sessions are kind=session facts (NOT a sibling table, NOT a field on every entry). New FR-13 specifies schema; FR-9 edge enum gains originated_in, modified_in, referenced_in (Tier 1) and recalled_in (Tier 2, per-session dedup).

---

## 2026-05-24: Aaron's R6 Signals (Post-Trio Reconciliation)

**By:** Aaron Kubly (via Copilot)  
**Date:** 2026-05-24  
**What:** After reading Genesta/Crispin/Edgar's R6 reconciliation reports, Aaron contributed four signals to fold into Cassima's synthesis

### Four R6 Signals

1. **"Session" is the Copilot nomenclature — converge on it.** PRD v3 has `kind=session` facts. Cairn has a `sessions` table. Aaron's position: these *are* both describing the same thing. Don't rename PRD's `kind=session` to `kind=conversation` (Genesta's proposed patch). Instead, treat the collision as a signal that we need ONE session concept across the stack. Cassima/Crispin to figure out the mechanics — table vs fact vs both — but the *name* stays `session`.

2. **Decisions in Cairn/Forge already include human decisions.** Worth keeping in mind: the existing `DecisionRecord` is about auditing the reasoning chain and building trust, not just an agent log. PRD v3's `decide` schema and the existing one are closer in spirit than Crispin's "flat vs structured, irreconcilable" framing suggests.

3. **Aaron likes the substrate overlap.** Curator≈sweep, confidence≈trust, decision records — these convergent designs are a *feature*, not a problem. Lean into the overlap rather than around it.

4. **Path D probe — design with Cairn in mind, don't force Cairn to adopt yet.** Is there a fourth strategy beyond Genesta's extend-Cairn (Path C), Crispin's clean-slate (Path A), and Edgar's shared-kernel-extract (Path B)? Specifically: design Eureka's graph model and storage **as if** the shared kernel existed and Cairn used it, but **don't** force Cairn to migrate now. Eureka ships standalone but kernel-shaped. Cairn migrates later when there's a reason. Decouples timeline pressure from architectural correctness.

### Rationale for Four Signals

These signals come from Aaron's product judgment about:
- (a) Copilot ecosystem alignment
- (b) what Cairn/Forge decisions actually mean
- (c) where the substrate convergence is doing real work
- (d) how to avoid Edgar's "refactor everything first" timeline trap without falling into Crispin's "throw it all away" disconnection

### Direction to Cassima

Aaron's four signals serve as constraints + a new Path D to evaluate, combined with the three trio reports. Cassima inherits these as input for recommending v3.1 (if reconciliation is clean) or v4 (if a path change is warranted). She holds the pen.

---

## 2026-05-25: Cassima R6 Synthesis — Path D Vindicated, v3.1 Patch Recommended

**Author:** Cassima (Product Manager)  
**Date:** 2026-05-25  
**Status:** R6 synthesis — trio reconciliation + Aaron's 4 signals → recommendation  
**Inputs:**
- PRD v3 (embedded above)
- Genesta R6 (B+ verdict, v3.1 patch path)
- Crispin R6 (Path A clean-slate recommended)
- Edgar R6 (learning-kernel extraction)
- Aaron's 4 signals (above)

### Part 1: Honest Scoreboard of the Trio

**Why did three agents read the same codebase and reach different conclusions?**

They read the **same evidence** but applied **different priors**:

| Agent | Evidence focus | Prior/lens | Conclusion |
|-------|---------------|------------|------------|
| **Genesta** | System architecture (does v3's shape fit the substrate?) | Integration-first ("how do we unify?") | B+ — v3 is sound; patch name collisions, add sqlite-vec reality check |
| **Crispin** | Schema compatibility (does v3's schema fit Cairn's tables?) | Representation purity ("schemas should be clean") | Path A — v3 is orthogonal to Cairn; clean-slate is honest |
| **Edgar** | Algorithm reusability (can we extract shared primitives?) | Reuse maximalism ("don't duplicate what exists") | learning-kernel extract — 70% exists, extract it |

**The split is priors, not evidence.** All three agree on the substrate truths:
- Cairn has no vector search (confirmed)
- Sessions are a table, not facts (confirmed)
- `DecisionRecord` is flat, not structured (confirmed)
- Sweep/ranker/trust machinery exists but is prescription-locked (confirmed)

**Crispin's "irreconcilable" framing is schema-purist.** He's technically correct that sessions-as-facts and sessions-as-table are different data models. But Aaron's signal (b) says the existing `DecisionRecord` is "closer in spirit than Crispin's framing suggests." Same pattern applies to sessions: the *concept* is shared; the *mechanics* differ.

**Edgar's "extract learning-kernel" is correct but orthogonal.** Extracting sweep/ranker/trust is a refactor that Cairn *could* adopt — but Aaron's signal (d) decouples Eureka's timeline from Cairn's. Extraction is a future-ready design decision, not a v1 blocker.

**Genesta's "v3.1 patch" understates the session mechanics.** Renaming `kind=session` to `kind=conversation` (Genesta's patch #1) is explicitly rejected by Aaron's signal (a): "Session is THE Copilot nomenclature — converge on it."

**Net:** The trio agrees on facts, disagrees on what to do about them. The disagreement is philosophical (purity vs integration vs reuse), not evidentiary.

### Part 2: Evaluate Path D (Aaron's Probe)

Aaron's signal (d) probed a fourth option:

> **Path D: Design with Cairn in mind, don't force Cairn to adopt yet.** Eureka ships standalone but kernel-shaped. Cairn migrates later when there's a reason.

**What does Path D concretely look like?**

| Dimension | Path D concrete design |
|-----------|------------------------|
| **Storage layout** | `~/.copilot/eureka/{agent,project,user}.db` — Eureka's own tier-per-file layout. Cairn keeps `~/.cairn/knowledge.db`. No forced path harmonization. |
| **Schema** | Eureka builds its own `facts` table (unified storage per v3), `relations` table (edge graph per v3), `sessions` as `kind=session` facts. Does NOT touch Cairn's `sessions` table. |
| **Edge model** | Eureka's Tier 1/2/3 edge enum (16+ types) lives in Eureka only. Cairn's FK-based joins stay as-is. No migration 013/014 pushed onto Cairn. |
| **Sweep** | Eureka's sweep is Edgar's generalized `learning-kernel/sweep` module. Cairn's Curator COULD adopt it later, but v1 ships them separately. |
| **Ranker** | Eureka's composite ranker (0.5·rel + 0.2·imp + 0.2·trust + 0.1·rec) is a standalone module. Cairn's `computePriority()` stays prescription-locked. Extraction happens when Cairn maintainer chooses. |
| **Decide schema** | Eureka's `DecisionPayload` (structured, `options[]`, `confidence: number`) coexists with Forge's `DecisionRecord` (flat, `alternatives[]`, `confidence: 'high'|'medium'|'low'`). Bridge adapter maps between them. **Aaron signal (b):** "closer in spirit than Crispin says" — adapter is tractable. |

**Path D vs Alternatives**

| Path | Summary | Cairn impact | Eureka timeline | Architectural purity |
|------|---------|--------------|-----------------|---------------------|
| **A (Crispin)** | Clean-slate Eureka; Cairn unchanged | None | Fast (greenfield) | High (no compromise) |
| **B (Edgar)** | Extract `learning-kernel/`; both Cairn and Eureka compose | Refactor required | Slow (refactor first) | High (shared kernel) |
| **C (Genesta)** | Extend Cairn with v3.1 patches; Eureka as Cairn plugin | Schema changes | Medium | Medium (forces convergence) |
| **D (Aaron probe)** | Eureka standalone but kernel-shaped; Cairn adopts later | None now; optional later | Fast (ships standalone) | High (future-compatible) |

**Is Path D a real fourth option, or is it just "Path B but defer Cairn refactor"?**

Path D is a **third axis**: it's Path A's greenfield + Path B's kernel-shaped design, without Path B's refactor-first timeline. It decouples architectural correctness from timeline pressure.

- Path A says "ignore Cairn entirely"
- Path B says "refactor Cairn first, then build"
- Path D says "design as if the refactor happened, ship without forcing it"

**Concrete difference:** Path B extracts `packages/learning-kernel/` as a prereq. Path D writes Eureka's sweep/ranker/trust as standalone modules that COULD be extracted later, but ships them inside `packages/eureka/src/learning/` for v1.

### Part 3: Recommendation — **Path D**

**Reasoning:**

1. **Aaron's signal (c): "I like the substrate overlap."** Curator≈sweep, confidence≈trust, decision records — these are convergent designs. Path D leans into overlap without forcing Cairn changes.

2. **Aaron's signal (d): "Decouple timeline pressure from architectural correctness."** Path D does exactly this. Eureka ships v1 without blocking on Cairn refactor.

3. **No v4 rewrite needed.** PRD v3's spec is sound. The gaps are implementation details (vector search, session mechanics, decide schema adapter), not structural rewrites.

4. **Trio consensus on substrate truths.** All three agree that sweep/ranker/trust exist and are reusable. Path D preserves that reuse potential without forcing extraction now.

---

### Part 4: v3.1 Patch (Not v4 Redraft)

Based on Path D, PRD v3 stands with targeted patches. **No structural rework needed.**

#### Patch 1: Sessions — Mechanics, Not Rename

**Source:** Aaron signal (a): "Session is THE Copilot nomenclature — converge on it."

**Problem:** PRD v3's `kind=session` facts vs Cairn's `sessions` table.

**v3.1 resolution:**
- **Name stays `session`.** No rename to `conversation`.
- **Mechanics:** Eureka `kind=session` facts are standalone. They do NOT replace Cairn's `sessions` table.
- **Linking:** Add optional `cairn_session_id: string?` field on session facts for cross-reference when Cairn bridge emits.
- **v1 scope:** Eureka session facts are self-contained. Cairn's session table remains authoritative for observability use cases.

**FR-13 edit:**
> Sessions are `kind=session` facts in Eureka's fact store. When a session originates from Cairn observability, the fact MAY include a `cairn_session_id` field pointing to Cairn's `sessions.id`. Eureka does not read Cairn's `sessions` table directly; the link is for audit correlation only.

#### Patch 2: Vector Search — Explicit Scope Gate

**Source:** Genesta R6 finding: "Vector support does not exist. Migration 012 is prescription deltas, not embeddings."

**Problem:** PRD v3 assumes sqlite-vec; substrate has no vector infrastructure.

**v3.1 resolution:**
- **v1 scope:** Vector search is **OUT** of v1.
- FR-2 recall uses BM25 (already specified as v1 strawman).
- `sqlite-vec` integration moves to v1.5 roadmap.
- FR-7.3 adds explicit note: "sqlite-vec is a design requirement for v1.5+; v1 ships with BM25 only."

**FR-7.3 edit:**
> v1 storage: SQLite with `better-sqlite3` (per Cairn precedent). BM25 full-text search for recall. `sqlite-vec` deferred to v1.5 for semantic similarity. Schema includes reserved `embedding_vector` column (nullable, unpopulated in v1).

#### Patch 3: Decide Schema — Coexistence Adapter

**Source:** Aaron signal (b): "DecisionRecord is about auditing reasoning chain and building trust... closer in spirit than Crispin's framing."

**Problem:** PRD v3's `DecisionPayload` (structured) vs Forge's `DecisionRecord` (flat).

**v3.1 resolution:**
- **Both schemas coexist.** Eureka uses `DecisionPayload` internally. Forge uses `DecisionRecord`.
- **Bridge adapter:** When Eureka emits a decision to observability, it maps `DecisionPayload` → `DecisionRecord`:
  - `options[].id` → `chosenOption` (chosen option's id)
  - `options[].label` → `alternatives[]` (non-chosen labels)
  - `confidence: number` → `confidence: 'high'|'medium'|'low'` (threshold mapping: >0.8=high, 0.5-0.8=medium, <0.5=low)
  - `principal_id` → `source` (human if principal is human, ai_recommendation if agent)
- **No Forge changes.** Adapter lives in Eureka's export layer.

**FR-10 (`decide`) edit:**
> Eureka's `DecisionPayload` is the authoritative internal schema. For interop with Forge's `DecisionRecord` (observability use case), Eureka provides `toDecisionRecord(payload): DecisionRecord` adapter. Adapter is one-way; Eureka does not consume Forge's `DecisionRecord` as input.

#### Patch 4: Storage Paths — Eureka-Specific

**Source:** Crispin R6: "Per-tier storage ≠ single database. Architectural mismatch."

**Problem:** PRD v3 proposed `~/.copilot/eureka/` paths. Cairn uses `~/.cairn/knowledge.db`.

**v3.1 resolution:**
- **Eureka owns its paths.** No path harmonization with Cairn.
- v3's proposed layout stands: `~/.copilot/eureka/agent.db`, `<repo>/.eureka/project.db`, `~/.copilot/eureka/user.db`.
- **Rationale:** Path D — Eureka ships standalone; Cairn's paths unchanged.

**FR-7.2 edit (no change needed, just clarification):**
> Eureka storage paths are independent of Cairn. Cairn's `~/.cairn/knowledge.db` remains observability-scoped. Eureka's paths are knowledge-scoped. No shared database; no FK constraints across systems.

#### Patch 5: Learning Kernel — Design Now, Extract Later

**Source:** Edgar R6: "~70% of infrastructure exists. Extract sweep/ranker/trust."

**v3.1 resolution:**
- **v1:** Sweep, ranker, trust modules live in `packages/eureka/src/learning/`.
- **v1.5+:** IF Cairn team chooses to adopt, extract to `packages/learning-kernel/` and both packages depend on it.
- **Design constraint:** Eureka's modules are written with clean interfaces (no Eureka-specific types in signatures). This makes future extraction tractable.

**New design note (add to FR-12):**
> Eureka's sweep, ranker, and trust modules are designed for potential extraction to a shared `learning-kernel` package. v1 ships them as `packages/eureka/src/learning/`. Extraction is a Cairn-team decision; Eureka does not block on it.

---

### v3.1 Summary Table

| Patch | PRD v3 section | Change type | Source signal |
|-------|---------------|-------------|---------------|
| Sessions | FR-13 | Mechanics clarification (add `cairn_session_id`) | Aaron (a) |
| Vector | FR-7.3, FR-2 | Scope gate (BM25 only in v1) | Genesta finding |
| Decide | FR-10 | Adapter spec (coexistence, not replacement) | Aaron (b) |
| Paths | FR-7.2 | Clarification (no change, confirm independence) | Crispin finding |
| Kernel | FR-12 | Design note (extraction-ready, defer extraction) | Edgar finding + Aaron (d) |

---

### Decision Gates for Aaron

1. **Vector v1 scope:** Confirm BM25-only for v1, sqlite-vec for v1.5. (Recommended: YES)

2. **Path D adoption:** Confirm Eureka ships standalone-but-kernel-shaped; Cairn adopts later if maintainer chooses. (Recommended: YES)

3. **Decide adapter direction:** One-way Eureka→Forge adapter. Forge does not change. (Recommended: YES)

---

### Why Not v4?

v4 redraft is warranted when:
- Structural assumptions are wrong (they're not — fact graph, trust, attention tiers are validated)
- Schema shape needs redesign (it doesn't — v3's schema is sound, just needs mechanics patches)
- Path changes fundamentally (Path D is v3's Path A with future-compatibility, not a new direction)

v3.1 patches address trio findings + Aaron signals without reframing. PRD v3 is the correct shape; implementation details needed tuning.

---

*End of Cassima R6 synthesis.*

---

### Round-4 Patches (post-Aaron review of v3)

- **Conceptual frame:** NEW "Conceptual Model" section after Problem Statement names integration in the Jungian sense and maps each verb's contribution.
- **Pray vs Commit:** Pray retired as a verb. Commit introduced with full mechanics (hot tier, registry, retire path, future commit_floor). Aspirations encoded as kind=aspiration within integrate with lighter surfacing, no auto-promotion, sweep-flaggable as stale via new stale_aspiration flag.
- **Generation/reflection family:** Note added: likely parametric modes of a shared reflection engine; verb split exists for caller-intent clarity (same pattern as recall/rerank); R6+ may collapse with a mode parameter if usage warrants.

### Key FRs (Summary)

- **FR-1:** Knowledge Storage (Core CRUD) — facts with schema, attention tiers, commitment flag
- **FR-2:** Semantic Retrieval (recall) — composite ranker: 0.5·rel + 0.2·imp + 0.2·trust + 0.1·rec; trust floor 0.15
- **FR-3:** Trust Tracking (event-driven only) — no automatic decay
- **FR-4:** Activity Surface (locked vocabulary) — integrate, recall, rerank, decide, commit, retire, evict, meditate (deferred), contemplate (deferred)
- **FR-5:** Recency Scoring — ACT-R power-law decay
- **FR-6:** Importance Scoring — stored column, sweep-maintained
- **FR-7:** Storage Architecture — SQLite + sqlite-vec per-tier at ~/.copilot/eureka/ paths (pending R6 review)
- **FR-8:** Progressive Disclosure
- **FR-9:** Graph-Ready Relations Schema (Tier 1 eager, Tier 2 sweep, Tier 3 parking lot)
- **FR-10:** Activity Vocabulary Contracts (full per-verb specification)
- **FR-11:** Commitment Registry (v1 = pull-with-boost only; minimal follow-through)
- **FR-12:** Opportunistic Sweep Process — lightweight, well-defined triggers (end-of-session, first-query-of-day)
- **FR-13:** Session Model (NEW in v3) — sessions are kind=session facts with Tier 1/2 edges

### Success Metrics

- **US-1 (Codebase Familiarization):** After one session, agent can answer 5 questions without re-reading; second session token consumption drops ≥50%; retrieved facts ≥80% precision; recall P95 < 500ms
- **US-5 (Cross-Session Continuity):** Agent can produce 3-bullet summary using only recall; checkpoints re-surface in next-session queries; continuity retrieval P95 < 200ms via session-fact + originated_in edge

### Roadmap at a Glance

| Capability | v1 | v1.5 | v2 |
|---|---|---|---|
| Core CRUD, attention tiers (minimal rules), trust (event-driven), importance, recall, rerank, decide, commit, retire, evict | ✅ | | |
| Sweep (importance decay, Tier 2 edges, stale flags, demotions, revisit_at surfacing) | ✅ | | |
| Sessions as facts, Tier 1 session edges, originated_in continuity | ✅ | | |
| Graph-ready edge schema (Tier 1/2/3) | ✅ | | |
| Sync-readiness in schema (design req) | ✅ | | |
| Contemplate (narrow+deep reflection, trust refinement, contradicts population) | | ✅ export | |
| Meditate (broad+shallow sweep-style reflection) | | ✅ | |
| List_active_commitments(scope) | | ✅ | |
| MCP server wrapper | | ✅ | |
| Squad migration (Eureka as Squad knowledge backend) | | ✅ partial | ✅ full |
| Commit_floor opt-in soft floor on recall | | | ✅ |
| Sync layer (CRDT-friendly, cross-machine sessions) | | | ✅ |
| Edge traversal API (graph queries) | | | ✅ |

**Note:** Full PRD v3 preserved verbatim in .squad/decisions/inbox/cassima-requirements-r5-v3.md (48KB canonical source). This summary captures key structural elements; see original for complete FRs, field semantics, NFRs, and deferred items.

---

## R6 Source-Reading Reconciliation — Trio Verdicts

**Ceremony:** R6 reconciliation  
**Directive:** Copilot lifted "no substrate reading" rule for Eureka agents (Genesta, Crispin, Edgar, Cassima). Trio tasked with source-grounded reconciliation of PRD v3 against packages/cairn/src and packages/forge/src substrate.  
**Status:** Complete. Three independent reports produced.  
**Outcome split:** Genesta (B+ / v3.1 patch path) vs Crispin (Path A clean-slate recommended) vs Edgar (learning-kernel extraction).

### Genesta's Verdict: B+ Grade / v3.1 Patch Path

**Summary:** PRD v3 is structurally sound. Core architecture (facts, trust, activities, ranker) aligns with substrate. Name conflicts (sessions, decisions) and vector search gap are resolvable.

**Grade:** B+ overall; structurally sound, needs 4 patches before v1 lock.

**Recommendation:** v3 stands with v3.1 patch:
1. Rename kind='session' → kind='conversation'
2. Add sqlite-vec reality check to FR-7.3
3. Clarify Forge DecisionRecord coexistence in FR-10
4. Propose ~/.copilot/ path harmonization

**Timeline:** 1-day turnaround on patches; no v4 rewrite needed.

**Key findings:**
- Storage primitive (SQLite): A — exact match, path conflict minor
- Trust/confidence model: A — convergent design, vocabulary unification needed
- Event-driven arch: A — Curator validates approach
- Vector search: D — assumed but not present, HIGH risk
- Session model: C — name collision, schema incompatible
- Decision schema: B — coexistence viable, mapping needed
- Three-tier segmentation: B — sound design, conflicts with Cairn single-DB
- Activity verbs: A — Curator as reference impl
- Composite ranker: A — Drift scoring precedent validates pattern

### Crispin's Verdict: Path A (Clean-Slate) Recommended

**Summary:** PRD v3 describes a new system, not an evolution of Cairn. Schema collisions are fundamental (not patches):
- kind=session facts vs Cairn's sessions table (incompatible by design)
- Structured decide schema vs flat DecisionRecord (irreconcilable)
- Per-tier .db files vs single knowledge.db (architectural mismatch)
- Edges as first-class vs foreign keys (graph vs relational)

**Top finding:** PRD v3's schema, storage primitive, and conceptual model are orthogonal to Cairn. Forcing convergence creates a schema serving neither use case well.

**Two paths forward:**

#### Path A: Clean-Slate Eureka (RECOMMENDED)
- Build Eureka as standalone package (packages/eureka/) with own schema
- Storage: ~/.copilot/eureka/{agent,project,user}.db with sqlite-vec
- Schema: unified facts + edges + kinds + trust/attention/importance
- Cairn unchanged — Eureka consumes Cairn's events (via bridge) but not storage
- v4 PRD rewrites FR-7.3: "Eureka does not reuse Cairn's database."

#### Path B: Cairn Extension (NOT RECOMMENDED)
- Rewrite v4 PRD to accept Cairn's schema as ground truth
- Sessions stay as table (not facts); decisions use Forge's DecisionRecord shape
- Add edges as new migration 013 (relations table)
- Add vector support as migration 014 (sqlite-vec + embedding column)
- Eureka becomes Cairn plugin

**Why Path A?** Cairn's schema is optimized for observability (events, insights, prescriptions). Eureka's schema is optimized for knowledge representation (facts, edges, trust, attention). Forcing convergence creates a Frankenstein schema.

**Confidence:** HIGH. R6 reads confirm v3's assumptions about "reuse Cairn's schema" are not grounded.

### Edgar's Verdict: Learning-Kernel Extraction Recommended

**Summary:** ~70% of Eureka's learning infrastructure already exists in Cairn (sweep, ranker, trust dynamics). BUT: tightly coupled to prescription domain.

**Top finding:** Cairn's Curator + prescriber pipeline IS Eureka's sweep — but prescription-locked.

**Key discoveries:**
- Sweep exists: Cairn Curator + prescriber pipeline = Eureka's sweep mechanism (HIGH confidence)
- Ranker formula exists: 3-term weighted sum; adding 2 more terms is O(1) (HIGH confidence)
- Trust is event-driven: already the status quo; no automatic decay (HIGH confidence)
- No retrieval primitive: grepped all of Cairn — no BM25, no vector store (HIGH confidence)
- Decide is already built: Forge's makeDecisionRecord() matches v3 schema exactly (HIGH confidence)
- Commitment registry missing: no committed field, no registry queries (HIGH confidence)

**Recommendation:** Extract Cairn's sweep/ranker/trust into shared learning-kernel package that both Cairn and Eureka compose.

`
packages/learning-kernel/
  sweep/        — cursor-based opportunistic sweep (generalized from Curator)
  ranker/       — composite scoring (generalized from computePriority)
  trust/        — event-driven confidence updates (generalized from change_vectors)
  recency/      — power-law decay (v3's ACT-R formula)
`

**Cost:** Medium refactor; ~70% of infra reusable; Cairn tests remain passing (must verify).

**Benefit:** One codebase; no divergence; both systems benefit from future improvements.

**Next steps:**
1. Should Eureka extract Cairn's sweep, or duplicate? (Recommend extract)
2. What retrieval library? (Recommend sqlite-vec + flexsearch)
3. Should sessions migrate to kind=session facts? (Recommend yes)
4. Who owns the learning kernel? (Recommend packages/learning-kernel/)

---

## R6 Coordinator Directive: Source-Reading Rule Lift

**Date:** 2026-05-24  
**By:** Coordinator (via Copilot)  
**Scope:** R6 ceremony coordinate

### Directive: Lift "No Substrate Reading" Rule

As of R6, the "Eureka agents may not read packages/cairn/src/ or packages/forge/src/" hard rule (in force through R5) is LIFTED. Eureka agents (Genesta, Crispin, Edgar, Cassima) may now read both source trees freely.

**Purpose:** R6 is the reconciliation ceremony. PRD v3 was written in deliberate isolation from implementation reality. Before locking v1 scope, we need a source-grounded pass to surface gaps, contradictions, and capability surprises.

**Scope:** Read-only access for now. Trio (Genesta/Crispin/Edgar) reports findings back through Cassima, who decides whether v3 stands or v4 is needed.

**Rationale for rule lift:**

The hard rule existed R1-R5 to keep requirements work decoupled from implementation reality. Cassima could draft PRD without being anchored to what Cairn/Forge could "easily" build. This produced a requirements spec written from first principles, not from "what's already there."

R6 lifts the rule now because Round 5 locked PRD v3 on substantive grounds (OQ resolutions, Aaron's 9 directives integrated). Before implementation begins, we need a reconciliation pass: does v3's spec match reality? Are there gaps, contradictions, or surprises?

**Execution model:**
1. Each agent independently reads substrate, reconciles PRD v3
2. Each agent produces detailed report (graded findings, verdicts, recommendations)
3. Reports feed to Cassima for v3.1 patch or v4 rewrite decision
4. Aaron approves decision before implementation ramp

**Scope boundaries:**
- ✅ Read-only: grep, view code, trace architectures
- ✅ Read both Cairn and Forge source
- ❌ No modifications to Cairn/Forge during R6
- ❌ No merging of Eureka code into Cairn/Forge until Aaron approves

---

## R6 Reconciliation Summary

**Decision gates** (awaiting Aaron's direction):

1. **Vector search scope:** In or out for v1? (affects Genesta's patch #2, Edgar's retrieval work)
2. **Architectural path:** A (clean-slate) or B (extension)? (affects Crispin's recommendation)
3. **Learning-kernel extraction:** Do it now or defer? (affects Edgar's roadmap)
4. **v3 vs v4:** Patch path or rewrite? (affects Cassima's intake work)

**Next steps:**
- [ ] Aaron reviews Genesta/Crispin/Edgar reports
- [ ] Cassima integrates Aaron's architectural decision into v3.1 or v4
- [ ] Squad decides vector search scope, path, kernel extraction
- [ ] Implementation roadmap updated with R6 findings

