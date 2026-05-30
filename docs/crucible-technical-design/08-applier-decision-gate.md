# §8 — Applier + DecisionGate (L4)

**Status:** FINAL (Phase 1, Lane 3). Authoritative; do not re-litigate locked decisions.
**Owner:** Alexander. **Reviewers:** Gabriel (Router handoff), Graham (transactional
guarantee), Valanice (DecisionGate UX). **Cross-refs:** §2 (boundary), §3 (WAL),
§5 (Router — Phase 2), §6 (primitives), §7 (generators), §9 (Aperture queue —
Phase 2), §11 (replay), §12 (runtime composition).
**Depth budget:** ≤3 pages.
**Hard dependency:** §12 (Applier lives inside `@akubly/crucible-runtime`; see §12.9).

The Applier is the **only** component allowed to translate an approved
proposal into a committed `Decision` primitive on L1. The DecisionGate is
the policy surface that decides whether a `proposed` Decision may proceed
to `approved` (and which proposals require human ACK before that).

## 8.1 Apply Protocol Interface

```ts
import type {
  PrescriptionResult, EventId, SessionId,
  Decision, DecisionPayload, LedgerWindowReader,
  ReadSetHasher, AppendProtocol, ApertureNotifier,
  StructuralApprovalQueue, RouterDecision,
} from '@akubly/crucible-boundary';

export interface Applier {
  /** Driven by the Router on each RouterDecision (§5). */
  onRouterDecision(rd: RouterDecision): Promise<ApplyOutcome>;

  /** Re-entry point used by §9 StructuralApprovalQueue after user ACK. */
  resume(proposalId: string, ack: StructuralAck): Promise<ApplyOutcome>;

  /** Issue a compensating Decision (see §8.6 rollback). */
  revert(decisionId: EventId, reason: string): Promise<ApplyOutcome>;

  /** Lifecycle state for observability + DecisionGate UI. */
  status(proposalId: string): ApplyState;
}

export type ApplyOutcome =
  | { kind: 'applied';  decisionId: EventId; commitOffset: number }
  | { kind: 'paused';   reason: 'awaiting-structural-ack'; queueEntry: string }
  | { kind: 'failed';   error: ApplyError }
  | { kind: 'rejected'; gate: DecisionGateRejection };
```

The Applier is wired into the runtime composition root (§12.9) with
constructor-injected collaborators: `AppendProtocol` (Roger §3),
`LedgerWindowReader` + `ReadSetHasher` (Laura §3.1/§3.2), `ApertureNotifier`
(Valanice §9), `StructuralApprovalQueue` (also §9). No singletons; one
Applier per session.

## 8.2 State Machine (R2-3 LOCK)

```
                 ┌────────────────────────────────────────────┐
                 │   proposed                                  │
                 │   (RouterDecision arrived; Applier owns it) │
                 └──────────┬─────────────────────────────────┘
                            │ DecisionGate.evaluate()
                ┌───────────┼────────────────┐
                ▼           ▼                ▼
            rejected     approved        approved
            (gate veto)  (data,          (structural,
                          auto-apply)     needs ACK)
                            │                │
                            │                │ enqueueStructuralProposal()
                            │                │ + Aperture.notify(level:'attention')
                            │                ▼
                            │       ╔══════════════════════════╗
                            │       ║ paused-awaiting-          ║
                            │       ║ structural-ack            ║ ◀── R2-3 SUB-STATE
                            │       ║ (Router has paused        ║
                            │       ║  dependentPaths[])        ║
                            │       ╚════════════┬═════════════╝
                            │                    │ user runs
                            │                    │ `crucible aperture
                            │                    │  approve <id>` → §9
                            │                    │ queue → re-emit
                            │                    │ RouterDecision → §5
                            │                    │ Router resumes →
                            │                    │ Applier.resume()
                            ▼                    ▼
                       ┌────────────────────────────┐
                       │  applying                   │
                       │  (1) read window slice      │
                       │  (2) compute commitment     │
                       │  (3) build DecisionPayload  │
                       │  (4) AppendProtocol.append  │
                       │      under ledger fence     │
                       └──────────┬─────────────────┘
                       success    │    failure
                          ▼       │      ▼
                     ┌─────────┐  │  ┌────────┐
                     │ applied │  │  │ failed │ (no row written; surfaced
                     └─────────┘  │  │        │  as Aperture attention)
                                  │  └────────┘
```

**Sub-state semantics (R2-3):** `paused-awaiting-structural-ack` is NOT a
durable storage state — it is a **projection** computed from L1
`structural_proposal_*` Observation rows (§6.3 canonical sub-kind family;
R2-3 lock: queue is pure projection). The Applier emits a
`structural_proposal_emitted` Observation when entering the sub-state and
a `structural_proposal_acked|rejected|expired` Observation on resolution.
Aperture's `StructuralApprovalQueue` (§9) recomputes from these rows on
every boot; the Applier does not own queue storage. Restart safety: on
runtime crash mid-pause, the next boot's queue projection still shows the
proposal as `pending`; resume is idempotent on `proposalId`.

**Terminology lock (PA-B1):** All structural-proposal lifecycle state is
carried exclusively by the §6.3 `structural_proposal_*` Observation
sub-kind family (`structural_proposal_emitted`, `structural_proposal_acked`,
`structural_proposal_rejected`, `structural_proposal_expired`). No other
artifact family (`structural-proposal-state:*`, Question-answer rows, etc.)
is canonical for this purpose. Projectors, Router resubscription, and
restart-recovery all key off this single sub-kind set.

**Handshake with §5 Router (Phase 2 contract surface — Gabriel will conform
to this lock):**

1. Router classifies proposal as `structural` → emits `RouterDecision { kind:
   'pause-dependent-paths', dependentPaths, structuralProposalId }`.
2. Applier transitions `proposed → paused-awaiting-structural-ack`, writes
   a `structural_proposal_emitted` Observation (§6.3), calls
   `ApertureNotifier.notify({ level: 'attention', kind: 'structural-proposal-pending' })`.
3. User runs `crucible aperture approve <proposalId>` (§9 / §13).
4. Aperture writes `structural_proposal_acked` Observation (§6.3), re-emits
   the `RouterDecision` (now `kind: 'apply'`).
5. Router consumes the re-emit, calls `Applier.resume(proposalId, ack)`.
6. Applier transitions `paused → applying → applied`; on success, Router
   resumes the paused `dependentPaths`.

## 8.3 Ledger-Position Fence (Pseudocode)

The fence ensures the Decision row commits at a known offset and that
subsequent reads see it. AppendProtocol's group-commit gives p99 ≤1ms
(Roger §3); the fence is the optimistic concurrency check that no other
writer slipped a row in between window-read and Decision-append.

```ts
async function applyWithFence(rd: RouterDecision): Promise<ApplyOutcome> {
  // (1) Snapshot the head offset BEFORE reading the window.
  const fenceStart = await ledger.head(rd.sessionId);

  // (2) Read the causal window slice. For Copilot SDK v1 (no declared
  //     window — §12.7), this is the full prefix [0, fenceStart).
  const slice = rd.declaredWindow
    ? await reader.readByIds(rd.sessionId, rd.declaredWindow)
    : await reader.readPrefix(rd.sessionId, 0, fenceStart);

  // (3) Compute the commitment hash + method tag (R2-1 LOCK).
  const commitment = hasher.hashWindow(slice);                         // 32-byte BLAKE3
  const method: 'declared' | 'fallback' =
    rd.declaredWindow ? 'declared' : 'fallback';

  // (4) Build the DecisionPayload (R2-5 propagation, §8.5).
  const payload: DecisionPayload = {
    rationale: rd.rationale,
    alternatives: rd.alternatives,
    contextWindowCommitment: commitment,
    causalContextWindowSlice: rd.declaredWindow ?? null,
    commitmentMethod: method,
    nonDominatedReason: rd.chosen.nonDominatedReason,                  // §8.5
    incomparableWith: rd.chosen.incomparableWith,
  };

  // (5) Atomic append with fence — AppendProtocol rejects if the head moved.
  const result = await append.appendFenced({
    sessionId: rd.sessionId,
    expectedHead: fenceStart,
    row: { primitiveKind: 'decision', primitivePayload: payload, parentId: rd.proposalId,
           causalReadSet: { primitiveIds: slice.map(r => r.id), projectionKeys: rd.projectionKeys, externalInputs: [] },
           /* ...envelope fields per §6.1 */ },
  });

  if (result.kind === 'fence-violation') {
    // Another writer raced us. Retry: re-snapshot head, re-read window,
    // re-hash, re-append. Bounded retries (3); then surface as 'failed'.
    return applyWithFence(rd);
  }
  return { kind: 'applied', decisionId: result.eventId, commitOffset: result.offset };
}
```

The fence is **single-writer-per-session** in v1 (decisions.md Round 2
Router lock); concurrent Appliers across sessions are independent. The
retry loop exists to absorb hook-bus-induced row insertions between read
and append (e.g., an audit hook emits an Observation row), not to support
multi-writer.

## 8.4 Context-Window Commitment + Method Tag (R2-1 LOCK)

Every Applier-written Decision carries:

- `contextWindowCommitment: string` — 32-byte BLAKE3 over CBOR-canonical
  serialization of the window slice (Laura §3.2 `ReadSetHasher`).
- `commitmentMethod: 'declared' | 'fallback'` — REQUIRED tag recording
  which §2.6 path was taken.
- `causalContextWindowSlice: EventId[] | null` — present iff `method ===
  'declared'`; the exact ids that were hashed, in order.

**Computation path** (collaborator chain):

```
RouterDecision.declaredWindow ──┬── present ──▶ LedgerWindowReader.readByIds()  → slice  ─┐
                                │                                                          ├──▶ ReadSetHasher.hashWindow() ─▶ commitment
                                └── absent  ──▶ LedgerWindowReader.readPrefix(0, head)    ─┘                  │
                                                                                                              ▼
                                                                                              DecisionPayload { commitment, method, slice? }
```

Replay equivalence (TDD §6.3): re-running the same Applier against the same
session ledger prefix produces a byte-identical `DecisionPayload` because
(a) `readByIds`/`readPrefix` are deterministic over the immutable ledger,
(b) `ReadSetHasher` is BLAKE3-over-CBOR with canonical ordering, (c)
`commitmentMethod` is derived purely from the input shape.

## 8.5 Non-Dominated Tiebreak Propagation (R2-5 LOCK)

When the Router surfaces a non-singleton `PrescriptionResult[]` (all
Pareto-non-dominated per §5 + §7), the Applier is the tiebreaker. The
rationale MUST be recorded on the emitted Decision so audit (CLI bisect,
Aperture leaderboard, replay) shows **what was chosen, what the alternatives
were, and whether they were `'optimal'` or `'incomparable'`**.

```ts
// On RouterDecision with multiple non-dominated prescriptions:
const chosen: PrescriptionResult = decisionGate.tiebreak(rd.candidates);  // policy-driven
const alternatives = rd.candidates.filter(c => c.id !== chosen.id).map(c => ({
  prescriptionId: c.id,
  nonDominatedReason: c.nonDominatedReason,   // 'optimal' | 'incomparable'
  incomparableAxes: c.incomparableWith ?? [],
  fitness: c.fitness,
}));

const payload: DecisionPayload = {
  /* ...as §8.3 step (4)... */
  nonDominatedReason: chosen.nonDominatedReason,
  incomparableWith: chosen.incomparableWith,
  alternatives,                                 // recorded for audit (§6 DecisionPayload.alternatives)
  rationale: `Tiebreak: ${chosen.id} chosen over ${alternatives.length} non-dominated alternative(s) via ${decisionGate.policy}.`,
};
```

The `alternatives[]` field on `DecisionPayload` (§6.2) is the audit record.
Aperture's leaderboard (§9) and CLI JSON output (§13) read it directly; no
separate audit log.

## 8.6 DecisionGate Specification

The DecisionGate is a **pure policy function** consulted in the `proposed →
approved | rejected | paused` transition. It is NOT a UI surface (that is
Aperture §9 + CLI §13); it is the rule engine those surfaces wrap.

```ts
export interface DecisionGate {
  evaluate(p: ProposedDecision): GateVerdict;
  readonly policy: string;     // human-readable policy name for audit
}

export type GateVerdict =
  | { kind: 'approve';        autoApply: true }
  | { kind: 'approve-with-ack'; queueAs: 'structural' }   // → §9 queue
  | { kind: 'reject';         reason: DecisionGateRejection };
```

Default policy (v1):

- `trustTier: 'builtin'` + `subKind ∈ data-only` → `approve { autoApply }`.
- `subKind ∈ structural` (any tier) → `approve-with-ack` (R2-3).
- `trustTier: 'external'` → `approve-with-ack` regardless of subKind.
- Anything else (e.g., hook verdict was `pause` per §4) → `reject`.

Policy is **session-pinned** (TDD-Q3 lock: no live policy reload — agentic
cost framing). Mid-session policy edits don't apply; new policy takes
effect at next session start, recorded in `BootstrapPayload` so replay sees
the same policy that produced the original Decisions.

## 8.7 Rollback / Revert Semantics

L1 is append-only (Laura §6.1); the Applier never UPDATEs or DELETEs.
"Rollback" means emitting a **compensating Decision** that explicitly
nullifies the effect of a prior Decision:

```ts
async revert(decisionId: EventId, reason: string): Promise<ApplyOutcome> {
  const original = await reader.readById(decisionId);
  // Compensating Decision: parentId points at original; rationale documents the revert.
  return applyWithFence({
    kind: 'apply',
    proposalId: `revert:${decisionId}`,
    rationale: `REVERT ${decisionId}: ${reason}`,
    alternatives: [{ revertedDecisionId: decisionId, originalRationale: original.payload.rationale }],
    declaredWindow: null,                       // fallback path
    chosen: { id: `revert:${decisionId}`, nonDominatedReason: 'optimal', incomparableWith: [] },
    candidates: [],
    projectionKeys: [],
  });
}
```

This pattern preserves replay equivalence (the original Decision is still
in the ledger; replay re-applies it; the compensating Decision is also
replayed in order) and gives Aperture's investigation surface (§9) a clean
causal link between revert and target via `parentId`.

## 8.8 Aperture Notification Integration

The Applier emits `ApertureNotifier.notify(...)` calls on these
transitions:

| Transition                                  | Notification level | Purpose |
|---------------------------------------------|--------------------|---------|
| `proposed → paused-awaiting-structural-ack` | `attention`        | R2-3: structural proposal needs ACK; NEVER `urgent` (per §9 TDD-Q3 lock — no blocking modal). |
| `applying → failed`                         | `attention`        | Surface apply failure to the user with full payload + error. |
| `applying → applied` (when `revert`)        | `notice`           | Compensating Decision posted; visible in dashboard, not push. |
| `applying → applied` (normal, builtin tier) | (silent)           | High volume; visible in causal slice on demand, not pushed. |

The Applier itself does NOT subscribe to Aperture; it only emits. Aperture's
projection layer (§9) consumes the `structural-proposal-state` Observations
the Applier writes and renders the queue.

## 8.9 Acceptance Signal

This section is sufficient for:

- **Laura A1** (fork-with-altered-verdict re-apply): the Applier's `resume`
  + `revert` surfaces compose to give A1's "apply on child session" path.
- **Laura A10** (structural ACK → apply): the §8.2 sub-state + §8.8
  notification path are the contract A10 exercises.
- **TDD §6.2 Hash-Chain Integrity** (Applier-written Decision commitments):
  §8.4 specifies the computation; the property test mocks
  `LedgerWindowReader` + `ReadSetHasher` per Laura §3.
- **§13 CLI** (Valanice): `crucible decide approve/reject/defer` verbs
  are thin wrappers over `Applier.onRouterDecision` / `Applier.resume`;
  `crucible revert <decisionId>` wraps `Applier.revert`.
- **§5 Router** (Gabriel, Phase 2): the `RouterDecision` shape consumed in
  §8.1/§8.3 and the resume re-emit handshake in §8.2 are the contract
  surface §5 must conform to.
- **§9 Aperture** (Valanice, Phase 2): the `structural-proposal-state`
  Observation sub-kinds + notification levels in §8.8 are the contract
  surface §9 queue projection consumes.
