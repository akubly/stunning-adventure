**SUPERSEDED by ADR-0019 (2026-05-30)** — Aaron ruled in favor of the hybrid always-prompt design. See `docs/adr/0019-childsid-collision-hybrid.md`.

---

# childSid Collision — Determinism Options Analysis

**Status:** DRAFT — awaiting Aaron ruling  
**Finding:** Pass A review identified deterministic childSid collision risk in §10.4 fork protocol  
**Owner:** Rosella  
**Date:** 2026-05-30

---

## Background

§10.4 fork protocol derives `childSid` deterministically from parent session and fork-point:

```pseudo
childSid := blake3('crucible:session:' || parentSid || ':' || forkPointOffset)
```

This is deterministic **within a single execution timeline**, but creates a collision hazard if:

1. Aaron forks session `A` at offset 50, starts work, then **aborts** the child session (Ctrl-C, crash, never closed cleanly).
2. Aaron later forks session `A` at offset 50 **again** (retry the experiment, different input this time).
3. Both forks produce the same `childSid` → same WAL directory `wal/sessions/<childSid>/` → second fork **overwrites** the first fork's partially written ledger.

The current preimage (`parentSid || forkPointOffset`) has no tie-breaker for "which attempt at forking offset 50?"

**Aaron's framing:** Determinism is load-bearing for replay. Any collision-prevention mechanism MUST preserve deterministic replay within a session's lifetime while handling the multi-attempt case.

---

## Option A: Add Counter/Timestamp to Preimage

**What it means:**  
Extend the `childSid` preimage to include a **session-scoped fork counter** or **fork creation timestamp**, preserved in the parent's `sessions` table. On first fork at `(parentSid, offset)`, counter = 0; on retry, counter = 1, etc. The preimage becomes:

```pseudo
childSid := blake3('crucible:session:' || parentSid || ':' || forkPointOffset || ':' || attemptCounter)
```

OR (timestamp variant):

```pseudo
childSid := blake3('crucible:session:' || parentSid || ':' || forkPointOffset || ':' || createdAtNs)
```

**Determinism guarantee:**  
✅ **Preserved within session.** Each fork attempt gets a unique `childSid` deterministically. Replay of the *successful* fork uses the recorded `childSid` from `sessions.session_id`; aborted forks are orphaned WAL directories (GC-able via §3 retention policy).

**Failure mode visibility:**  
⚠️ **Orphaned directories accumulate.** Aborted forks leave `wal/sessions/<childSid>/` directories behind until GC runs. CLI `crucible session list --status=aborted` can surface them for manual cleanup, but there's no automatic "this fork was abandoned, delete its WAL now" signal.

**Replay implications:**  
✅ **No impact.** Replay reads `sessions.session_id` (which is the successful fork's `childSid`) and replays that WAL. Orphaned attempts are invisible to replay.

**Ergonomics:**  
✅ **Transparent to user.** Forking the same offset twice "just works" — user sees two distinct child sessions in `crucible session list`.

**Implementation details:**
- **Counter variant:** Add `fork_attempt_counter` column to `sessions` table (INTEGER, defaults to 0). Increment on collision (rare case, fallback path).
- **Timestamp variant:** Use `created_at_ns` (already in `sessions` table); preimage = `parentSid || ':' || forkPointOffset || ':' || created_at_ns`. Collision probability is vanishingly small (nanosecond-resolution timestamp).

**Recommendation rationale:**  
Timestamp variant is cheaper (no counter column, no collision-retry loop). Nanosecond resolution makes collision **practically impossible** within a single boot session (two forks at the same offset would need to occur in the same nanosecond, which is mechanically impossible if fork creation is synchronous).

---

## Option B: Protocol-Error Semantics

**What it means:**  
Treat collision as a **user-facing error**, not a silent overwrite. When forking `(parentSid, offset)` would produce a `childSid` that already exists in `wal/sessions/`, **refuse the fork** and return a protocol error:

```
Error: Session fork collision detected.
  Parent: session_abc123
  Fork point: offset 50
  Existing child: session_xyz789 (status: aborted, created 2026-05-30T07:15:22Z)

Suggested actions:
  1. Resume the aborted session: crucible session resume session_xyz789
  2. Delete the aborted session: crucible session delete session_xyz789
  3. Retry fork with explicit disambiguator: crucible fork --at 50 --label "retry-v2"
```

**Determinism guarantee:**  
✅ **Preserved within successful forks.** Deterministic `childSid` is unchanged; collision is an *operational error*, not a design ambiguity.

**Failure mode visibility:**  
✅ **Maximally visible.** User is forced to acknowledge the collision and choose a resolution path. No silent accumulation of orphaned directories.

**Replay implications:**  
✅ **No impact.** Replay only sees closed/successful sessions; aborted forks that trigger collisions are never replayed (they have no valid commit history).

**Ergonomics:**  
⚠️ **Ceremony on retry.** User must explicitly handle the aborted session before retrying. For a "quick experiment, abort, retry" workflow, this adds friction.

**Implementation details:**
- Check `EXISTS(wal/sessions/<computed-childSid>/)` before creating fork segment
- Return structured error with `existingChildSid`, `existingChildStatus`, `existingChildCreatedAt`
- CLI surface: `crucible session resume <sid>` (if salvageable) or `crucible session delete <sid> --force` (if not)
- Optional: `--disambiguator` flag on `crucible fork` to append user-provided label to preimage

**Recommendation rationale:**  
Maximum transparency — collisions are a *bug signal* (why is the same experiment being re-forked without closing the first attempt?), not a routine case. Surfacing them as errors forces good session hygiene.

---

## Option C: Resume-Aborted-Session Semantics

**What it means:**  
Treat `childSid` collision as a **continuation signal**: if forking `(parentSid, offset)` produces a `childSid` that already exists and the existing session has `status='aborted'`, **resume that session** instead of creating a new one. The fork operation becomes idempotent: "ensure a child session exists at this fork point; if one was started but aborted, continue it."

**Determinism guarantee:**  
✅ **Preserved across retries.** The *same* `childSid` resumes the *same* ledger. Replay sees a single continuous history (parent prefix + aborted-then-resumed child).

**Failure mode visibility:**  
⚠️ **Continuation is silent.** User forks at offset 50, gets back a `childSid`; doesn't know if it's a fresh fork or resumed aborted session unless they check `crucible session info <childSid>`.

**Replay implications:**  
✅ **Natural replay semantics.** Aborted-then-resumed sessions replay as one contiguous ledger. Offset 0 is the original fork bootstrap; offset N is the resume point; offset M is the final close.

**Ergonomics:**  
✅ **Seamless retry workflow.** User forks, experiments, aborts (Ctrl-C), forks again at the same offset → picks up where they left off. No manual session cleanup.

**Implementation details:**
- On fork collision, check `sessions.status`:
  - `status='active'` → hard error (true collision; can't resume an active session)
  - `status='aborted'` → return existing `childSid`, append new rows starting at `nextOffset`
  - `status='closed'` → hard error (closed sessions are immutable)
- Add `resumed_at_ns` column to `sessions` table to track resume events
- Observation row at resume: `fork_resume{resumedAt, originalCreatedAt, abortedAt}`

**Recommendation rationale:**  
Idempotent fork semantics align with Crucible's append-only philosophy (no overwrites, only extensions). The continuation is "honest" — the resumed session's ledger contains both the aborted prefix and the resumed suffix, making the full timeline auditable.

---

## Tradeoffs Summary

| Dimension | Option A: Counter/Timestamp | Option B: Protocol Error | Option C: Resume Semantics |
|-----------|----------------------------|-------------------------|---------------------------|
| **Determinism within session** | ✅ Preserved (unique per attempt) | ✅ Preserved (user resolves) | ✅ Preserved (same childSid resumes) |
| **Determinism across retries** | ⚠️ Different childSid per attempt | ⚠️ User picks resolution | ✅ Same childSid resumes |
| **Failure mode visibility** | ⚠️ Orphaned dirs accumulate | ✅ Hard error, explicit choice | ⚠️ Silent continuation |
| **Replay complexity** | ✅ Simple (one childSid wins) | ✅ Simple (only closed sessions replay) | ✅ Natural (one contiguous ledger) |
| **Ergonomics (retry workflow)** | ✅ Transparent | ⚠️ Manual cleanup ceremony | ✅ Seamless idempotent retry |
| **Implementation cost** | ✅ Low (one column or use existing timestamp) | ⚠️ Medium (error surface + CLI verbs) | ⚠️ Medium (resume protocol + Observation row) |
| **Alignment with append-only philosophy** | ⚠️ Multiple attempts → orphaned data | ✅ Explicit user choice | ✅ Append-only continuation |

---

## Recommendation

**Option A (timestamp variant): Add `created_at_ns` to preimage.**

**Reasoning:**  
1. **Lowest implementation cost** — `created_at_ns` already exists in `sessions` table; no new columns, no new CLI verbs.
2. **Deterministic and collision-free** — nanosecond-resolution timestamp makes collision practically impossible in synchronous fork creation.
3. **Transparent to user** — retry "just works" without ceremony.
4. **Replay is simple** — each fork attempt gets a unique `childSid`; replay uses the recorded successful fork.
5. **Orphaned directories are manageable** — `crucible session gc --dry-run` can list aborted forks for manual review; GC policy cleans them on retention ceiling.

**Second choice: Option C (resume semantics)** if Aaron values **idempotent retry** over **unique-attempt identity**. The philosophical question: is a retried fork a *new experiment* (Option A) or a *continuation of the aborted attempt* (Option C)?

**Reject Option B** unless Aaron wants collision visibility as a *forcing function* for session hygiene. Option B maximizes transparency but adds the most ceremony.

---

## Next Steps (Awaiting Aaron Ruling)

1. **If Option A (timestamp):**  
   - Update §10.4 fork protocol pseudocode to include `|| ':' || created_at_ns` in preimage  
   - Document collision-prevention guarantee in §10.4 (practical impossibility under synchronous fork)  
   - Add `crucible session gc --status=aborted` to §13 CLI surface (optional cleanup helper)

2. **If Option C (resume):**  
   - Add resume protocol to §10.4 (collision → check status → resume if aborted)  
   - Add `fork_resume` Observation sub-kind to §6.3 taxonomy  
   - Update `sessions.status` state machine in §10.1 to include `aborted → resumed → {active, closed}`  
   - Document idempotent fork semantics in §10.4  

3. **If Option B (protocol error):**  
   - Add collision-detection check to §10.4 fork protocol  
   - Add `crucible session resume <sid>` and `crucible session delete <sid>` to §13.1 verb table  
   - Document error surface + suggested actions in §10.4  
   - Add `--disambiguator` flag to `crucible fork` in §13.1

4. **Either way:**  
   - Update §3 GC policy to surface aborted-fork cleanup (if Option A) or resume logic (if Option C)  
   - Coordinate with Roger on fork protocol implementation timeline
