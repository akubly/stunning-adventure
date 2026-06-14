/**
 * Phase 4.5 telemetry-local types.
 *
 * `ExecutionProfile`, `ProfileGranularity`, `SignalKind`, and `SignalSample`
 * now live in @akubly/types (relocated so @akubly/cairn can reach the
 * aggregator without depending on @akubly/forge). Re-exported here for
 * back-compat — existing forge consumers keep compiling unchanged.
 */

import type { ExecutionProfile, ProfileGranularity, SignalKind, SignalSample } from "@akubly/types";

export type { ExecutionProfile, ProfileGranularity, SignalKind, SignalSample };

export interface TelemetryEvent {
  kind: SignalKind;
  sample: SignalSample;
}
