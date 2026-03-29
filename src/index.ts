/**
 * Cairn — an agentic software engineering platform.
 * Built stone by stone. Showing the way.
 *
 * @module @akubly/cairn
 */

// Config
export { getCairnDir, getKnowledgeDbPath, getPluginsDir, getConfigPath } from './config/paths.js';
export { slugifyRepoKey } from './config/repo.js';

// Database
export { getDb, closeDb } from './db/index.js';
export { createSession, endSession, getActiveSession } from './db/sessions.js';
export { logEvent, getUnprocessedEvents } from './db/events.js';
export { getPreference, setPreference } from './db/preferences.js';
export { recordSkip, getSkips } from './db/skipBreadcrumbs.js';
export { getLastProcessedEventId, advanceCursor } from './db/curatorState.js';

// Agents
export {
  startSession as startArchivistSession,
  stopSession as stopArchivistSession,
  recordToolUse,
  recordError,
  recordSkipEvent,
  catchUpPreviousSession,
} from './agents/archivist.js';
export { getSessionSummary, hasEventOccurred, findEvents } from './agents/sessionState.js';
export { scrubSecrets } from './agents/secretScrubber.js';

// Types
export type {
  CairnConfig,
  Agent,
  Session,
  Preference,
  SkipBreadcrumb,
  CairnError,
  CairnEvent,
} from './types/index.js';
export type { SessionSummary } from './agents/sessionState.js';
