# §3 — L1 WAL Substrate

**Status:** FINAL (Phase 1, Lane 1). Authoritative; do not re-litigate locked decisions.
**Owner:** Roger. **Secondary:** Laura (acceptance + invariant tests), Gabriel (CI harness).
**Cross-refs:** §2 (L0/L1 Boundary), §4 (Hook Bus), §6 (Primitive Taxonomy),
§10 (Session Model), §11 (Hermetic Replay), §15 (Compaction / Snapshots).
**Depth budget:** ≤10 pages.

This section specifies the L1 substrate of the Crucible runtime: a custom
pure-TypeScript append-only Write-Ahead Log (WAL) backed by a single per-user
database directory at `~/.crucible/`. The WAL is the load-bearing storage
primitive for every upper layer — every replay-integrity, hermetic-test,
investigation, and projection property reduces to "what is in the WAL, in what
order, with which content-addressed hash." A.3 hybrid is the v1 implementation
behind a pure abstract boundary (v1 commitment #10); A.1 (Rust port) remains a
reserved swap target.

## 3.1 Substrate Charter

The WAL substrate provides:

1. **Atomic append** of typed primitive rows (§6) with content-addressed body
   storage and per-row hash-chain linking.
2. **Group-commit** batching with seal-and-split on pause verdicts from the
   §4 hook bus.
3. **Bootstrap-batch** of offset-0 Observation rows materialized from the
   `BootstrapPayload` (§2.2; R2-2 LOCK).
4. **Decision-commit with context-window commitment** via the
   `ContextWindowResolver` seam honoring R2-1 hybrid (declared slice or full
   ledger prefix, tagged accordingly).
5. **L1Subscriber broadcast** on every successful commit, exposing
   `(offset, rows[])` to L2 projectors and §4 observers.
6. **Self-audit** via the hash chain and per-session `crucible fsck` walk.
7. **Single-writer enforcement** via advisory file lock on
   `~/.crucible/wal/sessions/<sessionId>/write.lock` (§3.4.1); prevents silent
   hash-chain corruption from concurrent appends.

What L1 does *not* do: derive projections (L2), select prescriptions (L3),
apply policy (L4), or render investigation surfaces (L5). The substrate's
contract ends at "rows are durable, ordered, content-addressed, hash-chained,
and broadcast." Everything else is downstream.

## 3.2 On-Disk Layout

A Crucible session lives under `~/.crucible/`:

```
~/.crucible/
├── crucible.db                # SQLite (better-sqlite3) — derived tables only
├── wal/
│   ├── sessions/<sessionId>/  # one directory per session (forks included)
│   │   ├── 000000.seg         # 64 MiB rolling append segments
│   │   ├── 000001.seg
│   │   └── index.idx          # offset → (segment, byteOffset) sparse index
│   └── cas/                   # content-addressed store, sharded by first byte
│       ├── 00/<blake3>.cbor
│       └── …
└── meta/
    └── manifest.json          # schemaVersion, segment range, lastCommitOffset
```

**Segment format.** Each `.seg` file is an append-only sequence of fixed-prefix
records. A record is:

| Bytes      | Field                | Notes                                          |
|------------|----------------------|------------------------------------------------|
| 4          | `magic`              | `0x57414C31` ("WAL1")                          |
| 4          | `recordLen`          | LE u32; total record byte length excluding magic |
| 8          | `commitOffset`       | LE u64; monotonic per session                  |
| 8          | `timestampNs`        | LE u64; monotonically non-decreasing (§3.10)   |
| 1          | `primitiveKind`      | u8 enum (§6)                                   |
| 1          | `hookVerdict`        | u8 enum `{0=continue, 1=observe, 2=pause}` or 0xFF for no-verdict |
| 2          | `flags`              | bitfield: bootstrap, declaredWindow, syntheticOutput, taskBoundary, manifestRoot |
| 32         | `prevRoot`           | BLAKE3 of previous record's `selfRoot` (chain) |
| 32         | `selfRoot`           | BLAKE3 of this record's canonical CBOR envelope |
| 32         | `payloadHash`        | BLAKE3 of CBOR-canonicalized `primitivePayload`; body in CAS |
| 32         | `readSetHash`        | BLAKE3 of canonical `causalReadSet` body in CAS; zero-hash if empty |
| 32 \| 0    | `hookVerdictWitness` | BLAKE3 of CAS witness body; present iff `hookVerdict ≠ continue` |
| 32 \| 0    | `contextWindowCommitment` | BLAKE3; present iff `primitiveKind = decision` |
| 1 \| 0     | `commitmentMethod`   | u8 enum `{0=declared, 1=fallback}`; present iff Decision row (R2-1 LOCK) |
| variable   | `envelopeCbor`       | CBOR-canonicalized envelope tail (ids, parent pointers, sub-kind tags, taskId, trustTier, schemaVersion) |
| 4          | `crc32c`             | Of all preceding bytes in the record           |

Record body never inlines large payloads; the `payloadHash`, `readSetHash`,
`hookVerdictWitness`, and the CBOR-serialized causal-context-window slice live
in the CAS. The segment is a compact index over content addresses.

**Segment rotation.** A segment is sealed when (a) it crosses 64 MiB, or
(b) on session close. Rotation is non-blocking: the rotator pre-allocates and
`O_APPEND`-opens segment N+1 before sealing N. `index.idx` is updated as a
flush-once tail-record per group-commit; it is **advisory** (rebuildable from
segment scan) so corruption only forces a rescan, never data loss.

**fsync strategy.** Group-commit performs **one** `fdatasync(2)` on the active
segment per batch (after the entire batch is written and the in-flight hash
chain is finalized). `index.idx` is `fsync`'d on segment rotation and on
session close. CAS writes use `O_APPEND` with `fsync` *before* the
corresponding WAL record is written — the WAL never references CAS content
that is not durable. On Windows, `fdatasync` is emulated via
`FlushFileBuffers` against the segment handle.

**Forks.** A forked session at `(parentSessionId, forkOffset)` creates a new
session directory whose segment 0 starts with a synthetic
`Observation{subKind: 'fork_origin'}` row (offset 0) that pins the parent
session ID and fork-point root hash. The fork inherits the parent's hash chain
(parent's `selfRoot` at `forkOffset - 1` becomes the new session's `prevRoot`
at offset 1). Parent segments are not copied; cross-session reads are explicit.

### 3.2.1 CAS Garbage Collection

**Cross-session deduplication and unreclaimable growth.** The content-addressed
store (CAS) deduplicates identical payloads across sessions: multiple WAL rows
with the same `payloadHash` reference one CAS blob. Without reference tracking,
deleting a session leaves orphaned CAS blobs — hundreds of MiB of unreclaimable
storage. Ad-hoc manual cleanup risks `cas-miss` refusals on surviving sessions
that still reference the deleted blob.

**v1 GC strategy: mark-and-sweep on session archive.** CAS GC runs as an
explicit user-invoked `crucible gc` command (§13; see §17.3 for retention floor
trigger). The algorithm:

1. **Mark phase:** Walk all **closed or archived** session directories under
   `~/.crucible/wal/sessions/`. For each session, scan its segments and harvest
   every hash (`payloadHash`, `readSetHash`, `hookVerdictWitness`,
   `contextWindowCommitment`) into a live-reference set. Active sessions
   (currently open for append) are excluded from the scan.
2. **Sweep phase:** Enumerate all blobs in `~/.crucible/wal/cas/`. Any blob
   whose BLAKE3 filename is not in the live-reference set is an orphan;
   delete it.
3. **Session-scoped manifest (optional v1 optimization):** On session close,
   write a `~/.crucible/wal/sessions/<sessionId>/.cas-refs` file listing all
   CAS hashes referenced by that session. The mark phase reads these manifests
   instead of scanning segments. Manifest generation is append-only: each
   group-commit appends new hashes to the manifest tail; on close, deduplicate
   and fsync. Missing or corrupt manifest forces segment rescan (slower but
   correct).

**Concurrent-append safety.** CAS GC **never** touches active session
directories or their referenced CAS blobs. A session is eligible for GC iff
(a) its directory contains no `.lock` file (see §3.4.1), AND (b) its
`manifest.json` marks it `closed` or `archived`. The two-phase mark-and-sweep
ensures no CAS blob is deleted while any closed session still references it.

**cas-miss mitigation.** If a WAL row references a missing CAS blob (detected
during read, replay, or fsck), the substrate surfaces a `CAS_MISS` error to
Aperture with the missing hash. The session remains readable for metadata
queries (offsets, envelope fields) but payload reconstruction fails. §11.3
replay refuses to advance past a cas-miss row. The user remediates by restoring
the CAS blob from backup or accepting data loss. GC never creates this
condition if all active sessions are excluded from the sweep.

**GC timing and trigger policy.** GC is manual in v1; no automatic background
sweep. §17.3 retention floor (500 MiB soft-warn, 2 GiB hard-limit) prompts the
user to run `crucible gc` when storage grows beyond threshold. Future versions
may add automatic GC on idle (v1.5+), but v1 prioritizes simplicity and
explicit user control over daemon complexity.

## 3.3 WAL Row Schema (TypeScript)

The in-memory row is the source of truth; the binary layout in §3.2 is its
canonical projection. Rows are immutable once `append()` returns.

```ts
import type {
  CruciblePrimitive, EventId, SessionId, TaskId, Timestamp, TimestampNs,
} from './06-primitive-taxonomy';

type CommitOffset = bigint;            // u64, monotonic per session
type Blake3Hash   = Uint8Array;        // 32 bytes
type HookVerdict  = 'continue' | 'observe' | 'pause';

// Phase 2 finding 2a (split, coordinated with §6): WAL records use the
// `TimestampNs = bigint` alias (u64 nanoseconds, structural). Envelopes
// (§6.1 `PrimitiveEnvelope.timestamp: Timestamp`) remain millisecond
// `number`. §3.10's monotonic-floor logic operates on `TimestampNs` only;
// conversion `bigint(envelope.timestamp) * 1_000_000n` is L0-side and
// happens before the boundary cross.

interface WalRow {
  sessionId:                 SessionId;
  commitOffset:              CommitOffset;
  timestampNs:               TimestampNs;        // §3.10 monotonic invariant; u64 ns
  primitive:                 CruciblePrimitive;  // §6 union
  payloadHash:               Blake3Hash;         // BLAKE3(CBOR(primitive.primitivePayload))
  readSetHash:               Blake3Hash;         // BLAKE3(CBOR(causalReadSet)) or zero-hash
  hookVerdict:               HookVerdict | null; // null = no predicate matched
  hookVerdictWitness:        Blake3Hash | null;  // CAS pointer; null iff hookVerdict ∈ {null, 'continue'}
  contextWindowCommitment:   Blake3Hash | null;  // non-null iff primitiveKind === 'decision'
  commitmentMethod:          'declared' | 'fallback' | null; // R2-1 LOCK; non-null iff Decision
  prevRoot:                  Blake3Hash;         // hash chain link
  selfRoot:                  Blake3Hash;         // BLAKE3(CBOR(this row, excluding selfRoot))
  flags: {
    bootstrap:        boolean;        // true iff this row was emitted by bootstrap-batch
    declaredWindow:   boolean;        // mirrors commitmentMethod === 'declared'
    syntheticOutput:  boolean;        // true iff Artifact subKind === 'synthetic_output' (M3 LOCK)
    taskBoundary:     boolean;        // true iff envelope.taskId !== null
    manifestRoot:     boolean;        // true iff this Observation carries the bootstrap memoryManifest root (§3.8); Phase 2 finding 2b additive.
  };
}
```

### 3.3.1 Observation as First-Class Primitive (Q1 LOCK)

Observation rows are **not envelope metadata on Decision rows**. They occupy
their own primitive-kind slot (§6), their own subKind enumeration (§6.3),
their own rows in the WAL, and their own indices in projections. Storage,
query, and Aperture-projection costs are computed against this assumption:

- **Storage cost.** A typical post-bootstrap Observation (e.g. captured
  `tool_output`) is dominated by its CAS body, not the WAL row prefix. The
  WAL row itself is ~160 bytes when `readSetHash` is non-zero and no hook
  verdict fires.
- **Query patterns.** Investigation (L5) and Aperture (L9) walk `WHERE
  primitiveKind = 'observation' AND subKind = ?`; a covering index on
  `(sessionId, primitiveKind, subKind, commitOffset)` lives in
  `crucible.db` and is rebuilt by L2 projectors from the WAL stream.
- **Aperture projection.** `bootstrap`-flagged Observations populate
  Aperture's session-origin panel; non-bootstrap Observations feed the
  attention-tier timeline. Both flows index off the kind/subKind tuple, not
  off Decision rows.

### 3.3.2 Decision Row Context-Window Fields (R2-1 LOCK)

Every Decision row carries **two** non-null fields beyond the common envelope:

- `contextWindowCommitment: Blake3Hash` — the 32-byte BLAKE3 over the
  CBOR-canonicalized sequence of EventIds (in order) whose primitives were
  visible to the LLM at decision time. Computation is delegated to
  `ContextWindowResolver` + `ReadSetHasher` (§3.7).
- `commitmentMethod: 'declared' | 'fallback'` — records which path the
  resolver took. `'declared'` when L0 supplied a `causalContextWindow` slice
  at the §2.6 boundary; `'fallback'` when the slice was omitted and the
  resolver hashed the full ledger prefix up to (excluding) the Decision
  row's offset.

These fields are **structural** (replay equality checks include them, modulo
the timestamp-exclusion rule of §3.10). The optional
`DecisionPayload.causalContextWindowSlice` (§6.2) lives in the CAS body, not
the WAL row prefix.

### 3.3.3 Artifact `synthetic_output` Sub-Type Marker (Q1 M3 LOCK)

When the originating `ToolCallBoundary.phase === 'side_effect_only'` (§2.5),
L1 requires an `Artifact{subKind: 'synthetic_output'}` row paired to the
invoking `Request{subKind: 'tool_call'}` by `toolCallId`. The WAL row's
`flags.syntheticOutput` bit is set; downstream projectors use it to filter
M3 artifacts from real tool outputs without re-walking the sub-kind enum.

### 3.3.4 CALL/RET Sub-Kind Fields on `TaskStart` / `TaskEnd` (Phase 4 LOCK)

Per Phase 4 UIS framing (decision: "ADOPT CALL/RET semantics" — Laura +
Roger partial + rubber-duck flagged), the existing
`Request{subKind: 'TaskStart'}` and `Observation{subKind: 'TaskEnd'}` rows
carry explicit invocation-frame metadata so stack-frame reconstruction is
structural (queryable from a single row scan) rather than reconstructed by
walking `taskId` + `causalParentId` heuristics. The taxonomy in §6.3 is
unchanged — these are **additive sub-kind body fields** under the §6.5
evolution rule (additive only; no breaking change to v1 readers).

The bodies of the bracketing rows carry:

```ts
interface TaskStartBody {                  // Request.primitivePayload extension
  taskId:              TaskId;             // existing — envelope.taskId tag
  label:               string;             // existing — human-readable scope name
  invocationId:        InvocationId;       // NEW — unique CALL identifier within session
  parentInvocationId:  InvocationId | null;// NEW — caller's invocationId; null at top level
  callDepth:           number;             // NEW (optional convenience) — derivable; 0 at top level
}

interface TaskEndBody {                    // Observation.primitivePayload extension
  taskId:              TaskId;             // existing
  outcome:             'success' | 'failure' | 'cancelled' | string;  // existing
  invocationId:        InvocationId;       // NEW — MUST equal the matching TaskStart.invocationId
  returnTo:            EventId;            // NEW — EventId of the matching TaskStart row (RET link)
  parentInvocationId:  InvocationId | null;// NEW — copied from TaskStart for index locality
}

type InvocationId = string;                // session-unique; CANONICAL derivation BLAKE3(sessionId||taskId||commitOffset) — see lock note below
```

Semantics (LOCK):

- `invocationId` uniquely names a CALL/RET pair within a session. A
  re-entered scope (same `taskId` opened twice via fork-resume or retry) gets
  a fresh `invocationId` per CALL — `taskId` is the scope label,
  `invocationId` is the frame identity.
- **InvocationId derivation is canonical (Phase 4 synthesis LOCK,
  Graham).** L0 MUST compute `invocationId = BLAKE3(sessionId || taskId ||
  commitOffset)` where `commitOffset` is the `TaskStart` row's L1 commit
  offset (the offset assigned by §3.4 `append` at the moment of durable
  commit). Replay determinism requires zero L0 degree of freedom on this
  field: §11.6 byte-equivalence over CALL/RET fields is a hard property
  (the stack-frame reconstruction in §10.6.1 keys off `invocationId`), and a
  non-canonical L0 implementation would defeat it. The structural-compute
  cost in L0 is one BLAKE3 over three small inputs at TaskStart-emit time —
  cheap, deterministic, and replay-safe. Mis-derivation (an `invocationId`
  that does not match the canonical hash) is a `monotonic_violation`-class
  durable failure surfaced to Aperture; the row still commits per §3.10
  append-only discipline.
- `parentInvocationId` is the lexically-enclosing open frame's
  `invocationId` at the moment `TaskStart` was emitted. It is `null` iff
  the frame is opened at top level (no open ancestor on the session's
  invocation stack — see §10.6).
- `returnTo` on `TaskEnd` is the **EventId** (content-addressed BLAKE3) of
  the paired `TaskStart` row. Combined with §3.13's hash chain it gives
  the L2 projector and §11 replay a zero-walk RET link — the projector
  validates `returnTo` resolves to a row whose `body.invocationId` equals
  this `TaskEnd.body.invocationId`; mismatch is a `monotonic_violation`-
  class durable failure (durable row, surfaced to Aperture, append still
  succeeds — §3.10 discipline).
- `callDepth` is derivable from the `parentInvocationId` chain; it is
  recorded for projection-time index locality (Sonny's `bt` backtrace UX,
  §13, gets a single-row read instead of a chain walk).

Stack-frame reconstruction (the derived view computed from these fields) is
specified in §10.6; this subsection pins only the row-level field shape.

Composition with existing envelope fields:

- `envelope.taskId` continues to tag every row emitted *within* a CALL/RET
  scope (§3.3 `flags.taskBoundary = true` is unchanged).
- `envelope.causalParentId` on `TaskStart` continues to point at the
  `Request` that triggered the fan-out (§6.4); `parentInvocationId` is a
  *different* edge — the lexical-stack parent, which need not equal the
  causal-spawn parent (e.g., a deferred sub-task spawned earlier but
  entered now). Both edges coexist and answer different replay queries.
- No new WAL row schema columns are introduced — the CALL/RET fields live
  inside the existing `primitive.primitivePayload` CBOR body and are
  reachable via `payloadHash` like any other body field.

### 3.3.5 Scheduler-Emitted `Decision` Rows (Phase 4 LOCK)

Per Phase 4 UIS framing (decision: "ADOPT Scheduler tier promotion" — see
Gabriel's §5 Router-Scheduler boundary spec for the actual sub-kind
enumeration), the new L3.5 Scheduler tier emits scheduler-decision rows to
L1 for replay determinism. **Scheduler-emitted Decisions are first-class
WAL rows, indistinguishable in storage from any other Decision**; they
route through the same `AppendProtocol.append` path, carry the same
`contextWindowCommitment` + `commitmentMethod` fields (§3.3.2), participate
in the same hash chain (§3.13), and incur the same group-commit cost
(§3.5). The scheduler distinguishes its own rows by **sub-kind body
metadata only** — a `scheduler_*` sub-kind family inside the Decision
payload (enumerated by Gabriel in §5 / §17; this section neither names
the values nor reserves them).

The WAL row schema requires no change: the §6.3 table notes Decision is
"differentiated by `commitmentMethod` + `nonDominatedReason`," and any
scheduler-family discriminator is an additive optional body field under
§6.5's evolution rule. Storage, indexing, replay, fsck, and projection all
treat scheduler Decisions identically to model-emitted Decisions. The
guarantee L1 publishes is: **the substrate will accept a Decision row
regardless of who emitted it**, provided the row satisfies the §3.3
schema and §3.7 context-window-commitment contract.

This is a declaration of substrate readiness, not a scheduler spec. See §5
(Gabriel) for the Router-Scheduler boundary and the `scheduler_*` sub-kind
enumeration; see §17 for the scheduler-event taxonomy itself.

## 3.4 Append Protocol (Pseudocode)

`AppendProtocol` is the only public entrypoint into the WAL (Laura §3.2 seam).
Both single-row and batch appends route through the same group-commit path.

```pseudo
AppendProtocol.append(batch: WalRowDraft[]) -> CommitOffset[]:
    enforcePrimitiveScale(batch)                        # §3.6 — Q1 LOCK
    enforceMonotonicTimestamps(batch)                   # §3.10 — Q6 LOCK
    staged := []
    for draft in batch:
        draft.payloadHash         := blake3(cbor(draft.primitive.primitivePayload))
        draft.readSetHash         := blake3(cbor(draft.causalReadSet)) or ZERO
        if draft.primitiveKind == 'decision':
            (commitment, method)  := ContextWindowResolver.resolve(draft)  # §3.7
            draft.contextWindowCommitment := commitment
            draft.commitmentMethod        := method
        staged.append(draft)

    # §4 Hook Bus fires inside the group-commit window, before fsync.
    verdicts := PreCommitHookBus.dispatch(staged)       # see §4
    (committed, restaged) := sealAndSplit(staged, verdicts)

    durable := []
    chainRoot := segment.lastSelfRoot()
    for row in committed:
        row.commitOffset := segment.nextOffset()
        row.prevRoot     := chainRoot
        row.selfRoot     := blake3(cbor(row without selfRoot))
        chainRoot        := row.selfRoot
        casWrite(row.payloadHash,        cbor(row.primitive.primitivePayload))
        casWrite(row.readSetHash,        cbor(row.causalReadSet)) if non-zero
        casWrite(row.hookVerdictWitness, cbor(row.hookWitnessBody)) if non-null
        segment.write(encodeBinary(row))
        durable.append(row)

    segment.fdatasync()                                 # one fsync per batch
    manifest.lastCommitOffset := durable.last.commitOffset
    L1Subscriber.broadcast(onCommit, durable)

    if restaged: requeue(restaged)                      # §4 seal-and-split
    return durable.map(r => r.commitOffset)
```

`enforcePrimitiveScale` and `enforceMonotonicTimestamps` raise
`PRIMITIVE_SCALE_VIOLATION` and `TIMESTAMP_REGRESSION` respectively; both are
synchronous, pre-fsync, and never leave a partial batch on disk.

### 3.4.1 `appendFenced` — Single-Row Optimistic-Concurrency Entrypoint (Phase 2 finding 12b)

`appendFenced` is a thin wrapper around `append([row])` that adds an
optimistic head-offset check. It is the entrypoint §8.3 `applyWithFence`
calls from the Applier when committing a Decision row whose
context-window commitment was computed against a specific ledger prefix.

```ts
interface AppendProtocol {
  append(batch: WalRowDraft[]): Promise<CommitOffset[]>;
  bootstrap(payload: BootstrapPayload): Promise<CommitOffset>;
  appendFenced(args: {
    sessionId:    SessionId;
    expectedHead: CommitOffset;        // segment.nextOffset() observed before the read
    row:          WalRowDraft;         // exactly one draft
  }): Promise<
    | { kind: 'fence-violation'; actualHead: CommitOffset }
    | { kind: 'committed'; eventId: EventId; offset: CommitOffset }
  >;
}
```

**Fencing condition.** Inside the group-commit window, immediately before
the row is staged, the WAL checks `segment.nextOffset() === expectedHead`
against the active session segment under the same single-writer lock that
already serializes `append()`. If the check fails the row is **not**
staged, no CAS write is performed, no hook bus dispatch fires, and the
call returns `{ kind: 'fence-violation', actualHead }`. If the check
passes, the row joins a fresh single-row group commit and routes through
the normal §3.4 path (hook bus, seal-and-split, hash-chain, fdatasync,
L1Subscriber broadcast); the call returns `{ kind: 'committed', ... }`.

**Single-writer assumption.** Per R2 Router lock, a session has one
writer at a time. The fence exists to absorb *intra-process* row
insertions between the Applier's window read and its decision append
(e.g., an audit hook in §4 emits an Observation row in the gap). It is
**not** a multi-writer primitive; callers must not use it as such.

**Write lock enforcement.** The single-writer assumption is enforced via an
**advisory file lock** on `~/.crucible/wal/sessions/<sessionId>/write.lock`.
`AppendProtocol` acquires an exclusive lock on this file in its constructor
(via `flock(LOCK_EX | LOCK_NB)` on Unix, `LockFileEx` with `LOCKFILE_FAIL_IMMEDIATELY`
on Windows). If the lock acquisition fails (another process holds it), the
constructor raises `SESSION_WRITE_LOCKED` synchronously. The lock is released
on `AppendProtocol.close()` or process termination. This prevents silent
hash-chain corruption when two CLI tabs attempt concurrent appends to the same
session — the second tab fails-fast with an actionable error instead of
silently interleaving records and breaking the `prevRoot` chain. The lock file
is created on first append and persists until session close; its content is
ignored (presence of the lock, not file content, is the signal). §3.1 substrate
charter amended: L1 guarantees "one writer per session at a time, enforced by
write.lock."

**When to use `appendFenced` vs `append(batch)`.** Callers use
`appendFenced` iff (a) the row is a `Decision` whose
`contextWindowCommitment` was hashed against a prefix `[0, expectedHead)`,
or (b) any future row whose payload is logically committed against a
specific head offset. All other callers — bootstrap, normal Observation /
Request / Artifact / Question emission, batched commits — use `append(batch)`
which has no fence and is the high-throughput hot path. `appendFenced` is
single-row by construction: batched fencing is meaningless because the
fence's purpose is to validate a window read that precedes one specific
Decision append.

**Recovery on fence violation.** §8.3's retry loop re-snapshots head,
re-reads the window, re-hashes, and re-issues `appendFenced` with the
new `expectedHead`. Bounded retries (default 3) before surfacing as
`ApplyOutcome { kind: 'failed' }` to keep audit-hook livelock from
silently stalling the Applier.

## 3.5 Group-Commit + Seal-and-Split

A batch enters group-commit when (a) the staging queue reaches the
session-configured batch size (default 64 rows), (b) the staging deadline
elapses (default 2 ms), or (c) an explicit `flush()` is called. Inside the
window:

1. Read-set hashes are computed for every staged row.
2. The §4 hook bus fires per row, in primitive order, against the staged
   sequence. Total wall-clock budget for the bus is 80 µs × (rows in batch),
   capped at the session-configured ceiling (§4).
3. The result is a `verdicts: HookVerdict[]` parallel array.
4. `sealAndSplit(staged, verdicts)` walks left-to-right:
   - On `continue` or `observe`, the row joins `committed`.
   - On `pause` at position `i`, rows `0..i` join `committed` (the verdict
     itself is durable on the paused row, satisfying exactly-once-pause);
     rows `i+1..end` move to `restaged` and are returned to the staging
     queue with a `restagedFromOffset` annotation. The Router (§5) receives
     the pause verdict via the L1Subscriber broadcast on the paused row.
5. The committed sequence is hash-chained, CAS-written, segment-appended,
   and `fdatasync`'d in one barrier.

Group-commit failures (CAS write error, segment rotation failure, fsync
error) abort the entire batch atomically: no segment bytes are exposed, no
subscribers are broadcast, and the staging queue restores the pre-batch
state. Partial-batch durability is impossible by construction.

## 3.6 Per-Tool-Call Primitive Scale Enforcement (Q1 LOCK)

`enforcePrimitiveScale(batch)` is the structural enforcement of the §2.5
boundary rule "one primitive per tool-call boundary":

```pseudo
enforcePrimitiveScale(batch):
    perToolCall := {}
    for draft in batch:
        boundary := draft.envelope.toolCallBoundary
        if boundary is null: continue
        key := (boundary.toolCallId, boundary.phase)
        if key in perToolCall:
            raise PRIMITIVE_SCALE_VIOLATION(
                "batch packs multiple primitives into tool-call boundary " + key)
        perToolCall[key] := draft
    for (id, phase) in perToolCall where phase == 'invoke':
        require exists(perToolCall[(id, 'result')]) OR
                exists(perToolCall[(id, 'side_effect_only')]) OR
                draft.envelope.taskBoundary  # nested rows allowed inside fan-out
```

The check is intra-batch only; inter-batch pairing of `invoke` to closing
Artifact is enforced by the Aperture attention-tier emitter (§9) using the
session-configured window deadline.

## 3.7 Decision Commit With Context Window (R2-1 Hybrid)

`ContextWindowResolver` is a small collaborator whose only responsibility is
to deliver the (commitment, method) tuple for a Decision draft. It composes
two seams from §2.8: `LedgerWindowReader` (prefix reads) and `ReadSetHasher`
(BLAKE3-over-canonical-CBOR).

```pseudo
ContextWindowResolver.resolve(draft: Decision) -> (Blake3Hash, 'declared' | 'fallback'):
    slice := draft.primitivePayload.causalContextWindowSlice
    if slice is not null:
        # R2-1 honest path: hash exactly the rows L0 declared.
        rows := LedgerWindowReader.byIds(draft.sessionId, slice)
        if rows.length != slice.length:
            # Slice referenced rows outside the ledger prefix.
            raise BOOTSTRAP_CAPTURE_COMPLETENESS_VIOLATION(
                "declared window references unknown EventId(s); see §6.8")
        return (ReadSetHasher.hashSequence(rows), 'declared')
    else:
        # R2-1 graceful path: full ledger prefix, exclusive of this row.
        prefix := LedgerWindowReader.prefix(draft.sessionId,
                                            endOffsetExclusive=segment.nextOffset())
        return (ReadSetHasher.hashSequence(prefix), 'fallback')
```

`ReadSetHasher.hashSequence(rows)` canonicalizes each row's `selfRoot`
into a CBOR array (per §2.8 / Open #5 CBOR + BLAKE3 lock) and emits a single
32-byte BLAKE3 digest. Determinism is contract-tested against golden vectors;
component tests inject a stub hasher that returns `0x00…01`.

A declared window referencing rows outside the ledger prefix is routed to the
Bootstrap-Capture-Completeness test (TDD §6.8), not silently absorbed.

**Prefix-commitment caching (O(N²)→O(N) fallback optimization).** When L0
omits `causalContextWindow` (the v1 Copilot SDK path per §12.7), every
Decision hashes the full ledger prefix from offset 0. Naive implementation:
N Decisions × average D/2 prefix length = O(N×D); for sessions where D≈N
(typical), this is O(N²). The optimization: cache `cumulativeHash` at each
committed Decision offset, keyed by `(sessionId, commitOffset)`. Next
Decision computes by hashing only the delta rows since the last cached
entry, then updates the cache. Hash chain is incremental; cost becomes O(N).
Cache eviction on session close or after 1 hr idle (whichever first).
Cached hash is a pure function of the ledger prefix; cache miss simply
recomputes from scratch (no correctness impact, only latency). Spec'd as
`PrefixCommitmentCache` collaborator in the `ContextWindowResolver`
construction; tested via component tier by comparing cached vs non-cached
paths on the same 100-row prefix. The SLO (§16.5): replay throughput
≥500 rows/sec on reference hardware (M2 MacBook Air).

## 3.8 Bootstrap-Batch Protocol (R2-2 LOCK)

The bootstrap batch is the only batch that may write at `commitOffset = 0`
for a given session. It is atomic across all of `BootstrapPayload`:

```pseudo
AppendProtocol.bootstrap(payload: BootstrapPayload) -> CommitOffset:
    require segment.nextOffset() == 0
    rows := []
    rows.append(Observation{subKind: 'system_prompt',
                            body: payload.literalContext.systemPrompt,
                            sourceManifestId: null})
    rows.append(Observation{subKind: 'tool_definitions',
                            body: payload.literalContext.toolDefinitions,
                            sourceManifestId: null})
    for fragment in payload.literalContext.injectedMemoryFragments:
        rows.append(Observation{subKind: 'injected_memory',
                                body: fragment.content,
                                sourceManifestId: fragment.sourceManifestId})
    rows.append(Observation{subKind: 'injected_memory',
                            body: payload.memoryManifest,
                            sourceManifestId: '<manifest-root>',
                            flags: { manifestRoot: true }})
    for row in rows: row.flags.bootstrap := true
    append(rows)                                # routes through §3.4
    return 0
```

Bootstrap-batch atomicity guarantees: either every offset-0 Observation is
durable and broadcast, or none are. Subscribers see a single `onCommit(0,
rows)` for the entire bootstrap; partial bootstrap is impossible. Replay
(§11) refuses to advance past offset 0 if the materialized Observation set
does not match the bootstrap manifest declared at the boundary
(TDD §6.8 invariant).

`memoryManifest` Observations are tagged `manifestRoot` so later
`cross_session_memory` rows captured at query time can be linked back via
`sourceManifestId` lookup. The manifest itself is **not** queried memory; it
is the pinned naming of sources whose later query results become first-class
Observations through the normal append path.

## 3.9 L1Subscriber Contract

`L1Subscriber` is the single fan-out interface from the WAL to projectors,
Aperture (§9), the Router (§5), and replay (§11). It is **synchronous** with
respect to commit ordering: subscribers see commits in `commitOffset` order,
never reordered.

```ts
interface L1Subscriber {
  onCommit(offset: CommitOffset, rows: WalRow[]): void;
  onBootstrap(sessionId: SessionId, rows: WalRow[]): void;       // offset === 0n
  onSealAndSplit(sessionId: SessionId,
                 committed: WalRow[],
                 restagedFromOffset: CommitOffset): void;
  onSegmentRotated(sessionId: SessionId,
                   sealedSegment: string,
                   newSegment: string): void;
}
```

Delivery semantics:

- **In-order, exactly-once per subscriber.** A subscriber that throws
  synchronously is unsubscribed and surfaced as an Aperture attention-tier
  event; it is not retried. Subscribers that need durability across crashes
  poll via `LedgerWindowReader` against `manifest.lastCommitOffset`.
- **No filtering at the bus.** Subscribers receive every commit; per-kind
  fan-out is the subscriber's responsibility. (Hook bus subscriptions live
  inside §4, not here.)
- **Backpressure.** Subscribers MUST consume synchronously; the WAL does not
  buffer for slow subscribers. A subscriber that needs async processing
  enqueues internally and bounds its own queue.

## 3.10 Monotonic-Timestamp Assignment (Q6 LOCK)

Timestamps are **advisory metadata**; offsets are **structural**. The
following rules are invariants enforced by the WAL:

1. `timestampNs` on row `i+1` ≥ `timestampNs` on row `i` within a session.
2. Tie-breaks (same nanosecond) are resolved by `commitOffset` ordering;
   replay equality (§11) compares offsets, not timestamps.
3. On batch append, the WAL assigns `timestampNs := max(hrtimeNs(),
   lastTimestampNs + 1)` per row, in batch order. Wall-clock regression
   (NTP step, VM pause) is absorbed by the `+1` floor.
4. Forks inherit a per-session floor equal to the parent's `timestampNs` at
   `forkOffset - 1`. The fork's first non-bootstrap row's timestamp is the
   max of its own clock and that floor.
5. **Violation detection.** If at any boundary (replay, fsck, fork
   materialization) a row's stored `timestampNs` violates rule 1, the WAL
   emits an `Observation{subKind: 'monotonic_violation'}` row to a session
   designated for invariant alarms (default: the offending session itself)
   and notifies Aperture's attention tier. The violation is recorded, not
   suppressed; replay continues against `commitOffset` order.

Replay equivalence (TDD §6.3) excludes `timestampNs` from byte-equality via
the `normalizeTimestamps()` helper (Laura §6.3); the structural fields
including `selfRoot`, `payloadHash`, `contextWindowCommitment`, and
`commitmentMethod` are byte-compared.

## 3.11 Performance Envelope

Targets (single-session, NVMe local disk, default batch size 64 rows):

| Metric                           | Budget           | Source                  |
|----------------------------------|------------------|-------------------------|
| Append latency (single row, p99) | ≤ 1 ms           | A.3 lock; v1 commitment |
| Group-commit fsync amortized     | ≤ 32 µs / row    | 1 fsync ≈ 2 ms / 64-row batch on NVMe |
| Hook bus per-predicate budget    | ≤ 80 µs          | §4; ~50 predicates safe |
| Hook bus per-batch budget        | ≤ 80 µs × rows   | Cooperative v1 target; over-budget completions emit telemetry and may quarantine future rows (§4) |
| Bootstrap batch (typical, ≤16 Observations) | ≤ 5 ms p99 | One fsync + CAS writes  |
| Decision commit additional cost (fallback path) | O(prefix length) hash | Amortized by session compaction snapshots (§15) |
| Decision commit additional cost (declared path) | O(slice length) hash | Typically 32–128 EventIds |
| L1Subscriber `onCommit` dispatch | ≤ 50 µs per subscriber | Synchronous; slow subscribers unsubscribe |

**Predicate budget breakdown (80 µs):**
- Read-set load from CAS: ≤ 20 µs (mmap'd, hash-keyed lookup)
- Predicate evaluation (compiled, pre-registered): ≤ 40 µs
- Verdict witness CBOR-encode + CAS write enqueue: ≤ 15 µs
- Bus bookkeeping (subscription dispatch list, policy version stamp): ≤ 5 µs

`continue` verdicts are zero-cost per P5 (Hook Bus Signoff): no CAS write,
no witness, no policy stamp. Only `observe` and `pause` carry the witness
cost.

## 3.12 Storage Volume Projections

Per-row WAL prefix (segment bytes, excluding CAS bodies):

| Row class                        | Prefix bytes | Notes                              |
|----------------------------------|--------------|------------------------------------|
| Minimal (no read-set, no verdict)| ~128         | Common Request / Artifact rows     |
| With read-set hash               | +32          | Observation / Decision typical     |
| With hook witness                | +32          | Only when verdict ≠ continue       |
| With context-window commitment   | +33          | Decision rows only (32 + 1 byte method) |
| With CBOR envelope tail          | +40–80       | EventId, parentId, taskId, trustTier |

Typical session row mix (rough, post-bootstrap, per turn):

| Row kind         | Per turn | Prefix bytes / turn | CAS body / turn |
|------------------|----------|---------------------|------------------|
| Request          | 2–5      | 256–640             | 1–8 KiB          |
| Artifact         | 2–5      | 256–640             | 4–32 KiB         |
| Observation      | 5–15     | 800–2400            | 8–64 KiB         |
| Decision         | 0–2      | 0–360               | 0–4 KiB          |
| Question         | 0–1      | 0–128               | 0–1 KiB          |

A 200-turn session lands at roughly **1–2 MiB WAL prefix + 4–20 MiB CAS**
before compaction. Offset-0 bootstrap rows add a one-time **~600 bytes
prefix + 4–64 KiB CAS** per session (dominated by the system prompt and tool
definitions).

Segment count per session: typically 1; long-running sessions roll at 64 MiB
intervals. CAS deduplication across forks is implicit (same hash ⇒ same
file); fork storage cost is dominated by new content, not parent replay.

## 3.13 Hash-Chain Linking and Self-Audit

The chain is the union of two rules:

- **Row-level:** `selfRoot[i] = BLAKE3(cbor(row_i \ selfRoot))` and
  `prevRoot[i] = selfRoot[i-1]`. The first row of segment 0 uses
  `prevRoot[0] = SESSION_GENESIS_HASH := BLAKE3("crucible:session:" || sessionId)`.
- **Session-level:** the per-session manifest stores `lastSelfRoot` updated
  every group-commit. `cairn fsck <sessionId>` rebuilds the chain from
  segment scan and asserts the manifest's `lastSelfRoot` matches the
  re-derived value; any mismatch is a hard fail.

The hash chain is **append-only by construction**: there is no row field
that can be edited without breaking `selfRoot`, and `selfRoot` is included
in the next row's `prevRoot`, so tampering with row `i` invalidates every
row `≥ i` simultaneously. Replay (§11) recomputes the chain end-to-end and
compares to the stored `selfRoot` per row.

Forks preserve the chain at the fork boundary: child segment 0's
`prevRoot[1]` (offset 1; offset 0 is the synthetic `fork_origin`
Observation) equals parent's `selfRoot` at `forkOffset - 1`. `cairn fsck
--with-parent` traverses the cross-session edge.

## 3.14 Seam Map

The following table is the source of truth for which L1 internals are
unit-testable in isolation, which are component-testable behind Laura's §3.2
collaborator contracts, and which require the file-backed integration tier
(Laura §5.2). Component tests substitute the seam name's test double; the
real implementation is exercised by the contract suite (§3.16) plus
integration tests.

| Internal                       | Tier            | Seam (Laura §3.x name)         | Test double class          |
|--------------------------------|-----------------|--------------------------------|----------------------------|
| `enforcePrimitiveScale`        | unit            | (pure function)                | none — direct call         |
| `enforceMonotonicTimestamps`   | unit            | (pure function)                | none — direct call         |
| `sealAndSplit`                 | unit            | (pure function)                | none — direct call         |
| `ReadSetHasher.hashSequence`   | unit + contract | `ReadSetHasher` (§3.2)         | stub returns `0x00…01`     |
| `ContextWindowResolver.resolve`| component       | `ContextWindowResolver`        | fake with in-memory ledger |
| `LedgerWindowReader.prefix`    | component       | `LedgerWindowReader` (§3.1)    | fake reads from `WalRow[]` |
| `LedgerWindowReader.byIds`     | component       | `LedgerWindowReader`           | fake map lookup            |
| `AppendProtocol.append`        | component       | `AppendProtocol` (§3.2)        | mock asserts row shape     |
| `AppendProtocol.bootstrap`     | component       | `AppendProtocol`               | mock asserts batch atomicity |
| `PreCommitHookBus.dispatch`    | component       | `PreCommitHookBus` (§3.2)      | spy records hook invocations |
| Segment writer / fsync         | integration     | (none — file-backed)           | real disk, temp dir        |
| CAS read / write               | integration     | (none — file-backed)           | real disk, temp dir        |
| Hash-chain rebuild (`cairn fsck`) | integration  | (none)                         | real disk, golden corruption fixtures |
| L1Subscriber broadcast         | component       | (broadcast list)               | spy records `onCommit` calls |

## 3.15 Failure Modes and Recovery

| Failure                              | Detection                              | Recovery                                          |
|--------------------------------------|----------------------------------------|---------------------------------------------------|
| Segment write torn (crash mid-write) | `crc32c` mismatch on rescan            | Truncate to last valid record; staging queue replays losses |
| CAS body missing for committed row   | `cairn fsck` BLAKE3 mismatch           | Hard fail; session marked corrupt, fork from last good snapshot (§15) |
| Hash-chain break                     | `cairn fsck` `prevRoot` ≠ `selfRoot[i-1]` | Hard fail; same recovery as above              |
| `PRIMITIVE_SCALE_VIOLATION`          | `enforcePrimitiveScale` pre-fsync      | Batch rejected; no partial state; surfaced to caller |
| `TIMESTAMP_REGRESSION` (append-time) | `enforceMonotonicTimestamps` pre-fsync | Batch rejected; same as above                     |
| `monotonic_violation` (post-hoc)     | replay or fsck                         | Emit `Observation{subKind: 'monotonic_violation'}`; advance by offset |
| `BOOTSTRAP_CAPTURE_COMPLETENESS_VIOLATION` | `ContextWindowResolver` resolve | Decision append rejected; Aperture attention-tier |
| Subscriber throws                    | synchronous catch in `onCommit`        | Subscriber unsubscribed; Aperture attention-tier  |

No failure mode silently advances the chain. Every recoverable failure
either re-runs from the last good `commitOffset` or emits an observable row.

## 3.15.1 Threat Model (PA)

**L1 WAL substrate security implications are governed by ADR-0002 (L1 WAL Substrate Selection).** See `docs/adr/0002-l1-wal-substrate.md` for full threat analysis. Key points:

- **Local-disk exposure:** WAL segments contain verbatim Observation payloads (LLM responses, tool outputs). Single-user threat model (§18.1); no adversarial multi-user in v1.
- **Hash-chain tamper-evidence:** Per-row BLAKE3 chain (`prevRoot` → `selfRoot`) provides self-audit capability via `cairn fsck`. Detects corruption or intentional tampering; does not prevent it (no encryption at rest in v1).
- **CAS content unencrypted:** Content-addressed blobs stored plaintext. Encryption-at-rest deferred to v1.5+ (§18.4).
- **Retention control:** `crucible session delete --purge` is the remediation primitive (§18.4.1). Soft-warn 500 MiB, hard-limit 2 GiB / 90-day ceiling (§17.3.1).

**Cross-references:** §18.1 (single-user threat model), ADR-0002 §Security Implications, §18.4.1 (Known Limits — PII/secret handling).

## 3.16 Acceptance Signal for Laura

The shape and contracts above are sufficient for the following test
artifacts to be written without further design input from this section:

- **A1 — Fork lineage at WAL level.** Forks materialize `fork_origin`
  Observations at offset 0; hash chain crosses the fork boundary; A1 walks
  `getAncestry()` against §3.13.
- **A2 — Hermetic replay byte-equality.** Replay reconstructs `selfRoot`
  end-to-end per §3.13 and asserts equality modulo `timestampNs`
  (§3.10 + Laura `normalizeTimestamps()`).
- **A3 — Hook bus pre-commit.** Hook verdicts are durable on the paused
  row via §3.5 seal-and-split; A3 asserts verdict persistence and
  exactly-once-pause through crash injection at the fsync barrier.
- **A4 — Causal slice reads ledger prefix.** `LedgerWindowReader.prefix`
  returns the exact prefix; A4 asserts read-set hash equality between
  emission-time and replay-time via §3.7.
- **A9 — Determinism conformance.** `ReadSetHasher` + CBOR canonicalization
  produce identical 32-byte digests across runs; A9 runs golden-vector
  contract tests.

Invariant tests enabled:

- **§6.1 Append-Only.** Rows are immutable post-`append()` return; chain
  rule guarantees mutation is detectable; A1 + fsck cover the property.
- **§6.2 Hash-Chain Integrity (context-window commitment).** §3.7 +
  `ReadSetHasher` determinism; same window ⇒ same `contextWindowCommitment`.
- **§6.3 Replay Equivalence.** §3.13 chain + §3.10 timestamp-exclusion +
  §3.7 resolver tag-driven reconstruction.
- **§6.8 Bootstrap-Capture-Completeness.** §3.8 bootstrap-batch atomicity +
  §3.7 declared-window-out-of-prefix error path.
- **§6.9 Monotonic-Timestamps-Within-Session.** §3.10 enforcement and
  violation-detection emission.

## 3.17 Ripples Into Later Sections

The following commitments propagate from this section:

- **§4 (Hook Bus)** — `PreCommitHookBus` fires inside the group-commit
  window (§3.4 / §3.5); WAL fields `hookVerdict` + `hookVerdictWitness` are
  the durable witness; seal-and-split is the in-flight protocol on pause.
- **§5 (Router)** — receives pause verdicts via L1Subscriber's broadcast on
  the paused row, not via §4 directly. Router state is replayable from
  recorded verdict rows + policy version (per Gabriel's signoff §6).
- **§10 (Session Model)** — bootstrap sequencing materializes offset-0 from
  §3.8; fork creation invokes §3.13's cross-session chain rule; the CALL/RET
  fields pinned in §3.3.4 are projected by §10.6 into the per-session
  invocation-stack derived view.
- **§5 (Router / Scheduler boundary)** — scheduler-emitted `Decision` rows
  (§3.3.5) traverse `AppendProtocol` indistinguishably from any other
  Decision; the L3.5 Scheduler tier is a first-class L1 row producer.
- **§11 (Hermetic Replay)** — replay reads `commitmentMethod` per Decision
  row and reconstructs via §3.7's two paths; refuses to advance past
  offset 0 on bootstrap-manifest mismatch.
- **§15 (Compaction / Snapshots)** — snapshot is a CBOR-canonical pin of
  `lastSelfRoot` + segment range; compaction does not rewrite WAL prefix
  bytes, only CAS GC on dead-after-snapshot bodies.

No new open question is surfaced by this section. All R2 OQs, TDD Q1–Q8,
and Phase A locks are honored as-is.
