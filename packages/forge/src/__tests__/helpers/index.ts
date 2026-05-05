/**
 * Forge test helpers — barrel export.
 *
 * Usage:
 *   import { createMockSession, sessionStartEvent, assertIsCairnBridgeEvent } from './helpers/index.js';
 */
export {
  createMockClient,
  createMockSession,
  makeModelInfo,
  type MockCopilotClient,
  type MockCopilotSession,
} from './mock-sdk.js';

export {
  resetEventCounter,
  sessionStartEvent,
  assistantMessageEvent,
  assistantUsageEvent,
  toolExecutionStartEvent,
  toolExecutionCompleteEvent,
  userMessageEvent,
} from './event-factory.js';

export {
  assertIsCairnBridgeEvent,
  isCairnBridgeEvent,
} from './type-assertions.js';
