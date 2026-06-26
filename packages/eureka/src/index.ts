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
export { integrate, MAX_SESSION_FACTS } from './activities/integrate.js';
export type {
  IntegrateOptions,
  IntegrateDeps,
  IntegrationReport,
  DuplicatePair,
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
  IntegrateScopeError,
} from './activities/errors.js';
export { InvalidRelationError } from './representation/errors.js';
export { validateRelation, RELATION_KINDS, edgeToRelation } from './representation/relation.js';
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
  SessionFactLister,
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
  AttentionTier,
} from './activities/imprint.js';
export type { FactId } from '@akubly/types';
