/**
 * Signal aggregator — thin re-export for back-compat.
 *
 * The implementation now lives in @akubly/types so @akubly/cairn can reach it
 * without depending on @akubly/forge. All existing forge consumers of this
 * module keep compiling unchanged.
 */

export { aggregateSignals, type AggregationResult } from "@akubly/types";
