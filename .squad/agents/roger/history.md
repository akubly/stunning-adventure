📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe

## Learnings (2026-06-05 — M8 Slice B cycle-2 persona-review fixes)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 730327f (helper extract), 8bb739f (I2/M1/M6), a1002d4 (M2), cd82681 (I1), b9404e7 (I5/M4/M5)

**Helper extraction was right.** Moving `runTrustUpdaterContract` into a `.ts` (non-`.test.ts`) helper file resolves the vitest double-registration problem cleanly AND makes the helper importable without triggering test execution. The naming convention `*.contract.helper.ts` is now the pattern for all future exported contract helpers in this package.

**Async harness future-proofing costs almost nothing.** Making `getTrust` return `number | undefined | Promise<number | undefined>` and awaiting it in tests adds one `await` per assertion. The cost is negligible; the payoff is that future I/O-backed harnesses (e.g., a remote DB or async file I/O) can implement `getTrust` asynchronously without changing the test code. Same for `makeHarness: () => ... | Promise<...>` and `cleanup: () => void | Promise<void>`.

**`.bind(harness)` was gratuitous.** The InMemory harness methods don't use `this` at all (they close over `store` and `locks`). The SQLite harness methods also don't use `this` (they close over `db`/statements). Plain assignment is correct and matches FactReader precedent.

**Named params ($name) enforce a style contract.** The SqliteFactReader (Slice A) already used `$fact_id` / `$session_id` with object-form `.get({ ... })`. Keeping SqliteTrustUpdater on positional `?` params was a style divergence that would silently invite parameter-order bugs as SQL evolves. The persona caught it correctly.

**C-3b (out-of-range) is a materially distinct invariant.** C-3 covers NaN (non-finite); C-3b covers finite-but-out-of-range (1.5, -0.1). These exercise different branches of the validation check (`!Number.isFinite(newTrust)` vs the `< 0 || > 1` guard). A single parameterized test over `[NaN, 1.5, -0.1]` would have worked too, but the current C-3 + C-3b split is clear and avoids a for-loop test that hides which case failed on first failure.

**WAL + busy_timeout are implicit contracts on `SqliteTrustUpdater` constructors.** The class doesn't set these itself — it inherits them from the injected `db` handle. Without documenting this, a future consumer who passes a raw `new Database(path)` handle would get subtly broken concurrency behaviour (SQLITE_BUSY failures instead of retries). The pragma assumption section in JSDoc is the right place to make this explicit.

## Learnings (2026-06-05 — M8 Slice B cycle-3 polish + Slice A retrofit)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af8b596 (N1+N2), 8f48e2f (N3+N4), 1cec460 (N5)

**`it.each` is the correct tool for boundary parameterization.** A `for` loop inside `it()` masks first-failure: if `1.5` fails, `-0.1` never runs. `it.each([1.5, -0.1])` creates two independent test cases so each bound is independently reported. The pattern applies to any test that checks multiple values of the same invariant — particularly validation boundaries. Count impact: +2 tests per wiring × 2 wirings = +4 total (95 → 97 after Commit 1 in this cycle, then 97 steady through cycles 2 and 3).

**The `*.contract.helper.ts` naming convention is now load-bearing for Slice C.** Both `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts` follow the same non-`.test.ts` pattern. Slice C's `runFactStoreContract` should land in `fact-store-contract.helper.ts`. The SKILL forward-pointer (N5) documents this explicitly so the Slice C author doesn't have to re-derive it.

**Slice A retrofit was low-risk but high-value.** The FactReader contract file had been stable since Slice A merged (~5 days), making the diff visible and reviewable. The actual change was small (extract helper + wiring-only test file + typed prepare), but it brings both contract suites to the same structural pattern before Slice C inherits them. Retrofitting AFTER Slice C would be harder (more files to touch, possibly conflicting edits). The lesson: harmonize sibling patterns at end-of-slice, not end-of-milestone.

**`ReturnType<Database.Database['prepare']>` is the wrong field type for typed statements.** The broad type forces a runtime `as FactRow | undefined` cast on every `.get()` call. `db.prepare<BP, R>()` returns `Database.Statement<BP, R>` where `.get()` is typed as `R | undefined`. Using the typed generic form eliminates the cast, narrows errors at compile time, and documents the expected bind-parameter shape at the call site. This is the pattern SqliteTrustUpdater already used; the Slice A retrofit applied it retroactively to SqliteFactReader. Future SQLite implementations (SqliteFactStore) should use typed generics from the start.
