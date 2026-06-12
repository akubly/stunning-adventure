# SUMMARY (as of 2026-06-06)

File size: 34712 bytes. See history-archive.md for earlier entries.

---

# Graham — History

📌 **Role:** Lead / Architect (Overall vision, cross-system integration, tiebreak arbitration)  
📌 **Last update:** 2026-06-06

## Learnings

### 2026-06-08: Pre-Merge Review Gate — Test-Data Defects Can Smuggle Production Semantic Changes

**Finding:** Roger's GREEN changed FTS5 from implicit AND to explicit OR to make FS-SE-15 pass. The test's seed data only contained 4/8 query tokens — under AND, FTS5 correctly returned 0 rows. Roger's fix made the test green by widening production recall semantics system-wide. The correct fix was always "fix the test seed to contain the query tokens" — a 1-line data fix, not a production semantics change.

**Pattern:** When a NEW test fails and the fix involves changing production behavior OUTSIDE the slice's scope, the first hypothesis must always be "the test data is wrong." Anti-anchoring: enumerate (A) test defect vs (B) production defect, then check which evidence supports. Key signal: if the test's PURPOSE doesn't require the semantic change (FS-SE-15 tests cursor byte-length, not FTS5 recall mode), the production change is unjustified regardless of whether it makes the test green.

**Gate rule applied:** Reject with fix assigned to test author (Laura), not original GREEN implementer (Roger). Reviewer Rejection Protocol: the production revert goes to whoever introduced the root-cause defect (mismatched test data), not whoever worked around it.

### 2026-06-08: Slice D+ Cursor Versioning Design — Smallest Correct Increment Principle

**Finding:** When hardening an existing mechanism (offset cursor), the temptation is to also fix the adjacent concern (keyset pagination for concurrent-write stability). Resist. The `v` field in the cursor format ENABLES future keyset (v:2) without coupling it to the scope-fingerprint work. Separating versioning+fingerprint from keyset means: (1) smaller blast radius per PR, (2) independent test surfaces, (3) keyset can be evaluated on its own merits (BM25 floating-point stability across writes is a real constraint). The version envelope is the architectural primitive that makes future migration cheap — ship the envelope first.

**Pattern:** When two safety improvements share a data structure (cursor), version the structure first, then layer features into separate version bumps. Each version is a separately testable, separately shippable unit.

### 2026-06-06: M8 Slice D Review — Spec/Implementation Tension Resolution

**Finding:** When a spec written early ("update index.ts to export SQLite-backed instances as default deps") conflicts with a later-established constraint (Slice A's native-dep isolation boundary), the constraint wins. Roger's factory-on-subpath approach correctly interprets "default" as "batteries-included on the production path" rather than "exported from the root entry point." The two-line composition root (`openDatabase` + `createSqliteRecallDeps(db)`) is explicit, discoverable, and preserves the isolation invariant. Updated decisions ledger recommended to capture the as-built shape.

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
5. **Worktree fallback warning convention (issue #31):** The coordinator's Pre-Spawn: Worktree Setup has two fallback paths that must BOTH log AND emit a user-visible warning:
   - **Step 2(c) — worktree add failure** (lock/permissions/any error): log to `.squad/orchestration-log/{timestamp}-worktree-failed.md` AND emit `⚠️  Worktree creation failed — falling back to main checkout. Isolation disabled for this spawn.`
   - **Step 2(d) — junction/symlink link failure**: log to `.squad/orchestration-log/{timestamp}-worktree-fallback.md` AND emit `⚠️  Worktree dependency linking failed — fell back to npm install. Dependency isolation is degraded for this spawn.`
   - Convention: silent fallbacks are never acceptable when they degrade isolation guarantees the user opted into.

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

**Scribe note (2026-06-06T07:00:21Z):** M8 Slice C COMPLETE — Roger (SqliteFactStore + FTS5 BM25 search, PR #48) + Laura (contract/edge audit, 12 tests). FactStore.search() shipped as wrapped `{ results, nextCursor? }` with BM25 ranking, per-page normalization, offset cursor. FSE-1 (parse errors) fixed; FSE-4 (caveat docs) done. Laura's audit: 109→121 tests, all edge cases verified (ordering, round-trip, boundary, isolation, NULL-trust, syntax). Verdict: ✅ ACCEPT-WITH-FOLLOWUPS. Slice D next. Aaron's M8 scope locked: Q1=scaffold-A, Q2=cursor (shipped), Q3=own eureka.db. Ready for follow-up slices.

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

📌 **Crucible Sprint 0 — Walkthrough A REFACTOR CYCLE COMPLETE** (2026-06-02T06:43:01Z): Laura (RED) authored 4 unit tests with mocked DB collaborator; Roger (REFACTOR) extracted ForkLineage value object, introduced SessionManager service + DB interface, wired in-memory adapter. All tests GREEN (0 regression on acceptance layer). Monorepo builds clean. DB collaborator seam established, ready for L1-substrate swap when OQ-2 lands pre-sprint-2. Deferred: Refactor 3 (SQLite integration stub), Mock Drift Defense (shared fixture builder). Next candidates: (a) Refactor 3 integration test, (b) Walkthrough B (§4.2 Pre-Commit Hook Veto). — Scribe

- 2026-06-05 ✅ persona-review-cycle 2 complete: Crucible Sprint 0 Walkthrough A ready to ship (Cycle 1: 11 findings, 10 fixed; Cycle 2: 3 advisory, 2 fixed, 1 deferred)

### 2026-06-05: SKILL doc-drift fixes (PR #45 Copilot review)

**SKILL code examples must be kept in sync with the referenced implementation.** When a PR review cycle changes source code (e.g. removes a factory method, tightens a bounds-check), any SKILL doc whose examples illustrate that code becomes stale and will mislead future refactors. Fix strategy: read the actual shipped source, then update the snippet to match — not the other way around. Both corrections here were grounded in `fork-lineage.ts` and `session-manager.ts` as actually merged.

## Learnings

### 2026-06-05: Transitive-fork scope decision (Copilot review cycle 2)

**Decision:** Option A — document + defer. Copilot correctly flagged that child query() prefix delegation via db.getOwnEvents(parentSessionId) breaks for transitive forks (forking a fork), because the grandparent's events aren't in the parent's ownEvents. However, transitive fork lineage is explicitly out of Sprint 0 Walkthrough A scope (A1 only forks once from a root session with 47 primitives), and the TDD strategy already identifies "Fork Lineage Transitivity" as a future REFACTOR-phase test.

**Rationale:** Under London-school TDD discipline, adding recursive parent delegation NOW would be untested speculative code — no failing RED test drives it. Instead, added a 7-line comment block at the delegation site in session.ts making the limitation explicit. This addresses the reviewer's underlying concern (hidden trap → documented limitation) without expanding Sprint 0 scope or violating TDD discipline. The follow-up is a dedicated "Fork Lineage Transitivity" RED test in a future cycle.

**Principle:** Surface limitations explicitly rather than building untested speculative code. A well-documented constraint is better than a silently incomplete fix.
**For detailed history, see history-archive.md**


---

## Archive Summary

Earlier entries (209 lines) archived to history-archive.md on 2026-06-05.

---

## Learnings — 2026-06-05: Forge M3 Panel Review Hardening

### Finding Triage

| Finding | Disposition | Rationale |
|---------|-------------|-----------|
| A — `DispositionSummary.category: string` | **ACCEPT** | Trivial type upgrade to `OptimizationCategory`; cast at .map() in provider. Remote providers returning invalid categories now fail the type system rather than silently no-opping. |
| B — Missing `idx_event_log_type` | **ACCEPT** | Real O(n) scan on every prescriber run. Migration 018 added with table-existence guard mirroring migration017's pattern for partial-schema test DBs. |
| C — Vocabulary duplication between emitter and consumer SQL | **ACCEPT** | Created `hintStateTransitionConstants.ts` with event type, source value, and payload key names. Both `emitHintTransitionEvent` and the SQL template in `SqliteHintDispositionProvider` now reference the same constants — a key rename causes a compile error in both places simultaneously. Added a round-trip contract test. |
| D — `applyDispositions` keys Map by `category` alone | **ACCEPT** | Keyed by `${skillId}:${category}`. Cheap robustness fix; prevents cross-skill suppression from a buggy future provider. |
| E — INNER JOIN drops dismissal after `deleteOptimizationHint` | **REJECT (documented)** | `deleteOptimizationHint` is a low-level CRUD function not exposed in the MCP resolve path — real resolutions go to status=rejected (row kept). Carrying category in the payload (option A) would require backward migration of existing events. Added a clear comment in the provider. This is the accepted trade-off: correctness for the real path over theoretical correctness for an unused path. |
| F — `RESOLVED_CONFIDENCE_BOOST` in wrong section | **ACCEPT** | Moved to constants section near `DEFAULT_MIN_SESSIONS`. |
| G — Redundant empty-dispositions guard in orchestrator | **ACCEPT** | Collapsed to `return applyDispositions(allHints, dispositions ?? [])`. The inner guard in `applyDispositions` is sufficient. |
| H — Integration test hand-rolls logEvent instead of using real resolve | **ACCEPT** | Switched to `cairn.resolveOptimizationHint`. Required adding `resolveOptimizationHint`, `HintResolution`, and `ResolveHintResult` to cairn's public exports. Tests now exercise the full MCP→event-format contract end-to-end. |

### Coupling-Reduction Decisions

**C + H reinforce each other.** Using `resolveOptimizationHint` in the integration test (H) naturally exercises the constants-based event format (C). The contract test added to `sqliteHintDispositionProvider.test.ts` explicitly verifies the round-trip: producer payload keys match the consumer's json_extract() paths, which are now both derived from `HINT_TRANSITION_PAYLOAD_KEYS`.

**E rejected in favor of documentation over complexity.** Option (a) — carrying category in the event payload — would remove the JOIN dependency and be cleaner long-term, but requires backward migration of event data already in production DBs. Since delete-of-dismissed-hint isn't a real path today, the documentation trade-off is correct.

**Version assertion discipline.** Migration tests in cairn hardcode the latest schema version number. Every new migration requires updating those tests. Pattern is: grep for `toBe(17)` (prev version), replace with new version.

---

## Learnings — 2026-06-05: Forge M3 Cycle-2 Hardening

### Finding Dispositions

| Finding | Disposition | Rationale |
|---------|-------------|-----------|
| C (complete) — Resolution-value vocabulary still duplicated | **ACCEPT** | Added `HINT_RESOLUTION_RESOLVED` and `HINT_RESOLUTION_DISMISSED` to `hintStateTransitionConstants.ts`. `optimizationHints.ts` now derives `HintResolution` type and `HINT_RESOLUTIONS` from these constants (no circular dep — constants file has no upstream imports). `sqliteHintDispositionProvider.ts` SQL CASE/WHEN references the same constants via template literals. Adding a new resolution requires touching all three files; any single omission is a compile error. |
| 2 (migration 018 skip-path) | **COMMENT ONLY** | The early-return path is correct: `event_log` is created in migration 001, so the skip only fires in partial-schema test DBs. Expanded the guard comment to document this contract explicitly. Tightened the warning message to say "must never occur on a real DB (event_log is guaranteed present from migration 001)." A startup assertion was evaluated but deemed unnecessary: the existing stderr warning is sufficient observable signal, and the skip is structurally unreachable on a real DB. |
| 3 (public exports) | **KEEP AS PUBLIC API** | `resolveOptimizationHint` is the primary user-driven closure operation; `HintResolution`, `HINT_RESOLUTIONS`, and `ResolveHintResult` are its input/output contract. Consumers (MCP handler, integration tests) correctly import from the public root. Added a one-line justification comment in `cairn/src/index.ts`. Integration tests stay on the public import path — no internal path workaround needed. |

### Constants Coupling Decision

Resolution values are now owned by `hintStateTransitionConstants.ts` (the event format spec file). `optimizationHints.ts` derives its exported surface from those constants. This forms a compile-enforced triangle: constants → types → SQL. Future additions must update all three vertices, which TypeScript will enforce at build time.

---

## Learnings — 2026-06-06: Forge M3 Copilot Review Address (PR #49)

### Thread 1 — Prepared statement caching in `SqliteHintDispositionProvider`

The comment said the prepared statement was re-used, but `this.db.prepare(...).all(...)` was called inline on every `getDispositions` invocation — creating a new statement object each time. Fixed by adding a `private dispositionStmt` field and using `??=` to lazily prepare once on the instance, then reuse. Comment updated to be accurate: "SQL is built at module load time so the constants are inlined once. The prepared statement is cached on the instance and re-used on every call."

The `SqliteChangeVectorProvider` doesn't offer a caching precedent (it delegates to free functions), so the pattern was derived from the standard better-sqlite3 idiom. `Database.Statement<Params, Row>` is the correct field type — no extra imports needed since `Database` was already imported as a type.

**Pattern to apply to future SQLite providers:** cache `db.prepare(SQL)` in a nullable instance field, initialize with `??=` on first call. Never `prepare()` inside a hot call path.

### Thread 2 — SKILL.md pitfall #5: `resolveOptimizationHint` export status

Pitfall #5 incorrectly stated that `resolveOptimizationHint` was not exported from `@akubly/cairn`. It was added to `cairn/src/index.ts` as part of the Cycle-1 panel review hardening (Finding H). Updated pitfall #5 to call it the **recommended path** (single call handles lookup + transition + event), with `insertHintIfNew` + `logEvent` reserved for adversarial tests needing fine-grained source/payload control.

**Documentation debt pattern:** when a public API export is added as a review fix, also update any SKILL.md pitfalls that reference the non-exported version. Export additions don't automatically propagate to narrative documentation.


---

## 2026-06-08: WAL Substrate 2-Cycle Review COMPLETE — Seam Contract Validated

**Scribe note:** Crucible WAL substrate + Walkthrough B 2-cycle persona review COMPLETE. Graham's locked Ledger seam contract (VETO Option A) passed contract hardening in cycle 2:
- hookVerdict bytes (0x00/0x01/0x02) persisted and validated across close+reopen for both WalBackend impls
- Seam lock interface NOT reshaped; contract remains (Exclude<HookVerdict, 'VETO'>) for all WAL-layer verdicts
- Result: 75/75 tests green

**Branch ready for merge. See decisions.md for cycle dispositions.**

## 2026-06-07 — M8 Slice D Complete

**Slice:** M8 Slice D — SQLite Production Deps Factory (Roger, Laura, Graham)  
**Status:** ✅ COMPLETE (147/147 tests, factory-on-subpath, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied)

**Summary:** Roger shipped factory functions (createSqliteRecallDeps, createSqliteFeedbackDeps) on @akubly/eureka/sqlite, preserving Slice A isolation. Laura added +2 smoke tests (SD-1, SD-2). Graham's architectural review: boundary integrity verified, composition root clean, spec tension resolved correctly. Scribe merged decisions inbox + applied SD-F1 ledger amendment.

**Key artifacts:**
- packages/eureka/src/sqlite/deps.ts — factory implementations
- packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts — SD-1, SD-2 smoke tests
- .squad/decisions.md — M8 Slice D as-built section (Graham SD-F1)

📌 **Slice D review-cycle complete + PR #54 opened** (2026-06-07T06:03Z): 5-persona Code Panel review → 0 blocking, 2 important + 3 minor fixed, 2 sound rejects + 1 false-positive cleared; 148/148 tests passing; Copilot review requested. — Scribe

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.
## Learnings — 2026-06-06: PR #53 Persona-Review Fixes (worktree fallback warnings)

### Isolation vs. consistency: the npm-install fallback is MORE isolated, not less

When the junction-link fails and we fall back to `npm install` in the worktree, the worktree gets its **own** `node_modules`. That is MORE isolated than a junction (no shared state at all). What degrades is **consistency** (versions may diverge from the main checkout) and **efficiency** (slower, more disk). The original warning said "Dependency isolation is degraded" — that was backwards. Corrected to: *"Dependencies may differ from the main checkout (slower, not shared)."*

**Rule:** isolation ≠ consistency. When writing warnings about fallback dependency strategies, distinguish the two: isolation is about whether the worktree shares state; consistency is about whether versions match.

### Dual-description completeness gap

The squad.agent.md had two descriptions of the same junction-link fallback: once in the "Worktree Lifecycle Management → Dependency management" reference section (line 676 region) and once in the Pre-Spawn step 2d error-handling block. The Pre-Spawn block had the user-visible warning; the reference section did not. An agent following only the reference section would degrade silently.

**Rule:** whenever an instruction appears in both a reference/overview section and a procedural step, both must include all safety-critical outputs (warnings, logs). Review cross-references before shipping.



## Learnings — 2026-06-06: Doc Hygiene Re-scope (PR #52, issue #46)

### Pointer vs. Policy vs. Writer-Target distinction

Five categories of `.squad/decisions/inbox/` references require different treatment in committed prose:

1. **Broken followable POINTER** (FIX): Prose that cites a specific `inbox/{slug}.md` filename as a stable reference — e.g., `**Artifact:** Merged from .squad/decisions/inbox/graham-ctd-phase4-synthesis.md`, `**Deliverable:** .squad/decisions/inbox/crispin-20-seam-audit-vs-55.md`, `From .squad/decisions/inbox/X.md`, file-inventory bullets, R8 verdict file lists. Replace with slug-preserving plain text (e.g., "decision drop: graham-ctd-phase4-synthesis (local-only)") to retain searchability. Fix any resulting malformed prose (dangling "— this file" → "— this decision entry").
2. **Gitignore-policy documentation** (KEEP): Bulleted "Explicitly prohibited (gitignored runtime state)" lists, rationale sentences ("`.squad/decisions/inbox/` is gitignored"), and policy-description lines ("Cited gitignored `.squad/decisions/inbox/` paths"). These document the policy, not broken pointers.
3. **Generic directory narration** (KEEP): Location descriptions like "directive files in `.squad/decisions/inbox/`" — accurate operational narration, not a broken pointer.
4. **Inside Before:/After: code blocks** (KEEP): Examples documenting historical changes are not live pointers.
5. **Forward writer-target paths** (NEVER TOUCH): Charters, templates, skills.

### Append-only history files are immutable

Agent history.md and history-archive.md are append-only. No hygiene sweep — not even doc cleanup — may retroactively edit committed history entries. This mirrors the over-reach that caused PR #44 to be reverted.

### "Zero hits" acceptance criteria can be relaxed

Issue #46 originally required zero `decisions/inbox/` hits. Aaron approved relaxing this: the criterion is "zero broken followable file-path pointers," not literally zero string occurrences. Policy-list bullets legitimately retain the bare directory path.

### Merge decisions-archive.md from a current main base

When a branch is behind main and decisions-archive.md diverged significantly, reset to `origin/main` before applying pointer fixes — do not rely on auto-merge, which can produce duplicated sections.

---

## 2026-06-11: Crucible S1 WAL Correctness — S2 Impact (cross-agent note)

Impact for S2: Roger's S1 fixes (#57 verdict encoding, #60 canonical CBOR hashing, #68 CAS atomic write) harden the WAL substrate. Phase 0.5 walking skeleton can now proceed with confidence in blob atomicity and CBOR determinism.
