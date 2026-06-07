# Agent History Archive — rosella

Archived entries (pre-summarization).

---

📌 **ADR-0019 LANDED** (2026-05-30T194147Z): End-to-end execution of Aaron's childSid collision hybrid ruling. All 10 design points incorporated (no deviations): dropped wall-clock heuristic, always-prompt UX, "New" naming, non-TTY exit code 2, flags (--new/--resume/--no-interactive/--label), Decision row in parent ledger, preimage rules, fork_resume Observation, both flag+verb, closed-session metadata append clarification. 7 CTD files edited (§10.4/§10.1/§6.3/§13.1/§16.9 + 2 options docs marked SUPERSEDED). 8 A-Fork-* acceptance scenarios added. Artifact: docs/adr/0019-childsid-collision-hybrid.md (14.8 KB, 315 lines, comprehensive). Skill captured: cross-persona-review yields replay-bug catch (multi-lens design surfaces correctness violations).

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Rosella (7/7 items: C-8→C-9 conformance + trust-tier persistence + Pareto budget + `alternatives[]` bounding + invocation-stack cache + 2 options docs PA-B4/childSid awaiting Aaron). Coordinate with Laura on C-9 + Gabriel on PA-B4 Option B router protocol. — Scribe

📌 Team update (2026-05-30T12:05:19Z): **PA-B4 Option A Landed + childSid Round 2 User Stories** — Aaron accepted PA-B4 Option A (ancestry-aware reads). 5 CTD edits: §7.3 ReadSetBuilder.ancestry(), §6.1 ReadSetRef.ancestryRefs[], §11.4 replay stitched-view logic, §7.A C-6b conformance, §7.F Eureka forward ref. Aaron requested childSid user stories; hybrid proposal created with 4 UX scenarios, CLI surface (`--fresh`/`--resume` flags + interactive prompt), determinism via Decision row. Recommendation: Hybrid lean, fresh-by-default. Awaiting Aaron ruling. — Scribe

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe

📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §7 (Generators L3) FINAL. `nonDominatedReason` field shape locked for Valanice §9 consumption: `'optimal' | 'incomparable'` + optional `incomparableWith[]`. Phase 2 coordination: Roger (R2-6 lockfile/snapshot handshake). Synthesis review: YELLOW, 1 finding routed to Gabriel+Rosella on `dependentPaths` type (Phase 2 §9/§10). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) Install-time transitive dep resolution + lockfile format ownership (R2-6); (2) coordinate with Roger on snapshot-into-WAL boundary; (3) PrescriptionResult.nonDominatedReason field in generator output (R2-5). Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Rosella — History

**Role:** Implementation Specialist (W5-5 MCP forge-prescribe handler, async-correctness)
**Status:** Cycle 2 included in implementation/testing coordination.
**Last update:** 2026-05-29

**Key milestones:**
- Wave 2-6 integration: MCP handlers, forge-prescribe, change vectors
- W5-5 async-test plan: 4 new tests integrated when handler ships
- Cairn test coordination: 609+ tests baseline maintained

**See history-archive.md for detailed entries.**

- getAllCategories(db, skillId) lives in packages/cairn/src/db/changeVectors.ts. Reads distinct values from optimization_hints.category column for a given skill_id.
- SqliteChangeVectorProvider now lives in packages/cairn/src/db/sqliteChangeVectorProvider.ts and is exported from Cairn's top-level src/index.ts barrel.
- Type reconciliation at DB boundary: getAllCategories() filters raw SQLite category strings through canonical OptimizationCategory union from @akubly/types.
- SqliteChangeVectorProvider.getSummaries() deliberately drops zero-vector summaries to keep downstream orchestration in Phase 4.5 fallback mode.
- Verification: npm run build, npm test --workspace=@akubly/cairn, and root npm test all passed. Cairn 564 passing tests; Forge 599 passing.
- Wave 2 W2-8 applier gate lives in packages/forge/src/applier/optimizer.ts inside applyOptimizations(), before the confidence threshold check. It skips with reason `negative-impact-vector-history` when autoApplyEligible resolves to false.
- The applier resolves autoApplyEligible from the hint's top-level field first, then falls back to hint.evidence.autoApplyEligible for persisted Cairn rows. Missing/undefined still means eligible for backward compatibility.
- Cairn hint dedup now lives in packages/cairn/src/db/optimizationHints.ts via `insertHintIfNew(db, hint): { inserted: boolean; existingHintId?: string }`, and insertOptimizationHint() now routes through that helper.
- Active dedup statuses for optimization hints are pending, accepted, and deferred; terminal states (applied, rejected, expired, suppressed, failed) do not block reinsertion of the same (skillId, source, category) tuple.

---

## 2026-05-23: Extensibility Read — 7 Clarifying Questions for Aaron

Completed vision review + prior art survey (MCP, Copilot skills/commands, Cline agentic tools, Continue LLM providers). Identified 7 critical design ambiguities:

1. **Extension authorship scope v1**: User-authored custom skills, or team-only baseline?
2. **Hook system vs. discrete types**: Unified hooks or Skills/Commands/Personas/Providers contracts?
3. **Skill/agent mutation ownership**: User-approved or autonomous within confidence gates?
4. **Extension distribution model**: Local-only v1, or baked-in versioning/metadata for future marketplace?
5. **LLM provider extensibility**: Pluggable provider layer v1, or fixed to configured set?
6. **Persona/agent/skill taxonomy**: Three separate extension types or unified under one model?
7. **Skill rollback & versioning**: Archive, replace, or version skill variants after genetic loop?

Generated `extensibility-read.md` with vision summary, prior art details, tensions, and questions. Ready for Aaron's input on extensibility model before Chamber SDK design begins.

**Artifact:** `/extensibility-read.md`

---

---

## 2026-05-23: Big-Think User Story Ideation — 6 Extensibility Stories

Aaron's brief: "Think big" on extensibility, customization, and ecosystem for Skillsmith Harness v1. Generated 6 opinionated user stories:

### US-Ro-1: Skill Authoring Framework
**Story:** As Aaron, I want to author new skills (multi-step orchestration sequences) without modifying Crucible core, so that harness behaviors grow composably.
**Ambition:** Skills become first-class, versioned primitives — any user can author, test, and ship new orchestrations without core fork.
**Chambers touched:** Crucible (skill registry + discovery), Forge (skill scoring), Mirror (observability hooks).
**Extensibility surface:** Skill authoring contract (input/output types, lifecycle hooks, success/failure signaling) + on-disk skill manifests with version/metadata.

### US-Ro-2: MCP Tool Gateway
**Story:** As Aaron, I want to bind any MCP server as a native Crucible tool, so that external services integrate without custom SDK work.
**Ambition:** MCP becomes a first-class integration primitive — any MCP tool is automatically available to skills and agents.
**Chambers touched:** Crucible (tool binding layer), Curator (trigger rules on MCP resources).
**Extensibility surface:** MCP client shim + declarative tool discovery/binding protocol (schema introspection → Crucible tool registry).

### US-Ro-3: Pluggable Model Provider Abstraction
**Story:** As Aaron, I want to swap between Claude, GPT, local LLMs, and future models without rewriting skills, so that model selection is a Forge concern, not a skill concern.
**Ambition:** Skills are model-agnostic — Forge prescribes optimal provider per task context (cost, latency, capability, trust).
**Chambers touched:** Forge (prescription logic), Crucible (message loop routing).
**Extensibility surface:** Provider interface (init, chat, batch, cost estimation, fallback chains) + Forge selector strategy (pluggable decision logic).

### US-Ro-4: Project Self-Discovery & Skill Bootstrapping
**Story:** As Aaron, I want Crucible to auto-discover and load project-specific skills at startup, so that different projects can ship domain-specific harness extensions.
**Ambition:** Projects become first-class extension hosts — a repo can ship its own skill library, custom personas, and project-recognizers that adapt the harness to domain idioms.
**Chambers touched:** Crucible (boot sequence), Curator (project detection triggers), Cairn (project metadata ledger).
**Extensibility surface:** Project manifest schema (skill locations, config overrides, hook subscriptions, telemetry bindings) + discovery protocol (monorepo patterns, framework conventions).

### US-Ro-5: Alchemist Skill Evolution Loop
**Story:** As Aaron, I want skills to improve autonomously via success/failure feedback loops and genetic variation, so that harness capabilities self-tune over time.
**Ambition:** Skills aren't static — Alchemist generates variants, evaluates via Mirror feedback, and promotes winners; failing skills propose experiments that become new variants.
**Chambers touched:** Alchemist (variant generation + selection), Mirror (feedback scoring), Forge (variant prescriber).
**Extensibility surface:** Skill scoring interface (success criteria, quality metrics) + variant generation strategy registry (prompt mutation, parameter sweep, architectural alternatives).

### US-Ro-6: Multi-Agent Capability Bus (Aspirational)
**Story:** As Aaron, I want sub-agents to register custom tools and skills back into the parent harness mid-execution, so that squad agents autonomously extend harness capabilities as they collaborate.
**Ambition:** Agents aren't passive tools — they are co-contributors to the harness. Squad agents discover each other's capabilities, negotiate composition, and emergent skills arise from agent interactions.
**Chambers touched:** Crucible (inter-agent coordination), Curator (capability negotiation), Mirror (trust surface for agent-authored skills).
**Extensibility surface:** Capability bus protocol (agent→harness skill registration + discovery) + trust/quarantine model for agent-generated extensions + composition DSL for multi-agent orchestration.

---

**Older phase 4.6 cycle work archived to history-archive.md**

---

## Deliberation Round (2026-05-24)

Cross-pollination round against 6 internal peers + Erasmus. Read all peer histories, Erasmus's 4-layer critique, Aaron's post-Erasmus insights (branching = functional requirement; agentic-debugger = vision seed; determinism = load-bearing), and the vocabulary slate.

**Position delivered to inbox:** `.squad/decisions/inbox/rosella-deliberation-position.md`

**Headline moves:**
- KEPT US-Ro-1, US-Ro-4. REVISED US-Ro-2 (MCP as generator-source, not just tool-binding), US-Ro-3 (promote priority — owns hermetic replay boundary), US-Ro-5 (flagged structural-mutation leak). WITHDREW US-Ro-6 (federation deferred). Added 4 new stories (Generator SDK, plugin-pinned branching, registry+trust tiers, structural-proposal channel).
- **PARTIAL endorse Erasmus's 4-layer stack.** Layers 1, 2, 4 fully endorsed. Layer 3 (`ProposalGenerator`) endorsed for ~85% data-plane generators; **rejected as universal** — Alchemist variant promotion, new-skill induction, MCP hot-swap, project-local generator load are *structural* mutations that don't fit `{category, confidence, preview}`. Proposed split into `DataProposalGenerator` + `StructuralProposalGenerator` sharing the Router.
- **Tension reads:** solo-v1 with federation-shaped seams; Router resolves Curator-never-approves cleanly; Mirror downgraded to view (frees SDK); lightweight core + heavyweight-as-plugin; Crucible parent, Copilot CLI as default `ModelProvider` plugin.
- **Debugger-lens flags:** US-Ro-1, US-Ro-2, US-Ro-3, US-Ro-NEW-1, US-Ro-NEW-2 all doubly compelling under the agentic-debugger frame. US-Ro-3 (model provider hermetic boundary) is the keystone.
- **Cross-refs that bind work:** Roger US-R-3 + my US-Ro-NEW-2 should merge (branching is replay's plugin-pinning requirement). Alexander US-A-3 *requires* my revised US-Ro-3 or it silently degrades. Erasmus US-E-6 confirms the structural-proposal leak is not Alchemist-specific. Laura US-L-1 evaluator slots into my conformance kit. Valanice US-V-2 validates Mirror-as-view.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

---

## Round 4 — Phase B Reconciliation against `stunning-adventure` (2026-05-24T23:30Z)

**Inbox:** `.squad/decisions/inbox/rosella-reconciliation-2026-05-24T2330Z.md`

---

## Round 6 — Open #7 resolution: US-A-NEW-5 vs `event_log` (2026-05-25T01:30Z)

**Inbox:** `.squad/decisions/inbox/rosella-open-7-2026-05-25T0130Z.md`

Resolved the contradiction my Round 4 surfaced. Re-quoted Alexander's
US-A-NEW-5 verbatim from `agents/alexander/history.md:332-334` (ledger-append
transactional contract: WAL mode, group-commit at turn-end OR N≥32 OR T≥50ms,
≤1ms p99, "lost ≤ last decision boundary" durability). Re-cited the existing
`event_log` shape: 5 columns (id INTEGER PK AUTOINC, event_type TEXT,
payload TEXT JSON-string, session_id TEXT FK, created_at TEXT default now);
`migrations/001-initial.ts:47-53`; index in `004-event-log-index.ts:7-10`;
append at `db/events.ts:43-46`; CairnEvent type at
`cairn/src/types/index.ts:80-86`; 30 consumer files; ProvenanceTier
classification at `forge/src/bridge/index.ts:26-47, 65-93`; stale-session
shim at `cairn/src/hooks/sessionStart.ts:41-54`.

**Contradiction:** legacy `event_log` is too thin to be the L1 primitive
ledger (missing causal_read_set_hash, hook_verdict, hook_verdict_witness,
group-commit boundary, commitment offset, typed payload) AND too rich/
established to delete (ProvenanceTier-tiered, typed CairnBridgeEvent
vocabulary, 30 call sites). The two surfaces do genuinely different jobs.

**Resolution: option (b)-refined.** Keep both. L1 WAL (A.3 hybrid, Phase A
8-field row schema) is the primitive ledger that satisfies US-A-NEW-5
exclusively. `event_log` is demoted to a derived L2 audit + telemetry
projection fed by an `L1Subscriber.onCommit(offset, rows[])` from the
substrate boundary. Honors Aaron decision #10 ("L2-L5 may not import
storage primitives directly"). Bridge layer (`forge/src/bridge/index.ts`)
rewrites to emit L1 primitives; an `EventLogProjector` in Cairn
materializes typed CairnBridgeEvents with `source_event_offset` +
`provenance_tier` columns added by migrations 014/015. Stale-session
shim (2-minute heartbeat) dies — subsumed by L1 crash recovery per
Alexander's recommendation 5. `logEvent(db, ...)` overload stays as the
manual/test entry point; deprecated single-arg overload scheduled for
v1.1 removal.

**Migration ordinal:** slot 2 of Phase B, after A.3 hybrid L1 ships,
before Crucible GA. ~18h total, ~8h consumer churn (most consumers
unchanged because they read `event_log` as audit projection, which is
exactly what it becomes). First L2 projector built on the new L1
substrate — reference pattern for Mirror, Laura's conformance kit,
Sonny's debugger.

**Flagged:** assumption that `parent_session_id`/`fork_point_event_id`
on sessions (Aaron 2a) is sufficient for fork lineage without per-row
markers. Sonny's debugger may push back.

**Cross-team binds:** Roger owns the `L1Subscriber` interface in the
L1-interface package (subscription seam at the boundary, projector in
Cairn). Laura's conformance kit gets `source_event_offset` as
divergence-detection key. Alexander's US-A-NEW-5 contract is unchanged
and satisfied. Gabriel/Router unchanged. Mirror is another L2 projector
of the same pattern.

Read-only sweep across `cairn/`, `forge/`, `skillsmith-runtime/`, `runtime-cli/`, `types/`. Headline: **the plugin host already exists in Cairn, not Forge.** `cairn/src/agents/discovery.ts` is a 482-line, 4-phase topology scanner (user / project / plugin / marketplace) emitting SHA-256-checksummed `DiscoveredArtifact` records with per-type `ResolutionRule` (`additive`/`first_found`/`last_wins`), `ownerPlugin` tagging from `plugin.json`, and cross-scope conflict detection. `ArtifactType` covers instruction/agent/skill/hook/mcp_server/plugin_manifest/command. Counts: ALREADY-EXISTS 1, PARTIALLY-EXISTS 5, NET-NEW 4, CONTRADICTS 0 (1 latent-risk on US-Ro-3 SDK coupling, deferred to Aaron/Graham). Key reuses identified: `ProvenanceTier` (cert/internal, bridge/index.ts:26-47) for trust tiers, DBOM frontmatter (export/compiler.ts:82-100) for hermetic exports, `compiler` agent stub (cairn/agents/compiler.ts) as the natural implementation slot for US-Ro-NEW-2/3, and `HookComposer` (forge/hooks/index.ts) shallow-merge + error-isolation pattern worth lifting to a shared utility. **Plugin pinning at fork (v1 #7) is implementable on existing primitives** — content-addressing is already in place, only need `plugin.json` schema extension + topology-snapshot persist at fork + compiler-agent pin verifier. Rewriting US-Ro-1 and US-Ro-4 as "wire what exists, fill contract gaps" rather than greenfield. Merge with Roger US-R-3 confirmed. Latent SDK-coupling conflict in US-Ro-3 surfaced cleanly, not unilaterally resolved.

---

## Round 7 — v1 Triage (2026-05-25T02:00Z)

**Inbox:** `.squad/decisions/inbox/rosella-triage-2026-05-25T0200Z.md`

Triaged 10 authored stories + Round-6 #7 work + 2 new stories
(Mirror Projector, DBOM-frontmatter-for-exports) against Aaron-locked v1
framework (MVP that validates the harness thesis; bar = "Aaron runs a
one-week productivity loop where every improvement to Crucible is made by
Crucible"). T1 recommended set: 8 items (US-A-NEW-5 contract honored,
EventLogProjector, Mirror Projector, US-Ro-3 hermetic seam, US-Ro-4 boot
wire-up, US-Ro-NEW-2 plugin pinning [v1 commitment #7], US-Ro-NEW-3 T1
slice, US-Ro-1 T1 slice). T2: US-Ro-2 (split), US-Ro-NEW-1, US-Ro-NEW-4,
DBOM frontmatter. T3: US-Ro-5 (Alchemist), MCP-as-generator-source. T4:
US-Ro-NEW-3 full (signing/quarantine), HookComposer lift, US-Ro-1 full
lifecycle. Parking: US-Ro-6 (already withdrawn).

**Free-multiplier wins identified.** Phase A WAL's `causal_read_set_hash`
+ `hook_verdict` promote Mirror divergence detection and pin-at-fork
replay-drift detection from T2 work into T1 essentially for free.
ProvenanceTier (existing) maps onto Graham's Mirror level enum without
new vocabulary. `source_event_offset` (Migration 014) doubles as Laura's
conformance divergence key. ~50–60h of T1 owned-work plus the merged
US-Ro-NEW-2 with Roger.

**Mirror as L2 projector pattern claimed.** Mirror Projector is a parallel
L1Subscriber implementation alongside EventLogProjector (Round 6 #7),
sharing the projector pattern. Both are reference implementations for
later projectors (Laura conformance, Sonny investigation). No producer
writes directly to `mirror_events`; every event originates from an L1
commit. Honors decision #10.

**Cross-team binds:** Roger (US-R-3 merge with US-Ro-NEW-2 confirmed;
shared `L1Subscriber` contract); Graham (Mirror notification render
ownership open question); Sonny (per-row lineage assumption still
flagged); Laura (`source_event_offset` is her conformance key);
Alexander (US-A-NEW-5 contract unchanged); Gabriel (hook_verdict
free-rides into Mirror policy events).

**7 open questions for Cassima** raised — notification render ownership,
mirror_events GC, cross-session Mirror scope, US-Ro-3 Provider home,
plugin manifest package location, MirrorEvent ↔ event_log join key
confirmation, Sonny per-row lineage decision.

---

**2026-05-27 Eureka PRD Overlap Analysis (Scribe Summary):** Cross-agent consensus on Eureka × Crucible storage, runtime, and architecture overlap. See `.squad/decisions.md` **Eureka PRD Overlap Analysis** section for full findings and 5 open questions for Aaron.

---

## Learnings — CTD Phase 1 Lane 2: §7 Generators (L3) (2026-05-28)

**Artifact:** `docs/crucible-technical-design/07-generators-l3.md` (21.2 KB, ≤3pp §7 + ≤1pp Appendix 7-E).
**Decision drop:** `.squad/decisions/inbox/rosella-ctd-phase1-lane2.md`.

### GenericL3AdapterContract design patterns

- The conformance contract is a single property-based suite (`runGenericL3AdapterConformance(adapterFactory, opts) -> ConformanceReport`), not a per-adapter test infra. Eight property classes C-1..C-8: interface compliance, fail-open, hint attribution, lifecycle ordering, registration/discovery, `causalReadSet` completeness, `dependentPaths` non-empty on structural, and no Pareto axis zero-fill.
- C-6 (`causalReadSet` completeness) is the strongest property — it is enforced by stubbing `LedgerWindowReader` + Salsa cache to record every read, then asserting the emitted read-set is a superset. Mirrors Laura's A4 determinism assertion.
- C-7 (empty `dependentPaths[]` rejection) MUST fire at the adapter boundary, not at Router. Pushing the check upstream catches structural-emission bugs as unit-test failures rather than integration-test surprises.
- C-8 (no zero-fill) is the load-bearing Q8 contract: zero-fill silently collapses *incomparable* into *dominated* and discards Pareto-frontier prescriptions. The adapter MUST emit a sparse axis map; missing axis means "not measured", not "measured as zero".
- The conformance report is itself an L1 Decision primitive — one per adapter per run, replayable, bisectable, visible in the Aperture leaderboard. Conformance failures become Sonny-debuggable artefacts.

### Forge-as-reference-implementation pattern

- The existing `packages/forge/` package satisfies C-1..C-8 today with no behavioural changes — the v1 adapter is purely a projection of `OptimizationHint` -> `DataProposalGenerator` proposal shape. `ForgePrescriberOrchestrator` (Wave 2 W2-5) is the canonical `PrescriberOrchestrator` (Laura §3.4 alias).
- Mapping table: hint `category` -> `category`; `confidence` -> `confidence`; `source/evidence` -> `evidence{rationale,citations,tier:'internal'}`; `autoApplyEligible:false` -> `reversibility:'manual-rollback'`; `costEstimate` from existing `ChangeVectorProvider` summary.
- Pattern lift: any new adapter (Eureka v1.5, marketplace plugins) replicates the mapping table. The conformance suite is the contract; Forge is the worked proof the contract is satisfiable on an already-shipped codebase. **No adapter ever gets bespoke test infra.**
- Existing Wave 2 invariants pull double duty: fail-open on prescriber crash satisfies C-2; `(skillId, source, category)` dedup key satisfies C-3; `ATTENUATION_FLOOR=0.1` preserves session forward progress under C-2 stress.

### PrescriptionResult shape (R2-5 LOCK)

- Field name is exactly `nonDominatedReason: 'optimal' | 'incomparable'` (camelCase, two words). Optional companion `incomparableWith?: string[]`.
- **Set by `ParetoFitnessEvaluator` at evaluation time, NOT by the generator.** Generators emit only `fitness`. This split is why the field lives on `PrescriptionResult` (the evaluator output), not on the proposal itself.
- Three downstream consumers all read the same literal field/value, no translation: Applier (§8) propagates onto `DecisionPayload.nonDominatedReason`; replay re-asserts the value; Valanice's §9 Aperture leaderboard renders `[incomparable-axes]` badge when value === `'incomparable'`.
- `'optimal'` vs `'incomparable'` is the audit distinction: *proved* dominant on shared axes vs *unchallenged* on a different axis set. The badge exists because conflating them silently mis-credits Pareto winners.

### Cross-section binds discovered

- §7.2 lifecycle pins `PluginManifest` SHA-256 per session-fork — pin lives in Roger's §10 snapshot. Need Roger's snapshot field name, transitive-closure vs direct-only storage decision (Q4 says transitive — §7 assumes the snapshot follows), and lockfile canonical form (assume CBOR to match proposal canonicalisation). Codegen for `AdapterContext` blocks on Roger's §3 + §10 outputs; CTD spec does not.
- `LedgerWindowReader` (Q1 rename from `ObservationCaptureStore`) is the read-only handle `AdapterContext` exposes to adapters at `start`. Roger's §3 owns the read-side WAL surface; §7 needs cursor API, snapshot-isolation-at-start, mid-read session-end behaviour to firm up the TypeScript declaration.

📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.

---

## Learnings — Pass A Execution (2026-05-30)

### PA-B4 Ancestry/Replay Divergence (Resolved)

Aaron accepted **Option A: Unify ancestry-aware reads under one API**. Key insights:

- **Replay correctness over ergonomics:** Option A's uniform capture in `causalReadSet.ancestryRefs[]` is more robust than Option B's discipline-based contract. Generators that cite parent EventIds MUST declare the read via `ReadSetBuilder.ancestry()`, or C-6b conformance test fails.
- **§7.3 scoping rule:** `primitive(id)` and `projection(key)` are child-session-scoped by default. Forked sessions see only child ledger unless `.ancestry(ancestorSid, includeTransitiveParents)` is explicitly called.
- **§11.4 replay semantics:** Replay re-feeds the same stitched view (parent + child) that live generators saw, keyed by read-set hash. Generators that omit `.ancestry()` replay with child-only context, matching their live emission. No divergence hazard.
- **C-6b conformance test:** Property test resolves `evidence.citations[]` to session IDs and asserts parent sessions appear in `causalReadSet.ancestryRefs[]`. Coordinates with Laura's §16.9 C-9 acceptance signals (structural-proposal supersede).
- **Eureka v1.5 forward ref (§7.F):** If Eureka analyzes multi-fork experiments, the adapter MUST call `.ancestry()`. Failure causes C-6b test failures and replay divergence. If Eureka only analyzes single-session data, no ancestry reads required.
- **Migration cost low:** Forge v1 is `kind:'data'` only and doesn't fork. Curator doesn't fork. Eureka v1.5 is future scope, so v1 has no migration burden.

### childSid Collision User Stories (Round 2)

Aaron requested UX clarification after seeing original Options A/C doc, leaning toward **"give the user the option to start fresh or resume."** Generated 4 user stories:

- **US-1 (Quick experiment, abort, retry):** Most common case — Aaron experiments, aborts, tries again. Option A (fresh) is seamless; Option C (resume) silently continues old session (surprising). Hybrid surfaces collision, lets Aaron choose.
- **US-2 (Long-running fork, crash mid-session):** Strongest argument for Option C — automatic salvage of 200 decisions after crash. But crashes are rare if sessions close cleanly. Hybrid makes recovery explicit via `--resume` flag or prompt.
- **US-3 (Side-by-side comparison):** Design-time workflow — fork at offset 50, run strategy X, fork at 50 again to run strategy Y. Option A enables naturally. Option C blocks (closed sessions immutable). Hybrid works if `--fresh` flag used.
- **US-4 (Accidental resume):** Aaron aborted a fork 3 days ago, forgets, forks at 50 again expecting fresh. Option C silently resumes 3-day-old session (high surprise). Option A and Hybrid avoid this.

**Dominant pattern:** US-1 and US-3 dominate frequency (experiments + comparisons). US-2 is valuable but rare. Fresh-by-default optimizes for common case; resume is opt-in.

**Hybrid proposal:** CLI surface with `--fresh` / `--resume` flags + interactive prompt on collision. Default = `F` (Fresh) if aborted session >1 hour old, `R` (Resume) if <1 hour. Determinism preserved via Decision row in parent ledger recording user choice. Preimage = timestamp-variant for fresh, reuse existing `childSid` for resume.

**Recommendation:** **Hybrid lean, fresh-by-default.** US-1/US-3 dominate; US-2 crash recovery preserved via explicit opt-in; US-4 accidental resume prevented; collision surfacing gives full visibility; Decision row preserves determinism for replay.

### CTD Chapter Cross-References Learned

- **§6.1 ReadSetRef schema:** Lives in `06-primitive-taxonomy.md`. Common envelope for all primitives. Adding fields here touches every generator.
- **§7.3 ReadSetBuilder:** Lives in `07-generators-l3.md`. Helper class generators use to declare read edges. Fluent builder API.
- **§7.A Conformance suite:** Property-based test suite (C-1 through C-9) that runs against any L3 adapter. Laura owns the runner (§5.3), Rosella owns the spec.
- **§11.4 Replay protocol:** Lives in `11-hermetic-replay.md`. Re-feed loop procedure with oracle comparison. Bootstrap rehydration → re-feed → oracle comparison.
- **§7.F Eureka forward ref:** v1.5 scope. Eureka is external library consumed via optional adapter. Must pass §7.A conformance suite.

### Coordination Notes for Next Session

- **Laura:** C-6b (ancestry-read completeness) sits alongside C-9 (structural-proposal supersede) in §7.A. Both are property tests that coordinate with §16 acceptance signals.
- **Roger:** When Aaron rules on childSid hybrid, check §13.1 CLI verb consistency for `--fresh` / `--resume` flags. Also `crucible session resume <childSid>` verb.
- **Gabriel:** No Router coordination needed for PA-B4. Ancestry reads are ReadSetBuilder-level (L3), not Router-level (L4). If Aaron had picked Option B, would need Router escalation protocol for `kind:'ancestry-dependent'` proposals.

**Context:** Pass A triage went silent last session after long-lived background agent context limits. Picked back up this session per Aaron's ruling: OPTIONS DOCS FIRST on the two blockers (PA-B4 ancestry/replay, childSid collision) before he decides paths. Completed all 7 assigned Pass A items.

### Phase 1: Options Docs (BLOCKERS)

**Artifact paths:**
- `docs/crucible-technical-design/decisions/pa-b4-ancestry-replay-options.md` (8.7 KB)
- `docs/crucible-technical-design/decisions/childsid-collision-options.md` (11.4 KB)

**PA-B4 ancestry/replay divergence:**  
Identified divergence between §7 generator reads and §10/§11 replay semantics. Two options: (A) unify ancestry-aware reads under one API (`ReadSetBuilder.ancestry()` mirrors `readAncestry()`); (B) split APIs cleanly with documented divergence (`ancestry-dependent` proposal category + Router escalation). Recommended **Option A** — uniform capture in `causalReadSet` is more robust for replay correctness; lower v1 implementation cost (no Router escalation protocol); acceptable ergonomic friction (95% of generators never need parent history).

**childSid collision:**  
Identified deterministic collision risk when forking the same `(parentSid, offset)` twice (retry after abort). Three options: (A) add counter/timestamp to preimage (preserves determinism within session, different childSid per attempt); (B) protocol-error semantics (user resolves collision manually); (C) resume-aborted-session semantics (idempotent fork, same childSid resumes same ledger). Recommended **Option A (timestamp variant)** — `created_at_ns` already exists in `sessions` table, nanosecond resolution makes collision practically impossible, transparent to user, orphaned directories are GC-able.

**Tradeoff analysis:**  
Both docs include detailed tradeoff matrices (replay correctness, ergonomics, implementation cost, alignment with append-only philosophy). Both flag cross-team coordination points: PA-B4 touches Laura (conformance C-6b), Gabriel (Router escalation if Option B); childSid touches Roger (fork protocol implementation), Laura (if C-9 acceptance signals reference fork semantics).

### Phase 2: Execute 5 Non-Blocked Items (§7/§10)

**3. Trust-tier promotion persistence (§7.4.1):**  
Added derived `plugin_trust_history` table keyed on `manifestSha256`. Captures promotion clock (30-day + 10-invocation + 0-violation), promotion events as Decision primitives, violation tracking as Observation rows. Rebuildable from L1 audit trail. Promotion logic triggers on every generator emission; violations reset the 30-day clock. Schema: 7 columns (manifest_sha256 PK, plugin_id, current_tier, first_seen_at_ns, promoted_to_community_at_ns, invocation_count, violation_count, last_invocation_at_ns).

**4. Conformance suite C-8 → C-9 drift (§7.A):**  
Extended conformance contract from eight to nine property classes. Added C-9 (structural-proposal supersede contract): generators emitting `supersede` replacements MUST set `envelope.parentId` to the obsoleted proposal's EventId (§7.D item 6). Observable signal: §5.A.2 Scheduler resolves `supersededBy` deterministically via `parentId`. Applies to both `StructuralProposalGenerator` and `DataProposalGenerator` when they supersede in-flight proposals. Updated §7.A table + prose to reflect C-1…C-9.

**5. Pareto eval perf budget (§7.5.1):**  
Specified concrete budget constraints: ≤5ms p99 for up to 50 concurrent proposals (O(N²) worst case, O(N log N) typical with sparse axis sets), ≤10 MiB heap allocation ceiling, 20ms timeout with fail-open (emit all as `incomparable` + log `perf_budget_exceeded` Observation). Laura's §16 perf conformance suite (`ci:conformance:perf`) includes dedicated `pareto-eval-latency` test (1000 runs, synthetic 50-proposal fixture, parameterized by axis-set sparsity 10%/50%/90% overlap). v1 baseline: Forge + Curator emit ≤5 proposals per turn, well below ceiling; budget is forward-looking for v1.5 Eureka (20–30 proposals/turn) and v2 marketplace plugins.

**6. `alternatives[]` unbounded (§7.5.2):**  
Bounded `PrescriptionResult.incomparableWith[]` to top-K=10 inline + CAS spill. Pathological case (50 proposals all incomparable) = 50 × 49 = 2,450 comparisons → unbounded arrays bloat Decision payloads. Mitigation: evaluator inlines first 10 (sorted lexicographically by `prescriptionId` for determinism), spills full array to CAS as JSON when `|incomparableWith| > 10`, sets `incomparableWithRef` CAS digest. Decision payload size ceiling: 10 × 64-byte IDs + 32-byte CAS ref = 672 bytes max. Aperture/CLI render "...and N more" suffix; full list via `crucible decision show <id> --full`. Replay does NOT compare `incomparableWith[]` (informational metadata, not structural per §11.6 oracle).

**7. Invocation-stack O(N) reconstruction (§10.6.1.1):**  
Proposed incremental stack cache mitigation for O(N) linear scan. `ReconstructInvocationStack(sessionId, N)` scans all `task_start`/`task_end` rows from offset 0 to N — for 10K-row session at offset 9,999, scans 9,999 rows. Acceptable for replay (one-time) and CLI `bt` (user-initiated), but bottleneck if reconstructed on every commit for Aperture rendering. Added optional L2 cache table `invocation_stack_cache` (session_id, checkpoint_offset, stack_json PK) checkpointing at 100-row intervals. Cost: O(100) scan per reconstruction (99 rows worst case between checkpoints), ~1 KiB per checkpoint × (session length / 100) = 100 KiB for 10K-row session. Cache is **derived only** (rebuildable from L1, cache miss falls back to full scan). **v1 optional** — cache not required for correctness, only performance; mandatory in v1.5 when Sonny's debugger queries stack on every breakpoint or Aperture renders live stack depth. Alternative considered (event-sourced stack delta log) rejected — doubles storage, duplicates WAL rows.

### Cross-Team Coordination Points

**PA-B4 (awaiting Aaron ruling):**
- If Option A: coordinate with Laura on C-6b conformance test extension (ancestry-read completeness), document ancestry semantics in §7.F (Eureka v1.5).
- If Option B: coordinate with Gabriel on Router escalation protocol (§5.8 new subsection), upgrade C-6 to C-6-strict in §7.A.

**childSid (awaiting Aaron ruling):**
- If Option A (timestamp): coordinate with Roger on fork protocol implementation timeline, document collision-prevention guarantee in §10.4.
- If Option C (resume): add `fork_resume` Observation sub-kind to §6.3, update `sessions.status` state machine in §10.1, coordinate with Roger on resume protocol.

**C-9 conformance drift:**
- Coordinate with Laura on threading C-9 (structural-proposal supersede) through §16 acceptance signals (she's already working on this per now.md Pass A leftovers).

**Pareto perf budget:**
- Laura owns §16 perf conformance suite; she'll implement `pareto-eval-latency` test runner.

**Invocation-stack cache:**
- Coordinate with Roger on L2 projector pattern (same pattern as EventLogProjector from Round 6); coordinate with Sonny on v1.5 debugger requirements (determines if cache becomes mandatory).

### Key Learnings

- **Options docs discipline:** Aaron's "OPTIONS DOCS FIRST" ruling is the right forcing function — writing out the tradeoffs surface-areas the decision cleanly. PA-B4 and childSid both had 2-3 plausible paths; documenting them explicitly with cost/benefit matrices makes the ruling defensible and auditable.

- **Conformance suite evolution:** C-8 → C-9 drift was a real gap — §7.D item 6 (supersede contract) specified the behavior but §7.A conformance suite hadn't been updated to test it. The C-9 addition closes the gap; conformance suite now aligns with §7.D structural obligations.

- **Top-K + CAS spill pattern:** The `incomparableWith[]` bounded-array + CAS-reference mitigation is the first use of this pattern in the CTD. Same pattern applies to any array field that can grow unbounded in pathological cases (e.g., `alternatives[]` in DecisionPayload, `citations[]` in Evidence). Document as reusable pattern for v1.5 when other unbounded arrays surface.

- **Incremental derived-view caching:** The invocation-stack checkpoint cache is the first incremental L2 projection (EventLogProjector and Mirror Projector are full-scan per-commit). The checkpoint-interval pattern (cache every Nth row) generalizes to other expensive derived views (e.g., Pareto frontier history over time, trust-tier promotion timeline). Document as L2 optimization pattern.

- **Pass A triage lessons:** Going silent mid-triage (stale context after long-lived background agents) was avoidable — should have surfaced "context limit approaching" signal earlier. Next time: proactively report partial progress + remaining items before context degrades.

---

## 2026-05-30: childSid Collision Hybrid Design — ADR-0019 Landed

**Context:** Aaron ruled on the childSid collision hybrid design after 4-persona review (Graham/Valanice/Laura/Roger). All 4 reviews: APPROVE-WITH-CONDITIONS. Strong cross-persona convergence — Graham + Laura independently caught the same replay-determinism blocker (wall-clock heuristic violates hermetic replay).

**Aaron's ruling:** Land the hybrid design. Drop wall-clock heuristic entirely. Always prompt on collision (TTY); never auto-default by age.

**Work completed:**
1. **ADR-0019 created** (docs/adr/0019-childsid-collision-hybrid.md) — comprehensive ADR documenting the always-prompt hybrid design with 10 design points, acceptance signals, security implications, resolved questions.
2. **§10.4 fork protocol updated** — rewrote fork pseudocode with collision detection, interactive prompt UX, Decision row recording on PARENT ledger, preimage rules (timestamp variant for --new, reuse existing childSid for --resume), ork_resume Observation append.
3. **§10.1 session state machine updated** — added borted → resumed transition; added status value 'resumed' to schema; added "closed ≠ sealed for metadata" clarification (closed sessions accept metadata appends, refuse work-session appends).
4. **§6.3 Observation taxonomy updated** — added ork_resume sub-kind to Observation enum.
5. **§13.1 CLI verb table updated** — updated crucible fork row with [--new | --resume] [--no-interactive] flags + collision handling description; added crucible session resume <sid> verb row (alternative path for resuming discovered aborted sessions).
6. **§16.9 acceptance signals updated** — added 8 new acceptance scenarios (A-Fork-1 through A-Fork-8) covering all 4 user stories (US-1 quick retry, US-2 crash recovery, US-3 side-by-side, US-4 accidental resume prevention) plus replay determinism, non-TTY behavior, --no-interactive flag, direct resume verb.
7. **Options docs marked as superseded** — prepended "SUPERSEDED by ADR-0019 (2026-05-30)" banner to both docs/crucible-technical-design/decisions/childsid-collision-options.md and docs/crucible-technical-design/decisions/childsid-collision-round2-user-stories.md.

**10 design points landed (all incorporated per Aaron's synthesis):**
1. ✅ Dropped wall-clock 1-hour heuristic entirely (Graham + Laura finding: replay-determinism violation)
2. ✅ Always-prompt UX: TTY shows [N]ew / [R]esume / [C]ancel with relative time ("3 days ago") + ISO timestamp
3. ✅ Naming: "New" instead of "Fresh" (Valanice finding: parallel structure with "Resume")
4. ✅ Non-TTY behavior: exit code 2, error message "Interactive prompt unavailable. Use --new or --resume."
5. ✅ Flags: --new | --resume mutually exclusive, --no-interactive, --label kept
6. ✅ Determinism: Decision row in PARENT ledger with {chosenOption, existingChildSid, collisionDetectedAt}
# Rosella — History

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

## Learnings — Wave 2 W2-3/W2-7 SqliteChangeVectorProvider (2026-05-22)

- getAllCategories(db, skillId) lives in packages/cairn/src/db/changeVectors.ts. Reads distinct values from optimization_hints.category column for a given skill_id.
- SqliteChangeVectorProvider now lives in packages/cairn/src/db/sqliteChangeVectorProvider.ts and is exported from Cairn's top-level src/index.ts barrel.
- Type reconciliation at DB boundary: getAllCategories() filters raw SQLite category strings through canonical OptimizationCategory union from @akubly/types.
- SqliteChangeVectorProvider.getSummaries() deliberately drops zero-vector summaries to keep downstream orchestration in Phase 4.5 fallback mode.
- Verification: npm run build, npm test --workspace=@akubly/cairn, and root npm test all passed. Cairn 564 passing tests; Forge 599 passing.
- Wave 2 W2-8 applier gate lives in packages/forge/src/applier/optimizer.ts inside applyOptimizations(), before the confidence threshold check. It skips with reason `negative-impact-vector-history` when autoApplyEligible resolves to false.
- The applier resolves autoApplyEligible from the hint's top-level field first, then falls back to hint.evidence.autoApplyEligible for persisted Cairn rows. Missing/undefined still means eligible for backward compatibility.
- Cairn hint dedup now lives in packages/cairn/src/db/optimizationHints.ts via `insertHintIfNew(db, hint): { inserted: boolean; existingHintId?: string }`, and insertOptimizationHint() now routes through that helper.
- Active dedup statuses for optimization hints are pending, accepted, and deferred; terminal states (applied, rejected, expired, suppressed, failed) do not block reinsertion of the same (skillId, source, category) tuple.

## Learnings

### W5-5 Post-Review Fixes (2026-05-26)

- **McpToolResult index signature**: Any named interface returned from an MCP SDK `registerTool` callback must carry `[key: string]: unknown`. Without it, `tsc --build` fails with TS2345 even though inline return objects work fine. Named interfaces need it explicitly; this is a `CallToolResult` SDK contract constraint.
- **Fail-open for observability writes**: CairnEvent log writes in MCP tool handlers must be wrapped in try/catch. A full disk or locked DB should never convert a successful prescriber run into an MCP error response. Pattern: `try { logEvent(...) } catch (err) { process.stderr.write(...) }`. The prescriber result is the primary value; the event is secondary telemetry.
- **Test pattern for fail-open**: Use `vi.spyOn(cairn, 'logEvent').mockImplementationOnce(() => { throw new Error('DB full') })` to inject failures in unit tests. The stub `RunForgePrescribeFn` pattern makes this trivial since the spy applies to the cairn module boundary.
- **Structural test for hot-path fs access**: Read the handler source via `fs.readFileSync(fileURLToPath(new URL('../mcp/handler.ts', import.meta.url)), 'utf8')` and assert no `fs.readFileSync|statSync|existsSync` in handler body. With vitest, `import.meta.url` points to the TypeScript source file so this works without build artifacts.



### W5-3 Tier Fallback (2026-05-25)

- Final API surface: `@akubly/skillsmith-runtime` exports `TierFallbackContext { modelId?: string; userId?: string }`, `LoadedProfileSource = 'per-skill' | 'per-model' | 'per-user' | 'global'`, `LoadedExecutionProfile`, and `loadExecutionProfile(db, skillId, fallbackContext?)`.
- Profile selection is first-match-wins: `per-skill('global')`, optional `per-model(modelId)`, optional `per-user(userId)`, then `global('global')`; missing identity keys skip their tiers instead of querying with `'global'`.
- W5-4 staleness plugs in after `loadExecutionProfile()` returns: inspect the selected `LoadedExecutionProfile.profile.updatedAt`, attenuate confidence if stale, and keep `source` unchanged; the Curator path now caches `LoadedExecutionProfile` internally so source remains available before returning the plain profile contract.
- Existing callers verified untouched at the consumer boundary: Forge prescribers still receive a plain full `ExecutionProfile`; `runForgePrescribe()` and `createPrescriberOrchestrationConfig()` accept no context and preserve per-skill/global behavior.

### W5-4 Profile Staleness Attenuation (2026-05-25)

- Final staleness field shape on runtime-returned profiles: `staleness: { stale: boolean; reason: 'count' | 'age' | 'count+age' | null }` plus annotated `confidence`.
- Default thresholds: count trips when `sessions_since_install - profile.sessionCount > 50`; age trips when `now - profile.updatedAt > 7 days`. If either trips, confidence is multiplied by `0.5` once.
- Composition with W5-3: tier selection remains first-match-wins and sets `LoadedExecutionProfile.source`; staleness runs only after that selected profile is found, preserves `source`, and annotates/scales the selected `profile`.
- Validation: `npm run build` clean; `npm test --workspace=@akubly/skillsmith-runtime` 24 passing; `npm test --workspace=@akubly/forge` 644 passing, 3 todo. No Cairn, migration, runtime-cli, or Forge prescriber changes.

### Wave 3 Shipped (2026-05-23 ~21:08Z)

PR #21 merged as f27a537 on main. 1219 tests passing. 7 work items delivered end-to-end: composition root R2 (`@akubly/skillsmith-runtime`), Curator hook wiring, per-skill orchestration, E2E tests, Phase 5-ready acyclic boundaries. 14 Copilot findings addressed across 4 review cycles. 1 deferral approved: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE) → Wave 4.

---

**Older phase 4.6 cycle work archived to history-archive.md

## 2026-05-23: 📌 Wave 4 Complete — W4-3 Implemented

**Status:** ✅ forceRegenerate CLI knob shipped on phase-4.6/wave-4 branch

**W4-3: forceRegenerate CLI Knob (COMPLETE)**

**Design Choices:**
- Flag name: `--force` (boolean, default: false)
- Semantics: Expire-then-insert (UPDATE active hints to 'expired', then insertHintIfNew())
- Active statuses expired: pending, accepted, deferred only
- Terminal statuses NOT expired: applied, rejected, expired, suppressed, failed
- MCP surface: EXCLUDED per Aaron's D2 decision (CLI-only for Wave 4; MCP deferred to Wave 5)

**Implementation:**
- Call path: CLI → `runForgePrescribe(options)` → `executePrescriberRun({ forceRegenerate })` → `expireActiveHints()` + `insertHintIfNew()`
- SQL: UPDATE optimization_hints SET status = 'expired' WHERE (skill_id, source, category) match AND status IN active_statuses
- Atomicity: Compatible with Roger's W4-1 partial UNIQUE index (no race conditions during expire→insert window)

**Test Results:** ✅ 8/8 unit tests passing
- forceRegenerate reduces skipped count when active duplicates exist
- Only expires hints matching (skill_id, source, category)
- Does NOT expire terminal-status hints
- MCP surface correctly excluded from schema

**Integration Test Status:**
- Group C (W4-3): 1/4 passing (MCP exclusion ✅; 3 failures = test infrastructure issues, not W4-3 bugs)
- Rosella's unit tests validate full W4-3 implementation; integration test failures are file-backed SQLite seeding issues

**Files Modified:**
- packages/skillsmith-runtime/src/index.ts — runtime implementation
- packages/runtime-cli/src/cli.ts — --force flag + usage text
- packages/runtime-cli/src/__tests__/forgePrescribe.test.ts — 4 new tests
- Runtime-CLI test suite: 8/8 passing

**Cross-Team Coordination:**
- **Roger (W4-1):** W4-3 depends on atomicity; expire-then-insert fully compatible with partial UNIQUE constraint
- **Laura (W4-4):** Integration test Group C validates dedup bypass; current failures are test infra, not implementation
- **Graham (Wave 4 scope):** D2 decision (CLI-only) fully honored; MCP deferred to Wave 5 with Phase 5 scope clarity

---

**Older phase 4.6 cycle work archived to history-archive.md**


---

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.


📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe

📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §7 (Generators L3) FINAL. `nonDominatedReason` field shape locked for Valanice §9 consumption: `'optimal' | 'incomparable'` + optional `incomparableWith[]`. Phase 2 coordination: Roger (R2-6 lockfile/snapshot handshake). Synthesis review: YELLOW, 1 finding routed to Gabriel+Rosella on `dependentPaths` type (Phase 2 §9/§10). — Scribe

📌 Team update (2026-05-28T18:05:30Z): **Crucible CTD Rev. 3 — R2 Locks Baked In** — All 6 R2 decisions locked (Aaron triage complete via Coordinator). Your tasks: (1) Install-time transitive dep resolution + lockfile format ownership (R2-6); (2) coordinate with Roger on snapshot-into-WAL boundary; (3) PrescriptionResult.nonDominatedReason field in generator output (R2-5). Phase 2 fan-out now unblocked. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Rosella — History

**Role:** Implementation Specialist (W5-5 MCP forge-prescribe handler, async-correctness)
**Status:** Cycle 2 included in implementation/testing coordination.
**Last update:** 2026-05-29

**Key milestones:**
- Wave 2-6 integration: MCP handlers, forge-prescribe, change vectors
- W5-5 async-test plan: 4 new tests integrated when handler ships
- Cairn test coordination: 609+ tests baseline maintained

**See history-archive.md for detailed entries.**

- getAllCategories(db, skillId) lives in packages/cairn/src/db/changeVectors.ts. Reads distinct values from optimization_hints.category column for a given skill_id.
- SqliteChangeVectorProvider now lives in packages/cairn/src/db/sqliteChangeVectorProvider.ts and is exported from Cairn's top-level src/index.ts barrel.
- Type reconciliation at DB boundary: getAllCategories() filters raw SQLite category strings through canonical OptimizationCategory union from @akubly/types.
- SqliteChangeVectorProvider.getSummaries() deliberately drops zero-vector summaries to keep downstream orchestration in Phase 4.5 fallback mode.
- Verification: npm run build, npm test --workspace=@akubly/cairn, and root npm test all passed. Cairn 564 passing tests; Forge 599 passing.
- Wave 2 W2-8 applier gate lives in packages/forge/src/applier/optimizer.ts inside applyOptimizations(), before the confidence threshold check. It skips with reason `negative-impact-vector-history` when autoApplyEligible resolves to false.
- The applier resolves autoApplyEligible from the hint's top-level field first, then falls back to hint.evidence.autoApplyEligible for persisted Cairn rows. Missing/undefined still means eligible for backward compatibility.
- Cairn hint dedup now lives in packages/cairn/src/db/optimizationHints.ts via `insertHintIfNew(db, hint): { inserted: boolean; existingHintId?: string }`, and insertOptimizationHint() now routes through that helper.
- Active dedup statuses for optimization hints are pending, accepted, and deferred; terminal states (applied, rejected, expired, suppressed, failed) do not block reinsertion of the same (skillId, source, category) tuple.

---

## 2026-05-23: Extensibility Read — 7 Clarifying Questions for Aaron

Completed vision review + prior art survey (MCP, Copilot skills/commands, Cline agentic tools, Continue LLM providers). Identified 7 critical design ambiguities:

1. **Extension authorship scope v1**: User-authored custom skills, or team-only baseline?
2. **Hook system vs. discrete types**: Unified hooks or Skills/Commands/Personas/Providers contracts?
3. **Skill/agent mutation ownership**: User-approved or autonomous within confidence gates?
4. **Extension distribution model**: Local-only v1, or baked-in versioning/metadata for future marketplace?
5. **LLM provider extensibility**: Pluggable provider layer v1, or fixed to configured set?
6. **Persona/agent/skill taxonomy**: Three separate extension types or unified under one model?
7. **Skill rollback & versioning**: Archive, replace, or version skill variants after genetic loop?

Generated `extensibility-read.md` with vision summary, prior art details, tensions, and questions. Ready for Aaron's input on extensibility model before Chamber SDK design begins.

**Artifact:** `/extensibility-read.md`

---

---

## 2026-05-23: Big-Think User Story Ideation — 6 Extensibility Stories

Aaron's brief: "Think big" on extensibility, customization, and ecosystem for Skillsmith Harness v1. Generated 6 opinionated user stories:

### US-Ro-1: Skill Authoring Framework
**Story:** As Aaron, I want to author new skills (multi-step orchestration sequences) without modifying Crucible core, so that harness behaviors grow composably.
**Ambition:** Skills become first-class, versioned primitives — any user can author, test, and ship new orchestrations without core fork.
**Chambers touched:** Crucible (skill registry + discovery), Forge (skill scoring), Mirror (observability hooks).
**Extensibility surface:** Skill authoring contract (input/output types, lifecycle hooks, success/failure signaling) + on-disk skill manifests with version/metadata.

### US-Ro-2: MCP Tool Gateway
**Story:** As Aaron, I want to bind any MCP server as a native Crucible tool, so that external services integrate without custom SDK work.
**Ambition:** MCP becomes a first-class integration primitive — any MCP tool is automatically available to skills and agents.
**Chambers touched:** Crucible (tool binding layer), Curator (trigger rules on MCP resources).
**Extensibility surface:** MCP client shim + declarative tool discovery/binding protocol (schema introspection → Crucible tool registry).

### US-Ro-3: Pluggable Model Provider Abstraction
**Story:** As Aaron, I want to swap between Claude, GPT, local LLMs, and future models without rewriting skills, so that model selection is a Forge concern, not a skill concern.
**Ambition:** Skills are model-agnostic — Forge prescribes optimal provider per task context (cost, latency, capability, trust).
**Chambers touched:** Forge (prescription logic), Crucible (message loop routing).
**Extensibility surface:** Provider interface (init, chat, batch, cost estimation, fallback chains) + Forge selector strategy (pluggable decision logic).

### US-Ro-4: Project Self-Discovery & Skill Bootstrapping
**Story:** As Aaron, I want Crucible to auto-discover and load project-specific skills at startup, so that different projects can ship domain-specific harness extensions.
**Ambition:** Projects become first-class extension hosts — a repo can ship its own skill library, custom personas, and project-recognizers that adapt the harness to domain idioms.
**Chambers touched:** Crucible (boot sequence), Curator (project detection triggers), Cairn (project metadata ledger).
**Extensibility surface:** Project manifest schema (skill locations, config overrides, hook subscriptions, telemetry bindings) + discovery protocol (monorepo patterns, framework conventions).

### US-Ro-5: Alchemist Skill Evolution Loop
**Story:** As Aaron, I want skills to improve autonomously via success/failure feedback loops and genetic variation, so that harness capabilities self-tune over time.
**Ambition:** Skills aren't static — Alchemist generates variants, evaluates via Mirror feedback, and promotes winners; failing skills propose experiments that become new variants.
**Chambers touched:** Alchemist (variant generation + selection), Mirror (feedback scoring), Forge (variant prescriber).
**Extensibility surface:** Skill scoring interface (success criteria, quality metrics) + variant generation strategy registry (prompt mutation, parameter sweep, architectural alternatives).

### US-Ro-6: Multi-Agent Capability Bus (Aspirational)
**Story:** As Aaron, I want sub-agents to register custom tools and skills back into the parent harness mid-execution, so that squad agents autonomously extend harness capabilities as they collaborate.
**Ambition:** Agents aren't passive tools — they are co-contributors to the harness. Squad agents discover each other's capabilities, negotiate composition, and emergent skills arise from agent interactions.
**Chambers touched:** Crucible (inter-agent coordination), Curator (capability negotiation), Mirror (trust surface for agent-authored skills).
**Extensibility surface:** Capability bus protocol (agent→harness skill registration + discovery) + trust/quarantine model for agent-generated extensions + composition DSL for multi-agent orchestration.

---

**Older phase 4.6 cycle work archived to history-archive.md**

---

## Deliberation Round (2026-05-24)

Cross-pollination round against 6 internal peers + Erasmus. Read all peer histories, Erasmus's 4-layer critique, Aaron's post-Erasmus insights (branching = functional requirement; agentic-debugger = vision seed; determinism = load-bearing), and the vocabulary slate.

**Position delivered to inbox:** `.squad/decisions/inbox/rosella-deliberation-position.md`

**Headline moves:**
- KEPT US-Ro-1, US-Ro-4. REVISED US-Ro-2 (MCP as generator-source, not just tool-binding), US-Ro-3 (promote priority — owns hermetic replay boundary), US-Ro-5 (flagged structural-mutation leak). WITHDREW US-Ro-6 (federation deferred). Added 4 new stories (Generator SDK, plugin-pinned branching, registry+trust tiers, structural-proposal channel).
- **PARTIAL endorse Erasmus's 4-layer stack.** Layers 1, 2, 4 fully endorsed. Layer 3 (`ProposalGenerator`) endorsed for ~85% data-plane generators; **rejected as universal** — Alchemist variant promotion, new-skill induction, MCP hot-swap, project-local generator load are *structural* mutations that don't fit `{category, confidence, preview}`. Proposed split into `DataProposalGenerator` + `StructuralProposalGenerator` sharing the Router.
- **Tension reads:** solo-v1 with federation-shaped seams; Router resolves Curator-never-approves cleanly; Mirror downgraded to view (frees SDK); lightweight core + heavyweight-as-plugin; Crucible parent, Copilot CLI as default `ModelProvider` plugin.
- **Debugger-lens flags:** US-Ro-1, US-Ro-2, US-Ro-3, US-Ro-NEW-1, US-Ro-NEW-2 all doubly compelling under the agentic-debugger frame. US-Ro-3 (model provider hermetic boundary) is the keystone.
- **Cross-refs that bind work:** Roger US-R-3 + my US-Ro-NEW-2 should merge (branching is replay's plugin-pinning requirement). Alexander US-A-3 *requires* my revised US-Ro-3 or it silently degrades. Erasmus US-E-6 confirms the structural-proposal leak is not Alchemist-specific. Laura US-L-1 evaluator slots into my conformance kit. Valanice US-V-2 validates Mirror-as-view.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

---

## Round 4 — Phase B Reconciliation against `stunning-adventure` (2026-05-24T23:30Z)

**Inbox:** `.squad/decisions/inbox/rosella-reconciliation-2026-05-24T2330Z.md`

---

## Round 6 — Open #7 resolution: US-A-NEW-5 vs `event_log` (2026-05-25T01:30Z)

**Inbox:** `.squad/decisions/inbox/rosella-open-7-2026-05-25T0130Z.md`

Resolved the contradiction my Round 4 surfaced. Re-quoted Alexander's
US-A-NEW-5 verbatim from `agents/alexander/history.md:332-334` (ledger-append
transactional contract: WAL mode, group-commit at turn-end OR N≥32 OR T≥50ms,
≤1ms p99, "lost ≤ last decision boundary" durability). Re-cited the existing
`event_log` shape: 5 columns (id INTEGER PK AUTOINC, event_type TEXT,
payload TEXT JSON-string, session_id TEXT FK, created_at TEXT default now);
`migrations/001-initial.ts:47-53`; index in `004-event-log-index.ts:7-10`;
append at `db/events.ts:43-46`; CairnEvent type at
`cairn/src/types/index.ts:80-86`; 30 consumer files; ProvenanceTier
classification at `forge/src/bridge/index.ts:26-47, 65-93`; stale-session
shim at `cairn/src/hooks/sessionStart.ts:41-54`.

**Contradiction:** legacy `event_log` is too thin to be the L1 primitive
ledger (missing causal_read_set_hash, hook_verdict, hook_verdict_witness,
group-commit boundary, commitment offset, typed payload) AND too rich/
established to delete (ProvenanceTier-tiered, typed CairnBridgeEvent
vocabulary, 30 call sites). The two surfaces do genuinely different jobs.

**Resolution: option (b)-refined.** Keep both. L1 WAL (A.3 hybrid, Phase A
8-field row schema) is the primitive ledger that satisfies US-A-NEW-5
exclusively. `event_log` is demoted to a derived L2 audit + telemetry
projection fed by an `L1Subscriber.onCommit(offset, rows[])` from the
substrate boundary. Honors Aaron decision #10 ("L2-L5 may not import
storage primitives directly"). Bridge layer (`forge/src/bridge/index.ts`)
rewrites to emit L1 primitives; an `EventLogProjector` in Cairn
materializes typed CairnBridgeEvents with `source_event_offset` +
`provenance_tier` columns added by migrations 014/015. Stale-session
shim (2-minute heartbeat) dies — subsumed by L1 crash recovery per
Alexander's recommendation 5. `logEvent(db, ...)` overload stays as the
manual/test entry point; deprecated single-arg overload scheduled for
v1.1 removal.

**Migration ordinal:** slot 2 of Phase B, after A.3 hybrid L1 ships,
before Crucible GA. ~18h total, ~8h consumer churn (most consumers
unchanged because they read `event_log` as audit projection, which is
exactly what it becomes). First L2 projector built on the new L1
substrate — reference pattern for Mirror, Laura's conformance kit,
Sonny's debugger.

**Flagged:** assumption that `parent_session_id`/`fork_point_event_id`
on sessions (Aaron 2a) is sufficient for fork lineage without per-row
markers. Sonny's debugger may push back.

**Cross-team binds:** Roger owns the `L1Subscriber` interface in the
L1-interface package (subscription seam at the boundary, projector in
Cairn). Laura's conformance kit gets `source_event_offset` as
divergence-detection key. Alexander's US-A-NEW-5 contract is unchanged
and satisfied. Gabriel/Router unchanged. Mirror is another L2 projector
of the same pattern.

Read-only sweep across `cairn/`, `forge/`, `skillsmith-runtime/`, `runtime-cli/`, `types/`. Headline: **the plugin host already exists in Cairn, not Forge.** `cairn/src/agents/discovery.ts` is a 482-line, 4-phase topology scanner (user / project / plugin / marketplace) emitting SHA-256-checksummed `DiscoveredArtifact` records with per-type `ResolutionRule` (`additive`/`first_found`/`last_wins`), `ownerPlugin` tagging from `plugin.json`, and cross-scope conflict detection. `ArtifactType` covers instruction/agent/skill/hook/mcp_server/plugin_manifest/command. Counts: ALREADY-EXISTS 1, PARTIALLY-EXISTS 5, NET-NEW 4, CONTRADICTS 0 (1 latent-risk on US-Ro-3 SDK coupling, deferred to Aaron/Graham). Key reuses identified: `ProvenanceTier` (cert/internal, bridge/index.ts:26-47) for trust tiers, DBOM frontmatter (export/compiler.ts:82-100) for hermetic exports, `compiler` agent stub (cairn/agents/compiler.ts) as the natural implementation slot for US-Ro-NEW-2/3, and `HookComposer` (forge/hooks/index.ts) shallow-merge + error-isolation pattern worth lifting to a shared utility. **Plugin pinning at fork (v1 #7) is implementable on existing primitives** — content-addressing is already in place, only need `plugin.json` schema extension + topology-snapshot persist at fork + compiler-agent pin verifier. Rewriting US-Ro-1 and US-Ro-4 as "wire what exists, fill contract gaps" rather than greenfield. Merge with Roger US-R-3 confirmed. Latent SDK-coupling conflict in US-Ro-3 surfaced cleanly, not unilaterally resolved.

---

## Round 7 — v1 Triage (2026-05-25T02:00Z)

**Inbox:** `.squad/decisions/inbox/rosella-triage-2026-05-25T0200Z.md`

Triaged 10 authored stories + Round-6 #7 work + 2 new stories
(Mirror Projector, DBOM-frontmatter-for-exports) against Aaron-locked v1
framework (MVP that validates the harness thesis; bar = "Aaron runs a
one-week productivity loop where every improvement to Crucible is made by
Crucible"). T1 recommended set: 8 items (US-A-NEW-5 contract honored,
EventLogProjector, Mirror Projector, US-Ro-3 hermetic seam, US-Ro-4 boot
wire-up, US-Ro-NEW-2 plugin pinning [v1 commitment #7], US-Ro-NEW-3 T1
slice, US-Ro-1 T1 slice). T2: US-Ro-2 (split), US-Ro-NEW-1, US-Ro-NEW-4,
DBOM frontmatter. T3: US-Ro-5 (Alchemist), MCP-as-generator-source. T4:
US-Ro-NEW-3 full (signing/quarantine), HookComposer lift, US-Ro-1 full
lifecycle. Parking: US-Ro-6 (already withdrawn).

**Free-multiplier wins identified.** Phase A WAL's `causal_read_set_hash`
+ `hook_verdict` promote Mirror divergence detection and pin-at-fork
replay-drift detection from T2 work into T1 essentially for free.
ProvenanceTier (existing) maps onto Graham's Mirror level enum without
new vocabulary. `source_event_offset` (Migration 014) doubles as Laura's
conformance divergence key. ~50–60h of T1 owned-work plus the merged
US-Ro-NEW-2 with Roger.

**Mirror as L2 projector pattern claimed.** Mirror Projector is a parallel
L1Subscriber implementation alongside EventLogProjector (Round 6 #7),
sharing the projector pattern. Both are reference implementations for
later projectors (Laura conformance, Sonny investigation). No producer
writes directly to `mirror_events`; every event originates from an L1
commit. Honors decision #10.

**Cross-team binds:** Roger (US-R-3 merge with US-Ro-NEW-2 confirmed;
shared `L1Subscriber` contract); Graham (Mirror notification render
ownership open question); Sonny (per-row lineage assumption still
flagged); Laura (`source_event_offset` is her conformance key);
Alexander (US-A-NEW-5 contract unchanged); Gabriel (hook_verdict
free-rides into Mirror policy events).

**7 open questions for Cassima** raised — notification render ownership,
mirror_events GC, cross-session Mirror scope, US-Ro-3 Provider home,
plugin manifest package location, MirrorEvent ↔ event_log join key
confirmation, Sonny per-row lineage decision.

---

**2026-05-27 Eureka PRD Overlap Analysis (Scribe Summary):** Cross-agent consensus on Eureka × Crucible storage, runtime, and architecture overlap. See `.squad/decisions.md` **Eureka PRD Overlap Analysis** section for full findings and 5 open questions for Aaron.

---

## Learnings — CTD Phase 1 Lane 2: §7 Generators (L3) (2026-05-28)

**Artifact:** `docs/crucible-technical-design/07-generators-l3.md` (21.2 KB, ≤3pp §7 + ≤1pp Appendix 7-E).
**Decision drop:** `.squad/decisions/inbox/rosella-ctd-phase1-lane2.md`.

### GenericL3AdapterContract design patterns

- The conformance contract is a single property-based suite (`runGenericL3AdapterConformance(adapterFactory, opts) -> ConformanceReport`), not a per-adapter test infra. Eight property classes C-1..C-8: interface compliance, fail-open, hint attribution, lifecycle ordering, registration/discovery, `causalReadSet` completeness, `dependentPaths` non-empty on structural, and no Pareto axis zero-fill.
- C-6 (`causalReadSet` completeness) is the strongest property — it is enforced by stubbing `LedgerWindowReader` + Salsa cache to record every read, then asserting the emitted read-set is a superset. Mirrors Laura's A4 determinism assertion.
- C-7 (empty `dependentPaths[]` rejection) MUST fire at the adapter boundary, not at Router. Pushing the check upstream catches structural-emission bugs as unit-test failures rather than integration-test surprises.
- C-8 (no zero-fill) is the load-bearing Q8 contract: zero-fill silently collapses *incomparable* into *dominated* and discards Pareto-frontier prescriptions. The adapter MUST emit a sparse axis map; missing axis means "not measured", not "measured as zero".
- The conformance report is itself an L1 Decision primitive — one per adapter per run, replayable, bisectable, visible in the Aperture leaderboard. Conformance failures become Sonny-debuggable artefacts.

### Forge-as-reference-implementation pattern

- The existing `packages/forge/` package satisfies C-1..C-8 today with no behavioural changes — the v1 adapter is purely a projection of `OptimizationHint` -> `DataProposalGenerator` proposal shape. `ForgePrescriberOrchestrator` (Wave 2 W2-5) is the canonical `PrescriberOrchestrator` (Laura §3.4 alias).
- Mapping table: hint `category` -> `category`; `confidence` -> `confidence`; `source/evidence` -> `evidence{rationale,citations,tier:'internal'}`; `autoApplyEligible:false` -> `reversibility:'manual-rollback'`; `costEstimate` from existing `ChangeVectorProvider` summary.
- Pattern lift: any new adapter (Eureka v1.5, marketplace plugins) replicates the mapping table. The conformance suite is the contract; Forge is the worked proof the contract is satisfiable on an already-shipped codebase. **No adapter ever gets bespoke test infra.**
- Existing Wave 2 invariants pull double duty: fail-open on prescriber crash satisfies C-2; `(skillId, source, category)` dedup key satisfies C-3; `ATTENUATION_FLOOR=0.1` preserves session forward progress under C-2 stress.

### PrescriptionResult shape (R2-5 LOCK)

- Field name is exactly `nonDominatedReason: 'optimal' | 'incomparable'` (camelCase, two words). Optional companion `incomparableWith?: string[]`.
- **Set by `ParetoFitnessEvaluator` at evaluation time, NOT by the generator.** Generators emit only `fitness`. This split is why the field lives on `PrescriptionResult` (the evaluator output), not on the proposal itself.
- Three downstream consumers all read the same literal field/value, no translation: Applier (§8) propagates onto `DecisionPayload.nonDominatedReason`; replay re-asserts the value; Valanice's §9 Aperture leaderboard renders `[incomparable-axes]` badge when value === `'incomparable'`.
- `'optimal'` vs `'incomparable'` is the audit distinction: *proved* dominant on shared axes vs *unchallenged* on a different axis set. The badge exists because conflating them silently mis-credits Pareto winners.

### Cross-section binds discovered

- §7.2 lifecycle pins `PluginManifest` SHA-256 per session-fork — pin lives in Roger's §10 snapshot. Need Roger's snapshot field name, transitive-closure vs direct-only storage decision (Q4 says transitive — §7 assumes the snapshot follows), and lockfile canonical form (assume CBOR to match proposal canonicalisation). Codegen for `AdapterContext` blocks on Roger's §3 + §10 outputs; CTD spec does not.
- `LedgerWindowReader` (Q1 rename from `ObservationCaptureStore`) is the read-only handle `AdapterContext` exposes to adapters at `start`. Roger's §3 owns the read-side WAL surface; §7 needs cursor API, snapshot-isolation-at-start, mid-read session-end behaviour to firm up the TypeScript declaration.

📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.

---

## Learnings — Pass A Execution (2026-05-30)

### PA-B4 Ancestry/Replay Divergence (Resolved)

Aaron accepted **Option A: Unify ancestry-aware reads under one API**. Key insights:

- **Replay correctness over ergonomics:** Option A's uniform capture in `causalReadSet.ancestryRefs[]` is more robust than Option B's discipline-based contract. Generators that cite parent EventIds MUST declare the read via `ReadSetBuilder.ancestry()`, or C-6b conformance test fails.
- **§7.3 scoping rule:** `primitive(id)` and `projection(key)` are child-session-scoped by default. Forked sessions see only child ledger unless `.ancestry(ancestorSid, includeTransitiveParents)` is explicitly called.
- **§11.4 replay semantics:** Replay re-feeds the same stitched view (parent + child) that live generators saw, keyed by read-set hash. Generators that omit `.ancestry()` replay with child-only context, matching their live emission. No divergence hazard.
- **C-6b conformance test:** Property test resolves `evidence.citations[]` to session IDs and asserts parent sessions appear in `causalReadSet.ancestryRefs[]`. Coordinates with Laura's §16.9 C-9 acceptance signals (structural-proposal supersede).
- **Eureka v1.5 forward ref (§7.F):** If Eureka analyzes multi-fork experiments, the adapter MUST call `.ancestry()`. Failure causes C-6b test failures and replay divergence. If Eureka only analyzes single-session data, no ancestry reads required.
- **Migration cost low:** Forge v1 is `kind:'data'` only and doesn't fork. Curator doesn't fork. Eureka v1.5 is future scope, so v1 has no migration burden.

### childSid Collision User Stories (Round 2)

Aaron requested UX clarification after seeing original Options A/C doc, leaning toward **"give the user the option to start fresh or resume."** Generated 4 user stories:

- **US-1 (Quick experiment, abort, retry):** Most common case — Aaron experiments, aborts, tries again. Option A (fresh) is seamless; Option C (resume) silently continues old session (surprising). Hybrid surfaces collision, lets Aaron choose.
- **US-2 (Long-running fork, crash mid-session):** Strongest argument for Option C — automatic salvage of 200 decisions after crash. But crashes are rare if sessions close cleanly. Hybrid makes recovery explicit via `--resume` flag or prompt.
- **US-3 (Side-by-side comparison):** Design-time workflow — fork at offset 50, run strategy X, fork at 50 again to run strategy Y. Option A enables naturally. Option C blocks (closed sessions immutable). Hybrid works if `--fresh` flag used.
- **US-4 (Accidental resume):** Aaron aborted a fork 3 days ago, forgets, forks at 50 again expecting fresh. Option C silently resumes 3-day-old session (high surprise). Option A and Hybrid avoid this.

**Dominant pattern:** US-1 and US-3 dominate frequency (experiments + comparisons). US-2 is valuable but rare. Fresh-by-default optimizes for common case; resume is opt-in.

**Hybrid proposal:** CLI surface with `--fresh` / `--resume` flags + interactive prompt on collision. Default = `F` (Fresh) if aborted session >1 hour old, `R` (Resume) if <1 hour. Determinism preserved via Decision row in parent ledger recording user choice. Preimage = timestamp-variant for fresh, reuse existing `childSid` for resume.

**Recommendation:** **Hybrid lean, fresh-by-default.** US-1/US-3 dominate; US-2 crash recovery preserved via explicit opt-in; US-4 accidental resume prevented; collision surfacing gives full visibility; Decision row preserves determinism for replay.

### CTD Chapter Cross-References Learned

- **§6.1 ReadSetRef schema:** Lives in `06-primitive-taxonomy.md`. Common envelope for all primitives. Adding fields here touches every generator.
- **§7.3 ReadSetBuilder:** Lives in `07-generators-l3.md`. Helper class generators use to declare read edges. Fluent builder API.
- **§7.A Conformance suite:** Property-based test suite (C-1 through C-9) that runs against any L3 adapter. Laura owns the runner (§5.3), Rosella owns the spec.
- **§11.4 Replay protocol:** Lives in `11-hermetic-replay.md`. Re-feed loop procedure with oracle comparison. Bootstrap rehydration → re-feed → oracle comparison.
- **§7.F Eureka forward ref:** v1.5 scope. Eureka is external library consumed via optional adapter. Must pass §7.A conformance suite.

### Coordination Notes for Next Session

- **Laura:** C-6b (ancestry-read completeness) sits alongside C-9 (structural-proposal supersede) in §7.A. Both are property tests that coordinate with §16 acceptance signals.
- **Roger:** When Aaron rules on childSid hybrid, check §13.1 CLI verb consistency for `--fresh` / `--resume` flags. Also `crucible session resume <childSid>` verb.
- **Gabriel:** No Router coordination needed for PA-B4. Ancestry reads are ReadSetBuilder-level (L3), not Router-level (L4). If Aaron had picked Option B, would need Router escalation protocol for `kind:'ancestry-dependent'` proposals.

**Context:** Pass A triage went silent last session after long-lived background agent context limits. Picked back up this session per Aaron's ruling: OPTIONS DOCS FIRST on the two blockers (PA-B4 ancestry/replay, childSid collision) before he decides paths. Completed all 7 assigned Pass A items.

### Phase 1: Options Docs (BLOCKERS)

**Artifact paths:**
- `docs/crucible-technical-design/decisions/pa-b4-ancestry-replay-options.md` (8.7 KB)
- `docs/crucible-technical-design/decisions/childsid-collision-options.md` (11.4 KB)

**PA-B4 ancestry/replay divergence:**  
Identified divergence between §7 generator reads and §10/§11 replay semantics. Two options: (A) unify ancestry-aware reads under one API (`ReadSetBuilder.ancestry()` mirrors `readAncestry()`); (B) split APIs cleanly with documented divergence (`ancestry-dependent` proposal category + Router escalation). Recommended **Option A** — uniform capture in `causalReadSet` is more robust for replay correctness; lower v1 implementation cost (no Router escalation protocol); acceptable ergonomic friction (95% of generators never need parent history).

**childSid collision:**  
Identified deterministic collision risk when forking the same `(parentSid, offset)` twice (retry after abort). Three options: (A) add counter/timestamp to preimage (preserves determinism within session, different childSid per attempt); (B) protocol-error semantics (user resolves collision manually); (C) resume-aborted-session semantics (idempotent fork, same childSid resumes same ledger). Recommended **Option A (timestamp variant)** — `created_at_ns` already exists in `sessions` table, nanosecond resolution makes collision practically impossible, transparent to user, orphaned directories are GC-able.

**Tradeoff analysis:**  
Both docs include detailed tradeoff matrices (replay correctness, ergonomics, implementation cost, alignment with append-only philosophy). Both flag cross-team coordination points: PA-B4 touches Laura (conformance C-6b), Gabriel (Router escalation if Option B); childSid touches Roger (fork protocol implementation), Laura (if C-9 acceptance signals reference fork semantics).

### Phase 2: Execute 5 Non-Blocked Items (§7/§10)

**3. Trust-tier promotion persistence (§7.4.1):**  
Added derived `plugin_trust_history` table keyed on `manifestSha256`. Captures promotion clock (30-day + 10-invocation + 0-violation), promotion events as Decision primitives, violation tracking as Observation rows. Rebuildable from L1 audit trail. Promotion logic triggers on every generator emission; violations reset the 30-day clock. Schema: 7 columns (manifest_sha256 PK, plugin_id, current_tier, first_seen_at_ns, promoted_to_community_at_ns, invocation_count, violation_count, last_invocation_at_ns).

**4. Conformance suite C-8 → C-9 drift (§7.A):**  
Extended conformance contract from eight to nine property classes. Added C-9 (structural-proposal supersede contract): generators emitting `supersede` replacements MUST set `envelope.parentId` to the obsoleted proposal's EventId (§7.D item 6). Observable signal: §5.A.2 Scheduler resolves `supersededBy` deterministically via `parentId`. Applies to both `StructuralProposalGenerator` and `DataProposalGenerator` when they supersede in-flight proposals. Updated §7.A table + prose to reflect C-1…C-9.

**5. Pareto eval perf budget (§7.5.1):**  
Specified concrete budget constraints: ≤5ms p99 for up to 50 concurrent proposals (O(N²) worst case, O(N log N) typical with sparse axis sets), ≤10 MiB heap allocation ceiling, 20ms timeout with fail-open (emit all as `incomparable` + log `perf_budget_exceeded` Observation). Laura's §16 perf conformance suite (`ci:conformance:perf`) includes dedicated `pareto-eval-latency` test (1000 runs, synthetic 50-proposal fixture, parameterized by axis-set sparsity 10%/50%/90% overlap). v1 baseline: Forge + Curator emit ≤5 proposals per turn, well below ceiling; budget is forward-looking for v1.5 Eureka (20–30 proposals/turn) and v2 marketplace plugins.

**6. `alternatives[]` unbounded (§7.5.2):**  
Bounded `PrescriptionResult.incomparableWith[]` to top-K=10 inline + CAS spill. Pathological case (50 proposals all incomparable) = 50 × 49 = 2,450 comparisons → unbounded arrays bloat Decision payloads. Mitigation: evaluator inlines first 10 (sorted lexicographically by `prescriptionId` for determinism), spills full array to CAS as JSON when `|incomparableWith| > 10`, sets `incomparableWithRef` CAS digest. Decision payload size ceiling: 10 × 64-byte IDs + 32-byte CAS ref = 672 bytes max. Aperture/CLI render "...and N more" suffix; full list via `crucible decision show <id> --full`. Replay does NOT compare `incomparableWith[]` (informational metadata, not structural per §11.6 oracle).

**7. Invocation-stack O(N) reconstruction (§10.6.1.1):**  
Proposed incremental stack cache mitigation for O(N) linear scan. `ReconstructInvocationStack(sessionId, N)` scans all `task_start`/`task_end` rows from offset 0 to N — for 10K-row session at offset 9,999, scans 9,999 rows. Acceptable for replay (one-time) and CLI `bt` (user-initiated), but bottleneck if reconstructed on every commit for Aperture rendering. Added optional L2 cache table `invocation_stack_cache` (session_id, checkpoint_offset, stack_json PK) checkpointing at 100-row intervals. Cost: O(100) scan per reconstruction (99 rows worst case between checkpoints), ~1 KiB per checkpoint × (session length / 100) = 100 KiB for 10K-row session. Cache is **derived only** (rebuildable from L1, cache miss falls back to full scan). **v1 optional** — cache not required for correctness, only performance; mandatory in v1.5 when Sonny's debugger queries stack on every breakpoint or Aperture renders live stack depth. Alternative considered (event-sourced stack delta log) rejected — doubles storage, duplicates WAL rows.

### Cross-Team Coordination Points

**PA-B4 (awaiting Aaron ruling):**
- If Option A: coordinate with Laura on C-6b conformance test extension (ancestry-read completeness), document ancestry semantics in §7.F (Eureka v1.5).
- If Option B: coordinate with Gabriel on Router escalation protocol (§5.8 new subsection), upgrade C-6 to C-6-strict in §7.A.

**childSid (awaiting Aaron ruling):**
- If Option A (timestamp): coordinate with Roger on fork protocol implementation timeline, document collision-prevention guarantee in §10.4.
- If Option C (resume): add `fork_resume` Observation sub-kind to §6.3, update `sessions.status` state machine in §10.1, coordinate with Roger on resume protocol.

**C-9 conformance drift:**
- Coordinate with Laura on threading C-9 (structural-proposal supersede) through §16 acceptance signals (she's already working on this per now.md Pass A leftovers).

**Pareto perf budget:**
- Laura owns §16 perf conformance suite; she'll implement `pareto-eval-latency` test runner.

**Invocation-stack cache:**
- Coordinate with Roger on L2 projector pattern (same pattern as EventLogProjector from Round 6); coordinate with Sonny on v1.5 debugger requirements (determines if cache becomes mandatory).

### Key Learnings

- **Options docs discipline:** Aaron's "OPTIONS DOCS FIRST" ruling is the right forcing function — writing out the tradeoffs surface-areas the decision cleanly. PA-B4 and childSid both had 2-3 plausible paths; documenting them explicitly with cost/benefit matrices makes the ruling defensible and auditable.

- **Conformance suite evolution:** C-8 → C-9 drift was a real gap — §7.D item 6 (supersede contract) specified the behavior but §7.A conformance suite hadn't been updated to test it. The C-9 addition closes the gap; conformance suite now aligns with §7.D structural obligations.

- **Top-K + CAS spill pattern:** The `incomparableWith[]` bounded-array + CAS-reference mitigation is the first use of this pattern in the CTD. Same pattern applies to any array field that can grow unbounded in pathological cases (e.g., `alternatives[]` in DecisionPayload, `citations[]` in Evidence). Document as reusable pattern for v1.5 when other unbounded arrays surface.

- **Incremental derived-view caching:** The invocation-stack checkpoint cache is the first incremental L2 projection (EventLogProjector and Mirror Projector are full-scan per-commit). The checkpoint-interval pattern (cache every Nth row) generalizes to other expensive derived views (e.g., Pareto frontier history over time, trust-tier promotion timeline). Document as L2 optimization pattern.

- **Pass A triage lessons:** Going silent mid-triage (stale context after long-lived background agents) was avoidable — should have surfaced "context limit approaching" signal earlier. Next time: proactively report partial progress + remaining items before context degrades.

---

## 2026-05-30: childSid Collision Hybrid Design — ADR-0019 Landed

**Context:** Aaron ruled on the childSid collision hybrid design after 4-persona review (Graham/Valanice/Laura/Roger). All 4 reviews: APPROVE-WITH-CONDITIONS. Strong cross-persona convergence — Graham + Laura independently caught the same replay-determinism blocker (wall-clock heuristic violates hermetic replay).

**Aaron's ruling:** Land the hybrid design. Drop wall-clock heuristic entirely. Always prompt on collision (TTY); never auto-default by age.

**Work completed:**
1. **ADR-0019 created** (docs/adr/0019-childsid-collision-hybrid.md) — comprehensive ADR documenting the always-prompt hybrid design with 10 design points, acceptance signals, security implications, resolved questions.
2. **§10.4 fork protocol updated** — rewrote fork pseudocode with collision detection, interactive prompt UX, Decision row recording on PARENT ledger, preimage rules (timestamp variant for --new, reuse existing childSid for --resume), ork_resume Observation append.
3. **§10.1 session state machine updated** — added borted → resumed transition; added status value 'resumed' to schema; added "closed ≠ sealed for metadata" clarification (closed sessions accept metadata appends, refuse work-session appends).
4. **§6.3 Observation taxonomy updated** — added ork_resume sub-kind to Observation enum.
5. **§13.1 CLI verb table updated** — updated crucible fork row with [--new | --resume] [--no-interactive] flags + collision handling description; added crucible session resume <sid> verb row (alternative path for resuming discovered aborted sessions).
6. **§16.9 acceptance signals updated** — added 8 new acceptance scenarios (A-Fork-1 through A-Fork-8) covering all 4 user stories (US-1 quick retry, US-2 crash recovery, US-3 side-by-side, US-4 accidental resume prevention) plus replay determinism, non-TTY behavior, --no-interactive flag, direct resume verb.
7. **Options docs marked as superseded** — prepended "SUPERSEDED by ADR-0019 (2026-05-30)" banner to both docs/crucible-technical-design/decisions/childsid-collision-options.md and docs/crucible-technical-design/decisions/childsid-collision-round2-user-stories.md.

**10 design points landed (all incorporated per Aaron's synthesis):**
1. ✅ Dropped wall-clock 1-hour heuristic entirely (Graham + Laura finding: replay-determinism violation)
2. ✅ Always-prompt UX: TTY shows [N]ew / [R]esume / [C]ancel with relative time ("3 days ago") + ISO timestamp
3. ✅ Naming: "New" instead of "Fresh" (Valanice finding: parallel structure with "Resume")
4. ✅ Non-TTY behavior: exit code 2, error message "Interactive prompt unavailable. Use --new or --resume."
5. ✅ Flags: --new | --resume mutually exclusive, --no-interactive, --label kept
6. ✅ Determinism: Decision row in PARENT ledger with {chosenOption, existingChildSid, collisionDetectedAt}
7. ✅ Preimage: timestamp variant for --new, reuse existing childSid for --resume
8. ✅ Observation row: ork_resume sub-kind added to §6.3
9. ✅ Keep both --resume flag AND crucible session resume verb (Roger finding: orthogonal workflows)
10. ✅ Closed-session metadata appends: clarification added to §10.1 ("closed ≠ sealed for metadata")

**Reviewer findings incorporated:**
- **Graham (Architect):** Parent-ledger Decision row is idiomatic (RFC+Decision pattern); wall-clock heuristic inappropriate (replay-instability); L3.5 Scheduler has no coupling to fork protocol; recommend offset-based heuristic or drop entirely. **Outcome:** Dropped heuristic entirely per Aaron ruling.
- **Valanice (UX):** "New" instead of "Fresh" (natural language + parallel structure); relative time ("3 days ago") critical for attention capture (US-4); 1-hour threshold is cognitive boundary but turn-count heuristic would strengthen it. **Outcome:** "New" naming adopted; relative time added to prompt spec; heuristic dropped per Aaron ruling (always-prompt with neutral presentation).
- **Laura (Tester):** All 4 user stories are testable; replay determinism requires Decision row recording (covered); time-aware nudge requires logical-time injection (hermetic replay); ork_resume sub-kind required for ledger trace. **Outcome:** All findings incorporated; 8 acceptance scenarios added to §16.9; ork_resume added to §6.3.
- **Roger (CLI):** --new/--resume flags consistent with CLI taxonomy; --disambiguator flag redundant (timestamp variant handles collision); TTY detection + exit codes required; keep both flag and verb (orthogonal use cases). **Outcome:** All findings incorporated; --disambiguator rejected; TTY/exit-code spec added to §10.4 pseudocode; both flag and verb documented in §13.1.

### Key Learnings

**Cross-persona review yields replay-bug catch:** Graham (Architect) and Laura (Tester) independently caught the same blocker — wall-clock heuristic (
ow() - created_at_ns > 1 hour) violates hermetic replay because replay executes weeks/years after original run, causing threshold logic to flip. This is a **genuine correctness bug** that neither Rosella's original design nor Aaron's initial "maybe give the user the option" framing surfaced. The 4-persona review panel caught it via domain expertise convergence (Graham: "offsets are structural, wall-clock is informational"; Laura: "logical-time injection required for hermetic replay"). **Skill extraction candidate:** "cross-persona-review-yields-replay-bug-catch" — disciplined multi-lens review surfaces hidden determinism violations in protocol design.

**"New" vs "Fresh" naming precision:** Valanice's "Fresh" → "New" critique is an example of CLI vocabulary precision work. "Fresh" is adjective modifying implicit noun; "New" is noun or verb (parallel with "Resume"). Both read as 3-letter words in prompt, so UX real estate unchanged. But "New session" / "Resume session" reads cleaner than "Fresh session" / "Resume session". Small precision wins compound in tired-engineer usability.

**Idiomatic Decision-row pattern recognized:** Graham's finding that parent-ledger Decision row is **idiomatic** (not a violation of append-only or closed-session invariants) is a load-bearing architectural insight. The fork-collision Question/Decision pattern is structurally identical to existing RFC (Request for Choice) patterns in Crucible. This framing makes the hybrid design cheaper — no new ADR for "closed ≠ sealed" (just a one-line clarification), no new primitive or envelope field. Reuse existing Question/Decision primitives.

**Always-prompt as training wheels:** Valanice's "interactive prompt is training wheels that teach the fork model" framing is the UX justification for dropping the heuristic. After 2-3 collisions, Aaron learns the pattern and graduates to explicit flags (--new/--resume). The prompt never blocks power users (flags bypass it) but prevents silent data loss for default case (US-2 crash recovery without prior awareness). This is the **safety-by-default** design Aaron values.

**Orthogonal flag vs verb workflows:** Roger's finding that crucible fork --resume and crucible session resume serve **orthogonal workflows** is a clean separation. Flag = "I know at fork time I want to resume"; verb = "I discovered an aborted session via crucible session list, resume it directly without forking". Both are first-class; neither is deprecated. This is better than forcing one canonical path.

**Acceptance-signal vocabulary coordination:** Laura's 8 A-Fork-* scenarios use the same acceptance-signal vocabulary as §16.9's existing A1–A13 + C-9. This is disciplined test-strategy coordination — new scenarios extend the existing acceptance tier, not create a parallel vocabulary. Conformance-tier (C-*) vs acceptance-tier (A-*) distinction is preserved.

**Options-docs-first discipline validated again:** PA-B4 (ancestry/replay) and childSid collision both used options-docs-first. Aaron's ruling on childSid came after 4-persona review of the hybrid proposal (Round 2 user stories doc). Options docs surface tradeoffs cleanly; reviews catch hidden bugs; ruling is defensible and auditable. This is the right forcing function for non-trivial design choices.

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
