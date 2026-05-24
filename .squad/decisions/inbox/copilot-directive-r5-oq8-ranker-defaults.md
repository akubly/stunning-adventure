# R5 OQ-8 Directive: Composite Ranker Defaults

**Status:** Resolved by Aaron, R5 round 3.
**Closes T3 tension** (composite ranking formula).

## Default ranker formula (v1)

```
raw_score = w_r·relevance + w_i·importance + w_t·trust + w_a·recency
final_score = raw_score × attention_multiplier(fact.attention_tier)
candidates = { f : f.trust >= trust_floor }
```

### Default weights
- `w_r` (relevance) = **0.50**
- `w_i` (importance) = **0.20**
- `w_t` (trust) = **0.20**
- `w_a` (recency) = **0.10**

Sum = 1.00. Strong-relevance + anti-recency-bias profile.

### Trust floor
- Default: **0.15**. Facts with trust < 0.15 are excluded from results.
- **Configurable per-call** via `trust_floor?: number` parameter.
- Set `trust_floor: 0` to disable.

### Attention-tier multiplier
- `hot` × **1.20**
- `warm` × **1.00**
- `cold` × **0.80**

Applied after the weighted sum. Closes the pray() → ranking operationalization gap (Q8 directive said pray boosts attention_tier; this is how that boost actually affects recall ranking).

## Caller overrides

Per-call, callers may override:
- Weight vector via `weights?: {relevance, importance, trust, recency}` (must sum to 1.0)
- Trust floor via `trust_floor?: number`
- Disable attention multiplier via `apply_attention_multiplier?: boolean`

## Rationale

1. **Relevance dominates** (0.50) — retrieval system's primary job is to answer the query. Cassima's (0.40) let importance+trust+recency (0.60) outweigh relevance combined; that's wrong default.
2. **Recency at 0.10** — Aaron's brain-dump named "forgetting older but more important facts" as a failure mode. Anti-recency-bias is correct default.
3. **Trust floor (gate), not just downweight** — a 0.10-trust fact at high relevance can still win on a continuous downweight; a floor honestly says "we don't trust this, don't surface it."
4. **Attention multiplier closes pray ranking gap** — without this, pray() only affects retrieval via opt-in committed_only filter, which doesn't help agents who didn't think to apply it.
5. **Multiplier values (1.20 / 0.80) are conservative** — small enough that no signal runs away with the result, big enough to matter.

## FR / Tension Updates Required (Cassima v3)

- **FR-2 / NEW FR-2.x:** specify default ranker formula and weights.
- **NEW FR-2.y:** define trust_floor and per-call override interface.
- **NEW FR-2.z:** define attention multiplier and per-call override.
- **T3 tension status:** RESOLVED — formula and defaults locked.

## R6 follow-up

R6 may revise weights based on demo data. Defaults are starting points, not enshrined.
