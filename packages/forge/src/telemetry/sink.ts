/**
 * LocalDBOMSink — the Phase 4.5 {@link TelemetrySink} implementation.
 *
 * Buffers signal samples and persists them to local SQLite via an injected
 * persistence function. Phase 5 will replace this with `AppInsightsSink` for
 * cloud-backed production telemetry. Both implementations satisfy the same
 * `TelemetrySink` contract from @akubly/types.
 *
 * Wiring: collectors produce {@link SignalSample}s; callers push them into
 * the sink via `enqueueSample()`. The sink also implements `emit()` from
 * `TelemetrySink`, but that path is a no-op here — the bridge event stream
 * is consumed by collectors first, and only the derived signal samples are
 * worth persisting.
 */

import type { CairnBridgeEvent, TelemetrySink } from "@akubly/types";
import type { SignalSample } from "./types.js";

export interface LocalDBOMSinkConfig {
  /** Function to persist signal samples. Injected to avoid direct Cairn import. */
  persistSample: (sample: SignalSample) => void;
  /** Maximum buffered samples before auto-flush. Default: 50. */
  bufferSize?: number;
}

export interface LocalDBOMSink extends TelemetrySink {
  /** Number of buffered samples awaiting flush. */
  readonly bufferedCount: number;
  /** Whether the sink has been closed. */
  readonly isClosed: boolean;
  /**
   * Number of samples that were dropped because `persistSample` threw.
   * Surfaced for monitoring — fail-open is correct policy, but a silently
   * climbing dropped count is itself a signal.
   */
  readonly droppedCount: number;
  /** Push a signal sample into the buffer. Auto-flushes when full. */
  enqueueSample(sample: SignalSample): void;
  /** Synchronously emit a CairnBridgeEvent. No-op for LocalDBOMSink. */
  emit(event: CairnBridgeEvent): void;
}

/**
 * Create a TelemetrySink that buffers signal samples and persists them to
 * local SQLite via an injected persistence function.
 */
export function createLocalDBOMSink(config: LocalDBOMSinkConfig): LocalDBOMSink {
  const buffer: SignalSample[] = [];
  const maxBuffer = config.bufferSize ?? 50;
  let closed = false;
  let dropped = 0;

  function drainBuffer(): void {
    while (buffer.length > 0) {
      const sample = buffer.shift()!;
      try {
        config.persistSample(sample);
      } catch (err) {
        // Fail-open: persistence failure must not kill the session. Log a
        // warning consistent with the bridge sink-error pattern and bump
        // the dropped counter so callers can observe the drop rate.
        dropped++;
        console.warn(
          `[LocalDBOMSink] persistSample threw for sample kind=${sample.kind} session=${sample.sessionId} (dropped=${dropped}):`,
          err,
        );
      }
    }
  }

  return {
    get bufferedCount() {
      return buffer.length;
    },
    get isClosed() {
      return closed;
    },
    get droppedCount() {
      return dropped;
    },

    enqueueSample(sample: SignalSample) {
      if (closed) return;
      buffer.push(sample);
      if (buffer.length >= maxBuffer) {
        drainBuffer();
      }
    },

    emit(_event: CairnBridgeEvent) {
      // LocalDBOMSink is wired downstream of collectors; the bridge event
      // stream is consumed by them, not by the sink directly. Implementing
      // `emit` keeps the TelemetrySink contract honoured.
    },

    async flush() {
      drainBuffer();
    },

    async close() {
      drainBuffer();
      closed = true;
    },
  };
}
