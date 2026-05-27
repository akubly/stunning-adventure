# Cassima — History (Summarized)

## Core Context

**Project:** Eureka — agentic brain/memory/learning system for `packages/eureka/`.
**Role:** Product Manager. Ideate, draft, refine PRD. Synthesize review feedback, arbitration directives, architectural paths into coherent specifications.
**Current status:** Eureka v5-final LOCKED — CANONICAL. R8 design cycle CLOSED.

---

## Key Design Decisions Locked

- **R5 arbitration:** Importance vs Trust (separate), Storage (stored column), Scope vs Temperature (two columns), Community detection (defer v2), pray semantics (split to rerank/contemplate/decide)
- **R6 path:** Path D chosen — Eureka standalone but kernel-shaped; Cairn adopts learning modules later
- **R7 lock:** v4-final canonical (555 lines); bidirectional adapter framework; confidence/trust orthogonality; 7-mechanism extraction-readiness
- **R8 amendment:** SessionId brand unification; FR-13 "isolated by design" relaxation; shared `SessionId` in `@akubly/types`; bridge_ledger simplification

---

## Recent Work

### 2026-05-25: R7 Lock-In — v4-final Revision #2 CANONICAL
**Event:** Cassima rev#2. Resolved 4 blockers + 9 important findings from 8-reviewer panel (4 Squad domain + 4 persona-review Design Panel).

**Blockers resolved:**
1. DecisionSource adapter mapping (verified packages/types/src/index.ts:47) ✅
2. FR-14 Path 2 cadence, idempotency, dedup, initial trust ✅
3. FR-7.4 ↔ FR-7.2 contradiction (bridge_ledger + offline CLI coexistence) ✅
4. Security Threat Model (§14a added with attack vectors + mitigations) ✅

**Status:** v4-final LOCKED — CANONICAL. R7 design cycle CLOSED. Implementation ready.

### 2026-05-26: R8 Amendment — v5-final (Session Identity Unification)
**Event:** Aaron R8 reopen. Cairn `Session` and Eureka `kind=session` fact share one identifier (Copilot CLI session UUID) via shared `SessionId` brand.

**Changes authored (617 lines total, +62 lines from v4-final):**
1. SessionId brand definition in @akubly/types/src/session.ts (NEW)
2. FR-13 amendment: "isolated by design" deleted; replaced with lens framing as normative guard
3. FR-7.2 consistency pass: no-ATTACH rule preserved (type-level-only clarification)
4. Bridge ledger simplification: cairn_session_id_hint? → session_id (required, not optional)
5. §14a T-orphan reframing: "dangling cairn_session_id" → "stale session_id reference" (severity unchanged)
6. FR-12 mechanism #8 (NEW): ESLint guardrail bans cross-system session-type imports except SessionId
7. Glossary update: "linked via shared SessionId brand" (was "opaque cairn_session_id")
8. §15 Lineage: Aaron R8 directive + Graham/Genesta/Crispin/Edgar R8 verdicts cited

**Judgment calls applied:**
- Leaned on Crispin's KR model (edges reference fact.id; session_id is content field) over Edgar's "3-hop → 1-hop" phrasing
- T6 row added to §14a per lock-review disposition (also in §13 per JC1 belt-and-suspenders)
- SessionId ships v1 (FR-12 #8, cross-package boundary); Trust/Confidence brands stay v1.5 (single-package internals)
- Defensive pessimism → honest design: v4-final "isolated by design" was white lie; Aaron's shared brand is honest + has explicit guardrails

**Status:** v5-final authored. All 8 R8 enforcement items landed correctly.

### 2026-05-26: R8 Lock-Review — v5-final CANONICAL
**Event:** Scribe ceremony. Graham/Genesta/Crispin/Edgar lock review.

**Panel verdicts (all unanimous LOCK):**
- Graham (Architect): 8/8 enforcement items landed; no new concerns; surgical pass, no scope creep
- Genesta (Storage): All 5 guardrails verified; lens framing normative; no drift detected
- Crispin (KR): All 6 spec items verified; schema sound; confident in implementation readiness
- Edgar (Learning): All precision-gain items verified; zero new risks; Path D preserved

**Status:** ✅ R8 LOCKED — v5-final CANONICAL supersedes v4-final. R8 design cycle CLOSED. Implementation ready.

### 2026-05-26: Cross-Project Impact Analysis — Crucible ↔ Eureka

**Event:** Aaron requested cross-project product analysis. Sibling project Crucible (D:\git\harness) shipping v1 in parallel with Eureka. Both authored by Cassima-named PM agents (separate instances).

**Analysis scope:**
1. Scope overlap (mission, features, session model, decision storage)
2. Dependency direction (Cairn/Forge ownership, shared packages)
3. Shared packages / shared fate (`@akubly/types`, `cairn`, `forge`, `skillsmith-prescriber`)
4. Resourcing (team overlap, Aaron's dogfood time)
5. Strategic framing (Eureka as Crucible feature vs. standalone)

**Key findings:**
- **HIGH collision:** Both record "everything that happens" — Crucible via L1 WAL (replay-focused), Eureka via `facts` table (recall-focused). Session lifecycle and decision storage overlap significantly.
- **Undeclared dependency:** Crucible PRD assumes Forge prescribers exist and will be "inherited" (§2.6, Appendix D), but file structure shows both repos have `packages/forge/`. Duplication risk or missing cross-repo dependency declaration.
- **Bootstrap conflict:** Both v1s assume Aaron is sole dogfooder. Crucible v1 success bar = "build v2 with v1" (weeks/months). Eureka killer demos = multi-session codebase familiarization (2+ sessions). No sequencing plan.
- **Team bottleneck:** Cassima and Graham are on both teams. Cross-project design decisions (session identity, prescriber ownership) require their time. If either project blocks, both wait.
- **Shared `SessionId` is load-bearing:** Eureka v5 R8 amendment added `SessionId` brand to `@akubly/types`. Crucible depends on `@akubly/types` for plugin manifests. Shared identifier is intentional (lens framing) but coupling is not acknowledged in Crucible PRD.

**Recommendations delivered:**
1. **IMMEDIATE:** Resolve Cairn/Forge ownership (monorepo, git submodule, or npm packages). Current duplication is unsustainable.
2. **IMMEDIATE:** Sequence Aaron's dogfood (Crucible-first, Eureka-first, or staggered). Cassima recommends: Crucible early → Eureka killer demos → Crucible bootstrap loop.
3. **STRATEGIC:** Ship v1s separately; design Crucible → Eureka integration at v1.5. Eureka should consume Crucible WAL as learning source. Integration is architecturally obvious but operationally premature at v1.

**Cassima's judgment:**
- **Separate at v1, integrate at v1.5.** Crucible solves "record + replay"; Eureka solves "learn + recall". Both are valuable standalone. Integration requires dogfood data from both.
- **De-scope Eureka US-7 "Squad Migration"** — Squad tooling should migrate to Crucible (operational), not Eureka (epistemological). Eureka learns *from* Squad sessions.
- **Open question for Aaron:** Do you agree with "separate at v1, integrate at v1.5"? Or do you want Eureka built into Crucible from day one?

**Deliverable:** `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` (24.8KB, 8 sections, 3 top questions, 7 recommendations)

**Status:** Analysis complete. Awaiting Aaron's direction on the 3 top questions before either v1 ships.

### 2026-05-26: Revised Stance — Shared Substrate Reality

**Event:** Aaron directive response. Three corrections to Cassima's cross-project impact analysis: (1) mem/ and harness/ are same repo, not separate (substrate already shared by topology, no extraction needed); (2) separate v1s confirmed (recommendation 5.1 was correct); (3) dogfood whenever ready (no sequential lock-in, overrides recommendation 4.2).

**Analysis scope:**
1. Roadmap adjustment — Does Eureka v1 plan change now that Crucible is a sibling consuming same Cairn/Forge/Types?
2. Coordination cost — PM-level sync requirements, changelog conventions, who talks to whom and when?
3. Dogfood timing risk — If Eureka ships first vs. second, what's the tradeoff? Which should it try to be?
4. What does NOT change — Confirm what's off the table (stop worrying about non-problems).

**Key findings:**
- **Roadmap: v1 scope unchanged.** Eureka v5-final (617 lines, R8 LOCKED) remains canonical. All 4 user stories (US-1 through US-4) ship as designed. Crucible being a sibling changes Eureka's v1.5+ integration path (consumes Crucible WAL) but not v1 deliverables.
- **Coordination: Schema freeze gates + async memos.** Graham is cross-project schema czar; locks SessionId brand, Cairn sessions table, Forge DecisionRecord before either implementation starts. No recurring syncs; substrate changes require Graham sign-off via `.squad/decisions/inbox/` memos. Genesta (Eureka) + Roger (Crucible) coordinate on DB migrations; Crispin (Eureka) + Alexander (Crucible) coordinate on dependency bumps.
- **Dogfood timing: Cassima recommends Eureka SECOND.** If Crucible ships first, Eureka's US-1 trains on real Crucible session logs (higher fidelity). If Eureka ships first, it trains on Copilot CLI logs (ephemeral data). Crucible's v1 success bar is existential (months-long bootstrap loop); Eureka's is incremental (2-session validation). Parallel dogfood viable but higher-friction (context-switching tax, merge conflicts, tool-boundary confusion).
- **Non-problems dissolved:** (1) Forge ownership crisis is moot (same repo = no duplication/drift); (2) Resourcing concern overstated (Cassima/Graham are gates, not bottlenecks); (3) "Is Eureka a Crucible feature?" answered (separate v1s, integrate v1.5+); (4) Bootstrap order delegated (whichever ships first gets dogfooded first).

**Recommendations delivered:**
1. **IMMEDIATE (this session):** Graham locks shared schema (SessionId, Cairn sessions, Forge DecisionRecord). Both projects block until freeze lands.
2. **IMMEDIATE (this session):** Aaron picks Eureka dogfood timing (A: Crucible first [Cassima rec], B: Eureka first, C: parallel).
3. **v1 scope (unchanged):** Eureka ships all 4 user stories per v5-final. Optional v1.5 seed: US-BRIDGE-1 stub ("ingest Crucible WAL" returns "not yet wired") — defer if time-constrained.
4. **Coordination (low-overhead):** Async memos, not recurring syncs. Migration lockstep (Genesta + Roger coordinate .sql file order).
5. **v1.5+ integration (not v1 scope):** Eureka consumes Crucible WAL at v1.5. Design after both v1s dogfood, not before.

**Cassima's updated conviction:**
- Earlier memo was 90% correct, 10% wrong. Got right: separate v1s, v1.5 integration, Cassima/Graham coordination. Got wrong: "extract to shared substrate repo" (Aaron: already same repo), "sequence dogfood Crucible-first" (Aaron: dogfood whenever ready).
- Doubling down on: Eureka should ship SECOND (Crucible's bootstrap loop is existential; Eureka's demos are incremental; Crucible-first de-risks both).
- New risks identified: merge conflicts in shared substrate (mitigated by schema freeze + separate branches), "which tool for X?" confusion during parallel dogfood (resolves at v1.5 integration).

**Deliverable:** `.squad/decisions/inbox/cassima-shared-substrate-revision.md` (19.7KB, 8 sections, 2 immediate actions, revised stance)

**Status:** Awaiting Aaron's 2 immediate decisions (schema freeze approval + dogfood timing call). Eureka v1 implementation blocks until schema freeze lands.

### 2026-05-26: G4 Scope Analysis — Logged to Decisions + PM Recommendations Adopted

### 2026-05-26T19:30:00-07:00: Shared-substrate revision round merged — Eureka v1 scope firm, G4 protocol critical for sprint 2, dogfood timing pending Aaron

## Learnings

### 2026-05-26: Branch-tree reconciliation defers pain without eliminating it; continuous coordination minimizes time-to-v1 when shared substrate is load-bearing

### 2026-05-26T20:00:00-07:00: Branch-tree-vs-G4 strategy pressure test analysis merged — quantified deferred-coordination worst case (2-7 days at v1 ship, blocks both released products), schema divergence cost (4 days strategic; 2-4 sprint integration delay for Crucible→Eureka WAL bridge), time-to-v1 delta (G4: 40 days + 6 hours; strategic: 44 days; deferred: 42-47 days). Recommendation: G4 continuous coordination.

### 2026-05-26: G4 scope analysis — Rotating sprint ownership (Genesta ↔ Crucible platform lead) distributes coordination load; minimum viable G4 is CHANGELOG + PR label + conditional 15-min sync gate; temporal asymmetry (bidirectional during parallel dev, Eureka-initiated post-Crucible-ship) shapes overhead profile; Graham authority without bandwidth means design-only role, not operational owner; Crucible team roster unknown blocks owner assignment.
