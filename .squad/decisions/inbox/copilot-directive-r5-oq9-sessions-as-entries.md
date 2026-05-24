# R5 OQ-9 Directive: Sessions as First-Class Entries

**Status:** Resolved by Aaron, R5 round 3.
**Amends:** OQ-5 directive (adds 4 session edge types to enum).
**Origin:** Aaron's counter-proposal: "sessions get their *own* entry and have edges to the items that are relevant to them."

## Decision

**Sessions are `kind=session` facts.** Same storage, same edge mechanism. Reuses fact infrastructure.

## Schema

### Session fact
```typescript
{
  id: fact_id,                  // UUIDv7
  kind: "session",
  content: string,              // human-readable session description
  summary: string,              // REQUIRED in v1, supplied by caller at session creation/close
  principal_id: string,         // who owns the session
  started_at: iso8601,
  ended_at?: iso8601,           // set on explicit close, null while live
  persistence_tier: "agent",    // default; configurable
  attention_tier: "warm",       // OQ-1 default
  importance: number,           // 0..1, OQ-1 semantics apply
  trust: number,                // 0..1, OQ-7 semantics apply
  ...standard fact fields
}
```

Note: `summary` is **required** in v1 (caller supplies). Meditate-driven summary generation deferred to later design discussion.

### Session-edge types (amending OQ-5)

Added to graph-ready edge enum:

| Edge | Direction | Tier | Population |
|---|---|---|---|
| `originated_in` | fact → session | Tier 1 (eager) | Set at integrate time. Exactly one per fact. |
| `modified_in` | fact → session | Tier 1 (eager) | Emitted on every trust/importance/content mutation. May produce duplicates over time (one per mutation event). |
| `referenced_in` | fact → session | Tier 1 (eager) | Emitted at verb-call time when fact_ids are passed in (decide options, pray target, contemplate inputs). |
| `recalled_in` | fact → session | Tier 2 (sweep, throttled, per-session dedup) | Aggregated from activity log. Stored as "fact F recalled at least once in session S" (one edge per fact-session pair). |

## Removed / not used

- **No `origin_session_id` field on facts** — replaced by `originated_in` edge. Single mechanism, bidirectional traversal.
- **No sessions sibling table** — sessions live in the fact store.

## Query patterns

- **"What did I create in session X?"** → edges `originated_in` where dst = X
- **"What did session X touch?"** → all session-edges where dst = X
- **"Which sessions touched fact F?"** → all session-edges where src = F
- **"Find sessions similar to this one"** → vector recall over kind=session facts (free via existing FR-2)
- **"US-5 continuity bundle"** → recall facts where `originated_in` ∈ recent_sessions, scored by standard ranker

## Rationale

1. **Aaron's instinct was right** — sessions-as-entries gives both "trace fact to origin" AND "see which sessions touched it" with the same primitive. No new storage concept.
2. **Reusing fact storage is enormous leverage** — sessions get free vector search, persistence tiering, attention semantics, audit history, ranker integration.
3. **Importance/trust on sessions are meaningful** — breakthrough sessions are important; exploratory sessions are less so. Same columns, real semantics.
4. **Throttled `recalled_in` with per-session dedup** prevents O(recalls × results) edge blowup while preserving the useful signal.
5. **`originated_in` as edge, not field**, preserves the symmetry: everything relating facts is an edge.
6. **Caller-supplied summary** is cleaner than nullable — no "is it empty or unsummarized?" ambiguity. Forces deliberate session creation.

## FR Updates Required (Cassima v3)

- **NEW FR-13: Session Model.** Sessions are kind=session facts; specify schema, lifecycle (start/close), required summary.
- **FR-9.2a (Tier 1 eager):** add `originated_in`, `modified_in`, `referenced_in`.
- **FR-9.2b (Tier 2 sweep):** add `recalled_in` with per-session dedup rule.
- **US-5 (continuity):** reference FR-13 + originated_in edge as implementation path.
- **OQ-5 directive:** treat this as amendment — 4 new edge types added to enum.

## Deferred to later design discussion

- Meditate-driven summary generation (currently caller-required)
- Session lifecycle hooks beyond start/close
- Cross-machine session linking (when sync ships)
