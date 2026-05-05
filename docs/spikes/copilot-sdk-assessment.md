# Copilot SDK Spike — Go/No-Go Assessment

**Author:** Graham (Lead / Architect)  
**Date:** 2026-04-08  
**Branch:** `squad/copilot-sdk-spike`  
**Status:** ✅ SPIKE COMPLETE — GO

---

## Verdict

**GO.** The `@github/copilot-sdk` is a sound foundation for Forge.

The SDK provides everything we need for the core loop: programmatic session
control, typed event stream with 86 event types, first-class tool interception
with blocking capability, and native decision gate mechanisms. The Cairn bridge
is ~50 LOC. The Technical Preview risk is real but bounded — our abstraction
layer (the event bridge) isolates us from API churn.

---

## Evidence Summary — Scorecard

| # | Question | Result | One-Line Answer |
|---|----------|--------|-----------------|
| Q1 | Session Management | ✅ Yes | Full lifecycle API: create, resume, terminate, list. Rich `SessionConfig` with model, tools, hooks, MCP servers, BYOK. |
| Q2 | Tool Call Interception | ✅ Yes | `onPreToolUse` / `onPostToolUse` hooks with bidirectional modification. Can observe, block (`"deny"`), or defer (`"ask"`). Per-call granularity. |
| Q3 | Decision Gates | ✅ Yes | Three complementary mechanisms: hook blocking, permission handler flow, and schema-driven elicitation forms. Native support, no SDK fork needed. |
| Q4 | Event Taxonomy | ✅ Comprehensive | 86 typed events, schema-generated (stable), typed subscription with inference. 22 events map to Cairn-relevant signals. `parentId` chain linking for correlation. |
| Q5 | Cairn Bridge | ✅ ~50 LOC | Event map + payload extractors + provenance tier classification. DBOM reconstruction from certification-tier events is a filter-and-collect. |
| Q6 | Stability & Limitations | ⚠️ Manageable | Technical Preview with rapid churn (52 versions in ~3 months). But: zero dep conflicts, types are comprehensive (105KB generated), all 427 existing tests pass with SDK installed. |
| Q7 | Model Selection & Tokens | ✅ Yes | `listModels()`, `setModel()` mid-session, `assistant.usage` events with nano-AIU billing, quota snapshots. No runtime budget setter — must enforce at application level. |
| Q8 | End-to-End Integration | ✅ Verified | Event bridge compiles clean, DBOM reconstruction works, provenance tiering classifies 10 certification-tier event types. Roger completing E2E wiring Day 3. |

**Go/no-go threshold was:** Q1 + Q2 + Q4 + Q5 = ✅. **All four passed.**  
Q3 and Q7 were allowed to be ⚠️ — both exceeded expectations at ✅.  
Only Q6 is ⚠️, which was the expected outcome for a Technical Preview.

---

## Architecture Confirmation

**Does the monorepo model hold up?** Yes, and the spike makes the boundaries
clearer than pre-spike assumptions.

### `@cairn/types` — Shared Contract

The integration seam between Cairn and Forge. Contains types that both packages
import. Nothing here has runtime behavior — it's pure type definitions and
constants.

```
@cairn/types/
├── events.ts          # CairnEvent, SessionEventType (Cairn's vocabulary, not SDK's)
├── provenance.ts      # ProvenanceTier, CERTIFICATION_EVENT_TYPES
├── dbom.ts            # DBOM, DBOMEntry, DBOMSummary
├── decisions.ts       # DecisionRecord, DecisionSource, DecisionConfidence
├── sessions.ts        # SessionIdentity (repoKey + workdir), SessionState
├── telemetry.ts       # TelemetrySink interface, TelemetrySignal, PGOFeedback
└── index.ts           # Re-exports
```

**What goes here (and why):**
- **CairnEvent** — the canonical event shape. Forge produces these, Cairn
  consumes them. Neither package owns the shape; the contract does.
- **ProvenanceTier** — certification vs internal vs deployment classification.
  Forge tags events; Cairn filters by tier for DBOM and analytics.
- **DBOM types** — the Decision Bill of Materials schema. Forge generates
  DBOMs; Cairn stores and queries them; the export pipeline packages them.
- **DecisionRecord** — the Decision Chain primitive. Content-addressable
  decision with alternatives, evidence, and source attribution.
- **TelemetrySink** — interface for pluggable telemetry destinations. Cairn
  implements sinks (SQLite, Application Insights). Forge emits to them.

**What does NOT go here:**
- SDK-specific types (`SessionEvent`, `CopilotClient`) — those are Forge internals
- DB schemas, migrations — those are Cairn internals
- Hook implementations — those are package-specific

### `@cairn/cairn` — Observability Platform (Current Project)

Everything that exists today, plus two new integration surfaces.

```
@cairn/cairn/
├── src/
│   ├── agents/           # Archivist, Curator, Prescriber (unchanged)
│   ├── db/               # SQLite, migrations, DAL (unchanged)
│   ├── mcp/              # 10 MCP tools (unchanged + future Forge-aware tools)
│   ├── hooks/            # postToolUse, sessionStart (unchanged)
│   ├── discovery/        # Artifact scanner (unchanged)
│   ├── config/           # Repo config, preferences (unchanged)
│   ├── types/            # → migrates to import from @cairn/types
│   │
│   ├── bridge/           # NEW: Forge event ingestion
│   │   ├── ingest.ts     # Accept CairnEvents from Forge, write to event_log
│   │   └── query.ts      # Cross-session queries for Forge-originated events
│   │
│   └── telemetry/        # NEW: Pluggable telemetry
│       ├── sink.ts       # TelemetrySink implementations (SQLite, AppInsights)
│       ├── ingest.ts     # PGO feedback: AppInsights → event_log import
│       └── export.ts     # Event_log → external sink export
```

**Changes from current state:**
- Types that Forge also needs migrate to `@cairn/types` (re-exported for
  backward compatibility)
- New `bridge/` module accepts events from Forge's event bridge
- New `telemetry/` module implements pluggable sinks (Aaron's PGO concept)
- MCP tools may gain Forge-aware queries (e.g., "show me Forge session costs")
- Existing hooks continue to work — Forge is additive, not replacement

### `@cairn/forge` — Execution Runtime (New Package)

The SDK wrapper, decision gate framework, and export pipeline.

```
@cairn/forge/
├── src/
│   ├── runtime/
│   │   ├── client.ts         # CopilotClient wrapper (start, stop, health)
│   │   ├── session.ts        # Session manager (create, resume, configure)
│   │   └── auth.ts           # Auth strategy (CLI login, env vars, BYOK)
│   │
│   ├── bridge/
│   │   ├── eventBridge.ts    # SDK events → CairnEvents (the ~50 LOC adapter)
│   │   ├── extractors.ts     # Payload extractors per event type
│   │   └── provenance.ts     # Provenance tier classification + tagging
│   │
│   ├── hooks/
│   │   ├── composer.ts       # Hook composition (registerHooks replaces, not appends)
│   │   ├── observer.ts       # Observation hooks (logging, telemetry)
│   │   └── gates.ts          # Decision gate hooks (deny, ask, elicit)
│   │
│   ├── decisions/
│   │   ├── gate.ts           # Decision gate framework (rules engine)
│   │   ├── permission.ts     # Permission handler with decision recording
│   │   ├── elicitation.ts    # Structured decision forms
│   │   └── chain.ts          # Decision chain: linked, content-addressable records
│   │
│   ├── models/
│   │   ├── selector.ts       # Model selection strategies (cheapest, smartest, budget)
│   │   ├── budget.ts         # Token budget tracking and enforcement
│   │   └── cost.ts           # Cost accumulation from assistant.usage events
│   │
│   ├── tools/
│   │   ├── router.ts         # Tool registration + instrumentation wrapper
│   │   └── definitions.ts    # Forge-native tools (defineTool wrappers)
│   │
│   ├── export/
│   │   ├── compiler.ts       # Workflow → portable artifacts (the "compile" step)
│   │   ├── skill.ts          # SKILL.md generator with provenance frontmatter
│   │   ├── instructions.ts   # copilot-instructions.md generator
│   │   ├── dbom.ts           # DBOM generator from certification-tier events
│   │   └── validate.ts       # Post-export lint + test (reuses @cairn/cairn tools)
│   │
│   └── types/                # Forge-internal types (SDK wrappers, not shared)
│       ├── sdk.ts            # Re-exported/mirrored SDK types (isolation layer)
│       └── internal.ts       # Forge-internal types
```

**Key design decisions in this layout:**

1. **SDK isolation in `runtime/` and `types/sdk.ts`.** The SDK is wrapped, never
   directly consumed by other modules. If the SDK API changes, only `runtime/`
   and `types/sdk.ts` need updating. Everything else talks through our own types.

2. **Hook composer solves the registerHooks replacement problem.** The SDK's
   `registerHooks()` replaces all hooks — it doesn't stack. The composer
   pattern (demonstrated in `tool-hooks-poc.ts`) merges multiple hook observers
   into a single handler. This is a core utility, not an afterthought.

3. **`export/` is the "compile" step.** This is where Aaron's portability
   concept lives. The compiler takes a workflow's development-time state
   (decisions, patterns, tested skills) and produces portable artifacts with
   DBOM provenance. The Prescriber is the prototype — same observe → pattern →
   artifact pipeline, different output target.

4. **`decisions/chain.ts` is the Decision Chain.** Content-addressable records
   with `parentId` linking (mirroring the SDK's own `parentId` on events).
   This is the highest-value data model in Forge — it's what makes workflows
   auditable and certifiable.

### Integration Seams

```
┌─────────────────────┐         ┌──────────────┐         ┌─────────────────────┐
│     @cairn/forge     │         │ @cairn/types  │         │     @cairn/cairn     │
│                     │         │              │         │                     │
│  SDK ──→ Bridge ────┼────→────┤  CairnEvent  ├────→────┼──→ event_log (SQLite)│
│                     │         │  DBOM        │         │                     │
│  Hooks ──→ Gates ───┼────→────┤  Decision    ├────→────┼──→ Curator ──→ Insights│
│                     │         │  Record      │         │                     │
│  Export ←───────────┼────←────┤  Provenance  ├────←────┼──← Prescriber       │
│   ↓                 │         │  Tier        │         │                     │
│  SKILL.md + DBOM    │         │              │         │  AppInsights ──→────┤
│   ↓                 │         │  Telemetry   │         │    Telemetry Ingest │
│  Deploy to corp     │         │  Sink        │         │                     │
│   ↓                 │         └──────────────┘         │                     │
│  PGO telemetry ─────┼─────────────────────────────→────┼──→ Feedback loop    │
└─────────────────────┘                                   └─────────────────────┘
```

**Four integration seams:**

1. **Event Bridge (Forge → Cairn):** Forge's event bridge converts SDK events
   to `CairnEvent` (from `@cairn/types`) and ships them to Cairn's `bridge/ingest.ts`.
   This is the primary data flow — everything Forge does becomes Cairn's input.

2. **Prescription Output (Cairn → Forge):** Cairn's Prescriber detects patterns
   and produces prescriptions. Forge consumes these as corrections — adjusting
   model selection, tightening decision gates, updating tool configurations.
   This is the feedback loop that creates convergence.

3. **Export Pipeline (Forge → Artifacts):** Forge's export compiler produces
   portable artifacts (SKILL.md + DBOM) for deployment to corp environments.
   Uses Cairn's skill linter/validator for quality gating.

4. **PGO Telemetry (Corp → Cairn → Forge):** Deployed artifacts emit telemetry
   to Application Insights. Cairn's telemetry ingest adapter pulls production
   signals back in. These become inputs to the next compilation cycle.

---

## Risk Register (Updated from Pre-Spike)

### Risk 1: API Instability (was "SDK too immature" — DOWNGRADED)

**Pre-spike assessment:** Medium likelihood, high impact.  
**Post-spike assessment:** Medium likelihood, **low impact** (mitigated).

The SDK's type system is comprehensive (105KB of generated event types) and
schema-driven, which suggests structural stability even across version bumps.
The event bridge is our abstraction layer — SDK changes affect ~50 LOC in
`bridge/eventBridge.ts` and `types/sdk.ts`, not the entire system.

**Mitigation:** Pin to exact version (`0.2.2`). SDK isolation layer limits
blast radius to `runtime/` + `types/sdk.ts`. Monitor the `0.3.0-preview.0`
prerelease for breaking changes.

### Risk 2: Runtime Dependency on Copilot CLI Process (NEW)

**Assessment:** Medium likelihood, medium impact.

The SDK requires a running Copilot CLI process (spawned or connected via
JSON-RPC). This means Forge can't run in environments without the CLI installed.
The spike verified compilation and type-level correctness but could not verify
full runtime behavior without a live CLI process.

**Mitigation:** First production task must be a live runtime test (not just
type compilation). BYOK provider config (`provider: { baseUrl, apiKey }`)
may bypass the CLI dependency for some use cases — needs runtime verification.

### Risk 3: Hook Composition Footgun (NEW — discovered in spike)

**Assessment:** Low likelihood, medium impact.

`registerHooks()` replaces all hooks — it doesn't stack. If Forge's observer
hooks are registered and then a user registers their own hooks, Forge's
instrumentation silently disappears. This is a correctness bug waiting to
happen.

**Mitigation:** The hook composer pattern (demonstrated in `tool-hooks-poc.ts`)
is a mandatory utility. `@cairn/forge` must never call `registerHooks()`
directly — always through the composer. This is a codebase convention, not
a nice-to-have.

---

## What Changed from Pre-Spike Assumptions

### Easier Than Expected

1. **Event bridge complexity.** Pre-spike estimate: 50–500 LOC. Actual: ~50 LOC
   for the core bridge, plus ~80 LOC for payload extractors and provenance
   classification. The SDK's event shape (`id`, `timestamp`, `parentId`, `type`,
   `data`) maps almost 1:1 to Cairn's event_log schema.

2. **Decision gates.** Expected: one mechanism, possibly hacky. Found: three
   complementary mechanisms (hook blocking, permission handler, elicitation
   forms) that are native SDK features, not workarounds. The `permission.requested`
   / `permission.completed` event pair gives us structured decision records
   for free.

3. **Dependency compatibility.** Expected: possible conflicts with better-sqlite3
   or MCP SDK. Found: zero conflicts. SDK shares our `zod` dependency at the
   same version. All 427 existing tests pass unchanged.

4. **Token cost data.** Expected: basic token counts. Found: `copilotUsage.totalNanoAiu`
   (actual billing cost), `quotaSnapshots` (remaining quota percentage), latency
   metrics (`ttftMs`, `interTokenLatencyMs`), and sub-agent attribution
   (`parentToolCallId`). This is richer than any APM tool provides.

### Harder Than Expected

1. **Hook type ergonomics.** Several hook-related types (`SessionHooks`,
   `PreToolUseHookInput`, `PostToolUseHookOutput`, `ReasoningEffort`) are
   defined internally but not re-exported from the SDK index. Must use
   `SessionConfig["hooks"]` accessor pattern or mirror types locally. Minor
   friction, but every spike file hit this.

2. **Runtime verification gap.** The SDK compiles perfectly and types check
   clean, but requires a live Copilot CLI process for actual execution. The
   spike proved API surface and type compatibility, not runtime behavior. This
   gap must be closed in the first production iteration.

3. **No runtime token budget setter.** Expected: configurable per-session token
   limits. Found: token limits are per-model via `ModelCapabilities.limits`,
   not configurable at session level. Budget enforcement must be application-
   level (accumulate `assistant.usage` events, switch models or stop when limit
   reached). Workable, but more code than expected.

---

## Concepts Discovered During Spike (Post-Scope)

The following concepts emerged in team discussion after the spike was scoped
but before Day 3. They are validated by the spike findings:

### 1. Portability / Export Pipeline
Forge-developed workflows export as certified artifacts (SKILL.md + DBOM)
for corp/EMU environments. **Spike validates:** The provenance tier
classification in `event-bridge.ts` and DBOM reconstruction demonstrate that
the data model supports this. Certification-tier events (10 of 22 mapped
types) capture the decision-relevant signals needed for the DBOM.

### 2. PGO Telemetry
Deployed artifacts emit telemetry to Application Insights → feeds back to
Cairn → continuous profile-guided optimization. **Spike validates:** The
`ProvenanceTier` type includes a `"deployment"` tier (defined but not
populated in the spike). The SDK's built-in OpenTelemetry support
(`telemetry: { otlpEndpoint }`) provides a natural export path.

### 3. ACP Horizon
The Copilot SDK is Copilot-specific; ACP enables multi-agent transport.
**Spike validates:** The event bridge abstraction means the adapter pattern
works for any agent source. Adding an ACP adapter later is additive — Cairn
consumes `CairnEvent` (from `@cairn/types`), not `SessionEvent` (from SDK).

---

## Recommended Next Steps

Prioritized build order after the spike concludes.

### Phase 1: Monorepo Foundation (1–2 days)

1. **Create `@cairn/types` package** — Extract shared types from current
   codebase. This is the prerequisite for everything else.
2. **Restructure current project as `@cairn/cairn`** — Update imports to use
   `@cairn/types`. Verify all 427 tests still pass.
3. **Scaffold `@cairn/forge` package** — Empty package with correct TypeScript
   config, importing from `@cairn/types`.

### Phase 2: Live Runtime Verification (1–2 days)

4. **Close the runtime gap** — Run the spike PoC against a live Copilot CLI
   process. Verify that type-level findings match runtime behavior.
5. **Validate BYOK path** — Test `provider: { baseUrl, apiKey }` for
   environments without standard Copilot auth.

### Phase 3: Core Forge Loop (3–5 days)

6. **SDK wrapper + session manager** — Production-quality `runtime/` module.
7. **Event bridge** — Promote `event-bridge.ts` from spike to production,
   with full test coverage.
8. **Hook composer** — Extract from `tool-hooks-poc.ts`, make it the mandatory
   hook registration path.
9. **Decision gate framework** — Promote from `decision-gate-poc.ts`, add the
   `DecisionRecord` to `@cairn/types`.

### Phase 4: Export Pipeline (2–3 days)

10. **DBOM generator** — Promote from spike, add persistence to Cairn's DB.
11. **SKILL.md compiler** — Generate certified SKILL.md with provenance
    frontmatter.
12. **Cairn linter/validator integration** — Export pipeline runs `lint_skill`
    and `test_skill` before emitting artifacts.

### Phase 5: Telemetry Feedback (Future)

13. **Pluggable telemetry sink** — `TelemetrySink` interface + SQLite and
    Application Insights implementations.
14. **PGO ingest** — Import production telemetry signals back into Cairn's
    event_log for feedback-driven improvement.

### Team Recommendation

Phase 1 stays with this squad (structural change, low risk). Phase 2 is a
quick validation task. Phase 3 is where a sister squad makes sense — Forge's
domain (agent orchestration, SDK integration, decision gates) is distinct from
Cairn's (pattern detection, prescription, observability).

**Decision point for Aaron:** Charter the Forge squad after Phase 2 confirms
runtime behavior, or continue with this squad through Phase 3?

---

## Spike Cleanup

After assessment is approved:
- [ ] Delete `src/spike/` directory (spike code served its purpose)
- [ ] Remove `@github/copilot-sdk` from dependencies (re-add when Forge package
  is scaffolded)
- [ ] Archive spike documents to `docs/spikes/` (keep for reference)
