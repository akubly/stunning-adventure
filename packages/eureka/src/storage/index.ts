export { InMemoryFactReader } from './fact-reader-inmemory.js';
export { InMemoryFactWriter } from './fact-writer.js';
export { InMemoryRelationWriter } from './relation-writer.js';
export type { RelationWriter } from './relation-writer.types.js';
// SqliteFactReader / SqliteFactWriter / SqliteRelationWriter are exported from @akubly/eureka/sqlite
// (not the core entry point) to keep the main package free of the better-sqlite3 native dependency.
