/**
 * Skeleton sub-barrel — import surface for T2/T3/T4/T5/T6 agents.
 *
 * All skeleton interfaces and implementations are re-exported here.
 * Agents import from '@akubly/crucible-core/skeleton' (or relative
 * '../skeleton/index.js') rather than touching the root index.ts barrel.
 */

// ─── Type-only exports (interfaces + type aliases) ───────────────────────────
export type {
  // Common types
  SessionId,
  EventId,
  TrustTier,

  // §12 SdkProvider
  SdkProvider,
  BootstrapOptions,
  BootstrapPayload,
  ToolDefinition,
  MemoryFragment,
  MemoryManifestEntry,
  TurnResult,

  // §5.A Scheduler
  SchedulerPort,
  Proposal,
  SchedulerEvent,
  SchedulerDispatched,

  // §11 Replay
  ReplayEngine,
  ReplayOptions,
  ReplayReport,
  ReplayDivergenceKind,

  // §3+§2 Bootstrap materializer
  BootstrapMaterializer,

  // Skeleton orchestrator
  SkeletonSession,
  SkeletonRunResult,
  SkeletonStatus,
} from './types.js';

// ─── Implementation exports (factories + classes) ────────────────────────────

// T4 (Alexander): Stub SDK Provider
export { StubSdkProvider } from './sdk-provider-stub.js';

// T2 (Roger): Bootstrap materializer
export { createBootstrapMaterializer } from './bootstrap.js';

// T2 (Roger): Replay engine
export { createReplayEngine } from './replay-engine.js';

// T3 (Gabriel): FifoScheduler
export { FifoScheduler } from './fifo-scheduler.js';

// T-ASSEMBLY (Graham): Skeleton session factory
export { createSkeletonSession } from './assembly.js';
export type { SkeletonSessionOptions } from './assembly.js';
