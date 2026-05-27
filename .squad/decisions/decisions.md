# Team Decisions — Cairn Plugin Marketplace

## Index

- [G4 Scope & Ownership Recommendation + Directives](#g4-scope--ownership-recommendation--directives)
- [Brain Project Proposal — Name, Roster, Loop-In Model](#brain-project-proposal--name-roster-loop-in-model)
- [Unified Package Scope → @akubly](#unified-package-scope--akubly)
- [Phase 4.5 Brainstorm Round 2 — Aaron's Decisions](#phase-45-brainstorm-round-2--aarons-decisions)

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

**Date:** 2026-05-22  
**Author:** Graham (Lead/Architect)  
**Status:** Open for Aaron approval  
**Log:** [2026-05-22T20-37-39-graham-brain-roster-proposal.md](../orchestration-log/2026-05-22T20-37-39-graham-brain-roster-proposal.md)

### Context

Graham delivered a complete charter proposal for the Brain project (agentic memory infrastructure) consolidating Rounds 1–4 deliberation into actionable form.

### Proposal

**Name candidates (pending Aaron's choice):**
- **Engram** — Neuroscience term for memory trace
- **Nous** — Greek for mind/intellect
- **Anamnesis** — Platonic concept of recollection

**Roster structure (pending Aaron's approval):**
- **5 core roles:** Lead (must hire), Knowledge Rep specialist (must hire), Platform Engineer (borrow Roger), Integration Engineer (borrow Alexander), Learning Systems specialist (must hire)
- **2 advisors:** Valanice (UX, 20%), Laura (test, on-call)

**Cairn loop-in model (pending Aaron's acceptance):**
- Federated decisions: Cross-repo decisions ledger with boundary-affecting changes recorded in both repos
- Shared cross-team channel: brain-cairn.md living doc for integration points, open questions, blockers
- 48hr acknowledgment SLA for boundary-affecting changes
- Time-boxing: Roger and Alexander stay primary Cairn, secondary Brain (scoped 1-week sprints, handoff docs, escalation path)
- Sync ceremonies: Weekly standup, biweekly boundary review, end-of-Phase-1 retrospective

### Waiting For

1. Working name selection (Engram | Nous | Anamnesis)
2. Roster shape validation (hire 3, borrow 2, advise 2)
3. Cairn loop-in model acceptance
4. New repo creation greenlight

---

## Unified Package Scope → @akubly

**Date:** 2026-04-24  
**Author:** Roger (Platform Dev)  
**Status:** Adopted  
**Log:** [2026-04-24T23-18-roger.md](../orchestration-log/2026-04-24T23-18-roger.md)

### Context

The monorepo used a mix of `@cairn/*` and `@akubly/*` scopes:
- `@cairn/types`, `@cairn/forge` — used the `@cairn` scope
- `@akubly/cairn` — already used the `@akubly` scope (published to npm)

This inconsistency would block npm publishing for `types` and `forge` since Aaron owns the `@akubly` scope on npm, not `@cairn`.

### Decision

Rename all packages to the `@akubly` scope:
- `@cairn/types` → `@akubly/types`
- `@cairn/forge` → `@akubly/forge`
- `@akubly/cairn` — unchanged (already correct)

### Consequences

- All three packages share one scope, simplifying npm publishing
- Import paths in source and docs updated to match
- Historical docs (decisions.md, agent histories, spikes) intentionally left unchanged to preserve the context in which they were written

---

## Phase 4.5 Brainstorm Round 2 — Aaron's Decisions

**Date:** 2026-05-01  
**Author:** Aaron (via Copilot)  
**Status:** Adopted  

### Context

Phase 4.5 brainstorm Round 2 follow-up decisions on metrics prioritization, exploration budgets, governance structures, and feature discovery.

### Decisions

1. **Metrics priority: Determinism > Token Cost (always)**
   - Aaron's exact words: "determinism is always > token cost. Our goal is to instill confidence in the tools. That's worth investment."
   - This is a foundational priority order for all optimization scoring: determinism first, quality second, tokens third.

2. **Exploration budget: Generous — diminishing returns are worth it at scale**
   - Aaron's reasoning: "Even diminishing returns are worth a one-time cost when scaled out across the entire future of software engineering."
   - The investment in experimentation pays off because optimized artifacts are portable — they benefit every future user.

3. **Human approval gates → Inception-style recursion: DBOM on prescription decisions**
   - Aaron's insight: "Do we need heuristics and DBOM on prescription *decisions*?"
   - This is a meta-observation: the Prescriber ITSELF makes decisions. Those decisions should be tracked with the same rigor as session decisions — decision records, alternatives considered, provenance. The feedback loop is self-referential: optimize the optimizer.

4. **Multi-artifact optimization → Feature suite discovery**
   - Aaron identifies a suite of features hidden in transfer learning:
     - Support for collections of skills (plugins as bundles)
     - How model selection affects skill pairings
     - Optimize contents of one skill in the presence of other plugins
     - Cross-skill interaction effects (skill A's optimization depends on which other skills are active)

5. **Data retention tradeoffs: Needs exploration (no decision yet)**
   - Aaron wants to explore the tradeoffs before committing to a retention policy.

6. **Round 2 wild cards approved for backlog:**
   - Time-travel debugging via ancestry (Rosella)
   - Predictive cache warming (Rosella)
   - Adaptive instrumentation (Alexander)

### Consequences

- Team has clear prioritization: determinism above cost considerations
- Authorization given for sustained exploration investment across future optimization cycles
- Prescriber governance now includes decision tracking on its own choices (recursive DBOM)
- Three feature areas identified for backlog prioritization and skill pairing research
- Data retention policy deferred for exploratory analysis

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
