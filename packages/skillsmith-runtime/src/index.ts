import type Database from 'better-sqlite3';
import * as cairn from '@akubly/cairn';
import type {
  ExecutionProfile,
  PrescriberOrchestrationConfig,
} from '@akubly/types';

export type { PrescriberOrchestrationConfig } from '@akubly/types';
export { forgePrescribeHandler } from './mcp/handler.js';
export type { ForgePrescribeArgs, McpToolResult, RunForgePrescribeFn } from './mcp/handler.js';
export {
  loadExecutionProfile,
  runForgePrescribe,
  executePrescriberRun,
  toOptimizationHintInsert,
  emptyPrescriberRun,
  isSkippedInsert,
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
  type ExecutePrescriberRunOptions,
  type ExecutedPrescriberRun,
} from './runtime.js';
export { createCairnTelemetrySink } from './telemetry.js';
export {
  runForgeInstrumentedSession,
  type RunForgeInstrumentedSessionOptions,
  type RunForgeInstrumentedSessionResult,
} from './forgeSessionRunner.js';
import {
  loadExecutionProfile,
  executePrescriberRun,
  type TierFallbackContext,
  type ProfileStalenessOptions,
  type LoadedExecutionProfile,
} from './runtime.js';

export interface CreatePrescriberOrchestrationConfigOpts {
  db?: Database.Database;
  dbPath?: string;
  fallbackContext?: TierFallbackContext;
  stalenessOptions?: ProfileStalenessOptions;
}

export type CreatePrescriberOrchestrationConfigOptions = CreatePrescriberOrchestrationConfigOpts;

function resolveRuntimeDb(options: CreatePrescriberOrchestrationConfigOpts = {}): Database.Database {
  if (options.db) {
    return options.db;
  }

  return cairn.getDb(options.dbPath);
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
