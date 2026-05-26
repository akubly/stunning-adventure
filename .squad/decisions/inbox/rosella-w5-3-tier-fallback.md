# W5-3 Tier Fallback Implementation Drop

**Author:** Rosella  
**Date:** 2026-05-25  
**Work item:** W5-3 Global tier fallback for profile selection

## Final API Surface

```typescript
export interface TierFallbackContext {
  modelId?: string;
  userId?: string;
}
```

`loadExecutionProfile(db, skillId, fallbackContext?)` is exported from `@akubly/skillsmith-runtime` and returns `LoadedExecutionProfile | null`.

## Source Field Enum

```typescript
export type LoadedProfileSource = 'per-skill' | 'per-model' | 'per-user' | 'global';
```

The selected source is carried on `LoadedExecutionProfile.source` and propagated to `runForgePrescribe()` as `profileSource`.

## Chain-Walking Algorithm

1. Always query `per-skill` with `granularity_key = 'global'` first.
2. If `modelId` is present, query `per-model` with that model id.
3. If `userId` is present, query `per-user` with that user id.
4. Always query `global` with `granularity_key = 'global'` last.
5. Return the first non-null row as a full `ExecutionProfile`; do not blend tiers.
6. Missing identity keys skip their tiers. Staleness is intentionally ignored by selection so W5-4 can attenuate the selected profile after this step.

## Test Counts

- `npm test --workspace=@akubly/skillsmith-runtime`: 18 passing tests, including 10 tier-fallback tests.
- `npm test --workspace=@akubly/forge`: 644 passing, 3 todo.
- `npm test --workspace=@akubly/runtime-cli`: 9 passing.
- `npm run build`: clean.

## Scope Notes

No Cairn schema, migration, or Forge prescriber changes were required for W5-3.
