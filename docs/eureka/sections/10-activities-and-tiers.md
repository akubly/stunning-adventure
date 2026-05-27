# §10. Activities and Tiers

**Author:** Genesta (Cognitive Systems Lead)  
**Status:** Technical Design (v1 Specification)  
**PRD Source:** `.squad/decisions/eureka-prd-v5-final.md` (locked after R8)  
**Last Updated:** 2025-01-21

---

## Overview

This section specifies Eureka's **activity model** (what verbs the system supports) and **tier boundary system** (where knowledge lives and how it resolves). These form the semantic core of Eureka's API surface.

**Key Principles:**
- **Activities are verbs, not nouns:** Each activity is a discrete, named operation with defined inputs, outputs, and side effects
- **Tiers are scopes, not users:** Tiers represent knowledge authority boundaries (agent < user < project < org), not just data partitions
- **Resolution is sequential, not hierarchical:** Queries fan-out from narrow to broad scope until `k` results are found
- **v1 ships agent tier only:** User and project tiers return empty on reads, throw `NotImplementedError` on writes

---

## §10.1. Activity Model

Eureka exports **7 v1 activities** plus **2 reserved v1.5 activities**. This is the locked vocabulary per FR-4.

### v1 Activities (Exported API Surface)

#### `integrate(fact: Fact) → FactId`

**Verb:** Ingest a new fact into the knowledge graph.

**Trigger:** Called by orchestration code when a new fact emerges during session execution (e.g., skill result, memory extraction, decision outcome).

**Inputs:**
- `fact: Fact` — Structured fact object with required fields (`kind`, `verb`, `content`) and optional metadata (`sessionId`, `importance`, `trust`, `attention`)

**Outputs:**
- `FactId` — UUID v4 identifier for the newly integrated fact

**Side Effects:**
- Writes row to `facts` table in appropriate tier DB (v1: agent tier only)
- Sets `createdAt`, `lastAccessedAt`, and `accessCount=1`
- If `sessionId` present, writes association to `fact_sessions` table
- Initializes attention state (default: `cold`)

**Sync/Async:** Synchronous write with immediate durability

**Open Questions for Implementation:**
- Does `integrate` run deduplication checks before inserting? (FR-2 mentions dedup strategy but doesn't specify when it fires)
- How are malformed facts handled (e.g., missing required fields)? Throw? Coerce? Log + skip?

---

#### `recall(query: string, k: number, tier?: Tier) → Fact[]`

**Verb:** Retrieve the top `k` most relevant facts matching a natural-language query.

**Trigger:** Called when orchestration needs to surface prior knowledge (e.g., before planning, during decision-making).

**Inputs:**
- `query: string` — Natural-language query string (user intent or semantic concept)
- `k: number` — Maximum number of facts to return
- `tier?: Tier` — Optional tier override (default: fan-out across all tiers per FR-7.2)

**Outputs:**
- `Fact[]` — Array of up to `k` facts, ranked by composite score

**Ranking Formula (FR-2):**
```
score = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
score *= attention_multiplier  // hot=1.20, warm=1.00, cold=0.80
exclude if trust < 0.15
```

**Side Effects:**
- Increments `accessCount` for returned facts
- Updates `lastAccessedAt` timestamp
- Promotes attention state (cold → warm after 2 accesses, warm → hot after 5 accesses, per FR-2)

**Tier Resolution (FR-7.2):**
1. Query agent tier (`~/.copilot/eureka/agent.db`)
2. If `results.length < k`, query user tier (`~/.copilot/eureka/user.db`) and merge
3. If `results.length < k`, query project tier (`<repo>/.eureka/project.db`) and merge
4. Stop at first tier reaching `k` results (early exit optimization)

**v1 Constraint:** User and project tiers return `[]` (not implemented).

**Sync/Async:** Synchronous read (target P95 < 50ms per FR-7.2)

**Open Questions for Implementation:**
- What's the merge strategy when combining results across tiers? (De-duplicate by `FactId`? Interleave by score?)
- Does `recall` update attention state for *all* returned facts or only the top-n consumed by the caller?

---

#### `rerank(facts: Fact[], context: string) → Fact[]`

**Verb:** Re-score and re-order a set of facts given new context or refined intent.

**Trigger:** Called after initial `recall()` when orchestration has additional context (e.g., user clarification, plan refinement).

**Inputs:**
- `facts: Fact[]` — Initial fact set (typically from prior `recall()` call)
- `context: string` — Additional context or refined query string

**Outputs:**
- `Fact[]` — Same facts, re-ordered by updated composite score

**Side Effects:**
- None (read-only operation; does not update access counts or attention)

**Sync/Async:** Synchronous

**Open Questions for Implementation:**
- Does `rerank` use the same composite formula as `recall`, or a different weighting?
- Can `rerank` filter out facts (e.g., below trust threshold) or must it return all input facts?

---

#### `decide(prompt: string, facts: Fact[]) → DecisionRecord`

**Verb:** Synthesize a structured decision from a prompt and supporting evidence facts.

**Trigger:** Called at decision points (Path 1, "contemplative mode" per FR-10) when orchestration needs to pause and formalize a choice.

**Inputs:**
- `prompt: string` — The decision question or fork description
- `facts: Fact[]` — Supporting facts that inform the decision (typically from `recall()`)

**Outputs:**
- `DecisionRecord` — Structured record with `question`, `options`, `chosen`, `rationale`, `confidence`, `constraints`, `sessionId`

**Side Effects:**
- Writes to Forge decision log via `toDecisionRecord()` adapter (US-5)
- Does **not** write to Eureka DB (Forge is authoritative source for decisions per FR-14)
- Creates audit trail in Forge with full fact provenance

**Sync/Async:** Synchronous (decision synthesis happens in-process; Forge write is blocking)

**Open Questions for Implementation:**
- How does `decide()` extract `options` from the prompt? (LLM-based parsing? Structured input requirement?)
- What happens if Forge write fails? (Retry? Throw? Log + continue?)
- Does `decide()` automatically call `integrate()` to store the decision as a fact, or is that the caller's responsibility?

---

#### `commit(factId: FactId, trust: number) → void`

**Verb:** Upgrade a fact's trust score, signaling increased confidence or validation.

**Trigger:** Called when external evidence confirms a fact (e.g., user feedback, cross-validation, successful prediction).

**Inputs:**
- `factId: FactId` — Identifier of the fact to upgrade
- `trust: number` — New trust score (0.0–1.0 range)

**Outputs:**
- `void`

**Side Effects:**
- Updates `trust` field in `facts` table
- May trigger attention promotion (low-trust facts warming up after validation)

**Sync/Async:** Synchronous write

**Trust Policy (FR-2):**
- New facts default to `trust=0.5` (neutral)
- User-confirmed facts: `trust → 0.9`
- LLM-inferred facts: `trust → 0.3–0.7` depending on confidence
- Facts below `trust=0.15` are excluded from `recall()` results

**Open Questions for Implementation:**
- Can `commit()` *lower* trust (e.g., `trust=0.2` on a fact currently at `trust=0.8`)? Or is this verb upgrade-only?
- Should `commit()` enforce monotonic trust increase, or allow arbitrary reassignment?

---

#### `retire(factId: FactId, reason: string) → void`

**Verb:** Mark a fact as obsolete without deleting it (soft deprecation).

**Trigger:** Called when a fact is superseded by new information but should remain in the record for audit/history.

**Inputs:**
- `factId: FactId` — Identifier of the fact to retire
- `reason: string` — Human-readable explanation (e.g., "Superseded by fact abc123")

**Outputs:**
- `void`

**Side Effects:**
- Sets `retired=true` flag in `facts` table
- Sets `retiredAt` timestamp and `retirementReason` field
- Excludes fact from future `recall()` queries (filter: `WHERE retired=false`)
- Preserves fact in DB (does not delete row)

**Sync/Async:** Synchronous write

**Open Questions for Implementation:**
- Can retired facts be un-retired? (Or is retirement permanent?)
- Should `retire()` cascade to related facts (e.g., facts that reference this fact as provenance)?

---

#### `evict(factId: FactId) → void`

**Verb:** Permanently delete a fact from the knowledge graph (hard delete).

**Trigger:** Called when a fact violates policy (e.g., PII, secrets, user-requested deletion per GDPR).

**Inputs:**
- `factId: FactId` — Identifier of the fact to delete

**Outputs:**
- `void`

**Side Effects:**
- Deletes row from `facts` table
- Deletes associated rows from `fact_sessions` table (cascade)
- **Warning:** Breaks provenance chains if other facts reference this fact

**Sync/Async:** Synchronous write (with cascade)

**Policy Constraint (FR-2):**
- `evict()` is reserved for compliance/policy violations only
- Use `retire()` for ordinary obsolescence

**Open Questions for Implementation:**
- Should `evict()` validate that the fact isn't referenced by other facts before deleting? (Or orphan check?)
- Should `evict()` create a tombstone record for audit trail, or is it a true hard delete?

---

### v1.5 Activities (Reserved, Not Exported)

These activities are **specified but not implemented** in v1. They are reserved names per FR-4; importing them will throw `NotImplementedError`.

#### `meditate(query: string, depth: 'shallow' | 'deep') → Insight[]`

**Verb:** Broad reflective sweep across the knowledge graph to surface latent patterns or connections.

**Conceptual Semantics (from PRD §3):**
- "Shallow" mode: Fast, wide scan across many facts (e.g., "What themes recur in my recent work?")
- "Deep" mode: Intensive analysis of a narrow subgraph (e.g., "Why did I choose pattern X over Y in project Z?")

**v1.5 Scope:** Requires semantic embedding search (sqlite-vec integration) and graph traversal beyond BM25 lexical search.

**Not Implemented:** Throws `NotImplementedError('meditate is a v1.5 activity; use recall() for v1')`.

---

#### `contemplate(factId: FactId, perspective: string) → TrustAdjustment`

**Verb:** Narrow, deep reflection on a specific fact to refine its trust score or uncover hidden assumptions.

**Conceptual Semantics (from PRD §3):**
- Takes a single fact and a "perspective" prompt (e.g., "Is this fact still true given recent API changes?")
- Returns a structured `TrustAdjustment` with new trust score, confidence interval, and reasoning

**v1.5 Scope:** Requires integration with LLM-based trust refinement and counterfactual reasoning.

**Not Implemented:** Throws `NotImplementedError('contemplate is a v1.5 activity; use commit() for v1')`.

---

### Activity Discrepancy Note

**Task brief vs. PRD:** The original task brief mentioned 9 activities including `explore`, `ideate`, `dream`, `pray`, and `re-evaluate`. These do **not** appear in the locked PRD v5-final (FR-4). They may represent:
- Earlier vision documents (pre-R8)
- Alternative framings from a different stakeholder
- Conceptual metaphors that were later collapsed into the 7+2 model

**Decision:** This document reflects **only the locked PRD v5-final vocabulary**. If the task brief activities are required, they should be proposed as a formal amendment to the PRD with clear semantic definitions and FR assignments.

---

## §10.2. Tier Model

Eureka's tier system defines **knowledge authority boundaries** — where facts live, who can write them, and how they resolve during queries.

### Tier Hierarchy

```
org (v2+)
 └─ project (v1 reserved, not implemented)
     └─ user (v1 reserved, not implemented)
         └─ agent (v1 fully implemented)
```

**Resolution Order:** `agent → user → project → org` (narrow to broad).

**Authority Principle:** Lower tiers have write authority over their scope; higher tiers are read-only from lower perspectives.

---

### Tier Definitions

#### Agent Tier

**Scope:** Single AI agent instance (one `~/.copilot/eureka/agent.db` per agent).

**Storage Path:**
- Unix/macOS: `~/.copilot/eureka/agent.db`
- Windows: `%USERPROFILE%\.copilot\eureka\agent.db`

**Write Authority:** The agent itself (via orchestration code calling `integrate()`, `commit()`, etc.).

**Read Access:** Only the agent that created the facts.

**v1 Status:** ✅ Fully implemented. All 7 v1 activities work at this tier.

**Use Cases:**
- Session-local facts (conversation state, intermediate reasoning)
- Agent-specific preferences or heuristics
- Temporary facts that don't need cross-agent sharing

---

#### User Tier

**Scope:** All agents running under a single OS user account (one `~/.copilot/eureka/user.db` per user).

**Storage Path:**
- Unix/macOS: `~/.copilot/eureka/user.db`
- Windows: `%USERPROFILE%\.copilot\eureka\user.db`

**Write Authority:** Any agent running as that OS user (shared write).

**Read Access:** All agents running as that OS user.

**v1 Status:** ⚠️ Reserved. DB file created but not wired:
- `recall()` returns `[]` for user tier
- `integrate()` throws `NotImplementedError('User tier writes not implemented in v1')`

**Use Cases (future v1.5+):**
- Cross-session facts (knowledge that persists across agent restarts)
- User-confirmed facts (validated by human, `trust=0.9`)
- Personal preferences or conventions

---

#### Project Tier

**Scope:** All agents working within a Git repository (one `<repo>/.eureka/project.db` per repo).

**Storage Path:**
- `<repo-root>/.eureka/project.db` (adjacent to `.git/`)
- Added to `.gitignore` by default (local-only, not committed)

**Write Authority:** Any agent with filesystem access to the repo.

**Read Access:** All agents working in that repo.

**v1 Status:** ⚠️ Reserved. DB file created but not wired:
- `recall()` returns `[]` for project tier
- `integrate()` throws `NotImplementedError('Project tier writes not implemented in v1')`

**Use Cases (future v1.5+):**
- Codebase-specific facts (architecture decisions, module relationships)
- Team-shared knowledge (conventions, patterns, gotchas)
- CI/CD-discovered facts (test coverage, performance benchmarks)

---

#### Org Tier (v2+)

**Scope:** Organization-wide knowledge (e.g., all repos under `github.com/myorg`).

**Storage Path:** TBD (likely cloud-backed, not SQLite).

**v1 Status:** ❌ Not defined. Out of scope for v1 and v1.5.

---

### Tier Resolution Algorithm (FR-7.2)

When `recall(query, k)` is called **without** a tier override:

```python
def recall(query: str, k: int) -> list[Fact]:
    results = []
    
    # Step 1: Query agent tier
    results += query_tier(Tier.AGENT, query, k)
    if len(results) >= k:
        return results[:k]  # Early exit
    
    # Step 2: Query user tier (if v1.5+)
    remaining = k - len(results)
    results += query_tier(Tier.USER, query, remaining)
    if len(results) >= k:
        return results[:k]
    
    # Step 3: Query project tier (if v1.5+)
    remaining = k - len(results)
    results += query_tier(Tier.PROJECT, query, remaining)
    
    return results[:k]
```

**Key Properties:**
- **Sequential fan-out:** Each tier is queried only if prior tiers didn't satisfy `k`
- **Early exit:** Stop as soon as `k` results are found (don't over-fetch)
- **No cross-DB queries:** FR-7.2 explicitly bans `ATTACH` at runtime; tiers are resolved in application code
- **Merge strategy:** Results from multiple tiers are concatenated, not de-duplicated (facts have unique `FactId`s per tier)

**Performance Target (FR-7.2):** P95 < 50ms per tier query (total recall latency ~150ms worst-case for 3-tier fan-out).

---

### Tier-Activity Matrix

| Activity      | Agent Tier | User Tier | Project Tier | Org Tier |
|---------------|------------|-----------|--------------|----------|
| `integrate`   | ✅ v1      | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `recall`      | ✅ v1      | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `rerank`      | ✅ v1      | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `decide`      | ✅ v1      | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `commit`      | ✅ v1      | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `retire`      | ✅ v1      | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `evict`       | ✅ v1      | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `meditate`    | ⚠️ v1.5    | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |
| `contemplate` | ⚠️ v1.5    | ⚠️ v1.5   | ⚠️ v1.5      | ❌ v2+   |

**Legend:**
- ✅ **v1**: Fully implemented and tested
- ⚠️ **v1.5**: Specified but not implemented (throws `NotImplementedError`)
- ❌ **v2+**: Out of scope (not specified)

---

### Tier Write Authority and Conflict Resolution

**Write Authority:**
- Each tier has a **single writer**: the agent/user/project that owns that scope
- No multi-writer concurrency in v1 (agent tier is single-threaded per agent instance)
- User/project tiers (v1.5+) will require write locks or CAS operations to prevent conflicts

**Conflict Resolution (v1.5+ design note):**
- If two agents simultaneously call `integrate()` at user tier, last-write-wins (LWW) by `createdAt` timestamp
- Conflicts are detected via unique constraint on `(kind, verb, content)` tuple (FR-2 deduplication rule)
- On conflict, newer fact overwrites older fact, and `trust` is averaged: `trust_new = 0.5·trust_old + 0.5·trust_incoming`

**Open Question for v1.5:**
- Should tier conflicts bubble up as errors, or silently merge? (Current design: silent merge with trust averaging)

---

## §10.3. Crucible Coordination Boundary

Eureka and Crucible (GitHub's internal memory system) share architectural kinship but serve **different missions**:

- **Eureka:** Epistemological ("What did I learn? What do I know?")
- **Crucible:** Operational ("What happened? What was tried?")

Both systems consume the same **Cairn** (session lifecycle) and **Forge** (decision logging) substrate.

### Shared Substrate: SessionId Brand (FR-13)

**Coordination Mechanism:**
- Both Eureka and Crucible use a shared `SessionId` branded type (UUID v4) from `@akubly/types`
- This brand links operational traces (Cairn) with epistemological artifacts (Eureka) for the same session
- Required on `kind=session` facts in Eureka
- ESLint guardrail (FR-12 mechanism #8) prevents cross-system type imports except for shared brands

**Normative Framing (from R8 amendment):**
- Cairn: "What happened?" (lifecycle, events, traces)
- Eureka: "What did I learn?" (knowledge, patterns, insights)
- Both views are first-class; neither is derivative

### G4 Protocol for Substrate Changes

**Governance Rule (from `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md`):**

> **G4 (Shared Substrate Changes):** Any change to Cairn, Forge, or `@akubly/types` that affects both Eureka and Crucible requires:
> 1. Cross-project design review (Genesta + Crucible architect)
> 2. Backward-compatibility check (can Eureka v1 coexist with Crucible v1?)
> 3. Dual sign-off before merge

**Rationale:** Both projects are in-flight; unilateral substrate changes risk breaking the other system.

**Example:** When SessionId brand was added to `@akubly/types` (R8), it was reviewed by both Genesta (Eureka) and Crucible lead to ensure no namespace collisions or type conflicts.

### Non-Overlap: Sweep Mechanics

**Similarity:** Both Eureka (`meditate`, v1.5) and Crucible (Curator sweep) have "broad traversal" semantics for pattern detection.

**Difference:**
- **Eureka sweep:** Epistemological (find latent knowledge patterns, surface insights)
- **Crucible sweep:** Operational (prune old sessions, compress traces, enforce retention policy)

**No Coordination Needed:** These are parallel mechanics with different data models; no shared code or API surface.

---

## §10.4. Open Questions for Edgar (Implementation Lead)

These are **semantic ambiguities or unspecified behaviors** that require Edgar's engineering judgment or PRD amendment:

1. **`integrate()` Deduplication:**
   - Does `integrate()` run deduplication checks before inserting? If yes, what's the key? `(kind, verb, content)` tuple per FR-2?
   - If duplicate detected, should we update existing fact (refresh `lastAccessedAt`) or skip insertion?

2. **`recall()` Attention Side Effects:**
   - Does `recall()` update attention state for *all* returned facts or only the top-n actually consumed by caller?
   - If caller requests `k=50` but only reads the first 5, do all 50 get access count incremented?

3. **`rerank()` Filtering:**
   - Can `rerank()` filter out facts below trust threshold, or must it return all input facts?
   - Same composite score formula as `recall()`, or different weighting?

4. **`decide()` Fact Integration:**
   - Does `decide()` automatically call `integrate()` to store the decision as a fact, or is that the orchestration code's responsibility?
   - If Forge write fails, should `decide()` throw (fail-fast) or log + return partial result?

5. **`commit()` Trust Semantics:**
   - Can `commit()` *lower* trust (e.g., user corrects an over-confident fact), or is it upgrade-only?
   - Should we enforce monotonic trust increase to prevent oscillation?

6. **`retire()` Reversibility:**
   - Can retired facts be un-retired (e.g., `resurrect(factId)` verb), or is retirement permanent?
   - Should `retire()` cascade to facts that reference the retired fact as provenance?

7. **`evict()` Orphan Handling:**
   - Should `evict()` validate that no other facts reference the target fact before deleting?
   - Or is it caller's responsibility to ensure referential integrity?

8. **Tier Merge Strategy:**
   - When `recall()` combines results from agent + user tiers, how are they merged? Concatenate? Interleave by score?
   - Do we de-duplicate by `FactId` (facts should be unique per tier, but edge case: user tier fact manually copied from agent tier)?

9. **SessionId Optional vs. Required:**
   - FR-13 says `sessionId` is required for `kind=session` facts but optional otherwise. Should `integrate()` validate this, or is it a schema-level constraint?
   - What happens if caller passes `sessionId` on a non-session fact? (Ignore? Warn? Throw?)

10. **v1.5 User/Project Tier Write Path:**
    - When implementing user/project tier writes, what's the locking strategy? File-level locks? SQLite `BEGIN IMMEDIATE`?
    - Should we surface write conflicts to the caller, or silently merge with trust averaging?

---

## §10.5. Summary

**Activities:** Eureka v1 exports 7 verbs (`integrate`, `recall`, `rerank`, `decide`, `commit`, `retire`, `evict`) plus 2 reserved v1.5 verbs (`meditate`, `contemplate`). Each activity has defined inputs, outputs, side effects, and tier scope.

**Tiers:** Eureka v1 implements agent tier only; user and project tiers are reserved but return empty/throw on access. Resolution is sequential fan-out (agent → user → project) with early exit at `k` results.

**Coordination:** Eureka and Crucible share `SessionId` brand via `@akubly/types`; substrate changes require G4 dual sign-off. No API surface overlap.

**Open Questions:** 10 semantic ambiguities flagged for Edgar's implementation judgment.

---

**Next Steps:**
1. Edgar reviews open questions and either resolves via implementation judgment or escalates to PRD amendment
2. Crispin (QA) writes acceptance tests for each activity's side effects and tier resolution behavior
3. Genesta (this author) reviews Edgar's implementation for semantic alignment with this spec

**Dependencies:**
- `@akubly/types` (SessionId brand, Fact type)
- Cairn (session lifecycle substrate)
- Forge (decision logging substrate)
- sqlite-vec (v1.5 dependency for semantic search in `meditate`)
