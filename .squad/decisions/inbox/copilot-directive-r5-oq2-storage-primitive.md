# R5 OQ-2 Directive: Storage Primitive (v1 strawman)

**Status:** Resolved by Aaron, R5 round 3. **Strawman — pending R6 review against Cairn.**

## Decision

v1 ships a **strawman storage primitive**, explicitly flagged for R6 reconciliation with Cairn.

## v1 Strawman

- **Primary store:** SQLite. Per-tier `.db` file at FR-7.2 paths:
  - `agent` → `~/.copilot/eureka/agent.db`
  - `project` → `<repo>/.eureka/project.db` (gitignored)
  - `user` → `~/.copilot/eureka/user.db`
- **Vector index:** `sqlite-vec` (co-located with SQLite). Chosen over `sqlite-vss` for active maintenance and Windows native-compile cleanliness.
- **Embedding generation:** out of scope for the storage primitive. Embedder is an injected dependency.
- **Per-tier backend variation:** **none in v1.** Same primitive across all implemented tiers. Pluggability lives in the interface, not the implementation.

## R6 Reconciliation Mandate

R6 trio (Genesta/Crispin/Edgar) reads cairn/forge source and reconciles:

1. **Reuse Cairn?** If Cairn provides a clean adapter for our needs, FR-7 changes to "reuse Cairn directly."
2. **Fork Cairn?** If Cairn's API is close but not quite right, R6 proposes a fork strategy.
3. **Build new?** If Cairn's primitives are incompatible (different vector library, schema-incompatible migrations, etc.), R6 documents the gap and confirms the strawman.
4. **Per-tier variation?** R6 may introduce variation if requirements demand (e.g., user tier needs encryption, project tier needs git-friendly format).

R6 decision MUST include an explicit comparison: "What does Cairn give us? What does it cost to reuse vs. build new?"

## Risk Acknowledgement

Strawmen in PRDs become anchored. Mitigation: every FR that references storage must be **written against the interface, not the strawman**. R6 must be able to swap the primitive without rewriting FRs.

## Rationale

- Local-first directive (Q9) eliminates need for distributed-DB-grade primitive.
- SQLite + sqlite-vec is the lowest-risk modern combination for single-file local stores with vector search.
- Co-locating vectors and metadata in one store eliminates cross-store consistency problems.
- Explicit "pending R6" flag preserves the hard rule's intent: design from requirements, not from Cairn's shape.
