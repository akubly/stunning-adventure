# 📌 Laura — Recent Session Summary
# SUMMARY — Last Updated 2026-06-07T06:03Z (Size: 144911 bytes → see history-archive.md for entries before 2026-06-01)

📌 **M8 Slice C audit complete** (2026-06-05): Audited Roger's `SqliteFactStore` (FTS5 BM25 search, cursor pagination, minTrust floor, session isolation). Verdict: ✅ ACCEPT-WITH-FOLLOWUPS. Added `fact-store-sqlite-edges.test.ts` (12 new tests, FS-SE-1..12). Test count: 109 → 121. Key learnings:

## Core Context

**Load-bearing patterns for future work:**
- **Contract-first testing:** Inline contract implementations before real modules. Switch imports with zero test changes; behavioral divergence surfaces immediately.
- **Field-level immutability (Eureka v1):** Committed facts have immutable content/kind/sources/provenance/created_at; mutable trust/importance/access_count/retired. Row-level "read-only" was false abstraction.
- **London-school side-effect assertions:** Return-value tests miss side-effects (accessCount++, lastAccessedAt, attention). Explicit side-effect assertions force learning contracts to be honored.
- **Metamorphic regression testing:** Test response curves (hint↓ as drift↓), not terminal states. L5 tests catch O(N) regressions; constant alignment tests prevent silent divergence.
- **Lockout rule for defects:** Author cannot fix own defect. Three-phase triage (find/decide/fix) divides ownership, improves quality.
- **Cross-boundary contracts:** Type arrays at compile time (forge category renames trigger CI errors); runtime round-trip assertions verify bidirectional consistency.
- **Cursor state tracking:** INSERT OR IGNORE idempotence: assert `alreadyComputed` on _second_ curate() call, not first.
- **SDK testing:** Unit tests use mocks; integration tests require live Copilot CLI process.

**Dependencies:** Eureka design package locked (2026-05-28); §55 TDD strategy now canonical. M1 implementation depends on side-effect test patterns taught in §55 §2.6.

## 2026-06-11: Crucible S1 WAL Correctness — Landing Notification (from Roger)

**Event:** S1 WAL correctness batch landed on squad/crucible-wal-correctness-s1. Circulating for S2 planning:
- **#57**: Verdict encoding (null vs continue) -> 0xFF/0x00 encoding now stable
- **#60**: Canonical CBOR hashing via wal/cbor.ts (deterministic serialization locked)
- **#68**: CAS torn-blob mitigation (temp-file + atomic rename replaces existsSync-skip dedup)

**Metrics:** 136/136 tests green (+8 new), tsc --build clean. Skills extracted: atomic-cas-write, canonical-cbor-hashing.
Impact for S2: WAL substrate hardened; Phase 0.5 walking skeleton can proceed with confidence in blob atomicity and CBOR determinism.

**2026-06-12:** Crucible S1 WAL Correctness — 2-cycle persona review COMPLETE, ship-ready (Scribe).

## 2026-06-10: M8 Slice D++ Shipped to Branch

**Session:** M8 Slice D++ keyset pagination (quad spawn)  
**Branch:** eureka/m8-slice-dpp-keyset  
**Status:** ✅ SHIPPED

Slice D++ completed with four-agent parallel execution. Genesta's architecture memo locked three interlocked decisions on cursor design, schema migration, and normalization strategy. Laura wrote 22 RED keyset tests. Crispin implemented migration 002, keyset GREEN phase, and persona fixes (cycle 2 clean). Roger completed doc sweep (N1-N4 stale comment fixes).

**Decisions locked:** D1=mutate cursor v1 in place to keyset; D2=importance/lastAccessed NOT in SQL sort key (time-varying recency breaks stability); D3=per-page normalization status quo. FSE-2 guarantee corrected: INSERT-safe only (not trust-mutation-safe).

Ready to merge.

---

## HISTORY SUMMARIZATION — 2026-06-11

**File size at session close:** 
- laura/history.md: 157,469 bytes (→ exceeds 15,360 threshold; summary appended)
- crispin/history.md: 24,816 bytes (→ exceeds 15,360 threshold; summary appended)
- roger/history.md: 168,012 bytes (→ exceeds 15,360 threshold; summary appended)

### High-Level Summary (All Recent Work)

**Laura (Tester):**
- M8 Slice C audit (SqliteFactStore + FTS5 BM25): ✅ ACCEPT-WITH-FOLLOWUPS (121 tests)
- Crucible WAL Walkthrough B acceptance testing: ✅ COMPLETE (hook-veto RED→GREEN)
- M8 Slice D++ keyset pagination RED tests: ✅ 22 tests written (cursor v1 mutation, FSE-2 closure)
- Key learnings: FTS5 sign convention, per-page normalization, cursor pagination with concurrent inserts

**Crispin (KR Specialist):**
- Design Ceremony R1–R8: Advocated Path A initially, adopted Path D post-source-reading, locked v4-final schema
- M7-A review cycle: Observed (Edgar lead); M7-C next (Real FactReader contract)
- M8 Slice D++ implementation: Migration 002 + keyset GREEN + persona fixes (cycle 2 clean)
  - Migration 002: importance/lastAccessed/attentionTier columns (NOT in SQL sort key)
  - Keyset: v1 mutated in place, encodeCursor object param, logger seam threaded
  - FSE-2 corrected: INSERT-safe (no dupes), NOT trust-mutation-safe

**Roger (Platform Dev / Doc):**
- PR #58 Copilot review cycle-6: hook-veto.test.ts comment polish, HookBus docs
- PR #58 cycle-4: timestampNs monotonicity (clock seam), replay validation, CAS header doc
- PR #58 cycle-3: session-scoped manifest (isolation fix), short-write guard, codec recordLen validation
- PR #58 cycle-2: Node engine bump to 20.19.0, ESM compatibility docs
- PR #58 final: gitignore polish, inbox path citations swept
- Crucible WAL Walkthrough B: hash-chain + CAS + codec + ledger seam (28/28 green)
- M8 Slice A cycle-2 fixes: busy_timeout, WAL pragma, BEGIN IMMEDIATE, subpath export (75 tests)
- M8 Slice D++ doc sweep: N1-N4 stale comment fixes (keyset, migration, cursor versioning)

**Append-Only Rule Applied:** All prior entries remain unchanged. This summary provides high-level context only.

---

### 2026-06-10: M8 Slice D++ — Keyset Pagination RED Tests

**Context:** Wrote the RED test surface for the keyset pagination migration (FSE-2 closure, cursor v1 payload change from `{offset}` to `{lastSort, lastId}`). London-school TDD RED phase — no implementation changes, tests written against the new contract and confirmed failing for the right reasons.

**Files modified:**
- `packages/eureka/src/storage/__tests__/cursor.test.ts`
- `packages/eureka/src/storage/__tests__/fact-store-contract.helper.ts`
- `packages/eureka/src/storage/__tests__/fact-store-sqlite-edges.test.ts`

**Test count delta:** 129 -> 150 (22 new/updated tests RED, 107 existing unchanged GREEN).

**RED tests written:** CU-1a/b/c (v0 absent -> restart sentinel), CU-2a (3-arg round-trip), CU-2c-g (bad lastSort/lastId -> restart), CU-4a/b/c (garbage -> {version:0}), FS-5b (v0 offset -> restart), FS-10a (cursor format), FS-10f DELETED, FS-11 (FSE-2 concurrent-insert), FS-SE-4 (bad keyset fields), FS-SE-15 (lastSort/lastId required).

**FSE-2 test design:** Term-frequency-based scoring makes ranks deterministic across InMemory (term count x trust) and Sqlite (BM25 x trust). Seeded C with 4x term frequency after page 1 (ranks above A 3x); offset impl returns A on page 2 (dup), keyset returns B correctly.

**Note:** This entry was relocated to the file end during PR #72 cloud review to honor the Append-Only History Rule (it had been inserted mid-file during the RED phase).

— Laura

---

## 2026-06-13: Crucible S2b — prior-rows-survive-veto (Issue #61)

**Task:** Walkthrough B, Issue #61 — pin the invariant that a veto on a non-empty ledger leaves prior rows untouched.

**Status:** ✅ GREEN (2 new tests pass; 165/165 total pass)

**File modified:** `packages/crucible-core/src/__tests__/acceptance/hook-veto.test.ts`

**Invariant pinned:**
> When a session already has N committed rows and a hook VETOes row N+1, exactly N rows remain — vetoed row absent, prior rows intact and unmodified, hash-chain head unchanged.

**Test design:**
- Added `runPriorRowsSurviveVetoSuite(implName, makeHarness)` — a parametrized suite wired for BOTH `InMemoryWalBackend` and `FileSystemWalBackend` (batchSize:1 for immediate flush on FS backend).
- Hash-chain head captured via `backend.readSegmentRecords()[last].selfRoot` (Uint8Array, 32 bytes) immediately before the vetoed `append()` call.
- Post-veto: assert `selfRoot` is byte-identical to pre-veto snapshot using a `uint8Equal()` helper.
- Also asserts: `queryEvents` returns exactly N rows; each row has correct offset, primitiveKind, and primitivePayload; `readSegmentRecords()` still has exactly N records.
- `FileSystemWalBackend` harness uses `createFileSystemWalBackend(rootDir, sessionId, { batchSize: 1 })` so all commits are immediately durable and readable via `readSegmentRecords()`.

**Key file paths:**
- Test file: `packages/crucible-core/src/__tests__/acceptance/hook-veto.test.ts`
- Hash-chain side channel: `InMemoryWalBackend.readSegmentRecords()` / `FileSystemWalBackend.readSegmentRecords()`
- Type: `SegmentRecord.selfRoot: Blake3Hash` (Uint8Array, 32 bytes) in `src/ledger/wal/types.ts`

**Learnings:**
- `readSegmentRecords()` is a side-channel on the concrete backend implementations (not on the `WalBackend` interface). Cast via `as unknown as BackendWithRecords` when going through the interface boundary.
- FS backend with `batchSize: 1` resolves `commitRow` immediately (no explicit `flush()` needed before `readSegmentRecords()`).
- The veto gate fires in `LedgerImpl.append()` BEFORE `walBackend.commitRow()` is called; the implementation is already correct — both tests are GREEN from the start (behavior was correct as expected per issue #61 spec).

## 2026-06-14T06:10:36Z — Crucible S2 Shipped

✓ Issue #61: Prior-rows-survive-veto edge test (parametrized over InMemory+FileSystem)  
✓ Pattern: Acceptance-level test with layer-separation contract  
✓ Decisions merged into decisions.md  
✓ Branch: squad/crucible-s2, commit 49a0371
📌 2026-06-13: **Crucible S2 persona-review-cycle COMPLETE** — 2-cycle Code Panel review completed on squad/crucible-s2. Compliance findings (contract-suite, metadata durability) reviewed and fixed. All 186 unit tests + contract suite validation passing. No regressions. Metadata round-trip durability (CL-11/CL-12 shared suite + CL-13 FS reopen + META-1/META-2) verified correct. READY TO MERGE. — Scribe (session 2026-06-14T06:51:39Z)

## 2026-06-16: imprint Activity — RED Test Phase

**Task:** Write RED (failing) contract tests for the new `imprint` activity (raw fact-creation write path). Genesta's `genesta-imprint-contract.md` was the authoritative spec.

**Status:** ✅ RED COMPLETE — 2 test files fail with correct ERR_MODULE_NOT_FOUND; 208 existing tests stay GREEN.

**Files created:**
- `packages/eureka/src/storage/__tests__/fact-writer-contract.helper.ts` — shared suite exporting `runFactWriterContract(implName, makeHarness)` covering IM-1 through IM-14 (24 tests per wiring call)
- `packages/eureka/src/storage/__tests__/fact-writer.contract.test.ts` — thin runner wiring InMemoryFactWriter
- `packages/eureka/src/storage/__tests__/fact-writer-sqlite.contract.test.ts` — thin runner wiring SqliteFactWriter

**Test count:** 24 tests per implementation wiring (48 total when GREEN):
- IM-1..IM-8, IM-12..IM-14 = 11 singular tests
- IM-9 = 5 parameterized (trust: 1.5, -0.1, NaN, Infinity, -Infinity)
- IM-10 = 4 parameterized (importance: 2.0, -0.5, NaN, Infinity)
- IM-11 = 4 parameterized (attentionTier: 'lukewarm', 'HOT', '', 'freeze')

**Contract ambiguities / design decisions logged in `.squad/decisions/inbox/laura-imprint-red.md`.**

**Key learnings:**
- **FactWriterHarness extension:** The contract §10 harness lacked `factWriter: FactWriter` — needed to expose the seam directly so IM-2 (custom idProvider) and IM-13 (fixed-id idempotency) could call `imprintActivity(options, customDeps)` without going around the harness abstraction. Filed as a decision for Crispin to honor when implementing InMemoryFactWriter.
- **InMemoryFactWriter dual-interface design:** The InMemory runner's harness wires `factStore: writer` and `factWriter: writer` to the same instance. This requires InMemoryFactWriter to implement BOTH `FactWriter` and `FactStore` interfaces. Crispin must design accordingly.
- **readFact pattern:** readFact is a test-only side-channel. For InMemory, it's a method on InMemoryFactWriter. For SQLite, it's a direct prepared SELECT in the harness factory — does NOT go through the activity layer.
- **"no fact written" assertion via factStore.search:** When validation throws, verifying `readFact` is impossible (no factId was generated). Used `factStore.search({ query: '<unique keyword in content>', ... })` → `toHaveLength(0)` instead. Unique per-test keywords (`im9validcontent`, `im10validcontent`, `im11validcontent`) prevent cross-test interference.
- **IM-13 idempotency verification:** Used `factStore.search({ query: 'im13firstcontentwins', limit: 100 }).toHaveLength(1)` to prove no duplication plus `readFact` to prove first-write-wins. Both checks needed; readFact alone can't detect duplication.
- **Import paths:** From `src/storage/__tests__/`, activity imports are `../../activities/imprint.js` (not `../activities/imprint.js` as Genesta's spec said in prose — spec used relative-to-spec-root phrasing).

— Laura

---

## 2026-06-17: Eureka imprint Slice SHIPPED (M8 Follow-Up)

**Result:** ✅ COMPLETE — 256/256 eureka tests GREEN, tsc clean

**RED tests outcome:**
- 24 contract assertions (IM-1..IM-14) per implementation
- 2 runner files (InMemory + SQLite harnesses)
- All tests passing post-Crispin GREEN implementation
- Test count: 208 pre-existing + 48 imprint tests = 256 total ✅

**Design decisions produced (D1..D6):**
1. D1 — FactWriterHarness extended with `factWriter` seam exposure
2. D2 — InMemoryFactWriter implements both `FactWriter` and `FactStore`
3. D3 — `readFact` is test-only side-channel (not on FactWriter interface)
4. D4 — "No fact written" assertions use `factStore.search()` (not `readFact`)
5. D5 — IM-13 idempotency: dual-check with `readFact` + `factStore.search()`
6. D6 — Import paths: `../../activities/imprint.js` from `src/storage/__tests__/`

**Deliverables:**
- Genesta: 3 DECIDED decisions + 1 proposed orchestration memo
- Crispin: imprint GREEN + integration design (1 PROPOSED)
- Laura: RED tests (24 contract tests, both runners, all GREEN)

**Scribe orchestration:** Decisions inbox merged → decisions.md, orchestration logs per agent, session log, cross-agent history appends, git commit

**What's next:** Aaron decision on integrate Q1/Q2. Once locked, proceed with cognitive orchestration slice.

---

### 2026-06-21: Imprint Slice — Persona Review 2-Cycle Complete (Ready to Ship)

**Event:** Persona review completed on eureka/imprint-slice. Laura participated in the review panel as Tester, validating contract compliance and edge-case coverage.

**Cycle 1 dispositions:** 8 findings accepted+fixed, 2 rejected with documented reasoning. All contract assertions verified passing after fixes (commit c64092b).

**Cycle 2 re-review:** All cycle-1 fixes validated. 1 residual minor (clock.ts doc block) applied. No test regressions.

**Final outcome:** All personas UNANIMOUS. Imprint slice approved: correct, well-scoped, maintainable, architecturally sound. Ready to merge.

**Tests:** 258/258 eureka tests green, tsc clean.

---

## 2026-06-23: integrate Activity — RED Test SCENARIO PLAN (Pre-Implementation Draft)

**Status:** SCENARIO PLAN ONLY — no test files written. Drafted in parallel with Genesta's `integrate` scope/design brief. **Dedup behavior is OPEN** pending Aaron decision (decisions.md Q1/Q2, §10 open questions ~L49/L499). Tests marked CONDITIONAL must be re-evaluated once dedup outcome lands.

**Contract under test:** `integrate(fact: Fact, deps: IntegrateDeps) → Promise<FactId>` (§10 L28). Per decisions.md (2026-06-13 vocabulary amendment), `integrate` is the COGNITIVE/orchestration layer that wraps `imprint` (the mechanical write). It performs: recall-for-context → classify (novel|duplicate|contradiction) → reconcile → delegate to `imprint` for net-new facts.

**Conventions inherited from imprint slice (D1-D6, see 2026-06-17 entry):**
- Shared contract helper pattern: `runIntegrateContract(implName, makeHarness)` in `src/activities/__tests__/integrate-contract.helper.ts` (NEW); thin runners for InMemory + SQLite wirings.
- Mirror `InvalidImprintError` → introduce `InvalidIntegrateError` with discriminator code `INVALID_INTEGRATE`, fields `field`, `value`, `message` (typed-error-discriminator-codes skill).
- Harness must expose seams: `factWriter`, `factStore` (for recall + side-channel assertions), `clock`, `idProvider`, and (new) `factReader` if dedup needs read-by-id. "No fact written" assertions use `factStore.search({query: '<unique keyword>'})` (D4).
- Validation fires synchronously BEFORE the first await (matches imprint/applyFeedback pattern).

---

### RISK-ORDERED RED SCENARIOS

#### Tier R1 — RISKIEST (write first; these are where real bugs hide)

**IT-DEDUP-* (CONDITIONAL on Aaron decision):** All dedup-classification tests are blocked. Test shape depends on which of three plausible outcomes lands. For EACH outcome below, the test exists — only one branch will be activated:

- **Outcome A — Return-existing-id (silent dedup):**
  - IT-DEDUP-A1: integrate(content="X") twice in same session → second call returns the FIRST factId; `factStore.search({query: uniqueToken})` returns exactly 1 row.
  - IT-DEDUP-A2: dedup is per-sessionId (cross-session integrate of identical content yields 2 distinct FactIds, 2 rows).
  - IT-DEDUP-A3: dedup key spec — exact-content match vs normalized (whitespace/case) vs `dedupKey` field (per Crispin's proposed schema). MUST be locked.
- **Outcome B — Merge (trust-average, refresh lastAccessed):**
  - IT-DEDUP-B1: second integrate updates existing row's trust to `0.5·old + 0.5·new` (per decisions.md L441 v1.5 design hint, possibly adopted for v1).
  - IT-DEDUP-B2: `lastAccessedAt` advances to clock.now() on dup hit; `accessCount` increments.
  - IT-DEDUP-B3: original `createdAt` unchanged (immutability invariant from imprint slice).
  - IT-DEDUP-B4: returned FactId is the EXISTING one (not a newly minted one — verify idProvider.next() was NOT called).
- **Outcome C — Error / explicit signal:**
  - IT-DEDUP-C1: second integrate throws `DuplicateFactError` carrying the existing factId; original row untouched; no new row written.

**IT-CONTRADICTION-* (CONDITIONAL — only if v1 ships contradiction handling; current evidence suggests it's v1.5+):**
  - If in scope: IT-CON-1 contradiction detection writes new fact AND a `contradicts` edge (requires migration 003 — Genesta to confirm).
  - If out of scope: explicitly assert v1 integrate does NOT inspect for contradictions (treat as novel) — pin the deferral.

#### Tier R2 — Contract surface (writable NOW, dedup-independent)

These rely only on the `integrate → FactWriter` happy path and validation; they hold under ANY dedup decision.

- **IT-1 Happy path:** integrate({content, sessionId}) resolves to non-empty, well-formed FactId (UUID v4 shape OR matches deps.idProvider.next() — mirror IM-1/IM-2).
- **IT-2 IdProvider wiring:** returned FactId === idProvider.next() output (when novel path is taken).
- **IT-3 Round-trip with recall (boundary/seam):** an integrated fact is findable via `factStore.search({query: <unique keyword in content>})` and returns a row whose factId === the integrate return value. **This is the critical integrate → FactWriter → recall round-trip the prompt called out.**
- **IT-4 Round-trip via FactReader:** if FactReader seam is plumbed (per F9 decisions.md L67 — "candidate for the integrate cycle"), `factReader.read(factId)` returns the row with matching content/trust/importance/attentionTier.
- **IT-5 Session isolation:** integrate in sessionA → not visible in sessionB search (mirror IM-12).
- **IT-6 Defaults applied:** omitted trust → 0.5; omitted importance → 0; omitted attentionTier → 'warm' (mirror IM-3/4/5). Verify the persisted row, not just the return value.
- **IT-7 Custom values stored verbatim:** explicit trust/importance/attentionTier round-trip unchanged (mirror IM-6).
- **IT-8 Synchronous validation:** validation throws BEFORE any await (use a `factWriter.write` spy that records call order; assert spy NOT called on validation failure).

#### Tier R3 — Input validation (mirror imprint's InvalidImprintError surface)

Per Aaron's instruction to mirror imprint's validation. Each throws `InvalidIntegrateError` with `field` discriminator and asserts NO fact written (via `factStore.search` returning 0).

- **IT-V-CONTENT-1 Empty content:** `content=""` → throws (field:'content').
- **IT-V-CONTENT-2 Whitespace-only:** `content="   \t\n  "` → throws (field:'content').
- **IT-V-CONTENT-3 Null/undefined content (runtime guard):** mirror F10 — throws even though TS forbids it.
- **IT-V-TRUST ×5 (parameterized it.each):** trust ∈ {1.5, -0.1, NaN, +Infinity, -Infinity} → throws (field:'trust'). Boundary trust values **0** and **1** are explicitly VALID (separate happy-path assertions IT-V-TRUST-0 and IT-V-TRUST-1).
- **IT-V-IMPORTANCE ×5:** importance ∈ {2.0, -0.5, NaN, +Infinity, -Infinity} → throws (field:'importance'). Boundaries 0 and 1 valid.
- **IT-V-TIER ×4:** attentionTier ∈ {'lukewarm', 'HOT', '', 'freeze'} → throws (field:'attentionTier').
- **IT-V-SESSION-1:** missing/empty sessionId → throws (field:'sessionId') OR is rejected at type boundary (decide with Genesta — imprint currently relies on TS branding; integrate may need stricter runtime guard since it's the public write API).
- **IT-V-FACTID-EMPTY (delegated):** if idProvider returns empty string, integrate must surface the same `factId` guard imprint added in F5. Test by injecting a stub idProvider.

#### Tier R4 — Orchestration / collaboration seam (London-school)

`integrate` calls `recall` internally per Crispin's flow. These tests pin the orchestration contract.

- **IT-O-1 Recall-before-write:** spy on `factStore.search`; assert it is called with a query derived from `fact.content` BEFORE `factWriter.write`. **CONDITIONAL on dedup decision** — if dedup is deferred to v1.5, this orchestration may not exist in v1 and IT-O-1 should be SKIPPED with a `it.todo` placeholder citing the deferral decision.
- **IT-O-2 Recall failure propagation:** if `factStore.search` throws, integrate surfaces a typed error (do NOT swallow into a successful write).
- **IT-O-3 Writer failure propagation:** if `factWriter.write` throws (e.g., SQLITE_BUSY), integrate surfaces it; no partial state (no half-written edge rows).
- **IT-O-4 Clock determinism:** `createdAt` on the persisted row === `clock.now()` (injected fixed clock).

#### Tier R5 — Edge / boundary cases

- **IT-E-1 Very long content:** content of size 10^6 chars → either accepted and round-trips, or rejected with a specific size-limit error (Genesta to specify the cap; test pins whichever).
- **IT-E-2 Unicode / RTL / emoji content:** integrate + recall round-trip preserves bytes exactly.
- **IT-E-3 SQL-injection-shaped content:** `content="'; DROP TABLE facts; --"` round-trips and `facts` table still exists post-call.
- **IT-E-4 FTS5 reserved tokens in content:** content `"NEAR* AND OR"` — integrate succeeds, recall round-trip works (we already learned in M8 Slice C that FTS5 tokenization matters).
- **IT-E-5 Concurrent integrate of identical content (same session):** two parallel `await Promise.all([integrate(X), integrate(X)])` — CONDITIONAL on dedup outcome:
    - Outcome A/B: both resolve, exactly 1 row, both return same FactId.
    - Outcome C: one resolves, the other throws DuplicateFactError.
    - No-dedup: 2 rows, 2 distinct FactIds.

---

### EXPLICIT BLOCKING MATRIX

| Tier | Writable NOW | Blocked on dedup decision |
|------|--------------|---------------------------|
| R1 (dedup, contradiction) | ❌ | **ALL** — Aaron must pick outcome A/B/C and confirm whether contradiction detection is v1 or v1.5+ |
| R2 (contract surface)     | ✅ | none — these hold under any dedup outcome |
| R3 (validation)           | ✅ | none — mirror imprint validation 1:1 |
| R4 (orchestration)        | ⚠️ | IT-O-1 blocked (depends on whether v1 calls recall internally at all); IT-O-2/3/4 writable now |
| R5 (edge cases)           | ⚠️ | IT-E-5 dedup-dependent; IT-E-1..4 writable now |

**Recommendation:** Begin RED phase on R2 + R3 + (R4 minus IT-O-1) + (R5 minus IT-E-5) immediately — this is ~30 tests and locks the public-API contract surface independent of dedup. Reserve R1 + IT-O-1 + IT-E-5 (~12-15 tests) for a second RED batch once Aaron's dedup decision lands.

### OPEN QUESTIONS TO GENESTA (must resolve before any RED test lands)

1. **Return type:** Spec §10 L39 says `→ FactId`. Crispin's flow (decisions.md L341+) returns `{outcome, factId}`. Which is the v1 contract? Tests must assert one shape.
2. **Recall-before-write in v1:** Is the recall step IN v1 integrate, or deferred to v1.5? If deferred, integrate ≈ imprint + sessionId provenance — most R1/R4 tests evaporate.
3. **sessionId required?** Spec §10 lists sessionId as optional; imprint requires it. Pick one.
4. **Validation error type:** New `InvalidIntegrateError`, or reuse `InvalidImprintError` since integrate delegates? Recommend NEW class — clearer telemetry / discriminator narrowing.
5. **FactReader seam in scope?** decisions.md F9 explicitly defers `FactId` branding to `FactReader.read()` to the integrate cycle. Confirm landing in this slice.

— Laura

---

## 2026-06-24: integrate Activity — RED Phase Complete (Option B reframe)

**Event:** Aaron locked Option B (2026-06-24). integrate is now a POST-imprint consolidation pass: `integrate({sessionId}, deps) → IntegrationReport`. Scans an already-imprinted session, finds exact-content duplicates (trimmed), writes idempotent `duplicate_of` edges via `RelationWriter` into a new `fact_relations` table. imprint stays lossless.

**Status:** ✅ RED COMPLETE — 2 test files fail with correct `Cannot find module '../integrate.js'` at load. 258 pre-existing tests stay GREEN.

**Prior plan (dedup-conditional, 2026-06-23):** MOOT — Aaron's reframe eliminated the dedup-on-write design space entirely. Edge-classification and dedup-vs-merge-vs-error scenarios are not applicable. Test plan rewritten from scratch.

**Files created:**
- `packages/eureka/src/activities/__tests__/integrate-contract.helper.ts` — shared suite (`runIntegrateContract`, IT-1..IT-15)
- `packages/eureka/src/activities/__tests__/integrate.contract.test.ts` — InMemory wiring
- `packages/eureka/src/activities/__tests__/integrate-sqlite.contract.test.ts` — SQLite wiring (covers migration 003 + SqliteRelationWriter + SqliteFactReader.listBySession)

**Test count:** 15 contract tests × 2 wirings = 30 RED test runs to GREEN. No parameterized blow-ups in this slice.

### Key test-strategy decisions

1. **Star-to-canonical topology for N-identical facts (locked in IT-5).** For T0<T1<T2 same content: edges (T1→T0) + (T2→T0), not chain. Rationale: single-hop "find all duplicates of X" query; discovery-order independent; consistent with Genesta's IT-5 2-fact orientation; idempotent under late-arrival duplicates. Explicit negative assertion `expect(edges.find(e => e.fromFactId === t2Id && e.toFactId === t1Id)).toBeUndefined()`.

2. **Lossless invariant pinned by a TWO-test vise:** IT-8 (factStore.search returns both duplicate facts after integrate) + IT-15 (negative regression: imprint of two identical-content facts still yields two distinct FactIds). Any future change that makes imprint silently dedup OR makes integrate destructive breaks exactly one.

3. **Normalization boundary at imprint's `.trim()` only:** IT-9 (`"hello"` matches `"  hello  "`) AND IT-10 (`"hello world"` ≠ `"hello  world"` — no internal-whitespace collapse). Pins the exact behaviour of the comparison; any future "collapse" or "fold case" change must update IT-10 explicitly.

4. **Synchronous validation guarded by spies (IT-12):** `vi.spyOn(factReader, 'listBySession')` and `vi.spyOn(relationWriter, 'writeEdges')`, then assert blank-sessionId throws InvalidIntegrateError synchronously and NEITHER seam was called. Mirrors the imprint slice's "validation before first await" pattern.

5. **Idempotency reported via `edgesWritten: 0` on second run (IT-6).** Assumes `RelationWriter.writeEdges → Promise<{written: number}>` (returns actual inserted count, not edges-attempted). Genesta's brief specified `Promise<void>` — this is a delta requiring Genesta confirmation. Documented as ASSUMPTION in the helper file header and in the decisions inbox memo.

6. **Pair ordering: canonical createdAt ASC, then duplicate createdAt ASC (IT-11).** Required for `report.pairs` to be byte-stable across runs (idempotency demands a deterministic order). Fixture interleaves canonical/duplicate imprints across three content groups to prove ordering is derived from createdAt, not insertion order.

7. **Harness design — direct seams exposed:** Beyond the pre-wired `imprint` and `integrate`, the harness exposes `factReader`, `relationWriter`, and `factStore` as direct properties so individual tests can `vi.spyOn` them for error injection (IT-13, IT-14) without rewiring deps. Also exposes `advanceClock(ms)` for ordered imprints (most tests use 1_000ms steps so creation order is unambiguous).

8. **listEdges side-channel:** Test-only method on InMemoryRelationWriter (and a direct prepared SELECT for SQLite). Bypasses the activity layer entirely — reflects exactly what's in `fact_relations`. Mirrors the imprint slice's `readFact` pattern (D3 from imprint slice decisions).

### Open assumptions logged (flagged for Crispin/Genesta wave-2)

- `IntegrationReport.factsScanned` — included per Aaron's prompt; not in Genesta's published shape.
- `FactPair = {duplicateFactId, canonicalFactId}` — shape inferred from edge orientation.
- `RelationWriter.writeEdges → Promise<{written: number}>` — count-aware variant of Genesta's `Promise<void>`.
- `FactReader.listBySession` return shape (`Array<{factId, content, createdAt, …}>` assumed).
- `fact_relations` UNIQUE constraint per Crispin's seam memo.

Logged in `.squad/decisions/inbox/laura-integrate-test-plan.md`.

### Learnings

- **Reframe-MOOTs-RED:** When an upstream design decision is reframed (Option A dedup-on-write → Option B post-imprint consolidation), pre-written RED tests should be discarded wholesale, not edited. The vocabulary, seam set, and assertion shapes are entirely different. Editing would carry hidden Option-A assumptions into Option B.
- **Star-vs-chain is a real ergonomic choice, not arbitrary.** Locked star with explicit rationale in the helper file's IT-5 doc block so a future reviewer doesn't "fix" it to a chain. Negative assertion enforces the lock at runtime.
- **`vi.spyOn` on harness-exposed seams** is the right shape for orchestration error tests. Mocking the entire dep object loses the per-test seam shape; per-test spy + override is exactly what IT-13/14 need.
- **RED-at-module-load is the cleanest RED.** Both new files fail with `Cannot find module '../integrate.js'` — no false RED from a partially-stubbed activity. Crispin's GREEN unblocks both files atomically.

— Laura

---

## 2026-06-25: integrate RED Tests — Reconciled to Locked Wave-2 Contract

**Event:** Genesta locked the integrate contract types (wave-2). All five of my prior ASSUMPTIONS resolved. Reconciled `integrate-contract.helper.ts`, `integrate.contract.test.ts`, and `integrate-sqlite.contract.test.ts` to the locked types WITHOUT weakening any behavioral assertion. Only names and shapes changed; the 15 behavioral invariants (IT-1..IT-15) plus star topology + lossless + idempotency + session-isolation are unchanged.

**Reconciliation deltas applied:**

| Was (my draft) | Now (locked) |
|----------------|--------------|
| `FactPair { duplicateFactId, canonicalFactId }` | `DuplicatePair { keptFactId, duplicateFactId }` (kept = older/canonical, duplicate = newer) |
| `RelationWriter.writeEdges → Promise<{written: number}>` | `Promise<number>` (bare count) |
| `RelationEdge.edge_type` | `RelationEdge.edgeType` |
| `IntegrationReport` field order | locked: `{ sessionId, factsScanned, duplicatesFound, edgesWritten, pairs }` — added explicit `report.sessionId === sessionId` assertions in IT-1/4/6 |
| `listEdges(sessionId)` side-channel on harness | **DROPPED** — no relation reader exists in v1. Idempotency now asserted via `report.edgesWritten === 0` on the 2nd run; IT-4/5/6/9/11 assert pair shape via `report.pairs` only. |
| `FactReader.listBySession` shape | `Promise<ReadonlyArray<{ factId, content, createdAt }>>` — fixtures already provide distinct createdAt via 1_000ms `advanceClock` between identical-content imprints, so oldest-first canonical selection is deterministic. |

**Tests realigned (all 15, ×2 wirings):**
- **IT-1, IT-2, IT-3, IT-7, IT-10:** Removed `listEdges` calls; assertions are now `report.duplicatesFound === 0 && report.edgesWritten === 0 && report.pairs === []`. Added `report.sessionId` and `report.factsScanned` assertions for the locked field set.
- **IT-4, IT-9:** Pair shape rewritten to `{ keptFactId: older, duplicateFactId: newer }`. Removed direct edge-table assertions; the report pair contract is the surface under test.
- **IT-5 (STAR-TO-CANONICAL topology — STAYS LOCKED):** Re-expressed via `report.pairs` only. Negative no-chain assertion now: `expect(report.pairs.find(p => p.keptFactId === t1Id)).toBeUndefined()` — if integrate were chain-style, T2 would treat T1 as its canonical and a pair `{keptFactId: t1Id, duplicateFactId: t2Id}` would exist. The star contract: all pairs share `keptFactId === t0Id`. Behavioural invariant unchanged.
- **IT-6 (idempotency):** Now asserts `first.edgesWritten === 1` and `second.edgesWritten === 0` (per locked semantics that writeEdges returns actual inserted count). `second.pairs === first.pairs` still asserts pair-set stability across runs. Removed the table-readback "edgesAfterSecond === edgesAfterFirst" check.
- **IT-8 (lossless):** Replaced edge-endpoint set membership check with a pre/post `factStore.search({query, sessionId, limit: 100})` length comparison: before integrate = 2 results, after integrate = 2 results. Stronger and contract-locked.
- **IT-11 (pair ordering determinism):** Stable, locked order = kept createdAt ASC, then duplicate createdAt ASC. Same as before, only shape rename.
- **IT-12, IT-13, IT-14, IT-15:** Spy-based seam tests unchanged (harness still exposes `factReader` + `relationWriter` direct seams for `vi.spyOn`). InvalidIntegrateError discriminator (`code: 'INVALID_INTEGRATE'`, `field: 'sessionId'`) unchanged.

**SQLite belt-and-suspenders added (IT-S1):** One SQLite-only test outside `runIntegrateContract` that directly `SELECT COUNT(*) FROM fact_relations` before and after the second integrate. Catches a hypothetical bug where the activity counts correctly but issues duplicate INSERTs that the UNIQUE constraint silently absorbs at the DB layer. Belt-and-suspenders only — the contract surface is `report.edgesWritten`.

**RED verification (`npx vitest run`):**

```
Test Files  2 failed | 16 passed (18)
     Tests  319 passed (319)
```

Both new files fail at module load with `Cannot find module '../integrate.js'` — exactly the RED signal we want. 319 pre-existing tests (258 imprint slice + the 61 keyset/recall/etc. that landed between) all still GREEN. Additive change, zero regression.

**Behavioral invariants explicitly re-verified intact post-reconciliation:**
1. **Lossless imprint:** IT-8 (factStore.search returns 2 before AND after) + IT-15 (negative regression: identical content → 2 distinct FactIds).
2. **Session isolation:** IT-7 (identical content in sessionA vs sessionB → both reports show 0 duplicates).
3. **Idempotency:** IT-6 (`second.edgesWritten === 0`, `second.pairs === first.pairs`) + IT-S1 (SQLite COUNT(*) unchanged on re-run).
4. **Star topology for N identical:** IT-5 (all pairs `keptFactId === t0Id`, no pair with `keptFactId === t1Id` rules out chain).
5. **Normalization boundary:** IT-9 (trim equality) + IT-10 (no internal collapse) pin imprint's `.trim()`-only semantics.
6. **Synchronous validation:** IT-12 (spy assertions: neither factReader nor relationWriter touched before InvalidIntegrateError throws).
7. **Error propagation purity:** IT-13 (factReader error not swallowed) + IT-14 (relationWriter error not swallowed, no partial report).

**Wait state:** Tests are RED-by-missing-impl. Will flip GREEN automatically when Crispin's wave-2 lands:
- `src/activities/integrate.ts` (activity + types: IntegrateOptions, IntegrateDeps, IntegrationReport, DuplicatePair, FactReader, RelationWriter, RelationEdge)
- `src/activities/errors.ts` (InvalidIntegrateError, code 'INVALID_INTEGRATE')
- `src/db/migrations/003-fact-relations.ts` (table + UNIQUE constraint, registered via applyMigrations)
- `src/storage/relation-writer.ts` (InMemoryRelationWriter)
- `src/storage/relation-writer-sqlite.ts` (SqliteRelationWriter)
- `src/storage/fact-reader-inmemory.ts` (InMemoryFactReader with listBySession)
- `src/storage/fact-reader-sqlite.ts` (extended SqliteFactReader.listBySession)

**Learnings:**
- **Locked-contract reconciliation is mechanical when the test-design intent is well-documented.** Every renamed field was a 1:1 substitution; the IT-X behavioral docstrings made the intent immediately recoverable. Worth the doc cost in the original RED draft.
- **Dropping a side-channel can STRENGTHEN tests.** Removing `listEdges` forced IT-8 to assert via `factStore.search` (the actual public read contract) instead of poking the graph table. The lossless invariant is now expressed in terms users actually use.
- **Star-vs-chain assertion translates cleanly to pair-shape:** `report.pairs.find(p => p.keptFactId === t1Id)` being undefined is a direct expression of "T1 is never treated as canonical by anything." Doesn't require edge readback.
- **Belt-and-suspenders SQLite-only tests** belong OUTSIDE the shared `runIntegrateContract` suite — they test SQLite implementation behaviour, not the activity contract. Wiring file is the right home.

— Laura

---

## 2026-06-25T07:17:47Z: Eureka `integrate` v1 Slice FINAL GREEN — Schema Reconciliation Complete

**Status:** ✅ COMPLETE — All 350/350 eureka tests GREEN

**Reconciliation completed (2026-06-25T07:17 UTC):**
IT-S1 direct SQL assertions reconciled to Aaron's locked schema column naming:
- **Before:** `WHERE edge_type = 'duplicate_of'` (test file: lines 159, 168)
- **After:** `WHERE relation_kind = 'duplicate_of'` (Aaron's brief: TS `edgeType` ↔ DB `relation_kind`)

No other changes. The 30 core IT-1..IT-15 contract tests remain green for both InMemory and SQLite wirings. The cosmetic docstring comment header (lines 13, 15) still mentioned `edge_type` in historical context — left unchanged (documentation, not assertions).

**Test suite verification (post-reconciliation):**
```
Test Files  18 passed (18)
     Tests  350 passed (350)
```

Full eureka suite: 350 tests passing. Build: `npm run build` ✓. Typecheck: `tsc --build` ✓.

**Integration checkpoint:**
- Wave 1 substrate complete (migration 003, RelationWriter seam, FactReader.listBySession).
- Wave 2 activity complete (integrate.ts, InvalidIntegrateError, composition root).
- Wave 2 reconciliation complete (schema naming unified).
- Test contract locked and fully green (15 core × 2 wirings = 30, plus IT-S1 belt-and-suspenders).

**Behavioral invariants verified across all 30 contract tests:**
✅ Empty session → zeros | ✅ Single fact → zeros | ✅ Distinct content → no edges | ✅ Two identical → 1 edge + pair | ✅ STAR-TO-CANONICAL for 3+ identical | ✅ Idempotent on re-run | ✅ Session isolation | ✅ Lossless (both dups recallable) | ✅ Trim equality | ✅ No internal-whitespace collapse | ✅ Deterministic pair order | ✅ Blank sessionId → sync error (no seams touched) | ✅ FactReader error propagates | ✅ RelationWriter error propagates | ✅ Imprint NOT regressed (2 distinct FactIds for identical content)

**What's ready for v1.5+:**
- Relation vocabulary in CHECK constraint reserves `supersedes | contradicts | supports` for future consolidation passes (`sweep`, `meditate`).
- STAR-TO-CANONICAL algorithm composes naturally with background consolidation scopes (extend to cross-session, cross-tier, etc. without API break).
- Append-only facts + soft reconciliation via edges means `recall` can later filter via `WHERE NOT EXISTS (SELECT 1 FROM relations WHERE to_fact_id = f.id AND relation_kind = 'supersedes')` without fact deletion.
- Canonical ordering by createdAt (epoch ms, system clock) is stable across all sessions; later consolidation passes can anchor on the same metric.

**Documentation & traceability complete:**
- Decision files merged to `.squad/decisions.md` (genesta, crispin, laura contributions).
- Orchestration logs in `.squad/orchestration-log/` (3 agents, UTC timestamps).
- Session log in `.squad/log/` (brief summary).
- All agent histories appended with completion notes (Append-Only Rule maintained).
- Git commit staged and ready (durable .squad files only).

**Key insight for future slices:**
When a design reframe lands (Option A → Option B), discarding pre-written RED tests entirely is the right move. Editing them to bridge the reframe is error-prone (hidden assumptions). Fresh RED written against the locked contract is faster and cleaner, as evidenced by this cycle: one day of re-write vs days of bug-finding in edited tests.

