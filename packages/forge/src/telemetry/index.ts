/**
 * Phase 4.5 telemetry module — public barrel.
 *
 * This module owns the local feedback loop's collection + aggregation side:
 *   - Collectors observe a CairnBridgeEvent stream and extract signal samples
 *   - The aggregator folds samples into ExecutionProfiles
 *   - LocalDBOMSink persists samples to local storage (Phase 5 swaps in
 *     AppInsightsSink without touching consumers)
 */

export {
  createDriftCollector,
  createTokenCollector,
  createOutcomeCollector,
  type DriftCollector,
  type TokenCollector,
  type OutcomeCollector,
  type TelemetryCollector,
} from "./collectors.js";

export {
  computeDriftScore,
  classifyDriftLevel,
  DRIFT_WEIGHTS,
  type DriftScore,
  type DriftLevel,
  type DriftSignals,
} from "./drift.js";

export {
  createLocalDBOMSink,
  type LocalDBOMSink,
  type LocalDBOMSinkConfig,
} from "./sink.js";

export {
  aggregateSignals,
  type AggregationResult,
} from "./aggregator.js";

export type {
  SignalKind,
  SignalSample,
  TelemetryEvent,
  ExecutionProfile,
  ProfileGranularity,
} from "./types.js";
