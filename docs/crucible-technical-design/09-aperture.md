# §9 — Aperture (Notification / Investigation Surface)

**Status:** FINAL (Phase 2). Authoritative; do not re-litigate locked decisions.
**Owner:** Valanice (UX / Human Factors).
**Cross-refs:** §3 (L1 WAL), §4 (Hook Bus subscriber model), §5 (Router event
contract), §6 (Primitive Taxonomy — `structural_proposal_*` sub-kinds), §7
(`PrescriptionResult.nonDominatedReason`), §8 (DecisionGate notifications),
§11 (Replay), §13 (CLI shell).
**Depth budget:** ≤3 pages.
**Consultant:** Sonny (advisory review after draft — L5 investigation alignment).

Aperture is the **only** Aaron-facing surface for ambient notifications,
structural-proposal approval, and post-hoc investigation. It is a **pure L2
projection** over the L1 ledger (§6.6 invariant): every queue, badge, and
slice it renders is recomputable from a ledger prefix; Aperture owns no
write-stateful storage. The tired, distracted, impatient human at the
keyboard sees one inbox, one verb set, and one rule: nothing is applied to
the world until they say so.

## 9.1 `ApertureEvent` Schema

```ts
import type {
  EventId, SessionId, Timestamp, PrimitiveKind, TrustTier,
} from '@akubly/crucible-boundary';

type NotificationLevel = 'urgent' | 'attention' | 'notice' | 'info';

type ApertureEventKind =
  | 'structural-proposal-pending'   // R2-3; sourced from structural_proposal_emitted
  | 'structural-proposal-resolved'  // sourced from acked|rejected|expired
  | 'apply-failed'                  // §8.8
  | 'hook-pause'                    // §4 pause verdict on a row
  | 'predicate-timeout'             // §4 fail-open observe
  | 'monotonic-violation'           // §6 invariant trip
  | 'capability-denied'             // Router veto on external tier
  | 'leaderboard-update'            // RouterDecision with >1 non-dominated
  | 'bisect-progress'               // §9.6 bisect cursor
  | 'breakpoint-hit';               // §9.7 registry hit

interface ApertureEvent {
  id: EventId;                       // content-addressed; equals projector input row id
  sessionId: SessionId;
  kind: ApertureEventKind;
  level: NotificationLevel;          // §9.3 policy assigns; never stored on L1
  sourcePrimitiveId: EventId;        // L1 row this view was derived from
  sourcePrimitiveKind: PrimitiveKind;
  sourceSubKind: string | null;
  trustTier: TrustTier;              // carried from source row
  title: string;                     // ≤80 chars; for inbox row
  body: unknown;                     // kind-specific structured payload
  emittedAt: Timestamp;              // L1 row timestamp; not wall clock
  resolved: boolean;                 // derived: see §9.4 lifecycle
  resolvedBy: EventId | null;        // resolving L1 row id, if any
}
```

`ApertureEvent` is **never written to L1**. It is the projection row shape
`ApertureProjector` (Rosella's Sprint 3 component, renamed per Round 2.1
from `MirrorProjector`) emits into the in-memory `aperture_events` table on
boot and incrementally maintains via `LedgerProjector.onCommit` (TDD §3.3).

## 9.2 `aperture_events` Projection Table

Backing store: SQLite in-memory (per-session) plus a SQLite-on-disk read
cache rebuilt on boot from L1. Schema:

```sql
CREATE TABLE aperture_events (
  id              TEXT PRIMARY KEY,          -- ApertureEvent.id (= source row EventId)
  session_id      TEXT NOT NULL,
  kind            TEXT NOT NULL,
  level           TEXT NOT NULL,
  source_id       TEXT NOT NULL,             -- L1 row this row projects from
  source_kind     TEXT NOT NULL,
  source_subkind  TEXT,
  trust_tier      TEXT NOT NULL,
  title           TEXT NOT NULL,
  body_json       TEXT NOT NULL,
  emitted_at      INTEGER NOT NULL,
  resolved        INTEGER NOT NULL DEFAULT 0,
  resolved_by     TEXT,
  CHECK (level IN ('urgent','attention','notice','info'))
);
CREATE INDEX ix_aperture_unresolved ON aperture_events(session_id, resolved, level, emitted_at);
CREATE INDEX ix_aperture_kind       ON aperture_events(session_id, kind, emitted_at);
```

**Purity (§6.6 invariant):** `project(prefix[0..N]) === project(prefix[0..N])`
bit-for-bit. Validation: A property test re-projects the same prefix in two
fresh in-memory DBs and asserts row-set equality; any divergence is a
projector bug, not a user-visible state. The on-disk cache is a read-through
optimization with a **prefix-stable cache manifest**: the cache is valid iff
its recorded L1 head hash is a prefix of the current L1 (not necessarily
bit-equal). This allows the cache to survive append-only L1 growth without
invalidation — the projector incrementally projects new rows from
`cacheHead+1` to `currentHead` rather than re-projecting from offset 0.

## 9.3 Notification Policy (Four Levels)

| Level       | Surface             | Examples                                                                | Friction |
|-------------|---------------------|-------------------------------------------------------------------------|----------|
| `urgent`    | Modal interrupt; blocks REPL turn boundary | (none in v1 — reserved for future hard-stop conditions)                 | Highest  |
| `attention` | `@inbox` + status-line badge; non-blocking | **Structural proposal pending** (R2-3), apply-failed, capability-denied | High     |
| `notice`    | `@inbox` only; no status-line                | Hook pause resolved, compensating Decision posted, leaderboard update   | Medium   |
| `info`      | Surfaces only in `@today` / on demand        | Predicate timeout (single occurrence), monotonic-violation telemetry    | Low      |

**Lock — structural proposals NEVER land at `urgent` (TDD-Q3):** the user
chose async-queue + default-not-applied precisely to avoid a blocking modal.
Aperture's projector hard-codes `level = 'attention'` for
`structural-proposal-pending`; an `urgent` value for that kind is a
projector contract violation surfaced as a test failure (not a runtime
escalation). This is the "tired human at midnight" guarantee: a structural
proposal can wait until morning; nothing the agent emits can hijack the
foreground.

**Attention budget:** at most one status-line badge token (`⊙N` where N is
unresolved `attention`-tier count). `@inbox` is the deep surface; the badge
is the affordance to open it.

## 9.4 Resolution Lifecycle

An `ApertureEvent` is `resolved = true` when a downstream L1 row is observed
whose `parentId` or `causedBy` references the source row. Examples:

- `structural-proposal-pending` (from `structural_proposal_emitted`) →
  resolved by `structural_proposal_acked|rejected|expired` Observation with
  matching `proposalId`.
- `apply-failed` → resolved by a subsequent `applied` Decision on the same
  `proposalId`.
- `hook-pause` → resolved by Router `outcome: 'resume' | 'reject'`.

Resolution is **derived, not stored.** The `resolved` column is recomputed
during `LedgerProjector.onCommit`. This keeps the queue a pure view.

**PA-B5 resolution:** `crucible aperture defer` does NOT write to L1 (§9.9)
and therefore does NOT resolve the event. Defer is a local-only snooze that
leaves the row in the queue but clears it from immediate attention. This is
intentional: deferred rows remain unresolved until the user takes a durable
action (approve/reject).

## 9.5 StructuralApprovalQueue (R2-3 LOCK)

The queue is **not a data structure** — it is a SQL view over
`aperture_events`. Entry shape and queue definition:

```ts
interface StructuralApprovalEntry {
  proposalId: EventId;                  // primary key for queue identity
  emittedAt: Timestamp;
  trustTier: TrustTier;
  summary: string;                      // schemaChange one-liner from StructuralProposalGenerator
  dependentPaths: EventId[];            // §5 pause scope; rendered as "blocks N paths"
  queueDeadline: Timestamp | null;      // from RouterPausedPayload.queueDeadline
  state: 'pending';                     // only 'pending' is in the queue view
  pauseEventId: EventId;                // the RouterPaused row to ack
  body: unknown;                        // schemaChange spec for `aperture show <id>`
}
```

```sql
-- Pure projection: the queue IS this SELECT
CREATE VIEW structural_approval_queue AS
SELECT
  json_extract(body_json,'$.proposalId')     AS proposal_id,
  emitted_at, trust_tier,
  json_extract(body_json,'$.summary')        AS summary,
  json_extract(body_json,'$.dependentPaths') AS dependent_paths,
  json_extract(body_json,'$.queueDeadline')  AS queue_deadline,
  json_extract(body_json,'$.pauseEventId')   AS pause_event_id,
  body_json
FROM aperture_events
WHERE kind = 'structural-proposal-pending' AND resolved = 0
ORDER BY trust_tier DESC, emitted_at ASC;     -- external first, then FIFO
```

**Boot semantics:** on Aperture process start, `ApertureProjector` replays
L1 rows with `primitiveKind = 'observation' AND subKind LIKE
'structural_proposal_%'` in offset order, emitting one
`structural-proposal-pending` row per `structural_proposal_emitted` and
flipping `resolved = 1` on each subsequent `structural_proposal_acked |
structural_proposal_rejected | structural_proposal_expired` with matching
`proposalId`. The queue view is then immediately consistent. **No
write-stateful storage** is created; a crash mid-session leaves the queue
recoverable on next boot purely from L1.

**Router resume handshake (Gabriel ↔ Valanice sync pair, R2-3):**

1. Router emits `router.paused` (Decision row) and `structural_proposal_emitted`
   (Observation row, via Applier §8.2 step 2). Aperture projects
   `structural-proposal-pending` and emits an `attention` notification.
2. Aperture publishes a transient `aperture.structural-ack-prompt` event
   into its in-process pubsub (§5 receives no event; this is for CLI
   subscribers — the status-line tail and `crucible aperture witness`).
3. User runs `crucible aperture approve|reject|defer <proposalId>` (§13).
   Aperture writes one of the dedicated sub-kind Observations
   (`structural_proposal_acked` for approve, `_rejected` for reject,
   `_expired` for the deadline path — `defer` is a no-op that simply
   re-renders the entry with a user note). The `body` is the
   `StructuralAckPayload` from §5.3.
4. Router's L2 subscriber (subscribing by `(observation,
   structural_proposal_acked|rejected|expired)` per the finding 6b
   resolution) sees the row, looks up `pauseEventId`, emits
   `router.decision` with `outcome: 'resume' | 'reject'`. Applier resumes
   (§8.2 step 5).
5. Aperture's projector flips `resolved = 1` on the queue entry as soon as
   the resolving sub-kind row is committed (step 3) — independently of
   Router progress. The user's experience is "I clicked approve, the row
   left my inbox"; the actual `resume` happens shortly after and is
   visible in `@today` as a `notice`-level event.

**Default-not-applied:** the queue's contract is that mere presence in the
queue does NOT mutate world state. Approval is the only path to `applied`;
deadline expiry without action yields `expired` and the proposal is
discarded. This is the "no surprises while I sleep" guarantee.

## 9.6 Bisect Output Rendering (R2-4 LOCK)

`crucible aperture bisect` (and the underlying L5 `BisectOrchestrator`)
renders one row per probed offset. **Every row carries the env-snapshot
hash** captured at bisect start (TDD-Q5 lock); the hash is propagated
verbatim from the bisect run record into each result row and rendered as a
16-character abbreviated hex.

```
ENV  d4f1c9aa3b7e5f02
─────────────────────────────────────────────────────────────────────
offset   verdict   probed-decision-id        notes
─────────────────────────────────────────────────────────────────────
0042     good      dec_01HQ9...              baseline (--good)
0089     good      dec_01HQ9...              midpoint
0118     bad       dec_01HQA...              ← first-bad candidate
0103     good      dec_01HQA...
0110     bad       dec_01HQA...              first-bad confirmed
─────────────────────────────────────────────────────────────────────
ENV  d4f1c9aa3b7e5f02   (snapshot fixed across all probes)
```

The env-snapshot header AND footer are both load-bearing: long-lived
artifacts (PR comments, CI logs, issue paste-ins) get truncated at both
ends, so the stamp survives either trim. Per-row `envSnapshotHash` also
appears in the structured JSON output (§13.6) — UI badge and JSON field
are derived from the same `BisectRow.envSnapshotHash` source.

**Sub-divergence rule:** if any row's `envSnapshotHash` differs from the
header (it should not, by Q5 lock), Aperture renders that row red with
`⚠ env-drift` and refuses to declare a first-bad — the bisect is invalid.

## 9.7 Leaderboard Rendering (R2-5 LOCK)

When `RouterDecision.prescriptionCandidates.length > 1`, Aperture projects
a `leaderboard-update` event whose `body` is the full ordered candidate
list with each candidate's `nonDominatedReason` propagated verbatim from
§7's `PrescriptionResult` (the Router and Applier carry the field through
unmodified per §5.7 / §8.5). The leaderboard view renders:

```
PROPOSAL  prop_01HQB...                    decision pending
─────────────────────────────────────────────────────────────────
rank  prescriptionId          axes         status
─────────────────────────────────────────────────────────────────
  1   rx_alpha    speed,cost  optimal              ★ chosen
  2   rx_beta     safety      [incomparable-axes]   incomparable with: rx_alpha, rx_gamma
  3   rx_gamma    speed,risk  [incomparable-axes]   incomparable with: rx_alpha, rx_beta
─────────────────────────────────────────────────────────────────
```

The `[incomparable-axes]` badge is rendered **iff**
`nonDominatedReason === 'incomparable'`, and the trailing
`incomparable with: <ids>` line is rendered from the optional
`incomparableWith[]` array on the same `PrescriptionResult` row (§7.5).
Aperture **never** synthesizes the reason and **never** collapses the
non-dominated set; it presents what the Applier recorded so audit shows
"what was chosen, what the alternatives were, and whether they were
proved-better or merely incomparable" (§8.5).

## 9.8 Investigation Tool Interfaces

Three L5 surfaces are exposed through Aperture; all are pure projections
plus a thin orchestrator.

```ts
interface CausalSliceTool {
  /** Backward causal slice — TDD §3.6 CausalSliceEngine. */
  why(primitiveId: EventId, opts?: { hops?: number /* default 1 */ }): SliceResult;
}

interface BisectTool {
  /** Wraps L5 BisectOrchestrator (TDD §3.6); env-snapshot captured here. */
  start(goodOffset: number, badOffset: number, probe: ProbeCommand): BisectRunId;
  status(run: BisectRunId): BisectRow[];     // each row carries envSnapshotHash (R2-4)
}

interface RegistryTool {
  /** Sketch: breakpoint / watchpoint / logpoint are predicate registrations
      (§4.2) tagged with a registry kind; Aperture renders them. */
  listBreakpoints(): RegistryEntry<'breakpoint'>[];
  listWatchpoints(): RegistryEntry<'watchpoint'>[];
  listLogpoints():   RegistryEntry<'logpoint'>[];
  // Registration is performed via §4 predicate registration; Aperture only reads.
}

interface RegistryEntry<K extends 'breakpoint'|'watchpoint'|'logpoint'> {
  kind: K;
  predicateId: string;                       // §4.2 PredicateRegistration.id
  predicateVersion: string;
  primitiveKinds: PrimitiveKind[];
  installedAt: Timestamp;
  hitCount: number;                          // derived: COUNT(*) over rows with matching hookVerdict witness
}
```

The registry is **read-only from Aperture's side** — installation goes
through §4's `PreCommitHookBus.register`, which writes the
`predicate_registered` Observation Aperture's projector consumes. This
keeps the "Aperture is a pure projection" invariant intact even for
debugger affordances.

## 9.9 CLI Verbs (cross-ref §13)

| Verb                                | Semantics                                                                          |
|-------------------------------------|------------------------------------------------------------------------------------|
| `crucible aperture witness`         | Stream unresolved `attention`-tier rows; non-blocking; redraws on `onCommit`. ("Bear witness" — verb chosen to leave `watch` free for future debugger watchpoints; see ADR-0020.) |
| `crucible aperture show [<id>]`     | Without id: open `@inbox`. With id: show full event body + causal slice one-hop.   |
| `crucible aperture approve <id>`    | Write `structural_proposal_acked` Observation; queue entry resolves immediately.   |
| `crucible aperture reject <id> [--reason <text>]` | Write `structural_proposal_rejected` with optional user note.            |
| `crucible aperture defer <id>`      | **⚠️ Local-only snooze — no L1 write, no resolution.** Re-renders the entry with a `deferred` annotation in the local `@inbox` view. The row remains unresolved on L1 and will reappear in the queue on next boot unless you take a durable action (approve/reject). Use this when you need to clear attention without committing to a verdict. |
| `crucible aperture bisect ...`      | Delegates to §9.6 / §13.6 with env-snapshot header.                                |
| `crucible aperture why <pid>`       | One-hop backward causal slice (Sonny's T1 cut).                                    |

`defer` is the one verb that deliberately does **not** write to L1 — it is
a "snooze" affordance that surfaces in the local CLI view only, so the user
can clear their attention without committing to a verdict. This is the
empathy lever: the queue must support "I see this and I'm not ready
yet" without forcing a binary.

**Defer volatility disclosure:** Because `defer` is local-only, deferred rows
reappear in `@inbox` on next boot (they remain unresolved on L1). The
`--help` text explicitly warns of this; the CLI renders deferred rows with a
`⚠ local-only` badge so the user sees the volatility at a glance. This is
honest UX: we don't pretend local state is durable.

## 9.10 Collaborator Name Alias Map

| CTD name (this section) | Other-section / TDD name           | Notes |
|-------------------------|------------------------------------|-------|
| `ApertureProjector`     | `LedgerProjector` (TDD §3.3)       | The `kind = 'aperture'` specialization. Same interface. |
| `ApertureNotifier`      | `ApertureNotifier` (§8.1, §8.8)    | Same name; Applier's view of the projector's notification side-channel. |
| `StructuralApprovalQueue` | Gabriel §5.9 `EscalationQueue`   | Same concept; Aperture owns it. |
| Inbox view              | `@inbox` (Round 2.1 vocabulary)    | The default landing surface for unresolved attention-tier. |
| `aperture_events`       | (formerly `mirror_events`)         | Renamed per Round 2.1 Aperture rename. |

## 9.11 Acceptance Signals

**Phase 0.5 (Walking Skeleton):**
- **ApertureNotifier stub** — `ApertureNotifier` interface defined with one
  method: `notify(level: NotificationLevel, kind: ApertureEventKind, body:
  unknown)`. Applier calls it on structural-proposal transitions (§8.8).
  Implementation logs to console; no projection, no queue. This unblocks
  Applier integration tests without requiring the full projection layer.

This spec is sufficient for Laura to write:

- **A5** (Aperture push notification for attention-tier events) — §9.3
  policy + §9.4 lifecycle; the test asserts a `structural-proposal-pending`
  row arrives at `attention` (not `urgent`) within one `onCommit` tick of
  the source `structural_proposal_emitted` Observation.
- **A10** (Router policy escalation for structural changes) — §9.5
  StructuralApprovalQueue full handshake including the `approve` →
  `acked` → Router `resume` round-trip.
- **A11** (bisect identifies regression-introducing primitive) — §9.6
  render + env-snapshot stamp; the test asserts header, footer, and per-row
  hash are bit-equal to the bisect run record.
- **A12** (marketplace extension trust gradient) — §9.5 queue ordering
  `trust_tier DESC` ensures external-tier proposals surface first in the
  queue, matching the §5 default-deny policy posture.
- **A4** (backward causal slice traces primitive lineage) — §9.8
  `CausalSliceTool.why` wraps the TDD §3.6 `CausalSliceEngine` directly.
- **§6.6 Projection Purity** invariant — §9.2 in-memory projector + on-disk
  cache header rule; the property test re-projects in a fresh DB and
  asserts row-set equality. No write-stateful queue storage means there is
  no state to drift.

No locked decisions are re-litigated. Finding 6b (sub-kind family for
Aperture-written ack Observations) is consumed: this section subscribes by
`(observation, structural_proposal_*)` and §5.3 has been amended to match.
Sonny consult flagged for advisory review of §9.8 investigation surface +
§9.6 bisect rendering before this section freezes.
