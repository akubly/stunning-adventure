/**
 * FactWriter contract test suite — InMemoryFactWriter wiring.
 *
 * ## Design
 *
 * This file wires InMemoryFactWriter into the shared FactWriter contract suite.
 * The helper definition (runFactWriterContract + FactWriterHarness) lives in:
 *   ./fact-writer-contract.helper.ts
 *
 * Each call to runFactWriterContract adds 25 tests (IM-1..IM-14 + parameterized cases).
 * InMemoryFactWriter wired below → 25 contract tests.
 *
 * ## InMemoryFactWriter requirements (for Crispin's GREEN phase)
 *
 * The harness below expects InMemoryFactWriter to:
 *   - Implement FactWriter (write(args): Promise<void>)
 *   - Implement FactStore (search(args): Promise<{results, nextCursor?}>)
 *     sharing the same backing Map — factWriter and factStore are the same instance.
 *   - Expose readFact(factId, sessionId): Promise<StoredFact | null> as a test side-channel
 *     for direct storage inspection (not exported from production surface).
 *
 * ## RED status
 *
 * This file will fail to load until Crispin creates:
 *   - src/activities/imprint.ts  (imported transitively via the contract helper)
 *   - src/storage/fact-writer.ts (imported directly below as InMemoryFactWriter)
 *
 * That failure is expected and correct — it is the RED signal for this phase.
 */

// RED: ../../activities/imprint.ts does not exist until Crispin's GREEN phase.
// (Imported transitively via fact-writer-contract.helper.ts — listed here for clarity.)
import type { FactId, IdProvider, ImprintOptions } from '../../activities/imprint.js';
import { imprint as imprintActivity } from '../../activities/imprint.js';
import type { SessionId } from '@akubly/types';
// RED: ../fact-writer.ts does not exist until Crispin's GREEN phase.
import { InMemoryFactWriter } from '../fact-writer.js';
import {
  runFactWriterContract,
  type FactWriterHarness,
} from './fact-writer-contract.helper.js';

// ---------------------------------------------------------------------------
// InMemoryFactWriter harness factory
// ---------------------------------------------------------------------------
//
// InMemoryFactWriter is expected to implement both FactWriter and FactStore
// (single class backed by a shared Map) so factWriter and factStore are the same
// instance. The readFact side-channel is a test-only method on the class.
//
// idProvider uses a closure counter so each test gets sequential, predictable IDs
// (per-harness counter resets to 0 on every makeHarness() call).

function makeInMemoryFactWriterHarness(): FactWriterHarness {
  const writer = new InMemoryFactWriter();

  let counter = 0;
  const idProvider: IdProvider = {
    next: () => `fw-test-${String(++counter).padStart(4, '0')}` as FactId,
  };
  const clock = { now: () => 1_000_000 };

  return {
    imprint: (options: ImprintOptions) =>
      imprintActivity(options, { factWriter: writer, clock, idProvider }),
    readFact: (factId: FactId, sessionId: SessionId) => writer.readFact(factId, sessionId),
    // InMemoryFactWriter also satisfies FactStore — same backing store.
    factStore: writer,
    factWriter: writer,
  };
}

// ---------------------------------------------------------------------------
// Wire contract suite to InMemoryFactWriter
// ---------------------------------------------------------------------------

runFactWriterContract('InMemoryFactWriter', makeInMemoryFactWriterHarness);
