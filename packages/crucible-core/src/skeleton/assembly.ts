/**
 * Skeleton assembly — Phase 0.5 orchestrator (T-ASSEMBLY).
 *
 * Wires StubSdkProvider, DefaultBootstrapMaterializer, FifoScheduler, and
 * DefaultReplayEngine into a working SkeletonSession that satisfies SK-1
 * through SK-6.
 *
 * Factory signature (AMBIG-1 resolved):
 *   createSkeletonSession({ provider, materializer?, scheduler?, replayEngine? })
 *
 * Bootstrap row count (AMBIG-3 pinned):
 *   With StubSdkProvider (0 memory fragments) + DefaultBootstrapMaterializer:
 *   2 rows (system_prompt + tool_definitions). Add 1 per injected memory fragment.
 *
 * GAP-1 (bootstrap flag bit): Deferred — PrimitiveInput has no bootstrap flag;
 *   the WAL codec flags.ts bootstrap bit is set at the WalBackend layer when
 *   offset === 0. For the skeleton this is fine: bootstrap rows ARE the first
 *   rows committed (offset 0..N-1). Phase 1 may formalize a flag on PrimitiveInput.
 *
 * GAP-2 (non-atomic sequential bootstrap): Deferred — commitRow is called once
 *   per bootstrap row (sequential, not atomic batch). This does NOT break SK-2
 *   or SK-5 because: (a) SK-2 only asserts rows are present at offset 0+, which
 *   they are; (b) SK-5 replay re-materializes each row independently and checks
 *   BLAKE3 hash equality, which is per-row not per-batch. A crash mid-bootstrap
 *   would leave a partial session, but crash-durability is a Phase 1 hardening
 *   concern (§3.8 atomic group-commit for bootstrap). Skeleton scope: no crash
 *   between bootstrap rows in test.
 *
 * @see docs/crucible-technical-design-plan.md §Phase 0.5
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { Primitive } from '../types.js';
import type {
  SdkProvider,
  BootstrapMaterializer,
  SchedulerPort,
  ReplayEngine,
  SkeletonSession,
  SkeletonRunResult,
  SkeletonStatus,
  ReplayReport,
  Proposal,
  SessionId,
} from './types.js';

import { createBootstrapMaterializer } from './bootstrap.js';
import { FifoScheduler } from './fifo-scheduler.js';
import { createReplayEngine } from './replay-engine.js';
import { createLedger, type BootstrappableLedger } from '../ledger/ledger-impl.js';
import { createFileSystemWalBackend } from '../ledger/wal-backend-fs.js';

// ─── Factory options (AMBIG-1 resolved) ──────────────────────────────────────

/**
 * Options for createSkeletonSession().
 *
 * Only `provider` is required. All other dependencies default to the skeleton
 * implementations (T2/T3 outputs). Override in tests to inject mocks.
 */
export interface SkeletonSessionOptions {
  provider: SdkProvider;
  materializer?: BootstrapMaterializer;
  scheduler?: SchedulerPort;
  /** Override replay engine (otherwise one is created from the WAL rootDir). */
  replayEngine?: ReplayEngine;
  /** Override WAL root directory (otherwise uses os.tmpdir()). */
  rootDir?: string;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

class AssembledSkeletonSession implements SkeletonSession {
  readonly sessionId: SessionId;

  private ledger!: BootstrappableLedger;
  private readonly provider: SdkProvider;
  private readonly materializer: BootstrapMaterializer;
  private readonly scheduler: SchedulerPort;
  private replayEngine!: ReplayEngine;
  private readonly rootDir: string;
  private committed: number[] = [];
  /** Single-shot guard — run() may only be called once per session. */
  private hasRun = false;

  constructor(opts: SkeletonSessionOptions) {
    this.sessionId = randomUUID();
    this.provider = opts.provider;
    this.materializer = opts.materializer ?? createBootstrapMaterializer();
    this.scheduler = opts.scheduler ?? new FifoScheduler();
    this.rootDir = opts.rootDir ?? join(tmpdir(), 'crucible-skeleton');
    if (opts.replayEngine) {
      this.replayEngine = opts.replayEngine;
    }
  }

  /**
   * Lazily initialize the file-system-backed ledger and replay engine.
   * Called once before the first write operation.
   */
  private async init(): Promise<void> {
    if (this.ledger) return;
    const walBackend = await createFileSystemWalBackend(
      this.rootDir,
      this.sessionId,
    );
    this.ledger = await createLedger({ walBackend });
    this.replayEngine ??= createReplayEngine(this.rootDir);
  }

  /**
   * Run the full skeleton vertical: bootstrap → LLM turn → WAL commit → scheduler.
   *
   * SK-1: completeTurn proves L0 boundary is live.
   * SK-2: bootstrap materializes offset-0 Observation rows.
   * SK-3: turn primitives committed as Observation + Decision.
   * SK-6: scheduler dispatches the turn's proposal.
   */
  async run(prompt: string): Promise<SkeletonRunResult> {
    if (this.hasRun) {
      throw new Error(
        `[Crucible] SkeletonSession.run() is single-shot — session ${this.sessionId} has already been run.`,
      );
    }
    this.hasRun = true;
    await this.init();

    // SK-2: Bootstrap — materialize BootstrapPayload into offset-0 rows.
    const bootstrapPayload = await this.provider.bootstrap({
      sessionId: this.sessionId,
      systemPrompt: 'You are a helpful assistant.',
      toolDefinitions: [],
      injectedMemoryFragments: [],
    });
    const bootstrapRows = this.materializer.materialize(bootstrapPayload);
    const bootstrapOffsets = await this.ledger.bootstrap(bootstrapRows);
    this.committed.push(...bootstrapOffsets);

    // SK-1: One LLM call through the SdkProvider boundary.
    const turnResult = await this.provider.completeTurn(prompt);

    // SK-3: Commit turn primitives (≥1 Observation + ≥1 Decision).
    for (const prim of turnResult.primitives) {
      const offset = await this.ledger.append(prim);
      this.committed.push(offset);
    }

    // SK-6: Submit the turn's decision row as a proposal to the scheduler.
    // proposalId = offset of the Decision row; payload = the same Decision primitive.
    // Both fields refer to the same primitive so the Proposal is semantically consistent.
    const lastTurnOffset = this.committed[this.committed.length - 1]!;
    const proposal: Proposal = {
      proposalId: lastTurnOffset,
      generatorId: this.provider.id,
      priority: 0,
      payload: turnResult.primitives[turnResult.primitives.length - 1]!,
    };
    const schedulerEvent = this.scheduler.submit(proposal);

    return {
      committedOffsets: [...this.committed],
      schedulerEvent,
      turnResult,
    };
  }

  /** SK-4: Read session status from the WAL. */
  async status(): Promise<SkeletonStatus> {
    await this.init();
    const rowCount = this.committed.length;
    const lastCommitOffset = rowCount > 0
      ? this.committed[rowCount - 1]!
      : -1;
    return {
      sessionId: this.sessionId,
      rowCount,
      lastCommitOffset,
    };
  }

  /** SK-5: Delegate to the ReplayEngine for A2 byte-equivalence. */
  async replay(): Promise<ReplayReport> {
    await this.init();
    return this.replayEngine.replay(this.sessionId);
  }

  /** AMBIG-2 resolved: query committed rows by offset range. */
  async queryRows(range?: [number, number]): Promise<Primitive[]> {
    await this.init();
    if (this.committed.length === 0) return [];
    const effectiveRange: [number, number] = range ?? [0, this.committed.length - 1];
    return this.ledger.queryEvents({ range: effectiveRange });
  }
}

/**
 * Create a SkeletonSession wired to the skeleton implementations.
 *
 * Factory signature (AMBIG-1):
 *   { provider, materializer?, scheduler?, replayEngine?, rootDir? }
 *
 * Defaults:
 *   materializer → DefaultBootstrapMaterializer (T2)
 *   scheduler    → FifoScheduler (T3)
 *   replayEngine → DefaultReplayEngine at rootDir (T2)
 *   rootDir      → os.tmpdir()/crucible-skeleton
 *
 * Pinned bootstrap row count (AMBIG-3):
 *   With 0 memory fragments: 2 (system_prompt + tool_definitions).
 *   With N fragments: 2 + N.
 */
export function createSkeletonSession(opts: SkeletonSessionOptions): SkeletonSession {
  return new AssembledSkeletonSession(opts);
}
