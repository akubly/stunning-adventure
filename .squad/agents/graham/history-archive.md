# Agent History Archive — graham

Archived entries (pre-summarization).

---

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

## 2026-06-05: Forge M3 — Disposition Consumer

**What was built:** The feedback half of the dogfood loop. Copilot resolves/dismisses optimization hints via the Cairn MCP tool → `hint_state_transition` events are logged with `resolution_disposition` and `source='mcp'` → the forge prescriber now reads these back via `HintDispositionProvider`.

**Provider decision:** Chose sibling `HintDispositionProvider` over extending `ChangeVectorProvider`. SRP: change vectors = telemetry outcomes; dispositions = user intent. Parallel seam, parallel pattern, parallel fail-open.

**Key design:**
- Interface `DispositionSummary { skillId, category, dismissedCount, resolvedCount }` in `@akubly/types`  
- Concrete `SqliteHintDispositionProvider` in `@akubly/cairn` — queries `event_log JOIN optimization_hints WHERE source='mcp'`  
- `applyDispositions(hints, dispositions)` in forge `utils.ts` — pure filter+map  
- Dismissed → suppress (filter out) all hints for that category  
- Resolved → 1.2× confidence boost for hints in that category  
- Provider throws → fail-open (same pattern as ChangeVectorProvider)  

**Source gating rule:** `source='mcp'` filter is enforced at the provider layer (SQL WHERE clause). Forge's `applyDispositions` never sees non-mcp transitions.

**Key files:**
- `packages/types/src/index.ts` — new `DispositionSummary`, `HintDispositionProvider`
- `packages/cairn/src/db/sqliteHintDispositionProvider.ts` — new concrete provider
- `packages/forge/src/prescribers/utils.ts` — `applyDispositions`, `RESOLVED_CONFIDENCE_BOOST`
- `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts` — `dispositionProvider?` option
- `packages/skillsmith-runtime/src/runtime.ts` — injection wiring

**Test counts after:** cairn 725 (+9), forge 651 (+7). Build clean. No commit — Laura hardens next.

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

📌 **PR #33 Cloud-Review-Cycle Round 5 COMPLETE** (2026-05-31T22:55Z): Graham addressed 3 Copilot findings. (1) Fork resume schema: Added authoritative payload schema for `fork_resume` sub-kind in §6.3, completing registry-level governance alongside `fork_origin` and `fork.collision_choice`. (2) ADR-0019 acceptance signal: Updated concrete examples to use actual `fork.collision_choice` payload shape (chosenOption/existingChildSid/resultingChildSid) instead of generic placeholders. (3) Predicate timing honesty: Reframed v1 Hook Bus predicate timing as cooperative measurement with post-hoc telemetry + retry-budget quarantine, not hard preemption (v1.5+ worker/process isolation). Sub-kind governance completeness + watchdog honesty patterns now captured. Build + tests passing. Decision merged to decisions.md; branch staged for Copilot re-review. — Scribe

📌 **PR #33 Cloud-Review-Cycle Round 2 COMPLETE** (2026-05-31T06:15:00Z): Graham addressed all 11 Copilot review threads on Crucible CTD ADRs. Fixes applied: ADR-0002 summary clarity, ADR-0006 PA-B3 ownership, ADR-0018 Security section, ADR-0011/0019 accepted-date stamps, ADR-0020 renumbering. Decision captured: graham-adr-number-stability.md. Build + tests passing. — Scribe

📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): Wall-clock replay-determinism bug finding (independent convergence with Laura) elevated heuristic drop from "nice-to-have" to "non-negotiable." Architectural finding: offsets are load-bearing primitives; wall-clock time is informational metadata. This discovery directly led to Aaron's decision to implement always-prompt UX without automatic nudges. — Scribe

# Graham — Key Learnings (Recent)

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