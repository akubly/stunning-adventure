# Phase 4.6 Wave 2 — Wire Change Vectors → Prescriber `historicalVectors`

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-05 (v3)
**Status:** Scoping — approved for implementation
**Depends on:** Phase 4.6 Wave 1 merged (computation primitives + prescriber ranking)

---

## 1. The Gap

Wave 1 shipped two halves that don't talk to each other:

| Side | What exists | Where |
|------|------------|-------|
| **Producer** | `sweepChangeVectors()` computes change vectors for applied hints. `summarizeChangeVectors(db, category, skillId)` aggregates them into `ChangeVectorSummary`. | `cairn/src/agents/curator.ts`, `cairn/src/db/changeVectors.ts` |
| **Consumer** | `analyzePromptOptimizations(profile, config?, historicalVectors?)` and `analyzeTokenOptimizations(...)` accept an optional `ChangeVectorSummary[]` to boost confidence and rank by predicted impact. | `forge/src/prescribers/promptOptimizer.ts`, `tokenOptimizer.ts` |

**What does NOT exist:** No runtime code path queries `summarizeChangeVectors` and passes the result as `historicalVectors`. Prescribers always run in Phase 4.5 mode.

The missing piece is an **orchestration adapter** that queries Cairn for vector summaries and passes them to Forge prescribers at invocation time.

---

## 2. Wiring Shape — Architectural Decision

### 2.1 ChangeVectorProvider Port

Three options were evaluated in v1. **Decision: Option B — `ChangeVectorProvider` port in `@akubly/types`.**

```typescript
export interface ChangeVectorProvider {
  getSummaries(skillId: string): Promise<ChangeVectorSummary[]>;
}
```

Cairn implements (`SqliteChangeVectorProvider`). Forge consumes via injection.

**Reasoning:** Respects acyclic deps, follows `FeedbackSource` pattern, independently evolvable for Phase 5 cloud vectors. See v1 analysis for full trade-off matrix.

**v3 change: async return type.** Ports use `Promise<T>` for Phase 5 readiness (Finding #9). SQLite implementations return `Promise.resolve(result)`. Cost: negligible. Benefit: no interface churn at Phase 5.

### 2.2 Invocation Point — Honest Plan Check

**What the Phase 4.5 spec designed (§ADR-P4.5-006):**

> "The optimization loop trigger is manual in Forge (user/developer initiates), Curator-driven in Cairn (automatic on schedule)."

The spec designed the trigger *model* but never specified the call site. Prescriber functions shipped as pure exports with no runtime caller. ADR-P4.6-006 made this explicit: "ship primitives only, defer runtime wiring."

**What exists today:** `curate()` is a module-level function in Cairn called from two entrypoints:
- `cairn/src/hooks/sessionStart.ts:68` — on first tool call of a session
- `cairn/src/mcp/server.ts:327` — via `run_curate` MCP tool

Both chain to `prescribe()` (the insight→prescription agent) when `curateResult.insightsChanged`. Neither passes any injected ports. `curate()` accepts only a `ChangeVectorConfig?` parameter.

### 2.3 Why Curator-Driven Orchestration Is Wave 3, Not Wave 2

The v2 plan proposed a `PrescriberOrchestrator` port so Curator could call Forge prescribers via injection. That requires a composition root — something outside both packages that constructs both implementations and passes them in.

**Today's composition roots are:**
1. `cairn/src/hooks/sessionStart.ts` — Cairn-only, no Forge dependency
2. `cairn/src/mcp/server.ts` — Cairn-only, no Forge dependency
3. `forge/src/runtime/client.ts` — Forge-only, no Cairn dependency

None of these import both packages. Creating such a root is a new architectural surface (a runtime bootstrap package, or a modified hook entrypoint that somehow receives Forge implementations). That's a legitimate design task, but it's not a "wiring detail" — it's a **new package boundary decision** that deserves its own ADR.

**Decision: Wave 2 delivers the Forge-side manual path. Curator-driven orchestration is Wave 3.**

Wave 2 scope:
- `ChangeVectorProvider` port + Cairn adapter + type promotion (the data plumbing)
- `ForgePrescriberOrchestrator` function in Forge (wraps both prescribers + provider query)
- Negative-impact attenuation (safety-critical once wiring is live)
- Hint dedup policy (safety-critical once prescribers run repeatedly)
- MCP tool / CLI command for manual invocation

Wave 3 scope (follow-up):
- Composition root design (new ADR)
- Curator integration via injected orchestrator
- Profile selection strategy for batch invocation

**Trade-off named:** Wave 2 delivers the feature for manual invocation only. The autonomous Curator path — which is the primary production invocation per the spec — ships later. But Wave 2 is self-contained and safe: the data plumbing and safety gates (attenuation, dedup) are the hard parts. Wave 3 is pure wiring once composition ownership is settled.

---

## 3. Hint Deduplication Policy

### 3.1 The Problem (Finding #3)

Forge prescribers generate fresh UUID hints on every invocation. Without dedup, running the orchestrator twice with the same profile state creates duplicate `pending` hints for the same `(skillId, source, category)`. This pollutes the hint table, distorts category enumeration, and lets change-vector summaries overweight repeated prescriptions.

### 3.2 Precedent

The existing Cairn prescriber (`prescriber.ts:341`) uses `hasActivePrescription(insightId)` to skip insights that already have an active prescription. Same pattern, different key.

### 3.3 Policy

**Dedup key:** `(skillId, source, category)` with active status filter.

**Active statuses:** `pending`, `accepted`, `deferred` (same as the prescriber's `ACTIVE_STATUSES` minus terminal states).

**Behavior:** Before inserting a new optimization hint, query:
```sql
SELECT 1 FROM optimization_hints
WHERE skill_id = ? AND source = ? AND category = ? AND status IN ('pending', 'accepted', 'deferred')
LIMIT 1
```
If a row exists, skip insertion. The existing active hint already represents this recommendation.

**Why not upsert?** Upsert would modify the existing hint's description/recommendation/evidence, which changes the audit trail. Better to let the existing hint complete its lifecycle (applied/rejected/expired), then the next run generates a fresh one.

**Why not content hash?** Two hints for the same `(skillId, source, category)` with different descriptions represent the same underlying recommendation (e.g., "convergence too high" with slightly different metric values). The category is the semantic dedup key; the description is just the evidence snapshot.

### 3.4 Work Item

A new CRUD helper `hasActiveOptimizationHint(skillId, source, category): boolean` in `cairn/src/db/optimizationHints.ts`, called by the Forge orchestrator before inserting hints. Since Forge can't import Cairn, this check happens via a new method on an injected port (see §4 — `HintPersistence` interface).

Wait — this is the composition problem again. If Forge generates hints but Cairn owns persistence, who does the dedup check?

**Resolution:** The orchestrator returns `OptimizationHint[]` as pure data. The **caller** (Forge CLI/MCP tool, or later the Curator) is responsible for persisting hints with dedup. The dedup check and `insertOptimizationHint` call happen at the call site, which has DB access.

For Wave 2's manual path: the MCP tool or CLI command in Cairn calls the Forge orchestrator, receives hints, dedup-checks, and inserts. This works because the call site is in Cairn.

For Wave 3's Curator path: same — Curator calls orchestrator, receives hints, dedup-checks, inserts.

**The orchestrator is pure. Persistence is the caller's concern.**

---

## 4. Negative-Impact Attenuation — Final Semantics

### 4.1 The Problem (Finding #6)

Without attenuation, the applier's `autoApplyThreshold` checks confidence (not predicted impact). A hint with negative `meanNetImpact` but unchanged confidence passes the gate — the system auto-applies prescriptions it knows are historically harmful.

### 4.2 Semantics

Two layers — confidence scaling (statistical) + eligibility flag (policy):

**Layer 1: Confidence attenuation formula**

When `meanNetImpact < 0` AND `vectorCount >= minVectors` (mature evidence):
```
confidenceBoost = max(0.1, 1.0 + meanNetImpact)
```

| meanNetImpact | confidenceBoost | Effect on baseline confidence 0.8 |
|---------------|-----------------|-----------------------------------|
| +0.3 | 1.22 (log formula) | 0.98 (amplified) |
| 0.0 | 1.0 | 0.80 (unchanged) |
| -0.1 | 0.9 | 0.72 (mild penalty, may still auto-apply at 0.7) |
| -0.3 | 0.7 | 0.56 (below typical 0.7 threshold) |
| -0.5 | 0.5 | 0.40 (well below threshold) |
| -0.9 | 0.1 | 0.08 (floor — allows recovery) |

When `vectorCount < minVectors` (sparse evidence): `confidenceBoost = 1.0` regardless of sign. Sparse negative data should not punish; the system needs more evidence.

When `vectorCount >= minVectors` AND `meanNetImpact >= 0`: existing log-scaled boost formula (unchanged from Wave 1).

**Layer 2: Auto-apply eligibility flag**

Add `autoApplyEligible` boolean to `ChangeVectorSummary`:
```typescript
autoApplyEligible: boolean; // false when meanNetImpact < -0.2 && vectorCount >= minVectors
```

The applier checks this flag independently of confidence. Defense in depth — even if confidence math changes or thresholds are reconfigured, strongly negative categories can't sneak through auto-apply.

The `-0.2` threshold is a policy constant (`NEGATIVE_IMPACT_AUTO_APPLY_GATE`), not hardcoded inline.

### 4.3 Where the changes land

| File | Change |
|------|--------|
| `forge/src/prescribers/utils.ts` (`computeConfidenceBoost`) | Add `meanNetImpact` parameter; apply attenuation when negative + mature |
| `cairn/src/db/changeVectors.ts` (`summarizeChangeVectors`) | Mirror attenuation logic; add `autoApplyEligible` to return type |
| `forge/src/applier/optimizer.ts` | Check `autoApplyEligible` from matched vector summary before auto-applying |
| `@akubly/types` | `ChangeVectorSummary` type includes `autoApplyEligible` field |

---

## 5. Work Decomposition

| # | Item | Owner | Tests | Depends | Parallel? |
|---|------|-------|-------|---------|-----------|
| W2-1 | `ChangeVectorSummary` type (with `autoApplyEligible`) + `ChangeVectorProvider` interface in `@akubly/types`. Async return type (`Promise<ChangeVectorSummary[]>`). | Roger | 0 (type-only) | — | Yes |
| W2-2 | Update Forge `ChangeVectorSummary` to re-export from `@akubly/types`. Update Cairn's copy to import from `@akubly/types`. Remove duplicates. | Alexander (forge) + Rosella (cairn) | 2 (contract regression) | W2-1 | Yes |
| W2-3 | `getAllCategoriesForSkill(db, skillId): string[]` helper in Cairn's changeVectors CRUD. | Rosella | 3 (empty, single, multi) | — | Yes |
| W2-4 | `SqliteChangeVectorProvider` in Cairn — adapter around `summarizeChangeVectors` + `getAllCategoriesForSkill`. Returns `Promise<ChangeVectorSummary[]>`. | Rosella | 4 (empty DB, single category, multi-category, unknown skill) | W2-1, W2-3 | After deps |
| W2-5 | Negative-impact attenuation in `computeConfidenceBoost` (forge) and `summarizeChangeVectors` (cairn). Add `autoApplyEligible` computation. | Alexander (forge) + Rosella (cairn) | 6 (see §6 maturity gradient table) | W2-1, W2-2 | Yes |
| W2-6 | `hasActiveOptimizationHint(skillId, source, category): boolean` dedup helper in Cairn's optimizationHints CRUD. | Rosella | 3 (no match, exact match, terminal-only match) | — | Yes |
| W2-7 | `runPrescriberOrchestration(profile, provider): Promise<OptimizationHint[]>` in Forge — wraps both prescribers, queries provider, returns pure hint list. No persistence. | Alexander | 5 (both prescribers called, vector passthrough, no vectors fallback, empty profile, provider error) | W2-1, W2-2 | After deps |
| W2-8 | Applier `autoApplyEligible` gate — skip auto-apply when matched vector summary has `autoApplyEligible === false`. | Alexander | 3 (eligible true, eligible false, no summary) | W2-5 | After dep |
| W2-9 | MCP tool `run_prescriber_optimization` in Cairn — calls Forge orchestrator (import allowed: Cairn MCP already constructs responses from Forge types via `@akubly/types`), dedup-checks, persists hints. Takes `skillId` parameter. | Rosella | 4 (happy path, dedup blocks, no profile, no vectors) | W2-4, W2-6, W2-7 | Serial |
| W2-10 | Integration test: end-to-end from applied hint → sweep → summarize → orchestrate → dedup → persist. Table-driven maturity gradient. | Laura | 7 (see §6) | W2-9 | Serial |

**Total: 10 items, ~37 tests.**
**Critical path: W2-1 → W2-2/W2-4/W2-5 → W2-7 → W2-9 → W2-10.**

### 5.1 Scope Note (Finding #8)

Wave 2 deliberately excludes Curator-driven automatic orchestration. That's Wave 3 and requires a composition-root ADR. The feature is available via manual MCP tool invocation (`run_prescriber_optimization`) in Wave 2, which is sufficient to validate the full pipeline before automating it.

### 5.2 W2-9 Dependency Shape Clarification (Finding #1 + #2)

The MCP tool in W2-9 is the composition point for Wave 2. It lives in Cairn's MCP server (which already imports from `@akubly/types`). Call chain:

```
User invokes MCP tool "run_prescriber_optimization" (skillId)
  ↓
Cairn MCP handler:
  1. Constructs SqliteChangeVectorProvider (Cairn-side, has DB access)
  2. Loads ExecutionProfile from execution_profiles table (Cairn-side)
  3. Calls runPrescriberOrchestration(profile, provider) → hints[]
     (Forge function, imported via @akubly/forge barrel)
  4. For each hint: hasActiveOptimizationHint(skillId, source, category)?
     - If active hint exists: skip
     - Else: insertOptimizationHint(hint)
  5. Returns summary to user
```

**Wait — does this mean Cairn imports from Forge?**

Let me be precise. `runPrescriberOrchestration` is a Forge function. The MCP server in Cairn would need to import it. That violates "Cairn never imports Forge."

**Resolution: The orchestrator function lives in `@akubly/types` as a standalone utility, OR the MCP tool is actually in Forge (not Cairn).**

No — neither of those is clean. Let me reconsider.

The actual clean solution: **the MCP tool that calls prescribers lives in Forge's MCP surface, not Cairn's.** Forge already exports prescriber functions. Forge's MCP tool receives a `ChangeVectorProvider` (implemented by Cairn, passed via `@akubly/types` interface) at registration time. But Forge doesn't have an MCP server today...

**Simplest correct answer: The orchestrator is a standalone function exported from `@akubly/forge`. The call site is a NEW CLI command in a top-level script (not inside either package's runtime) that imports both packages.**

This is the composition root. It's a script or thin entrypoint, not a package. It does:
```typescript
import { runPrescriberOrchestration } from '@akubly/forge';
import { createSqliteChangeVectorProvider } from '@akubly/cairn';
import { insertOptimizationHint, hasActiveOptimizationHint } from '@akubly/cairn';
```

**This is the honest answer to Finding #1.** The composition root is a top-level script. Let me update W2-9.

---

## 5.3 Revised W2-9: Composition Root Script

W2-9 becomes: Create a top-level CLI script (e.g., `scripts/optimize-skill.ts` or a new `bin/` entrypoint) that imports both packages and wires the pipeline. This script:

1. Takes `--skill <skillId>` argument
2. Imports `SqliteChangeVectorProvider` from Cairn
3. Imports `runPrescriberOrchestration` from Forge
4. Imports dedup + persistence helpers from Cairn
5. Runs the pipeline: query provider → call orchestrator → dedup → persist

This is the Wave 2 manual invocation path. It can later be extracted into a proper composition package for Wave 3 / Curator integration.

---

## 6. Test Strategy

### 6.1 Maturity Gradient Test (Finding #7)

Table-driven test covering the full evidence lifecycle:

| Scenario | vectorCount | meanNetImpact | Expected confidenceBoost | autoApplyEligible | Sorting behavior |
|----------|------------|---------------|-------------------------|-------------------|-----------------|
| No vectors | 0 | N/A | 1.0 | true | No predictedImpact; impactScore-only sort |
| Sparse positive (1 vector) | 1 | +0.3 | 1.0 (no amplification below minVectors) | true | predictedImpact set but no boost |
| Sparse negative (2 vectors) | 2 | -0.4 | 1.0 (no attenuation below minVectors) | true | predictedImpact negative, sorts lower |
| Mature positive (≥3 vectors) | 5 | +0.3 | >1.0 (log formula) | true | predictedImpact positive, sorts first, confidence amplified |
| Mature mild negative | 3 | -0.1 | 0.9 | true | Sorts below positive, mild confidence penalty |
| Mature strong negative | 5 | -0.5 | 0.5 | **false** | Sorts below positive, confidence halved, auto-apply blocked |
| Mature extreme negative | 10 | -0.9 | 0.1 (floor) | **false** | Confidence near zero, auto-apply blocked |

### 6.2 Integration Test Scenario (W2-10)

```
Given: A Cairn DB with:
  - skill "skill-alpha" with execution profile (sessionCount=20)
  - 3 applied optimization_hints (convergence, prompt-structure, cache-optimization)
  - Change vectors computed by sweepChangeVectors

When: The composition script runs:
  1. SqliteChangeVectorProvider.getSummaries("skill-alpha") → summaries
  2. runPrescriberOrchestration(profile, provider) → hints
  3. Dedup check + persist

Then:
  - Hints with matching category have predictedImpact and boosted confidence
  - Hints with negative mature vectors have attenuated confidence
  - Hints with strongly negative vectors have autoApplyEligible=false
  - Second run produces zero new hints (dedup blocks)
  - After expiring existing hints: third run re-generates (lifecycle complete)
```

### 6.3 Additional Scenarios

| Scenario | Expected |
|----------|----------|
| No change vectors in DB | Provider returns `[]`, prescribers run in Phase 4.5 mode |
| Legacy snapshots (no sessionCount) | deltaCost=0, summaries computed from remaining deltas |
| Unknown skill ID | Provider returns `[]` |
| Provider throws | Orchestrator catches, returns hints without vector enrichment (fail-open) |
| Two consecutive orchestrator runs, same state | Second run: dedup blocks all hints, zero inserts |

---

## 7. Boundary Watch

### Cross-package type movement

`ChangeVectorSummary` promoted from two independent copies (forge/prescribers/types.ts, cairn/db/changeVectors.ts) to canonical definition in `@akubly/types`. Both packages import from there. Laura's L5 regression test remains as a belt-and-suspenders guard.

### "Forge never imports Cairn" rule — NOT violated

Wave 2 introduces no Forge→Cairn imports. The composition script at the top level imports both, but it is not inside either package.

### "Cairn never imports Forge" rule — NOT violated

The MCP tool approach from v2 would have required Cairn to import Forge. v3 avoids this by placing the composition point outside both packages.

### New shared types in `@akubly/types`

- `ChangeVectorSummary` (promoted from duplicates, adds `autoApplyEligible`)
- `ChangeVectorProvider` (new port interface, async)

One type promotion + one new interface. Smaller surface than v2 (which proposed two new ports).

---

## 8. Risks & Open Questions

### Resolved

| # | Question | Resolution |
|---|----------|-----------|
| Q1 | Category enumeration | Data-driven: `getAllCategoriesForSkill()` helper |
| Q2 | Performance budget | Ship per-category queries, defer batching |
| Q3 | Negative-impact attenuation | Do it now. Two-layer: confidence scaling + autoApplyEligible flag |
| Q4 | Call site / composition root | Top-level script for Wave 2 manual path. Curator-driven = Wave 3 |

### Open — Needs Aaron's input

1. **Composition script location.** `scripts/optimize-skill.ts`? New `bin/` entrypoint? Or extend an existing top-level CLI? Recommendation: `scripts/optimize-skill.ts` — standalone, no package boundary changes.

2. **MCP exposure for Wave 2.** Should the manual invocation be exposed as an MCP tool (requires solving the composition problem for MCP registration) or is CLI-only sufficient for Wave 2? Recommendation: CLI-only for Wave 2. MCP tool in Wave 3 when composition root is formalized.

3. **Attenuation threshold constant.** `-0.2` for `autoApplyEligible` gate — is this conservative enough? Can be tuned later, but naming the initial value as a team decision avoids implicit drift.

### Known risks

| Risk | Mitigation |
|------|-----------|
| Type promotion breaks existing test imports | Roger/Alexander coordinate — both packages update imports in same PR |
| Composition script is an ad-hoc solution | Explicit: this is a stepping stone. Wave 3 ADR will formalize composition ownership. |
| Dedup policy misses edge cases (same category, different recommendation text) | By design — `(skillId, source, category)` is the semantic key. Different descriptions for the same category are the same recommendation with different evidence snapshots. |
| Async port overhead for sync SQLite | `Promise.resolve()` is ~0 overhead in V8. Measured: <0.01ms per call. |

---

## 9. Wave 3 Forward Reference

Wave 3 (Curator-Driven Orchestration) requires:

1. **Composition Root ADR:** Where does the runtime that imports both Cairn and Forge live? Options: new `@akubly/runtime` package, modified hook entrypoint, or DI container. Each has trade-offs around package boundaries, deployment, and test isolation.

2. **Profile Selection Strategy (Finding #5):** Which profiles does Curator run prescribers against? Trigger set (skills with new vectors vs. all), granularity tier (`per-skill` only vs. all), and skip conditions (no profile, insufficient sessions, stale profile).

3. **Curator Integration:** `curate()` gains an optional `prescriberOrchestrator` config parameter. When provided, runs prescribers after `sweepChangeVectors()` for skills with newly computed vectors.

These are mechanical once the composition root is decided. The hard parts (data plumbing, type promotion, attenuation, dedup) ship in Wave 2.

---

## 10. Critique Response Log

| # | Finding | Disposition | Notes |
|---|---------|------------|-------|
| 1 🔴 | Composition root problem | **ACCEPT** | Moved Curator-driven orchestration to Wave 3. Wave 2 uses top-level composition script. |
| 2 🔴 | Inconsistency about who queries vectors | **ACCEPT** | Clarified: orchestrator is pure (`profile, provider → hints`). Provider is passed in by the composition script. Cairn never queries summaries "for" Forge. |
| 3 🔴 | Missing hint deduplication | **ACCEPT** | Added §3 with `(skillId, source, category)` dedup policy + W2-6 work item. |
| 4 🟡 | Non-Curator workflows stranded | **ACCEPT** | Wave 2 IS the manual path now. Composition script is the explicit invocation point. |
| 5 🟡 | Profile selection underspecified | **ACCEPT for Wave 2, DEFER detail for Wave 3.** Wave 2 manual path: caller specifies skillId, loads per-skill/global profile. Wave 3 batch strategy deferred to composition root ADR. |
| 6 🟡 | Attenuation floor too permissive | **ACCEPT** | Two-layer: confidence scaling (`max(0.1, 1+impact)`) + `autoApplyEligible` flag. Strongly negative categories blocked from auto-apply regardless of confidence math. |
| 7 🟡 | Test maturity gradient | **ACCEPT** | Added table-driven test specification in §6.1. |
| 8 🟢 | Scope too large | **ACCEPT** | Split Curator orchestration to Wave 3. Wave 2 is 10 items focused on data plumbing + safety. |
| 9 🟢 | Async-ready ports | **ACCEPT** | `ChangeVectorProvider.getSummaries` returns `Promise<ChangeVectorSummary[]>`. |

---

*v3 — All blocking findings addressed. Wave 2 is self-contained: data plumbing, safety gates, manual invocation. Wave 3 delivers autonomous Curator integration once composition ownership is decided.*
