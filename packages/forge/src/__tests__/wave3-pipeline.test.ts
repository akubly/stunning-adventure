import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurateResult } from '../../../cairn/src/agents/curator.js';
import * as curator from '../../../cairn/src/agents/curator.js';
import { closeDb, getDb } from '../../../cairn/src/db/index.js';
import { queryOptimizationHints } from '../../../cairn/src/db/optimizationHints.js';
import { upsertExecutionProfile } from '../../../cairn/src/db/executionProfiles.js';
import {
  insertOptimizationHint,
  type HintSource,
  type OptimizationHintInsert,
} from '../../../cairn/src/db/optimizationHints.js';
import {
  runSessionStartHook,
  type SessionStartOrchestrationFactory,
} from '../../../cairn/src/hooks/sessionStart.js';
import {
  createPrescriberOrchestrationConfig,
  type PrescriberOrchestrationConfig,
} from '../../../skillsmith-runtime/src/index.js';

let db: ReturnType<typeof getDb>;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

let dbPath = '';
let hintCounter = 0;

function makeDbPath(): string {
  return join(REPO_ROOT, 'packages', 'forge', 'src', '__tests__', `wave3-pipeline-${randomUUID()}.sqlite`);
}

function makeProfile(skillId: string, sessionCount: number) {
  return {
    skillId,
    granularity: 'per-skill' as const,
    granularityKey: 'global',
    sessionCount,
    drift: { mean: 0.25, p50: 0.2, p95: 0.65, trend: 'degrading' as const },
    token: { meanInput: 60_000, meanOutput: 40_000, meanCacheHit: 0.2, totalCost: 24_000_000 },
    outcome: { successRate: 0.85, meanConvergence: 12, toolErrorRate: 0.04 },
  };
}

function makeAppliedHint(
  skillId: string,
  category: OptimizationHintInsert['category'],
  source: HintSource,
  beforeSessionCount: number,
): OptimizationHintInsert {
  hintCounter += 1;
  const isCacheHint = category === 'cache-optimization';

  return {
    id: `wave3-seed-${hintCounter}`,
    source,
    skillId,
    category,
    description: `Historical ${category} hint`,
    recommendation: 'Historical seed',
    impactScore: 0.8,
    confidence: 0.9,
    generatedAt: `2026-05-23T00:${String(hintCounter).padStart(2, '0')}:00.000Z`,
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

function seedQualifyingSkill(skillId: string, options: { beforeSessionCount?: number; sessionCount?: number } = {}) {
  const beforeSessionCount = options.beforeSessionCount ?? 6;
  const sessionCount = options.sessionCount ?? 12;

  insertOptimizationHint(db, makeAppliedHint(skillId, 'convergence', 'prompt-optimizer', beforeSessionCount));
  insertOptimizationHint(db,
    makeAppliedHint(skillId, 'cache-optimization', 'token-optimizer', beforeSessionCount),
  );
  upsertExecutionProfile(db, makeProfile(skillId, sessionCount));
}

function reopenDb() {
  return db = getDb(dbPath);
}

function pendingHintCount(skillId: string): number {
  reopenDb();
  return queryOptimizationHints(db, { skillId, status: 'pending' }).length;
}

function totalHintCount(skillId: string): number {
  db = reopenDb();
  const row = db
    .prepare('SELECT COUNT(*) as count FROM optimization_hints WHERE skill_id = ?')
    .get(skillId) as { count: number };
  return row.count;
}

async function runBootstrap(
  factory: SessionStartOrchestrationFactory = (db) => createPrescriberOrchestrationConfig({ db }),
): Promise<CurateResult> {
  reopenDb();
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
  const input = `${JSON.stringify({ toolName: 'view', cwd: REPO_ROOT })}\n`;
  const curateSpy = vi.spyOn(curator, 'curate');

  Object.defineProperty(process, 'stdin', {
    value: Readable.from([input]),
    configurable: true,
  });

  try {
    await runSessionStartHook(factory);
  } finally {
    if (stdinDescriptor) {
      Object.defineProperty(process, 'stdin', stdinDescriptor);
    }
  }

  expect(curateSpy).toHaveBeenCalledTimes(1);
  const result = (await curateSpy.mock.results[0]!.value) as CurateResult;
  curateSpy.mockRestore();
  return result;
}

function wrapFactory(
  wrap: (db: Database.Database, real: PrescriberOrchestrationConfig) => PrescriberOrchestrationConfig,
): SessionStartOrchestrationFactory {
  return (db) => {
    const real = createPrescriberOrchestrationConfig({ db });
    return wrap(db, real);
  };
}

beforeEach(() => {
  closeDb();
  hintCounter = 0;
  dbPath = makeDbPath();
  db = getDb(dbPath);
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDb();
  if (dbPath && existsSync(dbPath)) {
    rmSync(dbPath, { force: true });
  }
});

describe('Wave 3 full pipeline integration', () => {
  it('auto triggers prescriber orchestration through the always-on session-start bootstrap', async () => {
    seedQualifyingSkill('skill-auto');

    const result = await runBootstrap();
    db = reopenDb();
    const vectors = db.prepare('SELECT COUNT(*) as count FROM change_vectors').get() as { count: number };
    const prescriberResult = result.prescribers?.[0];

    expect(result.changeVectorSweep.computed).toBe(2);
    expect(result.changeVectorSweep.computedSkillIds).toEqual(['skill-auto']);
    expect(prescriberResult).toMatchObject({
      skillId: 'skill-auto',
      hintsError: 0,
    });
    expect(prescriberResult!.hintsGenerated).toBeGreaterThan(0);
    expect(prescriberResult!.hintsInserted).toBeGreaterThan(0);
    expect(vectors.count).toBeGreaterThan(0);
    expect(pendingHintCount('skill-auto')).toBe(prescriberResult!.hintsInserted);
  });

  it('deduplicates repeated auto-trigger recommendations on a later bootstrap cycle', async () => {
    seedQualifyingSkill('skill-dedup', { beforeSessionCount: 6, sessionCount: 12 });
    insertOptimizationHint(db, makeAppliedHint('skill-dedup', 'convergence', 'prompt-optimizer', 11));
    insertOptimizationHint(db, makeAppliedHint('skill-dedup', 'cache-optimization', 'token-optimizer', 11));

    const firstResult = await runBootstrap();
    const pendingAfterFirstRun = pendingHintCount('skill-dedup');
    const totalHintsAfterFirstRun = totalHintCount('skill-dedup');

    expect(firstResult.prescribers?.[0]?.hintsInserted).toBeGreaterThan(0);

    upsertExecutionProfile(db, makeProfile('skill-dedup', 14));
    const secondResult = await runBootstrap();
    const secondPrescriberResult = secondResult.prescribers?.[0];

    expect(secondResult.changeVectorSweep.computed).toBe(2);
    expect(secondPrescriberResult).toMatchObject({
      skillId: 'skill-dedup',
      hintsInserted: 0,
      hintsError: 0,
    });
    expect(secondPrescriberResult!.hintsDuplicated).toBeGreaterThan(0);
    expect(pendingHintCount('skill-dedup')).toBe(pendingAfterFirstRun);
    expect(totalHintCount('skill-dedup')).toBe(totalHintsAfterFirstRun);
  });

  it('fails open when one skill throws and continues orchestrating the other', async () => {
    seedQualifyingSkill('skill-fail-open-a');
    seedQualifyingSkill('skill-fail-open-b');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runBootstrap(
      wrapFactory((_, real) => ({
        ...real,
        runForSkill: async (skillId, minSessions) => {
          if (skillId === 'skill-fail-open-a') {
            throw new Error('boom');
          }
          return real.runForSkill(skillId, minSessions);
        },
      })),
    );

    const failed = result.prescribers?.find((entry) => entry.skillId === 'skill-fail-open-a');
    const succeeded = result.prescribers?.find((entry) => entry.skillId === 'skill-fail-open-b');

    expect(result.changeVectorSweep.computedSkillIds).toHaveLength(2);
    expect(result.changeVectorSweep.computedSkillIds).toEqual(
      expect.arrayContaining(['skill-fail-open-a', 'skill-fail-open-b']),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'curate: prescriber orchestration failed for skill skill-fail-open-a: boom',
    );
    expect(failed).toEqual({
      skillId: 'skill-fail-open-a',
      hintsGenerated: 0,
      hintsInserted: 0,
      hintsDuplicated: 0,
      hintsError: 1,
    });
    expect(succeeded!.hintsInserted).toBeGreaterThan(0);
    expect(pendingHintCount('skill-fail-open-a')).toBe(0);
    expect(pendingHintCount('skill-fail-open-b')).toBe(succeeded!.hintsInserted);
  });

  it('treats a missing execution profile as a zero-count skip after vectors are computed', async () => {
    seedQualifyingSkill('skill-no-profile');

    const result = await runBootstrap(
      wrapFactory((db, real) => ({
        ...real,
        runForSkill: async (skillId, minSessions) => {
          // Remove the profile after Curator computed vectors so this exercises
          // the orchestration-time "no profile" path rather than vector gating.
          db.prepare(
            "DELETE FROM execution_profiles WHERE skill_id = ? AND granularity = 'per-skill' AND granularity_key = 'global'",
          ).run(skillId);
          return real.runForSkill(skillId, minSessions);
        },
      })),
    );

    expect(result.changeVectorSweep.computed).toBe(2);
    expect(result.changeVectorSweep.computedSkillIds).toEqual(['skill-no-profile']);
    expect(result.prescribers).toEqual([
      {
        skillId: 'skill-no-profile',
        hintsGenerated: 0,
        hintsInserted: 0,
        hintsDuplicated: 0,
        hintsError: 0,
      },
    ]);
    expect(pendingHintCount('skill-no-profile')).toBe(0);
  });
});
