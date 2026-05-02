# Alexander — History

## 2026-05-01: Finding 8 — FeedbackSource.getProfile granularityKey

**Problem:** `FeedbackSource.getProfile(skillId, granularity?)` couldn't address per-user / per-model profiles. The DB key on `execution_profiles` is `(skill_id, granularity, granularity_key)`, so the contract was strictly less expressive than the storage.

**Fix:** Added optional `granularityKey?: string` third parameter to `FeedbackSource.getProfile` in `packages/types/src/index.ts`. Expanded JSDoc to document the composite key, the per-tier semantics (user id for per-user, model id for per-model, defaults to 'global' otherwise), and that the key is required to address non-global profiles.

**Companion functions reviewed, left alone (with rationale in JSDoc):**
- `getPendingHints`: `optimization_hints` table is keyed only on `id` with `skill_id` index — no granularity column. Adding granularity to the contract would have been speculative.
- `getStrategyParameters`: no DB backing exists yet; type is open-shaped. Granularity dimensions aren't modeled in the contract.

**CRUD module check:** `packages/cairn/src/db/executionProfiles.ts` `getExecutionProfile(skillId, granularity, granularityKey='global')` already satisfies the new interface — no change needed.

**Verification:** `npm run build` clean; `npm test` 512/512 passing across all packages. No call sites needed to change (the parameter is optional and additive).

**Lesson:** When a shared contract is strictly less expressive than its storage, treat it as a contract bug, not a feature gap — additive optional parameters carry near-zero risk and unblock real use cases.


## 2026-05-02: Phase 4.5 Persona Review — SDK Feedback Integration

**Finding Fixed:** F8 (granularityKey in FeedbackSource.getProfile).

**Key Output:**
- FeedbackSource.getProfile(profileId, granularityKey) enables signal-level profile filtering
- Integrates with Roger's per-signal ExecutionProfile.signals and Rosella's prescriber signal targeting

**Integration:** Feedback loop can now query specific signal data, enabling closed-loop tuning per drift driver.


