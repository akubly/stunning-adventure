
**Package READMEs are two levels below the repo root.** Packages live at packages/<name>/, so packages/<name>/README.md is two directory levels deep. A relative path to docs/ at the repo root must use ../../docs/, not ../docs/ (which resolves to the non-existent packages/docs/). Rule: when writing relative links from a package README, the root is always ../../.

## 2026-06-05: PR #45 Copilot Review Cycle 2 — Control-Char Full-File Sweep + README Accuracy

**Context:** Cycle 2 review flagged a bare-CR artifact in the line-726 region of history.md plus an inaccurate crucible-cli README. Fixed four control-char artifacts total (bare CR on lines 726 and 1071, ESC on line 1068, BEL on line 1074) and rewrote crucible-cli/README.md to describe the package as the Sprint 0 acceptance-test facade.

### Learnings

**When cleaning control-character artifacts, sweep the WHOLE file, not just the flagged region.** Reviewers sample; a spot fix that only patches the cited lines leaves other artifacts alive. After any control-char remediation, run a full-file scan (e.g., byte-level check for bytes <0x20 excluding tab/LF/CRLF) before committing, so the issue does not resurface in the next review cycle.
**BEGIN IMMEDIATE serializes within a single connection; JS event-loop serializes across async calls from the same connection.** For a synchronous library like better-sqlite3, Promise.all() in the same process doesn't create true concurrency — each mutate() call runs to completion before the JS engine yields. The transaction wrapper enforces that READ + fn + WRITE happen atomically within one mutate() call; it plays no role in ordering ACROSS calls from the same JS thread. BEGIN IMMEDIATE matters only when two separate Database handles (different connections, possibly different processes) compete for the write lock. Getting this distinction wrong in comments misleads future readers about WHERE the safety boundary is.

---

## Learnings (PR #45 Cycle 3 -- 2026-06-05)

**Keep mock return values matching the interface contract even when the value is ignored.** insertSession is typed Promise<void>, so mocks should resolve undefined, not a stray string like 'child-id'. Resolving a wrong type can mask future misuse where code incorrectly reads the return value -- the interface contract is the source of truth, not what production code happens to ignore today.

**Keep minimal-interface comments honest about used-vs-retained members.** If a port interface intentionally includes members not currently called by the primary consumer (e.g., queryEvents on DB), say so explicitly -- state which methods are used now vs retained for future needs. A comment that says 'only the operations X actually needs' becomes misleading the moment the interface contains anything beyond that scope.

---

## Learnings (Refactor 3 Review Cycle 1 — 2026-06-06)

**Production deps vs devDeps: if a module is exported from the production barrel, its native dependency belongs in `dependencies`, not `devDependencies`.** `createSQLiteDB` is exported from `crucible-core/src/index.ts`, so `better-sqlite3` must be a production dependency of that package. Leaving it in devDeps means any consumer that installs the published package without devDeps would get a runtime crash.

**Single-source schema DDL; never restate it in fixtures or tests.** Creating a canonical `SCHEMA_V1_SQL` export in core and having the fixture call `createSQLiteDB` directly eliminates the drift risk. A fixture that independently restates CREATE TABLE statements will silently diverge from production schema as the schema evolves.

**Error message parity between adapters is a contract, not a courtesy.** When the in-memory oracle throws a specific, diagnosable message (`pushEvent: session '<id>' not found`), the SQLite adapter must throw the exact same message — not a foreign-key constraint error. Tests that assert on error messages will fail at the FK layer with a confusing message; more importantly, callers that pattern-match on errors get inconsistent behavior depending on which adapter is in use.

**Interface JSDoc must describe the cross-impl contract, not the implementation detail of one adapter.** The "mutable reference" wording on `getOwnEvents` was truthful for in-memory but false for SQLite. When an interface has two implementations, the JSDoc on the interface must state what ALL implementors commit to — in this case, a snapshot, not a live reference.

**Header comments on transitional code should name its transitional nature.** Calling the SQLite adapter a "real SQLite adapter" biases future readers toward treating it as canonical. A one-clause note that names the Sprint-0 / compatibility-substrate framing prevents architectural drift.

---

## Learnings (Cycle 2 Remediation — 2026-06-06)

**Verify direct imports before removing a devDependency.** The safe pattern is: grep src/ for `import.*from 'pkg'`; if the only hits are in comments or JSDoc, the dependency is genuinely unused. Trusting that it "should" be gone without grepping first risks removing a still-needed dep (or, conversely, leaving a truly redundant one and failing review). In this case, `better-sqlite3` and `@types/better-sqlite3` appeared only in comments — test-db.ts had already been refactored to import solely from `@akubly/crucible-core`. Safe to drop.

**Transitive dependency satisfaction is enough for test code.** Once `better-sqlite3` lives in `crucible-core`'s `dependencies`, any workspace package that declares `@akubly/crucible-core` as a dependency gets the native module transitively. A devDependency on the same package in the consumer is pure noise and a source of version-skew risk.
