/**
 * Cairn — an agentic software engineering platform.
 * Built stone by stone. Showing the way.
 *
 * @module @akubly/cairn
 */

// Config
export { getCairnDir, getKnowledgeDbPath, getPluginsDir, getConfigPath } from './config/paths.js';
export { slugifyRepoKey } from './config/repo.js';

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
export { parseSkill } from './agents/skillParser.js';
export { lintSkill, formatLintSummary } from './agents/skillLinter.js';
export { validateSkill, formatValidationSummary } from './agents/skillValidator.js';
export {
  loadTestScenario,
  runTestScenario,
  formatTestReport,
} from './agents/skillTestHarness.js';
export {
  curate,
  getCuratorStatus,
  AGENT_NAME as CURATOR_AGENT_NAME,
} from './agents/curator.js';

// Database (low-level — prefer agent APIs above)
export { getDb, closeDb } from './db/index.js';
export { createSession, endSession, getActiveSession, getMostRecentActiveSession } from './db/sessions.js';
export { logEvent, getUnprocessedEvents } from './db/events.js';
export { getPreference, setPreference } from './db/preferences.js';
export { recordSkip, getSkips } from './db/skipBreadcrumbs.js';
export { getLastProcessedEventId, advanceCursor } from './db/curatorState.js';
export {
  createInsight,
  reinforceInsight,
  getInsightByPattern,
  getInsights,
  countInsightsByStatus,
  markStaleInsights,
  deletePrunedInsights,
  setInsightStatus,
} from './db/insights.js';
export {
  insertTestResult,
  insertTestResults,
  getTestResults,
  getTestHistory,
  getLatestTestRun,
} from './db/skillTestResults.js';

// Types
export type {
  CairnConfig,
  Agent,
  Session,
  Preference,
  SkipBreadcrumb,
  CairnError,
  CairnEvent,
  PatternType,
  InsightStatus,
  Insight,
  CuratorStatus,
} from './types/index.js';
export type { SessionSummary } from './agents/sessionState.js';
export type { CurateResult } from './agents/curator.js';
export type {
  ParsedSkill,
  SkillFrontmatter,
  SkillSection,
  SkillToolDeclaration,
  ParseError,
} from './agents/skillParser.js';
export type { LintResult, LintSeverity } from './agents/skillLinter.js';
export type {
  QualityVector,
  ValidationResult,
  ValidatorRule,
} from './types/index.js';
export type {
  TestScenario,
  TestAssertion,
  TestReport,
} from './agents/skillTestHarness.js';
export type {
  SkillTestResultInsert,
  SkillTestResultRow,
} from './db/skillTestResults.js';
export {
  upsertDBOM,
  getDBOM,
  getDBOMDecisions,
  loadDBOMArtifact,
  deleteDBOM,
  listDBOMs,
} from './db/dbomArtifacts.js';
export type {
  DBOMArtifactInsert,
  DBOMArtifactRow,
  DBOMDecisionRow,
} from './db/dbomArtifacts.js';
