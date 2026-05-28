# §2 — L0 / L1 Boundary Contract

**Status:** FINAL (Phase 0). Authoritative; do not re-litigate locked decisions.
**Owner:** Graham. **Cross-refs:** §6 (Primitive Taxonomy), §3 (L1 WAL),
§11 (Hermetic Replay), §12 (Copilot SDK Integration).
**Depth budget:** ≤3 pages.

This section codifies the hermetic, pure-data interface between the SDK
Provider (L0) and the WAL substrate (L1). The boundary is the load-bearing
seam of the Crucible runtime: every replay-integrity, hermetic-test, and
bootstrap-capture property derives from what does and does not cross it.

## 2.1 Boundary Direction Summary

| Direction | Carries                                                       |
|-----------|---------------------------------------------------------------|
| L0 → L1 (up)   | `BootstrapPayload` (once, at session offset 0); then a stream of `CrucibleEvent` rows. |
| L1 → L0 (down) | `OutboundPrompt` (next-turn prompt material) and `ControlSignal` (pause / resume / disconnect). |

Everything that crosses is **pure data**: CBOR-canonicalizable, no functions,
no promises, no iterators, no SDK-native types. Anything richer is held
behind the L0 adapter and projected into the types below before emission.

## 2.2 `BootstrapPayload` (R2-2 LOCK)

Carries the extra-ledger context that L1 materializes as offset-0 Observation
primitives. Capture-rule: **what L0 literally hands across at bootstrap**.
Memory queried later via tool calls is *not* bootstrap — it flows through the
normal `CrucibleEvent` stream as Observation rows at query time.

```ts
interface BootstrapPayload {
  sessionId: SessionId;
  sdkVersion: string;
  schemaVersion: number;                // pins the §6.5 contract for the session

  literalContext: {
    systemPrompt: string;
    toolDefinitions: ToolDefinition[];
    injectedMemoryFragments: Array<{ sourceManifestId: string; content: unknown }>;
  };

  memoryManifest: Array<{
    id: string;
    kind: 'episodic' | 'semantic' | 'procedural' | string;
    versionHash: string;                // pins the source's content at bootstrap
    accessSurface: string;              // tool name / API id used to query later
  }>;

  causalContextWindow?: EventId[];      // OPTIONAL (R2-1 LOCK) — see §2.6
}

interface ToolDefinition {
  name: string;
  description: string;
  parametersSchema: unknown;            // JSON Schema or equivalent, CBOR-safe
  trustTier: TrustTier;
}
```

L1 materializes `literalContext` into Observation rows at offset 0 with
sub-kinds `system_prompt`, `tool_definitions`, and `injected_memory`
(one row per fragment, `sourceManifestId` carried through). `memoryManifest`
is captured as a single `injected_memory`-adjacent Observation tagged so
later `cross_session_memory` Observations can be linked back to the manifest
entry that named them.

## 2.3 `CrucibleEvent` (L0 → L1 row stream)

The canonical row-stream type. The payload is exactly the §6 union — L0
never invents primitive kinds, never reshapes envelopes.

```ts
import type { CruciblePrimitive, EventId, SessionId } from './06-primitive-taxonomy';

interface CrucibleEvent {
  sessionId: SessionId;
  emissionOrder: number;          // monotonic per session; L1 uses for tie-break (§6.9)
  primitive: CruciblePrimitive;   // §6 union — Request | Artifact | Observation | Decision | Question
  toolCallBoundary: ToolCallBoundary | null;  // §2.5
}

type CrucibleEventStream = AsyncIterable<CrucibleEvent>;  // iterator stays L0-internal;
                                                          // L1 consumes via AppendProtocol seam
```

Note that the *stream wrapper* `CrucibleEventStream` is the **only** non-pure-
data shape at the boundary, and even it is consumed by L1's `AppendProtocol`
adapter rather than passed onward. Downstream layers never see the iterator.

## 2.4 `OutboundPrompt` and Control Signals (L1 → L0)

```ts
interface OutboundPrompt {
  sessionId: SessionId;
  forTurn: number;
  promptBody: unknown;            // CBOR-canonicalizable next-turn instructions
  toolBindings: ToolDefinition[]; // tools the runtime authorizes for this turn
}

type ControlSignal =
  | { kind: 'pause';      reason: string; expectAckBy: Timestamp }
  | { kind: 'resume';     resumeToken: string }
  | { kind: 'disconnect'; reason: string };
```

L0 acknowledges `pause` by halting its event stream until `resume` arrives;
`disconnect` terminates the session and L0 releases SDK resources.

## 2.5 Per-Tool-Call Boundary Signaling (Q1)

L0 MUST tag each tool call with a `ToolCallBoundary` so L1 can enforce the
"one primitive per tool call" granularity rule (§6) and so M3 side-effect-only
tool calls produce the required synthetic-output Artifact.

```ts
interface ToolCallBoundary {
  toolCallId: string;             // L0-assigned; unique within session
  phase: 'invoke' | 'result' | 'side_effect_only';
  expectsArtifact: boolean;       // false when phase === 'side_effect_only' (M3 marker)
}
```

L1 enforcement:

- A `Request{subKind:'tool_call'}` with `phase:'invoke'` MUST be followed
  (eventually, after any nested rows) by exactly one of:
  - `Artifact{subKind:'tool_output'}` carrying the same `toolCallId`, **or**
  - `Artifact{subKind:'synthetic_output'}` when the originating boundary
    carried `phase:'side_effect_only'` (M3 marker — Q1 LOCK).
- Batches that pack multiple tool calls into a single row are rejected at
  `AppendProtocol` with `PRIMITIVE_SCALE_VIOLATION`.
- Missing the closing Artifact within the session-configured window is
  surfaced as an Aperture attention-tier event, not silently absorbed.

## 2.6 Optional `causalContextWindow` on Decision Emission (R2-1 LOCK)

Decision rows MAY carry an explicit `causalContextWindow: EventId[]` slice
at emission. The field is OPTIONAL at the boundary; absence triggers L1's
fallback path.

| L0 declares window? | L1 hashes...                            | `commitmentMethod` tag |
|---------------------|------------------------------------------|------------------------|
| Yes (declared)      | Exactly the listed EventIds, in order.   | `'declared'`           |
| No (omitted)        | Full ledger prefix up to (not incl.) the Decision row's offset. | `'fallback'` |

L0 providers without attention metadata (today: Copilot SDK first cut) MAY
omit the field; fallback is graceful. A declared slice referencing rows
**outside** the ledger prefix is a Bootstrap-Capture-Completeness violation
(TDD §6.8) and is caught by L1, not silently absorbed by the commitment hash.
The slice carried at this boundary is the source of
`DecisionPayload.causalContextWindowSlice` in §6.

## 2.7 NOT-Cross List (Explicit)

The following types are **forbidden** at the boundary in either direction. A
dependency-cruiser rule (§2.9) enforces this statically.

- SDK-native types (`SessionEvent`, `ToolResultObject`, `ChatMessage`,
  vendor-specific message envelopes, transport-layer DTOs).
- Functions, closures, classes with methods, `Symbol`-keyed properties.
- Promises, thenable adapters, observables, RxJS subjects.
- Iterators / generators (the `CrucibleEventStream` iterable adapter is the
  **only** exception and is consumed by L1's adapter, not re-exported).
- Internal Cairn types (`@akubly/cairn/*`) and internal Forge types
  (`@akubly/forge/internal/*`).
- File handles, sockets, streams, `Buffer` objects that are not first
  serialized into CBOR-safe byte arrays.

## 2.8 Interface Alias Table (Graham ↔ Laura §3.1)

The names below are interchangeable across this CTD and Laura's TDD strategy.
Both sets of names appear in code; this table is the source of truth for the
mapping so London-school component tests mock against the same surface.

| §2 (this section) — Graham           | Laura §3.1 collaborator name   | Role |
|--------------------------------------|---------------------------------|------|
| L0 Provider `bootstrap()` surface    | `SessionBootstrapper`           | Produces `BootstrapPayload` at session start |
| L0 Provider `eventStream()` surface  | (part of `SessionBootstrapper`) | Exposes the canonical `CrucibleEvent` stream |
| L1 prefix-reader for context windows | `LedgerWindowReader`            | `(sessionId, startOffset, endOffset) → CruciblePrimitive[]` |
| L1 BLAKE3-over-CBOR commitment hasher| `ReadSetHasher`                 | Deterministic 32-byte hash (used for §2.6 commitments) |
| L1 atomic append entrypoint          | `AppendProtocol`                | Consumes `CrucibleEvent` stream; enforces §2.5 rules |

Implementations MAY use either name; the canonical export name is the §2
column (CTD-side), with the Laura name available as a re-export alias.

## 2.9 Dependency-Cruiser Boundary Enforcement

A dependency-cruiser ruleset enforces the boundary statically. Rule names
and globs are part of this contract; implementations MUST register them.

```jsonc
// .dependency-cruiser.cjs (excerpt)
{
  "forbidden": [
    {
      "name": "no-sdk-types-above-l0",
      "comment": "SDK-native types must not leak past the L0 provider boundary.",
      "from": { "pathNot": "^packages/crucible-l0-provider/" },
      "to":   { "path":    "^packages/crucible-l0-provider/src/internal/" }
    },
    {
      "name": "l1-only-imports-boundary-types",
      "comment": "L1 WAL substrate may only consume the boundary contract, not L0 internals.",
      "from": { "path":    "^packages/crucible-l1-wal/" },
      "to":   { "pathNot": "^(packages/crucible-l0-provider/dist|packages/crucible-boundary)/" }
    },
    {
      "name": "no-iterators-in-boundary",
      "comment": "The boundary package itself must not re-export iterators/promises beyond CrucibleEventStream.",
      "from": { "path": "^packages/crucible-boundary/src/" },
      "to":   { "path": "node:stream|rxjs|^packages/.+/src/internal/" }
    },
    {
      "name": "no-cairn-or-forge-internals-at-boundary",
      "comment": "Crucible boundary cannot depend on Cairn/Forge internals.",
      "from": { "path": "^packages/crucible-(boundary|l0-provider|l1-wal)/" },
      "to":   { "path": "^packages/(cairn|forge)/(?!dist/types)" }
    }
  ]
}
```

CI gate (Gabriel §3 zero-tolerance harness) fails the build on any rule
violation. New transport adapters add allow-list entries via PR, never by
loosening these rules.

## 2.10 Acceptance Signal for Laura

This contract is sufficient for the following test artifacts to be written
against the interfaces above, without further design input:

- **A2 — Hermetic Replay (bootstrap capture):** mock `SessionBootstrapper`
  returns a fixed `BootstrapPayload`; assert L1 materializes the expected
  offset-0 Observation rows (sub-kinds `system_prompt`, `tool_definitions`,
  `injected_memory` ×N).
- **A6 — Plugin Pinning at Fork (SessionMetadata flow):** `BootstrapPayload.\
  memoryManifest[].versionHash` and `ToolDefinition.trustTier` provide the
  metadata that fork-time pinning hashes; A6 asserts a forked session's
  bootstrap payload is byte-equal to parent's at fork offset.
- **TDD §6.8 Bootstrap-Capture-Completeness invariant:** the property test in
  Laura's TDD §6.8 runs end-to-end against this boundary — `BootstrapPayload`
  fields enumerate every extra-ledger context source, and L1 enforcement
  refuses replay advance past offset 0 if the materialized Observation set
  does not match the bootstrap manifest.

§2 and §6 together pin the full set of types Laura needs for Phase 1
authoring of §11 (Hermetic Replay). Roger's §3 (L1 WAL) consumes this
contract as the upstream-of-L1 input shape; Alexander's §12 (Copilot SDK
Integration) implements the L0 side against `BootstrapPayload` +
`CrucibleEvent` + `ControlSignal`.
