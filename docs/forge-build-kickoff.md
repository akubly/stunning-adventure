# Forge Build Kickoff

## What is Forge?

Forge is a deterministic frame around a stochastic core, with Cairn as the nervous system that makes it learn. It wraps the `@github/copilot-sdk` to provide programmatic session control, typed event streaming, decision gates, and tool interception — then feeds everything through Cairn's observe → analyze → prescribe pipeline. Source code is human intent (workflow definitions, decision rules). The compiler is Forge + Cairn working together. Object code is portable artifacts — certified SKILL.md files with DBOM (Decision Bill of Materials) provenance metadata. The target is vanilla Copilot, everywhere. Forge isn't "a better way to run Copilot." It's "a way to develop certified workflow artifacts that make Copilot better everywhere." Anyone can write a SKILL.md. Only Forge + Cairn can compile one through iterative validation with a provenance trail.

---

## Architecture

Full architecture sketch with integration seams diagram: [`docs/spikes/copilot-sdk-assessment.md`](spikes/copilot-sdk-assessment.md)

**Summary:** Monorepo with three packages sharing a type contract:

| Package | Role | Description |
|---------|------|-------------|
| `@akubly/types` | Shared Contract | Pure type definitions: `CairnEvent`, `ProvenanceTier`, `DBOM`, `DecisionRecord`, `SessionIdentity`, `TelemetrySink`. No runtime behavior. |
| `@akubly/cairn` | Observability Platform | Current project. Archivist, Curator, Prescriber, 10 MCP tools, hooks, SQLite. Adds `bridge/ingest.ts` (accepts Forge events) and `telemetry/` (pluggable sinks). |
| `@akubly/forge` | Execution Runtime | **New package.** SDK wrapper (`runtime/`), event bridge (`bridge/`), hook composer (`hooks/`), decision gate framework (`decisions/`), model selector (`models/`), export pipeline (`export/`). |

**Integration seams (four):**

1. **Event Bridge (Forge → Cairn)** — SDK events → `CairnEvent` → `event_log`. The ~50 LOC adapter is Forge's most important module.
2. **Prescription Output (Cairn → Forge)** — Patterns → prescriptions → corrections to model selection, decision gates, tool config.
3. **Export Pipeline (Forge → Artifacts)** — SKILL.md + DBOM with provenance frontmatter, quality-gated by Cairn's linter/validator.
4. **PGO Telemetry (Corp → Cairn → Forge)** — Production signals → Application Insights → Cairn ingest → next compilation cycle.

---

## Spike Results

**Branch:** `squad/copilot-sdk-spike` (merged to main)  
**Duration:** 3 days  
**Verdict:** ✅ **GO**  
**SDK Version:** `@github/copilot-sdk@0.2.2`

| # | Question | Result | Key Finding |
|---|----------|--------|-------------|
| Q1 | Session Management | ✅ | Full lifecycle API: create, resume, terminate, list. Rich `SessionConfig`. |
| Q2 | Tool Interception | ✅ | `onPreToolUse`/`onPostToolUse` hooks with bidirectional modification. Can block (`"deny"`), defer (`"ask"`). |
| Q3 | Decision Gates | ✅ | Three native mechanisms: hook blocking, permission handler, elicitation forms. |
| Q4 | Event Taxonomy | ✅ | 86 typed events, schema-generated. 22 map to Cairn signals. `parentId` chain linking. |
| Q5 | Cairn Bridge | ✅ | ~50 LOC adapter with provenance tiering. DBOM reconstruction verified. |
| Q6 | Stability | ⚠️ | Technical Preview, 52 versions in ~3 months. Bounded by abstraction layer — SDK churn affects ~50 LOC. |
| Q7 | Model/Tokens | ✅ | `listModels()`, `setModel()` mid-session, `assistant.usage` with nano-AIU billing, quota snapshots. |
| Q8 | End-to-End | ✅ | Event bridge compiles clean, DBOM reconstruction works, provenance tiering verified. |

Go/no-go threshold was Q1+Q2+Q4+Q5 = ✅. All four passed plus Q3, Q7, Q8 exceeded expectations.

**Full spike documents:**
- [`docs/spikes/copilot-sdk-assessment.md`](spikes/copilot-sdk-assessment.md) — Go/no-go assessment with architecture sketch
- [`docs/spikes/copilot-sdk-exploration.md`](spikes/copilot-sdk-exploration.md) — Day 1 deep dive findings
- [`docs/spikes/copilot-sdk-spike.md`](spikes/copilot-sdk-spike.md) — Original spike scope document

---

## Build Phases

### Phase 1: Monorepo Foundation (1–2 days)
1. Create `@akubly/types` package — extract shared types from current codebase
2. Restructure current project as `@akubly/cairn` — update imports, verify all 427 tests pass
3. Scaffold `@akubly/forge` package — empty package with correct TS config, importing `@akubly/types`

### Phase 2: Live Runtime Verification (1–2 days)
4. Close the runtime gap — run spike PoC against a live Copilot CLI process
5. Validate BYOK path — test `provider: { baseUrl, apiKey }` for non-standard auth environments

### Phase 3: Core Forge Loop (3–5 days)
6. SDK wrapper + session manager — production `runtime/` module
7. Event bridge — promote spike `event-bridge.ts` to production with full test coverage
8. Hook composer — extract from `tool-hooks-poc.ts`, make it the mandatory hook registration path
9. Decision gate framework — promote from `decision-gate-poc.ts`, add `DecisionRecord` to `@akubly/types`

### Phase 4: Export Pipeline (2–3 days)
10. DBOM generator — promote from spike, add persistence to Cairn's DB
11. SKILL.md compiler — generate certified SKILL.md with provenance frontmatter
12. Cairn linter/validator integration — export pipeline runs `lint_skill` + `test_skill` before emitting

### Phase 5: PGO Telemetry (future)
13. Pluggable telemetry sink — `TelemetrySink` interface + SQLite and Application Insights implementations
14. PGO ingest — import production signals back into Cairn's `event_log`

**Decision point for Aaron:** Charter sister squad after Phase 2 or continue with this squad through Phase 3? Forge's domain (agent orchestration, SDK, decision gates) is distinct from Cairn's (pattern detection, prescription, observability).

---

## Key Concepts to Remember

| Concept | Definition |
|---------|------------|
| **Decision Chain** | Content-addressable linked decisions with parent IDs (like git SHAs). Alternatives are mandatory. Tamper-evident audit trail. |
| **LX Heuristics** | 10+1 Language Model Experience principles parallel to Nielsen's 10 UX heuristics. Tools are UX for the LLM. |
| **Shiproom** | Decision defense ceremony. Evaluates reasoning, not artifacts. Facilitator + domain challengers + Curator with data. |
| **DBOM** | Decision Bill of Materials. Provenance metadata in YAML frontmatter. Content-addressable decision hashes, actor attribution, alternatives. |
| **Provenance Tiers** | Internal (debugging), Certification (DBOM), Deployment (PGO). Events are tagged at creation; DBOM filters to certification tier. |
| **PGO** | Profile-Guided Optimization. Deployed artifacts emit telemetry → Cairn → next compilation cycle improves the artifact. |
| **Context Budget** | Every token consumed is budget spent. Finite, non-renewable within a session. |
| **Signal Density** | Information value per token in tool output. |
| **Decision Altitude** | 4-tier consequence taxonomy: ambient (0) → logged (1) → flagged (2) → gated (3). |
| **Stochastic Drift** | LLM tendency to deviate across turns. Forge's deterministic frame constrains this. |

---

## Read These First

Before starting any build work, the team should read these files in order:

1. **`.squad/identity/wisdom.md`** — Session wisdom: manifesto, LX principles, shiproom design, OOP patterns, positioning
2. **`docs/spikes/copilot-sdk-assessment.md`** — Full spike go/no-go assessment with architecture sketch and integration seams
3. **`.squad/identity/now.md`** — Current focus and recommended build phases
4. **`.squad/decisions.md`** — All team decisions (active and archived)
5. **`docs/spikes/copilot-sdk-spike.md`** — Original spike scope document (8 questions, circuit breaker design)
6. **`docs/spikes/copilot-sdk-exploration.md`** — Day 1 deep dive findings (86 events, hook model, session API)

Agent-specific context:
- **Graham (Lead):** `.squad/agents/graham/history.md` — architecture decisions, review patterns, spike assessment
- **Roger (Platform Dev):** `.squad/agents/roger/history.md` — SDK hands-on findings, bridge implementation, hook composition
- **Valanice (UX Lead):** `.squad/agents/valanice/history.md` — LX heuristics, Shiproom design, Prescriber UX
- **Rosella (Plugin Dev):** `.squad/agents/rosella/history.md` — OOP patterns, artifact discovery, plugin architecture

---

## Current State

- **Branch:** `main` (spike merged from `squad/copilot-sdk-spike`)
- **Tests:** 427 passing across 10 test files
- **SDK:** `@github/copilot-sdk@0.2.2` installed (zero dependency conflicts)
- **Published:** `@akubly/cairn@0.1.0` on npm
- **MCP Tools:** 10 operational (get_status, list_insights, get_session, search_events, run_curate, check_event, list_prescriptions, get_prescription, resolve_prescription, show_growth)
- **Hooks:** preToolUse (Curator + Prescriber), postToolUse (Archivist)
- **DB:** 9 migrations, 10+ tables, WAL mode
- **Key risk:** Runtime verification gap — spike proved type compatibility, not runtime behavior. Phase 2 must close this.
