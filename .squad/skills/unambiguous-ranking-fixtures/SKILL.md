# Skill: Designing Unambiguous Fixtures for Ranking Tests

**Category:** Test Design  
**Author:** Laura (Tester)  
**Extracted from:** Eureka M3 RED — composite-ranker ordering test (2026-05-28)  
**Refined by:** Eureka M4 RED — ClockProvider recency fixture (2026-05-29)

---

## Problem

When writing a RED test for a ranking algorithm, naive fixture choices produce near-ties or coincidentally correct orderings — both of which make the test either fragile or meaningless.

A fragile fixture: two facts with composite scores of 0.502 vs 0.499. Floating-point precision or a slightly different formula can flip the order, causing flaky tests.

A coincidental fixture: storage order happens to match desired ranking order. The test passes vacuously even when the ranker isn't implemented — it's not truly RED for the right reason.

---

## Pattern

### Step 1: Neutralize non-deterministic dimensions

Identify which scoring dimensions are time-sensitive or environment-dependent (e.g., recency from `last_accessed`). Use values that floor these dimensions to a constant.

**Example:** For ACT-R recency decay `max(floor, (1+t)^−d)`:
- Set `last_accessed = 0` (Unix epoch). With decay exponent d=0.5, t ≈ 20,440 days → recency = max(0.1, 0.007) = 0.1.
- As long as tests run after ~year 2, recency is always 0.1 for all facts. Safe, deterministic, no time injection needed.

This reduces the effective formula to a function of fewer variables — making fixture arithmetic manageable.

### Step 2: Choose storage order that inverts desired ranking

The M2 (pre-ranking) implementation returns facts in storage order. For the test to be RED for the right reason, storage order must differ from desired ranking order.

**Good pattern:** Put the lowest-scoring fact first in storage, the highest-scoring fact second. The test expects [2nd, 3rd, 4th, 1st]. The M2 impl returns [1st, 2nd, 3rd, 4th]. Clear mismatch.

**Bad pattern:** Storage order [low, medium, high] and expected order [high, medium, low]. The test is obviously RED, but doesn't stress-test partial ordering (the "first becomes last" case is more diagnostic than "first is already second-worst").

### Step 3: Target score margins — aim for ≥ 0.15 between adjacent ranks

With a formula like `0.50·r + 0.20·i + 0.20·t + 0.01` (recency floored), a margin of 0.15 between adjacent ranks requires roughly 0.30 difference in the dominant dimension (relevance).

**Exception — recency-isolated tests (M4+):**  
When recency is the ONLY varying dimension (all other scores identical), the maximum
achievable margin is `0.10 × 0.90 × 1.20 (hot) = 0.108` — below the ≥0.15 threshold.
This is acceptable because there is zero floating-point ambiguity between recency=1.0
and recency=0.1. The ≥0.15 rule guards against near-tie noise in multi-dimensional
fixtures; it does not apply when a single controlled variable produces the delta.
Minimum sufficient margin for recency-isolated tests: ≥ 0.09 (warm tier).

**Worked example (FR-2 formula):**
```
finalScore = (0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency) × multiplier
multipliers: hot=1.20, warm=1.00, cold=0.80
```

| Rank | relevance | importance | trust | tier | finalScore | margin to next |
|------|-----------|------------|-------|------|------------|----------------|
| 1st  | 0.9       | 0.8        | 0.9   | hot  | 0.960      |                |
| 2nd  | 0.7       | 0.6        | 0.7   | warm | 0.620      | 0.340          |
| 3rd  | 0.5       | 0.4        | 0.5   | warm | 0.440      | 0.180          |
| 4th  | 0.2       | 0.2        | 0.3   | cold | 0.168      | 0.272          |

All margins ≥ 0.18. No ambiguity even if the formula has minor weight variations.

### Step 4: Use all scoring dimensions, including tier multipliers

If you test only with warm-tier facts, you miss the multiplier path. Use a mix of hot/warm/cold to cover all branches. The highest-scoring fact should be `hot` (×1.20) and the lowest should be `cold` (×0.80) to maximize score spread.

### Step 5: Verify the test is RED for the right reason

Run the test before implementing the ranker. The failure output must show:
- `Expected: [rank-1-content, rank-2-content, ...]`
- `Received: [storage-order-1-content, storage-order-2-content, ...]`

NOT a type error, import error, or missing field error. If you see those, fix the fixture/test structure first.

---

## Anti-Patterns

| Anti-pattern | Why it fails |
|---|---|
| All same tier | Misses multiplier logic; ranker can skip tier handling and still pass |
| Near-tie scores (< 0.05 margin) | Flaky under floating-point rounding or weight micro-adjustments |
| Storage order = desired order | Test passes vacuously with no-op impl (not truly RED) |
| Time-sensitive recency WITHOUT ClockProvider | Flaky — recency changes each second without a pinned clock. Use ClockProvider seam (§55 §1.2) to inject a fixed `now`. |
| Only 2 facts | Doesn't validate full sort; a swap covers it, not a sort |

---

## Template

```typescript
it('ranks results by [FORMULA] descending', async () => {
  const EPOCH_MS = 0; // last_accessed = epoch → recency = 0.1 (floor) for all

  const factStore = {
    search: vi.fn().mockResolvedValue([
      // Storage order 1st, desired rank LAST
      // finalScore = [compute and document]
      { content: 'Low scorer', relevance: X, importance: X, trust: X, attention_tier: 'cold', last_accessed: EPOCH_MS },
      // Storage order 2nd, desired rank 1st
      // finalScore = [compute and document]
      { content: 'Top scorer', relevance: X, importance: X, trust: X, attention_tier: 'hot', last_accessed: EPOCH_MS },
      // ... more facts
    ]),
  };

  const results = await recall({ query: 'test', sessionId, k: N }, { factStore });

  expect(results.map(r => r.content)).toEqual([
    'Top scorer',     // rank 1: finalScore N.NNN
    // ...
    'Low scorer',     // rank N: finalScore N.NNN
  ]);
});
```

---

## Related Skills

- `london-school-green-beat` — driving GREEN from a RED test
- `scaffold-eureka-package-tdd` — scaffolding the Eureka TDD infrastructure

---

## References

- §55 §1.2: Ranker seam choice (pure functions → real collaborators)
- §55 §2.3 Key Lesson #3: "Real ranker"
- §30 §1.2: FR-2 canonical formula (authoritative source for weights and multipliers)
- §20 §7.4: FactStore mock boundary
