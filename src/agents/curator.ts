/**
 * Curator Agent
 *
 * Knowledge custodian responsible for error processing, root-cause analysis pipeline,
 * and curating patterns from raw engineering data.
 *
 * Placeholder — implementation in a future phase.
 */

import { getLastProcessedEventId, advanceCursor } from '../db/curatorState.js';

export const AGENT_NAME = 'curator';
export const AGENT_DESCRIPTION = 'Knowledge custodian, error processor, RCA pipeline';

// Re-export cursor functions for convenience
export { getLastProcessedEventId, advanceCursor };
