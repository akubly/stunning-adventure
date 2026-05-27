# Decision: W5-6 forge-metrics CLI Implementation

**Date:** 2026-05-26  
**Author:** Roger (Platform Dev)  
**Status:** Implemented — commit `042546d` on `phase-4.6/w5-6-forge-metrics-cli`

---

## Command Signature

```
forge-metrics --skill <skill_id> [--format json|table] [--repo-key <key>] [--db <path>]
```

| Flag | Required | Default | Notes |
|------|----------|---------|-------|
| `--skill` | ✅ | — | Skill ID to report |
| `--format` | No | `json` | `json` or `table` |
| `--repo-key` | No | most-recent user session | Fallback via `getMostRecentUserSession()` |
| `--db` | No | `getKnowledgeDbPath()` | Override SQLite path |

---

## JSON Schema (SkillMetrics — stable contract)

```typescript
interface SkillMetrics {
  skillId: string;
  repoKey: string | null;
  queriedAt: string;                // ISO-8601
  profile: SkillMetricsProfile;     // discriminated union: {found:true,...} | {found:false}
  staleness: SkillMetricsStaleness | null;
  confidence: SkillMetricsConfidence | null;
  autoApplyEligible: boolean | null;
  recentPrescriberRuns: SkillMetricsPrescriberRun[] | null;
}

type SkillMetricsProfile =
  | { found: true; tier: string; sessionCount: number; updatedAt: string; daysSinceUpdate: number }
  | { found: false };

interface SkillMetricsStaleness {
  stale: boolean;
  reason: 'count' | 'age' | 'count+age' | null;
  sessionsSinceUpdate: number;
}

interface SkillMetricsConfidence {
  raw: number;        // Always 1.0 for DB profiles
  attenuated: number; // raw * 0.5 when stale, else raw
  isAttenuated: boolean;
}
```

**Schema stability contract:** fields are additive; removals require a major version bump.

---

## Table Format

Sections: Identity → Profile → Staleness → Confidence → Auto-Apply → Recent Prescriber Runs.  
One key-value row per metric. Width: 32-char label column + value column.

---

## W5-5 Graceful Degradation

`recentPrescriberRuns` has three states:
- `null` — `prescriber_run` event type not present (W5-5 not landed)
- `[]` — event type exists but no runs recorded for this skill
- `[{...}]` — parsed run events, most-recent first, capped at 10 (default)

Implemented as a defensive `try/catch` around `json_extract(payload, '$.skillId')` query.

---

## W5-3 / W5-4 Integration Points

| Feature | How consumed |
|---------|-------------|
| W5-3 tier fallback | `loadExecutionProfile(db, skillId, { fallbackPolicy: 'full-chain' })` |
| W5-3 tier reporting | `loaded.source` field ('per-skill' \| 'per-model' \| 'per-user' \| 'global') |
| W5-4 staleness attenuation | `profile.staleness` (stale flag + reason) on returned profile |
| W5-4 attenuated confidence | `profile.confidence` on returned profile (0.5× if stale) |
| W5-2 explicit db | All DB calls thread explicit `db` handle |
| W5-1 session-kind | `getMostRecentUserSession()` for `--repo-key` fallback |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (even if no profile found — JSON output describes the state) |
| 2 | Argument error or runtime failure |

---

## Files

- `packages/runtime-cli/src/metrics/types.ts`
- `packages/runtime-cli/src/metrics/loadMetrics.ts`
- `packages/runtime-cli/src/metrics/formatters.ts`
- `packages/runtime-cli/src/forge-metrics.ts`
- `packages/runtime-cli/src/__tests__/forgeMetrics.test.ts` (13 tests)
- `packages/runtime-cli/package.json` (added `forge-metrics` bin entry)
