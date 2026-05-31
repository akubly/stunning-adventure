# §6 — Primitive Taxonomy (5 Primitives)

**Status:** FINAL (Phase 0). Authoritative; do not re-litigate locked decisions.
**Owner:** Graham. **Cross-refs:** §2 (L0/L1 Boundary), §3 (L1 WAL Substrate).
**Depth budget:** ≤1 page.

The Crucible vocabulary is exactly **five primitives**: `Request`, `Artifact`,
`Observation`, `Decision`, `Question`. They are the only payload kinds that
ever appear on an L1 WAL row and the only payload kinds that ever cross the
L0/L1 boundary as a `CrucibleEvent` (§2). Every upper layer (L2 derived
queries, L3 generators, L3.5 scheduler, L4 router, L5 investigation,
Aperture projections) indexes off these five kinds.

**Framing (locked, ADR-0020).** These five primitives are the **minimal
typed trace algebra for replayable, accountable agentic computation**. The
actual "instructions" are defined by **sub-kinds, schemas, declared effects,
causal edges, and runtime semantics** — not by the primitive nouns alone.
The earlier framing of the five as a "universal instruction set of agentic
computation" was rejected as overreach: an ISA is an executable
producer/consumer contract with defined pre/post state semantics, and
Crucible's primitives are instead the base replay/audit algebra over which
that semantics is built. Hardware-instruction analogies (§6.7) remain useful
mental scaffolding for orientation; they are not load-bearing architectural
claims.

**Governance principle: sub-kinds are where instructions live.** The named
risk under this framing is **semantic bucket inflation** — the five nouns
survive while important invariants leak into ad-hoc payload metadata. The
discipline that prevents it is **explicit sub-kind registration with
declared effects, schemas, and causal-edge contracts**. New sub-kinds enter
the enum via §6.5 additive evolution; each carries (a) a payload schema,
(b) declared effects (read-set / write-set / external-interaction class),
(c) the causal-edge shape it produces or consumes, and (d) runtime
semantics — what L3/L3.5/L4/Applier do when they see it. A sub-kind that
cannot be specified along these four axes is not yet ready to enter the
enum. Sub-kind proliferation is healthy when each addition pays the
specification cost; it becomes inflation when sub-kinds are added without
the four-axis discipline. See ADR-0020 for the precision-reframing
rationale.

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
  ancestryRefs: Array<{           // PA-B4: ancestry-aware reads (§7.3, §10.4)
    ancestorSid: SessionId;
    transitiveDepth: number;      // 1 = direct parent only; -1 = full ancestry chain
  }>;
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
    | 'stream_open'         // streaming LLM capture start (§16.5)
    | 'stream_delta'        // streaming LLM checkpoint delta (§16.5)
    | 'stream_close'        // streaming LLM capture terminator (§16.5)
    | 'cross_session_memory'// later-queried memory; NOT a bootstrap row
    | 'context_truncation'  // pruning signal from L0's context manager
    | 'external_input'      // user/system input not modeled as Request
    | 'TaskEnd'             // §2.8 sub-task terminator (status carried in body)
    | 'monotonic_violation' // emitted when TDD §6.9 invariant trips
    | 'structural_proposal_emitted'   // Applier-written: entered paused-awaiting-structural-ack (§8.2)
    | 'structural_proposal_acked'     // Aperture-written: user approved structural proposal (§5.3, §8.2, §9)
    | 'structural_proposal_rejected'  // Aperture-written: user rejected structural proposal
    | 'structural_proposal_expired'   // Applier/Aperture-written: queue deadline elapsed
    | 'fork_origin'        // fork session anchor (§10.4, ADR-0019)
    | 'fork_resume'        // resumed aborted fork marker (ADR-0019)
    | 'predicate_registered'   // Hook Bus predicate registration (§4.2)
    | 'predicate_unregistered' // Hook Bus predicate unregistration (§4.2)
    | 'predicate_timeout'  // Hook Bus fail-open timeout (§4.3, §17.1)
    | 'row_budget_exhausted' // Hook Bus per-row budget exhausted (§4.3, §17.1)
    | 'fence_violation_retry' // Applier fence retry (§8.3, §17.1)
    | 'fence_exhausted'    // Applier fence retries exhausted (§8.3, §17.1)
    | 'replay_divergence'  // replay-equivalence failure marker (§11.6, §17.1)
    | 'ci_gate_failure'    // PR-time CI gate failure surfaced in Aperture (§16, §17.1)
    | 'subscriber_drop'    // observe queue overflow summary (§4.5, §17.1)
    | 'projection_stale'   // L2 projection lag alert (§5.A.4, §17.1)
    | 'projection_recovered' // L2 projection lag cleared (§5.A.4, §17.1)
    | 'storage_soft_warn'; // retention soft-limit warning (§17.3.1)
  sourceManifestId: string | null;  // links injected_memory → memoryManifest entry (§2)
  body: unknown;
}

interface DecisionPayload {
  eventType?:
    | 'router.paused'
    | 'router.decision'
    | 'applier.revert'
    | 'fork.collision_choice'
    | 'scheduler_dispatched'
    | 'scheduler_deferred'
    | 'scheduler_cancelled'
    | 'scheduler_quanta_exhausted';
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
| Observation | `system_prompt`, `tool_definitions`, `injected_memory`, `tool_output`, `llm_response`, `stream_open`, `stream_delta`, `stream_close`, `cross_session_memory`, `context_truncation`, `external_input`, `TaskEnd`, `monotonic_violation`, `structural_proposal_emitted`, `structural_proposal_acked`, `structural_proposal_rejected`, `structural_proposal_expired`, `fork_origin`, `fork_resume`, `predicate_registered`, `predicate_unregistered`, `predicate_timeout`, `row_budget_exhausted`, `fence_violation_retry`, `fence_exhausted`, `replay_divergence`, `ci_gate_failure`, `subscriber_drop`, `projection_stale`, `projection_recovered`, `storage_soft_warn` |
| Decision    | (no sub-kind; differentiated by `eventType`, `commitmentMethod`, and `nonDominatedReason`; v1 `eventType` values: `router.paused`, `router.decision`, `applier.revert`, `fork.collision_choice`, `scheduler_dispatched`, `scheduler_deferred`, `scheduler_cancelled`, `scheduler_quanta_exhausted`) |
| Question    | (differentiated by `audience` + `expectedAnswerShape`) |

`TaskStart` and `TaskEnd` are **enum values on existing Request and Observation
kinds**, not new primitive types (Round 2.2 lock). `task_id` on the envelope
ties a fan-out together; the same kind-indexed hook dispatch handles them.

**Fork payload schemas (ADR-0019).** `fork_origin` Observation bodies carry
`{ parentSessionId, forkPointOffset, forkPointEventId,
parentForkPointTimestampNs }`. Parent-ledger fork collision Decisions carry
`eventType: 'fork.collision_choice'`, `chosenOption: 'new' | 'resume'`,
`existingChildSid`, `collisionDetected: true`, `collisionDetectedAt`, and
`resultingChildSid`. For `chosenOption: 'new'`, replay MUST consume the
recorded `resultingChildSid` and skip timestamp/preimage recomputation; for
`chosenOption: 'resume'`, `resultingChildSid` equals the existing child
reference.

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
(R2-1) is the field that L1 materializes into
`DecisionPayload.causalContextWindowSlice` and tags with
`commitmentMethod: 'declared'`; when omitted at
the boundary, L1 sets `commitmentMethod: 'fallback'` and leaves the slice
field `null`. The §2 per-tool-call signaling rule maps directly to the
Artifact `synthetic_output` sub-kind (M3) and the
`Request.subKind = 'tool_call'` / `Artifact.subKind = 'tool_output'` pair
for normal tool calls.

## 6.7 Mental Models (Hardware Scaffolding)

The CTD uses CPU/OS/database analogies to give readers a fast on-ramp into
the primitive vocabulary. These analogies are **orientation aids, not
executable opcode semantics** and not the architectural identity of
Crucible (ADR-0020; §1.6). They are removable without touching the
algebra.

| Primitive    | Hardware scaffolding analogy                  | What it actually is                                                                  |
|--------------|-----------------------------------------------|--------------------------------------------------------------------------------------|
| Request      | call args / dispatch operand                  | Typed emission of an intent (tool call, LLM call, sub-task spawn, user input).       |
| Observation  | load (memory/MMIO/peripheral read)            | Typed ingestion of state into the ledger (bootstrap, tool output, external input).   |
| Question     | trap / breakpoint / continuation              | Typed suspension awaiting an external answer (user, router, curator).                |
| Artifact     | store (memory write)                          | Typed materialization of a produced work-product linked to the Request that made it. |
| Decision     | conditional branch / commit                   | Typed commitment of control, with declared causal-context-window provenance.         |

The analogies were the *route in* for Aaron's original framing; the precision
reframing (ADR-0020) keeps them as scaffolding while moving the load-bearing
claim to **typed trace algebra**. One hardware analogy *did* motivate an
architectural change — the L3.5 Scheduler tier as the dispatch unit between
generator emission and router policy (ADR-0024; §1.1 inset). The remaining
analogies have not earned that promotion and should not be allowed to do so
without going through the §6.5 + governance-principle discipline.