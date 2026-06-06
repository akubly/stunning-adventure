/**
 * Core runtime functions for prescriber execution and profile loading.
 * Extracted to break circular dependency between index.ts and mcp/handler.ts.
 */

import type Database from 'better-sqlite3';
import * as cairn from '@akubly/cairn';
import * as forge from '@akubly/forge';
import type { OptimizationHintInsert } from '@akubly/cairn';
import type { OptimizationHint } from '@akubly/forge';
import type {
  ExecutionProfile,
  PrescriberRunResult,
  ProfileStaleness,
  ProfileStalenessReason,
} from '@akubly/types';

type RuntimeDb = Database.Database;

// Re-export types needed by both index.ts and handler.ts
export type LoadedProfileSource = 'per-skill' | 'per-model' | 'per-user' | 'global';
export type FallbackPolicy = 'per-skill-only' | 'full-chain';

export interface TierFallbackContext {
  modelId?: string;
  userId?: string;
  /** Which tiers to include in the fallback chain. Default: 'per-skill-only'. */
  fallbackPolicy?: FallbackPolicy;
}

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

const DEFAULT_PROFILE_CONFIDENCE = 1;
const DEFAULT_STALENESS_SESSION_THRESHOLD = 50;
const DEFAULT_STALENESS_MAX_AGE_DAYS = 7;
const PROFILE_STALENESS_ATTENUATION_FACTOR = 0.5;

/** Clamp a value to a non-negative finite number, falling back to `fallback` for NaN/Infinity/negative. */
function clampNonNegativeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export interface ExecutePrescriberRunOptions {
  db: RuntimeDb;
  skillId: string;
  profile: ExecutionProfile | null;
  minSessions?: number;
  forceRegenerate?: boolean;
}

export interface ExecutedPrescriberRun extends PrescriberRunResult {
  hints: OptimizationHint[];
}

/**
 * Map a Cairn DB row to the runtime ExecutionProfile shape.
 * Intentionally omits `confidence` and `staleness` — those are runtime-only
 * annotations added by {@link annotateProfileStaleness} after tier selection.
 */
function toExecutionProfile(
  profile: NonNullable<ReturnType<typeof cairn.getExecutionProfile>>,
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
  return cairn.getSessionsSinceInstall(db);
}

function resolveStalenessReason(
  profile: ExecutionProfile,
  db: RuntimeDb,
  options: ProfileStalenessOptions,
): ProfileStalenessReason {
  const sessionCountThreshold = clampNonNegativeFinite(
    options.sessionCountThreshold ?? DEFAULT_STALENESS_SESSION_THRESHOLD,
    DEFAULT_STALENESS_SESSION_THRESHOLD,
  );
  const maxAgeDays = clampNonNegativeFinite(
    options.maxAgeDays ?? DEFAULT_STALENESS_MAX_AGE_DAYS,
    DEFAULT_STALENESS_MAX_AGE_DAYS,
  );
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

export interface ProfileFallbackInfo {
  chain: LoadedProfileSource[];
  skipped: LoadedProfileSource[];
  selected: LoadedProfileSource;
  key: string;
}

export function loadExecutionProfile(
  db: RuntimeDb,
  skillId: string,
  fallbackContext: TierFallbackContext = {},
  stalenessOptions: ProfileStalenessOptions = {},
  onProfileFallback?: (info: ProfileFallbackInfo) => void,
): LoadedExecutionProfile | null {
  const policy = fallbackContext.fallbackPolicy ?? 'per-skill-only';
  const chain: Array<{ source: LoadedProfileSource; granularityKey: string }> = [
    { source: 'per-skill', granularityKey: 'global' },
  ];

  if (policy === 'full-chain') {
    if (fallbackContext.modelId) {
      chain.push({ source: 'per-model', granularityKey: fallbackContext.modelId });
    }

    if (fallbackContext.userId) {
      chain.push({ source: 'per-user', granularityKey: fallbackContext.userId });
    }

    chain.push({ source: 'global', granularityKey: 'global' });
  }

  const skipped: LoadedProfileSource[] = [];
  for (const tier of chain) {
    const profile = cairn.getExecutionProfile(db, skillId, tier.source, tier.granularityKey);
    if (profile) {
      if (tier.source !== 'per-skill') {
        const info: ProfileFallbackInfo = {
          chain: chain.map(t => t.source),
          skipped,
          selected: tier.source,
          key: tier.granularityKey,
        };
        const notify = onProfileFallback ?? defaultFallbackNotifier;
        notify(info);
      }
      return {
        profile: annotateProfileStaleness(toExecutionProfile(profile), db, stalenessOptions),
        source: tier.source,
      };
    }
    skipped.push(tier.source);
  }

  return null;
}

function defaultFallbackNotifier(info: ProfileFallbackInfo): void {
  console.error(
    `[skillsmith-runtime] Profile fallback: chain=[${info.chain.join(',')}] skipped=[${info.skipped.join(',')}] selected=${info.selected} key=${info.key}`,
  );
}

export function toOptimizationHintInsert(hint: OptimizationHint): OptimizationHintInsert {
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

export function isSkippedInsert(result: { inserted: boolean }): boolean {
  return !result.inserted;
}

export function emptyPrescriberRun(skillId: string): ExecutedPrescriberRun {
  return {
    skillId,
    hints: [],
    hintsGenerated: 0,
    hintsInserted: 0,
    hintsDuplicated: 0,
    hintsError: 0,
  };
}

export async function executePrescriberRun({
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
  const dispositionProvider = new cairn.SqliteHintDispositionProvider(db);
  const hints = await forge.runForgePrescribers(profile, skillId, { provider, dispositionProvider });
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

export async function runForgePrescribe(
  options: RunForgePrescribeOptions,
): Promise<ForgePrescribeResult> {
  const dbPath = options.dbPath ?? cairn.getKnowledgeDbPath();

  try {
    const db = cairn.getDb(dbPath);
    const loadedProfile = loadExecutionProfile(db, options.skillId, {
      ...options.fallbackContext,
      fallbackPolicy: options.fallbackContext?.fallbackPolicy ?? 'full-chain',
    }, undefined, (info) => {
      console.error(
        `[skillsmith-runtime] Profile fallback: skill=${options.skillId} chain=[${info.chain.join(',')}] skipped=[${info.skipped.join(',')}] selected=${info.selected} key=${info.key}`,
      );
    });

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
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      exitCode: 2,
      skillId: options.skillId,
      dbPath,
      message: `Failed to optimize skill \`${options.skillId}\`: ${message}`,
    };
  }
}
