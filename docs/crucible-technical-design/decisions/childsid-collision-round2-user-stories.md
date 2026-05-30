**SUPERSEDED by ADR-0019 (2026-05-30)** — Aaron ruled in favor of the hybrid always-prompt design. See `docs/adr/0019-childsid-collision-hybrid.md`.

---

# childSid Collision — Round 2: User Stories + Hybrid Proposal

**Status:** DRAFT — awaiting Aaron ruling (Round 2)  
**Finding:** Aaron requested user stories for Options A, C, and hybrid ("give the user the option to start fresh or resume")  
**Owner:** Rosella  
**Date:** 2026-05-30

---

## Aaron's Framing (2026-05-30)

> "Both A and C have merit and I guess I'm struggling to understand the user stories for each. Maybe we give the user the option to start fresh or resume?"

Aaron is not picking between A and C — he wants to **understand the UX** better before committing, and is leaning toward a **hybrid where the user decides at fork time**. This document walks through four concrete user stories under each option, then designs the hybrid.

---

## User Stories

### US-1: Quick Experiment, Abort, Retry

**Scenario:** Aaron forks session `A` at offset 50 to try GPT-5.4. After 3 prompts, the output is garbage. He Ctrl-C aborts and immediately forks at offset 50 again to try Claude Opus instead.

#### Option A (Timestamp Preimage)

- **First fork:** `childSid_1 = blake3(parentSid || ':50:' || timestamp_1)`. WAL lives in `wal/sessions/childSid_1/`. Aaron runs 3 turns, hits Ctrl-C. Session status = `aborted`.
- **Second fork (10 seconds later):** `childSid_2 = blake3(parentSid || ':50:' || timestamp_2)`. New WAL directory `wal/sessions/childSid_2/`. Fresh session, clean slate.
- **What Aaron sees:** `crucible session list` shows two distinct sessions: `childSid_1` (aborted, 3 turns) and `childSid_2` (active, N turns).
- **WAL state:** Two directories coexist. `childSid_1/` is orphaned data (eligible for GC after 90 days or retention floor).
- **Replay:** Replay only sees `childSid_2` (the successful fork). `childSid_1` is invisible unless Aaron explicitly replays it.

**Ergonomics:** ✅ Seamless retry — just fork again. No ceremony.  
**Surprise factor:** ⚠️ Orphaned `childSid_1` directory accumulates unless GC runs. Aaron might not realize the aborted session still exists in WAL.

---

#### Option C (Resume Semantics)

- **First fork:** `childSid = blake3(parentSid || ':50')`. WAL lives in `wal/sessions/childSid/`. Aaron runs 3 turns, hits Ctrl-C. Session status = `aborted`.
- **Second fork:** Same preimage → same `childSid`. Crucible detects collision, sees `status='aborted'`, **resumes** the existing session. Offset 0–2 = GPT-5.4 turns (aborted prefix). Offset 3+ = Claude Opus turns (resumed suffix).
- **What Aaron sees:** `crucible session list` shows **one session** (`childSid`, status = `resumed`). Both the aborted prefix and resumed suffix are in the same ledger.
- **WAL state:** One directory. The ledger contains both experiments: `[0:fork_bootstrap, 1:GPT-5.4-turn, 2:GPT-5.4-turn, 3:GPT-5.4-turn, 4:fork_resume{resumedAt}, 5:Opus-turn, ...]`.
- **Replay:** Replay sees the full contiguous ledger — 3 turns of GPT-5.4, then 4+ turns of Opus. The `fork_resume` Observation row marks the transition.

**Ergonomics:** ✅ Idempotent fork — "ensure a session exists at offset 50."  
**Surprise factor:** ⚠️ **Aaron might not realize he's continuing the aborted session**. If he forgets he already tried GPT-5.4 at offset 50 three days ago, the resumed ledger will start with GPT-5.4's garbage output. **Confusing unless Aaron checks `crucible session info childSid`.**

---

#### Hybrid (User Chooses)

- **First fork:** Aaron runs `crucible fork --at 50`. Default behavior (to be determined — see Hybrid Proposal below). Let's say default = fresh. `childSid_1` created.
- **Second fork (Option 1 — fresh):** Aaron runs `crucible fork --at 50 --fresh`. New `childSid_2`, clean slate.
- **Second fork (Option 2 — resume):** Aaron runs `crucible fork --at 50 --resume` (or `crucible session resume childSid_1`). Same `childSid_1`, continues from offset 3.
- **Second fork (Option 3 — interactive prompt):** Aaron runs `crucible fork --at 50`. Crucible detects collision:
  ```
  Session fork collision detected.
    Parent: session_abc123
    Fork point: offset 50
    Existing child: session_xyz789 (status: aborted, 3 turns, created 2026-05-30T10:15:00Z)
  
  Resume the aborted session or start fresh?
    [R] Resume session_xyz789 (continue from offset 3)
    [F] Start fresh session (new childSid, clean slate)
    [C] Cancel
  ```
  Aaron presses `F` → fresh session.

**Ergonomics:** ✅ Maximum control — Aaron decides every time.  
**Surprise factor:** ✅ No surprises — collision is surfaced, Aaron picks.

---

### US-2: Long-Running Fork, Crash Mid-Session, Resume Next Morning

**Scenario:** Aaron forks at offset 50, makes 200 decisions over 3 hours. Machine crashes overnight (power outage, not a clean close). Next morning he runs `crucible fork --at 50` expecting to pick up where he left off.

#### Option A (Timestamp Preimage)

- **First fork:** `childSid_1` created at `2026-05-30T14:00:00Z`. 200 turns written to WAL. Machine crashes — `status='aborted'` (no clean close).
- **Next morning:** Aaron runs `crucible fork --at 50`. New `childSid_2` created (timestamp = `2026-05-31T09:00:00Z`). **Fresh session, not a resume**. Aaron loses 200 decisions unless he manually identifies `childSid_1` and explicitly requests resume.
- **Recovery path:** Aaron must run `crucible session list --status=aborted` to find `childSid_1`, inspect it, then decide: resume via explicit command (if that exists), or abandon and start fresh.

**Ergonomics:** ⚠️ **Data loss risk** if Aaron forgets the crash and reflexively forks at offset 50 again.  
**Surprise factor:** ⚠️ Silent divergence — Aaron might not realize he had an aborted session until he sees orphaned WAL directory or runs `session list`.

---

#### Option C (Resume Semantics)

- **First fork:** `childSid` created. 200 turns written to WAL. Machine crashes — `status='aborted'`.
- **Next morning:** Aaron runs `crucible fork --at 50`. Same `childSid`. Crucible detects collision, sees `status='aborted'`, **automatically resumes**. Offset 0–199 = yesterday's work. Offset 200+ = this morning's continuation.
- **Recovery path:** None needed — resume is automatic.

**Ergonomics:** ✅ **Automatic crash recovery**. Aaron's work is preserved and continued.  
**Surprise factor:** ✅ Crash recovery is the expected behavior. **But:** if Aaron crashes twice (crash → resume → crash again), the third fork at offset 50 will resume from the second crash point, not start fresh. This is idempotent but might surprise Aaron if he expects "crash = abort, next fork = fresh."

---

#### Hybrid (User Chooses)

- **First fork:** `childSid_1` created. Crash → `status='aborted'`.
- **Next morning:** Aaron runs `crucible fork --at 50`. Crucible detects collision:
  ```
  Session fork collision detected.
    Parent: session_abc123
    Fork point: offset 50
    Existing child: session_xyz789 (status: aborted, 200 turns, created 2026-05-30T14:00:00Z, last active 2026-05-30T17:15:33Z)
  
  Resume the aborted session or start fresh?
    [R] Resume session_xyz789 (continue from offset 200)
    [F] Start fresh session (new childSid, loses 200 turns)
    [C] Cancel
  ```
  Aaron sees "200 turns" and realizes his work is salvageable. Presses `R` → resume.

**Ergonomics:** ✅ Explicit choice — Aaron sees the collision and picks resume.  
**Surprise factor:** ✅ No data loss — collision surfacing prevents silent abandonment.

---

### US-3: Intentional Re-Fork to Compare Two Strategies

**Scenario:** Aaron forks at offset 50, runs "strategy X" to completion (30 turns, clean close, `status='closed'`). Later he forks at offset 50 **again** to run "strategy Y" for side-by-side comparison. Both should be distinct experiments in the audit trail.

#### Option A (Timestamp Preimage)

- **First fork:** `childSid_1` (strategy X). Runs to completion, closes cleanly. `status='closed'`.
- **Second fork:** `childSid_2` (strategy Y). New WAL directory, fresh ledger. Both coexist as distinct children of session `A`.
- **What Aaron sees:** `crucible session list --parent=A` shows two children: `childSid_1` (closed, 30 turns) and `childSid_2` (active/closed, M turns).
- **Branching visualization:** `crucible session tree A` shows:
  ```
  session_A (offset 0–50)
    ├─ childSid_1 (strategy X, closed, 30 turns)
    └─ childSid_2 (strategy Y, closed, M turns)
  ```

**Ergonomics:** ✅ **Natural comparison workflow**. Each strategy is a separate session.  
**Surprise factor:** ✅ No surprises — both sessions are distinct and visible.

---

#### Option C (Resume Semantics)

- **First fork:** `childSid` (strategy X). Runs to completion, closes cleanly. `status='closed'`.
- **Second fork:** Same preimage → same `childSid`. Crucible detects collision, sees `status='closed'`. **Closed sessions are immutable** (Aaron lock from original options doc). Crucible refuses the fork:
  ```
  Error: Cannot fork — collision with closed session.
    Parent: session_A
    Fork point: offset 50
    Existing child: childSid (status: closed, 30 turns)
  
  Suggested actions:
    1. Use a different fork offset
    2. Delete the closed session if comparison is no longer needed: crucible session delete childSid
  ```
- **Recovery path:** Aaron must either (a) delete `childSid` to free the slot, or (b) fork at a different offset (e.g., offset 51) to force a distinct `childSid`.

**Ergonomics:** ⚠️ **Blocked workflow** — Aaron cannot re-fork the same offset after closing. Requires manual cleanup or workaround.  
**Surprise factor:** ⚠️ **Friction for comparison workflows**. Option C optimizes for crash recovery, not side-by-side experimentation.

---

#### Hybrid (User Chooses)

- **First fork:** `childSid_1` (strategy X). Closes cleanly.
- **Second fork:** Aaron runs `crucible fork --at 50 --fresh` (or interactive prompt → `F`). New `childSid_2` created. Both coexist.

**Ergonomics:** ✅ Comparison workflow works — Aaron explicitly requests fresh fork.  
**Surprise factor:** ✅ No friction if `--fresh` is the default or Aaron knows to use it.

---

### US-4: Forgot I Already Aborted This — Accidental Resume

**Scenario:** Aaron aborted a fork at offset 50 three days ago (tried an experiment, didn't work, abandoned). Today he forgets about the aborted session and forks at offset 50 again, expecting a fresh start for a **different experiment**.

#### Option A (Timestamp Preimage)

- **Three days ago:** `childSid_1` created, aborted after 5 turns. `status='aborted'`.
- **Today:** New `childSid_2` created. Clean slate, fresh experiment. Aaron never sees `childSid_1` unless he runs `session list`.

**Ergonomics:** ✅ No accidental resume — each fork is fresh by default.  
**Surprise factor:** ✅ No surprises. Orphaned `childSid_1` is invisible unless Aaron explicitly looks for it.

---

#### Option C (Resume Semantics)

- **Three days ago:** `childSid` created, aborted after 5 turns. `status='aborted'`.
- **Today:** Same `childSid`. Crucible resumes the 3-day-old aborted session. Offset 0–4 = old experiment. Offset 5+ = new experiment. **Aaron might not realize he's continuing the old session until he inspects the ledger.**
- **Confusion signal:** Aaron runs `crucible session info childSid` and sees: `created_at: 2026-05-27`, `resumed_at: 2026-05-30`, `status: resumed`. Or he notices the ledger starts with 5 turns of unrelated work.

**Ergonomics:** ⚠️ **Surprise resume**. Aaron's new experiment is entangled with the old one.  
**Surprise factor:** ⚠️ **High surprise**. Option C assumes "fork at offset 50 = continuation," but Aaron's mental model is "fork at offset 50 = fresh attempt." Time gap amplifies the surprise.

---

#### Hybrid (User Chooses)

- **Three days ago:** `childSid_1` created, aborted.
- **Today:** Aaron runs `crucible fork --at 50`. Crucible detects collision:
  ```
  Session fork collision detected.
    Parent: session_abc123
    Fork point: offset 50
    Existing child: session_xyz789 (status: aborted, 5 turns, created 2026-05-27T14:22:00Z, **3 days ago**)
  
  Resume the aborted session or start fresh?
    [R] Resume session_xyz789 (continue from offset 5)
    [F] Start fresh session (new childSid, clean slate)
    [C] Cancel
  ```
  Aaron sees "3 days ago" and realizes this is the old experiment. Presses `F` → fresh session.

**Ergonomics:** ✅ Collision surfacing prevents accidental resume.  
**Surprise factor:** ✅ No surprises — Aaron is prompted and chooses.

---

## User Story Dominant Pattern Analysis

| User Story | Option A | Option C | Hybrid |
|-----------|----------|----------|--------|
| US-1 (quick retry) | ✅ Seamless | ⚠️ Silent resume | ✅ User choice |
| US-2 (crash recovery) | ⚠️ Data loss risk | ✅ Auto-recovery | ✅ Explicit choice |
| US-3 (side-by-side comparison) | ✅ Natural | ⚠️ Blocked | ✅ Works if `--fresh` |
| US-4 (accidental resume) | ✅ No surprise | ⚠️ High surprise | ✅ Surfaced |

**Pattern dominance:**
- **US-1 (quick retry)** is likely the most common — Aaron experiments, aborts, tries again. Option A is seamless; Option C is surprising (silent resume). **Hybrid needs good defaults.**
- **US-2 (crash recovery)** is the strongest argument for Option C — automatic salvage of 200 decisions is valuable. But it's rarer than US-1 (crashes are uncommon if sessions close cleanly).
- **US-3 (side-by-side comparison)** is a **design-time workflow** that Crucible should support well. Option C blocks it; Option A and Hybrid enable it naturally.
- **US-4 (accidental resume)** is the "3 days later" edge case. Option C has high surprise factor; Option A and Hybrid avoid it.

**Verdict:** **US-1 and US-3 dominate frequency**. Aaron experiments more often than he crashes. The default behavior should optimize for fresh retries (US-1) and side-by-side comparison (US-3), with explicit opt-in for resume (US-2 recovery case).

---

## Hybrid Proposal: User-Choice Fork

### Design Principles

1. **Default behavior optimizes for US-1/US-3** (fresh retries, side-by-side comparison).
2. **Collision surfacing prevents silent surprises** (US-4).
3. **Resume is opt-in, explicit** (US-2 crash recovery).
4. **Determinism is preserved** — the user's choice is recorded as a Decision row so replay is unambiguous.

### CLI Surface

#### Default Behavior (No Flag)

```bash
crucible fork --at 50
```

**Behavior on collision:**
- If `status='closed'` → **error** (closed sessions are immutable, cannot resume or overwrite)
- If `status='aborted'` → **interactive prompt**:
  ```
  Session fork collision detected.
    Parent: session_abc123
    Fork point: offset 50
    Existing child: session_xyz789 (status: aborted, N turns, created YYYY-MM-DD HH:MM:SS, X days/hours ago)
  
  [R] Resume (continue from offset N)
  [F] Fresh (new session, orphan the aborted one)
  [C] Cancel
  ```
  Default selection: **`F` (Fresh)** if the aborted session is >1 hour old. **`R` (Resume)** if <1 hour (likely same work session).

#### Explicit `--fresh` Flag

```bash
crucible fork --at 50 --fresh
```

**Behavior on collision:**
- Always create a new `childSid` (timestamp-variant preimage: `parentSid || ':' || offset || ':' || created_at_ns`).
- Orphan any existing aborted session at the same offset (eligible for GC).
- No prompt — silent fresh fork.

**Use case:** Aaron knows he wants a new session (US-3 comparison workflow, or US-1 after deciding the aborted work is garbage).

#### Explicit `--resume` Flag

```bash
crucible fork --at 50 --resume
```

**Behavior on collision:**
- If `status='aborted'` → **resume** the existing `childSid` (no new session created).
- If `status='closed'` → **error** (cannot resume closed session).
- If no collision → **error** ("No aborted session found at fork point. Use `crucible fork --at 50` to start fresh.")

**Use case:** Aaron knows he crashed and wants to continue (US-2 crash recovery).

#### Separate `crucible session resume <childSid>` Verb

```bash
crucible session resume <childSid>
```

**Behavior:**
- Directly resume the specified `childSid` if `status='aborted'`.
- Error if `status='closed'` or `status='active'`.

**Use case:** Aaron inspects `crucible session list --status=aborted`, picks the session to resume.

### Preimage Scheme

- **Fresh fork:** `childSid = blake3('crucible:session:' || parentSid || ':' || forkPointOffset || ':' || created_at_ns)`
- **Resume fork:** Reuse existing `childSid` from `sessions` table. Append new rows starting at `nextOffset`. Add `fork_resume` Observation row at the resume point.

### Determinism / Replay Semantics

**Decision Row at Fork:**

Every fork (fresh or resume) writes a Decision row to the **parent session's ledger**:

```ts
interface ForkDecision {
  kind: 'decision';
  payload: {
    question: 'Fork session at offset 50?';
    chosenOption: 'fresh' | 'resume';
    alternatives: ['fresh', 'resume'];
    evidence: {
      rationale: '--fresh flag provided' | '--resume flag provided' | 'user selected Fresh at prompt' | 'user selected Resume at prompt';
      existingChildSid: SessionId | null;  // null if fresh, childSid if resume
      collisionDetected: boolean;
    };
  };
}
```

**Replay implications:**
- Replay reads the Decision row and knows whether the fork was fresh or resumed.
- If fresh, replay uses the recorded `childSid` (which includes the timestamp in the preimage).
- If resumed, replay appends to the existing `childSid` ledger starting at the resume offset.

**Key insight:** Replay doesn't re-prompt the user. It reads the recorded Decision and follows the same path.

---

## Updated Recommendation

**Hybrid Lean (User Chooses, Default = Fresh).**

**Reasoning:**

1. **US-1 and US-3 dominate frequency** — Aaron experiments and compares more often than he crashes. Fresh-by-default optimizes for the common case.
2. **US-2 crash recovery is valuable but rare** — explicit `--resume` flag or interactive prompt preserves the option without making it the default.
3. **US-4 accidental resume is prevented** — collision surfacing + default=fresh avoids surprise.
4. **No silent behavior** — the interactive prompt on collision gives Aaron full visibility and control.
5. **Determinism preserved** — Decision row in parent ledger records the user's choice, making replay unambiguous.
6. **Implementation cost is moderate** — interactive prompt requires CLI scaffolding, but it's a one-time investment. The preimage scheme (timestamp-variant) is already Option A's design.

**Default recency heuristic:** If the aborted session is **<1 hour old**, default to `R` (Resume). If **>1 hour**, default to `F` (Fresh). This balances crash recovery (US-2, same work session) vs. accidental resume (US-4, days later). Aaron can always override via arrow keys.

**Alternative (if Aaron prefers minimal ceremony):** Always default to `F` (Fresh), no recency heuristic. Resume is always explicit via `--resume` flag or separate `crucible session resume` verb. This maximizes predictability at the cost of making US-2 recovery slightly less automatic.

---

## Next Steps (Awaiting Aaron Ruling)

1. **If Hybrid accepted:**
   - Add `--fresh` and `--resume` flags to `crucible fork` CLI verb (§13.1)
   - Add interactive collision prompt to fork protocol (§10.4)
   - Add `crucible session resume <childSid>` verb to §13.1
   - Extend `sessions` table with `resumed_at_ns` column and `resumed` status value
   - Add `fork_resume` Observation sub-kind to §6.3 taxonomy
   - Update fork protocol in §10.4 to record Decision row in parent ledger
   - Coordinate with Roger on CLI implementation timeline

2. **If Aaron picks Option A (fresh-only) or Option C (resume-only):**
   - Execute the original options doc next steps (already specified in `childsid-collision-options.md`)

3. **Either way:**
   - Update §3 GC policy to surface aborted-fork cleanup
   - Add fork-collision handling to §16 acceptance signals (coordinate with Laura)
