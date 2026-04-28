/**
 * @akubly/forge — Deterministic agentic execution runtime.
 *
 * Public API surface:
 *   - Bridge: SDK event → CairnBridgeEvent adapter
 *   - Hooks: Composable hook observers for the SDK's registerHooks() API
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
