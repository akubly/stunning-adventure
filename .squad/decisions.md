# Imprint Slice — Persona Review Cycle 1 Fix Dispositions

**Author:** Crispin (Knowledge Representation Specialist)  
**Date:** 2026-06-18T00:03:54-07:00  
**Status:** APPLIED (fixes committed on `eureka/imprint-slice`)  
**Scope:** Review findings from persona panel on the imprint GREEN phase

---

## Accepted & Fixed (Important)

### F1 — `INSERT OR IGNORE` → `ON CONFLICT(fact_id, session_id) DO NOTHING`

**File:** `src/storage/fact-writer-sqlite.ts`  
**Problem:** `OR IGNORE` suppresses ALL constraint violations, silently dropping rows that violate CHECK or NOT NULL — not just duplicate-key retries.  
**Fix:** Changed to `INSERT INTO ... ON CONFLICT(fact_id, session_id) DO NOTHING`. Only the UNIQUE constraint violation is suppressed; CHECK/NOT NULL violations still throw.

### F2 — `ClockProvider` extracted to neutral module

**Files:** `src/activities/clock.ts` (NEW), `src/activities/recall.ts`, `src/activities/imprint.ts`  
**Problem:** `imprint.ts` imported `ClockProvider` from `recall.ts`, coupling the write path to the read path.  
**Fix:** Created `src/activities/clock.ts` as the single source of truth. Both `recall.ts` and `imprint.ts` import from `clock.ts`. `recall.ts` re-exports `ClockProvider` for backward compatibility — existing consumers importing from `recall.ts` or `src/index.ts` are unaffected. Zero behavior change.

### F3 — Datetime conversion extracted to shared helper

**File:** `src/storage/datetime.ts` (NEW)  
**Problem:** `new Date(ms).toISOString().replace('T',' ').replace('Z','').slice(0,19)` duplicated verbatim in both writer files.  
**Fix:** Extracted `epochMsToSqliteDateTime(ms): string`. Both `InMemoryFactWriter` and `SqliteFactWriter` import from it. Self-documents the SQLite TEXT-affinity format contract.

### F4 — `InMemoryFactWriter.search()` validation alignment

**Investigation:** The Skeptic flagged missing `minTrust` validation. The existing `InMemoryFactStore` (in `fact-store.contract.test.ts`) is a test-file-local closure, not an importable class. Creating a separate importable `InMemoryFactStore` and composing it into `InMemoryFactWriter` would add a new exported class, a new file, and coupling between two test-support implementations — strictly more moving parts than keeping the search() inline.

**Decision:** Keep the inline `search()` (lower duplication option) but align its validation with the FactStore contract:
- Added `minTrust` validation (finite, [0,1]) — mirrors `SqliteFactStore` and the `InMemoryFactStore` reference impl.
- Fixed `Math.min(...termCounts)` / `Math.max(...termCounts)` on empty page (returns ±Infinity) — added guard: `termCounts.length > 0 ? Math.min(…) : 0`.
- Added module-level comment noting this search() must stay aligned with the reference impl.

### F5 — `FactId` non-empty runtime guard

**File:** `src/activities/imprint.ts`  
**Fix:** After `idProvider.next()`, added: if the returned id is empty or blank, throw `InvalidImprintError('factId', value, ...)`. No UUID-format validation (IM-2 injects `'test-uuid-001'` which is intentionally non-UUID).

## Accepted & Fixed (Minor)

### F6 — `content.trim()` computed once

**File:** `src/activities/imprint.ts`  
**Fix:** `const trimmed = options.content.trim()` computed once, used in both validation and the write payload.

### F7 — Merged duplicate `import type` lines

**File:** `src/sqlite/deps.ts`  
**Fix:** Two `import type { ... } from '../activities/imprint.js'` lines merged into one.

### F8 — IM-10 missing `-Infinity`

**File:** `src/storage/__tests__/fact-writer-contract.helper.ts`  
**Fix:** Added `-Infinity` to the IM-10 `it.each` array. Updated `×4` → `×5` in comments. Updated test count 24 → 25 in helper and both wiring files.

---

## Rejected (with reasoning)

### F9 — Propagate `FactId` branding to `FactReader`/`TrustUpdater` seams

**Reason:** Out of scope for the imprint slice. Touching recall/feedback seams would expand the blast radius into tested, stable code. `FactId` is a branded type specific to the write path today. Propagating it to read seams (`FactReader.read()`, `TrustUpdater.mutate()`) is a candidate for the `integrate` cycle, where the full fact lifecycle (write → read → mutate) will be unified.

### F10 — Runtime null/undefined guard on `content`

**Reason:** Consistency with existing activity patterns. `recall.ts` and `applyFeedback()` trust TypeScript's structural types and do not add runtime `typeof` guards on their inputs. Adding one only in `imprint` would create an inconsistency — either all activities guard or none do. The TS-only contract is the current convention.

---

## Test Results

- **Before:** 256 tests (208 pre-existing + 48 imprint)
- **After:** 258 tests (208 pre-existing + 50 imprint — IM-10 gained 1 case × 2 wirings)
- **tsc --build:** Clean
