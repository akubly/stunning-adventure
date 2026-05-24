# R5 OQ-1 Directive: attention_tier Transition Rules (v1)

**Status:** Resolved by Aaron, R5 round 3.
**Replaces/extends:** Q6 directive (two_columns) — adds operational rules for `attention_tier`.

## Decision

**Choice (b+): Minimal automatic rules with sweep-aged demotion only.** No automatic promotion in v1. Importance-threshold rules deferred to R6.

## v1 Rules

1. **Default at creation:** `warm`.
2. **`pray(fact)` → `hot`.** (Per Q8 directive; FR-11.)
3. **`retire(committed_intent)` → `warm`.** (Demotes from hot when commitment retired.)
4. **Explicit API:** `set_attention_tier(fact_id, tier)` allowed. Takes precedence within the same sweep window.
5. **Sweep-aged demotion (FR-12):**
   - `hot` facts NOT accessed in N sessions AND NOT currently committed → demote to `warm`.
   - `warm` facts NOT accessed in M sessions → demote to `cold`.
   - **Aging only — no automatic promotion in v1.**
6. **No importance-threshold rule in v1.** Deferred to R6.
7. **Hysteresis unit:** `session_count`. Requires at least 1 full session gap between transitions to prevent flapping.

## Precedence

`explicit > pray > sweep-aged > default`

## R6 Mandate

R6 (Crispin/Edgar own attention model) MUST address:
- Tuning N and M (v1 ships placeholder defaults — configurable, not constants).
- Importance-threshold-based transitions (promotion + demotion).
- Reflection-driven transitions (when `meditate`/`contemplate` ship).
- Whether to add a recency-driven rule distinct from access-counting.

## Rationale

- Honors Q6's R6 mandate for the interesting rules while shipping the necessary ones.
- Avoids importance-threshold flapping — the highest-tuning-risk rule.
- Demotion-only-automatic is asymmetric on purpose: deciding-it-matters is deliberate (pray, manual); forgetting is passive (sweep aging).
- Validates the attention column end-to-end in v1 demos (US-1, US-5) without pre-judging R6 decisions.
- Session-count hysteresis is cheap, debuggable, doesn't require time-window tuning.
