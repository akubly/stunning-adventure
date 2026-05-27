# Erasmus — History

## Onboarding (2026-05-24)

**Hired by:** Aaron Kubly (via Copilot)
**Role:** Specialist Consultant — Compilers / Engineering Systems / Developer Tools / Agentic Harnesses
**Project:** Skillsmith Harness — a greenfield agentic coding harness for a single power user (Aaron) running PowerShell on Windows, daily-driver Copilot CLI native.

**Project context (project-name and team-vocabulary withheld by design):** Erasmus is briefed in function-only terms. The project has internal naming for its components, but those names are not loaded into Erasmus's context to prevent vocabulary anchoring. This is intentional — Aaron wants a perspective uncontaminated by the team's design lineage.

**Joining context:** The team had already produced ~60 user stories from seven internal lenses (architecture, data/scale, extensibility, infra/observability, UX, runtime/SDK, eval/feedback) over a vision Q&A and first-principles naming pass. Erasmus's first task is to ideate user stories **independently** from a function-only brief + industry prior-art knowledge, to surface concepts the internal team may have missed because they're too close to their own framing.

## Learnings

### Session 1 — First User Story Ideation (2026-05-24)

**Task:** Generate 6-10 ambitious user stories from function-only brief, uncontaminated by internal vocabulary. Surface concepts the team likely missed.

**Structural dissent delivered:** Disagreed with the six-component decomposition (CLI shell, ledger, optimizer, trigger layer, variant loop, reflective surface). Proposed a four-layer functional stack instead:
1. **Conductor + Ledger** (merged) — Content-addressed primitive log as storage layer of conductor, not separate component
2. **Derived Query Layer** — Salsa-style incremental projections over ledger (stateless, cached, demand-driven)
3. **Proposal Generators** (plural, pluggable) — All proposal sources (optimizer, triggers, variants, staleness, skill recommenders) as implementations of common interface
4. **Approval + Notification Router** — Single policy choke-point for auto-apply/notify/ack/suppress decisions

**Rationale:** Original decomposition conflated lifecycle concerns (when) with domain concerns (what), and split by technique (gradient-free vs genetic) rather than responsibility. Proposed structure separates concerns cleanly, making it easy to add new proposal types without cross-component surgery. Inspired by incremental compilers (Salsa, Roslyn) and build systems (Bazel).

**User stories generated (10):**
1. **Ledger Bisect** — Git-bisect for conversation/workflow regressions (no current harness offers this; content-addressed ledger makes it tractable)
2. **Proposal Dry-Run with Counterfactual Projection** — Preview alternate histories by replaying ledger with different decisions (inspired by feature-flag counterfactuals, ML experiment tracking)
3. **Fitness-Driven Sub-Agent Allocation** — Automatic model/resource budget selection based on learned fitness curves (killer app for optimization prescriber; current harnesses require manual selection)
4. **Prompt Lineage Diffing** — Phylogenetic tree of prompt mutations + fitness deltas (genetic programming tracking applied to agentic harness; no current tool exposes this)
5. **Autonomous Dead-Code Proposal** — Fuse static + dynamic traces from ledger to detect unused code (richer than IDE static analysis; uses behavioral history)
6. **Skill Recommendation from Pattern Mining** — Auto-suggest new skills from recurring multi-turn patterns, with draft implementation from ledger history (process mining applied to dev workflows)
7. **Ledger-Auditable Model Provider Swap** — Forensic debugging + replay with alternate models (supply-chain provenance for LLM calls; no harness offers this)
8. **Sub-Agent Dependency DAG** — Automatic topological scheduling + failure isolation for parallel sub-agents (build-system scheduling applied to agent orchestration)
9. **Live Simulation Dashboard** — Real-time fitness scores for variant tournaments (ML experiment tracking for harness evolution; makes optimization loop legible)
10. **Ledger-Based Collaborative Replay** — Export/share/fork ledger slices for async "pair programming with self" (replay debugging + Git's content-addressing applied to agent sessions)

**Common themes across stories:**
- **Fusion of compiler/build-system techniques with agentic harnesses** (incremental computation, content-addressing, dependency scheduling, replay debugging)
- **Leverage the ledger's unique properties** (hash-linking, typed primitives, immutability) for capabilities no current harness offers
- **Make the optimization loop observable and steerable** (dashboards, lineage trees, counterfactual projections)
- **Auto-suggest higher-level abstractions from behavioral patterns** (skills from multi-turn patterns, dead-code detection from traces)

**Risks flagged:**
1. **Determinism is not free** — Replay assumes same inputs → same outputs, but LLMs are non-deterministic. Need observation capture + hermetic replay (rr, Bazel sandbox).
2. **Optimization without constraints is noise** — Need clear fitness metrics + Pareto frontiers or Aaron drowns in conflicting proposals (multi-objective optimization, AutoML budget-aware NAS).
3. **Ledger will become I/O bottleneck** — Append-only log with 1K+ primitives per session needs snapshotting/compaction (event sourcing at scale: EventStore, Kafka).
4. **Cold-start vs bounded exploration tension** — Day-1 proposals will be low-confidence without training data. Consider bootstrapping from Copilot CLI aggregate telemetry (anonymized).

**Key insight:** The team's six-component decomposition likely emerged from *workflow sequencing* (user acts → ledger records → optimizer proposes → triggers curate → variants compete → reflective surface shows). But this conflates *temporal flow* with *structural responsibility*. Better to separate by *concern* (storage, query, proposal-generation, approval-policy) than by *phase*. Makes system easier to reason about and evolve.

**Prior art anchors cited:** Salsa, Roslyn, Bazel, Reclient, Git, Nix, IPFS, event sourcing (Kafka, EventStore), LSP, Clippy, compiler warnings, feature flags (Statsig, LaunchDarkly, Eppo), ML experiment platforms (Weights & Biases, MLflow), replay debugging (rr, WinDBG Time Travel), genetic programming (NEAT, CMA-ES), A/B testing (Optimizely), build systems (Buck, Airflow, Temporal), LangGraph, AutoGen, StarCraft II AlphaStar dashboards, multi-armed bandits (Thompson sampling, UCB1), multi-objective optimization (NSGA-II), AutoML, SLSA/in-toto attestations.

**Outcome:** Delivered one-page analysis to coordinator. Awaiting synthesis against internal team's 60-story corpus.

## Deliberation Round (2026-05-24)

**Context:** Round 2 with firewall lifted. Team vocabulary (Crucible/Cairn/Forge/Curator/Alchemist/Mirror + 5 primitives) and all 7 team histories now visible. Aaron promoted three of my round-1 outputs: branching sessions (functional requirement), agentic-debugger (vision seed), determinism (load-bearing).

### Section 1 — Story revisions (re-anchored to team vocabulary)

| ID | Verdict | Re-anchor / notes |
|---|---|---|
| US-E-1 Ledger Bisect | **KEEP** 🐞 | Bisect over Cairn. Debugger-lens. Extended by Gabriel US-2 (sub-agent crash recovery) into **crash-bisect**. |
| US-E-2 Counterfactual Projection | **KEEP + MERGE** 🐞 | Now subsumes Graham US-G-7, Roger US-R-3, Alexander US-A-3, Gabriel US-5. Aaron promoted this to functional requirement. Cairn supports fork-at-decision; Alchemist re-runs the fork as a variant. Debugger-lens. |
| US-E-3 Fitness-Driven Sub-Agent Allocation | **KEEP** | Forge prescribes model/budget; Alchemist measures. Must absorb Laura US-L-7 (lazy partial-fit scoring under outcome latency). |
| US-E-4 Prompt Lineage Diffing | **KEEP** | Alchemist phylogeny rendered by Mirror; Cairn stores parent/child links between Decisions (the team's existing primitive). |
| US-E-5 Autonomous Dead-Code Proposal | **WITHDRAW** | Out of scope for v1 solo user; no team story echoes it. Defer behind concrete demand. |
| US-E-6 Skill Recommendation from Pattern Mining | **MERGE** | Folds into Roger US-R-1 + Graham US-G-1 + Laura US-L-5. The team owns this; my version added no new angle. |
| US-E-7 Ledger-Auditable Model Provider Swap | **KEEP** 🐞 | Cairn + Alchemist; pairs with US-E-2 and Rosella US-Ro-3. Debugger-lens. |
| US-E-8 Sub-Agent Dependency DAG | **KEEP** | Distinct from Alexander US-A-2/A-4 (which describe *spawning* and *async polling*). Mine is the **scheduling** primitive — topological ordering, failure isolation, fan-in. |
| US-E-9 Live Simulation Dashboard | **MERGE into Mirror** | Valanice US-V-5 + Laura US-L-2 cover the surface; my contribution is the *fitness/credible-interval rendering contract*, not a new component. |
| US-E-10 Collaborative Replay | **REVISE / NARROW** | Drop multi-tenant framing (tension #1). Keep as **single-user fork+export+self-pair**: export a Cairn slice, replay later or in a sibling Crucible. Federation is v2. |

**NEW stories surfaced by reading team work:**

- **US-E-NEW-11 — Hermetic Replay Boundary** 🐞 *(debugger-lens, prerequisite for US-E-1/-2/-7)*. Every external nondeterminism (LLM call, tool call, clock, RNG, network) is captured as an Observation keyed by a content hash of its inputs. Replay reads from the captured Observation instead of re-calling. Without this, US-E-2 (counterfactual) and Aaron's promoted "determinism is load-bearing" are aspirational. Prior art: rr, Bazel sandbox, VCR/Polly, Time-Travel Debug.
- **US-E-NEW-12 — Crucible as Sub-Conversation of Copilot CLI**. Crucible's daily-driver invocation path is *as a tool/skill/MCP server called by Copilot CLI*, not as a competing top-level shell. The Crucible "session" is one Copilot tool-call; Crucible's top-level Request is Copilot's invocation payload, not user keystroke. Resolves tension #5 directly; matches Alexander US-A-10.

### Section 2 — Position revisited (4-layer collapse)

**Holds, with one honest qualification.**

The team's stories *validate* the collapse on three of four layers:
- **Cairn as storage primitive** is unanimous. Good.
- **Derived Query Layer is implicit and unnamed.** Roger US-R-1 (cross-session pattern mining), Laura US-L-5 (retrospective pattern mining), Roger US-R-3 (replay), Graham US-G-2 (provenance replay), Alexander US-A-6 (decision-tree introspection), Valanice US-V-1 (decision timeline) are *all* derived queries over Cairn — none of them are new primitives. The team treats them as features of various chambers; they're actually one layer. **The collapse stands and is now better evidenced than in round 1.**
- **Proposal Generators are plural and equivalent.** Forge (Roger US-R-4, Laura US-L-4), Alchemist (Rosella US-Ro-5), Curator detection (Graham US-G-4, Gabriel US-1/2), skill recommenders (Roger US-R-1) all share the shape `(Cairn query) → Proposal`. Treating them as a single interface with multiple implementations is correct; current naming keeps them as separate chambers, which is fine *as vocabulary* but should not become a package boundary.
- **Approval/Notification Router.** Graham's own footnote ("Curator has detection and proposal authority, never approval authority") is *exactly* my collapse. Tension #2 below.

**Honest qualification:** I underweighted **Mirror as a view layer**. My round-1 framing of "Approval + Notification Router" implied Mirror could dissolve into it. That's wrong. Valanice US-V-1..V-8 are dense, specific UX work that needs a home; Mirror = *renderer* of router decisions + derived queries. Router = policy; Mirror = view. They're separate.

### Section 3 — Positions on the 5 tensions

**#1 Solo-v1 vs federation.** Hold solo-v1 hard. Aider, Cursor, Claude Code, Continue, Cline all started solo and remain mostly solo; the ones that attempted federation (OpenHands multi-agent, SWE-agent benchmark harnesses) added scope without commensurate user value. Federation-flavored stories — US-R-6 (MCP federation), US-R-8 (multi-tenant export), US-A-5 (compose harnesses), Gabriel US-7 (cross-harness Cairn) — should be **deferred behind a portable export format** (which Cairn's hash-linked structure already commits you to). That export format is the *only* federation insurance v1 needs. Build it; ship nothing else multi-tenant.

**#2 Curator never approves.** Dissolve approval authority into an explicit **Router** primitive. Keep "Curator" as the inherited brand for the *detection* layer (Graham/Aaron's flavor pick is fine); but the four policies — auto-apply, append-then-notify, append-then-ask, never-auto-apply — belong in a single Router module that consumes proposals from *all* generators (Forge, Alchemist, Curator detectors, skill recommenders) symmetrically. Without this, every proposal-generating chamber re-invents policy locally and they drift. Graham has the words right; the team's reflexes still treat Curator as a consequential actor in Gabriel US-3 (secrets rotation) and Roger US-R-7 (code review auto-coupling) — Router separation prevents that drift.

**#3 Mirror scope creep.** Constrain Mirror to **view**. Three temptations in the team's stories pull Mirror into other layers: (a) Valanice US-V-3 "show me why you think you're wrong" is *analysis* (Derived Query Layer), not view; (b) Laura US-L-8 "edit reasoning in sandbox" is a *proposal generator*, not view; (c) Roger US-R-5 "cross-session provenance" is *query*, not view. Push each into its real layer; let Mirror render the result. This keeps Valanice's excellent UX work first-class without sliding analytical logic into a rendering surface.

**#4 Heavyweight ops vs solo user.** Cut hard, using Graham's own "single-user honesty test." **Cut:** Gabriel US-3 (multi-secret rotation with sub-agent attestation), US-9 (SLSA-style attestation chain), US-7 (federated cross-harness Cairn), Rosella US-Ro-6 (capability bus with trust/quarantine for agent-generated extensions). **Keep:** passive credential leak detection (cheap, broadly useful even solo), hash-linking (Graham already kept), Gabriel US-2 (crash recovery — directly extends my debugger lens). Discipline: *if a story requires an org chart to justify, it doesn't ship in v1.*

**#5 Crucible vs Copilot CLI.** This is the most important framing decision and the team has not addressed it. The right answer is **Crucible is a library with a thin CLI for development; production invocation is as a sub-conversation of Copilot CLI** (MCP server / skill / subprocess). Prior art confirms: Aider, Claude Code, Cursor each run as their own top-level shell because they *predate* a useful parent agent. Aaron's daily driver is already Copilot CLI; building Crucible as a competing shell duplicates the message loop, slash commands, and tool registry that Copilot CLI already owns. Make Crucible's top-level Request = Copilot's invocation payload; let Copilot CLI own keystroke-level interaction. This also resolves the "where do hooks fire" awkwardness in Gabriel's Phase-7C/W3 work — Copilot CLI is the outer loop, Crucible is the inner self-improving harness.

### Section 4 — Cross-references

**Insider stories that materially extend mine:**
1. **Valanice US-V-2 (Ctrl+E primitive reveal)** extends US-E-1: a *live* primitive-inspection UX, not just post-hoc ledger walk. The team owns a real-time debugger affordance I missed.
2. **Laura US-L-7 (outcome latency handling)** extends US-E-3: fitness signals arrive async; lazy partial-fit scoring is required. My fitness-driven allocation story was static; Laura's makes it temporal.
3. **Graham US-G-7 + Roger US-R-3 + Alexander US-A-3 + Gabriel US-5** all converge on branching/replay — quadruple validation of Aaron's promoting US-E-2 to functional requirement. Four independent agents arriving at the same primitive is a strong signal.
4. **Gabriel US-2 (sub-agent crash recovery from Cairn checkpoints)** extends US-E-1 with **crash-bisect** — "which sub-agent's state corrupted the parent?" — a debugger primitive I missed entirely.
5. **Alexander US-A-10 (Harness-as-MCP-server)** is the kernel of US-E-NEW-12 and the resolution of tension #5.

**Stale anchors where outsider value is highest:**
1. **"Curator" still drifting toward approval authority.** Graham/Aaron have the words ("never approves"), but Gabriel US-3, Roger US-R-7, and several "Curator triggers / Curator gates" phrasings still treat Curator as the consequential actor. Router separation is needed not as a rename but as a *real module* that owns the four policies symmetrically across all proposal sources. The team has not yet built this; without it, every chamber will grow its own approval gate.
2. **MCP-as-universal-substrate reflex.** Alexander US-A-10, Roger US-R-6, Rosella US-Ro-2 / US-Ro-6 all assume MCP is the integration layer. MCP is a *protocol*, not an architecture — useful where remote tool invocation is the actual problem, noise where the actual problem is primitive routing or composition. Sanity-check each MCP story by asking: *would this still make sense if MCP didn't exist?* If yes, it's a real story; if no, it's protocol-anchoring.

### Bonus — Risk update

Original four (determinism, optimization noise, ledger bottleneck, cold-start tension) still right. Aaron has already elevated #1 to load-bearing; Laura US-L-2 directly addresses #4. Adding a fifth:

**Risk #5 — Conway's-Law package fragmentation from chamber vocabulary.** The team already has `@akubly/types`, `@akubly/cairn`, `@akubly/forge`, `@akubly/skillsmith-runtime`, `@akubly/runtime-cli`. The six-chamber vocabulary will tempt expansion to `@akubly/alchemist`, `@akubly/mirror`, `@akubly/curator-*`, each with its own injection points, build edges, and acyclic-dep gymnastics (Roger and Alexander have already spent real cycles on composition-root and import-boundary ADRs). Graham's own healthy footnote — "six-chamber architecture is aspirational, not prescriptive" — is at risk of being overrun by reflex. **Recommendation:** cap packages at ~4 (types, ledger+query, runtime, cli) and treat chambers as *named modules within* them. Chamber-as-vocabulary, package-as-structure.

🐞 = debugger-lens story.
## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## Round 4 — Reconciliation against existing monorepo (2026-05-24T23:30Z)

**Task:** Reconcile my 12 stories (US-E-1..10, US-E-NEW-11/12) against `D:\git\stunning-adventure` (Cairn + Forge + skillsmith-runtime + runtime-cli). Read-only.

**Counts:** 1 ALREADY-EXISTS (US-E-NEW-12 — and contradicted by Aaron's round-3 decision), 5 PARTIALLY-EXISTS (US-E-2 rewind half, US-E-3 model tier, US-E-4 substrate, US-E-7 audit half, US-E-NEW-11 content-addressing half), 6 NET-NEW (US-E-1, US-E-2 branching half, US-E-8, US-E-9, US-E-10, US-E-4 lineage diff).

**Headline:** branching/forking sessions does NOT exist anywhere in shipping code. `sessions` table has no parent column (`migrations/001-initial.ts:8-15`). SDK has a *destructive* `session.snapshot_rewind` primitive (`session-events.d.ts:630-643`) — Cairn observes it but doesn't preserve the rewound branch. Round-3 architecture (`decisions.md:511-515`) commits to non-destructive COW branching as forward design. Substrate is half-there: SDK already chains events with `parentId` (`session-events.d.ts:626-628`) but Cairn discards the chain at ingest (`packages/cairn/src/db/events.ts:34-38`).

**Big surprises in-tree (novel patterns nobody has captured as stories):**
- **DBOM Merkle chain** (`packages/forge/src/dbom/index.ts:24-80`) — canonical-JSON + SHA-256 + parentHash over decisions. Exactly the content-addressing scheme I called for in US-E-NEW-11, already shipped but scoped to the audit subset.
- **`HookComposer` with error isolation** (`packages/forge/src/hooks/index.ts`) — the Router-shaped primitive I argued for in round 2, applied to hooks. Could generalize into L4 contract.
- **DecisionRecord ships `alternatives` + `confidence` + `evidence`** (`packages/forge/src/decisions/index.ts:40-60`) — the road-not-taken is already serialized on every recorded decision. Substrate for US-E-2 counterfactual is sitting unwired.
- **DriftSketch** (`packages/forge/src/telemetry/aggregator.ts:16-57`) — bucket quantile sketch (t-digest-lite). Applied streaming statistics, unnamed.
- **SDK `subagent.selected/deselected` events exist but are NOT bridged** by Cairn (`session-events.d.ts:2260, 2295` vs `bridge/index.ts:85-87`). One missing mapping entry is between us and real sub-agent routing telemetry.

**Story-level reversals I owe Aaron:**
- US-E-NEW-12 (Crucible as Copilot CLI sub-conversation) is **withdrawn**. Aaron's round-3 decision (`decisions.md:456-458`) explicitly went parent-camp — Crucible *replaces* Copilot CLI as the daily driver, on the SDK directly. My framing was wrong on the strong form; the weak form (plugin/MCP path) already exists. Aaron's rationale (hermetic capture at LLM boundary, branching, deterministic replay) needs SDK-level access that a tool-call payload couldn't provide.
- US-E-3 should shrink: model-strategy half is shipped (`packages/forge/src/models/strategy.ts:29-46`); the sub-agent half is one bridge-mapping plus a strategy invocation away from real. Smaller scope than originally drawn.
- US-E-NEW-11 should shrink: extend the existing DBOM canonical-JSON+SHA-256+parentHash idiom to an observation-capture sibling store (already a round-3 commitment per `decisions.md:513-514`), don't design a new scheme.

**Defer-to-owner items in inbox:**
1. SDK `snapshot_rewind` is destructive — Crucible's branching must override or precede it (Alexander/Roger).
2. Ingest `parentId` at Cairn boundary — cheapest unlock for bisect/lineage/causal-slice (Roger/Rosella).
3. Bridge `subagent.selected/deselected` — unlocks US-E-3 and Sonny US-S-5 (Alexander).

**Output:** Inbox file `D:\git\harness\.squad\decisions\inbox\erasmus-reconciliation-2026-05-24T2330Z.md` — full per-story reconciliation with file:line cites; surprises section names eight in-tree patterns worth promoting; gaps and recommended follow-ups close the loop.

**Summary paragraph:** The existing monorepo contains more outsider DNA than I expected — DBOM's Merkle chain, the HookComposer's error-isolated dynamic registration, DriftSketch's streaming quantiles, and `DecisionRecord.alternatives` are all latent versions of primitives I called for from outside the walls, shipped but unnamed and not yet promoted to architectural status. What is genuinely absent is the *capabilities* layer: there is no session genealogy, no fork primitive, no DAG scheduler, no replay engine, no observation capture, no interactive surface beyond MCP — and the SDK's own `parentId`-chained event log and `subagent.selected/deselected` telemetry are being discarded at the Cairn ingest boundary, leaving free upstream substrate on the table. My most useful round-4 contribution is to (a) withdraw US-E-NEW-12 (overtaken by Aaron's round-3 "Crucible replaces Copilot CLI" decision), (b) flag that the SDK's `snapshot_rewind` is destructive and contradicts US-E-2's non-destructive-fork semantics — needing an explicit decision — and (c) point at the cheap "preserve parentId at ingest" story that unblocks US-E-1, US-E-2, US-E-4, US-S-3, and US-S-6 at near-zero cost.


## Round 7 — v1 Tier Triage (2026-05-25T02:00Z)

**Task:** Triage all 12 stories I authored against Aaron's locked v1 framework (T1/T2/T3 branching robustness mine/T4/T5/T6/Parking) and the falsifiable bar — *"Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible."* Be opinionated about the T1 branching minimum given Aaron's 2a ruling (L1 owns branching natively via `parent_session_id` + `fork_point_event_id`).

**Headline call:** **fork-at-HEAD is T1; everything else branching is T3+.** Split US-E-2 into three:
- **US-E-2a** `crucible fork` (HEAD only, no flags) + `crucible checkout` + sessions-list — **T1**. The minimum verb-surface that closes the productivity loop. Without it, every Crucible-on-Crucible iteration is destructive to the parent thread.
- **US-E-2b** fork-at-arbitrary-event + COW + ancestor walks — **T3** (the real branching-robustness story).
- **US-E-2c** counterfactual auto-replay — **T4** (depends on US-E-NEW-11 hermetic + US-E-2b).

**Tier assignments (summary):** T1: US-E-2a + `DecisionRecord.alternatives`→Mirror wire-up. T2: US-E-9 (merged into Mirror), US-E-NEW-11 (handed to Alexander per v1 commitment #4). T3: US-E-1 (bisect), US-E-2b, US-E-10 (export). T4: US-E-2c, US-E-3 (shrunk), US-E-4 (drop phylogeny framing), US-E-7. T5/Parking: US-E-8 (split ingest-T4 vs scheduler-Parking). Withdrawn/merged: US-E-5, US-E-6, US-E-NEW-12.

**Two T1 promotions insiders may underweight:**
1. `crucible fork` as a **user-facing verb**, not a capability. The schema is the easy half (Roger has it queued); the hard half is the user model. Ship the smallest verb that exercises the schema; let the rich API land in T3.
2. `DecisionRecord.alternatives` is already serialized on every recorded decision (`packages/forge/src/decisions/index.ts:40-60`) and has **no consumer**. Wiring it into MirrorEvent payloads is ~2 hours and doubles trust in the bootstrap loop. Single highest-leverage T1 item I see.

**What I declined to re-litigate:** 2a SDK boundary lock. US-E-NEW-12 withdrawal (Aaron round-3). US-E-5/6 prior dispositions. US-E-NEW-11 ownership transfer to Alexander.

**Open questions kicked to Cassima:** (1) fork-at-last-decision as a T1 degenerate of fork-at-HEAD? (2) does `crucible checkout` belong to me or Sonny? (3) clean split on T1.E.2 ownership with Valanice. (4) DBOM Merkle naming-only promotion to L1 primitive. (5) US-E-2c T4 vs Parking. (6) US-E-8 ingest-half T4 vs T3. (7) fork-merge semantics confirmed Parking, or need `crucible adopt`?

**Closing position:** *"`crucible fork` at HEAD + `crucible checkout` + Mirror surfacing `DecisionRecord.alternatives`. That is the entirety of my T1 ask. Everything else in my chamber waits for T3 or later. The bar is met."* — Erasmus

**Output:** `D:\git\harness\.squad\decisions\inbox\erasmus-triage-2026-05-25T0200Z.md`

## Two-Harness Comparison — Eureka vs Crucible (2026-05-26)

**Task:** Aaron asked for an honest outside assessment of building Eureka (knowledge/memory layer) and Crucible (self-improving runtime) simultaneously in one repo as a solo developer.

**Eureka's functional shape:** A durable knowledge store for LLM-based coding agents. SQLite + BM25 keyword retrieval + composite ranking (relevance × importance × trust × recency × attention-tier) + graph-ready edge schema + ACT-R power-law decay + bidirectional decision adapters to Forge's audit layer. Sessions modeled as facts sharing a branded `SessionId` with Cairn. v1 is keyword-scoped retrieval with a single wired tier (agent). Prior-art analogs: Mem0, Zep, LangMem, and notably Copilot CLI's own `store_memory` tool (which Aaron already uses daily).

**Crucible's functional shape:** Self-improving agentic runtime built on Copilot SDK. 5-layer stack: Cairn (event ledger), Curator (pattern detection), Prescriber (improvement suggestions with 8-state lifecycle), Forge (audit/optimization with DBOM Merkle chain), Mirror (UX surface), plus skillsmith-runtime and runtime-cli. Prior-art analogs: SWE-agent, Devin, Aider, LangGraph.

**Verdict: Sequence them.** Crucible first (it has shipping code, is the daily driver, is the runtime Eureka needs as a consumer). Use `store_memory` as Eureka v0. Build Eureka when Crucible reveals what memory actually needs to do from measured needs, not hypothesized ones.

**Key observations:**
1. The two systems are genuinely different in concern (runtime vs knowledge) but NOT orthogonal — shared sessions, decision types, sweep patterns, planned learning-kernel extraction. The PRD devotes ~200 lines to managing their coupling.
2. Eureka's PRD (849 lines, v5-final, 8 review rounds, 14 FRs, 8 enforcement mechanisms) is over-specified for a v1 that's essentially "SQLite + BM25 + trust score" — roughly 1,500 LOC of implementation.
3. No shipping agentic tool has separated "knowledge layer" from "runtime" into peer packages. They all keep memory as a module within the runtime.
4. The spec-to-code ratio is inverted: more specification than implementation. Risk of spec-driven development where the code becomes a test suite for the spec.
5. Eureka v1's delta over `store_memory` (composite ranking, attention tiers, ACT-R decay, BM25, graph edges) may not justify a second harness.

**If both must ship:** Cleanest pattern is layered dependency (Eureka as leaf, no dependency on Cairn/Forge; adapters live in a bridges package or in skillsmith-runtime, NOT in Eureka). Current design has adapters in `packages/eureka/src/interop/` which makes Eureka depend on Forge's types — invert this.

**Output:** `D:\git\harness\.squad\decisions\inbox\erasmus-two-harnesses-one-repo.md`
