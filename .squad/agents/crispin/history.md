> Older entries archived to history-archive.md on 2026-06-09. This file holds recent context.

## Eureka Knowledge Representation + Cycle 2 Canonicalization

**Role:** Knowledge Representation architect

**Recent Work (2026-05-28):**

**Cycle 2 Fix Wave — 5 findings in §20 applied:**
1. Composite scoring formula moved to §30 (algorithm), §20 defines shapes only
2. Trust domain corrected: `[0.15, 1.0]` → `[0.0, 1.0]`; 0.15 is read-time predicate, not constraint
3. Added `retired: boolean` field; separates lifecycle from trust signal
4. Field-level immutability rule: content immutable, trust/importance/access_count/retired mutable
5. Default recall filter documented explicitly

**OQ-1 Monorepo Resolution (2026-05-27):**
- Aaron chose Option A (monorepo). `mem/` + `harness/` → `@akubly/` with shared `packages/{cairn,forge,types}`
- v5-final `kind=session` schema with `session_id` as content field is correct shape
- `SessionId` brand enables integration without schema convergence — lens framing + type brand

**Key Learnings:**
- **Naming is load-bearing at system boundaries.** "Decision" collision worse than schema incompatibility (schemas fail loudly at compile time; words fail silently).
- **Shared identifiers > shared schemas.** Two systems, one entity, two independent lenses (Cairn = lifecycle, Eureka = epistemology). Crucible validates: operational session and epistemological session-fact ARE same entity, representations diverge by design.
- **Field-level immutability is the learning contract.** Committed facts not fully immutable; content preserved, properties (trust/importance/retired) mutable for learning loop.
- **Cycle 1→2 trust via shared canon.** Canon doc = integration primitive for independent implementation + coordination.
