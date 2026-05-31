/**
 * @akubly/eureka — cognitive memory layer for the Cairn agentic stack.
 *
 * v1 entry point. Activities will be exported here as they are implemented.
 * First red test: recall (§55 §2.1, AC-1.3).
 */

export {
  recall,
  recallWithScores,
  compositeScore,
  applyFeedback,
  applyFeedbackById,
} from './activities/recall.js';
export type {
  RecallOptions,
  RecallDeps,
  RecallResult,
  FactStore,
  ClockProvider,
  ScoredResult,
  Ranker,
  FeedbackEvent,
  TrustUpdater,
  FactReader,
  ApplyFeedbackOptions,
  ApplyFeedbackDeps,
  ApplyFeedbackByIdOptions,
  ApplyFeedbackByIdDeps,
} from './activities/recall.js';
