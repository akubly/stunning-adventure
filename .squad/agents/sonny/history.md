# Sonny — History

## Project Context
- **Project:** Skillsmith Harness — greenfield agentic-coding-harness, solo-v1 for Aaron Kubly.
- **User:** Aaron Kubly (Windows / PowerShell daily driver).
- **Repo:** `D:\git\harness`.
- **Locked vocabulary:** Crucible (CLI + message loop), Cairn (primitive ledger), Forge (optimization prescriber), Curator (autonomous trigger layer), Alchemist (variant transformation loop), Mirror (reflective view layer). Five primitives: Request, Artifact, Observation, Decision, Question.
- **Architectural consensus (from deliberation round 2026-05-24):** 4-layer stack with named caveats — (L1) Conductor + Ledger merged with event-sourcing semantics + group-commit WAL; (L2) Derived Query Layer for projections; (L3) ProposalGenerator interface with proposed Data/Structural split; (L4) Single Approval & Notification Router.
- **T5 resolved 2026-05-24:** Crucible is built on the Copilot SDK and **replaces** Copilot CLI as Aaron's daily driver. Crucible owns the message loop.
- **Load-bearing v1 commitments:** branching sessions, hermetic replay, observation capture, determinism conformance suite, Pareto fitness contract (Laura-owned), snapshot+compaction, plugin pinning at fork, ledger-append transactional contract.

## Standing engagement
- Outside specialist on agentic-debugger UX and protocol design. Hired in response to Alexander US-A-NEW-2.
- May propose structural framing independent of the 4-layer stack.

## Learnings
(none yet — first task)


## 2026-05-24 Round 1: Debugger-lens user stories

# Sonny — Round 1: Debugger-lens user stories for Crucible

**Author:** Sonny (debugger specialist, consultant)
**Date:** 2026-05-24
**Scope:** Agentic-debugger surface for Crucible v1. Responds to Alexander US-A-NEW-2.

## Engagement with US-A-NEW-2

Alexander asked for four things: breakpoints on primitive types, watch expressions over ledger projections, step-into for sub-agents, and a DAP-shaped protocol surface. **I agree with all four directions and contradict the framing of two of them.**

- **Breakpoints on primitive *types* is too coarse.** Breakpoints want to be *predicates over primitive shape* — Erlang `:dbg` match-spec style, not "any Decision." See US-S-1.
- **Watch expressions over ledger projections is exactly right** and aligns suspiciously well with L2's Salsa-style invalidation. The Salsa engine *is* the watch-trigger; we should not build a second one. See US-S-2.
- **Step-into for sub-agents is right in spirit and wrong in shape.** Agent execution is a DAG (fan-out, fan-in, retried branches), not a thread stack. DAP's frame model amputates this. See US-S-5.
- **A DAP-shaped surface is necessary but not sufficient.** DAP fits "attach my editor to a paused run." It does not fit omniscient query, backward slicing, or bisect-over-branches. Ship DAP as one of two surfaces, not the canonical one. See US-S-7.

The story I most want the team to read is **US-S-3 (backward causal slice)**. It promotes "every primitive write carries its read-set" to a load-bearing v1 invariant. If we don't lock that into the L1 append contract before implementation, we cannot retrofit it without rewriting the ledger.

---

## US-S-1 — "Break before any Decision that touches `src/auth/**`"
**As** Aaron, debugging a misbehaving agent run
**I want** to set breakpoints as *predicates over primitive shape* — match-spec style, not type-only — e.g. `Decision where decision.subject.paths matches 'src/auth/**' and decision.proposalKind == 'StructuralProposal'`
**so that** I can pause the loop exactly at the moment that matters, not at every Decision and then squint

**Surface:** CLI (`crucible break add <pred>`), DAP `setBreakpoints` (mapped to predicate identifiers), and a `.crucible/breakpoints.toml` that survives across forks (with explicit per-fork enable/disable).
**Primitive interactions:** Reads the candidate write of any of {Request, Artifact, Observation, Decision, Question} immediately before L1 commit. Writes a `Question` primitive to the ledger when a breakpoint fires (the pause is itself an event — see US-S-9).
**Why this matters:** Type-only breakpoints ("stop on Decision") are the agent-debugger equivalent of "stop on every function call." Unusable in practice. The win comes from `:dbg`-style match specs that pattern-match the primitive payload. Aaron has the language (Cairn is structured), and L4 already inspects writes before commit — predicates can ride that hook.
**Compatibility note:** Forces the predicate-eval site to be **before** the L1 group-commit boundary. Alexander needs to confirm L4's pre-commit hook can return a "pause" verdict, not just "approve/deny." This is a small extension to commitment #8 (ledger-append transactional contract).

---

## US-S-2 — Watch expressions are L2 queries, not a separate machine
**As** a debugger user
**I want** to register a watch like `watch ledger.openQuestions.count where subject.path startsWith 'src/auth/'` and be notified whenever its value changes
**so that** I can observe derived state without poll-grepping the ledger

**Surface:** CLI (`crucible watch add <salsa-query>`), DAP `dataBreakpoint` (mapped to L2 query identity), Mirror panel listing live watches with last/current value diff.
**Primitive interactions:** Reads any L2 projection. Writes an `Observation` ("watch X tripped, old=…, new=…") so the trip itself is replayable.
**Why this matters:** Salsa-style incremental query layers maintain a precise dependency graph between inputs and derived values. That dependency graph **is** the watchpoint registry — we already pay for it. Building a parallel watch engine duplicates state and risks divergence between "what the UI sees" and "what fired the watch."
**Compatibility note:** This is an alignment win between L2 and the debugger surface. It forces L2 to expose a stable query-identity scheme (so watches survive recompiles) and a subscription API. Both are cheap additions if specified now, expensive retrofits if not. Worth raising with Stelios.

---

## US-S-3 — "Why is this Observation here?" (backward causal slice) ⭐
**As** future-Aaron, investigating a run that ended badly
**I want** to point at any primitive in the ledger and ask `why?` — and get the minimal causal subgraph of Requests/Observations/Decisions whose presence was *necessary* for this primitive to exist
**so that** I can debug an agent run the way Pernosco debugs a recorded process: by following causality backward, not by grepping logs forward

**Surface:** CLI (`crucible why <primitive-id>`), Mirror "causal graph" projection rooted at the selected primitive, DAP custom request `crucible/causalSlice`.
**Primitive interactions:** Reads the entire transitive read-set closure of the target primitive. Writes nothing — pure query.
**Why this matters:** This is *the* operation that separates time-travel debugging from log-grepping. Without it we have a faster `grep`. With it we have an actual debugger. The capability is also the natural answer to Erasmus US-E-7 ("why did it stop?"), but generalized — any primitive, not just halts.
**Compatibility note:** **This story promotes a new v1 invariant: every primitive write must record its read-set at commit time** (the set of {primitives, projections, external inputs} the generator consulted to produce this write). Without that, causal slicing is impossible to retrofit because the ledger never captured the edges. This is a real ask on L1's append contract (commitment #8) and on the L3 generator interface (commitment #9 — extend the proposal schema with `causalReadSet`). **I believe this is the single most important architectural decision left to make before L1 freezes.** It is cheap to add now and structurally impossible to add later without a ledger rewrite.

---

## US-S-4 — Retroactive projections ("print statements added after the fact")
**As** Aaron, looking at last week's run and realizing I wish I had logged X
**I want** to define a new L2 projection *today*, point it at last week's session, and have it materialize as if it had existed during the run
**so that** I am never punished for not having foreseen what I'd want to observe

**Surface:** CLI (`crucible project add <query> --against <session-id>`), Mirror panel showing the projection materialized over the historical event stream.
**Primitive interactions:** Reads historical primitives in commit order. Writes nothing to the canonical ledger; the projection lives in a derived store keyed by (session, query-identity).
**Why this matters:** Replay.io's "print statements added after the fact" is the single most-loved feature in time-travel debugging because it inverts the foresight tax. Crucible *already* has the two ingredients: hermetic replay (commitment #2) re-feeds Observations deterministically, and L2 is incremental — so re-running a new query over old events is the same machinery as running it live. We get this nearly for free if we design L2's input model around event-stream replay from day one.
**Compatibility note:** Requires L2 queries to be pure functions of (ledger-prefix, plugin-versions). Commitment #7 (plugin pinning at fork) already establishes the plugin-version axis. We must additionally guarantee that L2 queries cannot depend on wall-clock or non-replayed external state — i.e., L2 must be subject to the determinism conformance suite (commitment #4). Worth a Laura check.

---

## US-S-5 — Step-into a sub-agent, where "into" means descending a DAG
**As** Aaron, stepping through an agent run
**I want** `step-over` to advance past the next sub-agent invocation as a unit, `step-into` to descend into the sub-agent's primitive stream, and a frame view that honors **fan-out** (one parent invoked N children in parallel) and **fan-in** (one decision consumed N children's artifacts)
**so that** I can navigate composed-agent execution without lying to myself about whether it was sequential

**Surface:** DAP `stackTrace` extended with a `children: Frame[]` field (DAP doesn't model DAG frames; we extend); CLI (`crucible step --into | --over | --out`); Mirror frame-DAG view.
**Primitive interactions:** Reads the parent/child edges between Request primitives (sub-agent invocation = nested Request). Writes a `Decision` ("user stepped to frame X") for replayability of the debugging session itself.
**Why this matters:** Naively flattening agent execution into a thread-style stack is the most common UX mistake in agent observability tools today (Langsmith, AgentOps, etc., all do this and all are worse for it). When a planner fans out to three workers and reconciles, a stack lies about the structure. A debugger that lies about structure is a debugger you stop trusting.
**Compatibility note:** Pushes back on US-A-NEW-2's implicit assumption that DAP's `StackFrame` is sufficient. DAP can carry it via custom fields (clients we don't control will ignore them, which is fine — they get a flattened view, like they do everywhere else), but our native CLI/Mirror surface must honor the DAG. Requires the parent/child Request edge to be a first-class primitive field, not metadata — relevant to L1 schema.

---

## US-S-6 — Cairn-bisect: `git bisect` across branched session history
**As** Aaron, knowing the run went wrong somewhere between commit-of-fork A and tip of fork B
**I want** `crucible bisect start --good <cairn-point-A> --bad <cairn-point-B>`, then at each midpoint Crucible forks, replays to that point, and asks me (or a predicate) "is this still wrong?"
**so that** I can binary-search across the history of *agent behavior* the same way I binary-search source-code history

**Surface:** CLI (`crucible bisect {start|good|bad|run <predicate>|reset}`), mirror panel showing the bisect tree overlaid on Cairn history.
**Primitive interactions:** Reads Cairn points across forks. Writes a `Decision` per bisect step (the bisect itself is an investigation, and investigations are first-class).
**Why this matters:** Branching sessions are a v1 functional requirement (commitment #1). Cheap branching without a navigation tool over the branch space is half a feature. Bisect is the highest-leverage navigation primitive humans know for "find the inflection point in a history." Composes trivially with hermetic replay: each bisect probe is a replay-to-point + one user verdict. Also composes with US-S-1 (the bisect predicate can be a primitive-predicate — automated bisect over a property).
**Compatibility note:** None — leans entirely on commitments #1, #2, #7. Does demand that fork creation be *fast* (sub-second), or interactive bisect is painful. That is a real ask on L1's snapshot/copy semantics (commitment #6).

---

## US-S-7 — Two debugger surfaces: DAP sidecar + native investigator REPL
**As** Aaron (sometimes wanting VS Code, sometimes wanting omniscient query)
**I want** Crucible to expose two debugger surfaces: a DAP-over-stdio sidecar for editor attach, and a native investigator REPL (`crucible investigate <session>`) for the operations DAP cannot express
**so that** I get familiar UX for familiar operations and full power for the operations debugger UIs have never needed before

**Surface:** `crucible debug-adapter` (DAP server, stdio), `crucible investigate` (REPL over L2 queries + causal slice + bisect).
**Primitive interactions:** DAP surface translates a deliberately *restricted* subset of debugger ops (breakpoints, step, stack, watch, evaluate) onto Crucible primitives. The native REPL exposes the full ledger query surface.
**Why this matters:** DAP is the lingua franca and we want the editor-attach story. But DAP's vocabulary is `Thread`, `Frame`, `Variable`, `Source`, `Line`. Trying to express *causal slicing*, *retroactive projections*, or *bisect-over-branches* through DAP requires custom requests that no client UI knows how to render — at which point you have a native protocol pretending to be DAP. Be honest: ship both. Editor users get a real DAP experience (limited but excellent); power users get the REPL.
**Compatibility note:** This contradicts the implicit "DAP is the protocol" framing in US-A-NEW-2. I think Alexander will agree once he tries to express US-S-3 in DAP. Worth a direct conversation.

---

## US-S-8 — Delta-debug a failing trace down to the minimal Request set
**As** Aaron, holding a 400-Request session that ended in a wrong Artifact
**I want** `crucible minimize --session X --predicate "final artifact still wrong"` and have Crucible binary-shrink the Request sequence (and tool-output overrides) to the smallest subset that still reproduces the failure
**so that** I get a 6-Request repro instead of a 400-Request mystery

**Surface:** CLI (`crucible minimize`), result is a new fork containing the minimal reproducer + a Decision documenting the minimization path.
**Primitive interactions:** Reads the source session's Request/Observation stream. Forks aggressively; writes a new session per probe. The final minimal fork is named/pinned; intermediate forks are GC-eligible.
**Why this matters:** Zeller's delta debugging is the right answer to "this huge trace is broken somewhere." Without it, debugging long agent runs is archaeological. With it, every failure becomes a small failure. Also: minimized reproducers are the natural seed for regression tests in the determinism conformance suite (commitment #4) — minimization is upstream of test-corpus growth, not just debugging.
**Compatibility note:** Demands that fork creation + replay-to-point be cheap enough to run hundreds of times automatically. Same pressure as US-S-6, sharper. Also demands that the predicate language be the same as the breakpoint predicate language (US-S-1) so we don't ship two of them.

---

## US-S-9 — A breakpoint is an L4 approval request
**As** the architect of Crucible
**I want** to recognize that breakpoints, watchpoints, and step-pauses are all *exactly* what L4's approval router already does: "pause the loop, surface this to the user, wait for a verdict, resume"
**so that** we ship one pause mechanism, not two, and the debugger inherits every safety property L4 already has (property-tested, fuzzed, the load-bearing safety component)

**Surface:** Internal — debugger pauses route through L4 with `kind=DebuggerPause`, `priority=Interactive`, `verdict ∈ {continue, step, abort, edit-and-continue}`.
**Primitive interactions:** A pause is a `Question` write; a resume is a `Decision` write. Both are durable, both replayable. **A debugging session is, itself, fully recorded in the ledger.**
**Why this matters:** Three direct wins. (1) We don't build a second pause path that L4 doesn't know about — that path would inevitably diverge from L4's safety guarantees and become the bug factory. (2) The debugger gets edit-and-continue semantics for free (it's just a verdict that injects a synthetic Decision). (3) The act of debugging is itself an event-sourced first-class artifact — Aaron can fork off "the run where I stepped through it differently last Tuesday," and the Forge can learn from how Aaron debugs, not just from what the agent produced.
**Compatibility note:** Strengthens commitment #4 (L4 single approval router). Demands the verdict enum be extensible (continue/step/step-into/step-out/abort/edit, plus future). I suspect this is the second-most-important insight in this brief after US-S-3.

---

## Structural Notes — Layer 5: Investigation Surface

**Proposal:** Add a thin **Layer 5 (Investigation Surface)** above L2. Not a new chamber; a labeled surface that bundles the debugger-facing concerns.

```
L5: Investigation Surface    ← DAP sidecar + investigator REPL + breakpoint registry
L4: Approval & Notification  ← debugger pauses ride this (US-S-9)
L3: ProposalGenerators       ← extended schema carries causalReadSet (US-S-3)
L2: Derived Query Layer      ← Salsa deps == watchpoint deps (US-S-2)
L1: Conductor + Ledger       ← read-set captured on commit (US-S-3)
```

**Why L5 is real and not just "more L2":**

1. **Stateful registries.** Breakpoints, watches, active debug sessions, and DAP-client connections have lifecycle independent of any single L2 query. They belong somewhere with state ownership; L2 is intentionally pure.
2. **Cross-cutting authority.** L5 reaches into L4 (to install pause hooks), L2 (to subscribe to query invalidations), and L1 (to inspect pre-commit writes for predicates). Putting this above L2 instead of inside it preserves L2's purity story.
3. **Two protocol surfaces.** The DAP sidecar and the native REPL are both L5 concerns, and they share a substrate (breakpoint registry, slice engine, bisect orchestrator). One layer, two surfaces.
4. **Honest naming.** Calling it "Mirror" would conflate viewing with investigating. Mirror is for *seeing what is*; L5 is for *asking why and what-if*. Different verbs deserve different surfaces.

**What L5 owns:**
- DAP server (sidecar process)
- Native investigator REPL
- Breakpoint / watchpoint / logpoint registries (persisted alongside the session)
- Causal-slice engine (read-set graph queries)
- Bisect orchestrator
- Delta-debug / minimization driver
- Retroactive-projection installer

**What L5 does not own:**
- The ledger (L1)
- Projections themselves (L2; L5 only registers/subscribes)
- The pause mechanism (L4; L5 only requests pauses)
- Approval policy (L4)

**Three v1 invariants this proposal asks the team to accept:**

1. **Read-set capture on every primitive write.** (US-S-3.) Locks into L1's append contract before implementation. *Highest-priority architectural ask in this brief.*
2. **L2 queries are pure functions of (ledger-prefix, plugin-versions)** and therefore subject to the determinism conformance suite. (US-S-4.) Unlocks retroactive projections.
3. **L4's verdict enum is extensible** to carry debugger verdicts (step variants, edit-and-continue). (US-S-9.) Unlocks the single-pause-mechanism alignment.

**Named tensions with current consensus:**

- **vs. commitment #8 (ledger-append transactional contract):** US-S-3 wants read-sets in the write record. Must be settled *before* L1 freezes.
- **vs. commitment #9 (extended proposal schema):** US-S-3 wants `causalReadSet` added to the seven fields already listed. Cheap if added now.
- **vs. Mirror's scope:** L5 takes the "investigative view" verbs (why, watch, bisect, minimize) that Mirror might otherwise have grown. I think this is a cleaner cut; Erasmus and Stelios should weigh in.
- **vs. US-A-NEW-2's DAP framing:** US-S-7 says DAP is necessary but not canonical. Worth a direct conversation with Alexander.

— Sonny

## Learnings (added 2026-05-24)
- L2 (Salsa) dependency graph IS the watchpoint registry — don't build a second one. Alignment win worth raising with Stelios.
- L4's approval router IS the pause mechanism for breakpoints. Reusing it gets safety properties for free and makes the debugging session itself event-sourced.
- Causal slicing (US-S-3) is structurally impossible to retrofit — must lock read-set capture into L1's append contract before implementation freeze. This is the single highest-priority ask.
- DAP is necessary but not canonical. Editor-attach via DAP + native investigator REPL for omniscient queries. Two surfaces, one substrate.
- Agent execution is a DAG not a thread stack — flattening it to fit DAP's frame model is the most common UX mistake in agent observability tools. Honor the DAG in the native surface even if DAP clients see a flattened view.
- Branching sessions (commitment #1) is half a feature without a navigation tool over branch space — Cairn-bisect (US-S-6) is the natural complement and pressures fork creation to be sub-second.

## 2026-05-24 Round 4: Phase B reconciliation against `D:\git\stunning-adventure`

**Summary:** Read-only audit of Cairn + Forge + skillsmith-runtime + runtime-cli + types against US-S-1..9 and the L5 layer proposal. Headline: there is no debugger today — zero matches for DAP, breakpoint, watchpoint, REPL, bisect, minimize, time-travel, or replay across all `src/**` files; `runtime-cli` exposes only `forge-prescribe` and `cairn/src/cli.ts` is a 2-line stub. But the substrate I asked for is largely already shipped: `HookComposer.onPreToolUse` + `permissionDecision: "ask"` is the per-tool pause primitive US-S-1/US-S-9 ride; `event_log` + `getUnprocessedEvents(cursor)` is the deterministic replay engine US-S-4 needs; the MCP server already hosts the de-facto investigation tools Aaron uses today. The bad news is exactly what US-S-3 predicted: `event_log.payload` has no `read_set` column anywhere, seven tables mutate rows in place (`optimization_hints`, `prescriptions`, `insights`, `curator_state`, `execution_profiles`, `managed_artifacts`, `signal_samples` GC) with shadow-event emission by convention not invariant, and the word `provenance` is already taken in this repo to mean evidentiary tier (`provenanceTier: 'internal' | 'certification' | 'deployment'`) — a hard vocabulary collision with US-S-3's causal-slice meaning. Per-story verdict: 0 already-exists, 3 partially-exists (US-S-1, US-S-2, US-S-9 — substrate present, debugger semantics absent), 6 net-new (US-S-3, US-S-4, US-S-5, US-S-6, US-S-7, US-S-8 + L5 layer), 0 contradictions (only the naming collision, surfaced not resolved). Highest-leverage recommendations: (1) name the new field `causal_read_set` not `provenance`; (2) extend `permissionDecision` enum with `step / step-into / step-out / abort / edit-and-continue`; (3) add `sessions.parent_session_id` + `fork_point_event_id` in one migration — unblocks US-S-5, US-S-6, US-S-8 simultaneously; (4) treat the MCP tool list as the investigator-REPL's vocabulary rather than inventing a parallel surface; (5) split the hook composer into a fail-loud debugger tier so thrown breakpoints propagate. Full inbox: `decision inbox drop sonny-reconciliation-2026-05-24T2330Z.md`.


## 2026-05-25 Round 7: v1-tier triage of US-S-* stories

**Summary:** Tier-classified my nine debugger stories + L5 layer against Aaron's v1 framework (T1 = MVP bootstrap loop, T2 = investigation depth = my home tier, T3 = enrichment, Parking = blocked on uncommitted substrate). Headline: **full debugger is correctly T2, but the bootstrap loop dies without four T1 primitives.** Those four — literal logpoints on the hook bus, literal breakpoints (pause variant), session walker via L1 subscriber (`crucible_walk_events` MCP tool), and single-hop `crucible_why_one` — are the smallest surface that lets Aaron use Crucible to fix Crucible. All four ride substrate already committed in Round 5/6 (hook bus, Mirror notification per Graham R6, L1 subscriber pattern per Rosella R6, `causal_read_set_hash` capture invariant). **Per-story verdicts:** US-S-1 splits T1/T2 (literal predicates T1, match-spec DSL T2); US-S-2 → Parking (needs L2); US-S-3 splits substrate-LOCKED + T1 single-hop + T2 transitive closure; US-S-4 → Parking (needs L2); US-S-5 → T3 (DAG step-into); US-S-6 → T3 (bisect); US-S-7 splits T1 MCP-tool extensions + T2 native REPL + T2 DAP sidecar; US-S-8 → T3 (minimizer); US-S-9 → absorbed by Graham R6 + verdict-bus decisions, drop as separate story. **Six merge candidates flagged for Cassima with Valanice** (logpoint registry, MCP tool catalog, native REPL, pause→Mirror, causal-slice query surface, L5 layer scaffolding) — explicitly did not claim primacy on L5 layer ownership. **Six open questions for Cassima** including verdict-enum extension story ownership (L1/L4 not L5), Parking-as-real-tier semantics, MCP-server ceiling, and a bootstrap-loop sufficiency challenge: can Aaron actually fix a Crucible bug using only T1-D1..D4? I claim yes. **Opinion held throughout:** if we ship a fifth T1 debugger primitive we are stealing budget from L1/L4/Mirror, which is worse for the bootstrap loop than leaving T2 features in T2. Full triage: `decision inbox drop sonny-triage-2026-05-25T0200Z.md`.

---

**2026-05-27 Eureka PRD Overlap Analysis (Scribe Summary):** Cross-agent consensus on Eureka × Crucible overlap. See `.squad/decisions.md` **Eureka PRD Overlap Analysis** section for full matrix and 5 open questions for Aaron.

## 2026-05-30 Round 8: CTD Phase 2 advisory review of §9 Aperture + §13 CLI

**Summary:** Verdict SOLID. §9 + §13 give a credible time-travel-debugging surface on top of the §11 replay substrate and §3/§6 primitive ledger; the "Aperture is a pure projection over L1" framing is the discipline that makes Pernosco-style omniscient query work on a primitive stream. Bisect rendering with env-snapshot header AND footer (R2-4) is best-in-class — better than `git bisect`, which has no equivalent guard against silent env drift. **Single most consequential finding: §13.1 verb naming collision — `crucible aperture watch` means "tail the inbox" but in every debugger ever shipped, `watch` means "register a watchpoint."** Recommended rename to `aperture tail` in v1 before muscle memory locks in (US-S-18). Second-highest-leverage v1 ask: pin `SliceJsonOutput` shape, pin `ApertureEvent` as tail-JSON shape, add `schemaVersion` to all `--json` envelopes (US-S-23/24/25) — these three together make a future DAP shim a 1–2 week sidecar rather than a protocol re-think. **Per-surface findings:** §9.8 registry missing predicate-language spec + kind-vs-behavior collapsing + hit-count/tracepoint primitives + multi-hop edge selector on `why` (5 stories US-S-10..13); §9.6 bisect missing inter-row primitive diff + auto-`why` suggest + exit-code contract docs + `bisect show <runId>` replay (4 stories US-S-14..17); §13.1 missing the standard navigation triad `step`/`continue`/`break list|add|delete` and has the `watch` collision (5 stories US-S-18..22); §13.6 JSON missing 3 shape pins (3 stories US-S-23..25). **DAP-shim viability: MAYBE→YES** with the three v1 JSON polish stories landed; current shapes are close but not DAP-compatible out of box, substrate is right. **v1.5 / deferred:** DAP shim itself, conditional/hit-count breakpoints, tracepoints, step/reverse-step verbs, bisect-run replay. **§18 (Security) flag:** predicate-language sandboxing is required before predicates run in the pre-commit hook — adversarial predicate is a DoS vector. Filed full advisory at `decision inbox drop sonny-ctd-p2-advisory.md`. Authored 16 new user stories (US-S-10..25); zero claims of authority over Valanice's §9/§13 ownership.

## Learnings (added 2026-05-30)
- Aperture's "pure projection over L1" framing IS the correct discipline for omniscient debugger query on a primitive ledger — same principle as Pernosco's index-everything-at-record-time, applied event-source-style. As long as this invariant holds, every debugger gap is additive (never a retrofit). Worth defending in future deliberations.
- Env-snapshot header+footer on bisect output (R2-4) is genuinely better than `git bisect run`'s output discipline; the trim-survival reasoning generalizes to any long-lived report artifact (PR comments, CI logs, issue paste-ins). File this as a UX pattern for other report-shaped surfaces.
- CLI verb naming collisions with universal debugger conventions (`watch`, `step`, `continue`, `break`, `bt`) compound — once a user types `watch` and gets "tail," every subsequent verb expectation is recalibrated wrong. Catch these BEFORE first ship; rename costs grow superlinearly with adoption.
- `step-into` for agentic systems must descend a DAG (sub-task fan-out/fan-in), not a thread stack. Re-confirmed from Round 1 US-S-5 against Phase 2 surfaces — §13.1 has neither verb, so this remains a v1.5 ask, but the §6.4 `parentId` + `causalParentId` split already provides the substrate to do it right when the time comes.
- Three edge types coexist on every primitive (`parentId` structural production, `causalParentId` sub-task spawn, `causalReadSet.primitiveIds` content-influence). A `why`/`backtrace` verb that doesn't let the user select which edge kind to traverse will answer the wrong question. Default = all three; `--edges` selector for power users.
- Predicate languages embedded in pre-commit hooks are a DoS vector if unsandboxed (CPU/memory/time bound, no I/O, no host syscalls). This is a §18 Security ask, not a §9.8 Aperture ask, but Aperture is where users will encounter the symptom.
