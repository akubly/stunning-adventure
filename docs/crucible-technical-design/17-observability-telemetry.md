# §17 — Observability / Telemetry

**Status:** FINAL (Phase 3, Lane Obs). Authoritative; do not re-litigate locked decisions.
**Owner:** Gabriel (Infrastructure / Router / Observability).
**Secondary:** Roger (per-call telemetry field shapes, monotonic-violation validator).
**Cross-refs:** §3 (WAL events), §4 (Hook Bus verdicts), §5 (RouterDecision), §6 (primitives + invariants), §7 (trust-tier attribution), §8 (Applier state transitions), §9 (Aperture projection), §11 (replay-equivalence), §16 (test-strategy / CI gates).
**Depth budget:** ≤1 page.

The Crucible observability surface is the L1 ledger itself plus the §9 Aperture projection over it. **There is no separate telemetry channel, no Datadog, no Splunk, no OpenTelemetry sink in v1.** Single-user / self-audit posture (§18) makes this the right shape: every event is already content-addressed, replayable, and reachable from a `(sessionId, EventId)` pair. External infra is deferred to v1.5+ when multi-user introduces an "operator" persona distinct from the single user.

## 17.1 Event Catalog

Catalog enumerates every observability-bearing emission in the v1 system. **Layer** = emitting tier; **Severity** = §9.3 NotificationLevel the projector assigns when an `ApertureEvent` is derived; **Source row** = the L1 primitive/subKind tuple (subscribers index by `(primitiveKind, subKind)` per §3.3.1).

| Event                                  | Layer | Severity (Aperture) | Source row (`primitiveKind` / `subKind`)                       | Key body fields                                                          | Spec ref       |
|----------------------------------------|-------|---------------------|----------------------------------------------------------------|--------------------------------------------------------------------------|----------------|
| Bootstrap committed                    | L1    | info                | `observation` / `system_prompt` + manifestRoot Obs              | `bootstrapId`, `lockId`, `manifestRoot`                                  | §3.8, §10.3    |
| Fork created                           | L1    | info                | `observation` / `fork_origin`                                   | `parentSessionId`, `forkPointOffset`, `forkPointEventId`                  | §10.4          |
| Hook verdict `observe`                 | L1    | notice              | any row with `hookVerdict='observe'`                            | `hookVerdictWitness` (CAS) → `{predicateId, predicateVersion, policyVersion}` | §4.1, §4.6    |
| Hook verdict `pause`                   | L1    | attention           | any row with `hookVerdict='pause'`                              | same witness; subsequent rows restaged via §3.5 seal-and-split           | §4.4           |
| Predicate timeout (fail-open observe)  | L1    | attention           | `observation` / `predicate_timeout`                             | `predicateId`, `commitOffset`, `elapsedMicros`                            | §4.3           |
| Monotonic-timestamp violation          | L1    | attention           | `observation` / `monotonic_violation`                           | `expectedFloorNs`, `observedNs`, `cause: 'clock-skew' \| 'fork-floor'`    | §3.10 r4, §6.9 |
| Structural proposal pending            | L4    | attention           | `decision` body `eventType='router.paused'`                     | `proposalId`, `dependentPaths[]`, `policyId`, `policyVersion`             | §5.3           |
| Structural proposal acked / rejected / expired | L4 | notice          | `observation` / `structural_proposal_{acked,rejected,expired}`  | `pauseEventId`, `userVerdict`, `userNote`                                 | §5.3, §6.3     |
| Router decision (apply / reject / resume) | L4 | (silent\* / notice) | `decision` body `eventType='router.decision'`                   | `proposalId`, `outcome`, `prescriptionCandidates[]` (with `nonDominatedReason`) | §5.4, §5.7  |
| Capability denied (external-tier veto) | L4    | attention           | `decision` body `eventType='router.decision'` w/ `outcome='reject'` and `sourceTier='external'` | `policyId`, `predicateRef`, `reason`                          | §5.1 default-deny |
| Leaderboard update (multi-candidate)   | L4    | notice              | same `router.decision` row where `prescriptionCandidates.length>1` | `candidates[].nonDominatedReason ∈ {optimal, incomparable}`             | §5.7, §9.7     |
| Applier state transition `applying→failed` | L4 | attention           | `decision` w/ `applierState.kind='failed'`                      | `payload`, `error`, `fenceStart`                                          | §8.1, §8.8     |
| Applier compensating revert            | L4    | notice              | `decision` w/ `eventType='applier.revert'`                      | `revertsDecisionId`, `reason`                                             | §8.7           |
| Adapter lifecycle error (L3 generator) | L3    | attention           | `observation` / `external_input` w/ `body={adapter,phase,err}`  | `adapter`, `phase ∈ {register,start,propose,stop}`, `error`               | §7.2           |
| Replay-equivalence divergence          | tooling | attention         | `observation` / `replay_divergence` (replayer-emitted, side channel) | `divergenceAtOffset`, `divergenceKind ∈ {oracle,bootstrap,commitment,plugin,cas-miss}` | §11.4, §11.6 |
| CI gate failure (mock-drift, invariant) | CI   | attention           | external (CI run) → recorded as `observation` / `ci_gate_failure` on the merge-target session | `gate`, `runId`, `prNumber`, `prBlocked: true`            | §16, TDD-Q7    |
| Subscriber drop (observe queue overflow) | L1  | notice              | `observation` / `subscriber_drop` (periodic)                    | `subscriptionId`, `droppedCount`, `windowOffsets`                         | §4.5           |
| Scheduler dispatched                   | L3.5  | (silent\*\* / notice) | `decision` / `scheduler_dispatched`                            | `proposalId`, `generatorId`, `priority`, `quantaConsumed`, `queueDepthAtDispatch` | §5.A.2     |
| Scheduler deferred (back-pressure)     | L3.5  | notice              | `decision` / `scheduler_deferred`                              | `proposalId`, `generatorId`, `reason ∈ {backpressure, quanta_exceeded, priority_starved}`, `routerQueueDepth` | §5.A.2, §5.A.4 |
| Scheduler cancelled                    | L3.5  | attention           | `decision` / `scheduler_cancelled`                             | `proposalId`, `generatorId`, `reason ∈ {budget_exhausted, stale, superseded}`, `supersededBy` | §5.A.2     |
| Scheduler quanta exhausted             | L3.5  | notice              | `decision` / `scheduler_quanta_exhausted`                      | `generatorId`, `windowStart`, `windowEnd`, `quantaBudget`, `quantaConsumed` | §5.A.2, §5.A.3 |

\* `router.decision` with `outcome='apply'` on `builtin` tier is **silent** in Aperture per §8.8 row 4 (high-volume, visible in causal slice on demand). All other rows surface at the indicated severity.

\*\* `scheduler_dispatched` for `builtin`-tier generators is **silent** in Aperture (high-volume; surfaces in `crucible perf` and causal slice). All other Scheduler rows surface at the indicated severity.

**Scheduler perf counters (read-path; no new primitives).** Derived from the catalog rows above via L2 projection:

| Counter                                 | Source                                                                                       | Use                                            |
|-----------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------------------|
| `scheduler.quanta_consumed_per_generator` | sum of `scheduler_dispatched.quantaConsumed` grouped by `generatorId` over window           | Budget utilisation; informs weight tuning.     |
| `scheduler.queue_depth`                 | `scheduler_dispatched` count minus terminal `router.decision` count                          | Back-pressure trigger (§5.A.4) + `crucible perf` gauge. |
| `scheduler.dispatch_latency_ms`         | `scheduler_dispatched.timestamp` minus source proposal's emission timestamp                   | Dispatch responsiveness; surfaces in `crucible perf top`. |
| `scheduler.defer_rate_per_generator`    | count of `scheduler_deferred` over total proposals per generator per window                   | Starvation / back-pressure visibility per generator. |

**Severity policy lock:** No emitter chooses its own severity. §9.3 projector hard-codes the mapping; this prevents any single event class from monopolising user attention (R2-3 / TDD-Q3 — no `urgent` for structural proposals).

## 17.2 Trace Correlation

Crucible has no separate trace ID. **`(sessionId, EventId)` is the trace key.** Every emitted row carries:

1. `sessionId` — the trace partition (forks are separate sessions, joined at `fork_origin`'s `forkPointEventId` per §10.4).
2. `EventId` — content-addressed row identifier (BLAKE3 over canonical envelope).
3. `parentId: EventId | null` — direct causal predecessor.
4. `causalReadSet: EventId[]` — full transitive read set the row consumed (§6, §7.3).
5. `trustTier` — propagated unchanged from L3 generator (§7.4); the tier attribution is the trace's privilege dimension.

A "trace" across layers is reconstructed by walking `parentId` + `causalReadSet` backward from any row to bootstrap (offset 0). The §11 replay protocol is the canonical correlation oracle: if a row reduces to the same `EventId` under replay, the trace is intact; divergence (§11.6) localises the layer at which correlation broke.

**Aperture projection key.** `aperture_events.session_id + ix_aperture_unresolved(session_id, resolved, level, emitted_at)` is the operator-facing index (§9.2). All cross-layer correlation in v1 happens by joining on `(sessionId, sourcePrimitiveId)` against L1 — no external store, no log shipping.

**Forks.** A fork shares trace lineage with its parent up to `forkPointOffset`; downstream observability tools (`crucible fork compare`, §10.8) render side-by-side projections by reading both sessions' projected `aperture_events` against their shared prefix.

## 17.3 Aperture-Is-Observability (v1 Lock)

The §9 `ApertureEvent` schema is the **only** rendered observability surface in v1. Concretely:

- **No exporters.** No OpenTelemetry, no Prometheus scrape endpoint, no log forwarder. `@akubly/crucible-runtime` has zero outbound network calls for telemetry.
- **No sampling at the source.** Hook Bus `observe` verdicts are bus-side sampled (§4.5); everything else writes 1:1 to L1. The L1 ledger is the source of truth; sampling happens at projection-read time via saved queries (§13.4).
- **CLI is the operator UI.** `crucible aperture witness` / `show` / `why` / `bisect` (§13.1) are the read paths. `crucible status` is the status-line glance (§9.3 badge count).
- **CI is a sibling channel, not external infra.** TDD-Q7's mock-drift gate emits `ci_gate_failure` Observations into the merge-target session's WAL on PR-time runs. The gate **blocks the PR, never just warns** (TDD-Q7 zero-tolerance); the observability surface for the gate is the same Aperture inbox the rest of the system uses.

**v1.5+ expansion (deferred, non-blocking):** OTLP exporter behind a §7 adapter (so external infra inherits trust-tier discipline); per-session retention policy when ledger size becomes an operator concern; multi-user means an "operator inbox" distinct from the user inbox. None of these change the v1 contract — they are additive.

## 17.4 Acceptance Signals

- **A5** (Aperture push-notification path) — §17.1 catalog row "Structural proposal pending" + §17.2 correlation key are sufficient for Laura's push-trace assertion.
- **TDD §6.9 Monotonic-Timestamps** invariant — `monotonic_violation` Observation emission (catalog row) gives runtime detection; §3.10 r4 is the validator.
- **TDD-Q7 mock-drift gate** — `ci_gate_failure` catalog row + Aperture `attention` severity composes with §16 to make the gate visible without external infra.
- **Replay coherence** — §11.6 oracle uses the same `(sessionId, EventId)` correlation key; no separate trace store to keep in sync.

No locked decisions are re-litigated. No new open question is surfaced. Cross-section dependencies (event shapes for §3, §4, §5, §7, §8, §9, §11) are consumed verbatim; this section adds no new vocabulary.
