/**
 * @akubly/eureka — cognitive memory layer for the Cairn agentic stack.
 *
 * v1 entry point. Activities will be exported here as they are implemented.
 * First red test: recall (§55 §2.1, AC-1.3).
 *
 * For production SQLite wiring, see `@akubly/eureka/sqlite`:
 *   `createSqliteRecallDeps` / `createSqliteFeedbackDeps`.
 */

export {
  recall,
  recallWithScores,
  compositeScore,
  applyFeedback,
  applyFeedbackById,
} from './activities/recall.js';
export { imprint } from './activities/imprint.js';
export { integrate } from './activities/integrate.js';
export type {
  IntegrateOptions,
  IntegrateDeps,
  IntegrationReport,
  DuplicatePair,
  FactReaderListSession,
  RelationWriterBatch,
} from './activities/integrate.js';
export {
  FactNotFoundError,
  InvalidFeedbackOptionsError,
  InvalidTrustValueError,
  FactReaderContractError,
  UnhandledFeedbackEventError,
  InvalidImprintError,
  InvalidIntegrateError,
} from './activities/errors.js';
export { InvalidRelationError } from './representation/errors.js';
export { validateRelation, RELATION_KINDS } from './representation/relation.js';
export type { Relation, RelationKind, RelationEdge } from './representation/relation.js';
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
export type {
  ImprintOptions,
  ImprintDeps,
  FactWriter,
  IdProvider,
  FactId,
  AttentionTier,
} from './activities/imprint.js';
