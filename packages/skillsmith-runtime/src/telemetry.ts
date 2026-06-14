/**
 * Telemetry — cairn-bound TelemetrySink factory.
 *
 * `createCairnTelemetrySink(db)` is the production binding that wires the
 * forge `SignalSampleSink` contract to `insertSignalSample` in the cairn DB.
 * skillsmith-runtime is the only package that depends on both @akubly/forge
 * and @akubly/cairn, making it the correct home for this seam.
 *
 * The Harness (future) will call this factory and pass the resulting sink
 * into `ForgeClient.createSession({ telemetrySink })` so that signal_samples
 * populate automatically as sessions run.
 */

import type Database from 'better-sqlite3';
import { insertSignalSample } from '@akubly/cairn';
import type { SignalSampleInsert } from '@akubly/cairn';
import { createLocalDBOMSink } from '@akubly/forge';
import type { SignalSample, SignalSampleSink } from '@akubly/types';

function mapSampleToInsert(sample: SignalSample): SignalSampleInsert {
  return {
    kind: sample.kind,
    sessionId: sample.sessionId,
    skillId: sample.skillId ?? null,
    value: sample.value,
    metadata: sample.metadata,
    collectedAt: sample.collectedAt,
  };
}

/**
 * Create a SignalSampleSink backed by cairn's `signal_samples` table.
 *
 * Samples enqueued via `enqueueSample()` are buffered and written to the
 * provided DB on `flush()`. skillId is mapped to NULL when absent
 * (fold-to-global semantics).
 */
export function createCairnTelemetrySink(db: Database.Database): SignalSampleSink {
  return createLocalDBOMSink({
    persistSample: (sample: SignalSample) =>
      void insertSignalSample(db, mapSampleToInsert(sample)),
  });
}
