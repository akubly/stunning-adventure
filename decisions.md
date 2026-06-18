# Eureka Decisions Log

Decisions are tracked chronologically. Entries are append-only; archival of old entries (>30 days) moves them to `decisions-archive.md`.

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

1. **Aaron decision pending:** Q1 & Q2 above (integrate landing, dedupKey in schema)
2. **Genesta & Crispin review:** Integration design memo — verify representation coverage
3. **Follow-up slice:** `integrate` cognitive orchestration (after `imprint` ships)
