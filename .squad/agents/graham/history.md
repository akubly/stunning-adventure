Earlier entries (209 lines) archived to history-archive.md on 2026-06-05.

---

## Learnings — 2026-06-05: Forge M3 Panel Review Hardening

### Finding Triage

| Finding | Disposition | Rationale |
|---------|-------------|-----------|
| A — `DispositionSummary.category: string` | **ACCEPT** | Trivial type upgrade to `OptimizationCategory`; cast at .map() in provider. Remote providers returning invalid categories now fail the type system rather than silently no-opping. |
| B — Missing `idx_event_log_type` | **ACCEPT** | Real O(n) scan on every prescriber run. Migration 018 added with table-existence guard mirroring migration017's pattern for partial-schema test DBs. |
| C — Vocabulary duplication between emitter and consumer SQL | **ACCEPT** | Created `hintStateTransitionConstants.ts` with event type, source value, and payload key names. Both `emitHintTransitionEvent` and the SQL template in `SqliteHintDispositionProvider` now reference the same constants — a key rename causes a compile error in both places simultaneously. Added a round-trip contract test. |
| D — `applyDispositions` keys Map by `category` alone | **ACCEPT** | Keyed by `${skillId}:${category}`. Cheap robustness fix; prevents cross-skill suppression from a buggy future provider. |
| E — INNER JOIN drops dismissal after `deleteOptimizationHint` | **REJECT (documented)** | `deleteOptimizationHint` is a low-level CRUD function not exposed in the MCP resolve path — real resolutions go to status=rejected (row kept). Carrying category in the payload (option A) would require backward migration of existing events. Added a clear comment in the provider. This is the accepted trade-off: correctness for the real path over theoretical correctness for an unused path. |
| F — `RESOLVED_CONFIDENCE_BOOST` in wrong section | **ACCEPT** | Moved to constants section near `DEFAULT_MIN_SESSIONS`. |
| G — Redundant empty-dispositions guard in orchestrator | **ACCEPT** | Collapsed to `return applyDispositions(allHints, dispositions ?? [])`. The inner guard in `applyDispositions` is sufficient. |
| H — Integration test hand-rolls logEvent instead of using real resolve | **ACCEPT** | Switched to `cairn.resolveOptimizationHint`. Required adding `resolveOptimizationHint`, `HintResolution`, and `ResolveHintResult` to cairn's public exports. Tests now exercise the full MCP→event-format contract end-to-end. |

### Coupling-Reduction Decisions

**C + H reinforce each other.** Using `resolveOptimizationHint` in the integration test (H) naturally exercises the constants-based event format (C). The contract test added to `sqliteHintDispositionProvider.test.ts` explicitly verifies the round-trip: producer payload keys match the consumer's json_extract() paths, which are now both derived from `HINT_TRANSITION_PAYLOAD_KEYS`.

**E rejected in favor of documentation over complexity.** Option (a) — carrying category in the event payload — would remove the JOIN dependency and be cleaner long-term, but requires backward migration of event data already in production DBs. Since delete-of-dismissed-hint isn't a real path today, the documentation trade-off is correct.

**Version assertion discipline.** Migration tests in cairn hardcode the latest schema version number. Every new migration requires updating those tests. Pattern is: grep for `toBe(17)` (prev version), replace with new version.

---

## Learnings — 2026-06-05: Forge M3 Cycle-2 Hardening

### Finding Dispositions

| Finding | Disposition | Rationale |
|---------|-------------|-----------|
| C (complete) — Resolution-value vocabulary still duplicated | **ACCEPT** | Added `HINT_RESOLUTION_RESOLVED` and `HINT_RESOLUTION_DISMISSED` to `hintStateTransitionConstants.ts`. `optimizationHints.ts` now derives `HintResolution` type and `HINT_RESOLUTIONS` from these constants (no circular dep — constants file has no upstream imports). `sqliteHintDispositionProvider.ts` SQL CASE/WHEN references the same constants via template literals. Adding a new resolution requires touching all three files; any single omission is a compile error. |
| 2 (migration 018 skip-path) | **COMMENT ONLY** | The early-return path is correct: `event_log` is created in migration 001, so the skip only fires in partial-schema test DBs. Expanded the guard comment to document this contract explicitly. Tightened the warning message to say "must never occur on a real DB (event_log is guaranteed present from migration 001)." A startup assertion was evaluated but deemed unnecessary: the existing stderr warning is sufficient observable signal, and the skip is structurally unreachable on a real DB. |
| 3 (public exports) | **KEEP AS PUBLIC API** | `resolveOptimizationHint` is the primary user-driven closure operation; `HintResolution`, `HINT_RESOLUTIONS`, and `ResolveHintResult` are its input/output contract. Consumers (MCP handler, integration tests) correctly import from the public root. Added a one-line justification comment in `cairn/src/index.ts`. Integration tests stay on the public import path — no internal path workaround needed. |

### Constants Coupling Decision

Resolution values are now owned by `hintStateTransitionConstants.ts` (the event format spec file). `optimizationHints.ts` derives its exported surface from those constants. This forms a compile-enforced triangle: constants → types → SQL. Future additions must update all three vertices, which TypeScript will enforce at build time.

---

## Learnings — 2026-06-06: Forge M3 Copilot Review Address (PR #49)

### Thread 1 — Prepared statement caching in `SqliteHintDispositionProvider`

The comment said the prepared statement was re-used, but `this.db.prepare(...).all(...)` was called inline on every `getDispositions` invocation — creating a new statement object each time. Fixed by adding a `private dispositionStmt` field and using `??=` to lazily prepare once on the instance, then reuse. Comment updated to be accurate: "SQL is built at module load time so the constants are inlined once. The prepared statement is cached on the instance and re-used on every call."

The `SqliteChangeVectorProvider` doesn't offer a caching precedent (it delegates to free functions), so the pattern was derived from the standard better-sqlite3 idiom. `Database.Statement<Params, Row>` is the correct field type — no extra imports needed since `Database` was already imported as a type.

**Pattern to apply to future SQLite providers:** cache `db.prepare(SQL)` in a nullable instance field, initialize with `??=` on first call. Never `prepare()` inside a hot call path.

### Thread 2 — SKILL.md pitfall #5: `resolveOptimizationHint` export status

Pitfall #5 incorrectly stated that `resolveOptimizationHint` was not exported from `@akubly/cairn`. It was added to `cairn/src/index.ts` as part of the Cycle-1 panel review hardening (Finding H). Updated pitfall #5 to call it the **recommended path** (single call handles lookup + transition + event), with `insertHintIfNew` + `logEvent` reserved for adversarial tests needing fine-grained source/payload control.

**Documentation debt pattern:** when a public API export is added as a review fix, also update any SKILL.md pitfalls that reference the non-exported version. Export additions don't automatically propagate to narrative documentation.


---

## 2026-06-08: WAL Substrate 2-Cycle Review COMPLETE — Seam Contract Validated

**Scribe note:** Crucible WAL substrate + Walkthrough B 2-cycle persona review COMPLETE. Graham's locked Ledger seam contract (VETO Option A) passed contract hardening in cycle 2:
- hookVerdict bytes (0x00/0x01/0x02) persisted and validated across close+reopen for both WalBackend impls
- Seam lock interface NOT reshaped; contract remains (Exclude<HookVerdict, 'VETO'>) for all WAL-layer verdicts
- Result: 75/75 tests green

**Branch ready for merge. See decisions.md for cycle dispositions.**

