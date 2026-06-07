📌 **M8 Slice C audit complete** (2026-06-05): Audited Roger's `SqliteFactStore` (FTS5 BM25 search, cursor pagination, minTrust floor, session isolation). Verdict: ✅ ACCEPT-WITH-FOLLOWUPS. Added `fact-store-sqlite-edges.test.ts` (12 new tests, FS-SE-1..12). Test count: 109 → 121. Key learnings:

> Correction (2026-06-05): Test count reflects FS-SE-1..13 (13 invariants). FS-SE-13 added post-audit for non-FTS SQLITE_ERROR propagation (commit `f08c746`).
- **FTS5 BM25 sign convention**: `bm25()` returns NEGATIVE (more-negative=better). Correct ordering is `ORDER BY (-bm25(facts_fts)) * trust DESC`. The footgun: if you forget negation, best matches sort LAST (ascending on negatives). Lock this with a term-frequency ordering test.
- **BM25 normalization proof approach**: Seed 3 facts with very different term densities for the same keyword; assert `results[0].relevance === 1.0` and descending order. Simpler than computing expected BM25 values.
- **Cursor pagination gotchas**: (1) Offset cursors are deterministic only for a fixed query+session+data; concurrent inserts between pages can cause gaps/dupes — document as Slice D+ concern, not a blocker for single-writer v1. (2) Garbage cursors (invalid base64, negative offsets) must fall back to offset=0, not crash — test by comparing against no-cursor baseline. (3) The `limit+1` fetch trick has a degenerate case at `limit=0` (nextCursor loops on offset=0) — not exposed by contract, document as known edge.
- **Per-page normalization distortion**: Sole result on a sparse final page always gets `relevance=1.0` regardless of actual BM25 quality. Clients must not compare relevance across pages. This is intentional v1 behavior but should be machine-documented with a test (FS-SE-12).
- **FTS5 input sanitization gap (FINDING FSE-1, MEDIUM)**: Queries with unclosed double-quotes or bare operators (FTS5 syntax) propagate as rejected promises — no try/catch around `stmt.all()`. For v1 this is MEDIUM (non-blocking follow-up), but any user-input path hitting search() is a crash surface.

> Correction (2026-06-05): FSE-1 fixed in this PR (commit `f08c746`). `SqliteFactStore.search()` now wraps `stmt.all()` in try/catch, catches FTS5 parse-error patterns, and returns `{ results: [] }` instead of rejecting. FS-SE-11 updated to test empty results (not rejection).
- Decision drop: `.squad/decisions.md` (§ Audit — Laura M8 Slice C, line 228). — Laura

# SUMMARY (as of 2026-06-01)
📌 **M8 Slice B ready for audit** (2026-06-05): Roger completed SqliteTrustUpdater implementation on branch `eureka/m8-slice-b-sqlite-trust-updater` (4 commits). Key: atomic transactions via `rawTxn.immediate(args)`, contract suite relocated from activities to storage layer with tombstone pattern. Test results: 93 passing + 1 todo, new contract contributes 14 tests (7 InMemory + 7 SQLite). Ready for your audit when Aaron dispatches. Decisions merged: `.squad/decisions.md` (2026-06-05 entry + inbox). — Scribe

📌 **M8 Slice A Cycle-2 Re-validation** (2026-06-02): Re-validated Roger's 6-commit cycle-2 drop (I1/I4/I5/I6/I2/M1–M5). All 9 mandatory checks passed. Key findings: (1) subpath export `@akubly/eureka/sqlite` resolves correctly — `SqliteFactReader` / `openDatabase` / `applyMigrations` all `function`, root path correctly rejects `SqliteFactReader` import; (2) `better-sqlite3` correctly in `optionalDependencies`; (3) migration IMMEDIATE transaction confirmed as actual CALL via `txFn.immediate()` (better-sqlite3 idiom); (4) WAL fallback writes to `process.stderr.write()` — MCP stdio rule honored; (5) `busy_timeout = 5000` present; (6) M3 seed uses `INSERT OR REPLACE`; (7) M4 cleanup wired in `afterEach`; (8) I2 deferral comment present. Added DB-CL-6 (concurrent first-open race: two handles, applyMigrations twice → schema_version=1, no error) and DB-CL-7/M3 (seed-twice via INSERT OR REPLACE does not throw, last value wins). Test count: 84 → 86. Verdict: ✅ ACCEPT. Decision drop: `.squad/decisions/inbox/laura-m8-slice-a-cycle2-audit.md`. — Laura

📌 **M8 Slice A contract audit + edges** (2026-06-01): Audited CL-1..CL-5 in `fact-reader.contract.test.ts` for SQLite-semantic completeness. 4 of 5 invariants survived unchanged. CL-4 was silent on whether `seed` must write to the backing store — tightened: comment + test name now explicitly state "NaN trust round-trips through the storage write/read cycle" and document the NaN→NULL→NaN conversion requirement. Roger independently arrived at the same strengthening in his commit (convergence = confidence). Added `fact-reader-sqlite-edges.test.ts` with 5 real (non-todo) edge tests: DB-CL-1 (NaN through disk close+reopen), DB-CL-2 (UNIQUE constraint enforced), DB-CL-3 (applyMigrations idempotent), DB-CL-4 (WAL persistence), DB-CL-5 (trust=0 + empty content boundary). All 84 tests green. Roger's impl passes. Decision drop: `.squad/decisions/inbox/laura-m8-slice-a-contract-audit.md`. — Laura

📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): Wall-clock replay-determinism bug finding (independent convergence with Graham) + 8 A-Fork-* acceptance scenarios added to §16.9. Key insight: hermetic replay requires logical-time (offset), not wall-clock time. Multi-persona convergence on this correctness violation made the blocker non-negotiable. Test tier coverage: contract (A-Fork-1/2/3), component (A-Fork-4/6/7), acceptance (A-Fork-5/8). Capture for future: Cross-persona review with distinct lenses (Architect + Tester) surfaces correctness bugs that unit tests or single-reviewer design alone would miss.

File size: 17270 bytes. See history-archive.md for earlier entries.

---

## Learnings

📌 **2026-06-06 Crucible Walkthrough B:** Wrote RED acceptance test (hook-veto.test.ts) per §4.2 TDD spec. Confirmed RED (missing createLedger export). Then verified GREEN once Roger landed the Ledger implementation. Test structure: no beforeEach (fresh factory), vi.fn() hook for .toHaveBeenCalledWith assertion, expect.any(Object) on metadata (shape TBD). Result: 1/1 acceptance + 27/27 unit tests passing (8/8 total green).

**Test written:**
- File: `packages/crucible-core/src/__tests__/acceptance/hook-veto.test.ts`
- Scenario: `createLedger()` → register a VETO hook via `registerHook('policy-gate', vetoHook, { budget: 50_000 })` → attempt `ledger.append(...)` → assert rejection, hook invocation, and empty ledger.
- Mirrors §4.2 verbatim with house-style header comment and §8.5 naming convention (`Acceptance: ... [policy-gate, external-source, empty-ledger]`).

**Expected failure (confirmed):**
```
TypeError: (0 , createLedger) is not a function
```
`createLedger` is not exported from `../../index.js` — correct RED. Import resolves without error (the module exists), but the named export is missing → runtime TypeError at test line 33.

**Seam-alignment note:**
Graham's ledger-seam file (`.squad/decisions/inbox/graham-ledger-seam.md`) did NOT exist at authorship time (2026-06-06T22:03:01-07:00). Test was written to §4.2 signatures. If Graham's seam ships different `createLedger` / `registerHook` / `append` signatures, this test must be realigned to the seam before GREEN. — Laura

---

### 2026-06-06: Crucible Walkthrough B GREEN Sign-Off

**Context:** Verified Roger's GREEN implementation of `HookBus` + `LedgerImpl` + `createLedger` against the RED acceptance test I authored. Branch `squad/crucible-wal-substrate-walkthrough-b`. 28/28 tests passing in crucible-core, no edits to my test.

**Verdict: PASS — GREEN is honest.**

#### 1. VETO behavior is real (not stubbed or weakened)

The execution path in `ledger-impl.ts` is:
1. Build `HookContext` from `PrimitiveInput` (no I/O yet) — correct.
2. Call `hookBus.fire(ctx)` — fires the registered predicate **before any call to `walBackend.commitRow`**. The hook bus `fire()` in `hook-bus-impl.ts` invokes predicates in FIFO order, short-circuits on VETO.
3. If `result.verdict === 'VETO'`: `throw new Error(`Append vetoed by hook: ${result.hookId}`)` — `hookId` is `'policy-gate'` (set at registration), producing the exact message the test asserts.
4. `walBackend.commitRow` is called ONLY on the non-VETO branch — the type-level `Exclude<HookVerdict, 'VETO'>` at the `WalBackend` port boundary makes this machine-checked, not just documented.

All three test assertions are driven by real behavior:
- **Rejection message** — from step 3 above. ✅
- **Hook invocation with correct context** — `HookContext` fields (`primitiveKind`, `primitivePayload`, `metadata`) built from `PrimitiveInput`; `metadata: expect.any(Object)` passes the `{ timestamp: number }` shape. ✅
- **Empty ledger after veto** — `InMemoryWalBackend.events` is never mutated because `commitRow` is never called. `readRows` filters an empty array → length 0. ✅

#### 2. "No partial write" edge — uncovered, flag as follow-up RED candidate

The test covers: _new ledger, first append is vetoed → ledger stays empty._ It does NOT cover: _N rows committed successfully → VETO hook registered → attempt row N+1 → assert exactly N rows remain, N+1 is absent._

This is a meaningful gap. An implementation that cleared all prior events on VETO (a corruption bug) would still pass the current test. The seam's `WalBackend.commitRow` contract prohibits this, but there is no acceptance test that proves the "prior rows survive a later veto" invariant.

**Recommended follow-up RED test (do not write now — flag only):**
```
arrange: ledger + 3 successful appends → register VETO hook
act:     attempt 4th append
assert:  rejects with 'Append vetoed by hook: ...'
assert:  queryEvents({ range: [0, 100] }) has length 3 (not 0, not 4)
```
File: `packages/crucible-core/src/__tests__/acceptance/hook-veto-prior-rows.test.ts`.
Route to Roger for GREEN when written.

#### 3. Doc/code casing split — ACCEPTABLE, documented, one readability risk

- **§4 spec** uses lowercase throughout: `'continue' | 'observe' | 'pause' | 'veto'` (pseudocode vocabulary).
- **TypeScript seam** (`hook-bus.ts`) uses UPPERCASE: `'COMMIT' | 'OBSERVE' | 'PAUSE' | 'VETO'`.

This is **intentional and explicitly documented** in two places:
- `hook-bus.ts` line 14 comment: "⚠ HookVerdict naming fork: §3/§4 WAL spec uses lowercase … The seam adopts UPPERCASE at the Ledger API boundary."
- `04-hook-bus.md` §4.1, line 40: "In the TypeScript seam … these map to UPPERCASE: COMMIT | OBSERVE | PAUSE | VETO."

**Verdict on the split:** Acceptable. The failure mode if a developer uses the wrong case is a TypeScript type error (not a silent bug), so it's detectable. The risk is readability: a developer reading §4 may hunt for the cross-reference to find the TypeScript names.

**Recommendation (non-blocking):** Add a one-line mapping summary to §4.1's verdict table (a "TypeScript name" column or a note row) so the lookup is inline rather than a cross-reference chase. Route to Graham or doc owner — not a code defect.

#### VETO verdict status

The `graham-ledger-seam-OPEN.md` shows Aaron ruled **Option A** (VETO as first-class pre-WAL gate) on 2026-06-06. The `PROVISIONAL` tag in `hook-bus.ts` can be cleared by Roger in a follow-up commit — not a blocker. — Laura

### 2026-06-01: Crucible REFACTOR RED — SessionManager Unit Tests (London-school with mocked DB)

**Context:** Authored 4 failing unit tests for `SessionManager` per §4.1 Refactor 2, one turn after Roger's GREEN acceptance test landed.

# Archived (2026-05-30, 2026-05-29, 2026-05-28, 2026-05-27, 2026-05-26 ... older)

*Collapsed for brevity. See history-archive.md for details.*

---


Practical consequence: **the cheapest path to passing A3 is to read through L2.** This pushes generators toward the architecture Sonny and Stelios already want, which is the right pressure. I''ll codify it as a generator-quality scorecard signal (US-L-NEW-13): "% of read-set entries auto-derived from Salsa" — high = good, low = audit.

**Ask of Stelios:** the `ReadSetBuilder` helper lives at the L2↔L3 boundary; he or I can own it, but the builder must emit entries with the same `target_hash` semantics L1 will validate against. Coordinate with Roger''s canonical serialization spec.

---

### Locked deliverables (mine):

1. **8-field proposal schema** as above — published as `proposal.v1.schema.ts` in the contract registry.
2. **ReadSetEntry canonical serialization spec** — co-owned with Roger, deterministic CBOR, entry sort key `(kind, target_id)`.
3. **Determinism conformance suite assertions A1–A4** — added to US-L-NEW-12. A3 is load-bearing.
4. **ReadSetBuilder for Salsa-routed generators** — coordinated with Stelios; pushes generators toward L2-mediated reads.
5. **Generator scorecard column: `% auto-derived read-set`** — US-L-NEW-13 extension.

No change to my round-2 commitments on Pareto fitness ownership, branching-as-eval-primitive, or agentic-debugger acceptance harness. This locks one new field, one new spec, and four new assertions — all of which strengthen the existing commitments rather than perturbing them.

---

### Summary for coordinator

**ENDORSE** Roger''s equivalence claim with one refinement: the fields are content-addressed equivalents, not literally identical bytes — my `causalReadSet: ReadSetEntry[]` is the typed body, Roger''s `causal_read_set_hash: blake3?` is the hash of its canonical serialization, bound at L4. Pipeline is L3-declares → L4-canonicalizes-and-hashes → L1-commits, with replay re-deriving and matching (conformance assertion A3, the new load-bearing determinism check). **Proposal schema is now locked at 8 fields**; `causalReadSet` is orthogonal to `evidence` (provenance vs. persuasion — do not merge). Sonny''s US-S-2 insight makes A3 cheap for Salsa-routed generators via a `ReadSetBuilder` helper, which I''ll codify as a generator-quality signal. New deliverables owned by me: 8-field schema, canonical serialization spec (with Roger), four conformance assertions, ReadSetBuilder (with Stelios).

---

## 2026-05-24 Round 4: Phase B reconciliation against existing monorepo

**Scope:** Reconcile my stories (US-L-1..8 + revisions L-NEW-9..13 + Round-3 8-field schema/A1-A4/ReadSetBuilder lock) against the live `D:\git\stunning-adventure` monorepo (Cairn + Forge + skillsmith-runtime + runtime-cli + types). Read-only. Full detail in `.squad/decisions/inbox/laura-reconciliation-2026-05-24T2330Z.md`.

**Summary counts:** 0 ALREADY-EXISTS verbatim · 9 PARTIALLY-EXISTS · 9 NET-NEW · 2 CONTRADICTS-EXISTING (canonical serialization algorithm, `evidence` field shape).

**Headline findings:**
- **Test surface is rich but in-process only.** Property tests (`telemetry-drift.test.ts:127`), metamorphic tests (`feedback-loop.test.ts:714-779`), hot-path SLAs (`:548-641`), regression mirror-pins (`weight-consistency.test.ts`), Wave 2/3/4 SQLite-backed E2E pipelines. **Zero hermetic-replay infrastructure** — every deterministic-output test runs both halves in the same process from in-test fixtures. A3 cannot be retrofitted; fresh harness required.
- **No Pareto anywhere.** All fitness composites are scalar reductions: `priorityScore = confidence × recencyWeight × availabilityFactor` (`packages/cairn/src/agents/prescriber.ts:87`), 5-signal drift weighted sum (`drift.ts:43`), two-tier `applyHistoricalVectorOrdering`. The only multi-axis surface is the 5-vector `QualityVector` (clarity/completeness/concreteness/consistency/containment) at `packages/cairn/src/types/index.ts:245`, with `ValidationResult.tier: 1|2|3 = deterministic|LLM-as-judge|simulation` — Tiers 2 and 3 are typed but never implemented. **This is a free 80% on US-L-3 and exactly matches Aaron''s `decisions.md:371` "simulation + live A/B + synthetic benchmarks" directive.**
- **8-field schema delta:** 3 fields exist with normalization issues (`category`, `confidence` — categorical-vs-numeric, `rationale`), 1 partial (`preview` via `Prescription.proposedChange`), 5 NET-NEW (`fitnessContract`, `costEstimate`, `reversibility`, `determinismClass`, `causalReadSet`). `evidence` is CONTRADICTS-EXISTING — tree has both `string[]` (DecisionRecord) and `{profile, triggerMetrics, …}` (Hint), neither match my typed `EvidenceEntry[]`.
- **Canonical-serialization conflict:** Existing DBOM (`packages/forge/src/dbom/index.ts:24-75`) uses canonical-JSON + SHA-256 + Merkle chain. My Round-3 lock specified deterministic CBOR + BLAKE3. **Defer-to-Roger** to resolve (recommend: keep my CBOR+BLAKE3 for harness L1, treat DBOM as separate export artifact).
- **Patterns to lift wholesale rather than reinvent:** DBOM `canonicalStringify` as A1 reference impl, mirror-pin regression as fitness-contract enforcement, property+metamorphic test framework for fitness-axis fuzz, skill fixture directory layout for US-L-NEW-11 debugger seeded-regression corpus, `tier: 1|2|3` enum verbatim for US-L-3 fusion.

**Gaps not in any current story:** standing property/metamorphic infrastructure should be a fitness-contract requirement; hot-path SLA per generator should feed the US-L-NEW-13 leaderboard; outcome channel (PR/CI events) does not exist anywhere, US-L-4 is structurally blocked until built.

**Defer-to-owner:** Roger (canonical serialization algorithm); me + Erasmus (`evidence` field normalization); me solo (`confidence` `high|medium|low` ↔ `[0,1]` coercion).

**No code touched in `D:\git\stunning-adventure`** — read-only reconciliation per Aaron''s directive.

**One-paragraph summary.** Existing monorepo has strong unit/property/metamorphic test infrastructure and a working canonical-hash chain for committed DBOM artifacts, but no replay harness, no Pareto frontier, no fitness contract registry, no `causalReadSet`, no Salsa. Of my eight locked proposal fields, three (`category`, `confidence`, `rationale`) exist with normalization tax, one (`preview`) is partial via `Prescription.proposedChange`, five (`fitnessContract`, `evidence`, `costEstimate`, `reversibility`, `determinismClass`, `causalReadSet`) are NET-NEW with `evidence` actively contradicting two existing shapes. A3 cannot be retrofitted onto the existing ~1200 tests because none of them persist inputs and reload across processes; a fresh harness is required, but four existing patterns transfer directly as foundation: DBOM canonicalization, mirror-pin regression, property+metamorphic framework, and skill fixture directories. The only direct algorithmic contradiction is canonical-JSON+SHA-256 (DBOM) vs my Round-3 CBOR+BLAKE3 lock — deferred to Roger.


## 2026-05-25 Round 7: v1 framework triage

**Scope:** Tier every story I authored (US-L-1..8, US-L-NEW-9..13, Round-3 lock deliverables) against Aaron's v1 framework: `v1 = MVP that validates the thesis"Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible.'` Tiers T1-T6 + Parking. Full output: `.squad/decisions/inbox/laura-triage-2026-05-25T0200Z.md`.

**Triage shape:** 6 T1 / 7 T2 / 3 T3 / 1 T4 / 1 DONE. Two stories split (US-L-NEW-9 and US-L-NEW-13 — lite version T1, full version T2). One merge (US-L-3 folded into US-L-NEW-9, lifting `ValidationResult.tier` enum verbatim). Zero drops.

**Recommended T1 set (six items):**
1. 8-field proposal schema wired as L4 runtime validator (with `tier: 1|2|3` enum lifted from `ValidationResult` for free 80% start)
2. US-L-NEW-12 carrier — determinism conformance suite skeleton
3. US-L-NEW-9-LITE — fitness contract registry + scalar binding + mirror-pin enforcement (no Pareto frontier in T1)
4. US-L-NEW-13-MIN — per-generator scorecard {acceptance rate, A3 pass rate, source attribution} partitioned by US-G-5 closed enum from day 1
5. Hand-declared `causalReadSet` for v1 generators (ReadSetBuilder slips to T2 with Salsa)
6. Free-multiplier lift: `ValidationResult.tier` enum copied into harness fitness contract today (cheap if applied day 1, ugly retrofit otherwise — same lesson as Aaron's L1 substrate boundary discipline)

**Conformance kit (T1 non-negotiable): A1 + A3 + A4.** A2 explicitly out of T1 (needs compaction to exist before it has anything to fail against — slot in T2 alongside Roger's snapshot/compaction). Rationale: A3 is load-bearing for `by Crucible'' (Crucible must investigate its own past with rigor); A4 is the gate that makes A3 non-vacuous (without A4, skipping `causalReadSet` trivially passes replay); A1 is the cheap integrity floor (DBOM `canonicalStringify` pattern, ~3h port to CBOR+BLAKE3).

**Generator constraint (US-G-5 / Aaron 6b `source` closed enum) applied:**
- US-L-NEW-13-MIN: scorecard partitions by `source` from day 1 (no retrofit)
- US-L-NEW-9-LITE: fitness contract registry exposes per-`source` default weights; `external` inherits safety-asymmetric weights by construction (bakes `decisions.md:585` `external = most restrictive default'' intent into fitness, not just routing)
- Generator manifest schema: no `source` slot; validator rejects author-supplied `source`; loader stamps at registration

**Slipped to T2:** A2, Pareto frontier proper, scorecard calibration math, ReadSetBuilder, US-L-NEW-10 branching-as-eval, US-L-2 calibrated cold-start posteriors, US-L-1 curriculum classifier, US-L-7 provisional fitness, US-L-8 ledger-rewind lift.

**Slipped to T3:** US-L-5 pattern mining (Curator hand-written rules cover thesis), US-L-NEW-11 debugger acceptance harness (depends on Sonny's debugger), US-L-4 hint outcome validation (blocked on PR/CI outcome channel that does not exist).

**Slipped to T4:** US-L-6 sim->live drift (requires Tier 3 simulation to exist as a measurement source).

**DONE:** Canonical serialization spec — resolved Round 6 (CBOR+BLAKE3 for L1, DBOM stays SHA-256, per-column algorithm rule locked). Strike from open work.

**Five open questions to Cassima.** Q1 is the highest-leverage: does `by Crucible'' read strong (Crucible proposes + replay-investigates prior decisions + applies) or weak (Crucible proposes, Aaron applies manually)? I triaged for strong, which makes A3 a T1 must-have. Weak reading shrinks the T1 conformance kit to A1+A4 and slips A3 to T2. Q2-Q5: what counts as `an improvement to Crucible''; `one week'' wall-clock vs business days and how many discrete improvements expected; is the scorecard user-facing in v1 (needs Valanice/Erasmus partner story if yes); `ValidationResult.tier 3 = simulation'' typed-but-empty stub — keep or remove (I lean keep, same discipline as L1 substrate boundary).
  
**No new deliverables this round.** All Round-3 locks (8-field schema, A1-A4, ReadSetBuilder, scorecard, canonical serialization) hold unchanged; this round only assigns them tier numbers and splits two of them across T1/T2 boundaries.

---

**2026-05-27 Eureka PRD Overlap Analysis (Scribe Summary):** Cross-agent consensus on Eureka × Crucible architecture and UX overlap. See `.squad/decisions.md` **Eureka PRD Overlap Analysis** section for full findings and 5 open questions for Aaron.

---

## 2026-05-27: Crucible London-School TDD Strategy

**Task:** Author comprehensive London-school TDD strategy for Crucible agentic runtime. 15-25 page document with 12 sections covering acceptance tests, walkthroughs, collaborator contracts, test layering, invariant tests, mock drift defenses, test-first cadence, fixtures, coverage, open questions, and anti-goals.

**Constraint (FIREWALLED):** NO references to Graham's technical design documents. Strategy must be derived ONLY from PRD and locked decisions. This was a trust test—can Laura design test strategy knowing WHAT (user stories, invariants, primitives) without knowing HOW (implementation paths, class hierarchies, file structures)?

**Approach:**
1. Read PRD from `.squad/decisions.md` (Round 2-6 closeout sections, T5 resolution, locked v1 commitments, 5-layer architecture)
2. Extract 12 acceptance scenarios from user stories (US-A-*, US-S-*, US-L-*, US-Ro-*, US-Ga-*)
3. Define outside-in development cadence (red → green → refactor at acceptance → component → unit tiers)
4. Inventory abstract collaborator roles per layer (L0-L5 + cross-cutting)
5. Design 5-tier test pyramid (unit/component/contract/integration/acceptance + conformance suites)
6. Specify 8 invariant property tests (append-only, hash-chain, replay equivalence, fork lineage, hook verdict determinism, projection purity, trust-tier monotonicity)
7. Build 5-layer mock drift defense (contract tests, fixture builders, golden files, CI double-check runs, API stability tracking)
8. Flag 8 open questions where PRD ambiguities block test design (observation capture granularity, Eureka integration, structural proposal UX, plugin pinning scope, bisect execution model, timestamp normalization, mock drift threshold, Pareto fitness with missing axes)

**Deliverables:**
- **Document:** `docs/crucible-tdd-strategy.md` (120KB, 2441 lines, ~28 pages)
- **12 acceptance scenarios** (A1-A12): Session fork, hermetic replay, hook veto, causal slicing, Aperture push, plugin pinning, Curator trigger, Pareto fitness, determinism conformance, Router escalation, bisect, marketplace trust gradient
- **3 Red/Green/Refactor walkthroughs** (§4): Full TDD cycles from failing acceptance test down to leaf implementation, with mock-to-real progression
- **18 collaborator contracts** (§3): Abstract roles (SessionBootstrapper, AppendProtocol, HookBus, LedgerProjector, PolicyEngine, etc.) with mock/stub/spy/fake test doubles
- **5-tier test pyramid** (§5): Ratio 1 acceptance : 5 integration : 10 component : 3 contract : 50 unit
- **8 invariant property tests** (§6): Using `fast-check` to validate architectural invariants (append-only ledger, deterministic hashing, replay equivalence, fork transitivity, etc.)
- **5-layer mock drift defense** (§7): PR-time contract tests, build-time fixture builders, nightly golden files, PR-time CI double-check runs, build-time API stability tracking
- **8 open questions** (§11): PRD ambiguities requiring Aaron resolution before test strategy execution
- **10 anti-goals** (§12): Explicitly rejected testing anti-patterns (100% coverage mandate, mocking private methods, integration-only tests, shared mutable state, flaky tests tolerated, test-later mindset, manual-only validation, happy-path-only, unowned tests)
- **Decision record:** `.squad/decisions/inbox/laura-crucible-tdd-strategy.md`

**Key Learning: London-School Adaptation for Agentic Runtimes**

**Why London-school TDD fits greenfield agentic systems:**
1. **Strict layer boundaries** (L0-L5) + outside-in development forces explicit interface design at each layer transition. Test-first "red" phase for L4 Router must mock L1 append protocol—immediately surfaces whether L1 interface is sufficiently abstract.
2. **Tell-don't-ask design emerges from interaction testing.** Crucible's primitives (Request/Artifact/Observation/Decision/Question) are immutable events, not mutable entities. London-school interaction tests naturally validate command/event flows, matching append-only ledger semantics.
3. **Invariants are enforced via collaborator contracts.** Determinism (A1-A4), hermetic replay, per-row durability—these are cross-cutting invariants every layer must honor. Contract tests on collaborator boundaries (does every L3 prescriber emit read-sets? does L2 projection remain pure?) become first-class artifacts.
4. **Acceptance tests anchor the outside.** User-observable behaviors (session forking, counterfactual replay, policy escalation, bisect, Aperture notifications) define acceptance surface. Inside-out TDD risks building "perfect" L1 substrate that doesn't support actual user workflows.
5. **Mock drift is tractable in greenfield.** Classic London-school hazard (mocks diverge from real implementations) mitigated via: (a) contract tests validate collaborator boundaries, (b) shared fixture builders keep test data aligned with production schemas, (c) CI double-check runs swap mocks for integration stubs on critical paths, (d) hermetic replay as test oracle—production ledger snapshots become regression test inputs.

**Discipline Patterns Discovered:**
- **Three-commit cadence:** Red (failing test) → Green (minimal implementation) → Refactor (extract patterns). Git history becomes learning artifact.
- **Fixture builders > inline literals:** Test data via builders (`new PrimitiveBuilder().ofKind('decision').fromSource('builtin')`) adapts to schema changes automatically.
- **Golden files for regression:** Anonymized production ledger snapshots as test inputs (validate replay equivalence, determinism conformance).
- **Property tests for invariants:** Use `fast-check` to generate diverse test inputs, explore edge cases, validate architectural invariants (append-only, hash-chain, replay equivalence) across 50-100 random scenarios per property.
- **Contract tests prevent mock drift:** For every mocked collaborator, contract test validates real implementation honors mocked interface. Run on every PR (fast feedback).
- **CI double-check runs:** Component tests run twice—once with mocks (fast), once with real implementations (drift detection). If mocked test passes but real test fails, mock has diverged.

**Open Questions for Aaron (Testing Blockers):**
1. **Observation capture granularity** (per-tool-call vs per-primitive vs per-turn) blocks hermetic replay acceptance test (A2)
2. **Eureka integration path** (standalone L3 vs library vs deferred) affects test layering (separate tier vs shared orchestration)
3. **Structural proposal UX** (blocking modal vs Aperture notification vs review CLI) blocks Router policy escalation test (A10) assertions
4. **Plugin pinning scope** (direct deps vs transitive vs full environment) affects `SessionMetadata` fixture builders
5. **Bisect execution model** (shell out vs isolated subprocess vs in-process runner) blocks bisect integration test design
6. **Timestamp normalization** (excluded vs deterministic sequence vs non-deterministic field) affects determinism conformance suite
7. **Mock drift threshold** (zero-tolerance vs ≥3 in layer vs ≥10% total) determines when to escalate to mock audit sprint
8. **Pareto fitness with missing axes** (reject comparison vs zero-fill vs partial dominance) affects Alchemist test fixtures

**All blockers have recommendations** (favor simplicity + v1 MVM scope).

**Skill Extraction Candidate:** `london-tdd-for-agentic-runtimes` — The adaptation pattern (outside-in + tell-don't-ask + invariant contracts + hermetic replay as oracle) is reusable across agentic projects with similar constraints (determinism, replay, layer boundaries). **Defer decision** until after Aaron review.

**Tool Invocation Learning (Process Meta-Learning):**
- **Blocker:** Made ~15 failed attempts to invoke `create` tool for document generation. Root cause: systematically failed to provide required `file_text` parameter (called tool with only `path` parameter).
- **Fix:** Aaron's tactical solution: incremental build approach—(1) create small skeleton (<2KB), (2) use `edit` tool per section, (3) batch 3-4 edits per response, (4) verify with `view` periodically. This keeps payloads bounded, provides failure isolation, and surfaces progress incrementally.
- **Pattern internalized:** For large document generation, skeleton-first + iterative section fills is more reliable than single large `create` call. Bounded payloads reduce error surface area.

**Firewall Compliance:**
✅ Zero references to CTD artifacts (did NOT read `docs/crucible-technical-design-plan.md`, `docs/crucible-technical-design.md`, or Graham's inbox decisions)  
✅ PRD-only dependencies (5 primitives, hook verdicts, determinism invariants, locked decisions: L1 WAL, Eureka adapter, T5 resolution, 5-layer stack vocabulary)  
✅ All acceptance scenarios reference PRD user stories (US-*) or v1 commitments explicitly

**Outcome:** Strategy document complete at ~28 pages (slightly over 15-25 target but comprehensive). Awaiting Aaron resolution of 8 open questions before formal acceptance.

---

## 2026-05-27 — Crucible TDD Strategy: 8 Open Questions Resolved

**Task:** Revise `docs/crucible-tdd-strategy.md` in place to integrate 8 resolved questions from Aaron's Decision-Point gate.

**Context:** Initial strategy draft (12 sections, 8 open questions Q1-Q8) presented to Aaron via coordinator. All 8 questions locked via interactive Decision-Point gate. My task: integrate every resolution throughout the doc, moving status from DRAFT → FINAL.

**Key learnings:**

### 1. Refined Option E (Context-Window Commitment Model) — Q1 Resolution

**What:** Decision primitive's commitment is a **Merkle hash over the causal-context window**—every prior ledger row visible to the LLM at decision time, regardless of primitive type (Request, Artifact, Observation, Decision, Question).

**Why this is architecturally significant:**
- **Removes agent-intent dependence:** Commitment is structurally computed from session lineage, not agent's claim about "which observations mattered." Eliminates M1 (orphan observations) and M2 (empty observation-set hash) failure modes from my original Option B.
- **Makes hermetic replay easier:** Replay logic becomes "replay prefix → recompute context-window hashes → compare to stored commitments." No separate observation-capture store needed—observations are first-class primitives in the ledger itself.
- **Strengthens causal slice:** Data lineage (what content influenced the decision) + authorization lineage (who/what produced the context) both available via single context-window query.
- **Bootstrap-Capture-Completeness invariant:** Extra-ledger context (system prompts, tool definitions, cross-session memory) MUST be captured as Observation primitives at session offset 0. Replay drifts if violated.

**Testing implications:**
- New fixture builder: `LedgerPrefixBuilder` with `.withBootstrapContext()` and `.appendDecision(contextWindowSize)` methods
- New invariant test: §6.8 Bootstrap-Capture-Completeness (validates offset-0 observations capture all extra-ledger context)
- Revised §6.2 Hash-Chain Integrity property test (now tests context-window hashing, not just read-set hashing)
- Collaborator contract: Renamed `ObservationCaptureStore` → `LedgerWindowReader` (provides read access to ledger prefix for context-window reconstruction)

**Pattern to reuse:** Structural commitment over causal-context windows is a general agentic-system primitive. When designing determinism for any agent runtime, compute commitments over the **full visible state** (not agent's self-reported dependencies). Prevents "agent forgot to declare a dependency" bugs.

---

### 2. Agentic-Cost-Function Principle (Zero-Tolerance Gate) — Q7 Resolution

**What:** Single contract test failure blocks all PRs (zero-tolerance). No ≥3-failure threshold, no "mock audit sprint" escalation.

**Why traditional human-team thresholds don't apply:**
- **Human teams:** Context-switch tax (developer pulled from feature work to fix mock) + resentment (developers disable tests for expediency) make zero-tolerance brittle. ≥3-failure threshold balances iteration speed vs correctness.
- **Agentic teams:** Cost functions invert:
  - **Context-switch tax = near-zero:** Spawn background agent to address contract test failure. Agent investigates, fixes mock or real implementation, commits. No human context switch.
  - **Resentment = non-existent:** Agents don't experience frustration or disable tests out of expediency.
  - **Drift cost = compounding:** Mock drift compounds across agent actions. An agent making 20 decisions per session against a drifted model produces cumulative correctness debt. Detection cost scales linearly with drift duration.
  - **Fix cost = near-zero:** Agent-driven fix (update mock, update component tests, validate contract) completes in minutes.

**Pattern to reuse:** When designing test gates for agentic workflows, reconsider human-team trade-offs. Policies that are "too strict" for human teams (zero-tolerance, exhaustive coverage) may be correct for agentic teams where fix cost approaches zero. The bottleneck shifts from "developer time to fix" to "agent-spawn latency" (seconds to minutes).

---

### 3. Generic Adapter Conformance Suite Pattern — Q2 Resolution

**What:** Define a **generic L3 Generator adapter conformance suite** that any adapter implementation must pass. Applies to Forge today, Eureka v1.5+, marketplace plugins. No Eureka-specific tests in v1 (deferred to v1.5).

**Why this is better than per-adapter test strategies:**
- **Interface standardization:** Conformance suite defines the `PrescriberOrchestrator` contract once. Any adapter (Forge, Eureka, future marketplace plugins) plugs into the same test harness.
- **No new test infra per adapter:** Eureka v1.5 will run the v1 conformance suite. No need to design Eureka-specific contract tests from scratch.
- **Future-compatible:** Marketplace plugin developers get a conformance suite to validate their adapters against. Self-service validation.

**Pattern to reuse:** For any pluggable system (prescribers, projectors, hooks), define a **generic conformance suite** as a first-class test artifact. Don't write per-implementation contract tests—write one conformance suite all implementations must pass. Benefits: standardization, self-service validation, no per-plugin test debt.

---

### 4. Deliverables

1. **`docs/crucible-tdd-strategy.md`** revised in place ✓ — Status: FINAL — 8 Open Questions Resolved 2026-05-27
2. **`.squad/decisions/inbox/laura-crucible-tdd-strategy-revision.md`** decision drop created ✓
3. **`.squad/agents/laura/history.md`** appended (this entry) ✓

---
---

## Phase 2 — CTD §16 Test Strategy + Invariants (FINAL)

**Date:** Phase 2 fan-out.
**Output:** `docs/crucible-technical-design/16-test-strategy-invariants.md` (16,182 bytes).
**Decision drop:** `.squad/decisions/inbox/laura-ctd-phase2-laura.md`.

### Pattern: §16 as a cross-reference document, not a re-author

§16's job in the CTD is to be the **thin CTD-side handle** on the
authoritative TDD strategy doc. The instinct (mine, early) was to restate
test counts, fixture patterns, and invariant propositions in §16 so a
CTD-only reader could understand the test posture without leaving the CTD.
That instinct is wrong here: duplication creates a second source of truth
that drifts, and the drift cost is exactly the mock-drift cost Q7 captures
(compounded across every contributor who reads only one of the two docs).

The pattern that worked: §16 contains **only** what the CTD uniquely
authorizes — CI-stage runners, the collaborator → CTD-section alignment
matrix, the productivity-loop smoke test (it composes seams owned by
multiple CTD sections, so neither the TDD nor any one CTD section can host
it cleanly), and the tooling/conformance execution specs. Everything else
is a one-line "see TDD §X." Net effect: §16 stays at 3 pages and gets
**stronger** when the TDD strategy evolves, because there is nothing in
§16 to keep in sync.

Reusable for any future "thin reference" CTD section: enumerate what the
referenced doc owns, refuse to restate it, and confine the host section to
the bindings that only the host can author.

### Pattern: alignment matrix as teaching artifact

The collaborator → CTD-section alignment matrix (§16.3) is the artifact
I'd reach for first when onboarding a new engineer. It collapses two
otherwise-disjoint vocabularies (TDD collaborator roles, CTD section
numbers) into a single table, and the **tier column** tells the reader
which mock-drift defense to think about for each seam. The matrix
surfaced one structural observation: `QueryExecutor` and
`CausalSliceEngine` bind to CTD content that does not yet exist as a
standalone file — the L2 row of §1.2 is the only home for the former
today, and L5 Investigation is unscheduled until Phase 2/3. This was
**not** apparent from reading either doc alone; it fell out of forcing
every TDD §3 row to land in a CTD §X cell. Phase 3 synthesis can use the
matrix as a coverage check for "are all the architectural seams actually
sectioned?"

The teaching angle: the matrix is also the **rule** for how new
collaborators get added. Adding a row to TDD §3 without adding a
corresponding §16.3 row is a documentation bug; the matrix is the
forcing function that keeps the two docs honest.

📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.

## Learnings (2026-05-30: Pass A Execution — C-9 Threading + ADR Acceptance Signals Template)

**Task:** Execute two Pass A test-strategy items left from prior session: (1) thread C-9 conformance check through §16.9 acceptance signals, (2) propose Acceptance Signals subsection requirement for ADR body template.

**What shipped:**
- §16.9 edit: Added explicit C-9 acceptance signal to §7.A Generic L3 Adapter Conformance entry with observable signal ("conformance suite rejects generators that emit supersede-replacement proposals without valid parentId lineage") + coordination note for Rosella (PA-B4 may shift §7.A test harness, but C-9 contract is stable).
- docs/adr/adr-template.md: New template file with mandatory "Acceptance Signals" subsection using five-tier taxonomy (contract/component/acceptance/invariant/countersignal).
- Decision drop: .squad/decisions/inbox/laura-pass-a-test-strategy.md for Graham (ADR template review + backfill coordination) and Rosella (FYI on C-9 coordination note).

**Key learning — ADRs define WHAT but not HOW WE KNOW it worked:**
- Examined ADRs 0001/0002/0006/0011/0018. All have strong "What Changes" (implementation surface) and "Consequences" (impact), but none explicitly define acceptance signals — the observable test-strategy-level evidence that the ADR is correctly implemented.
- Problem: as a test-strategy owner, I have to infer from "What Changes" prose what the testable contract properties are. ADR-0002 lists file paths but doesn't say "the acceptance signal is: AppendProtocol conformance test rejects post-fsync writes." ADR-0006 argues bypass prevention but doesn't name the countersignal: "if Applier approves without Router, the ADR is violated."
- Solution: explicit "Acceptance Signals" subsection bridges ADR decisions to test strategy. This is the test-centric counterpart to "What Changes" (implementation-centric) and "Consequences" (impact-centric).
- Five-tier taxonomy (contract/component/acceptance/invariant/countersignal) maps directly to §16.1 test category matrix, making ADR acceptance signals mechanically translatable into test-plan entries.

**Investigative note for future ADR authoring:**
When spawning test-authoring agents, point to the ADR's Acceptance Signals subsection instead of inferring test requirements from "What Changes" prose. The five-tier taxonomy is the test-strategy authority — it tells me what to test at which tier.

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
# Laura — History

**Role:** Tester (Contract-first patterns, integration testing, test architecture)
**Status:** M3 baseline preserved. Eureka M2 GREEN landed 2026-05-28. M7-A review-complete 2026-05-31. M7-B+M7-D complete 2026-05-31 (branch: eureka/m7-bd-narrowing-regression, 62 tests total).
**Last update:** 2026-05-31

**Key milestones:**
- Phase 2-4.6 test architecture (contract-first, metamorphic testing)
- M2 recall() seams locked (FactStore.search injection, SessionId brand)
- M3 composite-ranker baseline (FR-2 formula validation)
- Issue #17 async-sweep: 0 required fixes, 12 tests added
- Cycle 2 findings: 8 addressed in combo pass
- M5+M6 review wave: 8 new tests, 29→37 total

**See history-archive.md for detailed entries.**

## Current & Next

### 2026-05-31: M7-A Review Cycle — COMPLETE

**Summary:** M7-A (Typed Error Hierarchy, Edgar lead) completed 3-cycle review process (Cycles 1–2 panel + fix wave, Cycle 3 lightweight). All 40 tests green throughout. PR #38 review-complete, pending ship decision.

**Next up:** M7-C — Real FactReader contract + atomicity design. Direction locked: Aaron picked (c) mutate callback over (a) caller-serialization and (b) CAS token. Rationale: pushes read-modify-write into seam, keeps activity layer pure, makes correctness a storage-layer property. Crispin/Edgar implementing on `eureka/m7-c-atomicity`.

---

## Learnings

### 2026-05-31: M7-B+M7-D — Exhaustive narrowing + regression locks

**Test counts:** Baseline 40 + M7-B 14 + M7-D 8 = **62 total**. All green. Build clean.

**Branch:** `eureka/m7-bd-narrowing-regression` (2 commits from 3009d81 "M7-A").

**What the narrowing tests revealed:**

1. **`err.name` is the domain class name, not the base class name (F4 confirmed).** InvalidTrustValueError.name is 'InvalidTrustValueError', not 'RangeError'. Any caller branching on `err.name === 'RangeError'` for InvalidTrustValueError would break — `err.code` is the correct primary discriminator.

2. **`source` field on InvalidTrustValueError is highly useful at catch sites.** The two throw paths ('input' via currentTrust/correctionDelta, 'storage' via FactReader) can be distinguished without re-inspecting the message. Group 4 locked both paths distinctly.

3. **Exhaustive switch on `unknown` input requires an explicit struct check first (`typeof err === 'object' && 'code' in err`) before the switch.** Without this, accessing `err.code` on a plain string or null throws. The `narrowEurekaError` helper demonstrates the canonical three-step: type-guard → code access → switch.

4. **Zero-delta passthrough (M7-D-4) is a meaningful regression lock.** A short-circuit optimization that skips the write for delta=0 would violate the caller contract — the caller explicitly chose a 0-delta, and not writing is a silent behavior change. Locked.

5. **`factReader.read` was called even when `correctionDelta=NaN` throws (M7-D-8 confirmed read order).** The storage read happens first; only the subsequent write is prevented. Error ordering is: read → validate storage trust → validate input delta → write.

6. **No bugs found in errors.ts or recall.ts.** The M7-A contract held completely. No production code changes were needed or made.

**Contract ambiguities surfaced (deferred):**

- TODO comment in recall.ts (line 325) notes correctionDelta's error should use a purpose-specific `InvalidDeltaValueError` class. Currently it reuses `InvalidTrustValueError(source:'input')`, which is technically accurate but semantically loose (correctionDelta is a delta, not a trust value). Flagged for M7-B follow-up; not addressed here per task scope.

- `FactReaderContractError` carries `factId` but the FactReader contract error is a programming error in the FactReader implementation, not a per-fact error. The `factId` field is useful for debugging but may be surprising to callers who don't expect it. Noted — no change.

---

### 2026-05-30: M5+M6 Cycle 3 — Polish: correctionDelta regression + comment cleanup

**P3 & P4 complete (2/2):** Updated stale M6-B import comment to reflect GREEN status. Added correctionDelta finite-guard regression tests (NaN, +Infinity) to lock cycle 2 carryover guard. Added optional FactReader undefined→TypeError test for Edgar's P2 (fails until his commit lands; both green at HEAD by EOW).

**All 40/40 tests pass.** Commit: `9d13389`.

### 2026-05-30: M5+M6 Cycle 2 — Purge unused clock deps from feedback tests

**Finding:** Cycle 2 review (Correctness C5 + Craft Cf8 + Compliance consensus) identified that `clock: fixedClock` was silently carried through all `applyFeedback`/`applyFeedbackById` call sites after Edgar removed `ClockProvider` from the feedback deps types in cycle 1. The `__tests__` dir is excluded from tsc, so excess property checking never fired.

**Changes made (recall-feedback.test.ts only):**
- Removed `clock: fixedClock` from 15 `applyFeedback(...)` call sites → deps shape is now `{ trustUpdater }`
- Removed `clock: fixedClock` from 4 `applyFeedbackById(...)` call sites → deps shape is now `{ factReader, trustUpdater }`
- Removed false "ClockProvider is REQUIRED in all activity deps" block comment; replaced with accurate scope note: clock is required for recall/recallWithScores, NOT for the feedback path
- Fixed inline signature sketch in the M6-B section: dropped `clock: ClockProvider` from the `applyFeedbackById` deps shape
- Removed `fixedClock` const and `FIXED_NOW_MS` — both fully unused after call-site cleanup (no ClockProvider import in this file either)

**Validation:** 37/37 tests pass. No Edgar inbox drop present (`.squad/decisions/inbox/edgar-m5m6-cycle2.md` does not exist); no new regression-lock test added.

**Pattern reinforced:** When an impl change removes a dep from a type, always grep the companion test file for the old field name — tsc exclusion of `__tests__` means excess-property checks won't catch stale injections.

### 2026-05-30: M5+M6 Review Wave — boundary, closeTo, regression locks

**8 tests added across 6 findings:**

**F8 — Idempotent boundary:** The overshoot clamp tests (0.95→1.0, 0.05→0.0) only covered "approaching" the boundary. Adding "already at boundary" tests (currentTrust=1.0 corroboration → 1.0; currentTrust=0.0 contradiction → 0.0) is a distinct regression lock — a future refactor could leave the clamp off and these exact cases would slip through the overshoot tests.

**F9 — closeTo precision choice:** Used `expect.closeTo(value, 5)` rather than the panel-suggested 10. Rule of thumb: pick precision where test failure = wrong business logic, not float jitter. For trust deltas (+0.10, -0.10, ±0.30), IEEE-754 jitter is at 1e-16 level; 1e-5 tolerance catches any real math error while leaving noise-immunity headroom. 10 digits is generous to the point of masking subtle precision bugs in hypothetical future implementations.

**F-NEW-EXHAUSTIVE:** Casting an invalid string `as FeedbackEvent` to test exhaustiveness guards is the correct pattern for "defensive guard for unsafe casts" — it exercises exactly the runtime scenario the guard is meant to protect against (TypeScript union bypass via untrusted source). Don't shy away from `as` casts in tests that explicitly target this path.

**F-NEW-PROPAGATION (applyFeedbackById missing-delta):** When testing error propagation through an orchestrator, use `rejects.toThrow()` (untyped) at the orchestrator boundary rather than asserting the exact error class. The orchestrator's contract is "surfaces the error"; the exact type is an implementation detail of the delegate (`applyFeedback`). If the delegate's error type changes, the orchestrator contract test should not need to change.

**Clock dep coordination pattern:** When a cross-agent change (Edgar removing `clock` dep) affects your tests, document the delta explicitly in the decision drop with the exact call sites to update. Don't pre-drop the dep if the implementation hasn't landed yet — it would break the TypeScript type check at the test boundary. Wait for the impl commit, then make the coordinated update.

### 2026-05-30: M6 RED — user_correction contract lock + read-seam (FactReader)

**Two RED beats landed:**

**M6-A** — `user_correction` event contract (5 tests in `describe('applyFeedback', ...)`):
- M6-A1–A4: 4 arithmetic tests (positive/negative delta, ceiling/floor clamp). All 4 passed GREEN on first run — Edgar's M5 GREEN had already implemented the `user_correction` branch correctly. These are regression locks, not proper RED. Mild §55 contract-after-implementation deviation documented in test comments.
- M6-A5: Missing `correctionDelta` when `event='user_correction'` → should throw. This IS the true RED beat. Edgar's impl uses `correctionDelta ?? 0` (silent fallback), so the test fails correctly: "promise resolved undefined instead of rejecting."

**M6-B** — `applyFeedbackById` read-seam (2 tests in new `describe('applyFeedbackById (read-seam)', ...)`):
- Chose a NEW `applyFeedbackById` function (higher-level orchestrator) over mutating `applyFeedback`. Preserves M5 contract stability; separation of concerns.
- `FactReader` interface driven: `read(args: { factId, sessionId }): Promise<{ trust: number } | null>`.
- M6-B1: happy path — FactReader supplies trust, delta applied, TrustUpdater called with correct value. RED: `applyFeedbackById is not a function`.
- M6-B2: FactReader returns null → must throw; TrustUpdater not called. RED: same.

**Final counts:** 29 tests total. 26 pass (18 M1–M4 + 8 M6-A pass/regression-lock). 3 fail RED: M6-A5 + M6-B1 + M6-B2.

**New pattern learned:** Contract-after-implementation regression-lock. When implementation arrives before contract tests, the correct response is: write the tests anyway (they lock the contract), document the §55 deviation in comments, and ensure at least one test in the beat is genuinely RED (drives undefined behavior). Mechanical passing tests still have value as regression guards.

**Read-seam shape decision:** New function (`applyFeedbackById`) over extending existing (`applyFeedback`) because: (a) `applyFeedback` has a stable M5 contract, (b) orchestration (read + compute + write) is a different responsibility from pure compute + write, (c) keeps `applyFeedback` unit-testable without storage deps.

**Next owner:** Edgar — M6 GREEN. See `.squad/decisions.md` for the merged decision trail.

### 2026-05-30: PR #34 Review — RED-beat skill, scope clock dep to recency activities

**Three Copilot threads resolved (all same theme — stale `clock` references in SKILL.md):**

- **Activity signature example (~line 56):** Removed `clock: ClockProvider` from the deps block; replaced with a comment scoping it to recency activities only (`recall()` / `recallWithScores()`, per §55 §1.2 / §30 §2.3).
- **Design decision bullet (~line 62):** Rewrote "clock is always in deps" bullet to state the actual rule: `clock` belongs in deps only when the activity reads time; feedback mutation omits it; required-but-unused deps are an anti-pattern that pollute tests with phantom injections.
- **Checklist item (~line 135):** Updated to conditional — "only if the activity calls recall APIs" — aligns with shipped `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` (no clock).

**Validation:** 40/40 tests green. No code or test files touched — documentation only. Commit: `4d4378b`.

**Pattern reinforced:** Skill documentation is a contract. When the shipped implementation deviates from a required-but-unused dep pattern, update the skill immediately so future RED beats aren't taught the wrong interface shape.

### 2026-05-30: M5 RED — Trust Feedback Mutation Contract

📌 Team update (2026-05-31T07:24:22Z): **M7-A (PR #38) shipped** — Typed error classes for applyFeedback/applyFeedbackById. 5 error classes with code discriminators. All 40 existing tests GREEN (no changes required, inheritance preserved). Next: M7-B (Laura — exhaustive narrowing tests) and M7-C (Crispin/Edgar — FactReader contract + atomicity). — Scribe

---

📌 Team update (2026-06-02T06:00:00Z): **M7-B + M7-C + M7-D (PR #41) COMPLETE — Eureka M7 Shipped** — Edgar + Crispin delivered 5-cycle marathon. 22 unique Copilot findings (44 threads). Final: 74 tests green, tsc-clean, lint-clean, merged to main as ed6be2c. M7 COMPLETE: error narrowing (B) ✅ + atomicity contract (C) ✅ + session-scoped regression tests (D) ✅. New skill: `.squad/skills/refactor-grep-cleanup/SKILL.md` (grep repo for old interface names post-refactor, not across N cycles). — Scribe

## Learnings

### 2026-06-06: SQLite-C1 constraint assertion tightened (review-cycle cycle 2 remediation)

**Task:** Two cycle-2 review findings in `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts`.

**Fix 1 — [IMPORTANT] Constraint-specific assertion for SQLite-C1:**
- Old: `.toThrow()` — too weak; passes on any throw including the session-exists guard.
- New: `.toThrow(/UNIQUE constraint failed|SQLITE_CONSTRAINT/i)` — proves the SQLite PK constraint fired.
- Confirmed schema uses `PRIMARY KEY (session_id, "offset")` in schema.ts. better-sqlite3 surfaces PK violations with message "UNIQUE constraint failed: events.session_id, events.offset".
- Test setup already correct: `insertRootSession` is called first, so the `pushEvent` session-exists guard (`if (!exists) throw`) passes on both calls. The only possible throw on the second push is the constraint — no pre-emption risk.
- A generic non-constraint throw (e.g. "session not found") would NOT match `/UNIQUE constraint failed|SQLITE_CONSTRAINT/i`, proving the matcher is discriminating.
- Added inline comment explaining why the session-guard does not pre-empt and what error shape better-sqlite3 surfaces.

**Fix 2 — [LOW] Dropped fragile commit-hash from beforeEach comment:**
- Removed "Roger's a57f95f" from the beforeEach comment. The file-header GREEN note already captures the milestone context.

**Verification:** crucible-core 6/6 green, crucible-cli 9/9 green (8 integration + 1 acceptance). tsc --build --force clean. No lint script in packages. Commit: `d4ca4ce`.

**Rule reinforced:** Integration test error assertions must be *constraint-specific* — a pattern that only the intended failure path can satisfy. `.toThrow()` without a matcher proves nothing about discriminating power.

### 2026-06-06: Refactor 3 RED → GREEN cleanup (review-cycle cycle 1 remediation)

**Task:** Two persona-review findings in `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts`. Roger's `a57f95f` had already landed (createSQLiteDB exported, SCHEMA_V1_SQL single-sourced, pushEvent throws on unknown session). My job: integration test file only.

**Fix 1 — Stale RED prose:**
- Removed the `🔴 RED PHASE: These tests FAIL because…` block and its `Expected RED failure` section. These were accurate TDD scaffolding at authoring time but became false after Roger's GREEN commit.
- Replaced with a brief `// GREEN — Refactor 3 complete, 2026-06-06` note referencing the commit SHA.
- Also removed the `// 🔴 RED:` comment in `beforeEach`.
- **Rule reinforced:** RED-phase narrative is scaffolding, not documentation. It must be removed (not just commented out) when the phase ends, otherwise it misleads future readers about system state.

**Fix 2 — SQLite-specific assertion (SQLite-C1):**
- The existing tests only asserted API outcomes (ledgerSize, range counts, fork metadata) — all satisfiable by a map-backed fake.
- Added `[SQLite-C1]`: insert a session, push event at offset=0, then push again at offset=0. The events table has `PRIMARY KEY (session_id, "offset")` (confirmed in `schema.ts`). better-sqlite3 throws synchronously on the duplicate INSERT. A fake would silently overwrite.
- Chose option (a) (duplicate-offset rejection) over option (b) (second connection re-read) because: (1) `:memory:` databases are per-connection — option (b) would require a temp file and cleanup logic; (2) the PK constraint test is simpler, faster, and equally definitive.
- **Rule reinforced:** Integration tests must include at least one assertion that is *impossible* for the mock/fake to satisfy. Otherwise the integration layer adds no discriminating power over unit tests.

**Verification:** crucible-core 6/6 green, crucible-cli 9/9 green (8 integration + 1 acceptance). tsc --build --force clean. eslint clean. Commit: `324c287`.



---

## Forge M3 — Disposition Feedback Hardening (2026-06-05)

**Task:** Adversarial/edge-case test hardening for Graham's M3 implementation (issue #42).

### Tests Added

**`packages/forge/src/prescribers/utils.test.ts`** (NEW — 10 tests):
Pure unit coverage of `applyDispositions` in isolation. Key cases:
- Empty dispositions → no-op
- `dismissedCount=1` and `dismissedCount=2` → suppressed (permanence explicit)
- `resolvedCount=1` → confidence boosted
- `confidence=0.9` with boost → clamped to exactly 1.0 (Math.min(1,...) ceiling)
- `confidence=1.0` with boost → still 1.0 (already at ceiling)
- `dismissedCount=1, resolvedCount=1` (same category) → dismissed wins (documented precedence)
- `dismissedCount=0, resolvedCount=0` (all-zero) → strict no-op
- Category absent from dispositions → hint passes through unchanged
- Multi-category mixed effects: suppress one, boost another
- Immutability: original hint objects not mutated (pure function contract)

**`packages/forge/src/prescribers/forgePrescriberOrchestrator.test.ts`** (+4 tests):
Adversarial orchestrator tests (new describe block "M3 adversarial edge cases"):
- `dismissedCount=2` (re-dismissed) → still suppressed [Gap #1]
- `sessionCount=9` → baseline confidence 0.9 → `0.9 * 1.2 = 1.08` → clamped to 1.0 [Gap #2]
- `dismissedCount=1, resolvedCount=1` same category → dismissed wins [Gap #3]
- All-zero DispositionSummary → no-op [Gap #5]

**`packages/cairn/src/__tests__/sqliteHintDispositionProvider.test.ts`** (+3 tests):
Adversarial provider-level boundary tests:
- Absent `source` key in payload (no source field at all) → not counted
- Mixed mcp+system for same category: system dismissed + mcp resolved → dismissed_count=0, resolved_count=1
- Orphan transition event (hint_id not in optimization_hints INNER JOIN fails) → not counted

**`packages/skillsmith-runtime/src/__tests__/dispositionIntegration.test.ts`** (NEW — 4 tests):
End-to-end Cairn→runtime→forge integration tests via `executePrescriberRun`:
- Dismissed category absent from prescriber output (full chain)
- Resolved category present with boosted confidence (full chain)
- Source=system gating verified end-to-end (provider filters it, convergence not suppressed)
- Both effects in one run: dismiss convergence + resolve cache-optimization

### Test Counts

| Package | Before (Graham) | After (Laura hardening) |
|---------|----------------|------------------------|
| cairn | 725 (+9 Graham) | 728 (+3 Laura) |
| forge | 651 (+7 Graham) | 665 (+14 Laura: 10 utils + 4 orchestrator) |
| skillsmith-runtime | 49 (unchanged) | 53 (+4 Laura integration) |

**Total new tests:** 21 (net: 17 unique; 10 utils + 4 orchestrator + 3 cairn + 4 integration)

### Learnings

**Integration test design for disposition seams:**
- `executePrescriberRun` always wires `SqliteHintDispositionProvider` — there's no "dispositionless baseline" path through it. To verify a category WOULD be generated, run the prescriber BEFORE seeding any disposition events, or assert on other categories being present as a proxy.
- The seed hint and disposition event must be seeded BEFORE calling `executePrescriberRun` that should see them. Order matters critically.
- `result.hints` is set before the insertion loop — it reflects the pre-insertion hint list (post-`applyDispositions`). Deduplication in the insertion loop does NOT affect `result.hints`.

**Orphan JOIN trap (cairn provider):**
The `SqliteHintDispositionProvider` SQL uses INNER JOIN on `optimization_hints`. If you emit a `hint_state_transition` event that references a `hint_id` that doesn't exist in `optimization_hints`, the JOIN fails and the event is silently excluded. This is correct behavior (defense-in-depth) but also means tests must seed the underlying hint row or the disposition event will be invisible to the provider.

**`resolveOptimizationHint` is exported from `@akubly/cairn` (preferred for disposition-event tests):**
It is the preferred way to emit source='mcp' disposition events end-to-end. For adversarial tests that need direct control over the event payload (e.g., source=system or absent source), drop to `cairn.insertHintIfNew` + `cairn.logEvent` + `cairn.ensureSystemSession` directly.

**Fixture helper added:**
`emitMcpDisposition(db, skillId, hintId, disposition, note?)` — in `dispositionIntegration.test.ts`. Mirrors exactly what `resolveOptimizationHint` does for the event structure. Reusable pattern for other tests seeding disposition events.

**Seam hardness:** The `HintDispositionProvider` typed seam (forge←@akubly/types→cairn) is clean to test. The orchestrator-level tests need no real DB — a `vi.fn().mockResolvedValue([...])` mock satisfies the interface. The integration tests need a real DB for the JOIN-based SQL query. Two tiers are appropriate and complementary.

### Decision drop

`.squad/decisions/inbox/laura-forge-m3-test-hardening.md`



Earlier entries (1410 lines) archived to history-archive.md on 2026-06-05.

---

