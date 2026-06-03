---

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

Older detailed history (before 2026-05-30) archived to `history-archive.md`.


## Learnings

### 2026-06-02: Cycle 1 Persona Review Fixes (I4, I2, M1)

**I4 — ForkLineage.root() removal (YAGNI):**
Chose option (a): remove `ForkLineage.root()` rather than widen the constructor. Rationale: zero callers, and the sentinel it produced (`forkPointEventId = 0`) conflicted with the `session.ts` convention where `forkPointEventId === null` marks root sessions. Widening the constructor to accept `null` for `forkPointEventId` would have rippled into the guard clause (`forkPointEventId < 0` doesn't cover `null`) and `isRoot()` logic. YAGNI wins — when a real caller exists, we design root() with full knowledge of the null convention.

**I2 — InMemoryDB coupling documentation:**
Added a 5-line NOTE block to the `session.ts` file-header JSDoc, positioned between the existing Sprint 0 deferral note and the closing `*/`. Placement chosen to avoid merge conflicts with Roger's concurrent changes (imports, runtime logic below line 20). The comment explicitly names the four extended methods (getOwnEvents, getMetadata, insertRootSession, pushEvent) and frames the Refactor 3 decision: either the SQLite adapter satisfies InMemoryDB's surface or session.ts restructures to use DB.queryEvents.

**M1 — SKILL doc drift annotation:**
Chose option (b): annotated `london-tdd-first-green/SKILL.md` as "Sprint 0 variant" rather than updating the strategy doc. The strategy doc (`docs/crucible-tdd-strategy.md` §4.1) is the canonical reference showing full outside-in mocked-Ledger descent. The SKILL reflects our conscious Sprint 0 simplification (real in-memory, no mocks in GREEN). The annotation explains the divergence is intentional and when the full approach applies (Sprint 1+ when acceptance surface exceeds single-module reach).

📌 **Crucible Sprint 0 — Walkthrough A REFACTOR CYCLE COMPLETE** (2026-06-02T06:43:01Z): Laura (RED) authored 4 unit tests with mocked DB collaborator; Roger (REFACTOR) extracted ForkLineage value object, introduced SessionManager service + DB interface, wired in-memory adapter. All tests GREEN (0 regression on acceptance layer). Monorepo builds clean. DB collaborator seam established, ready for L1-substrate swap when OQ-2 lands pre-sprint-2. Deferred: Refactor 3 (SQLite integration stub), Mock Drift Defense (shared fixture builder). Next candidates: (a) Refactor 3 integration test, (b) Walkthrough B (§4.2 Pre-Commit Hook Veto). — Scribe
