# Phase 4.6 Wave 3 — Curator-Driven Prescriber Orchestration

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-23  
**Status:** Proposed — awaiting Aaron's approval  
**Depends on:** Wave 2 merged (data plumbing, attenuation, dedup, CLI composition)  
**ADR:** `docs/adr/0001-composition-root.md`

---

## 1. Goal & Outcomes

Wave 2 shipped the data plumbing and safety gates. Prescribers run — but only via manual CLI invocation (`npx forge-prescribe --skill <id>`). Wave 3 closes the loop: Curator autonomously triggers prescriber optimization when it detects new change vectors, and operators can invoke it on-demand via MCP.

**Wave 3 delivers:**

| Outcome | Mechanism |
|---------|-----------|
| Composition Root ADR decided | `docs/adr/0001-composition-root.md` — formalizes where both packages compose |
| Curator-driven prescriber orchestration | `curate()` accepts optional `PrescriberOrchestrationConfig`; prescribers run after vector sweep |
| Profile selection strategy | Trigger-driven (skills with new vectors) + explicit `skillIds` override via MCP |
| MCP tool exposure | `run_prescriber_optimization` tool registered in Cairn's MCP server |
| Hint persistence ownership clarified | Orchestrator handles dedup + persistence (Wave 2 model continues) |
| Fail-open policy codified | Prescriber failures during Curator logged as warnings; Curator continues |

**Not delivered:** Global tier fallback, staleness checks, per-user/per-model granularity, cloud Curator wiring (all Wave 4+ / Phase 5).

---

## 2. Composition Root Decision Summary

**ADR:** [`docs/adr/0001-composition-root.md`](adr/0001-composition-root.md)

**Recommended option:** R2 — New `@akubly/runtime` library package + thin `@akubly/runtime-cli` wrapper.

- `packages/runtime/` = composition library (imports both Cairn + Forge; exports orchestration config factory, MCP tool registration)
- `packages/runtime-cli/` = thin CLI (delegates to runtime; unchanged user surface)
- Acyclic deps, best test isolation, Phase 5–portable

Full reasoning, all five options, and trade-off matrix in the ADR. Aaron must approve before implementation starts.

---

## 3. Curator Integration

### 3.1 `curate()` Signature Change

**Current (Wave 2):**
```typescript
export function curate(changeVectorConfig?: ChangeVectorConfig): CurateResult;
```

**Wave 3 (backward compatible):**
```typescript
export function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
): CurateResult;
```

Existing call sites (`sessionStart.ts`, `run_curate` MCP tool) pass no orchestration config → behavior unchanged.

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
}
```

The **composition root** (`@akubly/runtime`) constructs this config by wiring Cairn's `SqliteChangeVectorProvider` + profile loader to Forge's `runForgePrescribers`. Curator calls `runForSkill` without knowing about either package.

### 3.3 When Prescribers Run

After `sweepChangeVectors()` completes inside `curate()`:

1. If `prescriberOrchestrationConfig` is provided AND `changeVectorSweep.skillsProcessed > 0`:
2. For each skill with newly computed vectors:
   - Load profile (per-skill granularity, `granularity_key='global'`)
   - Skip if no profile or `sessionCount < minSessions` (default 3)
   - Call `runForSkill(skillId, minSessions)`
   - On success: accumulate results
   - On failure: log warning, continue to next skill (fail-open)
3. Append prescriber results to `CurateResult.prescribers` field

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
  
  prescribers?: {
    skillsProcessed: number;
    skillsSkipped: number;
    hintsGenerated: number;
    hintsInserted: number;
    hintsDeduplicated: number;
    errors: number;
  };
}
```

Field is absent when no `prescriberOrchestrationConfig` is provided (backward compatible).

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

### 4.2 MCP Override

The `run_prescriber_optimization` MCP tool accepts an optional `skillIds` array. When provided, prescribers run for the listed skills instead of the trigger set. This enables:
- Targeted re-optimization after hint rejection
- Testing prescriber behavior on specific skills
- Recovery from partial Curator failures

### 4.3 Operator-Visible Behaviors

| Scenario | What the operator sees |
|----------|----------------------|
| Curator runs, 3 skills have new vectors | `prescribers.skillsProcessed: 3` in CurateResult |
| 1 of 3 skills has no profile | `prescribers.skillsSkipped: 1` (operator can create profile to enable) |
| Dedup blocks 2 of 5 hints | `prescribers.hintsDeduplicated: 2` (active hints already exist) |
| Prescriber fails for 1 skill | `prescribers.errors: 1` + warning log (other skills unaffected) |
| No new vectors this cycle | `prescribers` field absent (prescribers didn't run) |
| MCP tool with `force=true` | Dedup bypassed; all generated hints persisted |

---

## 5. MCP Tool Exposure

### 5.1 Tool: `run_prescriber_optimization`

**Registration location:** Cairn's MCP server (`packages/cairn/src/mcp/server.ts`), using registration helper from `@akubly/runtime`.

```typescript
import { registerPrescriberTools } from '@akubly/runtime';
// ... in server setup:
registerPrescriberTools(server);
```

### 5.2 Input Schema

```typescript
{
  title: 'Run Prescriber Optimization',
  description: 'Trigger prescriber optimization for skills with new change vector data. '
    + 'Generates, deduplicates, and persists optimization hints.',
  inputSchema: {
    force: {
      type: 'boolean',
      description: 'Skip dedup and regenerate hints even if active hints exist.',
      default: false,
    },
    skillIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional: run for specific skills instead of trigger set.',
    },
    minSessions: {
      type: 'number',
      description: 'Override minimum session threshold for profile maturity.',
    },
  },
  annotations: { readOnlyHint: false },
}
```

### 5.3 Output Schema

```typescript
{
  success: boolean;
  skillsProcessed: number;
  skillsSkipped: number;
  details: {
    hintsGenerated: number;
    hintsInserted: number;
    hintsDeduplicated: number;
    hintsError: number;
  };
  vectorApplicability: {
    categoriesMatched: number;
    categoriesUnmatched: number;
  };
  nextSteps?: string;  // Human-readable guidance
}
```

### 5.4 Invocation Model: Hybrid

| Path | Trigger | When |
|------|---------|------|
| **Automatic** (Curator hook) | `sessionStart.ts` passes `PrescriberOrchestrationConfig` to `curate()` | Every session start that produces new vectors |
| **Manual** (MCP tool) | Operator calls `run_prescriber_optimization` | On demand — targeted re-runs, testing, recovery |

Both paths use the same composition root (`@akubly/runtime`) and the same `PrescriberOrchestrationConfig`. The MCP tool internally calls `curate()` with the config.

---

## 6. Hint Persistence Ownership

**Decision:** The orchestrator (composition root) handles dedup + persistence. This continues the Wave 2 model.

**Flow:**
1. `runForSkill()` in `@akubly/runtime` calls `runForgePrescribers()` → receives `OptimizationHint[]`
2. For each hint: calls `hasActiveOptimizationHint(skillId, source, category)` from Cairn
3. If no active hint: calls `insertOptimizationHint(db, hint)` with `autoApplyEligible` in evidence blob
4. Returns `PrescriberRunResult` with insert/dedup/error counts

**Rationale:** Forge prescribers are pure functions — they generate hints without DB access. Persistence is a composition concern (needs DB handle + dedup policy). Keeping it in the composition root means Forge stays portable and testable without SQLite.

**`force=true` behavior:** Skip dedup check entirely. Regenerate and persist even if active hints exist for same `(skillId, source, category)`. Matches Wave 2 intent: hints are immutable; lifecycle controls repetition.

---

## 7. Fail-Open Policy

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

## 8. Work Items

| # | Item | Owner | Tests | Depends | Parallel? |
|---|------|-------|-------|---------|-----------|
| W3-1 | **Create `packages/runtime/`** — Extract composition library from `runtime-cli`. Exports: `createPrescriberOrchestrationConfig()`, `runForgePrescribe()`. Package scaffold + workspace registration. | Roger | 2 (import smoke, config factory) | ADR approved | First |
| W3-2 | **Thin `runtime-cli`** — Modify `runtime-cli/src/index.ts` to delegate to `@akubly/runtime`. CLI surface unchanged. Verify `npx forge-prescribe` still works. | Roger | 2 (existing CLI tests pass, delegation verified) | W3-1 | After W3-1 |
| W3-3 | **`PrescriberOrchestrationConfig` type** — Add to `@akubly/types`. `PrescriberRunResult` type. | Alexander | 0 (type-only) | W3-1 | Yes |
| W3-4 | **`curate()` signature extension** — Add optional `prescriberOrchestrationConfig` parameter. Internal loop: iterate skills, call `runForSkill`, accumulate results. Fail-open try/catch. Add `prescribers` field to `CurateResult`. | Alexander | 4 (no config = unchanged, with config = runs, fail-open on error, skip immature profile) | W3-3 | After W3-3 |
| W3-5 | **Orchestration config factory** — `createPrescriberOrchestrationConfig()` in `@akubly/runtime`. Wires `SqliteChangeVectorProvider` + profile loader + `runForgePrescribers` + hint persistence with dedup. | Alexander | 4 (happy path, dedup, no profile skip, provider error fail-open) | W3-1, W3-3 | After deps |
| W3-6 | **MCP tool registration** — `registerPrescriberTools(server)` in `@akubly/runtime`. Registers `run_prescriber_optimization`. Input/output schema per §5. | Alexander | 3 (tool registered, force flag, skillIds override) | W3-5 | After W3-5 |
| W3-7 | **Cairn MCP server wiring** — `packages/cairn/src/mcp/server.ts` imports `registerPrescriberTools` from `@akubly/runtime` and calls it during server setup. | Roger | 2 (tool appears in tool list, tool callable) | W3-6 | After W3-6 |
| W3-8 | **Curator hook wiring** — `packages/cairn/src/hooks/sessionStart.ts` constructs `PrescriberOrchestrationConfig` via `@akubly/runtime` and passes to `curate()`. | Roger | 2 (hook triggers prescribers when vectors exist, no-op when no config) | W3-5, W3-4 | After deps |
| W3-9 | **Integration test** — End-to-end: session start → Curator → vector sweep → prescriber orchestration → hint persistence → dedup on re-run → MCP tool invocation. Table-driven scenarios. | Laura | 6 (auto trigger, manual MCP, dedup, fail-open, no profile skip, force flag) | W3-7, W3-8 | Serial (last) |

**Total: 9 items, ~25 tests.**  
**Critical path: W3-1 → W3-3 → W3-4/W3-5 → W3-6 → W3-7/W3-8 → W3-9.**

---

## 9. Out of Scope (Deferred)

| Item | Deferred to | Rationale |
|------|------------|-----------|
| Global tier fallback (per-skill → global profile chain) | Wave 4 | Requires cross-granularity category matching + dedup reconsideration |
| Staleness check (skip stale profiles) | Wave 4 | Needs staleness constant, UX design for "profile stale" messaging |
| All-granularities prescribing (per-user, per-model) | Phase 5 | Combinatorial explosion; vector computation is per-skill only today |
| Cloud Curator wiring | Phase 5 | Requires async cloud prescriber calls; `@akubly/runtime` is portable target |
| Observable metrics / monitoring dashboard | Wave 4 | Structured output in `CurateResult` is sufficient for v1; formal metrics later |
| Automatic prescriber scheduling (cron-like) | Phase 5 | Wave 3 triggers on session start + manual MCP; no scheduler needed yet |
| `run_prescriber_optimization` with `dryRun` flag | Wave 4 | Low priority; operators can inspect via structured output |

---

## 10. Open Questions for Aaron

### Q1: Composition Root (Blocking)

**The question:** Approve ADR-0001 recommendation (R2: new `@akubly/runtime` library + thin `runtime-cli`)?

**Alternatives:** R4 (`@akubly/curator` package) is the runner-up — stronger naming semantics but higher commitment to "Curator as a package" that may not survive Phase 5.

**Impact:** All Wave 3 work items depend on this decision.

### Q2: MCP Server Topology

**The question:** Should `run_prescriber_optimization` register in Cairn's existing MCP server (recommended) or should `@akubly/runtime` host its own MCP server?

**Trade-off:** Single server = simpler operator UX, one connection. Separate server = cleaner package boundaries but operators must connect to two servers.

**Recommendation:** Cairn's server. Operators already know it.

### Q3: Automatic Hook Invocation in v1

**The question:** Should the Curator hook (`sessionStart.ts`) automatically pass `PrescriberOrchestrationConfig` in Wave 3 v1, or should automatic invocation be opt-in (config flag)?

**Trade-off:** Always-on = faster feedback loop but may generate unexpected hints on session start. Opt-in = safer rollout but delays value.

**Recommendation:** Always-on in Wave 3 v1. The dedup gate, profile maturity check, and fail-open semantics provide sufficient safety rails. Operators see results in `CurateResult` and can inspect via MCP.

### Q4: Package Name Confirmation

**The question:** Is `@akubly/runtime` the right name? Roger flagged potential confusion with Phase 4.5's informal "runtime" usage.

**Alternatives:** `@akubly/compose`, `@akubly/orchestrator`, `@akubly/bridge`.

**Recommendation:** Keep `runtime` — it's accurate (this is where both runtimes compose) and concise.
