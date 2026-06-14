/**
 * Slice 5 — End-to-end pipeline verification.
 *
 * Guards the gap this milestone fixed: on a fresh install, telemetry now
 * bootstraps execution profiles which feed the prescriber. Proves that the
 * loop closes:
 *
 *   ForgeSession collectors → signal_samples (cairn DB)
 *     → curate() → execution_profiles
 *       → runForgePrescribers → OptimizationHint[]
 *
 * Uses path (a): drive telemetry through the real runtime (ForgeSession with
 * a mock SDK session + createCairnTelemetrySink) so that actual collector →
 * sink → DB plumbing is exercised end-to-end.
 *
 * The POINT: before this milestone the prescriber was always starved because
 * nothing populated signal_samples. This test is the regression guard that
 * proves the pipeline no longer breaks on a fresh install.
 *
 * @module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SessionEvent } from '@github/copilot-sdk';
import * as cairn from '@akubly/cairn';
import { ForgeClient, runForgePrescribers } from '@akubly/forge';
import { createCairnTelemetrySink } from '../telemetry.js';
import { loadExecutionProfile } from '../runtime.js';
import {
  createMockClient,
  createMockSession,
  assistantUsageEvent,
  toolExecutionStartEvent,
  toolExecutionCompleteEvent,
  resetEventCounter,
} from '../../../forge/src/__tests__/helpers/index.js';

// ---------------------------------------------------------------------------
// Inline event factories — types not in the shared event-factory.ts
// ---------------------------------------------------------------------------

let _e2eCounter = 0;

function e2eId(): string {
  return `e2e-${String(++_e2eCounter).padStart(4, '0')}`;
}

function makeTurnEndEvent(): SessionEvent {
  return {
    id: e2eId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'assistant.turn_end',
    data: {},
  };
}

function makeSessionShutdownEvent(): SessionEvent {
  return {
    id: e2eId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'session.shutdown',
    data: {},
  };
}

// ---------------------------------------------------------------------------
// DB lifecycle — fresh in-memory cairn DB for each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  cairn.closeDb();
  cairn.getDb(':memory:');
  _e2eCounter = 0;
  resetEventCounter();
});

afterEach(() => {
  cairn.closeDb();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Skill ID used in the primary e2e loop test. */
const SKILL_ID = 'skill-e2e-pipeline';

/**
 * Sessions to drive. Meets DEFAULT_MIN_SESSIONS (3) so that prescribers
 * agree to generate hints.
 */
const N_SESSIONS = 3;

/**
 * Turn-end events emitted per session.
 * Drives `meanConvergenceTurns` to 12, which exceeds the prompt-optimizer
 * threshold of 10 and triggers a "convergence" OptimizationHint.
 */
const TURNS_PER_SESSION = 12;

// ---------------------------------------------------------------------------
// Session driver: run one full instrumented Forge session
// ---------------------------------------------------------------------------

/**
 * Drive a single session through ForgeClient → createCairnTelemetrySink →
 * cairn DB.  At disconnect(), the three collectors flush into the sink which
 * persists signal_samples rows.
 */
async function runInstrumentedSession(sessionIndex: number): Promise<void> {
  const db = cairn.getDb();
  const sink = createCairnTelemetrySink(db);
  const mockSdk = createMockSession({ sessionId: `e2e-sess-${sessionIndex}` });
  const mockClient = createMockClient({ session: mockSdk });
  const forgeClient = new ForgeClient({ sdkClient: mockClient });

  const session = await forgeClient.createSession({
    skillId: SKILL_ID,
    telemetrySink: sink,
  });

  // Tool call: sets convergedTurn so drift collector flushes a non-null sample
  mockSdk._emit(toolExecutionStartEvent('read_file', { toolCallId: `call-${sessionIndex}-a` }));
  mockSdk._emit(toolExecutionCompleteEvent(`call-${sessionIndex}-a`, 'file contents', { success: true }));

  // Turns: outcome collector accumulates turnCount = TURNS_PER_SESSION
  // → meanConvergenceTurns aggregated from these turnCount values > 10
  for (let i = 0; i < TURNS_PER_SESSION; i++) {
    mockSdk._emit(makeTurnEndEvent());
  }

  // Token usage: ensures the token collector flushes a non-null sample
  mockSdk._emit(assistantUsageEvent({ inputTokens: 500, outputTokens: 200 }));

  // Shutdown: outcome.succeeded = true
  mockSdk._emit(makeSessionShutdownEvent());

  // disconnect() flushes collectors → sink.enqueueSample() × 3
  //           → sink.flush() → insertSignalSample(db, ...) × 3
  await session.disconnect();
}

// ===========================================================================
// Slice 5 primary: full pipeline loop
// ===========================================================================

describe('E2E pipeline: telemetry → signal_samples → curate() → prescriber (Slice 5)', () => {
  it('closes the loop from fresh DB: drive N sessions → build profiles → generate hints', async () => {
    // ------------------------------------------------------------------
    // Step 1: Drive N sessions of telemetry through the real runtime.
    // Collectors observe events, flush at disconnect, sink persists to DB.
    // ------------------------------------------------------------------
    for (let i = 0; i < N_SESSIONS; i++) {
      await runInstrumentedSession(i);
    }

    const db = cairn.getDb();

    const samples = cairn.querySignalSamples(db, { skillId: SKILL_ID });
    expect(samples.length, 'signal_samples rows written for skill after N sessions')
      .toBeGreaterThanOrEqual(N_SESSIONS);

    const kinds = new Set(samples.map((s) => s.kind));
    expect(kinds, 'drift samples present').toContain('drift');
    expect(kinds, 'token samples present').toContain('token');
    expect(kinds, 'outcome samples present').toContain('outcome');

    // All samples tagged with the skill ID
    for (const s of samples) {
      expect(s.skillId, `${s.kind} sample must carry skillId`).toBe(SKILL_ID);
    }

    // ------------------------------------------------------------------
    // Step 2: Build execution profiles via curate().
    // ------------------------------------------------------------------
    const curateResult = await cairn.curate();

    expect(curateResult.profileBuild, 'curate() returned profileBuild summary').toBeDefined();
    expect(curateResult.profileBuild!.samplesConsumed, 'all samples consumed by build')
      .toBeGreaterThanOrEqual(N_SESSIONS);
    expect(curateResult.profileBuild!.skillIds, 'per-skill profile built for our skill')
      .toContain(SKILL_ID);
    expect(curateResult.profileBuild!.skillIds, 'global fallback profile built')
      .toContain('global');

    // ------------------------------------------------------------------
    // Step 3: Assert execution_profiles reflects the seeded sessions.
    // ------------------------------------------------------------------
    const perSkillRow = cairn.getExecutionProfile(db, SKILL_ID, 'per-skill', 'global');
    expect(perSkillRow, 'per-skill profile exists in DB after curate()').not.toBeNull();
    expect(perSkillRow!.sessionCount, 'sessionCount = N_SESSIONS').toBe(N_SESSIONS);
    // meanConvergence in DB = TURNS_PER_SESSION (12) because each session's
    // outcome sample carries turnCount = 12 and aggregateSignals averages them
    expect(perSkillRow!.outcome.meanConvergence, 'meanConvergence = TURNS_PER_SESSION')
      .toBe(TURNS_PER_SESSION);

    const globalRow = cairn.getExecutionProfile(db, 'global', 'global', 'global');
    expect(globalRow, 'global fallback profile exists in DB after curate()').not.toBeNull();

    // ------------------------------------------------------------------
    // Step 4: Load the pipeline-built profile and run prescribers.
    // The convergence hint fires because meanConvergenceTurns (12) > 10.
    // ------------------------------------------------------------------
    const loaded = loadExecutionProfile(db, SKILL_ID);
    expect(loaded, 'loadExecutionProfile returns the freshly-built profile').not.toBeNull();

    const profile = loaded!.profile;
    expect(profile.sessionCount, 'loaded profile has correct sessionCount').toBe(N_SESSIONS);
    expect(profile.outcomes.meanConvergenceTurns, 'convergence turns > 10 → hint will fire')
      .toBeGreaterThan(10);

    const hints = await runForgePrescribers(profile, SKILL_ID);
    expect(hints.length, 'prescriber produces ≥1 hint from a pipeline-built profile')
      .toBeGreaterThan(0);

    const convergenceHint = hints.find((h) => h.category === 'convergence');
    expect(convergenceHint, 'convergence hint fires (meanConvergenceTurns > 10)').toBeDefined();
    expect(convergenceHint!.skillId, 'hint carries correct skillId').toBe(SKILL_ID);
  });

  it('empty DB: curate() builds nothing — prescriber starvation (the pre-milestone baseline)', async () => {
    // Verifies the baseline state that this milestone fixed: without telemetry,
    // there are no samples, no profiles, and the prescriber has nothing to work with.
    const curateResult = await cairn.curate();

    // On an empty DB, buildProfiles returns early with 0 consumed
    if (curateResult.profileBuild) {
      expect(curateResult.profileBuild.samplesConsumed, 'no samples on empty DB').toBe(0);
      expect(curateResult.profileBuild.profilesBuilt, 'no profiles built on empty DB').toBe(0);
    }

    const db = cairn.getDb();
    const noProfile = loadExecutionProfile(db, SKILL_ID);
    expect(noProfile, 'no profile on empty DB — prescriber is starved').toBeNull();
  });

  it('null-skill samples fold into global tier only (not per-skill)', async () => {
    // Sessions without skillId → null in signal_samples.skill_id.
    // buildProfiles only creates per-skill rows for non-null skillIds;
    // null-skill samples contribute only to the global aggregate.
    const db = cairn.getDb();
    const sink = createCairnTelemetrySink(db);
    const mockSdk = createMockSession({ sessionId: 'e2e-noskill-sess' });
    const forgeClient = new ForgeClient({ sdkClient: createMockClient({ session: mockSdk }) });

    // No skillId — collectors will be tagged with skillId = undefined
    const session = await forgeClient.createSession({ telemetrySink: sink });

    mockSdk._emit(toolExecutionStartEvent('grep', { toolCallId: 'call-noskill-a' }));
    mockSdk._emit(toolExecutionCompleteEvent('call-noskill-a', 'results', { success: true }));
    for (let i = 0; i < TURNS_PER_SESSION; i++) {
      mockSdk._emit(makeTurnEndEvent());
    }
    mockSdk._emit(assistantUsageEvent({ inputTokens: 100, outputTokens: 50 }));
    mockSdk._emit(makeSessionShutdownEvent());
    await session.disconnect();

    // Signal samples land with skill_id = NULL
    const nullSamples = cairn.querySignalSamples(db, { skillId: null });
    expect(nullSamples.length, 'null-skill samples landed in DB').toBeGreaterThanOrEqual(1);
    for (const s of nullSamples) {
      expect(s.skillId, 'null-skill sample has null skillId in DB').toBeNull();
    }

    await cairn.curate();

    // Global profile aggregates null-skill samples
    const globalRow = cairn.getExecutionProfile(db, 'global', 'global', 'global');
    expect(globalRow, 'global tier built from null-skill samples').not.toBeNull();

    // The per-skill tier must be completely empty — no rows at all, regardless of key.
    // (Probing only SKILL_ID would be tautological: that key was never seeded here.)
    const allProfiles = cairn.listExecutionProfiles(db);
    const perSkillProfiles = allProfiles.filter((p) => p.granularity === 'per-skill');
    expect(perSkillProfiles.length, 'per-skill tier is empty — null samples fold to global only').toBe(0);
  });
});
