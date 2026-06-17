# Team Decisions — Crucible Core

## Index

- [Graham: Crucible S3 — Next Slice Recommendation](#graham-crucible-s3--next-slice-recommendation)
- [Graham: Skeleton Export Surface — Subpath Export Decision](#graham-skeleton-export-surface--subpath-export-decision)
- [Decision: StubSdkProvider deterministic contract (T4, Phase 0.5 skeleton)](#decision-stubsdkprovider-deterministic-contract-t4-phase-05-skeleton)
- [Gabriel — Skeleton Scheduler Decision (S3 T3)](#gabriel--skeleton-scheduler-decision-s3-t3)
- [Roger — Skeleton WAL: Bootstrap Atomicity & Replay Engine Seam](#roger--skeleton-wal-bootstrap-atomicity--replay-engine-seam)
- [Laura: Skeleton Tests — Testing Decisions](#laura-skeleton-tests--testing-decisions)
- [CLI UX Decisions — Skeleton Verbs (S3 Phase 0.5)](#cli-ux-decisions--skeleton-verbs-s3-phase-05)

---

## Graham: Crucible S3 — Next Slice Recommendation

**Date:** 2026-06-16  
**Author:** Graham (Lead / Architect)  
**Status:** PROPOSED (pending Aaron approval)  
**Prerequisite:** S1 (WAL correctness) ✅ shipped, S2 (doc/governance) ✅ shipped

---

### Recommendation: Phase 0.5 Walking Skeleton

**Pick:** Option A — the CTD-defined gate for Phase 1 fan-out.

**Why:** The walking skeleton is the longest-pole dependency. Every Phase 1 lane (Router, Generators, Replay, SDK/Applier) is blocked until the skeleton passes. Shipping Aperture features or isolated stubs first would be locally productive but wouldn't unblock the critical path. The substrate is now correct and hardened (S1/S2) — the skeleton can build on solid ground.

**Trade-off named:** We defer visible UX features (#65/#66 Aperture ack/priority) in favor of invisible plumbing. Cost: no user-facing progress this slice. Benefit: unblocks 5 parallel lanes for Phase 1 — maximum downstream throughput.

---

### Slice Scope (6 skeleton checks per CTD §Phase 0.5)

1. **SdkProvider stub** (§12) — one LLM call boundary (mock/stub, not real SDK yet)
2. **L0 Bootstrap** — BootstrapPayload → offset-0 Observation rows in WAL
3. **WAL append** — LLM response committed as Observation + Decision with hash-chain
4. **`crucible status`** — CLI verb reading session ID, row count, last offset
5. **`crucible replay`** — A2 conformance: byte-equivalent replay from captured session
6. **FifoScheduler stub** — L3.5 tier boundary, immediate dispatch, satisfies A-Sched-1

**Gate rule:** All 6 checks green in CI on a single run before Phase 1 fan-out.

---

### Agent Ownership

| Component | Owner | Support |
|-----------|-------|---------|
| WAL bootstrap-batch + replay path | Roger | Laura (A2 conformance test) |
| SdkProvider interface + stub | Alexander | Graham (boundary shape) |
| FifoScheduler stub | Gabriel | Graham (tier contract) |
| `crucible status` + `crucible replay` verbs | Valanice | Laura (acceptance) |
| Orchestration / integration test | Graham | All |

**Rough size:** 3–4 days elapsed (parallel work across 4–5 agents once interfaces lock).

---

### Alternatives Considered

#### Option B: FifoScheduler + Router Stub Only

**Scope:** Implement §5.A scheduler tier boundary in isolation without the full vertical.  
**Owners:** Gabriel + Graham.  
**Size:** ~1 day.  
**Unblocks:** Router lane only.  
**Trade-off:** Fast and contained, but doesn't prove the L0→L1→replay vertical works end-to-end. We'd still need the skeleton before other lanes can start. Partial unblock only.

#### Option C: SDK Provider (§12) + Bootstrap Protocol

**Scope:** Alexander builds `SdkProvider` interface + bootstrap-batch WAL integration.  
**Owners:** Alexander + Roger.  
**Size:** ~2 days.  
**Unblocks:** §8 Applier (Alexander's serial dependency).  
**Trade-off:** Unblocks Alexander's downstream lane but leaves Gabriel, Laura, Valanice idle. Doesn't satisfy the skeleton gate — we'd still need to assemble the remaining pieces separately.

#### Option D: Aperture Feature Push (#65/#66)

**Scope:** unreadCount ack, getPriority surface, badge dismiss.  
**Owners:** Roger + Valanice.  
**Size:** ~2 days.  
**Unblocks:** Nothing on the critical path.  
**Trade-off:** Visible UX progress, satisfies user-facing demand. But it's Phase 2 work (§9 depends on §5 Router) being pulled forward — sequencing violation. Delays the gate that unblocks everything else.

---

### Decision Rationale (Trade-Off Terms)

| Factor | Skeleton (A) | Scheduler-only (B) | SDK+Boot (C) | Aperture (D) |
|--------|:---:|:---:|:---:|:---:|
| Unblocks Phase 1 fan-out | ✅ all 5 lanes | ❌ 1 lane | ❌ 1 lane | ❌ 0 lanes |
| Proves vertical correctness | ✅ L0→L1→replay | ❌ | 🟡 partial | ❌ |
| Team utilization | ✅ 4–5 agents | ❌ 2 agents | 🟡 2 agents | 🟡 2 agents |
| User-visible progress | ❌ none | ❌ none | ❌ none | ✅ badge UX |
| Risk if deferred | 🔴 blocks everything | 🟡 blocks 1 lane | 🟡 blocks 1 lane | 🟢 no urgency |

**Bottom line:** Option A is the only choice that unblocks the full team. The cost (no UX progress) is acceptable because the substrate is invisible infrastructure — users won't see anything until Phase 1 features land anyway.

---

## Graham: Skeleton Export Surface — Subpath Export Decision

**Date:** 2026-06-16  
**Author:** Graham (Lead / Architect)  
**Status:** APPLIED (committed to squad/crucible-s3-skeleton)  
**Scope:** API surface design for `@akubly/crucible-core` skeleton types/implementations

---

### Decision

Added a `package.json` `exports` map to `@akubly/crucible-core` with a `"./skeleton"` subpath:

```json
"exports": {
  ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "./skeleton": { "types": "./dist/skeleton/index.d.ts", "default": "./dist/skeleton/index.js" }
}
```

Consumers import via `@akubly/crucible-core/skeleton` — no `dist/` in the specifier.

### Alternative Considered

**Re-export from root `src/index.ts` barrel.** This is simpler (one fewer export map entry) but:
- Pollutes the permanent core API with Phase 0.5 scaffolding types (StubSdkProvider, FifoScheduler, etc.)
- Muddies the signal: consumers can't tell what's core vs. skeleton
- Makes it harder to remove/graduate the skeleton surface later without a breaking change

### Trade-Off

| Factor | Subpath (chosen) | Root barrel |
|--------|:---:|:---:|
| Clean API boundary | ✅ | ❌ mixed surface |
| Import ergonomics | ✅ `@akubly/crucible-core/skeleton` | ✅ `@akubly/crucible-core` |
| Removability when skeleton graduates | ✅ delete one export entry | ❌ breaking change |
| Configuration overhead | 🟡 2 extra lines in package.json | ✅ zero |
| Node16 moduleResolution compat | ✅ verified via --build --force | ✅ trivial |

### Rationale

The skeleton is explicitly Phase 0.5 plumbing — it's scaffolding that will either graduate into the core surface (renamed, refined) or be superseded by Phase 1 implementations. A subpath export makes this status explicit in the package contract: it's an intentional auxiliary surface, not the main API. The `exports` map also prevents deep-path `dist/` imports from forming — any consumer using `@akubly/crucible-core/dist/...` will get a resolution error once the `exports` field is present, enforcing the designed entry points.

### Files Changed

- `packages/crucible-core/package.json` — added `exports` map
- `packages/crucible-cli/src/index.ts` — repointed to `@akubly/crucible-core/skeleton`
- `packages/crucible-cli/src/commands/status.ts` — same repoint
- `packages/crucible-cli/src/commands/replay.ts` — same repoint

---

## Decision: StubSdkProvider deterministic contract (T4, Phase 0.5 skeleton)

**Author:** Alexander  
**Date:** 2026-06-16T22:37:56-07:00  
**Branch:** squad/crucible-s3-skeleton  
**Status:** PROPOSED — for team awareness

---

### Context

T4 (SK-1) required implementing `StubSdkProvider implements SdkProvider` in
`packages/crucible-core/src/skeleton/sdk-provider-stub.ts`. The stub must be:

- Deterministic (SK-5 byte-equivalent replay depends on it).
- Free of timestamps and randomness.
- Barrel-isolated (no edit to `skeleton/index.ts` — Graham owns it; T2/T3 run in parallel).

---

### Decision: djb2 hash of prompt as determinism mechanism

**Choice:** A non-cryptographic djb2 hash of the prompt string produces a stable 8-character
hex `promptHash`. Every field in both canned `PrimitiveInput` rows is derived from this hash
or from the literal prompt content — no clock reads, no `Math.random()`.

**Alternatives considered:**
- Plain prompt echoing (no hashing): content-stable but doesn't distinguish prompts whose
  payloads would diverge in a real provider. djb2 is better because it proves the stub is a
  pure function of the input.
- crypto.createHash('sha256'): overkill for a canned stub; adds an async dependency and
  node:crypto import for zero replay benefit.

**Why it matters downstream (Laura / Roger):**
`causalReadSet` on the Observation row is `[]` (nothing causally read before the observation).
`causalReadSet` on the Decision row is `[promptHash]` — the hash string is the logical causal
reference, not an EventId integer, because the stub operates before L1 assigns offsets.

---

### PrimitiveInput shapes (aligned contract for SK-3 committer)

```ts
// Observation row
{
  primitiveKind: 'observation',
  primitivePayload: { source: 'stub-sdk', content: `stub-response:${promptHash}`, promptHash },
  causalReadSet: [],
}

// Decision row
{
  primitiveKind: 'decision',
  primitivePayload: { source: 'stub-sdk', action: 'passthrough', rationale: `stub decision for prompt hash ${promptHash}` },
  causalReadSet: [promptHash],
}
```

Both rows omit the optional `metadata` field.

---

### File location

`packages/crucible-core/src/skeleton/sdk-provider-stub.ts`

Consumers import by direct path:
```ts
import { StubSdkProvider } from '../skeleton/sdk-provider-stub.js';
```

Do **not** import from `../skeleton/index.js` until Graham adds the export in the barrel.

---

## Gabriel — Skeleton Scheduler Decision (S3 T3)

**Date:** 2026-06-16T22:37:56-07:00
**Branch:** squad/crucible-s3-skeleton
**Author:** Gabriel (Infrastructure)
**Relevant skeleton check:** SK-6

---

### Decision: Export `FifoScheduler` by direct path only (not via `index.ts` barrel)

**Context:** T2 (Roger), T3 (Gabriel), T4 (Alexander), and T5 (Valanice) all work in parallel on `packages/crucible-core/src/skeleton/`. The barrel `index.ts` is Graham's integration surface; a 3-way merge conflict was explicitly flagged as a collision risk.

**Decision:** `FifoScheduler` is exported from its own file (`fifo-scheduler.ts`) only. It is NOT added to `index.ts`. Consumers import the class via the direct path `'../skeleton/fifo-scheduler.js'`. Type-only re-exports from `index.ts` (interfaces from `types.ts`) are unaffected.

**Tradeoffs:**
- ✅ Zero merge conflicts with T2/T4 barrel edits
- ✅ Follows the same pattern any future skeleton impl should use during parallel sprints
- ⚠️ Consumers must know the direct path — but the task brief explicitly calls this out, so it's an agreed contract, not a surprise

**Team note:** Graham should add the implementation export to `index.ts` as part of assembly (T1/orchestration) once all parallel tasks land, or leave direct-path imports in place if they prefer the explicitness.

---

## Roger — Skeleton WAL: Bootstrap Atomicity & Replay Engine Seam

**Author:** Roger (Platform Dev)
**Date:** 2026-06-16
**Branch:** `squad/crucible-s3-skeleton`
**Slice:** Crucible S3 Phase 0.5 Walking Skeleton — T2 (WAL/ledger lane)
**Status:** OPEN — needs T1 (Graham) review on GAP-1 and GAP-2 before Phase 1

---

### Context

T2 implements SK-2 (bootstrap-batch) and SK-5 (byte-equivalence replay) for the walking
skeleton.  Three files touched: `skeleton/bootstrap.ts` (new), `skeleton/replay-engine.ts`
(new), `ledger/ledger-impl.ts` (extended).  During implementation I hit two design gaps in
the locked interfaces that will need resolution before Phase 1.

---

### Decision 1 — Bootstrap rows committed sequentially, not atomically (Phase 0.5 scope)

**Situation:** §3.8 requires bootstrap-batch atomicity ("either every offset-0 Observation
durable or none are").  The current `WalBackend` interface only exposes single-row
`commitRow()`.  `flush()` is a concrete-class method on `FileSystemWalBackend`, not on the
interface.

**Decision:** For Phase 0.5, `LedgerImpl.bootstrap(rows)` commits rows sequentially via
the existing `commitRow()` path.  This is NOT atomic at the WAL level — a crash between
row N and row N+1 would leave a partially committed bootstrap batch.

**Rationale:** The skeleton's acceptance tests use an in-memory backend (no crash) or
a fresh FS session (no concurrent writer).  Partial bootstrap is unobservable in the
walking-skeleton scope.  Adding full atomicity now would require changing the locked
`WalBackend` interface — Graham's territory.

**Phase 1 resolution needed (GAP-2 in history.md):**
Option A — Expose `flush()` on the `WalBackend` interface; `bootstrap()` sets
`batchSize=N`, stages all N rows via `commitRow()`, then calls `flush()`.
Option B — Add `commitBootstrapBatch(rows)` to `WalBackend` as a purpose-built atomic
batch primitive.
Option A is lower friction (one interface method, reuses existing group-commit machinery).

---

### Decision 2 — `createLedger()` return type widened to `BootstrappableLedger`

**Situation:** Graham (T3) assembles the SkeletonSession and needs to call `.bootstrap(rows)`
on the ledger returned by `createLedger()`.  The `Ledger` interface (locked in `ledger.ts`)
does not have `bootstrap()`.

**Decision:** Exported `BootstrappableLedger extends Ledger` from `ledger-impl.ts` (NOT
from `ledger.ts`) and widened `createLedger()`'s return type to `Promise<BootstrappableLedger>`.

**Rationale:** Covariant return type — all existing code typed as `Ledger` continues to work
without changes.  `ledger.ts` is not touched.  Graham imports `BootstrappableLedger` and
`createLedger` by direct path from `../ledger/ledger-impl.js`.  The locked `CreateLedger`
type alias in `ledger.ts` is still satisfied because `BootstrappableLedger extends Ledger`.

**Watch:** if `CreateLedger` is used as a function type somewhere that the compiler checks,
the widened return type is fine (covariant in return position).

---

### Decision 3 — `flags.bootstrap` NOT set (GAP-1, Phase 1)

**Situation:** §3.8 specifies that every row in the bootstrap batch should have
`flags.bootstrap = true` in the WAL segment record header.  `PrimitiveInput` has no
`flags` field; `materializeRow()` always writes `flags.bootstrap = false`.

**Decision:** Bootstrap rows are committed with `flags.bootstrap = false` in Phase 0.5.
Aperture projection for the session-origin panel (which filters on this bit) is Phase 1.

**Phase 1 resolution needed (GAP-1 in history.md):**
Option A — Add `walFlags?: Partial<SegmentRecordFlags>` to `PrimitiveInput` (or to a new
`BootstrapPrimitiveInput` subtype).  `LedgerImpl.bootstrap()` passes `walFlags.bootstrap=true`
through to `commitRow()` which threads it into `materializeRow()`.
Option B — Add a separate `commitBootstrapRow(input, hookResult)` to `WalBackend` that
hardcodes `flags.bootstrap=true` internally.

T1 (Graham) should pick one before Phase 1 Aperture work lands.

---

### How this interacts with `seal-and-split`

Bootstrap rows use verdict=COMMIT (hookVerdict 0xFF), so they never trigger `sealAndSplit`.
The `seal-and-split` path (PAUSE verdict) is only entered by rows that go through the hook
bus, which bootstrap bypasses.  No interaction hazard.

---

### Signal to Valanice (T5 CLI) — replay factory signature

`ReplayEngine` interface (in `types.ts`) does not carry a `rootDir`.  The concrete factory
is:

```ts
import { createReplayEngine } from '../skeleton/replay-engine.js';
const engine = createReplayEngine(rootDir);   // rootDir = same root as your WAL backend
const report = await engine.replay(sessionId);
// SK-5: assert report.status === 'pass' && report.rowsReplayed === expectedCount
```

Do NOT construct a ReplayEngine via the interface directly — use `createReplayEngine`.
The `rootDir` must match the `rootDir` passed to `FileSystemWalBackend.create()`.

---

## Laura: Skeleton Tests — Testing Decisions

**Date:** 2026-06-16T23:00:15-07:00
**Author:** Laura (Tester)
**Slice:** Crucible S3 Phase 0.5 Walking Skeleton (T6-RED)
**Status:** PROPOSED — impl agents should review AMBIG-1 through AMBIG-4

---

### Decision 1: A2 oracle exported from acceptance test file

**Choice:** Export `stripWallClockDerived()`, `normalizeTimestamps()`, and `assertA2ByteEquivalent()` from `skeleton-vertical.test.ts` rather than creating a separate oracle helper module.

**Rationale:** The oracle helpers are small (< 30 lines), co-located with their spec derivation (§11.6/§11.8), and the conformance runner can import them directly. Adding a separate `oracle.ts` helper file would require updating the skeleton barrel (`index.ts`) and create a merge-contention surface with T2/T5. Co-location is simpler for Phase 0.5; if the oracle grows (full CBOR-canonical comparison per §3), promote it to a standalone file then.

**Affected parties:** ci:conformance replay runner (must import from test file path, not a package entrypoint). If the conformance runner cannot import from test files, this decision must be revisited.

---

### Decision 2: FifoScheduler unit tests are GREEN-from-day-one (not RED)

**Observation:** T3 (Gabriel) already landed `skeleton/fifo-scheduler.ts` on branch before Laura's T6-RED task ran. All 12 A-Sched-1 unit tests pass immediately.

**Decision:** Accept GREEN FifoScheduler tests. The RED requirement in T6 referred to "implementations T2–T5 don't exist yet"; T3 simply landed concurrently. The unit tests correctly document A-Sched-1 invariants and serve as the conformance gate for A-Sched-1.

---

### Decision 3: Assembly factory path is `skeleton/assembly.js`

**Choice:** The acceptance test imports `createSkeletonSession` from `../../skeleton/assembly.js`.

**Rationale:** The `skeleton/index.ts` barrel currently exports only types (`export type { ... }`). Adding a value export (`createSkeletonSession`) to `index.ts` would require the orchestration agent to modify that barrel, creating a merge-contention surface with T2/T3/T4 agents who may also need to add exports. An `assembly.ts` module is a clean, owner-isolated entrypoint.

**Constraint for T5 (orchestration):** Must create `packages/crucible-core/src/skeleton/assembly.ts` and export `createSkeletonSession` from it. Factory signature assumed:

```ts
export function createSkeletonSession(opts: {
  provider: SdkProvider;
  materializer?: BootstrapMaterializer;
  scheduler?: SchedulerPort;
  replayEngine?: ReplayEngine;
}): SkeletonSession
```

If T5 uses a different signature, update the call site in `skeleton-vertical.test.ts`.

---

### Open ambiguities (for impl agents to resolve)

| ID | Question | Owner |
|----|----------|-------|
| AMBIG-1 | `createSkeletonSession()` exact factory signature | T5 (orchestration) |
| AMBIG-2 | Does `SkeletonSession` need a `queryRows()` seam for SK-2/SK-3 row-kind assertions? | T2 (Roger) / T5 |
| AMBIG-3 | Exact bootstrap row count from StubSdkProvider (1 tool def + 0 memory = 2 rows?) | T2 (Roger) |
| AMBIG-4 | A2 wallClockMs ratio check: deferred until real session latency data exists | T2 (Roger) |

---

## CLI UX Decisions — Skeleton Verbs (S3 Phase 0.5)

**Author:** Valanice (UX / Human Factors)  
**Date:** 2026-06-16  
**Slice:** Crucible S3 Phase 0.5, CLI shell lane T5  
**Status:** DECISION — shipped in `squad/crucible-s3-skeleton`

---

### Decision A — `status` Output Format: Labeled Fields, Not Bare Values

**Context:** `crucible status` needs to surface session ID, row count, and last commit offset. Options were: (a) single-line condensed format (e.g., `sess_abc · 4 rows · offset 3`), (b) labeled multi-line block, (c) JSON.

**Decision:** Labeled multi-line block with a divider, human-text default.

```
Session Status
────────────────────────────────────────────
  Session ID  : fdd89e75-...
  Row count   : 4
  Last offset : 3
────────────────────────────────────────────
```

**Rationale:** The tired/distracted engineer persona (§13.5) scans top-to-bottom, not left-to-right. Labeled fields remove the need to count tokens. `Last offset` is the "freshness number" — the single value that tells you how far the session has progressed. The divider scopes the output block so it doesn't bleed into surrounding shell noise. Single-line condensed format fails accessibility for new users who don't yet know the field ordering; JSON is machine-first and adds overhead for the human use case.

---

### Decision B — `replay` Output Format: Verdict First, Details Below

**Context:** `crucible replay` can pass or fail. The human question is always "did it pass?" before "why did it fail?".

**Decision:** Verdict line is the first output, hardcoded top-left.

```
✓ REPLAY PASS          (pass case)
✗ REPLAY FAIL          (fail case — followed by divergence details)
```

**Rationale:** The ✓/✗ glyph is colour-independent (works in monochrome CI logs and terminals with no colour support), pipe-safe, and grep-able. Placing it first means a glancing scroll never misses the verdict. On failure, divergence offset and kind are promoted into the same block — not a separate `DETAILS:` section — because hiding them requires a second scan, which the tired human won't do.
Line-oriented output, no animations or spinners, per §13.2.

---

### Decision C — Programmatic-Shell Pattern for Command Handlers

**Context:** The command handlers could be (a) thin wrappers that only print to stdout, (b) functions that also return raw data, or (c) class-based.

**Decision:** Each handler (`runStatusCommand`, `runReplayCommand`) accepts a `SkeletonSession`, calls the relevant method, renders to stdout AND returns the raw result struct.

**Rationale:** Tests can call the function directly and assert on the returned value without parsing stdout. This avoids brittle string-matching in tests while preserving human-readable output as a side effect. The render functions (`renderStatus`, `renderReplay`) are separately exported for pure unit tests with no I/O.

---

### Gap Flag — Session-Reopen (Phase 1, Roger/Graham)

`createSkeletonSession()` creates only FRESH sessions. There is no Phase 0.5 API to open an existing session by ID for a separate process invocation. The CLI verbs currently require a live session object. Phase 1 must add `openSkeletonSession(sessionId, rootDir)` or equivalent catalog lookup to support the canonical `crucible status <sid>` usage pattern from a separate shell invocation.

### Gap Flag — `exports` Map in `crucible-core/package.json` (Phase 1, Graham)

`@akubly/crucible-core/skeleton` is not a valid subpath export (no `exports` field in package.json). The CLI works around this by importing from the compiled dist path (`@akubly/crucible-core/dist/skeleton/index.js`). This is brittle and couples the CLI to the build output layout. Phase 1 should add a proper `exports` map to `crucible-core/package.json` exposing `./skeleton` as a named subpath.
