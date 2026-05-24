import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  upsertExecutionProfileWithDb,
  type ExecutionProfileUpsert as ExecutionProfile,
} from '../db/executionProfiles.js';
import { insertHintIfNew, type HintSource, type OptimizationHintInsert } from '../db/optimizationHints.js';

export type { ExecutionProfile };

const DEFAULT_SNAPSHOT_SESSION_COUNT = 6;
const DEFAULT_PROFILE_SESSION_COUNT = 12;

export function makeProfile(skillId: string, overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
  const base: ExecutionProfile = {
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: DEFAULT_PROFILE_SESSION_COUNT,
    drift: { mean: 0.25, p50: 0.2, p95: 0.65, trend: 'degrading' },
    token: { meanInput: 60_000, meanOutput: 40_000, meanCacheHit: 0.2, totalCost: 24_000_000 },
    outcome: { successRate: 0.85, meanConvergence: 12, toolErrorRate: 0.04 },
  };

  return {
    ...base,
    ...overrides,
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
  };
}

function makeAppliedHint(
  skillId: string,
  category: OptimizationHintInsert['category'],
  source: HintSource,
  beforeSessionCount: number,
): OptimizationHintInsert {
  const isCacheHint = category === 'cache-optimization';

  return {
    id: `seed-${skillId}-${category}-${randomUUID()}`,
    source,
    skillId,
    category,
    description: `Historical ${category} hint`,
    recommendation: 'Historical seed',
    impactScore: 0.8,
    confidence: 0.9,
    generatedAt: '2026-05-23T00:00:00.000Z',
    status: 'applied',
    metricSnapshot: {
      driftScore: isCacheHint ? 0.28 : 0.3,
      driftLevel: 'yellow',
      tokenCostNanoAiu: isCacheHint ? 1_900_000 : 2_000_000,
      successRate: isCacheHint ? 0.82 : 0.8,
      convergenceTurns: isCacheHint ? 7 : 10,
      cacheHitRate: isCacheHint ? 0.15 : 0.2,
      sessionCount: beforeSessionCount,
    },
  };
}

export function seedQualifyingSkill(
  db: Database.Database,
  skillId: string,
  options: { sessions?: number; profile?: Partial<ExecutionProfile> } = {},
): void {
  insertHintIfNew(db, makeAppliedHint(skillId, 'convergence', 'prompt-optimizer', DEFAULT_SNAPSHOT_SESSION_COUNT));
  insertHintIfNew(
    db,
    makeAppliedHint(skillId, 'cache-optimization', 'token-optimizer', DEFAULT_SNAPSHOT_SESSION_COUNT),
  );

  const profile = makeProfile(skillId, options.profile);
  if (options.sessions !== undefined) {
    profile.sessionCount = options.sessions;
  }

  upsertExecutionProfileWithDb(db, profile);
}
