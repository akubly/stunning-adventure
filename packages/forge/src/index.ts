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
