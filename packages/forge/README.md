# @akubly/forge

> Deterministic agentic execution runtime — bridges Copilot SDK events into Cairn, generates optimization hints, applies them, and exports compiled skills.

`@akubly/forge` is a workspace-internal package that sits between the Copilot SDK and the Cairn knowledge base. It is not a standalone product — it runs as part of the `@akubly/skillsmith-runtime` MCP server and session-start hook, which wire it into every interactive bash session.

**Place in the system:**

```
Copilot SDK events
       ↓
  @akubly/forge          ← bridge + hook composer + decision gates
       ↓
  @akubly/cairn          ← event log, execution profiles, hint store
       ↓
  prescribers            ← optimization hints written back to cairn
       ↓
  Copilot conversation   ← hints surfaced via list_optimization_hints / resolve_optimization_hint
```

For install and end-to-end usage, see the **[Forge Dogfooding Guide](../../docs/forge-dogfooding-guide.md)** and the **[root README install section](../../README.md#forge-mcp-bash-shell-init-m2)**.

---

## Start Here

| Task | Entry point |
|------|------------|
| Install and run forge end-to-end | [Forge Dogfooding Guide](../../docs/forge-dogfooding-guide.md) |
| Start a Copilot SDK session with forge wired | `ForgeClient` / `ForgeSession` from the Runtime module |
| Generate optimization hints programmatically | `runForgePrescribers()` from the Prescribers module |
| Compile and export a skill | `runExportPipeline()` from the Export module |

---

## Modules

| Module | What it does |
|--------|-------------|
| `bridge` | Translates raw Copilot SDK events into `CairnBridgeEvent` objects. Entry points: `bridgeEvent()`, `attachBridge()`, `classifyProvenance()`. |
| `hooks` | Composable hook observers for the SDK's `registerHooks()` API. `HookComposer` chains multiple observers; `composeHooks()` builds the composed observer. |
| `decisions` | Gate and record tool-call decisions. `createDecisionGate()` blocks tool use pending a decision; `createDecisionRecorder()` logs the outcome. |
| `session` | Snapshot types and pure extraction for the model in use. `toModelSnapshot()` extracts a `ModelSnapshot` from a hook payload. |
| `dbom` | Decision Bill of Materials. `generateDBOM()` produces an audit artifact from a session's decision records. |
| `models` | Model catalog and token budget tracking. `createModelCatalog()`, `createTokenTracker()`, `formatBudgetReport()`. |
| `runtime` | `ForgeClient` and `ForgeSession` — the top-level SDK integration wrappers. |
| `export` | Skill compilation pipeline. `runExportPipeline()` compiles, validates, and renders skill frontmatter; `compileSkill()` processes a single skill. |
| `telemetry` | Local feedback loop collectors. `createDriftCollector()`, `createTokenCollector()`, `createOutcomeCollector()`, `aggregateSignals()`. |
| `prescribers` | Optimization hint generation. `runForgePrescribers()` is the main orchestrator; it calls the prompt optimizer and token optimizer, applies historical change vectors, and applies user-disposition feedback from M3. |
| `applier` | Writes sidecar `.instructions.md` patches from accepted hints. `applyOptimizations()`, `tuneParameters()`. |

---

## Public API

All exports come from the package entry point (`dist/index.js` / `src/index.ts`). The sections below list the exports verified against `src/index.ts`.

### Bridge

```typescript
import { bridgeEvent, attachBridge, classifyProvenance, EVENT_MAP, PAYLOAD_EXTRACTORS } from '@akubly/forge';
import type { EventSource, PayloadExtractor } from '@akubly/forge';
```

### Hook Composer

```typescript
import { HookComposer, composeHooks } from '@akubly/forge';
import type { HookObserver } from '@akubly/forge';
```

### Decision Gates

```typescript
import { createDecisionGate, createDecisionRecorder, makeDecisionRecord } from '@akubly/forge';
```

### Session Snapshots

```typescript
import { toModelSnapshot } from '@akubly/forge';
import type { ModelSnapshot, ModelChangeRecord, ReasoningEffort } from '@akubly/forge';
```

### DBOM

```typescript
import { generateDBOM, classifyDecisionSource, summarizeDecision, computeDecisionHash } from '@akubly/forge';
```

### Models

```typescript
import {
  createModelCatalog, createTokenTracker, formatBudgetReport,
  MODEL_STRATEGIES,
} from '@akubly/forge';
import type {
  ModelCatalog, ModelComparison, ModelUsageAccumulator,
  TokenBudget, TokenTracker, ModelStrategy, StrategyContext,
} from '@akubly/forge';
```

### Runtime

```typescript
import { ForgeClient, ForgeSession } from '@akubly/forge';
import type { ForgeClientOptions, ForgeSessionConfig, SDKClient, SDKSession } from '@akubly/forge';
```

### Export Pipeline

```typescript
import {
  runExportPipeline, compileSkill,
  renderFrontmatter, escapeFrontmatter,
  extractStage, stripStage, attachStage, validateStage,
} from '@akubly/forge';
import type {
  ExportPipelineConfig, ExportPipelineResult, ExportStageResult,
  SkillCompilerInput, SkillFrontmatterInput, CompiledSkill,
  StageContext, ExportStage, ExportQualityGate, ExportDiagnostic,
  ExportDiagnosticSeverity, QualityGateResult,
} from '@akubly/forge';
```

### Telemetry

```typescript
import {
  createDriftCollector, createTokenCollector, createOutcomeCollector,
  computeDriftScore, classifyDriftLevel, DRIFT_WEIGHTS,
  createLocalDBOMSink, aggregateSignals,
} from '@akubly/forge';
import type {
  DriftCollector, TokenCollector, OutcomeCollector, TelemetryCollector,
  DriftScore, DriftLevel, DriftSignals, LocalDBOMSink, LocalDBOMSinkConfig,
  AggregationResult, SignalKind, SignalSample, TelemetryEvent,
  ExecutionProfile, ProfileGranularity,
} from '@akubly/forge';
```

### Prescribers

```typescript
import { analyzePromptOptimizations, analyzeTokenOptimizations, runForgePrescribers } from '@akubly/forge';
import type {
  PromptOptimizerConfig, TokenOptimizerConfig, ForgePrescriberOrchestratorOptions,
  ChangeVectorSummary, MetricSnapshot, OptimizationCategory, OptimizationEvidence,
  OptimizationHint, PrescriberConfig, PrescriberResult,
} from '@akubly/forge';
```

**Key function:**

```typescript
const hints: OptimizationHint[] = await runForgePrescribers(
  executionProfile,   // ExecutionProfile from cairn
  skillId,            // string
  {
    provider,         // optional ChangeVectorProvider (historical vectors)
    dispositionProvider,  // optional HintDispositionProvider (M3 feedback)
    config,           // optional PrescriberConfig (thresholds)
  },
);
```

### Applier

```typescript
import { applyOptimizations, DEFAULT_STRATEGY_PARAMS, DEFAULT_BUDGET_LIMIT_NANO_AIU, tuneParameters } from '@akubly/forge';
import type {
  ApplierConfig, AppliedOptimization, OptimizationApplierResult,
  SkillFrontmatterPatch, StrategyParameters, TuneContext,
} from '@akubly/forge';
```

---

## Dev Commands

All commands run from the package root (`packages/forge/`), or from the workspace root with `--workspace=@akubly/forge`.

```bash
npm run build   # tsc (emits to dist/)
npm run test    # vitest run
npm run lint    # eslint src/
```

From the workspace root:

```bash
npm run build --workspace=@akubly/forge
npm run test --workspace=@akubly/forge
npm run lint --workspace=@akubly/forge
```

Run `npm run test --workspace=@akubly/forge` to see the current test count and results.

> **Note:** `@akubly/forge` is a workspace-internal package. The API follows pre-1.0 SemVer (minor bumps signal breaking changes). External use is not officially supported — pin to an exact version if you depend on it outside this monorepo.
