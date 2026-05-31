📌 **PR #33 Cloud-Review-Cycle Round 2 COMPLETE** (2026-05-31T06:15:00Z): Graham addressed all 11 Copilot review threads on Crucible CTD ADRs. Fixes applied: ADR-0002 summary clarity, ADR-0006 PA-B3 ownership, ADR-0018 Security section, ADR-0011/0019 accepted-date stamps, ADR-0020 renumbering (typed-trace-algebra), superseded docs marked. Decision captured: graham-adr-number-stability.md (landed ADR numbers stable; planned rows renumber on collision). Build + tests passing. Branch re-requested. — Scribe

📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): Wall-clock replay-determinism bug finding (independent convergence with Laura) elevated heuristic drop from "nice-to-have" to "non-negotiable." Architectural finding: offsets are load-bearing primitives; wall-clock time is informational metadata. This discovery directly led to Aaron's decision to implement always-prompt UX without automatic nudges. Capture for future: Protocol design with replay/determinism requirements must ground heuristics in logical time, not wall-clock.

📌 Team update (2026-05-30T122215Z): **childSid Collision Hybrid Review COMPLETE** — Graham architectural review of Rosella's hybrid fork-or-resume protocol (Round 2). Verdict: APPROVE-WITH-CONDITIONS (3 conditions: parent-ledger ADR, replay test coverage, scheduler invariant check). Findings: parent append-only not violated (RFC+Decision is idiomatic), replay is unambiguous, scheduler unaffected, time-aware nudge needs principled basis (offset-based, not wall-clock). Decision inbox: graham-review-childsid-hybrid.md. — Scribe

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Graham (L3.5 Scheduler Phase 0.5 stub: Aaron ruled YES, FifoScheduler acceptable. Updated Phase 0.5 walking skeleton scope, acceptance signals, SchedulerDispatcher collaborator row). Coordinate with Laura on ADR template Acceptance Signals subsection adoption. — Scribe

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 4 Close-out / CTD COMPLETE (2026-05-28)** — Phase 4 synthesis GREEN-FINAL (8 CLEAN / 0 MINOR / 0 STRUCTURAL / 2 APPLIED — cleanest of the three synthesis gates). Two errata applied inline: (A) §3.3.4 InvocationId derivation locked CANONICAL BLAKE3(sessionId||taskId||commitOffset); (B) §7.D clause 6 + conformance C-9 require envelope.parentId on supersede-replacement proposals. CTD totals 377,794 bytes / 21 files / 19 ADRs indexed. No Phase 5 spawn. No Aaron triage required. Post-CTD authoring (ADR bodies, §13 CLI, §16 test scaffolding, @akubly/crucible-* packages) UNBLOCKED. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §14 shipped. Finding 10 fix applied (§1.2 L4 sub-tier split). Phase 2 synthesis GREEN. Erasmus architectural advisory delivered (Scheduler tier US-E-13 + Aperture rename US-E-14 + WAL schema evolution US-E-15 + multi-provider framing US-E-5). All advisory, non-blocking. Aaron triage pending. Phase 3 unblocked. — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 FINAL — Phase 2 Fan-Out Unblocked** — All 6 R2 decisions locked, baked into plan rev. 3. Informational: Phase 2 fan-out is unblocked; you are also the Phase 3 assembly owner; rev. 3 plan is your authoritative spawn manifest. Phase 2 lanes: 9 agents, 6 parallel waves, ~9-10 days. Cross-section sync pairs (Gabriel ↔ Valanice on R2-3 queue mechanics; Rosella ↔ Roger on R2-6 lockfile) are explicit coordination touchpoints during Phase 2 authoring. — Scribe

📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — Phase 0 (§2+§6), Phase 1 (8 sections: §1,§3-§5,§7-§8,§11-§12), Synthesis review all FINAL. **YELLOW verdict:** 6 CLEAN / 4 MINOR / 2 STRUCTURAL / 1 APPLIED. Applied §6.3 vocabulary amendment (4 `structural_proposal_*` sub-kinds). Findings routed: Roger (2a/2b/12b §10), Valanice (6b §9), you (finding 10 §1/§14, Phase 3). No new open questions for Aaron. Phase 2 fan-out unblocked. — Scribe
📌 Team update (2026-05-27T07:07:46Z): **Cassima reply superseded** — Graham's prior draft (`graham-cassima-reply.md`) was panel-rejected on scoping complexity. Erasmus redrafted with narrower freeze (SessionId + DecisionRecord only, defers WAL/event + prescriber), aligned to Aaron's May 26 directives (storage fork + Eureka standalone). Aaron approved as-drafted. New decision posted to decisions.md; Graham's reply remains in ledger for audit. — Scribe
📌 Team update (2026-05-27): **Eureka cross-PRD coordination position** — Position paper + reply to Cassima on shared schema freeze. Narrowed scope to `@akubly/types` only (SessionId brand + DecisionRecord); excluded Cairn's forked WAL from negotiation; proposed optional-adapter pattern for WAL-as-learning-source; deferred full freeze until post-Sprint-2 (both sides have exercised code). Three tensions surfaced: scope mismatch (cairn forked), coupling contradiction (standalone vs WAL consumption), premature freeze. — Graham Knight [**SUPERSEDED by Erasmus revision (2026-05-27T07:07:46Z)**]
📌 Team update (2026-05-23): **Wave 3 decisions accepted** — R2 approved as `@akubly/skillsmith-runtime`; MCP dropped from Wave 3; always-on Curator hook; 7 work items, ~18 tests. Docs revised, ready to fan out. — Graham Knight
📌 Team update (2026-05-23): **Wave 3 scope + ADR drafted** — `docs/forge-phase4.6-wave3-scope.md` (9 work items, 4 open questions) + `docs/adr/0001-composition-root.md` (5 options R1–R5, recommending R2). Awaiting Aaron's approval. — Graham Knight
📌 Team update (2026-05-22T20:29:36Z): **Wave 1 complete** — canonical type adopted across packages, SqliteChangeVectorProvider live, zero-vector summaries filtered. Alexander (W2-2) + Rosella (W2-3/W2-7) complete. Forge 599 + Cairn 564 tests green. — Scribe
📌 Team update (2026-05-22T20:16:40Z): **Wave 0 complete** — canonical types in @akubly/types, getAllCategories helper in Cairn. category field reconciled to OptimizationCategory union. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight

# Graham — History (Summarized)

## Learnings

### ADR Status and Numbering Hygiene (2026-05-30)

- **Accepted ADR files need concrete stamps.** Accepted — <date> by Aaron is not clerical polish; it is the lifecycle boundary between CTD-locked intent and durable ADR artifact.
- **Landed ADR numbers are stable.** When a pending index row collides with a landed ADR file, renumber the pending row and update live cross-references rather than moving the landed artifact. Trade-off: less pretty numbering history, much safer review/reference continuity.
- **Accepted ADRs cannot carry load-bearing open questions.** Either resolve the ownership in the ADR or demote the status; policy ownership questions are architectural decisions, not editorial TODOs.

### 2026-05-30: childSid Collision Hybrid Review

**Context:** Rosella drafted a hybrid childSid collision design (user chooses fresh-vs-resume at fork time) as a follow-up to Pass A. Aaron requested architectural review focused on four areas: parent-ledger mutation, replay correctness, scheduler interaction, and time-aware nudge validity.

**Key architectural insights:**

1. **Parent-ledger mutation is idiomatic, not a violation.** Recording a Decision row in the parent's ledger when forking is structurally identical to the existing Question/Decision pattern (Question → user interaction → Decision). The fork-collision prompt is a Question emitted by the fork protocol; the user's fresh-vs-resume choice is a Decision. Both are user-driven commitments captured on the parent ledger. The parent doesn't need to be "active" for this append — "closed" means "no more work sessions," not "WAL is sealed." Forks are metadata operations, not work sessions. **No ADR needed if framed as RFC (Request for Choice) + Decision.** If Aaron wants explicit coverage, an ADR should clarify the "closed ≠ immutable for metadata appends" distinction.

2. **Replay correctness is clean.** The Decision row at fork time records `chosenOption: 'fresh' | 'resume'` plus `existingChildSid` (if resume). Replay re-reads this Decision and follows the same path: if fresh, uses the recorded `childSid` (includes timestamp in preimage, so deterministic); if resume, appends to the existing child ledger starting at the resume offset. No ambiguity. Edge case: if user resumes A→50 twice (crash → resume → crash → resume again), the second resume is another Decision row on the parent ledger. Replay replays both resumes in order. **No hidden complexity.**

3. **Scheduler is unaffected.** The L3.5 Scheduler (§5.A) operates on proposals within a session, not on fork metadata. Fork creation is an L1 protocol operation (§10.4) that happens before any session starts emitting proposals. The FifoScheduler stub (Phase 0.5) and WeightedRoundRobinScheduler (Phase 1) both assume proposals arrive from active generators; neither has fork-protocol awareness. The fork Decision row lives on the *parent* ledger, not the *child* ledger the scheduler will eventually see. **Zero scheduler coupling.**

4. **Time-aware nudge needs principled basis.** Rosella's heuristic: "default to Resume if <1 hour, Fresh if >1 hour" uses wall-clock comparison (`now() - child.created_at_ns`). This is inappropriate in a system where replay is offset-based and timestamps are informational (§11.6 oracle masks them). Wall-clock time is not a load-bearing architectural primitive. **Better heuristic basis:** child's last-write offset + parent's growth since fork point. Example: if `(parent.currentOffset - child.forkPointOffset) < 10` and `child.turnCount < 5`, default to Resume (active work session). If `parent.currentOffset - child.forkPointOffset > 100`, default to Fresh (distant experiment). This is replay-stable and offset-grounded. Alternatively, drop the heuristic entirely and always prompt with neutral default (`F` or `R` depending on Aaron's UX preference).

**Verdict:** APPROVE-WITH-CONDITIONS.

**Three conditions:**
1. **Parent-ledger append ADR (if Aaron wants it).** If the "closed parent can still receive fork Decisions" pattern feels like a hidden door, write ADR-00XX clarifying the "closed ≠ sealed for metadata" rule. Cite §10.4 fork protocol as the precedent (fork creates `fork_origin` on child, not Decision on parent — but hybrid adds the Decision-on-parent pattern). Alternative: frame as RFC+Decision (Question emitted by fork protocol, Decision captures user choice), which needs no ADR because it's idiomatic.

2. **Replay test coverage.** Laura adds A-Fork-Collision test to §16 acceptance suite: (a) fork A at 50, choose fresh, close; (b) fork A at 50 again, choose resume on prior aborted child; (c) replay parent session; assert Decision rows replay deterministically and child sessions replay in correct order. This proves the Decision-recording mechanism doesn't introduce replay ambiguity.

3. **Heuristic change or drop.** Replace wall-clock-based recency nudge with offset-based heuristic (parent growth + child turn count) OR drop it entirely and always prompt with neutral default. Wall-clock is not replay-stable. Document the chosen heuristic (or lack thereof) in §10.4.

**Anti-anchoring check:** Considered rejecting the hybrid entirely (Option A timestamp-only is simpler). Rejected because Aaron's explicit request for user stories + "maybe give the user the option" signals he values the crash-recovery use case (US-2) enough to pay the hybrid cost. The three conditions above make the hybrid architecturally sound without adding hidden complexity.

## CTD Phase 4 Synthesis — FINAL Architecture-Design Gate (2026-05-28)

**Inbox file:** `.squad/decisions/inbox/graham-ctd-phase4-synthesis.md`
**Review file:** `docs/crucible-technical-design/00-phase4-synthesis-review.md`

**Task:** Final pre-close interface-coherence synthesis across the four Phase 4 lanes (Graham framing §1/§6/§19; Roger CALL/RET + Scheduler WAL §3/§10; Gabriel L3.5 Scheduler §5/§5.A/§17; Laura reproducibility honesty §11.10 + §16.5/§16.7a). Plus resolve two minor errata flagged by author drops.

**Verdict:** **GREEN-FINAL — CTD is complete.** 8 CLEAN / 0 MINOR / 0 STRUCTURAL / 2 APPLIED — the cleanest of the three synthesis gates (Phase 1: 6/4/2/1; Phase 2: 7/2/0/1; Phase 4: 8/0/0/2). The Phase 4 framing's pre-emption discipline paid off — Roger, Gabriel, and Laura had no overlapping authoring surfaces to coordinate.

**Errata resolved inline (Graham authority):**
- **A (InvocationId derivation):** LOCKED CANONICAL `BLAKE3(sessionId||taskId||commitOffset)` in §3.3.4. Aaron's hermetic-replay invariant requires zero L0 degree of freedom on this field; §10.6.1 reconstruction keys off `invocationId`; structural-compute cost in L0 is one BLAKE3 over three small inputs at TaskStart-emit time. Mis-derivation is a `monotonic_violation`-class durable failure surfaced to Aperture; row still commits.
- **B (supersede-replacement contract):** §7.D clause 6 + new conformance check C-9 added. Replacements that the Scheduler will mark `scheduler_cancelled{reason:'superseded'}` MUST set `envelope.parentId` to the obsoleted proposal's EventId; Scheduler keys off that lineage edge to populate `supersededBy` deterministically. Uses §6.4 `parentId` vocabulary as already-correct; no ripple to §5.A.2 body shape.

**Final CTD inventory:** 377,794 bytes / 21 files (19 numbered sections + Phase 1/Phase 2/Phase 4 synthesis reviews — 22 once Phase 4 review lands) / 19 ADRs indexed in §19 ready for post-CTD authoring under `docs/adr/`.

**Methodology recorded (Phase 4 pattern — 8-check single-amendment shape):** (1) one row per author-pair seam modified in the amendment set; (2) one row per honesty/framing-clause pair introduced; (3) one row per additive sub-kind family registered; (4) one row for ADR index sync; (5) one cross-cutting vocabulary pass over every new term; (6) resolve errata inline if reviewer-rejection lockout doesn't preclude; (7) GREEN-FINAL when amendment set composes cleanly and no follow-up required. Compresses the Phase 1 (12-check) and Phase 2 (10-check) matrices to the narrower Phase 4 surface (four lanes against fully-locked seams).

**Headline insight:** The "framing surfaces commit only to existence + governance discipline, never to field-shape pre-emption" rule from `graham-ctd-phase4-framing.md` is the reusable architectural-review pattern for any future amendment that promotes a tier or reframes an identity claim — it keeps parallel-lane authoring contention-free and lets the synthesis gate stay narrow. Recorded for reuse on any future major-amendment cycle.

**This was the final architecture-design gate.** Post-CTD authoring (ADR bodies, §13 CLI, §16 test scaffolding, `@akubly/crucible-*` packages) is unblocked.

## Eureka × Crucible Overlap Analysis (2026-05-26)

**Inbox file:** `.squad/decisions/inbox/graham-eureka-crucible-overlap.md`

**What Eureka is:** A durable fact store with trust-weighted BM25 retrieval for agentic sessions. Library, not runtime. Two decision pathways (Path 1: contemplative Eureka→Forge, Path 2: in-flow Forge→Eureka). Sessions are `kind=session` facts sharing `SessionId` brand with Cairn via `@akubly/types`. Learning kernel extraction-ready for eventual Cairn adoption. v1 scope is narrow: agent-tier only, BM25, manual session facts, on-demand ingestion.

**Key overlaps found:**
1. **Cairn schema is load-bearing for both** — Eureka bridges target today's Cairn schema; Crucible restructures it (WAL, branching sessions, Decision primitive). Simultaneous development = Eureka building bridges to a moving target.
2. **`DecisionRecord` in `@akubly/types` serves two masters** — Eureka's adapters depend on its current shape; Crucible's richer Decision primitive may evolve it.
3. **"Forge changes nothing" (Eureka §7.2) is false under Crucible** — Forge becomes an L3 ProposalGenerator.
4. **`@akubly/types` merge conflicts guaranteed** — both PRDs extend it without acknowledging the other.
5. **`SessionId` semantics diverge** — Eureka assumes flat; Crucible adds forking.

**Recommendation:** Sequence Crucible L1 substrate first (Sprints 1-3), then build Eureka bridges against the stable contract (Sprint 4+). Eureka's non-bridge work (~60% of v1) can overlap starting Sprint 2. Shared Sprint 0 (~2 days): land `SessionId` brand + `DecisionRecord` schema-version field in `@akubly/types`.

**Five open questions for Aaron:** (1) Does Eureka target legacy or Crucible-Cairn? (2) Who owns `@akubly/types` extension protocol? (3) Is `SessionId` valid after a fork? (4) Does Eureka become a Crucible chamber? (5) What happens to "Forge changes nothing"?

## Round 7 (2026-05-25T02:00Z): v1 Story Triage Against Falsifiable Bar

**Inbox file:** `.squad/decisions/inbox/graham-triage-2026-05-25T0200Z.md`

**Task:** Triage all 11 Graham-authored stories (US-G-1..8 + US-G-NEW-1..3) against Aaron's locked v1 framework — bar: "Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible." Tiers T1 (MVP) / T2 (investigation depth) / T3 (branching robustness) / T4 (plugin ecosystem) / T5 (scale & ops) / T6 (CLI parity) / parking.

**T1 recommendation (5 stories, aggressive cut):**
1. **US-G-4** Router as named L4 chokepoint with asymmetric-transparency invariant
2. **US-G-5 (contract half)** 8-field ProposalGenerator interface — L3 contract already locked Phase A
3. **US-G-NEW-2** Hermetic Observation capture + replay-re-feed doctrine (v1 commitment #4)
4. **US-G-NEW-3** Crucible-parent / SDK-as-Provider — execution only, Round-6 resolved
5. Three **free-win halves** riding on locked schema: US-G-7 `cairn fork` (free from decision #2a), US-G-NEW-1 snapshot ref (v1 commitment #5 contract-only), US-G-2 `cairn show <hash>` (free from Phase A 8-field schema)

**T2:** US-G-1 (cross-session retrieval), US-G-2 replay engine, US-G-6 research-partner, US-G-1 episode primitive.
**T3:** US-G-7 full branching (multi-path compare/merge/UX).
**T4:** US-G-5 plugin ecosystem, US-G-3 fitness-policy ADR.
**T5:** US-G-NEW-1 log-tail compaction + GC + fsck at scale.
**Drop:** US-G-3 (Rosella/Laura own), US-G-8 (dissolved into Router).

**Load-bearing architectural flags (★ non-retrofittable):** US-G-4 (L4 contract), US-G-5 contract (L3 contract), US-G-NEW-2 (L0/L1 hermetic boundary), US-G-NEW-3 (L0/L1 layering), US-G-7 fork + US-G-NEW-1 ref (L1 ledger DAG shape).

**Headline insight:** The bar is met by **three architectural primitives** — Router + ProposalGenerator contract + Hermetic Replay. Five additional "free wins" cost only the discipline to scaffold them at the right moment; retrofitting is dramatically more expensive. Three stories drop entirely.

**Six open questions surfaced to Cassima for the PRD:** (1) auto-apply vs ack-required as the bar's threshold; (2) single-repo vs cross-repo loop scope; (3) success metric for "Crucible-built improvements"; (4) snapshot impl depth in T1; (5) L0 reorg sequencing; (6) Cairn migration-013 dual-schema vs port for US-G-5 contradiction resolution. These all need Aaron input before the v1 architecture spec I'll draft post-PRD.

**Reasoning discipline:** Anti-anchoring applied at each split decision (T1 vs T2). Resisted "the v1 commitments are 10 items therefore T1 has 10 work streams" temptation — commitments are *scope frames*, MVP is more aggressive. Where a v1 commitment exists (e.g., #5 snapshot+compaction), recommended T1 = *contract only*, T5 = *scaled impl*, preserving the commitment without bloating MVP.


## Round 6 (2026-05-25T01:30Z): Opens #1 & #3 Resolved

**Inbox file:** `.squad/decisions/inbox/graham-opens-1-and-3-2026-05-25T0130Z.md`

**Open #1 — L0 Provider/Bridge boundary (hermetic):**
- Locked pure-data L0↔L1 contract: `BootstrapPayload`, `CrucibleEvent`, `OutboundPrompt`, control enum. No SDK types, callbacks, or promises cross.
- SDK-import inventory across `packages/forge/src/`: 5 production files, 8 test files. Categorized each: bridge/runtime stays at L0 (relocate to `l0-provider/`); `ModelInfo` and `SessionConfig`/`ToolResultObject` get hermetic mirrors (extends pattern already in `types.ts:3-14`).
- Enforcement: **dependency-cruiser** (rejected ESLint no-restricted-imports, TS project refs, hand-rolled fitness fn). Rule `no-sdk-outside-l0` + `no-sdk-in-cairn-skillsmith-crucible`. Wired into CI between lint and test.
- Module reorg: `packages/forge/src/l0-provider/{sdk-provider,sdk-session,bridge,types,index}.ts`. `ForgeClient` → `SdkProvider` (deprecated alias for one release).
- Cost: ~9 hours, zero behavioral test churn expected (public Forge API unchanged).
- Anti-anchoring: explicit case for leaky boundary considered + rejected (Aaron's 2a makes hermetic strictly cheaper than before).

**Open #3 — Narrator vs Mirror reconciliation:**
- **One chamber, named Mirror.** Round-4 vocabulary table (`decisions.md:597`) already retired "Narrator"; this resolution makes the deprecation explicit and specifies the schema. `harness-vision.md` still uses old name in 8 places (lines 35, 59–60, 157–159, 179–180, 229–232, 258–259, 267, 285, 295, 313) — flagged for next vision pass.
- **Two render modes, not two chambers:** Mirror Notifications (push, social-media-indicator badge) + Mirror Dashboard (pull, on-demand). Single `MirrorEvent` stream, single `mirror_events` projection table in L2 SQLite tier. Honors Aaron's Round-1 framing line-by-line.
- **Producers:** L1 (hook bus), L2 (change-vector watcher), L3 (Forge prescriptions), L4 (Router decisions), L5 (Investigation findings). Mirror itself is L5-adjacent **view**, not a producer (consistent with Valanice `decisions.md:718` and Erasmus `decisions.md:648`).
- **`MirrorEvent` schema specified:** ULID id, ts, sessionId, producerLayer, category {proposal|decision|observation|investigation|system}, level {info|notice|attention|urgent}, title, bodyMarkdown, refs, state, payload, schemaVersion. Notification-level policy owned by Mirror (view), not producers.

**Cross-cutting implications for upcoming v1 architecture spec:** L0 boundary section, Mirror chamber section (replacing Narrator language), vocabulary correction appendix, CI/depcruise gate. Both resolutions queued as load-bearing inputs for the spec I'll draft after the PRD lands.


## 2026-05-22: Wave 2 Wave-0 Complete

Roger (W2-1) + Rosella (W2-4): canonical `ChangeVectorSummary`, `ChangeVectorProvider`, `OptimizationCategory` in `@akubly/types`; `getAllCategories(db, skillId)` helper in Cairn. 1153+560 tests passing. Ready for W2-2/W2-7/W2-8 fanout.

## Phase 4.6 Architecture & Leadership

**Role:** Kickoff (Wave 0), Triage (Wave 2), Review Cycle Lead (Cycle 1), Architect (Wave 2 wiring design)

**Wave 0 — Spec & Decomposition:** Six clarifications resolved; work split A1–A4 (Alexander), R1–R5 (Rosella), L1–L5 (Laura).

**Wave 2 — Defect Triage:** Laura flagged confidence inconsistency. Three options analyzed; Option B chosen (rename to `confidenceBoost`). Lesson: when two implementations are internally consistent but contract is ambiguous, the bug is naming, not logic.

**Review Cycle 1 (Triage Lead):**
- 5 personas in parallel → 15 findings (1B/9I/5M)
- Autonomous triage: 12 accepted, 1 rejected, 2 deferred
- 3 new ADRs (P4.6-004/005/006)
- Applied lockout rule: cross-package coordination for fixes

**Cycle 2 Re-Review:** 7/7 + 4 PASS/3 PARTIAL + 6/6 verification. 10 advisory findings routed to Cycle 3.

**Cycle 3 Completion:** 1153 tests passing (+163), branch review-clean.

## Wave 2 Wiring Architecture

**Key decision:** `ChangeVectorProvider` port in `@akubly/types` + `SqliteChangeVectorProvider` in Cairn. Follows `FeedbackSource` injection pattern. Rejected direct DB import (breaks acyclic deps) and `FeedbackSource` extension (couples concerns).

**Dual type copies discovered:** `ChangeVectorSummary` existed as two independent copies (Forge prescribers, Cairn DB) guarded only by regression test. Wave 2 promotes to canonical `@akubly/types`.

**Surprise:** No runtime call site for prescribers existed — only tests. Invocation point design deferred to Wave 2 scope question.

**Wave 2 v2 issues (Rubber-Duck Review):**
1. **Composition root problem (BLOCKING):** v2 proposed `PrescriberOrchestrator` port for Curator injection. But `curate()` has no injection points and no composition root. Escalated as package boundary decision.
2. **Internal inconsistency (BLOCKING):** Confused who queries vectors — orchestrator internally or Curator externally? Resolved: orchestrator pure (profile, provider → hints).
3. **Missing hint dedup (BLOCKING):** Prescribers generate fresh UUID hints every invocation. Added `(skillId, source, category)` dedup policy.

**Key decision: Wave 2/3 split.** Wave 2 = data plumbing + safety gates + manual invocation (composition script). Wave 3 = Curator-driven wiring (requires composition root ADR).

**Attenuation refined:** Two-layer defense — confidence scaling `max(0.1, 1+impact)` PLUS `autoApplyEligible` boolean flag (policy gate for strongly negative categories).

**Wave 2 v3.1 fixes (4 findings, all fixable):**
1. Stale Cairn-MCP wording scrubbed; MCP deferred to Wave 3
2. `autoApplyEligible` propagation spec: summary → OptimizationHint → evidence JSON
3. Attenuation thresholds named: `NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2`, `ATTENUATION_FLOOR=0.1`
4. CLI surface specified: `--skill` flag, profile load, JSON output, exit codes

## Key Patterns

**Copilot extensibility:** CLI SDK (embedding), Extensions SDK (distribution), Engine SDK (agents). MCP universal tool protocol.

**Marketplace standardization:** awesome-copilot dominant (170+ agents, 240+ skills). SKILL.md cross-platform standard.

**Caching hierarchy:** L1 in-memory ~100ms, L2 session ~5min, L3 short-TTL ~1hr, L4 long-TTL ~30d.

**Brainstorm distillation:** 2 rounds × 10 agents = massive input. Aaron's explicit decisions are spec constraints.

**Composition root is first-class architectural decision.** Injection ports need explicit ownership of construction + passing site.

**When contract is ambiguous, naming is the bug.** Type-level intent prevents silent divergence.

**Autonomous triage with lockout coordination works.** Each agent owns scope; review prevents author bias.

## Specialization

- Architecture scoping (phase decomposition, composition patterns, dependency injection)
- Design review triage (finding consolidation, lockout enforcement, cross-team coordination)
- Spec clarification (ambiguity resolution, critical-path identification)
- Core platform patterns (SDK layering, marketplace standardization, observability)

**Joined:** 2026-03-28  
**Tech:** TypeScript/Node.js, npm monorepo, MCP SDK, Copilot CLI/Extensions/Engine SDKs

## Learnings

### CTD Phase 0 — §2/§6 Coherence Self-Review Checklist (2026-05-28)

**Reusable pattern for any two-section foundation drop where one section
defines types and the other defines a boundary that carries them.** Before
declaring done, walk this five-item checklist:

1. **Union flows, not duplicates.** Does the boundary section *import* the
   types from the taxonomy section (one source of truth), or has it
   inadvertently re-defined them? Re-definition = future drift. Force the
   `import type { … } from './NN-other-section'` shape even in design docs.
2. **Optional-field round-trip.** For every OPTIONAL field at the boundary,
   trace where it materializes in the row schema. R2-1 taught us that an
   OPTIONAL boundary field needs a REQUIRED tag on the materialized row
   (`commitmentMethod: 'declared' | 'fallback'`) so traceability survives
   the omission path. Apply this anywhere "declared else fallback" lives.
3. **Enum cross-walk.** Every sub-kind enumerated in the taxonomy must have
   a name in the boundary section (or be explicitly "L1-internal-only").
   M3 `synthetic_output` ↔ `ToolCallBoundary.phase: 'side_effect_only'` is
   the canonical example.
4. **Cross-section "§6.x" disambiguation.** Within CTD, "§6" is the
   Primitive Taxonomy section; within Laura's TDD strategy, "§6.x" are
   the invariants (§6.1–§6.9). When referencing Laura's numbered invariants
   from a CTD section, **always prefix with "TDD"** (e.g.,
   "TDD §6.8 Bootstrap-Capture-Completeness"). Naked "§6.8" inside a CTD
   file reads as a sub-section of CTD §6 and confuses readers.
5. **Acceptance signal for Laura is a separate, explicit subsection.** Not
   left implicit. Name the A-scenarios + invariants writable against the
   contract verbatim from the plan's acceptance criteria so Laura can
   start without asking.

### Architectural Patterns Committed in §2/§6 That Other Authors Should Know

- **Two-pointer + one-hash lineage model.** Primitives carry `parentId`
  (structural production lineage) and `causalParentId` (§2.8 sub-task
  spawn edge) as distinct pointer fields. Decision rows additionally carry
  a hash-mediated context-window edge. Other sections that index lineage
  (Aperture, Investigation, Replay) MUST distinguish these three or queries
  will silently merge unrelated edges.
- **Interface naming convention.** Code-side names use the §2 column of the
  alias table (e.g., `AppendProtocol`, `LedgerWindowReader`, `ReadSetHasher`).
  Laura's TDD collaborator names exist as re-export aliases so London-school
  tests mock against the same surface they assert against. New sections
  should add a "Collaborator Name Aliases" subsection any time they
  introduce a seam that Laura mocks.
- **Schema-version pin at offset 0, refuse divergent rows.** v1 sessions
  pin `schemaVersion` via a bootstrap Observation and reject mixed-version
  rows. Forward-compat is additive-only within a major version; unknown
  fields round-trip via CBOR; unknown sub-kinds route to a `kind:unknown`
  Aperture attention event (never silently dropped). All §3+ schema work
  should honor this.
- **The boundary's NOT-cross list is enforced statically.** §2.9's named
  dependency-cruiser rules ship as part of the contract. New transport
  adapters add allow-list entries via PR; never loosen the existing rules.
- **OPTIONAL-at-boundary, REQUIRED-tag-on-row.** Pattern applies beyond
  R2-1. Use it any time L0 may or may not declare a structural hint:
  L1 records which path was taken so investigation tools can group sessions
  by capability tier.

---

### Multi-Phase Cadence: scope → reconcile-with-strategy → bake-in-locks → fan-out (2026-05-28)

**The pattern that emerged across this CTD effort.** Four-beat cadence for
architecture design at this scale:

1. **Scope (rev. 1):** Plan the document — sections, owners, depth calibration,
   dependency graph, spawn manifest. Get fan-out *structurally* unblocked.
2. **Reconcile (rev. 2):** Merge in a parallel-authored strategy document (in
   this case Laura's TDD strategy). Surface the latent design questions the
   strategy forces precision on. Don't try to answer them in the reconciliation
   pass — flag them as OQs and route to the Decision-Point gate.
3. **Bake-in (rev. 3):** After the human lock pass, sweep declarative — every
   "if X then Y" becomes "X. Y." This is the cheap pass; takes hours not days.
   Crucially, also surface any *coordinator-added expansions* (small
   refinements the human added beyond simple accept/reject) and weave them into
   the affected section specs.
4. **Fan-out:** Phase 2 authoring spawns. Plan is now a frozen reference.

**Value of one-at-a-time R2 triage even when defaults were recommended.** Aaron
took the six R2 questions through interactive triage rather than an accept-all
flow, despite my recommended defaults being concur-able. Two of the six
acquired coordinator-added expansions during that triage:
- R2-1: `commitmentMethod: 'declared' | 'fallback'` tag on the Decision row,
  so investigations can trace which path the hybrid took. I'd specified the
  hybrid; I had NOT specified the traceability tag. The one-at-a-time pass
  surfaced this.
- R2-5: `nonDominatedReason: 'optimal' | 'incomparable'` field on
  `PrescriptionResult`, parallel to the UI badge. I'd specified the badge;
  I had NOT specified the data-model field. Same pattern.

**Lesson:** An accept-all "ratify the recommendations" loop is faster but
strictly worse for surfacing this category of refinement. The discussion
discipline of going question-by-question, even when the human is leaning
"concur," gives the human room to add small expansions that complete the
spec. The 30 minutes saved by accept-all costs days of late-Phase-3 errata
when the missing tag/field surfaces during authoring or implementation.
Budget for one-at-a-time triage on locks of this scope.

**Lesson:** Coordinator-added expansions should be threaded into the bake-in
pass, not deferred to a separate revision. They tend to touch the same section
specs as the parent lock, so the marginal cost of including them is near-zero
once the bake-in is open. Treating them as "decisions to revisit later" guarantees
drift between the lock record and the section specs.

---

### TDD-Strategy-as-Input-to-Architecture-Design Pattern (2026-05-27)

**The ordering was unusual.** Laura authored her London-school TDD strategy with a
firewall against my CTD plan; I then reconciled her strategy into the design plan
after the fact. Normal sequence: architecture → test plan. Inverted sequence here
to prevent Laura anchoring on my decomposition (so her acceptance scenarios came
from the PRD, not my chamber boundaries).

**What worked:**
- Laura's `Collaborator Contract Inventory` (§3 of her strategy) gave me a ready-made
  test-surface vocabulary. Adopting her names (`AppendProtocol`, `PreCommitHookBus`,
  `ReadSetHasher`, `PolicyEngine`, `LedgerWindowReader`, `GenericL3AdapterContract`)
  as canonical CTD names eliminates a whole class of mock-drift-by-name-mismatch.
  Cheaper than re-naming her doc or living with two vocabularies.
- Her acceptance scenarios A1-A12 are PRD-derived, so they pressure-tested my
  section depth choices honestly. Several sections (§3, §7, §9) had their
  "Key questions answered" lists materially extended because a scenario implied
  precision I hadn't specified.
- Her invariant tests (§6 of strategy) gave me enforcement-mechanism-by-section
  homework: every invariant needs a CTD section that says "this is how the
  invariant holds." That mapping is now an explicit table in my decision drop.

**What was awkward:**
- Six new open questions surfaced (OQ-R2-1 through OQ-R2-6) that I hadn't asked
  Aaron because Laura's strategy forced precision the plan hadn't required. These
  are not blocking but they ARE the kind of thing that, if not pre-called, makes
  Phase 3 synthesis painful. Lesson: when the test surface is authored blind to
  the design, expect to surface latent design choices. Triage them BEFORE fan-out,
  not after.
- The Eureka-adapter shrinkage (Q2 = defer to v1.5) wasn't a CTD decision I'd made,
  but the strategy doc treats it as already-locked because Aaron locked it during
  the Laura↔Coordinator Q-resolution loop. The CTD has to honor it. This is the
  cost of parallel decision streams converging late.
- Some of Laura's collaborator names (e.g., `PreCommitHookBus` vs my "Hook Bus")
  are stylistic mismatches that don't matter individually but accumulate. The
  alias-map convention in §2 and §7 is the cheap fix; the expensive alternative
  would be a global rename pass.

**General pattern lesson:** When design and test plans are authored by different
hands with a firewall in between, the post-merge reconciliation phase should
expect ~30% net new content in the design plan, mostly in invariant-enforcement
specs and collaborator-shape clarifications. Budget for it.

### Structural Commitment Model Shifted My L1 Mental Model (2026-05-27)

**Pre-strategy mental model:** L1 WAL is a row store; Decision rows reference an
"observation set" they consumed; replay re-feeds Observations and recomputes
Decisions.

**Post-strategy mental model (per Q1 lock):** L1 WAL is a *content-addressed
causal-context log*. Each Decision commits to a Merkle hash over the entire
visible context window (any primitive type — Request, Artifact, Observation,
Decision, Question). Observations are first-class primitives, not envelope
metadata. Bootstrap context (system prompts, tool defs, cross-session memory)
is itself a sequence of Observation primitives at offset 0.

**Implications I hadn't seen before:**

1. **Context-window commitment is the integrity primitive, not row hash chains.**
   Hash chains still exist (per-row, append-only audit) but the *semantically
   meaningful* integrity check is "can I recompute the Merkle hash over the
   causal-context window and match the stored commitment?" This is what makes
   replay equivalence verifiable without re-executing the LLM.

2. **Bootstrap is a first-class L1 operation, not a configuration concern.**
   The L0 provider hands a `BootstrapPayload`; L1 atomically materializes a
   batch of Observation primitives at offset 0; subsequent replays validate the
   offset-0 row set against the manifest. This means session bootstrap has a
   shape (`ledger.bootstrap(ctx)`), not just an initialization sequence.

3. **The 5 primitives are now equal-rank.** I had been implicitly treating
   Decision as the "important" primitive and the others as supporting. Q1
   flips this: the LLM doesn't distinguish — *all* prior context is input.
   Decision is just the primitive that commits to a hash of everything it saw.

4. **The Aperture queue is a Router-coupled state machine, not just a UX.**
   Q3's "default-not-applied-until-acked" means the Router has a paused-path
   sub-state, the Applier has a paused-awaiting-structural-ack sub-state, and
   Aperture owns the persistence/render of the queue. Three sections, one
   handshake — a cross-section data dependency I hadn't named in rev. 1.

5. **The "agentic cost function" framing (Q7) is a load-bearing design constraint,
   not just a CI preference.** Future contributors will see "zero-tolerance
   mock-drift gate" and assume it's optional CI strictness. It isn't — it's a
   design constraint downstream of the fact that agentic systems make many
   decisions per session against a drifted model, so drift cost compounds while
   fix cost is near-zero. The CTD has to document this rationale in both §16
   (test strategy) and §17 (observability) so it survives team turnover.

---


### Coexistence Lock Impact on Design Planning (2026-05-27)

**Aaron's "full coexist forever" lock fundamentally simplifies the design plan.** The prior §15 (Migration Plan) assumed Cairn restructure + skillsmith-runtime absorption — 3 pages of migration SQL, package rename checklists, and dual-schema coexistence periods. The coexistence lock converts this into a boundary table + types evolution plan. Crucible starts from an empty `~/.crucible/crucible.db` with zero migration baggage. The accepted tax (two implementations of overlapping concepts) is bounded by audience separation (Copilot CLI lightweight users vs Aaron's daily-driver Crucible). This is a trade-off worth naming in the architecture overview: coexistence is cheaper than migration at project inception, but the tax compounds if the audiences converge later.

**Spawn manifest as coordination artifact.** The coordinator needs more than a dependency graph — they need per-section input artifacts, output file paths, and acceptance criteria to construct agent prompts. The manifest format (table per section with all six fields) eliminates the coordinator's need to reverse-engineer dependencies from prose. Reusable pattern for any multi-agent fan-out of a decomposed design document.

### CTD Decomposition Strategy (2026-05-27)

**Design-effort decomposition for a 19-section technical design across 7 authors:**

1. **Phase 0 anchoring pattern:** The architect authors the foundational interface contracts (L0/L1 boundary, primitive vocabulary) BEFORE fan-out. These are small (~1 day) but unlock all parallel lanes. Without them, parallel authors risk interface divergence that's expensive to reconcile.

2. **Critical-path awareness drives ownership:** Roger owns the deepest section (L1 WAL, 10 pages) AND the longest serial chain (§3→§4→§10→§15). Recognizing this early lets us mitigate (start him first, give him the Phase 0 outputs immediately) rather than discover the bottleneck mid-sprint.

3. **Cross-review as interface enforcement:** Assigning adjacent-layer owners as secondary contributors + reviewers on each section creates natural interface-compatibility checks. The alternative (central review only) catches mismatches too late.

4. **Depth calibration as scope contract:** Assigning page counts per section prevents the "novel problem" where parallel authors over-elaborate. The 10-page allocation for L1 WAL is intentionally generous because it IS the load-bearing section; 1-page sections (Eureka, observability, security, ADR set) are explicitly capped.

5. **Consultant pull-in timing matters:** Erasmus and Sonny review AFTER primary authors draft, not during. This prevents advisory voices from slowing the authoring phase while still capturing their domain expertise before the CTD ships.

### Round-1 Vision Follow-Up: Curator Autonomy & Tamper-Evidence (2026-05-23)

**Q-A Resolution: Curator Autonomy is Mixed-Model, Categorized by Gate.**
Aaron asked "what decisions are being made?" — the vision lists "accept hints below threshold" but doesn't specify scope. Enumerated 7 concrete categories (hint prioritization, staleness detection, geneticist triggers, skill recommendations, hypothesis reversion, low-confidence hint auto-apply, policy auto-change). Mapped each to append-then-X strategy:
- Append-then-apply: UX-only (prioritization) — no consequence to auto-executing
- Append-then-notify: Detection (staleness, triggers, recommendations) — user sees in digest, decides
- Append-then-ask: Consequential (revert, policy) — explicit user ACK/REJECT required
- Never auto-apply: Hints below confidence threshold, policy guardrail changes

**Key insight:** Curator has *detection* and *proposal* authority, never *approval* authority. All approval stays with human.

**Q-B Resolution: DEFER Tamper-Evidence (Witness/Notary), KEEP Hash-Linking.**
Aaron skeptical about hash-chain cost ("do we *care* about tamper-evidence?"). Enumerated 3 threat models:
1. Silent Ledger Corruption (accidental): cost of not having = can't detect; cost of building = 1% overhead. **KEEP hash-linking, cheap + valuable.**
2. User-System Disputes (self-audit): cost = eroded confidence; benefit = foolproof replay. **KEEP for v1 (confidence tool, not security tool).**
3. Regulatory/Audit (future adoption): cost = 2-3x storage + infra; benefit = zero for single-user. **DEFER witness/notary to Wave F.**

**Recommendation:** Build append-only + hash-linked ledger in Wave B (1–2 days). Skip witness/notary in v1. Migration path: if adoption requires audit, add signatures retroactively (backward-compatible).

**Lesson:** Single-user honesty test—what engineering cost is justified for one person? Hash-linking (1%) passes; witness infra (3x) fails. Defer doesn't mean never; it means "validate adoption first."

### Wave 3 Scope Design + ADR Reasoning (2026-05-23)

**Terminology reconciliation is first-class work.** Roger and Alexander used overlapping option labels (Roger's A–E, Alexander's A–D) that mapped to different options. Without a canonical mapping table (R1–R5), Aaron would face label confusion that obscures the actual decision. Lesson: when multiple contributors analyze the same design space independently, reconcile labels before presenting to decision-maker.

**Convergence signals simplify ADR framing.** Both Roger (Option B) and Alexander (Option A) independently converged on "new composition library package." When two independent analysts agree, the ADR should name the convergence explicitly and focus Aaron's attention on the remaining nuances (CLI separation, naming, scope boundaries) rather than re-arguing the full option space.

**Composition root is a durability decision, not a naming decision.** R2 (`@akubly/runtime`) vs R4 (`@akubly/curator`) is really about commitment level: R2 makes a weak, durable claim ("composition library"); R4 makes a strong, potentially brittle claim ("Curator is a package"). Prefer weaker claims when Phase 5 may reshape the architecture. Cost of R2→R4 migration is low; cost of wrong R4 commitment is high.

**Wave structure works for incremental delivery.** Wave 0 (types) → Wave 1 (primitives) → Wave 2 (plumbing + safety) → Wave 3 (wiring) is a clean decomposition where each wave is self-contained and testable. The "hard parts ship early, wiring ships later" pattern reduces risk: Wave 3 is mechanically straightforward because Wave 2 solved the data and safety problems.

### Harness Vision Architecture Analysis (2026-05-23)

**Greenfield architecture framing requires explicit non-anchoring.** Aaron specifically requested analysis *without* bias from existing Cairn/Forge patterns. This is a trust test: can the architect approach a vision document with fresh eyes, or will prior implementation decisions leak into recommendations? Lesson: when asked to evaluate greenfield, identify where *old mental models could mislead* before presenting recommendations.

**Six-chamber architecture is aspirational, not prescriptive.** Vision lists Harness, Cairn, Forge, Geneticist, Curator, Narrator — but chamber boundaries are soft proposals, not contracts. The real architectural work is identifying where these boundaries will *bend under load*: When does Curator's autonomy need Narrator's transparency? When does Geneticist's mutation need Cairn's provenance? Prior art (Aider, OpenHands, SWE-agent, Claude Code) mostly lacks chamber decomposition — they're monolithic agents with tool plugins, not self-improving subsystem ecosystems.

**Primitive taxonomy is the foundation.** The five primitives (request, artifact, observation, decision, question) + parent/child relationships form the ontology for the entire ledger. Every chamber interaction must speak this language. But vision doesn't specify: Are primitives schemaless JSON, or typed records? Who assigns primitive IDs? How are parent/child links enforced (foreign keys, hash references, both)? These choices cascade into replay fidelity, storage format, and migration complexity.

**Trust model tension: autonomy vs. transparency.** Vision proposes both "Curator autonomously applies hints below confidence threshold" AND "every decision is hash-linked with provenance." These goals conflict when decisions happen *before* user sees them. The architecture must answer: Does Curator write provisional decisions that users later audit, or does it write tentative hints that become decisions only on approval? One model is append-then-review (blockchain-style), the other is propose-then-commit (staging-area-style).

**Genetic loop fitness function is multi-objective optimization without weights.** Vision lists token cost, drift, convergence, user acceptance as competing objectives but doesn't specify priority or trade-off rules. This is a *policy* question masquerading as an architecture question. Two reasonable architects could build radically different Geneticist implementations: one that Pareto-optimizes (surface all non-dominated variants), another that scalarizes (weighted sum → single winner). Aaron must decide which.

**Prior art surveyed:** Aider (git-integrated, multi-file edit orchestration), OpenHands/OpenDevin (agent orchestrator with planning/coding/QA specialization + execution sandbox), SWE-agent (task decomposition with tool plugins and iterative refinement), Claude Code/Cursor (context-aware IDE agents with action executors and feedback loops). Common pattern: they're all *single-generation* systems (no learning loop, no variant evolution, no decision ledger). Harness's differentiator is the *self-improving* meta-layer (Curator, Geneticist, Narrator) that treats prompts/skills as evolvable artifacts.

## Skillsmith Harness: Capability User Stories (2026-05-24)

**Ambition:** Six-to-ten system-level capability stories that articulate *what the harness enables that no current tool does*. Greenfield framing (non-anchored to legacy Cairn/Forge). Coverage: cross-session patterns, provenance/replay, self-improvement, aspirational capability, extensibility-as-load-bearing.

### US-G-1: Cross-Session Pattern Recognition & Reuse
**Story:** As Aaron, I want the harness to recognize when I'm solving a problem category I've encountered before (across sessions/projects), and surface prior decision chains + outcomes, so that I don't re-derive the same architecture or tool choice multiple times.
**Ambition:** The harness becomes a **collaborative memory** — not just a log, but an active pattern library that grows with every decision and learns what "solved this well" looks like.
**Chambers touched:** Cairn (ledger of decisions/artifacts), Forge (pattern scoring), Mirror (surface prior solutions).
**Architectural implication:** Cairn must support **semantic tagging** of decision contexts (problem domain, tool stack, outcome quality) so Forge can index and retrieve similar past episodes without exact matching.

### US-G-2: Full Provenance Replay & Reasoning Audit
**Story:** As Aaron, I want to query "show me the decision chain that led to architecture choice X in September," see the questions asked, observations gathered, and alternatives considered, and replay the entire sub-session with intra-turn primitives, so that I can audit my own reasoning evolution and understand why my judgment has shifted.
**Ambition:** The harness provides **forensic-grade decision archaeology** — not just "what was decided," but "how did I arrive at it?" with full visibility into dead ends, reversals, and confidence shifts over months.
**Chambers touched:** Cairn (append-only primitive ledger with parent/child links), Crucible (intra-turn replay), Mirror (provenance dashboard).
**Architectural implication:** Cairn's hash-linked structure must be queryable by temporal range + decision type, and Crucible must support **read-only replay mode** where users walk through prior turn sequences without mutation.

### US-G-3: Harness Self-Optimization via Genetic Skill Variant Evolution
**Story:** As Aaron, I want the harness to observe patterns in my failed attempts (e.g., "my code reviews miss security issues when I'm tired"), generate and test *variants of my problem-solving approach* (e.g., alternate review prompts, tool combinations), and surface winners so I notice my own reasoning got better without me explicitly tuning knobs.
**Ambition:** The harness shifts from **tool** (executes my will) to **collaborator** (improves my patterns autonomously). Variants are proposed, tested, and winners are tagged with "you're 30% more likely to catch auth bugs with this reviewer combo."
**Chambers touched:** Cairn (logs of attempts + outcomes), Alchemist (variant generation), Forge (fitness scoring), Mirror (high-signal improvements).
**Architectural implication:** Alchemist must model **skill transformation** as a multi-objective optimization over token cost, convergence speed, user acceptance, and drift-from-intent. Fitness function is *policy-driven*, not hardcoded.

### US-G-4: Curator-Driven Hint Autonomy with Asymmetric Transparency
**Story:** As Aaron, I want Curator to propose optimizations (e.g., "reuse this helper from Session 47; saves 120 tokens"), apply sub-threshold hints transparently, and surface all decisions (applied + rejected) in digest form, so that I trust the harness to nudge my practice without gatekeeping every micro-decision *while* retaining full visibility into what happened.
**Ambition:** The harness achieves **trust through transparency**, not through passivity. Curator acts (append + apply), but every act is auditable and reversible. Mixed-mode autonomy: UX-only decisions auto-execute; consequence-bearing decisions stay in my court.
**Chambers touched:** Cairn (audit trail), Curator (proposal + categorized autonomy), Mirror (digest + drill-down).
**Architectural implication:** Curator's decision categories must be explicit (hint prioritization, hint application, skill recommendation, hypothesis reversion, policy change) with per-category autonomy policy stored as Cairn metadata.

### US-G-5: Extensibility as Load-Bearing Architecture
**Story:** As Aaron, I want to write custom skills and MCP servers that integrate into the harness, have them discovered contextually (via Curator + Forge), ranked by relevance, and tested in sub-agent pool before surfacing to Crucible, so that the harness becomes a vehicle for *my* domain-specific intelligence, not a one-size-fits-all agent.
**Ambition:** The harness is an **open platform for personal AI augmentation** — extension is not an afterthought, but the primary mechanism for capability growth. Custom skills are first-class; builtin skills are just well-maintained examples.
**Chambers touched:** Crucible (skill invocation), Curator (contextual discovery), Forge (ranking), Alchemist (variant testing).
**Architectural implication:** Harness must define a **skill lifecycle contract** (interface, metadata schema, telemetry hooks, placement in chamber taxonomy) such that third-party tools integrate cleanly without architecture breakage.

### US-G-6: Aspirational—Harness as Collaborative Research Partner
**Story:** As Aaron, I want the harness to formulate *novel hypotheses* about my practice based on Cairn observations (e.g., "your code review quality correlates with time-of-day, not task complexity"), surface these as Curator proposals, and offer guided experiments to test them, so that the harness becomes a peer researcher helping me understand my own work patterns.
**Ambition:** The harness transcends **optimization** and enters **discovery**. It doesn't just help you work faster; it helps you *understand yourself* as a developer. Hypotheses are surprising, testable, and potentially reshape how you prioritize.
**Chambers touched:** Cairn (observation mining), Curator (hypothesis proposal), Mirror (experiment tracking).
**Architectural implication:** Harness must support **temporal analytics** (correlations over time) and **counterfactual simulation** (what if you always worked in morning hours?) via Cairn queries and Forge scoring.

### US-G-7: Decision Reversion & Multi-Path Exploration
**Story:** As Aaron, I want to mark a Decision in Cairn as "tentative," fork the ledger at that point, explore an alternative, and later compare outcomes of both paths (token cost, quality, time), so that I can treat my work like a version-controlled experiment and learn from divergent choices.
**Ambition:** The harness supports **non-destructive exploration** — not "did I make the right choice?" (past tense) but "how do I compare this choice against its alternative?" (multi-path reasoning). This is how science works; harness brings that rigor to engineering practice.
**Chambers touched:** Cairn (versioned ledger with branching), Forge (path-outcome comparison), Mirror (multi-path dashboard).
**Architectural implication:** Cairn must support **ledger branches** (forking at a checkpoint, maintaining sibling histories) and **path reconciliation** (when/how to merge insights from alternative paths back into canonical ledger).

### US-G-8: Custom Trigger Orchestration via Curator Hooks
**Story:** As Aaron, I want to write custom Curator detectors (e.g., "warn me when I'm about to auto-apply hints with <60% confidence") and actions (e.g., "suspend hint application and ask for explicit approval"), so that I can enforce domain-specific governance without forking the harness.
**Ambition:** Curator becomes **pluggable policy layer**. Instead of hardcoding "never auto-apply below 60%," I write a hook. Governance is code, not configuration. This enables third parties to build compliance layers on top of the harness.
**Chambers touched:** Curator (hook registry), Cairn (policy decision tracking).
**Architectural implication:** Curator must expose a **hook surface** (before-propose, after-proposal, before-apply, after-apply, on-revert) with standardized context-passing so custom handlers can intercept and transform decisions.

---

### Cross-PRD Coordination Pattern: Position-Paper-Before-Meeting (2026-05-27)

**Context:** Cassima (Eureka coordinator) proposed joint schema design across Crucible + Eureka covering `packages/cairn`, `packages/forge`, `packages/types`, with freeze-this-week timeline. Three architectural tensions surfaced:

1. **Scope mismatch.** Cairn's WAL forked per Aaron 2026-05-27T06:05Z directive — it's Crucible-internal, not shared. Including it in "shared schema" negotiation assumes a surface that doesn't exist.
2. **Coupling contradiction.** "Eureka v1.5 will consume Crucible's WAL as a learning source" contradicts Aaron's same-day standalone directive ("Eureka MUST function standalone… does not assume Crucible is present"). Direct SQL access to cairn tables couples Eureka to Crucible's storage schema. First L1 migration breaks Eureka silently.
3. **Premature freeze.** Neither Crucible L1 nor Eureka v1 have shipping code. Freezing schema before exercising it is spec-up-front trap (per Erasmus Phase 4.6 critique, line 86 above).

**Pattern applied:**

1. **Write position paper BEFORE meeting** (ADR-style: Context / Decision / Consequences / Alternatives). Covers:
   - Shared surface scope (what IS vs IS NOT negotiable).
   - Coupling model proposal (stable API + optional adapter, not raw SQL).
   - Versioning protocol (minimal freeze now, full freeze post-exercise).
   - Trade-offs explicitly named (premature freeze vs delayed coordination).
   - Alternatives considered and rejected with reasoning.

2. **Memo to counterparty** naming tensions directly, proposing narrow scope + deferred timeline, attaching position paper as pre-read. Collegial but firm — does not bury disagreements to preserve meeting harmony.

3. **Counter-propose meeting agenda** narrower than original. Minimal freeze this week (SessionId brand + DecisionRecord v1.0.0 only), defer everything else until both sides have working code (~2 weeks, post-Crucible-Sprint-2).

**Principles extracted:**

- **Scope first, then timeline.** If two teams disagree on what's shared, freezing it prematurely locks in the disagreement.
- **Position paper as pre-read** converts 30-min meeting from "discover disagreements live" to "negotiate solutions having read each other's constraints."
- **Optional-adapter pattern preserves standalone.** If Project A consumes Project B's events, adapter is A-owned, API is B-owned, coupling is compile-time (via typed API) not runtime (via SQL schema).
- **Minimal-freeze-first is anti-anchoring.** Freeze only what both sides have already exercised; defer speculative contracts until working code validates them.

**Reusable for:** Any cross-PRD / cross-team schema negotiation where coupling model is unclear or timeline is aggressive. Pattern prevents "agree in meeting, discover incompatibility during implementation."

**Outcome (pending):** Two artifacts in `.squad/decisions/inbox/`: `graham-types-position-paper.md` (ADR-style 15K chars) + `graham-cassima-reply.md` (memo 10K chars). Waiting on Cassima's response to narrow-scope counter-proposal.

---

**Learnings Appended:**
- Ambitious stories focus on *asymmetric capability* (what the harness enables that's harder for users alone) rather than incremental workflow improvements.
- Cross-session + provenance + self-improvement + extensibility are forcing functions for chamber decomposition; they validate the six-chamber model.
- Aspirational stories (US-G-6, US-G-7) push the architecture toward *temporal analytics* and *counterfactual reasoning* — these are new primitives not in v1 scope but should inform chamber interfaces.
- Extensibility (US-G-5) and custom governance (US-G-8) are load-bearing; if third parties can't write hooks and integrate, the harness stays personal toy. These stories should drive SDK design.

---

## Deliberation Round (2026-05-24)

**Author:** Graham (Lead / Architect)
**Inputs read:** Roger, Rosella, Gabriel, Valanice, Alexander, Laura, Erasmus histories; Aaron's post-Erasmus insights; locked vocabulary slate.

### Section 1 — Story Revisions

**US-G-1 Cross-Session Pattern Recognition — KEEP.** Still distinctive; Roger's US-R-1 overlaps on the mining side but my framing is *retrieval-for-decision*, not telemetry mining. Under the debugger lens, "find prior episode like this" is a sibling of bisect; lightly flagged as **debugger-adjacent**.

**US-G-2 Full Provenance Replay & Reasoning Audit — REVISE.** Now the canonical *agentic-debugger* story. New version: *"As Aaron, I can address any past Decision by content hash, replay the slice of Cairn that led to it (with captured Observations re-fed, not re-executed), step Decision-by-Decision, and ask 'why this branch?' answered from the same ledger."* Explicitly couples to Erasmus's US-E-1 (bisect) and US-E-7 (model-swap forensic replay). **★ Doubly compelling under debugger lens.**

**US-G-3 Genetic Skill Variant Evolution — MERGE-WITH Rosella US-Ro-5 (Alchemist Skill Evolution Loop) + Laura US-L-3 (fair heterogeneous fitness fusion).** Rosella owns the lifecycle, Laura owns the scoring; I withdraw my version and instead contribute the *fitness-policy ADR requirement* (multi-objective: Pareto vs scalarize is a policy call Aaron must make).

**US-G-4 Curator-Driven Hint Autonomy with Asymmetric Transparency — REVISE.** Erasmus's Approval+Notification Router subsumes the autonomy mechanism. New framing: *"the categorized-autonomy policy is the Router's config: `(category, confidence, user-pref) → {auto-apply, auto-notify, require-ack, suppress}`, persisted as Cairn primitives so policy changes are themselves auditable."* Still mine because the *asymmetric-transparency* invariant (every auto-action emits a Mirror-visible Decision) is an architectural commitment, not a Router internal.

**US-G-5 Extensibility as Load-Bearing — KEEP, REFRAME.** Under the 4-layer stack, "extensibility" = third-party `ProposalGenerator` implementations + third-party `Router` policy rules. Skills are one Generator family; MCP tools are leaves. The skill lifecycle contract I called for is now the **ProposalGenerator contract**: `{category, confidence, rationale, preview}`. Aligns Rosella's US-Ro-1/2/3 with one shape.

**US-G-6 Harness as Collaborative Research Partner — KEEP.** ★ **Doubly compelling under debugger lens** — hypothesis-from-history is bisect-on-Aaron's-own-behavior. Laura's US-L-5 (retrospective pattern mining) is the engine; my story is the *surfacing/experiment-loop policy*.

**US-G-7 Decision Reversion & Multi-Path Exploration — REVISE, PROMOTE.** Aaron's insight #1 promotes this from aspirational to v1 functional requirement. New version: *"Fork the Cairn ledger at any content-addressed Decision; sibling branches are first-class, queryable, comparable, mergeable; branch metadata is itself a Cairn primitive."* Subsumes/merges Erasmus US-E-2 (counterfactual), Roger US-R-3 (replay + variant), Valanice US-V-7 (evolve-as-sketch). ★ **Doubly compelling under debugger lens** — counterfactual is forking with seeded inputs.

**US-G-8 Custom Trigger Orchestration via Curator Hooks — WITHDRAW.** Dissolved by Erasmus's Router. The "custom hooks" surface I wanted *is* the Router's pluggable policy + the Generator interface. No standalone story needed.

**NEW STORIES (prompted by deliberation):**

- **US-G-NEW-1: Ledger snapshotting & compaction as v1 architecture.** Erasmus risk (c). *"Cairn supports periodic content-addressed snapshots + log-tail compaction; replay/bisect can resume from snapshot+tail without full-history scan."* Without this, every story above degrades at session #100. ★ debugger-critical.
- **US-G-NEW-2: Determinism contract — observation capture & hermetic replay.** Aaron insight #3 + Erasmus risk (a). *"Every external call (LLM, MCP tool, web, filesystem read) emits an Observation primitive carrying the exact request hash + response payload; replay re-feeds Observations rather than re-invoking; non-replayable calls are explicitly tagged."* Load-bearing for US-G-2, US-G-7, US-G-NEW-1. ★ debugger-critical.
- **US-G-NEW-3: Define the Crucible↔Copilot-CLI parent/child relation (tension #5).** *"Crucible is the parent process and message-loop owner; Copilot CLI is invoked as one model/skill provider among others (via the Provider Generator interface), not the host."* This is a story because nothing works downstream until it's decided.

### Section 2 — Position on Erasmus's 4-Layer Stack: **PARTIAL-ENDORSE**

**Endorse:**
1. **Conductor + Ledger merged.** Correct. Event-sourcing is the right shape; the artificial split between "who writes" and "where it's stored" was lifecycle masquerading as structure. The Crucible↔Cairn boundary I drew in Phase 4 was for *deployability*, not domain — Erasmus is right to collapse it conceptually even if we keep two npm packages.
2. **ProposalGenerator interface.** Strongly endorse. Forge, Curator's anomaly detectors, Alchemist variant winners, staleness, skill-recommenders all emit the same shape `{category, confidence, rationale, preview}`. This is the single most freeing insight in the critique — it dissolves *cascades* of bespoke wiring.
3. **Approval/Notification Router as single choke-point.** Strongly endorse. Dissolves Tension #2 cleanly; makes policy a first-class, audited surface.

**Partial / push back:**
4. **"Mirror is a view, not a component" — partially.** As a *data-flow* claim, yes: Mirror's content derives from the proposal queue + ledger tail. But Mirror is also a **trust-building UX surface**, and that is *not* free-falling out of a derived query. Erasmus's framing risks under-investing in the surface where Aaron actually decides whether to trust the harness. Insider concern Erasmus missed: **the act of reflection is itself a Decision-generator** (Aaron sees, Aaron approves/rejects, that decision goes back into the ledger). Mirror is a *bidirectional* surface, not a read-only view. Keep it as a named subsystem with a view-layer implementation.
5. **Derived Query Layer (Salsa-style).** Right shape, but Erasmus understates the cost. Incremental, demand-driven query systems are *real* engineering investment (invalidation correctness, cycle detection, cache memory). For v1, I'd accept "stateless cached projections with coarse-grained invalidation on ledger append" and explicitly defer Salsa-grade incrementality. Name it as **deferred architectural debt**, not a free win.
6. **Risk Erasmus underweights (insider view):** **The ProposalGenerator interface must be transactional with the Router.** If a Generator proposes and the Router auto-applies, but the proposal was computed from a stale ledger snapshot, we've laundered a race condition into an auto-approval. The Router needs a *ledger-position fence* on every accepted proposal (`accepted-at-ledger-tip = H; reject if current-tip ≠ H or rebase`).

### Section 3 — Positions on the 5 Tensions

1. **Solo-v1 vs federation.** Defer federation; keep ProposalGenerator and Router interfaces *tenant-parameterized from day 1* (a hidden `tenant=local` argument everywhere) so federation is later a config story, not a rewrite. Withdraw my heavyweight multi-tenant stories from v1 scope.
2. **Curator never approves.** **Dissolved** by the Router. Curator becomes a `ProposalGenerator` family with zero policy. Update charter language accordingly.
3. **Mirror scope creep.** **Partially dissolved.** Mirror's *data* is a view; Mirror's *role* as the reflection/trust surface still needs UX investment. Keep as named subsystem; implementation is a view + interaction layer.
4. **Heavyweight ops stories vs solo user.** Withdraw cred-attestation and multi-tenant compliance stories from v1. Keep US-G-NEW-2 (determinism) and US-G-NEW-1 (compaction) — those aren't ops fluff, they're load-bearing for the debugger.
5. **Crucible↔Copilot-CLI inversion.** **Unresolved and blocking.** My position (per US-G-NEW-3): **Crucible is parent.** Copilot CLI is a Provider (one of many). Reason: if Copilot CLI owns the loop, Cairn can't be authoritative — we lose determinism, branching, and replay (every story above). This needs an explicit Aaron decision before any Phase-5 design.

**New tension I surface:** **Determinism vs LLM non-determinism.** Honest replay = "re-feed captured Observations," not "re-execute the LLM call." This means *replay reproduces the historical decision chain*, but does not *prove* the LLM would still answer the same way today. Users (Aaron, anyone auditing) must understand this distinction or "100% fidelity replay" will be misread as "the harness is deterministic," which it is not. Needs explicit doctrine + UX wording.

### Section 4 — Cross-References

- **Erasmus US-E-1 (Ledger Bisect) + US-E-2 (Counterfactual Projection)** strengthen my **US-G-2** and **US-G-7** to the point of partial subsumption; I'm reframing G-2 and G-7 around bisect/counterfactual primitives rather than abstract "replay."
- **Roger US-R-3 (Cairn Replay & Variant Branching)** overlaps my **US-G-7** directly; merge — Roger owns serialization + deterministic-replay semantics, I own the branching-as-primitive surface.
- **Laura US-L-8 (Mirror auditable reasoning + sandbox edit)** is the strongest existing concretization of my **US-G-6**; her "edit reasoning in a sandbox" closes the loop my story only opens. Pair these in the spec.
- **Alexander US-A-3 (Replay + transform with model swap)** gives **US-G-2 / US-G-NEW-2** a concrete API shape (`replayTurn(turnId, config)`) and is the canonical entry point for the determinism contract.
- **Gabriel US-5 (branch-at-decision counterfactual exploration)** independently arrived at **US-G-7** from the recovery/observability lens — converging evidence that branching is v1, not aspirational. Validates Aaron insight #1.
- **Rosella US-Ro-5 (Alchemist Skill Evolution Loop)** plus **Laura US-L-3 (heterogeneous fitness fusion)** together cover what my **US-G-3** described; I withdraw G-3 and contribute only the multi-objective-policy ADR requirement.
- **Valanice US-V-7 ("evolving a sketch, not branching")** is the UX layer of my **US-G-7** — note the *naming tension*: Valanice resists "branching" as a UX metaphor even while endorsing the capability. Worth resolving in the Mirror UX spec.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## Round 4 — Phase B Reconciliation against `stunning-adventure` (2026-05-24T23:30Z)

Inbox file: `.squad/decisions/inbox/graham-reconciliation-2026-05-24T2330Z.md`.

**Executive summary:** Read the full Cairn+Forge+skillsmith-runtime+runtime-cli stack against my 10 story scopes (US-G-1..8 + US-G-NEW-1..3, with US-G-3 and US-G-8 withdrawn in deliberation). Honest tally: 0 ALREADY-EXISTS, 4 PARTIALLY-EXISTS (US-G-1 Curator/Insights as a proto-pattern surface; US-G-4 autoApplyEligible+Applier as a proto-Router; US-G-5 ChangeVectorProvider port pattern + skill lifecycle but CONTRADICTS-EXISTING on closed `OptimizationHint.source` enum; US-G-NEW-3 ForgeClient/SDK layering already matches the parent/child position), 5 NET-NEW (US-G-2 replay, US-G-6 research-partner, US-G-7 branching, US-G-NEW-1 snapshotting, US-G-NEW-2 observation capture), 1 CONTRADICTS-EXISTING (US-G-5). Crucible's 5-layer chassis is architecturally greenfield — the existing repo gives us production-tested *patterns* (canonical-JSON+SHA-256 hashing in DBOM, fail-open hook doctrine, HookComposer observer model, injection-port pattern via `@akubly/types`, async Curator with cursor polling, SQLite WAL + migration discipline, Forge-wraps-SDK layering) and a v0 L3/L4 we can borrow shape from, but the per-row content-addressed ledger, group-commit WAL with pre-commit hook bus, Salsa-style L2, open ProposalGenerator contract, named Router chokepoint, branching/snapshotting, hermetic-replay observation capture, and the entire L5 investigation surface are net-new. Key drift to NOT inherit: post-hoc-only hash chains (DBOM-style), closed source enums, policy scattered across three layers, mutation-and-decision fused in Applier, and the flat `event_log` row shape with JSON-buried parent links. Single decision flagged for Aaron: do we *port* Cairn/Forge into the Crucible chassis or *coexist* (long-term maintenance tax — I lean port).


### Cluster I — Architect-Routed v1 PRD Micros (2026-05-25)

**Inbox:** `.squad/decisions/inbox/graham-cluster-i-2026-05-25.md`

Resolved 10 design-tilted micros Cassima routed to me (not Aaron) after 8 Aaron-facing clusters locked. 8 of 10 went T1 structural, 2 went T2 (archivist crash-detect; change_vectors generalization). Net T1 calendar delta: ~2 eng-days, all absorbable inside existing sprint scope. 2 items flagged for Aaron confirmation (I.3 PRD §3 non-goal language; I.7 sanity check with Sonny).

**Learnings:**

- **The "cheap seam now, expensive refactor later" pattern reappears constantly.** I.10 (WASM ABI seam), I.4 (Provider seam), I.5 (manifest in canonical types), G.2 (tenant_id), B (spawn seam reserved), Aaron 2a (parent_session_id columns) — same shape every time: ~1 eng-day to lock an interface boundary today saves multi-sprint reshape when the second implementation arrives. The discipline isn't recognizing the case-by-case need; it's *defaulting to the seam* unless cost asymmetry inverts (I.7 declined the seam because per-row WAL columns cost throughput on every hot path, not just a one-time interface).

- **Boundary discipline at the type layer is cheaper than at the process layer.** I.1 (Router inline, not co-process) showed this: enforcing "Router doesn't share mutable state with WAL writer" via dep-cruiser + typed entrypoint gives 90% of the isolation benefit at 5% of the latency cost. Process boundaries are appropriate when the *failure modes* are asymmetric (one side crashing must not take the other down); type boundaries are appropriate when the goal is *correctness coupling* (the two pieces logically must agree on data shape but otherwise are independent). Both Crucible and Aaron's instincts favor type-layer first; process-layer when forced by survivability evidence from real incidents.

- **Locked decisions cluster-resolve faster than I expected.** Several Cluster I questions had answers already implicit in earlier locks (I.4 = l0-provider/ from Open #1; I.6 = source_event_offset from Round 6 #7; I.5 = @akubly/types precedent from Wave 3). The cluster work is mostly *naming what's already true and writing it down* — the architecture has converged, the documentation is catching up. When this happens, the right output is "confirm + cite + cost-flag," not "redesign."
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


- **"Structural — no tier" is a useful tier label.** Several I-items are not capability deliverables (they don't ship a user-visible feature); they're interface shapes that other tiers' deliverables ride on. Calling them "T1 structural" rather than smuggling them into the T1 capability list keeps the calendar honest and lets sizing happen at the right granularity.

- **The anti-anchoring rule paid off on I.3.** First-thought was "archivist crash-detect is a safety issue, T1." Alternative considered: under D′.1.a's locked pause-before-fsync, the failure mode is "Aaron re-issues the operation," not silent corruption. That reclassification moved the answer from T1 to T2 cleanly. If I hadn't paused to enumerate the actual blast radius, ~3-5 eng-days would have stolen budget from Gabriel's NEW-15 fuzz regime, which catches the *class* of safety bugs the crash-detect heuristic only catches one symptom of.

- **Cassima's batching paid for itself.** Routing 10 micros to me as a single cluster (rather than 10 separate Aaron pings) saved an enormous serialization cost — half the decisions cross-reference each other (I.4 + I.5 share the canonical-types principle; I.1 + I.2 share Roger's commit-driver work; I.7 references I.6 indirectly through join-key semantics). Resolving them in one pass let me check coherence inside the batch instead of over a week of sequential exchanges.


### CTD Phase 1 Lane 6 — §1 as canonical introduction (2026-05-28 Phase 1)

- **§1-as-canonical-introduction pattern.** When a top-level overview section is authored *before* its dependent sections land (as here — §1 parallel with the rest of Phase 1), the right move is to write it declaratively against *locked decisions* only, never against speculation about what the parallel lanes will produce. The §1 file references §2 and §6 inline ("see §6 for the envelope") rather than restating them, and explicitly defers the cross-section interface-coherence pass to a *separate* Phase 1 synthesis review. This keeps §1 stable: if Phase 2 reshuffles a sub-section, §1 doesn't need re-authoring; only the synthesis review does. Generalizable: any "intro" section in a multi-phase doc should be authored from locks, not from peers.
- **Chamber ↔ layer notation: █ primary / ▒ participates / italic-product-name for "lives outside the runtime."** The chamber-to-layer table has three distinct truth-claims to make about each chamber: (1) which layer is its *home*, (2) which layers it *touches* via contract, (3) whether it's *inside* Crucible or an *independent product that coexists*. One symbol per claim, with a one-line legend at the table head. Crucially: listing Cairn and Forge in the chamber table at all (with empty layer cells) is a *deliberate non-membership pin* — future readers who arrive expecting "the 6 chambers map to the 5 layers somehow" need to see Cairn/Forge with no layer membership to learn that the answer is "they don't, they're separate products." Omitting them would invite the wrong inference.
- **Package-decomposition naming conventions for @akubly/crucible-*.** Three rules: (a) one package per layer with token names matching the layer noun (l0-provider, l1-wal, derived-query, generators, outer, pplier, perture); (b) the L0/L1 *boundary contract* gets its own package (crucible-boundary) so both L0 and L1 can import it without creating a layer-to-layer dependency — the boundary is a *third party* to the two layers it joins; (c) the composition root (crucible-runtime) is the *only* package permitted to import from every other Crucible package, enforced by dependency-cruiser. This third rule is what keeps layer ordering enforceable: without a single permitted "everywhere-importer," the temptation is to let any package import any other "just for wiring," and the layer discipline rots.
- **Cross-product packages stay outside the scope.** @akubly/types (shared), @akubly/cairn, @akubly/forge, @akubly/skillsmith-runtime are not in the Crucible namespace and the CTD's §1 explicitly does not enumerate them — they belong to §15 (Coexistence). Conflating the namespaces in §1 would suggest delegation; keeping them out of the table is itself a design statement.

### CTD Phase 1 Synthesis — The "12 Coherence Checks" Methodology (2026-05-28)

After 10 parallel author lanes landed Phase 0+1 CTD sections (~168 KB), ran the
gate review as a structured 12-check matrix per the CTD plan rev. 3 Appendix C
"Phase 1 Synthesis" spec. Verdict: YELLOW — 6 CLEAN, 4 MINOR, 2 STRUCTURAL,
1 APPLIED. Phase 2 spawns; two structural findings routed to Valanice (§9)
and Roger (§10) as natural Phase 2 work. Inbox: `.squad/decisions/inbox/
graham-ctd-p1-synthesis.md`; full review at
`docs/crucible-technical-design/00-phase1-synthesis-review.md`.

**The 12-check matrix as a reusable synthesis pattern.** For any multi-author
parallel CTD/architecture phase where N sections land independently against
shared Phase 0 type contracts, the gate review decomposes coherence into three
classes of row, every one of which is auditable in a single table:

1. **Adjacent-section pairs along the data-flow spine** — one row per `§n ↔
   §n±1` seam. Reading top-to-bottom of the stack catches name-mismatch,
   schema drift, and missing-method-on-contract findings (Findings 5, 6b, 12b
   here were all this class).
2. **Cross-cutting concerns** — one row each for the orientation section (§1)
   reading against the layer-specific sections; one row for vocabulary
   consistency across the whole corpus (Finding 2a Timestamp ms-vs-ns and
   Finding 11 dependentPaths semantic split surfaced here).
3. **Author-flagged coordination notes carried forward from the decision
   drops** — the authors are the first reviewers; reading their own "newly
   surfaced ambiguity" and "coherence touchpoint" sections turns them into
   pre-identified findings. Alexander's two notes (12a/12b) and Laura's note
   on body-shape pinning (Finding 9) all came in this way.

The right verdict color is **YELLOW** when nothing blocks but coordination
work is required — calling it GREEN understates the Phase 2 hot items;
calling it RED triggers unnecessary lane rework. Reserve RED for "a Phase 1
section must be revised before Phase 2 spawns."

**Ownership routing under reviewer-rejection lockout.** When two authored
sections disagree on a contract (Finding 6b — Gabriel's §5.3 said
`subKind:'external_input'`, Alexander's §8.2 said
`structural_proposal_*`), the lockout rule says the original author cannot
revise on rejection. But these weren't rejections — both authors *flagged the
coordination explicitly* in their decision drops. The correct routing in
that case is to **the natural downstream consumer** (Valanice as the §9
author who owns the queue projection) rather than to either flagging author
or to Graham as default. The downstream consumer is the one who has to pick
one shape anyway when authoring; folding the cross-section amendment into
that work is cheaper than handing it off. Graham executes only as fallback
if the downstream author defers.

**Additive vocabulary fixes apply inline; structural fixes route.** The §6.5
evolution rule explicitly admits additive sub-kind enum values within a major
version, so adding four `structural_proposal_*` Observation sub-kinds to
§6.3 was a one-edit inline patch, not a routed finding. The rule of thumb:
if a fix is purely additive and provably forward-compatible under the doc's
own evolution rules, apply it during the review and document it under
"Applied vocabulary fixes." Anything that changes a function signature
(`appendFenced`), redefines a type's range (`Timestamp` ns-vs-ms), or
requires two sections to pick one shape (`dependentPaths`) gets routed
with an explicit owner and an explicit Phase. Don't smuggle structural
changes into "vocabulary fixes."

**The 12-check matrix is reusable for the Phase 2 synthesis gate.** Same
template: pairs along the spine (§9 ↔ §5, §10 ↔ §3, §15 ↔ §3, §13 ↔ §12),
cross-cutting (§1 reread, vocabulary), carry-forward (Phase 2 author drop
coordination notes). Maintain the table as living state across phases — each
gate review starts by re-running last gate's MINOR findings to confirm Phase
2 authors absorbed them, then runs the new matrix on Phase 2 outputs.


---

## CTD Phase 2 — §14 + Finding 10 Self-Fix (2026-05-28)

### Pattern: Layer Sub-Tier Disambiguation

When a section author self-labels their component at a layer ("§8 is L4")
but the §1 layer table lists that layer as owned by a different component
("L4 = Router"), the cheapest honest fix is **split the §1 row into named
sub-tiers** rather than (a) inventing a new layer number ("L4.5"), or (b)
asking the downstream author to relabel. Reasons:

1. The downstream author's self-label is usually correct at the tier
   level — they're at L4, not at L4.5. The disagreement is about
   *granularity*, not *level*. Inventing a new layer rewrites the mental
   model for every reader; sub-tier framing preserves it.
2. The §1 owner pays the edit cost (one row split + one short prose note)
   instead of forcing the downstream author into churn that would also
   require a §1 amendment anyway. Net edit cost is lower and centralized.
3. Sub-tier framing matches existing package decomposition when the two
   sub-tiers ship as separate packages that version together (here,
   `@akubly/crucible-router` + `@akubly/crucible-applier`). The doc
   structure tracks the code structure.
4. The §1.1 diagram doesn't need to change — it already shows Router and
   Applier as adjacent boxes; the sub-tier note just labels what readers
   were already seeing.

Apply this pattern whenever a layer table conflicts with a section's
self-label and the section is structurally correct. Reserve "invent a new
layer" for genuine architectural additions, not for table-row
disambiguation.

### Pattern: One-Page-Section Discipline

§14 is the shortest CTD section (≤1 page, prose-only). The temptation in a
≤1pp section is either to (a) restate locked context for completeness, or
(b) duplicate detail that lives in a referenced section (here §7.A,
Appendix 7-E, §15). Both inflate the page without adding signal. The
discipline that worked:

1. **Open with a "locked context" line** that names the locks by their
   one-line summary and forbids relitigation. This buys back half the
   page that would otherwise go to restating Aaron's lock, TDD-Q2, and
   the §7.A reference.
2. **Use a contract table as the load-bearing artifact.** SHARED vs
   PRIVATE in two columns is more information-dense than prose and is
   what downstream authors will actually grep for.
3. **One paragraph per acceptance criterion, no more.** §14 had three
   criteria → three paragraphs (table caption, adapter pattern, boundary
   statement) + a thin acceptance-signal closer. Anything longer
   indicates the section is doing work that belongs in its hard-dependency
   section.
4. **Cross-refs over restatement.** §14 references §7.A by id, Appendix
   7-E by id, §15 by id — never re-explains. Readers who need detail
   follow the link; readers who don't get a one-page orientation.

Calibration check: if a ≤1pp section runs longer than ~90 lines of
markdown (≈one printed page including the contract table), assume it's
absorbed work from a hard-dependency section and trim.

### Carry-forward to Phase 3

- Finding 10 was the only self-owned synthesis-review finding for §1;
  closed. No carry-forward to Phase 3 ADR pass on this item.
- §14 is FINAL; downstream consumers are §15 (Roger — `@akubly/types`
  evolution names `SessionId` + `DecisionRecord` with `schemaVersion`)
  and the v1.5 adapter implementation (Rosella + Graham). No Phase 2
  blocker created.
- Sub-tier disambiguation pattern is a candidate technique for the Phase
  2 synthesis gate if any §9 / §10 / §13 / §15 / §16 author self-labels
  in a way that conflicts with §1.2 again. Re-run the same fix shape.


---

## 2026-05-28 — CTD Phase 2 Synthesis Gate (GREEN verdict)

**Context.** Phase 2 delivered six new sections (§9 Aperture, §10 Session
Branching, §13 CLI Shell, §14 Eureka Integration Surface, §15 Coexistence
& Shared Types, §16 Test Strategy & Invariants) and re-touched five
Phase 1 sections (§1, §3, §5, §6, §7) for errata. Synthesis ran 10
coherence checks per Appendix C "Phase 2 Synthesis" gate plus a dedicated
erratum-verification pass. Verdict: **GREEN**; Phase 3 (§17 / §18 / §19)
spawns unblocked.

**Findings counts.** CLEAN 10 · MINOR 0 · STRUCTURAL 0 · Phase 1 errata
verified APPLIED 7 / 7. Both Phase 2 sync pairs CLOSED (Gabriel↔Valanice
R2-3 via §9.5 + §5.3 patch + §6.3 sub-kind family; Rosella↔Roger R2-6
via §15.5.1 surface + §10.5 verbatim-copy + §15.7 status row). Zero new
open question for Aaron.

### Learnings

- **Erratum-verification-after-phase pattern.** The first work product of
  the Phase 2 synthesis was an erratum-verification table that walks
  each Phase 1 §0.1 finding to its landing site in the current phase's
  output, and confirms type / shape / sub-kind / vocabulary consistency
  across every named consumer. This is what turns YELLOW into GREEN
  cheaply — without it, the only way to convince myself nothing
  regressed against the re-touched Phase 1 sections would have been to
  re-run the 12-check matrix. The verification table is one row per
  routed finding, with the landing file + landing site noted; running
  time was dominated by grep-locating the finding's anchor strings
  (TimestampNs, manifestRoot, appendFenced, structural_proposal_*,
  EventId[], "L4 — Applier") across the touched files. Recommend
  adopting as a standard pattern for any subsequent synthesis gate
  where the prior gate's verdict was not GREEN.
- **Routing-worked validation.** GREEN at the Phase 2 gate is the
  observable that says Phase 1 routing under the reviewer-rejection
  lockout worked. Every finding I named in Phase 1 §0.3 with a specific
  owner (Roger 2a/2b/12b/5/9; Valanice 6b; Graham 10) landed in the
  file that synthesis routed it to, with no carry-forward debt and no
  re-litigation. The lockout rule plus explicit-owner-named routing is
  a self-correcting pattern: when the next phase's authors deliver, the
  routing was correct.
- **Pure-projection-as-handshake-closer.** Finding 6b (the §5↔§8
  Aperture-written sub-kind disagreement) closed cleanly because
  Valanice's resolution was to make Aperture a pure L2 projection over
  L1 (§9.5 SQL view + LedgerProjector.onCommit-driven update). Pure
  projection collapses two contracts into one — the L1 row's sub-kind
  IS the queue entry's identity — and removes the boot-recovery and
  state-drift surfaces entirely. When two authors disagree on the shape
  of a row that one of them writes and the other reads, re-framing the
  reader side as a pure projection over the writer's primitive often
  closes the disagreement without changing either author's published
  surface (here: Aperture writes _acked/_rejected/_expired sub-kind
  rows the §6.3 enum already endorsed; Router reads them via the §3
  sub-kind index it already committed to). Catalogue under "synthesis
  resolution shapes."
- **One-paragraph CLOSED in sync-pair status table.** §15.7 carries
  one row per sync pair with a one-line "CLOSED — <reason>" entry. This
  is a much cheaper way to record handshake completion than a separate
  decision drop per pair; the table doubles as a Phase 3 readiness
  signal because the Phase 3 synthesis can read §15.7 and skip the
  re-verification of any pair marked CLOSED there. Recommend Phase 3
  authors extend §15.7 in place rather than authoring a parallel
  status surface.
- **GREEN is rarer than YELLOW and worth defending.** The Phase 1
  synthesis was YELLOW because two structural findings (6b, 12b) needed
  named authors to make additive changes during Phase 2. Phase 2
  synthesis is GREEN because those changes landed and no new structural
  finding was introduced. The temptation to grade Phase 2 as YELLOW
  "just in case Phase 3 surfaces something" would understate how clean
  the Phase 2 deliverables actually are; YELLOW means coordination is
  required, and there is no coordination required for §17 / §18 / §19
  fan-out. Calling it GREEN is honest.



## CTD Phase 3 — §19 ADR Set Index (FINAL)

Authored `docs/crucible-technical-design/19-adr-set.md` — 17 ADR index covering ADR-0002…ADR-0018 per plan rev. 3.

### Learnings

- **ADR-distillation pattern (one-line decision statement per ADR).** The
  CTD body argues the decision; the ADR index row distills it to a single
  imperative sentence that fits one table cell and can be read aloud
  without context. The discipline forced by ≤1pp is: if the decision
  can't be stated in one line, it isn't actually one decision — split or
  rescope it. Across the 17 rows, every line follows the shape
  `<subject> <verb-imperative> <object> <qualifier>`
  (e.g. "Replay re-feeds recorded events into the same code paths; it
  never re-executes model calls, tools, or wall-clock side effects.")
  with parenthetical `(R2-N)` / `(QN)` tags so the reader can
  cross-walk to the decisions-inbox source. The one-line statement is
  later copy-pasted verbatim into the ADR file's Decision section so
  the index and the artifact stay coupled — no paraphrase drift.
- **Status convention for CTD-locked / file-pending ADRs.** Used
  `Accepted (CTD-locked) — pending authoring` rather than `Proposed`.
  `Proposed` would understate Aaron's CTD acceptance; plain
  `Accepted` would overstate the existence of the durable ADR file.
  The hybrid string makes both facts explicit in the cell and flips
  cleanly to `Accepted — <date> by Aaron` at file landing without
  rewriting the rationale anywhere.
- **Index is not body.** Resisted the temptation to seed Context /
  Consequences in the index. Single index table + lifecycle rules
  stayed inside the 1pp budget; ADR bodies are owner work, post-CTD.
  The lifecycle rules (§19.3) are the load-bearing part for whoever
  authors the ADR files later — they enforce one-ADR-per-file,
  section-owner=author, and verbatim copy of the index decision line.


## CTD Phase 4 — UIS Framing Amendments (§1, §6, §19 FINAL)

Authored surgical amendments to docs/crucible-technical-design/01-architectural-overview.md,  6-primitive-taxonomy.md, 19-adr-set.md after the 8/8 STRENGTHENS UIS weigh-in with rubber-duck precision reframing. Identity claim moved to "minimal typed trace algebra for replayable, accountable agentic computation"; hardware analogies demoted to documented mental scaffolding (§1.6, §6.7); L3.5 Scheduler tier inserted into §1.1 stack with responsibility-table row; §6 carries a new sub-kind governance principle naming semantic-bucket-inflation as the risk; §19 gained ADR-0019 (Graham, framing) and ADR-0024 (Gabriel, Scheduler tier) index rows. Decision drop at `.squad/decisions/inbox/graham-ctd-phase4-framing.md`.

### Learnings

- **Framing-amendment-after-team-weigh-in pattern.** The 8/8 STRENGTHENS with rubber-duck's precision reframing is the cleanest Decision-Point gate exemplar in the project so far. Pattern: (i) author surfaces a load-bearing identity claim with a directional thesis (Aaron's "universal instruction set"); (ii) every agent weighs in along their own discipline's lens with named verdict + concrete missing-concept candidates; (iii) a designated critic (rubber-duck) issues a sharpened reframing rather than an up/down vote; (iv) the lead pre-commits to convergence criteria (3+ agent threshold for missing concepts) BEFORE seeing the responses, so adoption isn't anchored on the lead's own draft; (v) Aaron locks the reframing + the convergent additions in one atomic decision, then the lead runs the framing-amendment pass surgically across the affected sections. The cost of running this pattern was one Phase 4 spawn; the value was rejecting an overreach claim ("universal ISA of agentic computation") that would have invited falsification by every future agent architecture, while preserving the load-bearing structural insight (typed trace algebra; ring-protected primitive emission; sub-kind discipline). The pattern is reusable for any future framing-level decision where the lead has prior art the team needs to either ratify or refine.

- **Pre-commitment to convergence criteria neutralizes author anchoring.** Graham's UIS weigh-in pre-committed to a 3+ agent missing-concept threshold and to a five-dimensional synthesis framework BEFORE reading any other agent's drop. When CALL/RET hit 3 votes (Laura + Roger + rubber-duck) and Scheduler tier hit 2 (Erasmus + rubber-duck), the lead-as-architect bias to defend the existing §1/§6/§19 surfaces was structurally disarmed: the convergence criteria forced adoption of both. Without that pre-commitment, the author of §1/§6/§19 would have had standing to argue "the existing taxonomy already covers it" against each missing concept individually. Pre-commitment turned the synthesis call into arithmetic, not negotiation. Apply this on any future cross-section synthesis where the synthesizer also authored input sections.

- **Surgical amendment discipline under depth budgets.** §1 was ≤3pp and §6 was ≤1pp from Phase 0; the amendment had to land identity-claim, L3.5 stack inset, L3.5 responsibility row, mental-models subsection (×2), governance principle, and ADR cross-refs without breaking either ceiling. The technique that worked: (i) reuse existing structural slots (extend the §1 lead paragraph rather than authoring a new §1.0; extend §6 intro rather than authoring a new §6.0); (ii) put new diagrams as **insets** under existing sections rather than redrawing the canonical §1.1 ASCII stack (the ASCII is already crowded; an inset that says "the canonical sub-pipeline is L3 → L3.5 → L4" carries the same information at a fraction of the rework cost and avoids touching every downstream cross-ref to the §1.1 figure); (iii) consolidate the mental-scaffolding stance into a *single* §1.6 + §6.7 pair that everything else can cross-ref, instead of sprinkling "this is just an analogy" caveats throughout §1 and §6. The lesson: when a framing amendment threatens a depth budget, look for one canonical home for the new framing and turn everything else into a cross-ref.

- **Sub-kind discipline as the named risk-mitigation.** The rubber-duck explicitly flagged "semantic bucket inflation" as the failure mode of the 5-primitive surface — the nouns survive while invariants leak into ad-hoc payload metadata. The amendment converts this from a free-floating critique into a load-bearing governance rule: new sub-kinds enter the enum only with (a) payload schema, (b) declared effects (read-set / write-set / external-interaction class), (c) causal-edge contract, (d) runtime semantics. A sub-kind that can't be specified along the four axes is not ready. This is the discipline that lets the 5-primitive lock hold under marketplace pressure (Rosella's concern), provider-meta pressure (Alexander's), human-annotation pressure (Valanice's), and TRAPC pressure (Gabriel's). Worth applying to future enum-extension decisions outside CTD as well.

- **One hardware analogy *did* earn architectural promotion; the rest didn't.** The L3.5 Scheduler tier is the single case where a hardware analogy (out-of-order execution / dispatch unit) motivated a real architectural change rather than just a vocabulary win. Everything else (Decision↔branch, Observation↔load, Question↔trap, Artifact↔store, Request↔args) stayed at the mental-scaffolding tier. This asymmetry is itself architecturally useful: it gives future framing-amendment passes a clean test — "does this analogy motivate a new structural commitment, or is it just a re-explanation?" If the former, run the ADR; if the latter, it lives in §1.6 / §6.7 as scaffolding and stops there. The CALL/RET case sits on the right side of that test: it motivates sub-kind field additions (invocation-id + return-link) under Roger's §3/§10 ownership, which is a real schema commitment, but it does NOT motivate a new tier or a sixth primitive — sub-kind discipline absorbs it.

- **The 8/8 STRENGTHENS is data, not validation.** All eight weigh-ins endorsed the framing; that is genuinely a strong signal. But the more interesting data was the *content* of the dissents-within-endorsement: Laura's "I tested the bus, not the CPU" caveat, Gabriel's TRAPC missing-primitive, Alexander's provider-meta gap, Rosella's privilege-ring observation, Valanice's "keep ISA jargon internal" UX constraint. Adopting the reframing as load-bearing without those caveats would have produced a thinner amendment; the surgical edits land *with* them (the governance principle in §6 directly addresses sub-kind-sprawl worries; §6.7's "analogy table, not opcode semantics" addresses Valanice's user-facing-jargon risk; the L3.5 inset addresses Erasmus + rubber-duck's dispatch concern). Unanimous endorsement is not a license to skip the dissent-within-endorsement signal; it is a license to land a *thicker* amendment because the team is aligned on direction.

📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.

## L3.5 Phase 0.5 FifoScheduler Stub — Staged Implementation (2026-05-30)

**Context:** Pass A triage included an item queued for Graham: the L3.5 Scheduler Phase 0.5 FifoScheduler stub. Aaron ruled **"Yes — staged FifoScheduler stub in Phase 0.5 is fine"** on 2026-05-30.

**Status:** Partially complete when session started. §5.A already documented the PA-FifoScheduler staging approach (lines 288-295) and §16.3 already had the SchedulerDispatcher row with ADR-0024 reference. Missing: explicit FifoScheduler item in the Phase 0.5 skeleton scope + graduation acceptance signals.

**Execution:**
1. ✅ Added FifoScheduler stub as item #6 in Phase 0.5 skeleton scope (`docs/crucible-technical-design-plan.md` lines 649-658)
2. ✅ Updated Phase 0.5 gate rule from "5 skeleton checks" to "6 skeleton checks" to include Scheduler tier boundary
3. ✅ Updated Phase 0.5 owner line to include Gabriel (FifoScheduler stub owner)
4. ✅ Enhanced §5.A.7 acceptance signals with explicit graduation criteria:
   - A-Sched-1: satisfied by FifoScheduler stub (Phase 0.5)
   - A-Sched-2 + A-Sched-3: graduation criteria for full WeightedRoundRobinScheduler (Phase 1)
5. ✅ Enhanced §16.3 SchedulerDispatcher row to note Phase 0.5 stub vs Phase 1 full impl
6. ✅ Updated `.squad/identity/now.md` — removed L3.5 item from "Likely escalations" list, added Aaron's ruling to "Key rulings" section

**Files touched:**
- `docs/crucible-technical-design-plan.md` — Phase 0.5 skeleton scope item #6, owner line
- `docs/crucible-technical-design/05-router-design.md` — §5.A.7 acceptance signals graduation criteria
- `docs/crucible-technical-design/16-test-strategy-invariants.md` — §16.3 SchedulerDispatcher row
- `.squad/identity/now.md` — escalation closed, ruling recorded

**Acceptance signal for FifoScheduler stub graduation:** The Phase 0.5 FifoScheduler stub graduates to full `WeightedRoundRobinScheduler` in Phase 1 when **A-Sched-2** (back-pressure asserts under load) and **A-Sched-3** (quanta exhaustion fires per generator per window) acceptance scenarios pass. The stub satisfies **A-Sched-1** (dispatch ordering preserved across replay), which is the Phase 0.5 gate criterion.

**Learnings:**
- Staged implementation questions benefit from explicit acceptance signals that define **what the stub must prove** (A-Sched-1 for FifoScheduler) vs **what gates graduation** (A-Sched-2/A-Sched-3 for full scheduler).
- Phase 0.5 walking skeleton is a **tier-boundary validation gate**, not a full-feature gate — the FifoScheduler stub proves the L3.5 tier exists without requiring the complexity of fair dispatch, back-pressure, or quanta budgeting.
- Cross-referencing ADR-0024 (even before the body exists) establishes the architectural rationale anchor — the decision that the L3.5 tier should exist is Aaron-ruled and locked; the body will explain why.
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

