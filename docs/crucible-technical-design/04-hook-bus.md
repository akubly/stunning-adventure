# §4 — Hook Bus

**Status:** FINAL (Phase 1, Lane 1). Authoritative; do not re-litigate locked decisions.
**Owner:** Roger. **Secondary:** Gabriel (Router-side pause receipt), Laura (P1–P5).
**Cross-refs:** §3 (L1 WAL Substrate), §5 (Router), §6 (Primitive Taxonomy),
§11 (Hermetic Replay).
**Depth budget:** ≤3 pages.

The pre-commit hook bus is Crucible's real-time safety floor. It fires
**per row, inside the §3.5 group-commit window, before the fsync barrier**,
against the staged batch. The bus is load-bearing for correctness alongside
the Router; pause is the only verdict that mutates downstream control flow,
and pause verdicts are durable in the WAL before any subscriber dispatch
(exactly-once-pause via crash recovery).

## 4.1 Verdict Enum

```ts
type HookVerdict = 'continue' | 'observe' | 'pause';
```

Semantics against the in-flight group commit:

| Verdict    | Effect on the staged batch                                                       | WAL recording                                       | Subscriber routing |
|------------|----------------------------------------------------------------------------------|-----------------------------------------------------|--------------------|
| `continue` | Row joins `committed` unchanged. Default verdict when no predicate matches.       | `hookVerdict = continue`; `hookVerdictWitness = null`. Zero-cost per P5. | None |
| `observe`  | Row joins `committed`; an attention-tier signal is emitted. Does not stall.        | `hookVerdict = observe`; `hookVerdictWitness = blake3(witnessBody)` in CAS. | Bus dispatches to `observe`-subscribed sinks (Aperture, Curator on opt-in). |
| `pause`    | Row joins `committed` with the pause verdict durable; subsequent rows in the batch are restaged via §3.5 seal-and-split. | `hookVerdict = pause`; `hookVerdictWitness` durable. | Bus broadcasts to the Router (§5) via L1Subscriber on the paused row. |

`continue` is the default when no registered predicate matches the row's
primitive kind; the WAL row stores `hookVerdict = null` in that case to
distinguish "no predicate fired" from "a predicate fired and said continue."
Both are zero-witness; only the bookkeeping distinguishes them.

## 4.2 Predicate Registration and Kind-Indexed Dispatch

Predicates are pre-registered, compiled at registration time, and indexed by
`primitiveKind` (§6.1). The bus never invokes a predicate against a kind it
does not declare interest in. Up to ~50 compiled predicates per kind stay
inside the 80 µs row-stage budget.

```ts
interface PreCommitHookBus {
  register(reg: PredicateRegistration): PredicateHandle;
  unregister(handle: PredicateHandle): void;
  dispatch(staged: WalRowDraft[]): Array<HookVerdict | null>;  // parallel to staged; null = no predicate matched
  subscribe<V extends 'observe' | 'pause'>(verdict: V, sink: VerdictSink<V>): Subscription;
}

interface PredicateRegistration {
  id: string;                                       // stable, content-addressed
  version: string;                                  // bumped on edit; both id + version recorded per fired verdict
  primitiveKinds: PrimitiveKind[];                  // kind-indexed dispatch input
  subKinds?: string[];                              // optional second-level filter
  budgetMicros: number;                             // declared per-evaluation budget; bus enforces ≤80 µs hard cap
  evaluate: (row: WalRowDraft, ctx: PredicateContext) => HookVerdict;
  witnessShape?: 'minimal' | 'full';                // CAS body verbosity for observe/pause
}

interface PredicateContext {
  readSet: ReadSetView;                             // resolved against CAS, mmap'd
  policyVersion: string;                            // active policy at evaluation time (R4 lock)
  ledgerWindow: LedgerWindowReader;                 // read-only prefix access
}
```

Registration is itself recorded as an `Observation{subKind:
'predicate_registered'}` row at registration time so the predicate set is
reconstructible from the WAL. Unregistration emits a paired
`'predicate_unregistered'` Observation. Replay (§11) loads the predicate set
by walking these rows up to the offset under test.

## 4.3 Bus Dispatch Pseudocode + 80 µs Budget

```pseudo
PreCommitHookBus.dispatch(staged: WalRowDraft[]) -> Array<HookVerdict | null>:
    verdicts := []
    for row in staged:
        matched := kindIndex.lookup(row.primitive.primitiveKind, row.subKind)
        if matched.isEmpty():
            verdicts.append(null)                     # no predicate matched; P5 zero-cost
            continue
        rowVerdict := 'continue'                      # default when a predicate matches but all say continue
        rowWitnesses := []
        rowBudget := 80µs                             # hard per-row cap
        for predicate in matched:                     # deterministic registration order
            withTimeout(min(predicate.budgetMicros, rowBudget)):
                v := predicate.evaluate(row, ctx(row, predicate))
            onTimeout:
                v := 'observe'                        # fail-open with a witness
                emitAttention('predicate_timeout', predicate.id, row.commitOffset)
            rowBudget -= elapsed()
            if v != 'continue':
                rowWitnesses.append({ predicateId: predicate.id,
                                      predicateVersion: predicate.version,
                                      policyVersion: ctx.policyVersion,
                                      verdict: v })
            if v == 'pause':
                rowVerdict := 'pause'
                break                                  # short-circuit; pause dominates
            elif v == 'observe' and rowVerdict == 'continue':
                rowVerdict := 'observe'
            if rowBudget <= 0:
                emitAttention('row_budget_exhausted', row.commitOffset)
                break
        if rowVerdict != 'continue':
            row.hookVerdictWitness := casWrite(cbor({ verdict: rowVerdict,
                                                       witnesses: rowWitnesses }))
        row.hookVerdict := rowVerdict
        verdicts.append(rowVerdict)
        if rowVerdict == 'pause':
            break                                      # caller invokes §3.5 sealAndSplit
    return verdicts
```

**Per-predicate 80 µs budget breakdown:** see §3.11. Total per-batch budget
is `80 µs × rows in batch`, hard-capped at the session-configured ceiling
(default 8 ms). Over-budget predicates **time out and fail open** by emitting
an `observe` verdict plus an Aperture attention-tier event — they never
silently drop, and they never block the commit.

**Pause short-circuit.** As soon as any predicate returns `pause`, the bus
stops dispatching against further predicates for that row and returns the
verdict array up to and including the paused row. The caller (§3.5
`sealAndSplit`) seals rows `0..i` and restages rows `i+1..end`.

## 4.4 Seal-and-Split Protocol (Cross-Ref §3.5)

The bus does not perform the split itself; it delivers the verdict array.
`AppendProtocol.append` (§3.4) interprets the array:

1. Rows `0..i` where `i` is the index of the first `pause` (or all rows if
   no pause) are written, hash-chained, CAS-flushed, and `fdatasync`'d in
   one barrier (§3.5).
2. The paused row at index `i` carries its `hookVerdict = pause` and
   `hookVerdictWitness` durably; the §3.9 L1Subscriber broadcast on this
   row is the Router's (§5) inbound pause notification.
3. Rows `i+1..end` are restaged with a `restagedFromOffset` annotation.
   `L1Subscriber.onSealAndSplit` is fired so Aperture (§9) can render the
   split for investigation.

Exactly-once-pause: because the paused row is durable *before* any
subscriber dispatch, a crash between seal and broadcast replays the
broadcast from the WAL on next boot. The Router never sees a pause twice;
the WAL row's `hookVerdict` field is the source of truth.

## 4.5 Backpressure and Subscription Policy

Subscribers opt in per verdict type (`observe` or `pause`); there is no
"all verdicts" subscription. Per Gabriel's Router verdict §6 and Roger's
hook bus signoff R3:

- **`pause` subscriptions are unbounded.** Pause is load-bearing for safety;
  the bus blocks the WAL append if the subscriber queue is full. In practice
  there is exactly one pause subscriber (the Router, §5) and its queue is
  bounded by Router's own ack budget (50 ms per Gabriel's verdict).
- **`observe` subscriptions are bounded and droppable.** Each subscriber
  declares a queue depth and a sampling rate. When the queue overflows,
  the oldest observe verdict is dropped and an Aperture attention-tier
  event records the drop. Per-subscriber drop counters are themselves
  recorded as periodic `Observation` rows so replay sees the loss.
- **Mirror / Curator / Alchemist** do not auto-subscribe; subscriptions
  require explicit written justification (Gabriel's signoff §6 NOT-yet-
  endorsing item b).
- **Bus-side sampling only.** Subscribers do not sample on their own side;
  the bus exposes a `sampleRate` knob per subscription to keep sampling
  deterministic and replay-reproducible.

## 4.6 WAL Field Cross-Reference

The §3.3 WAL row schema carries the bus's output:

| §3.3 field             | Set by §4 when               | Value                                             |
|------------------------|------------------------------|---------------------------------------------------|
| `hookVerdict`          | dispatch returns non-null    | `'continue' \| 'observe' \| 'pause'`              |
| `hookVerdictWitness`   | `hookVerdict ∈ {observe, pause}` | BLAKE3 of CBOR-canonicalized witness body in CAS |
| `flags.taskBoundary`   | unchanged by §4              | Hook bus does not synthesize task boundaries      |

The witness body (`HookVerdictWitness` CAS blob) contains the fired
predicate IDs, predicate versions, policy version (R4 LOCK), the row's
`readSetHash`, the row's `commitOffset`, and the per-predicate verdict
tuple. This is the structural payload replay (§11) and investigation (L5)
read to reconstruct *why* a non-`continue` verdict fired.

## 4.7 Replay Recording (Per P1–P5)

Replay reproduces verdict paths byte-for-byte using only the recorded
witness body plus the predicate registration history (§4.2). The recording
rules are:

1. **P1 — No observe leak.** Replay re-evaluates predicates against the
   same `readSet` snapshot; an observe in original ⇒ observe in replay.
2. **P2 — Exactly-once-pause.** The paused row's `hookVerdict = pause` is
   durable; replay does not re-fire the pause through the Router. Replay's
   Router subscriber is a no-op sink; the assertion is that the WAL row
   carries the pause verdict, not that the Router acks it again.
3. **P3 — Closed enum.** Verdicts outside `{continue, observe, pause}` are
   a structural error; replay refuses to load such a row.
4. **P4 — Ordering within primitive.** Predicate dispatch order is
   deterministic by registration order; the witness body records this
   order, and replay asserts equality.
5. **P5 — `continue` zero-cost.** `continue` verdicts are not recorded
   (no witness body). Replay counts a missing witness as `continue` by
   construction; this is the structural invariant that lets the bus skip
   CAS writes on the hot path.

Replay reads the predicate registration Observations (§4.2) up to the
offset under test, reconstitutes the kind-indexed dispatch table, then
walks each WAL row whose `hookVerdict ≠ null` and re-evaluates predicates
in recorded order using the witness body's policy version. Any divergence
is a §6.5 Hook-Verdict-Consistency invariant violation.

## 4.8 Coherence With §3

The hook bus contract is fully realized by §3.3 + §3.4 + §3.5:

- `PreCommitHookBus.dispatch` is invoked inside `AppendProtocol.append`
  after `payloadHash` and `readSetHash` are computed and before
  `sealAndSplit` (§3.4 pseudocode).
- The verdict array flows into `sealAndSplit` (§3.5), which is the single
  place pause splits the batch.
- Witness bodies are written to CAS in the same group-commit barrier as
  their owning row; a row's `hookVerdictWitness` hash is never present in
  the WAL without the body being durable in CAS first (CAS-before-WAL rule,
  §3.2 fsync strategy).
- The L1Subscriber broadcast on the paused row is the Router's pause
  inbound; the bus does not have a separate Router channel.

No new open question is surfaced by this section. All Hook Bus Signoff
refinements (P1–P5, R3 subscription model, R4 policy version on every
non-continue verdict) and Gabriel's Router-side verdict (§6) are honored.
