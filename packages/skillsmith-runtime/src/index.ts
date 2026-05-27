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
export { forgePrescribeHandler } from './mcp/handler.js';
export type { ForgePrescribeArgs, McpToolResult, RunForgePrescribeFn } from './mcp/handler.js';
export {
  loadExecutionProfile,
  runForgePrescribe,
  type LoadedProfileSource,
  type FallbackPolicy,
  type TierFallbackContext,
  type ProfileStalenessOptions,
  type LoadedExecutionProfile,
  type RunForgePrescribeOptions,
  type ForgePrescribeResult,
  type ForgePrescribeSuccessResult,
  type ForgePrescribeFailureResult,
  type ProfileFallbackInfo,
} from './runtime.js';
import { loadExecutionProfile } from './runtime.js';
import type { TierFallbackContext, ProfileStalenessOptions, LoadedExecutionProfile } from './runtime.js';

export interface CreatePrescriberOrchestrationConfigOpts {
  db?: Database.Database;
  dbPath?: string;
  fallbackContext?: TierFallbackContext;
  stalenessOptions?: ProfileStalenessOptions;
}

export type CreatePrescriberOrchestrationConfigOptions = CreatePrescriberOrchestrationConfigOpts;

interface ExecutedPrescriberRun extends PrescriberRunResult {
  hints: OptimizationHint[];
}

function resolveRuntimeDb(options: CreatePrescriberOrchestrationConfigOpts = {}): Database.Database {
  if (options.db) {
    return options.db;
  }

  return cairn.getDb(options.dbPath);
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

interface ExecutePrescriberRunOptions {
  db: Database.Database;
  skillId: string;
  profile: ExecutionProfile | null;
  minSessions?: number;
  forceRegenerate?: boolean;
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

    const loadedProfile = loadExecutionProfile(db, skillId, opts.fallbackContext, opts.stalenessOptions);
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
