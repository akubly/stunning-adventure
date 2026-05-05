/**
 * @akubly/forge — Deterministic agentic execution runtime.
 *
 * Public API surface:
 *   - Bridge: SDK event → CairnBridgeEvent adapter
 *   - Hooks: Composable hook observers for the SDK's registerHooks() API
 *   - Decisions: Gate and record tool-call decisions via hook observers
 *   - Session: Model snapshot types and pure extraction functions
 *   - Types: Forge-local mirrors of SDK types not re-exported from SDK index
 */

// --- Bridge ---
export {
  bridgeEvent,
  attachBridge,
  classifyProvenance,
  EVENT_MAP,
  PAYLOAD_EXTRACTORS,
  type EventSource,
  type PayloadExtractor,
} from "./bridge/index.js";

// --- Hook Composer ---
export {
  HookComposer,
  composeHooks,
  type HookObserver,
} from "./hooks/index.js";

// --- Decision Gates ---
export {
  createDecisionGate,
  createDecisionRecorder,
  makeDecisionRecord,
} from "./decisions/index.js";

// --- Session Types ---
export {
  toModelSnapshot,
  type ModelSnapshot,
  type ModelChangeRecord,
  type ReasoningEffort,
} from "./session/index.js";

// --- DBOM ---
export {
  generateDBOM,
  classifyDecisionSource,
  summarizeDecision,
  computeDecisionHash,
} from "./dbom/index.js";

// --- Models ---
export {
  createModelCatalog,
  createTokenTracker,
  formatBudgetReport,
  MODEL_STRATEGIES,
  type ModelCatalog,
  type ModelComparison,
  type ModelUsageAccumulator,
  type TokenBudget,
  type TokenTracker,
  type ModelStrategy,
  type StrategyContext,
} from "./models/index.js";

// --- Runtime ---
export {
  ForgeClient,
  ForgeSession,
  type ForgeClientOptions,
  type ForgeSessionConfig,
  type SDKClient,
  type SDKSession,
} from "./runtime/index.js";

// --- Export ---
export {
  runExportPipeline,
  compileSkill,
  renderFrontmatter,
  escapeFrontmatter,
  extractStage,
  stripStage,
  attachStage,
  validateStage,
  type ExportPipelineConfig,
  type ExportPipelineResult,
  type ExportStageResult,
  type SkillCompilerInput,
  type SkillFrontmatterInput,
  type CompiledSkill,
  type StageContext,
  type ExportStage,
  type ExportQualityGate,
  type ExportDiagnostic,
  type ExportDiagnosticSeverity,
  type QualityGateResult,
} from "./export/index.js";

// --- Telemetry (Phase 4.5 local feedback loop) ---
export {
  createDriftCollector,
  createTokenCollector,
  createOutcomeCollector,
  computeDriftScore,
  classifyDriftLevel,
  DRIFT_WEIGHTS,
  createLocalDBOMSink,
  aggregateSignals,
  type DriftCollector,
  type TokenCollector,
  type OutcomeCollector,
  type TelemetryCollector,
  type DriftScore,
  type DriftLevel,
  type DriftSignals,
  type LocalDBOMSink,
  type LocalDBOMSinkConfig,
  type AggregationResult,
  type SignalKind,
  type SignalSample,
  type TelemetryEvent,
  type ExecutionProfile,
  type ProfileGranularity,
} from "./telemetry/index.js";

// --- Prescribers (Phase 4.5) ---
export {
  analyzePromptOptimizations,
  analyzeTokenOptimizations,
  type PromptOptimizerConfig,
  type TokenOptimizerConfig,
  type MetricSnapshot,
  type OptimizationCategory,
  type OptimizationEvidence,
  type OptimizationHint,
  type PrescriberResult,
} from "./prescribers/index.js";

// --- Applier (Phase 4.5) ---
export {
  applyOptimizations,
  DEFAULT_STRATEGY_PARAMS,
  DEFAULT_BUDGET_LIMIT_NANO_AIU,
  tuneParameters,
  type ApplierConfig,
  type AppliedOptimization,
  type OptimizationApplierResult,
  type SkillFrontmatterPatch,
  type StrategyParameters,
  type TuneContext,
} from "./applier/index.js";

// --- Types (SDK mirrors) ---
export type {
  SessionHooks,
  PreToolUseInput,
  PreToolUseOutput,
  PostToolUseInput,
  PostToolUseOutput,
  SessionStartInput,
  SessionEndInput,
  UserPromptInput,
  ErrorInput,
  HookInvocation,
} from "./types.js";
