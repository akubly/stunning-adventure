# Team Decisions — Cairn Plugin Marketplace

## Index

- [London-School TDD Directive](#london-school-tdd-directive)
- [G4 Scope & Ownership Recommendation + Directives](#g4-scope--ownership-recommendation--directives)
- [Eureka v1 Design — Cycle 1 Persona Review Canonical Resolutions](#eureka-v1-design--cycle-1-persona-review-canonical-resolutions)
- [Eureka v1 Design — Cycle 3 Zombie-Fact Semantics Decision](#eureka-v1-design--cycle-3-zombie-fact-semantics-decision)
- [PR #41 — Eureka M7 (B+C+D) Cloud Review Cycle](#pr-41--eureka-m7-bcd-cloud-review-cycle)
- [M8 Storage Scope Proposal](#m8-storage-scope-proposal)

---

## London-School TDD Directive

**Date:** 2026-05-27  
**Author:** Aaron Kubly  
**Status:** Adopted  

### Directive

> All implementation work uses **London-school (mockist / outside-in) red/green TDD**. Red first (failing test that drives the next collaborator), green next (minimal pass), then refactor. Mock collaborators at the boundary of the unit under test; test interactions, not just state. Applies to all packages — cairn, forge, types, and Eureka going forward.

### Rationale

Aaron established this as team-wide engineering standard. London-school (outside-in, interaction-focused) TDD drives internal collaborator shape from test contracts, preventing tests from confirming existing design rather than challenging it.

### Impact on Eureka v1 Development

- **Supersedes prior assumptions:** Eureka's existing `docs/eureka/sections/50-testability.md` leaned more toward state-based / contract-first / property-based testing (Detroit school). This section now becomes a complementary layer, not the spine.
- **Reshapes test strategy:** §55-tdd-strategy (authored next session by Laura) must lead with London-school red/green/refactor as the spine, demonstrating outside-in from the 9 activity verbs (7 v1 + 2 v1.5).
- **Interface stability prerequisite:** London-school mocks depend on stable seams. Open blocker **OQ-1 (shared substrate ownership)** must be resolved before Laura starts so mocks land on firm contract ground.

### Consequences

- ✅ London-school adopted as team default for all packages
- ⚠️ Laura (author of §55-tdd-strategy) must read only §10 (observable activities) and explicitly IGNORE §20/30/40/50 (internal design) to preserve outside-in discipline
- ⚠️ §50-testability section marked for revision/reconciliation with new §55-tdd-strategy (which parts carry forward as complementary? which are reframed?)
- ⚠️ OQ-1 resolution (monorepo or other substrate-ownership model) must precede §55-tdd-strategy authoring

### Next Steps

1. **Scribe merge:** This directive merged into decisions.md (this entry)
2. **Session handoff:** Coordinator asks Aaron about OQ-1 before spawning Laura
3. **Laura's task:** Author §55-tdd-strategy with red/green/refactor spine, worked example on `recall` activity, mock contract style guide, PRD AC mapping, OQ-1 dependency flags
4. **Reviewer roles:** Genesta verifies activity semantics vs §10; Edgar verifies algorithmic seams vs §30; both locked out of revision (protocol requires different agent if rejects)

---

## G4 Scope & Ownership Recommendation + Directives

**Date:** 2026-05-26  
**Authors:** Aaron (directives) + Genesta (architecture) + Cassima (PM)  
**Status:** Adopted  
**Inbox References:**
- [copilot-directive-2026-05-26-crucible-first-and-schema-signoff.md](./inbox/copilot-directive-2026-05-26-crucible-first-and-schema-signoff.md)
- [genesta-g4-scope.md](./inbox/genesta-g4-scope.md)
- [cassima-g4-scope.md](./inbox/cassima-g4-scope.md)

### Aaron's Two Directives (Adopted)

**Directive 1: Schema freeze gated on Crucible team sign-off**

Before Graham locks the shared schema for Cairn/Forge/Types, the Crucible team must sign off that the schema is suitable for both projects. Schema freeze is PENDING cross-team validation, not unilateral Graham decision.

**Directive 2: Crucible-first dogfood confirmed**

Aaron has decided Crucible v1 should ship and be dogfooded first; Eureka v1 follows. This overrides the earlier "dogfood whenever ready" stance and confirms Cassima's tiebreaker recommendation. Implication: Eureka v1.5 trains on real Crucible session WALs.

### Team-Recommended G4 Scope & Ownership

**Owner:** Graham (Lead Architect) — cross-project schema authority, neutral coordinator, already natural czar.

**Rationale:** Graham is the only stakeholder with cross-project context and architectural authority. Rotating ownership would create handoff friction at exactly the moment schema decisions require hot context. Both Genesta (Eureka Lead) and Roger (Crucible Platform) are qualified but sprint-constrained; they execute G4 protocol but don't make final arbitration calls. Cassima (PM) owns process/gates but not technical schema decisions.

**BLOCKER IDENTIFIED:** Cassima flags Crucible team roster as unknown. Cannot assign rotating operational ownership without identifying Crucible's schema decision-maker (PM, architect, or lead).

### MVP G4: Four Load-Bearing Pieces

**1. Schema Design Doc (Pre-Freeze Sign-Off Gate)**
- **What:** Graham drafts shared schema covering SessionId brand, Cairn sessions table, event_log EventType namespace, Forge DecisionRecord API surface
- **Who:** Graham drafts; Crucible team (Cassima + implementation leads) + Eureka team (Genesta + Crispin + Edgar) review
- **When:** Before sprint 2 (before either project mutates shared substrate)
- **Why:** This is Aaron's explicit gate — schema freeze is NOT unilateral. Without formal sign-off, one project ships schema breaking the other's assumptions
- **Format:** Freeze covers type signatures/contracts only, not implementations. Crucible can change internal Curator logic without sign-off; changing DecisionRecord fields requires sign-off

**2. Shared CHANGELOG in Packages (Post-Freeze Mutations)**
- **What:** `packages/cairn/CHANGELOG.md`, `packages/forge/CHANGELOG.md`, `packages/types/CHANGELOG.md` with one-line entries per user-facing change
- **Format:** `YYYY-MM-DD — <change summary> (PR #123, @author)` with `[Crucible]`/`[Eureka]` prefix
- **Why:** Durable record of what changed and when. Slack is ephemeral; CHANGELOG survives repo history. Enables "what changed since last integration?" queries at v1.5 bridge work
- **Cost:** ~2 min/PR (add one line before merge)
- **Anti-pattern:** Do NOT require essays in CHANGELOG; that's PR description's job. CHANGELOG is index, not documentation

**3. GitHub Label (`shared-substrate`) on PRs**
- **What:** PRs touching `packages/cairn/`, `packages/forge/`, `packages/types/` auto-labeled via CI
- **Why:** Async visibility. Without label, Eureka team doesn't know Crucible is mutating shared surface until CI breaks. Label triggers cross-project review request
- **Cost:** <30 min setup (GitHub Actions + label config)

**4. Slack/Chat Handoff (Breaking Changes Only)**
- **What:** PRs with `shared-substrate` label + breaking changes trigger Slack post to `#squad-coordination` (or dedicated `#shared-substrate` channel)
- **When:** Pre-merge (gives 24-48h window for cross-project review)
- **Why:** Async coordination requires notification. Without handoff, one team merges breaking change, other team discovers via CI failure
- **Scope:** Breaking changes = schema changes, API removals, enum/brand additions. Non-breaking changes (new optional fields, internal refactors) skip handoff
- **Cost:** <15 min/week (one Slack post per breaking PR, typically 0-2/week)

### Breaking Change Definition

G4 fires when PR touches `packages/cairn/`, `packages/forge/`, or `packages/types/` AND introduces breaking change:

1. **Schema changes:** Altering `sessions` table columns, `event_log` EventType enum, `SessionId` brand contract, `DecisionRecord` fields
2. **API surface mutations:** Renaming/removing exported functions, changing function signatures (required params, return types), deleting public classes/interfaces
3. **Enum/brand additions:** Adding new EventType values, defining new branded types (impacts both projects' type checking)
4. **Migration requirements:** Changes requiring Eureka or Crucible to update adapter logic, ingest queries, or factory wiring

**NON-triggers (skip G4):**
- **Internal refactors:** Curator algorithm changes, Forge prescriber tweaks — if public API unchanged, no G4
- **New optional fields:** Adding optional params, new columns with defaults — backward-compatible, no coordination needed
- **Bug fixes:** Fixing behavior to match documented contract — if contract unchanged, no G4
- **Documentation:** README updates, JSDoc improvements — skip G4
- **Edge case:** "Is this breaking?" Ambiguous cases — PR author tags Graham for ruling. If Graham says "breaking," G4 fires

### Sequencing: Both Lightweight Pre-Freeze + Full Post-Freeze

**Phase 1: Pre-Freeze (Lightweight G4)**
- **Scope:** Schema design doc review + sign-off
- **Participants:** Graham drafts; Crucible team + Eureka team review
- **Timeline:** Before sprint 2 (before either implementation mutates shared substrate)
- **Deliverable:** Frozen schema doc covering SessionId, Cairn sessions, event_log EventType namespace, Forge DecisionRecord API surface
- **Why this is G4:** Most important G4 invocation — both projects lock shared contract upfront
- **What gets frozen:** Type signatures and contracts. NOT implementations or internal logic

**Phase 2: Post-Freeze (Full G4)**
- **Scope:** All 4 MVP pieces (schema doc updates, CHANGELOG, label, Slack handoff)
- **Trigger:** Breaking changes post-freeze (per definition above)
- **Timeline:** Sprint 2 onward (ongoing until v1 ships, then v1.5+)
- **Why this is G4:** Once schema is frozen, G4 governs *changes* to frozen baseline. Without post-freeze G4, freeze is unenforceable — one project drifts undetected
- **Key invariant:** Schema freeze is *baseline*, not straightjacket. Both projects can propose changes (new EventType values, new DecisionRecord fields), but changes require sign-off

### Crucible-First Implication: G4 Matters MORE, Not Less

**The dynamic:**
- **Crucible is the schema authority during v1** — Crucible's needs drive SessionId design, event_log EventType values, DecisionRecord fields
- **Eureka is the adapter during v1** — Eureka's FR-14 Path 2 ingestion logic must consume whatever DecisionRecord schema Crucible ships
- **Eureka has no leverage to block Crucible** — if Crucible needs a feature, Eureka adapts (within reason)

**Why this makes G4 CRITICAL:**

Without G4, Crucible can unilaterally mutate DecisionRecord schema breaking Eureka's adapter assumptions:
- **Failure example:** Crucible renames `decidedAt` → `timestamp`. Eureka's `fromDecisionRecord()` adapter breaks. Eureka discovers at integration time (weeks later), must retrofit
- **G4 prevents this:** Crucible PR renames field → `shared-substrate` label fires → Slack handoff → Genesta comments "Eureka's adapter references `decidedAt`; please keep alias or migrate" → Crucible adjusts PR → both unblocked

**Without G4, schema divergence accumulates invisibly during parallel v1 work.** Git merge is line-oriented, not type-aware; semantic conflicts compile separately, crash at integration. G4 ensures Crucible documents schema intent (CHANGELOG + Slack) so Eureka can adapt correctly first time, zero retrofit.

### Coordination Cost Quantified

| Phase | Activity | Frequency | Time | Owner |
|-------|----------|-----------|------|-------|
| **Setup** | Schema freeze doc + review | Once (sprint 1) | 2 hours | Graham + both teams |
| **Setup** | GitHub label + webhook config | Once (sprint 1) | 1 hour | Graham |
| **Ongoing** | CHANGELOG entry | Per substrate change (~2/sprint) | 10 min each | Change author |
| **Ongoing** | PR label triage | Per substrate PR (~2/sprint) | 5 min (automated) | Webhook |
| **Ongoing** | 15-min sync gate | Per breaking change (~1/sprint) | 15 min | Graham + leads |
| **Ongoing** | Slack handoff | Per non-breaking change (~1/sprint) | 5 min | Change author |

**Total overhead:**
- **Setup (one-time):** 3 hours total
- **Ongoing (per sprint):** ~50 min/sprint = ~12 min/week during parallel dev (Sprint 2-4)
- **Post-Crucible-ship:** ~10 min/sprint = ~2.5 min/week (Eureka-initiated changes only)

**Verdict:** Low overhead. Branch-tree analysis showed G4 costs 3 hours total with ZERO retrofit risk, preventing 2-7 day integration delay. This is the price of parallel dev on shared substrate.

### Immediate Actions (Pending Aaron Approval)

1. **This week (Graham):** Configure `shared-substrate` label + GitHub Actions to auto-label PRs touching `packages/{cairn,forge,types}/`
2. **This week (Graham):** Set up Slack webhook to post `shared-substrate` PRs to `#squad-coordination` (or create dedicated `#shared-substrate` channel)
3. **Before sprint 2 (Graham + both teams):** Convene schema freeze sign-off meeting (15-30 min). Lock SessionId, Cairn sessions, event_log EventType namespace, Forge DecisionRecord. Document in `.squad/decisions/schema-freeze-v1.md`
4. **Before sprint 2 (Roger):** Create `CHANGELOG.md` stubs in `packages/cairn/`, `packages/forge/`, `packages/types/` with format template

### Open Blockers

**Crucible team roster unknown** — Cassima flags this as critical blocker for rotating ownership assignment. Aaron must identify:
- Crucible's schema decision-maker (PM, architect, or platform lead)
- Whether rotating ownership (Genesta ↔ Crucible lead alternate by sprint) is feasible
- If not, Genesta owns G4 solo but escalates breaking-change syncs to Graham

### Key Learnings

1. **G4 is insurance, not overhead.** The 3 hours setup + 12 min/week prevents 2-7 days retrofit at v1 ship (quantified in branch-tree analysis §200-262).

2. **Schema freeze + sign-off elevates both teams to co-equal authorities.** Neither can unilaterally break the other. G4 is enforcement mechanism for that agreement.

3. **Crucible-first doesn't reduce G4's importance; it increases it** by making Eureka dependent on stable Crucible schema during parallel v1 work. Coordination at commit time (15-min fix) prevents retrofit at integration time (2-week blocking).

4. **CHANGELOG is load-bearing.** Single source of truth for substrate changes. Both teams must commit to reading it before PRs.

5. **Git merge is a line editor, not a type checker.** Deferred coordination doesn't eliminate coordination — it moves it to worst moment (post-ship, cold context, both teams blocked). Front-load hard decisions when context is hot.

### Consequences

- ✅ Graham (neutral coordinator) confirmed as G4 owner
- ✅ MVP G4 confirmed: schema doc (pre-freeze) + CHANGELOG/label/Slack (post-freeze)
- ✅ Breaking change definition locked (schema changes, API mutations, enum/brand additions, migration requirements)
- ✅ Sequencing confirmed: BOTH lightweight pre-freeze + full post-freeze
- ✅ Crucible-first implication analyzed — G4 MORE critical, not less
- ⚠️ Graham must implement G4 tooling (label + Slack webhook) this week
- ⚠️ Schema freeze sign-off meeting must happen before sprint 2
- ⚠️ Aaron action: identify Crucible team roster for rotating ownership assignment
- ⚠️ Aaron action: confirm `#squad-coordination` vs dedicated `#shared-substrate` Slack channel

---

## Crucible/Eureka Shared-Substrate Revision Round

**Date:** 2026-05-26  
**Authors:** Aaron (directives) + Genesta (architecture) + Cassima (PM)  
**Status:** Accepted (decision gates remain pending)  
**Inbox References:**
- [copilot-directive-2026-05-26-shared-substrate.md](./inbox/copilot-directive-2026-05-26-shared-substrate.md)
- [genesta-shared-substrate-revision.md](./inbox/genesta-shared-substrate-revision.md)
- [cassima-shared-substrate-revision.md](./inbox/cassima-shared-substrate-revision.md)

### Context

Genesta and Cassima conducted a four-agent overlap analysis (Genesta/Crispin/Edgar/Cassima memos on Crucible PRD vs Eureka PRD) to coordinate two simultaneous v1 implementations. The analysis identified shared substrate hazards and recommended three coordination gates. Aaron's response dissolved one non-problem and clarified three scope directives, requiring revisions.

**Key clarification:** `D:\git\mem` and `D:\git\harness` are two working copies of the same git repo (`akubly/stunning-adventure`), not separate repos. Cairn/Forge/Types are therefore NOT duplicated — they are single sources, shared by topology.

### Aaron's Directives (Adopted)

1. **Same repo topology.** The "cross-repo ownership crisis" in earlier overlap memos was an artifact of analyzing two clones as if they were separate repos. This is DISSOLVED — not a real problem.

2. **Plan to share Cairn/Forge/Types from the start.** Both Crucible and Eureka will consume the same packages as shared substrate. Design decisions in either project must account for the other consuming the same code. No parallel/duplicate implementations.

3. **Separate v1s.** Crucible v1 and Eureka v1 ship as independent products. Integration (e.g., Eureka consuming Crucible's WAL) is v1.5+ work, not v1.

4. **Dogfood timing open.** Whichever ships first gets dogfooded first. No predetermined sequence.

### Revised Architectural Gates (Genesta)

| Gate | Status | Owner | Blocker? |
|------|--------|-------|----------|
| **G4: Coordination Protocol** | CRITICAL (NEW) | Graham + Cassima + Genesta | YES (sprint 2) |
| **G1: Event Schema Co-Design** | Unblocked | Roger + Graham | NO (can parallelize) |
| **G2: SessionId Brand** | CLOSED | Cassima | NO |
| **G3: Decision Schema Bridge** | Unblocked | Cassima + Graham | NO (sprint 3) |

**G4 (NEW — TOP CONCERN):** When Crucible changes `packages/cairn`, `packages/forge`, or `@akubly/types`, Eureka must know. Shared-from-start directive moves substrate changes from "architectural planning" to "sprint-2 coordination risk." Solution: (a) shared CHANGELOG per package with `[Crucible]`/`[Eureka]` prefixes, (b) GitHub label `shared-substrate` triggers dual-Lead review, (c) pre-merge Slack handoff in shared channel, (d) breaking changes require 15-min sync before PR opens. Status: unblocked (design ready, tooling is <1h). This is operationally load-bearing before sprint 2.

**G1 (REVISED):** Single `events` table with discriminator column and `EventType` enum (namespace convention: `crucible:request`, `eureka:recall`, etc.). Design is ready; gate is 15-min sync before sprint 2 to lock namespace.

**G2 (CLOSED):** `SessionId` brand is Eureka v5 R8, already in `@akubly/types`. Crucible imports as-is. No collision, no redefinition needed.

**G3 (STILL REAL):** Crucible `Decision` primitive must emit Forge `DecisionRecord` at write time (bridge pattern) so Eureka Path 2 adapter can learn from Crucible sessions. Gate is 15-min sync before sprint 3 to review Forge API surface.

### PM Stance Revision (Cassima)

**Eureka v1 scope unchanged:** All 4 user stories (US-1 through US-4) and 14 functional requirements ship per v5-final spec (617 lines, R8 LOCKED). Crucible being a sibling does not change Eureka's v1 deliverables.

**Dogfood timing:** Aaron's directive allows either ship first. **Cassima's recommendation: Eureka second.** Rationale: (1) Crucible's v1 success bar is existential (months-long bootstrap loop); Eureka's is incremental (2-session validation). (2) If Crucible ships first, Eureka's US-1 "familiarization" trains on real Crucible WAL (higher fidelity). (3) If Eureka ships first, it trains on Copilot CLI logs (ephemeral). Crucible-first de-risks both projects. Parallel dogfood viable but higher-friction (context-switching tax, merge conflicts, tool-boundary confusion during v1 coexistence).

**Coordination cost:** Schema freeze gates + async memos (no recurring syncs). Graham is cross-project schema czar; locks SessionId, Cairn sessions table, Forge DecisionRecord before implementations start. Substrate changes require Graham sign-off via `.squad/decisions/inbox/` memos (Genesta/Crispin → Graham for Eureka changes; Alexander/Roger → Graham for Crucible changes). Genesta + Roger coordinate DB migrations; Crispin + Alexander coordinate dependency bumps. Coordination overhead: <30min/week.

### Key Learning

**Shared-from-start is architecturally simpler than extract-later** (no migration), but operationally requires active coordination. **G4 protocol is the price of parallel dev on shared substrate.** Without it, one team breaks the other mid-sprint. With it, coordination cost is <30min/week. Front-loading the hard decisions prevents expensive retrofits.

### Consequences

- ✅ Forge ownership crisis DISSOLVED (same repo, no duplication/drift)
- ✅ Separate v1s CONFIRMED (Crucible records, Eureka learns; both standalone)
- ✅ G2 SessionId CLOSED (import existing type, no collision)
- ✅ G1/G3 UNBLOCKED (design ready, need coordination syncs)
- ⚠️ G4 CRITICAL: Graham must configure `shared-substrate` label + Slack webhook this week
- ⚠️ Aaron owes: schema freeze approval + dogfood timing call

### Open Aaron Actions (Pending)

1. **Schema freeze approval.** Graham drafts freeze doc (SessionId, Cairn sessions, Forge DecisionRecord); Aaron reviews + approves. Both Eureka and Crucible implementation blocks until freeze lands. **ETA:** This session.

2. **Dogfood timing call.** Option A (Crucible first — Cassima's rec), B (Eureka first), or C (parallel). **ETA:** This session.

---

## Branch-Tree-vs-G4 Strategy Pressure Test

**Date:** 2026-05-26  
**Author:** Aaron (directive) + Genesta (architecture) + Cassima (PM)  
**Status:** Analyzed & Converged — Recommendation: ADOPT G4, REJECT branch-tree  
**Inbox References:**
- [genesta-branch-strategy.md](./inbox/genesta-branch-strategy.md) — Architectural analysis
- [cassima-branch-strategy.md](./inbox/cassima-branch-strategy.md) — PM/timing analysis

### Context

Aaron pressure-tested G4 continuous coordination by proposing branch-tree-with-reconciliation as an alternative: each project (Crucible/Eureka) mutates Cairn/Forge/Types in its own branch, reconciling at strategic checkpoints or after both v1s ship. Both Genesta and Cassima independently analyzed this strategy and converged on the same verdict: **KEEP G4, REJECT branch-tree.**

### Key Findings

**Genesta (Architectural Analysis):**
- Git's line-oriented merge (union or 3-way) cannot reason about TypeScript semantics
- Schema divergence creates compile-time-silent traps (optional-but-required fields, brand mismatches, enum additions) that manifest as integration bugs weeks later
- Union merge produces duplicate declarations (garbage); standard merge misses semantic conflicts
- Strategic reconciliation costs 7.5 hours over 6 weeks; deferred costs 2-5 weeks calendar time plus retrofit risk
- G4 costs 3 hours total with zero retrofit risk
- **Recommendation: Schema freeze + continuous coordination prevents integration nightmares at commit time for trivial (<1h) tooling**

**Cassima (PM/Timing Analysis):**
- Branch-tree delays Crucible → Eureka integration by 1-4 sprints (strategic: 1-2 sprints; deferred: 2-4 sprints) due to schema divergence in DecisionRecord contract
- Schema divergence forces Eureka v1.5 bridge to reconcile TWO schemas instead of one
- Worst-case for continuous (G4): 30-minute build break mid-sprint (rare, fast recovery, small blast radius)
- Worst-case for deferred: 2-7 days at v1 ship, blocks both released products
- Time-to-v1: Continuous (G4) = 40 days + 6 hours; Strategic = 44 days; Deferred = 42-47 days (expected 44-45). G4 wins on speed, safety, and design-invalidation risk.
- **Recommendation: Continuous coordination minimizes time-to-v1 and integration delay; branch-tree saves zero time while amplifying risk**

### Shared Verdict (Both Specialists)

**ADOPT G4 Continuous Coordination:**
1. Line-merge can't reason about TS semantics → deferred coordination guarantees retrofit
2. Coordination cost moves to worst moment (post-ship, cold context, both teams blocked) instead of disappearing
3. Breaks Crucible → Eureka v1.5 integration path (delays WAL ingestion, forces dual-schema bridge)

**REJECT branch-tree reconciliation:**
- Strategic reconciliation: 4 days slower than continuous, 1-day reconciliation tax per sprint boundary
- Deferred reconciliation: 2-7 days slower, design-invalidation risk, integration delayed 2-4 sprints
- Retrofit risk is existential (one project's design choices invalidated post-ship)

### Quantified Comparison (Genesta + Cassima)

| Strategy | Total Time | Calendar Time | Retrofit Risk | Integration Delay |
|----------|-----------|---|---|---|
| **G4 continuous** | 3 hours (schema freeze) | 0 days (async) | Zero | Zero (immediate) |
| **Strategic checkpoints** | 7.5 hours (over 6 weeks) | 0 days (sprint boundaries) | Low | 1-2 sprints |
| **Deferred** | 2-5 weeks | 2-5 weeks (blocking) | High | 2-4 sprints |

### Consequences

- ✅ G4 (continuous coordination) CONFIRMED as load-bearing for Crucible/Eureka v1 parallel work
- ✅ Schema freeze + CHANGELOG/label/Slack protocol is the right level of overhead (6 hours + <1h/week async)
- ✅ No design invalidation risk (schema locked upfront, both projects test against merged contract)
- ❌ Branch-tree strategies (strategic or deferred) rejected due to retrofit risk, integration delay, and false promise of "coordination savings"
- ⚠️ Graham must implement G4 tooling (shared-substrate label + Slack webhook) before sprint 2 starts

### Key Learning

**Git merge is a line editor, not a type checker.** Deferred coordination doesn't eliminate coordination — it just moves it to the worst possible time (post-ship, cold context, both teams blocked). Front-load schema decisions when context is hot and changes are in-flight. Continuous coordination at commit time is **10-40× cheaper** than reconciliation at integration time.


---

## Eureka v1 Design — Cycle 1 Persona Review Canonical Resolutions

# Cycle 1 Persona Review — Canonical Resolutions

**Date:** 2026-05-28
**Reviewer:** Squad persona-review Design Panel (Architect/Skeptic/Pragmatist/Compliance)
**Requested by:** Aaron Kubly
**Status:** All 19 findings accepted by Aaron. This document is the canonical source of truth for the fix wave.

All fix agents in cycle 2 MUST read this file and apply the resolutions below. If a finding spans multiple sections, every agent who owns one of those sections must update their section to match — coordinate through this file, not by reading each other's edits.

---

## B1 — Scoring formula: ADDITIVE wins

- **Canonical formula:** `rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency`
- **Final:** `finalScore = rawScore × attention_multiplier` where `attention_multiplier ∈ {hot=1.2, warm=1.0, cold=0.8}`
- `relevance` is **normalized BM25** score, scaled to [0,1] per query (min-max across the candidate set, or sigmoid — Edgar's call which to specify)
- **Owner section:** §30 (Edgar). All other docs reference §30 §1.2 by section number.
- **§20 contract:** `RecallResult` interface MUST expose `importance_score` (parity with the formula). The multiplicative formula is **deleted** from §20.

## B2 — Trust + retire semantics: field-level immutability + retired flag

- **Trust domain:** `[0.0, 1.0]` EVERYWHERE — at storage, in memory, in interfaces. **No storage/read distinction.**
- **Retirement:** dedicated `retired: boolean` field on `Fact` (NOT trust-zeroing). Default `false`.
- **Committed-fact immutability:** **field-level**, not row-level.
  - **Immutable post-commit:** `content`, `kind`, `sources`, `provenance`, `created_at`
  - **Always mutable:** `trust`, `importance`, `last_accessed`, `access_count`, `retired`
- **Default recall filter:** `WHERE retired = false AND trust >= 0.15`
  - Both overridable per-query: `recall({ ..., include_retired: true, min_trust: 0.0 })`
- The 0.15 floor is a **read-time default predicate, NOT a domain constraint** on the field.
- **Owner section:** §20 (Crispin) for schema; §30 (Edgar) for mutation policy + retire algorithm. §10/§50 reference these.

## B3 — Decision ownership: Forge audit-authoritative, Eureka learning-authoritative

- `decide()` emits a decision event.
- **Forge** writes the audit record — immutable, authoritative for compliance/replay/audit trail.
- **Eureka** subscribes to the event and writes a learning-shaped decision-fact — mutable `trust`/`importance`/`access_count`, authoritative for recall and learning.
- Shared `decision_id` correlates them.
- **Source of truth for compliance = Forge. Source of truth for learning = Eureka.**
- Reconciliation runs against `decision_id`.
- **§10 fix:** Remove "decide() does NOT write to Eureka DB" — replace with the role-split prose above.
- **§00 fix:** Path 1 order — Forge writes first (audit record), Eureka writes on subscribed event (learning fact). Not the other way around.
- **PRD fix:** Clarify "persisted as both" with the role split; specify duplicated vs referenced fields; specify reconcile-on-disagree policy.

## I1 — §55 worked-example file paths

- Replace `packages/forge/src/__tests__/recall.test.ts` → `packages/eureka/src/activities/__tests__/recall.test.ts`
- Replace `packages/forge/src/recall.ts` → `packages/eureka/src/activities/recall.ts`
- Replace `packages/cairn/src/curator-store.ts` → `packages/eureka/src/storage/curator-store.ts`
- Add dep-direction lint guardrail to **M1**, not M5 (mention in §40 acceptance criteria).

## I2 — Trust initial values: canonicalize in §30

- §30 (Edgar) is the single source. Source-type initial trust values:
  - User-confirmed/explicit: **0.9**
  - User-provided default: **0.6**
  - Agent-inferred (LLM): **0.5**
  - Path 2 low-confidence: **0.4**
  - External/API-sourced: **0.7** (if used in v1)
- §10 and §20 reference §30 by section number rather than restating numeric values.
- §55 AC mapping (FR-4.3) gets per-source-type test cases.

## I3 — §20 `RecallQuery.min_trust` default

- Change default from **0.5 → 0.15** to match the canonical floor.

## I4 — Constants provenance

- Edgar adds rationale to §30 for each constant:
  - Ranker weights (0.50/0.20/0.20/0.10): derivation method + sensitivity-analysis note
  - Tier multipliers (1.2/1.0/0.8): rationale
  - Tier thresholds (hot ≥ 0.7, warm ≥ 0.4): rationale + expected distribution
  - Trust floor (0.15): definition of "pathological zero-trust state" + why 0.15
  - Recency exponent (0.7): **fact-check vs Anderson's ACT-R (typically 0.5)** — if 0.7 is intentional, document why; if accidental, fix to 0.5
  - Time constant β (1 day): rationale + tuning guidance

## I5 — Manual-flush failure mode

- Ship opt-in auto-flush-on-session-end **feature flag** in v1 (not v1.5).
- Add actionable error UX text (referencing §60-style messages): "Memory not captured — fix steps:".
- Owner section: §40 (Roger) for the flag wiring; UX text can be inline or in §60 — Roger's discretion.

## I6 — M0 monorepo merge time-box

- Document in §40 (or ADR-0002): time-box M0 to **5 days**.
- Run a **4-hour scaffolding spike** first (pnpm workspace + turborepo + one cross-package import).
- **Rollback procedure:** if M0 exceeds 5 days, revert to **Option C (npm packages)** with private registry for v1.

## I7 — Ship one tier, hide the seam

- v1 public `recall()` signature has **NO `tiers` parameter**.
- Internal implementation hardwires to agent tier.
- **`Fact.scope` STAYS** in the storage schema for forward-compat.
- **DELETE `NotImplementedError` stubs** for user/project tier write paths — don't ship them at all in v1.
- v1.5 will add the `tiers` parameter and the federation paths when those tiers actually wire.
- Owner sections: PRD (Cassima) for the public API spec; §10 (Genesta) for the activity signature.

## I8 — Bridge reconciliation: schedule + telemetry + runbook

- **Weekly cron** runs `eureka reconcile`.
- Telemetry counter: `eureka_reconcile_divergence_count`.
- **Written playbook** for divergence response: when reconcile reports ∅ ≠ empty, what does the operator do? Replay from Forge? Manual INSERT into Cairn? Delete orphaned ledger row? Document the decision tree.
- v1.5 design note: push-based event-stream comparison instead of pull-audit.
- Owner section: §40 (Roger).

## I9 — Single 500ms latency SLO + M4 load test

- Collapse the four conflicting targets into **one shipped SLO: P95 recall < 500ms**.
- 50ms / 100ms / 200ms become **internal targets for hot paths**, not shipped guarantees.
- **M4 load test** with 1000 facts (NFR-2 target): measure P50/P95/P99. P95 > 500ms = ship-blocker.
- Production telemetry: histogram `eureka_recall_latency_ms`.
- Owner section: §30 (Edgar) for the SLO statement; §40 (Roger) for test wiring if cross-package.

## I10 — Eval set in M0

- Create eval set as **M0 deliverable**: 10 questions (5 train + 5 held-out).
- Target codebase: **mem/ repo** (dogfood).
- Ground-truth each question (file paths, line numbers, expected facts).
- **Measure grep-baseline** (human rediscovery tax) before any Eureka code lands.
- Wire held-out 5 into **CI at M4** as ship-blocker if precision < 80%.
- Owner section: PRD (Cassima) for the deliverable spec; appendix with question list and ground truth.

## I11 — Threat-control implementation status table

- Add to PRD §14a: "v1 Threat Control Implementation Status" table.
- Each control marked **code-enforced / policy-enforced / deferred**.
- Auto-check ESLint rule for the cross-DB ban (FR-7.2).
- Telemetry counter for suspicious same-principal trust patterns (visible, not enforced in v1).
- Owner section: PRD (Cassima).

## M1 — §55 side-effect test example

- Add §55 §2.5 or §2.6 demonstrating side-effect assertion:
  ```typescript
  it('increments accessCount for returned facts', async () => {
    await recall(...);
    expect(store.getAccessCount(factId)).toBe(2);
  });
  ```
- Teach the implementer that London-school requires explicit side-effect assertions, not just return-value checks.

## M2 — Path 2 ingestion scope

- **Defer Path 2 to v1.5** unless a v1 production consumer commits to using it.
- Keep design docs as-is; do not ship code for it in v1.
- Owner section: PRD (Cassima); §40 (Roger) for the wiring decision.

## M3 — Kernel-extraction success criterion

- M5 canary: literally move `packages/eureka/src/learning/` → `packages/learning-kernel/src/`, run tests, count required edits.
- **Define "extraction-ready":** moving the package to a new path requires only import-path updates, no interface changes, no test rewrites. Edit count < 10 = success.
- Owner section: §40 (Roger) for the canary spec.

## M4 — Partial-restore test

- M4 deliverable: simulate partial restore (delete one DB at a time, verify graceful degradation).
- Document in NFR-6: "`session_id` is opaque metadata, not a traversable FK."
- Owner section: §40 (Roger).

## M5 — "Alternatives Considered" subsections

- Add brief sections to §30 (ranker — BM25 vs TF-IDF vs LSH vs semantic embeddings) and §55 (TDD methodology — London-school vs Detroit-school vs classical).
- Brief; not full ADR depth.
- Owner sections: §30 (Edgar), §55 (Laura).

---

## File-ownership fix-wave assignment

| Agent | Files owned | Findings to land |
|---|---|---|
| Cassima (PM) | `.squad/decisions/eureka-prd-v5-final.md` | B3 (PRD prose), I7 (remove `tiers` from public API spec), I10 (M0 eval-set deliverable + appendix), I11 (threat-control status table), M2 (Path 2 defer note) |
| Genesta (Cognitive Systems Lead) | `docs/eureka/sections/10-activities-and-tiers.md`, `docs/eureka/sections/00-overview.md` | B3 (§10 remove "decide does NOT write"; §00 Path 1 order fix), I7 (§10 recall signature without tiers param), I2 (cross-ref §30) |
| Crispin (Knowledge Rep) | `docs/eureka/sections/20-knowledge-representation.md` | B1 (strip multiplicative; add `importance_score` to RecallResult), B2 (trust∈[0,1]; add `retired` field; field-level immutability schema rule), I3 (`min_trust` default 0.5→0.15), I2 (cross-ref §30) |
| Edgar (Learning Systems) | `docs/eureka/sections/30-learning-systems.md` | B1 (canonical additive formula + normalized BM25 spec), B2 (retire via flag in algorithm; trust mutation policy), I2 (trust init source-type values canonical), I4 (constants provenance + ACT-R fact-check), I9 (single 500ms SLO in §30), M5 (alternatives subsection in §30) |
| Roger (Platform) | `docs/eureka/sections/40-integration.md` | I1 (dep-direction lint to M1), I5 (auto-flush flag wiring), I6 (M0 5-day time-box + rollback), I8 (reconciliation cron + telemetry + runbook), I9 (load-test M4 wiring), M3 (kernel-extraction canary spec), M4 (partial-restore test) |
| Laura (Tester) | `docs/eureka/sections/50-testability.md`, `docs/eureka/sections/55-tdd-strategy.md` | I1 (§55 paths to eureka/), B2 reflection (§50 "committed=read-only" → field-level immutability), M1 (§55 side-effect test example), M5 (§55 alternatives subsection) |

No two agents edit the same file. All cross-section coordination happens through this canon document.


---

## Eureka v1 Design — Cycle 3 Zombie-Fact Semantics Decision

# Cycle 3 Decision: Zombie-Fact Semantics (trust=0 vs. retirement)

**Agent:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-28  
**Context:** Architect cycle 2 advisory flagged semantic ambiguity in §30  
**Status:** RESOLVED — Option 2 chosen

---

## Problem

With B2 policy (`retired: boolean` field separate from trust), the trust-penalty formula `max(0.0, fact.trust - 0.10)` can decay a fact's trust to 0.0 through repeated contradiction. Default recall filter `WHERE retired=false AND trust>=0.15` means trust=0 facts are:

- **Effectively invisible** (filtered by 0.15 floor)
- **Formally not retired** (`retired=false`)

This is a "zombie fact" — occupies space, shows up in raw queries, never surfaces to users.

**Question:** Should the system auto-retire facts when trust decays to 0.0, or is "low-trust-but-not-retired" a meaningful state?

---

## Options Considered

### Option 1: Auto-retire on trust=0

When trust decays to 0.0 (via penalty, never via explicit set), the trust-update algorithm also sets `retired=true`.

**Rationale:** trust=0 means "system has lost all confidence" — that's a lifecycle signal, not just a quality signal. Simpler mental model: filter applies, retirement applies, both visible to operators.

**Rejected:** Conflates epistemic state (trust) with lifecycle state (retirement). Makes it impossible to distinguish "algorithm lost confidence" from "user/policy decided to remove."

### Option 2: Preserve the distinction ✅ CHOSEN

trust=0 means "epistemically dead" but the fact is preserved (for forensic analysis, replay, future re-evaluation). Explicit retirement (`retired=true`) is reserved for deliberate lifecycle decisions: user "forget this", policy sweep, supersession.

**Rationale:** Separates epistemic state from lifecycle state, which is the whole point of B2. Better audit trail. Provides recovery path (trust=0 facts can regain trust via corroboration or manual correction without un-retiring).

---

## Decision

**Policy:** Preserve the distinction. Trust=0 facts retain `retired=false`.

**Implementation:**
- trust-update algorithm (in `contemplate`) applies `max(0.0, ...)` bounds-checking but does NOT set `retired=true` when trust reaches 0.0
- Retirement remains a manual or policy-driven action via `retire()` API

**Operator Guidance:**
- Facts with trust=0.0 are filtered from default recall but remain in database
- Use `recall({ include_retired: true, min_trust: 0.0 })` in diagnostic queries to surface zombie facts
- Use `retire(fact_ids)` explicitly when a fact should be lifecycle-removed

---

## Rationale Detail

1. **Audit trail:** Trust decay history (via `contemplate` outcomes) vs explicit retirement (via `retire()` API) are distinguishable in telemetry. Operators can query "why did this fact lose trust?" by examining decision events.

2. **Recovery path:** A trust=0 fact can regain trust via corroboration (v1.5 planned) or manual correction without requiring un-retirement. If trust=0 triggered `retired=true`, recovery would require lifecycle reversal (un-retire), which is semantically different.

3. **Forensic value:** Zombie facts remain subject to `sweep()` and may be demoted or flagged for manual review. If auto-retired, this feedback loop is broken.

4. **Extraction-ready contract:** If learning-kernel is extracted (Path D), the trust=0/retirement distinction becomes a kernel contract. External consumers (Cairn, Crucible, future adoption) need to know whether trust=0 has lifecycle implications.

---

## Documentation Changes

1. **§30 §2.1.1 added:** "Zombie-Fact Semantics: Trust=0 vs. Retirement" subsection (22 lines, ~1.5% of file)
2. **§30 §2.3 updated:** Removed "explicitly retired or contradicted" language from trust-floor definition (was contradictory)

---

## Cross-Team Impact

- **Crispin (§20 Schema):** `retired: boolean` field semantics now explicitly documented; trust=0 does NOT imply retired=true
- **Roger (§40 Curator):** Default filter `WHERE retired=false AND trust>=0.15` excludes zombie facts; diagnostic queries require explicit `include_retired: true, min_trust: 0.0`
- **Genesta (§10 Activities):** `contemplate` trust-update logic does NOT trigger retirement on trust=0

---

## Open Questions (none blocking)

None. Policy is internally consistent with B2 and extraction-ready design.

---

## Verification

Zombie-fact policy documented in:
- §30 §2.1.1 (algorithmic semantics)
- §30 §1.6 (retire algorithm — confirms retirement is explicit, not automatic)
- §30 §2.1 (trust mutation policy — confirms trust=0 is a valid stored state)

Cross-refs verified for consistency.

---

## Confidence

**HIGH (90%)** — Option 2 aligns with B2's epistemic/lifecycle separation. No edge cases found where conflation is simpler.

---

**For Scribe:** Merge this decision summary into `.squad/decisions.md` under "Cycle 3 Resolutions" section. Archive to `.squad/decisions/archive/` after lock.

---

## PR #41 — Eureka M7 (B+C+D) Cloud Review Cycle

**Date:** 2026-06-01 (5 review cycles)  
**Agent:** Edgar (Learning Systems Specialist)  
**Status:** COMPLETE — Merged to main as ed6be2c via squash commit  
**Test count:** 74 green, tsc clean, CI 3/3 passing  
**Copilot findings processed:** 22 unique findings across 5 cycles (doubled to 44 threads)

---

## Context

PR #41 implemented Eureka M7 Milestones B (error narrowing), C (atomicity contract), and D (session-scoped regression tests) via a 5-turn cloud-review-cycle marathon. Edgar addressed all Copilot code-review findings, resolved reviewer threads, and maintained green tests throughout.

---

## Cycle Trajectory

### Cycle 1: Contract Suite Gaps + Dangling Reference + Committed Inbox Files (8 findings → 16 threads)

**SHA:** f128f78

| Finding | Root Cause | Resolution |
|---------|-----------|------------|
| C1-C5: trust-updater-contract.test.ts | InvalidTrustValueError import missing; weak contract ("throw OR store"); weak non-finite check; getTrust from wrong instance; dead TODO | Added imports; tightened contract to require throw+no-mutate on NaN; added !Number.isFinite guard; destructured getTrust; implemented concurrent +0.1 test |
| C6: Dangling JSDoc reference | `@concurrency` cited gitignored inbox path | Updated to reference `.squad/decisions.md` PR #41 section |
| C7-C8: Committed inbox files | crispin-m7-c-storage-survey.md, crispin-m7-c-complete.md committed by mistake | git rm; content merged into decisions.md |

**Learnings:**
- Contract tests must not accept "either behavior is fine" — lock the REQUIRED behavior.
- makeImpl() called twice returns different instances; only call once per test.
- Gitignore blocks NEW files, not tracked files on merged branches.

### Cycle 2: Stale Group Header + Overclaimed Parallelism (2 findings → 4 threads)

**SHA:** 5fb53b4

| Finding | Root Cause | Resolution |
|---------|-----------|------------|
| Group 4 header (feedback-error-narrowing.test.ts) | Pre-M7-C language (`currentTrust`, `FactReader` on write path) | Rewrote to post-M7-C reality: source:'input' via non-finite delta, source:'storage' via fn receiving corrupt trust |
| C-6 overclaimed (trust-updater-contract.test.ts) | Test name said "no global lock" but assertions only checked correctness, not parallelism | Renamed to "do not interfere — reach correct value"; updated header: parallelism PERMITTED but not required |

**Learnings:**
- Atomicity ≠ parallelism — distinct contract properties.
- Stale comments in test files are a refactor tax; audit ALL group headers post-refactor.

### Cycle 3: Session-Scoping Missing + Unbounded Locks Cleanup (2 findings)

**SHA:** 1413826

| Finding | Root Cause | Resolution |
|---------|-----------|------------|
| sessionId not in keying | store/locks keyed by factId only; FactReader already session-scoped (read invariant) | Re-keyed by `${sessionId}\0${factId}` (null-byte separator); updated TrustUpdaterTestImpl; added C-7 cross-session isolation test (seed (sessionA, factX)=0.5 and (sessionB, factX)=0.7, mutate sessionB, assert sessionA unchanged) |
| locks Map unbounded | Never deleted entries | Added identity-check cleanup in finally: `if (locks.get(key) === next) locks.delete(key)` |

**Test count:** +1 (C-7 added) → 74 total

**Learnings:**
- Read/write contract symmetry: if two seams share a data model, their contracts must share key invariants.
- Identity-check cleanup in promise chains: safe atomic cleanup for the last owner.

### Cycle 4: Real CI Lint Failure + 4 Stale-Doc Nits (4 findings)

**SHA:** 75c9f25

| Finding | Root Cause | Resolution |
|---------|-----------|------------|
| Unused imports (CI lint failure) | FactNotFoundError, FactReaderContractError removed from write path but not from imports | Removed imports; classes remain in public error vocabulary for external FactReader impls |
| @concurrency JSDoc | Still said "per factId"; cycle 3 re-keyed to (sessionId, factId) | Updated to "per (sessionId, factId) pair" |
| SKILL.md lines 74-80 | Said different keys MUST be parallel; contradicts cycle-2 Option B | Fixed: PERMITTED but not required |
| SKILL.md test count | Said "6 tests (C-1..C-6)"; cycle 3 added C-7 | Corrected to 7 |
| decisions.md test count | Said "+6 contract tests"; post-cycle-3 is +7 | Added inline note with post-cycle-3 correction |

**Key incident:** Windows `npm run lint` glob expansion fails; used `npx eslint packages/eureka/src/` directly.

**Learnings:**
- Seam changes cascade into JSDoc, SKILL.md, decisions.md, test headers — systematic audit required.
- SKILL.md is normative; future agents read it literally. Accuracy > completeness.
- Windows lint: use `npx eslint packages/<pkg>/src/` not root glob script.

### Cycle 5: Comprehensive Grep-Cleanup Pass (6 findings → consolidation into 1 sweep)

**SHA:** 7ce81da

**Aaron's decision:** Diminishing returns reached; authorized comprehensive grep-and-fix pass across entire repo for old interface names from the refactor.

**Scope:** 9 grep terms run across whole repo to find residual references

**Files touched:** 6 files across docs and tests

**Outcome:** All stale doc nits fixed in one sweep. New skill created: `.squad/skills/refactor-grep-cleanup/SKILL.md` (cycle 5 lesson — grep entire repo for old interface names BEFORE shipping a refactor).

**Learnings:**
- After large refactors, grep the entire repo for old interface names before shipping.
- Document the grep terms and cleanup patterns in a reusable skill.

---

## Key Aaron Decisions During Cycle

1. **Cycle 1:** Approve contract tightening; authorize merged-content deduplication in decisions.md.
2. **Cycle 2:** Choose Option B — rescope C-6 to atomicity only, not parallelism.
3. **Cycle 3:** Affirm session-scoping as MUST invariant.
4. **Cycle 4:** (CI lint failure caught automatically; no decision gate.)
5. **Cycle 5:** Diminishing returns reached; authorize comprehensive grep-and-fix pass + commit and merge.

---

## Final Stats

| Metric | Value |
|--------|-------|
| Total cycles | 5 |
| Unique Copilot findings | 22 |
| Threads resolved | 44 |
| Tests (final) | 74 (all green) |
| Lint | Clean |
| tsc | Clean |
| CI checks | 3/3 passing |
| Final SHA | ed6be2c |
| Branch cleaned | eureka/m7-c-atomicity (remote + local), eureka/m7-c-factreader (local), eureka/m7-bd-narrowing-regression (local) |

---

## Merged Content

This section consolidates the following inbox decision drops:
- edgar-m7-c-complete.md (M7-C contract design summary + files changed)
- edgar-m7-c-contract.md (atomicity guarantee + variant B design)
- edgar-pr41-cycle1.md (Copilot cycle 1 findings)
- edgar-pr41-cycle2.md (Copilot cycle 2 findings)
- edgar-pr41-cycle3.md (Copilot cycle 3 findings)
- edgar-pr41-cycle4.md (Copilot cycle 4 findings)

(Cycle 5 findings were consolidated into the grep-cleanup pass; separate drop not required.)

---

## M7-C Design Essence (from merged content)

**TrustUpdater.mutate contract:**
```ts
export interface TrustUpdater {
  mutate(args: {
    factId: string;
    sessionId: SessionId;
    fn: (currentTrust: number) => number;
  }): Promise<void>;
}
```

**Atomicity guarantee:** The storage implementation MUST execute read, fn-application, and write as a single atomic operation with respect to other mutate() calls on the same (sessionId, factId) pair.

**Session-scoping:** Storage MUST scope state by (sessionId, factId). A mutate() on one sessionId MUST NOT observe or mutate state belonging to a different sessionId.

**Breaking API changes:**
- `TrustUpdater.update` → `TrustUpdater.mutate`
- `ApplyFeedbackOptions.currentTrust` removed
- `ApplyFeedbackByIdDeps.factReader` removed

**Test coverage:** 6 contract tests (C-1..C-7) covering happy path, fn-throws, fn-returns-non-finite, fact-missing, concurrent mutates, and cross-session isolation.

---

**For Scribe:** All inbox files merged. Ready to delete from inbox/ directory.

---

## M8 Storage Scope Proposal

**Author:** Graham (Lead / Architect)  
**Date:** 2026-06-01  
**Status:** INBOX → Approved by Aaron Q1=scaffold-A-write-B, Q2=lock cursor now, Q3=own DB file  
**Ref:** decisions.md §M7-C (line 263), PR #41

---

### 1. Goal

M8 ships a SQLite-backed `FactReader` and `TrustUpdater` for `@akubly/eureka`, replacing the in-memory implementations with durable per-session storage. "Done" means: facts written via `TrustUpdater.mutate` survive process restart, `FactReader.read` returns them correctly, the existing `runFactReaderContract` and `runTrustUpdaterContract` suites both pass against the SQLite impls, `FactStore.search()` has a locked interface and a SQLite implementation that serves `recall()`, and Eureka has a migrations module modelled on Cairn's `applyMigrations` pattern. All 69 existing tests remain green; M8 adds ≥ 15 net new contract tests.

---

### 2. Scope Slices

#### Slice A — SQLite `FactReader` (one PR, regression-locked)

**Deliverable:** `SqliteFactReader` in `packages/eureka/src/storage/fact-reader-sqlite.ts` implementing the existing `FactReader` interface.  Wire it into `runFactReaderContract('SqliteFactReader', ...)` — 5 new contract tests, zero production code changes beyond the new class.  Introduce the Eureka migrations module (`packages/eureka/src/db/`) with migration `001` (schema below).  

**Contract tests added:** CL-1..CL-5 via `runFactReaderContract` (+5).  
**Risk:** Low. Existing contract suite is the full regression lock.  CL-4 (NaN passthrough) is the subtlest — SQLite stores `NULL` for `NaN` unless handled explicitly; `CAST` or JS-side guard needed.

---

#### Slice B — SQLite `TrustUpdater` (atomic mutate)

**Deliverable:** `SqliteTrustUpdater` implementing `TrustUpdater.mutate` atomically via a SQLite transaction (BEGIN IMMEDIATE). Wire into `runTrustUpdaterContract('SqliteTrustUpdater', ...)`.  

**Contract tests added:** C-1..C-7 via `runTrustUpdaterContract` (+7).  
**Risk:** Medium. The `fn` callback executes inside a `better-sqlite3` transaction; if `fn` throws the transaction rolls back correctly. Must verify that `InvalidTrustValueError(source:'storage')` propagates out of the transaction wrapper. Concurrency in SQLite WAL mode is single-writer anyway — mutual exclusion is database-level, not JS-level.

---

#### Slice C — `FactStore.search()` SQLite implementation

**Deliverable:** `SqliteFactStore` implementing the locked `FactStore` interface (see §4). BM25 full-text search via FTS5 virtual table on `fact_content`. Returns `RecallResult[]` in composite-rank order per §30 §1.2.  

**Contract tests added:** New `runFactStoreContract` helper (minimum 4 invariants: happy-path, empty-result, minTrust filter, ordering by relevance) — +4 per wiring.  
**Risk:** High. FTS5 `bm25()` score sign convention (negative = better) is a footgun; wrap in `-bm25(...)` for normalized ascending relevance. Ordering tests are the critical regression lock.

---

#### Slice D — Wire SQLite impls as default in production entry point

**Deliverable:** Update `packages/eureka/src/index.ts` (and wiring module) to export SQLite-backed instances as default deps. `InMemoryFactReader` remains importable for test harnesses.  

**Contract tests added:** Integration smoke test — recall() end-to-end with SqliteFactStore (+1 or 2).  
**Risk:** Low if Slices A–C are green. The seam injection already enforces separation (§55 §2.1 London form).

---

### 3. Schema Sketch

#### Tables

```sql
-- Eureka migration 001: core fact storage
CREATE TABLE facts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_id     TEXT    NOT NULL,
  session_id  TEXT    NOT NULL,
  content     TEXT    NOT NULL DEFAULT '',
  trust       REAL    NOT NULL DEFAULT 0.5,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (fact_id, session_id)
);

-- FTS5 virtual table for FactStore.search() — content-table form
CREATE VIRTUAL TABLE facts_fts USING fts5(
  content,
  content='facts',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER facts_au AFTER UPDATE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER facts_ad AFTER DELETE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

-- Trust history (append-only audit log — Slice B+)
CREATE TABLE trust_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_id      TEXT    NOT NULL,
  session_id   TEXT    NOT NULL,
  trust_before REAL,
  trust_after  REAL    NOT NULL,
  event        TEXT    NOT NULL,
  applied_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

**NaN handling:** SQLite has no NaN literal. M8 stores `NULL` for NaN and re-hydrates as `NaN` on read (JS-side: `row.trust === null ? NaN : row.trust`). CL-4 explicitly tests this round-trip.

#### Migration versioning approach

Eureka has **no migration idiom yet**. Adopt Cairn's pattern verbatim:

1. `packages/eureka/src/db/schema.ts` — `applyMigrations(db: Database)` using `schema_version` table (CREATE IF NOT EXISTS + SELECT MAX(version)).
2. `packages/eureka/src/db/migrations/001-facts.ts` — exports `migration001: Migration`.
3. Each migration is a plain `{ version, description, up(db) }` object; `applyMigrations` runs them in order inside `db.transaction(...)`.

**Trade-off:** This is synchronous DDL at open-time (same as Cairn). Fine for CLI workloads. If Eureka is ever used in a server with multiple concurrent openers, switch to WAL + deferred migration. That's an M9+ concern.

---

### 4. FactStore.search() Schema Lock

This is the M5 blocker. Proposed locked surface:

```typescript
export interface FactStore {
  search(args: {
    query: string;
    sessionId: SessionId;
    limit: number;
    /** Trust floor — store filters WHERE trust >= minTrust. Default: 0.15. */
    minTrust?: number;
    /**
     * Pagination cursor — opaque string returned by a prior search call.
     * Absent on first page. Implementation may use rowid-based or offset cursors.
     */
    cursor?: string;
  }): Promise<{
    results: RecallResult[];
    /**
     * Opaque cursor for the next page. Absent when no further results exist.
     * Consumers MUST NOT parse cursor internals.
     */
    nextCursor?: string;
  }>;
}
```

**Notes:**
- `RecallResult` shape is already defined in `recall.ts` (content, trust, attentionTier, relevance?, importance?, lastAccessed?). No change to the result row shape.
- **Ordering:** results are returned by descending composite score: `-bm25(facts_fts) * trust`. Callers (the `recall` activity) apply the FR-2 ranker on top. The storage layer does NOT apply the full FR-2 formula — that is activity-layer responsibility.
- **Pagination:** cursor is optional for v1. `SqliteFactStore` may implement as rowid-keyset cursor. The `recall` activity today calls with a single page (`limit = k`); cursor is there to avoid a breaking change when cross-session queries arrive in a later milestone.
- **Breaking change risk:** Adding `cursor` now (optional, not required) is backward-compatible. Adding it later would be a breaking change to a locked interface.

**Trade-off noted:** Wrapping the return in `{ results, nextCursor }` vs. returning a plain array. Plain array is simpler today; `nextCursor` requires callers to change if/when pagination arrives. Recommend the wrapped form now.

---

### 5. Aaron's Decisions (Approved Q1–Q3 Answers)

**Q1 — trust_history table scope for M8?**  
**Aaron's call:** Q1=scaffold-A-write-B. `trust_history` defined in schema but NOT written in M8. Deferred to a later milestone. Slices A–D proceed without audit-log writes.

**Q2 — `FactStore.search()` pagination: locked now or deferred?**  
**Aaron's call:** Q2=lock cursor now. The wrapped `{ results, nextCursor }` form ships in M8 even though `cursor` logic is minimal v1 (single page). Prevents breaking change at cross-session time.

**Q3 — DB file location / Eureka database lifecycle ownership?**  
**Aaron's call:** Q3=own DB file. Eureka owns its own DB file (e.g., `~/.eureka/eureka.db`). Not shared with Cairn; caller-configurable at initialization.

---

### 6. Out of Scope (M8 Deliberately Does NOT)

- **Cross-session aggregation** — `FactStore.search()` is session-scoped in M8. Querying across sessions is a later milestone.
- **Embeddings / semantic search** — BM25 via FTS5 only. Vector similarity is out of scope.
- **Durable trust feedback audit log as a first-class feature** — `trust_history` table is scaffolded but not exposed via public API in M8.
- **`FactStore.search()` multi-field filtering** — only `minTrust` and `query` in M8. Additional predicates (attentionTier filter, date range) deferred.
- **Migration rollback (`down`)** — Cairn omits `down`; M8 follows the same policy. Forward-only.
- **Performance optimization** — indexes beyond the FTS5 table and `UNIQUE (fact_id, session_id)` are deferred to when query plans show a need.
- **Eureka DB sharing with Cairn** — separate DB files per Aaron Q3.

---

### 7. Dependencies

| Dependency | Direction | Notes |
|---|---|---|
| PR #41 (`eureka/m7-c-atomicity`) | M8 depends on | `TrustUpdater.mutate` interface must be merged before `SqliteTrustUpdater` is implemented. |
| PR #40 (M1-hint-MCP follow-ups) | M8 does NOT block | Hint MCP work is Cairn-side; Eureka storage is a parallel track. |
| Phase 5 Cloud PGO | M8 unblocks | Cloud PGO needs durable Eureka facts (trust history, recalled fact IDs) to feed the optimization signal. M8 SQLite persistence is the prerequisite. DB lifecycle decision (Q3) affects integration surface. |
| `FactStore.search()` interface lock | M8 self-blocks | Slice C cannot begin until Q2 is answered. Slices A and B are independent. |

---

*Scope doc — implementation design begins after Aaron approves the slice plan.*
