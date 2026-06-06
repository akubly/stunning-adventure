# SKILL: Driving a London-School Outside-In Cascade Beat from RED to GREEN

**Author:** Edgar (Learning Systems Specialist)
**Derived from:** M2 — recall() red-to-green (2026-05-28)
**Confidence:** MEDIUM — applied cleanly across M2, M3, and M4 without deviation
**Applicable to:** Any outside-in TDD beat in the Eureka (or similar) cascade

---

## When to Use

Use this skill when you are the next agent in a London-school outside-in TDD cascade and
must drive an existing RED test to GREEN without over-implementing. The seed test has already
been written (by the Tester); your job is the **minimal production implementation** that
satisfies exactly the test's assertions — no more.

---

## Discipline Rules (Non-Negotiable)

1. **Read the test first.** The test is the contract. It dictates: function signature, collaborator
   injection shape, return shape, and what assertions are made. Do not proceed until you
   understand every `expect()` call.

2. **Never change the test to make GREEN convenient.** If the test has a real ambiguity that
   makes GREEN impossible, STOP and flag it. Do not edit the test.

3. **Implement only what the test exercises.** No speculative branches, no premature property
   dynamics, no extra parameters. If the test asserts on presence but not order, DO NOT
   implement ordering logic.

4. **Collaborators are INJECTED — never instantiated.** If the test passes a mock via `deps`,
   your production code must accept it via `deps`. Never `import` a concrete store, never `new`
   one up inside the activity function.

5. **Match the locked types.** Use `SessionId` from `@akubly/types`. Match return shapes to
   what the test's `results.filter(...)` calls expect.

---

## Step-by-Step

### 1. Read the test fully before touching any source

Check:
- Import path: `from '../recall.js'` → file must be at `src/activities/recall.ts`
- Function signature: `recall(options, deps)` — what's in each object?
- Mock shape: what fields does the mock return? Those are your return type's minimum fields.
- Assertions: what does the test actually CHECK? That is ALL you must satisfy.

### 2. Identify what the test asserts (and what it does NOT assert)

Common patterns:
- Asserts on **presence** (keyword overlap, trust floor) — do NOT implement ranking
- Asserts on **count** (≥4/5) — do NOT implement pagination beyond `slice(0, k)`
- Does NOT call `expect(mock).toHaveBeenCalledWith(...)` — exact call args are informal until a contract test

### 3. Write the minimal implementation

```typescript
// Inject the seam — never import the concrete implementation
export interface FactStore {
  search(args: { query: string; sessionId: SessionId; limit: number }): Promise<RecallResult[]>;
}

export async function recall(options: RecallOptions, deps: RecallDeps): Promise<RecallResult[]> {
  const candidates = await deps.factStore.search({
    query: options.query,
    sessionId: options.sessionId,
    limit: options.k,
  });

  // Apply only what the test exercises (here: trust floor)
  return candidates
    .filter(f => f.trust >= TRUST_FLOOR)
    .slice(0, options.k);
}
```

### 4. Export from the barrel

```typescript
// packages/eureka/src/index.ts
export { recall } from './activities/recall.js';
export type { RecallOptions, RecallDeps, RecallResult, FactStore } from './activities/recall.js';
```

### 5. Run the targeted test — MUST be GREEN

```powershell
npm test --workspace=@akubly/eureka
```

Expected: 1/1 tests passed, exit code 0.

### 6. Run the baseline — MUST stay GREEN

```powershell
npm run build  # tsc --build, exit code 0
npm test       # all workspaces, same counts as before
```

Baseline counts for this repo (as of M2):
- Cairn: 26 test files, 609 tests
- Forge: 24 test files, 644 passed | 3 todo
- Eureka: adds N new tests per beat
- `tsc --build` clean exit

### 7. Name the M+1 next-red-beat

After going GREEN, identify the SINGLE next red test the cascade demands:
- What assertion does the current test NOT make that the spec (§30, §10) demands?
- Which collaborator would a red test for that assertion need to mock?
- Which §-reference governs it?

Write this named beat into the decision drop (step 8).

### 8. Write post-work artifacts

1. Append to `.squad/agents/<you>/history.md` under `## Learnings`
2. Write `.squad/decisions/inbox/<you>-m{N}-<activity>-green.md` — decision drop with:
   - GREEN landing verbatim output
   - Implementation shape (types + algorithm summary)
   - §55 interpretation calls
   - Named M+1 next-red-beat
   - Any tensions with spec docs (§20/§30) to escalate (not paper over)

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Implementing the ranker before a ranking assertion | Test passes but you over-built | Check: does any `expect()` test ordering? If no, defer ranker. |
| Importing the concrete FactStore | TypeScript compiles but violates London form | Check `deps` injection shape in test; never `new` a collaborator |
| Changing the return type | Test filter on `m.content` fails | Return type must include all fields the test reads |
| Missing `.js` extension in import | `tsc --build` or vitest resolution fails | ESM Node16: always use `.js` in import paths from `.ts` source |
| Trust floor omitted | Test may pass accidentally but spec violated | Apply `TRUST_FLOOR = 0.15` per §30 §2.3 even if all mock data is above it |
| Making new typed fields required | M2 mocks break because they lack M3 fields | Use `field?: type` (optional) for fields added in later beats; guard with `?? default` in impl |
| Arithmetic not matching tester's fixture | Test fails for wrong expected value | Read tester's inline comments — they show exact arithmetic. Work backwards from the comment to understand what units/formula the tester assumed, then match it exactly. |

---

## Cascade Anchor Protocol

Each GREEN beat produces a named M+1 anchor. The anchor consists of:
- **Activity:** which activity is being extended
- **Collaborator:** which seam/mock the new test will drive into existence
- **Assertion type:** what the new test will assert (order? side effect? error path?)
- **§-reference:** the spec section governing the new behavior

The anchor is recorded in the decision drop and becomes the Tester's (Laura's) next input for writing the M+1 red test.

---

## M3 Refinements: Honoring Tester-Pinned Arithmetic

When a RED test fixture contains **inline arithmetic comments** (e.g., `// rawScore = 0.50×0.9 + ... = 0.80`), the tester has locked the formula AND the numbers. The green implementer's job is to reproduce that arithmetic exactly.

### Pattern: Optional-field safety for beat-N additions to locked return types

When adding new typed fields to a return type that was locked by a previous beat:
1. Make them **optional** (`field?: type`) — locks don't extend to new fields
2. Provide safe defaults in the scorer (`field ?? defaultValue`)  
3. Choose defaults that preserve the locked beat's behavior (M2 facts without `relevance` should still be returned; default 0 keeps them in results, just at lower score)

### Pattern: Unit lock from fixture naming

If the tester names a constant `EPOCH_MS`, the field is **milliseconds**. Derive `tDays` as:
```typescript
const tDays = (nowMs - fact.last_accessed) / 86_400_000;
```
Never divide by 86_400 (seconds) when the fixture signals milliseconds.

### Pattern: Static floor as ordering elimination

When a fixture pins `last_accessed = 0` (ancient past), recency hits the floor for ALL facts.
This is deliberate: it removes recency as a ranking variable, making ordering depend only on
relevance/importance/trust/tier. The tester is isolating the scoring dimensions.
Recognise this pattern; don't try to "fix" the recency computation to produce variance.

---

## M4 Refinements: Seam-Introduction Pattern

When a beat's sole purpose is introducing a non-deterministic dependency seam (clock, RNG, network):

### Pattern: Seam already scaffolded by Tester — GREEN is one-line

The Tester (RED beat) will often add the interface AND update the test call sites. The
production code still uses the old direct call (`Date.now()`). GREEN's job is ONLY to
wire the injected dep into the callsite:

```diff
-  const { factStore } = deps;
+  const { factStore, clock } = deps;
   ...
-  const nowMs = Date.now();
+  const nowMs = clock.now();
```

If `compositeScore` already accepts `nowMs` as a parameter, no further change is needed.
This is the correct minimal form — resist the urge to add a `SystemClock` export or any
production-convenience wrapper not required by the test.

### Pattern: Required dep with no default

When §55 §1.2 prohibits defaults for non-deterministic inputs:
- Do NOT add `clock = { now: () => Date.now() }` as a default parameter
- Do NOT export a `systemClock` constant "for convenience"
- TypeScript's required-field enforcement IS the safety net

The compile error when a call site omits `clock` is the desired outcome — it forces the
caller to be explicit about their time source.

### Pattern: Barrel re-export of new seam type

When the Tester introduces a new interface (e.g., `ClockProvider`) and callers outside
the package will need to construct typed clock objects, add it to the barrel:

```typescript
export type { ..., ClockProvider } from './activities/recall.js';
```

This makes the type available without requiring callers to reach into internal paths.

