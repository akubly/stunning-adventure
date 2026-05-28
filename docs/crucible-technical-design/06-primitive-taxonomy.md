# §6 — Primitive Taxonomy (5 Primitives)

**Status:** FINAL (Phase 0). Authoritative; do not re-litigate locked decisions.
**Owner:** Graham. **Cross-refs:** §2 (L0/L1 Boundary), §3 (L1 WAL Substrate).
**Depth budget:** ≤1 page.

The Crucible vocabulary is exactly **five primitives**: `Request`, `Artifact`,
`Observation`, `Decision`, `Question`. They are the only payload kinds that
ever appear on an L1 WAL row and the only payload kinds that ever cross the
L0/L1 boundary as a `CrucibleEvent` (§2). Every upper layer (L2 derived
queries, L3 generators, L4 router, L5 investigation, Aperture projections)
indexes off these five kinds.

## 6.1 Common Envelope

Every primitive carries the same envelope. Per-kind payload varies.

```ts
type PrimitiveKind = 'request' | 'artifact' | 'observation' | 'decision' | 'question';

type EventId = string;          // content-addressed (BLAKE3 of canonical CBOR row)
type SessionId = string;
type TaskId = string;            // §2.8 sub-task tag; NULL on top-level rows
type Timestamp = number;         // envelope-side, millisecond-resolution; monotonically non-decreasing per session (TDD §6.9 Monotonic-Timestamps invariant)
type TimestampNs = bigint;       // WAL-record-side, u64 nanoseconds; structural; §3.10 monotonic-floor enforced. Phase 2 finding 2a split — envelope uses Timestamp (ms), L1 storage uses TimestampNs (ns).
type TrustTier = 'builtin' | 'adopted' | 'community' | 'external';

interface PrimitiveEnvelope<K extends PrimitiveKind, P> {
  id: EventId;
  sessionId: SessionId;
  primitiveKind: K;
  primitivePayload: P;
  parentId: EventId | null;       // primary lineage (e.g., Artifact → Request that produced it)
  causalParentId: EventId | null; // §2.8 sub-task parent on TaskStart rows; null otherwise
  causalReadSet: ReadSetRef;      // ids + projection keys + external inputs read at emission
  taskId: TaskId | null;          // §2.8 sub-task tag
  timestamp: Timestamp;
  trustTier: TrustTier;           // attribution at emission; monotonic per TDD §6.7 Trust-Tier-Monotonicity
  hooks: HookOutcome | null;      // §4 verdict + witness; populated by pre-commit bus
  schemaVersion: number;          // see §6.5
}

interface ReadSetRef {
  primitiveIds: EventId[];
  projectionKeys: string[];
  externalInputs: string[];       // hashed identifiers of out-of-ledger inputs
}

interface HookOutcome { verdict: 'continue' | 'observe' | 'pause'; witness: string | null; }
```

`parentId` is the structural lineage link (e.g., the Artifact returned by a
Request). `causalParentId` is the §2.8 sub-task spawn link (TaskStart points
at the Request that issued the fan-out). Both can coexist; they answer
different replay/investigation queries.

## 6.2 Per-Kind Payloads

```ts
type Request     = PrimitiveEnvelope<'request',     RequestPayload>;
type Artifact    = PrimitiveEnvelope<'artifact',    ArtifactPayload>;
type Observation = PrimitiveEnvelope<'observation', ObservationPayload>;
type Decision    = PrimitiveEnvelope<'decision',    DecisionPayload>;
type Question    = PrimitiveEnvelope<'question',    QuestionPayload>;

type CruciblePrimitive = Request | Artifact | Observation | Decision | Question;

interface RequestPayload {
  subKind: 'tool_call' | 'llm_call' | 'TaskStart' | 'user_input';
  target: string;                   // tool name, model id, or sub-task label
  arguments: unknown;               // CBOR-canonicalizable
}

interface ArtifactPayload {
  subKind: 'tool_output' | 'llm_output' | 'synthetic_output';  // synthetic_output = M3 side-effect-only marker
  producedBy: EventId;              // the Request that produced it
  content: unknown;
}

interface ObservationPayload {
  subKind:
    | 'system_prompt'       // bootstrap (offset 0)
    | 'tool_definitions'    // bootstrap (offset 0)
    | 'injected_memory'     // bootstrap (offset 0); fragments literally injected by L0
    | 'tool_output'         // post-bootstrap tool result captured for replay
    | 'llm_response'        // post-bootstrap LLM response captured for replay
    | 'cross_session_memory'// later-queried memory; NOT a bootstrap row
    | 'context_truncation'  // pruning signal from L0's context manager
    | 'external_input'      // user/system input not modeled as Request
    | 'TaskEnd'             // §2.8 sub-task terminator (status carried in body)
    | 'monotonic_violation' // emitted when TDD §6.9 invariant trips
    | 'structural_proposal_emitted'   // Applier-written: entered paused-awaiting-structural-ack (§8.2)
    | 'structural_proposal_acked'     // Aperture-written: user approved structural proposal (§5.3, §8.2, §9)
    | 'structural_proposal_rejected'  // Aperture-written: user rejected structural proposal
    | 'structural_proposal_expired';  // Applier/Aperture-written: queue deadline elapsed
  sourceManifestId: string | null;  // links injected_memory → memoryManifest entry (§2)
  body: unknown;
}

interface DecisionPayload {
  rationale: string;
  alternatives: unknown[];          // structured per Trust-Tier badge requirements
  contextWindowCommitment: string;  // 32-byte BLAKE3 over CBOR-canonicalized window (R2-1 LOCK)
  causalContextWindowSlice: EventId[] | null;  // OPTIONAL; present iff L0 declared (R2-1 LOCK)
  commitmentMethod: 'declared' | 'fallback';   // REQUIRED tag recording which path L1 took (R2-1 LOCK)
  nonDominatedReason?: 'optimal' | 'incomparable';  // propagated from PrescriptionResult (R2-5)
  incomparableWith?: string[];
}

interface QuestionPayload {
  prompt: string;
  audience: 'user' | 'router' | 'curator';
  blocking: boolean;
  expectedAnswerShape: 'text' | 'choice' | 'structural-ack';
}
```

## 6.3 Sub-Type Enumeration Summary

| Primitive   | Sub-kinds |
|-------------|-----------|
| Request     | `tool_call`, `llm_call`, `TaskStart`, `user_input` |
| Artifact    | `tool_output`, `llm_output`, `synthetic_output` (M3) |
| Observation | `system_prompt`, `tool_definitions`, `injected_memory`, `tool_output`, `llm_response`, `cross_session_memory`, `context_truncation`, `external_input`, `TaskEnd`, `monotonic_violation`, `structural_proposal_emitted`, `structural_proposal_acked`, `structural_proposal_rejected`, `structural_proposal_expired` |
| Decision    | (no sub-kind; differentiated by `commitmentMethod` + `nonDominatedReason`) |
| Question    | (differentiated by `audience` + `expectedAnswerShape`) |

`TaskStart` and `TaskEnd` are **enum values on existing Request and Observation
kinds**, not new primitive types (Round 2.2 lock). `task_id` on the envelope
ties a fan-out together; the same kind-indexed hook dispatch handles them.

## 6.4 Parent / Causal Linking

Two distinct edges; both are EventId references (content-addressed):

- **`parentId`** — structural production lineage. Read this to answer "what
  produced this Artifact?" or "which Request did this Decision resolve?"
- **`causalParentId`** — §2.8 sub-task spawn edge. Read this to walk a fan-out
  tree. Only populated on `TaskStart` Request rows.

A Decision additionally references its **causal context window** through
`causalContextWindowSlice` (when declared) and the BLAKE3
`contextWindowCommitment` (always). This is the third edge type and is
**hash-mediated, not pointer-mediated**: the slice lists exact `EventId`s
hashed; replay re-resolves and asserts equality. Coexists with the two
pointer edges.

## 6.5 Schema Versioning

`schemaVersion: number` on every envelope. v1 starts at `1`. Evolution rules:

- **Additive only within a major version.** New optional payload fields, new
  sub-kind enum values, new optional envelope fields. Existing readers MUST
  ignore unknown optional fields and tolerate unknown sub-kind values by
  routing them to a `kind:unknown` slow path that surfaces as an Aperture
  attention-tier event (never silently drop).
- **Required-field removal or semantic change → major version bump.** v1
  ledgers remain readable by v2 code via an explicit upgrade adapter; mixing
  schema versions in one session is forbidden (session pins `schemaVersion`
  at offset 0 via a bootstrap Observation and refuses divergent rows).
- **Replay equivalence (TDD §6.3 invariant)** is asserted against the schema
  version pinned at the session's offset 0. Replay refuses to start on
  version mismatch.
- **Forward-compat for L3 generators:** generators MUST NOT zero-fill missing
  payload fields they don't understand; round-trip via CBOR preserves them
  for future readers.

## 6.6 Cross-Reference to §2

The L0/L1 boundary types in §2 carry `CruciblePrimitive` (this section's
union) as the canonical `CrucibleEvent` payload. The optional
`causalContextWindow: EventId[]` field on the §2 Decision-emission contract
(R2-1) is the field that L1 materializes into `DecisionPayload.causalContext\
WindowSlice` and tags with `commitmentMethod: 'declared'`; when omitted at
the boundary, L1 sets `commitmentMethod: 'fallback'` and leaves the slice
field `null`. The §2 per-tool-call signaling rule maps directly to the
Artifact `synthetic_output` sub-kind (M3) and the
`Request.subKind = 'tool_call'` / `Artifact.subKind = 'tool_output'` pair
for normal tool calls.
