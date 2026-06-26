


📌 2026-06-09: **PR #58 Copilot review cycle-6 addressed** — 5 threads (comment/doc polish + one refactor) resolved in commit `3f4fad3`. Thread 1 (`hook-veto.test.ts`): fixed `// 50 µs` → `// 50ms` (50_000µs = 50ms, not 50µs). Thread 2 (`hook-bus.ts` header): replaced "open question pending Aaron's ruling" with "locked, Aaron ruling Option A — Ledger-layer pre-stage gate". Thread 3 (`hook-bus.ts` HookVerdict VETO JSDoc): removed `⚠ PROVISIONAL` / "Pending Aaron's ruling" — now describes VETO as locked with structural enforcement via `Exclude<HookVerdict,'VETO'>`. Thread 4 (`ledger.ts` WAL mapping comment): COMMIT → hookVerdict no longer claims a distinct `null` for "no predicate matched"; notes that no-match and explicit COMMIT encode identically today and the distinction is deferred to #57. Thread 5 (`ledger-impl.ts` append refactor): collapsed double VETO check (explicit `verdict==='VETO'` + unreachable `!isNonVeto`) into a single `if (!isNonVeto(result)) throw` — behavior identical, redundant branch removed. hook-veto.test.ts still passes. Build ✅, lint ✅, **86/86 tests** ✅ (total unchanged). — Roger

📌 2026-06-09: **PR #58 Copilot review cycle-5 addressed** — 2 threads (§3.2.1 CAS_MISS on replay) resolved in commit `412a415`. Added `CasMissError` class to `wal-backend-fs.ts`; `replayFromSegments` now throws `CasMissError` (with hash hex + WAL offset in message) instead of silently substituting `null` payload (Thread 1) or `[]` causalReadSet (Thread 2) when a CAS blob is absent. Zero-hash readSetHash still legitimately yields an empty readSet (no throw). Extended `writeCorruptSession` helper with `omitPayloadCas`/`omitReadSetCas` flags. RED→GREEN tests: Group3-1, Group3-2 (both throw-tests), Group3-3 sanity (zero-hash, no throw). Updated "tampered segment byte" test: corrupted payloadHash now triggers `CasMissError` on reopen (stricter than verifyChain). Build ✅, lint ✅, **86/86 tests** ✅. — Roger

📌 2026-06-09: **PR #58 Copilot review cycle-4 addressed** — 8 threads resolved in commit `a86081c`. Group 1 (timestampNs monotonicity, §3.10): added `nowNs?: () => bigint` clock seam to both `FileSystemWalBackendOptions` and new `InMemoryWalBackendOptions`; added `lastTimestampNs: bigint` field to both backends; each row's `timestampNs = max(nowNs(), lastTimestampNs)` — clamped floor prevents backward drift. FS backend also seeds `lastTimestampNs` from replayed records on reopen so post-reopen writes can't regress below pre-close timestamps. RED tests (CL-7 × 3) cover InMemory clock regression, FS clock regression, and FS reopen seeding — all designed to fail against the unclamped impl. Group 2 (replay validation): added `CorruptSegmentError` export to `wal-backend-fs.ts`; `replayFromSegments` now validates decoded `envelopeCbor` against `VALID_PRIMITIVE_KINDS` set and validates every `causalReadSet` element is a string — throws `CorruptSegmentError` on either violation. RED tests (Group2 × 2) use `writeCorruptSession` helper to craft minimal corrupt segments directly via codec internals. Group 3 (CAS header doc): `cas-fs.ts` file-header no longer claims the §3.2 fsync strategy prevents non-durable CAS references; updated to "CAS files are NOT fsynced in v1 — deferred; tracked in #59". Group 4 (CI matrix): `node-version: [20, 22]` → `[20.19.0, 22]` — pins the minimum to the actual floor from the engines bump. Build ✅, lint ✅, **83/83 tests** ✅ (78 → 83: +3 CL-7, +2 Group2). — Roger

📌 2026-06-08: **PR #58 Copilot review cycle-3 addressed** — 4 threads resolved in commit `bca1e7d`. T1 (session-scoped manifest, correctness): moved `manifest.json` from `<rootDir>/meta/manifest.json` (shared → cross-session contamination) to `<rootDir>/wal/sessions/<sessionId>/manifest.json` (per-session). RED test first: two-session isolation test verified the old shared-manifest implementation fails (manifest not found at session path), then GREEN. Updated existing tests in `wal-backend-file.test.ts` and `wal-group-commit.test.ts` that hard-coded the old `meta/` path. Updated §3.2 layout diagram in `03-l1-wal-substrate.md`. T2 (short-write guard): replaced bare `fs.writeSync(segFd, buf)` in segment record writes with a loop-until-complete (same pattern as PID lock write in `acquireWriteLock`). No behavioral change under normal conditions; guards against partial writes on slow filesystems. T3 (codec recordLen validation): added `InvalidRecordLengthError` class to `codec.ts`; RED tests first (both failed — existing code threw `RangeError` or nothing); added explicit validation in `decodeRecord()` for recordLen < minimum framing (156) and recordLen + 4 > buf.length. T4 (doc): updated `payloadHash`/`readSetHash` comments in `types.ts` from "BLAKE3(CBOR(...))" to "BLAKE3(JSON UTF-8 bytes of ...)" with "canonical CBOR hashing deferred — tracked in #60". Build ✅, lint ✅ (0 warnings), **78/78 tests** ✅ (75 original + 3 new: 1 T1 isolation, 2 T3 codec). — Roger

📌 2026-06-08: **PR #58 Copilot review cycle-2 threads 3+5 addressed** — Aaron ruled Option A on the Node-engine decision. Thread 5: bumped `engines.node` from `>=20.0.0` to `>=20.19.0` in root `package.json` and all 4 workspace packages that declared it (`cairn`, `crucible-cli`, `crucible-core`, `eureka`); ran `npm install` — `package-lock.json` updated. Thread 3: rewrote `hash.ts` comment from ambiguous "Node16 ESM compatible" to "ESM compatible (NodeNext/Node16 module resolution)" + explicit "Requires Node.js >=20.19.0". CI matrix stays `[20, 22]` — setup-node@v4 resolves `20` to latest 20.x (>=20.19), already satisfies the new floor. Build ✅, lint ✅, 75/75 tests ✅. Commit `0a09dd6`. — Roger

📌 2026-06-08: **PR #58 Copilot review cycle 2 addressed** — 3 of 5 new threads resolved in commit `31beaa6` (threads 1, 2, 4; threads 3 & 5 held pending Aaron's Node-engine decision — package.json and hash.ts untouched). Thread 1: `hook-bus.ts` `HookMetadata.source` JSDoc rewrote to "reserved seam field; not yet populated" — removed false claim that the §4.2 test pins it. Thread 2: `ledger-impl.ts` `append()` gained an inline comment that `metadata.source` is intentionally left unpopulated this slice (no RED test drives extraction). Thread 4: `cas-fs.ts` issue ref changed from `#56` (segment-fsync/manifest gap) to `#59` (CAS-fsync gap — dedicated issue Aaron is filing). Build ✅, lint ✅ (0 warnings), 75/75 tests ✅. — Roger

📌 2026-06-18T06:44:55Z: **Forge #1 production runner integration — platform/lifecycle guidance** — Scribed session output: 3 agents (graham lead, alexander SDK/runtime, roger platform). Roger documented 5-step graceful shutdown ordering: stop accepting prompts → await session.disconnect() (keep SDK subscriptions live) → flush telemetry after disconnect → ForgeClient.stop() → closeDb() last. Specified SQLite lifecycle contract (getDb/closeDb patterns), placement (packages/runtime-cli), auth/config failure exit codes (0/1/2), and verification contract with SDK double. Alexander's implementation validated to match contract. Decision merged: roger-forge-runner-lifecycle.md. Orchestration log written. Ready for integration testing phase.

📌 2026-06-08: **PR #58 Copilot review addressed** — All 12 comments resolved in one commit (`246eec5`). Group A: untracked 5 gitignored runtime files (2× orchestration-log, 2× log, 1× scribe-health-report) from this branch; fixed `.gitignore` to also match health-report FILES (not just directories) — `git check-ignore -v` confirmed. Group B: repointed 4 inbox citations in `types.ts`, `hash.ts`, `ledger.ts`, `hook-bus.ts` from `.squad/decisions/inbox/…` to `.squad/decisions.md`. Group C: dropped the 0xFF no-verdict claim from `types.ts` hookVerdict comment (replaced with deferred-#57 note); added a Deferred (#57) callout block in `04-hook-bus.md` §4.1. Group D: rewrote CAS durability comment in `cas-fs.ts` to describe the true risk window (WAL fsync makes segment durable while CAS file may still be in page cache; no behavioral change; refs #56). Build ✅, lint ✅ (0 warnings), 75/75 tests ✅. — Roger — Two sub-cycles completed and GREEN. Fences deferred as spec'd: 64MiB roll-over, appendFenced, L1Subscriber/Router. Ready for squad/main merge pending other agents.

📌 2026-06-06: **WAL group-commit + seal-and-split GREEN (§3.5)** — 16 new RED→GREEN tests in two sub-cycles. Sub-cycle 1: `sealAndSplit` pure function (9 tests) — generic `sealAndSplit<T>(staged, verdicts)` walks left-to-right; COMMIT/OBSERVE join committed; PAUSE at i splits batch; first PAUSE wins; rows i+1..end go to restaged with `pauseBatchIndex`. Sub-cycle 2: group-commit backend (7 tests) — `commitRow()` stages to queue; `flush()` triggers one-fdatasync barrier per batch; `sealAndSplit` routes verdicts; PAUSE row committed with hookVerdict=0x02 (durable); restaged rows re-queue for next flush; atomic abort: close fd + `fs.truncateSync(path)` on Windows (ftruncateSync on O_APPEND fd unreliable); hash-chain root NOT advanced on abort; CAS orphans on abort are benign (content-addressed). `syncFn` injectable seam for spy/stub. `onPause` callback = L1Subscriber stub for future Router. Graham's locked `WalBackend` interface NOT touched (flush/close on concrete class only). Full suite 60/60 green. Deferred: 64MiB roll-over, appendFenced, full L1Subscriber. — Roger



📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## 2026-06-14T06:10:36Z — Crucible S2 Shipped

✓ Issue #69: onSubscriberError hook on LedgerFactoryOptions (D-SUB-ERR-1)  
✓ Issue #67: WAL metadata envelope, canonical CBOR map (D-ENV-1)  
✓ 179 tests green, build+lint clean  
✓ Decisions merged into decisions.md  
✓ Branch: squad/crucible-s2, commit 49a0371

## Learnings (2026-06-13 — Crucible S2 persona-review cycle 1 fix wave)

**Branch:** `squad/crucible-s2`. **Commit:** `40fd452`. **Tests:** 186/186 ✅. tsc --build ✅. eslint ✅.

### F1: Throwing onSubscriberError hook must be wrapped in its own try/catch.
The original dispatch loop guarded subscriber throws with a try/catch, then called
`this.onSubscriberError?.(...)` bare inside the catch. If that callback itself throws,
the exception escapes the for-loop and rejects append() AFTER the row is already durable —
exactly the duplicate-write risk #69 exists to prevent. Fix: wrap the hook call in its own
inner try/catch and swallow. The hook is best-effort observability; it must never interfere
with append durability or skip subsequent subscribers. Updated LedgerFactoryOptions JSDoc to
document this clearly. Test SE-7 validates: throwing hook → append still resolves, row durable,
subsequent subscriber still receives onCommit.

### F2: Non-object envelope 'm' must throw CorruptSegmentError, not silently drop.
The valid-object branch for 'm' (non-null, non-array object → EventMetadata) silently fell
through for any other type (scalar, array). This is asymmetric with the strict 'k' check that
throws. Fix: add `else if ('m' in env)` → throw CorruptSegmentError with a clear message.
Bare-string backward-compat branch kept per Aaron's decision. Test META-7: scalar m (42) in map
envelope → reopen throws CorruptSegmentError matching /non-object metadata "m"/.

### F4: EnvelopeMapV1 shared interface eliminates encode/decode type asymmetry.
Encode site (materialize.ts) used a local `{ k: string; m?: EventMetadata }` inline type.
Decode site (wal-backend-fs.ts) cast to `Record<string, unknown>` — structurally valid but
asymmetric. Fix: export `EnvelopeMapV1 { k: string; m?: EventMetadata }` from wal/types.ts,
use it at both sites. Zero encoded bytes changed (type-only refactor, golden vectors unaffected).

### F5: as unknown as BackendWithRecords double-cast was unnecessary.
createFileSystemWalBackend already returns `Promise<FileSystemWalBackend>` — the concrete class
with a public readSegmentRecords(). Removing the cast makes runtime failures (e.g., method renames)
compile-time errors. General rule: always check what a factory's actual return type annotation is
before reaching for a cast; the annotation may already be the concrete class.

📌 2026-06-13: **Crucible S2 persona-review-cycle COMPLETE** — 2-cycle Code Panel review (Correctness/Skeptic/Craft/Compliance/Architect) on squad/crucible-s2 completed. Cycle 1: 7 findings triaged (6 ACCEPTED, 1 DEFERRED→#76). Your fixes in 40fd452 (F1/F2/F4/F5/F6 + minor) all verified correct in Cycle 2 re-review (zero regressions, 186/186 tests passing, golden vectors unchanged). F5 false-positive (API widening claim) resolved — signature untouched vs. origin/main. READY TO MERGE. — Scribe (session 2026-06-14T06:51:39Z)

## Learnings (2026-06-14 — PR #77 Copilot review: write-side metadata guard)

**Branch:** `squad/crucible-s2`. **Commit:** `7702254`. **Tests:** 189/189 ✅. tsc --build ✅. eslint ✅.

### Write/Read Symmetry: Guard Both Encode and Decode at the Shared Predicate

The F2 decode guard (wal-backend-fs.ts replayFromSegments) throws CorruptSegmentError when envelope
`m` is present but not a plain object (null / array / scalar). The encode side had no matching guard —
materializeRow() would happily call encodeCbor() on any value EventMetadata's index signature accepted,
producing a segment that immediately fails on reopen.

Fix: extracted `isPlainObject()` from the inline decode predicate into wal/types.ts (already imported
by both sites). Both materialize.ts (write) and wal-backend-fs.ts (decode) now use the same helper —
symmetry-by-construction. The write guard throws a plain Error (not CorruptSegmentError) with a clear
"got array / got number / got null" message; CorruptSegmentError is reserved for read-time
segment-integrity violations, not programmer API misuse at write time.

New tests META-8 (array metadata → throws at write), META-9 (scalar metadata → throws at write),
META-10 (valid plain-object metadata → no throw) confirm the guard and the happy path. No CBOR bytes
changed on the valid path (golden vectors unaffected).

General rule: when a decode path has a structural validity predicate, extract it into a shared helper
immediately and use it at the encode path too. The two sites drift if the predicate lives only in one.

## Learnings

📌 2026-06-14: **Plain-object prototype check (isPlainObject, PR #77)** — `typeof v === 'object' && !Array.isArray(v)` is NOT sufficient to guard `plain object` semantics. Class instances like `Date` and `Map` pass those checks but are NOT plain objects and cannot round-trip through CBOR safely. The correct guard requires a prototype check: `Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null`. The `proto === null` branch is needed to accept `Object.create(null)` objects (which cbor-x may return on decode of CBOR maps). Both the encode guard (materialize.ts) and decode guard (wal-backend-fs.ts) use the same `isPlainObject` helper to stay in sync. — Roger


## Learnings

📌 2026-06-14: **PR #77 Copilot review polish pass (squad/crucible-s2) — #1/#2/#3 all fixed.** #1 (materialize.ts ~L94): replaced `String(input.metadata)` with a safe truncated `JSON.stringify` (try/catch fallback to typeof, max 80 chars) so the reject error now reads `metadata must be a plain object (got array: ["not","an","object"])` rather than `[object Object]`. Updated META-8/META-9 test regexes from `\(got array\)` → `\(got array:` / `\(got number:` to match the richer format. #2 (ledger-impl.ts ~L93): expanded the single-line durability-critical nested try/catch around `onSubscriberError` to a clear multi-line block with an explanatory comment: "A throwing observability hook must never break append durability or skip subsequent subscribers." Behavior identical. #3 (wal-backend-fs.ts ~L415): no test or fixture depends on the empty-envelopeCbor→'observation' silent fallback (confirmed by grep); changed the empty-envelope branch to throw `CorruptSegmentError` with offset + message. Decision: throw (not keep-with-comment) because the write path always produces a non-empty envelope — empty can only mean corruption or an unsupported format, silent misclassification would be worse. Build ✅ (tsc --build exit 0), vitest ✅ (192/192), lint ✅ (0 warnings). No golden-vector/CBOR byte changes. — Roger


## Learnings (2026-06-16 — Crucible S3 Phase 0.5 Walking Skeleton T2: bootstrap + replay)

**Branch:** `squad/crucible-s3-skeleton`. **Files created:** `bootstrap.ts`, `replay-engine.ts`. **Files modified:** `ledger-impl.ts`. **Tests:** 204/204 existing pass. `tsc --build` ✅.

### Bootstrap-batch seam (SK-2, §3.8)

`BootstrapMaterializer.materialize()` returns plain `PrimitiveInput[]` — three sub-kind flavours: `system_prompt` (1 row), `tool_definitions` (1 row, carries tool registry + memoryManifest), `injected_memory` (N rows, one per fragment). All rows use `primitiveKind='observation'` and empty `causalReadSet` (bootstrap context references no prior ledger state). `LedgerImpl.bootstrap(rows)` commits each row via `walBackend.commitRow(row, { verdict: 'COMMIT', hookId: null })` — bypasses the hook bus (bootstrap rows are system-emitted; WAL hookVerdict byte 0xFF). Subscriber notification follows the same isolation contract as `append()`.

### Replay-engine seam (SK-5, §11.4 A2 byte-equivalence)

`DefaultReplayEngine.replay(sessionId, opts)` opens `FileSystemWalBackend` read-only, reads decoded events via `readRows()` and raw segment records via `readSegmentRecords()`, then for each row re-materializes via the shared `materializeRow(event, 'COMMIT', null)` helper and byte-compares `payloadHash`, `readSetHash`, and `envelopeCbor` against the stored segment record. Because Crucible canonical CBOR is deterministic, any divergence is a real fault. The verdict byte is NOT compared — it's a separate segment-header field and doesn't affect the CBOR hashes. `status='pass'` iff all rows match; `rowsReplayed === events.length` on full pass.

### Contract gaps found in types.ts (T1 / Graham, please review)

**GAP-1 — No `flags.bootstrap` path from materializer.** `PrimitiveInput` has no `flags` field, so `BootstrapMaterializer.materialize()` cannot signal `flags.bootstrap=true`. The WAL `SegmentRecordInput` has this bit but `WalBackend.commitRow()` doesn't accept it. Bootstrap rows today land with `flags.bootstrap=false` in segment records. Fix options: (a) add optional `walFlags?: Partial<SegmentRecordFlags>` to `PrimitiveInput`, or (b) add a separate `commitBootstrapRow()` variant to `WalBackend`. Phase 1 concern — Aperture projection depends on this bit for session-origin panel.

**GAP-2 — No group-commit atomicity for bootstrap batch.** §3.8 requires "either every offset-0 Observation durable or none." Current `WalBackend` interface exposes only single-row `commitRow()`; there's no `commitBatch()` or exposed `flush()` on the interface. `LedgerImpl.bootstrap()` commits rows sequentially — partially committed bootstrap IS observable on crash between rows. Fix: expose `flush()` on `WalBackend` interface (or a new `commitBootstrapBatch()`) so we can set `batchSize=N` and call `flush()` after all N rows are staged. Phase 1 concern.

**GAP-3 — ReplayEngine interface carries no rootDir.** `ReplayEngine.replay(sessionId, opts?)` doesn't encode where the WAL lives. The factory `createReplayEngine(rootDir)` fills this gap for the skeleton, but Valanice (T5 CLI) must use the factory — not construct a ReplayEngine directly. Flag for T1: add `rootDir` to an options bag on the interface, or keep the factory pattern as the canonical seam.

**GAP-4 — `readSegmentRecords()` reads single active segment.** `FileSystemWalBackend.readSegmentRecords(segIdx?)` defaults to the active segment only. The replay engine works correctly for Phase 0.5 (single segment), but multi-segment sessions (64 MiB roll-over, Phase 1) will silently under-count rows. Fix when roll-over lands: expose `readAllSegmentRecords()` or iterate `manifest.segmentRange`.

### `BootstrappableLedger` return type from `createLedger`

Changed `createLedger()` return type from `Promise<Ledger>` to `Promise<BootstrappableLedger>` (covariant — all existing `Ledger`-typed consumers unaffected). Graham's assembler imports `BootstrappableLedger` and `createLedger` from `../ledger/ledger-impl.js` by direct path. The `CreateLedger` type alias in `ledger.ts` still matches because `BootstrappableLedger extends Ledger`.
## Learnings

📌 2026-06-16: **Forge #1 runner lifecycle guidance** — Current `ForgeSession.disconnect()` calls `sdkSession.disconnect()` while subscriptions remain live, then flushes telemetry, so terminal `session.shutdown`/`session_end` is observed before `outcome.succeeded` is computed. `forge-run-session` should stay thin in `packages/runtime-cli` and call `@akubly/skillsmith-runtime`; that package owns direct `@akubly/forge` + SDK wiring. `knowledge.db` comes from Cairn `getDb()`/`getKnowledgeDbPath()` and uses SQLite WAL, not Crucible issue #55 `write.lock`; use isolated `--db` for CI/dev and decide serialize-vs-runner identity for dogfood. `forge-run-session` exit classes: 0 samples written, 1 ran but no samples, 2 usage/auth/SDK errors. Decision captured in `.squad/decisions/inbox/roger-forge-runner-lifecycle.md`. — Roger

📌 2026-06-22T06:00:54Z: **Forge #1 slice 1 production runner integration — persona-review 3-cycle complete** — Branch squad/forge-runner-slice1 passed final gate. Cycle 1 (11 findings: 1 blocking, 5 important, 5 minor) → Alexander fixed (commit 9341bc1). Cycle 2 re-review (5 advisory) → Aaron approved hardening. Cycle 3 (commit 717cd20: event-driven terminal-event drain, terminalEventDrainMs removed from public ForgeSessionConfig, disconnect status on RunForgeInstrumentedSessionResult, explicit ownsSdkClient, flush idempotency guard). Disconnect lifecycle guidance locked: stop prompts → disconnect (keep SDK live) → flush telemetry → ForgeClient.stop() → closeDb(). Test suite green: forge 694 / skillsmith-runtime 66 / runtime-cli 42. tsc clean. Ready to merge to main.

## Learnings

📌 2026-06-23: **Slice 2D — SQLITE_BUSY concurrency policy (busy_timeout + WAL)** —

**Where the DB-open path lives:** `packages/cairn/src/db/index.ts`, function `getDb()`. Single-file singleton; all Cairn consumers (MCP server, session-start hook, CLI, migration runner, test harnesses) go through this one call site.

**Pragma policy chosen:**
- `PRAGMA journal_mode = WAL` — already present before this slice; kept and documented explicitly.
- `PRAGMA busy_timeout = 5000` — added this slice. Causes SQLite to retry internally for up to 5 s before throwing `SQLITE_BUSY`. This covers the `forge-run-session` + interactive Copilot session concurrent-write window without hanging indefinitely.
- `better-sqlite3` v12.8.0 actually defaults `busy_timeout` to 5000 ms (discovered during RED phase — all pragma assertions passed even before the explicit pragma was written). We still write it explicitly so the policy is documented in code, version-upgrade-proof, and visible to grep.

**WAL decision:** WAL was already set. No duplication — left as-is. WAL mode means readers never block writers and writers never block readers; the only contention is writer–writer. `busy_timeout` handles that window.

**Concurrent-writer test approach (`packages/cairn/src/__tests__/busyTimeout.test.ts`):**
- TDD RED: pragma-assertion tests happened to pass immediately (b-s3 v12 default) — RED failure moved to the concurrent worker tests (data: URL issue before the fix, then the wrong-timeout-on-worker issue).
- CJS `eval: true` workers (not ESM `data:` URLs): bare specifier `require('better-sqlite3')` resolves correctly from an eval worker in this monorepo; ESM `data:` URLs cannot resolve bare specifiers because they have no base directory for module resolution.
— Roger

## Learnings

📌 2026-06-22: **Slice 2D persona-review polish (F3 doc-placement + F4 migration comment)**

### F3 — Doc placement: implemented behavior must not appear in the deferred list

The concurrency bullet (busy_timeout=5000 + WAL) was sitting inside the "Known Limitations / explicitly deferred" section. Delivered behavior living under "deferred" misleads operators into thinking it isn't working. Fix: removed the bullet from the deferred list and relocated it to a new `## Operational Notes` / `### Concurrency & shared database` section, placed between Troubleshooting and Known Limitations. The deferred list now contains only future work. General rule: scan the "deferred" or "known limitations" section after every slice and move any item that has since been delivered.

### F4 — busy_timeout comment: migration blast-radius must be documented inline

The module header already described the concurrent-writer rationale for the 5 s timeout. What was missing was an inline comment specifically calling out that `busy_timeout` applies to **all** opens of the db — including the migration runner — not just the CLI/session pair. The inline comment now explains: (a) applies globally including migrations, (b) acceptable because migrations are fast and idempotent, (c) 5 s covers typical interleaved usage, (d) if startup hangs ~5 s this global default is the first place to revisit. No behavior change — comment only. Deferred: making the value configurable + adding lock-wait logging.
— Roger (2026-06-22)

---

## 2026-06-23T06:34:41Z — Slice 2D Persona-Review Merge & Ship

Forge Slice 2D shipped in PR #84 (commit 58a072e). Persona panel review cycle completed:

- **Finding 3 (Skeptic):** Documentation placement error caught. Concurrency bullet was in
  "Known Limitations / explicitly deferred" section, misleading operators into thinking the
  feature isn't ready. Fixed by relocating to new "Operational Notes" section between
  Troubleshooting and Known Limitations. Content preserved verbatim including caveat.

- **Finding 4 (Craft):** Inline comment added to `db.pragma('busy_timeout = 5000')` explaining
  that the pragma applies globally (all opens including migrations) with rationale and
  troubleshooting notes.

- **Deferred improvements:** Configurable timeout + lock-wait logging documented for future
  issue. Current 5 s global default sufficient for dogfood workload.

- **Tests:** All 5 busy_timeout tests passing (cargo-cult default investigation yielded
  interesting b-s3 v12 discovery: the library already defaults to 5000 ms). Full suite
  749/752 ✅ (3 pre-existing curator failures unrelated).

**Key contribution:** Documentation placement is architecture. Misplacing "delivered" behavior
in "deferred" sections actively confuses operators. This requires vigilance — always scan
the "deferred" list after shipping a feature to ensure newly-delivered items are promoted.


📌 2026-06-26: **PR #84 busyTimeout.test.ts — listener-leak fix + header comment rewrite** — Named onError handler now added alongside onMsg in waitForEvent; both are removed via worker.off on resolve AND reject, eliminating the anonymous-listener leak that caused MaxListeners warnings under concurrent waits. Also rewrote the file-header comment to drop the 'RED phase' framing (misleading once the pragma is set in the same PR) and replaced the inline 'RED:' section comment with an accurate description of what the tests assert. All 5 busyTimeout tests ✅. — Roger

## Learnings
2026-06-26 — PR #84 busyTimeout: always attach a worker 'exit' handler in waitForEvent so the promise rejects (instead of hanging) if the worker exits before emitting the expected event; use a shared cleanup() that removes all three listeners (message, error, exit) on every settle path to prevent leaks.
