# R5 OQ-5 Directive: Edge-Type Expansion (v1)

**Status:** Resolved by Aaron, R5 round 3.
**Extends:** Q7 directive (graph-ready schema with 6 edge types) — adds Tier 1/Tier 3 expansions.

## Three-tier edge type model

Schema slots are cheap; population obligations are what cost. Edge types split by population obligation:

### Tier 1 — Schema + eager population in v1
Emit at creation when relevant. ~Zero runtime cost per emission.

| Edge | From Q7 | Notes |
|---|---|---|
| `derived_from` | ✓ | Provenance |
| `references` | ✓ | Explicit pointer |
| `contradicts` | ✓ | Verification events |
| `supersedes` | ✓ | Replacement/correction; auto from decide() supersedes_decision_id (OQ-4) |
| `part_of` | NEW | A is a component of B (function part_of file; chapter part_of book) |
| `instance_of` | NEW | A is an instance of category B |
| `precedes` | NEW | Temporal/sequence ordering |
| `defined_in` | NEW | Authoritative source location |
| `decided_by` | NEW | Backlink: this fact resulted from decide-fact B. Auto-emitted by decide()/pray() chains. |
| `committed_in` | NEW | Backlink: this fact is committed under pray-fact B. Auto-emitted by pray(). |

### Tier 2 — Schema + throttled sweep population in v1

| Edge | From Q7 | Population |
|---|---|---|
| `similar_to` | ✓ | Vector NN, top-K (K=10 default), sweep |
| `co_accessed_with` | ✓ | Session co-access, throttled to prevent O(N²) |

### Tier 3 — Schema-only parking lot
Reserved in enum. **System does NOT populate.** Callers MAY emit manually. R6+ promotes to Tier 1/2 with cost data.

- `caused_by`
- `useful_for`
- `equivalent_to`
- `responds_to`
- `requires`
- `analogous_to`

## Excluded from enum entirely

- **`tags`** — overlaps with existing fact-level tag metadata. Conceptually muddled as an edge. Not added.

## Population obligations

- **Tier 1:** integrate() / decide() / pray() emit these edges at creation when applicable. Synchronous.
- **Tier 2:** populated by FR-12 opportunistic sweep, within sweep budget (NFR-1.4).
- **Tier 3:** no system population. Callers MAY emit. Edge-store accepts them.

## Rationale

1. **Honors Aaron's amendment to Q7** — invited brainstorming; returning to "just 6" violates the invitation.
2. **Honors Cassima's pushback in substance** — her real concern is uncontrolled population obligations; Tier 3 makes the obligation explicit and bounded.
3. **Tier 1 additions are essentially free** — integrator already knows structural/temporal relationships at creation time; one extra INSERT per edge.
4. **decided_by + committed_in close important loops** — fact → decision and fact → commitment are queryable backwards, which the original 6 couldn't do.
5. **Tier 3 is a parking lot, not a commitment** — unused tier-3 names can be deleted or promoted in R7 with zero v1 harm.
6. **FR-9.5 already declares names provisional** — adding more types now is similarly cheap to revisit.

## FR-9 Updates Required (Cassima v3)

- FR-9.2: split into FR-9.2a (Tier 1), FR-9.2b (Tier 2), FR-9.2c (Tier 3).
- FR-9.3: extend population tier description to cover decided_by/committed_in auto-emission.
- FR-9.5: keep — names remain provisional.
- NEW FR-9.7: Tier 3 enum-only contract — no system population, caller-emittable.
