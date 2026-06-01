## fix(runtime-cli): tighten 4 type unions (#25)

Wave 6 type-tightening polish — 4 items carried over from PR #24 cloud-review.

### Changes

| Item | Location | Before | After |
|------|----------|--------|-------|
| R6-T1 | orgeMetrics.test.ts:381 | stub omits ^[xitCode, skillId, dbPath, hints, 	otalPersisted | stub satisfies full ForgePrescribeSuccessResult contract |
| R6-T2 | metrics/types.ts:5 — SkillMetricsProfileInfo.tier | string | LoadedProfileSource ('per-skill' | 'per-model' | 'per-user' | 'global') |
| R6-T3 | metrics/types.ts:25 — SkillMetricsStaleness.reason | string \| null | 'count' \| 'age' \| 'count+age' \| null |
| R6-T4 | metrics/types.ts:43 — SkillMetricsPrescriberRun.profileSource | string \| null | LoadedProfileSource \| null |

R6-T1..T4 are **type-only tightenings** — no runtime behaviour change. The loadMetrics.ts JSON-parse annotation for profileSource was tightened in the same pass to keep the assignment type-safe without a cast.

**Source of truth for unions:**
- LoadedProfileSource — packages/skillsmith-runtime/src/runtime.ts:21
- ProfileStalenessReason — packages/types/src/index.ts:163

### Review cycles

| Cycle | Items addressed |
|-------|----------------|
| Cycle 1 | **F1** JSON.parse guard — per-row try/catch in queryPrescriberRuns so a single corrupt payload row does not abort the entire result; **F2** ProfileStalenessReason adoption — SkillMetricsStaleness.reason tightened from string \| null to the canonical union from @akubly/types |
| Cycle 2 | **C2-1** satisfies Record<LoadedProfileSource, true> drift guard — compile breaks if LoadedProfileSource grows without updating the allowed set; **C2-2** stderr warning on unknown non-empty profileSource strings (mirrors malformed-row pattern); **C2-3** unexport 
ormalizeProfileSource (Path A) — privacy is now real not aspirational, 3 unit tests on private helper removed; **C2-4** comment explaining intentional ReadonlySet<string> widening; **C2-5** this PR body update |

### Behavior changes

Cycle-2 introduces defensive runtime behavior in 
ormalizeProfileSource (packages/runtime-cli/src/metrics/loadMetrics.ts:39). Legacy or hand-edited database rows containing non-canonical profileSource strings are now coerced to 
ull instead of passed through verbatim. A stderr warning is emitted when coercion occurs, following the same pattern as other malformed-row detections.

### Acceptance checks

- [x] 	sc --build green (exit 0)
- [x] 
pm test --workspace=@akubly/runtime-cli green (26/26 tests)
- [x] R6-T1..T4 type-tightenings are type-only — no runtime behaviour change
- [x] Cycle-2 defensive coercion (
ormalizeProfileSource) changes how unrecognized profileSource values are surfaced: non-canonical strings now load as 
ull instead of passing through; stderr warning is emitted on coercion
- [x] VALID_PROFILE_SOURCES compile-guarded against LoadedProfileSource drift
- [x] 
ormalizeProfileSource unexported; coverage via integration tests
- [x] Closes #25

Refs: PR #24
