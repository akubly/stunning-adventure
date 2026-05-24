# R5 OQ-3 Directive: pray Follow-Through Mechanics

**Status:** Resolved by Aaron, R5 round 3.

## Decisions

### (a) Re-surfacing strategy
- **v1:** Pull-with-boost only. Committed facts surface when queries match; attention-tier boost helps them rank.
- **v1.5:** Add `list_active_commitments(scope) → committed_facts[]`. **Caller-initiated**, not system-initiated. No daemon, no scheduled push.
- **No system-initiated push ever in current roadmap.** The system makes attending cheap; agents decide when to attend.

### (b) Retirement criteria
- **Explicit `retire(committed_intent_id, outcome)` is the only path to clearing `committed=true`.**
- Opportunistic sweep (FR-12) adds a **stale-flag** (visible via API) for commitments untouched for N sessions.
- **No unilateral auto-retire, ever.** Stale-flag prompts agent/user action; system never retires on its own.
- Stale-flag threshold (N) is R6-tunable.

### (c) Prioritization gating
- **v1:** No gating beyond standard attention-tier boost.
- **v2:** Soft floor, **opt-in per-call** via `commit_floor?: number` (min-rank position) on `recall`. Default: no floor.
- **No hard top-K guarantee.** Pray must not be a foot-gun that pollutes results when commitments don't apply.

## Rationale

1. **v1 honors "minimal" literally.** FR-11.2 stays passive flag-based. No scope inflation before usage data.
2. **No silent auto-retire** preserves pray's "commitment-until-decided-otherwise" semantics. Aaron's pray definition emphasizes deliberate retirement.
3. **Caller-initiated push** is the right power dynamic: system makes "check commitments" efficient; agent decides when to attend.
4. **Soft-floor-opt-in** preserves caller control. Hard guarantees turn pray into nagware.

## FR-11 Updates Required (Cassima v3)

- FR-11.2 unchanged.
- FR-11.3 unchanged.
- FR-11.4 split:
  - **v1.5:** `list_active_commitments(scope)` API. Caller-initiated.
  - **v2:** `commit_floor?: number` recall parameter. Default no floor.
- **NEW FR-11.5:** Sweep emits stale-flag (not retirement) for commitments untouched for N sessions. R6 tunes N.
