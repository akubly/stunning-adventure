# §5 — Router Design (L4)

**Status:** FINAL (Phase 1, Lane 5). Authoritative; do not re-litigate locked decisions.
**Owner:** Gabriel (Infrastructure / Router / Observability).
**Cross-refs:** §3 (L1 WAL), §4 (Hook Bus), §6 (Primitive Taxonomy), §7 (Generators / `PrescriptionResult`), §8 (Applier), §9 (Aperture).
**Depth budget:** ≤3 pages.

The Router is L4 — the single policy choke-point. It consumes proposals from L3
generators (§7) and `pause` verdicts from the L1 Hook Bus (§4), evaluates them
against a versioned policy table indexed by primitive kind (§6) and source
trust-tier, and emits exactly one canonical event per routing outcome
(`RouterDecision`). The Applier (§8) is the only consumer authorised to mutate
world state; the Router never picks a single prescription out of a non-dominated
set and never reloads policy live.

## 5.1 Policy Table Schema

Policies are matched by `(primitive_kind, source_tier, predicate) → action`.
The table is part of L1 WAL state (§5.5); rows are appended via Decision
primitives, never mutated in place.

```ts
type RouterAction =
  | 'auto-approve'
  | 'escalate'          // → user via Aperture queue (data proposals)
  | 'pause-dependents'  // → structural; pause dependentPaths[] until ack
  | 'sandbox'           // → run in restricted scope (external tier default)
  | 'veto';             // → reject; never reaches Applier

interface PolicyRow {
  policyId: string;                       // ULID
  policyVersion: number;                  // monotonically increasing
  primitiveKind: PrimitiveKind;           // §6 — 5-value enum
  sourceTier: TrustTier;                  // §6 — builtin | adopted | community | external
  predicate: PredicateRef;                // registered predicate id + version (§4)
  action: RouterAction;
  rationale: string;                      // human-readable; surfaces in RouterDecision.reason
  registeredAt: Timestamp;
  registeredBy: EventId;                  // Decision row that installed this policy
}
```

**Tier dimension (Round 2.3 lock):** every row carries `sourceTier`. The
default-most-restrictive ordering is `external > community > adopted > builtin`;
identical `(kind, predicate)` pairs MAY have different actions per tier. The
Trust-Tier Monotonicity invariant (`docs/crucible-tdd-strategy.md` §6.7) is enforced at policy-install
time: a policy that downgrades a tier's effective privilege MUST be paired with
an explicit revocation Decision.

**Default deny:** any `(kind, tier)` pair without a matching row resolves to
`escalate` (data) or `pause-dependents` (structural). The Router NEVER picks
`auto-approve` by absence.

## 5.2 Proposal Lifecycle State Machine

The Router no longer pulls proposals directly from L3 (§7). The L3.5 Scheduler
(§5.A, see below) owns dispatch order; the Router consumes proposals only after
the Scheduler has emitted a `scheduler_dispatched` Decision naming the proposal.
The `dispatched_pending` state is the precursor: a generator-emitted proposal
sits in the Scheduler's queue until dispatched, at which point it enters
`submitted` on the Router's machine. L3 → L3.5 → L4 is the canonical flow.

```
                ┌──────────────────────┐
                │  dispatched_pending  │  (in Scheduler queue; awaits scheduler_dispatched)
                └──────────┬───────────┘
                           │ scheduler_dispatched Decision (§5.A)
                           ▼
                ┌──────────────┐
                │  submitted   │  (proposal handed to Router, or pause verdict from §4)
                └──────┬───────┘
                       │ PolicyEngine.evaluate()
                       ▼
                ┌──────────────┐
        ┌───────│   routed     │───────┐
        │       └──────┬───────┘       │
        │              │               │
        │ data path    │ structural    │ veto
        ▼              ▼               ▼
   ┌─────────┐  ┌──────────────────┐  ┌──────────┐
   │ applied │  │ paused-awaiting- │  │ rejected │
   │ (§8)    │  │ structural-ack   │  └──────────┘
   └─────────┘  └────────┬─────────┘
                         │ StructuralAck (from §9 Aperture)
                         ▼
                  ┌──────────────┐
                  │   applied    │  (Router re-emits RouterDecision proceed; §8 picks up)
                  └──────────────┘
                         │ StructuralReject
                         ▼
                  ┌──────────────┐
                  │   rejected   │
                  └──────────────┘
```

`paused-awaiting-structural-ack` is the R2-3 LOCK sub-state. It is **not**
stored in a side table; it is materialised by the L2 `aperture_events`
projection from the `RouterPaused` Decision row plus any subsequent
`structural_proposal_acked|rejected|expired` Observation rows (§6.3
canonical sub-kind family; §9 writes the resolution Observations on user
action). The Router itself is stateless across restart with respect to
paused work — on boot it scans L1 for `RouterPaused` rows without a
corresponding `structural_proposal_acked` Observation and re-subscribes.

**Terminology lock (PA-B1):** all structural-ack lifecycle state is carried
by the §6.3 `structural_proposal_*` Observation sub-kind family. See §8.2
for the canonical sub-kind enumeration.

## 5.3 Verdict Ack Protocol (Gabriel ↔ Valanice §9 Sync Pair)

Two event families cross the boundary; both are recorded as L1 primitives so
that R2-3's "queue is a pure projection" lock holds.

**Router → Aperture (Decision rows, written by Router):**

```ts
interface RouterPausedPayload {
  eventType: 'router.paused';                   // discriminator
  proposalId: EventId;                          // the structural proposal that triggered the pause
  dependentPaths: EventId[];                    // §7 StructuralProposalGenerator.dependentPaths
  policyId: string;                             // matched PolicyRow.policyId
  policyVersion: number;
  predicateRef: PredicateRef;
  sourceTier: TrustTier;
  reason: string;                               // PolicyRow.rationale + bound primitive context
  queueDeadline: Timestamp | null;              // optional; null = no auto-expire
}

interface RouterDecisionPayload {
  eventType: 'router.decision';
  proposalId: EventId;
  outcome: 'apply' | 'reject' | 'resume';       // 'resume' = follow-up after StructuralAck
  policyId: string;
  policyVersion: number;
  predicateRef: PredicateRef;
  sourceTier: TrustTier;
  prescriptionCandidates: PrescriptionRef[];    // FULL non-dominated set; §5.7
  reason: string;
  causedBy: EventId | null;                     // ack/reject Question that triggered 'resume'/'reject'
}
```

Both payloads are wrapped in a `Decision` primitive (§6.2) and inherit the
common envelope, including `causalReadSet` (policy rows + paused proposal +
any ack row consulted). `parentId` points at the originating proposal.

**Aperture → Router (Question-answer rows, written by §9 on user action):**

```ts
interface StructuralAckPayload {
  eventType: 'aperture.structural-ack';
  pauseEventId: EventId;                        // the RouterPaused row being acked
  proposalId: EventId;                          // mirror for projection convenience
  userVerdict: 'ack' | 'reject';
  userNote: string | null;
  ackedAt: Timestamp;
}
```

This payload rides inside a `Question` primitive with
`expectedAnswerShape: 'structural-ack'` (§6.2) when the user is being asked.
The user's answer is recorded by Aperture (§9) as a follow-up `Observation`
whose `subKind` is one of the dedicated structural-proposal sub-kinds
(`structural_proposal_acked` | `structural_proposal_rejected` |
`structural_proposal_expired`, §6.3) and whose `body` is the
`StructuralAckPayload` above. The Router subscribes (via L2 projection tail)
by `(primitiveKind, subKind)` — matching `primitiveKind === 'observation'`
and `subKind ∈ {structural_proposal_acked, structural_proposal_rejected,
structural_proposal_expired}` — rather than by `body.eventType`; this keeps
subscriber dispatch off body parsing and aligned with the §3.3.1 sub-kind
index. On a matching observation whose `pauseEventId` resolves to an
outstanding `RouterPaused` row, the Router emits a `RouterDecisionPayload`
with `outcome: 'resume' | 'reject'` and `causedBy: <observation EventId>`.
The `aperture.structural-ack` `eventType` discriminator remains on the
payload for human-readable trace inspection but is no longer load-bearing
for subscription routing (Phase 1 synthesis §0.3 finding 6b resolution).

**Contract guarantees for §9 author:**
1. The Router emits **exactly one** `router.paused` per structural proposal
   accepted into the queue. Aperture's projection MAY assume idempotency by
   `proposalId`.
2. The Router emits **exactly one** terminal `router.decision`
   (`outcome ∈ {apply, reject, resume}`) per `router.paused`. `resume` and
   `apply` are distinct events: `resume` carries `causedBy`; `apply` (for
   data-path proposals that never paused) does not.
3. Aperture MAY emit at most one terminal `aperture.structural-ack` per
   `pauseEventId`. Duplicates are dropped by the Router with a structured
   warning event (not a new `RouterDecision`).

## 5.4 `RouterDecision` Event Shape (canonical observability surface)

The `router.decision` payload above (§5.3) is the **only** event the Router
emits for routing outcomes. Aperture's leaderboard, the CLI shell (§13), and
any L5 investigation tool (Sonny) consume the same row by subscribing to
`Decision` primitives with `primitivePayload.eventType === 'router.decision'`.
There is no separate observability channel; the L1 ledger IS the channel
(replayability lock §5.5).

## 5.5 Replayability Rationale — No Live Policy Reload

Policy table mutations go through normal proposal flow: a Decision row with
`eventType: 'router.policy-install'` (or `'router.policy-revoke'`) is appended
via the same Router that consumes its output. Replaying the ledger
reconstructs the policy table state at any offset by reducing these rows in
order.

**Why no hot reload:** TDD Q7 zero-tolerance + agentic-cost framing. Hidden
control-plane state breaks the §6.5 Hook Verdict Consistency invariant
(identical input → identical verdict) because verdict-at-time-T depends on
policy-at-time-T which must be derivable from the ledger prefix alone. Live
reload is an agentic-cost inversion: cheap to skip (just append a proposal),
expensive to debug when a replay diverges. The Router refuses any
configuration source other than the WAL.

## 5.6 Debugger Verdict Extension Point

L5 investigation plugins (e.g., Sonny's time-travel debugger) register
additional verdict kinds via the same predicate registry the Hook Bus uses
(§4). A registered debugger predicate receives the same `(primitive, metadata)`
tuple `PolicyEngine.evaluate()` sees, and may emit one of:

```ts
type DebuggerVerdict =
  | { kind: 'observe-only' }                          // record, do not mutate routing
  | { kind: 'shadow-route'; alternateAction: RouterAction }  // recorded for replay diffing
  | { kind: 'breakpoint'; reason: string };           // raises a Question to user
```

Debugger verdicts NEVER change the canonical `RouterDecision` outcome (that
would break replay). They are recorded as sibling `Observation` rows with
`parentId = <RouterDecision EventId>` and surface in Sonny's bisect/causal-slice
views. Registration is a structural proposal itself (extension point is policy-
governed, not free-for-all).

## 5.7 Pareto Non-Dominated Handling (R2-5 LOCK)

When the Router evaluates a `PrescriptionResult` set from §7, it MUST surface
the **full non-dominated set** on `RouterDecisionPayload.prescriptionCandidates`
with each candidate tagged by `nonDominatedReason: 'optimal' | 'incomparable'`
(field name owned by §7; the Router propagates verbatim). The Router NEVER
collapses the set, never picks a representative, never zero-fills missing
axes. Tiebreaking among non-dominated candidates is the Applier's job (§8)
per Alexander's spec; the Router's job is to present the candidates honestly
so that downstream tiebreak rationale is auditable.

If the set is a singleton, `prescriptionCandidates.length === 1` and
`nonDominatedReason` is still required. The Aperture leaderboard (§9) renders
the `[incomparable-axes]` badge directly from this field.

## 5.8 Structural-vs-Data Classification

Classification is determined by the generator type (§7): a proposal emitted
by a `StructuralProposalGenerator` is structural and carries `dependentPaths:
EventId[]`; everything else is data. The Router's classifier is a single
pattern match on the generator's declared interface — it does NOT re-derive
classification from payload heuristics, because that would couple L4 to L3
internals and break the §6.7 Trust-Tier Monotonicity proof obligation (tier
attribution must be carried, not inferred).

On structural classification:
1. PolicyEngine evaluates; if action ≠ `veto`, the Router writes ONE
   `RouterPaused` Decision per structural proposal carrying the full
   `dependentPaths[]` array (matches §5.3 `RouterPausedPayload` shape and
   §8.2 consumer contract). Per-path pause state is an L2 projection
   concern: the projector derives which paths are still blocked by
   cross-referencing the single `RouterPaused` row against subsequent
   `router.decision{outcome:'resume'}` rows (PA-B2 alignment).
2. Applier (§8) sees the `paused-awaiting-structural-ack` sub-state on its
   own state machine via the same projection and refuses to apply any
   primitive whose causal ancestry intersects a paused path.
3. On `structural_proposal_acked` Observation (§6.3), the Router emits one
   `router.decision` with `outcome: 'resume'` covering all `dependentPaths`
   from the original `RouterPaused` row (idempotent re-emission tolerated).

## 5.9 Collaborator Name Alias Map

| CTD name (this section) | Laura §3.5 collaborator name |
|-------------------------|------------------------------|
| `PolicyEngine` (§5.1)   | `PolicyEngine`               |
| Structural pause queue  | `EscalationQueue` (§9 owns)  |

The Router's `PolicyEngine` collaborator is the same interface Laura tests
with stubs/spies. `EscalationQueue` is owned by Aperture (§9); the Router
only writes the source-of-truth Decision rows.

## 5.A L3.5 Scheduler Tier

> **Implementation staging (PA-FifoScheduler):** Phase 0.5 walking skeleton
> uses a `FifoScheduler` stub — FIFO dispatch order, no quanta budgeting, no
> back-pressure, emits `scheduler_dispatched` immediately for every arriving
> proposal. This proves the L3.5 tier boundary exists without the complexity.
> Phase 1 replaces the stub with the full `WeightedRoundRobinScheduler`
> specified in §5.A.3–§5.A.4. The `FifoScheduler` is a valid Scheduler
> implementation (it satisfies A-Sched-1 replay-ordering) and may serve as a
> test-harness default permanently.

The Scheduler is L3.5 — a thin tier between L3 generators (§7) and L4 Router
policy. It exists because L3 proposal emission is asynchronous, potentially
parallel across generators, and budget-bound, while the Router is a stateless
policy choke-point that must see one proposal at a time in a deterministic
order. Hardware analog: L3 generators are independent execution units emitting
micro-ops; the Scheduler is the dispatch / reservation-station tier; the
Router is the retire / commit stage. **Scheduler decides WHICH proposal
advances and IN WHAT ORDER; Router decides WHETHER (apply / reject / pause).**
The two concerns never collapse into one stage — that would re-introduce the
L3-as-junk-drawer risk Erasmus flagged (US-E-13).

### 5.A.1 Responsibility

The Scheduler consumes the generator proposal queue (the union of all L3
`propose()` emissions per §7.1), and per dispatch tick selects zero or more
proposals to advance to the Router. For each selection it appends one
`Decision` row to L1 (§3 accepts the `scheduler_*` sub-kinds enumerated
below); the Router subscribes to that dispatch stream by
`(primitiveKind === 'decision', subKind ∈ scheduler_*)` and processes
proposals in `scheduler_dispatched` arrival order. Generators NEVER hand
proposals to the Router directly in v1.

### 5.A.2 `scheduler_*` Decision Sub-Kinds (v1 minimal set)

| sub-kind                      | body fields                                                                                              | meaning                                                                                |
|-------------------------------|----------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `scheduler_dispatched`        | `proposalId: EventId`, `generatorId: string`, `priority: number`, `quantaConsumed: number`, `queueDepthAtDispatch: number` | Proposal moved to Router queue at the given priority. Router state machine §5.2 enters `submitted` on consumption. |
| `scheduler_deferred`          | `proposalId: EventId`, `generatorId: string`, `reason: 'backpressure' \| 'quanta_exceeded' \| 'priority_starved'`, `routerQueueDepth: number` | Proposal held in the Scheduler queue; will be reconsidered on a later tick.            |
| `scheduler_cancelled`         | `proposalId: EventId`, `generatorId: string`, `reason: 'budget_exhausted' \| 'stale' \| 'superseded'`, `supersededBy: EventId \| null` | Proposal dropped without reaching the Router. `superseded` carries the EventId of the replacing proposal (e.g., a newer generator emission obsoletes an in-flight one). |
| `scheduler_quanta_exhausted`  | `generatorId: string`, `windowStart: Timestamp`, `windowEnd: Timestamp`, `quantaBudget: number`, `quantaConsumed: number` | Budget window closed for a generator; future emissions from that generator are deferred until the next window. |

These four cover the v1 dispatch lifecycle. Roger's §3 WAL accepts them as
new `Decision` sub-kinds; no new primitive kind is introduced. Body shapes
are owned here, validated at append per §3.3.1.

### 5.A.3 Budget Allocation Policy (v1)

Round-robin across registered generators with per-generator quanta. A
quantum is one dispatch slot per scheduling tick; the per-generator budget
is `floor(totalQuantaPerTick * generatorWeight / sumWeights)`, with weights
sourced from session-scoped policy rows (one Decision row per weight
install, replayable per §5.5). Tier acts as a tiebreaker: at equal weight,
`builtin > adopted > community > external`. When a generator exhausts its
quanta in a tick, the Scheduler emits `scheduler_quanta_exhausted` once
and defers further proposals from that generator until the next window.
v1 is fixed-window; learning-based scheduling (predictive priority from
prior `RouterDecision` outcomes) is a v1.5+ extension and slots into the
same dispatch interface — no schema change required.

### 5.A.4 Back-Pressure Protocol

The Scheduler tracks Router queue depth via the L2 projection of
unconsumed `scheduler_dispatched` rows minus terminal `router.decision`
rows. When depth exceeds threshold `N` (default 16; configurable per
session via policy row), every new proposal arriving at the Scheduler is
emitted as `scheduler_deferred{reason: 'backpressure'}` rather than
`scheduler_dispatched` until depth drops below the low-water mark `N/2`.
This is the dispatch-side dual of §4.5 observe-queue sampling: bounded
queue, explicit drop reason, no silent loss. Deferred proposals remain in
the Scheduler queue; they are reconsidered on the next tick.

### 5.A.5 Hook Bus Interaction (§4)

The Scheduler is an L1Subscriber on the Hook Bus verdict stream. A `pause`
verdict (§4.4) from any predicate increments a per-generator back-pressure
counter for the implicated generator; while the counter is non-zero, that
generator's proposals are deferred with `reason: 'backpressure'`. The
counter decrements when the paused row is restaged (§3.5 seal-and-split
completion). This keeps Scheduler dispatch decisions consistent with hook
verdicts without coupling the Scheduler to Hook Bus internals — it
consumes verdict events via the same `(primitiveKind, subKind)` projection
pattern §17.1 documents.

### 5.A.6 Replay Determinism

Scheduler dispatch order is **recorded, not recomputed**. The
`scheduler_dispatched` Decision stream IS the dispatch log: on replay, the
Router re-feeds from that stream in EventId order; the Scheduler does NOT
re-evaluate weights, quanta, or back-pressure during replay. This is the
same discipline §5.5 applies to policy: any control-plane decision whose
re-derivation would depend on wall-clock or non-deterministic generator
arrival order is captured as an L1 Decision and replayed verbatim.
Property: for any ledger prefix, the sequence of proposals reaching the
Router under replay equals the sequence under the original run, modulo
EventId reads. §11 oracle treats Scheduler divergence as a
`scheduler_dispatch` divergence kind (additive to the §11.6 enum; flagged
to Roger and §11 owner at synthesis).

### 5.A.7 Acceptance Signals

This subsection is sufficient for Laura to write:
- **A-Sched-1** (dispatch ordering preserved across replay) — round-trip
  a session through §11 replay; assert the sequence of
  `scheduler_dispatched.proposalId` values matches.
- **A-Sched-2** (back-pressure asserts under load) — saturate the Router
  queue with synthetic proposals; assert `scheduler_deferred` rows appear
  with `reason: 'backpressure'` once depth exceeds `N`.
- **A-Sched-3** (quanta exhaustion fires per generator per window) —
  drive one generator past its budget; assert exactly one
  `scheduler_quanta_exhausted` per window per generator.

## 5.10 Acceptance Signals

This spec is sufficient for Laura to write:
- **A3** (pre-commit hook veto prevents primitive append) — Router consumes
  `pause` verdicts from §4 and writes `RouterPaused` Decisions; Applier
  refuses paused-ancestry primitives.
- **A10** (Router policy escalation for structural changes) — full §5.2
  state-machine path including `paused-awaiting-structural-ack` resume.
- **A12** (marketplace extension trust gradient) — tier dimension on
  PolicyRow + default-deny for `external` tier.
- **§6.5 Hook Verdict Consistency** invariant — replayability rationale
  (§5.5) makes verdict purely a function of ledger prefix.
- **§6.7 Trust-Tier Monotonicity** invariant — install-time enforcement on
  PolicyRow (§5.1) plus tier-as-attribution discipline (§5.8).

No locked decisions are re-litigated. Sync pair with Valanice (§9) is
satisfied by the event-shape contract in §5.3 — no further alignment required
before Phase 2.
