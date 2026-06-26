/**
 * @akubly/eureka representation layer — knowledge-graph shapes and validators.
 *
 * Currently exports the `Relation` primitive (§20 §2.2). Future Fact-shape
 * work (kind/verb taxonomy) will land here too.
 */

export type { Relation, RelationKind } from './relation.js';
export { RELATION_KINDS, validateRelation } from './relation.js';
export { InvalidRelationError } from './errors.js';
