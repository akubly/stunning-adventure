# R5 OQ-4 Directive: decide Fact-Kind Structured Schema

**Status:** Resolved by Aaron, R5 round 3.
**Confirms/refines:** Q8b directive (decide as distinct verb).

## Schema (v1)

```typescript
type DecisionPayload = {
  question: string;
  options: Array<{
    id: string;
    label: string;
    rationale?: string;       // case FOR considering this option (neutral, all options)
    rejected_for?: string;    // case AGAINST this option (outcome-coupled, only losers)
  }>;
  chosen: string;             // option id; MUST match an id in options[]
  rationale: string;          // top-level: why the chosen option won overall
  principal_id: string;       // renamed from "decider" for FR-3 alignment
  confidence?: number;        // 0..1, optional, decision-time certainty
  supersedes_decision_id?: fact_id;  // sets supersedes edge; system emits
  revisit_at?: timestamp;     // optional soft expiry; sweep surfaces past-due
  timestamp: iso8601;
};
```

## Field semantics

- **`rationale` (top-level):** the overall "why chosen." Required.
- **`rationale` (per-option):** why this option was on the table. Optional, applies to all options including chosen.
- **`rejected_for` (per-option):** why this option lost. Optional, meaningful only on non-chosen options.
- **`rationale` and `rejected_for` are orthogonal.** A full ADR-style decision uses both per-option fields.
- **`principal_id`:** consistent vocabulary across FR-3 trust and FR-10 decide. Renamed from "decider."
- **`confidence?`:** 0..1 at decision time. Feeds future trust dynamics and contemplate updates.
- **`supersedes_decision_id?`:** when set, system auto-emits a `supersedes` edge new→old. Single API surface.
- **`revisit_at?`:** sweep (FR-12) surfaces decisions past `revisit_at` for re-evaluation.

## Validation

- **`chosen` MUST match an `id` in `options[]`.** Enforced at integrate time.
- Garbage decisions (chosen value not in options) are rejected.

## Rationale

1. **Structured options-with-rationale is the highest-ROI addition** — alternatives-considered is the most valuable historical query a flat list can't answer.
2. **rationale + rejected_for orthogonality** mirrors how ADRs work: pros (why-considered) and cons (why-rejected) are separate concerns. Both optional preserves low-effort callers.
3. **Payload-field supersession** trades elegance for ergonomics. decide() is hand-written often; forgetting an edge for one of the most important relationships is the kind of mistake worth designing out.
4. **principal_id unification** across FR-3 and FR-10 — pick one vocabulary, use it everywhere.
5. **confidence and revisit_at are cheap optionality** — schema cost near-zero, unlock contemplate confidence updates and sweep-driven re-evaluation prompts.
6. **chosen-must-match validation** prevents a whole class of garbage decisions at near-zero cost.

## FR-10 Update Required (Cassima v3)

Replace the current decide() signature line with the full schema above. Add validation rule.
