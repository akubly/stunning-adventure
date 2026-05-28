# §12 — Copilot SDK Integration

**Status:** FINAL (Phase 1, Lane 3). Authoritative; do not re-litigate locked decisions.
**Owner:** Alexander. **Reviewer:** Graham. **Cross-refs:** §2 (L0/L1 Boundary),
§6 (Primitive Taxonomy), §3 (L1 WAL), §8 (Applier + DecisionGate), §11 (Hermetic
Replay), §15 (Package Boundaries).
**Depth budget:** ≤3 pages.

This section specifies how the **Copilot SDK** is adapted into Crucible's L0
position as the first concrete `SdkProvider`. The SDK is a moving target;
this contract is shaped so additional providers can be added without
relitigating L0/L1.

## 12.1 Position in the Stack

Crucible owns the trunk (message loop, ledger, Router, Applier). The Copilot
SDK provides the **model/tool substrate** that L0 adapts into the pure-data
shapes §2 defines. The SDK never appears above L0; L0 never invents
primitives. The L0 boundary contract (§2.1–2.7) is authoritative for what
crosses; this section specifies the SDK-side adapter.

```
┌──────────────────────────────────────────────┐
│ @akubly/crucible-runtime  (L1+ trunk)        │
│ ┌──────────────────────────────────────────┐ │
│ │ Router · Applier · LedgerWindowReader …  │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ @akubly/crucible-boundary  (§2 types)    │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
            ▲ pure data only (§2.7 NOT-cross)
┌───────────┴──────────────────────────────────┐
│ @akubly/crucible-l0-copilot   (this section) │
│  implements SdkProvider; wraps @github/copilot-sdk │
└──────────────────────────────────────────────┘
```

## 12.2 `SdkProvider` Interface (L0 contract surface)

The provider is the **only** L0-position package allowed to import
`@github/copilot-sdk` (dependency-cruiser rule §2.9). Every method returns
pure data per §2.7.

```ts
import type {
  BootstrapPayload, CrucibleEvent, CrucibleEventStream,
  OutboundPrompt, ControlSignal, SessionId,
} from '@akubly/crucible-boundary';

export interface SdkProvider {
  /** Stable identifier surfaced to provider registration (§12.3). */
  readonly id: string;                  // e.g. 'copilot-sdk@1'
  readonly sdkVersion: string;          // resolved at construction; pinned for session

  /** Open an SDK session and emit the offset-0 BootstrapPayload (R2-2). */
  bootstrap(opts: BootstrapOptions): Promise<BootstrapPayload>;

  /** Canonical CrucibleEvent stream (the only iterable that crosses §2). */
  eventStream(sessionId: SessionId): CrucibleEventStream;

  /** L1 → L0 prompt material for the next turn (§2.4). */
  submitOutboundPrompt(p: OutboundPrompt): Promise<void>;

  /** L1 → L0 control signals: pause / resume / disconnect (§2.4). */
  signal(s: ControlSignal): Promise<void>;

  /** Optional capability declaration — see §12.7 (R2-1). */
  readonly capabilities: SdkProviderCapabilities;

  /** Release SDK resources; idempotent. */
  shutdown(reason: string): Promise<void>;
}

export interface BootstrapOptions {
  sessionId: SessionId;
  systemPrompt: string;                 // literal text the runtime hands in
  toolDefinitions: ToolDefinition[];    // §2 ToolDefinition
  injectedMemoryFragments?: Array<{ sourceManifestId: string; content: unknown }>;
  memoryManifest?: Array<{
    id: string; kind: string; versionHash: string; accessSurface: string;
  }>;
}

export interface SdkProviderCapabilities {
  /** True iff the provider surfaces per-Decision attention/window metadata. */
  declaresCausalContextWindow: boolean; // Copilot SDK v1: FALSE — see §12.7
  /** True iff per-tool-call boundary tagging is native (else synthesized). */
  nativeToolCallBoundary: boolean;      // Copilot SDK v1: TRUE
  /** True iff side-effect-only tool calls are signaled by the SDK. */
  nativeSideEffectMarker: boolean;      // Copilot SDK v1: FALSE — synthesized
}
```

The `SdkProvider` is the §2.8 alias for **`SessionBootstrapper`** (Laura §3.1).
Both names export from `@akubly/crucible-boundary`; this CTD prefers
`SdkProvider`, Laura's TDD prefers `SessionBootstrapper`, they are the same
interface.

## 12.3 Provider Registration Protocol

Providers are discovered at runtime construction, **not** at session start —
this keeps `crucible session start` synchronous and replay-deterministic.

```ts
export interface SdkProviderRegistry {
  register(factory: SdkProviderFactory): void;            // wired by composition root
  resolve(id: string): SdkProviderFactory | undefined;    // by config selector
  list(): ReadonlyArray<{ id: string; sdkVersion: string }>;
}
```

- The composition root (in `@akubly/crucible-runtime`) instantiates the
  registry and registers built-in providers at process start. `crucible-l0-
  copilot` is the v1 built-in.
- Session-time selection: `crucible session start --provider <id>` (default:
  `copilot-sdk`). The selected provider id is captured into
  `BootstrapPayload.literalContext` via a `provider_id` field on the
  system_prompt observation? **No** — to keep §2 stable, provider identity is
  carried via `BootstrapPayload.sdkVersion` (existing field) prefixed
  `<providerId>@<sdkSemver>` (e.g. `copilot-sdk@1.4.2`). No §2 schema change.
- Replay refuses to start if the session's recorded provider id is not
  registered in the replay process (TDD §6.8 Bootstrap-Capture-Completeness).

## 12.4 Session Bootstrap Sequence

The sequence from `crucible session start` through the first L1 row append:

```
User                CLI (§13)            Runtime (this §)         Registry            SdkProvider                   L1 WAL (§3)
 │  crucible session   │                       │                       │                       │                               │
 │  start ──────────▶  │  startSession(opts) ▶ │                       │                       │                               │
 │                     │                       │  resolve(provider) ─▶ │                       │                               │
 │                     │                       │ ◀─ factory ─────────  │                       │                               │
 │                     │                       │  new(provider) ───────────────────────────▶   │                               │
 │                     │                       │  bootstrap(opts) ─────────────────────────▶   │                               │
 │                     │                       │                       │     (open SDK sess)   │                               │
 │                     │                       │ ◀─── BootstrapPayload (R2-2) ─────────────    │                               │
 │                     │                       │  AppendProtocol.materializeOffset0(payload) ─────────────────────────────────▶│
 │                     │                       │                       │                       │                  (offset-0 Observation rows:
 │                     │                       │                       │                       │                   system_prompt, tool_definitions,
 │                     │                       │                       │                       │                   injected_memory ×N) ▶ commit
 │                     │                       │  eventStream(sid) ───────────────────────▶    │                               │
 │                     │                       │ ◀═══════ CrucibleEvent stream ════════════    │                               │
 │                     │                       │   for each event: AppendProtocol.append(ev) ────────────────────────────────▶ │
 │                     │                       │                       │                       │                  (first L1 row at offset 1: e.g.
 │                     │                       │                       │                       │                   Request{subKind:'user_input'})
```

**Atomicity rule:** `materializeOffset0()` MUST commit all bootstrap
observations in a single group-commit batch; if any row fails to append, the
whole batch is rolled back and the session is aborted (TDD §6.8). Only after
offset-0 commit does the runtime start pumping `eventStream`.

## 12.5 Bootstrap-Capture Handshake (Field Sourcing — R2-2 LOCK)

Every field in `BootstrapPayload` (§2.2) must come from somewhere in the
provider/runtime stack. This table is the source-of-truth so Roger's §3 row
materialization and Laura's §6.8 invariant test align with this provider.

| `BootstrapPayload` field                     | Source in Copilot SDK provider | Notes |
|----------------------------------------------|--------------------------------|-------|
| `sessionId`                                  | Generated by runtime (UUIDv7) before `bootstrap()` is called. | Passed in via `BootstrapOptions`. |
| `sdkVersion`                                 | `${providerId}@${sdkPkgVersion}` resolved from `@github/copilot-sdk`'s `package.json` at provider construction. | Pinned for session lifetime. |
| `schemaVersion`                              | Compile-time constant exported from `@akubly/crucible-boundary` (v1 = `1`). | Pins §6.5 contract. |
| `literalContext.systemPrompt`                | **Runtime composition root** hands the literal text in via `BootstrapOptions.systemPrompt`. The SDK does NOT own it. | Captured verbatim — no template expansion at the boundary. |
| `literalContext.toolDefinitions[]`           | **Runtime composition root** assembles tool defs from the plugin registry (Rosella §15) + builtin tools, hands them in via `BootstrapOptions.toolDefinitions`. The provider re-shapes nothing; it forwards them. | `trustTier` is set by the registry (Rosella), not by L0. |
| `literalContext.injectedMemoryFragments[]`   | Eureka's `recall()` results when the runtime is configured with Eureka — runtime calls Eureka **before** `bootstrap()` and threads results via `BootstrapOptions.injectedMemoryFragments`. | Empty when Eureka is disabled. SDK never sees memory. |
| `memoryManifest[]`                           | Eureka's manifest snapshot at session start (`{id, kind, versionHash, accessSurface}` per source). | Pins the queryable surface for later `cross_session_memory` Observations. |
| `causalContextWindow?`                       | OMITTED for Copilot SDK v1 (see §12.7). | L1 takes the `'fallback'` path per §2.6. |

The provider's `bootstrap()` body is intentionally narrow: it opens the SDK
session with the provided systemPrompt + toolDefinitions, then **echoes
back** the inputs as the `BootstrapPayload` fields (plus the SDK-resolved
`sdkVersion`). This keeps the capture rule honest — "what was literally
handed across at bootstrap" — and means Laura's TDD §6.8 property test mocks
the provider with the same inputs the production runtime feeds it.

## 12.6 Worked Example

`crucible session start --provider copilot-sdk --skill triage`:

1. CLI parses args; calls `runtime.startSession({ skill: 'triage' })`.
2. Composition root resolves system prompt from skill manifest (`triage.md`),
   assembles tool defs from registry, calls `eureka.recall(sessionContext)` →
   3 fragments + manifest.
3. Composition root resolves the provider: `copilot-sdk` (default).
4. Runtime invokes `provider.bootstrap({ sessionId, systemPrompt, toolDefinitions: [12 tools], injectedMemoryFragments: [3], memoryManifest: [3 sources] })`.
5. Provider opens `@github/copilot-sdk` session, returns `BootstrapPayload`
   with `sdkVersion: 'copilot-sdk@1.4.2'`, `schemaVersion: 1`, no
   `causalContextWindow`.
6. `AppendProtocol.materializeOffset0(payload)` → offset 0 commits 1
   `system_prompt`, 1 `tool_definitions`, 3 `injected_memory` (one per
   fragment), 3 `injected_memory`-adjacent manifest entries. Total 8
   Observation rows in one batch.
7. Runtime calls `provider.eventStream(sessionId)`; user types "review
   PR #42"; provider emits `CrucibleEvent { primitive: Request{subKind:
   'user_input', body: 'review PR #42' }, toolCallBoundary: null }` →
   `AppendProtocol.append` → commits at offset 1.
8. Model produces a tool call to `read_file`; provider emits
   `Request{subKind:'tool_call', target:'read_file', arguments: {...}}` with
   `toolCallBoundary: { toolCallId: 'tc-001', phase: 'invoke', expectsArtifact: true }`
   at offset 2; SDK returns the file; provider emits matching
   `Artifact{subKind:'tool_output', producedBy: <offset-2-id>}` with
   `toolCallBoundary: { toolCallId: 'tc-001', phase: 'result' }` at offset 3.
9. Loop continues until the Applier (§8) writes a Decision row or the user
   issues `/quit` (control signal: `disconnect`).

## 12.7 Optional `causalContextWindow` — Copilot SDK Reality (R2-1)

**Reality check on the SDK surface:** `@github/copilot-sdk` does NOT expose
per-emission attention or context-window metadata. The SDK's session event
shape carries the message content, tool calls, and tool results — it does
not surface "which prior message ids did the model attend to when producing
this output." No public model provider does today.

**Consequence — declared path is unavailable for v1:**

- `SdkProviderCapabilities.declaresCausalContextWindow = false` for the
  Copilot SDK provider.
- The provider MUST omit `BootstrapPayload.causalContextWindow` AND MUST omit
  the optional `causalContextWindow` field on emitted `CrucibleEvent`s whose
  primitive is a Decision.
- L1 sees the omission and takes the **fallback path** per §2.6: it hashes
  the full ledger prefix up to (not including) the Decision row's offset and
  tags `commitmentMethod: 'fallback'` on the materialized
  `DecisionPayload`.

**This is not a degradation; it is the v1 path.** The fallback is graceful
and replay-equivalent — hashing the full prefix is conservative but always
correct. The `declared` path is reserved for future providers (or future
SDK versions) that surface attention information; the boundary is shaped so
they can opt in without code changes above L0.

**Forward-compat sketch:** a provider with attention metadata would (a) set
`declaresCausalContextWindow: true`, (b) include `causalContextWindow:
EventId[]` on Decision-bearing `CrucibleEvent`s, (c) ensure every listed
EventId resolves to a row already committed in the session ledger prefix
(L1 enforces this — out-of-prefix references are a Bootstrap-Capture
violation per §2.6).

## 12.8 Multiple-Provider Support (Forward Compat)

The registry (§12.3) already accommodates N providers; the only constraints
are:

- Exactly one provider is active per session (selected at start, pinned via
  `sdkVersion` for the session lifetime).
- Cross-session fork (`crucible fork`, §10) MUST use the same provider id
  the parent session used; provider switching is a new session, not a fork.
  This preserves replay equivalence (TDD §6.3).
- Providers are NOT plugins in the Rosella §15 sense — they are
  composition-root wirings; they don't participate in the trust-tier
  ladder. (A future "marketplace L0 provider" would change this; not v1.)

## 12.9 Package Boundaries (Cross-Ref §15)

| Package                          | Role                                                          | Imports `@github/copilot-sdk`? |
|----------------------------------|---------------------------------------------------------------|--------------------------------|
| `@akubly/crucible-boundary`      | §2 types (BootstrapPayload, CrucibleEvent, OutboundPrompt, ControlSignal, SdkProvider interface). | No |
| `@akubly/crucible-l0-copilot`    | The SdkProvider implementation for Copilot SDK. **Sole importer.** | Yes |
| `@akubly/crucible-l1-wal`        | Roger's §3 substrate. Consumes boundary types only.           | No |
| `@akubly/crucible-runtime`       | Composition root: registry, message loop, Applier (§8), Router (§5), wiring. | No (consumes provider via interface) |
| `@akubly/skillsmith-runtime`     | **Legacy.** Cairn↔Forge prescriber composition for the existing batch CLI. **Stays as-is per coexist lock** (decisions.md W3-D1/W3-D2). NOT renamed, NOT merged. Independent dep graph. | No (transitively via `@akubly/forge`) |

The coexist lock means `@akubly/skillsmith-runtime` and `@akubly/crucible-
runtime` ship as siblings. No code is shared between them; the only common
denominator is `@akubly/types`. Both can be installed in the same project
during the transition; nothing forces a migration.

## 12.10 Acceptance Signal

This section is sufficient for the following dependent work:

- **§8 Applier (Lane 3, this author):** composition root shape is locked
  (`@akubly/crucible-runtime` hosts the Applier; it consumes
  `SdkProvider` only through the §2 boundary). §8 builds on this.
- **§13 CLI (Valanice):** `crucible session start [--provider id]` verb is
  spec'd; CLI is a thin shell over `runtime.startSession()`.
- **Laura A2 / TDD §6.8:** mock `SdkProvider` returns canned
  `BootstrapPayload`; §12.5 source table tells the test author what each
  field should contain to exercise the invariant end-to-end.
- **Future providers:** §12.3 registry + §12.7 capability shape are stable
  enough that a second provider (e.g. `anthropic-sdk`, `local-llama`) can
  be added without §2/§6/§3 changes.
