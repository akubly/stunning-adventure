# Laura — S4 Replay Deepening Decisions

**Date:** 2026-06-27T22:38:31-07:00  
**Branch:** squad/s4-replay  
**File:** `packages/crucible-core/src/__tests__/unit/replay-conformance.test.ts`  
**Test delta:** 247 → 270 (23 new, 1 skipped/deferred)

---

## D1 — A1 deferred to Phase 1 (fork() not yet implemented)

**Decision:** The A1 conformance test (fork lineage preserved through replay) is
written as `it.skip(...)` with a full comment block documenting what fork()
must prove. It will turn RED automatically when `fork(parent, atOffset)` lands.

**Rationale:** `fork()` requires Phase-1 session-reopen infrastructure — both
the catalog lookup (`openSkeletonSession(sessionId, rootDir)`) and the
`ForkLineage` metadata surface on `ReplayReport`. Neither exists in Phase 0.5.
The skip is not a cop-out; it is an active specification anchor.

**Affected parties:** Roger (session-reopen seam), Graham (openSkeletonSession factory).

---

## D2 — A3 split into two layers: WAL durability + oracle compatibility

**Decision:** A3 conformance is split into:
- (a) **WAL durability**: `hookVerdict` bytes (0xFF / 0x00 / 0x01 / 0x02) round-trip
  correctly through `commitRow → close → read-only-reopen → readSegmentRecords()`.
  Tests RE-A3-1 through RE-A3-5 cover this layer.
- (b) **Oracle compatibility**: The ReplayEngine `oracle` is hash-based
  (`payloadHash`, `readSetHash`, `envelopeCbor`) — it does NOT re-compare
  `hookVerdict` bytes, because it re-materializes with `COMMIT/null` (0xFF) and
  only checks CAS-derived hashes. RE-A3-4 confirms mixed-verdict sessions still
  produce `status='pass'`.

**Full A3 as spec'd in §11.8** (rows with `.hooks` field on replayed output)
requires a Phase-1 `ReplayDriver` that emits row-level output. Not today.

**Rationale:** The spec's A3 pseudocode requires `rows(replayed)` returning
structured rows with `.hooks`. The current `ReplayEngine.replay()` returns only
a `ReplayReport`. Splitting gives us evidence NOW (verdict bytes durable) without
over-promising the interface.

**Recommendation to implementation team:** When Phase-1 `ReplayDriver` row output
lands, extend the replay-conformance suite with a row-level A3 layer that compares
`.hookVerdict` across original vs. replayed segment records directly.

---

## D3 — A4 tested at WAL-durability layer (ReadSetHasher deferred)

**Decision:** A4 conformance is tested by:
- Verifying `readSetHash` in segment records is non-zero for non-empty
  `causalReadSet`, zero-hash for empty.
- Verifying `readSetHash` is byte-identical before and after close→reopen.
- Pinning `readSetHash === BLAKE3(CBOR(causalReadSet))` externally (RE-A4-5).
- Verifying `replay()` passes for sessions with non-empty `causalReadSet` on all rows.

**Full A4 as spec'd in §11.8** requires `LedgerWindowReader` and `ReadSetHasher`
(§TDD 3.1/3.2) to `causalSlice()` a replayed session and recompute
`contextWindowCommitment`. These are Phase-1 components not yet built.

**Rationale:** The causal read-set is correctly persisted in the WAL (CAS blob,
`readSetHash` in segment record header). The hash-pinning test (RE-A4-5) proves
the encoding is stable and any future change breaks CI immediately.

---

## D4 — FIFO-ordering tests focus on WAL commitOffset monotonicity

**Decision:** "Replay-ordering invariants for the FIFO scheduler boundary" are
tested as WAL `commitOffset` monotonicity checks (RE-FIFO-1 through RE-FIFO-4),
not as live FifoScheduler interaction tests.

**Rationale:** The FifoScheduler is synchronous and dispatches immediately;
there is no reordering to violate. The ordering invariant that matters for replay
is that `commitOffset` values in segment records are strictly increasing — this
is what the replay engine relies on to reconstruct causal order. The unit tests
in `fifo-scheduler.test.ts` already cover `quantaConsumed=1` /
`queueDepthAtDispatch=0`. RE-FIFO-3 adds a multi-proposal session (bootstrap +
2 turn pairs) that exercises the full offset sequence.

---

## D5 — Roger's reopen seam: three-phase write tests (RE-REOPEN-2/4)

**Decision:** The Roger reopen seam is tested by:
- Writing N rows, sealing → replay passes (N rows).
- Write-reopening and adding M more rows → replay passes (N+M rows).
- Three-phase version (RE-REOPEN-4): N=4, M=6, P=2, delta tracked at each phase.

**Key insight confirmed:** `FileSystemWalBackend.open()` replays from segment
files unconditionally (§3.10 comment: "Always replay from segment files — the
segment IS the ground truth"). This means a write-reopen of an existing session
correctly continues from the last committed offset, and the ReplayEngine covering
the full range works without any special "sealed" flag or handshake.

**Boundary condition pinned:** `lastTimestampNs` is seeded from replayed records
on reopen (RE-REOPEN-3), so clocks stay monotonically non-decreasing across the
reopen boundary. This directly guards §3.10 ("monotonicity across reopen").

**Compatibility note for Roger:** The `LedgerImpl.bootstrap()` method currently
refuses to bootstrap against a non-empty WAL. This is correct — the reopen seam
operates at the `FileSystemWalBackend` layer, below `LedgerImpl`. Phase-1 session
reopen must either bypass `LedgerImpl.bootstrap()` (by not calling it on reopen)
or provide a new `LedgerImpl.reopen()` factory that sets `hasBootstrapped=true`
and skips the empty-WAL check.

---

## Open questions for team

1. **Phase-1 A3 row output**: When does `ReplayDriver` emit per-row output with
   `.hooks`? This would close the A3 full-spec gap.

2. **A1 unlock**: What is Roger/Graham's ETA for `fork()` and
   `openSkeletonSession(sessionId, rootDir)`? The A1 test is ready to turn GREEN.

3. **A4 causal slice**: When do `LedgerWindowReader` and `ReadSetHasher` land?
   The RE-A4-5 hash-pinning test is the bridge to the full A4 oracle.
