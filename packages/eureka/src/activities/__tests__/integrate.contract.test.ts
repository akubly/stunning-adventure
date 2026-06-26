/**
 * Integrate contract test suite — InMemory wiring.
 *
 * Wires:
 *   - InMemoryFactWriter (FactWriter + FactStore, shipped in imprint slice)
 *   - InMemoryFactReader (NEW in wave-2 — implements `listBySession`)
 *   - InMemoryRelationWriter (NEW in wave-2 — implements `writeEdges → Promise<number>`)
 * into the shared integrate contract suite.
 *
 * ## RED status
 *
 * Fails at module load until Crispin's wave-2 GREEN delivers:
 *   - src/activities/integrate.ts             (activity + types + seam interfaces)
 *   - src/activities/errors.ts InvalidIntegrateError
 *   - src/storage/fact-reader-inmemory.ts     exporting InMemoryFactReader
 *   - src/storage/relation-writer.ts          exporting InMemoryRelationWriter
 *
 * That failure is the correct RED signal.
 *
 * @see ./integrate-contract.helper.ts for assertion-level documentation.
 */

import type { FactId, IdProvider, ImprintOptions } from '../imprint.js';
import { imprint as imprintActivity } from '../imprint.js';

// RED: ../integrate.ts and its types do not exist until wave-2 GREEN.
import {
  integrate as integrateActivity,
  type IntegrateOptions,
  type IntegrationReport,
  type IntegrateDeps,
} from '../integrate.js';

// Shipped (imprint slice).
import { InMemoryFactWriter } from '../../storage/fact-writer.js';
// RED: wave-2 — wiring locations subject to Crispin's GREEN.
import { InMemoryRelationWriter } from '../../storage/relation-writer.js';
import { InMemoryFactReader } from '../../storage/fact-reader-inmemory.js';

import { runIntegrateContract, type IntegrateHarness } from './integrate-contract.helper.js';

// ---------------------------------------------------------------------------
// InMemory harness factory
// ---------------------------------------------------------------------------
//
// InMemoryFactReader and InMemoryRelationWriter must share/observe the same
// backing fact store as InMemoryFactWriter so:
//   - integrate's listBySession sees the facts imprint just wrote, and
//   - the harness's `factStore` (== writer) sees what imprint persisted.
//
// Constructor signatures below are the harness's expectation; Crispin's
// wave-2 GREEN locks the exact shape.

function makeInMemoryIntegrateHarness(): IntegrateHarness {
  const writer = new InMemoryFactWriter();
  const factReader = new InMemoryFactReader(writer);
  const relationWriter = new InMemoryRelationWriter();

  let counter = 0;
  const idProvider: IdProvider = {
    next: () => `it-test-${String(++counter).padStart(4, '0')}` as FactId,
  };

  // Advanceable clock — every test that calls advanceClock(n) ticks forward
  // n ms. Integrate uses the same clock; createdAt-derived canonical
  // ordering is therefore deterministic.
  let currentMs = 1_000_000;
  const clock = { now: () => currentMs };

  return {
    imprint: (options: ImprintOptions) =>
      imprintActivity(options, { factWriter: writer, clock, idProvider }),

    integrate: (
      options: IntegrateOptions,
      overrides?: Partial<IntegrateDeps>,
    ): Promise<IntegrationReport> => {
      const baseDeps: IntegrateDeps = {
        factReader,
        relationWriter,
        clock,
      };
      return integrateActivity(options, { ...baseDeps, ...overrides });
    },

    factStore: writer,
    factReader,
    relationWriter,

    advanceClock: (deltaMs: number) => {
      currentMs += deltaMs;
    },
  };
}

// ---------------------------------------------------------------------------
// Wire contract suite to InMemory implementations (15 RED tests)
// ---------------------------------------------------------------------------

runIntegrateContract('InMemory (integrate)', makeInMemoryIntegrateHarness);
