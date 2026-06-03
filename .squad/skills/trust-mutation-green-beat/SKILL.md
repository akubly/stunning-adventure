# Skill: trust-mutation-green-beat

**Author:** Edgar (Learning Systems Specialist)
**Created:** 2026-05-30
**Status:** ACTIVE
**Sibling:** `trust-mutation-red-beat/SKILL.md` (Laura's RED pattern)
**Context:** Eureka v1 — but pattern is reusable for any event-driven scalar-property mutation seam

---

## Purpose

How to implement the GREEN beat for a trust (or any scalar-property) mutation activity, given a RED beat from Laura. The implementation targets are:

1. Export the write-seam collaborator interface
2. Export the mutation activity function
3. Implement delta computation with correct clamping
4. Wire the collaborator call

---

## Pattern

### 1. Read Laura's RED decision drop before writing a line

Confirm:
- The exact function name to export
- The interface shape for the write-seam collaborator
- The delta computation rules (verbatim formulas)
- Any deferred ambiguities you must decide before or during GREEN

### 2. Export the write-seam interface

```typescript
/**
 * <PropertyName>-write seam — injected, never instantiated here (§55 §2.1 London form).
 *
 * Receives the fully-computed new value (already clamped to domain bounds).
 * The activity owns delta computation; the updater owns persistence.
 * Contract test for real implementation deferred to Crispin (next beat backlog).
 */
export interface PropertyUpdater {
  update(args: {
    entityId:  string;
    sessionId: SessionId;
    /** New value, already clamped to [0.0, 1.0]. */
    value:     number;
  }): Promise<void>;
}
```

**Key:** The interface receives the **computed** new value, not the raw delta. The activity owns the delta math. The seam owns persistence. This separation keeps the updater stateless and testable independently.

### 3a. Orchestrator-over-modifier: two-function delegation

When a new beat adds a read-seam (reading current value before applying mutation), prefer a **new higher-level orchestrator function** over extending the existing mutation function with an optional read-dep.

```typescript
// LOW-LEVEL: pure delta math + write — NO read seam, NO clock (activity does not read time)
export async function applyMutation(options: { ...; currentValue: number }, deps: { updater }): Promise<void> { ... }

// HIGH-LEVEL: reads currentValue, then delegates to applyMutation
export async function applyMutationById(options: { entityId; sessionId; event; optionalDelta? }, deps: { reader; updater }): Promise<void> {
  const data = await deps.reader.read({ entityId, sessionId });
  if (data === null) throw new Error(`applyMutationById: entity not found — entityId=${entityId}`);
  await applyMutation({ entityId, sessionId, event, currentValue: data.value, optionalDelta }, { updater: deps.updater });
}
```

**Rules:**
- The low-level function stays independently unit-testable with no read-seam.
- The high-level function composes both seams; it delegates entirely (no delta duplication).
- `clock` is required **only when the activity reads time** (recency-dependent activities like `recall()`, `recallWithScores()`). Activities that don't read time omit `clock` entirely — phantom deps mislead callers (§30 §2.3, §55 §1.2).
- The reader returns an object (`{ value } | null`), not bare `value | null` — future fields cost nothing now.

### Export the read-seam interface

```typescript
/**
 * Read-seam for <entity> lookup — injected, never instantiated here (§55 §2.1 London form).
 * Returns `{ value }` or `null` if not found.
 * Object shape (not bare scalar) allows future field additions without breaking callers.
 */
export interface EntityReader {
  read(args: { entityId: string; sessionId: SessionId }): Promise<{ value: number } | null>;
}
```

```typescript
export async function applyMutation(
  options: {
    entityId:     string;
    sessionId:    SessionId;
    event:        EventUnion;
    currentValue: number;
    optionalDelta?: number;  // include when any event type needs caller-supplied magnitude
  },
  deps: {
    updater: PropertyUpdater;
    // clock is NOT included — this activity does not read time (§30 §2.3, §55 §1.2)
    // Add clock only if/when the activity becomes recency-dependent
  },
): Promise<void> {
  let newValue: number;

  if (event === 'positive_event') {
    newValue = Math.min(MAX, currentValue + DELTA);
  } else if (event === 'negative_event') {
    newValue = Math.max(MIN, currentValue - DELTA);
  } else {
    // user-provided delta: clamp both ends
    newValue = Math.min(MAX, Math.max(MIN, currentValue + (optionalDelta ?? 0)));
  }

  await deps.updater.update({ entityId, sessionId, value: newValue });
}
```

### 4. Confirm vs. push back on any deferred ambiguities

For each deferred ambiguity in Laura's decision drop, document your decision:

- **Option confirmed:** State which option and why.
- **Option pushed back:** State why and what you'd prefer instead; this becomes a design discussion with the team before GREEN proceeds.

Write your decisions in the GREEN decision drop (`decision inbox drop edgar-<beat>-green.md`), not inline in source.

### 5. clock dep: required ONLY when the activity reads time

Include `clock` in `deps` **if and only if** the activity reads the current time (recency-dependent activities like `recall()`, `recallWithScores()`). When the activity does not read time (`applyFeedback`, `applyFeedbackById`), omit `clock` entirely.

- **If the activity reads time:** `clock` is required, no optional default (§55 §1.2 discipline).
- **If it doesn't read time:** omit `clock` — required-but-unused deps mislead callers and violate the phantom-dep anti-pattern (cycle 1 finding; §30 §2.3).

### 6. Verify command

```
npm test --workspace=@akubly/eureka
```

Expected: all N new RED tests GREEN + all prior tests still GREEN. Then:

```
npm run build --workspace=@akubly/eureka
```

Expected: `tsc` exit 0, no type errors.

---

## Naming Next RED Target

After GREEN, always name the next RED target. Laura owns writing it; Edgar only names it.

For trust-mutation beats, the common next targets are:

| Target | When to name it |
|---|---|
| Deferred event type (e.g., `user_correction`) | When the deferred event was not tested in the current beat |
| Read-seam (where does `currentValue` come from?) | When the caller-provided current-value design needs a production path |
| Contract test for real `Updater` implementation | Always — Crispin needs it when the real impl ships |

---

## Spec Gap Disposition

If the spec section cited in the RED beat does not exist in the spec doc:

1. Check whether the contract is **fully derivable from decisions.md** (Named Target entry, delta rules, domain bounds)
2. If yes: **Edgar writes the spec section directly.** Don't escalate to Cassima for doc-only sections that are already decided.
3. Cite the decisions.md entry as the derivation source in the new section.
4. Measure outcomes are the test fixtures (document them in the spec as evidence).

---

## Post-Work Artifacts

1. **`history.md`** — append under `## Learnings`: implementation choices, interface decisions, deviations from Laura's proposed shape
2. **Decision drop** — `decision inbox drop edgar-<beat>-green.md`: what landed, test counts, named next RED target, spec-gap disposition
3. **Skills** — update RED-beat skill's "Applied In" section if a reusable pattern emerged; add GREEN-beat sibling (this file) if not already present

---

## Checklist

- [ ] Read Laura's RED decision drop fully before starting
- [ ] Export write-seam interface (receives computed new value, not raw delta)
- [ ] Export mutation activity with correct function signature
- [ ] Delta math: positive event = `Math.min(MAX, current + delta)`, negative = `Math.max(MIN, current - delta)`
- [ ] `user_correction` / caller-delta: clamp BOTH ends — `Math.min(MAX, Math.max(MIN, current + callerDelta))`
- [ ] If the activity reads time, require `clock: ClockProvider` in deps (no default). If it doesn't, omit `clock` entirely — phantom deps are an anti-pattern.
- [ ] Deferred ambiguities confirmed or pushed back in GREEN decision drop
- [ ] Spec gap: write missing section if derivable; escalate only if non-trivial design decision needed
- [ ] `npm test --workspace=@akubly/eureka`: all new tests GREEN + all prior tests GREEN
- [ ] `npm run build --workspace=@akubly/eureka`: tsc clean
- [ ] `history.md` updated
- [ ] Decision drop written
- [ ] Next RED target named

---

## Applied In

- M6 GREEN: `packages/eureka/src/activities/recall.ts` (2026-05-30)
  - `FactReader` interface + `applyFeedbackById` orchestrator (read-seam composition)
  - `correctionDelta === undefined` guard throws (M6-A5)
  - Delegation pattern: `applyFeedbackById` → `applyFeedback` (orchestrator-over-modifier)
  - Named next RED: M7-A (null-fact error contract), M7-B (typed error narrowing), M7-C (FactReader real impl contract), M7-D (applyFeedbackById user_correction path)
  - `TrustUpdater` interface + `applyFeedback` activity
  - corroboration (+0.10), contradiction (−0.10), user_correction (caller-delta ± clamp)
  - §30 §2.3 spec gap closed by Edgar (spec section written, no Cassima escalation needed)
  - Named next RED: M6-A (user_correction tests), M6-B (read-seam for currentTrust)
