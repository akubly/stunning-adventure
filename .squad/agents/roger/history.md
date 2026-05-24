📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Roger — History

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
