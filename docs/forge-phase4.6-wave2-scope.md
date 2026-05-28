# Phase 4.6 Wave 2 — Wire Change Vectors → Prescriber `historicalVectors`

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-05 (v3.1)
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

**v3 change: async return type.** Ports use `Promise<T>` for Phase 5 readiness. SQLite implementations return `Promise.resolve(result)`. Cost: negligible. Benefit: no interface churn at Phase 5.

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

**Decision: Wave 2 delivers the manual path via a top-level CLI script. Curator-driven orchestration is Wave 3.**

Wave 2 scope:
- `ChangeVectorProvider` port + Cairn adapter + type promotion (the data plumbing)
- `runPrescriberOrchestration` function in Forge (wraps both prescribers + provider query)
- Negative-impact attenuation (safety-critical once wiring is live)
- `autoApplyEligible` flag propagation from summary → hint → persistence → applier
- Hint dedup policy (safety-critical once prescribers run repeatedly)
- Top-level CLI script for manual invocation (composition root outside both packages)

Wave 3 scope (follow-up):
- Composition root ADR (where does the runtime that imports both Cairn and Forge live?)
- Curator integration via injected orchestrator
- MCP tool exposure for prescriber optimization (requires composition root for MCP registration)
- Profile selection strategy for batch invocation

**Trade-off named:** Wave 2 delivers the feature for manual CLI invocation only. The autonomous Curator path — which is the primary production invocation per the spec — ships later. But Wave 2 is self-contained and safe: the data plumbing and safety gates (attenuation, dedup) are the hard parts. Wave 3 is pure wiring once composition ownership is settled.

---

## 3. Hint Deduplication Policy

### 3.1 The Problem

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

### 3.4 Ownership

The orchestrator returns `OptimizationHint[]` as pure data. The **caller** (the top-level CLI script, or later the Curator in Wave 3) is responsible for persisting hints with dedup. The dedup check and `insertOptimizationHint` call happen at the call site, which has DB access.

**The orchestrator is pure. Persistence is the caller's concern.**

---

## 4. Negative-Impact Attenuation — Final Semantics

### 4.1 The Problem

Without attenuation, the applier's `autoApplyThreshold` checks confidence (not predicted impact). A hint with negative `meanNetImpact` but unchanged confidence passes the gate — the system auto-applies prescriptions it knows are historically harmful.

### 4.2 Constants

Two named constants govern attenuation behavior:

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `ATTENUATION_FLOOR` | `0.1` | `forge/src/prescribers/utils.ts` + `cairn/src/db/changeVectors.ts` | Minimum `confidenceBoost` when `meanNetImpact < 0` and evidence is mature. Prevents total zeroing — allows recovery if conditions change. |
| `NEGATIVE_IMPACT_AUTO_APPLY_GATE` | `-0.2` | `@akubly/types` (next to `ChangeVectorSummary`) | Threshold below which `autoApplyEligible` becomes `false`. Chosen because `-0.2` is the "noticeable harm" boundary — below the drift YELLOW threshold (0.2), meaning the prescription caused drift-equivalent degradation. |

**Why `-0.2` specifically:** The drift score thresholds are GREEN < 0.2, YELLOW 0.2–0.3, RED ≥ 0.3. A `meanNetImpact` of `-0.2` means the prescription shifted metrics by the equivalent of one drift tier in the wrong direction. That's the point where "try again" becomes actively counterproductive.

### 4.3 Confidence Attenuation Formula

When `meanNetImpact < 0` AND `vectorCount >= minVectors` (mature evidence):
```
confidenceBoost = max(ATTENUATION_FLOOR, 1.0 + meanNetImpact)
```

| meanNetImpact | confidenceBoost | Effect on baseline confidence 0.8 |
|---------------|-----------------|-----------------------------------|
| +0.3 | 1.22 (log formula) | 0.98 (amplified) |
| 0.0 | 1.0 | 0.80 (unchanged) |
| -0.1 | 0.9 | 0.72 (mild penalty, may still auto-apply at 0.7) |
| -0.3 | 0.7 | 0.56 (below typical 0.7 threshold) |
| -0.5 | 0.5 | 0.40 (well below threshold) |
| -0.9 | 0.1 (floor) | 0.08 (near zero, manual review only) |

When `vectorCount < minVectors` (sparse evidence): `confidenceBoost = 1.0` regardless of sign. Sparse negative data should not punish; the system needs more evidence.

When `vectorCount >= minVectors` AND `meanNetImpact >= 0`: existing log-scaled boost formula (unchanged from Wave 1).

### 4.4 Auto-Apply Eligibility Flag

**On `ChangeVectorSummary`** (computed at summary time):
```typescript
autoApplyEligible: boolean;
// false when meanNetImpact < NEGATIVE_IMPACT_AUTO_APPLY_GATE && vectorCount >= minVectors
```

### 4.5 Full Propagation Path — Summary → Hint → Persistence → Applier

The `autoApplyEligible` flag originates on the `ChangeVectorSummary` but must survive through to the applier's auto-apply gate. Propagation:

**Step 1 — Summary computation** (`cairn/src/db/changeVectors.ts` + `forge/src/prescribers/utils.ts`):
`summarizeChangeVectors` and `computeConfidenceBoost` compute `autoApplyEligible` based on `meanNetImpact` and `vectorCount`. The flag lives on `ChangeVectorSummary`.

**Step 2 — Prescriber enrichment** (`forge/src/prescribers/promptOptimizer.ts` + `tokenOptimizer.ts`):
When `historicalVectors` are supplied and a hint matches a summary, the prescriber copies `autoApplyEligible` onto the hint:
```typescript
if (summary) {
  hint.confidence = Math.min(1, hint.confidence * summary.confidenceBoost);
  hint.predictedImpact = summary.meanNetImpact;
  hint.autoApplyEligible = summary.autoApplyEligible;  // NEW
}
```
Hints with no matching summary default to `autoApplyEligible = true` (no vector data = no reason to block).

**Step 3 — Type addition** (`forge/src/prescribers/types.ts` → `OptimizationHint`):
Add optional field:
```typescript
export interface OptimizationHint {
  // ... existing fields ...
  /**
   * Whether this hint is eligible for auto-apply. False when historical
   * vectors show mature negative impact (meanNetImpact < NEGATIVE_IMPACT_AUTO_APPLY_GATE).
   * Absent or true when no vector data exists or impact is non-negative.
   */
  autoApplyEligible?: boolean;
}
```
Optional for backward compatibility — Phase 4.5 hints without vector data have no field (treated as `true`).

**Step 4 — Persistence** (`cairn/src/db/optimizationHints.ts`):
Store `autoApplyEligible` in the existing `evidence` JSON blob on `optimization_hints`. No schema migration needed — `evidence` is already `TEXT` (JSON).
```typescript
evidence: {
  ...hint.evidence,
  autoApplyEligible: hint.autoApplyEligible,
}
```
**Why `evidence` blob, not a new column?** The flag is prescriber metadata, not a first-class query dimension. No SQL query ever needs `WHERE autoApplyEligible = false`. The only consumer is the applier, which already deserializes evidence. Adding a column would require migration 013 for a boolean that's only read in one code path.

**Step 5 — Applier gate** (`forge/src/applier/optimizer.ts`):
Before auto-applying a hint, check:
```typescript
if (hint.autoApplyEligible === false) {
  skipped.push({ hintId: hint.id, reason: 'historical vectors indicate negative impact' });
  continue;
}
```
This check is independent of `hint.confidence < threshold`. Defense in depth — even if confidence math changes, strongly negative categories can't auto-apply.

### 4.6 Where All Changes Land

| File | Change | Work Item |
|------|--------|-----------|
| `@akubly/types` | `ChangeVectorSummary` adds `autoApplyEligible` field + `NEGATIVE_IMPACT_AUTO_APPLY_GATE` constant | W2-1 |
| `forge/src/prescribers/types.ts` (`OptimizationHint`) | Add `autoApplyEligible?: boolean` | W2-2 |
| `forge/src/prescribers/utils.ts` (`computeConfidenceBoost`) | Add `meanNetImpact` parameter; apply attenuation + compute eligibility when negative + mature | W2-5 |
| `cairn/src/db/changeVectors.ts` (`summarizeChangeVectors`) | Mirror attenuation logic; compute `autoApplyEligible` on return type | W2-5 |
| `forge/src/prescribers/promptOptimizer.ts` | Copy `summary.autoApplyEligible` onto matched hints | W2-7 |
| `forge/src/prescribers/tokenOptimizer.ts` | Copy `summary.autoApplyEligible` onto matched hints | W2-7 |
| `cairn/src/db/optimizationHints.ts` | Persist `autoApplyEligible` inside `evidence` blob on insert | W2-9 (CLI script) |
| `forge/src/applier/optimizer.ts` | Check `hint.autoApplyEligible === false` before auto-apply | W2-8 |

---

## 5. Work Decomposition

| # | Item | Owner | Tests | Depends | Parallel? |
|---|------|-------|-------|---------|-----------|
| W2-1 | `ChangeVectorSummary` type (with `autoApplyEligible`) + `ChangeVectorProvider` interface + `NEGATIVE_IMPACT_AUTO_APPLY_GATE` constant in `@akubly/types`. Async return type. | Roger | 0 (type-only) | — | Yes |
| W2-2 | Update Forge `ChangeVectorSummary` to re-export from `@akubly/types`. Add `autoApplyEligible?: boolean` to `OptimizationHint`. Update Cairn's copy to import from `@akubly/types`. Remove duplicates. | Alexander (forge) + Rosella (cairn) | 2 (contract regression) | W2-1 | Yes |
| W2-3 | `getAllCategoriesForSkill(db, skillId): string[]` helper in Cairn's changeVectors CRUD. | Rosella | 3 (empty, single, multi) | — | Yes |
| W2-4 | `SqliteChangeVectorProvider` in Cairn — adapter around `summarizeChangeVectors` + `getAllCategoriesForSkill`. Returns `Promise<ChangeVectorSummary[]>`. | Rosella | 4 (empty DB, single category, multi-category, unknown skill) | W2-1, W2-3 | After deps |
| W2-5 | Negative-impact attenuation in `computeConfidenceBoost` (forge) and `summarizeChangeVectors` (cairn). Compute `autoApplyEligible` on both sides. | Alexander (forge) + Rosella (cairn) | 6 (see §6 maturity gradient table) | W2-1, W2-2 | Yes |
| W2-6 | `hasActiveOptimizationHint(skillId, source, category): boolean` dedup helper in Cairn's optimizationHints CRUD. | Rosella | 3 (no match, exact match, terminal-only match) | — | Yes |
| W2-7 | `runPrescriberOrchestration(profile, provider): Promise<OptimizationHint[]>` in Forge — wraps both prescribers, queries provider, copies `autoApplyEligible` onto matched hints, returns pure hint list. No persistence. | Alexander | 6 (both prescribers called, vector passthrough, no vectors fallback, empty profile, provider error, autoApplyEligible propagated) | W2-1, W2-2, W2-5 | After deps |
| W2-8 | Applier `autoApplyEligible` gate — skip auto-apply when `hint.autoApplyEligible === false`. | Alexander | 4 (eligible true, eligible false, field absent/undefined, field absent + low confidence) | W2-2 | After dep |
| W2-9 | Top-level CLI script `scripts/optimize-skill.ts` — composition root outside both packages. Imports from both `@akubly/forge` and `@akubly/cairn`. Queries provider, calls orchestrator, dedup-checks, persists hints (with `autoApplyEligible` in evidence blob). See §5.1 for CLI surface spec. | Rosella | 4 (happy path, dedup blocks, no profile, no vectors) | W2-4, W2-6, W2-7 | Serial |
| W2-10 | Integration test: end-to-end from applied hint → sweep → summarize → orchestrate → dedup → persist → applier respects autoApplyEligible. Table-driven maturity gradient. | Laura | 8 (see §6; +1 for applier autoApplyEligible gate in e2e) | W2-9, W2-8 | Serial |

**Total: 10 items, ~40 tests.**
**Critical path: W2-1 → W2-2/W2-5 → W2-7 → W2-9 → W2-10.**

### 5.1 CLI Surface Spec (W2-9)

**Script:** `scripts/optimize-skill.ts`

**Invocation:**
```bash
npx tsx scripts/optimize-skill.ts --skill <skillId>
```

**Arguments:**
| Flag | Required | Description |
|------|----------|-------------|
| `--skill <id>` | Yes | The skill ID to run prescriber optimization for. |

**Profile load strategy:** Load `per-skill` profile with `granularity_key = 'global'` first. If not found, exit with message "No execution profile for skill `<id>`" and code 1. No fallback to other granularities — Wave 2 operates on the canonical per-skill aggregate.

**Output (stdout, human-readable):**
```
Prescriber optimization for skill: <skillId>

Change vector summaries: <N> categories loaded
  convergence: meanNetImpact=+0.12, vectors=5, autoApplyEligible=true
  prompt-structure: meanNetImpact=-0.35, vectors=4, autoApplyEligible=false
  ...

Prescriber results:
  prompt-optimizer: <N> hints generated
  token-optimizer: <N> hints generated

Persistence:
  Inserted: <N>
  Skipped (active duplicate): <N>
  Total:    <N>
```

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Success (including 0 hints generated — that's a valid outcome) |
| 1 | No execution profile found for skill |
| 2 | Database error or unexpected failure |

**No MCP tool in Wave 2.** MCP exposure requires solving the composition problem for MCP server registration (Cairn's MCP server can't import Forge; Forge has no MCP server). This is Wave 3 scope, gated on the composition root ADR.

### 5.2 Composition Root Boundary

The CLI script in `scripts/optimize-skill.ts` is the **only** file in Wave 2 that imports from both packages:
```typescript
import { runPrescriberOrchestration } from '@akubly/forge';
import { createSqliteChangeVectorProvider, hasActiveOptimizationHint, insertOptimizationHint } from '@akubly/cairn';
```

It lives at the repo root, outside both `packages/forge/` and `packages/cairn/`. Neither package gains a new dependency on the other. The script is a stepping stone — Wave 3 will formalize the composition pattern (new package, modified entrypoint, or DI container — TBD in composition root ADR).

---

## 6. Test Strategy

### 6.1 Maturity Gradient Test (Table-Driven)

Single test file with parameterized cases covering the full evidence lifecycle. All cases reference `NEGATIVE_IMPACT_AUTO_APPLY_GATE = -0.2` and `ATTENUATION_FLOOR = 0.1` by constant name.

| Scenario | vectorCount | meanNetImpact | Expected confidenceBoost | autoApplyEligible | Sorting behavior |
|----------|------------|---------------|-------------------------|-------------------|-----------------|
| No vectors | 0 | N/A | 1.0 | true | No predictedImpact; impactScore-only sort |
| Sparse positive (1 vector) | 1 | +0.3 | 1.0 (no amplification below minVectors) | true | predictedImpact set but no boost |
| Sparse negative (2 vectors) | 2 | -0.4 | 1.0 (no attenuation below minVectors) | true | predictedImpact negative, sorts lower |
| Mature positive (≥3 vectors) | 5 | +0.3 | >1.0 (log formula) | true | predictedImpact positive, sorts first, confidence amplified |
| Mature mild negative (above gate) | 3 | -0.1 | 0.9 | **true** | Sorts below positive, mild confidence penalty, still auto-apply eligible |
| Mature moderate negative (at gate) | 4 | -0.2 | 0.8 | **false** | Below gate, auto-apply blocked |
| Mature strong negative | 5 | -0.5 | 0.5 | **false** | Confidence halved, auto-apply blocked |
| Mature extreme negative | 10 | -0.9 | 0.1 (floor) | **false** | Confidence near zero, auto-apply blocked |

### 6.2 Integration Test Scenario (W2-10)

```
Given: A Cairn DB with:
  - skill "skill-alpha" with execution profile (sessionCount=20)
  - 3 applied optimization_hints (convergence, prompt-structure, cache-optimization)
  - Change vectors computed by sweepChangeVectors
  - convergence vectors: positive impact (+0.3, vectorCount=5)
  - prompt-structure vectors: negative impact (-0.4, vectorCount=4)

When: The CLI script runs:
  1. SqliteChangeVectorProvider.getSummaries("skill-alpha") → summaries
  2. runPrescriberOrchestration(profile, provider) → hints
  3. Dedup check + persist (autoApplyEligible stored in evidence blob)

Then:
  - Convergence hint: predictedImpact=+0.3, confidence amplified, autoApplyEligible=true
  - Prompt-structure hint: predictedImpact=-0.4, confidence attenuated, autoApplyEligible=false
  - Applier: convergence hint auto-applies; prompt-structure hint skipped ("historical vectors indicate negative impact")
  - Second CLI run: zero new hints (dedup blocks)
  - After expiring existing hints: third run re-generates (lifecycle complete)
```

### 6.3 Additional Scenarios

| Scenario | Expected |
|----------|----------|
| No change vectors in DB | Provider returns `[]`, prescribers run in Phase 4.5 mode, no autoApplyEligible field on hints |
| Legacy snapshots (no sessionCount) | deltaCost=0, summaries computed from remaining deltas |
| Unknown skill ID | Provider returns `[]` |
| Provider throws | Orchestrator catches, returns hints without vector enrichment (fail-open) |
| Two consecutive CLI runs, same state | Second run: dedup blocks all hints, zero inserts |
| Hint loaded from DB missing autoApplyEligible in evidence | Applier treats as eligible (absent = true, backward compat) |

---

## 7. Boundary Watch

### Cross-package type movement

`ChangeVectorSummary` promoted from two independent copies (forge/prescribers/types.ts, cairn/db/changeVectors.ts) to canonical definition in `@akubly/types`. Both packages import from there. Laura's L5 regression test remains as a belt-and-suspenders guard.

### "Forge never imports Cairn" rule — NOT violated

Wave 2 introduces no Forge→Cairn imports. The composition script at the repo root imports both, but it is not inside either package.

### "Cairn never imports Forge" rule — NOT violated

No Cairn production code imports from Forge. The composition script lives outside both packages. (Wave 3 will need to resolve this for Curator integration via the composition root ADR.)

### New shared types in `@akubly/types`

- `ChangeVectorSummary` (promoted from duplicates, adds `autoApplyEligible`)
- `ChangeVectorProvider` (new port interface, async)
- `NEGATIVE_IMPACT_AUTO_APPLY_GATE` (exported constant)

One type promotion + one new interface + one constant.

---

## 8. Risks & Open Questions

### Resolved

| # | Question | Resolution |
|---|----------|-----------|
| Q1 | Category enumeration | Data-driven: `getAllCategoriesForSkill()` helper |
| Q2 | Performance budget | Ship per-category queries, defer batching |
| Q3 | Negative-impact attenuation | Do it now. Two-layer: confidence scaling + autoApplyEligible flag. Full propagation spec in §4.5. |
| Q4 | Call site / composition root | Top-level CLI script for Wave 2 manual path. Curator-driven = Wave 3. |
| Q5 | Attenuation threshold | `NEGATIVE_IMPACT_AUTO_APPLY_GATE = -0.2`. Reasoning: matches drift tier boundary (GREEN < 0.2). See §4.2. |
| Q6 | autoApplyEligible persistence | Stored in `evidence` JSON blob, not a new column. See §4.5. |

### Open — Needs Aaron's input

1. **Composition script location.** `scripts/optimize-skill.ts` — standalone at repo root. Confirm this is the right home vs. a `bin/` entrypoint or a new top-level package.

### Known risks

| Risk | Mitigation |
|------|-----------|
| Type promotion breaks existing test imports | Roger/Alexander coordinate — both packages update imports in same PR |
| Composition script is an ad-hoc solution | Explicit: this is a stepping stone. Wave 3 ADR will formalize composition ownership. |
| Dedup policy misses edge cases (same category, different recommendation text) | By design — `(skillId, source, category)` is the semantic key. Different descriptions for the same category are the same recommendation with different evidence snapshots. |
| Async port overhead for sync SQLite | `Promise.resolve()` is ~0 overhead in V8. |
| `autoApplyEligible` lost if evidence blob deserialization fails | Applier treats missing field as `true` (backward compat). Fail-open is consistent with existing policy. |

---

## 9. Wave 3 Forward Reference

Wave 3 (Curator-Driven Orchestration) requires:

1. **Composition Root ADR:** Where does the runtime that imports both Cairn and Forge live? Options: new `@akubly/runtime` package, modified hook entrypoint, or DI container. Each has trade-offs around package boundaries, deployment, and test isolation.

2. **Profile Selection Strategy:** Which profiles does Curator run prescribers against? Trigger set (skills with new vectors vs. all), granularity tier (`per-skill` only vs. all), and skip conditions (no profile, insufficient sessions, stale profile).

3. **Curator Integration:** `curate()` gains an optional `prescriberOrchestrator` config parameter. When provided, runs prescribers after `sweepChangeVectors()` for skills with newly computed vectors.

4. **MCP Tool Exposure:** `run_prescriber_optimization` MCP tool. Requires composition root to be in place so the MCP server can wire both packages.

These are mechanical once the composition root is decided. The hard parts (data plumbing, type promotion, attenuation, dedup, propagation) ship in Wave 2.

---

## 10. Critique Response Log

### v3 (original review)

| # | Finding | Disposition | Notes |
|---|---------|------------|-------|
| 1 🔴 | Composition root problem | **ACCEPT** | Moved Curator-driven orchestration to Wave 3. Wave 2 uses top-level CLI script. |
| 2 🔴 | Inconsistency about who queries vectors | **ACCEPT** | Orchestrator is pure (`profile, provider → hints`). Provider passed in by CLI script. |
| 3 🔴 | Missing hint deduplication | **ACCEPT** | `(skillId, source, category)` dedup policy + W2-6 work item. |
| 4 🟡 | Non-Curator workflows stranded | **ACCEPT** | Wave 2 IS the manual path. CLI script is the invocation point. |
| 5 🟡 | Profile selection underspecified | **ACCEPT for Wave 2, DEFER for Wave 3.** CLI loads per-skill/global. Batch strategy deferred. |
| 6 🟡 | Attenuation floor too permissive | **ACCEPT** | Two-layer: confidence scaling + `autoApplyEligible` flag. |
| 7 🟡 | Test maturity gradient | **ACCEPT** | Table-driven test in §6.1. |
| 8 🟢 | Scope too large | **ACCEPT** | Split Curator orchestration to Wave 3. |
| 9 🟢 | Async-ready ports | **ACCEPT** | `Promise<T>` return types on ports. |

### v3.1 (sanity-check review)

| # | Finding | Disposition | Notes |
|---|---------|------------|-------|
| 1 🔴 | Stale Cairn-MCP wording | **ACCEPT** | All Cairn-MCP references removed from Wave 2. W2-9 is CLI-only. MCP explicitly deferred to Wave 3 §9. |
| 2 🔴 | `autoApplyEligible` has no persistence path | **ACCEPT** | Full propagation spec added in §4.5: summary → hint field → evidence blob → applier gate. W2-7 expanded (propagation in prescribers), W2-8 expanded (applier gate + absent-field case), W2-9 updated (evidence blob persistence). |
| 3 🟡 | Attenuation threshold inconsistency | **ACCEPT** | Picked `-0.2` as final value. Named constants: `NEGATIVE_IMPACT_AUTO_APPLY_GATE = -0.2`, `ATTENUATION_FLOOR = 0.1`. Reasoning in §4.2. Test cases reference constants by name. |
| 4 🟡 | CLI surface underspecified | **ACCEPT** | Full CLI spec in §5.1: `--skill` flag, profile load strategy, output format, exit codes. |

---

*v3.1 — All blocking and strong findings addressed. Wave 2 is self-contained: data plumbing, safety gates (with full propagation path), manual CLI invocation. Wave 3 delivers autonomous Curator integration once composition ownership is decided.*
