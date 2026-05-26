import type Database from 'better-sqlite3';
import * as cairn from '@akubly/cairn';
import * as forge from '@akubly/forge';
import type { OptimizationHintInsert } from '@akubly/cairn';
import type { OptimizationHint } from '@akubly/forge';
import type {
  ExecutionProfile,
  PrescriberOrchestrationConfig,
  PrescriberRunResult,
  ProfileStaleness,
  ProfileStalenessReason,
} from '@akubly/types';

export type { PrescriberOrchestrationConfig, PrescriberRunResult } from '@akubly/types';

export interface CreatePrescriberOrchestrationConfigOpts {
  db?: Database.Database;
  dbPath?: string;
  fallbackContext?: TierFallbackContext;
}

export type CreatePrescriberOrchestrationConfigOptions = CreatePrescriberOrchestrationConfigOpts;
export type LoadedProfileSource = 'per-skill' | 'per-model' | 'per-user' | 'global';

export interface TierFallbackContext {
  modelId?: string;
  userId?: string;
}

export interface RunForgePrescribeOptions {
  skillId: string;
  dbPath?: string;
  forceRegenerate?: boolean;
  fallbackContext?: TierFallbackContext;
}

export interface ForgePrescribeSuccessResult {
  ok: true;
  exitCode: 0;
  skillId: string;
  dbPath: string;
  profileSource: LoadedProfileSource;
  hints: OptimizationHint[];
  inserted: number;
  skipped: number;
  errored: number;
  totalHints: number;
  totalPersisted: number;
}

export interface ForgePrescribeFailureResult {
  ok: false;
  exitCode: 1 | 2;
  skillId: string;
  dbPath: string;
  message: string;
  profileSource?: LoadedProfileSource;
  hints?: OptimizationHint[];
  inserted?: number;
  skipped?: number;
  errored?: number;
  totalHints?: number;
  totalPersisted?: number;
}

export type ForgePrescribeResult = ForgePrescribeSuccessResult | ForgePrescribeFailureResult;

type RuntimeDb = Database.Database;

const DEFAULT_PROFILE_CONFIDENCE = 1;
const DEFAULT_STALENESS_SESSION_THRESHOLD = 50;
const DEFAULT_STALENESS_MAX_AGE_DAYS = 7;
const PROFILE_STALENESS_ATTENUATION_FACTOR = 0.5;

export interface ProfileStalenessOptions {
  sessionCountThreshold?: number;
  maxAgeDays?: number;
  attenuationFactor?: number;
  now?: Date | string;
}

export interface LoadedExecutionProfile {
  profile: ExecutionProfile;
  source: LoadedProfileSource;
}

interface ExecutePrescriberRunOptions {
  db: RuntimeDb;
  skillId: string;
  profile: ExecutionProfile | null;
  minSessions?: number;
  forceRegenerate?: boolean;
}

interface ExecutedPrescriberRun extends PrescriberRunResult {
  hints: OptimizationHint[];
}

function toExecutionProfile(
  profile: NonNullable<ReturnType<typeof cairn.getExecutionProfileWithDb>>,
): ExecutionProfile {
  return {
    skillId: profile.skillId,
    granularity: profile.granularity,
    granularityKey: profile.granularityKey,
    sessionCount: profile.sessionCount,
    drift: {
      mean: profile.drift.mean,
      p50: profile.drift.p50,
      p95: profile.drift.p95,
      trend: profile.drift.trend,
    },
    tokens: {
      meanInputTokens: profile.token.meanInput,
      meanOutputTokens: profile.token.meanOutput,
      meanCacheHitRate: profile.token.meanCacheHit,
      totalCostNanoAiu: profile.token.totalCost,
    },
    outcomes: {
      successRate: profile.outcome.successRate,
      meanConvergenceTurns: profile.outcome.meanConvergence,
      toolErrorRate: profile.outcome.toolErrorRate,
    },
    updatedAt: profile.updatedAt,
  };
}

function getCurrentSessionCount(db: RuntimeDb): number {
  try {
    const row = db
      .prepare('SELECT sessions_since_install FROM prescriber_state WHERE id = 1')
      .get() as { sessions_since_install: number } | undefined;
    return row?.sessions_since_install ?? 0;
  } catch {
    return 0;
  }
}

function resolveStalenessReason(
  profile: ExecutionProfile,
  db: RuntimeDb,
  options: ProfileStalenessOptions,
): ProfileStalenessReason {
  const sessionCountThreshold = options.sessionCountThreshold ?? DEFAULT_STALENESS_SESSION_THRESHOLD;
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_STALENESS_MAX_AGE_DAYS;
  const now = options.now ? new Date(options.now) : new Date();
  const updatedAt = new Date(profile.updatedAt);
  const currentSessionCount = getCurrentSessionCount(db);
  // W5-4 has no per-profile generation counter yet; this is the no-migration count proxy.
  const sessionsSinceLastUpdate = Math.max(0, currentSessionCount - profile.sessionCount);
  const countStale = sessionsSinceLastUpdate > sessionCountThreshold;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const ageStale = !Number.isNaN(now.getTime()) && !Number.isNaN(updatedAt.getTime())
    ? now.getTime() - updatedAt.getTime() > maxAgeMs
    : false;

  if (countStale && ageStale) return 'count+age';
  if (countStale) return 'count';
  if (ageStale) return 'age';
  return null;
}

function annotateProfileStaleness(
  profile: ExecutionProfile,
  db: RuntimeDb,
  options: ProfileStalenessOptions = {},
): ExecutionProfile {
  const reason = resolveStalenessReason(profile, db, options);
  const staleness: ProfileStaleness = { stale: reason !== null, reason };
  const attenuationFactor = Math.max(0, Math.min(1, options.attenuationFactor ?? PROFILE_STALENESS_ATTENUATION_FACTOR));
  const confidence = (profile.confidence ?? DEFAULT_PROFILE_CONFIDENCE) * (staleness.stale ? attenuationFactor : 1);

  return { ...profile, confidence, staleness };
}

export function loadExecutionProfile(
  db: RuntimeDb,
  skillId: string,
  fallbackContext: TierFallbackContext = {},
  stalenessOptions: ProfileStalenessOptions = {},
): LoadedExecutionProfile | null {
  const chain: Array<{ source: LoadedProfileSource; granularityKey: string }> = [
    { source: 'per-skill', granularityKey: 'global' },
  ];

  if (fallbackContext.modelId) {
    chain.push({ source: 'per-model', granularityKey: fallbackContext.modelId });
  }

  if (fallbackContext.userId) {
    chain.push({ source: 'per-user', granularityKey: fallbackContext.userId });
  }

  chain.push({ source: 'global', granularityKey: 'global' });

  for (const tier of chain) {
    const profile = cairn.getExecutionProfileWithDb(db, skillId, tier.source, tier.granularityKey);
    if (profile) {
      return {
        profile: annotateProfileStaleness(toExecutionProfile(profile), db, stalenessOptions),
        source: tier.source,
      };
    }
  }

  return null;
}

function toOptimizationHintInsert(hint: OptimizationHint): OptimizationHintInsert {
  return {
    id: hint.id,
    source: hint.source,
    skillId: hint.skillId,
    category: hint.category,
    description: hint.description,
    recommendation: hint.recommendation,
    impactScore: hint.impactScore,
    confidence: hint.confidence,
    evidence: {
      ...hint.evidence,
      autoApplyEligible: hint.autoApplyEligible,
    },
    parentPrescriptionId: hint.parentPrescriptionId ?? null,
    metricSnapshot: { ...hint.metricSnapshot },
    generatedAt: hint.generatedAt,
  };
}

function isSkippedInsert(result: { inserted: boolean }): boolean {
  return !result.inserted;
}

function emptyPrescriberRun(skillId: string): ExecutedPrescriberRun {
  return {
    skillId,
    hints: [],
    hintsGenerated: 0,
    hintsInserted: 0,
    hintsDuplicated: 0,
    hintsError: 0,
  };
}

function resolveRuntimeDb(options: CreatePrescriberOrchestrationConfigOpts = {}): RuntimeDb {
  if (options.db) {
    return options.db;
  }

  return cairn.getDb(options.dbPath);
}

async function executePrescriberRun({
  db,
  skillId,
  profile,
  minSessions = 0,
  forceRegenerate = false,
}: ExecutePrescriberRunOptions): Promise<ExecutedPrescriberRun> {
  if (!profile || profile.sessionCount < minSessions) {
    return emptyPrescriberRun(skillId);
  }

  const provider = new cairn.SqliteChangeVectorProvider(db);
  const hints = await forge.runForgePrescribers(profile, skillId, { provider });
  const result: ExecutedPrescriberRun = {
    skillId,
    hints,
    hintsGenerated: hints.length,
    hintsInserted: 0,
    hintsDuplicated: 0,
    hintsError: 0,
  };

  for (const hint of hints) {
    try {
      const hintInsert = toOptimizationHintInsert(hint);
      const insertResult = forceRegenerate
        ? cairn.replaceActiveHintAtomically(db, hintInsert, { actor: 'runtime:--force' })
        : cairn.insertHintIfNew(db, hintInsert);

      if (isSkippedInsert(insertResult)) {
        result.hintsDuplicated += 1;
        continue;
      }

      result.hintsInserted += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[skillsmith-runtime] Failed to persist hint for skill=${skillId} category=${hint.category} source=${hint.source}: ${message}`,
      );
      result.hintsError += 1;
    }
  }

  return result;
}

export function createPrescriberOrchestrationConfig(
  opts: CreatePrescriberOrchestrationConfigOpts = {},
): PrescriberOrchestrationConfig {
  const db = resolveRuntimeDb(opts);
  const profileCache = new Map<string, LoadedExecutionProfile | null>();
  const loadProfile = (skillId: string): ExecutionProfile | null => {
    if (profileCache.has(skillId)) {
      return profileCache.get(skillId)?.profile ?? null;
    }

    const loadedProfile = loadExecutionProfile(db, skillId, opts.fallbackContext);
    profileCache.set(skillId, loadedProfile);
    return loadedProfile?.profile ?? null;
  };

  return {
    loadProfile,
    runForSkill: async (skillId, minSessions) => {
      const profile = loadProfile(skillId);
      profileCache.delete(skillId);
      const runResult = await executePrescriberRun({
        db,
        skillId,
        minSessions,
        profile,
      });

      return {
        skillId: runResult.skillId,
        hintsGenerated: runResult.hintsGenerated,
        hintsInserted: runResult.hintsInserted,
        hintsDuplicated: runResult.hintsDuplicated,
        hintsError: runResult.hintsError,
      };
    },
  };
}

export async function runForgePrescribe(
  options: RunForgePrescribeOptions,
): Promise<ForgePrescribeResult> {
  const dbPath = options.dbPath ?? cairn.getKnowledgeDbPath();

  try {
    const db = cairn.getDb(dbPath);
    const loadedProfile = loadExecutionProfile(db, options.skillId, options.fallbackContext);

    if (!loadedProfile) {
      return {
        ok: false,
        exitCode: 1,
        skillId: options.skillId,
        dbPath,
        message: `No execution profile for skill \`${options.skillId}\``,
      };
    }

    const runResult = await executePrescriberRun({
      db,
      skillId: options.skillId,
      profile: loadedProfile.profile,
      forceRegenerate: options.forceRegenerate,
    });

    if (runResult.hintsError > 0) {
      return {
        ok: false,
        exitCode: 2,
        skillId: options.skillId,
        dbPath,
        profileSource: loadedProfile.source,
        hints: runResult.hints,
        inserted: runResult.hintsInserted,
        skipped: runResult.hintsDuplicated,
        errored: runResult.hintsError,
        totalHints: runResult.hintsGenerated,
        totalPersisted: runResult.hintsInserted,
        message: `Failed to persist ${runResult.hintsError} optimization hint${runResult.hintsError === 1 ? '' : 's'}.`,
      };
    }

    return {
      ok: true,
      exitCode: 0,
      skillId: options.skillId,
      dbPath,
      profileSource: loadedProfile.source,
      hints: runResult.hints,
      inserted: runResult.hintsInserted,
      skipped: runResult.hintsDuplicated,
      errored: runResult.hintsError,
      totalHints: runResult.hintsGenerated,
      totalPersisted: runResult.hintsInserted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected failure';
    return {
      ok: false,
      exitCode: 2,
      skillId: options.skillId,
      dbPath,
      message: `Failed to optimize skill \`${options.skillId}\`: ${message}`,
    };
  }
}
