# Laura — Work History (Summarized)

## Summary

Tester. Primary focus: test architecture, RED test suites, contract-driven development.

Key contributions:
- WI-A: Schema validation test suite (1405 tests)
- Slice D+: 14 RED test cases for cursor versioning (FS-10a-g, FS-SE-14/15)
- Slice D+: FTS5 revert + FS-SE-15 seed fix post-review

## Recent Sessions (Last 100 lines)


**Fixture helper added:**
`emitMcpDisposition(db, skillId, hintId, disposition, note?)` — in `dispositionIntegration.test.ts`. Mirrors exactly what `resolveOptimizationHint` does for the event structure. Reusable pattern for other tests seeding disposition events.

**Seam hardness:** The `HintDispositionProvider` typed seam (forge←@akubly/types→cairn) is clean to test. The orchestrator-level tests need no real DB — a `vi.fn().mockResolvedValue([...])` mock satisfies the interface. The integration tests need a real DB for the JOIN-based SQL query. Two tiers are appropriate and complementary.

### Decision drop

`.squad/decisions/inbox/laura-forge-m3-test-hardening.md`



Earlier entries (1410 lines) archived to history-archive.md on 2026-06-05.

---


## 2026-06-07 — M8 Slice D Complete

**Slice:** M8 Slice D — SQLite Production Deps Factory (Roger, Laura, Graham)  
**Status:** ✅ COMPLETE (147/147 tests, factory-on-subpath, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied)

**Summary:** Roger shipped factory functions (createSqliteRecallDeps, createSqliteFeedbackDeps) on @akubly/eureka/sqlite, preserving Slice A isolation. Laura added +2 smoke tests (SD-1, SD-2). Graham's architectural review: boundary integrity verified, composition root clean, spec tension resolved correctly. Scribe merged decisions inbox + applied SD-F1 ledger amendment.

**Key artifacts:**
- packages/eureka/src/sqlite/deps.ts — factory implementations
- packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts — SD-1, SD-2 smoke tests
- .squad/decisions.md — M8 Slice D as-built section (Graham SD-F1)

📌 **Slice D review-cycle complete + PR #54 opened** (2026-06-07T06:03Z): 5-persona Code Panel review → 0 blocking, 2 important + 3 minor fixed, 2 sound rejects + 1 false-positive cleared; 148/148 tests passing; Copilot review requested. — Scribe

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.

---


## 2026-06-08 -- Slice D+ Cursor Versioning RED Tests

**Slice:** M8 Slice D+ -- Cursor Versioning + Scope Fingerprint (RED tests only)
**Status:** RED COMPLETE -- 14 failing tests written; 0 pre-existing tests broken

**Summary:** Wrote the full RED test suite for Graham's cursor versioning design. Created storage/errors.ts with CursorScopeMismatchError and CursorVersionUnsupportedError type scaffolding. Added FS-10a-g to the shared contract helper (exercised across both InMemoryFactStore and SqliteFactStore). Added FS-SE-14 and FS-SE-15 to the SQLite edges file.

**Test inventory:**

Contract suite (fact-store.contract.test.ts via helper):
- FS-10a x2 (InMemory + SQLite): Cursor decoded as { offset:1 }, missing v:1 and scope fields
- FS-10b x2: search() resolves instead of throwing CursorScopeMismatchError (wrong query)
- FS-10c x2: search() resolves instead of throwing CursorScopeMismatchError (wrong session)
- FS-10d x2: search() resolves instead of throwing CursorScopeMismatchError (wrong minTrust)
- FS-10e x2: search() resolves instead of throwing CursorScopeMismatchError (wrong limit)
- FS-10f x2: GREEN (backward compat -- existing behavior already correct, intentional)
- FS-10g x2: search() resolves instead of throwing CursorVersionUnsupportedError (v:99)

SQLite edges (fact-store-sqlite-edges.test.ts):
- FS-SE-14: decoded.scope is undefined (v0 cursor has no scope field)
- FS-SE-15: decoded.v is undefined (v0 cursor has no v field)

Total failing: 14 across 2 files. FS-1..FS-9 and FS-SE-1..FS-SE-13 continue to pass.

**Key artifacts:**
- packages/eureka/src/storage/errors.ts (NEW -- error type scaffold)
- packages/eureka/src/storage/__tests__/fact-store-contract.helper.ts (+7 FS-10 tests)
- packages/eureka/src/storage/__tests__/fact-store-sqlite-edges.test.ts (+2 FS-SE-14, FS-SE-15)

### Learnings

**Error type scaffold vs. implementation stub:**
Creating error class definitions in storage/errors.ts is NOT stubbing the implementation. The throw sites in search() are Roger's work. Error type definitions are the test contract -- Laura defining them is appropriate. This avoids breaking the entire test file via module-not-found errors while keeping RED as assertion failures, not load failures.

**Import isolation discipline for RED tests:**
If error class imports are added to a shared helper that also contains FS-1..FS-9, a missing module would break ALL tests in the wiring file (unrelated setup errors). Solution: create the error type stubs so imports resolve, keeping RED failures as assertion failures only.

**RED strategy for format-change tests (FS-10a):**
When testing that output FORMAT changes (v0->v1 cursor), add an explicit assertion on the new format. The round-trip behavior (FS-5) would pass either way. Decoding the nextCursor and asserting { v:1, scope: string } is the precise RED anchor.

**Backward-compat tests start GREEN intentionally:**
FS-10f tests existing behavior (v0 cursors are accepted). It should start GREEN and stay GREEN. Not all tests in a RED test suite need to be individually RED -- non-regression locks are valid members of a feature test suite.

**Scope-mismatch cursor acquisition pattern:**
The canonical way to construct a wrong-scope cursor for tests: call search(params_A) -> capture nextCursor -> call search(params_B, cursor: nextCursor) where params_B changes exactly one parameter. This avoids hard-coding internal fingerprint format.

**v:99 unknown version test:**
Construct manually: Buffer.from(JSON.stringify({ v: 99, offset: 0, scope: 'deadbeef...' })).toString('base64'). Current decodeCursor extracts offset:0 and proceeds normally (no version check). RED for the right reason.

- 2026-06-08 📌 FTS5 AND-to-OR: Don't change production search semantics to satisfy test data. Semantic changes need explicit design approval, not test-driven improvisation.


