/**
 * @akubly/eureka — cognitive memory layer for the Cairn agentic stack.
 *
 * v1 entry point. Activities will be exported here as they are implemented.
 * First red test: recall (§55 §2.1, AC-1.3).
 */

export { recall } from './activities/recall.js';
export type { RecallOptions, RecallDeps, RecallResult, FactStore, ClockProvider } from './activities/recall.js';
