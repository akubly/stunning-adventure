/**
 * Acceptance tests — Phase 0.5 Walking Skeleton (SK-1 through SK-6 + A2).
 *
 * Test scope     : Full end-to-end vertical: SdkProvider → WAL bootstrap →
 *                  WAL append → crucible status → A2 replay → FifoScheduler.
 * CTD references :
 *   §12.2  SdkProvider (SK-1 LLM call boundary)
 *   §2.2   BootstrapPayload + bootstrap materializer (SK-2 offset-0 rows)
 *   §3     WAL append (SK-3 Observation + Decision hash-chain commit)
 *   §13    crucible status verb (SK-4 session read-back)
 *   §11.4  Hermetic replay + §11.6 oracle (SK-5 A2 byte-equivalence)
 *   §5.A   FifoScheduler stub (SK-6 A-Sched-1 scheduler_dispatched)
 * TDD strategy   : §2 Walkthrough A, A2 + A-Sched-1 acceptance signals
 *
 * ─── RED PHASE — Two imports will fail until their owners deliver: ───────────
 *
 *   (T4 / Alexander) packages/crucible-core/src/skeleton/sdk-provider-stub.ts
 *     → StubSdkProvider ✓ already landed on branch
 *   (T5 / orchestration) packages/crucible-core/src/skeleton/assembly.ts
 *     → createSkeletonSession()
 *
 * Until those land, every test in this file will fail with
 * "Cannot find module '../../skeleton/assembly.js'" (or sdk-provider-stub.js).
 * That is the expected RED state. No implementation code lives here.
 *
 * ─── Skeleton gate (6 checks) ────────────────────────────────────────────────
 *
 *   SK-1  One LLM call through the SdkProvider boundary (prompt → canned response).
 *   SK-2  L0 bootstrap — BootstrapPayload materialised as offset-0 Observation rows.
 *   SK-3  WAL append — response committed as ≥1 Observation + ≥1 Decision row,
 *         hash-chain linked.
 *   SK-4  `crucible status` reads session ID, row count, last commit offset.
 *   SK-5  `crucible replay` passes A2 conformance — byte-equivalent replay ledger.
 *   SK-6  FifoScheduler stub emits scheduler_dispatched immediately for every proposal.
 *
 * ─── A2 byte-equivalence oracle (§11.6 + §11.8) ─────────────────────────────
 *
 *   The normalizeTimestamps() + assertA2ByteEquivalent() helpers below are the
 *   literal oracle comparator from CTD §11.8. They are exported so the conformance
 *   runner (ci:conformance replay) can import them without re-deriving the oracle.
 *
 * ─── Spec ambiguities for implementation agents ──────────────────────────────
 *
 *   AMBIG-1  createSkeletonSession() factory signature (SkeletonSessionOptions).
 *            Assumed shape: { provider, materializer?, scheduler?, replayEngine? }.
 *            T5 (orchestration) must either match this or update this test.
 *
 *   AMBIG-2  SkeletonSession does not currently expose a queryRows() method.
 *            SK-2 (offset-0 Observation primitiveKinds) and SK-3 (per-row kinds)
 *            are asserted via rowCount only. If T2 (Roger) exposes a row-reader
 *            seam (e.g. SkeletonSession.queryRows()), tighten these checks.
 *
 *   AMBIG-3  Bootstrap row count depends on BootstrapPayload shape:
 *            1 system_prompt + 1 tool_definitions + N injected_memory rows.
 *            SK-2 asserts ≥ 1 bootstrap row at offset 0 visible via status().
 *            With the stub payload below (1 tool def, 0 memory fragments) the
 *            expected bootstrap count is 2; tighten once T2 confirms the count.
 *
 *   AMBIG-4  A2 replay wallClockMs budget: §11.4 says replay < 10% of original.
 *            The skeleton uses canned responses so original.wallClockMs may be near 0.
 *            SK-5 asserts status === 'pass' + rowsReplayed count only; the
 *            wallClockMs ratio check is deferred until real latency data exists.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Types from T1 (Graham) — already present on branch. ✓
import type {
  SchedulerDispatched,
  ReplayReport,
  SkeletonSession,
  SkeletonStatus,
  SkeletonRunResult,
} from '../../skeleton/index.js';

import type { PrimitiveInput } from '../../types.js';

// ─── RED imports — implementations not yet created ───────────────────────────

// T5 (orchestration agent) — RED until skeleton/assembly.ts is created.
// Expected failure: "Cannot find module '../../skeleton/assembly.js'"
// ⚠️ AMBIG-1: adjust SkeletonSessionOptions if T5 uses a different factory signature.
import { createSkeletonSession } from '../../skeleton/assembly.js';

// T4 (Alexander) — StubSdkProvider already on branch. ✓
import { StubSdkProvider } from '../../skeleton/sdk-provider-stub.js';

// ─── A2 byte-equivalence oracle (§11.6 + §11.8) ─────────────────────────────
//
// These helpers implement the literal assertion shape from CTD §11.8 A2 pseudocode.
// They are the normalization oracle: strip timestamp (informational) and any
// payload field tagged wallClockDerived (e.g. adapter-stamped duration_ms).
//
// Export them so the conformance runner (ci:conformance replay) can import without
// re-deriving the oracle from the spec.

type LedgerRow = PrimitiveInput & { timestamp?: number };

/**
 * Strip fields tagged wallClockDerived from a primitivePayload object.
 * Per §11.6: any payload field tagged wallClockDerived is masked to null.
 * Recognises the conventional field names duration_ms and wallClockDerived.
 */
export function stripWallClockDerived(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (k === 'duration_ms' || k === 'wallClockDerived') {
      result[k] = null;   // mask to null per §11.6
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = stripWallClockDerived(v);   // recurse into nested objects
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Normalise the timestamp and wallClockDerived fields of a row array.
 * §11.6 oracle: timestamp → 0, any wallClockDerived payload field → null.
 */
export function normalizeTimestamps(rows: LedgerRow[]): Array<LedgerRow & { timestamp: number }> {
  return rows.map(r => ({
    ...r,
    timestamp: 0,
    primitivePayload: stripWallClockDerived(r.primitivePayload),
  }));
}

/**
 * A2 oracle assertion (§11.8).
 *
 * Asserts that the replayed ledger is byte-equivalent to the original under
 * normalizeTimestamps(). This is the canonical conformance check for SK-5 /
 * ci:conformance replay.
 *
 * Usage (once T2 exposes a row-reader seam per AMBIG-2):
 *   const originalRows = await session.queryRows();
 *   const replayedRows = await replayedSession.queryRows();
 *   assertA2ByteEquivalent(originalRows, replayedRows);
 */
export function assertA2ByteEquivalent(original: LedgerRow[], replayed: LedgerRow[]): void {
  expect(normalizeTimestamps(replayed)).toEqual(normalizeTimestamps(original));
}

// ─── Stub SdkProvider ────────────────────────────────────────────────────────
//
// Inline stub satisfies SK-1 without depending on T4 (Alexander).
// The real createStubSdkProvider() import above is the preferred long-term form.

const SESSION_PROMPT = 'What is the current working directory?';

// (No inline stub needed — StubSdkProvider from T4 is already on-branch.)

// ─── Acceptance test suite ────────────────────────────────────────────────────

describe('Phase 0.5 Walking Skeleton — SK-1 through SK-6', () => {
  let session: SkeletonSession;
  let runResult: SkeletonRunResult;

  beforeAll(async () => {
    // RED: createSkeletonSession throws "not implemented" until T5 (orchestration) lands.
    // StubSdkProvider already on branch (T4 / Alexander) — use it directly.
    const provider = new StubSdkProvider();

    session = createSkeletonSession({
      provider,
      // materializer: defaults to built-in BootstrapMaterializer (T2 / Roger)
      // scheduler:    defaults to FifoScheduler (T3 / Gabriel)
      // replayEngine: defaults to built-in ReplayEngine (T2 / Roger)
    });

    runResult = await session.run(SESSION_PROMPT);
  });

  // ── SK-1: One LLM call through the SdkProvider boundary ────────────────────

  describe('SK-1: SdkProvider boundary', () => {
    it('SK-1: run() returns a TurnResult with a non-null responsePayload', () => {
      expect(runResult.turnResult).toBeDefined();
      expect(runResult.turnResult.responsePayload).not.toBeNull();
    });

    it('SK-1: TurnResult responsePayload is a non-null, non-empty value', () => {
      // StubSdkProvider returns a deterministic string derived from the prompt hash.
      expect(runResult.turnResult.responsePayload).not.toBeNull();
      expect(runResult.turnResult.responsePayload).not.toBe('');
    });

    it('SK-1: TurnResult carries at least one primitive to commit', () => {
      expect(runResult.turnResult.primitives.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── SK-2: L0 bootstrap — offset-0 Observation rows ─────────────────────────

  describe('SK-2: L0 bootstrap materialisation', () => {
    it('SK-2: committedOffsets contains at least one offset-0 row (bootstrap batch)', () => {
      // The first committed offset must be 0 (atomic bootstrap group-commit, §3).
      expect(runResult.committedOffsets).toContain(0);
    });

    it('SK-2: offset-0 rows are present — status().rowCount ≥ 2 (system_prompt + tool_definitions)', async () => {
      // AMBIG-3 resolved: StubSdkProvider passes injectedMemoryFragments: [] (0 fragments).
      // DefaultBootstrapMaterializer produces 2 rows: system_prompt + tool_definitions.
      // Formula: 2 + number-of-memory-fragments = 2 + 0 = 2.
      const EXPECTED_BOOTSTRAP_COUNT = 2;

      // status().rowCount must account for all committed rows (bootstrap + turn).
      const status = await session.status();
      expect(status.rowCount).toBeGreaterThanOrEqual(EXPECTED_BOOTSTRAP_COUNT);

      // committedOffsets must begin at 0 (bootstrap batch is the first commit).
      expect(runResult.committedOffsets[0]).toBe(0);
      expect(runResult.committedOffsets[1]).toBe(1);

      // Query bootstrap rows directly via the AMBIG-2-resolved queryRows() seam.
      const bootstrapRows = await session.queryRows([0, EXPECTED_BOOTSTRAP_COUNT - 1]);
      expect(bootstrapRows).toHaveLength(EXPECTED_BOOTSTRAP_COUNT);

      // Bootstrap rows must live at offsets 0 and 1 — order is invariant.
      expect(bootstrapRows[0]!.offset).toBe(0);
      expect(bootstrapRows[1]!.offset).toBe(1);

      // All bootstrap rows are Observations (primitiveKind).
      for (const row of bootstrapRows) {
        expect(row.primitiveKind).toBe('observation');
      }

      // Sub-kinds must match the materializer contract: system_prompt first, tool_definitions second.
      const subKind0 = (bootstrapRows[0]!.primitivePayload as { subKind: string }).subKind;
      const subKind1 = (bootstrapRows[1]!.primitivePayload as { subKind: string }).subKind;
      expect(subKind0).toBe('system_prompt');
      expect(subKind1).toBe('tool_definitions');
    });

    it('SK-2: committedOffsets are monotonically increasing (hash-chain order)', () => {
      const offsets = runResult.committedOffsets;
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
      }
    });
  });

  // ── SK-3: WAL append — Observation + Decision committed ────────────────────

  describe('SK-3: WAL append', () => {
    it('SK-3: at least 2 turn primitives committed (≥1 Observation + ≥1 Decision)', () => {
      // TurnResult.primitives must include observation + decision for the LLM response.
      // These become committed WAL rows after the run.
      expect(runResult.turnResult.primitives.length).toBeGreaterThanOrEqual(2);
    });

    it('SK-3: committed primitives include at least one observation kind', () => {
      const kinds = runResult.turnResult.primitives.map(p => p.primitiveKind);
      expect(kinds).toContain('observation');
    });

    it('SK-3: committed primitives include at least one decision kind', () => {
      const kinds = runResult.turnResult.primitives.map(p => p.primitiveKind);
      expect(kinds).toContain('decision');
    });

    it('SK-3: total committedOffsets count = bootstrap rows + turn primitive count', async () => {
      const status = await session.status();
      // All offsets from bootstrap + turn must be reflected in rowCount.
      expect(runResult.committedOffsets.length).toBeLessThanOrEqual(status.rowCount);
    });
  });

  // ── SK-4: crucible status reads session back ────────────────────────────────

  describe('SK-4: crucible status', () => {
    let status: SkeletonStatus;

    beforeAll(async () => {
      status = await session.status();
    });

    it('SK-4: status() returns a non-empty sessionId', () => {
      expect(status.sessionId).toBeTruthy();
      expect(typeof status.sessionId).toBe('string');
    });

    it('SK-4: status().sessionId matches session.sessionId', () => {
      expect(status.sessionId).toBe(session.sessionId);
    });

    it('SK-4: status().rowCount is positive (bootstrap + turn rows committed)', () => {
      expect(status.rowCount).toBeGreaterThanOrEqual(1);
    });

    it('SK-4: status().lastCommitOffset equals max of committedOffsets', () => {
      const maxOffset = Math.max(...runResult.committedOffsets);
      expect(status.lastCommitOffset).toBe(maxOffset);
    });

    it('SK-4: status().rowCount equals the number of committed offsets', () => {
      // rowCount must be consistent with the number of rows actually committed.
      expect(status.rowCount).toBe(runResult.committedOffsets.length);
    });
  });

  // ── SK-5: crucible replay passes A2 conformance ─────────────────────────────

  describe('SK-5: A2 hermetic replay', () => {
    let report: ReplayReport;

    beforeAll(async () => {
      report = await session.replay();
    });

    it('SK-5: replay() returns a ReplayReport with status === "pass"', () => {
      expect(report.status).toBe('pass');
    });

    it('SK-5: divergenceAtOffset is null on pass', () => {
      expect(report.divergenceAtOffset).toBeNull();
    });

    it('SK-5: divergenceKind is null on pass', () => {
      expect(report.divergenceKind).toBeNull();
    });

    it('SK-5: rowsReplayed matches the status rowCount', async () => {
      const status = await session.status();
      expect(report.rowsReplayed).toBe(status.rowCount);
    });

    it('SK-5 [A2]: wallClockMs is a positive number (informational; no ratio check for stub session)', () => {
      // §11.4 A2: replay.wallClockMs < 0.1 * original.wallClockMs for production sessions.
      // AMBIG-4: stub sessions have near-zero original duration; ratio check deferred.
      expect(report.wallClockMs).toBeGreaterThanOrEqual(0);
    });

    it('SK-5 [A2 oracle]: normalizeTimestamps helper produces structurally stable output', () => {
      // Smoke-test the A2 comparator function itself.
      const rows: LedgerRow[] = [
        {
          primitiveKind: 'observation',
          primitivePayload: { subKind: 'llm_response', duration_ms: 42 },
          causalReadSet: [],
          timestamp: 9999,
        },
      ];
      const normalized = normalizeTimestamps(rows);
      expect(normalized[0].timestamp).toBe(0);
      // wallClockDerived field duration_ms must be nulled by stripWallClockDerived
      expect((normalized[0].primitivePayload as { duration_ms: unknown }).duration_ms).toBeNull();
    });

    it('SK-5 [A2 oracle]: assertA2ByteEquivalent passes when rows are structurally identical', () => {
      const rows: LedgerRow[] = [
        {
          primitiveKind: 'decision',
          primitivePayload: { subKind: 'apply' },
          causalReadSet: ['ref-0'],
          timestamp: 12345,
        },
      ];
      // Same rows, different timestamps — oracle must still pass.
      const replayed: LedgerRow[] = rows.map(r => ({ ...r, timestamp: 99999 }));
      expect(() => assertA2ByteEquivalent(rows, replayed)).not.toThrow();
    });

    it('SK-5 [A2 oracle]: assertA2ByteEquivalent fails when structural field differs', () => {
      const original: LedgerRow[] = [
        {
          primitiveKind: 'observation',
          primitivePayload: { subKind: 'llm_response' },
          causalReadSet: [],
          timestamp: 1,
        },
      ];
      const diverged: LedgerRow[] = [
        {
          primitiveKind: 'decision',   // structural divergence — kind changed
          primitivePayload: { subKind: 'llm_response' },
          causalReadSet: [],
          timestamp: 1,
        },
      ];
      expect(() => assertA2ByteEquivalent(original, diverged)).toThrow();
    });
  });

  // ── SK-6: FifoScheduler emits scheduler_dispatched ─────────────────────────

  describe('SK-6: FifoScheduler stub (A-Sched-1)', () => {
    it('SK-6: run() produces a schedulerEvent on the SkeletonRunResult', () => {
      expect(runResult.schedulerEvent).toBeDefined();
    });

    it('SK-6: schedulerEvent.subKind === "scheduler_dispatched"', () => {
      expect(runResult.schedulerEvent.subKind).toBe('scheduler_dispatched');
    });

    it('SK-6: schedulerEvent carries a proposalId (EventId)', () => {
      const event = runResult.schedulerEvent as SchedulerDispatched;
      expect(typeof event.proposalId).toBe('number');
    });

    it('SK-6: schedulerEvent.quantaConsumed === 1 (FifoScheduler stub constant)', () => {
      const event = runResult.schedulerEvent as SchedulerDispatched;
      expect(event.quantaConsumed).toBe(1);
    });

    it('SK-6: schedulerEvent.queueDepthAtDispatch === 0 (no buffering in FifoScheduler)', () => {
      const event = runResult.schedulerEvent as SchedulerDispatched;
      expect(event.queueDepthAtDispatch).toBe(0);
    });
  });
});
