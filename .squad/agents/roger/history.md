📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §3 (L1 WAL Substrate) + §4 (Hook Bus) FINAL. Phase 1 synthesis review: YELLOW verdict, 13 findings routed. Your Phase 2 errata: finding 2a (Timestamp shape drift: split `Timestamp` vs `TimestampNs`), 2b (add `manifestRoot` flag), 12b (add `appendFenced` wrapper). Cross-section dependencies: Laura (§11.2 body shape pinning), Alexander (§12 offset-0 materialization), Rosella (R2-6 lockfile/snapshot handshake). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) `BootstrapPayload` shape (literal+manifest, R2-2); (2) `commitmentMethod: 'declared' | 'fallback'` tag on Decision rows (R2-1); (3) transitive-dep snapshot field at fork (R2-6); (4) coordinate with Rosella on lockfile format. Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Roger — History

## 2026-05-26: Eureka ↔ Crucible Data Layer Overlap Analysis

**Context:** Aaron preparing simultaneous Eureka + Crucible implementation in this repo (`D:\git\harness`). Task was to map data-layer overlaps between Eureka's PRD (from sibling `D:\git\mem` repo) and Crucible's L1 substrate (A.3 hybrid append-log, per-row content-addressed WAL, group-commit).

**Verdict: FORK storage entirely.** Eureka and Crucible are architectural siblings with non-overlapping persistence needs. Full analysis written to `.squad/decisions/inbox/roger-eureka-crucible-data-overlap.md`.

**Eureka's data shape (from PRD v5-final):**
- Three independent SQLite DBs (via `better-sqlite3`): `~/.copilot/eureka/agent.db` (v1), `~/.copilot/eureka/user.db` (v1.5+), `<repo>/.eureka/project.db` (v1.5+). Only agent-tier fully wired in v1.
- Schema per-tier: `facts` table (CRUD, not append-only) with FTS5 for BM25 lexical recall, `relations` table (graph edges), `bridge_ledger` (append-only cross-system reconciliation log). No FKs to Cairn/Forge; **no cross-DB ATTACH at runtime** (FR-7.2).
- Write pattern: fact CRUD + FTS5 triggers + sweep-driven Tier 2 edge population. No group-commit, no per-row pre-fsync hooks.
- Query pattern: BM25 recall (keyword-scoped), composite ranker (0.5·relevance + 0.2·importance + 0.2·trust + 0.1·recency) × attention multiplier, trust floor exclusion (< 0.15), sequential fan-out (agent → user → project), edge traversal via `relations`.
- Lifecycle: SQLite WAL mode, opportunistic sweep (end-of-session, first-query-of-day), no content-addressed row hashing. Session identity shared with Cairn via `SessionId` brand from `@akubly/types` (type-level construct, no runtime FK — Eureka PRD §FR-13 v5-final R8).

**Share-vs-fork recommendations (8 substrate concerns evaluated):**
- **Event log / WAL:** FORK — Eureka's CRUD + FTS5 vs Crucible's append-only + group-commit are incompatible write patterns. Forcing convergence would mean Eureka pays append-only cost for no gain, or Crucible compromises replay determinism.
- **Session model:** FORK tables, SHARE identifier only — both use `SessionId` brand from `@akubly/types`; no runtime FK. Cairn owns lifecycle (`sessions` table), Eureka owns epistemology (`kind='session'` facts). Offline correlation only.
- **Config / KV / Graph / FTS / Snapshot:** FORK on all — no semantic overlap. Eureka's graph is epistemological (facts linked by `derived_from`, `contradicts` edges); Crucible's read-set is causal (event A read output of event B). DBOM Merkle chain (audit tamper-detection) vs Eureka facts (trust-weighted retrieval) serve different purposes.
- **Migrations:** FORK numbering — Crucible v100+ OR prefixed naming (`crucible-001-*.ts`) OR separate DB file (`~/.cairn/crucible.db` instead of sharing `~/.cairn/knowledge.db`). Recommendation: **separate DB file** for clean migration independence and backup story.

**Schema / path / port collisions: NONE.** Separate DB files (Cairn `~/.cairn/knowledge.db`, Eureka `~/.copilot/eureka/*.db`, Crucible TBD). Only shared construct is `SessionId` brand (type-level, no runtime coupling). No HTTP/IPC surfaces in v1 (Eureka library-only, Crucible is substrate layer, Cairn CLI-only). CLI namespaces distinct (`eureka` vs `cairn` vs hypothetical `crucible`).

**One load-bearing question for Aaron:** Does Crucible's L1 WAL (v14 `wal_records` table + v15-v18 tables) live in the same `~/.cairn/knowledge.db` as Cairn, or fork to `~/.cairn/crucible.db`? Trade-offs documented in analysis §6 OQ #1. My recommendation: **fork to `~/.cairn/crucible.db`** — independent migration numbering, preserves A.3 hybrid design freedom (custom append-only WAL file in pure TS for L1, keep `better-sqlite3` for other tables), avoids same-DB migration collision risk.

**Additional open questions for Aaron:**
- OQ #2: Does Crucible v1 still follow A.3 hybrid (my Round 5 spike recommendation), or has design shifted to full-SQLite transaction-batched semantics?
- OQ #3: Does Crucible L1 WAL rows carry `session_id` column? If yes, should import shared `SessionId` brand from `@akubly/types` to match Cairn + Eureka (type-level only, no runtime FK).

**Backup story:** Three stateful directories once both ship: `~/.cairn/` (Cairn + possibly Crucible), `~/.copilot/eureka/` (Eureka agent/user DBs), `<repo>/.eureka/` (Eureka project DB v1.5+). Operator guidance: back up all three for full state recovery. No cross-DB runtime dependencies; correlation is offline-only via `eureka reconcile` CLI (reads Cairn DB read-only) and (future) `crucible reconcile`.

**Anti-anchoring check honored:** Considered the "share event log" alternative seriously (Eureka could project facts into an append-only log, Crucible could index facts for keyword recall) and rejected on the evidence that the two write patterns (CRUD+FTS5 vs append-only+group-commit) and query patterns (BM25 recall vs seq-ordered replay) do not align. Sharing would force premature convergence on a primitive that neither system needs in its pure form.

## 2026-05-25 Round 7: v1-tier triage of all Roger-authored stories

Triaged every user story I authored across the deliberation against Aaron's locked v1 framing ("Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible"). Written to `decisions/inbox/roger-triage-2026-05-25T0200Z.md`. Headline cut: **8 substrate items go T1, 1 story (R-4) is enabled-for-free, everything else falls to T2–T5 or splits.**

T1 set: WAL with read-set hash + hook bus (Round 3 locked), `withShadowEvent` discipline + replay invariant (Open #4), CBOR-dcbor + BLAKE3 (Open #5), CAS + observation capture (Ro-NEW-2 — gates hermetic replay, this is the keystone), minimum-viable snapshot (Ro-NEW-1 T1 slice), branch/ref metadata schema (Ro-NEW-3 T1 slice), replay harness + linear `cairn fork --at` (R-3 T1 slice), drift ProposalGenerator (R-4, free). Plus `tenant_id` cheap-insurance migration (R-6 enabling) — hours now, weeks later.

Splits: **R-3** (replay+linear-fork T1, graph ops T3), **Ro-NEW-1** (min-viable snapshot T1, cadence/compaction T5), **Ro-NEW-3** (schema T1, fsck/GC T5). Cuts to T4/T5: R-1 (pattern mining graph-walks), R-2 (GitHub plugin), R-6 (federation), R-7 (code review plugin), R-8 (export productionization), R-9 (templates, gated on R-3), Ro-NEW-4 (quotas — dedup floor is already free). R-5 to T2 (one-hop provenance already exists; transitive walk is investigation-depth, not bootstrap).

Storage-criticality rule I'm enforcing: anything that touches WAL row layout, L1→L2 projection contract, or the determinism conformance suite is T1 regardless of how aggressive I'm trying to be elsewhere. That rule is what kept Ro-NEW-2 from being demoted on "data volume" grounds — without observation capture, the bootstrap loop's falsifiability claim is theatre.

Seven open questions for Cassima: rolling-buffer bound for capture store, `change_vectors` promotion to general post-commit outcome attachment (Roger+Laura), `tenant_id` cheap-insurance confirmation, snapshot-CLI scope at T1, R-9 tier check with Aaron, acknowledgement-stories for inherited Cairn surfaces (`topology_cache`, `execution_profiles`, `skillLinter`), and whether the WASM predicate-compilation ABI seam ships at T1 or T2. None of those change my T1 set; they each refine one edge of it.

## 2026-05-25 Round 6: Phase B Opens #4 and #5 resolved

Closed both substrate-owned Phase B contradictions in one inbox file (`decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md`). For #4 (7-tables UPDATE vs. backward causal slice): enumerated all seven tables from `packages/cairn/src/db/` and `agents/`, classified 6 as derived projections of `event_log` (`sessions`, `insights`, `prescriptions`, `prescriber_state`, `curator_state`, `optimization_hints`) and 1 as external filesystem mirror (`managed_artifacts.current_checksum`). Recommended killing `prescriber_state.pending_count` entirely (replace with a SQL view), wrapping all other lifecycle UPDATEs in a `withShadowEvent()` repository helper, banning raw `UPDATE` outside `db/` via a custom ESLint rule with cursor/mirror allow-list, and locking the discipline in CI with a snapshot→truncate→replay→deep-equal invariant test. Rejected SQLite triggers (would couple us to a substrate primitive in violation of v1 commitment #10) and rejected the "move everything to append-only" alternative on the evidence that the source of truth is already the event log. ~14 hours of work for Alexander in the first Crucible sprint.

For #5 (canonical serialization): picked **CBOR-dcbor + BLAKE3** (`cbor2` + `@noble/hashes/blake3`) for the new L1 read-set hash — matches Phase A's existing `blake3` columns, ~5-7µs per hash (well inside the 80µs hook-bus envelope I told Gabriel about), pure-JS so no native binding requirement. **Left DBOM on SHA-256 + JSON** — different audit consumer, committed artifacts already in production, migration not worth it. Established the per-column rule: hash algorithm fixed at column creation, never migrated; new columns BLAKE3; named legacy SHA-256 columns frozen. Specified all canonicalization edge cases (forbid bignums/tags/indefinite-length/NaN/non-NFC, definite-length only, bytewise-encoded key sort). ~9 hours of work, with Laura's A3 conformance assertion now writable without further design. Anti-anchoring rule honored on both — considered and explicitly rejected the obvious alternative for each.

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to .squad/decisions.md. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

Ready for Wave 2 implementation (computation + ranking only; runtime wiring follows in Wave 3).

## Learnings (2026-05-23 — W3-1 skillsmith-runtime scaffold)

- `packages/skillsmith-runtime/` follows the repo's standard library package shape: package.json + composite tsconfig + `src/index.ts` + `src/__tests__/` with tests excluded from TypeScript build output.
- Root workspace registration needed only a `tsconfig.json` project reference because the repo already uses the broad `packages/*` workspaces glob. `npm install` then linked the new package into `package-lock.json` automatically.
- This environment's npm rejected `workspace:*` dependency specifiers (`EUNSUPPORTEDPROTOCOL`), so the new package uses the repo's established `"*"` workspace dependency pattern instead.
- W3-1 intentionally leaves `createPrescriberOrchestrationConfig()` and `runForgePrescribe()` as throwing stubs. W3-5 will wire Cairn + Forge composition; W3-2 will make `runtime-cli` delegate into this package.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Unblocks all Wave 3 work items. Roger owns composition root and runtime-cli packaging.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool for manual prescriber invocation in Wave 3. Curator hook is autonomous surface; existing `forge-prescribe` CLI is manual surface. Re-open MCP tool only when concrete operator need materializes.
- **W3-D4: Curator Hook → Always-On** — Automatic invocation enabled; no opt-in flag in v1. Safety margins verified via Wave 2 E2E tests. Profile selection trigger-driven only; global fallback deferred to Wave 4.

## Learnings (2026-05-23 — Wave 3 Composition Root Audit)

- **Five composition root options evaluated** for Wave 3. Current architecture: Cairn and Forge have zero direct coupling (acyclic, port-based). Only `packages/runtime-cli/` bridges them (Wave 2 stepping stone). Audit document: `docs/wave3-composition-root-audit.md`.
- **Recommendation: Option B** (separate `@akubly/runtime` library + thin `runtime-cli` wrapper). Reasoning: Best test isolation, zero build risks, Phase 5-ready architecture. Library stays portable; CLI stays thin.
- **Do not use Option C** (inject Forge into Cairn hooks) — test coupling and build-order dependencies are unacceptable. Create a package instead.
- **Known unknowns deferred to Graham's ADR:** Profile selection strategy (all vs. only-with-vectors), hint persistence ownership, MCP tool shape for prescriber optimization, fail-open semantics on Forge failure during Curator.

## Learnings (2026-05-22 — Wave 2 W2-9 manual CLI surface)

- Wave 2's explicit composition root now lives in `packages/runtime-cli/` with bin name `forge-prescribe`; it's the one package allowed to import both `@akubly/cairn` and `@akubly/forge` without violating the package boundary.
- Local invocation pattern from the repo root is `npx forge-prescribe --skill <id> [--db <path>]`; the root workspace keeps `@akubly/runtime-cli` as a dev dependency so the bin is linked into the local toolchain after `npm install`.
- Profile loading is deterministic: try the canonical per-skill aggregate first (`granularity='per-skill', granularity_key='global'`), then fall back to a skill-scoped `global/global` profile before failing with a clean no-profile result.
- Exit semantics are simple: 0 on successful orchestration (including zero generated hints or dedup skips), 1 when no execution profile exists, and 2 for argument, database, or persistence failures.

## Learnings (2026-05-22 — Wave 2 W2-1 shared change-vector contract)

- Canonical Wave 2 change-vector contracts now live in packages/types/src/index.ts: ChangeVectorSummary, ChangeVectorProvider, NEGATIVE_IMPACT_AUTO_APPLY_GATE, and shared OptimizationCategory.
- Reconciled the two ChangeVectorSummary duplicates by taking Forge's stricter OptimizationCategory union instead of Cairn's plain string. Added autoApplyEligible?: boolean as the additive v3.1 field on the shared contract.
- Verification: root npm run build and root npm test passed before and after the change (1153-test baseline green).

## Learnings (2026-05-23 — W3-2 thin runtime-cli)

- Picked **Option A** for W3-2: `packages/skillsmith-runtime/src/index.ts` now owns the existing `runForgePrescribe()` composition flow (profile load, `SqliteChangeVectorProvider`, Forge prescribers, dedup + persistence) and `packages/runtime-cli/src/index.ts` is just a re-export facade.
- The thinnest stable CLI refactor here is **function re-export + unchanged CLI formatter**. That preserved operator-visible behavior and let the new delegation test assert identity (`runtime-cli` export === `@akubly/skillsmith-runtime` export) without introducing fragile ESM mocking around the bin entry.
- Alexander no longer needs to move manual CLI composition into `skillsmith-runtime` for W3-5; that surface is already live. W3-5 can stay focused on `createPrescriberOrchestrationConfig()` and Curator-facing factory wiring.
- After this refactor, remember to build before package tests that import `@akubly/skillsmith-runtime` by package name; those tests resolve the built workspace export (`dist/`), not the source file directly.

## Learnings (2026-05-23 — W3-6 hook injection bootstrap)

- Picked **R-Hook-A (injection)** for Curator session-start wiring: `packages/cairn/src/hooks/sessionStart.ts` now accepts an optional `PrescriberOrchestrationConfig` and forwards it to `curate()`; Cairn itself still does not import `@akubly/skillsmith-runtime`.
- The production always-on bootstrap now lives in `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, and `.github/hooks/cairn/curate.ps1` resolves that compiled script first. Laura's W3-7 integration test should enter through that skillsmith-runtime hook path, not the bare Cairn hook, so the real orchestration config is present.
- Keeping the script-level composition in the runtime package preserves W3-D1's boundary: Cairn owns hook mechanics, skillsmith-runtime owns cross-package wiring, and the PowerShell wrapper chooses the composition entrypoint.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Runtime-CLI: 5/5 passing
- Skillsmith-Runtime: 6/6 passing

**W3-1 & W3-2 shipped:** Scaffolding + thin CLI done.  
**W3-6 shipped:** Hook wiring complete — always-on bootstrap via injected config. Composition boundary preserved (cairn ↔ skillsmith-runtime acyclic).  

Wave 3 implementation delivered autonomous Curator-driven orchestration. Composition root (R2: `@akubly/skillsmith-runtime`) is the only place importing both `@akubly/cairn` and `@akubly/forge`. Phase 5-ready architecture in place.

---

## Session N: Skillsmith Harness Big-Think User Stories

**Lens:** Data, scale, integration, persistence.

### 9 Delivered Stories

**US-R-1: Cairn Pattern Mining Across Session Boundaries**  
As Aaron, query Cairn ledger to surface recurring Decision patterns, code-smell-to-fix chains, and decision reversals across 100+ sessions for Curator tuning and Forge heuristic calibration.  
*Ambition:* Accumulated telemetry becomes self-tuning feedback loop; harness learns from its own history.  
*Chambers:* Crucible, Cairn, Forge, Mirror  
*Data implication:* Append-only versioning + efficient graph traversal across millions of Primitives.

**US-R-2: GitHub Issue Auto-Coupling via Curator**  
Curator detects when a session solves/relates to open GitHub issues, auto-proposes linking (never auto-approves), leaving Mirror-check gate.  
*Ambition:* Break silo between coding-agent telemetry and project tracking; external systems as first-class signal inputs.  
*Chambers:* Crucible, Cairn, Curator, Mirror  
*Data implication:* Bidirectional webhooks + GitHub API polling; Cairn stores sync state + proposal backpressure.

**US-R-3: Cairn Replay & Variant Branching**  
Export session (or sub-chain) and replay with Alchemist variants—different model, decision tree, tool choices—to compare outcomes without reracking work.  
*Ambition:* Replay-as-first-class-primitive; harness becomes experimentation platform. Replay + variant = A/B testing coding decisions.  
*Chambers:* Cairn, Alchemist, Crucible  
*Data implication:* Portable serialization (JSON-LD/SQLite) with deterministic replay semantics + seeded RNG injection.

**US-R-4: Long-Session Drift Detection & Prescribing**  
Forge detects token-budget creep, context-window saturation, decision-reversal clustering in sessions >2hr; auto-proposes checkpoint/reset patterns.  
*Ambition:* Make invisible resource constraints visible before degrading session quality; Forge as canary.  
*Chambers:* Forge, Crucible, Cairn, Mirror  
*Data implication:* Granular token/context-window/latency tracking per turn; time-series queries on Cairn.

**US-R-5: Mirror-Backed Cross-Session Provenance**  
Mirror surfaces decision chain (why that tool chosen, which prior session influenced heuristic) across boundaries, building legible accountability for harness autonomy.  
*Ambition:* Epistemic trust-building—audit *reasoning* behind Curator proposals, not just outputs.  
*Chambers:* Mirror, Cairn, Curator  
*Data implication:* Rich metadata linking each Primitive to prior-session provenance (parent Decisions, Forge signals, Curator confidence).

**US-R-6: Scalable MCP Ecosystem as Forge Input**  
Federate tool success/failure/latency across Aaron's entire MCP ecosystem; Forge ranks tool choices; share anonymized insights with Skillsmith community.  
*Ambition:* Harness becomes collective learning engine; aggregate signal from thousands of tool invocations into shared optimization surface.  
*Chambers:* Forge, Cairn, Curator, Crucible  
*Data implication:* Multi-tenant telemetry ingestion + differential-privacy aggregation; Forge ranking scoped to cohort.

**US-R-7: Curator-Driven Code Review Automation**  
Curator detects mutations of core APIs or high-fan-out subsystems; auto-proposes async code review (MCP agents or GitHub PR); track review-to-ship latency in Cairn.  
*Ambition:* Blur autonomy and accountability; let them coexist.  
*Chambers:* Curator, Cairn, Crucible, Mirror  
*Data implication:* Parse Artifact diffs, compute module-graph impact, integrate GitHub PR API + MCP code-review servers.

**US-R-8: Multi-Tenant Cairn Export & Legal Hold**  
Export filtered Cairn views (by project, time window, Primitive type) as immutable ledger snapshots for compliance, legal hold, or sharing—without exposing private sessions.  
*Ambition:* Audit-ready from day one; data residency + portability as core, not bolted-on.  
*Chambers:* Cairn, Mirror, Crucible  
*Data implication:* Column-level access control, zero-knowledge proof of ledger integrity, deterministic export fingerprinting.

**US-R-9: Sessions as Reusable Templates**  
Mature Crucible sessions packaged as reusable templates—decision trees, tool chains, Curator tunings—spin up new projects with pre-tuned harness behavior.  
*Ambition:* Session-as-code; codify best practices by capturing harness *state itself*.  
*Chambers:* Cairn, Crucible, Alchemist, Forge  
*Data implication:* Session versioning, MCP tool dependency resolution, semantic diffing of Cairn ledgers.

---

**Older learnings archived to history-archive.md**

---

## Deliberation Round (2026-05-24)

> Roger — Platform Dev / Data & Scale lens. I just clean the floors, but the floor is the ledger and it's about to get sticky.

### Section 1 — Story Revisions

**US-R-1 Cross-Session Pattern Mining → MERGE-WITH Graham US-G-1, Laura US-L-5, Erasmus US-E-6.** One story: "Cairn as queryable corpus for pattern mining + skill recommendation." Roger owns the storage/index substrate; Laura owns the analytics; Graham owns the surfacing; Erasmus owns the auto-skill-draft. Three lenses, one feature. 🐞 Doubly compelling under agentic-debugger (pattern mining = bug class detection across sessions).

**US-R-2 GitHub Issue Auto-Coupling → REVISE.** Reframe as a **ProposalGenerator** (per Erasmus L3): `GitHubLinkProposalGenerator` emits link proposals; Router decides notify-vs-auto-apply. No special-case wiring. Drops Mirror from the chamber list (Mirror is a view, not a participant).

**US-R-3 Cairn Replay & Variant Branching → KEEP, PROMOTE TO P0, MERGE-WITH Graham US-G-7, Alexander US-A-3, Valanice US-V-1, Gabriel US-5, Erasmus US-E-2.** This is now the headline story per Aaron Insight #1. Single revised story: **"Fork-from-any-ledger-position as first-class primitive, with hermetic replay against captured observations."** I own the COW snapshot model, observation-capture table, and ref/branch metadata. 🐞🐞 Doubly compelling — this IS the agentic debugger.

**US-R-4 Long-Session Drift Detection → REVISE as ProposalGenerator.** `DriftProposalGenerator` watches a derived-query view (token/turn/reversal rates). Stops being a chamber, becomes a plugin. 🐞 Doubly compelling (drift = pre-bug signal; same code path as bisect heuristics).

**US-R-5 Cross-Session Provenance → WITHDRAW as standalone, FOLD into US-R-3.** Provenance *is* the replay graph. If R-3 lands, R-5 falls out of the same data structures. Don't pay twice.

**US-R-6 Federated MCP Telemetry → WITHDRAW from v1.** Solo-v1 scope. Keep the schema namespaced (see Tension 1) so this is additive later, not a rewrite. Re-pitch in Phase 2.

**US-R-7 Curator Code Review → REVISE as ProposalGenerator** (`HighFanoutReviewProposalGenerator`). Same pattern as R-2/R-4; collapses three of my stories into one mechanism.

**US-R-8 Multi-Tenant Export & Legal Hold → REVISE down.** Drop "multi-tenant" and "legal hold" for v1. Keep **deterministic ledger export + integrity hash**. Solo user still needs portable, verifiable snapshots — that's the substrate for R-3 fork-sharing and Erasmus US-E-10 (collaborative replay).

**US-R-9 Sessions as Templates → KEEP, REVISE.** Reframe as "snapshot-as-template": any ledger snapshot (with optional redaction proposal-generator pass) becomes a seed for a new Crucible. Cheap when the snapshot/COW substrate from R-3 exists.

**NEW STORIES:**

- **US-Ro-NEW-1: Snapshot + Compaction Cadence (the floor I'm cleaning).** As Aaron, I want Cairn to snapshot at Decision boundaries and compact append-tail to columnar storage on a background cadence, so that branching is O(1), queries don't scan from genesis, and disk doesn't grow without bound. *Owns Erasmus risk (c).* 🐞 Doubly compelling — fast bisect needs cheap snapshots.
- **US-Ro-NEW-2: Observation Capture Store (determinism backbone).** As Aaron, I want every LLM/tool/env read to write a content-addressed `(call_hash, inputs_hash) → outputs_hash` row, so that replay reads from capture and never re-calls a non-deterministic service. Backbone for R-3, Aaron Insight #3, Erasmus risk (a). 🐞🐞 The agentic-debugger lens demands this.
- **US-Ro-NEW-3: Branch/Ref Metadata + GC.** As Aaron, I want named refs over snapshots (like git branches), reachability-based GC, and a `cairn fsck` that verifies hash chain + capture-completeness, so that fork proliferation doesn't rot the store. Pairs with R-3 and Ro-NEW-1.
- **US-Ro-NEW-4: Backpressure & Quotas on Proposal Queue.** As Aaron, I want the Approval Router to apply per-generator quotas + decay, so that a noisy ProposalGenerator can't flood the queue or Cairn. Engages Erasmus risk (b) (unconstrained optimization = noise).

### Section 2 — Position on Erasmus's 4-layer stack: **PARTIAL ENDORSE**

**L1 Conductor + Ledger merged (event sourcing): ENDORSE with caveat.** Event sourcing is the right substrate — it's the only way determinism + branching + replay all fall out of one model instead of three. **Caveat:** "merged" must not mean "same process owns writes and turn execution synchronously." The write path needs a WAL + async fsync window, or every LLM token roundtrip blocks on disk. Conductor *appends*, a Ledger Writer *durably commits*.

**L2 Derived Query Layer (Salsa-style): PARTIAL.** Conceptually right, but on its own it **does not scale — it relocates the bottleneck from queries to invalidation traffic.** Every append fires invalidations across every cached projection; with 1k primitives/session and N projections you get N×1k cache-bust events. Mitigations I'd require before endorsing: (a) **snapshot-keyed cache keys** (`(snapshot_hash, query_sig)`) so only the projections crossing a snapshot boundary invalidate; (b) projections register **column-range dependencies**, not "depends on ledger"; (c) hot projections materialized as compacted tables, cold ones recomputed on demand. Without these the Query Layer is a memory leak with a nice name.

**L3 Pluggable ProposalGenerators: STRONG ENDORSE.** Collapses my R-2, R-4, R-7, and Curator/Forge/Alchemist/staleness into one extension surface. Same telemetry, same quotas (see Ro-NEW-4), same test harness. This is the single biggest architectural win on the table.

**L4 Approval + Notification Router: STRONG ENDORSE.** Single policy choke-point = single audit table = single place to enforce branching semantics (e.g. "apply to branch X but notify on branch Y"). Resolves Tension 2 cleanly.

**On Erasmus risk (c) — my wheelhouse:** Yes, the ledger *will* bottleneck and we have to plan for it now, not later. Concrete commitments I'll own:
1. Append-only WAL with batched fsync; primitive serialization ≤256 bytes typical (large payloads spilled to content-addressed blob store, ledger holds the hash).
2. Snapshot at every Decision primitive; snapshots are Merkle-rooted so branching is COW and verification is O(depth-diff).
3. Background compaction of tail → columnar (Parquet-ish) for the Query Layer to scan without touching live WAL.
4. Observation-capture is a *sibling* store, not the ledger — same content-addressing, separately compactable, separately GC'd (it's 5–10× the volume of the ledger itself; treating them as one table is how you die).

### Section 3 — Positions on the 5 Tensions

**1. Solo-v1 vs federation.** Solo-v1, full stop. But: every table gets a `tenant_id`/`namespace` column from day one (default `'local'`). Federation later is an additive read-path + auth-path concern, not a schema migration. Cheap insurance.

**2. Curator never approves.** Resolved by L4 Router. Curator becomes a ProposalGenerator + a view. I want it written down that *no chamber writes to the apply-decisions table except the Router* — single-writer invariant is the only thing standing between us and a debugging nightmare.

**3. Mirror scope creep.** Resolved — Mirror = derived view over (proposal queue ∪ ledger tail ∪ capture metadata). I stop listing it as a chamber in any of my stories.

**4. Heavyweight ops vs solo user.** Strip federation, legal hold, multi-tenant export, MCP federation, GitHub webhooks-as-infra from v1. **Keep** snapshot/compaction/capture/branching/integrity-hash — those aren't "ops," they're load-bearing for the agentic-debugger vision and they're cheaper to build now than to retrofit.

**5. Crucible vs Copilot CLI parent-child.** Crucible spawns Copilot CLI as a sub-agent; sub-agent IO must flow through the observation-capture store or replay/branching breaks at the agent boundary. This is non-negotiable from the data lens — an un-captured sub-call is a non-deterministic hole in every downstream fork.

**NEW Tension 6 — Capture cost vs throughput vs privacy.** Observation capture multiplies write volume and will eventually capture secrets (env vars, API keys in tool args). Need: (a) capture compression + dedup (content-addressing already gives us this), (b) a redaction ProposalGenerator that runs *before* commit, (c) a clear policy on whether replay across a key rotation is allowed. Flagging now so it's not a Phase-5 surprise.

### Section 4 — Cross-references

1. **Erasmus US-E-1 (Ledger Bisect) + my US-R-4 (Drift Detection)** → same engine. Bisect is "binary search over snapshots for the first bad Decision"; drift is "rolling-window anomaly over the same snapshot index." Build the snapshot index once (Ro-NEW-1) and both fall out. **Strengthens both.**
2. **Aaron Insight #1 (branching first-class) + Graham US-G-7 + Alexander US-A-3 + Valanice US-V-1 + Gabriel US-5 + Erasmus US-E-2 + my US-R-3** → six lenses converging on the same primitive. This is the consensus headline. Roger owns the substrate; others own surfaces.
3. **Erasmus US-E-7 (model-swap replay)** → **invalidates** any approach where model identity isn't in the observation-capture key. Forces my capture-store schema to include `(provider, model, version, sampling_params)` in the call hash. Good catch — would have been a v1 bug.
4. **Laura US-L-7 (lazy outcome finalization)** → strengthens Ro-NEW-1: snapshots must be append-extensible (outcomes arrive later and attach to past Decisions). Means snapshot = "ledger prefix + late-binding outcome side-table," not a frozen blob.
5. **Rosella US-Ro-5 (Alchemist skill evolution)** → demands the same fitness/outcome substrate Laura needs and the same branching substrate R-3 provides. If we don't build branching + capture, *neither* Alchemist nor Laura's eval loop is honest — they'd be measuring against non-replayable runs. **Strengthens Ro-NEW-2 doubly.**

— Roger


## 2026-05-24 Round 3: Read-set verdict (Sonny US-S-3)

# Roger — Verdict on Sonny US-S-3 (causal read-set on L1 append)

**Date:** 2026-05-24T22:33Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Whether the L1 append-record contract (v1 commitment #8) must carry a `causalReadSet` for every primitive write, as Sonny argues in US-S-3.
**Verdict (TL;DR):** **LOCK — with surgical split on population.**

I read Sonny's nine stories. US-S-3 is the one that actually touches my floor, so I'll only answer for that. Not re-litigating L1-vs-L2 or the 4-layer stack.

---

## 1. Is retrofit structurally impossible later?

Mostly yes. Two paths to retrofit and both are bad:

- **(a) Replay-and-instrument.** Re-run every historical session under a wrapper that records what each generator consulted. Requires hermetic replay to be 100% deterministic in practice (it won't be — plugin code drifts, model versions retire, content-addressed blobs may be GC'd before we ever ask the question). And it costs N× compute per "why?" query. Theoretically possible, operationally a tax we'd pay forever.
- **(b) Forked storage format.** Pre-v2 ledgers permanently lack causal slicing; v2 ledgers have it. We'd ship a debugger that quietly degrades on old sessions, which is exactly the trust-eroding lying-debugger UX Sonny rails against in US-S-5.

The forward-compatible "capture in a derived L2 projection instead" path that I went looking for **does not exist for the data Sonny actually wants**. L2 can derive structure *from what L1 recorded*; it can't synthesize edges L1 never wrote. The read-set is a property of the *write*, not of the ledger prefix.

So Sonny is right on the retrofit point. Not religiously — operationally.

## 2. What "read-set" means for the 5 primitives

There is one coherent **schema** and five primitive-specific **population rules**:

| Primitive | What the read-set captures | Source in v1 |
|---|---|---|
| **Request** | Parent Decision/Question that triggered it; prior Observations the planner saw; system-context refs | Best-effort (planner emits) |
| **Artifact** | Source primitives consulted (prior Artifacts, Observations); plugin version refs | Best-effort (generator emits) |
| **Observation** | The external-IO capture key `(call_hash, inputs_hash)`; pinned plugin version | **Already captured** by Ro-NEW-2 capture store — zero new work |
| **Decision** | Proposal IDs considered; projection refs consulted; prior Decisions cited | **Required** — Decisions are the bisect/branch anchors |
| **Question** | The trigger Decision or halt condition; minimal | Best-effort |

Common shape — typed list of `(kind, target_id, target_hash, role)` tuples. Different *who-populates-what* per primitive. One schema, primitive-specific completeness rules.

## 3. Cost analysis (I own the WAL group-commit path)

Sonny says "cheap now." I verified. He's right, given one structural choice:

**Per-append cost if the read-set is inlined in the WAL row:** ~200–800 bytes for a typical 5–20 entry set. Blows my ≤256-byte typical-row budget by 2–3×. Bad.

**Per-append cost if the read-set body is spilled to the CAS blob store and the WAL row carries only a 32-byte Merkle root:** **+32 bytes per WAL row, zero added fsync latency** (the blob write rides the same batched fsync window, no extra round-trip). Fan-out: read-set bodies are content-addressed and intern naturally — a parent Decision referenced by 200 children stores its hash 200 times in WAL rows but the *body* mentioning it dedupes in CAS.

Net verdict: with the spill design, cost is **+32 bytes/row, latency-neutral, dedup-friendly**. Cheap is correct. Inlined would be a non-starter; spilled is free.

This is the same pattern I already committed to for large payloads in my round-2 deliberation (commitment #8 sub-point 1). Read-sets are just another spilled field on the same path.

## 4. Compatibility with commitments #6 (snapshot+compaction) and #2 (hermetic replay)

- **Snapshot + compaction (#6):** No conflict. Snapshots are Merkle-rooted over WAL rows; read-set hashes are WAL row fields, so they're already in the root. Compaction folds the hash into columnar storage like any other field. Bonus: causal queries (`why?`, `who-cited-this?`) become indexable columnar scans, which is exactly the shape Cairn-bisect (US-S-6) and drift detection (US-R-4) want.
- **Hermetic replay (#2):** Subtle but clean. The read-set is an **output** of generation, not a replay input. Replay re-feeds Observations deterministically; the generator re-derives its read-set on re-execution. So replay does **not** re-feed read-sets — but the determinism conformance suite (commitment #4) gets a new assertion: *re-derived read-set must match recorded read-set*. That's a free correctness check Laura will probably want.
- **One edge case worth naming:** if a read-set entry refers to an L2 projection value (per US-S-4 retroactive projections), the entry must carry the projection-**version** ID, not just the query result, or replay will assert against a moving target. Cheap to specify now.

## 5. The 8th proposal-schema field (`causalReadSet`) — Laura's field vs. my contract

**Same data, two capture points.** Not two concepts, one concept on a pipeline:

1. **L3 ProposalGenerator declares** `causalReadSet` in its proposal (Laura's schema field).
2. **L4 approval router validates** the declaration (do the referenced primitives exist? are projection-version IDs resolvable?). Validation is a precondition for approval; a malformed read-set is a rejected proposal, not a committed garbage row.
3. **L1 commits** the validated read-set into the WAL row alongside the primitive payload (my contract). Body spills to CAS; hash goes in the WAL row.

Integration argument: Laura's field is the **producer contract** ("generators must declare what they read"); my field is the **storage contract** ("committed rows must carry the declaration's hash"). They are the same bytes, captured once at L3, validated at L4, durably committed at L1. Anyone trying to make them diverge is wrong.

For primitives that don't flow through a generator (raw Observation writes from the capture store), L1 synthesizes the read-set directly from the capture row — same schema, different population site.

## 6. Verdict: **LOCK with surgical scope split**

### Lock now (v1):
- **Schema slot.** Every WAL row has a nullable `causal_read_set_hash: blake3?` field. Reserved, named, in the row layout.
- **Body format.** Versioned CAS blob, typed entry list as in §2. Frozen for v1.
- **Wiring.** L3 proposal schema carries `causalReadSet`; L4 validates it; L1 commits the hash. End-to-end path exists day one.

### Split on population (v1 → v2):
- **REQUIRED + populated in v1:** Observation (free — already in capture store), Decision (the bisect/branch/why? targets).
- **BEST-EFFORT in v1, REQUIRED in v2:** Request, Artifact, Question. Slot exists, format is canonical, generators populate when they can. L1 accepts `NULL` without complaint in v1 and rejects `NULL` in v2.
- **`cairn fsck` (Ro-NEW-3) gains a new check:** report read-set completeness per primitive kind. Migration to v2 is "raise the bar from warn to error per kind" — no ledger rewrite, no schema migration, just a config flip.

### Why split rather than full-lock or full-defer:

- Sonny's load-bearing concern is **"structurally impossible to retrofit."** The schema slot, format, and wiring address that fully. Once the slot exists and the bytes are addressable, "fill it in for kind X" is a generator-side change, not a ledger rewrite.
- Full-lock-all-kinds-populated would block v1 on every generator implementing exhaustive read-set tracking, which is real work and adds bug surface across L3 right when L3 is still settling. We'd ship late for a property we can adopt incrementally.
- Full-defer is the failure mode Sonny correctly identifies — the slot never gets added, the contract calcifies without it, and v2 is a fork.

### Append-record schema, v1 (revised):

```
WalRecord {
  seq:                  u64,
  ts_ns:                u64,
  parent_seq:           u64,
  primitive_kind:       u8,        // Request|Artifact|Observation|Decision|Question
  primitive_id:         ULID,
  payload_hash:         blake3,    // body in CAS
  causal_read_set_hash: blake3?,   // NEW — body in CAS, schema below
  proposal_id:          ULID?,     // L3 proposal that produced this (if any)
  approval_id:          ULID?,     // L4 verdict (if any)
  prev_root:            blake3,    // chain
}

ReadSetBody (CAS blob, content-addressed, v1):
{
  version: 1,
  entries: [
    {
      kind:        PrimRef | ProjectionRef | ObservationRef | PluginRef,
      target_id:   ULID | ProjectionVersionId | CaptureKey | PluginVersionId,
      target_hash: blake3,
      role:        Input | Context | Trigger | Constraint
    },
    ...
  ]
}
```

Row-cost delta: **+32 bytes/row** when populated, **0 bytes** when NULL (use an optional/varlen encoding so unpopulated kinds don't pay). Fsync neutral. Compaction-friendly (single columnar field, hash-typed, intern-friendly). Snapshot-Merkle-compatible (it's just another row field).

### What I need from the team to land this:
- **Laura:** add `causalReadSet?: ReadSetEntry[]` to the proposal schema; required for Observation/Decision proposals, optional for the other three in v1. The entry shape above is the canonical form.
- **Stelios (L2):** projection identity must include a stable **version** ID so a `ProjectionRef` entry survives projection-definition edits. Already a US-S-2/US-S-4 ask; this just makes it load-bearing.
- **Alexander (L4):** approval validation step rejects proposals whose declared read-set references unknown/unresolvable IDs. Small extension to the pre-commit hook he already needs for US-S-1 (predicate-eval breakpoints).
- **Erasmus:** add a determinism-suite assertion: re-derived read-set on replay must equal recorded read-set for primitive kinds where it's populated. Free correctness signal.

I'll own the WAL row layout, the CAS spill path, and the `cairn fsck` read-set-completeness check. None of this changes my round-2 commitments on snapshot cadence or compaction; it just adds one nullable hash column and one CAS blob kind.

---

## Plain-text summary for the coordinator

**Verdict: LOCK, with a surgical split on population.**

Sonny is right that the read-set is structurally impossible to retrofit cleanly — the only retrofit paths are replay-and-instrument (forever-tax on compute and on perfect determinism) or a forked v2 storage format (silently-degraded debugger on old ledgers). He's also right that it's cheap now: with the body spilled to the content-addressed blob store and only a 32-byte hash in the WAL row, the per-append cost is +32 bytes and zero added fsync latency. Lock the schema slot, the body format, and the L3→L4→L1 wiring in v1; require population for Observation (already free via Ro-NEW-2 capture) and Decision (the bisect/why? anchors); leave Request/Artifact/Question as best-effort in v1 and promote to required in v2 via a `cairn fsck` config flip — no ledger rewrite. The proposal-schema field Laura owns and the append-contract field I own are the **same bytes** captured at different points on one pipeline; L3 declares, L4 validates, L1 commits the hash. Endorsed.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 3 (continued): Pre-commit hook bus — L1 verdict

# Roger — Verdict on Alexander's pre-commit hook bus (re US-S-1 / US-S-4 / US-S-9)

**Date:** 2026-05-24T23:00Z
**Author:** Roger (Platform Dev, L1/Ledger owner)
**Scope:** Where the shared pre-commit hook bus sits relative to WAL group-commit, what pause does to a batch, whether the verdict is recorded, predicate cost on the hot path, interaction with `causal_read_set_hash`.
**Verdict (TL;DR):** **ENDORSE with refinements.** The bus belongs *inside* the group-commit window but *outside* the fsync barrier, runs per-row over the staged batch, and is itself a recorded WAL field. Predicates must be pre-registered/compiled. Read-set predicates are fine — and actually the killer feature.

The read-set verdict from earlier today is locked, not re-opened. This is only about the hook bus and how it touches my floor.

---

## 1. Where the bus sits relative to group-commit

There are four candidate insertion points. Three of them are wrong. Walking through them so the choice is on the record:

| Option | What it means | Verdict |
|---|---|---|
| (a) Before the row is staged into the batch | L3 emits → bus runs → row joins batch or doesn't | **Wrong.** Predicates can't see batch siblings or the committed read-set; pause loses ordering with concurrent emitters. |
| (b) Per-row, *inside* the batch staging loop, *before* the fsync barrier | Each candidate row is appended to the in-memory batch, hook bus evaluates against the row + its `causal_read_set_hash`, verdict is recorded on the row, then we either fsync or split | **Right.** This is what I'm endorsing. |
| (c) Once per batch, after staging, before fsync | One bus call sees the whole batch | **Wrong.** Pause semantics get fuzzy ("which row paused us?"), and predicate authors lose per-row identity. |
| (d) After fsync, before ack | Bus runs on durable rows | **Wrong.** Pause-after-durable is not a pre-commit hook, it's a post-commit notifier. Different primitive. Useful, but not what Alexander asked for. |

**The contract: option (b), per-row, pre-fsync, inside the group-commit window.**

Concretely the group-commit path becomes:

```
for row in candidate_batch:
    row.causal_read_set_hash = compute_read_set(row)    # already locked
    verdict = hook_bus.evaluate(row, read_set_view)     # NEW
    row.hook_verdict = verdict                          # recorded on the row
    if verdict == pause:
        seal_batch_through(row.seq)                     # see §2
        break
fsync(sealed_batch)
ack(sealed_batch)
if paused: hand control to L4 router
```

**Throughput claim.** Group-commit throughput is dominated by fsync, not by the per-row in-memory work. The bus runs in the same memory window where I'm already computing read-set hashes and chaining `prev_root`. Adding a dispatch per row, with predicates indexed by `primitive_kind` so non-matching kinds cost one hashmap lookup, is **noise on the fsync-bound path**. I am not giving up throughput for this, provided §4 holds.

What I am **not** doing is serializing the bus across batches. Multiple writers stage into multiple batches concurrently today; the bus is per-batch-local because predicates only see the row + its read-set view, not other in-flight batches. Cross-batch invariants are not the bus's job — that's L4 / L2.

---

## 2. Pause mid-batch — the transactional contract (owns commitment #8)

The scenario: 100-row batch, row 5 trips a `pause` verdict. Three plausible behaviors, only one of which doesn't lie:

- **Roll back rows 1–5.** Nope. Rows 1–4 already passed their verdicts (`continue` or `observe`). Rolling them back means a `continue` verdict didn't actually mean continue. That breaks predicate-author trust forever. Also breaks Sonny's US-S-4 logpoints — they fire on `observe`, expecting durability.
- **Commit through row 5, then pause.** Yes. This is the contract.
- **Commit the whole batch, then pause.** No. Defeats the purpose; rows 6–100 would commit despite a known pause condition having fired upstream of them.

**Contract: seal-and-split.**

1. When a row's verdict is `pause`, the batch is **sealed through that row inclusive**. Rows 1..N (where N is the pausing row) fsync as a normal group-commit batch. They are durable. Their acks fire.
2. Rows N+1..end of the candidate batch are **returned to the staging queue**, not dropped. They will be re-evaluated by the bus in the *next* batch (their read-sets may have changed because row N is now committed; predicates may verdict differently). Replay sees them in their eventual-commit order, not the original-staging order — and that's fine, because replay deterministically follows recorded `seq`.
3. The pausing row's `hook_verdict = pause` is durable in the WAL before L4 is invoked. L4 cannot be asked to make a decision about a row that isn't on disk yet. This matters for crash safety: if Crucible dies between L1 ack and L4 invocation, recovery sees a paused row with no L4 verdict and re-enqueues it for L4. No double-decision, no lost pause.
4. L4's eventual verdict (per Alexander's extensible enum, per US-S-9) is recorded as a **subsequent WAL row** referencing the paused row's `seq`. Same pattern as approval today, just with the pause anchor durable first.

This costs throughput on pause (one extra fsync barrier per pause, by definition). It does not cost throughput on `continue` or `observe`, which is the 99.9% case. Pause is the slow path on purpose — that's what "stop and ask the human" means.

**Edge case worth naming:** two rows in the same batch both verdict `pause`. The first one wins; the batch seals through it; the second goes back to the queue and re-pauses next batch. No "batch pause set" — one pause per commit cycle keeps L4's mental model honest.

---

## 3. Recording the verdict — yes, in the WAL row

If the verdict isn't durable, hermetic replay can't reproduce pause behavior, and the post-mortem investigator REPL (Sonny's US-S-5) lies. Both are non-negotiable. So the verdict goes in the WAL row.

**Schema slot — extend the row, do not sidecar.** Two new fields on `WalRecord`:

```
WalRecord {
  ...                                          // as locked in read-set verdict
  causal_read_set_hash:   blake3?,             // already locked
  hook_verdict:           u8?,                 // NEW: 0=continue, 1=observe, 2=pause; NULL if no predicate matched
  hook_verdict_witness:   blake3?,             // NEW: CAS hash of {predicate_ids_fired, predicate_outputs}; NULL if verdict=continue
  ...
}
```

Cost: **+1 byte for the verdict tag, +32 bytes when a non-continue verdict fires**, zero when no predicate matched (same optional encoding as `causal_read_set_hash`). The witness body in CAS lets US-S-5 reconstruct *why* the verdict fired without bloating WAL rows. Verdict-only-no-witness is invalid; either both NULL or both populated.

**Sidecar log was tempting, rejected.** A separate log of "pauses that happened" would force replay to join two streams in `seq` order, and `cairn fsck` would have to cross-check them. One row, two columns is simpler and snapshot-Merkle-clean (both fields are already row fields, so they're in the root for free).

**`cairn fsck` gains a check (extension of Ro-NEW-3):** for every row with `hook_verdict != continue`, the witness blob must resolve in CAS, and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC and registry-drift bugs.

---

## 4. Predicate cost — the hot-path SLA

Alexander flagged this and he's right to. My append SLA is unchanged from round 2: **p99 commit-to-ack ≤ 5ms at 10k writes/sec sustained, p99 row-stage cost ≤ 80µs in-memory.** The bus has to fit inside the 80µs in-memory budget.

**The break-point.** A naive interpreted match-spec predicate (ETS-style `{'==', '$1', secret}` interpreted recursively) costs ~5–20µs depending on read-set size. Ten such predicates registered against the same primitive_kind = 50–200µs. **That breaks the SLA at ~5 simultaneously-registered interpreted predicates on a hot kind.** Not acceptable.

**Required mitigation — pre-registration with compilation:**

1. **Register, don't pass.** Predicates are registered with L1's hook bus by ID, returning a handle. You cannot pass a fresh AST per commit. This is non-negotiable for the hot path. (It also fits Alexander's "predicate lifecycle across forks" point — handles have explicit lifetimes.)
2. **Compile at registration time.** Registration runs the predicate AST through a compiler that emits either (a) a native function pointer (for shapes we recognize: equality on field, range on field, set membership on field) or (b) a bytecode interpreter as fallback. Sonny's match-spec subset must be expressive enough to compile to (a) for the common cases; otherwise we fall back to (b) and the predicate author gets a soft warning that they're on the slow path.
3. **Index by primitive_kind.** Predicates declare which kinds they care about at registration. Rows of unmatched kinds cost one hashmap lookup and a no-op return. This is Alexander's point #1 from his "anything you missed" and I am taking it as load-bearing.
4. **Cache against read-set hash.** If the same predicate fires twice against rows with identical `(primitive_kind, causal_read_set_hash, key_fields_hash)`, the verdict is memoized for that batch. Stelios's Salsa engine in L2 can extend this across batches if it wants; I'm not promising cross-batch cache from L1.

**SLA-safe envelope with mitigations in place:** up to ~50 registered predicates per primitive_kind, compiled, with read-set ≤ 32 entries, stays inside 80µs. Beyond that, registration starts soft-failing with an SLA-budget warning. This is a knob, not a wall — but it's a knob the runtime owns, not predicate authors.

**Where it irrevocably breaks:** Turing-complete predicates. If someone tries to register a predicate that calls back into L2 to evaluate a projection, that projection might be invalidated, recompute on the fly, and the commit path now waits on Stelios's engine. **No.** Predicates may *reference* projection-version IDs (those are stable hashes) but may not *call* projections at evaluate time. If you need projection state, snapshot it into the predicate's closure at registration and re-register when the projection-version ID changes. Same discipline as US-S-4 retroactive projections.

---

## 5. Interaction with `causal_read_set_hash` — yes, this is the feature

Both run pre-commit. Both are computed on the same row in the same window. The bus must see the read-set; that's most of the value.

**Contract: the bus receives `(row, read_set_view)` where `read_set_view` is a typed reader over the row's freshly-computed read-set entries** (not the hash — the *resolved* entries, because predicates need to ask questions like "did this Decision read any Observation tagged secret"). The read-set is computed *before* the bus is called; the bus is called *before* the hash is sealed into the row; predicates may read the entries but may not mutate them.

**Yes, predicates can be on read-set contents.** This is exactly Sonny's US-S-1 "pause if this Decision read any Observation tagged secret" example, and it falls out for free from this ordering. Example shapes I'm committing to support:

- `read_set.any(kind=ObservationRef, where=target.tags ∋ 'secret')` — set/tag membership over read-set entries.
- `read_set.contains(role=Trigger, target_id=$known_id)` — direct lookup.
- `read_set.count(kind=PrimRef) > N` — cardinality.
- `read_set.entries[*].target_hash ∈ $watch_set` — hash-set membership against a registered watch list.

**What I'm NOT supporting in v1:** transitive queries ("did anything in my read-set transitively read X"). That requires walking the causal DAG, which is L2's job, not the hot-path bus. If you want that, materialize it as a projection and reference the projection-version ID in your predicate at registration time. Same discipline as §4.

**This integration makes the bus strictly more valuable than the read-set alone**, because the bus is where read-set policy becomes *enforceable* rather than merely *recorded*. Tag-leak prevention, secret-egress detection, citation-required policies — all expressible as bus predicates against read-set entries. That's not a bonus; that's why the two features should be designed together.

---

## 6. Verdict: **ENDORSE with refinements**

Alexander's split (one shared pre-commit bus, three verdict outcomes, pause unified through L4) is correct. The refinements I'm imposing are:

### L1-side contract (locked):

**Ordering & throughput:**
- Bus runs **per-row, inside the group-commit window, before the fsync barrier**, after the row's `causal_read_set_hash` is computed but before the row is sealed.
- Bus is **not** serialized across concurrent batches.
- `continue` is the zero-cost default; matched-kind dispatch costs ~1µs; compiled predicate eval costs ≤ 80µs total per row under stated envelope.

**Pause transaction (commitment #8 extension):**
- On `pause` verdict, batch **seals through the pausing row inclusive**, fsyncs, acks. Remainder of batch returns to staging queue for re-evaluation in the next batch.
- Pausing row's `hook_verdict = pause` is **durable before L4 is invoked**. Crash recovery re-enqueues paused rows with no L4 verdict to the router. No double-decision.
- L4's eventual verdict (extensible enum per US-S-9) commits as a **subsequent WAL row** referencing the paused row's `seq`.
- One pause per commit cycle; second pause in same candidate batch goes to next batch.

**Recording (commitment #8 extension):**
- Two new nullable fields on `WalRecord`: `hook_verdict: u8?` (0=continue, 1=observe, 2=pause) and `hook_verdict_witness: blake3?` (CAS body: `{predicate_ids_fired, predicate_outputs}`).
- Either both NULL (no predicate matched) or both populated. `continue` verdicts with witnesses are valid (useful for "yes this predicate ran and said continue" audit trails) but optional — registrants choose at registration time whether to witness `continue`.
- Per-row cost: +1 byte tag always, +32 bytes when verdict ≠ continue OR witness requested. Zero when no predicate matched.

**Predicate registration (new L1 ABI):**
- Predicates are **registered by ID**, not passed per-row. Registration returns a handle with explicit lifetime (per Alexander's fork-isolation point: child-fork registrations do not back-propagate to parent).
- Registration **compiles** predicates to native ops where possible, bytecode fallback otherwise.
- Registration **indexes by `primitive_kind`** for O(1) dispatch on non-matching kinds.
- Predicates **may read** the row's resolved read-set entries; **may not call** L2 projections at evaluate time (snapshot projection-version IDs at registration instead).
- SLA envelope: ≤ ~50 compiled predicates per primitive_kind, read-set ≤ 32 entries, stays inside 80µs per row.

**Read-set integration:**
- Bus receives `(row, read_set_view)`; read-set entries are evaluated before bus runs, hash is sealed after.
- Predicates on read-set contents (set/tag/role/cardinality/hash-set) are first-class in v1.
- Transitive read-set queries are **out of scope for the hot-path bus** — materialize as a projection if needed.

**`cairn fsck` extension:**
- For every row with non-NULL verdict witness, the CAS witness blob must resolve and its declared `predicate_ids` must exist in the L5 registry snapshot for that `seq` range. Catches witness GC, registry drift, and re-registration races.

### What I need from the team to land this:

- **Alexander:** the predicate registration ABI (signatures, handle lifecycle, compile target) is yours to define; I'll implement the L1-side dispatch and the recording. Confirm fork-isolation lifecycle matches your "anything you missed" point #2.
- **Sonny:** US-S-1 match-spec subset has to be expressive enough that "common case" predicates compile to native ops rather than fallback bytecode. Worth a focused conversation on the subset shape before freeze.
- **Stelios:** projection-version IDs must be **stable hashes** that predicates can snapshot at registration time. Restating the US-S-2/US-S-4 ask; this just makes it load-bearing for the bus.
- **Laura:** when L3 generators want bus-enforceable read-set policy (tag predicates, citation requirements), the predicate registration site is L4 startup, not the proposal schema. The proposal schema field stays as-is; policy is a separate registration.
- **Erasmus:** determinism conformance suite needs one more assertion — *re-evaluated hook_verdict on replay must equal recorded hook_verdict*. Same shape as the read-set assertion. Free correctness signal.

None of this changes my round-2 commitments on snapshot cadence, compaction, or CAS spill. It adds two nullable row fields, one CAS blob kind, one ABI for predicate registration, and one new `cairn fsck` check.

The bus is endorsed. The pause path is unified through L4 per US-S-9. The observe path is unified through L2. Pre-commit hook bus is the substrate — and as a side benefit, putting it on the same row that carries the read-set hash makes the substrate genuinely composable rather than three independent mechanisms pretending to cooperate.

If it compiles and fsyncs cleanly, that's a win.

---

## Plain-text summary for the coordinator

**Verdict: ENDORSE with refinements.** The pre-commit hook bus belongs *per-row, inside the group-commit window, before the fsync barrier* — after `causal_read_set_hash` is computed, before the row is sealed. Pause mid-batch is handled by **seal-and-split**: the batch fsyncs through the pausing row inclusive (so already-verdicted rows stay durable), the pausing row's `hook_verdict=pause` is on disk *before* L4 is invoked (crash-safe), and the remainder of the batch returns to staging. The verdict is recorded in the WAL row via two new nullable fields (`hook_verdict: u8?`, `hook_verdict_witness: blake3?`) — costs +1 byte always, +32 bytes only when a non-continue verdict fires; replay re-derives and asserts equality. Predicate cost stays inside my 80µs row-stage budget **only with pre-registration + compilation + kind-indexed dispatch + no L2 callbacks at evaluate time**; this is a hard ABI requirement, not a recommendation. Read-set predicates ("pause if this Decision read any Observation tagged secret") are first-class and arguably the killer feature — the bus is where read-set policy becomes *enforceable* rather than merely *recorded*, which makes the two features properly co-designed rather than coincidentally adjacent.


## 2026-05-24 Round 4: Phase B reconciliation against `D:\git\stunning-adventure`
Full audit inbox: `.squad/decisions/inbox/roger-reconciliation-2026-05-24T2330Z.md`.

**Headline:** Cairn already ships a working append log (SQLite `event_log`), a real 8-state proposal/approval lifecycle (`prescriptions` + `optimization_hints` with 8 statuses each, partial UNIQUE index dedup as built-in backpressure via migration 013), pluggable ProposalGenerators (Forge `promptOptimizer`/`tokenOptimizer` emitting `OptimizationHint`), a Merkle-like hash chain over Decision events (`dbom_artifacts`/`dbom_decisions` + `spike/dbom-generator.ts`), per-skill PGO-style derived rollups (`execution_profiles`), an outcome-learning loop (`change_vectors` Phase 4.6), drift signal substrate (`signal_samples` + `forge/telemetry/drift`), pre-persist secret redaction (`agents/secretScrubber.ts`), and a 5-vector x 3-tier validator surface (`skillLinter`/`skillValidator`) -- so US-R-4 and US-Ro-NEW-4 are essentially ALREADY-EXISTS and US-R-1/2/7/8/9 plus US-Ro-NEW-3 are PARTIALLY-EXISTS. What's pure greenfield: US-R-3 (fork/replay/branch metadata over ledger positions), US-R-5 (transitive provenance -- falls out of R-3), US-R-6 (federation), US-Ro-NEW-1 (snapshot+compaction), US-Ro-NEW-2 (observation capture/CAS), and both round-3 lock items (`causal_read_set_hash` on WAL rows; per-row pre-commit hook bus with 80us envelope). The last two also **CONTRADICT-EXISTING** because Cairn rides `better-sqlite3` (SQLite's built-in WAL journal-mode -- no app-exposed group-commit window, no per-row pre-fsync hook insertion point, no 80us-row-stage budget to honor). Migration path is friendly (linear, integer-versioned, transaction-wrapped, currently at v13): v14 introduces `wal_records` alongside legacy `event_log`, v15 stands up a CAS blob store, v16 snapshots+refs, v17 observation_capture, v18 tenant namespacing -- all additive.

**One load-bearing question for Aaron, not unilaterally resolved:** does Crucible v1 ride Cairn's SQLite store (in which case I re-baseline the round-3 WAL/hook-bus contract to transaction-batched semantics -- bus runs on an app-owned staging buffer before `db.transaction().immediate()`, same logical verdicts and seal-and-split, different physical layer) or stand up a custom storage engine (round-3 verdict stands as-locked, 80us/row envelope is achievable)? Flagging because it changes what `causal_read_set_hash` and `hook_verdict` cost to land. Full per-story classifications, evidence file:line cites, gap list of Cairn capabilities not yet storied, and the v14-v18 migration spec are in the inbox.

-- Roger


## 2026-05-25 Round 5: SPIKE fork (a) — port Cairn to a custom storage engine
Full spike inbox: .squad/decisions/inbox/roger-spike-fork-a-port-2026-05-25T0030Z.md.

**Executive summary.** Surveyed the existing Cairn SQLite surface (87 src files, 31 in db/, 13 linear migrations, 16 tables, 188 prepared/transaction call sites, 80 join/groupby query sites, 478-ish tests, one load-bearing partial UNIQUE index for backpressure, zero use of FTS/virtual-tables/triggers/UDFs/triggers — relational but shallow) and three engine candidates: A.1 pure-Rust edb via NAPI-RS (12-16 weeks, ~100% SQL-ergonomics loss, strongest correctness story, adds a Rust toolchain to a Node monorepo), A.2 Kris Zyp's lmdb Node binding with its eforeCommit hook (8-12 weeks, ~100% SQL loss, 80us-budget at risk under JS dispatch), and A.3 hybrid — custom append-only WAL file in pure TS for L1 only, keep etter-sqlite3 for the other 15 tables and all derived views (5-9 weeks, ~5-10% SQL loss, forward-compatible migration). **Verdict: REJECT A.1, ENDORSE-WITH-CAVEATS A.3, A.2 only as fallback if the JS predicate budget fails in integration.** Phase A's hard contracts bind only L1; rewriting the other six tiers to honor a contract that does not bind them is over-correction. Anti-anchoring alternative reading: if Crucible is heading toward regulatory determinism, 10^9+ rows, or WASM-runtime distribution, A.1's "one substrate, contracts enforced by construction" wins despite the cost — I'd flip if any of those three become true. Tagged Alexander (fork (b) is a contract-amendment, not a contract-honor — sqlite3_update_hook fires post-write not pre-fsync) and Gabriel (fork (c) breaks causal_read_set_hash globality the moment you shard across multiple SQLite files — contract (4) needs amendment).

-- Roger


## Learnings (2026-05-28 — CTD Phase 1 Lane 1: §3 L1 WAL + §4 Hook Bus authored)

WAL design patterns and invariant-enforcement mechanisms locked in §3 + §4 that
I'll want when authoring §10 (Session Model) and §15 (Compaction/Snapshots) in
Phase 2:

- **One fsync per group-commit, CAS-before-WAL ordering.** The rule that lets
  the WAL row safely reference a `payloadHash`/`readSetHash`/
  `hookVerdictWitness`/`contextWindowCommitment` is that the CAS body is
  fsync'd *before* the WAL record is written. §15 compaction must preserve
  this ordering on snapshot-spill: snapshot blob durable in CAS before the
  snapshot pointer row lands in the WAL.

- **Self-audit by chain alone.** `prevRoot[i] = selfRoot[i-1]` plus per-row
  `selfRoot = BLAKE3(CBOR(row \ selfRoot))` plus a per-session
  `manifest.lastSelfRoot` makes `cairn fsck` a single linear scan with O(1)
  state. `index.idx` is advisory and rebuildable; never trust it for
  correctness, only for seek-speed. Carry this same discipline into §15 —
  snapshots are advisory acceleration, never authoritative.

- **Hybrid resolver as a named seam.** `ContextWindowResolver` honoring R2-1
  is a tiny pure function but giving it a name (instead of inlining the
  if-declared-else-prefix branch into `AppendProtocol.append`) makes the
  Bootstrap-Capture-Completeness violation path testable in isolation and
  keeps replay's reconstruction code symmetric with commit's hash code.
  Pattern: every "tagged hybrid" gets its own resolver seam, never inlined.

- **Verdicts as null vs continue.** `hookVerdict: HookVerdict | null` with
  `null` meaning "no predicate matched" and `continue` meaning "a predicate
  fired and said continue" is the cheapest way to preserve P5 (continue
  zero-cost) while keeping the closed-enum invariant (P3) honest. The
  binary layout encodes both as zero-witness; the bookkeeping distinguishes
  them only for replay determinism. §10 should not invent a third sentinel
  — null is the absence sentinel.

- **Exactly-once-pause via WAL-first durability.** Pause verdict durable on
  the WAL row *before* L1Subscriber broadcasts to the Router means a crash
  between seal and broadcast replays the broadcast from disk on next boot.
  The bus has no separate Router channel; the broadcast on the paused row
  *is* the Router's pause inbound. §10's session-reopen protocol must
  re-broadcast pending pause rows whose Router-ack Observation is missing.

- **Bootstrap atomicity = single group-commit.** §3.8 bootstrap-batch writes
  the entire `BootstrapPayload` as one atomic group-commit at offset 0. §10
  must never spread session bootstrap across multiple `append()` calls —
  the all-or-nothing property is what lets replay refuse to advance past
  offset 0 on bootstrap-manifest mismatch (TDD §6.8).

- **Fork = sibling directory + synthetic offset-0 row + cross-session chain
  edge.** No CAS body copy; CAS dedup is implicit by hash. `cairn fsck
  --with-parent` is the cross-edge walker. §10's fork API surface should
  expose these as three orthogonal capabilities (create dir, emit
  fork_origin Observation, link prevRoot) rather than one opaque
  `fork(parent, offset)` call — composability over economy.

- **Monotonic timestamps are advisory; offsets are structural.** Replay
  equality excludes `timestampNs` via `normalizeTimestamps()`; the `+1`
  floor absorbs wall-clock regressions; violations are recorded as
  Observation rows, never suppressed. Any future invariant I add in §10/§15
  should follow the same pattern: distinguish advisory metadata (excluded
  from replay equality, recorded as observable rows on violation) from
  structural data (byte-compared in replay).

- **Seam map as deliverable.** §3.14's table mapping internals to test tier
  + Laura collaborator + test double class is the load-bearing artifact for
  London-school component testing. I'll replicate this in §10 and §15 —
  every public collaborator gets a row, every internal pure function gets a
  row, every file-backed integration gets a row.

- **Per-tool-call primitive scale is intra-batch.** §3.6 enforces "one
  primitive per (toolCallId, phase)" within a batch only; cross-batch
  pairing of `invoke` → closing Artifact is Aperture's job, not L1's. §10
  session-config carries the pairing-window deadline so different session
  types (debug, prod, replay) can tune it.