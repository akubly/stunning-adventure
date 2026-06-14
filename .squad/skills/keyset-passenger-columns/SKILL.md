# keyset-passenger-columns

**Pattern:** Add read-only ("passenger") columns to a keyset-paginated SQL SELECT without touching the sort key, ORDER BY, or cursor logic.

---

## When to use

- A keyset-paginated query returns rows with a stable composite sort key (e.g., `(-bm25_score) * trust`).
- You need to surface additional columns from the same table (e.g., `importance`, `last_accessed`, `attention_tier`) that are NOT sort signals — they are metadata that rides along on each result row.
- The sort key, ORDER BY, and cursor encode/decode are locked and must not change.

---

## The risk

Keyset pagination is fragile around its sort expression. If you accidentally include a new column in ORDER BY, or alter the composite expression, the keyset boundary becomes inconsistent — some rows get skipped or duplicated across pages. Passenger columns are safe only when they are **strictly not present in** ORDER BY, the keyset WHERE predicate (`composite < $last_sort OR (composite = $last_sort AND id > $last_id)`), or the cursor encode/decode.

---

## Pattern: CTE-based query (multi-level SELECT)

When the paginated query uses CTEs, each CTE layer must pass the passenger columns through explicitly:

```sql
WITH base AS (
  SELECT
    f.id, f.content, f.trust,
    bm25(facts_fts) AS bm25_score,
    -- ✅ Add passenger columns here (at the JOIN source)
    f.importance, f.last_accessed, f.attention_tier
  FROM facts_fts
  JOIN facts f ON f.id = facts_fts.rowid
  WHERE …
),
ranked AS (
  -- ⚠️ INVARIANT: sort expression unchanged
  SELECT id, content, trust, bm25_score,
         (-bm25_score) * trust AS composite,
         -- ✅ Pass through passenger columns (no expression change)
         importance, last_accessed, attention_tier
  FROM base
)
-- ✅ Include passenger columns in final SELECT
SELECT id, content, trust, bm25_score, importance, last_accessed, attention_tier
FROM ranked
WHERE composite < $last_sort
   OR (composite = $last_sort AND id > $last_id)
ORDER BY composite DESC, id ASC   -- ← unchanged
LIMIT $limit
```

**Three levels to update:** (1) source CTE, (2) intermediate CTE(s), (3) outer SELECT.

---

## Pattern: Simple query (no CTE)

When the first-page query is a plain SELECT with JOIN:

```sql
SELECT
  f.id, f.content, f.trust,
  bm25(facts_fts) AS bm25_score,
  -- ✅ Add passenger columns
  f.importance, f.last_accessed, f.attention_tier
FROM facts_fts
JOIN facts f ON f.id = facts_fts.rowid
WHERE …
ORDER BY (-bm25_score) * f.trust DESC, f.id ASC   -- ← unchanged
LIMIT $limit
```

---

## Row type interface

Extend the internal row type to include the new columns using the SQLite column names (snake_case), not the JS output shape (camelCase):

```typescript
interface SearchRow {
  id: number;
  content: string;
  trust: number | null;
  bm25_score: number;
  // Passenger columns — match DB column names exactly
  importance: number;
  last_accessed: number | null;
  attention_tier: string;
}
```

---

## Mapper: SQL types → JS types

Map nullable SQL columns to `undefined` (not `null`) when the downstream consumer uses `typeof x === 'number'` guards:

```typescript
lastAccessed: row.last_accessed ?? undefined,   // NULL → undefined
importance: row.importance,                      // NOT NULL by schema — safe direct
attentionTier: row.attention_tier as 'hot' | 'warm' | 'cold',
```

Using `?? undefined` rather than leaving `null` prevents silent bugs where `typeof null === 'object'` causes a number-guard to fall through incorrectly.

---

## Checklist

- [ ] Passenger columns added to ALL SELECT levels (source CTE, intermediate CTEs, outer SELECT)
- [ ] Both query paths updated consistently (first-page simple query AND keyset CTE query)
- [ ] ORDER BY expression is byte-for-byte identical to before
- [ ] Cursor encode/decode is unchanged
- [ ] Keyset WHERE predicate (`composite < … OR …`) is unchanged
- [ ] Row interface updated with SQLite column names
- [ ] Mapper uses `?? undefined` for nullable columns where downstream checks `typeof x === 'number'`
- [ ] Default values in DB preserve previous behavior for existing rows

---

## Example

`packages/eureka/src/storage/fact-store-sqlite.ts` — migration 002 added `importance`, `last_accessed`, `attention_tier` to `facts`. GREEN phase (2026-06-12) wired them as passenger columns into both `stmtFirst` and `stmtKeyset` without altering the `(-bm25_score) * trust` sort invariant.
