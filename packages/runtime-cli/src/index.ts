import {
  getDb,
  getExecutionProfile,
  getKnowledgeDbPath,
  insertHintIfNew,
  SqliteChangeVectorProvider,
  type ExecutionProfileRow,
  type OptimizationHintInsert,
} from '@akubly/cairn';
import { runForgePrescribers, type OptimizationHint } from '@akubly/forge';
import type { ExecutionProfile } from '@akubly/types';

export type LoadedProfileSource = 'per-skill' | 'global fallback';

export interface RunForgePrescribeOptions {
  skillId: string;
  dbPath?: string;
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

function toExecutionProfile(profile: ExecutionProfileRow): ExecutionProfile {
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

function loadExecutionProfile(skillId: string): { profile: ExecutionProfile; source: LoadedProfileSource } | null {
  const perSkillProfile = getExecutionProfile(skillId, 'per-skill', 'global');
  if (perSkillProfile) {
    return { profile: toExecutionProfile(perSkillProfile), source: 'per-skill' };
  }

  const globalProfile = getExecutionProfile(skillId, 'global', 'global');
  if (globalProfile) {
    return { profile: toExecutionProfile(globalProfile), source: 'global fallback' };
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

export async function runForgePrescribe(
  options: RunForgePrescribeOptions,
): Promise<ForgePrescribeResult> {
  const dbPath = options.dbPath ?? getKnowledgeDbPath();

  try {
    const db = getDb(dbPath);
    const loadedProfile = loadExecutionProfile(options.skillId);

    if (!loadedProfile) {
      return {
        ok: false,
        exitCode: 1,
        skillId: options.skillId,
        dbPath,
        message: `No execution profile for skill \`${options.skillId}\``,
      };
    }

    const provider = new SqliteChangeVectorProvider(db);
    const hints = await runForgePrescribers(loadedProfile.profile, options.skillId, { provider });

    let inserted = 0;
    let skipped = 0;
    let errored = 0;

    for (const hint of hints) {
      try {
        const result = insertHintIfNew(db, toOptimizationHintInsert(hint));
        if (isSkippedInsert(result)) {
          skipped += 1;
          continue;
        }
        inserted += 1;
      } catch {
        errored += 1;
      }
    }

    if (errored > 0) {
      return {
        ok: false,
        exitCode: 2,
        skillId: options.skillId,
        dbPath,
        profileSource: loadedProfile.source,
        hints,
        inserted,
        skipped,
        errored,
        totalHints: hints.length,
        totalPersisted: inserted,
        message: `Failed to persist ${errored} optimization hint${errored === 1 ? '' : 's'}.`,
      };
    }

    return {
      ok: true,
      exitCode: 0,
      skillId: options.skillId,
      dbPath,
      profileSource: loadedProfile.source,
      hints,
      inserted,
      skipped,
      errored,
      totalHints: hints.length,
      totalPersisted: inserted,
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
