
📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).
- 2026-06-05 📌 M3: Forge prescriber wired to HintDispositionProvider seam for disposition consumption (dismissed→suppress, resolved→boost). See .squad/decisions/inbox/graham-forge-m3-disposition-consumer.md.

---

## Archive Summary

Earlier entries (966 lines) archived to history-archive.md on 2026-06-05.

---

