# ADR-0018: Pareto-Incomparable Prescriptions Both Non-Dominated

**Status:** Accepted — 2026-05-28 by Aaron  
**Author:** Rosella (Plugin Dev)  
**Date:** 2026-05-28  
**Supersedes:** Q8 / R2-5 (TDD Strategy Q1–Q8 Resolutions)

---

## Context

The Pareto fitness evaluator (§7, L3 Generators) compares prescriptions across multiple axes: cost, latency, clarity, completeness, concreteness, consistency, containment, reversibility, determinism class, and causal read-set cardinality. Most prescriptions can be ordered — one dominates another. But some are **incomparable**: Prescription A is cheaper and faster, Prescription B is clearer and more complete, and neither axis set is a strict subset of the other.

The Router (§5, L4) must decide what to do with an incomparable pair:

1. **Show both as non-dominated candidates** and let Router policy / user interaction decide.
2. **Apply a tiebreak heuristic** (e.g., prefer cost, or prefer the first in generation order).
3. **Escalate back to L3 Generators** with a refinement prompt to break the tie.
4. **Escalate to user** with all non-dominated candidates and ask them to pick.

Options 2, 3, and 4 each require an **explicit policy choice in v1**. Option 1 is a **data-transparency choice**: emit the full non-dominated surface and let the Router's policy table decide downstream action.

---

## Options Considered

### Option A: Show Both; Let Router Policy Decide (Accepted)

When two prescriptions are Pareto-incomparable, both remain on the non-dominated frontier. The `PrescriptionResult` schema carries:
- `nonDominatedReason: 'optimal' | 'incomparable'` — signals whether this prescription is uniquely best or tied with incomparable peers
- `incomparableWith?: string[]` — optional list of prescription IDs that are incomparable to this one

The Router's policy table (keyed by `(primitive_kind, source_tier, predicate, action)`) then decides:
- Apply a secondary sort (e.g., by cost) and pick one
- Prompt the user to decide
- Surface all candidates and let the caller (Curator, CLI, Aperture) handle the selection
- Escalate to a human operator (trust-tier dependent)

**Advantages:**
- **Transparency:** No information is hidden; the evaluator reports what it computed, the Router decides policy.
- **Policy flexibility:** Different trust tiers, primitive kinds, and user preferences can have different tiebreak rules without regenerating prescriptions.
- **Composability:** Debugger (§9), CLI (§13), and Aperture (§9) all see the same data and can implement different UX responses.
- **Reversibility:** If a tiebreak heuristic fails in production, swapping policy is one line; regenerating all prescriptions is not.

**Disadvantages:**
- **User visible:** The incomparable-axes badge ([incomparable-axes]) appears in the UI, signaling a decision point that may confuse users who expect "best" to mean strictly optimal.
- **Set size:** In rare cases, multiple axes collide and the non-dominated frontier grows (upper bound: ~O(n^k) in the worst case for k axes; in practice, v1 prescriptions cluster on 2–4 axes per kind).
- **v1 cost:** The Router's policy table must handle ≥2 candidates per primitive kind in some cases (budget: handle ≤2 non-dominated candidates; if >2 appear, escalate/error).

### Option B: Apply Tiebreak Heuristic in the Evaluator

The `ParetoFitnessEvaluator` picks one prescription when incomparable and discards others. The heuristic could be:
- Prefer the first in generation order (stable, reproducible)
- Prefer the cheapest
- Prefer the most "deterministic" (highest `determinismClass`)
- Random selection (not acceptable)

**Advantages:**
- **Simplicity:** Evaluator emits a single top prescription; Router always sees `nonDominatedReason: 'optimal'` (no incomparable case).
- **UX clarity:** Users always see "the best" prescription; no ambiguity.

**Disadvantages:**
- **Silent loss:** The runner-up prescription is discarded, not recorded. If the heuristic is later wrong (cost changed, determinism improved, etc.), replay and re-evaluation don't recover the lost option.
- **Policy embedding:** The tiebreak rule is baked into the evaluator code, not configurable by Router policy; changing the rule requires code + redeploy + retraining.
- **Trust-tier blindness:** All prescriptions follow the same heuristic regardless of trust tier (builtin vs. community) — but builtin might reasonably prefer cost while community prefers determinism.
- **Reversibility:** If the heuristic proves wrong, the only recourse is to regenerate all prescriptions with the new heuristic.

### Option C: Escalate Back to L3 Generators (Refinement Gate)

When incomparable, the evaluator returns a signal, the Router invokes a refinement ceremony: L3 Generators are re-instantiated with a `context.incomparableWith: string[]` field and a prompt to "choose between these and break the tie."

**Advantages:**
- **Generative power:** Generators see the incomparable pair and can apply domain knowledge to decide.
- **Creativity:** A new prescription might emerge that dominates both incomparable ones.
- **Trust-tier aware:** Each trust tier (builtin generators vs. community generators) gets a chance to refine.

**Disadvantages:**
- **Cost and latency:** Regeneration is expensive and slow; every incomparable case triggers a full L3 re-run.
- **Determinism complexity:** Replay must record the refinement prompt and any new prescriptions it generates; the causal chain grows non-linearly.
- **Non-termination risk:** Generators might produce incomparable pairs again; a recursion depth limit or max-iterations becomes necessary.
- **Cognitive load:** Users see "deciding..." screens and may confuse refinement with an error or hang.
- **v1 scope risk:** Refinement gates were deferred to v2; baking one into the fitness path requires substantial Router + L3 orchestration work.

### Option D: Escalate to User / Policy (Always)

Every incomparable case is escalated to the user or operator via Aperture / CLI with all candidates listed. User clicks/picks one or delegates to policy.

**Advantages:**
- **Maximum transparency:** Users see all options and make the call.
- **Unbounded:** No limit on frontier size; can surface 10 non-dominated candidates if they exist.

**Disadvantages:**
- **UX burden:** Users must make decisions they may not be qualified to make (e.g., "is clarity or cost more important?").
- **Latency:** Synchronous user interaction required; incomparable cases block progress.
- **Not v1 scope:** v1 assumes most decisions are automatic (policy-driven); user escalation is a v2 enhancement.
- **Determinism recording:** Capturing "user picked prescription #2" adds a new Observation sub-kind and complicates replay.

---

## Decision

**Accept Option A: Show Both; Let Router Policy Decide.**

When two prescriptions are Pareto-incomparable:
1. Both remain on the non-dominated frontier in `prescriptionCandidates[]`.
2. Both carry `nonDominatedReason: 'incomparable'`.
3. Each optionally includes `incomparableWith: [<id of the other>]`.
4. The Router's policy table decides downstream action (tiebreak, escalate, etc.) **without regenerating prescriptions**.

This is **data transparency**, not data suppression. The evaluator reports ground truth; the Router applies policy.

---

## Rationale

### Why Both Options Surface (Not Heuristic / Refinement / Escalation)

The fitness evaluator is **pure data**. Its job is to compute Pareto dominance relations and emit the frontier, not to judge which frontier point is "best." Embedding a tiebreak heuristic (Option B) couples the evaluator to policy, violating the separation of concerns that allows §5 (Router) to remain a configurable policy engine.

Option C (refinement gate) is deferred to v2; v1 prioritizes deterministic, replayable, side-effect-free prescriptions. Regenerating prescriptions on-demand in the refinement path would require recording the `incomparableWith` context into the ledger and replaying it — a feature-creep surface.

Option D (user escalation) is desirable long-term but requires synchronous user-interaction infrastructure that v1 does not yet support. Aperture is async-notification focused (§9); blocking on user input is a v2+ concern.

**Option A enables all three downstream paths** (heuristic, refinement, user-escalation) via the Router's policy table — in v2, without changing the evaluator or the ledger schema.

### v1 User Cost: Set Size Bound

The non-dominated frontier grows when multiple axes collide. For **v1 acceptance criteria**, the bounded guarantee is:

- **≤2 non-dominated candidates** per prescription-generation call (typical case: one optimal, or one optimal + one incomparable pair)
- **Scaling:** The frontier size is `O(k)` where `k` is the number of axes (v1: 10 axes → loose bound of ~10 frontier points in adversarial case; real-world typical: 2–4)
- **Router policy budget:** `prescriptionCandidates[]` array ≤ 10 entries per Router decision
- **Overflow:** If frontier size > 10, the evaluator logs a warning and the Router escalates to operator (not v1 on-path, but logged)

The user sees a `[incomparable-axes]` badge in Aperture (§9) when `nonDominatedReason === 'incomparable'`. Clicking the badge expands the multi-objective breakdown. The typical user experience: one prescription is shown as "best" (optimal), and the badge is rarely encountered unless dealing with structural proposals (where trade-offs are inherent).

**Cost:** A few incomparable cases per week of dogfood will surface; operator can observe them in the leaderboard and decide if Router policy needs tuning.

### v2+ Refinement Gate: When Incomparables Trigger Re-Evaluation

If dogfood or production observation shows that:
1. **Incomparable cases are frequent** (> 10% of decisions with multiple candidates)
2. **Heuristic tiebreaks are wrong** (we guessed cost-first, but users prefer clarity)
3. **Generator insight adds value** (regenerating with `incomparableWith` context yields a dominating prescription > 20% of the time)

Then v2 can implement an optional refinement gate as Router policy:

```ts
// v2 policy option (pseudo)
if (prescriptionCandidates.some(p => p.nonDominatedReason === 'incomparable')) {
  if (router.policy.refinementMode === 'enabled') {
    const refined = await refineGenerators(incomparableSet, context);
    prescriptionCandidates = refined;  // replace or append
  }
}
```

The decision to enable refinement would be a policy-table row, not a code change to the evaluator. **Triggers for v2 evaluation:**
- Incomparable-case frequency > 10% in production telemetry
- User feedback that the incomparable badge confuses or frustrates (Aperture §9 instrumentation needed)
- Generator A/B test showing refined prescriptions dominate > 20% of incomparable cases

---

## What Changes

### Schema

- `PrescriptionResult.nonDominatedReason: 'optimal' | 'incomparable'` (required, §7)
- `PrescriptionResult.incomparableWith?: string[]` (optional, §7)
- `PrescriptionResult.fitness: QualityVector` (unchanged, remains the full multi-objective breakdown)

### Ledger

- No new row fields; Decision rows carry the full `prescriptionCandidates[]` in the router-verdict Observation (§8)
- Replay and bisect (§11, §16) see both candidates on the frontier; determinism is preserved

### Router Policy Table (§5)

- New example rows for incomparable handling (v1 default: pick first in list or defer to user UI preference):
  ```
  (primitive_kind: 'data', source_tier: 'builtin', predicate: 'fitness_incomparable', action: 'tiebreak_cost')
  (primitive_kind: 'structural', source_tier: '*', predicate: 'fitness_incomparable', action: 'escalate')
  ```

### Aperture (§9)

- `[incomparable-axes]` badge on prescriptions with `nonDominatedReason === 'incomparable'`
- Badge detail shows `incomparableWith[]` IDs and the fitness-axis breakdown
- Leaderboard filters can isolate incomparable cases for analysis

### CLI (§13)

- JSON output includes `nonDominatedReason` and `incomparableWith` fields
- `--verbose` flag expands the fitness breakdown across all axes

---

## Consequences

### Positive

- **Composability:** All downstream consumers (Router, Aperture, CLI, debugger) see the same truth; each can implement different UX.
- **Reversibility:** Changing the tiebreak rule is a policy-table edit, not a code deploy.
- **Replayability:** The full frontier is recorded on the ledger; replay and bisect show all candidates, enabling post-hoc analysis.
- **Trust-tier flexibility:** Router policy can route incomparable structural proposals (trust-tier: community) to escalation, while builtin proposals use cost heuristic.

### Negative

- **UX surface:** Users who expect "best" to be unique may see the incomparable badge and be confused.
- **Set size:** The `prescriptionCandidates[]` array may contain 2–10 items per decision; Router policy must handle plural candidates (v1 scope: handle ≤10; v2: dynamic refinement to single best).

### Mitigation

- **Documentation:** Aperture help text clearly states the meaning of the incomparable badge.
- **Dogfood observation:** Incomparable-case frequency is tracked; if > 10%, operator reviews Router policy and may enable refinement (v2+).
- **Instrumentation:** Aperture records which candidates users/policies select when multiple are shown; this data drives v2 refinement gate evaluation.

---

## Resolved Questions

**Q8 (TDD Strategy):** "When prescriptions are Pareto-incomparable, what does the Router see?"
- **Answer:** Both candidates, tagged with `nonDominatedReason: 'incomparable'`. Router policy decides whether to pick one, escalate, or refine.

**R2-5 (Phase 2 Lock):** "How does the UI distinguish optimal from incomparable?"
- **Answer:** `nonDominatedReason` field in data + `[incomparable-axes]` badge in Aperture leaderboard.

**Will incomparable prescriptions block users in v1?**
- **Answer:** No. The Router's default policy picks one (cost-first) or defers to user UI preference (Aperture). Blocking escalation is not v1 default; it's a policy option for high-trust scenarios (v2+).
