/**
 * Skeleton sub-barrel — import surface for T2/T3/T4/T5/T6 agents.
 *
 * All skeleton interfaces are re-exported here. Agents import from
 * '@akubly/crucible-core/skeleton' (or relative '../skeleton/index.js')
 * rather than touching the root index.ts barrel during parallel work.
 */
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
