/**
 * RelationWriter contract test suite — InMemoryRelationWriter wiring.
 *
 * Adds 24 tests via runRelationWriterContract.
 */

import { InMemoryRelationWriter } from '../relation-writer.js';
import {
  runRelationWriterContract,
  type RelationWriterHarness,
} from './relation-writer-contract.helper.js';

function makeInMemoryRelationWriterHarness(): RelationWriterHarness {
  // Fixed clock — deterministic createdAt strings across tests.
  const writer = new InMemoryRelationWriter(() => 1_700_000_000_000);

  return {
    writer,
    readRelation: (args) => writer.readRelation(args),
    listBySession: (sessionId) => writer.listBySession(sessionId),
  };
}

runRelationWriterContract('InMemoryRelationWriter', makeInMemoryRelationWriterHarness);
