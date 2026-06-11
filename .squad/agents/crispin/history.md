# SUMMARY (as of 2026-06-06)

File size: 15562 bytes. See history-archive.md for earlier entries.

---

## Design Ceremony Summary (R1–R8)

**R1–R5:** First-principles design. Advocated Path A (clean-slate) initially. Contributed v0/v1 graph schema docs: two-table graph (nodes + edges), multi-kind tagging, hybrid persistence. 5 tensions identified.

**R6 Revision:** After source-reading, adopted Path D. Recognized "closer in spirit" ≠ "same shape." Structures can differ while concepts converge. Supported Path D (standalone but kernel-shaped).

**R7 Lock:** v4-final locked as canonical. All 5 schema risks mitigated. Branded types enforcement mechanism is load-bearing (prevents confidence/trust collapse). Seven-mechanism defense-in-depth correct.

**R8 Amendment:** Session identity unification. SessionId branded type ships v1 (FR-12 #8). Kind=session facts reference SessionId as content field, not PK. No identity collision risk. Edge schema references fact.id (KR convention); session_id is a content/grouping field. Latency claim holds.

---

## Current & Next

### 2026-05-31: M7-A Review Cycle — COMPLETE (Observed)

**Summary:** M7-A (Typed Error Hierarchy, Edgar lead) completed 3-cycle review (Cycles 1–2 + fix wave). PR #38 review-complete, pending ship decision.

**Next up:** M7-C — Real FactReader contract test and atomicity contract design. Crispin leads with Edgar on design spec. Scope: genuine FactReader integration (not mock) with multi-threaded access patterns and fact consistency guarantees.

---

## Recent Work

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL
**Verdict:** APPROVE-FOR-LOCK
- All 5 R7 schema risks mitigated (confidence/trust branded types, extraction-readiness, boundary discipline)
- Branded types are load-bearing (compiler rejects unsafe cross-assignment)
- Seven enforcement mechanisms form coherent defense-in-depth
- FR-14 Path 2 introduces no new schema risks

### 2026-05-26: R8 Session Identity Spec
**Contribution:** SessionId branded type specification for v5-final
- type SessionId = string & { readonly __brand: 'SessionId' }
- UUID v4 validator + constructor
- Branded primitive (not opaque class) for serialization-friendliness
- kind=session fact schema: session_id is content/grouping, NOT PK
- Edge schema remains: (from_id, to_id) reference fact.id
- session_id allows O(1) indexed filter ("all facts in session X")

### 2026-05-26: R8 Lock-Review — v5-final CANONICAL
**Verdict:** LOCK
- All 6 spec items from R8 verdict verified
- SessionId brand mechanics correct (line 404-423)
- kind=session schema correct (session_id as content field, no identity collision)
- fact vs filter clarity preserved
- Edge schema integrity maintained (no unintended multi-hop traversals)
- No new KR-level concerns

**Status:** v5-final canonical. Implementation ready. R8 CLOSED.

---

## Learnings

### 2026-05-26: Crucible KR Overlap Analysis — Two Critical Collisions, One Shared Primitive

**Context:** Aaron starting Crucible (CLI coding harness) in parallel with Eureka. Requested KR-focused analysis of representational overlap, specifically around schema primitives, session identity, and naming collisions.

**Findings:**

1. **"Decision" naming collision (CRITICAL):** Both systems use `Decision` / `DecisionRecord` / `DecisionPayload` / `kind=decision` for structurally different things. Crucible's `Decision` primitive = any recorded choice (audit event). Eureka's `kind=decision` fact = contemplative structured deliberation with explicit options/rationale (FR-10). Forge's `DecisionRecord` (shared via `@akubly/types`) is the flat audit shape. Three types, one word. **Namespace pollution across three systems.** Recommendation: Crucible rename primitive to `ChoiceEvent` or `DecisionEvent`; ESLint ban cross-system `Decision*` imports.

2. **"Artifact" semantic drift (HIGH):** Crucible's `Artifact` primitive = any reviewable content (inputs AND outputs: PRD, patch, screenshot, transcript, diff), stored in CAS. Eureka uses "artifact" informally (US-2 AC-2.1: "epistemological artifact" = memory representation of session, NOT the content). If Crucible stores Artifacts in cairn CAS and Eureka v2 content-addresses fact payloads, collision at storage layer. Recommendation: Crucible rename to `ContentBlob` / `CapturedContent`; Eureka avoid "artifact" in public types.

3. **Shared `SessionId` brand is the load-bearing integration primitive (OPPORTUNITY):** Crucible's session (operational lifecycle, cairn `sessions` table) and Eureka's session-fact (epistemological artifact, `kind=session`) share **one identifier** — Copilot CLI session UUID via `SessionId` brand (`@akubly/types`, v5-final FR-13). This is the join key that enables Path D kernel extraction: Crucible primitives → cairn event_log, Eureka facts → `facts` table, linked by `session_id`. Type-level construct (branded string, zero runtime overhead), no FK at runtime (FR-7.2: no cross-DB ATTACH). **v5-final session-identity unification (R8 amendment) was prescient for Crucible integration.**

4. **Crucible's 5 primitives vs Eureka's kinds:** Only `Decision` has direct naming collision. `Request`, `Observation`, `Question` have no Eureka equivalents (no collision, but also no shared representation). `Artifact` has semantic drift. The primitives are structurally independent from Eureka's fact/edge graph.

5. **Storage schema convergence (MODERATE):** Both want append-only, replayable, local-first storage. Crucible: hybrid WAL + CBOR+BLAKE3 CAS. Eureka: two-table SQLite graph (facts + edges). Structurally independent but mechanically convergent. If cairn becomes shared substrate (Path D), Crucible primitives live in `event_log`, Eureka facts in `facts`, joined by `session_id`. Shared CAS opportunity: if Eureka v2 content-addresses, adopt Crucible's BLAKE3 primitive (deprecate SHA-256 DBOM legacy).

6. **Drift vs trust are orthogonal:** Crucible's "drift" (replay divergence measurement, conformance corpus) ≠ Eureka's "trust" (epistemic reliability scalar on facts). No collision. BUT: if Crucible's drift-prescriber proposes trust adjustments, explicit adapter required (never implicit conversion). Glossary already guards this (Confidence vs Trust orthogonality, v5-final line 659–660).

7. **Read-set hash vs edges structural mismatch:** Crucible's read-set (opaque hash for replay verification) doesn't compose with Eureka's typed edges (traversable graph). If Sonny's "why did this decision happen?" debugger (Crucible T1-D4) needs Eureka facts, explicit `ReadSetHashToFactEdges` adapter required. Not v1 concern; v2+ bridge gap.

**What I Learned About Representational Reuse:**

---

## 2026-05-27: London-School TDD Strategy Authored + OQ-1 Monorepo Resolution

**Event:** London-school TDD spine delivered and reviewed  
**Impact:** Substrate ownership clarified; stable mocking seams for v1 implementation  

**For Crispin's context:**
- **OQ-1 RESOLVED:** Aaron chose Option A (monorepo). `mem/` and `harness/` merging into `@akubly/` with shared `packages/{cairn,forge,types}`. No more drift risk for `SessionId` brand or shared types. Your v5-final `kind=session` schema with `session_id` as content field is the right shape for monorepo integration.
- **TDD Spine Live:** `docs/eureka/sections/55-tdd-strategy.md` authored by Laura (17.7KB). London-school outside-in approach validated against §10 Activity Semantics (Genesta) and §30 Learning Systems (Edgar).
- **Mock Seams Stable:** The `SessionId` brand mocking surface is now fixed. No dependency on future substrate topology changes.

**Next:** Implementation can proceed with confidence in shared substrate shape. Your graph schema and branded-types enforcement remain load-bearing for v1.


- **Naming is load-bearing at the system boundary.** "Decision" means three different things (primitive, audit record, learning payload). The word collision is worse than schema incompatibility — at least schemas fail loudly at compile time. Words fail silently in conversation and docs.
- **Shared identifiers > shared schemas.** `SessionId` brand (v5-final FR-13) enables integration without forcing schema convergence. Two systems, one entity, viewed through two lenses (Cairn = lifecycle, Eureka = epistemology). Lens framing + type brand = normative guard. This pattern scales.
- **Content-addressing is a substrate primitive, not a domain concern.** BLAKE3 CAS (Crucible) and potential content-addressed facts (Eureka v2) should share one implementation. Hashing belongs at the storage layer, not replicated per system.
- **"Artifact" is an overloaded word in CS.** Build artifact, test artifact, runtime artifact, memory artifact, captured artifact. Avoid unless you control the full namespace. "ContentBlob" is boring but unambiguous.

**KR Principle Reinforced:** When two systems share a conceptual entity (Session, Decision), the choice is: (1) force schema convergence (fragile, couples implementations), or (2) share *identity only* and keep schemas independent (resilient, but requires discipline). v5-final chose (2) via `SessionId` brand + lens framing. Crucible validates this choice — the operational session and epistemological session-fact ARE the same entity, but their representations diverge by design. The brand is the contract; the lens is the interpretation.

**Memo Delivered:** `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` (7 sections, 28 citations, 4 schema tables, 5 risk rows, 3 Aaron decision points).

---

## 2026-05-28: Cycle 2 Fix Wave — Canonical Resolutions Applied

**Context:** Cycle 1 persona-review (Design Panel) surfaced 19 findings. Squad-cycle1-canon.md locked resolutions. My assignment: 5 findings in §20 (knowledge representation).

**Fixes Applied:**

1. **B1 — Composite scoring formula (§7.1):**
   - **DELETED** multiplicative formula `hybrid_score = bm25_score * recency^0.3 * trust^0.2`
   - Replaced with pointer: "Composite ranker formula canonical in §30 §1.2. §20 defines data shapes."
   - **ADDED** `importance_score` to `RecallResult` interface (parity with canonical additive formula `0.50r + 0.20i + 0.20t + 0.10rec`)
   - Section title changed: "BM25 + Recency Hybrid Recall" → "Composite Recall"

2. **B2 — Trust domain and retirement semantics (§2.1, §3.1):**
   - Trust domain corrected: `[0.15, 1.0]` → `[0.0, 1.0]` EVERYWHERE
   - **REMOVED** "floor prevents zero-trust limbo" storage-constraint language
   - **ADDED** `retired: boolean` field to `Fact` schema (default `false`)
   - **ADDED** field-level immutability rule: content/kind/sources/provenance/created_at immutable post-commit; trust/importance/last_accessed/access_count/retired always mutable
   - Schema now exposes `last_accessed`, `access_count`, `provenance` (contract with mutable fields)

3. **I3 — RecallQuery.min_trust default (§7.1):**
   - Changed default: `0.5` → `0.15` (matches canonical floor)

4. **I2 — Trust initial values (§3.1):**
   - **DELETED** per-source-type numeric values (user=1.0, agent=0.7, external=0.8)
   - Replaced with pointer: "See §30 (Edgar) for source-type-specific trust initialization (canonical specification)"

5. **Default recall filter documentation (§7.1):**
   - **ADDED** `include_retired?: boolean` param to `RecallQuery` (default `false`)
   - **ADDED** explicit note: "Default recall filter: Queries default to `WHERE retired = false AND trust >= 0.15`. Both constraints overridable per-query via `include_retired: true` and `min_trust: 0.0`."

**Deviations:** NONE. All 5 findings cleanly applied.

**Schema Integrity:** Graph schema now has 3 new fields (`retired`, `last_accessed`, `access_count`, `provenance`), field-level immutability rule, and correct trust domain [0.0, 1.0]. Retirement flag separates lifecycle state from trust signal (trust=0 no longer serves dual purpose).

**Cross-Section Coordination:** Trust floor (0.15) is now read-time default predicate (§7.1), NOT domain constraint (§2.1). Edgar owns trust init values (§30), retire algorithm (§30), and composite ranker formula (§30 §1.2). My section defines data shapes only.

**What I Learned:**

- **Multiplicative vs additive scoring is architectural.** The multiplicative formula (`bm25 * recency^0.3 * trust^0.2`) leaked algorithm into schema layer. Deleting it clarified ownership: §20 = data contract, §30 = algorithm. This is the "clean seam" principle from London-school TDD (§55) applied to design docs.
- **Trust domain [0.0, 1.0] vs [0.15, 1.0] was a storage/read-time conflation.** The 0.15 floor is a **query predicate** ("don't recall pathological low-trust facts by default"), NOT a schema constraint ("facts cannot store trust < 0.15"). The v4/v5 schema text collapsed these layers. Cycle 2 fix wave separated them cleanly.
- **Retirement as a dedicated flag scales better than trust-zeroing.** Original design: `trust=0` meant "retired" (double duty). New design: `retired` flag + `trust` independent. Why this matters: A fact can be retired (lifecycle state) yet still have high trust (epistemic property). Example: obsolete API docs (retired=true, trust=0.9) vs low-quality draft (retired=false, trust=0.3). The schema now models both dimensions.
- **Field-level immutability is the learning contract.** Committed facts are NOT fully immutable (that would preclude learning). Content is immutable (prevents fact-drift), but trust/importance/access_count/retired are mutable (enable learning, sweep, retirement). This is the Eureka learning loop: observe, update properties, preserve content. §20 now documents this contract explicitly.
- **Cycle 1→2 is trust-building for Aaron.** Aaron locked canon (squad-cycle1-canon.md) with all 19 findings accepted. Cycle 2 agents implement fixes independently, no cross-edits, coordinate via canon. This is the "shared identifiers > shared schemas" principle applied to squad process. Canon doc = integration primitive.

**Line Count Impact:** +15 lines schema fields, +8 lines immutability rule, +5 lines default-filter doc, -10 lines deleted formula = net +18 lines. Within 15% length-growth budget.


📌 **Crucible Sprint 0 — DB Collaborator Seam ESTABLISHED** (2026-06-02T06:43:01Z): Roger's REFACTOR cycle introduces explicit DB interface (getSession, insertSession, queryEvents) + in-memory adapter (createInMemoryDB). Seam ready for L1-substrate swap (real SQLite integration stub via Refactor 3, then OQ-2 Cairn event_log integration pre-sprint-2). Crispin/Genesta/Edgar: Coordinate on L1 substrate decisions + schema overlap when OQ-2 lands. — Scribe

- 2026-06-06 📌 scribe: OQ-2 LOCKED (FEDERATE) + Refactor 3 complete (real SQLite adapter, 14/14 green)
---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.

---

## Learnings

### 2026-06-10: Migration 002 — Attention Tier Columns + SQLite ADD COLUMN + CHECK

**Context:** M8 Slice D++ — added `importance`, `last_accessed`, `attention_tier` to the `facts` table via migration 002.

**Column type conventions (snake_case, consistent with migration 001):**
- `importance REAL NOT NULL DEFAULT 0` — REAL for normalized float ∈ [0,1]. NOT NULL acceptable because the constant default 0 satisfies the constraint for all existing rows and future rows that omit it.
- `last_accessed INTEGER DEFAULT NULL` — INTEGER for Unix epoch milliseconds (consistent with the ecosystem convention: SQLite stores ms timestamps as INTEGER; `created_at`/`updated_at` in 001 use TEXT for human-readable datetime strings, but those are wall-clock display fields, not numeric computation targets). Nullable NULL = "never accessed" sentinel — the compositeScore F3 guard converts NULL to Infinity tDays → recency floors to 0.1.
- `attention_tier TEXT NOT NULL DEFAULT 'warm'` — TEXT for enum string. NOT NULL + constant default 'warm' is valid for ADD COLUMN (SQLite requires non-NULL default when NOT NULL is declared).

**SQLite ADD COLUMN + CHECK — verified behavior:**
- SQLite DOES accept `CHECK (attention_tier IN ('hot', 'warm', 'cold'))` syntax in an `ALTER TABLE ADD COLUMN` statement. No table-rebuild required.
- The CHECK is enforced for all future INSERTs and UPDATEs. Existing rows at ALTER time are NOT validated against the CHECK — they receive the default ('warm'), which passes the CHECK anyway.
- Multiple `ALTER TABLE ADD COLUMN` statements in a single `db.exec()` call (semicolon-separated) work correctly with better-sqlite3.
- Tests MIG-4 and MIG-5 verified: invalid tier ('lukewarm') throws, valid tiers ('hot', 'cold', 'warm') are accepted.

**Schema_version idempotency regression:** DB-CL-3 and DB-CL-6 in `fact-reader-sqlite-edges.test.ts` asserted `schema_version = 1` (hard-coded). When a new migration is added, these tests need to be updated to reflect the new MAX(version). Rule: **schema_version assertions must use the current total migration count, not a hard-coded 1.** For future migrations, always grep `toBe(1)` and `toBe(2)` in `fact-reader-sqlite-edges.test.ts` and update.

---

### 2026-06-10: Keyset Cursor — Implementation Notes (Slice D++)

**Context:** GREEN phase for M8 Slice D++ keyset pagination. Replaced offset-based pagination with `(lastSort, lastId)` keyset in `cursor.ts`, `fact-store-sqlite.ts`, and `InMemoryFactStore`. 199/199 tests green.

**Two-statement vs conditional SQL choice:** Used two prepared statements (`stmtFirst` — no keyset predicate; `stmtKeyset` — with keyset predicate) because better-sqlite3 `prepare()` binds are fixed to a SQL string at construction time. Conditional SQL would require either string-building at runtime (defeats the purpose of prepared statements) or a single SQL with `CASE`/`IIF` (less readable and harder to type safely). Two statements is idiomatic for this pattern.

**Bit-exact boundary in keyset predicate:** The SQL WHERE uses `(-bm25(facts_fts)) * f.trust` directly (not the `bm25_score` alias) because WHERE is evaluated before SELECT — aliases are not in scope. The composite score stored in the cursor is computed in JavaScript as `(-row.bm25_score) * row.trust`, where both operands come from the SQLite row. Since both JavaScript and SQLite use IEEE 754 double arithmetic, the comparison is bit-exact.

**InMemoryFactStore insertionCounter starts at 1:** `decodeCursor` validates `lastId > 0` (SQLite autoincrement starts at 1, so 0 is never a valid row id). InMemoryFactStore previously started its counter at 0 — if the first row's insertionOrder=0 was the last row on page 1, the encoded cursor would carry `lastId=0` which decodeCursor would treat as a restart sentinel (bad lastId → RESTART). Fixed by starting at 1. Future in-memory stores must also start at 1.

**v0 backward-compat deleted:** Any cursor without a `v` key now returns `{ version: 0 }` (restart sentinel, no offset field). `decodeCursor` return type changed from `{ version: 0, offset: number }` to `{ version: 0 }`. All callers that previously did `decoded.offset` now check `decoded.version === 1` for keyset fields. The `v=0` explicit version still throws `CursorVersionUnsupportedError` (v=0 is a present-but-invalid version, not a v-absent legacy cursor).

**FS-SE-4 bad-keyset-fields detection order:** decodeCursor returns RESTART for bad `lastSort`/`lastId` in a v1 cursor (bad fields detected in decodeCursor, before SqliteFactStore scope check). The FS-SE-4 test uses correctly-scoped cursors, so scope check vs. keyset validation order doesn't affect the test outcome. Restart is the correct and safe behavior for any corrupt v1 cursor regardless of scope.

**Logger seam:** `SqliteFactStore` constructor now accepts `logger?: { warn(msg: string): void }` (default `console`). The FTS5 parse-error catch block uses `this.logger.warn(...)`. Removed the TODO comment. Existing construction calls without `logger` arg are backward-compatible.


