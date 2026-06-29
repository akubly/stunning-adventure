# SKILL: TTL Date-Rot Diagnosis

**Skill ID:** `ttl-date-rot-diagnosis`  
**Owner:** Gabriel  
**Created:** 2026-06-27T22:38:17.318-07:00  
**Domain:** Test debugging / Infrastructure

---

## Problem

Tests that insert rows with **hardcoded `collectedAt` / timestamp dates** into tables that have a **TTL sweep** will silently break as calendar time advances past the TTL window. The failures look like a regression in the production pipeline (e.g., "buildProfiles produces 0 results") but are actually stale test data.

**Signature of this failure:**
- Tests that _seeded_ rows with hardcoded dates are failing.
- Sibling tests in the same describe group with no seeded data (or with `new Date()` dates) pass.
- The failing assertion is "expected 0 to be greater than 0" on a count/profile metric — not a crash or type error.
- The production code reads from a table that has a TTL sweep running before the read path.

---

## Diagnosis Procedure

1. **Identify the sweep:** Search the production code for the TTL/sweep call chain. In cairn:
   ```
   sweepSignalSamples(db, cutoffIso)   // deletes rows WHERE collected_at < cutoffIso
   ```
   `cutoffIso = new Date(Date.now() - TTL_MS).toISOString()`

2. **Check the test's seeded dates against the TTL:**
   ```
   hardcoded date: '2026-06-11 00:00:00'
   TTL: 7 days
   today: 2026-06-27
   age: 16 days > 7 day TTL → SWEPT
   ```

3. **Anti-anchoring check:** Before concluding "stale dates," verify the sweep _actually fires_ before the read path:
   - Find the order of calls in the production entry point (`curate()` etc.).
   - Confirm sweep runs before the failing step (build, read, aggregate).
   - If sweep runs _after_, the failure is a different root cause.

4. **Distinguish from production regression:**
   | Evidence of date-rot | Evidence of production regression |
   |----------------------|-----------------------------------|
   | Sibling tests with `new Date()` dates pass | Sibling tests with live dates also fail |
   | Failure is "expected N to be > 0" (empty result) | Failure is a crash, type error, or wrong count |
   | Only tests with hardcoded old dates fail | All tests that exercise the same code path fail |

---

## Fix Pattern

**Wrong (hardcoded, rots over time):**
```ts
insertSignalSamples(db, [
  { kind: 'drift', sessionId, skillId: 'skill-a', value: 0.5, collectedAt: '2026-06-11 00:00:00' },
]);
```

**Correct (dynamic, always within TTL):**
```ts
const now = Date.now();
insertSignalSamples(db, [
  { kind: 'drift', sessionId, skillId: 'skill-a', value: 0.5, collectedAt: new Date(now - 60_000).toISOString() },
]);
```

**Rule of thumb:**
- Use `new Date(Date.now() - N).toISOString()` for rows that **must survive** the TTL sweep.
- Use an explicit far-past date (e.g. `'2020-01-01T00:00:00.000Z'`) **only** when the test's intent is to have the sweep remove the row.

---

## String Comparison Note (cairn SQLite)

cairn's TTL sweep uses a raw SQL string comparison:
```sql
DELETE FROM signal_samples WHERE collected_at < ?
```
where `?` is an ISO 8601 string like `'2026-06-20T22:00:00.000Z'`.

SQLite compares strings lexicographically. The TTL sweep is only correct when `collected_at` and the cutoff string use the **same sortable ISO 8601 format**. A space separator (`'2026-06-11 00:00:00'`) sorts *before* `'T'` in ASCII, so a space-separated row and a `T`-separated cutoff of the same nominal timestamp will mis-order — the row may be swept unexpectedly or spared when it should be deleted. Always store `collected_at` using `new Date().toISOString()` (with `T` and `Z`) to match the format produced by `new Date(...).toISOString()` in the sweep's cutoff; or normalize both sides in SQL (e.g. `REPLACE(collected_at, ' ', 'T')`) if legacy data exists.

---

## Instances Fixed

- **Issue #83** — `packages/cairn/src/__tests__/curator.test.ts`, 4 occurrences fixed: 3 failing tests in "profile build inside curate()" group (hardcoded June 11 dates, 2026-06-27) + 1 silently-passing sibling (`BuildResult carries durationMs`, hardcoded June 12 date, 2026-06-28). The sibling also received a structural `profilesBuilt > 0` assertion to prevent future empty-path false-passes.
