# Phase 4.6 Wave 3 — Curator-Driven Prescriber Orchestration

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-23  
**Status:** Approved — 2026-05-23  
**Depends on:** Wave 2 merged (data plumbing, attenuation, dedup, CLI composition)  
**ADR:** `docs/adr/0001-composition-root.md`

---

## 1. Goal & Outcomes

Wave 2 shipped the data plumbing and safety gates. Prescribers run — but only via manual CLI invocation (`npx forge-prescribe --skill <id>`). Wave 3 closes the loop: Curator autonomously triggers prescriber optimization when it detects new change vectors. The existing CLI remains the manual surface; MCP exposure is deferred to a later wave.

**Wave 3 delivers:**

| Outcome | Mechanism |
|---------|-----------|
| Composition Root ADR accepted | `docs/adr/0001-composition-root.md` — R2 approved: `@akubly/skillsmith-runtime` library + thin `runtime-cli` |
| Curator-driven prescriber orchestration | `curate()` accepts optional `PrescriberOrchestrationConfig`; prescribers run after vector sweep |
| Profile selection strategy | Trigger-driven only (skills with newly computed vectors) |
| Hint persistence ownership clarified | Orchestrator handles dedup + persistence (Wave 2 model continues) |
| Fail-open policy codified | Prescriber failures during Curator logged as warnings; Curator continues |

**Not delivered:** MCP tool exposure, global tier fallback, staleness checks, per-user/per-model granularity, cloud Curator wiring (all Wave 4+ / Phase 5).

---

## 2. Composition Root Decision Summary

**ADR:** [`docs/adr/0001-composition-root.md`](adr/0001-composition-root.md)

**Accepted option:** R2 — New `@akubly/skillsmith-runtime` library package + thin `@akubly/runtime-cli` wrapper.

- `packages/skillsmith-runtime/` = composition library (imports both Cairn + Forge; exports orchestration config factory)
- `packages/runtime-cli/` = thin CLI (delegates to skillsmith-runtime; unchanged user surface)
- Acyclic deps, best test isolation, Phase 5–portable
- Package name chosen by Aaron: domain-specific, fits cairn/forge construction metaphor, describes what the package operates on (skills)

Full reasoning, all five options, and trade-off matrix in the ADR.

---

## 3. Curator Integration

### 3.1 `curate()` Signature Change

**Current (Wave 2):**
```typescript
export function curate(changeVectorConfig?: ChangeVectorConfig): CurateResult;
```

**Wave 3 (shipped):**
```typescript
export async function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
): Promise<CurateResult>;
```

> **Cycle-1 fix:** The return type changed from `CurateResult` to `Promise<CurateResult>` — this is a type-breaking change, not an additive one. All workspace callers were updated as part of the cycle-1 fix.

### 3.2 `PrescriberOrchestrationConfig` (Alexander's design)

```typescript
export interface PrescriberOrchestrationConfig {
  runForSkill: (skillId: string, minSessions: number) 
    => Promise<PrescriberRunResult>;
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}

export interface PrescriberRunResult {
  skillId: string;
  hintsGenerated: number;
  hintsInserted: number;
  hintsDuplicated: number;
  hintsError: number;
  /**
   * Set when the orchestrator skipped this skill without running it
   * (e.g. time budget exhausted). Absent for normally-processed skills,
   * even when they produced zero hints.
   */
  skippedReason?: 'time-budget-exceeded';
}
```

The **composition root** (`@akubly/skillsmith-runtime`) constructs this config by wiring Cairn's `SqliteChangeVectorProvider` + profile loader to Forge's `runForgePrescribers`. Curator calls `runForSkill` without knowing about either package.

### 3.3 When Prescribers Run

After `sweepChangeVectors()` completes inside `curate()`:

1. If `prescriberOrchestrationConfig` was provided, iterate `changeVectorSweep.computedSkillIds` (may be empty — see §4.2):
2. For each skill with newly computed vectors:
   - Load profile (per-skill granularity, `granularity_key='global'`)
   - Skip if no profile or `sessionCount < minSessions` (default 3)
   - Call `runForSkill(skillId, minSessions)`
   - On success: accumulate results
   - On failure: log warning, continue to next skill (fail-open)
3. The orchestrator enforces a `PRESCRIBER_TIME_BUDGET_MS` (5s) across the batch. When exhausted mid-loop, remaining skills are appended with zero counts and `skippedReason: 'time-budget-exceeded'`.
4. Append prescriber results to `CurateResult.prescribers` field (present as `[]` when config provided but no skills computed; omitted entirely when no config was passed).

### 3.4 Fail-Open Semantics

If a prescriber call throws during Curator orchestration:
- **Log** the error as a warning (skill ID + error message)
- **Continue** processing remaining skills
- **Report** the failure in `PrescriberRunResult.hintsError`
- **Do not** abort the Curator cycle

This is consistent with Phase 4.5 fail-open policy and Wave 2's provider error handling.

### 3.5 `CurateResult` Extension

```typescript
export interface CurateResult {
  // ... existing fields (unchanged) ...

  prescribers?: PrescriberRunResult[]; // one entry per skill; absent if prescriberOrchestrationConfig not provided
}

// Shape of each entry (from @akubly/types):
export interface PrescriberRunResult {
  skillId: string;
  hintsGenerated: number;
  hintsInserted: number;
  hintsDuplicated: number;
  hintsError: number;
  skippedReason?: 'time-budget-exceeded'; // set when the skill was skipped before prescribers ran
}
```

`prescribers` is a per-skill array — one `PrescriberRunResult` per skill attempted (including skipped skills). Callers that need aggregate counts can compute them by reducing the array (e.g. `result.prescribers.reduce((sum, r) => sum + r.hintsInserted, 0)`).

---

## 4. Profile Selection Strategy

### 4.1 Wave 3 v1 Defaults

| Dimension | Wave 3 v1 Choice | Rationale |
|-----------|-----------------|-----------|
| **Trigger set** | Skills with newly computed vectors only | Tight coupling to vector sweep; avoids re-prescribing unchanged skills |
| **Granularity** | Per-skill only (`granularity='per-skill'`, `granularity_key='global'`) | Vector computation is per-skill; cross-granularity is Wave 4 |
| **Skip: no profile** | Skip silently | No profile = no optimization target |
| **Skip: immature** | Skip when `sessionCount < minSessions` (default 3) | Insufficient evidence for prescriber input |
| **Skip: stale profile** | Not checked (deferred) | Requires staleness constant + UX design |

### 4.2 Operator-Visible Behaviors

| Scenario | What the operator sees |
|----------|----------------------|
| Curator runs, 3 skills have new vectors | `prescribers` array has 3 entries (one per skill) |
| 1 of 3 skills has no profile | 1 entry has zero counts (no `skippedReason`); operator can create a profile to enable optimization |
| Time budget exhausted mid-batch | Remaining entries have `skippedReason: 'time-budget-exceeded'` and zero counts |
| Dedup blocks 2 of 5 hints | sum of `hintsDuplicated` across entries = 2 (active hints already exist) |
| Prescriber fails for 1 skill | 1 entry has `hintsError: 1` + warning log (other skills unaffected) |
| No new vectors this cycle, config provided | `prescribers: []` (config was supplied; loop ran zero iterations) |
| No new vectors this cycle, no config | `prescribers` field absent from `CurateResult` |

---

## 5. Hint Persistence Ownership

**Decision:** The orchestrator (composition root) handles dedup + persistence. This continues the Wave 2 model.

**Flow:**
1. `runForSkill()` in `@akubly/skillsmith-runtime` calls `runForgePrescribers()` → receives `OptimizationHint[]`
2. For each hint: calls `insertHintIfNew(db, hint)` from Cairn (best-effort check-and-insert: `SELECT` for any active hint matching `(skillId, source, category)`, then `INSERT` if none found; returns `{ inserted: boolean }`)
3. Counts: `inserted=true` → `hintsInserted++`; `inserted=false` → `hintsDuplicated++`; thrown error → `hintsError++`
4. Returns `PrescriberRunResult` with insert/dedup/error counts

**Rationale:** Forge prescribers are pure functions — they generate hints without DB access. Persistence is a composition concern (needs DB handle + dedup policy). Keeping it in the composition root means Forge stays portable and testable without SQLite.

**Concurrency note (Wave 4 follow-up):** `insertHintIfNew()` performs the existence check and the insert as separate statements — it is **not** transactional and there is no DB-level uniqueness constraint on `(skill_id, source, category)` filtered by active status. Under concurrent writers (two hook processes running simultaneously) duplicate hints could land. The single-process curate hook is the only writer today, so this is tolerated for now. Wave 4 will add a partial UNIQUE index (e.g. `ON optimization_hints (skill_id, source, category) WHERE status IN ('pending','accepted','deferred')`) and/or wrap the check+insert in a `BEGIN IMMEDIATE` transaction.

**Force-overwrite (deferred to Wave 4):** No `force=true` knob is exposed in Wave 3. `insertHintIfNew()` is the only persistence path; duplicate hints for the same `(skillId, source, category)` always dedup. If operators need to regenerate hints, the current path is to retire the active hint via lifecycle, then re-run.

---

## 6. Fail-Open Policy

**Policy:** If Forge prescribers fail during Curator-driven orchestration, Curator continues with a logged warning. Consistent with Phase 4.5 fail-open semantics.

| Failure mode | Behavior |
|-------------|----------|
| `runForSkill()` throws for skill X | Log warning with skill ID + error; continue to skill X+1 |
| `SqliteChangeVectorProvider.getSummaries()` throws | Prescribers run without vector enrichment (Phase 4.5 mode); hints still generated |
| Profile loader returns null | Skill skipped (counted in `skillsSkipped`) |
| Hint persistence fails (DB error) | Increment `hintsError`; continue to next hint |
| All skills fail | `prescribers.errors > 0`, `prescribers.hintsInserted = 0`; Curator result still returned |

**Invariant:** A prescriber failure never aborts Curator's own insight detection or vector sweep. Prescriber orchestration is an additive, optional layer.

---

## 7. Work Items

| # | Item | Owner | Tests | Depends | Parallel? |
|---|------|-------|-------|---------|-----------|
| W3-1 | **Create `packages/skillsmith-runtime/`** — Extract composition library from `runtime-cli`. Exports: `createPrescriberOrchestrationConfig()`, `runForgePrescribe()`. Package scaffold + workspace registration. | Roger | 2 (import smoke, config factory) | — | First |
| W3-2 | **Thin `runtime-cli`** — Modify `runtime-cli/src/index.ts` to delegate to `@akubly/skillsmith-runtime`. CLI surface unchanged. Verify `npx forge-prescribe` still works. | Roger | 2 (existing CLI tests pass, delegation verified) | W3-1 | After W3-1 |
| W3-3 | **`PrescriberOrchestrationConfig` type** — Add to `@akubly/types`. `PrescriberRunResult` type. | Alexander | 0 (type-only) | W3-1 | Yes |
| W3-4 | **`curate()` signature extension** — Add optional `prescriberOrchestrationConfig` parameter. Internal loop: iterate skills, call `runForSkill`, accumulate results. Fail-open try/catch. Add `prescribers` field to `CurateResult`. | Alexander | 4 (no config = unchanged, with config = runs, fail-open on error, skip immature profile) | W3-3 | After W3-3 |
| W3-5 | **Orchestration config factory** — `createPrescriberOrchestrationConfig()` in `@akubly/skillsmith-runtime`. Wires `SqliteChangeVectorProvider` + profile loader + `runForgePrescribers` + hint persistence with dedup. | Alexander | 4 (happy path, dedup, no profile skip, provider error fail-open) | W3-1, W3-3 | After deps |
| W3-6 | **Curator hook wiring** — `packages/cairn/src/hooks/sessionStart.ts` constructs `PrescriberOrchestrationConfig` via `@akubly/skillsmith-runtime` and passes to `curate()`. Always-on (no opt-in flag). | Roger | 2 (hook triggers prescribers when vectors exist, no-op when no config) | W3-5, W3-4 | After deps |
| W3-7 | **Integration test** — End-to-end: session start → Curator → vector sweep → prescriber orchestration → hint persistence → dedup on re-run. Table-driven scenarios. | Laura | 4 (auto trigger, dedup, fail-open, no profile skip) | W3-6 | Serial (last) |

**Total: 7 items, ~18 tests.**  
**Critical path: W3-1 → W3-3 → W3-4/W3-5 → W3-6 → W3-7.**

---

## 8. Out of Scope (Deferred)

## Migration Notes

After Wave 3, prescriber hints generate automatically at session start for skills with ≥3 sessions and an execution profile. This replaces manual-only invocation. The CLI path (`forge-prescribe --skill <id>`) remains available. To suppress automatic generation for a skill, ensure it has no execution profile or fewer than 3 sessions.

---

| Item | Deferred to | Rationale |
|------|------------|-----------|
| MCP tool exposure (`run_prescriber_optimization`) | Later wave | No net-new capability vs. existing CLI; Curator hook handles auto path. The manual invocation surface (`forge-prescribe` CLI) assumes operator has local shell access to the repo. If a future agent-driven recovery path needs to trigger prescribers from a context without shell access, that's the concrete operator need that justifies reopening MCP. |
| MCP-driven `skillIds` override | Later wave | Depends on MCP tool; CLI is the manual surface for now |
| Global tier fallback (per-skill → global profile chain) | Wave 4 | Requires cross-granularity category matching + dedup reconsideration |
| Staleness check (skip stale profiles) | Wave 4 | Needs staleness constant, UX design for "profile stale" messaging |
| All-granularities prescribing (per-user, per-model) | Phase 5 | Combinatorial explosion; vector computation is per-skill only today |
| Cloud Curator wiring | Phase 5 | Requires async cloud prescriber calls; `@akubly/skillsmith-runtime` is portable target |
| Observable metrics / monitoring dashboard | Wave 4 | Structured output in `CurateResult` is sufficient for v1; formal metrics later |
| Automatic prescriber scheduling (cron-like) | Phase 5 | Wave 3 triggers on session start + CLI manual path; no scheduler needed yet |
| `run_prescriber_optimization` with `dryRun` flag | Later wave | Depends on MCP tool |

---

## 9. Resolved Decisions

All four open questions resolved by Aaron on 2026-05-23.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| Q1 | Composition root option | **R2 accepted** with package name `@akubly/skillsmith-runtime` | Domain-specific name fits cairn/forge construction metaphor; describes what the package operates on (skills); accommodates future additions |
| Q2 | MCP server topology | **MCP dropped from Wave 3 entirely** | No net-new capability vs. existing `forge-prescribe` CLI; Curator hook handles the auto path; re-open in a later wave when concrete operator need surfaces |
| Q3 | Automatic hook invocation | **Always-on** | Existing safety rails (attenuation, dedup, fail-open) handle the auto path; no opt-in flag needed |
| Q4 | Package name | **`@akubly/skillsmith-runtime`** | Aaron rejected generic `@akubly/runtime` in favor of domain-specific name |
