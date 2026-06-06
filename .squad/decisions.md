### 2026-05-30: WI-A Implementation Log — Issue #11 (Roger history restoration)

From .squad/decisions/inbox/roger-issue-11-implementation.md (WI-A history, cross-referenced)

**Cloud Review Cycles 1-5 completed** — Worktree-aware session resolution now in place. Schema version 16. Partial UNIQUE indexes for NULL-workdir case. All 1405 tests green. Ready for WI-B (coordinator dispatch).



---

## 2026-05-30: Squad Convention — Agent history.md Commits in Feature PRs Are In-Scope

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 1 Skeptic review (F3 flagged as scope creep)  
**Decision:** Agent-maintained history.md entries in feature PRs are **IN-SCOPE**, not scope creep.

**Rationale:**
The `.gitattributes` file defines `merge=union` driver (line 3) specifically to enable parallel agent history tracking within feature branches. This is an intentional design pattern, not incidental coupling.

When `.gitattributes:3` declares `*.md merge=union`, it is explicitly authorizing commits that append to history files during feature development. Rejecting such commits as "scope creep" contradicts the declared merge strategy.

**Citation:** `.gitattributes:3` — "\\*.md merge=union"

**Scope boundary:** Agent history commits are IN-SCOPE when:
- They document agent work on the feature (not tangential or admin work)
- They follow the squad history.md format (one-liner, topic tag, date, agent)
- They do not alter code or test artifacts

Example in-scope entry:
```
- 2026-05-30 📌 alexander: JSON.parse boundary guarding via ProfileStalenessReason import
```

**Future:** If history bloat becomes a problem (file ≥15360 bytes), summarization rules apply (per Task 6). This is a hygiene gate, not a scope gate.

---

## 2026-05-30: Path A for Internal Helpers — Unexport and Shrink Test Surface

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 2, C2-3 polish  
**Decision:** When an `@internal` JSDoc tag cannot be enforced (no api-extractor or stripInternal pass), prefer unexporting the helper and shrinking the unit test surface over maintaining a false-promise export.

**Rationale:**
The helper `normalizeProfileSource(payload: unknown)` was introduced in Cycle 1 to centralize JSON.parse payload narrowing. Tagged `@internal`, it was still exported for unit testing. This creates a false API promise — users can import and call it despite the intent to keep it internal.

Options:
- **(a) Unexport + shrink tests (chosen)** — Move coverage to integration tests. Helper becomes truly internal (scoped to module).
- **(b) Keep export + hope no one uses it** — Relies on convention; creates API risk.
- **(c) Use namespace/private pattern** — Language-specific; TypeScript has no true private exports.

**Choice:** Path A. The @internal tag already signals intent. Unexporting honors that intent and forces coverage dependency on integration tests (which are stronger anyway — they validate the full narrowing + validation flow, not the helper in isolation).

**Applied to:** `normalizeProfileSource()` in PR #32. Reduced unit test count from 28→26; integration tests retain coverage.

**Implication:** Team preference: explicit enforcement (unexport) > convention-based promises (@internal tag).

---

## 2026-05-30: JSON.parse Boundary Discipline — Unknown Typing + Runtime Validation + Drift Guard

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 1 F1 (Correctness) + Cycle 2 C2-1/C2-2 (verification)  
**Decision:** When narrowing types that flow from `JSON.parse(eventLogPayload)`, enforce a three-tier boundary discipline:

### Tier 1: Type the payload as `unknown`
```typescript
const payload: unknown = JSON.parse(eventLogPayload);
```
Do NOT type it as `any` or the target type. This forces explicit narrowing.

### Tier 2: Validate at the boundary
Implement a helper (e.g., `normalizeProfileSource()`) that:
- Takes `unknown` input
- Validates shape (e.g., `if (typeof payload.source !== 'string')`)
- Returns the narrowed type or throws/returns null

Emit a **stderr warning** if coercion occurs (matching the pattern from `loadMetrics` in the codebase):
```typescript
if (payload.source && !VALID_PROFILE_SOURCES.includes(payload.source)) {
  console.warn(`[LoadedProfileSource] Coerced unexpected source: ${payload.source}`);
}
```

### Tier 3: Drift-guard the union
When the upstream union (e.g., `ProfileStalenessReason | 'FRESH' | 'STALE'`) grows, catch missing branches at compile time using a `satisfies` pattern:
```typescript
const driftGuard: Record<LoadedProfileSource | ProfileStalenessReason, true> = {
  'FRESH': true,
  'STALE': true,
  'UNKNOWN': true,
};
```
If a new reason is added and this helper is not updated, TypeScript will fail on the guard object (RED test).

**Citation:** Cycle 1 F1 raised that `JSON.parse` cast to `UnionType` was unguarded. Cycle 2 C2-1/C2-2 verified the drift-guard pattern resolves it.

**Impact:** Ensures JSON.parse payloads cannot silently accept malformed data or diverge from enum reality.

---

## 2026-05-30: PowerShell Here-String Convention — Use Single-Quoted @'...'@ for Code Content

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, PR body rendering issues (2 occurrences)  
**Decision:** When building multi-line file content in PowerShell that contains backticks (markdown code spans, `` `tsc ``, `` `null ``), use single-quoted here-strings `@'...'@` instead of double-quoted `@"..."@`.

**Rationale:**
PowerShell interprets escape sequences in double-quoted strings:
- `` `t `` → TAB character
- `` `n `` → newline
- `` `r `` → carriage return

Single-quoted here-strings treat backquotes literally.

**Problem encountered (2 instances):**
1. PR body description: `` `tsc `` became TAB + "sc", `` `n `` (in code block) became newline, eating the next line
2. Earlier in session: GraphQL multiline field values mangled the same way

**Pattern:**
```powershell
# ❌ WRONG — backticks interpreted
$content = @"
Run: `tsc --noEmit`
Type:
  - A (old)
  - B (new)
"@

# ✅ CORRECT — backticks literal
$content = @'
Run: `tsc --noEmit`
Type:
  - A (old)
  - B (new)
'@
```

**Applied to:** PR #32 body re-render in alexander-5. Prevents escape-sequence garble in future multiline content.

---

## 2026-05-30: Forge Roadmap Priority — Dogfood-First (Aaron Directive)

**Date:** 2026-05-30T23:55:00-07:00  
**Author:** Aaron Kubly (via Copilot)  
**Status:** ADOPTED

### What (1) — Eureka pace

"Let's not pull too hard on Eureka yet, it's still in the works." Defer aggressive forge → Eureka integration moves (the C2-1/C2-2/C2-3 Eureka-internal items Graham proposed) until Eureka stabilizes further. Forge can continue without depending on Eureka.

### What (2) — Next priority for forge

Packaging + installability + dogfooding is now priority #1. Forge's Phase 4.6 surface is implemented; the next move is getting it into a state where Aaron (and the team) can install + run it locally on real work to generate signal.

### What (3) — Compelling-but-deferred for forge

GP-tournament selection (Phase 5 §2.4) and Meta-optimization (DBOM on prescriber decisions, §3.5) are noted as compelling future moves, but explicitly *behind* packaging/dogfooding. They're soft-designed today and benefit from real dogfood signal before contract is nailed.

### Why

User direction on roadmap sequencing. Dogfooding-first reflects the principle that real usage signal beats further design speculation, and the deferred Eureka work prevents thrashing on a moving target.

### Implications

- **M0 (Alexander):** forge-mcp registration in plugin + copilot configs (shipped 2026-05-31 as PR #36, b22c8e7)
- **M1 (Roger):** Hint consumption MCP tools (cairn MCP expand recall hints → decision hints)
- **M2 (Gabriel):** Bash hooks + README (install forge-mcp, shell init integration)
- **Deferred:** Eureka FactStore adapter, forge→Eureka integration wiring (until Eureka v1 stabilizes)

---

## 2026-05-30: Forge Next Load-Bearing Move — SQLite FactStore Adapter (Graham Decision)

**Date:** 2026-05-30  
**Author:** Graham (Architect)  
**Status:** PROPOSED FOR FUTURE DISPATCH (deferred by Aaron dogfood priority)

### Context

Eureka v1 (`ef06238`, 2026-05-30) landed `recall` with a composite ranker and injectable `FactStore`/`ClockProvider` seams. The `FactStore` interface is well-defined (`search({ query, sessionId, limit, minTrust }): Promise<RecallResult[]>`), but no SQLite-backed implementation exists.

Forge's prescriber (`ForgePrescriberOrchestrator`) currently accepts an optional `ChangeVectorProvider` for historical context (statistical summaries). Eureka's `recall` would provide episodic context (trust-scored, recency-weighted facts) — complementary, not duplicative.

### Decision

**The next load-bearing move for forge is building the Eureka SQLite FactStore adapter.** Without it, `recall` is unreachable in production and the forge→Eureka integration loop cannot be validated.

**Sequence (when Eureka stabilizes):**
1. **Eureka SQLite FactStore adapter** — `packages/eureka/src/adapters/sqlite-fact-store.ts`, implements `FactStore.search()` against Eureka's SQLite DB. M, Edgar or Roger. This is Eureka's M5 milestone deliverable.
2. **Wire `recall` into `ForgePrescriberOrchestrator`** — add optional `factStore?: FactStore` alongside existing `provider?: ChangeVectorProvider`. Fail-open (recall failure → prescribe without episodic context). S-M, Alexander. Forge imports `FactStore` type from `@akubly/eureka` only (no impl coupling).
3. **`trustFloor` RecallOptions override** — small plumbing in `packages/eureka/src/activities/recall.ts`; seam already supports `minTrust` at FactStore boundary, just needs wiring. S, any agent.

### What to defer

- Eureka `commit` activity (v1.5+) — don't design before FactStore + recall wiring is proven.
- Issue #17 async-IO sweep implementation — Alexander's T3 closed the W5-5 gaps; issue should be closed, not implemented. `better-sqlite3` sync model is acceptable for single-user local tool.

### Risk

Schema lock-in for FactStore SQLite backing: trust/importance/attentionTier storage must be durable. Any migration later breaks cognitive memory. Design the schema defensively (nullable fields, enum TEXT columns with normalizeX guards matching the `normalizeProfileSource` pattern from PR #32).

### Current Status

Deferred per Aaron's dogfood-first priority (2026-05-30). Will be picked up after M0/M1/M2 complete and Eureka v1 stabilizes.

---

## 2026-05-31: Cycle-2 Latent Lint Bug Pattern — Windows `npm run lint` Glob Failure

**Date:** 2026-05-31  
**Author:** Alexander (via Scribe, Issue #37)  
**Status:** ROOT CAUSE IDENTIFIED; WORKAROUND DOCUMENTED; PERMANENT FIX TRACKED

### What

`npm run lint` fails on Windows with silent no-match (eslint glob `packages/*/src/` matches nothing via PowerShell glob expansion). Agents pushing code from Windows worktrees don't catch lint errors; Linux CI flags them post-merge. Example: commit 85d49b8 (PR #36 turn alexander-8) discovered unused-variable error during CI run, not local development.

### Root Cause

ESLint glob expansion via Node.js child_process on Windows uses native PowerShell glob rules (not sh glob rules). The pattern `packages/*/src/` expands to zero matches because PowerShell treats `*` literally when no files match at the top level. On Linux (`sh`), the glob expands correctly.

### Workaround

**UNTIL ISSUE #37 IS FIXED:** Agents modifying any package must use:
```bash
npm run lint --workspace=<package-name>
```

Examples:
```bash
npm run lint --workspace=forge
npm run lint --workspace=eureka
npm run lint --workspace=cairn
```

This bypasses the glob entirely and runs eslint directly on the package's source tree.

### Permanent Fix

**Tracked in Issue #37 (squad:gabriel):** Rewrite ESLint glob pattern or use a different linting approach:
- Option A: Use `packages/{cairn,forge,eureka,types}/**/*.ts` (explicit list)
- Option B: Run linter per-package in parallel (robust to glob expansion issues)
- Option C: Use ESLint's built-in workspace support (v8+)

### Team Discipline

Until fixed, Scribe will flag any `npm run lint` (bare, not `--workspace=...`) runs in orchestration logs as **ANTI-PATTERN** and agents are expected to use the per-package form.

### Follow-Up

Add CI check to detect `npm run lint` (bare) in agent logs and fail CI with helpful error message pointing to Issue #37 + workaround.

```

**Applied to:** PR #32 body re-render in alexander-5. Prevents escape-sequence garble in future multiline content.


### 2026-06-01: Crucible Sprint 0 — First GREEN Cycle (Roger)

# Roger: Crucible First GREEN — Decision Inbox

**Date:** 2026-06-01  
**Author:** Roger (Platform Dev)  
**Status:** GREEN confirmed — acceptance test passing

---

## 1. Packages Scaffolded

### `packages/crucible-core/`
New package `@akubly/crucible-core` v0.1.0.

Files created:
- `package.json` — name `@akubly/crucible-core`, type module, `main/types` → `dist/`, scripts: build/test/typecheck/clean, deps: `@akubly/types: *`, devDeps: `@types/node ^25.5.0`, `vitest ^3`
- `tsconfig.json` — mirrors crucible-cli: ES2022, Node16 module, composite, strict, references `../types`
- `README.md` — one paragraph description
- `vitest.config.ts` — standard node environment, `include: ['src/**/*.test.ts']`
- `src/types.ts` — types-only module (no runtime code)
- `src/session.ts` — createSession + fork implementation
- `src/index.ts` — barrel re-export

### `packages/crucible-cli/` (modified)
- `src/index.ts` — now re-exports `{ createSession, fork }` from `@akubly/crucible-core`
- `package.json` — added `"@akubly/crucible-core": "*"` to dependencies
- `tsconfig.json` — added `{ "path": "../crucible-core" }` to references

### Root `tsconfig.json`
Added references: `packages/crucible-core` and `packages/crucible-cli`.

---

## 2. Public Types and Functions — Shapes

```ts
// §6 five-kind vocabulary
type PrimitiveKind = 'request' | 'artifact' | 'observation' | 'decision' | 'question';

interface PrimitiveInput {
  primitiveKind: PrimitiveKind;
  primitivePayload: unknown;
  causalReadSet: string[];
}

// Committed primitive — PrimitiveInput + logical offset
interface Primitive extends PrimitiveInput {
  offset: number;
}

interface SessionMetadata {
  parentSessionId: string | null;
  forkPointEventId: number | null;
  createdAt: number;
}

interface Session {
  id: string;
  metadata: SessionMetadata;
  append(p: PrimitiveInput): Promise<void>;
  query(opts: { range: [number, number] }): Promise<Primitive[]>;
}

function createSession(): Promise<Session>;
function fork(parentId: string, opts: { atOffset: number }): Promise<Session>;
```

---

## 3. Range Convention: Inclusive-Inclusive

**Decision:** `query({ range: [a, b] })` is **inclusive on both ends**:  
- `[0, 46]` returns 47 primitives (offsets 0, 1, …, 46)  
- `[0, 23]` returns 24 primitives  

**Evidence from test:** `query({ range: [0, 46] })` → `toHaveLength(47)` → 47 = 46 − 0 + 1 ✓

---

## 4. In-Memory Parent-Registry Approach

A module-level `Map<string, Primitive[]>` holds each session's **own events**:

- **Root sessions:** own events are the complete event log; offset = array index.
- **Child (forked) sessions:** own events contain only primitives appended *after* the fork. Events at offset ≤ `forkPointEventId` are served by **delegating to the parent registry entry** — no physical copy.

**Rationale:** This satisfies A1 invariant 3 (child prefix equals parent prefix [0..23]) and invariant 4 (parent unmodified) without copying. The parent's `registry` entry remains untouched; the child's `query` reads from it transparently.

**Offset assignment for child append:**
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```

---

## 5. GREEN Confirmation

```
> @akubly/crucible-cli@0.1.0 test
> vitest run

 RUN  v3.2.4 D:/git/harness/packages/crucible-cli

 ✓ src/__tests__/acceptance/session-fork.test.ts (1 test) 3ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  23:22:14
   Duration  436ms (transform 71ms, setup 0ms, collect 73ms, tests 3ms, environment 0ms, prepare 148ms)
```

**Invariants confirmed GREEN:**
- A1-1: `childSession.metadata.parentSessionId === parentSession.id` ✓
- A1-2: `childSession.metadata.forkPointEventId === 23` ✓
- A1-3: `childPrefix.toEqual(parentPrefix)` for range [0,23] ✓
- A1-4: `parentEventsAfter.toHaveLength(47)` for range [0,46] ✓

---

## 6. Deferred: Ledger Abstraction

No `Ledger` class, no `WAL` interface, no Cairn integration in this turn. This is the **GREEN phase only** — simplest correct implementation behind the acceptance API. The REFACTOR step (next TDD cycle) is where a Ledger collaborator abstraction would be introduced, followed by the London-school descent to introduce an L1 mock layer. Deferred per Graham's sprint plan (OQ-2).

---

# Decision Drop: Crucible REFACTOR Cycle — SessionManager Unit Tests (RED)

**Author:** Laura (Tester)  
**Date:** 2026-06-01  
**Beat:** REFACTOR cycle RED — SessionManager unit tests with mocked DB collaborator  
**Status:** RED — 4 tests failing (`TypeError: SessionManager is not a constructor`)

---

## What Landed

**File:** `packages/crucible-core/src/__tests__/unit/session-manager.test.ts`

4 unit tests authored per §4.1 Refactor 2, London-school style with a mocked `DB` collaborator:

| # | Test name | Invariant locked |
|---|---|---|
| 1 | `Unit: SessionManager.forkSession() rejects fork beyond parent ledger size` | Fork offset > parent ledger size throws with message matching `/exceeds parent ledger size 47/` |
| 2 | `Unit: SessionManager.forkSession() rejects negative fork offset` | Fork offset < 0 throws with message matching `/non-negative\|negative/` |
| 3 | `Unit: SessionManager.forkSession() child session inherits transitive dependency graph from parent` | `DB.insertSession` called with full `pluginVersions` map (transitive graph intact) |
| 4 | `Unit: SessionManager.forkSession() child fork lineage records parentSessionId and forkPointEventId` | `DB.insertSession` called with `{ parentSessionId: 'parent-id', forkPointEventId: 23 }` |

---

## MockDB Shape Locked

```typescript
type MockDB = {
  getSession:    ReturnType<typeof vi.fn>;  // → { id, ledgerSize, pluginVersions? }
  insertSession: ReturnType<typeof vi.fn>;  // ← { id, parentSessionId, forkPointEventId, pluginVersions, createdAt }
  queryEvents:   ReturnType<typeof vi.fn>;  // reserved — not yet called in these scenarios
};
```

`mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47, pluginVersions?: {...} })`  
`mockDB.insertSession.mockResolvedValue('child-id')` — for success-path tests.

**`queryEvents` is present on the shape** so negative-path tests can assert it was NOT called (validation fails before any event query).

---

## RED Confirmation

```
TypeError: SessionManager is not a constructor
  ❯ src/__tests__/unit/session-manager.test.ts:77:23
  ❯ src/__tests__/unit/session-manager.test.ts:96:23
  ❯ src/__tests__/unit/session-manager.test.ts:120:23
  ❯ src/__tests__/unit/session-manager.test.ts:144:23

Test Files  1 failed (1)
     Tests  4 failed (4)
```

`SessionManager` imported from `../../index.js` — not yet exported from Roger's in-memory sprint 0 implementation. Correct RED signal.

---

## Proactive Edge Case (Test #2)

Test #2 (`rejects negative fork offset`) is not in §4.1 verbatim — it is a proactive extension of the `ForkLineage` invariant ("Fork point must be non-negative"). The regex `/non-negative|negative/` gives Roger phrasing freedom. This is Laura's charter: edge cases aren't optional.

---

## Next Steps

### Immediate — Roger (REFACTOR)

Roger's REFACTOR cycle must:

1. **Extract `SessionManager` class** from the module-level functions in `session.ts`.
   - Constructor signature: `new SessionManager(db: DB)` where `DB` matches the mockDB shape above.
   - `forkSession(parentId: string, forkOffset: number): Promise<string>` — returns child session ID string.

2. **Implement validation** in `forkSession`:
   - Call `db.getSession(parentId)` → get `{ ledgerSize }`.
   - If `forkOffset < 0` → throw with message matching `/non-negative|negative/`.
   - If `forkOffset > ledgerSize` → throw with message matching `/exceeds parent ledger size <N>/`.

3. **Implement happy path** in `forkSession`:
   - Generate a new child UUID.
   - Call `db.insertSession({ id, parentSessionId, forkPointEventId, pluginVersions, createdAt })`.
   - Return child `id`.

4. **Export `SessionManager`** from `packages/crucible-core/src/index.ts`.

5. **Keep acceptance test GREEN**: `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` (1 test) must remain passing. Roger's in-memory `fork` function can coexist or be internalized into `SessionManager`.

### Follow-up — Laura (§4.1 Refactor 3 + §7 Mock Drift)

- **Integration test**: `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts` — real SQLite DB (`:memory:`), verify schema correctness and ledger prefix semantics.
- **Mock Drift Defense (§7)**: Extract `makeMockDB()` from inline to `packages/crucible-core/src/__tests__/fixtures/mock-db-builder.ts` once Roger's `DB` interface is formally typed.

---

## Acceptance Test Guard

The existing acceptance test **must remain GREEN** after Roger's REFACTOR:

```
packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts (1 test) ✅
```

Roger's refactor must not change the public `fork` / `createSession` API surface.

---

# Decision: Crucible Sprint 0 — REFACTOR Phase: SessionManager + ForkLineage

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-01  
**Sprint:** 0 — REFACTOR cycle (§4.1 Refactor 1 + 2)  
**Status:** COMPLETE — both test layers GREEN

---

## What was done

### Refactor 1: ForkLineage value object extracted

**File:** `packages/crucible-core/src/ledger/fork-lineage.ts`

Extracted a `ForkLineage` value object that encapsulates fork ancestry invariants:

- Constructor `(parentSessionId: string | null, forkPointEventId: number)` — typed `string | null` (not just `string`) so `ForkLineage.root()` can produce a valid sentinel without a non-null assertion.
- Throws `"Fork point must be non-negative"` when `forkPointEventId < 0`.
- `static root()` — returns `new ForkLineage(null, 0)`, sentinel for root sessions.
- `isRoot(): boolean` — returns `parentSessionId === null`.

The `string | null` deviation from the strategy snippet's `string` type is intentional and documented with a comment in the file: the strategy snippet declares `parentSessionId: string` but `root()` passes `null`, so we accept both.

---

### Refactor 2: SessionManager class + DB interface introduced

**Files:**
- `packages/crucible-core/src/db.ts` — `DB` interface
- `packages/crucible-core/src/session-manager.ts` — `SessionManager` class

#### DB interface (locked shape — must match Laura's mockDB)

```ts
export interface DB {
  getSession(
    id: string,
  ): Promise<{ id: string; ledgerSize: number; pluginVersions?: Record<string, string> } | null>;

  insertSession(session: {
    id: string;
    parentSessionId: string | null;
    forkPointEventId: number | null;
    pluginVersions?: Record<string, string>;
    createdAt: number;
  }): Promise<void>;

  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
```

#### SessionManager.forkSession() validation order

1. `db.getSession(parentId)` → throw `"Parent session {id} not found"` if null.
2. `forkOffset > parent.ledgerSize` → throw `"Fork point {n} exceeds parent ledger size {m}"`.
3. `new ForkLineage(parentId, forkOffset)` → throws `"Fork point must be non-negative"` if negative.
4. `db.insertSession(...)` — forwards `parent.pluginVersions` verbatim (transitive dep graph).
5. Returns `crypto.randomUUID()` child id.

---

### Refactor 2b: In-memory DB adapter (`createInMemoryDB`)

**File:** `packages/crucible-core/src/in-memory-db.ts`

Created `createInMemoryDB(): InMemoryDB` factory that backs the Sprint 0 in-memory state. `InMemoryDB` extends `DB` with internal helpers (`insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`) used only by `session.ts` composition layer — not visible to `SessionManager`.

`ledgerSize` computation:
- Root sessions: `ownEvents.length`
- Child sessions: `forkPointEventId + 1 + ownEvents.length`

---

### Backward compatibility: session.ts wired to singleton adapter

`session.ts` was refactored to:
- Create a module-level `db = createInMemoryDB()` + `manager = new SessionManager(db)`.
- `createSession()` calls `db.insertRootSession()` directly (no DB interface; root sessions don't go through SessionManager).
- `fork()` calls `manager.forkSession()` for all invariant checks + DB insert, then builds the `Session` object using `db.getMetadata()` + `db.getOwnEvents()`.
- `buildSession()` uses `db.pushEvent()` / `db.getOwnEvents()` instead of the old module-level `registry` Map.

The old `registry` Map is gone; the in-memory DB owns all state.

---

### Barrel update

`packages/crucible-core/src/index.ts` now exports:
- `createSession`, `fork` (unchanged public surface)
- `SessionManager` (class)
- `DB` (interface — type-only)
- `ForkLineage` (class)
- `createInMemoryDB` (factory)
- `InMemoryDB` (interface — type-only)
- Existing types (`PrimitiveKind`, `PrimitiveInput`, `Primitive`, `SessionMetadata`, `Session`)

---

## Test results

### Unit tests (Laura's file — verified GREEN)

```
✓ src/__tests__/unit/session-manager.test.ts (4 tests)
  ✓ Unit: SessionManager.forkSession() rejects fork beyond parent ledger size
  ✓ Unit: SessionManager.forkSession() rejects negative fork offset
  ✓ Unit: SessionManager.forkSession() child session inherits transitive dependency graph from parent
  ✓ Unit: SessionManager.forkSession() child fork lineage records parentSessionId and forkPointEventId
Test Files 1 passed (1)
Tests 4 passed (4)
```

### Acceptance tests (no regression)

```
✓ src/__tests__/acceptance/session-fork.test.ts (1 test)
  ✓ Acceptance: Fork session creates child with inherited ledger prefix [parentId, forkOffset, childLineage]
Test Files 1 passed (1)
Tests 1 passed (1)
```

### Full monorepo build

`npm run build` — exit 0, no TypeScript errors.

---

## Decisions and tradeoffs

| Decision | Choice | Rationale |
|---|---|---|
| `ForkLineage.parentSessionId` type | `string \| null` | `root()` requires null; typed string in strategy snippet but null is the correct sentinel value |
| Validation order in forkSession | getSession → ledgerSize check → ForkLineage (negative) | Matches spec; negative check last because ForkLineage is constructed after parent lookup |
| InMemoryDB internal helpers | `InMemoryDB extends DB` interface | Clean separation: DB interface is the mock contract; internal helpers only exist in the concrete adapter |
| `createSession` bypasses SessionManager | Yes — calls `db.insertRootSession` directly | SessionManager.forkSession is the only operation requiring invariant validation; root sessions need no parent lookup |

---

## Deferred

- **Refactor 3: Real SQLite integration stub** — `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts` + `createTestDatabase()`. Not this turn.
- **Shared-fixture mockDB builder** — `packages/crucible-core/src/__tests__/fixtures/mock-db-builder.ts` (§7 Mock Drift Defense). Not this turn; mockDB is inline in Laura's test file per her note.
- **`SessionManager.createSession()`** — not introduced; root session creation stays in `session.ts` for now. Move to SessionManager when the integration stub lands.


---

# Decision: Crucible Sprint 0 Topic Branch Recovery

**Date:** 2026-06-01T23:58:20Z  
**Author:** Gabriel (Infrastructure)  
**Upstream Context:** Scribe committed 3 meta-files directly to main while Crucible code work remained uncommitted in the working tree.

## What Happened

Scribe's session consolidation produced:
- **3 meta-commits on main:** b19b683, 193a441, 7cfe8ad (archived decisions, merged inbox, consolidated session logs)
- **Uncommitted code:** packages/crucible-cli, packages/crucible-core, london-tdd-* skills, updated workspace refs

This left main 3 commits ahead of origin/main with unreviewed code still in the working tree.

## Resolution

**Created topic branch:** `squad/crucible-sprint-0-walkthrough-a`

**Committed work on topic branch:**
- **Commit 92a8c2e** — `feat(crucible): Sprint 0 Walkthrough A — RED test + GREEN impl + REFACTOR (SessionManager/ForkLineage)`
  - Staged: packages/crucible-cli, packages/crucible-core, tsconfig.json (workspace refs), package-lock.json
  - Result: 19 files added, 758 insertions
  
- **Commit 01afeb6** — `docs(squad): London-school TDD skills from Crucible Sprint 0`
  - Staged: .squad/skills/london-tdd-first-green, london-tdd-first-red-test, london-tdd-layer-descent, london-tdd-refactor-extract-collaborator
  - Result: 5 files added, 605 insertions

**Reset main:** `git reset --hard origin/main` (HEAD now at c8d7bc7, no commits ahead)

**Final state:**
- Branch `squad/crucible-sprint-0-walkthrough-a`: 5 commits ahead of origin/main (3 Scribe meta + 2 new code)
- Branch `main`: Clean, back at origin/main (c8d7bc7)
- Working tree: Empty (all WIP committed)

## Artifacts Updated

- `.gitignore`: Added patterns `.squad/health-report-*/` and `.squad/scribe-health-report-*/` to exclude Scribe scratch files
- `.squad/agents/gabriel/history.md`: Documented the topic-branch recovery pattern under Learnings

## Test Results

- `npm test --workspace=@akubly/crucible-cli`: ✓ 1 passed
- `npm test --workspace=@akubly/crucible-core`: ✓ 4 passed

## Next Steps

Topic branch is ready for review-cycle skill execution.

---

# Graham — Cycle 1 Persona Review Fixes

**Date:** 2026-06-02T23:43:43-07:00
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Triggered by:** Cycle 1 persona review findings (I4, I2, M1)

---

## I4: ForkLineage.root() — Chosen Option (a): Remove (YAGNI)

**Alternatives considered:**
- **(a) Remove root() entirely** — zero callers, eliminates inconsistency.
- **(b) Widen constructor to (string | null, number | null)** — makes root() type-correct but ripples into guard clause and isRoot() logic.

**Decision:** Option (a).

**Rationale:** `root()` has zero callers and produces a sentinel (`forkPointEventId = 0`) that conflicts with the `session.ts` convention (`forkPointEventId === null` marks roots). Option (b) would require changing the constructor guard (`forkPointEventId < 0` doesn't handle `null`), updating `isRoot()` to also check `forkPointEventId === null`, and reasoning about whether `ForkLineage(null, null)` is a meaningful state distinct from `ForkLineage(null, 0)`. All that complexity for zero callers. YAGNI — re-introduce when a caller exists and the null semantics are settled.

**Files changed:** `packages/crucible-core/src/ledger/fork-lineage.ts`

---

## I2: InMemoryDB Coupling Documentation

**Placement:** File-header JSDoc in `session.ts`, lines 15–19 (after Sprint 0 deferral note, before `const db = createInMemoryDB()`). Chosen to avoid merge conflicts with Roger's concurrent imports/runtime changes.

**Wording:** 5-line NOTE block naming the four extended methods (getOwnEvents, getMetadata, insertRootSession, pushEvent) and framing the Refactor 3 decision point.

**Files changed:** `packages/crucible-core/src/session.ts` (comment only, no runtime change)

---

## M1: SKILL Doc Drift — Chosen Option (b): Annotate as Sprint 0 Variant

**Alternatives considered:**
- **(a) Update strategy doc** to match Sprint 0's simpler approach — risky, strategy doc is canonical for all sprints.
- **(b) Annotate SKILL as Sprint 0 variant** — lighter, preserves strategy doc as the canonical reference.

**Decision:** Option (b).

**Rationale:** `docs/crucible-tdd-strategy.md` §4.1 shows the full London-school outside-in GREEN with mocked Ledger at each layer. That's the correct general approach. Sprint 0's simpler GREEN (real in-memory, no mocks) was a conscious scope reduction because the acceptance surface fits in a single module. Annotating the SKILL preserves the strategy doc's authority while making the divergence explicit and explaining when the full approach applies.

**Files changed:** `.squad/skills/london-tdd-first-green/SKILL.md`

---

## Build & Test Status

- **Build:** ✅ `npm run build` passes (tsc --build clean)
- **crucible-core tests:** 3 passed, 3 failed (pre-existing — error message wording mismatch in session-manager.test.ts, Laura's domain)
- **crucible-cli tests:** 1 failed (pre-existing — same root cause, not introduced by these changes)

---

# Cycle 2 Advisory Close-Out — Graham

**Date:** 2026-06-05T10:54:00Z
**Context:** Persona-review Cycle 2 surfaced 3 advisory (NEW) findings on Crucible Sprint 0 Walkthrough A.

## Triage Outcomes

| ID | Category | Disposition | Reasoning |
|----|----------|-------------|-----------|
| N3 | Skeptic, minor | **ACCEPT** | Doc/behavior drift — fork() JSDoc said `≤` but enforcement is strict `<`. Active lie; fixed in-place. |
| N1 | Craft, minor | **ACCEPT** | Barrel export lacked test-only marker. One-line comment added; trivial, good hygiene. |
| N2 | Craft, minor | **DEFER** | `clear()` on InMemoryDB interface obligates future impls to test-only method. Interface is internal-only with one impl. Revisit at Refactor 3 (SQLite adapter). |

## Files Changed

- `packages/crucible-core/src/session.ts` — N3: `≤` → `<` in fork() JSDoc (line 100)
- `packages/crucible-core/src/index.ts` — N1: Split `resetInMemoryDb` export with test-only comment

## Commit

`fix(crucible): Cycle 2 advisory polish — N3 docstring + N1 barrel marker`

---

# Laura — Cycle 1 Test Updates

**Date:** 2026-06-02  
**Author:** Laura (Tester)  
**Sprint:** Crucible Sprint 0 — Cycle 1 Persona Review  
**Branch:** squad/crucible-sprint-0-walkthrough-a



---

# M8 Slice A — FactReader Contract Audit

**Author:** Laura (Tester)
**Date:** 2026-06-01
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**Status:** COMPLETE — audit filed, CL-4 tightened, edge test file committed

---

## Purpose

Audit CL-1 through CL-5 in `fact-reader.contract.test.ts` for SQLite-semantic
completeness before Roger's `SqliteFactReader` impl is declared done. SQLite
introduces real serialization/deserialization (NaN→NULL, WAL on-disk state,
shared DB file for all sessions) that the in-memory impl trivially sidesteps.
Each invariant below states whether it survives SQLite semantics unchanged, and
if not, what was tightened.

---

## CL-1 — Happy Path: seeded fact is readable

**Verdict: SURVIVES UNCHANGED.**

The test seeds `trust=0.5` and asserts `{trust: 0.5}`. SQLite's `REAL` column
stores IEEE 754 doubles; `0.5` is exactly representable and round-trips without
rounding error. The SQL query `WHERE fact_id = ? AND session_id = ?` maps
directly to the M8 schema's columns. No SQLite-specific failure mode here. The
test will exercise the full INSERT→SELECT cycle once Roger's harness `seed`
writes via raw SQL (or an internal method) and `reader.read()` queries the DB.

---

## CL-2 — Missing fact returns null (not undefined)

**Verdict: SURVIVES UNCHANGED.**

The test reads a factId that was never seeded and asserts `expect(result).toBeNull()`.
For SQLite, a `SELECT` that matches zero rows returns no rows; the impl maps that
to `null`. Vitest's `toBeNull()` is strict — it rejects `undefined`. The test
will catch both "returns undefined" and "throws on miss" bugs. No special
handling needed.

---

## CL-3 — Session isolation: wrong-session reads return null

**Verdict: SURVIVES UNCHANGED — and is a STRONGER validator for SQLite than for InMemory.**

The in-memory impl uses a `Map<factId, FactRecord[]>` scoped per-process; an
off-by-one on session filtering is contained in the JS heap. For SQLite, both
sessionA and sessionB share a **single DB file**. The `UNIQUE(fact_id,
session_id)` constraint means `(factA, sessionA)` and `(factA, sessionB)` are
distinct rows — but a SQL query that omits `AND session_id = ?` from the WHERE
clause would silently return sessionA's row when sessionB asks for the same
factId. CL-3 catches exactly that bug: seed under sessionA, read under sessionB
→ must be null. This invariant is load-bearing for SQLite correctness and
already covers the cross-session DB-sharing scenario without modification.

---

## CL-4 — NaN passthrough (trust corruption round-trip)

**Verdict: TIGHTENED. Comment strengthened; test title updated.**

**Finding:** CL-4 was silent on whether the harness `seed` function must write
to the backing store before `read` is called. The test name was `"returns
{trust: NaN} for a NaN-seeded fact — read layer does NOT validate"` — framed as
a validation policy test, not a persistence test. For the in-memory impl, seed
and read are both JS-heap operations and there is no serialization gap. For
SQLite, this is the critical failure mode: SQLite has no NaN literal and stores
`NULL` for NaN; `read` must re-hydrate `NULL → NaN`. A naive SQLite harness that
caches the seed value in memory (bypassing the INSERT) would pass the old CL-4
while allowing a real NULL-handling bug to ship silently.

**Before:**

```
// CL-4 — Trust passthrough: corrupt value (NaN)
//
// Seed a fact with trust=NaN → read must return {trust: NaN}.
// The read layer is NOT responsible for validating trust; that is the
// caller's job (applyFeedbackById throws InvalidTrustValueError(source:'storage')).
// Silently clamping or filtering at read time would hide storage corruption.

it('CL-4: returns {trust: NaN} for a NaN-seeded fact — read layer does NOT validate', ...)
```

**After:**

```
// CL-4 — Trust passthrough: corrupt value (NaN)
//
// Seed a fact with trust=NaN → read must return {trust: NaN}.
// The read layer is NOT responsible for validating trust; that is the
// caller's job (applyFeedbackById throws InvalidTrustValueError(source:'storage')).
// Silently clamping or filtering at read time would hide storage corruption.
//
// Storage round-trip requirement: the harness `seed` function MUST write
// NaN to the backing store before `read` is called — not cache it in memory.
// For SQLite implementations, NaN has no native literal and is stored as NULL;
// `read` must re-hydrate NULL → NaN. This test is the primary regression lock
// for that NaN→NULL→NaN conversion path. A seed implementation that bypasses
// the backing store (e.g., caches in-memory) would let a silent conversion
// bug slip through.

it('CL-4: NaN trust round-trips through the storage write/read cycle — read layer does NOT validate', ...)
```

The assertion (`expect(Number.isNaN(result!.trust)).toBe(true)`) is already
correct and catches both `null` and `0` returns. The change is to the comment
and test name, which are now explicit contracts on `seed` semantics. The deeper
NaN-through-disk regression lock lives in `DB-CL-1` (edges file).

---

## CL-5 — Result shape: numeric trust field

**Verdict: SURVIVES UNCHANGED.**

The test seeds `trust=0.75` and asserts `typeof result!.trust === 'number'`.
SQLite's `REAL` column comes back as a JS `number` via `better-sqlite3`. Note:
if CL-4's NULL→NaN path were broken (returning `null`), `typeof null` is
`'object'`, which would also fail CL-5 — but CL-4 fires first and is the
correct catch-point. No change needed to CL-5.

---

## Summary Table

| Invariant | SQLite verdict | Action |
|-----------|---------------|--------|
| CL-1 | Survives unchanged | None |
| CL-2 | Survives unchanged | None |
| CL-3 | Survives unchanged (stronger validator) | None |
| CL-4 | **Tightened** | Comment + title updated to require seed→store before read |
| CL-5 | Survives unchanged | None |

**4 of 5 invariants survive audit unchanged. 1 tightened (CL-4).**

---

## Rejection Trigger

If Roger's `SqliteFactReader` ships with a `seed` function that caches NaN
in memory rather than writing NULL to the DB, CL-4 will pass (false green) but
DB-CL-1 will FAIL on the close/reopen cycle. That constitutes a contract
violation. Reviewer protocol: REJECT Roger's PR and route the fix to a
**different agent** (not Roger). Proposed: Crispin (owns the InMemory reference
impl and understands the passthrough contract).

---

## Related files

- `packages/eureka/src/storage/__tests__/fact-reader.contract.test.ts` — CL-4 tightened (this audit)
- `packages/eureka/src/storage/__tests__/fact-reader-sqlite-edges.test.ts` — DB-CL-1 through DB-CL-5 (companion)


---

# Laura — M8 Slice A Cycle-2 Audit

**Author:** Laura (Tester)
**Date:** 2026-06-02
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** #43
**Verdict:** ✅ **ACCEPT**

---

## Summary

Applied three categories of test improvements per Cycle 1 persona-review findings. All changes are confined to the two test files; no source was modified.

---

## New Tests Added (B1 Boundary)

**File:** `packages/crucible-core/src/__tests__/unit/session-manager.test.ts`

### `Unit: SessionManager rejects forkOffset equal to parent ledger size`
- `mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47 })`
- Expects `forkSession('parent-id', 47)` to reject.
- Regex: `/exceeds parent ledger size 47|must be (less than|< parent ledger size)|>= ?47/i`
- Verifies that the off-by-one boundary (equal-to, not just greater-than) is rejected.

### `Unit: SessionManager rejects fork on empty parent at offset 0`
- `mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 0 })`
- Expects `forkSession('parent-id', 0)` to reject.
- Regex: `/exceeds parent ledger size 0|must be (less than|< parent ledger size)|>= ?0/i`
- Exercises the edge case where the parent has no events at all.

**Contracts locked with Roger:** These tests went GREEN because Roger landed his `>=` bounds-check fix and updated the error message to "must be < parent ledger size N" before this cycle completed. Regexes updated to cover both old "exceeds" and new "must be <" phrasings.

---

## Reset-Hook Pattern Adopted (I1)

**File:** `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`

Added:
```typescript
import { beforeEach } from 'vitest';
import { resetInMemoryDb } from '@akubly/crucible-core';

beforeEach(() => {
  // Reset the module-level in-memory DB so each test starts from a clean slate.
  resetInMemoryDb();
});
```

**Rationale:** The current single acceptance test passes regardless (no prior state). This establishes the isolation discipline so the next acceptance test added does not inherit DB state from this one. The `resetInMemoryDb` function is exported by Roger's parallel work from `@akubly/crucible-core`.

---

## M4 Fix — beforeEach Mock Ordering

**File:** `packages/crucible-core/src/__tests__/unit/session-manager.test.ts` (lines ~60–63)

**Before:**
```typescript
beforeEach(() => {
  mockDB = makeMockDB();
  vi.resetAllMocks();
});
```

**After:**
```typescript
beforeEach(() => {
  // Reset first so vi.fn() instances created by makeMockDB() start pristine.
  vi.resetAllMocks();
  mockDB = makeMockDB();
});
```

**Rationale:** The old order reset `vi.fn()` instances immediately after creating them — a no-op today (no module-level mocks) but confusing and semantically wrong. The correct pattern is: clear all mock state first, then construct fresh mocks on the clean slate. Added comment explains the ordering intent for future contributors.

---

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `@akubly/crucible-core` | 6 (4 existing + 2 new B1) | ✅ All GREEN |
| `@akubly/crucible-cli` | 1 | ✅ GREEN |

---

# Roger — Cycle 1 Fix Decisions

**Date:** 2026-06-02T23:43:43-07:00
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Author:** Roger (Platform Dev)

---

## B1 — Off-by-one in forkSession bounds check

**File:** `packages/crucible-core/src/session-manager.ts:23`

**Change:** `forkOffset > parent.ledgerSize` → `forkOffset >= parent.ledgerSize`

**Rationale:** `forkPointEventId` is the inclusive last-included offset. With `ledgerSize=N`, valid fork offsets are `0..N-1`. The old `>` guard allowed `forkOffset===ledgerSize` (phantom slot past end) and allowed `fork(0)` on an empty parent (`ledgerSize=0`). The `>=` guard closes both cases. Error message updated to "must be < parent ledger size" to match the new semantics precisely.

---

## I1 — Singleton DB reset seam

**Files:** `packages/crucible-core/src/in-memory-db.ts`, `session.ts`, `index.ts`

**Contract:** `resetInMemoryDb()` exported from `@akubly/crucible-core` public surface. Zero args, void return. Clears all session state in the module-level singleton. After call, `createSession()` starts blank.

**Implementation:** Added `clear(): void` to `InMemoryDB` interface; implemented as `store.clear()` in the factory closure. Added `export function resetInMemoryDb(): void { db.clear(); }` in `session.ts`; re-exported from `index.ts`. This is the simplest seam that lets Laura isolate tests without instantiating a private DB — she imports one function and the singleton is clean.

---

## I3 — pushEvent silent drop on missing session

**File:** `packages/crucible-core/src/in-memory-db.ts:78-80`

**Change:** Replaced optional-chain silent no-op with explicit guard + throw.

**Rationale:** Silent drops are a data-loss footgun — callers can't distinguish "event appended" from "session didn't exist and the append was silently discarded." Making the missing-session case throw surfaces bugs at the earliest possible point (the append call), not at query time or never. Consistent with the principle: fail loudly at the boundary, not silently at the consumer.

---

## M2 — SessionMetadata invariant JSDoc

**File:** `packages/crucible-core/src/types.ts`

**Change:** Expanded the `SessionMetadata` JSDoc to document the both-null / both-non-null invariant explicitly, and noted that a TypeScript discriminated union is deferred to ForkLineage.

---

## M3 — range:[a,b] tuple API shape

**Decision: Option B — keep tuple, add clarifying JSDoc.**

**Rationale:** Option A (rename to `{startOffset, endOffset}`) would cascade to the acceptance test and `session.ts` query implementation, pulling in surface-area changes that aren't load-bearing for Sprint 0 correctness. The tuple `[a, b]` is already documented as inclusive-inclusive; the Sprint 0 goal is behavioural correctness, not API polish. The JSDoc on `Session.query` now explicitly names the two positions (`startOffset`, `endOffset`, both inclusive) and notes that a named-field API is under consideration for a future sprint. This documents intent without committing to a migration timeline or creating merge friction with Laura's test edits.

**Future consideration:** A `{startOffset, endOffset, inclusiveEnd?: boolean}` shape would improve discoverability. Defer to post-Sprint-0 API review cycle.

---

## M5 — crypto.randomUUID() explicit import

**Files:** `packages/crucible-core/src/session-manager.ts`, `session.ts`

**Change:** Added `import { randomUUID } from 'node:crypto'` at top of each file; replaced `crypto.randomUUID()` with `randomUUID()`.

**Rationale:** Relying on the global `crypto` object is fragile — the global is available in modern Node.js (≥19) and browser environments but is not guaranteed in all test runners or older Node targets. The `node:crypto` named import is explicit, tree-shakeable, and makes the runtime dependency visible. No behaviour change; same UUID output.

All 9 mandatory checks pass. Roger's cycle-2 fixes are correct and no regressions were
introduced. Two new edge tests (DB-CL-6 and DB-CL-7/M3) were added and committed.
Test count increased from 84 → 86.

---

## Check Results

### 1. Test Count — ✅ PASS

```
Tests  86 passed (86)   [was 84; +2 new edge tests added by this audit]
Test Files  7 passed (7)
```

No regressions. All previous 84 tests remain green.

### 2. Subpath Export Smoke Test (I6) — ✅ PASS

- `packages/eureka/dist/sqlite/index.js` **exists** after `npm run build`.
- Smoke script at repo root (`tmp-smoke.mjs`, deleted after run) output:
  ```
  function function function
  ```
  All three exports (`SqliteFactReader`, `openDatabase`, `applyMigrations`) resolve as
  `function` from `@akubly/eureka/sqlite`.
- Root path `@akubly/eureka` does **NOT** export `SqliteFactReader` — Node.js ESM raises:
  ```
  SyntaxError: The requested module '@akubly/eureka' does not provide an export named 'SqliteFactReader'
  ```
  Type leak is confirmed gone from the public surface.
- **Note:** Smoke file had to be placed inside the repo root (`D:\git\mem\tmp-smoke.mjs`) rather
  than `D:\tmp-smoke.mjs` as specified; ESM resolution walks from file location and `D:\` has no
  workspace `node_modules`. File was deleted after successful run. This is a minor test-methodology
  note, not a product defect.

### 3. better-sqlite3 optionalDependencies (I6/M2) — ✅ PASS

`packages/eureka/package.json` confirms:

```json
"dependencies": {
  "@akubly/types": "*"
},
"optionalDependencies": {
  "better-sqlite3": "^12.8.0"
}
```

`better-sqlite3` is in `optionalDependencies`, NOT `dependencies`. ✅

### 4. I5 Migration Race Verification — ✅ PASS

**`src/db/schema.ts`:** Migration loop is wrapped in `db.transaction(() => { ... }).immediate()` —
this is the better-sqlite3 API for `BEGIN IMMEDIATE`. The `.immediate()` at the end is the function
CALL (equivalent to `txFn.immediate(args)`), not a method returning a new function. Verified by
the fact that DB-CL-3 (idempotence) passes: migrations DO run inside the IMMEDIATE transaction.

**`src/db/migrations/001-facts.ts`:** Confirmed `IF NOT EXISTS` on every DDL object:
- `CREATE TABLE IF NOT EXISTS facts`
- `CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts`
- `CREATE TRIGGER IF NOT EXISTS facts_ai`
- `CREATE TRIGGER IF NOT EXISTS facts_au`
- `CREATE TRIGGER IF NOT EXISTS facts_ad`
- `CREATE TABLE IF NOT EXISTS trust_history`

**DB-CL-3** idempotence test: ✅ still passes.

**DB-CL-6 (NEW):** Added `concurrent first-open race` test — two `Database` handles to the same
file, `applyMigrations(db1)` then `applyMigrations(db2)`. Verified: no error thrown, `schema_version`
has exactly one row with `version=1`. ✅ PASSES. Migration race fix is locked.

### 5. I4 WAL Fallback Verification — ✅ PASS

`src/db/openDatabase.ts` line 38–43:

```typescript
const walMode = db.pragma('journal_mode = WAL', { simple: true }) as string;
if (walMode !== 'wal') {
  process.stderr.write(
    `[eureka] WAL mode not available (got '${walMode}'); database opened in ${walMode} journal mode\n`,
  );
}
```

- Return value is captured in `walMode`. ✅
- Warn path uses `process.stderr.write(...)` — goes to **stderr**, not stdout. ✅
  (MCP stdio rule: diagnostic output must not pollute stdout.)

### 6. I1 busy_timeout — ✅ PASS

`src/db/openDatabase.ts` line 44:

```typescript
db.pragma('busy_timeout = 5000');
```

Present immediately after the WAL pragma. ✅

### 7. M3 Harness Seed (INSERT OR REPLACE) — ✅ PASS

`fact-reader.contract.test.ts` line 197:

```typescript
'INSERT OR REPLACE INTO facts (fact_id, session_id, trust) VALUES (?, ?, ?)',
```

Confirmed. Comment reads: `// INSERT OR REPLACE matches InMemoryFactReader's upsert seed semantics (M3).`

**DB-CL-7 (NEW):** Added seed-twice test — seeds same `(fact_id, session_id)` twice via
`INSERT OR REPLACE`; second call must NOT throw; last value wins. ✅ PASSES.

### 8. M4 Cleanup Wiring — ✅ PASS

`fact-reader.contract.test.ts` lines 46–47 / 75–77:

```typescript
cleanup?: () => void;  // FactReaderHarness interface

afterEach(() => {
  harness?.cleanup?.();
});
```

SQLite harness returns `cleanup: () => db.close()` (line 208). `afterEach` calls it. ✅
No handle leaks.

### 9. I2 Deferral Comment — ✅ PASS

`src/db/migrations/001-facts.ts` lines 15–16:

```sql
-- NOTE: trust nullable + NULL=NaN sentinel. Slice B will lock writer discipline;
-- see graham-m8-scope-proposal.md §5 Q1.
```

Comment is present adjacent to the `trust` column definition. ✅

---

## New Tests Added

| Test ID | File | Description |
|---------|------|-------------|
| DB-CL-6 | `fact-reader-sqlite-edges.test.ts` | Concurrent first-open race: two handles + applyMigrations twice → schema_version=1, no error |
| DB-CL-7 (M3) | `fact-reader-sqlite-edges.test.ts` | Seed-twice via INSERT OR REPLACE: must not throw, last value wins |

Both committed on this branch. Test count: **84 → 86**.

---

## Known Follow-Ups (Non-Blocking)

None opened this cycle. All cycle-1 findings that were in scope for cycle-2 are addressed.
I2 (trust nullable / NaN sentinel) remains deferred to Slice B per Aaron's disposition —
the comment in `001-facts.ts` is the tracking artifact.

---

## Verdict

✅ **ACCEPT** — PR #43 is ready to merge. All 9 checks pass. No blocking failures.
Two new regression-locking tests added (DB-CL-6, DB-CL-7). Baseline: **86/86 green**.


---

# Roger — M8 Slice A Cycle-2 Decision Drop

**Author:** Roger (Platform Dev)
**Date:** 2026-06-02
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** #43

---

## I6 — SQLite Subpath Structure

### Exports map (`packages/eureka/package.json`)

```json
"exports": {
  ".": "./dist/index.js",
  "./sqlite": "./dist/sqlite/index.js"
}
```

### File layout

| File | Status | Notes |
|------|--------|-------|
| `src/storage/fact-reader-sqlite.ts` | **Unchanged** | SQLite reader stays where it is |
| `src/db/openDatabase.ts` | **Updated** | Changed to `import type` + `createRequire` runtime guard |
| `src/db/schema.ts` | **Updated** | See I5 below |
| `src/sqlite/index.ts` | **New** | Subpath entry point; re-exports `SqliteFactReader`, `openDatabase`, `applyMigrations` |
| `src/storage/index.ts` | **Updated** | Removed `SqliteFactReader` export |

### `better-sqlite3` dependency

Moved from `dependencies` → `optionalDependencies`. `@types/better-sqlite3` already
was in `devDependencies`; no change needed there.

Runtime guard in `openDatabase.ts` uses `createRequire(import.meta.url)` (required for
ESM modules loading CJS native addons). If `better-sqlite3` is absent, throws:

```
[eureka] better-sqlite3 is not installed. SQLite storage requires this native
module. Install it with: npm install better-sqlite3
```

### TypeScript build

`src/sqlite/` is inside `src/` (covered by `"include": ["src"]` in `tsconfig.json`).
`dist/sqlite/index.js` and `dist/sqlite/index.d.ts` are emitted by the existing
`tsc` composite build. No tsconfig changes required.

---

## I5 — Migration Race Fix

### Strategy: BEGIN IMMEDIATE + IF NOT EXISTS

`applyMigrations` in `src/db/schema.ts`:
- `CREATE TABLE IF NOT EXISTS schema_version` runs **outside** the transaction (already idempotent)
- Version read + migration loop wrapped in `db.transaction(...).immediate()`
- Two simultaneous first-opens serialize on the IMMEDIATE lock; the loser
  reads `schema_version = 1` and finds no pending migrations

`src/db/migrations/001-facts.ts`:
- Added `IF NOT EXISTS` to `CREATE TABLE facts`, `CREATE VIRTUAL TABLE facts_fts`,
  and all three `CREATE TRIGGER` statements
- Defense-in-depth: a partially-applied migration on crash recovery does not
  error the second open
- DB-CL-3 idempotence test continues to pass (84/84 green)

---

## I2 — Trust Nullable / NaN Sentinel Deferral

Per Aaron's disposition: **DEFERRED to Slice B**. No schema change.

Added to `001-facts.ts` near the `trust` column:

```sql
-- NOTE: trust nullable + NULL=NaN sentinel. Slice B will lock writer discipline;
-- see graham-m8-scope-proposal.md §5 Q1.
```

---

## Deviations from Aaron's Dispositions

**None.** All accepted findings (I1, I4, I5, I6, I2, M1–M5) implemented as specified.
I3 and M6/M7 skipped per Aaron's instructions.

M2 (JSDoc fix) was applied in the same commit as I6 since both touched `openDatabase.ts`.
M1 + I2 comments were applied in the same commit as I5 since both touched `001-facts.ts`.


---

# Roger M8 Slice A Decision Drop

**Author:** Roger (Platform Dev)
**Date:** 2026-06-02
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**Status:** COMPLETE

---

## Decisions Made

### DB Path Default

`~/.eureka/eureka.db` — per Aaron's Q3 approval. Implementation:
`path.join(os.homedir(), '.eureka', 'eureka.db')` in `openDatabase.ts`.
Parent directory created with `fs.mkdirSync(..., { recursive: true })` at open-time.

### NaN Handling — Nullable Column (satisfies CL-4)

**Resolution: nullable column, `NULL ↔ NaN` mapping at the JS layer.**

The `trust` column in `facts` is declared `REAL` (nullable, no `NOT NULL`
constraint), deviating from Graham's sketch which shows `REAL NOT NULL DEFAULT 0.5`.

**Why:** CL-4 in the contract suite requires that a fact seeded with `NaN` trust
round-trips as `{trust: NaN}` on read. SQLite has no NaN literal — if the column
were `NOT NULL`, an INSERT of NaN would store `0.0` (IEEE 754 quiet NaN
coerced to 0 by SQLite's type rules). The only correct round-trip path is
`NULL ↔ NaN` as specified in Graham's §3 NaN handling note.

Mapping in `SqliteFactReader.read`: `row.trust === null ? NaN : row.trust`.
Mapping in test harness seed: `Number.isNaN(trust) ? null : trust`.

### Schema Deviations from Graham's §3 Sketch

| Column | Sketch | Actual | Reason |
|--------|--------|--------|--------|
| `trust` | `REAL NOT NULL DEFAULT 0.5` | `REAL` (nullable, no default) | CL-4 NaN round-trip requires NULL storage |

All other table definitions, triggers, and `trust_history` scaffold match the
§3 sketch verbatim.

`trust_history` is scaffolded but no code writes to it in Slice A, per Aaron's
Q1 approval. Writes come in Slice B.

---

## Test Count

74 → 79 (+5 SqliteFactReader contract tests via `runFactReaderContract`).


---

# Decision: M8 Slice B — Transaction wrapper choice + contract test relocation pattern

**Date:** 2026-06-05  
**Author:** Roger  
**Scope:** `@akubly/eureka` — SqliteTrustUpdater + runTrustUpdaterContract refactor

---

## Decision 1: BEGIN IMMEDIATE via `.immediate()` method

**Context:** `SqliteTrustUpdater.mutate` must be atomic per `(sessionId, factId)`. better-sqlite3 provides `db.transaction(fn)` (DEFERRED by default) and `.immediate(args)` to use `BEGIN IMMEDIATE`.

**Choice:** Use `rawTxn.immediate(args)` — the `.immediate()` method on the Transaction object returned by `db.transaction(fn)`.

**Rationale:**
- DEFERRED BEGIN can yield `SQLITE_BUSY_SNAPSHOT` if a concurrent writer upgrades between our SELECT and UPDATE.
- IMMEDIATE acquires the write lock at transaction start, serializing writers at the DB level.
- WAL mode is single-writer anyway; IMMEDIATE just makes the serialization point explicit and earlier.
- `busy_timeout=5000ms` (Slice A cycle-2 fix) handles the wait.
- No JS-layer promise chain needed — contrast with InMemoryTrustUpdater's per-key lock.

**Alternative considered:** Explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` via `db.prepare`. Rejected: more boilerplate, loses better-sqlite3's automatic rollback on throw, more surface for bugs.

---

## Decision 2: Contract suite relocation — tombstone pattern for vitest test files

**Context:** Moving `runTrustUpdaterContract` from `activities/__tests__/trust-updater-contract.test.ts` to `storage/__tests__/trust-updater.contract.test.ts` (symmetry with FactReader). The old file cannot be deleted from the repo, and vitest 3.x throws "No test suite found in file" for empty test files.

**Choice:** Replace old file content with a `describe + it.todo` tombstone. The todo shows as 1 skipped test and self-documents the move.

**Pattern (reusable for future suite relocations):**
```ts
import { describe, it } from 'vitest';
describe('XYZ contract suite — tombstone (suite moved)', () => {
  it.todo('suite moved to storage/__tests__/xyz.contract.test.ts');
});
```

**Anti-pattern to avoid:** Importing from the new test file for re-export. If a test file imports from another test file, vitest registers that file's top-level `describe`/`it` calls TWICE, causing test duplication. Do NOT use test files as re-export modules.

**Update 2026-06-05:** Tombstone removed in commit b9185de — the value of pointing future readers to the new location was deemed lower than the noise cost of a permanent `it.todo` skipped test in every run. `git log --follow` on `packages/eureka/src/storage/__tests__/trust-updater-contract.helper.ts` traces the move. The anti-pattern note above (no test-file re-exports) remains valid and was the actual learning.

---

## Decision 3: `TrustUpdaterHarness` shape extends `TrustUpdaterTestImpl` with optional cleanup

**Choice:** `TrustUpdaterHarness = { impl, setTrust, getTrust, cleanup? }` — matching `FactReaderHarness` optional-cleanup convention from Slice A.

**Rationale:** `cleanup` is optional so the InMemory harness needs no change (no native handles). SQLite harness registers `db.close()`. `afterEach(() => harness?.cleanup?.())` in `runTrustUpdaterContract` guarantees teardown even if a test throws — same pattern used in `runFactReaderContract`.

# M2 Design — forge-mcp bash hooks + install README

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-01
**Branch:** `squad/m2-forge-mcp-bash-hooks`

---

## Context

M2 ships bash shell init integration for forge-mcp so a user who clones the
repo can wire Cairn's session-start telemetry hook into their interactive bash
sessions. M0 (Alexander, PR #36) registered forge-mcp in the plugin and
`.copilot/mcp-config.json`. M1 (Roger, PR #40) added `list_optimization_hints`
and `resolve_optimization_hint`. M2 is pure infra: no MCP tool surface changes.

---

## Design Choices

### Hook script location — `.github/hooks/cairn/shell-init.sh`

**Options considered:**
- A. `.github/hooks/cairn/shell-init.sh` (parallel to curate.ps1 / record.ps1)
- B. `packages/skillsmith-runtime/scripts/shell-init.sh` (with the package)
- C. `bin` entry in skillsmith-runtime

**Chosen: A.** The existing PowerShell hooks (`curate.ps1`, `record.ps1`) live at
`.github/hooks/cairn/`. A bash counterpart belongs in the same directory. Users who
explore the hooks see all hook variants together. The package already has its own
concern (MCP server, sessionStart.ts); shell integration is a repo/infra concern.
The install script (`install.sh`) also lives here, completing the co-location pattern.

### Install mechanism — idempotent `~/.bashrc` append with marker block

The installer:
1. Checks `~/.bashrc` for the marker comment before appending (idempotent re-runs)
2. Appends a `source` line pointing to the absolute path of `shell-init.sh`
3. The marker is `# forge-mcp: shell init` — stable, unique, grep-safe

### Idempotency strategy — two-layer guard

Layer 1 (install script): grep for marker in `~/.bashrc` — skip if present.
Layer 2 (shell-init.sh): env var `_FORGE_MCP_SHELL_INIT_LOADED` — prevents
double-firing if the user sources the file multiple times in one session.

### Non-interactive safety

`shell-init.sh` opens with `[[ $- != *i* ]] && return` — a no-op in non-interactive
shells (scripts, CI, subshells). Safe to source unconditionally from `.bashrc`.

### sessionStart hook discovery order (mirrors curate.ps1)

1. User-deployed override: `~/.cairn/hook/sessionStart.mjs`
2. Global npm install: `npm root -g` → `@akubly/skillsmith-runtime/dist/hooks/sessionStart.js`
3. Repo checkout (sibling path from `.github/hooks/cairn/`):
   `$SCRIPT_DIR/../../../packages/skillsmith-runtime/dist/hooks/sessionStart.js`

The hook runs in the background (`node "$script" &>/dev/null &` + `disown`) so it
never blocks shell startup.

### Verification approach

A smoke test function `forge_mcp_check` is included in `shell-init.sh` and documented
in the README. It reports the discovered script path (or "not found") and the
installed version. Laura can run this after sourcing the file.

### Uninstall path

`uninstall.sh` (in the same directory) removes the marker block from `~/.bashrc`
using `sed` — no manual edits required. Idempotent: no-op if not installed.

### Zsh note

`shell-init.sh` uses `[[ ]]` and `function` syntax that works in zsh as well as
bash. Zsh compatibility is achievable by adding `source ~/.github/hooks/cairn/shell-init.sh`
to `~/.zshrc` in place of `~/.bashrc`. Documented in README as a brief note.

---

## Deliverables

| File | Purpose |
|------|---------|
| `.github/hooks/cairn/shell-init.sh` | Sourceable bash hook (session-start trigger) |
| `.github/hooks/cairn/install.sh` | Idempotent `~/.bashrc` wiring script |
| `.github/hooks/cairn/uninstall.sh` | Removes the `~/.bashrc` marker block cleanly |
| `README.md` (new section) | Copy-pasteable install guide |
| `.squad/skills/forge-mcp-shell-install/SKILL.md` | Reusable shell-install pattern |

No changes to forge-mcp's tool surface, MCP wiring, or any TypeScript source.

# M2 Shipped — forge-mcp Bash Shell Init Hooks

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-01
**PR:** #44
**Branch:** `squad/m2-forge-mcp-bash-hooks`
**Status:** PR OPEN — awaiting review/merge

---

## What Shipped

| Deliverable | File | Status |
|---|---|---|
| Bash hook script | `.github/hooks/cairn/shell-init.sh` | ✅ |
| Install script | `.github/hooks/cairn/install.sh` | ✅ |
| Uninstall script | `.github/hooks/cairn/uninstall.sh` | ✅ |
| README install section | `README.md` (new M2 section) | ✅ |
| Skill extraction | `.squad/skills/forge-mcp-shell-install/SKILL.md` | ✅ |
| Build clean | `npm run build` | ✅ |
| Tests clean | `npm test` — 49/49 | ✅ |

## Verification Recipe for Laura

```bash
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

# Decision Drop: M1 Cycle-1 Findings Fix Wave

**Author:** Roger (Platform Dev)  
**Date:** 2026-05-31T23:04:34-07:00  
**Branch:** squad/39-hint-mcp-tools  
**PR:** #40  
**Commit:** 4ca4542

---

## F1-A: migration 018 — resolution_disposition column

Added `resolution_disposition TEXT CHECK (resolution_disposition IN ('resolved', 'dismissed')) NULL` to `optimization_hints` via migration 018. Schema version is now 18. `resolveOptimizationHint` writes `status='rejected'`, `resolution_disposition`, and `resolution_note` in a single atomic UPDATE. Existing rows are NULL (no backfill — system-generated data, not user disposition).

`list_optimization_hints`, `get_optimization_hint`, and the resolve tool all surface `resolution_disposition`.

`ResolveHintResult` and `OptimizationHintRow` types both carry the new field.

---

## F2: already-resolved response shape

When `alreadyResolved=true`, `resolveOptimizationHint` now returns `resolution: null` (the caller's intent was not acted on) and includes `prior_status` (the hint's actual state). The MCP handler response carries both fields so LLM consumers can correctly interpret "idempotent no-op" vs "accepted disposition."

---

## F10: get_optimization_hint surface shape

New MCP tool `get_optimization_hint(hint_id)` returns:

```json
{
  "id": "...",
  "skill_id": "...",
  "source": "prompt-optimizer|token-optimizer",
  "category": "...",
  "description": "...",
  "recommendation": "...",
  "impact_score": 0.0,
  "confidence": 0.0,
  "confidence_level": "high|medium|emerging",
  "status": "pending|...",
  "auto_apply_eligible": null,
  "parent_prescription_id": null,
  "evidence": {},
  "metric_snapshot": {},
  "generated_at": "ISO8601",
  "applied_at": null,
  "created_at": "ISO8601",
  "resolution_disposition": "resolved|dismissed|null",
  "resolution_note": "string|null"
}
```

Symmetric with `get_prescription`. Returns 404-style `{ error: "Hint '...' not found." }` when the id is unknown.

---

## Handler-layer testability pattern

Handler bodies extracted into exported pure functions:
- `buildListHintsResult(db, { status?, skill_id?, limit })`
- `buildResolveHintResult(db, { hint_id, resolution, note? })`
- `buildGetHintResult(db, { hint_id })`

Returns the raw JSON payload (not the MCP content wrapper). MCP handler calls the function and wraps in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tests import directly from `server.ts` — safe because `if (isScript)` guard prevents server start on import.

---

## Test counts

- Before M1: 708
- After M1 (initial): 708
- After M1 cycle-1 fixes: **717** (9 new tests: 3 migration-018 schema, 3 handler `buildListHintsResult`, 3 `buildResolveHintResult`, 3 `buildGetHintResult` — grouped into 3 describe blocks × 3 tests each)

---

## New commit SHAs

- `4ca4542` — fix(cairn): M1 cycle-1 findings — migration 018, get_optimization_hint, F1-F13
- `016f346` — Scribe: Merge M1 hint MCP decision (pre-existing, preserved)

---

## Other finding resolutions (summary)

| Finding | Resolution |
|---------|-----------|
| F3 handler tests | buildList/buildResolve/buildGet extracted + 9 tests |
| F4 dedupe status enum | HINT_STATUSES exported from optimizationHints.ts; VALID_HINT_STATUSES deleted |
| F5 terminal-state derivation | STATUS_TRANSITIONS length check replaces hardcoded array |
| F6 active_count semantics | Omitted when status filter present; comment explains |
| F7 migration silent no-op | process.stderr warning in both 017 + 018 |
| F8 note size cap | .max(1000) on note Zod field |
| F9 generic error messages | 'Internal error querying/resolving/reading hint' + stderr log |
| F11 event payload | emitHintTransitionEvent forwards resolution_disposition, resolution_note, source:'mcp' |
| F12 ?? null | resolution_note + resolution_disposition use ?? null |
| F13 .max(256) | hint_id + skill_id Zod fields |

# Decision Drop: M1 Cycle-2 Polish Wave

**Author:** Roger  
**Date:** 2026-05-31T23:50:00-07:00  
**Branch:** `squad/39-hint-mcp-tools`  
**PR:** #40  
**Commit:** c5ffead

---

## Findings addressed (N1–N6)

### N1 (Medium) — Collapse migrations 017+018

**Done.** `017-hint-resolution-note.ts` now adds BOTH `resolution_note TEXT NULL` and `resolution_disposition TEXT CHECK(...)` in a single migration. Migration 018 file deleted. `schema.ts` updated (removed 018 import + array entry). Schema version stays at 17. All 4 test files with version assertions reverted from 18 → 17. `hintMcp.test.ts` migration schema section consolidated from two `describe` blocks into one that asserts both columns.

Idempotency: each column gets its own `if (!cols.some(...))` check instead of a single early-return, so the migration is safe to re-run against a DB that only has one of the two columns.

### N2 (Medium) — HINT_RESOLUTION_STATUSES dedup

**Done.** Exported `HINT_RESOLUTIONS = ['resolved', 'dismissed'] as const` from `optimizationHints.ts`. `HintResolution` type now derives from it: `typeof HINT_RESOLUTIONS[number]`. `server.ts` imports `HINT_RESOLUTIONS` and uses `z.enum(HINT_RESOLUTIONS)`. Local `HINT_RESOLUTION_STATUSES` constant removed.

### N3 (Minor) — Shared serializer to prevent list/get drift

**Done.** Extracted private `buildHintSummary(h)` helper in `server.ts` (above the exported builder functions). `buildListHintsResult` uses `hints.map(buildHintSummary)`. `buildGetHintResult` spreads `buildHintSummary(h)` and adds full-detail fields: `confidence`, `description`, `auto_apply_eligible`, `parent_prescription_id`, `evidence`, `metric_snapshot`, `generated_at`, `applied_at`.

Location: `packages/cairn/src/mcp/server.ts` — private `buildHintSummary()` ~40 lines above `buildListHintsResult`.

### N4 (Medium) — Follow-up issue for forge consumer

**Filed.** GitHub issue **#42**: "M3 follow-up: Wire forge prescriber to consume hint_state_transition resolution_disposition"  
URL: https://github.com/akubly/stunning-adventure/issues/42  
Label: `squad`

### N5 (Low) — Remove vacuous type cast

**Done.** `effectiveStatuses` in `buildListHintsResult` simplified from the `HintStatus[] | HintStatus | undefined` cast to `params.status ?? [...ACTIVE_HINT_STATUSES]`. TypeScript infers the correct union type; no explicit cast needed.

### N6 (Low) — Document confidence_level vs confidence asymmetry

**Done.** Chose option (a). One-line JSDoc on `buildHintSummary` documents that raw confidence float is omitted from the summary; callers should use `get_optimization_hint` for the float value.

---

## New commit SHAs

| SHA | Description |
|-----|-------------|
| `c5ffead` | cairn: cycle-2 polish wave — N1-N6 (issue #39) |

Prior HEAD: `4d9d607`

---

## Test counts

| | Count |
|---|---|
| Before (cycle-1 baseline) | 717 |
| After (cycle-2 polish) | **716** |

Net -1: merged the two migration schema `it()` tests (one for 017, one for 018) into a single combined test for migration 017.

---

## Build/test status

- `npm run build --workspace=@akubly/cairn`: ✅ green (tsc, no errors)
- `npm test --workspace=@akubly/cairn`: ✅ 716/716 passing

---

## Files changed

- `packages/cairn/src/db/migrations/017-hint-resolution-note.ts` — expanded to add both columns
- `packages/cairn/src/db/migrations/018-hint-resolution-disposition.ts` — **deleted**
- `packages/cairn/src/db/schema.ts` — removed 018 import + array entry
- `packages/cairn/src/db/optimizationHints.ts` — added `HINT_RESOLUTIONS` export
- `packages/cairn/src/mcp/server.ts` — N2/N3/N5/N6 changes
- `packages/cairn/src/__tests__/hintMcp.test.ts` — consolidated migration schema tests
- `packages/cairn/src/__tests__/db.test.ts` — version 18 → 17
- `packages/cairn/src/__tests__/discovery.test.ts` — version 18 → 17
- `packages/cairn/src/__tests__/migration012.test.ts` — version 18 → 17 (2 assertions)
- `packages/cairn/src/__tests__/prescriptions.test.ts` — version 18 → 17

# Decision: PR #45 CI Build Fix — gabriel-pr45-ci-build-fix

**Date:** 2026-06-05T21:47:54.600-07:00
**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**PR:** #45

---

## Situation

CI workflow (`.github/workflows/ci.yml`, node 20+22 matrix, `npm ci` + `tsc --build`) was failing with:
```
packages/crucible-core/src/session-manager.ts(1,28): error TS2591: Cannot find name 'node:crypto'.
packages/crucible-core/src/session.ts(1,28): error TS2591: ... (same)
```
Squad CI (npm test) was passing; only the clean `tsc --build` failed.

---

## Reproduction Result: Case C

Local repro via `npm ci` + `npx tsc --build --force` did **NOT** reproduce the error. `@types/node` was present at root (`node_modules/@types/node/package.json` = True) and tsc exited 0.

**Root cause (inferred):** CI runners have no incremental `.tsbuildinfo` cache. In some CI environments, TypeScript's auto-type-inclusion of `@types/node` is non-deterministic without an explicit `types` field — especially in monorepos with project references where each package compiles in isolation. The local environment benefits from a pre-existing cache that masks the resolution gap.

---

## Fix Applied

Added `"types": ["node"]` to `packages/crucible-core/tsconfig.json` compilerOptions:

```json
"compilerOptions": {
  ...
  "resolveJsonModule": true,
  "types": ["node"]
}
```

**Rationale:**
- Explicit `types` field is conventional, harmless, and eliminates any TS auto-type-inclusion ambiguity.
- `crucible-cli` was not modified — it has no `node:` protocol imports in non-test source.
- Lockfile was not regenerated (`npm install` reported "up to date" — lockfile was already correct).

---

## Verification Results

| Check | Result |
|---|---|
| `npx tsc --build --force` | ✅ exit 0, no errors |
| `npm run build` | ✅ exit 0 |
| `npm test --workspace=@akubly/crucible-core` | ✅ 6/6 tests pass |
| `npm test --workspace=@akubly/crucible-cli` | ✅ 1/1 tests pass |

---

## Commit & Push

- **Commit:** `e5c1dde` — `fix(crucible): make @types/node explicit for crucible-core CI clean build`
- **Push:** `d273077..e5c1dde` → `squad/crucible-sprint-0-walkthrough-a`
- **New HEAD SHA:** `e5c1dde07e40f812cd2303cd7c7459a478fd65af`

---

## CI Run Status (post-push)

```json
{"databaseId":27053273442,"headSha":"e5c1dde...","status":"in_progress","workflowName":"CI"}
{"databaseId":27053273441,"headSha":"e5c1dde...","conclusion":"success","workflowName":"Squad CI"}
```

- Squad CI already green on new HEAD.
- CI workflow in progress on new HEAD (previous run on `d273077` was `failure`).
- PR #45 state: `mergeable: MERGEABLE`, `mergeStateStatus: UNSTABLE` (expected while CI runs).

---

## Key Lesson

Incremental `tsc --build` (with cached `.tsbuildinfo`) masks clean-build type-resolution failures. Always reproduce CI failures with `npm ci` + `tsc --build --force`. If local still passes (Case C), apply explicit `"types": ["node"]` as belt-and-suspenders — don't require local repro before fixing.


---

# Decision: PR #45 Gitignore Cleanup + Topic-Branch SKILL Typo Fix

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-05
**Branch:** squad/crucible-sprint-0-walkthrough-a
**PR:** #45

---

## Files Removed from Tracking

Three files were committed by Scribe's REFACTOR-cycle meta-commit (`7cfe8ad`) despite residing under gitignored paths (`.gitignore:50-51`). They were untracked via `git rm --cached`:

| File | Gitignore rule |
|------|---------------|
| `.squad/orchestration-log/20260602-064301-laura.md` | `.gitignore:50` (`.squad/orchestration-log/`) |
| `.squad/orchestration-log/20260602-064301-roger.md` | `.gitignore:50` (`.squad/orchestration-log/`) |
| `.squad/log/20260602-064301-crucible-walkthrough-a-refactor.md` | `.gitignore:51` (`.squad/log/`) |

All three verified via `git check-ignore -v` after removal — each matched by the correct ignore rule.

**Files NOT removed:** All other files under those directories pre-date this branch (exist on origin/main already) and were left untouched per task scope.

---

## Typo Fix

**File:** `.squad/skills/topic-branch-from-dirty-main/SKILL.md` line 12  
**Before:** `.squad/ decision archives` (stray space after `/`)  
**After:** `.squad/decision archives`  

---

## Commits

- Gitignore cleanup incorporated into `a27cdf2` (concurrent commit on branch)
- Typo fix committed as `f2606f3` — `fix(squad): untrack gitignored runtime logs + topic-branch SKILL typo`

---

## Test Verification

- `@akubly/crucible-core`: 6/6 ✅
- `@akubly/crucible-cli`: 1/1 ✅


---

# Decision Drop: PR #45 Merge Resolution (squad/crucible-sprint-0-walkthrough-a ← origin/main)

**Agent:** Gabriel (Infrastructure)
**Date:** 2026-06-05T21:47:54.600-07:00
**Branch:** squad/crucible-sprint-0-walkthrough-a
**PR:** #45 (Crucible Sprint 0 Walkthrough A)

---

## What Conflicted

`origin/main` had advanced with three merged PRs since our branch forked from `c8d7bc7`:
- **#41** — Eureka M7: typed errors + narrowing tests + regression locks + atomicity contract
- **#40** — M1: Add list_optimization_hints + resolve_optimization_hint MCP tools
- **#43** — M8 Slice A: SqliteFactReader + Eureka migrations

Two conflicts arose during `git merge origin/main`:

| File | Conflict Type | Resolution |
|---|---|---|
| `package-lock.json` | Both sides added packages (main: Eureka/Cairn deps; ours: crucible-cli/crucible-core workspaces) | Regenerated via `npm install` (took main's lockfile as base, let npm union in crucible workspaces) |
| `.squad/agents/crispin/history.md` | Modify/delete (main deleted it; HEAD modified it) | Kept HEAD (union semantics — keep both sides' work) |

All `.squad/` append-only files (decisions.md, agent histories, archives) auto-resolved via the `merge=union` driver configured in `.gitattributes` — no manual intervention needed.

## Pre-Merge Fix: .gitignore

`.squad/health-report-2026-06-05T10-58-29Z.md` was untracked (Scribe scratch). Investigation revealed the existing `.gitignore` had `.squad/health-report-*/` **with a trailing slash** — this only matches directories, not files. The Scribe health reports are files. Fixed by removing the trailing slash: `.squad/health-report-*`. Committed separately before the merge (`83158bb`) because a staged change to `.gitignore` would have blocked `git merge`.

## Build Results

- `npm run build` — **PASS** (tsc --build, all workspaces, exit 0, no errors)

## Test Results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

## Push Result

```
To https://github.com/akubly/stunning-adventure
   bf2bc4a..bb1d84b  HEAD -> squad/crucible-sprint-0-walkthrough-a
```

Commits pushed: `83158bb` (gitignore fix), `bb1d84b` (merge commit).

## Final PR Mergeable State

```json
{"mergeStateStatus":"UNSTABLE","mergeable":"MERGEABLE","state":"OPEN"}
```

**`MERGEABLE` ✅** — no longer CONFLICTING. `UNSTABLE` indicates Copilot review re-run is in progress; expected to resolve automatically.

## Patterns for Future Reference

See `gabriel/history.md` → "2026-06-05 — Merge-Conflict Resolution" for the full reusable pattern. TL;DR:
- Use `git merge`, not rebase, to preserve union driver semantics.
- Regenerate `package-lock.json` via `npm install` — never hand-merge JSON lockfiles.
- Trailing-slash globs in `.gitignore` are directory-only; remove the slash for file patterns.
- Commit `.gitignore` changes before the merge if they're staged.


---

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

# OQ-2 Substrate Brief — Genesta (Eureka/Cairn Bounded-Context Owner)

**Date:** 2026-06-06  
**Decision:** OQ-2 — Event-substrate topology (Crucible L1 WAL vs Cairn event_log)  
**Lock holder:** Aaron Kubly  
**Author:** Genesta (Cognitive Systems Lead, Eureka)

---

## 1. Recommendation

**Option B — FEDERATE.** From Eureka/Cairn's perspective, merging Crucible primitives into Cairn's `event_log` violates the "share identifiers, fork everything else" coexistence principle that the entire architecture is built on (§15.1), and would create schema-ownership hazards that neither bounded context can absorb cleanly.

## 2. Bounded-Context Verdict

**Does MERGE couple Eureka/Cairn to Crucible's primitive vocabulary in a way that harms either context?**

**Yes — it harms both.**

- **Cairn's harm:** Cairn's `event_log` is a CRUD table with `withShadowEvent` discipline (§15.1). Crucible's L1 WAL is append-only with group-commit and pre-commit hook bus semantics. Merging forces Cairn's event_log to accommodate append-only replay-grade invariants it was never designed for. Cairn's current consumers (Curator, prescribers, bridge events) would inherit schema constraints from Crucible's replay fidelity requirements — a vocabulary they don't speak.

- **Eureka's harm:** Eureka ingests from Cairn's event_log via offline CLI (`eureka ingest-session`, §40.2.2). If Crucible primitives land in that same table, Eureka's ingestion pipeline must now filter/discriminate Crucible event types it has no business understanding. The "one entity, two lenses" framing is dishonest here because the two lenses serve fundamentally different epistemological purposes: Cairn asks "what happened?" (lifecycle-of-record); Crucible asks "can I replay this deterministically?" (replay-of-record). These are not two views of one thing — they are two different things that happen to share a session identifier.

- **The "one entity, two lenses" test fails** because the write patterns are incompatible. CRUD with update/delete vs. append-only with CAS integrity are not lenses on the same substrate — they are different storage contracts. Forcing them into one table means one side's invariants must yield to the other's.

## 3. Schema-Ownership Risks

### Option A (MERGE)

| Risk | Detail |
|------|--------|
| **Ownership ambiguity** | Who owns `event_log` shape? Currently Cairn (§15.1). MERGE makes it co-owned by Cairn + Crucible. Every Crucible primitive addition requires Cairn-side migration review — the exact coordination tax ADR-0002 was designed to avoid. |
| **Dual-write hazard** | Crucible's group-commit writer and Cairn's `withShadowEvent` writer would target the same table. WAL-mode SQLite handles concurrent readers but not concurrent writers from different lifecycle contracts. Deadlock or corruption risk under concurrent session scenarios. |
| **Migration coupling** | Cairn is at migration 012+. Crucible has its own migration sequence. MERGE couples migration numbering — a Crucible schema evolution blocks on Cairn's migration pipeline and vice versa. |
| **EventType namespace collision** | Crucible's `PrimitiveKind` values (from `@akubly/crucible-core`) would need to coexist with Cairn's existing event types in a shared `eventType` discriminator. Namespace collisions require ongoing coordination. |
| **Eureka ingestion pollution** | Eureka's `ingest-session` reads `event_log WHERE session_id = ?`. MERGE means Crucible primitives appear in that result set. Eureka must learn to ignore them — a coupling it shouldn't have. |

### Option B (FEDERATE)

| Risk | Detail |
|------|--------|
| **Ownership clarity** | Cairn owns `event_log` shape. Crucible owns L1 WAL shape. Each evolves independently. |
| **No dual-write** | Each writer targets its own table/file. No contention. |
| **Migration independence** | Each product line maintains its own migration sequence (already the case per §15.1). |
| **Federation boundary cost** | A bridge must exist for cross-product queries. But `cairn reconcile` already serves this role (§15.4) — it's an offline, explicit, auditable bridge. |
| **Duplication tax** | Two event stores with overlapping session identifiers. This is the accepted tax per §15.4 ("Two event-logs" row). The cost is bounded because the bridge is offline and optional. |

## 4. Coexistence Path (FEDERATE)

The minimal honest federation boundary already exists in the architecture:

1. **`SessionId` brand** (`@akubly/types`) — The shared identifier that bridges both substrates at the type level, not the storage level. Already locked (R8, ADR-0002, §15.1).

2. **`cairn reconcile` CLI** — Offline bridge that projects Crucible-relevant events into Cairn's observability surface (§15.4). This is the federation seam: explicit, auditable, direction-controlled.

3. **Crucible DB seam** (`getSession`, `insertSession`, `queryEvents` — Sprint 0 REFACTOR cycle) — Already abstracted behind an interface with in-memory adapter. This seam is the correct place for a future "read-only projection of Cairn lifecycle context" adapter if cross-product queries are ever needed. The seam does NOT need to become a shared table.

4. **`DecisionRecord` in `@akubly/types`** — The lossy interchange shape that both Crucible (via Applier export, §14.1) and Eureka (via `fromDecisionRecord`, §40.3.1) consume. This is a shared *type*, not a shared *table* — exactly the right level of coupling.

**Guardrail:** No new shared storage surfaces. The federation boundary is types + offline CLI bridge. If a future need arises for real-time cross-product event queries, the correct pattern is a projection adapter behind the Crucible DB seam, not a shared table.

## 5. Cross-Package Gotchas the Lock Must Account For

1. **SessionId brand is the load-bearing bridge.** Both MERGE and FEDERATE depend on `SessionId` from `@akubly/types` being the sole cross-product correlator. The lock should reaffirm: SessionId is shared identity, not shared storage. No runtime foreign-key relationship between Crucible's session table and Cairn's session table (§15.1: "Shared brand only; no runtime FK").

2. **Eureka's OQ-2 dependency.** Eureka's ingestion pipeline (`ingest-session`, `ingest-decisions`) reads from Cairn's event_log. If MERGE were chosen, Eureka would need to understand Crucible event types to filter them out — an accidental coupling that violates Eureka's "Cairn-aware but not Crucible-aware" stance (§40.2, §14.3: "Eureka ↔ Cairn bridges are not Crucible's concern"). FEDERATE avoids this entirely.

3. **Sprint 0 DB seam alignment.** Roger's Sprint 0 REFACTOR introduced `getSession`/`insertSession`/`queryEvents` as an explicit DB interface. This seam assumes Crucible owns its own storage. MERGE would require reworking this seam to point at Cairn's event_log — a Sprint 0 architectural regression.

4. **§14.3 firewall.** Section 14.3 explicitly states "Crucible's coexistence stance commits to no shared substrate with Cairn." MERGE violates this locked commitment. The lock should either reaffirm §14.3 or explicitly supersede it (with documented rationale for why the Phase 2 commitment changed).

5. **`cairn reconcile` direction.** The offline bridge is currently specified as Cairn-reads-Crucible (or vice versa) — the direction matters for write authority. The lock should pin: federation bridge is read-only projection, never bidirectional write.

---

**Bottom line:** FEDERATE preserves every bounded-context commitment already locked in the architecture. MERGE would require unwinding §14.3, §15.1, §15.4, and the Sprint 0 DB seam — all for a unification that solves no current problem and creates ownership ambiguity in the one table (event_log) that three product lines would need to coordinate on. The accepted tax of two event stores is a feature, not a bug.

*Decision authority: Aaron Kubly. This brief is advisory.*


---

# OQ-2 Decision Brief: Event-Substrate Topology

**Author:** Graham (Lead/Architect)  
**Date:** 2026-06-06  
**Status:** RECOMMENDATION — Aaron holds the lock  
**Tension:** Crucible L1 WAL vs Cairn `event_log` — dual-write trap  

---

## 1. Recommendation

**Option B (FEDERATE).** The storage semantics are fundamentally incompatible — append-only hash-chained WAL vs CRUD lifecycle log — and the CTD already locks this stance in §15.1 and §15.4; merging would require relitigating three FINAL sections.

---

## 2. Option A — MERGE (Crucible primitives → Cairn `event_log`)

- **Benefit:** Single event substrate eliminates sync/bridge complexity. One schema to query, one writer to reason about. Reduces operational surface area.
- **Cost:** Cairn's `event_log` uses CRUD semantics (UPDATE, DELETE via lifecycle transitions, `withShadowEvent` discipline). Crucible's L1 WAL is append-only with binary segment format, BLAKE3 hash-chaining, content-addressed CAS store, and group-commit batching. Merging requires either (a) bolting WAL properties onto a CRUD table (unnatural, fragile) or (b) abandoning hash-chain integrity (destroys replay determinism — Crucible's core value proposition).
- **Risk — Replay determinism loss:** `crucible fsck` and hermetic replay (§11) depend on an unbroken hash chain where `prevRoot` of row N+1 = `selfRoot` of row N. Any CRUD operation that modifies or deletes rows breaks the chain. Cairn's shadow-event pattern (which wraps mutations) does not provide the byte-level content-addressing Crucible requires.
- **Risk — Bounded-context coupling:** Schema ownership becomes contested. Cairn lifecycle changes (migration v14+) would need Crucible-aware guards; Crucible schema additions (e.g., `contextWindowCommitment`, `hookVerdictWitness`) pollute Cairn's table with columns it never reads. Every migration becomes a cross-team coordination event.

---

## 3. Option B — FEDERATE (separate substrates, sync boundary)

- **Benefit:** Each system keeps its natural storage pattern. Crucible's append-only WAL preserves hash-chain integrity and replay determinism. Cairn's CRUD `event_log` preserves lifecycle semantics. Bounded contexts stay clean — each team owns its schema independently.
- **Cost:** Two implementations of overlapping event-storage concepts. The "two event-logs" row in §15.4 Accepted-Tax Enumeration is the named price. Developers must understand which log serves which purpose.
- **Risk — Dual-write:** If both systems try to capture the same real-world event (e.g., a Decision), they must coordinate or accept eventual consistency. Mitigation: `cairn reconcile` offline bridge (§15.1, already specified); Crucible is the authoritative source for Decision provenance, Cairn consumes via `DecisionRecord` export (§14.1 shared type, §15.2).
- **Risk — Duplicated schema concepts:** `SessionId` appears in both session models with different metadata. Mitigated by the §15.1 rule: "shared brand only; no runtime FK." The type-level bridge is sufficient; no schema-level FK needed.

---

## 4. Decision Drivers (ranked)

1. **Replay determinism is non-negotiable.** Crucible's identity (ADR-0020) is "replayable, accountable agentic computation." The append-only + hash-chain + content-addressed triple is load-bearing for `fsck`, hermetic replay (§11), and fork integrity. Any substrate that permits mutation destroys this property. This single driver dominates the call.

2. **Bounded-context independence.** Cairn and Crucible are on independent roadmaps with different teams, different migration sequences, and different storage patterns (§15.1). Merging substrates couples their release cadences. The monorepo already solved the *type-sharing* problem (ADR-0002); substrate sharing would reintroduce the coordination overhead ADR-0002 eliminated for types.

3. **§15 is already FINAL and locks FEDERATE in substance.** §15.1 coexistence table, §15.4 accepted-tax enumeration, and §14.3 ("Eureka ↔ Cairn bridges are not Crucible's concern") all presuppose separate substrates. Choosing MERGE would require relitigating three FINAL sections (§14, §15, §3), cascading into §2 boundary contract and §11 replay spec. The rework cost is weeks, not hours.

---

## 5. Impact on Refactor 3 (Real SQLite Integration Stub)

### Under Option B (FEDERATE) — recommended

The `DB` interface in `packages/crucible-core/src/db.ts` stays Crucible-only. Refactor 3 creates a `SqliteDB implements DB` adapter targeting a Crucible-owned SQLite file (`:memory:` for integration tests, `~/.crucible/crucible.db` for production). Schema: `sessions` table + `events` table, both Crucible-scoped. No Cairn table dependencies.

- `getSession()` → `SELECT id, ledgerSize, pluginVersions FROM crucible_sessions WHERE id = ?`
- `insertSession()` → `INSERT INTO crucible_sessions (...) VALUES (...)`
- `queryEvents()` → `SELECT * FROM crucible_events WHERE sessionId = ? AND offset BETWEEN ? AND ?`

The `InMemoryDB` extended surface (`insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`) either collapses into the `DB` interface or `session.ts` restructures to use `DB.queryEvents` with explicit lookups (per the NOTE block already in session.ts lines 15-19). The deferred N2 finding (`clear()` on InMemoryDB) resolves naturally — SQLite adapter doesn't need it.

**Rework: minimal.** The existing `DB` interface shape is already correct for B. Refactor 3 proceeds as planned.

### Under Option A (MERGE)

The `DB` interface would need to target Cairn's `event_log` schema. This means:
- `queryEvents()` must understand Cairn's `eventType` column and filter for Crucible-relevant rows among Cairn lifecycle events.
- `insertSession()` must write to Cairn's `sessions` table, respecting Cairn's column conventions.
- Schema migrations become shared — Crucible additions require Cairn migration review.
- The integration test cannot use `:memory:` in isolation; it needs Cairn's full schema DDL to create the target tables.

**Rework: significant.** The `DB` interface shape, the integration test, and the schema all change. Session.ts coupling to `InMemoryDB` extended methods becomes harder to resolve because the target schema is no longer under Crucible's control.

---

## 6. Reversibility

**B → A (federate → merge) later:** Moderate cost. If federation proves too expensive, merging can be done incrementally: (1) project Crucible WAL rows into Cairn `event_log` as a read-only view, (2) test query compatibility, (3) migrate writers. The WAL's content-addressed CAS makes it a reliable source for replay during migration. Timeline: ~1-2 sprints of integration work, but can be staged.

**A → B (merge → federate) later:** High cost. Once Crucible writes are entangled in Cairn's schema, extracting them requires: (1) new WAL substrate implementation, (2) data migration from CRUD table to append-only segments, (3) hash-chain reconstruction (impossible if any rows were mutated/deleted — replay determinism is permanently lost for affected sessions). Timeline: ~3-4 sprints, with permanent data-fidelity risk for historical sessions.

**Asymmetry:** B→A is reversible with moderate effort; A→B risks permanent replay-determinism loss. This asymmetry alone favors starting with B.

---

## Signatories

- **Graham** (Architect/Synthesizer) — authored this brief
- **Roger** (Crucible L1 WAL vantage) — input pending (parallel)
- **Genesta** (Eureka/Cairn event_log vantage) — input pending (parallel)
- **Aaron** — LOCK holder


---

# Decision: Correct Stale SKILL Examples (PR #45 Copilot Review)

**Agent:** Graham (Lead / Architect)  
**Date:** 2026-06-05  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**Commit:** a27cdf2  

---

## Context

Copilot's cloud review on PR #45 flagged two stale code examples in `.squad/skills/london-tdd-refactor-extract-collaborator/SKILL.md`. Both examples showed pre-fix code that no longer matched the Sprint 0 shipped implementation.

---

## Correction 1 — ForkLineage: remove `static root()`

**Problem:** The SKILL snippet included `static root() { return new ForkLineage(null, 0); }`.  
**Reality:** `static root()` was removed from `packages/crucible-core/src/ledger/fork-lineage.ts` (YAGNI; its sentinel `forkPointEventId = 0` conflicted with the `forkPointEventId === null` root-session convention in `SessionMetadata`).

**Fix:** Removed the `static root()` line from the snippet. Added a note: root sessions are represented via `forkPointEventId === null` in `SessionMetadata` (not via a `ForkLineage` factory).

---

## Correction 2 — SessionManager bounds-check: `>` → `>=`

**Problem:** The SKILL snippet used `if (forkOffset > parent.ledgerSize)` (pre-B1 check).  
**Reality:** `packages/crucible-core/src/session-manager.ts` line 24 uses `if (forkOffset >= parent.ledgerSize)` — the strict `>=` correctly rejects the boundary case where `forkOffset === ledgerSize`.

**Fix:** Updated the snippet to `>=` and added a one-line note that valid offsets are `0..ledgerSize-1`, so `>=` correctly rejects the boundary.

---

## Verification

- `npm test --workspace=@akubly/crucible-core` → 6/6 passed (doc-only change, no behavioral impact)


---

# Graham Review: Refactor 3 GREEN

**Reviewer:** Graham (Lead / Architect)
**Date:** 2026-06-06
**Phase:** §4.1 Refactor 3 — GREEN review
**Subject:** Roger's `createSQLiteDB` implementation + crucible-core barrel export
**Verdict:** ✅ APPROVE

---

## Review Summary

Roger implemented a clean, minimal SQLite adapter for the Crucible-owned two-table schema. All checklist items pass. No blocking issues found.

---

## Checklist Results

### 1. FEDERATE Invariant (Hard Gate)

**PASS.** `packages/crucible-core/src/sqlite-db.ts` contains zero imports from `packages/cairn`. The only occurrence of "Cairn" is a comment in the JSDoc header (`// Zero Cairn imports, zero coupling to packages/cairn's event_log`). ESLint on `sqlite-db.ts` produces zero errors or warnings.

### 2. Oracle Parity

**PASS.** The SQLite adapter's behavior matches `in-memory-db.ts` semantics exactly:

- **`ledgerSize` formula:** Root sessions: `COUNT(own events)`. Children: `forkPointEventId + 1 + COUNT(own events)`. Matches the in-memory formula verbatim.
- **`queryEvents` range:** `WHERE offset >= ? AND offset <= ?` is inclusive-inclusive [a, b], matching `e.offset >= a && e.offset <= b` in the in-memory oracle.
- **`insertSession` fork lineage:** `parent_session_id` and `fork_point_event_id` are stored as SQL columns and correctly read back by `getMetadata`. Matches the in-memory `parentSessionId`/`forkPointEventId` fields.
- **`insertRootSession`:** Stores NULL for both `parent_session_id` and `fork_point_event_id`. Matches in-memory behavior.
- **`pushEvent`:** Inserts to `events` table with correct JSON serialization of `primitivePayload` and `causalReadSet`. Inverse of `rowToPrimitive`.
- **`getOwnEvents`:** SELECT all events for session ORDER BY offset ASC — matches `ownEvents` array ordering in the in-memory version.
- **`getMetadata`:** Returns `{ parentSessionId, forkPointEventId, createdAt }` with correct null handling.
- **`clear`:** Deletes events first, then sessions — correct order respecting the FK constraint `events.session_id REFERENCES sessions(id)` under `foreign_keys = ON`.

No off-by-one or range-boundary issues identified.

### 3. SQL Safety

**PASS.** Every query uses prepared statements with `?` positional or `@named` parameter binding. Zero string interpolation in SQL. All multi-step operations that could logically be atomic are either single-row (no transaction needed) or isolated by the test-per-instance model (fresh `:memory:` DB per `beforeEach`).

Minor note: `clear()` runs two separate statements rather than a transaction. For the test-isolation use case this is fine since nothing else is running concurrently. Not a bug.

### 4. Resource Handling

**PASS.** `createSQLiteDB(':memory:')` creates a fresh `better-sqlite3` `Database` instance each call. Because each `beforeEach` in the integration test calls `createTestDatabase()`, every test case gets an isolated database — no shared state hazard. The `:memory:` lifetime is tied to the `Database` instance object; GC handles cleanup. WAL + foreign keys are enabled at construction; for `:memory:` WAL mode is a no-op but harmless.

### 5. Lint Claim Verification

**CONFIRMED.** The sole ESLint error (`import/named` at `test-db.ts:73`) is in Laura's RED-phase fixture file (`packages/crucible-cli/src/__tests__/fixtures/test-db.ts`), which is **untracked** — i.e., it was never in a commit and was created by Laura, not Roger. Roger's file `sqlite-db.ts` (also untracked) produces **zero ESLint errors or warnings**. Roger's claim is accurate: the error predates his GREEN work and is not caused by it.

The `eslint-disable-line import/named` comment on line 73 of `test-db.ts` was placed there intentionally by Laura because the `import/named` ESLint rule is not installed in this workspace's ESLint config. The comment suppresses a lint rule that isn't loaded — hence ESLint reports "Definition for rule 'import/named' was not found." This is a Laura-scope cleanup item, not a Roger blocking issue.

Separately: now that `createSQLiteDB` is exported, the `@ts-expect-error` directive on line 72 of `test-db.ts` is technically stale (the symbol now exists). No TypeScript error results because `__tests__` is excluded from tsconfig. Non-blocking; Laura can clean up when convenient.

### 6. Test Run

**PASS — 8/8 green, zero regressions.**

```
packages/crucible-core:
  ✓ src/__tests__/unit/session-manager.test.ts  (6 tests)

packages/crucible-cli:
  ✓ src/__tests__/acceptance/session-fork.test.ts  (1 test)
  ✓ src/__tests__/integration/session-fork.integration.ts  (7 tests)
```

All 7 integration invariants (A1-1, A1-2, A1-3, A1-4, B1, B2, B3) confirmed green against real SQLite `:memory:`. No pre-existing tests regressed.

---

## Non-Blocking Nits

1. **WAL pragma on `:memory:`:** `PRAGMA journal_mode = WAL` is a no-op for in-memory databases (SQLite silently ignores it) but signals intent for future file-backed usage. Fine to keep; no harm.
2. **`parentSessionId ?? null` defensive null-coalescing:** The `DB.insertSession` signature types `parentSessionId` as `string | null`, not `string | null | undefined`, so `?? null` is redundant. Harmless.
3. **`@ts-expect-error` stale in test-db.ts:** Laura's fixture comment now points to a resolved state. Low-priority cleanup; not Roger's file.

---

## Architectural Alignment

The adapter correctly implements the port-and-adapter pattern established at Refactor 1/2. `SessionManager` and `session.ts` require zero changes — the interface seam (`InMemoryDB`) absorbs the entire implementation difference between the in-memory Map and the real SQLite backend. The FEDERATE boundary is solid: Crucible owns `sessions` and `events` tables; Cairn owns `event_log` and `trust_*` tables; no cross-package schema coupling.

This is the substrate for Refactor 4 / Phase 2 file-backed sessions. The prepared-statement architecture scales cleanly to that transition.

---

## Verdict

**✅ APPROVE** — Roger's Refactor 3 GREEN implementation is correct, architecturally aligned, and free of blocking issues. All 6 checklist items pass. The FEDERATE invariant (OQ-2) is held. Tests are 8/8 green. Ready to proceed.


---

# Decision: Transitive Fork Prefix Delegation — Scope Disposition

**Date:** 2026-06-05
**Decided by:** Graham (Lead / Architect)
**Triggered by:** Copilot cloud review cycle 2, finding on `packages/crucible-core/src/session.ts` line ~63
**PR:** #45 (squad/crucible-sprint-0-walkthrough-a)

## Finding

Child `query()` prefix delegation reads the parent's `ownEvents` via `db.getOwnEvents(parentSessionId)`. This only works when the parent is a root session. If the parent is itself a fork, its inherited prefix (from a grandparent) is NOT in its `ownEvents`, so `query({range:[0,x]})` returns an incomplete prefix for transitive forks.

## Decision

**Option A: Document + defer.** Added a 7-line comment block at the delegation site in `session.ts` documenting the root-parent assumption and the planned future resolution.

## Rationale

1. **Out of scope:** Walkthrough A's A1 acceptance forks once from a root session with 47 primitives. Transitive fork lineage is not exercised.
2. **TDD discipline:** The TDD strategy (§4.1 REFACTOR phase) already identifies "Fork Lineage Transitivity" as a future test. Implementing recursive delegation now would add untested speculative code — no RED test drives it, violating London-school discipline.
3. **Explicit > hidden:** Adding a clear comment transforms a hidden trap into a documented limitation, which is the real value the reviewer's finding provides.

## Follow-up

- **Future cycle:** Write a dedicated "Fork Lineage Transitivity" RED test (Laura) that creates a grandparent → parent-fork → child-fork chain and asserts the child can query the full transitive prefix.
- **Implementation:** Change child query to delegate to the parent session's full `query()` recursively (or resolve lineage iteratively) once the RED test exists.
- **Reference:** `docs/crucible-tdd-strategy.md` §4.1 REFACTOR "Fork Lineage Transitivity"

## Commit

`978f865` — `docs(crucible): document root-parent assumption in fork prefix delegation`


---

# Handoff: Crucible Refactor 3 RED — Integration Test for Real SQLite

**Author:** Laura (Tester)
**Date:** 2026-06-06
**Phase:** §4.1 Refactor 3 — RED (integration test written, failing for right reason)
**Status:** 🔴 RED — 7 tests failing, 1 existing test still GREEN

---

## (a) Failing Test Path

```
packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts
```

7 tests, all failing with the same root cause (see §d).

Test fixture (helper Roger's impl will satisfy):
```
packages/crucible-cli/src/__tests__/fixtures/test-db.ts
```

---

## (b) Required Adapter Symbol + Signature

Roger must implement and export:

**File:** `packages/crucible-core/src/sqlite-db.ts`

```typescript
export function createSQLiteDB(path: ':memory:' | string): InMemoryDB
```

Where `InMemoryDB` is the existing interface from `packages/crucible-core/src/in-memory-db.ts`.

**Barrel addition required** — add to `packages/crucible-core/src/index.ts`:
```typescript
export { createSQLiteDB } from './sqlite-db.js';
```

### Full interface contract `createSQLiteDB` must satisfy

**DB base methods (async — return Promise):**

| Method | Signature | Notes |
|--------|-----------|-------|
| `getSession` | `(id: string) → Promise<{ id, ledgerSize, pluginVersions? } \| null>` | `ledgerSize` = `forkPointEventId === null ? ownCount : forkPointEventId + 1 + ownCount` |
| `insertSession` | `({ id, parentSessionId, forkPointEventId, pluginVersions?, createdAt }) → Promise<void>` | Used by SessionManager.forkSession |
| `queryEvents` | `(id, { range: [a, b] }) → Promise<Primitive[]>` | Inclusive-inclusive `[a, b]`; returns OWN events only (no parent delegation at this layer) |

**InMemoryDB extensions (synchronous — better-sqlite3 is sync):**

| Method | Signature | Notes |
|--------|-----------|-------|
| `insertRootSession` | `(id: string, createdAt: number): void` | Creates session row with NULL parent/forkPoint |
| `pushEvent` | `(sessionId: string, event: Primitive): void` | Inserts a row into the events table |
| `getOwnEvents` | `(sessionId: string): Primitive[]` | Returns all events for the session in offset order |
| `getMetadata` | `(sessionId: string): { parentSessionId, forkPointEventId, createdAt } \| null` | Reads the session row's lineage columns |
| `clear` | `(): void` | `DELETE FROM events; DELETE FROM sessions;` — test isolation only |

### Required schema (Crucible-owned per OQ-2 FEDERATE — NOT Cairn event_log)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT    PRIMARY KEY,
  parent_session_id   TEXT,                    -- NULL for root sessions
  fork_point_event_id INTEGER,                 -- NULL for root sessions
  plugin_versions     TEXT,                    -- JSON blob | NULL
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  session_id          TEXT    NOT NULL REFERENCES sessions(id),
  "offset"            INTEGER NOT NULL,
  primitive_kind      TEXT    NOT NULL,
  primitive_payload   TEXT    NOT NULL,         -- JSON blob
  causal_read_set     TEXT    NOT NULL,         -- JSON blob
  PRIMARY KEY (session_id, "offset")
);
```

---

## (c) Package.json Dependencies Needed

Neither `packages/crucible-cli` nor `packages/crucible-core` currently has `better-sqlite3`.

Roger must add to **`packages/crucible-cli/package.json`** devDependencies:
```json
"better-sqlite3": "^12.8.0",
"@types/better-sqlite3": "^7.6.13"
```

And to **`packages/crucible-core/package.json`** devDependencies (if sqlite-db.ts lives there):
```json
"better-sqlite3": "^12.8.0",
"@types/better-sqlite3": "^7.6.13"
```

These exact versions are already present in `packages/cairn` and `packages/eureka` — using the same keeps workspace hoisting consistent. No need to add to `dependencies` (only needed for test/dev).

---

## (d) Exact RED Failure Message

```
TypeError: (0 , createSQLiteDB) is not a function
 ❯ createTestDatabase src/__tests__/fixtures/test-db.ts:87:11
     return (createSQLiteDB as (path: string) => InMemoryDB)(':memory:');
            ^
 ❯ src/__tests__/integration/session-fork.integration.ts:73:10

Test Files  1 failed | 1 passed (2)
     Tests  7 failed | 1 passed (8)
```

**Root cause:** `createSQLiteDB` is not exported from `@akubly/crucible-core` (dist/index.js). vitest's Vite module loader resolves the import as `undefined` (CJS-interop). Calling `undefined(':memory:')` throws `TypeError: (0 , createSQLiteDB) is not a function`.

---

## What Roger Must Do to Go GREEN

1. Create `packages/crucible-core/src/sqlite-db.ts` implementing `createSQLiteDB(':memory:')` → returns `InMemoryDB` backed by `better-sqlite3`.
2. Apply the two-table schema above at construction time (run `CREATE TABLE IF NOT EXISTS` on the fresh DB handle).
3. Implement all 8 interface methods (3 async base + 5 synchronous extensions).
4. Export `createSQLiteDB` from the crucible-core barrel (`index.ts`).
5. Add `better-sqlite3` + `@types/better-sqlite3` to devDependencies in `crucible-cli` and/or `crucible-core`.
6. Run `npm install` in the workspace root after updating package.json.

**Success signal:**
```
Test Files  2 passed (2)
     Tests  8 passed (8)
```

---

## Existing Tests Preserved

- `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` — ✅ 1 passing (unchanged)
- `packages/crucible-core/src/__tests__/unit/session-manager.test.ts` — ✅ 6 passing (unchanged)

Roger's GREEN implementation must not break these.

---

## Invariants Locked by the Integration Test

| ID | Test name | Invariant |
|----|-----------|-----------|
| A1-1 | `stores parentSessionId in real SQLite rows` | `db.getMetadata(childId).parentSessionId === parentId` |
| A1-2 | `stores forkPointEventId=23 in real SQLite rows` | `db.getMetadata(childId).forkPointEventId === 23` |
| A1-3 | `parent prefix [0..23] contains exactly 24 events` | `db.queryEvents(parentId, {range: [0,23]}).length === 24`; offsets are inclusive-inclusive |
| A1-4 | `parent ledgerSize remains 47 after fork` | `db.getSession(parentId).ledgerSize === 47` |
| B1 | `rejects fork at offset equal to ledger size` | `forkOffset >= ledgerSize` throws — strict < bound, real DB |
| B2 | `rejects negative fork offset` | `forkOffset < 0` throws — ForkLineage invariant, real DB |
| B3 | `freshly forked child has ledgerSize = forkPointEventId + 1` | `db.getSession(childId).ledgerSize === 24` (23 + 1 + 0 own events) |


---

# OQ-2 Substrate Brief — Roger (Platform Dev)

**Date:** 2026-06-06T00:14:21-07:00  
**Question:** OQ-2 — Crucible L1 WAL vs Cairn event_log: MERGE (Option A) or FEDERATE (Option B)?  
**Aaron holds the lock.**

---

## 1. Recommendation

**Option B — FEDERATE.** From the implementer's chair: the two substrates are structurally incompatible, the current DB interface already defines the right contract for the SQLite adapter, and §15 already accounts for the "two event-log tax" as a named, accepted cost. Merging them collapses a clean seam into a migration-coupled entanglement with no elimination of dual-write.

---

## 2. DB-Seam Impact

### What Cairn's event_log actually is

Cairn's `event_log` (migration 001, stable through 017) has the following shape:

```
event_log(id AUTOINCREMENT, event_type TEXT, payload JSON-as-text, session_id FK → cairn.sessions, created_at DATETIME)
```

The writer is `logEvent(db, sessionId, eventType, payload)` in `packages/cairn/src/db/events.ts`. Reader is cursor-based (`id > lastProcessedId`), not range-by-offset. Sessions are `(id, repo_key, branch, started_at, ended_at, status, session_kind, workdir)` — no fork lineage, no pluginVersions, no forkPointEventId.

### Option A (MERGE) — what the SQLite adapter must implement

The current `DB` interface (`db.ts`) cannot survive as-is:

- **`getSession`** returns `{ id, ledgerSize, pluginVersions }`. `ledgerSize` requires a derived count of Crucible-scoped rows. Cairn's AUTOINCREMENT `id` is a global sequence, not a per-session offset. Computing `ledgerSize` from Cairn's table requires a `COUNT(*) WHERE session_id = ? AND event_type IN (crucible-primitive-kinds)` — fragile, payload-scanning, and session-scoped by a FK that references Cairn's session model, not Crucible's fork-lineage model.

- **`insertSession`** takes `{ id, parentSessionId, forkPointEventId, pluginVersions, createdAt }`. Cairn's `sessions` table has no `parent_session_id`, `fork_point_event_id`, or `plugin_versions` columns. You either extend Cairn's `sessions` table (migration 018+, shared-schema coupling) or maintain a separate fork-lineage table in Cairn's DB (which is just FEDERATE with extra steps).

- **`queryEvents(id, { range: [a, b] })`** returns `Primitive[]` by offset range. Cairn has no `offset` column. The range query must either (a) carry offset inside the JSON payload and filter on extracted JSON (slow, non-index-sargable) or (b) add an `offset` column to `event_log` (migration 018, Crucible-specific column in Cairn's schema). Neither is clean.

- **Extended surface** (`insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`): these expose Crucible-specific fork semantics. They'd need to compose over Cairn's flat event_log + the extended Cairn sessions shape, adding translation logic at every call site.

**Interface verdict under A:** Requires structural restructuring. Either extend Cairn's schema with 3+ Crucible-specific columns across two tables (migration coupling), or introduce a translation adapter layer that inverts the abstraction. Neither path preserves the existing `DB` port contract.

### Option B (FEDERATE) — what the SQLite adapter must implement

The current `DB` interface **survives unchanged**. The SQLite adapter writes to `crucible.db` (separate file, per the 2026-05-26 data-overlap analysis recommendation) with its own schema:

```sql
-- crucible sessions: fork lineage + pluginVersions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  parent_session_id TEXT,
  fork_point_event_id INTEGER,
  plugin_versions TEXT,  -- JSON
  created_at INTEGER NOT NULL,
  ledger_size INTEGER NOT NULL DEFAULT 0  -- maintained on pushEvent
);

-- Crucible primitives: per-session, per-offset
CREATE TABLE primitives (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  offset INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON
  PRIMARY KEY (session_id, offset)
);
```

All five `DB` methods map cleanly:

| Method | SQL |
|--------|-----|
| `getSession(id)` | `SELECT id, ledger_size, plugin_versions FROM sessions WHERE id = ?` |
| `insertSession(…)` | `INSERT INTO sessions (id, parent_session_id, fork_point_event_id, plugin_versions, created_at)` |
| `queryEvents(id, [a,b])` | `SELECT * FROM primitives WHERE session_id = ? AND offset BETWEEN ? AND ?` |
| `insertRootSession` | `INSERT INTO sessions (id, parent_session_id=NULL, fork_point_event_id=NULL, ...)` |
| `pushEvent` | `INSERT INTO primitives + UPDATE sessions SET ledger_size = ledger_size + 1` |

`getOwnEvents` and `getMetadata` are direct reads. `clear()` is `DELETE FROM sessions; DELETE FROM primitives`. The interface is fully satisfiable with no restructuring.

---

## 3. Dual-Write Trap: What's Real

### Under MERGE — is there actually a dual-write?

**Yes, there is, and it can't be engineered away.** Here's why:

Crucible's canonical store is the binary `.seg` WAL files in `~/.crucible/wal/sessions/<sessionId>/`. SQLite (`crucible.db`) is a derived projection, not the authoritative record (§3.2: "SQLite (better-sqlite3) — derived tables only"). The BLAKE3 hash chain, content-addressed CAS, segment indices, and replay integrity properties all live in the binary segments.

If Crucible routes its `DB` writes to Cairn's `event_log`, it is writing to Cairn's SQLite. But it still must write to `.seg` files to maintain hash-chain integrity and replay properties. Result: two writes per primitive — one to Cairn's DB, one to the segment file. That is the dual-write trap in practice.

The trap can only be *collapsed* if Cairn's `event_log` *is* the canonical store and the hash chain + CAS are abandoned. That guts the entire Crucible design (§3 FINAL). It's not a trade-off; it's a design rejection.

### Under FEDERATE — what sync code we own and what can go wrong

Crucible writes to `crucible.db`. Cairn writes to `cairn/knowledge.db`. They are separate. The "sync" at the federation boundary is a projection, not a writer: Cairn's observational layer reads Crucible's L2 surfaces (or subscribes to the L1Subscriber broadcast from §3.1.5) for things like session lifecycle events, activity timelines, etc.

**What we own:**
- The federation contract: Crucible publishes session lifecycle events (session-start, fork, session-end) as L1Subscriber broadcast payloads. Cairn's adapter subscribes and writes to `cairn.event_log` entries of type `crucible.session_start` etc.
- Schema version coordination at the federation boundary (Crucible payload shape must be stable for Cairn consumers).

**What can go wrong:**
- Cairn subscriber processes events out of order if it restarts mid-session (cursor drift). Mitigation: cursor-based catch-up from the last processed offset, same pattern Cairn already uses in `getUnprocessedEvents`.
- Federation contract schema drift if Crucible changes payload shape without bumping a version discriminator. Mitigation: explicit `schemaVersion` on federation payloads, same discipline as `BootstrapPayload`.
- Neither of these is new infrastructure. Cairn already does cursor-based polling. The risk surface is a thin boundary, not a shared migration sequence.

---

## 4. Refactor 3 Readiness

**Option B wins cleanly.**

`createTestDatabase()` under B is:

```typescript
import Database from 'better-sqlite3';

export function createTestDatabase(): DB {
  const raw = new Database(':memory:');
  // ~30 lines: CREATE TABLE sessions + CREATE TABLE primitives
  applyCrucibleMigrations(raw);
  return new SqliteDB(raw);
}
```

Zero Cairn dependency. Zero cross-package import. The integration test in `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts` (or equivalently `packages/crucible-core`) instantiates `createTestDatabase()` + `new SessionManager(db)` and exercises the full lineage contract: `forkSession → getSession → queryEvents range-equality`.

**What the test must assert either way:**
1. `child.parentSessionId === parentId` — lineage FK correct
2. `child.forkPointEventId === 23` — fork point stored
3. `queryEvents(child, [0, 23])` equals `queryEvents(parent, [0, 23])` — inherited prefix is immutable and equal
4. `queryEvents(child, [24, 46])` returns empty (no own events yet) — child owns nothing past fork point until appended
5. `db.getSession(child).ledgerSize === 24` — ledgerSize = forkPoint + 1 for newly forked child

Under A, the integration test would need to spin up a Cairn DB (17 migrations), cross-package import, and work around the interface mismatch before asserting any of the above. The test infrastructure cost alone makes it the wrong choice for Refactor 3.

**Note on `N2` deferral (Cycle 2 advisory):** The `clear()` on the InMemoryDB interface was flagged as potentially obligating future adapters. Under B, `clear()` stays test-only and the SQLite adapter implements it as `DELETE FROM sessions; DELETE FROM primitives` — a one-liner. The advisory decompresses cleanly.

---

## 5. Estimated Effort Delta

**B is cheaper by approximately 2–3 days for Refactor 3.**

| Work item | Option A | Option B |
|-----------|----------|----------|
| DB interface restructuring | ~1 day (extend or replace) | 0 (survives unchanged) |
| Cairn schema extensions (migrations 018+) | ~0.5 day | 0 |
| Cross-package test dependency wiring | ~0.5 day | 0 |
| `createTestDatabase()` implementation | ~0.5 day (requires Cairn migration stack) | ~0.5 day (standalone `:memory:`) |
| `SqliteDB` adapter implementation | ~1.5 day (translation layer over incompatible schema) | ~1 day (direct mapping) |
| Federation contract spec (publish-subscribe boundary) | Bypassed (but deferred cost grows) | ~0.5 day upfront |
| **Total** | **~4 days** | **~2 days** |

The federation contract cost under B is real but small. The deferred cost under A — when Crucible's schema evolves and Cairn's `event_log` must track it — is open-ended and compounds with every sprint.

---

## Summary for Aaron

Option B (FEDERATE). The DB interface is already the right contract. The SQLite adapter for Refactor 3 drops in with zero interface restructuring and a self-contained test harness. The dual-write trap under MERGE is genuine and structural — not engineering-around-able without abandoning the WAL's core replay guarantee. §15 already accepted the two-event-log tax. Collect it; don't fight it.

**Aaron holds the lock.**


---

# Roger — PR #45 Cycle 2 Fixes

**Date:** 2026-06-05  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**PR:** #45

---

## Fix 1 — `packages/crucible-cli/README.md`: facade accuracy

**Issue:** The README described `@akubly/crucible-cli` as a command-line shell with user-facing `fork`/`replay`/`bisect` commands. The package has no `bin` entry and only re-exports `createSession`/`fork` from `@akubly/crucible-core`.

**Decision:** Reword the README to describe the package as the Sprint 0 acceptance-test facade — a thin re-export surface that lets integration tests exercise the public API without depending on core directly. Note that a real CLI entrypoint is planned for a future sprint. Do not claim CLI commands that do not exist.

**Resolution:** README rewritten. No logic changes.

---

## Fix 2 — `.squad/agents/roger/history.md`: control-character sweep

**Issue:** Copilot's cycle 2 review cited embedded control characters around line 726 (words like "pure-Rust...redb" and "beforeCommit" / "better-sqlite3" garbled). The cycle 1 sweep had only cleaned the 1020–1065 region.

**Decision:** Perform a full-file byte-level scan and fix all remaining artifacts. Four artifacts found and corrected:

| Byte   | Line | Bad byte | Fix            | Corrected text        |
|--------|------|----------|----------------|-----------------------|
| 84816  | 726  | CR (0D)  | → 'r' (72)     | `pure-Rust redb`      |
| 112339 | 1068 | ESC (1B) | → 'e' (65)     | `endOffset`           |
| 112896 | 1071 | CR (0D)  | → 'r' (72)     | `resetInMemoryDb`     |
| 113466 | 1074 | BEL (07) | → 'a' (61)     | `session.ts append`   |

**Resolution:** All four artifacts patched; full-file rescan confirmed zero control bytes remain. Learning appended to history.md: sweep the whole file after any control-char remediation.


---

# Decision Record: PR #45 Cycle 3 Fixes (Roger)

**Date:** 2026-06-05  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**Commit:** 8349525

---

## Fix 1 — db.ts header comment (doc-only)

**Issue:** The header comment stated DB contains "only the operations SessionManager actually needs," but `queryEvents` is present in the interface and is never called by `SessionManager`. This made the comment inaccurate.

**Decision:** Do NOT remove `queryEvents` — it is part of the intended persistence port for session-level queries and the forthcoming SQLite adapter (Refactor 3). Instead, update the comment to accurately reflect:
- `SessionManager` uses a subset: `getSession` (validation) and `insertSession` (fork creation).
- `queryEvents` is retained for session-level query needs and the forthcoming SQLite adapter.

**Rationale:** The interface is a port contract, not a SessionManager-specific shim. Removing `queryEvents` would require touching production code and would be premature. Honest comments about used-vs-retained members prevent future reader confusion.

---

## Fix 2 — session-manager.test.ts insertSession mock (test-only)

**Issue:** Two `insertSession.mockResolvedValue('child-id')` stubs resolved a string, mismatching the `Promise<void>` contract of `DB.insertSession`. Production code correctly ignores the return value (child id comes from `crypto.randomUUID()` inside SessionManager), but the wrong stub type could mask future misuse.

**Decision:** Change both stubs to `.mockResolvedValue(undefined)` to match the `Promise<void>` interface contract.

**Verification:** All 6 unit tests in crucible-core and the 1 acceptance test in crucible-cli remain green. Build exits 0.


---

# Roger — PR #45 Final Fixes (Copilot cloud-review pass)

**Date:** 2026-06-06  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**PR:** #45  

Three trivial fixes applied before merge.

---

## Fix 1 — `packages/crucible-core/src/db.ts`: tighten `queryEvents` return type

**Problem:** `DB.queryEvents` returned `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly.

**Fix:** Added `import type { Primitive } from './types.js'` to `db.ts` and changed the return type to `Promise<Primitive[]>`. No changes needed to `in-memory-db.ts` — its implementation already returned `Primitive[]` and compiles cleanly against the tightened signature.

**Verification:** `npm run build` → exit 0; `npm test --workspace=@akubly/crucible-core` → 6/6.

---

## Fix 2 — `.squad/skills/topic-branch-from-dirty-main/SKILL.md` (~line 13): fix decision-archive path prose

**Problem:** The bullet used `.squad/decision archives` (space, not a real path) as if it were a directory reference.

**Fix:** Rewrote to reference the real path: `.squad/decisions/archive/` (confirmed exists in repo).

---

## Fix 3 — `.squad/skills/topic-branch-from-dirty-main/SKILL.md` (~line 41): fix trailing slash in gitignore example

**Problem:** Example patterns `.squad/health-report-*/` and `.squad/scribe-health-report-*/` had trailing slashes, which match directories only. Health reports are files, so these patterns would silently fail to ignore them.

**Fix:** Removed trailing slashes → `.squad/health-report-*` / `.squad/scribe-health-report-*`. Added a one-line callout note: "No trailing slash — trailing slash restricts the pattern to directories only."

This is the same bug that caused the real scratch-file problem during Sprint 0 recovery; the SKILL now teaches the correct pattern.


---

# PR #45 Copilot Review — Comment Accuracy Fixes

**Date:** 2026-06-05
**Agent:** Roger (Platform Dev, crucible-core owner)
**PR:** #45 (squad/crucible-sprint-0-walkthrough-a)
**Type:** Doc/comment-only — no logic changes

## Fixes Applied

### FIX 1 — `packages/crucible-core/src/session-manager.ts`
- **What:** JSDoc for `forkSession` said "forkOffset must not exceed parent ledger size", implying `<=` is allowed.
- **Fix:** Reworded to "forkOffset must be strictly less than parent ledger size (offsets are 0..ledgerSize-1)" to match the `>= throws` implementation.

### FIX 2a — `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` (header)
- **What:** File header said "RED PHASE — MUST FAIL" but the test is now GREEN with implementation present.
- **Fix:** Rewrote header as "Acceptance test (GREEN) — Session Fork (A1)" while preserving traceability markers (US-A-NEW-1, US-E-2, §4.1, decision 2a).

### FIX 2b — `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` (import comment)
- **What:** Inline comment said `createSession`/`fork` "do not exist yet — import failure is the intended RED signal".
- **Fix:** Removed the comment; the import is now legitimate and expected to resolve.

### FIX 3 — `packages/crucible-core/src/__tests__/unit/session-manager.test.ts`
- **What:** Header said "MUST BE RED until SessionManager lands"; import comment said "does not exist yet".
- **Fix:** Updated header to "tests are GREEN — SessionManager is implemented and exported"; removed RED-signal import comment.

### FIX 4 — `packages/crucible-cli/README.md`
- **What:** Relative link to Crucible Technical Design used `../docs/` which resolves to `packages/docs/` (non-existent).
- **Fix:** Changed to `../../docs/` which correctly resolves to `docs/crucible-technical-design/` at repo root. Verified the target directory exists.

### FIX 5 — `.squad/agents/roger/history.md`
- **What:** Multiple lines in the session entries around lines 1020–1065 contained embedded control characters (0x0D CR, 0x0C FF, 0x08 BS) that garbled markdown rendering and split words across lines. Additional control chars found at earlier lines (~726, ~820) were also cleaned.
- **Fix:** Replaced all control characters in-place: `\r` → removed (rejoined split words), `\f` → removed, `\b` → removed. Restored: `roger-...`, `forkPointEventId`, `buildSession`, `baseOffset`, `root()`, `null.`, `beforeCommit`, `better-sqlite3`, `fsck`. Code fence delimiters restored to proper triple-backtick format.


---

# Roger Handoff: Refactor 3 GREEN

**Author:** Roger (Platform Dev)
**Date:** 2026-06-06
**Phase:** §4.1 Refactor 3 — GREEN
**Status:** ✅ GREEN — 8/8 tests passing, types clean, lint pre-existing baseline unchanged

---

## What Landed

### 1. New file: `packages/crucible-core/src/sqlite-db.ts`

Implements `export function createSQLiteDB(path: ':memory:' | string): InMemoryDB` backed by `better-sqlite3`. Applies Crucible's own two-table schema at construction time via `CREATE TABLE IF NOT EXISTS`. All 8 interface methods implemented with prepared statements:

- **DB base (async):** `getSession` (ledgerSize = `forkPointEventId + 1 + ownCount` for children, `ownCount` for roots), `insertSession` (fork lineage), `queryEvents` (inclusive-inclusive `[a, b]` range, own events only)
- **InMemoryDB extensions (sync):** `insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`, `clear`

Zero Cairn imports. Zero coupling to `packages/cairn` schema. OQ-2 FEDERATE invariant held.

### 2. Barrel export: `packages/crucible-core/src/index.ts`

Added: `export { createSQLiteDB } from './sqlite-db.js';`

### 3. devDependencies added to both packages

`packages/crucible-core/package.json` and `packages/crucible-cli/package.json` now include:
```json
"better-sqlite3": "^12.8.0",
"@types/better-sqlite3": "^7.6.13"
```

### 4. Workspace install

`npm install` run at repo root. Native binary already present (hoisted from cairn/eureka). 24 new packages resolved.

---

## Test / Type / Lint Status

| Check | Status | Detail |
|-------|--------|--------|
| `crucible-core` tests | ✅ 6/6 passing | session-manager.test.ts unchanged |
| `crucible-cli` integration tests | ✅ 7/7 passing | All Laura's A1-1…A1-4, B1, B2, B3 green |
| `crucible-cli` acceptance tests | ✅ 1/1 passing | session-fork.test.ts unchanged |
| `tsc --build --force` (crucible-core) | ✅ clean | |
| `tsc --build --force` (crucible-cli) | ✅ clean | |
| `tsc --noEmit` (crucible-core) | ✅ clean | |
| `tsc --noEmit` (crucible-cli) | ✅ clean | |
| ESLint | ⚠️ 1 pre-existing error | `test-db.ts:73` `import/named` rule not found — predates Refactor 3, confirmed in baseline |

---

## Schema (for reference)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT    PRIMARY KEY,
  parent_session_id   TEXT,
  fork_point_event_id INTEGER,
  plugin_versions     TEXT,
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  session_id          TEXT    NOT NULL REFERENCES sessions(id),
  "offset"            INTEGER NOT NULL,
  primitive_kind      TEXT    NOT NULL,
  primitive_payload   TEXT    NOT NULL,
  causal_read_set     TEXT    NOT NULL,
  PRIMARY KEY (session_id, "offset")
);
```

Note: `"offset"` quoted because it is an SQLite reserved word.

---

## Deferred / Nothing Blocked

- The `@ts-expect-error` directive in `test-db.ts` is now technically unnecessary (createSQLiteDB exists), but because `__tests__` is excluded from tsconfig and vitest uses esbuild, it causes no error. Laura can clean it up when convenient — not a blocker.
- Pre-existing ESLint `import/named` issue in test-db.ts is not caused by Refactor 3 and not fixed here (out of scope).
- WAL mode + foreign keys enabled on the SQLite handle; file-path DB creation works, but only `:memory:` is exercised by tests today.

---

## Next Phase Unblocked

The SQLite adapter is the substrate for any future Refactor 4 / Phase 2 work (file-backed sessions, persistence across process restarts, WAL replay). The interface seam is identical to `createInMemoryDB` — consumer code in `session.ts` / `SessionManager` requires zero changes.


---

### 2026-06-06: OQ-2 LOCKED — Event-substrate topology = FEDERATE (Option B)

**Status:** ✅ LOCKED by Aaron Kubly
**Date:** 2026-06-06
**Deciders:** Graham (Architect) · Genesta (Eureka/Cairn) · Roger (Platform/impl) — unanimous recommendation; Aaron holds and exercised the lock.
**Supersedes:** OQ-2 "MEDIUM — pre-sprint-2 sync required" deferral (decisions.md ~line 1268).

**Decision:** Crucible's L1 WAL stays **federated** from Cairn's `event_log`. Crucible owns its own append-only, hash-chained WAL substrate, its own SQLite projection schema, migrations, and test fixtures. Cairn's `event_log` remains separate. The two stores are bridged only via the shared `SessionId` brand and the offline `cairn reconcile` federation seam. The two-event-log cost is an accepted tax (CTD §15).

**Rejected:** Option A (MERGE Crucible primitives into Cairn `event_log`).

**Rationale (convergent):**
- **Storage-contract incompatibility:** Cairn = CRUD + shadow-events; Crucible = append-only + CAS hash-chain. Not "two lenses on one substrate" — two distinct storage contracts. (Genesta)
- **Replay determinism:** MERGE breaks Crucible's hash-chain integrity, gutting CTD §3 / ADR-0020. (Graham)
- **Dual-write trap is unavoidable under MERGE:** Crucible's canonical store is the binary `.seg` WAL files; routing Primitive writes to Cairn adds a *second incompatible writer*. (Roger)
- **Reversibility is asymmetric:** federate-now/merge-later is moderate effort; merge-now/extract-later risks permanent hash-chain corruption.
- **CTD already locks B** across §3, §14, §15 ("share identifiers, fork everything else").

**Consequences / unblocks:**
- **Refactor 3 proceeds with zero DB-interface rework.** The current `DB` interface (`getSession`/`insertSession`/`queryEvents` + extended `getOwnEvents`/`getMetadata`/`insertRootSession`/`pushEvent`) survives. The real SQLite adapter is a standalone `better-sqlite3(':memory:')` with Crucible's own two-table schema, no Cairn dependency.
- Estimated ~2 days cheaper than Option A for Refactor 3; gap widens as Crucible's schema evolves independently.

**Source briefs:** `.squad/decisions/inbox/graham-oq2-substrate-brief.md`, `genesta-oq2-substrate-brief.md`, `roger-oq2-substrate-brief.md`.


---



