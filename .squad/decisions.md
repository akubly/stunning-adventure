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

---

## 2026-06-16 — FR-4 Vocabulary Amendment

**Status:** DECIDED  
**Date:** 2026-06-16T23:03:18-07:00  
**Author:** Genesta (Cognitive Systems Lead)  
**Approved by:** Aaron (akubly)

The FR-4 locked activity vocabulary is amended:

**Before (v5-final):**
> `integrate, recall, rerank, decide, commit, retire, evict` in v1.

**After:**
> `imprint, integrate, recall, rerank, decide, commit, retire, evict` in v1.

### Definitions

| Verb | Category | Semantics |
|------|----------|-----------|
| **`imprint`** | Storage (leaf write) | Raw fact creation. Mechanical write to durable storage with input validation and defaults. No contextual processing, no dedup, no reconciliation. Idempotent on `(factId, sessionId)`. |
| **`integrate`** | Cognitive (orchestration) | Contextual processing. Queries existing knowledge via `recall`, classifies input (novel/duplicate/contradiction), reconciles (trust-averaging, edge creation, conflict resolution). Calls `imprint` internally for net-new facts. |

**Rationale:** Aaron identified a verb conflation in the PRD v5 §10: `integrate` bundled two distinct responsibilities (raw fact creation + reconciliation-against-context) into one verb. The split corrects this by making `imprint` the mechanical write and `integrate` the cognitive orchestration. This aligns with the principle: "Activities are runtime verbs, not storage nouns."

---

## 2026-06-16 — `imprint` Activity Contract

**Status:** DECIDED  
**Date:** 2026-06-16T23:08:20-07:00  
**Author:** Genesta (Cognitive Systems Lead)  
**Approved by:** Aaron (akubly)

### FactWriter Seam Interface

Location: `src/activities/imprint.ts`

```typescript
export interface FactWriter {
  write(args: {
    factId: FactId;
    sessionId: SessionId;
    content: string;
    trust: number;
    importance: number;
    attentionTier: AttentionTier;
    createdAt: number;
  }): Promise<void>;
}
```

**Contract guarantees:**
- `write()` MUST persist durably before resolving.
- `write()` MUST be idempotent on `(factId, sessionId)`: re-writing with same content is no-op; re-writing with different content is no-op (first-write-wins).
- `write()` MUST scope state by sessionId.
- `write()` receives fully-validated, defaulted values; does NOT perform input validation.
- `write()` sets `last_accessed` to NULL (never accessed yet).

### ImprintOptions & ImprintDeps Types

**ImprintOptions:**
```typescript
export interface ImprintOptions {
  content: string;                    // Required: must be non-empty after trim
  sessionId: SessionId;               // Required: session scope
  trust?: number;                     // Optional, default 0.5; ∈ [0, 1]
  importance?: number;                // Optional, default 0; ∈ [0, 1]
  attentionTier?: AttentionTier;      // Optional, default 'warm'
}
```

**ImprintDeps:**
```typescript
export interface ImprintDeps {
  factWriter: FactWriter;
  clock: ClockProvider;
  idProvider: IdProvider;
}
```

### Activity Function — `imprint()`

```typescript
export async function imprint(
  options: ImprintOptions,
  deps: ImprintDeps,
): Promise<FactId>;
```

**Validation order (all checks fire synchronously before first `await`):**
1. `content`: must be non-empty after `.trim()` → `InvalidImprintError(field:'content')`
2. `trust`: must be finite AND ∈ [0, 1] → `InvalidImprintError(field:'trust')`
3. `importance`: must be finite AND ∈ [0, 1] → `InvalidImprintError(field:'importance')`
4. `attentionTier`: must be 'hot'|'warm'|'cold' → `InvalidImprintError(field:'attentionTier')`

**After validation:**
- Generate `factId` via `idProvider.next()`
- Read timestamp via `clock.now()`
- Apply defaults for omitted optional fields
- Call `factWriter.write({ factId, sessionId, content: content.trim(), trust, importance, attentionTier, createdAt })`
- Return `factId`

**Defaults:**
- `trust`: 0.5 (neutral)
- `importance`: 0 (unscored)
- `attentionTier`: 'warm'
- `lastAccessed`: NULL (never accessed)

### Contract Assertions (IM-1 through IM-14)

Shared suite: `runFactWriterContract(implName, makeHarness)` in `src/storage/__tests__/fact-writer-contract.helper.ts`.

1. **IM-1** — Happy path: imprint resolves with a FactId
2. **IM-2** — Returned FactId matches IdProvider output
3. **IM-3** — Default trust is 0.5
4. **IM-4** — Default importance is 0
5. **IM-5** — Default attentionTier is 'warm'
6. **IM-6** — Custom values stored verbatim
7. **IM-7** — Empty content throws InvalidImprintError
8. **IM-8** — Whitespace-only content throws InvalidImprintError
9. **IM-9** — Out-of-range trust throws InvalidImprintError (parameterized: 1.5, -0.1, NaN, Infinity, -Infinity)
10. **IM-10** — Out-of-range importance throws InvalidImprintError (parameterized: 2.0, -0.5, NaN, Infinity)
11. **IM-11** — Invalid attentionTier throws InvalidImprintError (parameterized: 'lukewarm', 'HOT', '', 'freeze')
12. **IM-12** — Session isolation: fact in sessionA not visible to sessionB reads
13. **IM-13** — Idempotent re-write (same factId + sessionId); first-write-wins
14. **IM-14** — Round-trip with recall: imprinted fact appears in `FactStore.search()` with correct defaults

### Error Type

Appended to `src/activities/errors.ts`:

```typescript
export class InvalidImprintError extends Error {
  readonly code = 'INVALID_IMPRINT' as const;
  readonly field: string;
  readonly value: unknown;

  constructor(field: string, value: unknown, message: string) {
    super(message);
    this.name = 'InvalidImprintError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

### Factory Function (SQLite Deps)

Appended to `src/sqlite/deps.ts`:

```typescript
export function createSqliteImprintDeps(db: Database.Database): ImprintDeps {
  return {
    factWriter: new SqliteFactWriter(db),
    clock: { now: (): number => Date.now() },
    idProvider: { next: (): FactId => crypto.randomUUID() as FactId },
  };
}
```

### Scope-Out

The following are NOT part of `imprint`:
- Querying existing facts before write (recall-for-context) → `integrate`
- Deduplication detection → `integrate`
- Trust-averaging with existing facts → `integrate`
- Edge/link creation → `integrate`
- Importance inference → `integrate` or sweep-phase
- Content transformation → may belong to `integrate`
- `accessCount` / `lastAccessed` side-effects on recall → recall-promotion slice

**`imprint` is a dumb pipe:** validate → generate ID → apply defaults → write → return ID.

---

## 2026-06-16 — `integrate` Orchestration Activity — Representation Design (PROPOSED)

**Status:** PROPOSED  
**Date:** 2026-06-16T22:37:35-07:00  
**Author:** Crispin (Knowledge Representation Specialist)  
**Feeds:** Genesta's `imprint` activity spec and vocabulary amendment  
**Scope:** Classification model, edge schema, reconciliation outcomes — representation layer only  
**Pending:** Genesta review + Aaron decision

### Classification Model

`integrate` must decide: is the incoming material **novel**, a **duplicate**, or a **contradiction** of existing knowledge?

| Signal | Source | Current capability | Gap |
|--------|--------|-------------------|-----|
| **Identity match** (exact same fact) | `UNIQUE(fact_id, session_id)` constraint | ✅ Already enforced | None — `imprint` already rejects re-insert |
| **Content similarity** (near-duplicate) | FTS5 BM25 via `facts_fts` | ⚠️ Partial — score but no threshold | Needs **similarity threshold** decision |
| **Semantic contradiction** | None | ❌ Not representable | Requires LLM classification or structured dedup keys |

### Proposed Classification Flow

```
integrate(content, sessionId, metadata)
  │
  ├─ 1. recall(content, sessionId, limit=K)
  │     → top-K existing facts with composite scores
  │
  ├─ 2. FOR EACH recalled fact:
  │       compute dedup_signal(input, existing)
  │       → { similarity: number, relationship: 'novel' | 'duplicate' | 'contradiction' }
  │
  └─ 3. Aggregate: highest-similarity match determines classification
```

### Dedup Keys — Proposed Schema Enhancement

A **dedup key** is an optional, caller-supplied canonical identifier for semantic content, independent of wording.

Example:
```
factId: "f-abc-123"           ← identity (already exists)
dedupKey: "repo:mem/lint:cmd" ← semantic identity (proposed)
```

**Schema cost:** One nullable TEXT column on `facts` + non-unique index. Lightweight, compatible with `imprint` contract.

### Edge / Cross-Reference Schema

**Proposed migration 003 — relations table:**

```sql
CREATE TABLE IF NOT EXISTS relations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    TEXT    NOT NULL,   -- source fact's fact_id
  to_id      TEXT    NOT NULL,   -- target fact's fact_id
  session_id TEXT    NOT NULL,   -- session that created the edge
  edge_type  TEXT    NOT NULL
    CHECK (edge_type IN (
      'derived_from', 'references', 'contradicts', 'supersedes',
      'part_of', 'instance_of', 'precedes',
      'defined_in', 'decided_by', 'committed_in',
      'originated_in', 'modified_in', 'referenced_in'
    )),
  weight     REAL             DEFAULT NULL,
  confidence REAL             DEFAULT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_id, to_id, edge_type, session_id)
);

CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to   ON relations(to_id);
CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(edge_type);
```

**Minimum viable edge set for `integrate`:**
- `supersedes`: Contradiction resolved in favor of new
- `contradicts`: Contradiction detected, not yet resolved
- `derived_from`: Novel fact derived from existing context
- (Audit log for duplicates outside this table)

### Reconciliation Outcomes

**3a. NOVEL** (no sufficiently similar existing fact)
- Call `imprint(newFact)` → FactId
- Optionally write `derived_from` edge if recall surfaced context
- Return `{ outcome: 'created', factId }`

**3b. DUPLICATE** (existing fact is semantically equivalent)
- Do NOT call `imprint`
- Update `last_accessed` on existing fact
- Optionally increment trust (subject to T3b cap)
- Log the dedup decision
- Return `{ outcome: 'duplicate', existingFactId }`

**3c. CONTRADICTION** (new input conflicts with existing fact)
- Call `imprint(newFact)` → FactId
- Write `contradicts` edge
- Decrement trust on existing fact
- Optionally write `supersedes` edge if confidence high enough
- Return `{ outcome: 'contradiction', newFactId, conflictsWith }`

### Open Questions for Aaron

| # | Question | Impact | Recommendation |
|---|----------|--------|---|
| Q1 | **Does `integrate` land in this cycle or is it purely design?** | Determines whether migration 003 ships now or later | Design now, ship with `integrate` implementation (not with `imprint`) |
| Q2 | **Should we add `dedupKey` to the `facts` table?** | One nullable column + index; enables O(1) semantic dedup for structured inputs | Yes — cheap schema cost, high value for structured kinds |

### Summary

Representation layer can support `integrate`'s classification with:
1. Existing infrastructure (BM25 recall + uniqueness constraint)
2. New schema (migration 003: `relations` table + optional `dedupKey` column)
3. Clear boundary: representation owns schema/edges; Edgar owns similarity thresholds/trust algorithms; Genesta owns activity contract

Cannot provide from representation alone: reliable duplicate-vs-contradiction discrimination. Requires either LLM judgment or structured dedup keys.

---

## Next Steps
# 1. Syntax check
bash -n .github/hooks/cairn/shell-init.sh
bash -n .github/hooks/cairn/install.sh
bash -n .github/hooks/cairn/uninstall.sh




# 2. Install (idempotent — run twice to confirm second run is no-op)
bash .github/hooks/cairn/install.sh
bash .github/hooks/cairn/install.sh   # should print "already installed"




# 3. Reload and smoke-check
source ~/.bashrc
forge_mcp_check




# 4. Uninstall
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc



# forge_mcp_check should no longer exist as a function




# 5. Re-install (confirm idempotency survived uninstall cycle)
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check
```

## Key design note

The marker block strategy (`# forge-mcp: shell init — start`) is the safe pattern
for managed rc-file entries. The install script will never double-append, and the
uninstall script removes the exact block. No manual editing required.




# PR #45 — Second Merge from origin/main (2026-06-05)

**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Merge commit:** 9a26669

---

## What merged

Two PRs landed on main since the last merge:
- **#47** — M8 Slice B (eureka storage layer: `trust-updater-sqlite.ts`, contract test helpers, refactored `fact-reader-sqlite.ts`)
- **#44** — forge-mcp hooks (`.github/hooks/cairn/` install/uninstall/shell-init scripts; `forge-mcp-shell-install` skill)

Full diff summary: 35 files changed, 10641 insertions, 15048 deletions (large deletions from decisions-archive consolidation).

---

## Conflicts

**None.** The only overlapping files were `.squad/` append-only files (history.md, history-archive.md, decisions.md, decisions-archive.md), all covered by `merge=union` in `.gitattributes`. Git auto-resolved all of them via the union driver. No source files, no package-lock.json, no tsconfig conflicts.

---

## Build result

`npm install` — ✅ clean (no lockfile conflict; audit warnings pre-existing)
`npm run build` (all workspaces, `tsc --build`) — ✅ exit 0

---

## Test results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

---

## New HEAD

`9a26669` — Merge remote-tracking branch 'origin/main' into squad/crucible-sprint-0-walkthrough-a

---

## Status

Not pushed — Roger has follow-up fixes to land on top; coordinator will push after.


---




# 2026-06-06: Aaron's User Directive — Parallelization and TDD Discipline

**By:** Aaron Kubly (via Copilot)  
**Directive:** When parallelizing work, do NOT go parallel if it requires deviating from RED→GREEN TDD execution. TDD discipline (RED test fails first, then minimal GREEN, then REFACTOR) takes priority over parallelism. Parallel work is only permitted at TDD-safe boundaries (e.g., independent RED tests, interface/seam contracts) — never GREEN-before-RED, never shared-impl-before-seam.  
**Why:** User direction — captured for team memory during WAL substrate + Walkthrough B kickoff (Option A seam-first).

---




# 2026-06-06: Aaron's Ruling — HookVerdict VETO Semantics (resolves graham-ledger-seam-OPEN)

**By:** Aaron Kubly (via Copilot)  
**Decision:** Option A — Adopt **VETO** as a first-class **pre-WAL Ledger-layer gate**.

- VETO fires at `Ledger.append` entry, BEFORE staging. Rejected input never enters the WAL → WAL stays purely append-only; §3's "all staged rows commit" invariant is intact.
- §4's `continue | observe | pause` (on the staged batch, inside the group-commit window) are untouched. VETO is a distinct, earlier policy boundary.
- Enforced by the type system: `Exclude<HookVerdict, 'VETO'>` at the WAL backend `commitRow` port so VETO can never cross the WAL boundary.
- §4.2 Walkthrough B RED test passes as written — no test rework.

**Required follow-on (documented amendments to FINAL specs):**

1. §4.1 verdict table — add VETO row ("no row created; Ledger throws `Append vetoed by hook: <id>`"), flagged as Ledger-layer (not commit-window).
2. §4.3 dispatch — add VETO case before the PAUSE check.
3. §11 replay contract — note: VETO inputs are not in the WAL; replay need not handle them (Ledger-layer policy, not a WAL concept).

**Why:** User ruling at Decision-Point Gate during WAL substrate + Walkthrough B build.

---




# Decision — Append-Only History Rule Reinterpreted (Supersedes Issue #71 Decision B)

**By:** Aaron Kubly (akubly)  
**Date:** 2026-06-16  
**Type:** Governance / Rules Clarification  
**Status:** ACCEPTED — establishes correct interpretation going forward

---

## What Was Corrected

The Append-Only History Rule, originally stated as a blanket prohibition on any modification to
`history.md` and `history-archive.md`, was overstated. The correct interpretation:

**Append-only refers to HOW new content is added to these files**, not a prohibition on
condensation:

- New entries are always **appended to the end of the file**, never interleaved or rewritten in
  place. This property is what makes these files safe to merge via the `.gitattributes
  merge=union` driver.
- **Condensation is sanctioned and lossless:** Scribe (and the `squad nap` tool) are intended to
  periodically condense old `history.md` entries by relocating them verbatim into
  `history-archive.md`, keeping the most recent N entries live in `history.md`.
- Archive files (`history-archive.md`, `decisions-archive.md`) are append-only targets — they
  only grow, never shrink or have existing content overwritten.

## Supersession

**Decision: Issue #71 Decision B, Option A** ("Drop size management, no deletions ever") is
**SUPERSEDED** by this reinterpretation.

The prior "Option C" (recency-based archival: move old entries to archive, delete from
history.md) is now the **sanctioned strategy**, provided:
1. Archived entries are preserved **verbatim** in `history-archive.md`
2. Archive files are **append-only** — they never lose pre-existing content
3. The `history.md` tail is truncated AFTER entries are appended to the archive (history is
   lossless overall)

## Rationale

Scribe's spawn template included a "HISTORY SUMMARIZATION" gate that was flagged as a violation
because it edited previously-committed history entries. This was correctly identified as a scope
violation — but the underlying policy was mischaracterized as "no size management ever." The
team intended size management all along; the error was HOW it was attempted (dropping data vs.
moving it).

The `squad nap` condensation output (appending old entries to history-archive.md verbatim,
then truncating history.md tail) is now **legal and correct** provided the archive grows and
nothing is lost.

## Action Items

- ✅ `squad nap` history-condensation diffs in the working tree (moving entries to
  history-archive.md, truncating history.md tail) are safe to commit and push.
- ✅ Future Scribe spawns and automated naps may condense history.md per the Option-C strategy.

---




# 1. Syntax check
bash -n .github/hooks/cairn/shell-init.sh
bash -n .github/hooks/cairn/install.sh
bash -n .github/hooks/cairn/uninstall.sh




# 2. Install (idempotent — run twice to confirm second run is no-op)
bash .github/hooks/cairn/install.sh
bash .github/hooks/cairn/install.sh   # should print "already installed"




# 3. Reload and smoke-check
source ~/.bashrc
forge_mcp_check




# 4. Uninstall
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc



# forge_mcp_check should no longer exist as a function




# 5. Re-install (confirm idempotency survived uninstall cycle)
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check
```

## Key design note

The marker block strategy (`# forge-mcp: shell init — start`) is the safe pattern
for managed rc-file entries. The install script will never double-append, and the
uninstall script removes the exact block. No manual editing required.




# PR #45 — Second Merge from origin/main (2026-06-05)

**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Merge commit:** 9a26669

---

## What merged

Two PRs landed on main since the last merge:
- **#47** — M8 Slice B (eureka storage layer: `trust-updater-sqlite.ts`, contract test helpers, refactored `fact-reader-sqlite.ts`)
- **#44** — forge-mcp hooks (`.github/hooks/cairn/` install/uninstall/shell-init scripts; `forge-mcp-shell-install` skill)

Full diff summary: 35 files changed, 10641 insertions, 15048 deletions (large deletions from decisions-archive consolidation).

---

## Conflicts

**None.** The only overlapping files were `.squad/` append-only files (history.md, history-archive.md, decisions.md, decisions-archive.md), all covered by `merge=union` in `.gitattributes`. Git auto-resolved all of them via the union driver. No source files, no package-lock.json, no tsconfig conflicts.

---

## Build result

`npm install` — ✅ clean (no lockfile conflict; audit warnings pre-existing)
`npm run build` (all workspaces, `tsc --build`) — ✅ exit 0

---

## Test results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

---

## New HEAD

`9a26669` — Merge remote-tracking branch 'origin/main' into squad/crucible-sprint-0-walkthrough-a

---

## Status

Not pushed — Roger has follow-up fixes to land on top; coordinator will push after.


---




# 2026-06-06: Aaron's User Directive — Parallelization and TDD Discipline

**By:** Aaron Kubly (via Copilot)  
**Directive:** When parallelizing work, do NOT go parallel if it requires deviating from RED→GREEN TDD execution. TDD discipline (RED test fails first, then minimal GREEN, then REFACTOR) takes priority over parallelism. Parallel work is only permitted at TDD-safe boundaries (e.g., independent RED tests, interface/seam contracts) — never GREEN-before-RED, never shared-impl-before-seam.  
**Why:** User direction — captured for team memory during WAL substrate + Walkthrough B kickoff (Option A seam-first).

---





# Forge production runner integration (slice 1)

**Date:** 2026-06-22
**By:** Alexander (SDK/Runtime), with Roger (Platform) lifecycle guidance; shipped in PR #82 (squash 9f24aa8).
**Context:** The Forge feedback loop was built but underfed — no production runner drove real Copilot SDK sessions through `ForgeClient`, so dogfood profiles needed seeding via `forge-seed-profile`.

**Decisions:**
- **Composition root** lives in `packages/skillsmith-runtime/src/forgeSessionRunner.ts` (`runForgeInstrumentedSession`), owning the SDK → `ForgeClient` → Cairn telemetry-sink wiring. `runtime-cli` stays thin and takes NO direct `@akubly/forge` dependency.
- **Opt-in CLI** `forge-run-session` (runtime-cli) drives one real session. Exit codes: `0` samples written, `1` ran-but-no-samples, `2` bad input / auth / SDK-unavailable.
- **Permission seam:** `onPermissionRequest` on `ForgeSessionConfig`. `ForgeClient` defaults to a DENY handler (secure-by-default at the library); the runner composition root opts into SDK `approveAll` for dogfood.
- **Terminal-event drain is event-driven:** telemetry flush waits for the bridged `session_end` (observed as `session_end_observed`) with a timeout as a ceiling only — NOT a fixed wall-clock delay — so `outcome.succeeded` cannot become a false-negative when `session.shutdown` lands during/after `sdkSession.disconnect()`. The drain ceiling is an internal constant/test seam, not part of the public `ForgeSessionConfig`. Profile build uses `buildProfiles(db)` (not Cairn's `curate()`).
- **Disconnect observability:** `RunForgeInstrumentedSessionResult` carries `disconnect: { ok: true } | { ok: false; error: string }` so a persistent disconnect failure is visible, not swallowed.
- **Client ownership:** explicit `ownsSdkClient` (derived from `stopClientOnFinish ?? !injected`); injected SDK clients are not stopped unless requested.

**Shutdown ordering (Roger):** keep SDK subscriptions live during `sdkSession.disconnect()` → drain terminal events → flush telemetry → `ForgeClient.stop()` → `closeDb()` last.

**Deferred:** dogfood `SQLITE_BUSY` policy when a runner and an interactive session share `~/.cairn/knowledge.db` (Cairn sets no `busy_timeout`). Use an isolated `--db` for CI/dev.

**Review:** 3 local persona-review cycles (11 → 5 advisory → 0); Copilot cloud review clean (only flagged a decisions-ledger archive that was removed from the PR).

1. **Aaron decision pending:** Q1 & Q2 above (integrate landing, dedupKey in schema)
2. **Genesta & Crispin review:** Integration design memo — verify representation coverage
3. **Follow-up slice:** `integrate` cognitive orchestration (after `imprint` ships)
