# W5-4 Profile Staleness Attenuation Drop

**Author:** Rosella  
**Date:** 2026-05-25  
**Work item:** W5-4 Profile staleness confidence attenuation

## Final Staleness Shape

Runtime-returned profiles now carry:

```typescript
staleness: {
  stale: boolean;
  reason: 'count' | 'age' | 'count+age' | null;
}
```

The same returned profile also carries an annotated `confidence` value. Fresh profiles default to `confidence: 1`; stale profiles are attenuated to `confidence * 0.5`.

## Threshold Defaults

- Count threshold: stale when `sessions_since_install - profile.sessionCount > 50`.
- Age threshold: stale when `now - profile.updatedAt > 7 days`.
- Either threshold trips staleness; both thresholds produce `reason: 'count+age'`.
- Attenuation factor: `0.5` exactly once, even when both thresholds trip.

## Composition with W5-3

W5-3 tier selection is unchanged: `per-skill` → optional `per-model` → optional `per-user` → `global`, first match wins. W5-4 runs only after that selection, preserves `LoadedExecutionProfile.source`, and annotates/scales only the selected `profile`.

## Test Counts

- `npm run build`: clean.
- `npm test --workspace=@akubly/skillsmith-runtime`: 24 passing tests; `profileFallback.test.ts` now has 16 tests covering fresh, count-only stale, age-only stale, both stale, custom option/clamping behavior, no-profile, and W5-3 staleness-does-not-fallback behavior.
- `npm test --workspace=@akubly/forge`: 644 passing, 3 todo.

## Deferred Follow-ups

- Persisting an explicit profile last-update session counter would make the count threshold semantically stronger. W5-4 avoids Cairn schema changes and uses the existing session counter/profile count relationship.
- No auto-refresh, notification surface, or Forge prescriber behavior changes were added; those remain future Curator/product work.
