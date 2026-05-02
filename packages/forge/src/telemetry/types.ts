/**
 * Phase 4.5 telemetry-local types.
 *
 * `ExecutionProfile` and `ProfileGranularity` are re-exported from
 * @akubly/types because they are part of the cross-package feedback-loop
 * contract (see `FeedbackSource`). The remaining types are forge-internal.
 */

import type { ExecutionProfile, ProfileGranularity } from "@akubly/types";

export type { ExecutionProfile, ProfileGranularity };

export type SignalKind = "drift" | "token" | "outcome";

export interface SignalSample {
  /** Signal type. */
  kind: SignalKind;
  /** Session that produced this sample. */
  sessionId: string;
  /** Skill ID this sample relates to (if applicable). */
  skillId?: string;
  /** The raw signal value. */
  value: number;
  /** Structured metadata for the signal. */
  metadata: Record<string, unknown>;
  /** ISO-8601 timestamp. */
  collectedAt: string;
}

export interface TelemetryEvent {
  kind: SignalKind;
  sample: SignalSample;
}
