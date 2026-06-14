


📌 2026-06-09: **PR #58 Copilot review cycle-6 addressed** — 5 threads (comment/doc polish + one refactor) resolved in commit `3f4fad3`. Thread 1 (`hook-veto.test.ts`): fixed `// 50 µs` → `// 50ms` (50_000µs = 50ms, not 50µs). Thread 2 (`hook-bus.ts` header): replaced "open question pending Aaron's ruling" with "locked, Aaron ruling Option A — Ledger-layer pre-stage gate". Thread 3 (`hook-bus.ts` HookVerdict VETO JSDoc): removed `⚠ PROVISIONAL` / "Pending Aaron's ruling" — now describes VETO as locked with structural enforcement via `Exclude<HookVerdict,'VETO'>`. Thread 4 (`ledger.ts` WAL mapping comment): COMMIT → hookVerdict no longer claims a distinct `null` for "no predicate matched"; notes that no-match and explicit COMMIT encode identically today and the distinction is deferred to #57. Thread 5 (`ledger-impl.ts` append refactor): collapsed double VETO check (explicit `verdict==='VETO'` + unreachable `!isNonVeto`) into a single `if (!isNonVeto(result)) throw` — behavior identical, redundant branch removed. hook-veto.test.ts still passes. Build ✅, lint ✅, **86/86 tests** ✅ (total unchanged). — Roger

📌 2026-06-09: **PR #58 Copilot review cycle-5 addressed** — 2 threads (§3.2.1 CAS_MISS on replay) resolved in commit `412a415`. Added `CasMissError` class to `wal-backend-fs.ts`; `replayFromSegments` now throws `CasMissError` (with hash hex + WAL offset in message) instead of silently substituting `null` payload (Thread 1) or `[]` causalReadSet (Thread 2) when a CAS blob is absent. Zero-hash readSetHash still legitimately yields an empty readSet (no throw). Extended `writeCorruptSession` helper with `omitPayloadCas`/`omitReadSetCas` flags. RED→GREEN tests: Group3-1, Group3-2 (both throw-tests), Group3-3 sanity (zero-hash, no throw). Updated "tampered segment byte" test: corrupted payloadHash now triggers `CasMissError` on reopen (stricter than verifyChain). Build ✅, lint ✅, **86/86 tests** ✅. — Roger

📌 2026-06-09: **PR #58 Copilot review cycle-4 addressed** — 8 threads resolved in commit `a86081c`. Group 1 (timestampNs monotonicity, §3.10): added `nowNs?: () => bigint` clock seam to both `FileSystemWalBackendOptions` and new `InMemoryWalBackendOptions`; added `lastTimestampNs: bigint` field to both backends; each row's `timestampNs = max(nowNs(), lastTimestampNs)` — clamped floor prevents backward drift. FS backend also seeds `lastTimestampNs` from replayed records on reopen so post-reopen writes can't regress below pre-close timestamps. RED tests (CL-7 × 3) cover InMemory clock regression, FS clock regression, and FS reopen seeding — all designed to fail against the unclamped impl. Group 2 (replay validation): added `CorruptSegmentError` export to `wal-backend-fs.ts`; `replayFromSegments` now validates decoded `envelopeCbor` against `VALID_PRIMITIVE_KINDS` set and validates every `causalReadSet` element is a string — throws `CorruptSegmentError` on either violation. RED tests (Group2 × 2) use `writeCorruptSession` helper to craft minimal corrupt segments directly via codec internals. Group 3 (CAS header doc): `cas-fs.ts` file-header no longer claims the §3.2 fsync strategy prevents non-durable CAS references; updated to "CAS files are NOT fsynced in v1 — deferred; tracked in #59". Group 4 (CI matrix): `node-version: [20, 22]` → `[20.19.0, 22]` — pins the minimum to the actual floor from the engines bump. Build ✅, lint ✅, **83/83 tests** ✅ (78 → 83: +3 CL-7, +2 Group2). — Roger

📌 2026-06-08: **PR #58 Copilot review cycle-3 addressed** — 4 threads resolved in commit `bca1e7d`. T1 (session-scoped manifest, correctness): moved `manifest.json` from `<rootDir>/meta/manifest.json` (shared → cross-session contamination) to `<rootDir>/wal/sessions/<sessionId>/manifest.json` (per-session). RED test first: two-session isolation test verified the old shared-manifest implementation fails (manifest not found at session path), then GREEN. Updated existing tests in `wal-backend-file.test.ts` and `wal-group-commit.test.ts` that hard-coded the old `meta/` path. Updated §3.2 layout diagram in `03-l1-wal-substrate.md`. T2 (short-write guard): replaced bare `fs.writeSync(segFd, buf)` in segment record writes with a loop-until-complete (same pattern as PID lock write in `acquireWriteLock`). No behavioral change under normal conditions; guards against partial writes on slow filesystems. T3 (codec recordLen validation): added `InvalidRecordLengthError` class to `codec.ts`; RED tests first (both failed — existing code threw `RangeError` or nothing); added explicit validation in `decodeRecord()` for recordLen < minimum framing (156) and recordLen + 4 > buf.length. T4 (doc): updated `payloadHash`/`readSetHash` comments in `types.ts` from "BLAKE3(CBOR(...))" to "BLAKE3(JSON UTF-8 bytes of ...)" with "canonical CBOR hashing deferred — tracked in #60". Build ✅, lint ✅ (0 warnings), **78/78 tests** ✅ (75 original + 3 new: 1 T1 isolation, 2 T3 codec). — Roger

📌 2026-06-08: **PR #58 Copilot review cycle-2 threads 3+5 addressed** — Aaron ruled Option A on the Node-engine decision. Thread 5: bumped `engines.node` from `>=20.0.0` to `>=20.19.0` in root `package.json` and all 4 workspace packages that declared it (`cairn`, `crucible-cli`, `crucible-core`, `eureka`); ran `npm install` — `package-lock.json` updated. Thread 3: rewrote `hash.ts` comment from ambiguous "Node16 ESM compatible" to "ESM compatible (NodeNext/Node16 module resolution)" + explicit "Requires Node.js >=20.19.0". CI matrix stays `[20, 22]` — setup-node@v4 resolves `20` to latest 20.x (>=20.19), already satisfies the new floor. Build ✅, lint ✅, 75/75 tests ✅. Commit `0a09dd6`. — Roger

📌 2026-06-08: **PR #58 Copilot review cycle 2 addressed** — 3 of 5 new threads resolved in commit `31beaa6` (threads 1, 2, 4; threads 3 & 5 held pending Aaron's Node-engine decision — package.json and hash.ts untouched). Thread 1: `hook-bus.ts` `HookMetadata.source` JSDoc rewrote to "reserved seam field; not yet populated" — removed false claim that the §4.2 test pins it. Thread 2: `ledger-impl.ts` `append()` gained an inline comment that `metadata.source` is intentionally left unpopulated this slice (no RED test drives extraction). Thread 4: `cas-fs.ts` issue ref changed from `#56` (segment-fsync/manifest gap) to `#59` (CAS-fsync gap — dedicated issue Aaron is filing). Build ✅, lint ✅ (0 warnings), 75/75 tests ✅. — Roger

📌 2026-06-08: **PR #58 Copilot review addressed** — All 12 comments resolved in one commit (`246eec5`). Group A: untracked 5 gitignored runtime files (2× orchestration-log, 2× log, 1× scribe-health-report) from this branch; fixed `.gitignore` to also match health-report FILES (not just directories) — `git check-ignore -v` confirmed. Group B: repointed 4 inbox citations in `types.ts`, `hash.ts`, `ledger.ts`, `hook-bus.ts` from `.squad/decisions/inbox/…` to `.squad/decisions.md`. Group C: dropped the 0xFF no-verdict claim from `types.ts` hookVerdict comment (replaced with deferred-#57 note); added a Deferred (#57) callout block in `04-hook-bus.md` §4.1. Group D: rewrote CAS durability comment in `cas-fs.ts` to describe the true risk window (WAL fsync makes segment durable while CAS file may still be in page cache; no behavioral change; refs #56). Build ✅, lint ✅ (0 warnings), 75/75 tests ✅. — Roger — Two sub-cycles completed and GREEN. Fences deferred as spec'd: 64MiB roll-over, appendFenced, L1Subscriber/Router. Ready for squad/main merge pending other agents.

📌 2026-06-06: **WAL group-commit + seal-and-split GREEN (§3.5)** — 16 new RED→GREEN tests in two sub-cycles. Sub-cycle 1: `sealAndSplit` pure function (9 tests) — generic `sealAndSplit<T>(staged, verdicts)` walks left-to-right; COMMIT/OBSERVE join committed; PAUSE at i splits batch; first PAUSE wins; rows i+1..end go to restaged with `pauseBatchIndex`. Sub-cycle 2: group-commit backend (7 tests) — `commitRow()` stages to queue; `flush()` triggers one-fdatasync barrier per batch; `sealAndSplit` routes verdicts; PAUSE row committed with hookVerdict=0x02 (durable); restaged rows re-queue for next flush; atomic abort: close fd + `fs.truncateSync(path)` on Windows (ftruncateSync on O_APPEND fd unreliable); hash-chain root NOT advanced on abort; CAS orphans on abort are benign (content-addressed). `syncFn` injectable seam for spy/stub. `onPause` callback = L1Subscriber stub for future Router. Graham's locked `WalBackend` interface NOT touched (flush/close on concrete class only). Full suite 60/60 green. Deferred: 64MiB roll-over, appendFenced, full L1Subscriber. — Roger



📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## Learnings (2026-06-09 — Code Panel cycle 1 remediation, cursor-versioning review)

**Branch:** `squad/slice-dplus-cursor-versioning` (commit d75349b, 187/187 tests)

**Summary:** Addressed 7 accepted findings from the 6-persona Code Panel review.

**JSON.stringify as scope canonical form beats newline-delimited strings.**
The original `query=${q}\nsessionId=...` format is vulnerable to scope collisions when the query contains the literal substring `\nsessionId=`. `JSON.stringify({ query, sessionId, minTrust, limit })` is unambiguous — each field is a proper JSON value, properly escaped. No two distinct (query, sessionId, minTrust, limit) tuples produce the same JSON string. This is the correct baseline for any multi-field key canonicalization.

**"Present-but-invalid v" is a contract violation, not garbage.**
The original dispatch table had a gap: `v:0` passed the `typeof v !== 'number' || !Number.isInteger(v) || v < 0` guard and fell through to the v1 path. Non-integer strings/floats silently returned offset:0. The correct model: `v` absent/null → v0 (legacy); `v` present and exactly 1 → v1; `v` present and anything else → throw CursorVersionUnsupportedError. A cursor that contains a `v` field came from a versioned system — treating it as garbage is wrong.

**Empty-query short-circuit must come after cursor decode, not before.**
If the empty-query guard fires first, an invalid cursor version silently returns empty results instead of throwing. Since the cursor contract (version validation) is independent of the query, decode first — throw for bad versions — then apply the query-level short-circuits. This ordering applies to both SQLite and InMemory impls: the cursor is an input invariant, the query is a search-shape input.

**Diagnostic fields on error classes are worth the 2-line cost.**
`CursorScopeMismatchError` gained `readonly cursorScope` and `readonly currentScope` fields. No test can reasonably assert on error message text (too brittle), but structured fields let callers log the two fingerprints for debugging without string-parsing. The pattern mirrors `CursorVersionUnsupportedError.version`. Apply this consistently: any error that signals a mismatch should carry both sides.

**Isolated unit tests for pure utility modules catch bugs contract tests miss.**
The new `cursor.test.ts` caught that v:0 wasn't throwing (contract tests only call `search()` which re-throws at a higher level — the path through `decodeCursor` with v:0 was never hit by a focused test). Pure unit tests for pure functions are cheap and should be added any time a utility module handles non-trivial dispatch logic.

---

## Learnings (2026-06-09 — Code Panel cycle 2 remediations, cursor-versioning Fix H/I/J)

**Branch:** `squad/slice-dplus-cursor-versioning` (commit 9b145e8, 187/187 tests)

**Key: absent v key ≠ null v key — use `'v' in payload`, not `v != null`.**
`v !== undefined && v !== null` silently treats `{v: null, offset: 3}` as a legacy v0 cursor. But that payload HAS a v key — it came from a system that serialized something (e.g., NaN → null via JSON.stringify). The contract is: ABSENT key → v0; PRESENT key with value ≠ 1 → throw. The correct guard is `'v' in raw` (after confirming payload is a non-null object). This is the standard JavaScript idiom for key-presence vs value-check.

**Pair RED-test changes with the code change, not after.**
The cycle-2 review caught that CU-3f was asserting the wrong behavior (version===0 for v:null) and CU-1b was in the wrong describe block. The correct workflow: update the test to reflect desired behavior (RED against current code), verify it actually fails, then implement. A test that passes because the code does the wrong thing is harder to detect than a compile error.

**Lazy fingerprinting pattern: compute only when consumed.**
Use a `computedScope: string | undefined` variable initialized to undefined. Compute the scope inside the v1 cursor branch (if-present-and-v1) and reuse it for nextCursor emission via `computedScope ?? scopeFingerprint(...)`. This avoids hashing on empty-query short-circuit paths, no-cursor paths with no next page, and v0-cursor paths with no next page — all while preserving the Fix E decode-before-short-circuit ordering. The `??` fallback is the correct operator here (not `||`) since a valid fingerprint is always a non-empty string.

---

## Learnings (2026-06-09 — Cycle-3 cleanup)

**Object.hasOwn(raw, 'v') improves robustness over 'v' in raw.** Both are functionally identical for well-formed JSON payloads, but Object.hasOwn avoids prototype-chain lookups if the object ever inherits non-standard prototypes — a good defensive practice for untrusted input even when we don't expect it.

---

## Learnings (2026-06-10 — D++ keyset migration doc sweep)

**Comment drift is a blind spot in code review:** Genesta's keyset-migration audit caught 4 stale offset-pagination references in comments/JSDoc that logic changes didn't touch. All 199 tests pass post-fix, confirming comment-only corrections don't break behavior—but doctrine should be updated during refactoring, not after.

---

## 2026-06-10: M8 Slice D++ Shipped to Branch

**Session:** M8 Slice D++ keyset pagination. **Branch:** eureka/m8-slice-dpp-keyset. **Status:** SHIPPED

Genesta locked three interlocked decisions (D1 mutate cursor v1 to keyset; D2 importance/lastAccessed NOT in SQL sort key; D3 per-page normalization). Laura wrote 22 RED tests, Crispin implemented migration 002 + keyset GREEN + persona fixes, Roger did the N1-N4 doc sweep. FSE-2 corrected: INSERT-safe only (not trust-mutation-safe).

**Note:** Re-appended at file end during PR #72 cloud review to honor the Append-Only History Rule (Scribe summarization had reordered prior entries).

---

## Learnings (2026-06-13 — Crucible S2: #69 subscriber error hook + #67 WAL metadata envelope)

**Branch:** `squad/crucible-s2`. **Tests:** 179/179 ✅. Build ✅. Lint ✅.

### Issue #69: Subscriber error observability hook

**Seam shape chosen: `onSubscriberError?` callback on `LedgerFactoryOptions`.**
Factory options is the right injection point (mirrors `walBackend`, `onPause`). The
callback is typed as `(offset, event, error, subscriber) => void`. Passing `subscriber`
as the fourth argument enables callers to map `LedgerSubscriber` instance → error count
without parsing error messages. The seam is optional and additive — zero behavioral change
for callers that don't inject it.

**Ruled out explicitly:** `console.error` (test pollution), rethrow (breaks durability),
counter on `Ledger` interface (couples observability to the public contract),
adding to the `Ledger` interface itself (heavier, breaks all interface implementors).

**Key files:** `ledger.ts` (LedgerFactoryOptions), `ledger-impl.ts` (SubscriberErrorHook alias,
LedgerImpl constructor, catch block, createLedger factory).
**Test file:** `src/__tests__/unit/ledger-subscriber-error-hook.test.ts` (7 tests: SE-1…SE-6, SE-1b).

### Issue #67: WAL metadata envelope layout

**Envelope layout decision (D-ENV-1):**
Before: `envelopeCbor = encodeCbor(primitiveKind)` — bare CBOR text string.
After: `envelopeCbor = encodeCbor({k: primitiveKind, m?: metadata})` — CBOR map.
Key "k" sorts before "m" under RFC 8949 §4.2.1 bytewise ordering (0x6b < 0x6d),
so no explicit sort is needed — the canonical profile handles it.

**Backward compat:** Decode site (`replayFromSegments`) checks CBOR major type of
first byte. Major type 3 (text string, 0x60..0x7b) → old bare-string format, decode
primitiveKind only, metadata=undefined. Major type 5 (map, 0xa0..0xbf) → new format,
extract `k` and optional `m`. This lets pre-#67 segment files replay without error
after upgrade — `metadata` comes back as undefined, which is the same as before.

**Golden vector change:** CBOR-2 test updated deliberately. Old: `envelopeCbor[0]===0x6b,
length===12`. New: `envelopeCbor[0]===0xa1` (CBOR map(1)), `length===15`. The change
in envelopeCbor bytes also changes `selfRoot` for any newly-written row (since
`hash-chain.ts` includes `envelopeCbor` in the selfRoot input). This is correct and
intentional — the richer envelope changes the chain hash. All other CBOR golden
vectors (CBOR-4 through CBOR-9) are unaffected (they test `encodeCbor` with generic
values, not the envelope path).

**Key files:** `wal/materialize.ts` (envelope build + new EventMetadata import),
`wal-backend-fs.ts` (import EventMetadata, replayFromSegments decode + push site).
**Test file:** `src/__tests__/unit/wal-metadata-envelope.test.ts` (7 tests: META-1…META-6, META-3b).

### Gotcha: inline `import('...')` in let declarations works in TS but prefer named imports
The first draft used `let metadata: import('../types.js').EventMetadata | undefined` —
valid TypeScript but noisy. Replaced with a proper `import type { EventMetadata }` at the
top of the file. Always check existing imports before reaching for inline type imports.

### Gotcha: in-memory backend already had metadata (spread of PrimitiveInput)
`InMemoryWalBackend.commitRow` does `this.events.push({ ...input, offset })` which
already spreads `metadata` from `PrimitiveInput`. No change needed there. Only the
FS backend's **replay path** needed fixing — it explicitly constructed a new object
without metadata.


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
