# Graham — Crucible S2 Policy Decisions

**Author:** Graham (Lead / Architect)  
**Date:** 2026-06-13  
**Slice:** Crucible S2, doc/governance lane S2c  
**Issues:** #62 (doc-only), #71 (governance)  
**Status:** ACCEPTED — edits applied to working tree

---

## Decision A — §4.1 Verdict Table: TypeScript Name Column (Issue #62)

**Context:** docs/crucible-technical-design/04-hook-bus.md used lowercase doc-vocabulary verdicts
(continue/observe/pause/veto) throughout §4.1 tables. The TypeScript `HookVerdict` type uses
UPPERCASE (COMMIT/OBSERVE/PAUSE/VETO). The mapping was machine-checked (hook-bus.ts line 38) but
undocumented in the table, requiring readers to cross-reference source to understand the seam.

**Decision:** Add a "TypeScript name (`HookVerdict`)" column to both verdict tables in §4.1,
mapping each doc-vocabulary verdict to its `HookVerdict` member:

| Doc verdict | TypeScript `HookVerdict` |
|-------------|--------------------------|
| `continue`  | `COMMIT`                 |
| `observe`   | `OBSERVE`                |
| `pause`     | `PAUSE`                  |
| `veto`      | `VETO`                   |

Additionally, add a blockquote note after the Surface 1 veto table stating that `VETO` is the
Ledger-layer pre-stage gate, structurally excluded from the WAL via `Exclude<HookVerdict,'VETO'>`
on `commitRow` (verified: `packages/crucible-core/src/ledger/ledger.ts:230`,
`packages/crucible-core/src/ledger/hook-bus.ts:38`).

**Rationale:** The mapping is intentional, locked, and machine-checked. Readers should not have
to grep source to understand a table in the architecture doc. The column is zero-maintenance
(mapping is frozen by Aaron ruling) and removes a recurring confusion surface.

**Trade-offs considered:**
- *Do nothing:* mapping is already in the code-block comment (line 39-41). Rejected: prose
  tables are the primary reader touchpoint; code blocks are scanned only on second pass.
- *Footnote:* Less scannable than a column; doesn't survive table export. Rejected.
- *Column (chosen):* One-to-one, inline, impossible to miss. Adds width but tables are already wide.

**Files changed:** `docs/crucible-technical-design/04-hook-bus.md`

---

## Decision B — Append-Only History Rule: Size-Management Policy (Issue #71)

**Context:** The Scribe spawn template in `.github/agents/squad.agent.md` contained:
```
6. HISTORY SUMMARIZATION [HARD GATE]: If any history.md >= 15360 bytes (15KB), summarize now.
```
"Summarize now" in practice meant: condense older entries and remove them from history.md,
moving only a summary forward. This directly violates the Append-Only History Rule
(`.squad/decisions.md`): *"Agent history.md and history-archive.md files are append-only.
Any hygiene sweep that edits previously committed history entries is a scope violation."*
The violation caused 5 review threads on PR #70 and required file restores.

**Options evaluated:**

| Option | Description | Compliant? | Effective? |
|--------|-------------|-----------|------------|
| A. Drop size management | Remove the gate; let history.md grow unbounded | ✅ Yes | ✅ Simple |
| B. Copy + pointer (append-only archive) | Copy old entries verbatim to history-archive.md (append), insert pointer in history.md, never delete originals | ✅ Yes | ❌ No — history.md still grows at the same rate |
| C. Move (original gate) | Move old entries to archive, delete from history.md | ❌ Violates rule | ✅ Effective |

Option B sounds compliant but achieves nothing: since originals must be retained in history.md,
history.md grows at exactly the same rate as without archiving. The only benefit is a secondary
copy in history-archive.md. That is not size management — it is duplication.

**Decision: Option A — Drop size management entirely.**

History files grow unbounded. The per-agent history files will eventually become large context
inputs. If this becomes a tangible bottleneck (e.g., agent context windows failing to load
history), the team will raise a new slice with Aaron sign-off to define a compliant strategy.
Until then, the rule is: no deletions, no rewrites, append only.

**Rationale:** Correctness before efficiency. The history record's integrity is an absolute
invariant. An architecture that trades integrity for context-window savings is not a trade-off
worth making without explicit owner sign-off.

**Files changed:**
- `.github/agents/squad.agent.md` — step 6 replaced with "HISTORY APPEND-ONLY GUARD" (prohibition)
- `.squad/decisions.md` — Append-Only History Rule section extended with S2c enforcement record
  (both occurrences updated for consistency)

**⚠️ Coordinator note:** `.github/agents/squad.agent.md` was modified. The live coordinator
session is running on the stale (pre-change) instructions. A restart is required before the
updated Scribe template takes effect.


# Laura — Crucible S2b Test Strategy Decisions

**Author:** Laura (Tester)  
**Date:** 2026-06-13  
**Issue:** #61 — Walkthrough B prior-rows-survive-veto edge test  

---

## Decision: Acceptance-level parametrization over contract-suite extension

**Context:** Issue #61 asked whether to wire the prior-rows-survive-veto invariant into the existing `wal-backend.contract.test.ts` (which tests `WalBackend` directly) or into `hook-veto.test.ts` (which tests through the full `Ledger` API).

**Decision:** Added to `hook-veto.test.ts` using a shared `runPriorRowsSurviveVetoSuite(implName, makeHarness)` helper that wires both `InMemoryWalBackend` and `FileSystemWalBackend`.

**Rationale:**
- The invariant is Ledger-level (it exercises `registerHook`, `append` throw, `queryEvents`, AND the hash-chain) — the `WalBackend` contract suite is intentionally scoped to `commitRow`/`readRows` mechanics only.
- Mixing Ledger-level assertions into the WAL contract suite would violate layer separation and create a confusing dual-layer test.
- The parametrized-suite-in-acceptance-test pattern is already established by `wal-backend.contract.test.ts` — this extends the pattern one layer up.

**Pattern established:**  
When an invariant spans multiple layers (hook-bus + WAL backend + Ledger query), write a `run<InvariantName>Suite(implName, makeHarness)` helper inside the acceptance test file and wire it for all relevant backend impls. This preserves layer separation while achieving multi-backend coverage.

---

## Hash-chain head capture pattern

**Pattern:** To assert that a veto did not perturb the hash-chain, snapshot `readSegmentRecords()[last].selfRoot` (a 32-byte `Uint8Array`) BEFORE the vetoed call, then assert byte-equality AFTER using a `uint8Equal()` helper. Do NOT use `toEqual()` on `Uint8Array` directly — it does structural comparison which may not reflect aliasing bugs.

**Why `readSegmentRecords()` not `queryEvents()`:** `queryEvents` only surfaces the logical event payload; it cannot reveal whether a partial WAL record was written (e.g. a record with wrong hookVerdict byte). The `selfRoot` check covers the full record hash, catching any WAL corruption including partial writes.


# Roger — Crucible S2 Decisions Inbox

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-06-13
**Branch:** squad/crucible-s2
**Issues:** #69 (subscriber error hook), #67 (WAL metadata envelope)

---

## D-SUB-ERR-1: Subscriber error observability seam shape (#69)

**Decision:** Inject `onSubscriberError?(offset, event, error, subscriber)` as an
optional callback on `LedgerFactoryOptions` (not on the `Ledger` interface itself).

**Rationale:**
- Factory options is the correct injection point — it mirrors how `walBackend` and
  `onPause` are injected. Adding it to the `Ledger` interface would force all
  implementations to support it as a method, which is heavier than needed.
- Callback signature includes `subscriber` (the actual ref) so callers can build a
  registry mapping subscriber → error counts without string-parsing a message.
- `onSubscriberError` is optional; no injection = silent swallow (existing behavior,
  backward-compatible).
- Explicitly ruled out: `console.error` (pollutes test output), rethrow (breaks
  append durability), error counter on `Ledger` (couples observability to the interface).
- `SubscriberErrorHook` type alias is private to `ledger-impl.ts`; only the
  callback signature appears on the public `LedgerFactoryOptions`.

**Files changed:** `ledger.ts`, `ledger-impl.ts`

---

## D-ENV-1: WAL envelope layout change for metadata persistence (#67)

**Decision:** Change `envelopeCbor` from a bare CBOR-encoded `primitiveKind` string
to a CBOR map `{k: primitiveKind, m?: metadata}` under the Crucible canonical CBOR
profile (forced float64 + RFC 8949 §4.2.1 map-key ordering).

**Envelope wire format:**
```
a1                      # CBOR map(1)          ← no-metadata case (15 bytes for 'observation')
  61 6b                 # text(1) "k"
  6b 6f 62 73...        # text(11) "observation"

a2                      # CBOR map(2)          ← with-metadata case
  61 6b                 # text(1) "k"
  6b ...                # text(N) <primitiveKind>
  61 6d                 # text(1) "m"
  a1 ...                # map of metadata fields
```

Key ordering: "k" (0x61 0x6b) < "m" (0x61 0x6d) under RFC 8949 bytewise — this is
the natural alphabetical order, so the map is already canonical without reordering.

**Backward compatibility:** Old segments that stored a bare CBOR string (pre-#67 format)
are detected at decode time by checking the CBOR major type of the first byte:
- Major type 3 (0x60–0x7b) → bare string → `primitiveKind = decoded, metadata = undefined`
- Major type 5 (0xa0–0xbb) → map → extract `k` and optional `m`

This allows old segment files to replay correctly after upgrade, with `metadata = undefined`
(same as before). Documented in `materialize.ts` and the replay site in `wal-backend-fs.ts`.

**Impact on hash-chain selfRoot:** YES — `envelopeCbor` is included in the `selfRoot`
computation in `hash-chain.ts`. Any row committed after this change will have a
different `selfRoot` than it would have had with the old bare-string envelope, even
for the same `primitiveKind`. This is intentional and correct: the envelope is now
richer, and the hash chain covers it. The CBOR-2 golden vector test was updated
deliberately to reflect the new byte layout (`0xa1 / 15 bytes` for
`{k: 'observation'}`). All other golden vectors (CBOR-4 through CBOR-9) are
UNCHANGED — they test `encodeCbor` with generic values, not the envelope path.

**Metadata type constraint:** `EventMetadata` may contain `[key: string]: unknown`
fields. Only JSON-like values will persist correctly through `encodeCbor`. Non-JSON
types (Date, Map, Set, etc.) will throw `UnsupportedCborTypeError` at commit time
(not at replay). This is a correct fail-fast: callers should not put non-serializable
values in metadata intended for WAL persistence.

**Files changed:** `wal/materialize.ts`, `wal-backend-fs.ts`,
`__tests__/unit/wal-cbor.test.ts` (CBOR-2 updated deliberately)

---

## Test additions

- `__tests__/unit/ledger-subscriber-error-hook.test.ts` — 7 tests (SE-1 through SE-6, SE-1b)
- `__tests__/unit/wal-metadata-envelope.test.ts` — 7 tests (META-1 through META-6, META-3b)

**Test count:** 128 (baseline) → 142 (post #67 golden-vector fix already landed in S1) →
179 (after this PR: +7 SE, +7 META, plus 37 already added by other S2 lane work visible
in the prior test count).

Wait — baseline from decisions.md was 128. The test count is now 179 per the test run.
The increment from this PR: +14 new tests (7 SE + 7 META).

---

## Reviewer notes

- Laura: the `onSubscriberError` seam is on `LedgerFactoryOptions` (not `Ledger`
  interface), so the hook-veto purity tests are unaffected. No changes to the
  `Ledger` interface contract.
- Graham: CBOR-2 was updated deliberately. The original checked `envelopeCbor[0]===0x6b`
  (bare string header). New format checks `envelopeCbor[0]===0xa1` (CBOR map header)
  and `length===15`. This is a golden vector change, not a regression.



# Decision: Attention Columns Now Wired into FactStore Reads

**Author:** Crispin  
**Date:** 2026-06-12T22:40:01.901-07:00  
**Phase:** TDD GREEN (FS-SE-16a..e)  
**Status:** COMPLETE

---

## Decision

The three attention columns added in migration 002 (importance, last_accessed, ttention_tier) are now fully wired into SqliteFactStore.search() reads. The mapper produces correct RecallResult values for all three fields on every page of results.

---

## What Changed

**File:** packages/eureka/src/storage/fact-store-sqlite.ts

1. SearchRow interface extended with importance: number, last_accessed: number | null, ttention_tier: string.
2. stmtFirst SELECT extended with .importance, f.last_accessed, f.attention_tier.
3. SQL_CTE_BASE updated: columns added to ase CTE SELECT and 
anked CTE SELECT (pass-through), then to the outer SELECT … FROM ranked in stmtKeyset.
4. Row mapper updated: ttentionTier: row.attention_tier as 'hot' | 'warm' | 'cold', importance: row.importance, lastAccessed: row.last_accessed ?? undefined.

---

## Ordering / Cursor Semantics: UNCHANGED

The composite sort expression (-bm25_score) * trust and ORDER BY (-bm25_score) * f.trust DESC, f.id ASC are unchanged. The new columns are passenger data only — they do not appear in ORDER BY, the keyset WHERE predicate, or the cursor encode/decode logic. Decision D2 (locked sort key) is preserved.

---

## Default Rows Preserve Behavior

Facts inserted without explicit attention-column values get DB defaults: importance=0, ttention_tier='warm', last_accessed=NULL. The mapper produces importance: 0, ttentionTier: 'warm', lastAccessed: undefined for such rows — identical recall output and ordering to before the GREEN phase. This was verified by FS-SE-16e (the default-row RED test, now green).

---

## Test Result

All 205 tests pass (200 pre-existing + 5 new FS-SE-16a..e). 
px tsc --build packages/eureka exits clean with no type errors.


---

# Decision: Attention-Column Read-Through Promoted to FactStore Contract Suite

**Date:** 2026-06-12T22:40:01.901-07:00
**Author:** Laura (Tester)
**Status:** ACCEPTED

---

## Context

Migration 002 added three columns to the `facts` table:
- `importance REAL NOT NULL DEFAULT 0`
- `last_accessed INTEGER DEFAULT NULL`
- `attention_tier TEXT NOT NULL DEFAULT 'warm' CHECK(...)`

In Slice D++, Laura wrote RED tests FS-SE-16a–e in `fact-store-sqlite-edges.test.ts` to lock
attention-column hydration before Crispin's GREEN wiring. Those tests were placed in the
SQLite-edges file with an explicit rationale: `SeedFact` had no attention-column params, and
extending it would require `InMemoryFactStore` to model columns it intentionally did not model.
Attention-column hydration was treated as a SQLite-specific SELECT→RecallResult mapping concern.

Crispin wired `SqliteFactStore` GREEN — all 205 tests passed.

Aaron then decided: **we WANT this behaviour enforced at the contract level** so EVERY
`FactStore` implementation (including `InMemoryFactStore`) is held to the attention-column
read-through contract.

---

## Decision

**Attention-column read-through is now a contract-level invariant, not a SQLite-specific one.**

The earlier placement decision (sqlite-edges file) is reversed. The new home for these
assertions is `runFactStoreContract` in `fact-store-contract.helper.ts`, running for every
registered implementation automatically.

---

## Changes

### 1. `SeedFact` extended with optional `attention` opts (5th arg)

```typescript
export type SeedFact = (
  factId: string,
  sessionId: SessionId,
  content: string,
  trust: number,
  attention?: {
    importance?: number;
    lastAccessed?: number | null;
    attentionTier?: 'hot' | 'warm' | 'cold';
  },
) => Promise<void>;
```

All existing call sites omit the 5th arg — no breaking change. The optional trailing-options
pattern ensures backward compatibility without touching any existing seed call.

### 2. `InMemoryFactStore` now models attention columns

`StoredFact` interface extended with `importance`, `lastAccessed`, `attentionTier`.
`search()` returns live values from stored state (no longer hardcodes `attentionTier: 'warm'`).
`seed()` stores attention values from opts; defaults: importance=0, lastAccessed=undefined,
attentionTier='warm'. `null` lastAccessed maps to `undefined` in results (mirrors SQLite NULL→absent).

### 3. `SqliteFactStore` contract harness seed updated

Full 7-column INSERT replacing the previous 4-column INSERT. Passes attention opts when provided;
uses column defaults otherwise. `attention?.lastAccessed ?? null` correctly passes SQL NULL.

### 4. New contract assertions: FS-12, FS-12b, FS-13

Added inside `runFactStoreContract` — run for every wired implementation:
- **FS-12**: fact seeded with `attentionTier: 'hot'`, `importance: 0.9`, `lastAccessed: <epoch ms>` → all three surface unchanged via `search()`.
- **FS-12b**: fact seeded with `attentionTier: 'cold'` → surfaces 'cold'.
- **FS-13**: fact seeded without attention opts → surfaces `attentionTier: 'warm'`, `importance: 0`, `lastAccessed: undefined`.

### 5. FS-SE-16a–e removed from `fact-store-sqlite-edges.test.ts`

Replaced with a comment documenting the reversal and pointing to FS-12/FS-13 as the canonical
location. The `seedWithAttention` helper was also removed (no longer needed; the contract harness
seed now handles attention opts directly).

---

## Test Count Impact

| Before | After | Delta |
|--------|-------|-------|
| 205    | 206   | +1    |

- Removed: 5 tests (FS-SE-16a–e from sqlite-edges)
- Added: 6 tests (FS-12 + FS-12b + FS-13, each ×2 impls = 6)
- Net: +1

---

## Invariant: No Production Code Modified

`SqliteFactStore`, `recall.ts`, and all migrations are unchanged. The contract assertions
pass against `SqliteFactStore` as-is (Crispin's GREEN wiring is sufficient). If a contract
assertion had failed for `SqliteFactStore`, that would be a production bug requiring a stop-and-report.

---

## Pattern Captured

**Optional seed opts for new columns across all impls.** When a storage schema gains new
columns that must be observable via a seam's read interface, the correct path is:

1. Extend the `SeedFact` (or equivalent) type with an optional trailing opts argument.
2. Make the reference in-memory impl model the new columns.
3. Update all harness seeds to pass the new column values.
4. Add contract assertions that exercise both non-default values and default values.

This keeps existing call sites untouched and makes the contract exhaustive across all impls.

---


# Gabriel — decisions-archive.md Overwrite Incident + Append-Only Fix

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-12T22:40:01.901-07:00
**Type:** Incident report + remediation
**Status:** RESOLVED — fix commit 5925df4

---

## Incident

Scribe commit **5747329** ("Scribe: Merge attention-column decisions, archive old entries, log orchestration")
was supposed to APPEND ~274 newly-archived lines to `.squad/decisions-archive.md`. Instead it **OVERWROTE** the
file — replacing the full prior archive (4782 lines, including the `# Archived Decisions` header and all earlier
dated entries) with only this session's freshly-archived block (186 lines starting `### 2026-05-30`).

**Impact:** ~4596 lines of prior archived history were silently dropped.

---

## Evidence

Verified line counts:

- `git show HEAD~1:.squad/decisions-archive.md | Measure-Object -Line` → **4782 lines** (full archive, header present)
- `git show HEAD:.squad/decisions-archive.md | Measure-Object -Line` → **186 lines** (only new block, no header)

HEAD~1 head: `# Archived Decisions` / `# Squad Decisions Archive (Entries Older Than 7 Days)`
HEAD head: `### 2026-05-30: WI-A Implementation Log` — no header, prior content gone.

---

## Remediation

1. Captured HEAD~1 (4782 lines) and HEAD (186 lines) to `$env:TEMP`.
2. Confirmed new block carried no duplicate top-level header.
3. Reconstructed archive: old content + blank separator + new block via `[System.IO.File]::WriteAllLines` with UTF-8 no-BOM.
4. Verified restored file:
   - **4968 lines** (> 4782 — strictly larger ✓)
   - `Entries archived on 2026-06-05` present ✓
   - `# Archived Decisions` header present exactly once ✓
   - `### 2026-05-30: WI-A Implementation Log` present (also exists briefly in old archive — expected) ✓
5. Staged only `.squad/decisions-archive.md`, committed as new forward-only fix commit **5925df4**.
   - Did NOT amend or force-push. History remains forward-only.
   - Did NOT touch `decisions.md` (verified correct state).

---

## Root Cause

Scribe used an overwrite operation (likely `Set-Content` or `>` redirection) instead of an append operation when
writing the archive file. The Append-Only History Rule was not enforced by a post-commit gate.

---

## Recommended Guard (Infra)

After any Scribe archive step, assert line count strictly increases:

```powershell
$before = (git show HEAD~1:.squad/decisions-archive.md | Measure-Object -Line).Lines
$after  = (git show HEAD:.squad/decisions-archive.md   | Measure-Object -Line).Lines
if ($after -le $before) { throw "Archive overwrite detected: $after lines (was $before)" }
```

This guard is now documented in `.copilot/skills/archive-append-guard/SKILL.md`.

---

## Files Changed

**Added per Graham's SD-F1 follow-up:** Production deps wiring shipped as factory functions on `@akubly/eureka/sqlite` (`createSqliteRecallDeps`, `createSqliteFeedbackDeps`), NOT as root-entry mutations. This preserves the Slice A isolation boundary — the core `@akubly/eureka` entry does not transitively load `better-sqlite3`. Production consumers use a two-line composition root: `const db = openDatabase(); const deps = createSqliteRecallDeps(db);`. 

**Slice D Status:** ✅ **COMPLETE** — 147/147 tests passing, factory-on-subpath wiring verified, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied.

---


# Graham: Crucible Next Slice — Sequencing Recommendation

**Date:** 2026-06-10  
**Author:** Graham Knight (Lead / Architect)  
**Status:** RECOMMENDATION — awaiting Aaron's direction

---

## Current State Assessment

### What's Built (128 tests green in crucible-core, 9 in crucible-cli)

| Component | Status | PR | Notes |
|-----------|--------|-----|-------|
| **L1 WAL substrate** | ✅ SHIPPED | #58 | File-backed, hash-chained, CBOR-encoded segments, CAS blobs, group-commit, crash-durability, seal-and-split, index.idx |
| **Pre-commit hook bus** | ✅ SHIPPED | #58 | FIFO dispatch, VETO>PAUSE>OBSERVE>COMMIT precedence, HookBusPort seam |
| **Aperture projector** | ✅ SHIPPED | #70 | L2 post-commit projection, NotificationPolicy value object, purity contract test, push notifications |
| **Session fork (A1)** | ✅ SHIPPED | #45 | createSession/fork, ForkLineage, SessionManager, in-memory + SQLite DB adapters |
| **OQ-2 FEDERATE substrate** | ✅ SHIPPED | #51 | Crucible owns its own WAL; no Cairn coupling. SQLite adapter standalone. |
| **WAL backend contract tests** | ✅ SHIPPED | #51/#58 | InMemory + FileSystem backends with shared CL-1..CL-7 contract suite |

### What's Stubbed or Partially Built

- **Hook bus**: FIFO only — no kind-indexed dispatch, no subscriber policy, no CAS hookVerdictWitness writes
- **Session fork**: In-memory parent-registry; no WAL-backed fork lineage persistence
- **L0 Bridge/Provider**: Not started (§2, §12)
- **L4 Router**: Not started (§5)
- **L3 Generators**: Not started (§7)
- **L5 Investigation/Sonny**: Not started
- **Hermetic replay (§11)**: Not started
- **CLI verbs beyond fork**: Not started

### CTD Roadmap Position

- **Phase 0** (§2+§6 foundation): ✅ Done (types, primitive vocabulary)
- **Phase 0.5** (walking skeleton): ❌ NOT STARTED — gates Phase 1 fan-out
- **Phase 1** (core stack parallel lanes): Partially started — Roger's §3+§4 lane is ahead; other lanes not started
- **Walkthroughs A/B/C**: All SHIPPED (session fork, hook veto, Aperture push)
- **No Walkthrough D exists** in the TDD strategy — the three walkthroughs are the full set

---

## Open Issue Triage

### (a) Correctness/Security Blockers — Must Land Before New Features

| Issue | Severity | Owner | Reasoning |
|-------|----------|-------|-----------|
| **#68 CAS torn-blob** | HIGH | Roger | Data integrity: put skips re-sync for existing-but-partial blob. Silent data corruption path. Cross-session attack surface. |
| **#60 CBOR hashing** | MEDIUM | Roger | Hash determinism: JSON UTF-8 is not canonical. Replay integrity depends on deterministic hashing. Must fix before any replay work (§11). |
| **#57 Verdict encoding** | MEDIUM | Roger | Semantic ambiguity: null (no predicate matched) vs continue encoded identically. Affects hook bus replay fidelity. |

### (b) Feature Increments

| Issue | Severity | Owner | Reasoning |
|-------|----------|-------|-----------|
| **#65 aperture getPriority()** | LOW | Roger | UX polish — surface priority in push payload. Non-blocking. |
| **#66 aperture unreadCount ack** | MEDIUM | Roger+Valanice | Functional gap — no dismiss path means badge count grows forever. Needs UX design (Valanice) + implementation (Roger). |

### (c) Doc/Test Debt

| Issue | Severity | Owner | Reasoning |
|-------|----------|-------|-----------|
| **#62 Hook-bus verdict table** | LOW | Graham | Doc completeness — add TypeScript-name column to §4.1. Trivial. |
| **#61 Prior-rows-survive-veto edge test** | LOW | Laura | Test gap — edge case coverage for Walkthrough B. Non-blocking but valuable. |

### (d) Governance

| Issue | Severity | Owner | Reasoning |
|-------|----------|-------|-----------|
| **#71 Scribe append-only violation** | MEDIUM | Graham | Process bug — Scribe's history summarization gate mutates history, violating the Append-Only History Rule. Needs governance fix, not code. |
| **#55 OS advisory lock vs PID reclaim** | LOW | Roger | Design decision — deferred; current PID-liveness approach is functional. |
| **#67 WAL metadata in envelope** | LOW | Roger | Enhancement — enables filtered replay-based catchup. Not blocking current work. |
| **#69 Ledger observability hook** | LOW | Roger | Resilience — swallowed subscriber errors are invisible. Important but not blocking. |

---

## Options for Next Slice

### Option A: "Harden Substrate, Then Skeleton" (RECOMMENDED)

**Sequence:**
1. **Slice S1 (serial, ~1 day):** Fix #68 (CAS torn-blob) + #60 (CBOR hashing) + #57 (verdict encoding) — all Roger, all correctness. These three share the WAL internals context and should batch into one PR.
2. **Slice S2 (parallel, ~2 days):**
   - Roger: #69 (observability hook) + #67 (WAL metadata envelope) — substrate resilience
   - Laura: #61 (prior-rows-survive-veto edge test) — test gap closure
   - Graham: #62 (verdict table doc) + #71 (Scribe governance fix)
3. **Slice S3 (~3 days):** Phase 0.5 Walking Skeleton — the CTD's gate for Phase 1 fan-out. Requires L0 stub (Alexander), minimal `crucible status` + `crucible replay` (Valanice CLI + Laura A2 conformance), FifoScheduler stub (Gabriel).

**Trade-offs:**
- ✅ Correctness issues (#68, #60, #57) are fixed BEFORE building on top of them
- ✅ Walking skeleton gates Phase 1 properly — no speculative parallel work
- ✅ Roger's S1 batch is efficient (shared context, one PR)
- ❌ ~1 day slower to reach new feature work
- ❌ Alexander, Rosella, Gabriel, Valanice idle during S1

**Parallelism:** S1 is Roger-only (critical path). S2 fans out to 3 lanes. S3 fans out to 4+ lanes.

### Option B: "Skeleton First, Fix Substrate In Flight"

**Sequence:**
1. **Slice S1 (parallel, ~3 days):** Jump directly to Phase 0.5 Walking Skeleton. Roger works on skeleton WAL pieces AND fixes #68/#60/#57 as he encounters them.
2. **Slice S2 (~2 days):** Remainder of substrate hardening + debt (#61, #62, #67, #69, #71).

**Trade-offs:**
- ✅ Reaches skeleton faster (~1 day gain)
- ✅ Everyone has work immediately (Alexander, Gabriel, Valanice all engaged)
- ❌ Building on a substrate with known correctness gaps — skeleton may encode wrong assumptions
- ❌ Roger carries dual-track cognitive load (skeleton + substrate fixes)
- ❌ If #60 CBOR fix changes hash format, skeleton replay test needs rewrite

### Option C: "Aperture Feature Push"

**Sequence:**
1. **Slice S1 (parallel):** #65 + #66 (Aperture features) — Roger + Valanice
2. **Slice S2:** Substrate fixes (#68, #60, #57)
3. **Slice S3:** Walking skeleton

**Trade-offs:**
- ✅ Visible UX progress — badge ack/dismiss is user-facing
- ❌ Building UX features on a substrate with known data integrity issues
- ❌ Delays the walking skeleton gate further — Phase 1 fan-out blocked longer
- ❌ Wrong sequencing discipline: correctness before features is a principle, not a preference

---

## Recommendation: Option A

**Reasoning:** The CTD's Phase 0.5 walking skeleton is the gate for Phase 1 fan-out. We can't responsibly build the skeleton on a WAL substrate with a torn-blob vulnerability (#68) and non-canonical hashing (#60). These are cheap fixes (Roger has full context from PR #58) but expensive to retrofit if skeleton tests encode the wrong hash format.

The 1-day "delay" from Option A vs Option B is illusory — it's actually risk reduction. Option B's dual-track cognitive load on Roger is the real cost: Roger is already the critical path (CTD §7, Risk 1). Don't overload the bottleneck.

Option C violates sequencing discipline. Aperture features are nice-to-have; WAL correctness is load-bearing.

**Next action:** Aaron confirms Option A (or picks B/C), then Roger starts S1 immediately.

---

## Owner Map (Option A)

| Slice | Who | What | Depends On |
|-------|-----|------|------------|
| S1 | Roger | #68 + #60 + #57 (WAL correctness batch) | — |
| S2a | Roger | #69 + #67 (substrate resilience) | S1 |
| S2b | Laura | #61 (veto edge test) | — |
| S2c | Graham | #62 (doc) + #71 (governance) | — |
| S3 | Roger + Alexander + Gabriel + Valanice + Laura | Phase 0.5 Walking Skeleton | S1 |

---


# Roger — Crucible WAL Correctness S1 Decision Inbox
**Date:** 2026-06-10T22:53:13-07:00
**Branch:** squad/crucible-wal-correctness-s1
**Issues:** #57 (verdict encoding), #60 (CBOR hashing), #68 (CAS atomic write)

## D-CBOR-1: CBOR Library Choice (issue #60)

**Decision:** Use `cborg` v1.x+ for canonical CBOR encoding.

**Trade-offs evaluated:**
| Option | Pros | Cons |
|---|---|---|
| `cborg` | Pure TS/JS, ESM-native, no native compilation, well-maintained (Protocol Labs/IPFS ecosystem), straightforward encode/decode API | Requires a key-sorting wrapper for canonical map encoding (not built-in by default) |
| `cbor-x` | Fast, feature-rich | More complex API, less clear on canonical mode |
| `@ipld/dag-cbor` | Always canonical (IPLD DAG-CBOR spec) | Adds IPLD dependency chain, heavier |
| `cbor` (npm) | Mature | Larger, more complex, older API style |

**Rationale:** `cborg` has the smallest surface area, no native compilation (critical for CI matrix without OS-specific build steps), and is used extensively in the IPFS ecosystem where CBOR determinism is production-tested. We add a `sortKeys()` wrapper to provide canonical map key ordering. Cross-language replay implementors should sort map keys lexicographically by UTF-8 key bytes before encoding — this is the canonical form.

**Cross-language note for replay:** To verify `payloadHash` / `readSetHash` in a non-JS implementation, encode the payload object to CBOR with deterministic/canonical mode (RFC 8949 §4.2 or equivalent). Sort map keys by their CBOR-encoded byte representation (which is equivalent to UTF-8 string sort for text keys). Hash with BLAKE3-256.

## D-VERDICT-1: WAL Verdict Encoding for No-Match (issue #57)

**Decision:** Reserve byte `0xFF` for "no predicate matched" (WalRow.hookVerdict = null in §3.3). Byte `0x00` means "a predicate fired and said continue."

**Encoding table (final):**
| Byte | Meaning | TypeScript hookVerdict |
|------|---------|----------------------|
| 0xFF | No predicate matched this row | null |
| 0x00 | Predicate fired, said continue | 'continue' / COMMIT |
| 0x01 | Predicate fired, observe | 'observe' / OBSERVE |
| 0x02 | Predicate fired, pause | 'pause' / PAUSE |

**Wire discriminant:** The distinction is carried in `hookResult.hookId`: `hookId === null` → no predicate determined the verdict → encode as 0xFF.

**Cross-language replay note:** When decoding a WAL row, `hookVerdict = 0xFF` means no hook predicate matched. `hookVerdict = 0x00` means a predicate explicitly approved the row. Audit tools that count "hooks evaluated" must distinguish these.

## D-CAS-1: CAS Atomic Write Strategy (issue #68)

**Decision:** Temp-file + atomic rename (`<hash>.cbor.tmp` → `<hash>.cbor`).

**On Windows:** `fs.renameSync(src, dst)` in Node.js/libuv calls `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`, providing atomic file replacement within the same filesystem volume. Verified: correct behavior for same-drive CAS directory.

**Invariant restored:** After this fix, a CAS file at `<hash>.cbor` is guaranteed to be complete (either absent or fully written + renamed). The prior `existsSync` dedup shortcut is removed — every `put()` call writes a fresh `.tmp` to ensure no torn-blob from a prior crashed session can poison dedup logic.

---

### 1. BM25 Ordering — Critical Regression Lock

**Status: PASS.** Roger's `ORDER BY (-bm25(facts_fts)) * f.trust DESC` is correct.

Sign analysis:
- `bm25()` returns NEGATIVE (more-negative = better match)
- `-bm25(...)` flips to positive (larger = better)
- Multiplied by `trust ∈ [0,1]` gives composite score, still positive
- `DESC` orders highest composite first = best matches first

FS-4 in the contract suite locks this: seeds two facts with different term frequencies (3× vs 1×) and asserts the higher-frequency fact ranks first. If the negation were dropped (`bm25()` used directly with DESC), best matches would appear LAST (most-negative = "largest" in signed comparison = first in DESC, which is wrong). FS-4 catches this.

**Normalization**: `normalizeRelevance()` correctly flips sign then applies min-max. Top result always gets `relevance = 1.0`. The all-equal branch (`max === min → 1.0`) handles single-result and identical-score cases.

**Per-page normalization note (non-blocking):** Roger's decision drop §2 acknowledges that relevance scores are not comparable across pages. A sole result on page 2 gets `relevance = 1.0` even if it's a weak match. This is intentional for v1 (single-page recall). Locked in FS-SE-12.

### 2. Cursor Pagination

**Status: PASS.** FS-5 in the contract suite already covers the 3-page round-trip (disjoint, complete, no nextCursor on final page). My FS-SE-3/4 add:

- **Garbage cursor (FS-SE-3)**: Invalid base64 decodes to non-JSON, `catch` block returns 0. Verified by comparing with no-cursor baseline — results are identical.
- **Negative offset (FS-SE-4)**: `{ offset: -5 }` → `payload.offset >= 0` fails → returns 0. Correct guard.

**Concurrent-insert caveat** (non-blocking, document only): Offset cursors can skip or repeat rows if facts are inserted between page fetches. This is a known limitation of offset-based pagination, acknowledged in Roger's decision drop §3 and the code comments. Not a blocker for single-writer v1; flagged as Slice D+ concern.

**limit=0 degenerate case** (VERY LOW, note only): Calling `search({ limit: 0 })` directly (not via `recallWithScores`, which guards k=0 before touching FactStore) would loop: `hasMore = (1 row > 0) = true`, `nextCursor = encodeCursor(0)`. Not reachable through the normal activity path; no action required.

### 3. minTrust Floor at SQL Layer

**Status: PASS.** All boundary cases:

| Trust | minTrust | Expected | Result |
|-------|----------|----------|--------|
| 0.15 | 0.15 | INCLUDED | ✅ FS-SE-5 |
| 0.149 | 0.15 | EXCLUDED | ✅ FS-SE-6 |
| NULL | 0 | EXCLUDED | ✅ FS-SE-7 |
| 0.14 | (omitted, default 0.15) | EXCLUDED | ✅ FS-SE-8 |
| 0.0 | 0 | INCLUDED | ✅ FS-SE-7 (confirms trust=0 ≠ NULL) |

The WHERE clause `f.trust IS NOT NULL AND f.trust >= $min_trust` correctly sequences the NULL check before the >= comparison, so NULL trust is excluded at any floor including 0.

### 4. Session Isolation

**Status: PASS.** FS-6 in the contract suite covers this with a direct assertion. Roger's `AND f.session_id = $session_id` on every query ensures facts never bleed across session boundaries. The session is a `$`-param, not string-interpolated, so SQL injection is not a concern.

### 5. Empty / Degenerate Queries

**Status: PASS WITH FINDING.**

- Whitespace-only query (`"   "`, `"\t"`, etc.): short-circuited by `if (!query.trim())` before FTS5. Returns `{ results: [] }`. ✅ FS-SE-9.
- Single result → no nextCursor. ✅ FS-SE-10.
- **FINDING FSE-1 (MEDIUM): FTS5 syntax characters not sanitized.** Queries containing FTS5 operator characters (unclosed `"`, bare `AND`/`OR` operators) propagate as rejected Promises rather than graceful empty results. `stmt.all()` is synchronous; the error becomes a rejection of the async `search()` return value. FS-SE-11 locks this current behavior. Recommend: wrap `stmt.all()` in try/catch; on FTS5 parse error, return `{ results: [] }`. This is MEDIUM — not a data corruption issue, but any user-supplied query string reaching `search()` is a potential crash path.

> Superseded by M8 Slice C review-cycle fixes (commit `f08c746`): `SqliteFactStore.search()` now wraps `stmt.all()` in try/catch, catches FTS5 parse-error patterns, and returns `{ results: [] }` instead of rejecting. FS-SE-11 updated to verify empty results (not rejection). FSE-1 marked done below.

### 6. Interface Reconciliation / recall Consumer

**Status: PASS.** `recallWithScores` correctly destructures `{ results: candidates }` from `factStore.search()`. All 18 recall tests pass. The `cursor` parameter in `FactStore.search()` is optional and not used by `recallWithScores` (which does a single-page overfetch). No regression.

---

## Edge Tests Added

File: `packages/eureka/src/storage/__tests__/fact-store-sqlite-edges.test.ts`
Committed on branch as `f08c746`, pushed to PR #48.

| ID | What it locks |
|----|---------------|
| FS-SE-1 | BM25 normalization: top result `relevance=1.0`, descending order, all ∈ [0,1] |
| FS-SE-2 | Single match: `relevance=1.0` (all-equal branch in normalizeRelevance) |
| FS-SE-3 | Garbage cursor: safe fallback to offset=0, no crash |
| FS-SE-4 | Negative-offset cursor: guard `>= 0` fires, fallback to 0 |
| FS-SE-5 | minTrust exact floor: `trust=0.15` with `minTrust=0.15` is INCLUDED |
| FS-SE-6 | minTrust just-below: `trust=0.149` excluded at `minTrust=0.15` |
| FS-SE-7 | NULL trust excluded even at `minTrust=0`; `trust=0` IS allowed at `minTrust=0` |
| FS-SE-8 | Default `minTrust=0.15` when omitted: `trust=0.14` excluded |
| FS-SE-9 | Whitespace-only query: empty results, no crash (4 variants) |
| FS-SE-10 | Final page: `nextCursor` absent |
| FS-SE-11 | FTS5 unclosed-quote resolves to empty results (FSE-1 fixed) |
| FS-SE-12 | Per-page normalization distortion: sole page-2 result gets `relevance=1.0` |
| FS-SE-13 | Non-FTS SQLITE_ERROR (e.g. missing table) propagates as rejected Promise |

---

## Follow-up Items (Non-Blocking)

These do NOT block acceptance. File in backlog:

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| FSE-1 | MEDIUM | ✅ DONE | Wrap `stmt.all()` in try/catch in `SqliteFactStore.search()`; FTS5 parse errors now return `{ results: [] }` rather than rejecting (commit `f08c746`). FS-SE-11 verifies graceful empty results. |
| FSE-2 | LOW | ✅ DONE | Offset cursor gaps/dupes under concurrent inserts — documented in `FactStore` interface JSDoc (2026-06-08). Non-issue for single-writer v1; relevant before cross-session queries (Slice D+). |
| FSE-3 | LOW | ✅ DONE | `search({ limit: 0 })` constraint: implementation throws `TypeError` (FS-8 locked behavior). Documented in `search()` method JSDoc that `limit` must be positive integer; degenerate values are caught at call boundary (2026-06-08). |
| FSE-4 | NOTE | ✅ DONE | Cross-page relevance incomparability — documented in FS-SE-12 and in `FactStore.search()` interface JSDoc (`@note relevance is per-page normalized, independent of result order). |

---

## Contract Invariant Note for Roger

One invariant belongs in the shared contract helper (applies to ALL FactStore impls), but I am NOT editing `fact-store-contract.helper.ts` directly per the audit mandate. **Roger to add:**

> **FS-7 (proposed)**: A fact with `trust=NULL` (NaN sentinel per CL-4) MUST never appear in search results regardless of `minTrust`. The `seed` helper in the contract fixture intentionally writes only valid `number` trust values; NULL must be tested via an impl-specific side-channel that bypasses `seed`. Note this in the helper's contract invariant list.

---

## Final State

- **Test count:** 109 → **121** (+12 edge tests)
- **Build:** ✅ clean (`tsc`, no errors)
- **All 9 test files pass**

---

## Verdict

**✅ ACCEPT-WITH-FOLLOWUPS**

Roger's Slice C is correct and well-structured. The BM25 sign convention is right, cursor safety is solid, minTrust boundaries are precise, and session isolation holds. The one genuine finding (FSE-1: no FTS5 input sanitization) is MEDIUM severity — it's a real crash path for user-supplied queries, but not a correctness, isolation, or data-loss issue. It does not block the slice. Filed as a follow-up with a test that locks current behavior.



# Roger — Crucible WAL Correctness S1 Decision Inbox
**Date:** 2026-06-10T22:53:13-07:00
**Branch:** squad/crucible-wal-correctness-s1
**Issues:** #57 (verdict encoding), #60 (CBOR hashing), #68 (CAS atomic write)

## D-CBOR-1: CBOR Library Choice (issue #60)

**Decision:** Use `cborg` v1.x+ for canonical CBOR encoding.

**Trade-offs evaluated:**
| Option | Pros | Cons |
|---|---|---|
| `cborg` | Pure TS/JS, ESM-native, no native compilation, well-maintained (Protocol Labs/IPFS ecosystem), straightforward encode/decode API | Requires a key-sorting wrapper for canonical map encoding (not built-in by default) |
| `cbor-x` | Fast, feature-rich | More complex API, less clear on canonical mode |
| `@ipld/dag-cbor` | Always canonical (IPLD DAG-CBOR spec) | Adds IPLD dependency chain, heavier |
| `cbor` (npm) | Mature | Larger, more complex, older API style |

**Rationale:** `cborg` has the smallest surface area, no native compilation (critical for CI matrix without OS-specific build steps), and is used extensively in the IPFS ecosystem where CBOR determinism is production-tested. We add a `sortKeys()` wrapper to provide canonical map key ordering. Cross-language replay implementors should sort map keys lexicographically by UTF-8 key bytes before encoding — this is the canonical form.

**Cross-language note for replay:** To verify `payloadHash` / `readSetHash` in a non-JS implementation, encode the payload object to CBOR with deterministic/canonical mode (RFC 8949 §4.2 or equivalent). Sort map keys by their CBOR-encoded byte representation (which is equivalent to UTF-8 string sort for text keys). Hash with BLAKE3-256.

## D-VERDICT-1: WAL Verdict Encoding for No-Match (issue #57)

**Decision:** Reserve byte `0xFF` for "no predicate matched" (WalRow.hookVerdict = null in §3.3). Byte `0x00` means "a predicate fired and said continue."

**Encoding table (final):**
| Byte | Meaning | TypeScript hookVerdict |
|------|---------|----------------------|
| 0xFF | No predicate matched this row | null |
| 0x00 | Predicate fired, said continue | 'continue' / COMMIT |
| 0x01 | Predicate fired, observe | 'observe' / OBSERVE |
| 0x02 | Predicate fired, pause | 'pause' / PAUSE |

**Wire discriminant:** The distinction is carried in `hookResult.hookId`: `hookId === null` → no predicate determined the verdict → encode as 0xFF.

**Cross-language replay note:** When decoding a WAL row, `hookVerdict = 0xFF` means no hook predicate matched. `hookVerdict = 0x00` means a predicate explicitly approved the row. Audit tools that count "hooks evaluated" must distinguish these.

## D-CAS-1: CAS Atomic Write Strategy (issue #68)

**Decision:** Temp-file + atomic rename (`<hash>.cbor.tmp` → `<hash>.cbor`).

**On Windows:** `fs.renameSync(src, dst)` in Node.js/libuv calls `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`, providing atomic file replacement within the same filesystem volume. Verified: correct behavior for same-drive CAS directory.

**Invariant restored:** After this fix, a CAS file at `<hash>.cbor` is guaranteed to be complete (either absent or fully written + renamed). The prior `existsSync` dedup shortcut is removed — every `put()` call writes a fresh `.tmp` to ensure no torn-blob from a prior crashed session can poison dedup logic.

---

### 1. BM25 Ordering — Critical Regression Lock

**Status: PASS.** Roger's `ORDER BY (-bm25(facts_fts)) * f.trust DESC` is correct.

Sign analysis:
- `bm25()` returns NEGATIVE (more-negative = better match)
- `-bm25(...)` flips to positive (larger = better)
- Multiplied by `trust ∈ [0,1]` gives composite score, still positive
- `DESC` orders highest composite first = best matches first

FS-4 in the contract suite locks this: seeds two facts with different term frequencies (3× vs 1×) and asserts the higher-frequency fact ranks first. If the negation were dropped (`bm25()` used directly with DESC), best matches would appear LAST (most-negative = "largest" in signed comparison = first in DESC, which is wrong). FS-4 catches this.

**Normalization**: `normalizeRelevance()` correctly flips sign then applies min-max. Top result always gets `relevance = 1.0`. The all-equal branch (`max === min → 1.0`) handles single-result and identical-score cases.

**Per-page normalization note (non-blocking):** Roger's decision drop §2 acknowledges that relevance scores are not comparable across pages. A sole result on page 2 gets `relevance = 1.0` even if it's a weak match. This is intentional for v1 (single-page recall). Locked in FS-SE-12.

### 2. Cursor Pagination

**Status: PASS.** FS-5 in the contract suite already covers the 3-page round-trip (disjoint, complete, no nextCursor on final page). My FS-SE-3/4 add:

- **Garbage cursor (FS-SE-3)**: Invalid base64 decodes to non-JSON, `catch` block returns 0. Verified by comparing with no-cursor baseline — results are identical.
- **Negative offset (FS-SE-4)**: `{ offset: -5 }` → `payload.offset >= 0` fails → returns 0. Correct guard.

**Concurrent-insert caveat** (non-blocking, document only): Offset cursors can skip or repeat rows if facts are inserted between page fetches. This is a known limitation of offset-based pagination, acknowledged in Roger's decision drop §3 and the code comments. Not a blocker for single-writer v1; flagged as Slice D+ concern.

**limit=0 degenerate case** (VERY LOW, note only): Calling `search({ limit: 0 })` directly (not via `recallWithScores`, which guards k=0 before touching FactStore) would loop: `hasMore = (1 row > 0) = true`, `nextCursor = encodeCursor(0)`. Not reachable through the normal activity path; no action required.

### 3. minTrust Floor at SQL Layer

**Status: PASS.** All boundary cases:

| Trust | minTrust | Expected | Result |
|-------|----------|----------|--------|
| 0.15 | 0.15 | INCLUDED | ✅ FS-SE-5 |
| 0.149 | 0.15 | EXCLUDED | ✅ FS-SE-6 |
| NULL | 0 | EXCLUDED | ✅ FS-SE-7 |
| 0.14 | (omitted, default 0.15) | EXCLUDED | ✅ FS-SE-8 |
| 0.0 | 0 | INCLUDED | ✅ FS-SE-7 (confirms trust=0 ≠ NULL) |

The WHERE clause `f.trust IS NOT NULL AND f.trust >= $min_trust` correctly sequences the NULL check before the >= comparison, so NULL trust is excluded at any floor including 0.

### 4. Session Isolation

**Status: PASS.** FS-6 in the contract suite covers this with a direct assertion. Roger's `AND f.session_id = $session_id` on every query ensures facts never bleed across session boundaries. The session is a `$`-param, not string-interpolated, so SQL injection is not a concern.

### 5. Empty / Degenerate Queries

**Status: PASS WITH FINDING.**

- Whitespace-only query (`"   "`, `"\t"`, etc.): short-circuited by `if (!query.trim())` before FTS5. Returns `{ results: [] }`. ✅ FS-SE-9.
- Single result → no nextCursor. ✅ FS-SE-10.
- **FINDING FSE-1 (MEDIUM): FTS5 syntax characters not sanitized.** Queries containing FTS5 operator characters (unclosed `"`, bare `AND`/`OR` operators) propagate as rejected Promises rather than graceful empty results. `stmt.all()` is synchronous; the error becomes a rejection of the async `search()` return value. FS-SE-11 locks this current behavior. Recommend: wrap `stmt.all()` in try/catch; on FTS5 parse error, return `{ results: [] }`. This is MEDIUM — not a data corruption issue, but any user-supplied query string reaching `search()` is a potential crash path.

> Superseded by M8 Slice C review-cycle fixes (commit `f08c746`): `SqliteFactStore.search()` now wraps `stmt.all()` in try/catch, catches FTS5 parse-error patterns, and returns `{ results: [] }` instead of rejecting. FS-SE-11 updated to verify empty results (not rejection). FSE-1 marked done below.

### 6. Interface Reconciliation / recall Consumer

**Status: PASS.** `recallWithScores` correctly destructures `{ results: candidates }` from `factStore.search()`. All 18 recall tests pass. The `cursor` parameter in `FactStore.search()` is optional and not used by `recallWithScores` (which does a single-page overfetch). No regression.

---

## Edge Tests Added

File: `packages/eureka/src/storage/__tests__/fact-store-sqlite-edges.test.ts`
Committed on branch as `f08c746`, pushed to PR #48.

| ID | What it locks |
|----|---------------|
| FS-SE-1 | BM25 normalization: top result `relevance=1.0`, descending order, all ∈ [0,1] |
| FS-SE-2 | Single match: `relevance=1.0` (all-equal branch in normalizeRelevance) |
| FS-SE-3 | Garbage cursor: safe fallback to offset=0, no crash |
| FS-SE-4 | Negative-offset cursor: guard `>= 0` fires, fallback to 0 |
| FS-SE-5 | minTrust exact floor: `trust=0.15` with `minTrust=0.15` is INCLUDED |
| FS-SE-6 | minTrust just-below: `trust=0.149` excluded at `minTrust=0.15` |
| FS-SE-7 | NULL trust excluded even at `minTrust=0`; `trust=0` IS allowed at `minTrust=0` |
| FS-SE-8 | Default `minTrust=0.15` when omitted: `trust=0.14` excluded |
| FS-SE-9 | Whitespace-only query: empty results, no crash (4 variants) |
| FS-SE-10 | Final page: `nextCursor` absent |
| FS-SE-11 | FTS5 unclosed-quote resolves to empty results (FSE-1 fixed) |
| FS-SE-12 | Per-page normalization distortion: sole page-2 result gets `relevance=1.0` |
| FS-SE-13 | Non-FTS SQLITE_ERROR (e.g. missing table) propagates as rejected Promise |

---

## Follow-up Items (Non-Blocking)

These do NOT block acceptance. File in backlog:

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| FSE-1 | MEDIUM | ✅ DONE | Wrap `stmt.all()` in try/catch in `SqliteFactStore.search()`; FTS5 parse errors now return `{ results: [] }` rather than rejecting (commit `f08c746`). FS-SE-11 verifies graceful empty results. |
| FSE-2 | LOW | ✅ DONE | Offset cursor gaps/dupes under concurrent inserts — documented in `FactStore` interface JSDoc (2026-06-08). Non-issue for single-writer v1; relevant before cross-session queries (Slice D+). |
| FSE-3 | LOW | ✅ DONE | `search({ limit: 0 })` constraint: implementation throws `TypeError` (FS-8 locked behavior). Documented in `search()` method JSDoc that `limit` must be positive integer; degenerate values are caught at call boundary (2026-06-08). |
| FSE-4 | NOTE | ✅ DONE | Cross-page relevance incomparability — documented in FS-SE-12 and in `FactStore.search()` interface JSDoc (`@note relevance is per-page normalized, independent of result order). |

---

## Contract Invariant Note for Roger

One invariant belongs in the shared contract helper (applies to ALL FactStore impls), but I am NOT editing `fact-store-contract.helper.ts` directly per the audit mandate. **Roger to add:**

> **FS-7 (proposed)**: A fact with `trust=NULL` (NaN sentinel per CL-4) MUST never appear in search results regardless of `minTrust`. The `seed` helper in the contract fixture intentionally writes only valid `number` trust values; NULL must be tested via an impl-specific side-channel that bypasses `seed`. Note this in the helper's contract invariant list.

---

## Final State

- **Test count:** 109 → **121** (+12 edge tests)
- **Build:** ✅ clean (`tsc`, no errors)
- **All 9 test files pass**

---

## Verdict

**✅ ACCEPT-WITH-FOLLOWUPS**

Roger's Slice C is correct and well-structured. The BM25 sign convention is right, cursor safety is solid, minTrust boundaries are precise, and session isolation holds. The one genuine finding (FSE-1: no FTS5 input sanitization) is MEDIUM severity — it's a real crash path for user-supplied queries, but not a correctness, isolation, or data-loss issue. It does not block the slice. Filed as a follow-up with a test that locks current behavior.



# M8 Slice D+ — Cursor Versioning & Scope Fingerprint


# 1. Syntax check
bash -n .github/hooks/cairn/shell-init.sh
bash -n .github/hooks/cairn/install.sh
bash -n .github/hooks/cairn/uninstall.sh



# 2. Install (idempotent — run twice to confirm second run is no-op)
bash .github/hooks/cairn/install.sh
bash .github/hooks/cairn/install.sh   # should print "already installed"



# 3. Reload and smoke-check
source ~/.bashrc
forge_mcp_check



# 4. Uninstall
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc


# forge_mcp_check should no longer exist as a function



# 5. Re-install (confirm idempotency survived uninstall cycle)
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check
```

## Key design note

The marker block strategy (`# forge-mcp: shell init — start`) is the safe pattern
for managed rc-file entries. The install script will never double-append, and the
uninstall script removes the exact block. No manual editing required.



# PR #45 — Second Merge from origin/main (2026-06-05)

**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Merge commit:** 9a26669

---

## What merged

Two PRs landed on main since the last merge:
- **#47** — M8 Slice B (eureka storage layer: `trust-updater-sqlite.ts`, contract test helpers, refactored `fact-reader-sqlite.ts`)
- **#44** — forge-mcp hooks (`.github/hooks/cairn/` install/uninstall/shell-init scripts; `forge-mcp-shell-install` skill)

Full diff summary: 35 files changed, 10641 insertions, 15048 deletions (large deletions from decisions-archive consolidation).

---

## Conflicts

**None.** The only overlapping files were `.squad/` append-only files (history.md, history-archive.md, decisions.md, decisions-archive.md), all covered by `merge=union` in `.gitattributes`. Git auto-resolved all of them via the union driver. No source files, no package-lock.json, no tsconfig conflicts.

---

## Build result

`npm install` — ✅ clean (no lockfile conflict; audit warnings pre-existing)
`npm run build` (all workspaces, `tsc --build`) — ✅ exit 0

---

## Test results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

---

## New HEAD

`9a26669` — Merge remote-tracking branch 'origin/main' into squad/crucible-sprint-0-walkthrough-a

---

## Status

Not pushed — Roger has follow-up fixes to land on top; coordinator will push after.


---



# 2026-06-06: Aaron's User Directive — Parallelization and TDD Discipline

**By:** Aaron Kubly (via Copilot)  
**Directive:** When parallelizing work, do NOT go parallel if it requires deviating from RED→GREEN TDD execution. TDD discipline (RED test fails first, then minimal GREEN, then REFACTOR) takes priority over parallelism. Parallel work is only permitted at TDD-safe boundaries (e.g., independent RED tests, interface/seam contracts) — never GREEN-before-RED, never shared-impl-before-seam.  
**Why:** User direction — captured for team memory during WAL substrate + Walkthrough B kickoff (Option A seam-first).

---



# 2026-06-06: Aaron's Ruling — HookVerdict VETO Semantics (resolves graham-ledger-seam-OPEN)

**By:** Aaron Kubly (via Copilot)  
**Decision:** Option A — Adopt **VETO** as a first-class **pre-WAL Ledger-layer gate**.

- VETO fires at `Ledger.append` entry, BEFORE staging. Rejected input never enters the WAL → WAL stays purely append-only; §3's "all staged rows commit" invariant is intact.
- §4's `continue | observe | pause` (on the staged batch, inside the group-commit window) are untouched. VETO is a distinct, earlier policy boundary.
- Enforced by the type system: `Exclude<HookVerdict, 'VETO'>` at the WAL backend `commitRow` port so VETO can never cross the WAL boundary.
- §4.2 Walkthrough B RED test passes as written — no test rework.

**Required follow-on (documented amendments to FINAL specs):**

1. §4.1 verdict table — add VETO row ("no row created; Ledger throws `Append vetoed by hook: <id>`"), flagged as Ledger-layer (not commit-window).
2. §4.3 dispatch — add VETO case before the PAUSE check.
3. §11 replay contract — note: VETO inputs are not in the WAL; replay need not handle them (Ledger-layer policy, not a WAL concept).

**Why:** User ruling at Decision-Point Gate during WAL substrate + Walkthrough B build.

---



# D++ Keyset Pagination — Three Interlocked Decisions

**Author:** Genesta (Cognitive Systems Lead — Eureka)  
**Date:** 2026-06-10  
**Status:** OPTIONS ANALYSIS — awaiting Aaron's decision gate  
**Scope:** M8 Slice D++ keyset pagination, Slice C schema-gap migration, cross-page relevance normalization

---

## Decision 1 — Keyset Cursor (v:2) Design

### Context

Current state: v1 cursors encode `{v:1, offset, scope}`. SQL uses `OFFSET $offset`. The `v` dispatch in `cursor.ts` already reserves v≥2 (throws `CursorVersionUnsupportedError`). §3 of decisions.md explicitly deferred keyset to D++ and flagged BM25 float stability as a risk.

The SQL sort expression is `(-bm25(facts_fts)) * f.trust DESC, f.id ASC`. A keyset cursor must encode the LAST row's sort-key value + the `f.id` tiebreaker, replacing `OFFSET` with:

```sql
WHERE ((-bm25_score) * f.trust < $lastSort)
   OR ((-bm25_score) * f.trust = $lastSort AND f.id > $lastId)
```

### The BM25 Float Stability Question

This is the load-bearing risk §3 flagged. BM25 scores are computed by SQLite's FTS5 engine at query time. Two concerns:

1. **Across-call stability:** If the FTS5 index hasn't changed, will `bm25(facts_fts)` return bit-identical floats for the same row across separate queries? Answer: **yes, within a single connection and unchanged index.** FTS5 BM25 is deterministic given the same term statistics (total docs, avg doc length, term frequency). No stochastic component. The score for row R will be identical across calls as long as no INSERT/UPDATE/DELETE touches `facts_fts` between them.

2. **Under concurrent writes:** If a new fact is inserted between pages, FTS5 global statistics (average document length, total doc count) shift, and BM25 scores for ALL rows change slightly. The keyset boundary `$lastSort` was computed from the OLD statistics — a row that was just above the boundary might now score just below it (or vice versa). This is the **keyset boundary drift** problem.

   **Mitigation:** The composite sort key is `(-bm25) * trust`. Trust is stable (only mutated by explicit `applyFeedback`). BM25 drift under single-writer (our current model) only occurs if the writer inserts facts mid-pagination. This is the same class of instability that offset-based pagination already has (§3, FSE-2), and keyset is strictly BETTER than offset under this scenario: offset skips/dups when rows shift position; keyset at worst re-returns a boundary row or skips one, but never loses interior rows.

   **Verdict:** BM25 float stability is sufficient for keyset. The risk is real but strictly less severe than the offset risk it replaces.

### Options for v:2 Payload

**Option A — Composite float + id:**
```ts
{ v: 2, lastSort: number, lastId: number, scope: string }
```
`lastSort` = the `(-bm25) * trust` value of the final row on the current page. `lastId` = that row's `f.id`. SQL becomes:
```sql
WHERE ((-bm25(facts_fts)) * f.trust < $lastSort
   OR ((-bm25(facts_fts)) * f.trust = $lastSort AND f.id > $lastId))
```
**Pro:** Simple, minimal payload. Directly mirrors the SQL sort key.  
**Con:** Float equality comparison (`= $lastSort`) in SQL. IEEE 754 doubles compared via `=` in SQLite are bit-exact, which is fine for values that came from the same FTS5 computation — but fragile if the composite expression changes (Decision 2 entanglement).

**Option B — Separate BM25 + trust + id:**
```ts
{ v: 2, lastBm25: number, lastTrust: number, lastId: number, scope: string }
```
Store the components separately; reconstruct the composite in the WHERE clause.  
**Pro:** If the composite formula changes (Decision 2), old cursors can be invalidated by scope fingerprint mismatch rather than silently producing wrong results.  
**Con:** Larger payload. Reconstructing `(-lastBm25) * lastTrust` in SQL introduces a second float multiplication that must match the ORDER BY expression exactly — SQLite query planner may not recognize them as equivalent, breaking index usage.

**Option C — Row-id only (no float):**
```ts
{ v: 2, lastId: number, scope: string }
```
Use `WHERE f.id > $lastId` as a crude keyset on the tiebreaker alone, but still ORDER BY the composite. Effectively: "give me rows with id > X, ordered by composite, LIMIT N."  
**Pro:** No float stability concern at all. Dead simple.  
**Con:** **Incorrect.** A row with `f.id = 50` and high composite score should appear on page 1, but would be excluded if `$lastId = 45`. This only works if the primary sort is by `f.id` — it isn't. **Rejected.**

### Backward Compatibility

- **v0/v1 cursors continue to decode** — `decodeCursor` already handles them via the `v` dispatch. No change needed.
- **Mid-paginate version bump:** A caller holding a v1 cursor cannot use it as v2 (different semantics — offset vs keyset). The scope fingerprint would still match, but the fields are wrong. The v2 decoder should simply not look for `offset` — it looks for `lastSort`/`lastId`. A v1 cursor decoded as v2 would fail field validation → fall back to page 0 or throw. **Recommendation:** Throw `CursorVersionUnsupportedError` if a v1 cursor is presented to a v2-only store. Callers restart pagination from page 0. This is safe because cursor version is an internal implementation detail — callers treat cursors as opaque.
- **Emission:** Once v2 is implemented, `encodeCursor` should emit v2. There is no reason to keep emitting v1 — the scope fingerprint already prevents cross-version reuse across different store instances.

### Scope Fingerprint

v2 cursors still carry `scope` (SHA-256 hex, first 16 chars). The fingerprint inputs (`query, sessionId, minTrust, limit`) remain the same. If Decision 2 adds new columns to the sort key, `scope` doesn't need to change — it guards against parameter drift, not sort-key drift. Sort-key changes are guarded by the `v` version field itself.

### ★ RECOMMENDATION: Option A

Composite float + id is the right design. It's minimal, directly mirrors the SQL, and BM25 float equality is safe within a connection. The scope fingerprint handles parameter-drift protection. The `v:2` version tag handles sort-key evolution. No need to over-engineer the payload.

---

## Decision 2 — Schema-Gap Migration: Do importance/lastAccessed Join the SQL Sort Key?

### Context

Migration 002 will add columns to `facts`:
- `importance REAL DEFAULT 0` — [0,1] signal
- `last_accessed INTEGER DEFAULT NULL` — Unix epoch ms
- `attention_tier TEXT DEFAULT 'warm'` — hot/warm/cold

The pivotal question: does the SQL `ORDER BY` change from `(-bm25)*trust` to the full FR-2 composite `0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency` (with tier multiplier)?

### The Core Tension

**Keyset pagination orders by the SQL sort key.** If the recall layer re-ranks each page by `compositeScore` AFTER fetching, then cross-page ordering by compositeScore is impossible — re-rank only shuffles within a page. So:

- If importance/recency should affect GLOBAL ordering → they MUST be in the SQL sort key → they're in the keyset cursor.
- If they stay in the recall-layer re-rank → ordering is page-local → composite ordering across pages is approximate at best.

This is the fundamental entanglement between D1 and D2.

### Option A — Full composite in SQL

```sql
ORDER BY (
  0.50 * (-bm25(facts_fts))_normalized * ... 
  + 0.20 * COALESCE(f.importance, 0)
  + 0.20 * f.trust
  + 0.10 * max(0.1, pow(1 + max(0, (julianday('now') - julianday(f.last_accessed, 'unixepoch')) ), -0.5))
) * CASE f.attention_tier WHEN 'hot' THEN 1.2 WHEN 'cold' THEN 0.8 ELSE 1.0 END DESC,
f.id ASC
```

**Pro:** Global ordering matches compositeScore exactly. Keyset works perfectly. No recall-layer re-rank needed (or it becomes a no-op).  
**Con:** 
1. **Recency is time-dependent.** `julianday('now')` changes between pages. A row's recency-based sort value at page-fetch-1 differs from page-fetch-2. The keyset boundary `$lastSort` was computed at time T₁ but the WHERE clause evaluates at time T₂. Rows near the boundary can shift across it. This is the **time-varying sort key** problem — fundamentally incompatible with stable keyset pagination.
2. **BM25 normalization problem.** `compositeScore` expects relevance ∈ [0,1], but raw `-bm25` is unbounded. You'd need to normalize in SQL, which requires knowing min/max across the full result set — a separate query, or a window function that defeats the keyset WHERE optimization.
3. **Expression complexity.** The SQL becomes a maintenance hazard. Any tweak to FR-2 weights requires a migration or at minimum a coordinated code+SQL change.
4. **Edgar dependency.** The composite formula is a learning/ranking concern. Baking it into SQL couples storage to the ranker's evolution.

**Verdict: Reject.** The time-varying recency term makes this fundamentally unstable for keyset pagination.

### Option B — SQL keeps `(-bm25)*trust` only; recall re-rank stays page-local (status quo ordering)

Migration 002 adds the columns but the SQL `ORDER BY` doesn't change. `compositeScore` in `recall.ts` continues to re-rank the fetched page using all four signals.

**Pro:** Simplest migration. No SQL change. Keyset cursor (Decision 1) encodes `(-bm25)*trust` — stable, time-independent. Recall layer owns the ranking formula — easy to evolve without SQL coupling.  
**Con:**
1. **Cross-page compositeScore ordering is impossible.** If fact F₁ has high importance but low BM25, it might rank at the bottom of page 1 by SQL order but top of page 1 after re-rank. Meanwhile, fact F₂ on page 2 (lower BM25×trust) might have even higher compositeScore. The caller never sees F₂ ahead of F₁ because pagination already decided page membership.
2. **Overfetch mitigates but doesn't solve.** `RANKER_OVERFETCH_FACTOR = 3` already pulls 3× candidates for re-ranking. This helps within the overfetch window but doesn't help if the best-by-compositeScore fact is on page 5 by BM25×trust.

**Practical impact:** Today, `recall` calls `factStore.search({ limit: k * 3 })` — a SINGLE page, no pagination. The re-rank surface is already the full overfetch window. Cross-page compositeScore ordering only matters if a caller paginates AND expects globally-ordered compositeScore results. Currently, no caller paginates for composite ordering — pagination is for exhaustive traversal (e.g., a future "export all facts" or "batch re-score" use case). For exhaustive traversal, page-local re-rank order doesn't matter — the caller is consuming everything.

**Verdict: Strong candidate.** The practical impact of the limitation is near-zero given current usage.

### Option C — Time-independent subset in SQL, recency stays page-local

```sql
ORDER BY (-bm25(facts_fts)) * f.trust 
         * (CASE f.attention_tier WHEN 'hot' THEN 1.2 WHEN 'cold' THEN 0.8 ELSE 1.0 END)
         * (1.0 + COALESCE(f.importance, 0))
         DESC, f.id ASC
```

Fold importance and tier into the SQL sort key (both are time-independent, stable between pages). Leave recency to the recall-layer re-rank.

**Pro:** Gets ~80% of the composite signal into SQL. Keyset boundary is stable (no time-varying terms). Important facts bubble up globally, not just within-page.  
**Con:**
1. **Formula divergence.** The SQL sort formula and `compositeScore` in recall.ts now express DIFFERENT formulas. The SQL uses a multiplicative blend; compositeScore uses an additive weighted sum. These are not order-equivalent. Maintaining two formulas is a bug factory.
2. **Keyset cursor grows.** The v:2 payload would need to encode the full composite value (which now includes importance and tier), or the individual components. Either way, the cursor is coupled to the formula.
3. **Partial ordering improvement.** Importance and tier affect global order, but recency doesn't. A recently-accessed fact with mediocre BM25 still gets buried by SQL ordering — the recall re-rank can only rescue it if it's on the same page.

**Verdict: Possible but complex.** The formula divergence risk is high. Only justified if importance/tier materially affect ordering AND callers need globally-ordered results.

### Migration Mechanics (applies to all options)

```sql
ALTER TABLE facts ADD COLUMN importance REAL DEFAULT 0;
ALTER TABLE facts ADD COLUMN last_accessed INTEGER DEFAULT NULL;
ALTER TABLE facts ADD COLUMN attention_tier TEXT DEFAULT 'warm';
```

- `importance DEFAULT 0` → compositeScore uses 0 → preserves current behavior (0.20 × 0 = 0 contribution).
- `last_accessed DEFAULT NULL` → compositeScore treats NULL as Infinity → recency floors to 0.1 → preserves current behavior.
- `attention_tier DEFAULT 'warm'` → multiplier 1.0 → preserves current behavior.
- **Backfill:** Not needed. Defaults match the hard-coded values in `SqliteFactStore.search()` today (lines 248–249). Existing rows behave identically.
- **FTS5 triggers:** No change needed — new columns are not FTS-indexed.
- **Column types:** Crispin should confirm `attention_tier TEXT` vs an integer enum. TEXT is simpler and matches the TypeScript union `'hot' | 'warm' | 'cold'` directly. A CHECK constraint (`CHECK(attention_tier IN ('hot', 'warm', 'cold'))`) is optional but recommended.

### ★ RECOMMENDATION: Option B

Keep SQL ordering at `(-bm25)*trust`, recall-layer re-rank stays page-local. Reasoning:

1. No current caller paginates for globally-ordered compositeScore results. `recall` uses single-page overfetch.
2. The time-varying recency term makes full-composite SQL ordering fundamentally incompatible with keyset stability (kills Option A).
3. Option C's formula divergence risk outweighs its partial ordering benefit for a signal (importance) that doesn't even exist in the data yet.
4. When a caller genuinely needs globally-ordered compositeScore, the right solution is a different API (e.g., a `reindex` or `materialize-scores` batch job), not baking a time-varying formula into the pagination sort key.
5. The migration is trivial and non-breaking — just add columns with correct defaults.

---

## Decision 3 — Cross-Page Relevance Normalization

### Context

Today, `relevance` is per-page min-max normalized to [0,1]. FSE-4 / FS-SE-12 document that relevance is NOT comparable across pages. With keyset pagination, multi-page traversal becomes the norm, making this limitation more visible.

`compositeScore` consumes relevance as a [0,1] term weighted at 0.50 — the largest single weight. Breaking the [0,1] bound would produce compositeScores outside their expected range.

### Option A — Keep per-page min-max (status quo)

**Pro:** No change. Simple. compositeScore stays bounded. Within-page relative ranking is meaningful.  
**Con:** Cross-page relevance is incomparable. A sole result on the last page gets relevance=1.0 even if it's a weak match (FS-SE-12). Under multi-page traversal this becomes more visible.

### Option B — Raw/absolute (-bm25) as relevance

Emit `-bm25(facts_fts)` directly (positive, unbounded).

**Pro:** Globally comparable across pages. Deterministic (same row, same query → same value).  
**Con:** 
1. **Breaks [0,1] bound.** compositeScore's `0.50 * relevance` term becomes `0.50 * (some unbounded positive float)`. The composite score is no longer in a predictable range. The tier multiplier and weight ratios become meaningless.
2. **Scale varies by query.** A 1-token query might produce BM25 scores in [0.5, 3.0]; a 5-token query might produce [2.0, 15.0]. Raw scores are comparable within a query but not across queries — which is fine for pagination (same query) but surprising for callers expecting [0,1].

### Option C — Page-1 min/max as fixed reference in cursor

Carry `{ refMin, refMax }` from page 1 in the cursor. All subsequent pages normalize against the same reference.

```ts
{ v: 2, lastSort, lastId, scope, refMin: number, refMax: number }
```

**Pro:** Cross-page comparable. Still [0,1] bounded relative to page 1's range. Consistent compositeScore behavior.  
**Con:**
1. **First-page-dependent.** If page 1 has an outlier (very high or very low BM25), the reference range is skewed for all subsequent pages. A page-3 result could get relevance > 1.0 or < 0.0 if its raw BM25 exceeds page-1's range — requires clamping.
2. **Statefulness.** The cursor grows. The reference is now part of the pagination contract — changing page size or re-starting from a different page produces different relevance values for the same fact.
3. **Complicates cursor.** More fields = more validation, more surface for bugs.

### Option D — Global min/max via a preflight query

Before the first page, run `SELECT MIN(bm25(...)), MAX(bm25(...))` across the full matched result set. Use these as the normalization reference for all pages.

**Pro:** Truly global normalization. Stable, not first-page-dependent.  
**Con:**
1. **Extra query.** The preflight scans the full FTS5 match set — could be expensive for broad queries. Negates some of keyset's performance benefit.
2. **Stale reference.** If facts are inserted between the preflight and later pages, new rows may exceed the reference range. Same clamping issue as Option C.
3. **Where to store?** The global min/max would need to go in the cursor (same statefulness as C) or be recomputed per page (defeating the purpose).

### Option E — Normalize to query-specific [0,1] using a sigmoid/log transform

Apply a monotonic transform like `relevance = 1 / (1 + exp(-k * rawBm25))` or `relevance = log(1 + rawBm25) / log(1 + maxExpectedBm25)` to squash raw BM25 into [0,1] without needing min/max.

**Pro:** Globally comparable. No reference needed. No cursor growth. Always [0,1].  
**Con:**
1. **Parameter tuning.** The sigmoid's `k` or the log's `maxExpectedBm25` are magic numbers. Different corpora produce different BM25 ranges. Poor tuning compresses all scores into a narrow band.
2. **Non-linear distortion.** The transform changes the RELATIVE spacing of scores. Two facts with raw BM25 of 2.0 and 4.0 (2× ratio) might get sigmoid relevances of 0.88 and 0.98 (1.1× ratio). compositeScore's linear weighting assumes linear relevance.
3. **Edgar territory.** Choosing the right transform is a learning/tuning question.

### Entanglement with Decision 2

If Decision 2 = Option B (recommended), then `compositeScore` re-ranks page-local. Relevance is consumed page-locally too — so per-page normalization (Option A) is actually **coherent** with the design: the re-rank operates on a single page where per-page normalization is consistent.

Cross-page relevance comparability only matters if a caller collects results across pages and then sorts/filters by relevance or compositeScore. With Option B's page-local re-rank, that's already an invalid use case.

### ★ RECOMMENDATION: Option A (status quo) with documentation upgrade

1. Per-page min-max is coherent with Decision 2's page-local re-rank design.
2. compositeScore stays bounded and predictable.
3. The limitation is already documented (FSE-4, FS-SE-12). Upgrade the docs to explicitly state that keyset pagination does NOT make relevance cross-page comparable.
4. If a future use case genuinely needs global relevance comparability, Option E (sigmoid transform) is the most promising — but it requires Edgar's input on parameterization and should be its own slice.

---

## Entanglement Map

```
Decision 1 (cursor v:2)  ←──────→  Decision 2 (sort key)
   │                                    │
   │  The v:2 payload encodes the       │
   │  LAST ROW's sort-key value.        │
   │  If D2 changes the sort key,       │
   │  D1's payload must match.          │
   │                                    │
   │  D2-A (full composite in SQL)      │
   │  → D1 payload = full composite     │
   │    float (time-varying → unstable  │
   │    keyset boundary → REJECTED)     │
   │                                    │
   │  D2-B (SQL keeps bm25*trust)       │
   │  → D1 payload = bm25*trust float   │
   │    (stable → WORKS)                │
   │                                    │
   │  D2-C (partial composite in SQL)   │
   │  → D1 payload = partial composite  │
   │    float (stable but formula       │
   │    divergence risk)                │
   │                                    │
   └──────────→  Decision 3 (relevance normalization)
                     │
   D2-B (page-local re-rank) makes      │
   per-page normalization coherent.     │
   D2-A (global ordering) would         │
   demand global normalization.         │
                                        │
   D3-A (per-page) + D2-B = coherent   │
   D3-C/D (global ref) + D2-B = over-  │
   engineered (re-rank is page-local   │
   anyway, global relevance unused)    │
```

**The three decisions form a consistent package only in specific combinations:**

| D1 | D2 | D3 | Coherent? | Notes |
|----|----|----|-----------|-------|
| A (composite float+id) | B (bm25×trust SQL) | A (per-page) | ✅ **YES** | Recommended path |
| A | A (full composite SQL) | C or D (global ref) | ❌ | D2-A killed by time-varying recency |
| A | C (partial composite) | A or C | ⚠️ | Works but formula divergence risk |
| B (separate components) | B | A | ⚠️ | Over-engineered cursor for no benefit |

---

## Combined Recommended Path

| Decision | Choice | Key rationale |
|----------|--------|---------------|
| **D1** | Option A — `{v:2, lastSort, lastId, scope}` | Minimal, mirrors SQL, BM25 floats stable enough |
| **D2** | Option B — SQL keeps `(-bm25)*trust`, recall re-rank page-local | Time-varying recency kills full-composite SQL; no current caller needs global composite ordering |
| **D3** | Option A — Per-page min-max (status quo + doc upgrade) | Coherent with D2-B's page-local re-rank; compositeScore stays bounded |

**Migration 002:** Add `importance REAL DEFAULT 0`, `last_accessed INTEGER DEFAULT NULL`, `attention_tier TEXT DEFAULT 'warm'` to `facts`. No backfill. No ORDER BY change. No FTS5 trigger changes.

**Cursor v:2:** Encode `{v:2, lastSort: number, lastId: number, scope: string}`. SQL WHERE becomes keyset predicate. `decodeCursor` gains a v:2 branch. v0/v1 cursors throw `CursorVersionUnsupportedError` when presented to a v2 store (callers restart pagination). `encodeCursor` emits v2 only.

**InMemoryFactStore:** Must implement v:2 keyset logic using its `score` (termCount × trust) as the equivalent of `(-bm25) * trust`, and `insertionOrder` as the equivalent of `f.id`.

---

## External Input Needed

| Who | What | Why |
|-----|------|-----|
| **Crispin** | Migration 002 column types + CHECK constraint on `attention_tier` | Schema/representation is Crispin's domain. TEXT vs integer enum, constraint strictness. |
| **Crispin** | Confirm `last_accessed INTEGER` (Unix epoch ms) vs `TEXT` (ISO 8601) | Convention alignment with `created_at`/`updated_at` (currently TEXT datetime). |
| **Edgar** | Future: sigmoid/log relevance transform parameterization (if D3 evolves past Option A) | Learning algorithms concern — Genesta flags but doesn't own the transform design. |
| **Edgar** | Future: whether compositeScore formula should evolve to be SQL-expressible (would reopen D2) | If Edgar wants the ranker formula in SQL, D2-C or a materialized-score approach becomes necessary. |

---

*Genesta — 2026-06-10. Activities are runtime verbs, not storage nouns.*
 

 # Decision Drop — M8 Slice D++ Keyset Pagination: RED Test Surface

**Author:** Laura (Tester)  
**Date:** 2026-06-10T22:20:20-07:00  
**Phase:** London-school TDD RED — tests written, implementation NOT changed  
**Status:** 22 tests RED (expected), 107 tests GREEN (unchanged)

---

## Summary

Wrote the RED test surface for the Slice D++ keyset pagination migration. All failing tests
describe the NEW keyset contract and will flip to GREEN once Roger implements:
1. `encodeCursor(lastSort, lastId, scope)` — 3-arg signature
2. `decodeCursor` v1 branch → `{version:1, lastSort, lastId, scope}` (no `offset`)
3. `decodeCursor` garbage/v0 → `{version:0}` restart sentinel (no `offset` field)
4. `SqliteFactStore.search()` keyset WHERE clause
5. `InMemoryFactStore.search()` keyset slice logic (Roger's task)

---

## Contract ID Changes

| ID | Change | Reason |
|----|--------|--------|
| FS-10f | **DELETED** | v0 backward-compat removed; v-absent cursor now treated as garbage (restart) |
| FS-11 | **NEW** | FSE-2 concurrent-insert safety (keyset prevents duplicate on page N+1 after insert between pages) |
| FS-5b | **EXTENDED** | Added third `.each` case: v0 cursor with valid `offset:5` now must restart (not honor offset) |
| FS-SE-4 | **REPLACED** | Tests now cover bad v1 keyset fields (`lastSort`/`lastId`) instead of bad v0 offset values |
| FS-SE-15 | **UPDATED** | Assertion extended: requires `lastSort: any(Number), lastId: any(Number)` in decoded cursor |
| CU-1a/b/c | **UPDATED** | v0 absent now → `{version:0}` restart sentinel (was `{version:0, offset:N}`) |
| CU-2a/b | **UPDATED** | 3-arg `encodeCursor(lastSort, lastId, scope)` round-trip assertions |
| CU-2c–g | **NEW** | Bad keyset field validation: NaN/Infinity lastSort, negative/float/missing lastId → restart |
| CU-4a/b/c | **UPDATED** | Garbage → `{version:0}` (no `offset` field in restart sentinel) |

---

## RED Test List (22 failing)

### cursor.test.ts (11 failing)
- CU-1a, CU-1b, CU-1c — v0 absent → restart `{version:0}` not `{version:0, offset:N}`
- CU-2a — `encodeCursor(42.5, 17, scope)` round-trip (3-arg signature)
- CU-2c — bad lastSort NaN → restart
- CU-2d — bad lastSort Infinity → restart
- CU-2e — bad lastId negative → restart
- CU-2f — bad lastId float → restart
- CU-2g — missing lastId → restart
- CU-4a, CU-4b, CU-4c — garbage → `{version:0}` (no extra `offset` field)

### fact-store-contract.helper.ts — both InMemoryFactStore + SqliteFactStore (6 failing)
- FS-5b ×2 (third case: v0-valid-offset-5 must restart, not advance)
- FS-10a ×2 (cursor must have `lastSort`/`lastId` not `offset`)
- FS-11 ×2 (**FSE-2**: insert between pages → no dup; offset impl produces dup)

### fact-store-sqlite-edges.test.ts (4 failing)
- FS-SE-4 ×3 (bad v1 keyset fields with `offset:1` → current impl honors offset → page 2 = empty ≠ baseline)
- FS-SE-15 (cursor must have `lastSort`/`lastId` fields)

---

## Invariants UNCHANGED (still GREEN)

CU-3 (a–f), CU-5, CU-6, CU-7 — version-rejection and fingerprint tests unchanged.  
CU-2b — version:1 discriminant (passes with both current and new impl).  
FS-1..4, FS-5 (original), FS-6, FS-7, FS-8, FS-9 — core search semantics unchanged.  
FS-10b–e (scope mismatch), FS-10g (v:99), FS-10h (empty query) — unchanged.  
FS-SE-1, SE-1b, SE-2, SE-3, SE-5..14 — unchanged.  
FS-SE-12 (per-page normalization), FS-SE-14 (fingerprint determinism) — explicitly unchanged per plan.

---

## Restart Sentinel Shape Decision

New `DecodedCursor` type for Roger to implement:

```typescript
export type DecodedCursor =
  | { version: 0 }                                           // restart from page 1; no offset
  | { version: 1; lastSort: number; lastId: number; scope: string };
```

Tests assert `toEqual({ version: 0 })` for garbage/v0 cases — the extra `offset:0` field in the
current return value makes those assertions fail. This is the correct shape for keyset because:
- `version:0` signals "no valid keyset anchor; start from page 1"
- No `offset` field prevents accidental OFFSET fallback in any future code path

---

## FSE-2 Test Design (FS-11)

Sequence:
1. Seed A (`fse2safety` ×3, trust=0.8) and B (`fse2safety` ×1, trust=0.8)
2. Page 1 (limit=1): returns A; cursor stores keyset anchor
3. Seed C (`fse2safety` ×4, trust=0.8) — ranks ABOVE A
4. Page 2 with cursor:
   - **Offset impl:** sorted=[C,A,B], OFFSET 1 → returns A again (DUPLICATE → RED)
   - **Keyset impl:** WHERE composite < composite(A) → returns B (correct → GREEN)

Both InMemoryFactStore and SqliteFactStore covered via `runFactStoreContract` harness.

---

## What Roger Needs to Implement (GREEN phase)

1. **cursor.ts** — `DecodedCursor` type update; `encodeCursor(lastSort, lastId, scope)` 3-arg; `decodeCursor` v1 branch reads `lastSort`/`lastId`; garbage/v0 returns `{version:0}` (no offset).
2. **fact-store-sqlite.ts** — keyset WHERE: `AND ((-bm25_score)*f.trust < $lastSort OR ((-bm25_score)*f.trust = $lastSort AND f.id > $lastId))`. Replace `OFFSET $offset`. `nextCursor = encodeCursor(lastRow.composite, lastRow.id, scope)`.
3. **InMemoryFactStore** (in `fact-store.contract.test.ts`) — keyset slice logic using `insertionOrder` as `lastId` analog and `score` as `lastSort` analog.
 

 # Decision Drop: Migration 002 — Attention Tier Columns

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-06-10T22:20:20-07:00
**Context:** M8 Slice D++ — closes the Slice C schema gap

---

## What Was Delivered

Migration 002 (`packages/eureka/src/db/migrations/002-facts-attention.ts`) adds
three columns to the `facts` table and registers as version 2 in schema.ts. A
dedicated migration test suite (`src/db/__tests__/migrations.test.ts`, 5 tests,
all green) locks the column defaults, CHECK enforcement, and idempotency.

---

## Column Design Decisions

### `importance REAL NOT NULL DEFAULT 0`

**Type: REAL.** Importance is a normalized signal ∈ [0,1] consumed by
`compositeScore` as a float. `REAL` (IEEE 754 double) is the correct SQLite
type for a continuous fractional value.

**NOT NULL with constant default 0.** SQLite's ADD COLUMN constraint: `NOT NULL`
is permissible when the default is a constant non-NULL value. Default `0` exactly
reproduces the SqliteFactStore Slice-C hard-code (`importance ?? 0` in
`compositeScore`). No behavioral change for existing or new rows that omit the
column.

**Why not nullable?** Nullable importance would require every consumer to guard
against NULL before arithmetic. `NOT NULL DEFAULT 0` eliminates the NULL case at
the SQL layer: the storage contract is "0 means unscored" — SQL never emits NULL.

---

### `last_accessed INTEGER DEFAULT NULL`

**Type: INTEGER.** Unix epoch milliseconds is a 64-bit integer; SQLite INTEGER
stores up to 8 bytes, sufficient for epoch-ms well past year 9999. This is the
standard convention for numeric timestamp fields (distinguish from `created_at`
and `updated_at` in migration 001, which use `TEXT` + `datetime('now')` for
human-readable wall-clock display — those are not arithmetic targets).

**Nullable (no NOT NULL).** NULL is the load-bearing sentinel for
"never accessed". The compositeScore F3 guard converts `lastAccessed = undefined`
(JavaScript) / NULL (SQL) to `Infinity` tDays → `recency = Math.max(0.1, ...)
= 0.1`. Forcing NOT NULL would require a magic sentinel integer (e.g., 0 =
epoch, which would be "accessed in 1970" — wrong semantics). NULL is the
correct representation of "no access has occurred."

**No DEFAULT expression.** `DEFAULT NULL` (explicit) and omitting DEFAULT both
yield NULL; explicit declaration is clearer in the schema for future readers.

---

### `attention_tier TEXT NOT NULL DEFAULT 'warm'`

**Type: TEXT.** Enum-as-string is idiomatic SQLite for a small closed set of
named values. The TypeScript type `'hot' | 'warm' | 'cold'` maps cleanly to
three TEXT literals; no integer-to-name join table needed for a 3-value enum.

**NOT NULL with constant default 'warm'.** Same rationale as `importance`:
constant default satisfies the NOT NULL constraint for ADD COLUMN. Default
'warm' reproduces the SqliteFactStore Slice-C hard-code (`attentionTier: 'warm'`
with multiplier 1.0 — the identity value). Warm tier is the "do nothing" tier,
making it the correct zero-disturbance default.

**CHECK constraint on ADD COLUMN — verified.**
SQLite DOES accept `CHECK (attention_tier IN ('hot', 'warm', 'cold'))` in an
`ALTER TABLE ADD COLUMN` statement (verified at runtime against better-sqlite3
which bundles a recent SQLite). The CHECK is enforced for all future
INSERTs/UPDATEs. Existing rows at ALTER time are NOT validated — they receive
the default 'warm', which passes the CHECK regardless. No table-rebuild pattern
was needed.

Test MIG-4 confirms: inserting with `attention_tier = 'lukewarm'` throws.
Test MIG-5 confirms: 'hot' and 'cold' are accepted.

---

## Locked Decision: No ORDER BY Change (D2)

The SQL `ORDER BY (-bm25_score) * f.trust DESC, f.id ASC` is **not modified**.
The `importance`, `last_accessed`, and `attention_tier` columns are NOT part of
the sort key. Rationale (locked by Aaron):

The recall-layer `compositeScore` recency term is query-time-varying: it depends
on `now()` at call time, not on a stored value. Folding a time-varying term into
SQL ORDER BY would break keyset-cursor stability (last-rank + last-id cursors
would be computed against one `now()` and validated against a different `now()`
on the next page). The columns are stored for the application layer to consume;
SQL ordering remains deterministic and cursor-stable.

---

## What Is NOT Wired

`SqliteFactStore.search()` still hard-codes `attentionTier: 'warm'` and omits
`importance`/`lastAccessed` from the SELECT. That wiring — reading the new
columns from SQL into `RecallResult` — is the GREEN implementation phase,
separately scoped. The hard-coded defaults remain behaviorally correct until
that phase lands (they match the SQL defaults exactly).

---

## Test Coverage

| ID    | Assertion |
|-------|-----------|
| MIG-1 | `MAX(version) = 2` after applying both migrations |
| MIG-2/3 | Freshly-inserted row: `importance=0`, `last_accessed=NULL`, `attention_tier='warm'` |
| MIG-4 | CHECK rejects `attention_tier = 'lukewarm'` |
| MIG-5 | 'hot' and 'cold' accepted; values round-trip correctly |
| MIG-6 | `applyMigrations` idempotent — second call does not throw |

Also updated DB-CL-3 and DB-CL-6 in `fact-reader-sqlite-edges.test.ts` from
`schema_version = 1` to `= 2` (schema_version row count now 2, max version 2).
 

 # Decision Drop: Keyset Cursor — GREEN Phase (Slice D++)

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-06-10T22:56:47-07:00
**Context:** M8 Slice D++ GREEN — implements keyset pagination for `FactStore.search()`

---

## What Shipped

Four files changed; 22 RED tests turned green; 177 pre-existing tests stay green (199 total).

| File | Change |
|------|--------|
| `src/storage/cursor.ts` | v1 mutated in place to keyset; v0 compat deleted |
| `src/storage/fact-store-sqlite.ts` | Two prepared statements; keyset SQL; logger seam |
| `src/storage/__tests__/fact-store.contract.test.ts` | InMemoryFactStore keyset parity |
| `src/activities/recall.ts` | FactStore interface JSDoc updated; FSE-2 closed note |

---

## v1 Mutated In Place (Not Bumped to v2)

`DecodedCursor` v1 variant changes from `{ offset }` to `{ lastSort, lastId }`. The version
number stays `1`. Rationale: the old v1 format never shipped to a stable public API (Slice D+
was an internal cursor upgrade); no external cursors exist in the wild. Bumping to v2 would
require recognizing and rejecting old `{ v:1, offset }` cursors — adding a case for a format
that was never persisted externally. The cleaner cut is: v1 now means keyset; anything with
`v` absent or `v !== 1` is either garbage (restart) or a contract violation (throw). No
migration of existing cursor strings is needed.

---

## FSE-2 Guarantee — Corrected (Fix Wave #1)

With keyset pagination, the WHERE predicate anchors on `(lastSort, lastId)` — the composite
score and row id of the last returned row. Any fact **inserted** between page fetches with a
higher composite score than `lastSort` is naturally excluded (it appears "before" the cursor
anchor in sort order). **Concurrent inserts cannot cause duplicate rows** — FSE-2 is closed
for INSERT-induced cross-page duplication. FS-11 verifies this directly.

**Trust-mutation caveat (corrected from initial drop):** If a row already returned on page 1
has its trust score mutated between page fetches, its recomputed composite can re-cross the
`lastSort` anchor → the row may re-appear on a subsequent page. Callers needing strict
stability under concurrent trust writes must restart pagination. This is an explicit
out-of-scope case documented in the FS-11 contract test header.

---

## Two-Statement Design (Updated: CTE Refactor — Fix Wave #9)

`SqliteFactStore` prepares two SQL statements at construction:

- `stmtFirst` — no keyset predicate; used on first page (no cursor or restart sentinel)
- `stmtKeyset` — two-level CTE: `base` selects and computes `bm25(facts_fts) AS bm25_score`
  once; `ranked` derives `(-bm25_score)*trust AS composite`; outer query filters on `composite`

**Why CTE?** The original stmtKeyset called `bm25(facts_fts)` twice in the WHERE predicate
(once for `< $last_sort`, once for `= $last_sort`). The CTE computes bm25 once in `base`,
derives composite once in `ranked`, and the outer SELECT filters on the pre-computed value.
Single bm25 evaluation + cleaner boundary — the composite expression in the CTE MUST mirror
the sort expression in stmtFirst's ORDER BY or the keyset boundary silently breaks.

**Bit-exact boundary:** `lastSort` = `(-row.bm25_score) * (row.trust ?? NaN)` in JS.
The CTE `ranked` derives `(-bm25_score)*trust AS composite`. Both are IEEE 754 double
arithmetic on the same operand values — bit-exact match guaranteed.

**Why two statements, not conditional SQL?** `better-sqlite3` `prepare()` compiles a fixed SQL
string at construction time; bind params are typed to that string. Two statements is idiomatic.

**Alias in ORDER BY:** SQLite can expand SELECT aliases in ORDER BY. stmtFirst uses
`(-bm25_score) * f.trust DESC` in ORDER BY; stmtKeyset CTE uses `composite DESC`. Semantically
identical.

---

## Bit-Exact Boundary

`lastSort` stored in the cursor = `(-row.bm25_score) * (row.trust ?? NaN)` computed in
JavaScript from the fetched row. The WHERE keyset predicate computes
`(-bm25(facts_fts)) * f.trust`. Both use IEEE 754 double arithmetic on the same operand
values. The comparison is bit-exact. If `trust` is somehow NULL (filtered by `IS NOT NULL`
but guarded defensively), `NaN` propagates into the cursor and decodeCursor treats it as a
restart sentinel (non-finite lastSort → RESTART) — safe degradation.

---

## InMemoryFactStore Keyset Parity

Keyset filter in InMemoryFactStore:
```typescript
scored.filter(f =>
  f.score < keysetLastSort ||
  (f.score === keysetLastSort && f.insertionOrder > keysetLastId)
)
```
This mirrors the SQL predicate exactly. `insertionOrder` starts at 1 (not 0) to match
SQLite autoincrement semantics — `decodeCursor` rejects `lastId <= 0` as a restart sentinel.

---

## encodeCursor Object Param (Fix Wave #2)

Original signature: `encodeCursor(lastSort: number, lastId: number, scope: string)` — three
positional args, two of the same type. Swapping `lastSort` and `lastId` would type-check but
silently corrupt all subsequent pages. Changed to single object param:
`encodeCursor({ lastSort, lastId, scope })`. All call sites updated.

---

## Logger Seam (Updated: Full Threading — Fix Wave #3)

`SqliteFactStore` constructor: `constructor(db, logger?: { warn(msg): void })`. Default: `console`.
`deps.ts` `createSqliteRecallDeps(db, options?)` now accepts `{ logger? }` in options and
threads it to `SqliteFactStore` and onto the returned `RecallDeps`. `recall.ts` `recallWithScores`
uses `deps.logger ?? console` instead of `console.warn` directly. Same logger instance handles
both FTS5 parse-error warnings and attention-tier warnings. Backward-compatible — no caller
forced to provide a logger.

---

## Deviations from Spec

None. All four implementation requirements (cursor.ts, fact-store-sqlite.ts, InMemoryFactStore,
recall.ts JSDoc) delivered. All specified constraints honored (sort key unchanged, per-page
normalization unchanged, FS-4 footgun lock intact, scope fingerprint check preserved for v1).
 

---



# Decision — Append-Only History Rule Reinterpreted (Supersedes Issue #71 Decision B)

**By:** Aaron Kubly (akubly)  
**Date:** 2026-06-16  
**Type:** Governance / Rules Clarification  
**Status:** ACCEPTED — establishes correct interpretation going forward

---

## What Was Corrected

The Append-Only History Rule, originally stated as a blanket prohibition on any modification to
`history.md` and `history-archive.md`, was overstated. The correct interpretation:

**Append-only refers to HOW new content is added to these files**, not a prohibition on
condensation:

- New entries are always **appended to the end of the file**, never interleaved or rewritten in
  place. This property is what makes these files safe to merge via the `.gitattributes
  merge=union` driver.
- **Condensation is sanctioned and lossless:** Scribe (and the `squad nap` tool) are intended to
  periodically condense old `history.md` entries by relocating them verbatim into
  `history-archive.md`, keeping the most recent N entries live in `history.md`.
- Archive files (`history-archive.md`, `decisions-archive.md`) are append-only targets — they
  only grow, never shrink or have existing content overwritten.

## Supersession

**Decision: Issue #71 Decision B, Option A** ("Drop size management, no deletions ever") is
**SUPERSEDED** by this reinterpretation.

The prior "Option C" (recency-based archival: move old entries to archive, delete from
history.md) is now the **sanctioned strategy**, provided:
1. Archived entries are preserved **verbatim** in `history-archive.md`
2. Archive files are **append-only** — they never lose pre-existing content
3. The `history.md` tail is truncated AFTER entries are appended to the archive (history is
   lossless overall)

## Rationale

Scribe's spawn template included a "HISTORY SUMMARIZATION" gate that was flagged as a violation
because it edited previously-committed history entries. This was correctly identified as a scope
violation — but the underlying policy was mischaracterized as "no size management ever." The
team intended size management all along; the error was HOW it was attempted (dropping data vs.
moving it).

The `squad nap` condensation output (appending old entries to history-archive.md verbatim,
then truncating history.md tail) is now **legal and correct** provided the archive grows and
nothing is lost.

## Action Items

- ✅ `squad nap` history-condensation diffs in the working tree (moving entries to
  history-archive.md, truncating history.md tail) are safe to commit and push.
- ✅ Future Scribe spawns and automated naps may condense history.md per the Option-C strategy.

---



# 1. Syntax check
bash -n .github/hooks/cairn/shell-init.sh
bash -n .github/hooks/cairn/install.sh
bash -n .github/hooks/cairn/uninstall.sh



# 2. Install (idempotent — run twice to confirm second run is no-op)
bash .github/hooks/cairn/install.sh
bash .github/hooks/cairn/install.sh   # should print "already installed"



# 3. Reload and smoke-check
source ~/.bashrc
forge_mcp_check



# 4. Uninstall
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc


# forge_mcp_check should no longer exist as a function



# 5. Re-install (confirm idempotency survived uninstall cycle)
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check
```

## Key design note

The marker block strategy (`# forge-mcp: shell init — start`) is the safe pattern
for managed rc-file entries. The install script will never double-append, and the
uninstall script removes the exact block. No manual editing required.



# PR #45 — Second Merge from origin/main (2026-06-05)

**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Merge commit:** 9a26669

---

## What merged

Two PRs landed on main since the last merge:
- **#47** — M8 Slice B (eureka storage layer: `trust-updater-sqlite.ts`, contract test helpers, refactored `fact-reader-sqlite.ts`)
- **#44** — forge-mcp hooks (`.github/hooks/cairn/` install/uninstall/shell-init scripts; `forge-mcp-shell-install` skill)

Full diff summary: 35 files changed, 10641 insertions, 15048 deletions (large deletions from decisions-archive consolidation).

---

## Conflicts

**None.** The only overlapping files were `.squad/` append-only files (history.md, history-archive.md, decisions.md, decisions-archive.md), all covered by `merge=union` in `.gitattributes`. Git auto-resolved all of them via the union driver. No source files, no package-lock.json, no tsconfig conflicts.

---

## Build result

`npm install` — ✅ clean (no lockfile conflict; audit warnings pre-existing)
`npm run build` (all workspaces, `tsc --build`) — ✅ exit 0

---

## Test results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

---

## New HEAD

`9a26669` — Merge remote-tracking branch 'origin/main' into squad/crucible-sprint-0-walkthrough-a

---

## Status

Not pushed — Roger has follow-up fixes to land on top; coordinator will push after.


---



# 2026-06-06: Aaron's User Directive — Parallelization and TDD Discipline

**By:** Aaron Kubly (via Copilot)  
**Directive:** When parallelizing work, do NOT go parallel if it requires deviating from RED→GREEN TDD execution. TDD discipline (RED test fails first, then minimal GREEN, then REFACTOR) takes priority over parallelism. Parallel work is only permitted at TDD-safe boundaries (e.g., independent RED tests, interface/seam contracts) — never GREEN-before-RED, never shared-impl-before-seam.  
**Why:** User direction — captured for team memory during WAL substrate + Walkthrough B kickoff (Option A seam-first).

---



# 2026-06-06: Aaron's Ruling — HookVerdict VETO Semantics (resolves graham-ledger-seam-OPEN)

**By:** Aaron Kubly (via Copilot)  
**Decision:** Option A — Adopt **VETO** as a first-class **pre-WAL Ledger-layer gate**.

- VETO fires at `Ledger.append` entry, BEFORE staging. Rejected input never enters the WAL → WAL stays purely append-only; §3's "all staged rows commit" invariant is intact.
- §4's `continue | observe | pause` (on the staged batch, inside the group-commit window) are untouched. VETO is a distinct, earlier policy boundary.
- Enforced by the type system: `Exclude<HookVerdict, 'VETO'>` at the WAL backend `commitRow` port so VETO can never cross the WAL boundary.
- §4.2 Walkthrough B RED test passes as written — no test rework.

**Required follow-on (documented amendments to FINAL specs):**

1. §4.1 verdict table — add VETO row ("no row created; Ledger throws `Append vetoed by hook: <id>`"), flagged as Ledger-layer (not commit-window).
2. §4.3 dispatch — add VETO case before the PAUSE check.
3. §11 replay contract — note: VETO inputs are not in the WAL; replay need not handle them (Ledger-layer policy, not a WAL concept).

**Why:** User ruling at Decision-Point Gate during WAL substrate + Walkthrough B build.

---



# Roger — Crucible S2 Persona-Review Cycle 1 Fix Wave

**Date:** 2026-06-13  
**Branch:** `squad/crucible-s2`  
**Commit:** `40fd452`  
**Author:** Roger Wilco (Platform Dev)  
**Requested by:** Aaron Kubly (team lead — dispositions pre-triaged)

---

## Context

A 5-persona Code Panel reviewed the S2 diff. Aaron triaged findings into
ACCEPTED (F1, F2, F4, F5, F6, F-minor) and DEFERRED (F3 — envelope versioning,
ship-gate). This document records the notable decisions made during implementation.

---

## D-FIX-1: onSubscriberError hook wrapped in inner try/catch (F1)

**Decision:** Guard the hook call in its own try/catch and swallow any exception.

**Rationale:** The hook is best-effort observability. The row is already durable
when the hook fires. A throwing hook escaping the for-loop is the same class of
bug as a throwing subscriber escaping it — it rejects append() AFTER a durable
write, producing exactly the duplicate-write scenario #69 guards against. An inner
try/catch with a `/* last-resort */` comment makes the invariant explicit in code.

**Alternative considered:** Let the hook throw and propagate — rejected. This would
re-introduce the durability/observability coupling we explicitly decided to break in
the original #69 implementation.

---

## D-FIX-2: Non-object 'm' in envelope map → CorruptSegmentError (F2)

**Decision:** Add `else if ('m' in env)` → throw, keeping the bare-string compat branch.

**Rationale:** Silently dropping an invalid 'm' is asymmetric with the strict 'k'
validation that already throws. A corrupted envelope map that has 'm' present with a
scalar value (e.g., integer 42) is a genuine segment integrity violation — not a
forward-compat unknown field. Throwing CorruptSegmentError is the correct response
and matches the existing error taxonomy.

**Aaron's explicit decision:** Bare-string backward-compat branch stays (do not remove).

---

## D-FIX-4: EnvelopeMapV1 interface in wal/types.ts (F4)

**Decision:** Export `EnvelopeMapV1 { k: string; m?: EventMetadata }` from the
shared `wal/types.ts` module. Use it at the encode site (materialize.ts) and
decode site (wal-backend-fs.ts cast).

**Rationale:** The inline type at the encode site and the `Record<string, unknown>`
cast at the decode site were both correct but asymmetric — a rename of `k` or `m`
would require two manual edits instead of one. The shared interface is the canonical
source of truth for the envelope shape.

**Scope:** Type-only refactor. Zero encoded bytes changed. Golden vectors unaffected.

---

## D-FIX-5: Remove double cast, expose concrete return type (F5)

**Decision:** Remove `as unknown as BackendWithRecords` from the FS harness in
hook-veto.test.ts. The function already returns `Promise<FileSystemWalBackend>`.

**Rationale:** The double cast silences compile errors. A method rename would fail
at runtime with a `TypeError: backend.readSegmentRecords is not a function` instead
of a compile error. The concrete return type is the correct fix because TypeScript
structural typing means `FileSystemWalBackend` already satisfies `BackendWithRecords`.

---

## D-FIX-6: Metadata contract tests in shared suite + FS reopen (F6)

**Decision:** Add CL-11/CL-12 to the shared `runWalBackendContract` suite (both
backends) and a standalone CL-13 FS-only reopen test alongside CL-6/CL-10.

**Note on reopen variant:** The proxy-based harness in `runWalBackendContract` does
not support close+reopen (the ensureOpen promise pattern complicates multi-instance).
CL-13 is added as a standalone describe alongside the existing CL-6 and CL-10 tests
in the same file. Reopen durability for metadata is also covered by META-1/META-2 in
wal-metadata-envelope.test.ts.

---


# Scribe — Crucible S2 Persona-Review Cycle — Outcome (Session 2026-06-13)

**Date:** 2026-06-13  
**Process:** 2-cycle Code Panel review (5 personas: Correctness/Skeptic/Craft/Compliance/Architect)  
**Branch:** squad/crucible-s2  
**Commit:** 40fd452 (Cycle 1 fixes) + Cycle 2 re-review on fix delta  

---

## Cycle 1 Findings & Dispositions

A 5-persona panel reviewed the S2 diff. Aaron pre-triaged findings into:
- **ACCEPTED (6):** F1, F2, F4, F5, F6, F-minor  
- **DEFERRED (1):** F3 (envelope versioning) → tracked as GitHub issue #76 (ship-gate)

### Finding Details:

| ID | Title | Disposition | Resolution |
|----|-------|-------------|-----------|
| F1 | onSubscriberError hook escape (append durability) | ACCEPTED | Inner try/catch wraps hook, exception swallowed. Comment added explaining invariant. Commit 40fd452. |
| F2 | Non-object 'm' in envelope map validation | ACCEPTED | Added lse if ('m' in env) branch to throw CorruptSegmentError; bare-string compat retained per Aaron. Commit 40fd452. |
| F3 | Envelope versioning forward-compat boundary | DEFERRED | Deferred to ship-gate decision. Tracked as GitHub issue #76. |
| F4 | Asymmetric envelope shape type (encode vs. decode) | ACCEPTED | Exported shared EnvelopeMapV1 interface from wal/types.ts; used at encode (materialize.ts) and decode (wal-backend-fs.ts) sites. Type-only refactor, zero byte changes to golden vectors. Commit 40fd452. |
| F5 | Double cast s unknown as BackendWithRecords in test harness | ACCEPTED | Removed double cast; createFileSystemWalBackend already returns Promise<FileSystemWalBackend>, which satisfies BackendWithRecords structurally. Commit 40fd452. |
| F6 | Metadata contract-suite round-trip durability | ACCEPTED | Added CL-11/CL-12 to shared 
unWalBackendContract suite (both backends); standalone CL-13 FS-only reopen test added alongside CL-6/CL-10. Metadata reopen durability also covered by META-1/META-2 in wal-metadata-envelope.test.ts. Commit 40fd452. |
| F-minor | Test title cleanup + documentation fixes | ACCEPTED | Miscellaneous test naming and doc clarity improvements applied. Commit 40fd452. |

### Test Results (after Cycle 1 fixes):
- All 186 unit tests passing  
- TypeScript compilation clean (	sc exit 0)  
- Linting clean (no new violations)  
- Golden vector byte comparison: zero changes (encoded format unaffected)

---

## Cycle 2: Re-Review on Fix Delta

The panel re-reviewed the dispositions and Cycle 1 fix implementations on the delta (40fd452).

**Finding:** Architect persona flagged F5 as "public API widening" — the return type Promise<FileSystemWalBackend> supposedly new/exposed.

**Investigation:** Git diff origin/main..HEAD on createFileSystemWalBackend signature showed **zero changes** — the function has returned Promise<FileSystemWalBackend> since before S2. Signature untouched. Return type not widened.

**Disposition:** FALSE POSITIVE. F5 false-alarm resolved. No further action needed.

### Cycle 2 Test Results:
- All fixes verified correct  
- No regressions introduced  
- Contract suite round-trips validate metadata durability end-to-end

---

## Outcome

**Status:** REVIEW-COMPLETE. Ready to ship.

**Pre-Ship Decision (Aaron):** YAGNI principle applied — envelope versioning (F3) deferred to dedicated ship-gate decision process (GitHub issue #76). All blocking and important findings from Cycle 1 have been fixed, Cycle 2 re-review found no regressions, and false positives have been resolved.

**Next Steps:** Merge branch squad/crucible-s2 to main per standard gate. F3 work (envelope versioning boundary definition) tracked separately as issue #76 for ship-gate gate consideration.

---




---

# Alexander: Forge run-session composition root

Date: 2026-06-16T23:25:32-07:00

## Decision

Slice 1 implements the opt-in `forge-run-session` command as a thin operator
surface in `packages/runtime-cli`, but the reusable session wiring lives in
`packages/skillsmith-runtime/src/forgeSessionRunner.ts`.

The runtime helper owns the composition:

`CopilotClient` / injected SDK client → `ForgeClient` → `createCairnTelemetrySink(db)` → one prompt via `ForgeSession.sendAndWait()` → disconnect/flush → `curate()` profile build.

## Rationale

`skillsmith-runtime` is already the composition root that imports both Cairn
and Forge. Keeping the SDK/Forge/Cairn wiring there avoids burying lifecycle
logic in CLI argument parsing and gives Roger a reusable function to lift into
a future platform runner.

## Permission seam

`ForgeSessionConfig` now exposes `onPermissionRequest`, passed through by
`ForgeClient.createSession()` and `resumeSession()`. Forge defaults the handler
to SDK `approveAll` for dogfood, while callers can override it for stricter
production policy.

## Scope boundary

DBOM generation is intentionally out of slice 1. Bridge events remain captured
on `ForgeSession`; the slice only proves local signal samples and execution
profile visibility.


---

# Roger — Forge runner lifecycle guidance

**Date:** 2026-06-16T22:51:06-07:00  
**Scope:** Forge #1 production runner integration; platform/lifecycle guidance for `forge-run-session`.

## Decision: graceful shutdown ordering

For `forge-run-session`, use one idempotent shutdown path for normal completion, SIGINT/Ctrl+C, and top-level errors:

1. Stop accepting new prompts / mark shutdown in progress.
2. Await `session.disconnect()`. The Forge runtime must keep SDK event subscriptions live during `sdkSession.disconnect()` because the live SDK may emit terminal lifecycle events during disconnect.
3. Flush Forge telemetry collectors/sink after `sdkSession.disconnect()` returns, so `session.shutdown` → Forge bridge `session_end` has been observed before `outcome.succeeded` is computed.
4. Call `ForgeClient.stop()` for client/transport cleanup.
5. Close the SQLite handle with `closeDb()` last.

Alexander's current runtime seam already matches this: `packages/forge/src/runtime/session.ts` keeps the subscription live, records `sdk_disconnect_start/end`, calls `sdkSession.disconnect()`, unsubscribes, then flushes telemetry (`telemetry_flush_start/end`). The runner should not add its own separate sink flush before `session.disconnect()`, and tests should assert this timing through `session.getTelemetryTimings()`.

For Forge #1's single-prompt runner, SIGINT does not need a prompt-loop shutdown flag yet. The CLI should let interruption/error unwinds reach the same `finally`; if a later runner adds a prompt loop, then add an explicit `process.on('SIGINT')` flag and return the conventional interrupt code instead of accepting more prompts.

## Decision: SQLite lifecycle contract

The runner should open Cairn's SQLite DB through `getDb(parsed.values.db)` / `getKnowledgeDbPath()` and always close with `closeDb()` in `finally`. `packages/cairn/src/db/index.ts` creates the parent directory, opens better-sqlite3, enables `journal_mode = WAL` and `foreign_keys = ON`, then applies migrations.

`knowledge.db` does not use the Crucible L1 `write.lock`; issue #55 is about the custom file-backed WAL substrate, whose current mitigation is PID + liveness reclaim. Do not graft that lock onto SQLite in this slice. SQLite WAL gives concurrent readers and serializes writers, but it does not protect higher-level session semantics. A runner and an interactive Copilot session writing the same `~/.cairn/knowledge.db` can still hit immediate `SQLITE_BUSY` failures (Cairn does not currently set `busy_timeout`) or collide on active-session identity. For CI/dev, prefer `--db <isolated path>`; for dogfood, choose one supported policy: serialize real interactive runs, or make the runner use its own session identity so it cannot resume/overwrite an interactive session's logical state.

## Decision: placement

Keep the command in `packages/runtime-cli` as `src/forge-run-session.ts` and register it in `packages/runtime-cli/package.json` `bin`, matching `forge-metrics` and `forge-seed-profile`. Keep `runtime-cli` thin: parse args, call `@akubly/skillsmith-runtime`, print JSON, close Cairn. Do not add a direct `@akubly/forge` dependency to `runtime-cli`; `packages/skillsmith-runtime/src/forgeSessionRunner.ts` is the reusable composition root that owns SDK → Forge → Cairn wiring.

Use existing runtime-cli conventions: `node:util` `parseArgs`, `--help/-h`, `--db`, and top-level `process.exitCode = code`. Return `0` when signal samples are written, `1` when the session runs but produces no signal samples, and `2` for bad input/auth/SDK availability errors.

## Decision: auth/config failure behavior

Construct the real SDK client only inside the reusable runtime composition root, not directly in the CLI entry point. `@github/copilot-sdk@0.2.2` documents `CopilotClient` options including `cliPath`, `cliArgs`, `cliUrl`, `port`, `useStdio`, `autoStart`, `githubToken`, `useLoggedInUser`, and `telemetry`; it also documents that `createSession`/`resumeSession` require `onPermissionRequest`. Forge #1's approved policy seam defaults to SDK `approveAll`, but keep that explicitly opt-in to this runner slice: do not accept tokens as positional/printed CLI args, do not echo auth details in errors, and treat `cliPath`/`cliUrl` overrides as developer-only configuration, not repo-controlled input.

If auth, CLI startup, or SDK import is unavailable, print one clear `forge-run-session: ...` error and exit `2`; do not create partial DB writes beyond already-flushed telemetry, and always run the same shutdown `finally`.

## Verification contract

Add offline tests with a faithful SDK client double that emits events in production order:

`session.start` → tool/usage/turn events → runner calls `session.disconnect()` → SDK double emits `session.shutdown` during `sdkSession.disconnect()` → telemetry flush → `ForgeClient.stop()` → `closeDb()`.

Assertions:

- persisted `signal_samples` rows include an `outcome` sample with `metadata.succeeded === true`;
- running profile build yields `sessionCount >= 1`;
- `forge-metrics --skill <id>` reports `profile.found: true`.
- `telemetryTimings` show `sdk_disconnect_end` before `telemetry_flush_start`.

Keep a tiny manual dogfood smoke behind opt-in auth, but CI should use the SDK double and an isolated `--db` path.

