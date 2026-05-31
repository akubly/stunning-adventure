# ADR-0019: childSid Collision — Always-Prompt Hybrid Design

**Status:** Accepted — 2026-05-30 by Aaron  
**Author:** Rosella (Plugin Dev)  
**Date:** 2026-05-30  
**CTD Anchor:** §10.4 — Fork Protocol  
**Supersedes:** None

---

## Context

§10.4 fork protocol derives `childSid` deterministically from parent session and fork-point:

```pseudo
childSid := blake3('crucible:session:' || parentSid || ':' || forkPointOffset)
```

This is deterministic **within a single execution timeline**, but creates a collision hazard if Aaron forks session `A` at offset 50, aborts the child session (Ctrl-C, crash), then later forks session `A` at offset 50 **again** (retry the experiment, different input). Both forks produce the same `childSid` → same WAL directory → potential data loss or confusion.

**Aaron's framing (2026-05-30):** User stories show value in both "fresh fork" (US-1: quick retry, US-3: side-by-side comparison) and "resume aborted" (US-2: crash recovery). Aaron requested a **hybrid where the user decides at fork time**.

**Four-persona review (Graham/Valanice/Laura/Roger)** converged on key design constraints:
1. **Graham + Laura independently caught replay-determinism blocker:** Wall-clock time (`now() - child.created_at_ns > 1 hour`) violates hermetic replay (§11). Offsets are structural; wall-clock is informational metadata.
2. **Valanice:** "New" instead of "Fresh" — clearer natural language, parallel structure with "Resume"
3. **Roger:** `--new`/`--resume` flags consistent with CLI taxonomy; TTY detection + exit codes required
4. **Laura:** `fork_resume` Observation sub-kind required for ledger trace + replay validation

---

## Options Considered

### Option A: Timestamp-Only Preimage

**Preimage:** `childSid := blake3(parentSid || ':' || offset || ':' || created_at_ns)`

**Advantages:**
- Seamless retry — just fork again, collision-free by construction
- No user prompt ceremony

**Disadvantages:**
- Orphaned directories accumulate (aborted forks leave WAL behind until GC)
- No automatic salvage of crash-recovered work (US-2: 200-turn session crash requires manual inspection)

### Option C: Resume-Only Semantics

**Preimage:** `childSid := blake3(parentSid || ':' || offset)` (original deterministic preimage)

**Behavior:** On collision, automatically resume the existing aborted session.

**Advantages:**
- Idempotent fork — "ensure a session exists at offset 50"
- Automatic crash recovery (US-2)

**Disadvantages:**
- **High surprise factor:** Aaron might not realize he's continuing the aborted session from 3 days ago. Confusing unless he checks `crucible session info childSid` first.
- Replaces US-1 (quick retry) workflow with manual `crucible session delete` + refork ceremony

### Option Hybrid (Chosen): User-Choice with Always-Prompt

**Preimage:**
- **New:** `childSid := blake3(parentSid || ':' || offset || ':' || created_at_ns)` (timestamp variant)
- **Resume:** reuse existing `childSid` from collision detection

**Behavior:**
- **TTY detected:** Interactive prompt shows `[N]ew / [R]esume / [C]ancel` with relative time ("3 days ago") and turn count
- **Non-TTY detected:** exit code 2, error message "Interactive prompt unavailable. Use --new or --resume."
- **Flags:** `--new` (explicit new session), `--resume` (explicit resume), `--no-interactive` (suppress prompt, require flag)

**Advantages:**
- Supports all four user stories (US-1 quick retry, US-2 crash recovery, US-3 side-by-side, US-4 accidental resume prevention)
- Collision surfacing teaches the fork model implicitly
- Deterministic replay via Decision row recording

**Disadvantages:**
- Adds ceremony to the default fork path (one extra keystroke on collision)
- Requires prompt UX design + TTY detection logic

---

## Decision

**Use the hybrid always-prompt design with the following specifications:**

1. **Drop wall-clock heuristic entirely.** Always prompt on collision (TTY); never auto-default by age. (Graham + Laura finding: wall-clock violates replay determinism.)
2. **Always-prompt UX:** TTY shows `[N]ew / [R]esume / [C]ancel`; relative time ("3 days ago") shown alongside ISO timestamp for the existing aborted child.
3. **Naming:** "New" instead of "Fresh" (Valanice — parallel structure with "Resume").
4. **Non-TTY behavior:** exit code 2, error message "Interactive prompt unavailable. Use --new or --resume."
5. **Flags:** `crucible fork <sid> --at <offset> [--new | --resume] [--no-interactive] [--label <text>]`. Mutually exclusive.
6. **Determinism:** record user's choice and result as a Decision row in PARENT ledger (`{chosenOption, existingChildSid, resultingChildSid, collisionDetectedAt}`). For `--new`, replay consumes `resultingChildSid` directly and skips timestamp/preimage recomputation. Idiomatic Question/Decision pattern.
7. **Preimage:** timestamp variant for --new (`parentSid || offset || created_at_ns`); reuse existing childSid for --resume.
8. **Observation row:** add `fork_resume` sub-kind to §6.3 taxonomy (appended at resume point in child ledger).
9. **Keep both `--resume` flag AND `crucible session resume` verb** (Roger — orthogonal workflows: flag = "resume at fork time", verb = "resume discovered aborted session").
10. **Closed-session metadata appends:** Add clarification to §10.1 that "closed ≠ sealed for metadata." Closed sessions refuse work-session appends (new tool calls, LLM responses) but accept metadata appends (fork Decisions, GC records, retention updates).

---

## Rationale

**Why hybrid over A or C alone:**
- Aaron's user stories show genuine value in both fresh-fork (US-1/US-3) and resume (US-2) workflows
- Interactive prompt is the only safe design for "tired engineer at midnight" persona (US-4) — prevents silent data loss
- Collision surfacing + prompt = training wheels that teach the fork model; flags = power-user graduation path

**Why drop wall-clock heuristic:**
- Graham + Laura independently flagged wall-clock as replay-determinism violation
- Replay executes weeks/years after original run; threshold logic (`now() - created_at_ns > 1 hour`) would flip on replay
- Offsets are structural primitives (load-bearing for replay); wall-clock time is informational metadata
- **Decision row recording** makes the prompt replay-stable: original run prompts user, records choice; replay reads recorded choice, no re-prompt

**Why "New" over "Fresh":**
- "Fresh" is adjective modifying implicit noun; "New" is noun or verb (parallel with "Resume")
- Natural language clarity: "New session" vs "Resume session"
- Single-letter shortcuts (N/R/C) are distinct

**Why parent-ledger Decision row is idiomatic:**
- Fork collision detection emits a Question ("Fork session at offset 50?")
- User interacts (CLI prompt: Resume / New / Cancel)
- User's choice is captured as a Decision row on the parent ledger
- This is **existing RFC (Request for Choice) pattern** — Questions are requests for user commitment; Decisions are recorded commitments
- "Closed" session accepts metadata appends (fork Decisions), not work-session appends (tool calls/LLM responses)

---

## What Changes

### §10.4 Fork Protocol
- Replace deterministic preimage line with collision detection + user-choice branch
- Add pseudocode for:
  - Collision detection: check if `(parentSid, offset)` already has child with `status='aborted'`
  - Interactive prompt: TTY detection, `[N]ew / [R]esume / [C]ancel` UX, relative time display
  - Decision row writing: `{eventType: 'fork.collision_choice', chosenOption: 'new' | 'resume', existingChildSid, resultingChildSid, collisionDetected: boolean}`
  - Preimage rules: timestamp variant for "new", reuse existing `childSid` for "resume"
  - Resume mechanics: append `fork_resume` Observation at resume point

### §10.1 Session State Machine
- Add `aborted → resumed` transition
- Add clarification: "Closed sessions accept metadata appends (fork Decisions, GC, retention), not work-session appends (tool calls, LLM responses)"

### §6.3 Observation Taxonomy
- Add `fork_resume` to Observation sub-kinds table
- Body schema: `{ parentSessionId, forkPointOffset, resumedAt: TimestampNs, abortedAt: TimestampNs, turnCountAtAbort }`

### §13.1 CLI Verb Table
- Update `crucible fork` row: add `[--new | --resume] [--no-interactive]` flags
- Add `crucible session resume <childSid>` verb row (alternative path for resuming discovered aborted sessions)

### §16.9 Acceptance Signals
- Add 8 new acceptance scenarios: A-Fork-1 through A-Fork-8
  - A-Fork-1: Quick abort-and-retry produces distinct sessions (US-1)
  - A-Fork-2: Crash recovery with explicit resume preserves work (US-2)
  - A-Fork-3: Closed session collision requires --new (US-3)
  - A-Fork-4: >1hr aborted session surfaced in prompt (US-4 prevention)
  - A-Fork-5: Replay follows recorded fork decision (determinism)
  - A-Fork-6: Non-TTY context exits with code 2, requires flag
  - A-Fork-7: `--no-interactive` suppresses prompt, requires explicit flag
  - A-Fork-8: `crucible session resume` direct-resume by session ID

### Options Docs
- Mark `docs/crucible-technical-design/decisions/childsid-collision-options.md` as superseded by ADR-0019
- Mark `docs/crucible-technical-design/decisions/childsid-collision-round2-user-stories.md` as superseded by ADR-0019

---

## Consequences

### Positive
- **All four user stories supported:** US-1 (quick retry), US-2 (crash recovery), US-3 (side-by-side), US-4 (accidental resume prevention)
- **Replay-deterministic:** Decision row recording makes both the user choice and the resulting child session replayable without re-prompting or recomputing timestamp-derived IDs
- **Collision surfacing:** Prevents silent data loss; teaches fork model implicitly
- **Power-user graduation path:** Flags bypass prompt for known-intent workflows

### Negative
- **Adds ceremony:** Default fork path now prompts on collision (one extra keystroke)
- **Prompt implementation complexity:** TTY detection, exit codes, relative time display, flag parsing

### Neutral
- **Orphaned directories accumulate (new-fork path):** Aborted forks leave WAL directories until the user runs `crucible gc`. CLI `crucible session list --status=aborted` surfaces them for manual cleanup; §17.3.1's v1 retention floor blocks new session creation at the hard limit (2 GiB or any session older than 90 days) until explicit manual GC is run. Automatic sweep is deferred to v1.5+.
- **Resume-fork ledger contains both experiments:** Aborted prefix + resumed suffix in same ledger. The `fork_resume` Observation row marks the transition; replay sees full contiguous history.

---

## Acceptance Signals

**Contract-tier signals:**
- Decision row schema validates: `{question, chosenOption: 'new'|'resume', evidence: {rationale, existingChildSid, resultingChildSid, collisionDetected}}`
- `fork_resume` Observation sub-kind validates against §6.3 schema

**Component-tier signals:**
- Collision detection: query `(parentSid, offset)` returns existing child with `status='aborted'`
- Preimage generation: timestamp variant for "new", reuse for "resume"
- TTY detection: `stdin.isTTY === true` enables prompt; `false` exits with code 2

**Acceptance-tier signals (§16.9):**
- A-Fork-1: `crucible fork --at 50` + abort + `crucible fork --at 50 --new` → two distinct `childSid`s
- A-Fork-2: `crucible fork --at 50` + crash + `crucible fork --at 50 --resume` → same `childSid`, `fork_resume` row appended
- A-Fork-3: closed session + `crucible fork --at 10` → error unless `--new`
- A-Fork-4: aborted session created 3 days ago + `crucible fork --at 50` → prompt shows "3 days ago" relative time
- A-Fork-5: replay parent session → Decision row followed → `--new` consumes recorded `resultingChildSid` rather than recomputing timestamp-derived childSid; `--resume` follows the existing child reference
- A-Fork-6: `echo "..." | crucible fork --at 50` (non-TTY) → exit code 2, "Interactive prompt unavailable. Use --new or --resume."
- A-Fork-7: `crucible fork --at 50 --no-interactive` without `--new`/`--resume` → exit code 2
- A-Fork-8: `crucible session resume <childSid>` → resumes aborted session, appends `fork_resume` row

**Invariant signals:**
- §6.4 Fork Lineage Transitivity: resumed sessions maintain `parent_session_id` chain
- §6.9 Monotonic-Timestamps-Within-Session: `fork_resume` row timestamp ≥ previous row timestamp

**Countersignals (what breaks if violated):**
- Wall-clock default heuristic: replay determinism breaks (threshold flip on different machines/times)
- Missing Decision row: replay cannot follow fork path (ambiguous which child to create/resume)
- Missing `fork_resume` row: resume point invisible to ledger readers; replay cannot distinguish resume from fresh fork

---

## Security Implications

**No new attack surface introduced.** Fork collision handling is CLI-local decision logic; no network boundary, no credential handling, no privilege escalation. The Decision row recording follows existing Question/Decision pattern (§8); no new primitive or envelope field.

**Metadata append clarification** ("closed ≠ sealed") does NOT weaken closed-session immutability guarantees. Closed sessions still refuse:
- New tool calls
- New LLM responses
- New generator proposals
- Any work-session append that affects replay outcome

Fork-choice Decision appends are replay-consumed: A-Fork-5 follows the recorded parent-ledger Decision to reconstruct whether the fork branch was created or resumed. GC and retention metadata appends remain replay-ignored because they are L2/projector inputs and do not affect work-session content.

---

## Resolved Questions

1. **Q: Does parent-ledger Decision row violate append-only or closed-session invariants?**  
   **A:** No. Fork collision detection emits a Question, user choice is captured as a Decision row (idiomatic RFC pattern). Closed sessions accept metadata appends, not work-session appends. (Graham review finding.)

2. **Q: Is replay deterministic if the user chooses different options on retry?**  
   **A:** Replay reads the **recorded Decision row** from parent ledger, not live user input. Original run prompts user, records choice and `resultingChildSid`; replay follows recorded choice and, for `--new`, uses the recorded result rather than recomputing `created_at_ns`. (Laura/Graham review finding.)

3. **Q: What if user crashes during the prompt?**  
   **A:** No Decision row written → no child session created. Next fork attempt detects same collision, re-prompts. Idempotent.

4. **Q: What if childSid collision happens across two machines (shared WAL via network mount)?**  
   **A:** Known limitation for v1. Collision detection is WAL-local (checks `~/.crucible/wal/sessions/<childSid>/` existence). Multi-machine collision requires distributed WAL coordination (deferred to v1.5+ distributed Crucible). Mitigation: `--new` flag always works (timestamp variant creates distinct childSid). (Valanice review finding.)

5. **Q: Should turn-count heuristic be added to default selection logic?**  
   **A:** No. Always prompt with neutral presentation (no pre-selected default). Power users learn flags (`--new`/`--resume`) after 2-3 collisions. Turn count + relative time shown in prompt body for visual scan. (Valanice review consideration; Aaron accepted always-prompt without heuristic.)
