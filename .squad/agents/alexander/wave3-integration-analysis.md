# Wave 3 Curator–MCP Integration Surface Analysis

**Author:** Alexander (SDK/Runtime Dev)  
**Date:** 2026-05-22  
**Status:** Mapping complete, ready for composition root ADR  
**Depends on:** Wave 2 completion + composition root decision

---

## Executive Summary

Wave 3 requires integrating Curator-driven prescriber orchestration with MCP tool exposure. This analysis maps the three integration surfaces:

1. **Curator surface today** — Where and how `curate()` operates, with concrete function signatures for Wave 3 injection points.
2. **Profile selection strategy** — Trade-offs between trigger-driven vs. granularity-tiered approaches for batch prescriber invocation.
3. **MCP tool shape** — Input/output schemas for `run_prescriber_optimization`, conditional on composition root choice (Roger's options A–D).
4. **Curator config API** — Minimal signature change to accept an optional prescriber orchestrator.
5. **ADR open questions** — Blockers that depend on composition root decision.

**Key finding:** Wave 3 wiring is mechanically straightforward once composition root is chosen. The hard parts (data plumbing, attenuation, dedup) ship in Wave 2.

---

## 1. Curator Surface Today

### 1.1 Location & Call Sites

**Module:** `packages/cairn/src/agents/curator.ts`

**Function signature (today):**
```typescript
export function curate(changeVectorConfig?: ChangeVectorConfig): CurateResult {
  // Processes unprocessed events (batch), detects patterns (recurring errors,
  // sequences, skips), creates/reinforces insights, sweeps change vectors.
}

export interface ChangeVectorConfig {
  minSessionsObserved?: number;  // Default: 3 (matches prompt optimizer's canary)
}

export interface CurateResult {
  eventsProcessed: number;
  insightsCreated: number;
  insightsReinforced: number;
  capped: boolean;  // Time budget exhausted
  insightsChanged: boolean;  // Insights were created or reinforced
  changeVectorSweep: ChangeVectorSweepResult;  // NEW in Wave 2
}
```

**Call sites (Wave 2, read-only):**
- `packages/cairn/src/hooks/sessionStart.ts:68` — On first tool call of a session
- `packages/cairn/src/mcp/server.ts:327` — Via `run_curate` MCP tool

Both sites:
- Call `curate()` with optional `ChangeVectorConfig`
- Chain to `prescribe()` only when `result.insightsChanged` (insight generation triggers prescription generation, not prescriber optimization)
- Do **not** pass any orchestrator or prescriber implementations

### 1.2 Internal Flow & Vector Sweep

**Key internal call (post-insight-detection):**
```typescript
// curator.ts:210
const changeVectorSweep = sweepChangeVectors(changeVectorConfig);

// Returns:
interface ChangeVectorSweepResult {
  vectorsComputed: number;     // Total vectors swept
  skillsProcessed: number;     // Skills with applied hints that were scanned
  summariesGenerated: number;  // Non-empty summaries (vectorCount > 0)
  capped: boolean;             // Time budget exhausted during sweep
}
```

**Change vector computation entry point:**
```typescript
// cairn/src/db/changeVectors.ts
export function sweepChangeVectors(config?: ChangeVectorConfig): ChangeVectorSweepResult {
  // For each skill with applied hints:
  //   1. Query change_vectors table (Δ metrics from applied hints)
  //   2. Aggregate by category using summarizeChangeVectors()
  //   3. Return summaries grouped by skill
}

export function summarizeChangeVectors(
  db: Database,
  skillId: string,
  category: OptimizationCategory,
): ChangeVectorSummary {
  // Computes meanNetImpact, vectorCount, autoApplyEligible (Wave 2 new)
  // minVectors threshold is category-agnostic (default: 3)
}
```

### 1.3 Skills with Computed Vectors (New in Wave 3)

After `sweepChangeVectors()` completes, Curator knows which skills have **newly computed** vectors:
- Skills are identified by the set of skills returned from `sweepChangeVectors()` internal loop
- Each skill may have multiple categories with vectors (convergence, prompt-structure, etc.)

**Data flow for Wave 3 injection point:**
```typescript
// Proposed Wave 3 signature (backward compatible)
export function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrator?: PrescriberOrchestrationConfig,  // NEW
): CurateResult {
  // ... existing insight detection ...
  
  const changeVectorSweep = sweepChangeVectors(changeVectorConfig);
  
  // NEW: If orchestrator provided and vectors were computed, run prescribers
  if (prescriberOrchestrator && changeVectorSweep.skillsProcessed > 0) {
    await runPrescriberOptimizationForNewVectors(
      changeVectorSweep.skillIds,  // Which skills got vectors
      prescriberOrchestrator,
    );
  }
  
  return {
    // ... existing fields ...
    changeVectorSweep,
    prescribersRun?: prescriberOrchestrator?.skillsProcessed,  // NEW if provided
  };
}
```

---

## 2. Profile Selection Problem

### 2.1 The Decision Point

When Curator orchestration runs prescribers, which execution profiles should it invoke?

Three **independent** dimensions:

#### Dimension A: Trigger Set — Which skills?

| Option | Behavior | Observer perspective | Trade-off |
|--------|----------|----------------------|-----------|
| **Trigger-driven** | Run only skills that received new vector computations this cycle | "Fresh vectors = re-optimize" | Low latency, tight coupling to vector sweep results |
| **Global** | Run all skills with execution profiles after each `curate()` | "Every curation cycle prescribes for everything" | High coverage but unbounded cost; may re-prescribe unchanged skills |
| **Hybrid: explicit batch** | Run prescribers for a caller-specified skill list | "Operator controls scope per invocation" | Requires API expansion; good for targeted re-runs |

**Recommendation for Wave 3 v1:** **Trigger-driven** (only skills with new vectors). Rationale: matches the spec's observation model ("compute, don't block"), aligns with vector sweep's efficiency boundary. Wave 4 can expand to global batching.

#### Dimension B: Granularity Tier — Which profiles per skill?

| Option | Behavior | Observer perspective | Trade-off |
|--------|----------|----------------------|-----------|
| **Per-skill only** | Query `(granularity='per-skill', granularity_key='global')` | "Canonical aggregate per skill" | Matches Wave 2 CLI scope; narrow scope |
| **Per-skill + global tier** | Try per-skill first, fall back to `(granularity='global', granularity_key='global')` | "Per-skill data preferred; global fallback" | Broader coverage; matches CLI's existing fallback |
| **All tiers** (per-skill, per-model, per-user, global) | Query all granularities for a skill | "Maximum coverage" | Combinatorial explosion; prescriber cost O(profiles_per_skill); dedup complexity |

**Recommendation for Wave 3 v1:** **Per-skill only** (no fallback to global). Rationale: Vector computation is per-skill only (no per-user or per-model vector tracking). Prescribers operating on per-skill profiles have matched evidence; cross-granularity is a Wave 4 expansion.

#### Dimension C: Skip Conditions — When to **not** run?

| Condition | Behavior | Observer perspective |
|-----------|----------|----------------------|
| **No profile exists** | Skip (fail-silent) | "Skill with vectors but no profile → no optimization" |
| **Insufficient sessions** | Skip if `profile.sessionCount < minSessions` | "Profile too immature; skip this cycle" |
| **Stale profile** | Skip if `now() - profile.updatedAt > stalePeriod` | "Profile hasn't updated in N days; data may be stale" |
| **No active optimization hints** | Don't skip on this alone; let dedup decide | "Dedup is the gate, not pre-flight" |

**Recommendation for Wave 3 v1:** Skip when **no profile exists** or `sessionCount < minSessions` (default 3, inherited from `ChangeVectorConfig`). Stale-profile skipping is Wave 4 (requires staleness constant + UX design).

### 2.2 Wave 3 v1 Default Strategy

**Profile selection for Curator-driven prescriber orchestration:**
- **Trigger set:** Skills with newly computed vectors (output of `sweepChangeVectors()`)
- **Granularity:** Per-skill only; no fallback to global
- **Skip conditions:** Skip if no profile or `sessionCount < minSessions`
- **Expansion points:** Wave 4 can add global-tier fallback, explicit batch control, staleness checks

### 2.3 Operator Visibility

**Output change to `CurateResult` (Wave 3):**
```typescript
export interface CurateResult {
  // ... existing fields ...
  
  // NEW (if prescriberOrchestrator provided)
  prescribers?: {
    skillsProcessed: number;      // Skills selected for optimization
    skillsSkipped: number;         // Skipped (no profile, immature, etc.)
    hintsGenerated: number;        // Total hints from all skills
    hintsInserted: number;         // Persisted (post-dedup)
    hintsDeduplicated: number;     // Blocked by active-hint filter
    vectorCategoriesApplied: number;  // Category hints matched to vectors
    vectorCategoriesUnmatched: number;  // Hints with no vector data
  };
}
```

Operators see:
- How many skills ran (trigger set size)
- How many were skipped (and can infer why: immature, no profile)
- Hint volume post-dedup (signal of convergence)
- Coverage of vector application across categories

---

## 3. MCP Tool Shape — `run_prescriber_optimization`

### 3.1 Input Schema

**Tool name:** `run_prescriber_optimization`

**Minimal input (Wave 3 v1):**
```typescript
export interface RunPrescriberOptimizationInput {
  // Flavor A: Trigger-driven (recommended)
  // If omitted, runs for all skills with new vectors from current sweep
  
  // Optional: explicit skill list (Wave 4 expansion)
  skillIds?: string[];
  
  // Optional: force re-run even if hints were recently generated
  // (Allows retry after hint rejection)
  force?: boolean;
  
  // Optional: min sessions threshold override
  // (Operators can lower bar for exploratory runs)
  minSessions?: number;
}
```

**Simpler version (Wave 3 v1 MVP):**
```typescript
export interface RunPrescriberOptimizationInput {
  force?: boolean;  // If true, ignore dedup and regenerate hints
}
```

The MCP tool:
- Takes optional `force` flag
- Calls `curate()` with prescriberOrchestrator config
- Returns prescriber results (new hints + dedup stats)

### 3.2 Output Schema

```typescript
export interface RunPrescriberOptimizationOutput {
  success: boolean;
  skillsProcessed: number;
  skillsSkipped: number;
  
  details: {
    hintsGenerated: number;
    hintsInserted: number;
    hintsDeduplicated: number;
    hintErrors: number;
  };
  
  vectorApplicability: {
    categoriesMatched: number;
    categoriesUnmatched: number;
    averageConfidenceBoost: number;  // Across matched hints
  };
  
  nextSteps?: string;  // Human-readable guidance
  
  // DEBUG (optional, for operator analysis)
  skillsProcessedList?: {
    skillId: string;
    profileSource: string;
    hintsGenerated: number;
    vectorCategoriesApplied: string[];
  }[];
}
```

Example output (human terms):
```
run_prescriber_optimization(force=false)

Prescriber optimization complete.

Skills processed:
  - skill-alpha: 2 hints generated (convergence matched to +0.12 vector)
  - skill-beta: 1 hint generated (no vector data)

Deduplication:
  - 2 hints skipped (active duplicates)
  - 3 hints inserted

Vector application: 1/3 hints matched to historical vectors
  confidence amplified: convergence hint (boost +0.12)
  confidence unchanged: prompt-structure hint (no vector data)
  confidence attenuated: token-cache hint (matched to -0.35 vector, blocked from auto-apply)

Next steps: 2 hints pending manual review (marked as auto-apply ineligible).
```

### 3.3 Composition Root Conditional Registration (Roger's Options A–D)

The `run_prescriber_optimization` tool registration depends on **where** the runtime lives that can import both Cairn and Forge.

**Option A: New `@akubly/runtime` package**
- MCP server lives in new workspace package `packages/runtime` that imports both Cairn and Forge
- Tool registers in `packages/runtime/src/mcp/server.ts`
- Cairn's MCP server exports `getRunPrescriberOptimizationTool()` (delegation), calls into runtime package
- **Implication:** Cairn MCP becomes a facade; runtime hosts the real tools

**Option B: Modified `packages/cairn/src/mcp/server.ts` with optional Forge import**
- Cairn's MCP server conditionally imports Forge if available
- Tool registers only if Forge is installed (optional peer dependency)
- `package.json`: `"@akubly/forge": { "optional": true }`
- **Implication:** Tight coupling; Cairn pays Forge's build cost; two packages in one MCP server

**Option C: Standalone `packages/runtime-cli/` as composition root for both tools**
- Extend runtime-cli to host an MCP server (not just CLI)
- `packages/runtime-cli/src/mcp/server.ts` registers both Cairn tools (delegated) and Forge tools
- Cairn and Forge remain CLI-only; runtime-cli is the unified MCP entry point
- **Implication:** Third workspace package; unified server, but no longer specialized per domain

**Option D: Separate `@akubly/prescriber-optimizer` package (specialist package)**
- New thin package that imports both Cairn (profiles, hints) and Forge (prescriber logic)
- Exports `PrescriberOptimizer` interface + MCP tool registration helper
- Cairn/Forge MCP servers conditionally wire it if installed
- **Implication:** Clean separation; minimal coupling; Cairn/Forge remain independent

### 3.4 Tool Registration Pseudo-code (All Options Converge)

```typescript
// Pseudocode: tool registration pattern across options
export interface PrescriberOptimizationToolContext {
  curator: typeof curate;  // From Cairn
  orchestrator: typeof runForgePrescribers;  // From Forge
  profileLoader: (skillId: string) => ExecutionProfile | null;
  vectorProvider: ChangeVectorProvider;
  hintPersister: (hints: OptimizationHint[]) => { inserted: number; skipped: number };
}

server.registerTool(
  'run_prescriber_optimization',
  {
    title: 'Run Prescriber Optimization',
    description: 'Trigger Curator-driven prescriber orchestration for skills with new vector computations. Generates, deduplicates, and persists optimization hints.',
    inputSchema: {
      force: { type: 'boolean', description: 'Ignore dedup and regenerate' },
    },
    annotations: { readOnlyHint: false },
  },
  async (input: RunPrescriberOptimizationInput) => {
    // Common implementation, regardless of hosting location
    try {
      const result = await runPrescriberOptimizationForNewVectors({
        force: input.force,
        minSessions: input.minSessions ?? DEFAULT_MIN_SESSIONS,
      });
      return formatToolOutput(result);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
);
```

---

## 4. Curator Config Surface — API Change

### 4.1 Minimal Signature Addition (Backward Compatible)

**Current signature (Wave 2 end state):**
```typescript
export function curate(changeVectorConfig?: ChangeVectorConfig): CurateResult {
  // ...
}
```

**Wave 3 v1 signature (proposed):**
```typescript
export interface PrescriberOrchestrationConfig {
  /**
   * Function to run prescribers for a given skill.
   * Signature: (skillId, minSessions) => Promise<{ inserted, skipped, generated }>
   */
  runForSkill: (skillId: string, minSessions: number) => Promise<PrescriberRunResult>;
  
  /**
   * Optional: Load execution profile for a skill.
   * If not provided, internal fallback loads profile from Cairn DB.
   * Allows callers to override (e.g., synthetic profiles for testing).
   */
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}

export interface PrescriberRunResult {
  skillId: string;
  hintsGenerated: number;
  hintsInserted: number;
  hintsDuplicated: number;
  hintsError: number;
}

export function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
): CurateResult {
  // ... existing insight/pattern detection ...
  
  const changeVectorSweep = sweepChangeVectors(changeVectorConfig);
  
  // NEW: Optional prescriber orchestration
  let prescribersRun: { [skillId: string]: PrescriberRunResult } | undefined;
  if (prescriberOrchestrationConfig && changeVectorSweep.skillsProcessed > 0) {
    prescribersRun = {};
    for (const skillId of changeVectorSweep.skillIds) {
      const profile = prescriberOrchestrationConfig.loadProfile
        ? prescriberOrchestrationConfig.loadProfile(skillId)
        : getExecutionProfile(skillId, 'per-skill', 'global');
      
      if (!profile || profile.sessionCount < minSessions) {
        continue;  // Skip
      }
      
      try {
        prescribersRun[skillId] = await prescriberOrchestrationConfig.runForSkill(
          skillId,
          changeVectorConfig?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS,
        );
      } catch (err) {
        // Log, continue (fail-open)
      }
    }
  }
  
  return {
    eventsProcessed: totalProcessed,
    insightsCreated: totalCreated,
    insightsReinforced: totalReinforced,
    capped: false,
    insightsChanged: totalCreated > 0 || totalReinforced > 0,
    changeVectorSweep,
    prescribersRun,  // NEW
  };
}
```

### 4.2 Composition Root Responsibility

The **composition root** is responsible for constructing `PrescriberOrchestrationConfig`:

```typescript
// Pseudocode: in runtime/cli/mcp server (location TBD by composition root ADR)
const prescriberOrchestrationConfig: PrescriberOrchestrationConfig = {
  runForSkill: async (skillId: string, minSessions: number) => {
    // Query profile, run orchestrator, persist, return metrics
    const profile = getExecutionProfile(skillId, 'per-skill', 'global');
    if (!profile || profile.sessionCount < minSessions) {
      return { skillId, hintsGenerated: 0, hintsInserted: 0, ... };
    }
    
    const provider = new SqliteChangeVectorProvider(getDb());
    const hints = await runForgePrescribers(profile, skillId, { provider });
    
    // Persist with dedup
    let inserted = 0, duplicated = 0, errored = 0;
    for (const hint of hints) {
      const result = insertHintIfNew(getDb(), hint);
      if (result.inserted) inserted++;
      else duplicated++;
    }
    
    return {
      skillId,
      hintsGenerated: hints.length,
      hintsInserted: inserted,
      hintsDuplicated: duplicated,
      hintsError: errored,
    };
  },
  
  // Optionally override profile loading (for testing or custom sources)
  loadProfile: undefined,  // Use default (Cairn DB)
};

// Call curate with orchestration enabled
curate(
  { minSessionsObserved: 3 },
  prescriberOrchestrationConfig,
);
```

### 4.3 Backward Compatibility

- **Existing call sites** (sessionStart hook, MCP `run_curate` tool) pass no orchestration config → behavior unchanged (insights detected, vectors swept, no prescriber invocation)
- **Wave 3 callers** (Curator-driven MCP tool, or new orchestration entry point) pass config → prescribers run for qualifying skills
- No breaking changes to `CurateResult` — new field `prescribersRun` is optional

---

## 5. Open Questions for Composition Root ADR (Graham)

### 5.1 **Architectural Decision: Where Does the Runtime Live?**

The composition root that imports both Cairn and Forge must be decided before Wave 3 implementation begins.

**Roger's four options (A–D from parallel track):**

| Option | Structure | Impact on Wave 3 |
|--------|-----------|------------------|
| **A: New `@akubly/runtime` package** | New workspace; hosts shared runtime logic; MCP server lives here | Curator integration clean; new package boundary; MCP registration straightforward |
| **B: Optional Forge import in Cairn MCP** | Cairn MCP conditionally imports Forge if available | Simpler (no new package) but couples Cairn to Forge build; tool registration must handle "optional" case |
| **C: Extend `packages/runtime-cli` to host MCP** | CLI package becomes dual-mode (CLI + MCP server) | Unified server, but runtime-cli becomes less specialized; may complicate deployment |
| **D: New specialist `@akubly/prescriber-optimizer`** | Thin new package; imports both Cairn/Forge; exported interfaces for MCP registration | Clean separation; allows Cairn/Forge to remain independent; tool registration via optional helper |

**Wave 3 work is blocked on this choice.** Once decided:
- Tool registration location is determined
- Package import boundaries are locked
- Curator integration signature is finalized
- MCP server startup configuration is clear

### 5.2 **Curator Invocation Context: Hook vs. Standalone?**

Should Curator-driven prescriber orchestration run:

| Context | Trigger | Implication |
|---------|---------|-------------|
| **Hook integration** | Curator runs as part of existing sessionStart hook; prescribers auto-trigger if vectors sweep yields results | Always-on; may prescribe unexpectedly on session startup; UX complexity around notification |
| **Standalone MCP tool** | Separate `run_prescriber_optimization` tool; operator invokes explicitly | Predictable; opt-in; operators control timing and batch scope; harder to discover (UX burden) |
| **Hybrid: both** | Curator hook has _optional_ prescriber orchestration; MCP tool exposes manual trigger | Allows both automatic and manual; more code paths to test |

**Recommendation:** Hybrid (both). Rationale: Curator hook is automatic, respecting the "observe, don't block" pattern; MCP tool allows operators to trigger on-demand for urgent optimizations.

### 5.3 **Profile Selection: Trigger-Driven or Broader?**

Wave 3 v1 scope assumes **trigger-driven** (only skills with new vectors). Should Wave 3 v1 or Wave 4 support:

| Expansion | Cost | Benefit |
|-----------|------|---------|
| **Explicit skill list via MCP input** | Low (already designed in 3.1) | Operators can re-optimize specific skills |
| **Global tier fallback** | Medium (type changes, dedup reconsideration) | Broader coverage for skills without per-skill profile |
| **All granularities (per-user, per-model, etc.)** | High (combinatorial dedup, prescriber cost) | Maximum coverage but unclear if valuable |
| **Staleness check** (skip profiles unchanged for N days) | Low (constant + timestamp check) | Filters re-runs on stale profiles; prevents thrashing |

**Recommendation for Wave 3 v1:** Ship trigger-driven only. Wave 4 scope can add explicit skill list + staleness check. Global-tier fallback is Wave 5 (requires category matching across granularities).

### 5.4 **MCP Server Startup: How Is Prescriber Orchestrator Injected?**

If the MCP server registers `run_prescriber_optimization`, how does it obtain the `PrescriberOrchestrationConfig`?

**Option A (eager initialization):**
```typescript
// server.ts startup
const orchestrator = new PrescriberOrchestrator(getDb(), sqliteProvider);
server.registerTool('run_prescriber_optimization', orchestrator);
```
Cost: Runtime initialization; fail-fast on missing packages.

**Option B (lazy initialization):**
```typescript
// server.ts startup
server.registerTool('run_prescriber_optimization', async (input) => {
  // On first tool call, construct orchestrator (import Forge on-demand)
  const Forge = await import('@akubly/forge').catch(() => null);
  if (!Forge) return { error: 'Forge not installed' };
  // ...
});
```
Cost: First-call latency; clearer optional dependency; works if Forge is missing.

**Recommendation:** Option A (eager). Wave 3 development assumes both Cairn and Forge are co-deployed. Optional dependency can be added in Wave 5 if needed.

### 5.5 **Persistence & Idempotence: Force-Regenerate Behavior**

When an operator calls `run_prescriber_optimization(force=true)`, should:

| Behavior | Implication |
|----------|-------------|
| **Skip dedup entirely** | Regenerate hints even if `pending`/`accepted` hints exist for same category | Allows retry after accidental rejection; may double-represent recommendations |
| **Update existing active hints** | Find existing active hint with same `(skillId, source, category)`, update metadata | Cleaner audit trail; loses insertion timestamp; conflicts with current hint CRUD model |
| **Delete existing hints first, then insert** | Purge active hints for the skill, run prescribers, insert fresh | Clean slate; loses operator feedback (e.g., "I rejected this"); matches current lifecycle |

**Recommendation:** Skip dedup (current design). Rationale: Matches Wave 2 intent — hints are immutable once inserted; lifecycle (accept/reject/defer/expire) is how operators control repetition. Force flag is rare and advisory only.

### 5.6 **Observable Metrics: What Should Operators Track?**

Curator-driven invocation will eventually need monitoring/alerting. Propose metrics to expose:

| Metric | Purpose |
|--------|---------|
| `prescriber_runs_total` | Total invocations (includes force, auto) |
| `prescriber_skills_processed` | Skills selected in trigger set |
| `prescriber_skills_skipped` | Skills with no profile or immature sessionCount |
| `prescriber_hints_generated` | Total hints from all prescribers |
| `prescriber_hints_inserted` | Hints persisted (post-dedup) |
| `prescriber_hints_deduplicated` | Blocked by active-hint filter |
| `prescriber_vector_categories_matched` | Categories with historical vectors |
| `prescriber_categories_attenuated` | Negative-impact gates triggered |
| `prescriber_orchestrator_error_rate` | Provider/prescriber failures (fail-open count) |

**Proposal:** Expose via structured `prescriber` field in `CurateResult` and MCP tool output. Operators can extract for monitoring.

---

## 6. Implementation Sequencing (Proposed)

Assuming composition root ADR resolves by end of Wave 3 kickoff:

1. **Week 1:** ADR decision → Option (A–D) chosen + documented
2. **Week 1–2:** Update Curator signature + `CurateResult` type
3. **Week 2:** Composition root scaffolding (new package or modified import)
4. **Week 2–3:** MCP tool registration in chosen location
5. **Week 3:** Integration tests (Curator + MCP end-to-end)
6. **Week 3:** Documentation + operator runbook

**Critical path:** Composition root decision → type signatures → MCP registration.

---

## 7. Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Composition root decision blocked | Agree to default (Option A: new runtime package) if consensus stalls; can refactor in Wave 5 |
| MCP server process bloated | Composition root package is thin; real logic stays in Cairn/Forge. MCP just orchestrates and wires. |
| Curator prescriber loop creates infinite hints | Dedup gates all but first run; applier's `autoApplyEligible` prevents thrashing; force flag is rare |
| Profile immature during vector computation | Skip condition (`sessionCount < minSessions`) built in; no run = no hints generated |
| Vector data stale (weeks old) | Wave 4 feature (staleness check) can filter; Wave 3 v1 runs on all vectors (maturity >= 3) |

---

## 8. Conclusion & ADR Input

**For Graham's composition root ADR:**

1. **Curator integration is mechanical** once composition root chosen. Signature change is minimal and backward compatible.
2. **Profile selection strategy** (trigger-driven, per-skill only, skip on no-profile/immature) is sound for Wave 3 v1; wave 4 can expand.
3. **MCP tool shape** converges across all composition options; registration site varies.
4. **Open blockers:**
   - Where does runtime live? (Affects package structure, test isolation, deployment)
   - Curator hook vs. MCP tool vs. both? (Affects invocation model and discoverability)
   - Eager vs. lazy Forge import? (Affects startup cost and optional dependency handling)

**Next step:** Resolve composition root decision. Once locked, Wave 3 implementation begins.

---

*Report completed by Alexander 2026-05-22. Ready for ADR discussion with Graham and team.*
