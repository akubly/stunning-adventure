# R5 OQ-7 Directive: Trust Auto-Decay

**Status:** Resolved by Aaron, R5 round 3.
**Confirms:** Cassima v2 reversal — trust is event-driven only.
**Closes T2 tension** ("Trust decay coupled to recency?") — resolved to NO COUPLING.

## Decision

**No automatic trust decay in v1.** Trust changes only on explicit events.

Staleness is surfaced as a **separate, queryable signal** — not as a trust modifier.

## v1 Rules

### Trust changes
Trust ∈ [0,1]. Mutated only on:
1. `contemplate` updates (when shipped, v1.5)
2. Verification events (explicit caller assertion that the fact was confirmed)
3. Contradiction findings (explicit caller assertion or `contradicts` edge creation)
4. Explicit caller writes (admin/agent override)

**Time alone does NOT change trust.** Accessing a fact does NOT change trust. (Both per Q4 independent-dynamics directive.)

### Trust history (NFR-4.2 refinement)
Every trust change records:
```
{ fact_id, timestamp, old_value, new_value, source_event_type, source_event_id }
```
Event types: `contemplate`, `verification`, `contradiction`, `explicit_write`. **No `decay` event type exists** — by design.

### Staleness signal (NEW — separate from trust)
Derived metric on every fact: `time_since_last_verification = now - max(verification_event_timestamp)`.
- Computed on read, not stored.
- Callers may filter or downweight by this metric in their own combiner.
- **Does not modify trust.**

### Stale-trust flag (sweep responsibility, FR-12)
Sweep emits a `stale_trust` flag for facts where:
- `time_since_last_verification > N` (R6-tunable), AND
- `trust > threshold` (R6-tunable)

Flag prompts "contemplate this when it next ships." **Does not modify trust.** Mirrors OQ-3 stale-commitment pattern.

## Rationale

1. **Q4's independent-dynamics directive is unambiguous.** Coupling trust to time is the pattern Q4 rejected.
2. **Auto-decay silently turns the system pessimistic.** Audit trails (NFR-4.2) become misleading when "why did trust drop?" answers with "time passed."
3. **The legitimate concern (stale verification) is better served by surfacing the signal than mutating trust.** Callers see the actual signal and decide.
4. **Stale-trust flag mirrors OQ-3 stale-commitment pattern** — consistent system behavior for "this needs attention" signals.
5. **Per-fact volatility (option d) is interesting but premature** — defer to R6 if usage shows we need it.

## FR / NFR Updates Required (Cassima v3)

- **FR-3:** confirm "trust is event-driven only" in body; remove any decay implication.
- **NEW FR-3.x:** define event types that mutate trust (the 4 above).
- **NEW FR-3.y:** define `time_since_last_verification` derived metric.
- **FR-12:** add stale-trust flag to sweep responsibilities.
- **NFR-4.2:** trust history records source_event_type; no `decay` event type.
- **T2 tension status:** RESOLVED — no automatic decay.
