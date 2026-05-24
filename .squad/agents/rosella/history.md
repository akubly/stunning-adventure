📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
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

Read-only sweep across `cairn/`, `forge/`, `skillsmith-runtime/`, `runtime-cli/`, `types/`. Headline: **the plugin host already exists in Cairn, not Forge.** `cairn/src/agents/discovery.ts` is a 482-line, 4-phase topology scanner (user / project / plugin / marketplace) emitting SHA-256-checksummed `DiscoveredArtifact` records with per-type `ResolutionRule` (`additive`/`first_found`/`last_wins`), `ownerPlugin` tagging from `plugin.json`, and cross-scope conflict detection. `ArtifactType` covers instruction/agent/skill/hook/mcp_server/plugin_manifest/command. Counts: ALREADY-EXISTS 1, PARTIALLY-EXISTS 5, NET-NEW 4, CONTRADICTS 0 (1 latent-risk on US-Ro-3 SDK coupling, deferred to Aaron/Graham). Key reuses identified: `ProvenanceTier` (cert/internal, bridge/index.ts:26-47) for trust tiers, DBOM frontmatter (export/compiler.ts:82-100) for hermetic exports, `compiler` agent stub (cairn/agents/compiler.ts) as the natural implementation slot for US-Ro-NEW-2/3, and `HookComposer` (forge/hooks/index.ts) shallow-merge + error-isolation pattern worth lifting to a shared utility. **Plugin pinning at fork (v1 #7) is implementable on existing primitives** — content-addressing is already in place, only need `plugin.json` schema extension + topology-snapshot persist at fork + compiler-agent pin verifier. Rewriting US-Ro-1 and US-Ro-4 as "wire what exists, fill contract gaps" rather than greenfield. Merge with Roger US-R-3 confirmed. Latent SDK-coupling conflict in US-Ro-3 surfaced cleanly, not unilaterally resolved.
