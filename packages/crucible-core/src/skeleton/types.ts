/**
 * Skeleton interfaces — Phase 0.5 walking skeleton contracts.
 *
 * These are the tier-boundary types that T2 (Roger), T3 (Gabriel),
 * T4 (Alexander), and T5 (Valanice) implement. Laura tests against them.
 *
 * Each interface cites its authoritative CTD section. Shapes are minimal:
 * only what the skeleton needs to pass SK-1 through SK-6.
 */

import type { PrimitiveInput, Primitive } from '../types.js';

// ─── Common skeleton types ───────────────────────────────────────────────────

/** Opaque session identifier (string for v1; no UUID constraint yet). */
export type SessionId = string;

/** Opaque event identifier — the committed offset in the ledger. */
export type EventId = number;

/** Trust tier per §6.4. */
export type TrustTier = 'builtin' | 'adopted' | 'community' | 'external';

// ─── §12 SdkProvider ────────────────────────────────────────────────────────

/**
 * ⚠️  SKELETON-INTERNAL CONTRACT — NOT the §12.2 SdkProvider.
 *
 * This interface is a walking-skeleton approximation used ONLY within
 * `packages/crucible-core/src/skeleton/`. It exposes `completeTurn(prompt)`
 * in place of the full §12.2 contract (`eventStream` / `submitOutboundPrompt`
 * / `signal` / `capabilities`), which requires types from a not-yet-built
 * `@akubly/crucible-boundary` package.
 *
 * Phase 1 introduces the AUTHORITATIVE `SdkProvider` from §12.2 in
 * `@akubly/crucible-boundary`. At that point this skeleton interface is
 * retired alongside the rest of `skeleton/`. Code outside `skeleton/` MUST
 * NOT depend on this interface.
 *
 * Decision: graham-skeleton-provider-scope.md (opted for scope-isolation over
 * early §12.2 alignment to avoid pulling in Phase 1 boundary types prematurely).
 *
 * @see docs/crucible-technical-design/12-copilot-sdk-integration.md §12.2
 * @see .squad/decisions/inbox/graham-skeleton-provider-scope.md
 */
export interface SdkProvider {
  /** Stable provider identity (e.g. 'copilot-sdk@1'). */
  readonly id: string;

  /** Resolved SDK version string, pinned for session lifetime. */
  readonly sdkVersion: string;

  /**
   * Open an SDK session and return the BootstrapPayload (R2-2 LOCK).
   * L1 materializes this into offset-0 Observation rows.
   */
  bootstrap(opts: BootstrapOptions): Promise<BootstrapPayload>;

  /**
   * Execute a single user-prompt → model-response round-trip (SK-1).
   *
   * Skeleton contract: accepts a prompt string, returns a model response.
   * The full §12 eventStream/submitOutboundPrompt cycle is deferred to
   * Phase 1; this simplified method proves the L0 boundary is live.
   */
  completeTurn(prompt: string): Promise<TurnResult>;

  /** Release SDK resources; idempotent. */
  shutdown(reason: string): Promise<void>;
}

/** Options for SdkProvider.bootstrap() per §12.2 BootstrapOptions. */
export interface BootstrapOptions {
  sessionId: SessionId;
  systemPrompt: string;
  toolDefinitions: ToolDefinition[];
  injectedMemoryFragments?: MemoryFragment[];
}

/**
 * BootstrapPayload (§2.2, R2-2 LOCK).
 *
 * Carries the extra-ledger context that L1 materializes as offset-0
 * Observation rows in the WAL. The skeleton uses a minimal shape:
 * literalContext fields that produce the bootstrap row batch.
 *
 * @see docs/crucible-technical-design/02-l0-l1-boundary-contract.md §2.2
 */
export interface BootstrapPayload {
  sessionId: SessionId;
  sdkVersion: string;
  schemaVersion: number;

  literalContext: {
    systemPrompt: string;
    toolDefinitions: ToolDefinition[];
    injectedMemoryFragments: MemoryFragment[];
  };

  /**
   * Memory manifest entries — captured as SessionMetadata side-table.
   * Optional for the skeleton (empty array is valid).
   */
  memoryManifest: MemoryManifestEntry[];
}

/** A tool definition crossing the L0/L1 boundary (§2.2). */
export interface ToolDefinition {
  name: string;
  description: string;
  parametersSchema: unknown;
  trustTier: TrustTier;
}

/** A memory fragment literally injected at bootstrap (§2.2). */
export interface MemoryFragment {
  sourceManifestId: string;
  content: unknown;
}

/** A memory manifest entry (§2.2 memoryManifest). */
export interface MemoryManifestEntry {
  id: string;
  kind: 'episodic' | 'semantic' | 'procedural' | string;
  versionHash: string;
  accessSurface: string;
}

/** Result of a single LLM turn (SK-1 simplified contract). */
export interface TurnResult {
  /** The model's response text/content. */
  responsePayload: unknown;
  /** Primitives to commit: at minimum one Observation + one Decision. */
  primitives: PrimitiveInput[];
}

// ─── §5.A SchedulerPort (L3.5 tier boundary) ────────────────────────────────

/**
 * Scheduler port — the L3.5 tier boundary (§5.A).
 *
 * The FifoScheduler stub (Phase 0.5) emits `scheduler_dispatched` immediately
 * for every arriving proposal, satisfying A-Sched-1 replay-ordering. No quanta
 * budgeting, no back-pressure.
 *
 * @see docs/crucible-technical-design/05-router-design.md §5.A
 */
export interface SchedulerPort {
  /**
   * Submit a proposal from an L3 generator. The scheduler decides dispatch
   * order and emits SchedulerEvents. FifoScheduler dispatches immediately.
   */
  submit(proposal: Proposal): SchedulerEvent;

  /**
   * Drain all pending proposals (for replay verification).
   * FifoScheduler always returns empty (no buffering).
   */
  pending(): readonly Proposal[];
}

/**
 * A generator proposal entering the Scheduler queue (§5.A.1, §7.1).
 *
 * Minimal shape for the skeleton — full PrescriptionResult fields
 * (nonDominatedReason, fitness axes, etc.) are Phase 1.
 */
export interface Proposal {
  /** Unique proposal identifier (EventId of the generating row). */
  proposalId: EventId;
  /** Generator that emitted this proposal. */
  generatorId: string;
  /** Priority hint from the generator (higher = more urgent). */
  priority: number;
  /** The primitive the generator proposes to commit. */
  payload: PrimitiveInput;
}

/**
 * Scheduler decision event (§5.A.2 `scheduler_*` Decision sub-kinds).
 *
 * For the skeleton, only `scheduler_dispatched` is used. The full set
 * (deferred, cancelled, quanta_exhausted) is Phase 1.
 */
export type SchedulerEvent = SchedulerDispatched;

/** Emitted when a proposal is dispatched to the Router (§5.A.2). */
export interface SchedulerDispatched {
  subKind: 'scheduler_dispatched';
  proposalId: EventId;
  generatorId: string;
  priority: number;
  /** Quanta consumed by this dispatch (FifoScheduler: always 1). */
  quantaConsumed: number;
  /** Queue depth at dispatch time (FifoScheduler: always 0). */
  queueDepthAtDispatch: number;
}

// ─── §11 ReplayEngine port ──────────────────────────────────────────────────

/**
 * Replay engine port — hermetic replay (§11.4 ReplayDriver).
 *
 * The skeleton must pass SK-5: byte-equivalent replay from a captured session.
 * The ReplayEngine reads a source ledger and re-feeds captured outputs through
 * the bootstrap + append path, then asserts equivalence via the oracle.
 *
 * @see docs/crucible-technical-design/11-hermetic-replay.md §11.4
 */
export interface ReplayEngine {
  /**
   * Replay a captured session and return the equivalence report.
   *
   * @param sessionId — Session to replay from WAL.
   * @param opts.strict — When true, any divergence is a hard failure (default: true).
   */
  replay(sessionId: SessionId, opts?: ReplayOptions): Promise<ReplayReport>;
}

export interface ReplayOptions {
  /** Strict mode (default true): any structural divergence fails the replay. */
  strict?: boolean;
}

/**
 * Replay report (§11.4 ReplayReport).
 *
 * SK-5 asserts: status === 'pass' AND rowsReplayed === source row count.
 */
export interface ReplayReport {
  status: 'pass' | 'fail';
  /** Offset of first structural divergence, or null on pass. */
  divergenceAtOffset: number | null;
  /** Divergence classification, or null on pass. */
  divergenceKind: ReplayDivergenceKind | null;
  /** Total rows successfully replayed. */
  rowsReplayed: number;
  /** Wall-clock replay duration in milliseconds (informational). */
  wallClockMs: number;
}

/** Divergence kinds per §11.4 + §5.A.6 extension. */
export type ReplayDivergenceKind =
  | 'oracle'
  | 'bootstrap'
  | 'commitment'
  | 'plugin'
  | 'cas-miss'
  | 'scheduler_dispatch';

// ─── Bootstrap materializer contract (§3 + §2.2) ───────────────────────────

/**
 * Bootstrap materializer — converts BootstrapPayload into offset-0 WAL rows.
 *
 * This is the contract Roger implements in T2. L1 calls this to turn the
 * BootstrapPayload from SdkProvider into the atomic offset-0 Observation batch
 * that satisfies SK-2.
 *
 * @see docs/crucible-technical-design/02-l0-l1-boundary-contract.md §2.2
 * @see docs/crucible-technical-design/03-l1-wal-substrate.md (bootstrap-batch)
 */
export interface BootstrapMaterializer {
  /**
   * Materialize the bootstrap payload as offset-0 Observation rows.
   * Returns the primitives to be committed as a single atomic group-commit batch.
   *
   * Sub-kinds produced (per §11.2 capture-scope table):
   *   - system_prompt (1 row)
   *   - tool_definitions (1 row)
   *   - injected_memory (1 row per fragment)
   */
  materialize(payload: BootstrapPayload): PrimitiveInput[];
}

// ─── Skeleton orchestrator contract ─────────────────────────────────────────

/**
 * Skeleton session — the assembled vertical (SK-1 through SK-6).
 *
 * This is the integration surface that the acceptance test exercises.
 * Graham assembles this from the individual implementations.
 */
export interface SkeletonSession {
  readonly sessionId: SessionId;

  /** Run bootstrap (SK-2) + one LLM turn (SK-1, SK-3) through the full stack. */
  run(prompt: string): Promise<SkeletonRunResult>;

  /** Query committed rows for status reporting (SK-4). */
  status(): Promise<SkeletonStatus>;

  /** Replay the session and assert byte-equivalence (SK-5). */
  replay(): Promise<ReplayReport>;

  /**
   * Query committed rows by offset range (AMBIG-2 resolved).
   *
   * Allows per-row kind assertions for SK-2 (bootstrap rows are observations)
   * and SK-3 (turn rows include observation + decision).
   *
   * @param range — Inclusive [start, end] offset pair. Defaults to all rows.
   */
  queryRows(range?: [number, number]): Promise<Primitive[]>;
}

export interface SkeletonRunResult {
  /** Offsets of all committed rows (bootstrap + turn). */
  committedOffsets: number[];
  /** The scheduler event emitted for the turn's proposal (SK-6). */
  schedulerEvent: SchedulerEvent;
  /** The model response from the SdkProvider (SK-1). */
  turnResult: TurnResult;
}

/** Status report shape for `crucible status` (SK-4, §13). */
export interface SkeletonStatus {
  sessionId: SessionId;
  rowCount: number;
  lastCommitOffset: number;
}
