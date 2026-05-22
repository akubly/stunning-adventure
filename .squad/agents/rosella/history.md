📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Rosella — History (Summarized)

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to `.squad/decisions.md`. Key scope decisions:
- **ChangeVectorProvider** port with async return type for Phase 5 cloud readiness
- **Wave 2/3 split:** Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3 (requires composition-root decision)
- **Hint deduplication** via `(skillId, source, category)` key with active-status filter
- **Two-layer negative-impact attenuation:** Confidence scaling + eligibility flag (`autoApplyEligible`)

Decisions archived; all decisions.md > 20KB now. Ready for implementation on Wave 2 primitives (computation + ranking only; runtime wiring follows in Wave 3).

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — Forge Integration


Wave 2 scope amended: `docs/forge-phase4.6-wave2-scope.md` updated with PrescriberOrchestrator port + negative-impact attenuation. New ADR merged to `.squad/decisions.md`. Invocation point: `Curator.curate()` post-vector-sweep. Attenuation: when `meanNetImpact < 0`, `confidenceBoost` ≤ 1.0 (minimum 0.3), preventing auto-apply of harmful prescriptions.

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — Forge Integration

---

**Older work archived to history-archive.md (2026-05-01 through 2026-05-03 Wave 1–3).**

---

## 2026-05-03–04: Phase 4.6 Cycle 1–3 Review & Implementation

**What the cycle-1 panel review surfaced:**
The 15-finding panel review exposed a cluster of correctness issues in the change-vector
sweep that would have produced materially wrong net_impact values once the system ran
in production. The main patterns:

1. **Cumulative vs per-session confusion.** `deltaCost` was computed as
   `profile.token_total_cost - snapshot.tokenCostNanoAiu` — both cumulative totals.
   As more sessions accumulate, `token_total_cost` grows monotonically even when
   per-session cost is flat or improving. The delta would always trend positive
   (appearing worse) the longer a hint was observed. Panel caught this; I hadn't
   because the test fixtures used fixed values where cumulative == per-session.
   **Lesson:** delta computations on cumulative metrics need normalization. Always
   ask "is this field an accumulator or a rate?"

2. **The confidence cliff.** `log(1+vc)/log(1+min)` with vc=1, min=3 returns ~0.5.
   So 1 vector = half confidence. That *halves* the hint's influence — the opposite
   of "positive boost only." The clamp to `Math.max(1.0, …)` was the obvious fix
   once named, but it took the panel to name it. **Lesson:** test sparse-evidence
   behavior explicitly, not just the saturated case.

3. **The read-check-then-insert TOCTOU.** The original guard was
   `getChangeVectorsByHintId(); if (existing.length > 0) continue;` followed by
   an insert. Not atomic. The UNIQUE(hint_id) constraint + INSERT OR IGNORE is the
   correct fix — it delegates idempotence to the DB where it belongs.

4. **Single counter hiding four skip reasons.** `vectorsComputed: number` was
   opaque. You couldn't tell if sweeps were doing nothing because all hints were
   already computed vs. nothing had enough sessions vs. all snapshots were malformed.
   **Lesson:** diagnostic counters on background sweeps should be structured from
   the start, especially when the sweep has multiple independent skip conditions.

**Coordination challenges during fix:**

- **Lockout routing added cognitive overhead.** I fixed Alexander's code (curator.ts,
  changeVectors.ts, migration 012); Alexander fixed mine (utils.ts, prescribers). This
  meant reading and understanding code I didn't write under time pressure. The upside:
  you catch things the author missed because you don't have their blind spots.

- **sessionCount optionality was a non-trivial build decision.** Making
  `MetricSnapshot.sessionCount` required broke Laura's test fixtures at build time.
  The correct call was `optional` — but it took a failed build to surface the question.
  Filed decision doc: `rosella-phase4.6-cycle2-sessioncount-optional.md`.

- **DEFAULT_MIN_SESSIONS cross-package coordination.** Both cairn (changeVectors.ts)
  and forge (prescribers/utils.ts) use `?? 3` / `= 3` defaults. I defined the constant
  in cairn and left a note for Alexander to mirror or import. Since cairn can't import
  from forge, mirroring is the safe call. A shared `@akubly/types` home for this constant
  is a future-Phase 5 option if a third consumer appears.



**Findings Fixed:** F3 (budgetContext), F6b (signal entropy consumption), F9 (buildSnapshot utility), F10 (adaptive exploration).

**Key Outputs:**
- 	uneParameters() gains optional context: TuneContext carrying per-session budget limits
- Prescribers consume profile.signals.toolEntropy for tool-guidance decision instead of composite drift
- Shared uildSnapshot() utility with unified drift classification (GREEN/YELLOW/RED)
- Adaptive exploration budget: GREEN decay (×0.9), RED grow (×1.1), YELLOW stable

**Tests:** +8 new tests → Cairn prescriber: 478 passing

**Integration:** Ready to consume Roger's per-signal means; prescribers can now target specific drivers independent of overall drift.

---

## Learnings
- 2026-05-22: `getAllCategories(db, skillId)` lives in `packages/cairn/src/db/changeVectors.ts` beside the existing summary helpers. It reads distinct values from the `optimization_hints.category` column for a given `skill_id`, orders them alphabetically, and returns `[]` when no hints exist.
- 2026-05-22: Added three `changeVectors.test.ts` cases covering empty, single-category, and duplicate multi-category enumeration. `npm test --workspace=@akubly/cairn` passed with 560 tests green after the helper landed.
- 2026-05-22: `SqliteChangeVectorProvider` now lives in `packages/cairn/src/db/sqliteChangeVectorProvider.ts` and is exported from Cairn's top-level `src/index.ts` barrel so callers can construct it directly from a SQLite `Database`.
- 2026-05-22: Type reconciliation stayed at the DB boundary: `getAllCategories()` filters raw SQLite category strings through the canonical `OptimizationCategory` union from `@akubly/types`, then `summarizeChangeVectors()` only accepts narrowed categories. This kept the shared `ChangeVectorSummary` contract strict without widening it back to `string` inside Cairn.
- 2026-05-22: `SqliteChangeVectorProvider.getSummaries()` deliberately drops zero-vector summaries. Empty categories carry no historical signal, so returning `[]` keeps downstream orchestration in the same Phase 4.5 fallback mode as "no learned vectors yet."
- 2026-05-22: Verification after the provider landed: `npm run build`, `npm test --workspace=@akubly/cairn`, and root `npm test` all passed. Cairn is now at 564 passing tests plus 1 todo; the monorepo run also kept Forge green (20 files, 599 passing, 3 todo).

## Learnings — Phase 4.6 Cycle 3 Advisory Fixes (2026-05-04)

**What cycle-2 review surfaced about the cost normalization regression:**

The cycle-2 fix correctly introduced per-session normalization for `deltaCost`
(`totalCost / sessionCount` on both sides). But the cycle-2 fix overlooked that
Phase 4.5 snapshots — every hint already applied in production DBs — have no
`sessionCount` field. When `sessionCount` is missing, the cycle-2 code fell back
to `snapshot.tokenCostNanoAiu` raw (cumulative), while `afterCostPerSession` was
correctly per-session. The asymmetry was *worse* than the original bug: a
per-session value of ~210K minus a cumulative value of ~10M yields approximately
−9.79M, which `computeNetImpact` sign-flips into a large spurious positive
contribution. The fix would have silently poisoned all legacy hint vectors.

**How the fallback was made safe:**

Rather than attempt a partial normalization with unknown denominator, the
correct answer is to skip cost delta entirely for legacy snapshots. All other
delta fields (drift, success, convergence, cacheHit) are rates and means —
they're snapshot-shape-agnostic and remain valid. Only cost required the
session-count denominator. The new guard:

```
if (snapshotSessionCount <= 0) {
  deltaCost = 0;
  result.legacyCostSkipped++;
  console.warn('... legacy snapshot — cost delta skipped ...');
}
```

This produces an honest `deltaCost = 0` (neutral, not misleading) and surfaces
the skip in the structured diagnostic result. The JSDoc on `sweepChangeVectors`
now documents that re-applying a hint after a *new* snapshot will produce a
complete delta, giving operators a clear remediation path.

**Parallel fix (`sessionCountReset`):** When `profile.session_count` has been
reset (e.g., after a DB migration or tenant wipe) it can be *less than*
`snapshot.sessionCount`, producing negative `sessions_observed`. Added
`Math.max(0, ...)` clamp and a dedicated counter to surface this anomaly
without crashing or storing a nonsense value.

**Lesson reinforced:** When fixing a normalization bug, enumerate all input
shapes that can reach the new formula — especially historical/legacy records
that predate the field being introduced. The fix that works for new data may
silently corrupt old data if the new field is optional.

## 2026-05-04: Phase 4.6 Review Cycle Completion

**Role:** R1–R5 (Wave 1) + Cycle-1 Triage Fixes (Finding #1 blocker, plus others) + Cycle-3 Advisory Fixes

**Final Outcome:**
- 1153 tests passing (baseline 990 + 163 new)
- Branch review-clean, compliance approved
- Cycle 3 fixes delivered in parallel with Alexander's forge work

**Cycle 1–3 Findings Addressed by Rosella:**
- **Cycle 1:** Finding #1 (deltaCost cumulative bug — **blocking**), #2 (confidence clamp), #3 (sessions_observed docs), #4 (UNIQUE + INSERT OR IGNORE), #6 (sweep result structured), #10 (named contributions), #15 (DEFAULT_MIN_SESSIONS)
- **Cycle 2:** 3 important advisory findings escalated to cycle 3
- **Cycle 3:** 4 cairn-specific advisory fixes (legacy snapshot handling, sessions_observed clamp, minVectors guard, JSDoc)

**Cycle 3 Details:**
- Legacy snapshot handling: introduced `legacyCostSkipped` counter in sweep result; cost delta skipped when sessionCount unavailable
- sessions_observed clamp: `Math.max(0, profile.session_count - snapshot.sessionCount)` to prevent negative deltas during session resets; added `sessionCountReset` counter
- minVectors guard: safeMin clamped at 1 to prevent `Math.log(1) = 0` division
- Structured sweep result: replaced single `computed` counter with `{ eligible, skippedInsufficientSessions, skippedMalformed, alreadyComputed, computed }`

**Parallel Work:**
- Alexander-3 fixed forge prescribers simultaneously; confidence clamp and two-tier sort applied in lockout fashion
- Laura-5 added 20 tests to exercise the cycle-2 edge cases

**Pattern Observations:**
- **Cycle 1 triage to cycle 3 fixes:** Finding #1 (deltaCost) required deep thought — the bug was accumulation + normalization asymmetry with legacy data. Simple oversight in initial code; complex to fix correctly because it required enumeration of all input shapes and a deliberate skip-with-diagnostic strategy.
- **Confidence field naming:** The cycle-2 review's rename of `confidence` → `confidenceBoost` (Option B) was the right call. My initial implementation was semantically consistent for a "level" (0 = no data). Alexander's fix (zero-default) was semantically consistent for a "boost" (1.0 = identity). The name resolved the ambiguity by enforcing one semantic space.
- **Delegation under lockout:** Alexander fixed my changeVectors.ts naming bug in wave 3. I fixed his two-tier sort bug in cycle 1. Cross-review prevents blind spots — each implementation looked correct in its own context.

**Lesson (Cycle 3):** Advisory findings from focused re-review often surface edge cases (null checks, guard conditions) that the initial implementation missed because it was optimizing for the happy path. My cycle-1 deltaCost fix worked for new hints; it would have silently poisoned legacy snapshots. Cycle 3's legacyCostSkipped counter + skip-with-diagnostic pattern is the right approach: acknowledge the limitation, surface it, provide an honest value (0, not misleading), and document the remediation path.

