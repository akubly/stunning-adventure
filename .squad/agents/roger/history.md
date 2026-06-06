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
