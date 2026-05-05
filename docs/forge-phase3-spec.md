# Forge Phase 3 Architecture Specification

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-04-30  
**Status:** Proposal — awaiting team review  
**Phase boundary rule:** "If it needs `CopilotClient()`, it's Phase 3."

---

## 1. Module Design: `packages/forge/src/runtime/`

Phase 3 introduces two new classes that compose all Phase 2 modules (bridge, hooks, decisions) with the live `@github/copilot-sdk`.

### 1.1 ForgeClient — Thin CopilotClient Wrapper

`ForgeClient` manages the SDK client lifecycle and exposes session management operations. It does NOT embed business logic — it is a construction site for `ForgeSession` instances.

```typescript
// runtime/client.ts

import { CopilotClient, type CopilotClientOptions } from "@github/copilot-sdk";
import type { TelemetrySink } from "@akubly/types";
import { ForgeSession, type ForgeSessionConfig } from "./session.js";

export interface ForgeClientOptions {
  /** Passed through to CopilotClient. */
  clientOptions?: Partial<CopilotClientOptions>;
  /** Default telemetry sink for all sessions. Override per-session. */
  defaultSink?: TelemetrySink;
}

export class ForgeClient {
  private readonly sdk: CopilotClient;
  private readonly defaultSink?: TelemetrySink;
  private started = false;

  constructor(options?: ForgeClientOptions) {
    this.sdk = new CopilotClient(options?.clientOptions);
    this.defaultSink = options?.defaultSink;
  }

  /** Create a new ForgeSession with auto-wired bridge, hooks, and decisions. */
  async createSession(config: ForgeSessionConfig): Promise<ForgeSession>;

  /** Resume a prior session by its SDK session ID. */
  async resumeSession(
    sessionId: string,
    config: Omit<ForgeSessionConfig, "model">,
  ): Promise<ForgeSession>;

  /** List available sessions from the SDK. */
  async listSessions(): Promise<Array<{ id: string; [key: string]: unknown }>>;

  /** List available models from the SDK. */
  async listModels(): Promise<import("../session/index.js").ModelSnapshot[]>;

  /** Auth and CLI status passthrough. */
  async getAuthStatus(): Promise<unknown>;
  async getStatus(): Promise<unknown>;

  /** Shut down the SDK client. Flushes all sinks. */
  async stop(): Promise<void>;
}
```

**Design decisions:**

- `ForgeClient` owns `CopilotClient` 1:1. No shared client — prevents cross-session lifecycle confusion.
- `listModels()` returns `ModelSnapshot[]` (our type from `session/`), not raw `ModelInfo[]`. The SDK type stays behind the boundary.
- `stop()` calls `this.defaultSink?.flush()` then `this.defaultSink?.close()` before `this.sdk.stop()`.

### 1.2 ForgeSession — Session Abstraction

`ForgeSession` is the workhorse. It auto-wires the Phase 2 modules to a live `CopilotSession`:

```typescript
// runtime/session.ts

import type { CopilotSession, SessionConfig } from "@github/copilot-sdk";
import type { CairnBridgeEvent, TelemetrySink, SessionIdentity } from "@akubly/types";
import { HookComposer, type HookObserver } from "../hooks/index.js";
import { attachBridge, type EventSource } from "../bridge/index.js";
import type { ModelSnapshot, ModelChangeRecord, ReasoningEffort } from "../session/index.js";

export interface ForgeSessionConfig {
  /** Initial model ID. */
  model: string;
  /** Working directory for tool operations. */
  workingDirectory?: string;
  /** Permission handler — required by SDK. */
  onPermissionRequest: SessionConfig["onPermissionRequest"];
  /** Optional reasoning effort level for the initial model. */
  reasoningEffort?: ReasoningEffort;
  /** Hook observers to register at session creation. Additional may be added later. */
  observers?: HookObserver[];
  /** Telemetry sink (overrides ForgeClient default). */
  sink?: TelemetrySink;
  /** Client name for SDK identification. */
  clientName?: string;
}

export class ForgeSession {
  readonly sessionId: string;
  readonly identity: SessionIdentity;

  private readonly sdkSession: CopilotSession;
  private readonly composer: HookComposer;
  private readonly unsubBridge: () => void;
  private readonly sink?: TelemetrySink;
  private disposed = false;

  /** The current model snapshot (updated on model_change events). */
  get currentModel(): ModelSnapshot | undefined;

  /** Accumulated model change history for this session. */
  get modelChanges(): readonly ModelChangeRecord[];

  // --- Observer management (delegates to HookComposer) ---

  /** Add a hook observer. Returns dispose function. */
  addObserver(observer: HookObserver): () => void;

  /** Remove a hook observer. */
  removeObserver(observer: HookObserver): void;

  /** Number of active observers. */
  get observerCount(): number;

  // --- Session operations ---

  /** Send a prompt and wait for idle. Delegates to SDK. */
  async sendAndWait(
    prompt: string,
    timeoutMs?: number,
  ): Promise<{ content: string } | null>;

  /** Switch model mid-session. */
  async setModel(modelId: string, options?: { reasoningEffort?: ReasoningEffort }): Promise<void>;

  /** Subscribe to specific SDK event types (passthrough). */
  on(handler: (event: import("@github/copilot-sdk").SessionEvent) => void): () => void;
  on<T extends import("@github/copilot-sdk").SessionEventType>(
    eventType: T,
    handler: (event: import("@github/copilot-sdk").SessionEvent) => void,
  ): () => void;

  /** Disconnect and clean up. Flushes sink, unsubscribes bridge. */
  async disconnect(): Promise<void>;
}
```

### 1.3 Event Subscription Model — How Bridge Connects to Live `session.on()`

The pattern is directly from the spike's proven approach:

```
ForgeSession constructor:
  1. Create HookComposer, pre-populate with config.observers
  2. Call composer.compose() → SessionHooks
  3. Pass SessionHooks to SessionConfig.hooks at createSession() time
  4. Call attachBridge(sdkSession, sessionId, sink.emit) → unsubscribe fn
  5. Register internal model_change listener for ModelChangeRecord tracking
```

The `attachBridge` function (already built in Phase 2) accepts any `EventSource` interface — `CopilotSession` satisfies this naturally since it has `on(handler)`. The bridge translates every mapped SDK event to `CairnBridgeEvent` and forwards to the sink. Unmapped events (~64 noise types) are silently dropped per the established EVENT_MAP.

**One `onEvent` callback pattern** (from spike): The `SessionConfig.onEvent` callback is set to `bridgeEvent() → sink.emit()` to catch events during session creation (before `session.on()` is wired). After creation, `attachBridge` takes over. No double-emit because `onEvent` fires only during `createSession()` setup, before the session object exists.

### 1.4 Error Handling Strategy

| Layer | Strategy | Rationale |
|-------|----------|-----------|
| `ForgeClient.createSession()` | Let SDK errors propagate | Caller must handle "CLI not running" |
| `ForgeClient.stop()` | Catch + log sink flush errors, always call `sdk.stop()` | Cleanup must complete |
| Bridge sink | Catch + `console.warn` (already implemented in `attachBridge`) | Fail-open: observation must not kill execution |
| Hook observers | Catch + `console.warn` per observer (already implemented in HookComposer) | Isolation: buggy telemetry must not kill gates |
| `ForgeSession.disconnect()` | Sequential cleanup: unsubBridge → sink.flush → sink.close → sdkSession.disconnect | Each step catches independently |
| `ForgeSession.setModel()` | Let SDK errors propagate | Caller should handle "model unavailable" |

**Consistent with existing codebase pattern:** fail-open for observability, fail-loud for control-plane operations.

### 1.5 Session Resume and Listing

```typescript
// ForgeClient.resumeSession():
//   1. Call sdk.resumeSession({ sessionId, onPermissionRequest, hooks: composer.compose() })
//   2. Wrap result in ForgeSession with bridge + observers
//   3. Return ForgeSession

// ForgeClient.listSessions():
//   Delegates to sdk.listSessions(), returns raw array
//   No ForgeSession wrapping — listing is metadata-only
```

Resume re-attaches the full bridge + hook pipeline to an existing session. This is critical for crash recovery (session orphan detection from sessionStart.ts).

---

## 2. Module Design: `packages/forge/src/models/`

### 2.1 Model Catalog — Listing and Comparison

```typescript
// models/catalog.ts

import type { ModelSnapshot } from "../session/index.js";

export interface ModelCatalog {
  /** All available models, cached from last listModels() call. */
  readonly models: readonly ModelSnapshot[];

  /** Refresh the catalog from the SDK. */
  refresh(): Promise<void>;

  /** Find a model by ID. Returns undefined if not in catalog. */
  get(modelId: string): ModelSnapshot | undefined;

  /** Filter models by capability. */
  filter(predicate: (m: ModelSnapshot) => boolean): ModelSnapshot[];

  /** Compare two models side-by-side. */
  compare(a: string, b: string): ModelComparison | null;
}

export interface ModelComparison {
  modelA: ModelSnapshot;
  modelB: ModelSnapshot;
  contextWindowDelta: number;
  billingDelta: number;
  capabilityDiff: {
    vision: [boolean, boolean];
    reasoning: [boolean, boolean];
  };
}

export function createModelCatalog(
  listFn: () => Promise<ModelSnapshot[]>,
): ModelCatalog;
```

**Design:** The catalog takes a `listFn` injection rather than holding a `ForgeClient` reference. This keeps it testable without an SDK instance and respects the existing pattern of dependency injection over hard coupling.

### 2.2 Mid-Session Model Switching with ModelChangeRecord

Already defined in `session/index.ts` (Phase 2):

```typescript
interface ModelChangeRecord {
  timestamp: string;
  previousModel?: string;
  newModel: string;
  previousReasoningEffort?: ReasoningEffort;
  newReasoningEffort?: ReasoningEffort;
}
```

Phase 3 adds the live tracking mechanism inside `ForgeSession`:

```typescript
// Inside ForgeSession constructor:
this.sdkSession.on("session.model_change", (event) => {
  const data = event.data as {
    previousModel?: string;
    newModel: string;
    previousReasoningEffort?: string;
    reasoningEffort?: string;
  };
  this._modelChanges.push({
    timestamp: event.timestamp,
    previousModel: data.previousModel,
    newModel: data.newModel,
    previousReasoningEffort: data.previousReasoningEffort as ReasoningEffort | undefined,
    newReasoningEffort: data.reasoningEffort as ReasoningEffort | undefined,
  });
  // Update current model snapshot if catalog available
});
```

This pattern is directly promoted from `model-selection-poc.ts` lines 128–156.

### 2.3 Token Budget Tracker

```typescript
// models/token-tracker.ts

import type { EventSource } from "../bridge/index.js";

export interface ModelUsageAccumulator {
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalNanoAiu: number;
  totalDurationMs: number;
}

export interface TokenBudget {
  readonly sessionId: string;
  /** Per-model accumulated usage. */
  readonly modelUsage: ReadonlyMap<string, ModelUsageAccumulator>;
  /** Context window high-water mark. */
  readonly contextWindow: {
    tokenLimit?: number;
    peakTokens: number;
    lastTokens: number;
  };
}

export interface TokenTracker {
  readonly budget: TokenBudget;
  unsubscribe(): void;
}

/**
 * Create a token tracker that subscribes to assistant.usage and session.usage_info
 * events. Promoted from model-selection-poc.ts createTokenTracker().
 */
export function createTokenTracker(
  source: EventSource,
  sessionId: string,
): TokenTracker;

/** Format a human-readable budget report string. */
export function formatBudgetReport(budget: TokenBudget): string;
```

**Change from spike:** Takes `EventSource` (our interface) instead of `CopilotSession` directly. This means the token tracker works with any event source, including test mocks.

### 2.4 Model Selection Strategy (Future-Ready, Minimal for Phase 3)

```typescript
// models/strategy.ts

import type { ModelSnapshot } from "../session/index.js";

export interface StrategyContext {
  currentBudgetNanoAiu: number;
  budgetLimitNanoAiu: number;
}

export type ModelStrategy = (
  models: ModelSnapshot[],
  context: StrategyContext,
) => ModelSnapshot | null;

/** Built-in strategies promoted from model-selection-poc.ts */
export const MODEL_STRATEGIES: Readonly<Record<string, ModelStrategy>>;
```

Phase 3 ships three strategies from the spike (`cheapest`, `smartest`, `budgetAware`). The `ModelStrategy` function type is the extension point — consumers can register custom strategies without modifying Forge.

---

## 3. Integration Wiring Plan

### 3.1 HookComposer → SessionConfig.hooks

```typescript
// In ForgeSession factory (runtime/session.ts):

const composer = new HookComposer();

// Register observers provided at config time
for (const obs of config.observers ?? []) {
  composer.add(obs);
}

// Compose ONCE → pass to SessionConfig
const sessionConfig: SessionConfig = {
  model: config.model,
  workingDirectory: config.workingDirectory,
  onPermissionRequest: config.onPermissionRequest,
  hooks: composer.compose(),  // <-- HookComposer output
  clientName: config.clientName ?? "forge",
  onEvent: (event) => {
    // Early event handler — catches events during createSession()
    const bridged = bridgeEvent(sessionId, event);
    if (bridged) sink?.emit(bridged);
  },
};

const sdkSession = await sdk.createSession(sessionConfig);
```

**Key property:** The composed hooks hold a **live reference** to the observer Set (per ADR from Phase 2 — "HookComposer Uses Live Observer Set"). This means `addObserver()` / `removeObserver()` after session creation takes effect on the next hook invocation without re-registration. This is critical for decision gates added/removed mid-session.

### 3.2 Bridge → Live `session.on()` Event Stream

```typescript
// In ForgeSession constructor, after SDK session is created:

const unsubBridge = attachBridge(
  sdkSession,     // satisfies EventSource { on(handler): () => void }
  sessionId,
  (event: CairnBridgeEvent) => {
    sink?.emit(event);
  },
);
```

`attachBridge` is already production-ready (Phase 2). It internally calls `source.on()` with a catch-all handler, translates via `bridgeEvent()`, and forwards to the sink with error isolation.

### 3.3 Decision Gates → Live Hook Lifecycle

```typescript
// Usage at session creation:

import { createDecisionGate, createDecisionRecorder } from "../decisions/index.js";

// Active gate — blocks dangerous tools
const gate = createDecisionGate(
  (toolName) => ["create", "edit", "powershell"].includes(toolName),
  (record) => sink?.emit(decisionToBridgeEvent(record)),
);

// Passive recorder — logs all tool calls
const recorder = createDecisionRecorder(
  (record) => sink?.emit(decisionToBridgeEvent(record)),
);

const session = await client.createSession({
  observers: [gate, recorder],
  // ... other config
});

// Mid-session: add/remove gates dynamically
const disposeGate = session.addObserver(newGate);
// Later: disposeGate() removes it
```

The flow is: `SDK triggers hook → HookComposer iterates observers → Decision gate evaluates → returns permissionDecision → SDK acts on it`. No new wiring needed — Phase 2 modules compose directly.

### 3.4 The "One onEvent Callback" Pattern

From the spike (`forge-poc.ts` line 62): `SessionConfig.onEvent` catches events emitted **during** `createSession()` (before `session.on()` can be wired). After session creation, `attachBridge` via `session.on()` is the primary path.

```
Timeline:
  ┌─ createSession() begins ──────────────────────────────┐
  │  onEvent callback fires (events during setup)          │
  │  → bridgeEvent() → sink.emit()                         │
  └─ createSession() returns CopilotSession ──────────────┘
  ┌─ attachBridge(session, ...) ──────────────────────────┐
  │  session.on() catch-all fires (events during runtime)  │
  │  → bridgeEvent() → sink.emit()                         │
  └─ until disconnect() ─────────────────────────────────┘
```

No double-emit: `onEvent` only fires during the `createSession()` window. Once the session object exists, `session.on()` takes over.

---

## 4. Public API Surface

### 4.1 `runtime/index.ts` exports

```typescript
export { ForgeClient, type ForgeClientOptions } from "./client.js";
export { ForgeSession, type ForgeSessionConfig } from "./session.js";
```

### 4.2 `models/index.ts` exports

```typescript
export { createModelCatalog, type ModelCatalog, type ModelComparison } from "./catalog.js";
export {
  createTokenTracker,
  formatBudgetReport,
  type TokenTracker,
  type TokenBudget,
  type ModelUsageAccumulator,
} from "./token-tracker.js";
export {
  MODEL_STRATEGIES,
  type ModelStrategy,
  type StrategyContext,
} from "./strategy.js";
```

### 4.3 Updated `packages/forge/src/index.ts`

Add to existing barrel:

```typescript
// --- Runtime (Phase 3) ---
export { ForgeClient, type ForgeClientOptions } from "./runtime/index.js";
export { ForgeSession, type ForgeSessionConfig } from "./runtime/index.js";

// --- Models (Phase 3) ---
export {
  createModelCatalog,
  createTokenTracker,
  formatBudgetReport,
  MODEL_STRATEGIES,
  type ModelCatalog,
  type ModelComparison,
  type TokenTracker,
  type TokenBudget,
  type ModelUsageAccumulator,
  type ModelStrategy,
  type StrategyContext,
} from "./models/index.js";
```

### 4.4 New types for `packages/types/src/index.ts`

No new shared types needed. Phase 3 types (`ForgeClientOptions`, `ForgeSessionConfig`, `TokenBudget`) are Forge-internal. Cross-package contracts (`CairnBridgeEvent`, `TelemetrySink`, `SessionIdentity`, `DecisionRecord`) already exist.

---

## 5. Work Decomposition

### Alexander (SDK/Runtime Dev) — owns `runtime/`

| ID | Item | Description | Est. |
|----|------|-------------|------|
| A1 | `runtime/client.ts` | ForgeClient: constructor, createSession, stop, listModels, listSessions, getAuthStatus, getStatus. Wraps CopilotClient. | M |
| A2 | `runtime/session.ts` | ForgeSession: constructor wiring (composer + bridge + sink), sendAndWait, setModel, on, disconnect. Model change tracking. | L |
| A3 | `runtime/session.ts` — resume | `ForgeClient.resumeSession()` — re-attach bridge + hooks to existing session. | S |
| A4 | `runtime/index.ts` | Barrel exports. | XS |
| A5 | Integration test: session lifecycle | Create → send → idle → disconnect. Uses mock sink to verify bridge events flow. | M |
| A6 | Integration test: observer lifecycle | Add/remove observers mid-session. Verify live Set behavior. | S |
| A7 | Update `src/index.ts` barrel | Add runtime/ exports. | XS |

### Roger (Platform Dev) — owns `models/`

| ID | Item | Description | Est. |
|----|------|-------------|------|
| R1 | `models/catalog.ts` | ModelCatalog: constructor with listFn injection, get, filter, compare, refresh. | M |
| R2 | `models/token-tracker.ts` | TokenTracker: subscribe to assistant.usage + session.usage_info, accumulate per-model. Promote from spike. | M |
| R3 | `models/strategy.ts` | ModelStrategy type + three built-in strategies (cheapest, smartest, budgetAware). Promote from spike. | S |
| R4 | `models/index.ts` | Barrel exports. | XS |
| R5 | Unit tests: catalog | get, filter, compare, refresh, empty catalog edge cases. | M |
| R6 | Unit tests: token-tracker | Feed simulated usage events, verify accumulation, verify unsubscribe stops tracking. | M |
| R7 | Unit tests: strategies | Each strategy with various model sets and budget states. | S |
| R8 | Update `src/index.ts` barrel | Add models/ exports. | XS |

### Laura (Tester) — test strategy + cross-module validation

| ID | Item | Description | Est. |
|----|------|-------------|------|
| L1 | Test fixture factory | Extend existing `event-factory` and `mock-sdk` helpers with `createMockForgeClient()`, `createMockForgeSession()` for integration tests. | M |
| L2 | E2E wiring test | Full flow: ForgeClient → ForgeSession → bridge events → sink. Simulated SDK (no live CLI). Promotes e2e-smoke-test.ts pattern. | L |
| L3 | Error isolation tests | Verify: throwing observer doesn't kill other observers, throwing sink doesn't kill session, disconnect cleans up on error. | M |
| L4 | Decision gate integration | Gate → HookComposer → ForgeSession: verify permission escalation flows through live wiring. | M |
| L5 | Model switching test | setModel → model_change event → ModelChangeRecord tracked → bridge event emitted. | S |
| L6 | Token tracker integration | Send multiple prompts → verify per-model accumulation, context window tracking. | S |
| L7 | Resume test | Create → disconnect → resume → verify bridge re-attached, observer state clean. | S |

---

## 6. Dependency Graph

```
                    ┌──────────────┐
                    │  L1: Fixture │
                    │   Factory    │
                    └──────┬───────┘
                           │ blocks
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     L2–L7 tests    A5–A6 tests    R5–R7 tests
            ▲              ▲              ▲
            │              │              │
    ┌───────┴──────┐ ┌─────┴─────┐ ┌─────┴──────┐
    │ L2: E2E test │ │ A1: Client│ │ R1: Catalog│
    │ L3: Error    │ │ A2: Session│ │ R2: Tracker│
    │ L4: Gate int │ │ A3: Resume│ │ R3: Strategy│
    │ L5: Model sw │ │ A4: Barrel│ │ R4: Barrel │
    │ L6: Token    │ │ A7: Barrel│ │ R8: Barrel │
    │ L7: Resume   │ └───────────┘ └────────────┘
    └──────────────┘
```

### Parallelism

| Phase | Items | Notes |
|-------|-------|-------|
| **Wave 1** (parallel) | A1, A2, R1, R2, R3, L1 | All independent. Alexander and Roger build modules while Laura builds fixtures. |
| **Wave 2** (parallel, after Wave 1) | A3, A4, A7, R4, R8 | Resume requires session. Barrels require modules. |
| **Wave 3** (parallel, after L1) | A5, A6, R5, R6, R7 | Unit/integration tests. Need fixture factory. |
| **Wave 4** (after Wave 2 + Wave 3) | L2, L3, L4, L5, L6, L7 | Cross-module integration tests. Need runtime + models + fixtures. |

**Critical path:** L1 (fixture factory) is the long pole — unblocks all Wave 3+4 tests. Laura should start L1 on day one.

---

## 7. Architecture Decision Records

### ADR-P3-001: ForgeClient wraps CopilotClient 1:1

**Decision:** Each `ForgeClient` owns exactly one `CopilotClient`. No shared client instances across ForgeClient instances.

**Alternatives considered:**
1. **Shared client singleton** — simpler, but lifecycle confusion: who calls `stop()`? Race conditions on concurrent session creation.
2. **No wrapper — expose CopilotClient directly** — less code, but breaks the "SDK types don't leak" contract from Phase 2.
3. **1:1 wrapper (chosen)** — clear ownership, deterministic cleanup, SDK contained behind Forge's API surface.

**Trade-off:** Slightly more memory if multiple ForgeClients exist (unlikely in practice — Cairn creates one). Clear lifecycle wins.

---

### ADR-P3-002: EventSource interface over direct CopilotSession coupling

**Decision:** `attachBridge()` and `createTokenTracker()` accept `EventSource { on(handler): () => void }` rather than `CopilotSession` directly.

**Alternatives considered:**
1. **Accept CopilotSession directly** — simpler types, but couples to SDK, makes unit testing require mock SDK instances.
2. **EventSource interface (chosen)** — enables mock event sources in tests, keeps Phase 2 bridge module SDK-free.

**Trade-off:** One extra interface definition. Massive test simplification — worth it given our 181-test fixture-based strategy.

---

### ADR-P3-003: ModelCatalog uses injection over ForgeClient reference

**Decision:** `createModelCatalog()` takes a `listFn: () => Promise<ModelSnapshot[]>` rather than a `ForgeClient`.

**Alternatives considered:**
1. **Pass ForgeClient** — simpler call site, but ModelCatalog becomes untestable without a live client.
2. **Injection (chosen)** — catalog is testable with a static array. Matches Phase 2 pattern where modules don't hold SDK references.

**Trade-off:** Caller must wire `() => client.listModels()` at construction. One line of glue for full testability.

---

### ADR-P3-004: No new shared types in @akubly/types

**Decision:** Phase 3 types (`ForgeClientOptions`, `ForgeSessionConfig`, `TokenBudget`, `ModelCatalog`) stay Forge-internal. No additions to `@akubly/types`.

**Alternatives considered:**
1. **Move TokenBudget to shared types** — Cairn might want to query it. But Cairn consumes `CairnBridgeEvent`, not `TokenBudget`. If Cairn needs budget data, it reconstructs from bridge events (same pattern as DBOM reconstruction from the spike).
2. **Keep internal (chosen)** — fewer cross-package coupling points. Types only graduate to shared when two packages actually import them.

**Trade-off:** If Cairn needs TokenBudget later, we'll migrate it. Cost: one PR. Benefit: smaller shared surface now.

---

### ADR-P3-005: onEvent callback handles pre-session events, attachBridge handles runtime

**Decision:** Use `SessionConfig.onEvent` for events during `createSession()`, then `attachBridge()` after the session object exists. No deduplication needed.

**Alternatives considered:**
1. **Only use `session.on()` after creation** — misses events during session setup (model validation, initial context calculation).
2. **Only use `onEvent`** — requires session reference before it exists (chicken-and-egg).
3. **Both with dedup** — adds complexity; the SDK guarantees no overlap between the two phases.
4. **Both without dedup (chosen)** — simplest, matches spike pattern, SDK guarantees non-overlapping windows.

**Trade-off:** Relies on SDK behavior (non-overlapping windows). If a future SDK version changes this, we'd need dedup. Low risk — this is the documented pattern.

---

### ADR-P3-006: Strategies as plain functions, not a Strategy class hierarchy

**Decision:** `ModelStrategy` is a function type `(models, context) => ModelSnapshot | null`. Built-in strategies are a `Record<string, ModelStrategy>`.

**Alternatives considered:**
1. **Strategy class hierarchy** (GoF pattern) — type-safe, but overkill. We have 3 strategies. Classes add constructor ceremony for no benefit.
2. **Function type (chosen)** — consumers define strategies as arrow functions. Easy to test, compose, and override.

**Trade-off:** No runtime type-checking of strategy names (string keys). Acceptable — strategies are developer-facing, not user-facing.

---

## Appendix A: File Layout

```
packages/forge/src/
├── bridge/           # Phase 2 ✓
│   └── index.ts
├── hooks/            # Phase 2 ✓
│   └── index.ts
├── decisions/        # Phase 2 ✓
│   └── index.ts
├── dbom/             # Phase 2 ✓
│   └── index.ts
├── session/          # Phase 2 ✓
│   └── index.ts
├── runtime/          # Phase 3 — NEW
│   ├── index.ts      # Barrel
│   ├── client.ts     # ForgeClient
│   └── session.ts    # ForgeSession
├── models/           # Phase 3 — NEW
│   ├── index.ts      # Barrel
│   ├── catalog.ts    # ModelCatalog
│   ├── token-tracker.ts  # TokenTracker
│   └── strategy.ts   # ModelStrategy + built-ins
├── __tests__/        # Existing + new
│   ├── helpers/      # Phase 2 helpers + new L1 fixtures
│   ├── runtime/      # A5, A6 tests
│   ├── models/       # R5, R6, R7 tests
│   └── integration/  # L2–L7 cross-module tests
├── types.ts          # Phase 2 ✓ (SDK mirrors)
└── index.ts          # Barrel (updated)
```

## Appendix B: Spike PoC → Production Promotion Map

| Spike Source | Production Target | What Changes |
|-------------|-------------------|--------------|
| `forge-poc.ts` → `sessionLifecycleDemo()` | `runtime/session.ts` → `ForgeSession` | Extract pattern, add error handling, type narrowing |
| `forge-poc.ts` → `sessionResumeDemo()` | `runtime/client.ts` → `resumeSession()` | Add bridge/hook re-attach |
| `forge-poc.ts` → `sessionMetadataDemo()` | `runtime/client.ts` → `listSessions()`, `getAuthStatus()`, etc. | Direct promotion |
| `forge-poc.ts` → `eventTaxonomyDemo()` | Already in `bridge/index.ts` EVENT_MAP | No further work |
| `model-selection-poc.ts` → `createTokenTracker()` | `models/token-tracker.ts` | Change param from CopilotSession to EventSource |
| `model-selection-poc.ts` → `MODEL_STRATEGIES` | `models/strategy.ts` | Direct promotion |
| `model-selection-poc.ts` → `toModelSnapshot()` | Already in `session/index.ts` | No further work |
| `model-selection-poc.ts` → `bridgeModelChangeEvent()` | Already in `bridge/index.ts` EVENT_MAP + extractor | No further work |
| `e2e-smoke-test.ts` → `runSmokeTest()` | `__tests__/integration/` → L2 test | Replace SimulatedCairnStore with mock sink |
