# Archived Decisions — Before 2026-05-29

Archived on 2026-06-05. See decisions.md for current decisions.

---

### 2026-05-26: Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-26  
**Locked By:** 4-reviewer panel (Graham Knight, Genesta, Crispin, Edgar) — unanimous LOCK, zero revisions  
**Lock Status:** DO NOT EDIT — canonical specification; v4-final superseded

**Decision:** Eureka PRD v5-final is ratified as canonical, shippable specification after R8 post-lock amendment. Aaron R8 session-identity directive: Cairn `Session` and Eureka `kind=session` fact share one identifier (Copilot CLI session UUID) via shared `SessionId` brand in `@akubly/types`, with normative lens framing as guard. All R8 changes landed correctly. R8 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v5-final.md` (617 lines, 86.4 KB) — canonical stable location; supersedes v4-final
- **Lineage:** v4-final (R7, 555 lines) → v5-final (R8 amendments, +62 lines) — all R8 deltas annotated `[v5: <reason>]`
- **Panel:** Graham Knight (Architect), Genesta (Cognitive Systems), Crispin (Knowledge Representation), Edgar (Learning Systems) — unanimous verdict: LOCK

**R8 Amendment Scope (Judgment Calls + Enforcement Deltas):**

1. **Session Identity Unification:** Cairn `Session` and Eureka `kind=session` facts are the same entity (one CLI session UUID). Shared `SessionId` branded type in `@akubly/types`.
2. **Bridge Ledger Simplification:** `cairn_session_id_hint?` (optional) → `session_id: SessionId` (required). Eliminates nullable opaque correlation.
3. **FR-13 Amendment:** "Isolated by design" language deleted. Replaced with: "SessionId is shared; all other session attributes are system-specific. Lens framing (Cairn = lifecycle, Eureka = epistemology) is the normative guard against coupling drift."
4. **FR-7.2 Preserved:** No-cross-DB-ATTACH rule unchanged. Shared identifier is type-level only; runtime decoupling remains intact.
5. **§14a T-orphan Reframed:** "Dangling `cairn_session_id`" → "Stale `session_id` reference" (severity unchanged: LOW/LOW). Threat table entries in both §13 + §14a (belt-and-suspenders per JC1 disposition).
6. **FR-12 Mechanism #8 (NEW):** ESLint `no-restricted-imports` guardrail bans Cairn ↔ Eureka session-type imports except `SessionId` from `@akubly/types`.
7. **JC1 Disposition (T6 Row Placement):** Verified in both §13 + §14a threat tables.
8. **JC2 Disposition (v1 ship scope):** SessionId brand ships v1 (FR-12 #8); Trust/Confidence brands stay v1.5 (FR-12 #7).

**Reviewer Verdicts:**
- **Graham Knight (Architect):** LOCK — 8/8 enforcement items landed correctly; no new architectural concerns; v5-final surgical pass, no scope creep
- **Genesta (Cognitive Systems):** LOCK — all 5 guardrails from R8 fold verified (lens framing normative, neutral brand, no runtime traversal, ESLint boundary, Glossary updated)
- **Crispin (Knowledge Representation):** LOCK — all 6 spec items from R8 KR verdict verified (SessionId brand mechanics, kind=session schema, no identity collision, fact vs. filter clarity, edge schema tightening, session-fact integrity)
- **Edgar (Learning Systems):** LOCK — all 3 precision-gain items verified (sweep cadence v1.5 opportunity, `--session <uuid>` CLI v1 ship, AC-2.5 telemetry counter); zero new learning-systems risks

**Key Technical Deltas (Summary):**
- `@akubly/types/src/session.ts` (NEW): `SessionId` branded type + UUID validator + constructor
- `bridge_ledger.session_id` (NEW): `TEXT NOT NULL` replaces `cairn_session_id_hint? TEXT` 
- FR-13 text: "isolated by design" deletion + shared brand framing + lens elevation to normative
- FR-7.2: no-ATTACH rule consistency pass + type-level-only clarification
- §14a: T-orphan reframe (same severity, clearer semantics)
- FR-12 mechanism #8: ESLint guardrail (ships v1)
- Glossary + §15: Lineage citations + Aaron R8 directive + Graham/Genesta/Crispin/Edgar verdicts

**Why This Approach:**
- Aaron's post-lock signal clarified operational reality: the session UUID IS shared; pretending otherwise was incidental complexity
- Shared `SessionId` brand documents ground truth without introducing runtime coupling (type-level construct, not runtime FK)
- Lens framing elevated to normative guard — "two systems, one entity" is the design principle, not apology
- Guardrails (ESLint + schema comments + ADR lock) prevent future coupling drift
- All R8 changes preserve R7 achievements (bidirectional adapter framework, confidence/trust orthogonality, 7-mechanism extraction-readiness)

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v5-final.md` (stable location, do not edit; supersedes v4-final)
- **R8 Design Panel Verdicts:** `.squad/decisions/inbox/graham-r8-session-identity.md`, `genesta-r8-session-identity.md`, `crispin-r8-session-identity.md`, `edgar-r8-session-identity.md` (all ACCEPT/FOLD verdicts)
- **Aaron R8 Directive:** `.squad/decisions/inbox/copilot-directive-r8-session-identity.md`
- **R8 Lock Panel Verdicts:** `.squad/decisions/inbox/graham-r8-lock-verdict.md`, `genesta-r8-lock-verdict.md`, `crispin-r8-lock-verdict.md`, `edgar-r8-lock-verdict.md` (all LOCK, unanimous)
- **Superseded Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (historical reference; see header banner for migration note)

**Implementation Readiness:**
- v5-final is self-contained (no external doc required for implementation)
- All `[v5: <reason>]` + `[v4: <reason>]` annotations trace lineage back to R7/R5 origins
- No new architectural risks; all changes additive + simplifying
- R8 amendment window now closed; v5-final canonical until v1 implementation phase reveals needs for v1.1

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms + shared `SessionId` brand (FR-12 #8) + ESLint guardrail
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface) + precision gains (sweep cadence, Cairn session-end triggers, confidence/trust branded types)
- Path D Extraction: Kernel extraction readiness enforced from Day 1; extraction happens post-v1 pending org-scale federation needs

---

### 2026-05-30: WI-B PR #29 cycle 4 — prose redesign scope
**By:** Graham (Lead)
**Status:** Implemented in cycles 4-6

From .squad/decisions/inbox/graham-wi-b-cycle4-redesign.md

**Thread analysis:** 51 unresolved threads across 4 files represent 5 distinct findings:
- F8a: Wrong-branch reuse calls git worktree remove without unlinking junction first
- F9: Backtick escapes inside cmd /c "..." are PowerShell-only; cmd.exe treats them as literals
- F10: {branch} resolved via git -C "{worktree}" AFTER worktree is removed — path doesn't exist

**Decision:** Replace all literal cmd /c "..." strings with prose instructions (tool semantically + platform-intent table). Prose conveys intent; literal shell strings invite mechanical copying of wrong form.

**Recommended form:**
- Windows: Use cmd /c rmdir to remove junction. Do NOT pass /s.
- Unix: m -f removes symlink only.

**Junction-unlink ordering (SAFETY-CRITICAL):**
1. Resolve the branch name: git -C "{worktree}" rev-parse --abbrev-ref HEAD → save as {branch}
2. Remove the 
ode_modules junction/symlink (before git worktree remove)
3. Remove the worktree: git worktree remove "{worktree}"
4. Delete the branch: git branch -d {branch}

**Acceptance criteria:** 7 AC items verified — all backticks removed, F8/F9/F10 addressed, three-mirror sync locked.

---

### 2026-05-29: WI-B PR #29 review — APPROVE WITH NOTES
**By:** Graham (Lead)
**Status:** Reviewed and approved for merge

From .squad/decisions/inbox/graham-wi-b-review-approve.md

**Scope adherence:** ✅ Gabriel implemented exactly what was scoped. Six change areas all map directly to concrete changes. No omissions.

**Activation semantics:** ✅ SQUAD_WORKTREES=1 correctly gated. Three-way branch (skip/worktree/disabled).

**Enforcement language:** ✅ Pre-Spawn now reads as imperative: MUST-level imperatives and ACTIVE status badge.

**Template sync:** ✅ Verified byte-identical across all three files (squad.agent.md + two templates).

**Fallback safety - ARCHITECTURE CALL (APPROVE with note):** Silent fallback to main repo on git worktree add failure. For v1 (opt-in, dogfooding), fallback is right default. Differentiated: lock-file errors get retry-then-abort; permissions/other errors get fallback. Already logged to history.md.

**Follow-up (not blocking):** Emit user-visible warning (e.g., "⚠️ Worktree creation failed — falling back to shared checkout") in addition to history.md log. File as follow-up issue.

**Branch-mismatch handling:** ✅ Safe. git worktree remove fails with dirty-tree error; git protects against silent destruction.

**Parallel dispatch warning:** ✅ Warning-only (detection via list_agents). Sufficient for v1.

**Risk #1 mitigation (file-deletion):** ✅ Two mechanisms — isolation + junction directionality.

---

### 2026-05-29: WI-B scope — Coordinator dispatch-policy
**By:** Graham (Lead)
**Status:** Scoping complete, implemented

From .squad/decisions/inbox/graham-wi-b-scope.md

**Scope confirmation:** WI-B makes the coordinator CREATE worktrees per-issue instead of dispatching agents into shared main.

**Pre-Spawn discovery:** "Pre-Spawn: Worktree Setup" section (lines 697–742) was documentation-only. Gabriel's job: make it real.

**Concrete change list:**
- Pre-Spawn: Worktree Setup (enforce language + error handling)
- How to Spawn an Agent (resolve WORKTREE_PATH / WORKTREE_MODE placeholders)
- Worktree Lifecycle Management (reference docs)
- Template mirrors (must stay in sync)

**Opt-in vs default-on (Recommendation: Option A — Opt-in for v1):**
- Safety: Zero behavior change unless explicitly enabled
- Adoption friction: Users must know env var exists
- Complexity: Minimal — one if check
- Risk: Low — worst case is feature not used

**Dogfooding plan:**
- Worktree path: D:\git\stunning-adventure-{N}
- Branch: squad/{N}-coordinator-worktrees
- Env var: SQUAD_WORKTREES=1

**Risk flags:**
1. File-deletion mystery event during session — WI-B mitigates via isolation
2. 
ode_modules re-install after worktree removal — cleanup flow handles junction removal BEFORE git worktree remove
3. Pre-Spawn is documentation-only — Gabriel added ACTIVE status + enforcement language
4. Parallel dispatch guard — warning-only recommended for v1
5. Template drift — Gabriel updates all three files atomically

---

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

# Gabriel M2 Cycle 3 Design Drop

**Author:** Gabriel Knight (Infrastructure)  
**Date:** 2026-06-02  
**Requested by:** Aaron (akubly)  
**Scope:** PR #44 Copilot cloud-review cycle 3

## Bucket A — shell-init resolver parity

Investigation confirmed `curate.ps1` resolves `sessionStart` in this order:
1. `~/.cairn/hook/sessionStart.mjs` user override.
2. Global npm `@akubly/skillsmith-runtime/dist/hooks/sessionStart.js`.
3. Global npm `@akubly/cairn/dist/hooks/sessionStart.js` fallback.
4. Repo checkout `packages/skillsmith-runtime/dist/hooks/sessionStart.js`.
5. Repo checkout `packages/cairn/dist/hooks/sessionStart.js` fallback.
6. Repo checkout `dist/hooks/sessionStart.js` legacy cairn fallback.

`shell-init.sh` already had 1, 2, 3, and 4, but not the repo checkout cairn fallbacks (5, 6). I will preserve skillsmith-runtime priority and add the two cairn fallback candidates after the repo runtime candidate, with a comment documenting exact parity with `curate.ps1`.

## Bucket B — README disposition

Node prerequisite will change from Node.js >=18 to >=20. Root `package.json`, `packages/cairn/package.json`, and `packages/eureka/package.json` declare Node >=20; `@akubly/skillsmith-runtime` depends on `@akubly/cairn`, so installs require Node 20 in practice.

For zsh, I choose option (i): scope the documentation to bash-only and remove the aspirational zsh support claim. Alternative (ii) would add zsh self-location via `${(%):-%N}`, but the hook's canonical install path and smoke validation are bash/Git Bash, and honest support scope is safer than cross-shell claims I cannot fully verify in this cycle.

The resolution-order table will become the single source of truth matching the updated resolver.

## Bucket C — mechanical cleanup

No design decision needed. This is a one-byte Scribe artifact cleanup with explicit coordinator authorization for Gabriel to touch Graham's history in this cycle.

## Bucket D — archive policy disposition

I choose option (a): consolidate date-stamped archives into the canonical archive files and remove the date-stamped files. The policy in `.squad/decisions.md` explicitly allows only `.squad/decisions-archive.md` and `.squad/agents/{name}/history-archive.md`; date-stamped files were a Scribe chunking artifact, not a deliberate policy change. Single canonical archives are easier to reason about and avoid long-term file proliferation.

Required Scribe behavior change: future archiving should append to canonical archive files only, never create date-stamped archives. I will note this in the closeout drop for Scribe/coordinator follow-up.

# Gabriel M2 Cycle 3 Shipped

**Author:** Gabriel Knight (Infrastructure)  
**Date:** 2026-06-02  
**Requested by:** Aaron (akubly)  
**PR:** #44  
**Branch:** `squad/m2-forge-mcp-bash-hooks`  
**New HEAD:** `962a3a224b3bd8e9349e2abe618bed0c69eda2fc`

## Verification

- `npm run build` — clean
- `npm test` — clean
- Git Bash smoke: `source .github/hooks/cairn/shell-init.sh; forge_mcp_check` — clean, resolved repo `@akubly/skillsmith-runtime` hook and package version `0.1.0`
- Branch pushed: `24454a7..962a3a224b3bd8e9349e2abe618bed0c69eda2fc`

## Per-bucket dispositions

### Bucket A — CODE FIX

Addressed in `b16a4851a27e6ff467e13ba54c708e1df6604c6e` (`Align bash hook resolution fallbacks`).

`_forge_mcp_resolve_script` now matches `curate.ps1` fallback parity:
1. user override
2. global `@akubly/skillsmith-runtime`
3. global `@akubly/cairn`
4. repo `packages/skillsmith-runtime`
5. repo `packages/cairn`
6. repo `dist/hooks`

Fixed Git Bash smoke-check behavior by converting package paths through `cygpath` and passing the path via `process.argv[1]` instead of interpolating it into a JavaScript string literal.

### Bucket B — DOC FIX

Addressed in `c831e64a3121abc2f28148ed041820f4a5a243e3` (`Correct bash hook documentation`).

README now documents Node.js >=20, the exact six-step resolution order, and bash/Git Bash as the supported shell boundary. Chose the bash-only documentation path over zsh compatibility because the current hook relies on bash-specific `${BASH_SOURCE[0]}` for repo-checkout fallback resolution; honest support scope is safer than aspirational zsh support.

### Bucket C — TINY CLEANUP

Addressed in `19f35e91b1a6b9d8559c732028e660a7b637ce83` (`Remove Graham history control character`).

Removed the stray ESC/control byte from Graham's Eureka branch note and updated the archive pointer to the canonical archive file.

### Bucket D — META/POLICY

Addressed in `a5f1e1731c70abf3e58d78b3cf57d90905848c49` (`Consolidate dated squad archives`).

Consolidated date-stamped decision and history archives into the canonical files allowed by `.squad/decisions.md` and deleted the date-stamped archive files. Chose consolidation over policy expansion because the documented Scribe-write allowlist is intentionally exhaustive and single canonical archives avoid policy drift/file proliferation.

Follow-up for Scribe/coordinator: future archive behavior should append to `.squad/decisions-archive.md` and `.squad/agents/{name}/history-archive.md` only, not create date-stamped archive files.


### Persona-review follow-up

Addressed in `962a3a224b3bd8e9349e2abe618bed0c69eda2fc` (`Address cycle 3 persona review findings`).

Updated the shell-install skill resolver pattern, README local-build troubleshooting and cairn fallback notes, `forge_mcp_check` fallback warning, and archive cleanup details. Re-ran `npm run build`, `npm test`, and Git Bash `forge_mcp_check` clean after the follow-up.

## Thread to SHA map

| Thread ID | Disposition | Commit |
|---|---|---|
| `PRRT_kwDORy1V9M6GVym2` | Addressed — bash resolver now mirrors `curate.ps1` repo checkout fallbacks | `b16a4851a27e6ff467e13ba54c708e1df6604c6e` |
| `PRRT_kwDORy1V9M6GpxXF` | Addressed — README prerequisite changed to Node.js >=20 | `c831e64a3121abc2f28148ed041820f4a5a243e3` |
| `PRRT_kwDORy1V9M6GVynv` | Addressed — same Node.js >=20 README fix | `c831e64a3121abc2f28148ed041820f4a5a243e3` |
| `PRRT_kwDORy1V9M6GVynO` | Addressed — README resolver table updated to match implementation | `c831e64a3121abc2f28148ed041820f4a5a243e3` |
| `PRRT_kwDORy1V9M6GVynd` | Addressed — zsh support claim removed; bash/Git Bash support boundary documented | `c831e64a3121abc2f28148ed041820f4a5a243e3` |
| `PRRT_kwDORy1V9M6GpxX1` | Addressed — same shell compatibility documentation fix | `c831e64a3121abc2f28148ed041820f4a5a243e3` |
| `PRRT_kwDORy1V9M6GpxXf` | Addressed — removed Graham history ESC/control byte | `19f35e91b1a6b9d8559c732028e660a7b637ce83` |
| `PRRT_kwDORy1V9M6GpxXr` | Addressed — consolidated dated archives into canonical archive files and removed dated files | `a5f1e1731c70abf3e58d78b3cf57d90905848c49` |

## History

Gabriel history updated through `962a3a224b3bd8e9349e2abe618bed0c69eda2fc` with cycle-3 summary, persona-review follow-up, and verification state.

# Gabriel M2 Cycle 4 Design Drop

**Author:** Gabriel Knight (Infrastructure)  
**Date:** 2026-06-02  
**Requested by:** Aaron (akubly)  
**Scope:** PR #44 Copilot cloud-review cycle 4 — `PRRT_kwDORy1V9M6GqI4o`

## Investigation

Confirmed the finding. `packages/cairn/src/hooks/sessionStart.ts` implements `runSessionStartHook()` by asynchronously reading `process.stdin` until EOF, returning early when the payload is empty, parsing JSON otherwise, and then deriving repo/workdir context from `hookData.cwd` or `process.cwd()`. `packages/skillsmith-runtime/src/hooks/sessionStart.ts` calls the same Cairn `runSessionStartHook()` wrapper with prescriber orchestration attached.

`curate.ps1` is a Copilot hook wrapper, not an interactive-shell wrapper. It reads its own stdin with `OpenStandardInput().ReadToEnd()`, exits immediately if the hook payload is empty, and otherwise pipes that original hook JSON into `node $script`. That means PowerShell never launches Node against an inherited interactive TTY.

The bash shell-init wrapper currently launches `node "$script"` from an interactive shell with no stdin redirection or payload. Because stdin is the terminal, `runSessionStartHook()` waits for EOF indefinitely. Result: one leaked background Node process per sourced interactive session, and the hook never reaches session-start logic.

## Fix shape

I choose a variant of option (iii): mirror the PowerShell contract by piping a JSON payload into Node, but synthesize the minimal shell-init payload because no Copilot hook JSON exists in an interactive shell startup. The payload will be:

```json
{"toolName":"shellInit"}
```

`cwd` is included explicitly so repo/workdir attribution does not depend on an inherited Node process cwd. On Git Bash, `$PWD` is converted through `cygpath -w` before JSON encoding so Node child-process `cwd` receives a native Windows path. The JSON is generated with `node -e` to avoid unsafe shell string interpolation. This avoids `/dev/null` no-op behavior and preserves the intended session-start execution rather than merely stopping the leak.

Rejected alternatives:
- Redirecting stdin from `/dev/null` would stop the leak, but `runSessionStartHook()` would take the empty-payload no-op branch, so the hook would still never run.
- Piping `{}` would work today because `toolName` is not used at runtime, but including `toolName: shellInit` and `cwd` better matches the declared `HookInput` shape and keeps repo/workdir attribution deterministic.

## Verification plan

- `npm run build`
- `npm test`
- Git Bash smoke: source `shell-init.sh`, run `forge_mcp_check`
- Required process-leak smoke: record Node PIDs before sourcing, source the hook in a new Git Bash interactive shell, wait, then compare Node PIDs immediately and again after 5 seconds. Expected: no new persistent Node PIDs.

# Gabriel M2 Cycle 4 Shipped

**Author:** Gabriel Knight (Infrastructure)  
**Date:** 2026-06-02  
**Requested by:** Aaron (akubly)  
**PR:** #44  
**Branch:** `squad/m2-forge-mcp-bash-hooks`  
**New HEAD:** `1e68a789ed314a17a6bdb012bc78bfc2755b0794`

## Disposition

Thread `PRRT_kwDORy1V9M6GqI4o` is addressed in `ac524c3bdc138c25a73e5b2caf7a6ad579194ef4` (`Fix shell init stdin leak`).

Root cause confirmed: both `@akubly/cairn` and `@akubly/skillsmith-runtime` enter `runSessionStartHook()`, which reads `process.stdin` until EOF and returns early on empty input. The interactive bash hook launched `node "$script"` with stdin inherited from the terminal, so Node waited indefinitely and leaked a background process.

Fix shape: pipe finite JSON with an explicit cwd into the Node hook:

```bash
node -e 'process.stdout.write(JSON.stringify({ toolName: "shellInit", cwd: process.argv[1] }) + "\n")' "$payload_cwd" | node "$script"
```

This mirrors the PowerShell wrapper's contract of providing finite hook JSON to Node, while adding explicit `cwd` so repo/workdir attribution is deterministic. Git Bash paths are converted with `cygpath -w` before JSON encoding.

## Verification

- `npm run build` — clean
- `npm test` — clean
- Git Bash `source .github/hooks/cairn/shell-init.sh; forge_mcp_check` — clean, resolved repo `@akubly/skillsmith-runtime` hook and package version `0.1.0`
- Process-leak smoke — clean:
  - Before sourcing: captured existing Node PID set
  - After sourcing + 1 second: no new Node PIDs remained
  - After 5 seconds: no new Node PIDs remained

## Thread to SHA map

| Thread ID | Disposition | Commit |
|---|---|---|
| `PRRT_kwDORy1V9M6GqI4o` | Addressed — shell init now pipes finite JSON with explicit cwd to Node so stdin reaches EOF and the hook executes/exits | `ac524c3bdc138c25a73e5b2caf7a6ad579194ef4` |

## History

Gabriel history updated in `1e68a789ed314a17a6bdb012bc78bfc2755b0794` with cycle-4 root cause, fix rationale, and verification state.

# Gabriel M2 Cycle 5 Design Drop

**Author:** Gabriel Knight (Infrastructure)  
**Date:** 2026-06-02  
**Requested by:** Aaron (akubly)  
**Scope:** PR #44 Copilot cloud-review cycle 5

## Investigation

### Thread PRRT_kwDORy1V9M6GqaVI — shell-init execution mode

Confirmed `shell-init.sh` is source-only but has a shebang and top-level `return` statements. Direct execution currently reaches the non-interactive guard and produces bash's generic `return: can only 'return' from a function or sourced script` failure. I will add the standard source-detection idiom immediately after the header comments and before any top-level `return`:

```bash
(return 0 2>/dev/null) || { echo "shell-init.sh must be sourced, not executed: source $0" >&2; exit 1; }
```

This keeps sourced behavior unchanged and gives direct execution a clear exit-1 error.

### Thread PRRT_kwDORy1V9M6GqaVx — uninstall temp file

Confirmed `uninstall.sh` writes to a fixed adjacent temp path `${file}.forge-mcp-bak`. I will switch to an adjacent `mktemp "${file}.forge-mcp-bak.XXXXXX"` path and install an EXIT/INT/TERM cleanup trap. This satisfies the robustness request while avoiding system temp directories; the temp file stays beside the target rc file.

### Threads PRRT_kwDORy1V9M6GqaWS / PRRT_kwDORy1V9M6GqaWx — inbox references

Tracked `.squad` files containing `decision inbox path pattern` before cleanup:

- `.squad/agents/alexander/charter.md` — 1 occurrence(s)
- `.squad/agents/alexander/history.md` — 4 occurrence(s)
- `.squad/agents/cassima/charter.md` — 2 occurrence(s)
- `.squad/agents/cassima/history-archive.md` — 11 occurrence(s)
- `.squad/agents/crispin/history-archive.md` — 3 occurrence(s)
- `.squad/agents/edgar/history-archive.md` — 5 occurrence(s)
- `.squad/agents/edgar/history.md` — 1 occurrence(s)
- `.squad/agents/erasmus/charter.md` — 1 occurrence(s)
- `.squad/agents/gabriel/charter.md` — 1 occurrence(s)
- `.squad/agents/gabriel/history-archive.md` — 8 occurrence(s)
- `.squad/agents/genesta/history-archive.md` — 4 occurrence(s)
- `.squad/agents/graham/charter.md` — 1 occurrence(s)
- `.squad/agents/graham/history-archive.md` — 1 occurrence(s)
- `.squad/agents/laura/charter.md` — 1 occurrence(s)
- `.squad/agents/laura/history-archive.md` — 6 occurrence(s)
- `.squad/agents/laura/history.md` — 15 occurrence(s)
- `.squad/agents/ralph/charter.md` — 1 occurrence(s)
- `.squad/agents/roger/charter.md` — 1 occurrence(s)
- `.squad/agents/roger/history-archive.md` — 7 occurrence(s)
- `.squad/agents/roger/history.md` — 6 occurrence(s)
- `.squad/agents/rosella/charter.md` — 1 occurrence(s)
- `.squad/agents/rosella/history-archive.md` — 3 occurrence(s)
- `.squad/agents/rosella/history.md` — 5 occurrence(s)
- `.squad/agents/scribe/charter.md` — 1 occurrence(s)
- `.squad/agents/sonny/history.md` — 3 occurrence(s)
- `.squad/agents/valanice/charter.md` — 1 occurrence(s)
- `.squad/agents/valanice/history-archive.md` — 4 occurrence(s)
- `.squad/agents/valanice/history.md` — 8 occurrence(s)
- `.squad/charter.md` — 1 occurrence(s)
- `.squad/copilot-instructions.md` — 1 occurrence(s)
- `.squad/decisions-archive.md` — 7 occurrence(s)
- `.squad/decisions.md` — 25 occurrence(s)
- `.squad/decisions/archive/archive-2026-04-25-and-earlier.md` — 15 occurrence(s)
- `.squad/decisions/decisions.md` — 1 occurrence(s)
- `.squad/decisions/eureka-prd-v4-final.md` — 2 occurrence(s)
- `.squad/fact-checker-charter.md` — 1 occurrence(s)
- `.squad/log/2026-05-27T20-47-27-crucible-tdd-strategy.md` — 1 occurrence(s)
- `.squad/orchestration-log.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-alexander.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-erasmus.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-gabriel.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-graham.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-laura.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-roger.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-rosella.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-sonny.md` — 2 occurrence(s)
- `.squad/orchestration-log/2026-05-24T2133Z-valanice.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-25T0030Z-scribe-phase-ab-flush.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T000000Z-laura-q1-option-e-validation.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T000001Z-laura-q1-refinement-validation.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T055556Z-alexander-eureka-runtime.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T055556Z-erasmus-two-harnesses.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T055556Z-graham-eureka-overlap.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T055556Z-roger-eureka-data.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T055556Z-valanice-eureka-ux.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T070746Z-erasmus.md` — 1 occurrence(s)
- `.squad/orchestration-log/2026-05-27T20-47-27-laura.md` — 3 occurrence(s)
- `.squad/orchestration-log/2026-05-28T18-05-15Z-coordinator-ctd-r2-resolutions.md` — 1 occurrence(s)
- `.squad/scribe-charter.md` — 3 occurrence(s)
- `.squad/skills/composition-root-pattern/SKILL.md` — 1 occurrence(s)
- `.squad/skills/cross-package-type-promotion/SKILL.md` — 1 occurrence(s)
- `.squad/skills/cross-prd-overlap-analysis/SKILL.md` — 1 occurrence(s)
- `.squad/skills/doc-references-respect-gitignore/SKILL.md` — 9 occurrence(s)
- `.squad/skills/london-school-green-beat/SKILL.md` — 1 occurrence(s)
- `.squad/skills/trust-mutation-green-beat/SKILL.md` — 2 occurrence(s)
- `.squad/templates/charter.md` — 1 occurrence(s)
- `.squad/templates/copilot-instructions.md` — 1 occurrence(s)
- `.squad/templates/fact-checker-charter.md` — 1 occurrence(s)
- `.squad/templates/scribe-charter.md` — 3 occurrence(s)
- `.squad/templates/skills/agent-collaboration/SKILL.md` — 1 occurrence(s)
- `.squad/templates/skills/architectural-proposals/SKILL.md` — 1 occurrence(s)
- `.squad/templates/skills/distributed-mesh/SKILL.md` — 3 occurrence(s)
- `.squad/templates/skills/init-mode/SKILL.md` — 1 occurrence(s)
- `.squad/templates/skills/release-process/SKILL.md` — 1 occurrence(s)
- `.squad/templates/skills/secret-handling/SKILL.md` — 5 occurrence(s)
- `.squad/templates/skills/squad-conventions/SKILL.md` — 1 occurrence(s)
- `.squad/templates/squad.agent.md` — 6 occurrence(s)
- `.squad/templates/squad.agent.md.template` — 6 occurrence(s)

The pattern is broader than the two flagged archive lines. To satisfy the requested verification (`grep -rn 'decision inbox path pattern' .squad/ --include='*.md'` returns nothing for tracked docs), I will sweep committed `.squad` markdown and replace concrete/gitignored inbox path strings with path-free wording (`decision inbox drop ...`) or committed-location descriptions where local context is obvious. This is doc hygiene only; no Scribe behavior code changes in this cycle.

## Scribe behavior follow-up

The closeout will note that Scribe should strip or rewrite inbox paths when merging drops into committed docs, not preserve local-only path references.

## Verification plan

- `npm run build`
- `npm test`
- `bash .github/hooks/cairn/shell-init.sh` returns friendly source-only error and exit code 1
- Git Bash source smoke: `source .github/hooks/cairn/shell-init.sh; forge_mcp_check`
- Install/uninstall roundtrip using project-local scratch HOME/BASH_RC_PATH: byte-identical rc file and no leftover `.forge-mcp-bak*`
- Tracked grep: `git grep -n 'decision inbox path pattern' -- .squad` returns no matches

# Gabriel M2 Cycle 5 Shipped

**Author:** Gabriel Knight (Infrastructure)  
**Date:** 2026-06-02  
**Requested by:** Aaron (akubly)  
**PR:** #44  
**Branch:** `squad/m2-forge-mcp-bash-hooks`  
**New HEAD:** `5b2dbb0a9f90f20cb9602f212ffbd81d8367474e`

## Disposition

### Shell script fixes

Addressed in `94a66fb98eba84f73e20094674a537182ee19a29` (`Harden bash hook script entrypoints`).

- `shell-init.sh` now explicitly rejects direct execution with a friendly source-only error and exit code 1 before any top-level `return` can run.
- `uninstall.sh` now uses an adjacent `mktemp` path (`${file}.forge-mcp-bak.XXXXXX`) plus EXIT/INT/TERM cleanup trap instead of a fixed temp path.

### Documentation hygiene sweep

Addressed in `05bc54e982c4dda987aec1c28ebb629a0e4b26ab` (`Remove gitignored inbox path references`) , `591843aea8a4e3d1ce04786b67c73fe878c7d0b8` (`Address cycle 5 review findings`), and `7c9433ebbd81c9dfa27688c1895d519707d6d409` (`Finish cycle 5 inbox wording cleanup`), and `e5d929a0b4bd8cf4109c23ec7491b02cb0dd83ae` (`Clarify decision drop-box instructions`).

Swept tracked `.squad` markdown for references to gitignored decision inbox paths and replaced them with path-free decision-drop wording. The two flagged `decisions-archive.md` ranges now cite path-free decision-drop descriptions instead of local-only paths; review follow-up removed remaining broken `./inbox` links and ambiguous drop-box wording, including the remaining Scribe charter pseudo-path and active template pseudo-path instructions.

## Verification

- `npm run build` — clean
- `npm test` — clean
- Direct execution: `bash .github/hooks/cairn/shell-init.sh` prints `shell-init.sh must be sourced, not executed: source .github/hooks/cairn/shell-init.sh` and exits 1
- Source smoke: Git Bash `source .github/hooks/cairn/shell-init.sh; forge_mcp_check` — clean, resolved repo `@akubly/skillsmith-runtime` hook and package version `0.1.0`
- Install/uninstall roundtrip: project-local scratch rc file was byte-identical after `install.sh && uninstall.sh`; no `.forge-mcp-bak*` leftovers
- Tracked grep for the exact slash-separated inbox path pattern under `.squad` → no tracked matches

## Thread to SHA map

| Thread ID | Disposition | Commit |
|---|---|---|
| `PRRT_kwDORy1V9M6GqaVI` | Addressed — source-only guard added to `shell-init.sh` | `94a66fb98eba84f73e20094674a537182ee19a29` |
| `PRRT_kwDORy1V9M6GqaVx` | Addressed — fixed temp path replaced with adjacent `mktemp` plus cleanup trap, then trap scope hardened | `94a66fb98eba84f73e20094674a537182ee19a29`, `591843aea8a4e3d1ce04786b67c73fe878c7d0b8` |
| `PRRT_kwDORy1V9M6GqaWS` | Addressed — gitignored inbox-path references removed from archive docs and remaining broken links swept | `05bc54e982c4dda987aec1c28ebb629a0e4b26ab`, `591843aea8a4e3d1ce04786b67c73fe878c7d0b8`, `7c9433ebbd81c9dfa27688c1895d519707d6d409`, `e5d929a0b4bd8cf4109c23ec7491b02cb0dd83ae` |
| `PRRT_kwDORy1V9M6GqaWx` | Addressed — same `.squad` inbox-reference hygiene sweep and follow-up cleanup | `05bc54e982c4dda987aec1c28ebb629a0e4b26ab`, `591843aea8a4e3d1ce04786b67c73fe878c7d0b8`, `7c9433ebbd81c9dfa27688c1895d519707d6d409`, `e5d929a0b4bd8cf4109c23ec7491b02cb0dd83ae` |

## Scribe behavior follow-up

When Scribe merges decision inbox drops into committed decision/history/archive files, it should strip or rewrite any local-only inbox paths inside the body. Committed docs should cite merged sections or use path-free descriptions, not preserve gitignored working-drop paths.

## History

Gabriel history updated in `5b2dbb0a9f90f20cb9602f212ffbd81d8367474e` with cycle-5 dispositions and verification state.

### 2026-06-05T10:57:00-07:00: M2 Cycle 6 targeted review fixes

**Author:** Gabriel (Infrastructure)
**PR:** #44

## Carve-out understanding

The gitignored-path rule still applies to committed back-references in archived prose. It does not apply to forward writer-target instructions where `.squad/decisions/inbox/{name}-{slug}.md` is the contract telling future agents where to write.

## Original vs current wording

1. `.squad/templates/squad.agent.md` structure list
   - Original: `team.md, routing.md, ceremonies.md, decisions.md, decisions/inbox/, casting/, agents/, orchestration-log/, skills/, log/`
   - Current: `team.md, routing.md, ceremonies.md, decisions.md, decision inbox , casting/, agents/, orchestration-log/, skills/, log/`
   - Decision: restore `decisions/inbox/` because this is a future directory creation instruction.

2. `.squad/templates/squad.agent.md` directive capture
   - Original: `Write it immediately to .squad/decisions/inbox/copilot-directive-{timestamp}.md`
   - Current: `Write it immediately as a decision inbox drop-box file named copilot-directive-{timestamp}.md`
   - Decision: restore the explicit `.squad/decisions/inbox/` write target.

3. `.squad/templates/squad.agent.md.template` structure list
   - Original: `team.md, routing.md, ceremonies.md, decisions.md, decisions/inbox/, casting/, agents/, orchestration-log/, skills/, log/`
   - Current: `team.md, routing.md, ceremonies.md, decisions.md, decision inbox , casting/, agents/, orchestration-log/, skills/, log/`
   - Decision: restore `decisions/inbox/` because this is a future directory creation instruction.

4. `.squad/templates/squad.agent.md.template` directive capture
   - Original: `Write it immediately to .squad/decisions/inbox/copilot-directive-{timestamp}.md`
   - Current: `Write it immediately to decision inbox drop copilot-directive-{timestamp}.md`
   - Decision: restore the explicit `.squad/decisions/inbox/` write target.

5. `.squad/templates/skills/squad-conventions/SKILL.md` file structure
   - Original: `.squad/decisions/inbox/ — Drop-box for parallel decision writes`
   - Current: `decision inbox drop-box — Drop-box for parallel decision writes`
   - Decision: restore `.squad/decisions/inbox/` because this is a forward team structure/write-target convention.

6. `.squad/agents/roger/history.md` Round 7 write target
   - Original before the sweep: `decisions/inbox/roger-triage-2026-05-25T0200Z.md`
   - Current: `decision inbox roger-triage-2026-05-25T0200Z.md`
   - Decision: restore as `.squad/decisions/inbox/roger-triage-2026-05-25T0200Z.md` to match Aaron's clarified writer-target carve-out.

7. `.squad/agents/roger/history.md` Round 6 write target
   - Original before the sweep: `decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md`
   - Current: `decision inbox roger-opens-4-and-5-2026-05-25T0130Z.md`
   - Decision: restore as `.squad/decisions/inbox/roger-opens-4-and-5-2026-05-25T0130Z.md` to match Aaron's clarified writer-target carve-out.

## Non-doc code fix

For `.github/hooks/cairn/shell-init.sh`, the source-only guard should print `${BASH_SOURCE[0]}` instead of `$0` so direct execution remediation names the hook script rather than the invoking shell.

### 2026-06-05T10:57:00-07:00: M2 Cycle 6 shipped

**Author:** Gabriel (Infrastructure)
**PR:** #44
**Commit:** 04f05555f44bb716deadeec48407b83cdd17f6ec

## Thread to SHA map

- `PRRT_kwDORy1V9M6Gq_vS` → `04f05555f44bb716deadeec48407b83cdd17f6ec`
- `PRRT_kwDORy1V9M6Gq_v9` → `04f05555f44bb716deadeec48407b83cdd17f6ec`
- `PRRT_kwDORy1V9M6Gq_wW` → `04f05555f44bb716deadeec48407b83cdd17f6ec`
- `PRRT_kwDORy1V9M6Gq_wt` → `04f05555f44bb716deadeec48407b83cdd17f6ec`
- `PRRT_kwDORy1V9M6Gq_xA` → `04f05555f44bb716deadeec48407b83cdd17f6ec`
- `PRRT_kwDORy1V9M6Gq_xe` → `04f05555f44bb716deadeec48407b83cdd17f6ec`
- `PRRT_kwDORy1V9M6Gq_yV` → `04f05555f44bb716deadeec48407b83cdd17f6ec`
- `PRRT_kwDORy1V9M6Gq_yr` → `04f05555f44bb716deadeec48407b83cdd17f6ec`

## Verification

- `npm run build` — clean
- `npm test` — clean
- `bash .github/hooks/cairn/shell-init.sh` via Git Bash — exits 1 and prints `source .github/hooks/cairn/shell-init.sh`
- `source .github/hooks/cairn/shell-init.sh; forge_mcp_check` via Git Bash — clean
- Restored files contain forward writer-target `.squad/decisions/inbox/` paths
- `.squad/decisions-archive.md` contains no `.squad/decisions/inbox/` back-references

`PRRT_kwDORy1V9M6Gq_x1` is intentionally excluded because Aaron owns the PR-description meta thread.

# Gabriel M2 polish shipped — 2026-06-05

- Fix 1: `uninstall.sh` keeps `tmpfile` local inside `_remove_block`; verified install/uninstall leaves bashrc byte-identical with no `.forge-mcp-bak*` leftovers.
- Fix 2: `decisions-archive.md` back-reference now describes the Phase 4 synthesis draft without citing the gitignored inbox path.
- Fix 3: Graham history now points only at the canonical `history-archive.md`.
- Fix 4: Gabriel archive now describes uninstall portability as the sed-free bash state machine.
- Fix 5: README smoke-test output label changed from Expected to Example.

# ADR: Forge M3 — Disposition Consumer Design

**Date:** 2026-06-05  
**Author:** Graham (Lead / Architect)  
**Status:** Accepted  
**Issue:** #42 — Wire forge prescriber to consume hint_state_transition resolution_disposition

---

## Context

The Cairn MCP `resolve_optimization_hint` tool writes a `hint_state_transition` event with `resolution_disposition` ('resolved'|'dismissed') and `source: 'mcp'` when a Copilot agent acts on an optimization hint. Forge's prescriber must read these back to avoid re-surfacing dismissed hints and to weight up resolved ones — closing the dogfood feedback loop.

---

## Decision: Sibling `HintDispositionProvider` (Option A)

### Options Considered

**Option A — Sibling `HintDispositionProvider` interface (chosen)**  
A new interface `HintDispositionProvider { getDispositions(skillId): Promise<DispositionSummary[]> }` lives in `@akubly/types`. The concrete `SqliteHintDispositionProvider` lives in `@akubly/cairn`. Forge imports the interface from `@akubly/types` only — never from cairn. Injected into `ForgePrescriberOrchestratorOptions` alongside the existing `provider?: ChangeVectorProvider`.

- **Pro:** Strict SRP. Change vectors and dispositions are orthogonal signals (telemetry outcomes vs. user intent).  
- **Pro:** Exactly mirrors the `ChangeVectorProvider` seam — no new pattern to learn.  
- **Pro:** Independent fail-open; disposition failures don't affect vector enrichment.  
- **Pro:** Independently testable; forge tests inject mock `HintDispositionProvider`.  
- **Con:** One more interface in `@akubly/types` (minor overhead).

**Option B — Extend `ChangeVectorProvider`**  
Add optional `getDispositions?` method to the existing `ChangeVectorProvider` interface.

- **Pro:** No new interface.  
- **Con:** Violates SRP — conflates outcome telemetry with user-intent feedback.  
- **Con:** Every `ChangeVectorProvider` implementer now has a second responsibility.  
- **Con:** Changes a stable contract with multiple test fixtures depending on it.  
- **Rejected.**

---

## Disposition Logic

### `dismissed` (source='mcp')
Suppress (filter out) all hints for the dismissed `(skillId, category)` pair on the **next** prescriber run.  
Rationale: The user explicitly said "I don't want this category of hint." Re-surfacing it on the next run is noise.

### `resolved` (source='mcp')
Boost the confidence of hints for the resolved `(skillId, category)` pair by `RESOLVED_CONFIDENCE_BOOST = 1.2` (20%).  
Rationale: The user acted on the hint — it was useful. Weight up similar hints to appear earlier.

### `source != 'mcp'` gating rule  
System-driven transitions (`source = 'system'`, or absent source) must NOT drive suppression or boosting. This is enforced at the provider layer: `SqliteHintDispositionProvider` filters `WHERE json_extract(payload, '$.source') = 'mcp'` before counting transitions. The forge-side `applyDispositions` function operates on already-filtered `DispositionSummary` objects and has no source field — the gating is the provider's responsibility.

### `null`/absent disposition
If `dispositionProvider` is not injected, or returns an empty array, `applyDispositions` is a no-op. Existing behavior is fully preserved (backward compatible).

---

## Fail-Open Guarantee

`runForgePrescribers` wraps `getDispositions()` in a `try/catch`. A failing disposition provider logs a `[forge] HintDispositionProvider.getDispositions failed` warning and proceeds without disposition data — identical pattern to `ChangeVectorProvider`.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/types/src/index.ts` | +`DispositionSummary`, `HintDispositionProvider` interfaces |
| `packages/cairn/src/db/sqliteHintDispositionProvider.ts` | New: concrete provider — queries event_log JOIN optimization_hints |
| `packages/cairn/src/index.ts` | +export `SqliteHintDispositionProvider` |
| `packages/cairn/src/__tests__/sqliteHintDispositionProvider.test.ts` | New: 9 unit tests |
| `packages/forge/src/prescribers/utils.ts` | +`applyDispositions`, `RESOLVED_CONFIDENCE_BOOST` |
| `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts` | +`dispositionProvider?` option, fail-open fetch, apply |
| `packages/forge/src/prescribers/forgePrescriberOrchestrator.test.ts` | +7 disposition tests |
| `packages/skillsmith-runtime/src/runtime.ts` | Wire `SqliteHintDispositionProvider` in `executePrescriberRun` |

---

## Test Counts (after)

| Package | Before | After |
|---------|--------|-------|
| cairn | 716 | 725 (+9) |
| forge | 644 | 651 (+7) |
| runtime-cli | 26 | 26 (unchanged) |
| skillsmith-runtime | 49 | 49 (unchanged) |

---

## Open Questions / Deferreds

- **Boost magnitude:** `RESOLVED_CONFIDENCE_BOOST = 1.2` is a flat 20%. A future beat could make this proportional to `resolvedCount` (more resolutions → stronger signal). Deferred to M3.1.
- **Suppression decay:** Currently, dismissed hints are suppressed indefinitely (for all future prescriber runs). A future beat could add a TTL or "only suppress for N runs" — deferred.
- **Per-hint vs per-category suppression:** The current design suppresses by category. A future beat could suppress by `(source, category)` for finer granularity — deferred.

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

# Laura — M8 Slice A Cycle-2 Audit

**Author:** Laura (Tester)
**Date:** 2026-06-02
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** #43
**Verdict:** ✅ **ACCEPT**

---

## Summary

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

